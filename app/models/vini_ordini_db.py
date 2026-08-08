# Modulo: vini (ordini ai fornitori) — [core]
"""
Model degli ordini ai fornitori — fasi O3/O4 (sessione 2026-08-02).

Vive tutto in `vini_magazzino.sqlite3`, quindi le transazioni che toccano
insieme ordine + giacenza + movimenti sono atomiche davvero (nessun
cross-database).

MODELLO
    vini_ordini        testata: un fornitore, uno stato, una data
    vini_ordini_righe  le bottiglie, con qta ordinata E ricevuta

STATI
    bozza     -> il carrello aperto. Uno per fornitore (indice UNIQUE parziale).
    inviato   -> la lista e' partita (WhatsApp/email/voce). data_invio valorizzata.
    parziale  -> e' arrivata solo una parte della merce.
    chiuso    -> tutte le righe ricevute. data_chiusura valorizzata.
    annullato -> ordine disdetto. Resta a storico, non si cancella.

PERCHE' GLI SNAPSHOT
`fornitore_nome` sulla testata e `descrizione`/`annata`/`prezzo_unit` sulla
riga sono copie, non join. Un ordine e' un documento storico: se il vino viene
cancellato o il listino cambia, l'ordine di marzo deve restare leggibile con i
dati di marzo. E' anche la ragione per cui la FK sul fornitore e' ON DELETE SET
NULL e non CASCADE.

Vedi `docs/modulo_vini_ordini.md`.
"""

from __future__ import annotations

import sqlite3
from typing import Any, Dict, List, Optional

from app.models.vini_magazzino_db import get_magazzino_connection, _now_iso
from app.services.vini_widget_settings_service import get_widget_setting
from app.services.vini_riordino_service import sql_da_riordinare, copertura_giorni
from app.utils.vini_metrics import DATA_INIZIO_STORICO, calcola_ritmo_vendita


STATI_APERTI = ("bozza", "inviato", "parziale")
FORNITORE_NON_ASSEGNATO = "— Non assegnato"


# ============================================================
# Helpers
# ============================================================
def _conn() -> sqlite3.Connection:
    conn = get_magazzino_connection()
    conn.row_factory = sqlite3.Row
    return conn


def _risolvi_fornitore(cur: sqlite3.Cursor, vino_id: int) -> Dict[str, Any]:
    """
    Trova il fornitore di una bottiglia, con tre livelli di fallback.

    1. Via anagrafica: bottiglia.madre_id -> vini_madre.fornitore_id.
       Al 2026-08-02 copre 1273 bottiglie su 1275 (99,8%).
    2. Via nome: match esatto di bottiglie.DISTRIBUTORE con vini_fornitori.nome
       (al 2026-08-02: 40 distributori su 40). Serve alle bottiglie orfane di
       madre_id, che il refactor anagrafiche non ha agganciato.
    3. Nessun match: ordine senza fornitore_id ma con il nome testuale, cosi'
       la merce e' comunque ordinabile e il buco anagrafico resta visibile.

    Ritorna {fornitore_id, fornitore_nome, origine}.
    """
    row = cur.execute(
        """
        SELECT b.DISTRIBUTORE AS distributore,
               m.fornitore_id AS fornitore_id,
               f.nome         AS fornitore_nome
          FROM vini_bottiglie b
          LEFT JOIN vini_madre     m ON m.id = b.madre_id
          LEFT JOIN vini_fornitori f ON f.id = m.fornitore_id
         WHERE b.id = ?
        """,
        (vino_id,),
    ).fetchone()
    if not row:
        raise ValueError(f"Vino id={vino_id} non trovato")

    distributore = (row["distributore"] or "").strip()

    # La CHIAVE e' sempre `DISTRIBUTORE`, il testo sulla bottiglia: e' quello su
    # cui la pagina Ordini raggruppa e su cui filtra `list_ordini`. L'anagrafica
    # serve per l'ID (e quindi per il contatto), NON per il nome.
    # Se si usasse il nome dell'anagrafica, una bottiglia con DISTRIBUTORE
    # "Emanuele Poloni" la cui madre punta al fornitore "Emanuele Polloni"
    # (doppione in anagrafica, caso reale al 2026-08-02) finirebbe in una bozza
    # intestata al secondo nome, invisibile dal gruppo in cui l'utente ha
    # cliccato: il carrello non compare e sembra che il pulsante non funzioni.
    if row["fornitore_id"] and distributore:
        return {
            "fornitore_id": int(row["fornitore_id"]),
            "fornitore_nome": distributore,
            "origine": "anagrafica",
        }
    if row["fornitore_id"] and row["fornitore_nome"]:
        return {
            "fornitore_id": int(row["fornitore_id"]),
            "fornitore_nome": row["fornitore_nome"],
            "origine": "anagrafica-senza-testo",
        }

    if distributore:
        f = cur.execute(
            "SELECT id, nome FROM vini_fornitori "
            "WHERE UPPER(TRIM(nome)) = UPPER(TRIM(?)) LIMIT 1",
            (distributore,),
        ).fetchone()
        if f:
            return {
                "fornitore_id": int(f["id"]),
                "fornitore_nome": f["nome"],
                "origine": "nome",
            }
        return {"fornitore_id": None, "fornitore_nome": distributore, "origine": "testo"}

    return {
        "fornitore_id": None,
        "fornitore_nome": FORNITORE_NON_ASSEGNATO,
        "origine": "nessuno",
    }


