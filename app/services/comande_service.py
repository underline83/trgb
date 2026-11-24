# @version: v2.2 (2026-11-24) — chi è al tavolo anche senza prenotazione (walk-in, cliente, cliente nuovo) e Prenotazioni che segue il conto
# -*- coding: utf-8 -*-
"""
Comande — logica. Modulo: comande. [core]

Il router (app/routers/comande_router.py) traduce solo HTTP ⇄ service, così
il connettore MCP potrà riusare queste funzioni.

Il giro di un tavolo:
    apri_conto  → tavolo + coperti (un conto aperto per tavolo)
    aggiungi_righe → articoli dal catalogo (catalogo_vendita), prezzo deciso QUI,
                  mai dal telefono; uscita e reparto proposti dalle impostazioni
    invia       → le righe «da inviare» diventano «inviate», un invio per reparto
                  con la fotografia delle righe (è ciò che il ponte stamperà)
    via         → «via la 2ª»: un invio di tipo via ai reparti che hanno righe
                  di quell'uscita
    storna      → una riga già inviata si storna con un motivo, e il reparto lo sa
    chiudi / annulla → libera il tavolo. Finché non c'è la Cassa ogni conto è
                  di prova (decisione di Marco del 24/11/2026)

Dalla v1.1 (come si lavora oggi in cassa, docs/studio_ipratico_comanda.md §2):
    coperto     → una riga che nasce con l'apertura e segue i coperti (quantità =
                  coperti); non va a nessun reparto, non si invia e non si storna:
                  si cambia dai coperti o si mette in omaggio (prezzo 0)
    tasti rapidi → righe a 0 € che dicono a un reparto di far partire qualcosa
                  («Stuzzico», «Pane»); partono col prossimo «Invia»

Dalla v2.0 — «vai e attendi», copiato da come lavora l'osteria (studio §5 e §8):
    uscite      → libere e numerate da 1; «Invia comanda» manda TUTTO ai reparti:
                  la prima uscita nuova va (se prima di lei niente attende), le
                  altre attendono
    vai         → «Vai con la preparazione»: l'uscita che attende parte, e il
                  reparto riceve di nuovo i suoi piatti
    attendi     → un'uscita andata torna ad attendere
    sollecita   → avviso al reparto su un'uscita già andata
    Lo stato sta in comande_uscite. I conti nati prima non ce l'hanno: per loro
    valgono la vecchia «via» (uscita_corrente) e «Subito» (uscita 0, sempre andata).

Dalla v2.1 — il tavolo si lega alla prenotazione (Marco, 24/11/2026):
    prenotazioni → quelle del giorno, lette dal servizio platform
                  prenotazioni_giorno_service (la Comanda non tocca il modulo Prenotazioni)
    lega        → all'apertura o dal conto: sul conto restano prenotazione_id,
                  cliente_id e il nome (ospite).

Dalla v2.2 — chi è al tavolo anche senza prenotazione, e Prenotazioni che segue
(Marco, 24/11/2026: «dammi la possibilità di inserirla come walk-in, oppure di scegliere
altro cliente, oppure di creare nuovo cliente, oppure di selezionarne uno tra gli altri
prenotati; in ogni caso dovresti sistemare la cosa anche sulle prenotazioni»):
    ospite      → {tipo: prenotazione | walkin | cliente | nuovo}. Una prenotazione
                  che c'è passa a «Seduto» sul tavolo del conto; per gli altri tre nasce
                  una prenotazione «Walk-in» di oggi, già seduta
    il conto    → spostato: la prenotazione cambia tavolo; coperti corretti: li segue
                  la prenotazione nata dal conto; chiuso: «Completata»; annullato o
                  collegamento tolto: tutto torna com'era (il walk-in nato dal conto sparisce)
    Le scritture le fa prenotazioni_giorno_service con le funzioni del Planning.
    Se Prenotazioni dice di no (turno chiuso…) il conto va avanti lo stesso e lo dice
    (campo `avviso`). Si spegne da Impostazioni (prenotazioni_aggiorna).
"""

from __future__ import annotations

import json
from datetime import date, datetime
from typing import Any, Dict, Iterable, List, Optional

from app.models.comande_db import get_comande_conn
from app.services import catalogo_vendita, prenotazioni_giorno_service, tavoli_sala_service

FAMIGLIE = ("food", "beverage", "servizio")
COPERTO, COPERTO_OMAGGIO = "COPERTO", "COPERTO-OMAGGIO"   # articolo_codice della riga del coperto
GRUPPO_TASTI = "Tasti rapidi"
USCITA_MAX = 20


class ComandaErrore(Exception):
    """Richiesta non valida (400)."""


class ComandaNonTrovata(Exception):
    """Conto o riga inesistente (404)."""


# ── impostazioni ───────────────────────────────────────────────────

def _config(conn) -> Dict[str, str]:
    return {r["chiave"]: r["valore"] for r in conn.execute("SELECT chiave, valore FROM comande_config")}


def _int(v, default: int) -> int:
    try:
        return int(v)
    except (TypeError, ValueError):
        return default