def _righe_di(cur: sqlite3.Cursor, ordine_id: int) -> List[Dict[str, Any]]:
    """Righe di un ordine, arricchite con la giacenza ATTUALE del vino.

    La giacenza non e' uno snapshot: serve a decidere adesso, non a
    ricostruire il passato. Se il vino e' stato cancellato la LEFT JOIN
    lascia NULL e la riga resta leggibile grazie allo snapshot testuale.
    """
    rows = cur.execute(
        """
        SELECT r.*, b.QTA_TOTALE AS giacenza_attuale, b.EURO_LISTINO AS listino_attuale
          FROM vini_ordini_righe r
          LEFT JOIN vini_bottiglie b ON b.id = r.vino_id
         WHERE r.ordine_id = ?
         ORDER BY r.descrizione COLLATE NOCASE
        """,
        (ordine_id,),
    ).fetchall()
    out = []
    for r in rows:
        d = dict(r)
        prezzo = d.get("prezzo_unit")
        d["totale_riga"] = round(float(prezzo) * int(d["qta_ordinata"]), 2) if prezzo else None
        d["mancanti"] = max(0, int(d["qta_ordinata"]) - int(d["qta_ricevuta"] or 0))
        out.append(d)
    return out


def _totali(righe: List[Dict[str, Any]]) -> Dict[str, Any]:
    """Totali dell'ordine. `totale_eur` e' None se NESSUNA riga ha un prezzo.

    Se solo alcune righe ce l'hanno il totale e' parziale, e `righe_senza_prezzo`
    lo dice: meglio un totale dichiarato incompleto che uno silenziosamente
    sbagliato per difetto.
    """
    con_prezzo = [r for r in righe if r.get("prezzo_unit")]
    return {
        "n_righe": len(righe),
        "qta_totale": sum(int(r["qta_ordinata"]) for r in righe),
        "qta_ricevuta": sum(int(r["qta_ricevuta"] or 0) for r in righe),
        "totale_eur": round(sum(r["totale_riga"] for r in con_prezzo), 2) if con_prezzo else None,
        "righe_senza_prezzo": len(righe) - len(con_prezzo),
    }


def _componi(cur: sqlite3.Cursor, testata: sqlite3.Row) -> Dict[str, Any]:
    """Testata + righe + totali + contatto del rappresentante."""
    ordine = dict(testata)
    righe = _righe_di(cur, int(ordine["id"]))
    ordine["righe"] = righe
    ordine.update(_totali(righe))

    ordine["rappresentante_nome"] = None
    ordine["rappresentante_telefono"] = None
    ordine["rappresentante_email"] = None
    if ordine.get("fornitore_id"):
        f = cur.execute(
            "SELECT rappresentante_nome, rappresentante_telefono, rappresentante_email "
            "FROM vini_fornitori WHERE id = ?",
            (ordine["fornitore_id"],),
        ).fetchone()
        if f:
            ordine.update(dict(f))
    return ordine


# ============================================================
# Lettura
# ============================================================
def get_ordine(ordine_id: int) -> Optional[Dict[str, Any]]:
    conn = _conn()
    try:
        cur = conn.cursor()
        row = cur.execute("SELECT * FROM vini_ordini WHERE id = ?", (ordine_id,)).fetchone()
        return _componi(cur, row) if row else None
    finally:
        conn.close()


def list_ordini(
    stato: Optional[str] = None,
    fornitore_id: Optional[int] = None,
    fornitore_nome: Optional[str] = None,
    solo_aperti: bool = False,
    limit: int = 100,
) -> List[Dict[str, Any]]:
    """Elenco ordini con i totali aggregati, SENZA le righe (lista, non dettaglio)."""
    where, params = [], []
    if stato:
        where.append("o.stato = ?")
        params.append(stato)
    if solo_aperti:
        where.append(f"o.stato IN ({','.join('?' * len(STATI_APERTI))})")
        params.extend(STATI_APERTI)
    if fornitore_id is not None:
        where.append("o.fornitore_id = ?")
        params.append(fornitore_id)
    if fornitore_nome:
        where.append("o.fornitore_nome = ?")
        params.append(fornitore_nome)
    sql = f"""
        SELECT o.*,
               (SELECT COUNT(*) FROM vini_ordini_righe r WHERE r.ordine_id = o.id) AS n_righe,
               (SELECT COALESCE(SUM(r.qta_ordinata), 0) FROM vini_ordini_righe r
                 WHERE r.ordine_id = o.id) AS qta_totale,
               (SELECT COALESCE(SUM(r.qta_ricevuta), 0) FROM vini_ordini_righe r
                 WHERE r.ordine_id = o.id) AS qta_ricevuta,
               (SELECT COALESCE(SUM(r.qta_ordinata * r.prezzo_unit), 0) FROM vini_ordini_righe r
                 WHERE r.ordine_id = o.id AND r.prezzo_unit IS NOT NULL) AS totale_eur
          FROM vini_ordini o
         {"WHERE " + " AND ".join(where) if where else ""}
         ORDER BY CASE o.stato WHEN 'bozza' THEN 0 WHEN 'inviato' THEN 1
                               WHEN 'parziale' THEN 2 ELSE 3 END,
                  COALESCE(o.data_invio, o.created_at) DESC
         LIMIT ?
    """
    params.append(int(limit))
    conn = _conn()
    try:
        rows = conn.execute(sql, params).fetchall()
        out = []
        for r in rows:
            d = dict(r)
            # SUM su zero righe con prezzo da' 0: non e' "gratis", e' "non lo so".
            if not d.get("totale_eur"):
                d["totale_eur"] = None
            out.append(d)
        return out
    finally:
        conn.close()


def riepilogo() -> Dict[str, Any]:
    """Numeri per il semaforo in dashboard. Volutamente pochi."""
    giorni_fermo = int(get_widget_setting("ordine_fermo_alert_giorni", default=30))
    conn = _conn()
    try:
        cur = conn.cursor()
        q = lambda s, p=(): cur.execute(s, p).fetchone()[0]  # noqa: E731
        return {
            "bozze": q("SELECT COUNT(*) FROM vini_ordini WHERE stato = 'bozza'"),
            "in_viaggio": q(
                "SELECT COUNT(*) FROM vini_ordini WHERE stato IN ('inviato','parziale')"
            ),
            "righe_in_bozza": q(
                "SELECT COUNT(*) FROM vini_ordini_righe r "
                "JOIN vini_ordini o ON o.id = r.ordine_id WHERE o.stato = 'bozza'"
            ),
            "fermi": q(
                "SELECT COUNT(*) FROM vini_ordini "
                " WHERE stato IN ('inviato','parziale') AND data_invio IS NOT NULL"
                "   AND julianday('now') - julianday(data_invio) > ?",
                (giorni_fermo,),
            ),
            "soglia_fermo_giorni": giorni_fermo,
        }
    finally:
        conn.close()


def _ha_colonna(cur: sqlite3.Cursor, tabella: str, colonna: str) -> bool:
    return any(r[1] == colonna for r in cur.execute(f"PRAGMA table_info({tabella})").fetchall())