def _minuti_da(ts: Optional[str]) -> Optional[int]:
    """Minuti passati da un orario scritto dal DB con datetime('now','localtime'). Si contano qui,
    con l'orologio del server che l'ha scritto: il telefono può avere un'altra ora."""
    if not ts:
        return None
    try:
        return max(0, int((datetime.now() - datetime.fromisoformat(ts)).total_seconds() // 60))
    except ValueError:
        return None


def _reparti(conn, solo_attivi: bool = False) -> List[Dict[str, Any]]:
    sql = "SELECT key, nome, ordine, attivo FROM comande_reparti"
    if solo_attivi:
        sql += " WHERE attivo = 1"
    return [dict(r) for r in conn.execute(sql + " ORDER BY ordine, key")]


def _mappa_gruppi(conn) -> Dict[str, Optional[str]]:
    return {r["gruppo"]: r["reparto_key"] for r in conn.execute(
        "SELECT gruppo, reparto_key FROM comande_gruppi_reparto")}


def _prezzo_cfg(v) -> Optional[float]:
    """Un prezzo scritto in Impostazioni («5», «5,50»): None se non è un prezzo."""
    try:
        f = float(str(v).replace(",", "."))
    except (TypeError, ValueError):
        return None
    return round(f, 2) if 0 <= f <= 1000 else None


def _coperto_cfg(cfg: Dict[str, str]) -> Dict[str, Any]:
    return {
        "attivo": cfg.get("coperto_attivo") == "1",
        "nome": (cfg.get("coperto_nome") or "").strip() or "Coperto",
        "prezzo": _prezzo_cfg(cfg.get("coperto_prezzo")) or 0.0,
    }


def _tasti(conn, solo_attivi: bool = False) -> List[Dict[str, Any]]:
    sql = "SELECT id, nome, reparto_key, ogni_coperti, ordine, attivo, uscita FROM comande_tasti_rapidi"
    if solo_attivi:
        sql += " WHERE attivo = 1"
    return [dict(r) for r in conn.execute(sql + " ORDER BY ordine, id")]


def _codice_tasto(tasto_id: int) -> str:
    return f"T{tasto_id:03d}"


def _quantita_tasto(ogni_coperti: int, coperti: int) -> int:
    """0 = una; 1 = una a coperto; 2 = una ogni due coperti (per difetto, almeno una)."""
    if not ogni_coperti or ogni_coperti <= 0:
        return 1
    return max(1, min((coperti or 0) // ogni_coperti, 99))


def impostazioni() -> Dict[str, Any]:
    conn = get_comande_conn()
    try:
        cfg = _config(conn)
        return {
            "config": cfg,
            "uscite_numero": _int(cfg.get("uscite_numero"), 4),
            "reparti": _reparti(conn),
            "gruppi_reparto": _mappa_gruppi(conn),
            "coperto": _coperto_cfg(cfg),
            "prenotazioni_aggiorna": cfg.get("prenotazioni_aggiorna", "1") == "1",
            "tasti_rapidi": _tasti(conn),
        }
    finally:
        conn.close()


CHIAVI_CONFIG = {
    # uscite_numero e uscita_<famiglia> servivano alla 1.x (uscite fisse): dalla 2.0 le uscite
    # sono libere e la pagina non le manda più. Restano accettate per non rompere chi le manda.
    "uscite_numero": "int:1:9",
    "uscita_food": "int:0:9", "uscita_beverage": "int:0:9", "uscita_servizio": "int:0:9",
    "reparto_food": "reparto", "reparto_beverage": "reparto", "reparto_servizio": "reparto",
    "coperto_attivo": "bool", "coperto_nome": "testo", "coperto_prezzo": "prezzo",
    "prenotazioni_aggiorna": "bool",
}


def salva_impostazioni(dati: Dict[str, Any]) -> Dict[str, Any]:
    """Accetta config (chiavi note), reparti [{key,nome,attivo,ordine}], gruppi_reparto
    {gruppo: key|None} e tasti_rapidi [{id?,nome,reparto_key,ogni_coperti,attivo,ordine}].
    Un tasto rapido non si cancella: si spegne (il suo codice resta nelle righe già battute)."""
    conn = get_comande_conn()
    try:
        reparti_noti = {r["key"] for r in _reparti(conn)}
        for r in dati.get("reparti") or []:
            key = str(r.get("key") or "").strip().lower()
            nome = str(r.get("nome") or "").strip()
            if not key or not nome:
                raise ComandaErrore("Ogni reparto vuole chiave e nome")
            conn.execute(
                "INSERT INTO comande_reparti (key, nome, ordine, attivo) VALUES (?, ?, ?, ?) "
                "ON CONFLICT(key) DO UPDATE SET nome = excluded.nome, ordine = excluded.ordine, "
                "attivo = excluded.attivo",
                (key, nome, _int(r.get("ordine"), 0), 1 if r.get("attivo", True) else 0),
            )
            reparti_noti.add(key)

        for chiave, valore in (dati.get("config") or {}).items():
            regola = CHIAVI_CONFIG.get(chiave)
            if not regola:
                raise ComandaErrore(f"Impostazione sconosciuta: {chiave}")
            if regola.startswith("int:"):
                _, lo, hi = regola.split(":")
                n = _int(valore, -1)
                if not int(lo) <= n <= int(hi):
                    raise ComandaErrore(f"{chiave}: da {lo} a {hi}")
                valore = str(n)
            elif regola == "bool":
                valore = "1" if str(valore).strip().lower() in ("1", "true", "si", "sì") else "0"
            elif regola == "testo":
                valore = " ".join(str(valore or "").split())[:60]
                if not valore:
                    raise ComandaErrore(f"{chiave}: serve un nome")
            elif regola == "prezzo":
                prezzo = _prezzo_cfg(valore)
                if prezzo is None:
                    raise ComandaErrore(f"{chiave}: prezzo da 0 a 1000")
                valore = f"{prezzo:.2f}".rstrip("0").rstrip(".")
            else:
                valore = (str(valore).strip().lower() or "") if valore is not None else ""
                if valore and valore not in reparti_noti:
                    raise ComandaErrore(f"{chiave}: reparto «{valore}» inesistente")
            conn.execute(
                "INSERT INTO comande_config (chiave, valore) VALUES (?, ?) "
                "ON CONFLICT(chiave) DO UPDATE SET valore = excluded.valore", (chiave, valore))

        for gruppo, key in (dati.get("gruppi_reparto") or {}).items():
            gruppo = str(gruppo or "").strip()
            if not gruppo:
                continue
            if key == "__default__":
                conn.execute("DELETE FROM comande_gruppi_reparto WHERE gruppo = ?", (gruppo,))
                continue
            key = (str(key).strip().lower() or None) if key is not None else None
            if key and key not in reparti_noti:
                raise ComandaErrore(f"{gruppo}: reparto «{key}» inesistente")
            conn.execute(
                "INSERT INTO comande_gruppi_reparto (gruppo, reparto_key) VALUES (?, ?) "
                "ON CONFLICT(gruppo) DO UPDATE SET reparto_key = excluded.reparto_key", (gruppo, key))

        for i, t in enumerate(dati.get("tasti_rapidi") or [], start=1):
            nome = " ".join(str(t.get("nome") or "").split())[:60]
            if not nome:
                raise ComandaErrore("Ogni tasto rapido vuole un nome")
            key = str(t.get("reparto_key") or "").strip().lower() or None
            if key and key not in reparti_noti:
                raise ComandaErrore(f"{nome}: reparto «{key}» inesistente")
            ogni = _int(t.get("ogni_coperti"), 0)
            if not 0 <= ogni <= 20:
                raise ComandaErrore(f"{nome}: «una ogni N coperti» va da 0 a 20")
            if "uscita" in t or not t.get("id"):
                usc = _int(t.get("uscita"), 0) or None
            else:   # chi salva senza dire l'uscita (una pagina vecchia) non la cancella
                prima = conn.execute("SELECT uscita FROM comande_tasti_rapidi WHERE id = ?",
                                     (_int(t["id"], -1),)).fetchone()
                usc = prima["uscita"] if prima else None
            if usc is not None and not 1 <= usc <= USCITA_MAX:
                raise ComandaErrore(f"{nome}: uscita da 1 a {USCITA_MAX}, o nessuna")
            valori = (nome, key, ogni, _int(t.get("ordine"), i), 1 if t.get("attivo", True) else 0, usc)
            if t.get("id"):
                fatto = conn.execute(
                    "UPDATE comande_tasti_rapidi SET nome = ?, reparto_key = ?, ogni_coperti = ?, "
                    "ordine = ?, attivo = ?, uscita = ? WHERE id = ?", (*valori, _int(t["id"], -1)))
                if fatto.rowcount == 0:
                    raise ComandaErrore(f"{nome}: tasto rapido inesistente")
            else:
                conn.execute(
                    "INSERT INTO comande_tasti_rapidi (nome, reparto_key, ogni_coperti, ordine, attivo, uscita) "
                    "VALUES (?, ?, ?, ?, ?, ?)", valori)
        conn.commit()
    finally:
        conn.close()
    return impostazioni()


def _reparto_per(gruppo: Optional[str], famiglia: str, cfg: Dict[str, str],
                 mappa: Dict[str, Optional[str]], attivi: set) -> Optional[str]:
    if gruppo and gruppo in mappa:
        key = mappa[gruppo]
    else:
        key = cfg.get(f"reparto_{famiglia}") or None
    return key if key in attivi else None


# ── lettura ────────────────────────────────────────────────────────

def _riga(r) -> Dict[str, Any]:
    d = dict(r)
    try:
        d["varianti"] = json.loads(d["varianti"]) if d.get("varianti") else []
    except (TypeError, ValueError):
        d["varianti"] = []
    d["totale"] = round((d["prezzo_unitario"] or 0) * (d["quantita"] or 0), 2) if d["stato"] != "stornata" else 0.0
    return d


def _testata(conn, conto_id: int):
    c = conn.execute("SELECT * FROM comande_conti WHERE id = ?", (conto_id,)).fetchone()
    if not c:
        raise ComandaNonTrovata(f"Conto {conto_id} inesistente")
    return c


def _riepilogo_conti(conn, ids: Iterable[int]) -> Dict[int, Dict[str, Any]]:
    ids = list(ids)
    if not ids:
        return {}
    segni = ",".join("?" * len(ids))
    out = {}
    for r in conn.execute(f"""
        SELECT conto_id,
               SUM(CASE WHEN stato != 'stornata' THEN prezzo_unitario * quantita ELSE 0 END) AS totale,
               SUM(CASE WHEN stato = 'da_inviare' THEN quantita ELSE 0 END) AS da_inviare,
               SUM(CASE WHEN stato = 'inviata' AND COALESCE(articolo_tipo, '') != 'coperto'
                        THEN quantita ELSE 0 END) AS inviate
          FROM comande_righe WHERE conto_id IN ({segni}) GROUP BY conto_id
    """, ids):
        out[r["conto_id"]] = {"totale": round(r["totale"] or 0, 2),
                              "da_inviare": int(r["da_inviare"] or 0), "inviate": int(r["inviate"] or 0)}
    return out


def _uscite_stato(conn, c) -> Dict[int, Dict[str, Any]]:
    """Stato di ogni uscita già inviata di un conto: numero → {stato, andata_at, solleciti…}.
    Per le uscite senza riga in comande_uscite (conti nati prima della 2.0) si deduce:
    «Subito» è andata, le altre lo sono fino a uscita_corrente."""
    out = {r["numero"]: dict(r) for r in conn.execute(
        "SELECT numero, stato, andata_at, andata_da, solleciti, sollecitata_at "
        "FROM comande_uscite WHERE conto_id = ?", (c["id"],))}
    for r in conn.execute(
        "SELECT DISTINCT uscita FROM comande_righe WHERE conto_id = ? AND stato = 'inviata' "
        "AND COALESCE(articolo_tipo, '') != 'coperto'", (c["id"],)
    ):
        n = r["uscita"]
        if n not in out:
            andata = n == 0 or n <= (c["uscita_corrente"] or 0)
            out[n] = {"numero": n, "stato": "andata" if andata else "attende", "andata_at": None,
                      "andata_da": None, "solleciti": 0, "sollecitata_at": None}
    return out


def conti_aperti() -> List[Dict[str, Any]]:
    conn = get_comande_conn()
    try:
        conti = [dict(r) for r in conn.execute(
            "SELECT * FROM comande_conti WHERE stato = 'aperto' ORDER BY aperto_at")]
        rie = _riepilogo_conti(conn, [c["id"] for c in conti])
        for c in conti:
            c.update(rie.get(c["id"], {"totale": 0.0, "da_inviare": 0, "inviate": 0}))
            st = _uscite_stato(conn, c)
            vere = sorted(n for n in st if n > 0)
            attende = [n for n in vere if st[n]["stato"] == "attende"]
            andate = [n for n in vere if st[n]["stato"] == "andata"]
            ultima = st[andate[-1]] if andate else None
            c["uscite_tot"] = vere[-1] if vere else 0   # la più alta inviata: «Uscita 2 di 5»
            c["uscita_attende"] = attende[0] if attende else None
            c["uscita_andata"] = andate[-1] if andate else None
            c["uscita_andata_at"] = ultima["andata_at"] if ultima else None
            c["minuti_andata"] = _minuti_da(ultima["andata_at"]) if ultima else None
            c["minuti_aperto"] = _minuti_da(c["aperto_at"])
            c["sollecitata"] = bool(ultima and ultima.get("solleciti"))
    finally:
        conn.close()
    return conti


def _prenotazioni_con_conto(data: str, aperti: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Le prenotazioni del giorno, ognuna con: `conto` (id e tavolo) se è legata a un conto
    aperto, `servita` se quel giorno ha già avuto un conto poi chiuso, `tra_minuti` quanto manca
    alla sua ora (negativo se è passata), contato con l'orologio del server."""
    legate = {c["prenotazione_id"]: c for c in aperti if c.get("prenotazione_id")}
    conn = get_comande_conn()
    try:
        servite = {r["prenotazione_id"] for r in conn.execute(
            "SELECT prenotazione_id FROM comande_conti WHERE stato = 'chiuso' "
            "AND prenotazione_id IS NOT NULL AND DATE(aperto_at) = ?", (data,))}
    finally:
        conn.close()
    adesso = datetime.now()
    out = []
    for p in prenotazioni_giorno_service.del_giorno(data):
        c = legate.get(p["id"])
        try:
            tra = int((datetime.fromisoformat(f"{p['data']}T{p['ora']}:00") - adesso).total_seconds() // 60)
        except (TypeError, ValueError):
            tra = None
        out.append({**p, "conto": {"id": c["id"], "tavolo": c["tavolo"]} if c else None,
                    "servita": p["id"] in servite and not c, "tra_minuti": tra})
    return out


def prenotazioni(data: Optional[str] = None) -> Dict[str, Any]:
    """Prenotazioni di un giorno (oggi se non si dice) fra cui scegliere chi è al tavolo."""
    if data:
        try:
            data = date.fromisoformat(str(data)[:10]).isoformat()
        except ValueError:
            raise ComandaErrore("Data non valida (AAAA-MM-GG)")
    else:
        data = date.today().isoformat()
    conn = get_comande_conn()
    try:
        aggiorna = _config(conn).get("prenotazioni_aggiorna", "1") == "1"
    finally:
        conn.close()
    return {"data": data, "turno": prenotazioni_giorno_service.turno_adesso(), "aggiorna": aggiorna,
            "prenotazioni": _prenotazioni_con_conto(data, conti_aperti())}


def tavoli() -> Dict[str, Any]:
    """Tavoli per sala, ognuno col suo conto aperto (se c'è) e con le prenotazioni di oggi,
    nel turno in corso, che hanno quel tavolo scritto sopra: non quelle già andate («Completata»)
    né quelle che oggi hanno già avuto un conto chiuso."""
    aperti = conti_aperti()
    per_tavolo = {c["tavolo_id"]: c for c in aperti if c["tavolo_id"] is not None}
    turno = prenotazioni_giorno_service.turno_adesso()
    del_turno = [p for p in _prenotazioni_con_conto(date.today().isoformat(), aperti)
                 if p["turno"] == turno and p["stato"] != "LEFT" and not p["servita"]]
    sale: List[Dict[str, Any]] = []
    indice_sala: Dict[str, Dict[str, Any]] = {}
    for t in tavoli_sala_service.elenco_tavoli():
        zona = t.get("zona") or "Sala"
        if zona not in indice_sala:
            indice_sala[zona] = {"zona": zona, "tavoli": []}
            sale.append(indice_sala[zona])
        sue = [p for p in del_turno if prenotazioni_giorno_service.sul_tavolo(p, t["nome"])]
        indice_sala[zona]["tavoli"].append({**t, "conto": per_tavolo.get(t["id"]), "prenotazioni": sue})
    noti = {t["id"] for s in sale for t in s["tavoli"]}
    orfani = [c for c in aperti if c["tavolo_id"] not in noti]  # tavolo disattivato a conto aperto
    return {"sale": sale, "altri_conti": orfani, "elementi": tavoli_sala_service.elementi(), "turno": turno}


def conto(conto_id: int) -> Dict[str, Any]:
    conn = get_comande_conn()
    try:
        c = dict(_testata(conn, conto_id))
        righe = [_riga(r) for r in conn.execute(
            "SELECT * FROM comande_righe WHERE conto_id = ? ORDER BY uscita, id", (conto_id,))]
        invii = [dict(r) for r in conn.execute(
            "SELECT id, tipo, reparto, uscita, creato_at, creato_da, stampato_at FROM comande_invii "
            "WHERE conto_id = ? ORDER BY id", (conto_id,))]
        reparti = {r["key"]: r["nome"] for r in _reparti(conn)}
        uscite_numero = _int(_config(conn).get("uscite_numero"), 4)
        tasti = _tasti(conn, solo_attivi=True)
        stati = _uscite_stato(conn, c)
    finally:
        conn.close()
    c["uscite"] = []
    for n in sorted({r["uscita"] for r in righe if r["articolo_tipo"] != "coperto"}):
        sue = [r for r in righe if r["uscita"] == n and r["articolo_tipo"] != "coperto"]
        st = stati.get(n) or {}
        c["uscite"].append({
            "numero": n, "stato": st.get("stato") or "nuova",   # nuova = mai inviata
            "andata_at": st.get("andata_at"), "solleciti": st.get("solleciti") or 0,
            "da_inviare": sum(r["quantita"] for r in sue if r["stato"] == "da_inviare"),
        })
    cop = next((r for r in righe if r["articolo_tipo"] == "coperto" and r["stato"] != "stornata"), None)
    c["coperto"] = {
        "riga_id": cop["id"], "nome": cop["nome"], "prezzo": cop["prezzo_unitario"],
        "omaggio": cop["articolo_codice"] == COPERTO_OMAGGIO,
    } if cop else None
    c["tasti_rapidi"] = [{
        "id": t["id"], "nome": t["nome"], "codice": _codice_tasto(t["id"]),
        "reparto": t["reparto_key"] if t["reparto_key"] in reparti else None,
        "quantita": _quantita_tasto(t["ogni_coperti"], c["coperti"]),
        "uscita": t["uscita"],   # None = l'uscita in cui si sta battendo
    } for t in tasti]
    # la prenotazione legata si rilegge ogni volta (allergie e note possono cambiare);
    # se non c'è più resta il nome scritto sul conto (ospite)
    c["prenotazione"] = (prenotazioni_giorno_service.una(c["prenotazione_id"])
                         if c.get("prenotazione_id") else None)
    c["righe"] = righe
    c["invii"] = invii
    c["totale"] = round(sum(r["totale"] for r in righe), 2)
    c["da_inviare"] = sum(r["quantita"] for r in righe if r["stato"] == "da_inviare")
    c["reparti"] = reparti
    c["uscite_numero"] = max(uscite_numero, max((r["uscita"] for r in righe), default=0))
    return c


# ── scrittura ──────────────────────────────────────────────────────

def _aperto(c) -> None:
    if c["stato"] != "aperto":
        raise ComandaErrore("Il conto è già chiuso")


def _riga_coperto(conn, conto_id: int):
    return conn.execute(
        "SELECT * FROM comande_righe WHERE conto_id = ? AND articolo_tipo = 'coperto' "
        "AND stato != 'stornata' ORDER BY id LIMIT 1", (conto_id,)).fetchone()


def _sincronizza_coperto(conn, conto_id: int, coperti: int, utente: Optional[str]) -> None:
    """La riga del coperto segue i coperti. Nasce se l'impostazione è accesa; una volta
    nata si aggiorna da sola (e sparisce a 0 coperti). Non va a nessun reparto: nasce
    già «inviata», così non entra in «Invia» e non blocca la chiusura."""
    riga = _riga_coperto(conn, conto_id)
    if riga:
        if coperti <= 0:
            conn.execute("DELETE FROM comande_righe WHERE id = ?", (riga["id"],))
        elif riga["quantita"] != coperti:
            conn.execute(
                "UPDATE comande_righe SET quantita = ?, aggiornata_at = datetime('now','localtime') "
                "WHERE id = ?", (coperti, riga["id"]))
        return
    cop = _coperto_cfg(_config(conn))
    if cop["attivo"] and coperti > 0:
        conn.execute("""
            INSERT INTO comande_righe (conto_id, articolo_codice, articolo_tipo, nome, gruppo, famiglia,
                                       reparto, prezzo_unitario, quantita, uscita, stato, creata_da)
            VALUES (?, ?, 'coperto', ?, 'Servizio', 'servizio', NULL, ?, ?, 0, 'inviata', ?)
        """, (conto_id, COPERTO, cop["nome"], cop["prezzo"], coperti, utente))


def _non_coperto(r) -> None:
    if r["articolo_tipo"] == "coperto":
        raise ComandaErrore("Il coperto segue i coperti: cambia quelli, o mettilo in omaggio")


TIPI_OSPITE = ("prenotazione", "walkin", "cliente", "nuovo")
WALKIN = "Walk-in"


def _scrive_prenotazioni(conn, chi: Optional[Dict[str, Any]]) -> bool:
    """Vero se ciò che succede al conto va riportato in Prenotazioni: impostazione accesa
    e un utente vero che lo fa (i ruoli li controlla Prenotazioni)."""
    return bool(chi) and _config(conn).get("prenotazioni_aggiorna", "1") == "1"


def _con_avviso(c: Dict[str, Any], avvisi: List[str]) -> Dict[str, Any]:
    c["avviso"] = " · ".join(dict.fromkeys(avvisi)) or None
    return c


def _sciogli(conn, c, chi: Optional[Dict[str, Any]], avvisi: List[str]) -> None:
    """Toglie chi è al tavolo. In Prenotazioni rimette com'era: il walk-in nato da questo conto
    sparisce, una prenotazione che c'era già riprende lo stato e il tavolo di prima."""
    if not (c["prenotazione_id"] or c["cliente_id"] or c["ospite"]):
        return
    if c["prenotazione_id"] and _scrive_prenotazioni(conn, chi):
        try:
            if c["pren_creata"]:
                prenotazioni_giorno_service.togli_creata(c["prenotazione_id"])
            elif c["pren_stato_prima"]:
                prenotazioni_giorno_service.rimetti(
                    c["prenotazione_id"], c["pren_stato_prima"], c["pren_tavolo_prima"], chi)
        except prenotazioni_giorno_service.PrenotazioneErrore as e:
            avvisi.append(f"Prenotazioni non aggiornata: {e}")
    conn.execute(
        "UPDATE comande_conti SET prenotazione_id = NULL, cliente_id = NULL, ospite = NULL, "
        "pren_creata = NULL, pren_stato_prima = NULL, pren_tavolo_prima = NULL, "
        "aggiornato_at = datetime('now','localtime') WHERE id = ?", (c["id"],))


def _metti_al_tavolo(conn, conto_id: int, ospite: Optional[Dict[str, Any]],
                     chi: Optional[Dict[str, Any]], avvisi: List[str]) -> None:
    """Chi è al tavolo. `ospite` None = nessuno; se no {tipo, …}:
        prenotazione  {prenotazione_id}            una prenotazione del giorno
        walkin        {}                           entrato senza prenotare, senza nome
        cliente       {cliente_id}                 un cliente che c'è già, senza prenotazione
        nuovo         {cognome, nome?, telefono?}  un cliente nuovo
    L'ordine conta: prima si controlla e si scrive il nuovo, poi si scioglie quello che c'era
    (che in Prenotazioni torna com'era). Così un errore non lascia il tavolo senza nessuno."""
    c = _testata(conn, conto_id)
    if not ospite:
        _sciogli(conn, c, chi, avvisi)
        return
    tipo = ospite.get("tipo")
    if tipo not in TIPI_OSPITE:
        raise ComandaErrore("Chi è al tavolo: prenotazione, walkin, cliente o nuovo")
    scrive = _scrive_prenotazioni(conn, chi)
    pg = prenotazioni_giorno_service

    def salva(pren_id, cliente_id, nome, creata=None, stato_prima=None, tavolo_prima=None):
        _sciogli(conn, c, chi, avvisi)     # solo adesso, col nuovo già a posto
        conn.execute(
            "UPDATE comande_conti SET prenotazione_id = ?, cliente_id = ?, ospite = ?, pren_creata = ?, "
            "pren_stato_prima = ?, pren_tavolo_prima = ?, aggiornato_at = datetime('now','localtime') "
            "WHERE id = ?", (pren_id, cliente_id, nome, creata, stato_prima, tavolo_prima, conto_id))

    if tipo == "prenotazione":
        p = pg.una(_int(ospite.get("prenotazione_id"), -1))
        if not p:
            raise ComandaErrore("Prenotazione inesistente")
        if p["id"] == c["prenotazione_id"]:
            return                          # è già lei
        altro = conn.execute(
            "SELECT tavolo FROM comande_conti WHERE stato = 'aperto' AND prenotazione_id = ? AND id != ?",
            (p["id"], conto_id)).fetchone()
        if altro:
            raise ComandaErrore(f"{p['nome']} è già al tavolo {altro['tavolo']}: sposta quel conto, "
                                "o qui metti un walk-in")
        if not p["tiene_il_tavolo"]:
            raise ComandaErrore(f"La prenotazione di {p['nome']} è «{p['stato_etichetta']}»: non si lega a un tavolo")
        nome = WALKIN if p["nome"] == "senza nome" else p["nome"]
        if not scrive:
            salva(p["id"], p["cliente_id"], nome)
            return
        try:
            pg.siedi(p["id"], chi, c["tavolo"])
        except pg.PrenotazioneErrore as e:
            avvisi.append(f"Prenotazioni non aggiornata: {e}")
        salva(p["id"], p["cliente_id"], nome, 0, p["stato"], p["tavolo"])
        return

    cliente_id, cognome = None, None
    if tipo == "cliente":
        cliente_id = _int(ospite.get("cliente_id"), -1)
        if cliente_id < 1:
            raise ComandaErrore("Quale cliente?")
    if tipo == "nuovo":
        cognome = " ".join(str(ospite.get("cognome") or "").split())
        if not cognome:
            raise ComandaErrore("Per un cliente nuovo serve almeno il cognome")
        if not scrive:
            raise ComandaErrore("Un cliente nuovo si crea con Prenotazioni: accendi «Aggiorna Prenotazioni» "
                                "in Impostazioni, o crealo da Clienti")
    etichetta = WALKIN if tipo == "walkin" else " ".join(
        str(ospite.get("etichetta") or f"{cognome or ''} {ospite.get('nome') or ''}").split())[:80] or "Cliente"
    if not scrive:
        salva(None, cliente_id, etichetta)
        return
    try:
        p = pg.crea_al_tavolo(c["tavolo"], c["coperti"], chi, cliente_id=cliente_id,
                              nome=ospite.get("nome"), cognome=cognome, telefono=ospite.get("telefono"))
    except pg.PrenotazioneErrore as e:
        if tipo == "nuovo":
            raise ComandaErrore(f"Cliente non creato: {e}")
        avvisi.append(f"Prenotazioni non aggiornata: {e}")
        salva(None, cliente_id, etichetta)
        return
    salva(p["id"], p["cliente_id"], WALKIN if p["nome"] == "senza nome" else p["nome"], 1)


def clienti(q: str, chi: Dict[str, Any]) -> List[Dict[str, Any]]:
    """Clienti fra cui scegliere chi è al tavolo (nome, ultime cifre del telefono, visite)."""
    try:
        return prenotazioni_giorno_service.cerca_clienti(q, chi)
    except prenotazioni_giorno_service.PrenotazioneErrore as e:
        raise ComandaErrore(str(e))


def apri_conto(tavolo_id: int, coperti: int, nota: Optional[str], utente: Optional[str],
               prenotazione_id: Optional[int] = None, ospite: Optional[Dict[str, Any]] = None,
               chi: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    """Apre un tavolo. `ospite` dice chi c'è seduto (vedi _metti_al_tavolo); `prenotazione_id`
    è la forma corta della 2.1 per «una prenotazione»."""
    if ospite is None and prenotazione_id is not None:
        ospite = {"tipo": "prenotazione", "prenotazione_id": prenotazione_id}
    avvisi: List[str] = []
    t = tavoli_sala_service.tavolo(tavolo_id)
    if not t or not t.get("attivo"):
        raise ComandaErrore("Tavolo inesistente o non attivo")
    coperti = _int(coperti, -1)
    if coperti < 0 or coperti > 200:
        raise ComandaErrore("Coperti da 0 a 200")
    conn = get_comande_conn()
    try:
        gia = conn.execute(
            "SELECT id FROM comande_conti WHERE tavolo_id = ? AND stato = 'aperto'", (tavolo_id,)).fetchone()
        if gia:
            raise ComandaErrore(f"Il tavolo {t['nome']} ha già un conto aperto")
        cur = conn.execute(
            "INSERT INTO comande_conti (tavolo_id, tavolo, zona, coperti, nota, aperto_da, prova) "
            "VALUES (?, ?, ?, ?, ?, ?, 1)",
            (tavolo_id, t["nome"], t.get("zona"), coperti, (nota or "").strip() or None, utente))
        nuovo = cur.lastrowid
        _sincronizza_coperto(conn, nuovo, coperti, utente)
        if ospite:
            _metti_al_tavolo(conn, nuovo, ospite, chi, avvisi)
        conn.commit()
    finally:
        conn.close()
    return _con_avviso(conto(nuovo), avvisi)


def aggiorna_conto(conto_id: int, dati: Dict[str, Any], utente: Optional[str],
                   chi: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    """Coperti, nota, tavolo e chi è al tavolo di un conto aperto. `ospite` presente e None
    (o `prenotazione_id` None, forma della 2.1) = nessuno."""
    avvisi: List[str] = []
    if "ospite" not in dati and "prenotazione_id" in dati:
        dati = {**dati, "ospite": None if dati["prenotazione_id"] is None else
                {"tipo": "prenotazione", "prenotazione_id": dati["prenotazione_id"]}}
    conn = get_comande_conn()
    try:
        c = _testata(conn, conto_id)
        _aperto(c)
        campi, valori = [], []
        nuovi_coperti = None
        nuovo_tavolo = None
        if "coperti" in dati and dati["coperti"] is not None:
            n = _int(dati["coperti"], -1)
            if n < 0 or n > 200:
                raise ComandaErrore("Coperti da 0 a 200")
            campi.append("coperti = ?"); valori.append(n)
            nuovi_coperti = n
        if "nota" in dati:
            campi.append("nota = ?"); valori.append((dati.get("nota") or "").strip() or None)
        if dati.get("tavolo_id") and int(dati["tavolo_id"]) != c["tavolo_id"]:
            t = tavoli_sala_service.tavolo(int(dati["tavolo_id"]))
            if not t or not t.get("attivo"):
                raise ComandaErrore("Tavolo inesistente o non attivo")
            if conn.execute("SELECT 1 FROM comande_conti WHERE tavolo_id = ? AND stato = 'aperto'",
                            (t["id"],)).fetchone():
                raise ComandaErrore(f"Il tavolo {t['nome']} ha già un conto aperto")
            campi += ["tavolo_id = ?", "tavolo = ?", "zona = ?"]
            valori += [t["id"], t["nome"], t.get("zona")]
            nuovo_tavolo = t["nome"]
        if campi:
            campi.append("aggiornato_at = datetime('now','localtime')")
            conn.execute(f"UPDATE comande_conti SET {', '.join(campi)} WHERE id = ?", (*valori, conto_id))
            if nuovi_coperti is not None and nuovi_coperti != c["coperti"]:
                _sincronizza_coperto(conn, conto_id, nuovi_coperti, utente)
        if "ospite" in dati:   # presente e None = nessuno al tavolo
            _metti_al_tavolo(conn, conto_id, dati["ospite"], chi, avvisi)
        elif c["prenotazione_id"] and _scrive_prenotazioni(conn, chi):
            # la prenotazione segue il conto: tavolo spostato; coperti, se è nata da questo conto
            try:
                prenotazioni_giorno_service.cambia(
                    c["prenotazione_id"], chi, tavolo=nuovo_tavolo,
                    pax=nuovi_coperti if c["pren_creata"] and nuovi_coperti else None)
            except prenotazioni_giorno_service.PrenotazioneErrore as e:
                avvisi.append(f"Prenotazioni non aggiornata: {e}")
        if campi or "ospite" in dati:
            conn.commit()
    finally:
        conn.close()
    return _con_avviso(conto(conto_id), avvisi)


def coperto_omaggio(conto_id: int, omaggio: bool, utente: Optional[str]) -> Dict[str, Any]:
    """Coperto in omaggio (prezzo 0) o di nuovo a prezzo pieno. Chi l'ha messo resta in nota."""
    conn = get_comande_conn()
    try:
        _aperto(_testata(conn, conto_id))
        riga = _riga_coperto(conn, conto_id)
        if not riga:
            raise ComandaErrore("Questo conto non ha il coperto")
        cop = _coperto_cfg(_config(conn))
        if omaggio:
            valori = (COPERTO_OMAGGIO, f"{cop['nome']} - omaggio", 0.0, f"omaggio da {utente}" if utente else "omaggio")
        else:
            valori = (COPERTO, cop["nome"], cop["prezzo"], None)
        conn.execute(
            "UPDATE comande_righe SET articolo_codice = ?, nome = ?, prezzo_unitario = ?, nota = ?, "
            "aggiornata_at = datetime('now','localtime') WHERE id = ?", (*valori, riga["id"]))
        conn.execute("UPDATE comande_conti SET aggiornato_at = datetime('now','localtime') WHERE id = ?",
                     (conto_id,))
        conn.commit()
    finally:
        conn.close()
    return conto(conto_id)


def _varianti(v) -> Optional[str]:
    if not v:
        return None
    if isinstance(v, str):
        v = [x for x in (s.strip() for s in v.split(",")) if x]
    v = [str(x).strip()[:80] for x in v if str(x).strip()][:10]
    return json.dumps(v, ensure_ascii=False) if v else None


def aggiungi_righe(conto_id: int, righe: List[Dict[str, Any]], utente: Optional[str]) -> Dict[str, Any]:
    """righe: [{codice, quantita, uscita?, nota?, varianti?, prezzo? (solo prezzo libero)}]
    oppure riga libera {nome, prezzo, famiglia, quantita, uscita?, nota?} (fuori carta)
    oppure tasto rapido {tasto, quantita?, nota?}: 0 €, quantità proposta dai coperti."""
    if not righe:
        raise ComandaErrore("Nessuna riga")
    idx = catalogo_vendita.indice() if any((r.get("codice") or "").strip() for r in righe) else {}
    conn = get_comande_conn()
    try:
        c = _testata(conn, conto_id)
        _aperto(c)
        cfg = _config(conn)
        mappa = _mappa_gruppi(conn)
        attivi = {r["key"] for r in _reparti(conn, solo_attivi=True)}
        tasti = {t["id"]: t for t in _tasti(conn, solo_attivi=True)}
        da_scrivere = []
        for r in righe:
            codice = (r.get("codice") or "").strip()
            tasto = tasti.get(_int(r.get("tasto"), -1)) if r.get("tasto") is not None else None
            if r.get("tasto") is not None and not tasto:
                raise ComandaErrore("Tasto rapido inesistente o spento")
            proposta = _quantita_tasto(tasto["ogni_coperti"], c["coperti"]) if tasto else 1
            q = proposta if r.get("quantita") is None else _int(r.get("quantita"), 0)
            if q < 1 or q > 99:
                raise ComandaErrore("Quantità da 1 a 99")
            reparto_fisso = False
            if tasto:
                codice = _codice_tasto(tasto["id"])
                nome, gruppo, famiglia, tipo, prezzo = tasto["nome"], GRUPPO_TASTI, "servizio", "tasto_rapido", 0.0
                reparto = tasto["reparto_key"] if tasto["reparto_key"] in attivi else None
                reparto_fisso = True
                if tasto["uscita"]:
                    r = {**r, "uscita": tasto["uscita"]}   # il tasto ha la sua uscita (stuzzico nella 1…)
            elif codice:
                a = idx.get(codice)
                if not a:
                    raise ComandaErrore(f"Articolo {codice} non più in catalogo")
                nome, gruppo, famiglia, tipo = a["nome"], a["gruppo"], a["famiglia"], a["tipo"]
                if a["prezzo_libero"]:
                    prezzo = r.get("prezzo")
                    try:
                        prezzo = float(prezzo)
                    except (TypeError, ValueError):
                        raise ComandaErrore(f"{nome}: serve il prezzo")
                else:
                    prezzo = a["prezzo"]
            else:
                nome = " ".join(str(r.get("nome") or "").split())
                famiglia = r.get("famiglia") or "food"
                if not nome:
                    raise ComandaErrore("Una riga fuori carta vuole il nome")
                if famiglia not in FAMIGLIE:
                    raise ComandaErrore("Famiglia: food, beverage o servizio")
                try:
                    prezzo = float(r.get("prezzo"))
                except (TypeError, ValueError):
                    raise ComandaErrore(f"{nome}: serve il prezzo")
                gruppo, tipo = "Fuori carta", "libero"
            if prezzo < 0 or prezzo > 10000:
                raise ComandaErrore(f"{nome}: prezzo non valido")
            uscita = 1 if r.get("uscita") is None else _int(r.get("uscita"), -1)
            if uscita < 0 or uscita > USCITA_MAX:
                raise ComandaErrore(f"Uscita da 1 a {USCITA_MAX}")
            if not reparto_fisso:
                reparto = _reparto_per(gruppo, famiglia, cfg, mappa, attivi)
            da_scrivere.append((
                conto_id, codice or None, tipo, nome, gruppo, famiglia,
                reparto, round(prezzo, 2), q, uscita,
                _varianti(r.get("varianti")), (r.get("nota") or "").strip()[:200] or None, utente,
            ))
        conn.executemany("""
            INSERT INTO comande_righe (conto_id, articolo_codice, articolo_tipo, nome, gruppo, famiglia,
                                       reparto, prezzo_unitario, quantita, uscita, varianti, nota, creata_da)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, da_scrivere)
        conn.execute("UPDATE comande_conti SET aggiornato_at = datetime('now','localtime') WHERE id = ?",
                     (conto_id,))
        conn.commit()
    finally:
        conn.close()
    return conto(conto_id)


def _riga_db(conn, riga_id: int):
    r = conn.execute("SELECT * FROM comande_righe WHERE id = ?", (riga_id,)).fetchone()
    if not r:
        raise ComandaNonTrovata(f"Riga {riga_id} inesistente")
    _aperto(_testata(conn, r["conto_id"]))
    return r


def modifica_riga(riga_id: int, dati: Dict[str, Any]) -> Dict[str, Any]:
    """Quantità, uscita, nota, varianti: solo finché la riga non è partita."""
    conn = get_comande_conn()
    try:
        r = _riga_db(conn, riga_id)
        _non_coperto(r)
        if r["stato"] != "da_inviare":
            raise ComandaErrore("La riga è già partita: si può solo stornare")
        campi, valori = [], []
        if dati.get("quantita") is not None:
            q = _int(dati["quantita"], 0)
            if q < 1 or q > 99:
                raise ComandaErrore("Quantità da 1 a 99")
            campi.append("quantita = ?"); valori.append(q)
        if dati.get("uscita") is not None:
            u = _int(dati["uscita"], -1)
            if u < 0 or u > USCITA_MAX:
                raise ComandaErrore(f"Uscita da 1 a {USCITA_MAX}")
            campi.append("uscita = ?"); valori.append(u)
        if "nota" in dati:
            campi.append("nota = ?"); valori.append((dati.get("nota") or "").strip()[:200] or None)
        if "varianti" in dati:
            campi.append("varianti = ?"); valori.append(_varianti(dati.get("varianti")))
        if campi:
            campi.append("aggiornata_at = datetime('now','localtime')")
            conn.execute(f"UPDATE comande_righe SET {', '.join(campi)} WHERE id = ?", (*valori, riga_id))
            conn.commit()
        conto_id = r["conto_id"]
    finally:
        conn.close()
    return conto(conto_id)


def elimina_riga(riga_id: int) -> Dict[str, Any]:
    conn = get_comande_conn()
    try:
        r = _riga_db(conn, riga_id)
        _non_coperto(r)
        if r["stato"] != "da_inviare":
            raise ComandaErrore("La riga è già partita: si può solo stornare")
        conn.execute("DELETE FROM comande_righe WHERE id = ?", (riga_id,))
        conn.commit()
        conto_id = r["conto_id"]
    finally:
        conn.close()
    return conto(conto_id)


def _foto(r) -> Dict[str, Any]:
    """Fotografia di una riga per la stampa."""
    d = _riga(r)
    return {k: d[k] for k in ("id", "nome", "quantita", "uscita", "varianti", "nota", "gruppo")}


def _nuovo_invio(conn, conto_id: int, tipo: str, reparto: str, righe: List[Dict[str, Any]],
                 utente: Optional[str], uscita: Optional[int] = None, azione: Optional[str] = None) -> int:
    cur = conn.execute(
        "INSERT INTO comande_invii (conto_id, tipo, reparto, uscita, righe_json, creato_da, azione) "
        "VALUES (?, ?, ?, ?, ?, ?, ?)",
        (conto_id, tipo, reparto, uscita, json.dumps(righe, ensure_ascii=False), utente, azione))
    return cur.lastrowid


def _segna_uscita_corrente(conn, conto_id: int, stati: Dict[int, Dict[str, Any]]) -> None:
    andate = [n for n, st in stati.items() if st["stato"] == "andata"]
    conn.execute(
        "UPDATE comande_conti SET uscita_corrente = ?, aggiornato_at = datetime('now','localtime') "
        "WHERE id = ?", (max(andate, default=0), conto_id))


def invia(conto_id: int, utente: Optional[str]) -> Dict[str, Any]:
    """«Invia comanda»: tutte le righe nuove partono verso i reparti. Fra le uscite nuove la
    prima va, se prima di lei non c'è niente che attende; le altre attendono la chiamata.
    Una riga aggiunta a un'uscita già inviata ne segue lo stato."""
    conn = get_comande_conn()
    try:
        c = dict(_testata(conn, conto_id))
        _aperto(c)
        righe = conn.execute(
            "SELECT * FROM comande_righe WHERE conto_id = ? AND stato = 'da_inviare' ORDER BY uscita, id",
            (conto_id,)).fetchall()
        if not righe:
            raise ComandaErrore("Niente da inviare")
        stati = _uscite_stato(conn, c)
        nuove = sorted({r["uscita"] for r in righe} - set(stati))
        attesa = [n for n, st in stati.items() if st["stato"] == "attende"]
        prima = next((n for n in nuove if n > 0), None)
        for n in nuove:
            va = n == 0 or (n == prima and not any(a < n for a in attesa))
            conn.execute(
                "INSERT INTO comande_uscite (conto_id, numero, stato, andata_at, andata_da) VALUES "
                "(?, ?, ?, CASE WHEN ? THEN datetime('now','localtime') END, ?)",
                (conto_id, n, "andata" if va else "attende", 1 if va else 0, utente if va else None))
            stati[n] = {"stato": "andata" if va else "attende"}
        per_reparto: Dict[Optional[str], List] = {}
        for r in righe:
            per_reparto.setdefault(r["reparto"], []).append(r)
        for reparto, gruppo in per_reparto.items():
            invio_id = None
            if reparto:
                foto = [{**_foto(r), "va": stati[r["uscita"]]["stato"] == "andata"} for r in gruppo]
                invio_id = _nuovo_invio(conn, conto_id, "comanda", reparto, foto, utente)
            conn.executemany(
                "UPDATE comande_righe SET stato = 'inviata', invio_id = ?, "
                "aggiornata_at = datetime('now','localtime') WHERE id = ?",
                [(invio_id, r["id"]) for r in gruppo])
        _segna_uscita_corrente(conn, conto_id, stati)
        conn.commit()
    finally:
        conn.close()
    return conto(conto_id)


def _chiama(conto_id: int, uscita: int, azione: str, utente: Optional[str]) -> Dict[str, Any]:
    """vai / attendi / sollecito su un'uscita già inviata: cambia lo stato e avvisa i reparti
    che hanno righe in quell'uscita, ripetendo i piatti (così il foglio si legge da solo)."""
    uscita = _int(uscita, -1)
    if uscita < 1 or uscita > USCITA_MAX:
        raise ComandaErrore(f"Uscita da 1 a {USCITA_MAX}")
    conn = get_comande_conn()
    try:
        c = dict(_testata(conn, conto_id))
        _aperto(c)
        stati = _uscite_stato(conn, c)
        st = stati.get(uscita)
        if not st:
            raise ComandaErrore(f"L'uscita {uscita} non è ancora stata inviata")
        if azione == "vai" and st["stato"] == "andata":
            raise ComandaErrore(f"L'uscita {uscita} è già andata")
        if azione != "vai" and st["stato"] != "andata":
            raise ComandaErrore(f"L'uscita {uscita} sta attendendo: prima «Vai con la preparazione»")
        righe = conn.execute(
            "SELECT * FROM comande_righe WHERE conto_id = ? AND uscita = ? AND stato = 'inviata' "
            "AND reparto IS NOT NULL ORDER BY id", (conto_id, uscita)).fetchall()
        per_reparto: Dict[str, List] = {}
        for r in righe:
            per_reparto.setdefault(r["reparto"], []).append(r)
        for reparto, gruppo in per_reparto.items():
            _nuovo_invio(conn, conto_id, "via", reparto, [_foto(r) for r in gruppo], utente, uscita, azione)
        conn.execute(
            "INSERT OR IGNORE INTO comande_uscite (conto_id, numero, stato) VALUES (?, ?, ?)",
            (conto_id, uscita, st["stato"]))
        if azione == "vai":
            conn.execute(
                "UPDATE comande_uscite SET stato = 'andata', andata_at = datetime('now','localtime'), "
                "andata_da = ? WHERE conto_id = ? AND numero = ?", (utente, conto_id, uscita))
            st["stato"] = "andata"
        elif azione == "attendi":
            conn.execute(
                "UPDATE comande_uscite SET stato = 'attende', andata_at = NULL, andata_da = NULL "
                "WHERE conto_id = ? AND numero = ?", (conto_id, uscita))
            st["stato"] = "attende"
        else:
            conn.execute(
                "UPDATE comande_uscite SET solleciti = solleciti + 1, "
                "sollecitata_at = datetime('now','localtime') WHERE conto_id = ? AND numero = ?",
                (conto_id, uscita))
        _segna_uscita_corrente(conn, conto_id, stati)
        conn.commit()
    finally:
        conn.close()
    return conto(conto_id)


def vai(conto_id: int, uscita: int, utente: Optional[str]) -> Dict[str, Any]:
    return _chiama(conto_id, uscita, "vai", utente)


def attendi(conto_id: int, uscita: int, utente: Optional[str]) -> Dict[str, Any]:
    return _chiama(conto_id, uscita, "attendi", utente)


def sollecita(conto_id: int, uscita: int, utente: Optional[str]) -> Dict[str, Any]:
    return _chiama(conto_id, uscita, "sollecito", utente)


via = vai   # nome della 1.0, tenuto per l'endpoint vecchio


def storna_riga(riga_id: int, motivo: str, utente: Optional[str]) -> Dict[str, Any]:
    motivo = (motivo or "").strip()
    if not motivo:
        raise ComandaErrore("Per stornare serve il motivo")
    conn = get_comande_conn()
    try:
        r = _riga_db(conn, riga_id)
        _non_coperto(r)
        if r["stato"] != "inviata":
            raise ComandaErrore("Si storna solo una riga già inviata (le altre si tolgono)")
        conn.execute(
            "UPDATE comande_righe SET stato = 'stornata', stornata_at = datetime('now','localtime'), "
            "stornata_da = ?, motivo_storno = ?, aggiornata_at = datetime('now','localtime') WHERE id = ?",
            (utente, motivo[:200], riga_id))
        if r["reparto"]:
            foto = _foto(r)
            foto["motivo"] = motivo[:200]
            _nuovo_invio(conn, r["conto_id"], "storno", r["reparto"], [foto], utente, r["uscita"])
        conn.commit()
        conto_id = r["conto_id"]
    finally:
        conn.close()
    return conto(conto_id)


def chiudi_conto(conto_id: int, utente: Optional[str], annulla: bool = False,
                 chi: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    """Chiude il tavolo. Con una prenotazione legata: chiuso = «Completata»; annullato = in
    Prenotazioni tutto torna com'era (un walk-in nato da questo conto sparisce)."""
    avvisi: List[str] = []
    conn = get_comande_conn()
    try:
        c = _testata(conn, conto_id)
        _aperto(c)
        if not annulla and conn.execute(
            "SELECT 1 FROM comande_righe WHERE conto_id = ? AND stato = 'da_inviare'", (conto_id,)
        ).fetchone():
            raise ComandaErrore("Ci sono righe non inviate: inviale o toglile prima di chiudere")
        if annulla:
            _sciogli(conn, c, chi, avvisi)
        elif c["prenotazione_id"] and _scrive_prenotazioni(conn, chi):
            try:
                prenotazioni_giorno_service.completa(c["prenotazione_id"], chi)
            except prenotazioni_giorno_service.PrenotazioneErrore as e:
                avvisi.append(f"Prenotazioni non aggiornata: {e}")
        conn.execute(
            "UPDATE comande_conti SET stato = ?, chiuso_at = datetime('now','localtime'), chiuso_da = ?, "
            "aggiornato_at = datetime('now','localtime') WHERE id = ?",
            ("annullato" if annulla else "chiuso", utente, conto_id))
        conn.commit()
    finally:
        conn.close()
    return _con_avviso(conto(conto_id), avvisi)


def invii(reparto: Optional[str] = None, limite: int = 50) -> List[Dict[str, Any]]:
    """Ultimi invii (per controllare cosa sarebbe uscito in stampa)."""
    limite = max(1, min(_int(limite, 50), 200))
    conn = get_comande_conn()
    try:
        sql = ("SELECT i.*, c.tavolo, c.coperti FROM comande_invii i "
               "JOIN comande_conti c ON c.id = i.conto_id")
        par: list = []
        if reparto:
            sql += " WHERE i.reparto = ?"
            par.append(reparto)
        sql += " ORDER BY i.id DESC LIMIT ?"
        par.append(limite)
        out = []
        for r in conn.execute(sql, par):
            d = dict(r)
            try:
                d["righe"] = json.loads(d.pop("righe_json") or "[]")
            except (TypeError, ValueError):
                d["righe"] = []
            out.append(d)
        return out
    finally:
        conn.close()