def fornitori_con_lavoro(includi_inattivi: bool = False) -> List[Dict[str, Any]]:
    """
    Lista per la colonna sinistra della pagina Ordini: un fornitore per riga,
    con quanto c'e' da ordinare e quanto c'e' gia' in bozza.

    Il raggruppamento e' su `DISTRIBUTORE` (testo sulla bottiglia) perche' e'
    quello che il resto del modulo Vini usa e che al 2026-08-02 combacia 1:1
    con l'anagrafica. L'id del fornitore viene agganciato dopo, per il contatto.

    `attivo = 0` (mig 160) nasconde il distributore: i suoi vini restano in
    cantina ma non si comprano piu'. UNICA eccezione: se ha un ordine ancora
    aperto resta visibile comunque, altrimenti quell'ordine non sarebbe piu'
    raggiungibile da nessuna schermata — lo stesso errore che i pending orfani
    hanno gia' fatto pagare (v. migrazione 159).
    """
    conn = _conn()
    try:
        cur = conn.cursor()
        # RD.1 — stessa condizione del widget dashboard (copertura in giorni,
        # non soglia in bottiglie): unica fonte in vini_riordino_service.
        cond = sql_da_riordinare("v")
        rows = cur.execute(
            f"""
            SELECT COALESCE(NULLIF(TRIM(v.DISTRIBUTORE), ''), ?) AS fornitore_nome,
                   COUNT(*)                                      AS da_ordinare
              FROM vini_bottiglie v
             WHERE v.STATO_RIORDINO IN ('D', 'O', '0')
                OR ({cond} AND v.CARTA = 1
                    AND (v.STATO_RIORDINO IS NULL OR v.STATO_RIORDINO NOT IN ('X', 'A')))
             GROUP BY fornitore_nome
            """,
            (FORNITORE_NON_ASSEGNATO,),
        ).fetchall()
        mappa = {r["fornitore_nome"]: {"fornitore_nome": r["fornitore_nome"],
                                       "da_ordinare": r["da_ordinare"]} for r in rows}

        # Fornitori che non hanno nulla da ordinare ma hanno un ordine aperto:
        # devono comparire lo stesso, altrimenti un ordine inviato sparisce
        # dalla vista appena la merce esce dalla condizione di riordino.
        for r in cur.execute(
            "SELECT fornitore_nome, stato, COUNT(*) AS n FROM vini_ordini "
            f"WHERE stato IN ({','.join('?' * len(STATI_APERTI))}) "
            "GROUP BY fornitore_nome, stato",
            STATI_APERTI,
        ).fetchall():
            v = mappa.setdefault(
                r["fornitore_nome"],
                {"fornitore_nome": r["fornitore_nome"], "da_ordinare": 0},
            )
            # 'inviato' e 'parziale' arrivano come due righe distinte dal
            # GROUP BY: vanno sommate, non sovrascritte.
            k = "bozza" if r["stato"] == "bozza" else "in_viaggio"
            v[k] = v.get(k, 0) + r["n"]

        # Anagrafica: id + contatto + flag attivo.
        col_attivo = _ha_colonna(cur, "vini_fornitori", "attivo")
        campi = "id, nome, rappresentante_nome, rappresentante_telefono"
        if col_attivo:
            campi += ", attivo"
        for r in cur.execute(f"SELECT {campi} FROM vini_fornitori").fetchall():
            v = mappa.get(r["nome"])
            if v:
                v["fornitore_id"] = r["id"]
                v["rappresentante_nome"] = r["rappresentante_nome"]
                v["ha_telefono"] = bool((r["rappresentante_telefono"] or "").strip())
                v["attivo"] = bool(r["attivo"]) if col_attivo else True

        out = list(mappa.values())
        for v in out:
            v.setdefault("bozza", 0)
            v.setdefault("in_viaggio", 0)
            v.setdefault("fornitore_id", None)
            v.setdefault("ha_telefono", False)
            v.setdefault("rappresentante_nome", None)
            # Un nome che sta solo su bottiglie e non in anagrafica non ha un
            # flag da rispettare: si considera attivo.
            v.setdefault("attivo", True)

        if not includi_inattivi:
            out = [v for v in out if v["attivo"] or v["bozza"] or v["in_viaggio"]]
        # Chi ha piu' roba da ordinare in cima; "non assegnato" sempre in fondo.
        out.sort(key=lambda v: (
            not v["attivo"],
            v["fornitore_nome"] == FORNITORE_NON_ASSEGNATO,
            -(v["da_ordinare"] + v["bozza"] * 100 + v["in_viaggio"] * 10),
            v["fornitore_nome"].lower(),
        ))
        return out
    finally:
        conn.close()


def da_ordinare(fornitore_nome: str) -> List[Dict[str, Any]]:
    """
    I vini di un fornitore che meritano un riordino, con quantita' suggerita e
    ritmo di vendita. E' la lista che si guarda col rappresentante davanti.
    """
    giorni = int(get_widget_setting("qta_suggerita_giorni_storico", default=60))
    divisore = float(get_widget_setting("qta_suggerita_divisore", default=2)) or 1.0

    cond = sql_da_riordinare("v")

    conn = _conn()
    try:
        cur = conn.cursor()
        rows = cur.execute(
            f"""
            SELECT v.id, v.DESCRIZIONE, v.PRODUTTORE, v.ANNATA, v.TIPOLOGIA,
                   v.STATO_RIORDINO, v.QTA_TOTALE, v.EURO_LISTINO, v.CARTA,
                   (SELECT MAX(m.data_mov) FROM vini_magazzino_movimenti m
                     WHERE m.vino_id = v.id AND m.tipo = 'VENDITA') AS ultima_vendita,
                   (SELECT COALESCE(SUM(m.qta), 0) FROM vini_magazzino_movimenti m
                     WHERE m.vino_id = v.id AND m.tipo = 'VENDITA'
                       AND date(m.data_mov) >= ?) AS vendite_totali,
                   (SELECT COALESCE(SUM(m.qta), 0) FROM vini_magazzino_movimenti m
                     WHERE m.vino_id = v.id AND m.tipo = 'VENDITA'
                       AND date(m.data_mov) >= date('now', ?)) AS vendite_periodo
              FROM vini_bottiglie v
             WHERE COALESCE(NULLIF(TRIM(v.DISTRIBUTORE), ''), ?) = ?
               AND (v.STATO_RIORDINO IN ('D', 'O', '0')
                    OR ({cond} AND v.CARTA = 1
                        AND (v.STATO_RIORDINO IS NULL
                             OR v.STATO_RIORDINO NOT IN ('X', 'A'))))
             ORDER BY v.DESCRIZIONE COLLATE NOCASE
            """,
            (DATA_INIZIO_STORICO, f"-{giorni} days", FORNITORE_NON_ASSEGNATO, fornitore_nome),
        ).fetchall()

        # Righe gia' presenti in un ordine APERTO di questo fornitore.
        # Non basta guardare le bozze: appena un ordine passa a 'inviato' il
        # vino tornerebbe in lista col pulsante "+ ordina" pulito, e la merce
        # verrebbe riordinata mentre e' gia' per strada (la giacenza non e'
        # ancora cambiata, quindi nulla lo segnalerebbe).
        in_bozza, gia_ordinato = {}, {}
        for r in cur.execute(
            "SELECT r.vino_id, r.qta_ordinata, r.qta_ricevuta, o.stato, o.id AS ordine_id,"
            "       o.data_invio"
            "  FROM vini_ordini_righe r"
            "  JOIN vini_ordini o ON o.id = r.ordine_id"
            f" WHERE o.stato IN ({','.join('?' * len(STATI_APERTI))})"
            "   AND o.fornitore_nome = ?",
            (*STATI_APERTI, fornitore_nome),
        ).fetchall():
            if r["stato"] == "bozza":
                in_bozza[r["vino_id"]] = r["qta_ordinata"]
            else:
                mancanti = int(r["qta_ordinata"]) - int(r["qta_ricevuta"] or 0)
                if mancanti > 0:
                    gia_ordinato[r["vino_id"]] = {
                        "qta": mancanti,
                        "ordine_id": r["ordine_id"],
                        "data_invio": r["data_invio"],
                    }

        # Ordini pending del VECCHIO sistema ancora aperti su questi vini.
        # Finche' `vini_ordini_pending` esiste, un vino puo' essere gia' stato
        # ordinato di la' e qui apparire come mai ordinato.
        pending = {
            r["vino_id"]: r["qta"]
            for r in cur.execute("SELECT vino_id, qta FROM vini_ordini_pending").fetchall()
        }

        out = []
        for r in rows:
            d = dict(r)
            vendite_periodo = int(d.pop("vendite_periodo", 0) or 0)
            d["qta_suggerita"] = max(1, round(vendite_periodo / divisore)) if vendite_periodo else None
            # RD.1 — giorni di scorta residua: e' la risposta a "questo perche'
            # me lo stai proponendo?" quando la giacenza non e' zero.
            d["copertura_giorni"] = copertura_giorni(d.get("QTA_TOTALE"), vendite_periodo, giorni)
            d["ritmo_vendita"] = calcola_ritmo_vendita(int(d.get("vendite_totali") or 0))
            d["in_bozza"] = in_bozza.get(d["id"])
            d["gia_ordinato"] = gia_ordinato.get(d["id"])
            d["pending_legacy"] = pending.get(d["id"])
            out.append(d)
        return out
    finally:
        conn.close()


# ============================================================
# Scrittura
# ============================================================
def aggiungi_riga(
    vino_id: int,
    qta: int,
    utente: str,
    note: Optional[str] = None,
    preserva_qta: bool = False,
) -> Dict[str, Any]:
    """
    Mette un vino nella bozza del suo fornitore, creando la bozza se non c'e'.

    Se il vino e' gia' in quella bozza la quantita' viene SOSTITUITA, non
    sommata: l'utente sta dicendo "di questo ne voglio N", non "aggiungine
    altri N". Sommare renderebbe impossibile correggere un errore di battitura
    senza cancellare la riga.

    `preserva_qta=True` (RD.1, 2026-08-08) e' per le chiamate automatiche: il
    flag "Ordinato" dal widget dashboard mette il vino in bozza con la qta
    suggerita, ma se una qta c'e' gia' e' stata scelta a mano guardando il
    listino, e un automatismo non ha titolo per sovrascriverla.
    """
    qta = int(qta)
    if qta <= 0:
        raise ValueError("La quantità deve essere maggiore di zero")

    now = _now_iso()
    conn = _conn()
    try:
        cur = conn.cursor()
        cur.execute("BEGIN IMMEDIATE;")

        forn = _risolvi_fornitore(cur, vino_id)
        vino = cur.execute(
            "SELECT DESCRIZIONE, ANNATA, EURO_LISTINO FROM vini_bottiglie WHERE id = ?",
            (vino_id,),
        ).fetchone()

        bozza = cur.execute(
            "SELECT id FROM vini_ordini WHERE stato = 'bozza' AND fornitore_nome = ?",
            (forn["fornitore_nome"],),
        ).fetchone()
        if bozza:
            ordine_id = int(bozza["id"])
            cur.execute(
                "UPDATE vini_ordini SET updated_at = ? WHERE id = ?", (now, ordine_id)
            )
        else:
            cur.execute(
                "INSERT INTO vini_ordini (fornitore_id, fornitore_nome, stato, utente,"
                " created_at, updated_at) VALUES (?, ?, 'bozza', ?, ?, ?)",
                (forn["fornitore_id"], forn["fornitore_nome"], utente, now, now),
            )
            ordine_id = int(cur.lastrowid)

        # Prezzo: snapshot del listino AL MOMENTO dell'ordine. Marco 2026-08-02:
        # "il prezzo e' gia' all'interno della madre, se ci sono sconti e'
        # dentro" — quindi EURO_LISTINO e' gia' il netto, niente campo sconto.
        prezzo = vino["EURO_LISTINO"] if vino else None
        try:
            prezzo = float(prezzo) if prezzo not in (None, "") else None
        except (TypeError, ValueError):
            prezzo = None

        cur.execute(
            """
            INSERT INTO vini_ordini_righe
                (ordine_id, vino_id, descrizione, annata, qta_ordinata, prezzo_unit, note, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(ordine_id, vino_id) DO UPDATE SET
                qta_ordinata = CASE WHEN ? = 1
                                    THEN vini_ordini_righe.qta_ordinata
                                    ELSE excluded.qta_ordinata END,
                prezzo_unit  = COALESCE(excluded.prezzo_unit, vini_ordini_righe.prezzo_unit),
                note         = COALESCE(excluded.note, vini_ordini_righe.note)
            """,
            (
                ordine_id, vino_id,
                (vino["DESCRIZIONE"] if vino else f"Vino #{vino_id}") or f"Vino #{vino_id}",
                vino["ANNATA"] if vino else None,
                qta, prezzo, (note or None), now,
                1 if preserva_qta else 0,
            ),
        )
        conn.commit()
    except Exception:
        try:
            conn.rollback()
        except Exception:
            pass
        conn.close()
        raise
    conn.close()
    return get_ordine(ordine_id)


def rimuovi_riga(riga_id: int) -> Optional[Dict[str, Any]]:
    """Toglie una riga. Se la bozza resta vuota viene eliminata: un carrello
    vuoto non e' un ordine, e lasciarlo sporcherebbe la lista fornitori."""
    conn = _conn()
    try:
        cur = conn.cursor()
        cur.execute("BEGIN IMMEDIATE;")
        row = cur.execute(
            "SELECT r.ordine_id, o.stato FROM vini_ordini_righe r "
            "JOIN vini_ordini o ON o.id = r.ordine_id WHERE r.id = ?",
            (riga_id,),
        ).fetchone()
        if not row:
            conn.rollback()
            raise ValueError(f"Riga id={riga_id} non trovata")
        if row["stato"] != "bozza":
            conn.rollback()
            raise ValueError("Si possono togliere righe solo da un ordine in bozza")

        ordine_id = int(row["ordine_id"])
        cur.execute("DELETE FROM vini_ordini_righe WHERE id = ?", (riga_id,))
        rimaste = cur.execute(
            "SELECT COUNT(*) FROM vini_ordini_righe WHERE ordine_id = ?", (ordine_id,)
        ).fetchone()[0]
        if rimaste == 0:
            cur.execute("DELETE FROM vini_ordini WHERE id = ?", (ordine_id,))
            ordine_id = None
        conn.commit()
    except Exception:
        try:
            conn.rollback()
        except Exception:
            pass
        conn.close()
        raise
    conn.close()
    return get_ordine(ordine_id) if ordine_id else None


def marca_inviato(ordine_id: int, canale: str, utente: str) -> Dict[str, Any]:
    """
    bozza -> inviato. Lo stato cambia ANCHE se poi il messaggio non parte
    davvero: meglio un "inviato" sbagliato che si corregge, che una bozza
    fantasma che resta lì e fa riordinare due volte.
    """
    canale = (canale or "").strip().lower() or "manuale"
    if canale not in ("whatsapp", "email", "voce", "rappresentante", "manuale"):
        raise ValueError(f"Canale non riconosciuto: {canale}")

    now = _now_iso()
    conn = _conn()
    try:
        cur = conn.cursor()
        cur.execute("BEGIN IMMEDIATE;")
        row = cur.execute("SELECT stato FROM vini_ordini WHERE id = ?", (ordine_id,)).fetchone()
        if not row:
            conn.rollback()
            raise ValueError(f"Ordine id={ordine_id} non trovato")
        if row["stato"] != "bozza":
            conn.rollback()
            raise ValueError(f"L'ordine è già in stato '{row['stato']}'")
        n = cur.execute("SELECT COUNT(*) FROM vini_ordini_righe WHERE ordine_id = ?",
                        (ordine_id,)).fetchone()[0]
        if not n:
            conn.rollback()
            raise ValueError("Non si può inviare un ordine senza righe")
        cur.execute(
            "UPDATE vini_ordini SET stato = 'inviato', canale = ?, data_invio = ?,"
            " utente = COALESCE(utente, ?), updated_at = ? WHERE id = ?",
            (canale, now, utente, now, ordine_id),
        )
        conn.commit()
    except Exception:
        try:
            conn.rollback()
        except Exception:
            pass
        conn.close()
        raise
    conn.close()
    return get_ordine(ordine_id)


def annulla(ordine_id: int, utente: str) -> Dict[str, Any]:
    """Ordine disdetto. Resta a storico: non si cancella niente."""
    now = _now_iso()
    conn = _conn()
    try:
        cur = conn.cursor()
        row = cur.execute("SELECT stato FROM vini_ordini WHERE id = ?", (ordine_id,)).fetchone()
        if not row:
            raise ValueError(f"Ordine id={ordine_id} non trovato")
        if row["stato"] == "chiuso":
            raise ValueError("Un ordine già chiuso non si annulla: la merce è arrivata")
        if row["stato"] == "annullato":
            # Senza questo, un secondo annullamento riscriverebbe `data_chiusura`
            # e lo storico direbbe che è stato annullato oggi invece che allora.
            raise ValueError("L'ordine è già annullato")
        cur.execute(
            "UPDATE vini_ordini SET stato = 'annullato', data_chiusura = ?, updated_at = ?"
            " WHERE id = ?",
            (now, now, ordine_id),
        )
        conn.commit()
    finally:
        conn.close()
    return get_ordine(ordine_id)


def ricevi(
    ordine_id: int,
    righe: List[Dict[str, Any]],
    utente: str,
    note: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Registra l'arrivo della merce, tutto in UNA transazione:

      1. somma `qta` a `vini_ordini_righe.qta_ricevuta`
      2. somma la stessa quantita' a `vini_bottiglie.QTA_TOTALE`
      3. scrive un movimento CARICO (origine 'ORDINE_ARRIVO') per ogni riga
      4. azzera STATO_RIORDINO se era '0' (Ordinato), con movimento MODIFICA
         di audit — stesso comportamento di `conferma_arrivo_ordine_pending`
      5. ricalcola lo stato della testata: tutte le righe complete -> chiuso,
         altrimenti parziale

    `righe` = [{riga_id, qta}]. Le quantita' sono INCREMENTI, non totali: un
    arrivo in due tranche si registra due volte e si somma, che e' come va
    davvero quando il rappresentante porta il resto la settimana dopo.
    """
    if not righe:
        raise ValueError("Nessuna riga da ricevere")

    now = _now_iso()
    conn = _conn()
    movimenti: List[int] = []
    righe_saltate: List[str] = []
    try:
        cur = conn.cursor()
        cur.execute("BEGIN IMMEDIATE;")

        testata = cur.execute(
            "SELECT stato FROM vini_ordini WHERE id = ?", (ordine_id,)
        ).fetchone()
        if not testata:
            conn.rollback()
            raise ValueError(f"Ordine id={ordine_id} non trovato")
        if testata["stato"] in ("chiuso", "annullato"):
            conn.rollback()
            raise ValueError(f"L'ordine è in stato '{testata['stato']}': non accetta arrivi")
        if testata["stato"] == "bozza":
            # Ricevere una bozza vorrebbe dire caricare merce mai ordinata e
            # saltare lo stato 'inviato', perdendo la data di partenza (e quindi
            # il lead time). Chi ordina a voce usa "🤝 Ordinato a voce" prima.
            conn.rollback()
            raise ValueError(
                "L'ordine è ancora in preparazione: segnalo prima come inviato"
            )

        for item in righe:
            riga_id = int(item["riga_id"])
            qta = int(item.get("qta") or 0)
            if qta <= 0:
                continue

            r = cur.execute(
                "SELECT vino_id, descrizione, qta_ordinata, qta_ricevuta"
                "  FROM vini_ordini_righe WHERE id = ? AND ordine_id = ?",
                (riga_id, ordine_id),
            ).fetchone()
            if not r:
                conn.rollback()
                raise ValueError(f"Riga id={riga_id} non appartiene all'ordine {ordine_id}")

            vino_id = int(r["vino_id"])
            nuova_ricevuta = int(r["qta_ricevuta"] or 0) + qta

            # Guardia anti-errore di battitura: 60 al posto di 6 gonfierebbe la
            # giacenza e chiuderebbe l'ordine come completo, e per rimediare
            # servirebbe uno scarico manuale. Il doppio dell'ordinato copre gli
            # abbondi veri del fornitore; oltre e' quasi sempre un typo.
            limite = int(r["qta_ordinata"]) * 2
            if nuova_ricevuta > limite:
                conn.rollback()
                raise ValueError(
                    f"«{r['descrizione']}»: ne risulterebbero {nuova_ricevuta} ricevute "
                    f"su {r['qta_ordinata']} ordinate. Se è giusto, registra l'arrivo "
                    f"in due volte."
                )

            b = cur.execute(
                "SELECT COALESCE(QTA_TOTALE, 0) AS q, STATO_RIORDINO"
                "  FROM vini_bottiglie WHERE id = ?",
                (vino_id,),
            ).fetchone()
            if not b:
                # Vino cancellato dopo l'ordine. NON tocco `qta_ricevuta`:
                # marcarla come ricevuta chiuderebbe l'ordine dichiarando
                # arrivata merce che non e' stata caricata da nessuna parte, e
                # senza nemmeno un movimento a dirlo. Meglio che la riga resti
                # scoperta e l'ordine 'parziale': si vede che manca qualcosa.
                righe_saltate.append(r["descrizione"])
                continue

            cur.execute(
                "UPDATE vini_ordini_righe SET qta_ricevuta = ? WHERE id = ?",
                (nuova_ricevuta, riga_id),
            )

            cur.execute(
                "UPDATE vini_bottiglie SET QTA_TOTALE = ?, UPDATED_AT = ? WHERE id = ?",
                (int(b["q"]) + qta, now, vino_id),
            )

            delta = nuova_ricevuta - int(r["qta_ordinata"])
            nota_riga = (note or "").strip()
            suffisso = f"(ordine #{ordine_id}"
            if delta != 0:
                suffisso += f", ordinate {r['qta_ordinata']}, ricevute {nuova_ricevuta}, delta {delta:+d}"
            suffisso += ")"
            nota_finale = f"{nota_riga} {suffisso}".strip() if nota_riga else suffisso

            cur.execute(
                """INSERT INTO vini_magazzino_movimenti
                     (vino_id, data_mov, tipo, qta, locazione, note, origine, utente, created_at)
                   VALUES (?, ?, 'CARICO', ?, NULL, ?, 'ORDINE_ARRIVO', ?, ?)""",
                (vino_id, now, qta, nota_finale, utente, now),
            )
            movimenti.append(cur.lastrowid)

            if b["STATO_RIORDINO"] == "0":
                cur.execute(
                    "UPDATE vini_bottiglie SET STATO_RIORDINO = NULL, UPDATED_AT = ? WHERE id = ?",
                    (now, vino_id),
                )
                cur.execute(
                    """INSERT INTO vini_magazzino_movimenti
                         (vino_id, data_mov, tipo, qta, locazione, note, origine, utente, created_at)
                       VALUES (?, ?, 'MODIFICA', 0, NULL, ?, 'ORDINE_ARRIVO', ?, ?)""",
                    (vino_id, now,
                     "STATO_RIORDINO: 0 (Ordinato) → — (auto-reset arrivo ordine)",
                     utente, now),
                )

        # Stato testata ricalcolato sui dati, non su quello che crede il client.
        mancanti = cur.execute(
            "SELECT COUNT(*) FROM vini_ordini_righe"
            " WHERE ordine_id = ? AND qta_ricevuta < qta_ordinata",
            (ordine_id,),
        ).fetchone()[0]
        if mancanti == 0:
            cur.execute(
                "UPDATE vini_ordini SET stato = 'chiuso', data_chiusura = ?, updated_at = ?"
                " WHERE id = ?",
                (now, now, ordine_id),
            )
        else:
            cur.execute(
                "UPDATE vini_ordini SET stato = 'parziale', updated_at = ? WHERE id = ?",
                (now, ordine_id),
            )

        conn.commit()
    except Exception:
        try:
            conn.rollback()
        except Exception:
            pass
        conn.close()
        raise
    conn.close()

    ordine = get_ordine(ordine_id)
    ordine["_movimenti_creati"] = movimenti
    ordine["_righe_saltate"] = righe_saltate
    return ordine
