# Modulo: vini (multi-fornitore) — [core]
"""
Vini multi-fornitore VMF.3 — fatture → vini (2026-11-03).
Spec: docs/spec_vini_multifornitore.md §1 D4, D7 · mig 226.

Regole di Marco (02-03/11/2026):
- la fattura è il prezzo vero (NETTO) e DECIDE IL FORNITORE da chi la emette:
  P.IVA di un distributore → quel distributore (es. 0,75 «dal loro magazzino»);
  P.IVA di una cantina → «Diretto», anche se l'ordine è passato da un agente;
- confrontata col prezzo registrato al carico (o all'ordine, o lo storico):
  entro ±`vmf_soglia_fattura_pct`% vince la fattura da sola, oltre va in
  «da verificare» e decide Marco;
- si leggono le fatture da `vmf_fatture_dal` (2026-01-01).

Le righe di fattura arrivano dal servizio platform `fatture_righe_service`
(sola lettura): questo modulo non legge le tabelle di acquisti da sé.
"""

from __future__ import annotations

import re
import sqlite3
from datetime import date, timedelta
from typing import Any, Dict, List, Optional, Tuple

from app.models.vini_magazzino_db import get_magazzino_connection
from app.models import vini_anagrafiche_db as ana
from app.services import fatture_righe_service as fe
from app.services import vini_fornitori_service as vmf
from app.services.vini_widget_settings_service import get_widget_setting

NOME_DIRETTO = "Diretto"

# righe di servizio che non sono bottiglie
_RUMORE = re.compile(
    r"\b(ACCIS[EA]|CONTRASSEGN|D\.?D\.?T\.?|CONAI|TRASPORT|SPEDIZION|SPESE|IMBALL|"
    r"CAUZION|VUOTO|BANCALE|PALLET|ARROTONDAMENT|SCONTO|ABBUONO|CORRISPETTIVO|"
    r"CONTRIBUTO|BOLLO)\b", re.I)
_PAROLE_VUOTE = {
    "BOTTIGLIA", "BOTT", "BT", "ML", "CL", "LT", "L", "PZ", "NR", "DOC", "DOCG", "DOP", "IGT", "IGP",
    "D", "O", "C", "G", "T", "I", "P", "AZ", "AGR", "AZIENDA", "AGRICOLA", "SOC", "SRL", "SAS", "SPA", "SS",
    "DI", "DEL", "DELLA", "DE", "LA", "IL", "LE", "LO", "E", "THE", "750", "075", "0", "75", "150", "1500",
    "VINO", "ROSSO", "BIANCO", "CANTINA", "TENUTA", "CASTELLO",
}


def _conn() -> sqlite3.Connection:
    c = get_magazzino_connection()
    c.row_factory = sqlite3.Row
    return c


def _dal() -> str:
    d = str(get_widget_setting("vmf_fatture_dal", default="2026-01-01") or "2026-01-01")[:10]
    try:
        date.fromisoformat(d)
        return d
    except ValueError:
        return "2026-01-01"


def _soglia() -> float:
    try:
        return float(get_widget_setting("vmf_soglia_fattura_pct", default=2))
    except (TypeError, ValueError):
        return 2.0


def chiave(descrizione: str) -> str:
    """Descrizione normalizzata: la «memoria» di un abbinamento."""
    s = (descrizione or "").upper()
    s = re.sub(r"[^A-Z0-9À-Ü]+", " ", s)
    return re.sub(r"\s+", " ", s).strip()


def _token(testo: str) -> set:
    return {t for t in chiave(testo).split() if len(t) >= 3 and not t.isdigit() and t not in _PAROLE_VUOTE}


def annata(descrizione: str) -> Optional[str]:
    """Annata letta dalla descrizione: 4 cifre (2018) o, se manca, 2 cifre isolate
    (KINTARI 25, BARBARICCIA 18) che non siano un formato (0,75 / CL 75 / LT 1,5)."""
    d = (descrizione or "").upper()
    m = re.findall(r"\b(19[5-9]\d|20[0-4]\d)\b", d)
    if m:
        return m[-1]
    pulita = re.sub(r"\d+[,.]\d+", " ", d)                       # 0,75 · 1,5
    pulita = re.sub(r"\b(CL|ML|LT|L)\s*\.?\s*\d+\b", " ", pulita)  # CL.75 · LT 3
    pulita = re.sub(r"\b\d+\s*(CL|ML|LT|L|X)\b", " ", pulita)
    m2 = [x for x in re.findall(r"\b(\d{2})\b", pulita) if x not in ("75", "50", "37", "15", "70")]
    for x in reversed(m2):
        n = int(x)
        if n <= 35:
            return f"20{x}"
        if n >= 85:
            return f"19{x}"
    return None


def formato(descrizione: str) -> str:
    """Formato letto dalla descrizione: MG (magnum 1,5), JB (3 L), MZ (0,375), BT."""
    d = (descrizione or "").upper()
    if re.search(r"\bMAGNUM\b|\bMG\b|\b1[,.]5\b|\bCL\.?\s*150\b|\b150\s*CL\b", d):
        return "MG"
    if re.search(r"\bJEROBOAM\b|\b3\s*(LT|L)\b|\bLT\.?\s*3\b", d):
        return "JB"
    if re.search(r"0[,.]375|\b37[,.]5\b|\bCL\.?\s*37", d):
        return "MZ"
    return "BT"


_CARTONE = {"CT", "CAR", "CF", "CS", "CA", "CRT"}


def pezzi_per_unita(r: Dict[str, Any]) -> Tuple[int, bool]:
    """Bottiglie per unità di fattura e se il numero è PRESUNTO.
    «0,75X6» / «X 6» nella descrizione → 6. Unità cartone (CT, CAR…) senza
    numero → 6 presunto (va verificato). Altrimenti 1."""
    d = (r.get("descrizione") or "").upper()
    m = re.search(r"X\s*(\d{1,2})\b", d)
    um = (r.get("unita_misura") or "").upper().strip()
    if um in {"BOT", "BT", "PZ", "NR", "N", "FL", "STK", "BOTT", "PEZZI"}:
        return 1, False  # l'unità è la bottiglia: «0,75 X 6» è solo come arriva imballata
    if m and int(m.group(1)) in (2, 3, 4, 6, 12, 24) and (um in _CARTONE or re.search(r"\d[,.]\d+\s*X\s*\d", d)):
        return int(m.group(1)), False
    if um in _CARTONE:
        return 6, True
    return 1, False


def _prezzo_netto(r: Dict[str, Any]) -> Optional[float]:
    """Prezzo NETTO a bottiglia: totale riga ÷ (quantità × bottiglie per unità)."""
    q = r.get("quantita") or 0
    tot = r.get("prezzo_totale")
    n, _ = pezzi_per_unita(r)
    try:
        if q and tot:
            return round(float(tot) / (float(q) * n), 4)
        if r.get("prezzo_unitario"):
            return round(float(r["prezzo_unitario"]) / n, 4)
    except (TypeError, ValueError, ZeroDivisionError):
        return None
    return None


def _e_bottiglia(r: Dict[str, Any]) -> bool:
    p = _prezzo_netto(r)
    if not p or p <= 0 or not (r.get("quantita") or 0) > 0:
        return False
    return not _RUMORE.search(r.get("descrizione") or "")


def _righe_vino() -> List[Dict[str, Any]]:
    """Righe di fattura classificate BEVANDE › VINO (categorie del Controllo
    Gestione) dalla data `vmf_fatture_dal`."""
    sub = fe.sottocategoria_id_per_nome("BEVANDE", "VINO")
    if sub is None:
        return []
    return fe.righe(_dal(), sottocategoria_id=sub)


# ─────────────────────────────────────────────
# EMITTENTI
# ─────────────────────────────────────────────

def _diretto_id(cur: sqlite3.Cursor) -> int:
    r = cur.execute("SELECT id FROM vini_fornitori WHERE UPPER(TRIM(nome)) = UPPER(?)", (NOME_DIRETTO,)).fetchone()
    if r:
        return int(r["id"])
    return int(ana.create_fornitore({"nome": NOME_DIRETTO}))


def emittenti() -> Dict[str, Dict[str, Any]]:
    conn = _conn()
    try:
        return {r["piva"]: dict(r) for r in conn.execute(
            "SELECT e.*, f.nome AS fornitore_nome FROM vini_fe_emittenti e "
            "LEFT JOIN vini_fornitori f ON f.id = e.fornitore_id").fetchall()}
    finally:
        conn.close()


def classifica_emittente(piva: str, tipo: str, fornitore_id: Optional[int] = None,
                         nome: Optional[str] = None, utente: Optional[str] = None) -> Dict[str, Any]:
    if tipo not in ("distributore", "cantina", "non_vini"):
        raise ValueError(f"tipo non valido: {tipo}")
    if tipo == "distributore" and not fornitore_id:
        raise ValueError("Per un distributore serve il fornitore dell'anagrafica vini")
    conn = _conn()
    try:
        cur = conn.cursor()
        if fornitore_id and not cur.execute("SELECT 1 FROM vini_fornitori WHERE id = ?", (fornitore_id,)).fetchone():
            raise ValueError(f"Fornitore id={fornitore_id} non trovato")
        cur.execute(
            "INSERT INTO vini_fe_emittenti (piva, nome, tipo, fornitore_id, utente, updated_at) "
            "VALUES (?, ?, ?, ?, ?, datetime('now','localtime')) "
            "ON CONFLICT(piva) DO UPDATE SET nome = COALESCE(excluded.nome, nome), tipo = excluded.tipo, "
            "fornitore_id = excluded.fornitore_id, utente = excluded.utente, updated_at = excluded.updated_at",
            (piva, nome, tipo, fornitore_id if tipo == "distributore" else None, utente),
        )
        conn.commit()
    finally:
        conn.close()
    esito = aggiorna(utente=utente)
    return {"piva": piva, "tipo": tipo, "aggiornamento": esito}


# ─────────────────────────────────────────────
# LETTURA FATTURE + ABBINAMENTI AUTOMATICI DA MEMORIA
# ─────────────────────────────────────────────

def aggiorna(utente: Optional[str] = None) -> Dict[str, Any]:
    """Legge le righe vino dalle fatture (da `vmf_fatture_dal`), registra quelle
    nuove come «da abbinare» e applica gli abbinamenti già imparati."""
    righe = _righe_vino()
    em = emittenti()
    conn = _conn()
    nuove = 0
    try:
        cur = conn.cursor()
        noti = {r[0] for r in cur.execute("SELECT fe_riga_id FROM vini_fe_righe").fetchall()}
        for r in righe:
            if r["fe_riga_id"] in noti or not _e_bottiglia(r):
                continue
            e = em.get(r["fornitore_piva"])
            if e and e["tipo"] == "non_vini":
                continue
            cur.execute("INSERT INTO vini_fe_righe (fe_riga_id, fattura_id, piva, stato) VALUES (?, ?, ?, 'da_abbinare')",
                        (r["fe_riga_id"], r["fattura_id"], r["fornitore_piva"]))
            nuove += 1
        conn.commit()
        # righe di emittenti diventati «non vini»: fuori
        cur.execute("UPDATE vini_fe_righe SET stato = 'ignorata' WHERE stato = 'da_abbinare' AND piva IN "
                    "(SELECT piva FROM vini_fe_emittenti WHERE tipo = 'non_vini')")
        conn.commit()
        da_mappa = cur.execute(
            "SELECT r.fe_riga_id, r.piva FROM vini_fe_righe r "
            "JOIN vini_fe_emittenti e ON e.piva = r.piva AND e.tipo IN ('distributore','cantina') "
            "WHERE r.stato = 'da_abbinare'").fetchall()
    finally:
        conn.close()

    auto = 0
    for x in da_mappa:
        riga = fe.riga(x["fe_riga_id"])
        if not riga:
            continue
        conn = _conn()
        try:
            m = conn.execute("SELECT bottiglia_id, ignora FROM vini_fe_mappa WHERE piva = ? AND chiave = ?",
                             (x["piva"], chiave(riga["descrizione"]))).fetchone()
        finally:
            conn.close()
        if not m:
            continue
        try:
            if m["ignora"]:
                ignora(x["fe_riga_id"], utente=utente, ricorda=False)
            elif m["bottiglia_id"]:
                abbina(x["fe_riga_id"], int(m["bottiglia_id"]), utente=utente, ricorda=False)
            auto += 1
        except ValueError:
            pass
    return {"righe_nuove": nuove, "abbinate_da_memoria": auto}


# ─────────────────────────────────────────────
# SUGGERIMENTI
# ─────────────────────────────────────────────

_cache_bottiglie: Dict[str, Any] = {"t": None, "righe": []}


def _bottiglie(cur: sqlite3.Cursor) -> List[Dict[str, Any]]:
    righe = []
    for b in cur.execute(
        "SELECT b.id, b.madre_id, b.PRODUTTORE, b.DESCRIZIONE, b.DENOMINAZIONE, b.ANNATA, b.FORMATO, "
        "COALESCE(b.QTA_TOTALE,0) AS qta, b.EURO_LISTINO, b.SCONTO FROM vini_bottiglie b"
    ).fetchall():
        d = dict(b)
        d["_tok"] = _token(f"{d['PRODUTTORE'] or ''} {d['DESCRIZIONE'] or ''} {d['DENOMINAZIONE'] or ''}")
        d["_prod"] = _token(d["PRODUTTORE"] or "")
        righe.append(d)
    return righe


def cerca_vini(q: str, limite: int = 200) -> List[Dict[str, Any]]:
    """Ricerca a mano per l'abbinamento (vini 4.8): come l'autocomplete delle
    Vendite (LIKE su produttore/descrizione/denominazione), ma ogni parola deve
    comparire e include anche le annate a 0 bt. Ordine: produttore, vino, annata."""
    parole = [w for w in re.split(r"\s+", (q or "").strip()) if w]
    if not parole:
        return []
    campo = ("(COALESCE(PRODUTTORE,'') || ' ' || COALESCE(DESCRIZIONE,'') || ' ' || "
             "COALESCE(DENOMINAZIONE,'') || ' ' || COALESCE(CAST(ANNATA AS TEXT),''))")
    where = " AND ".join([f"{campo} LIKE ?"] * len(parole))
    args: List[Any] = [f"%{w}%" for w in parole]
    if len(parole) == 1 and parole[0].isdigit():
        where = f"({where} OR CAST(id AS TEXT) = ?)"
        args.append(parole[0])
    conn = _conn()
    try:
        rows = conn.execute(
            f"SELECT id, madre_id, PRODUTTORE, DESCRIZIONE, ANNATA, FORMATO, COALESCE(QTA_TOTALE,0) AS qta "
            f"FROM vini_bottiglie WHERE {where} "
            f"ORDER BY PRODUTTORE COLLATE NOCASE, DESCRIZIONE COLLATE NOCASE, ANNATA DESC LIMIT ?",
            (*args, limite),
        ).fetchall()
    finally:
        conn.close()
    return [{"bottiglia_id": r["id"], "madre_id": r["madre_id"], "produttore": r["PRODUTTORE"],
             "descrizione": r["DESCRIZIONE"], "annata": r["ANNATA"], "formato": r["FORMATO"],
             "qta": r["qta"]} for r in rows]


def suggerisci(descrizione: str, piva: Optional[str] = None, limite: int = 5,
               _bott: Optional[List[Dict[str, Any]]] = None) -> List[Dict[str, Any]]:
    tok = _token(descrizione)
    ann = annata(descrizione)
    fmt = formato(descrizione)
    if not tok:
        return []
    if _bott is None:
        conn = _conn()
        try:
            _bott = _bottiglie(conn.cursor())
        finally:
            conn.close()
    out = []
    for b in _bott:
        comuni = tok & b["_tok"]
        if not comuni:
            continue
        punteggio = len(comuni) / max(len(tok), 1) * 70 + len(comuni) / max(len(b["_tok"]), 1) * 20
        if b["_prod"] and b["_prod"] & tok:
            punteggio += 10
        ba = (b["ANNATA"] or "").strip()
        if ann and ba:
            punteggio += 15 if ba == ann else -25
        elif ann and not ba:
            punteggio -= 5
        bf = (b["FORMATO"] or "").strip().upper()
        if bf:
            punteggio += 8 if bf == fmt else -20
        if b["qta"]:
            punteggio += 2
        out.append({"bottiglia_id": b["id"], "madre_id": b["madre_id"], "produttore": b["PRODUTTORE"],
                    "descrizione": b["DESCRIZIONE"], "annata": b["ANNATA"], "formato": b["FORMATO"],
                    "qta": b["qta"], "punteggio": round(punteggio)})
    out.sort(key=lambda x: -x["punteggio"])
    return out[:limite]


# ─────────────────────────────────────────────
# ABBINARE / IGNORARE / RISOLVERE
# ─────────────────────────────────────────────

def _candidato_confronto(cur: sqlite3.Cursor, bottiglia_id: int, data_f: str) -> Optional[sqlite3.Row]:
    """Il prezzo registrato a mano (carico, ordine, storico) da confrontare con la
    fattura: non già confrontato con un'altra fattura, il più vicino nel tempo."""
    d = date.fromisoformat(data_f[:10])
    da, a = (d - timedelta(days=120)).isoformat(), (d + timedelta(days=45)).isoformat()
    return cur.execute(
        """
        SELECT p.* FROM vini_prezzi_fornitore p
         WHERE p.bottiglia_id = ? AND p.tipo = 'pagato' AND p.stato = 'ok' AND p.fonte <> 'fattura'
           AND (p.fonte = 'storico' OR p.data BETWEEN ? AND ?)
           AND p.id NOT IN (SELECT confronto_id FROM vini_prezzi_fornitore
                             WHERE confronto_id IS NOT NULL AND stato <> 'scartato')
         ORDER BY ABS(julianday(p.data) - julianday(?)), p.id DESC LIMIT 1
        """,
        (bottiglia_id, da, a, data_f[:10]),
    ).fetchone()


def abbina(fe_riga_id: int, bottiglia_id: int, utente: Optional[str] = None, ricorda: bool = True) -> Dict[str, Any]:
    riga = fe.riga(fe_riga_id)
    if not riga:
        raise ValueError(f"Riga di fattura id={fe_riga_id} non trovata")
    prezzo = _prezzo_netto(riga)
    if not prezzo or prezzo <= 0:
        raise ValueError("La riga non ha un prezzo: non è una bottiglia")
    piva = riga["fornitore_piva"]
    conn = _conn()
    try:
        cur = conn.cursor()
        e = cur.execute("SELECT * FROM vini_fe_emittenti WHERE piva = ?", (piva,)).fetchone()
        if not e or e["tipo"] == "non_vini":
            raise ValueError(f"Prima dimmi chi è {riga['fornitore_nome']}: distributore o cantina")
        if not cur.execute("SELECT 1 FROM vini_bottiglie WHERE id = ?", (bottiglia_id,)).fetchone():
            raise ValueError(f"Vino id={bottiglia_id} non trovato")
        fornitore_id = int(e["fornitore_id"]) if e["tipo"] == "distributore" else _diretto_id(cur)
        vecchia = cur.execute("SELECT prezzo_id FROM vini_fe_righe WHERE fe_riga_id = ? AND stato = 'abbinata'",
                              (fe_riga_id,)).fetchone()
        cand = _candidato_confronto(cur, bottiglia_id, riga["data_fattura"])
    finally:
        conn.close()

    if vecchia and vecchia["prezzo_id"]:
        vmf.scarta_prezzo(int(vecchia["prezzo_id"]), utente=utente)  # ri-abbinamento

    stato, esito_confronto = "ok", None
    n_pezzi, presunto = pezzi_per_unita(riga)
    if presunto:
        # Cartone senza numero di bottiglie (es. Balan «CT»): a volte è davvero un
        # cartone da 6, a volte è UNA bottiglia fatturata come «CT» (caso reale:
        # Le Cerrate 2023, fattura Balan 833/1, 11,39 € → con 6 veniva 1,90 €).
        # Se c'è un prezzo registrato si sceglie la lettura più vicina; senza, si
        # tiene 6 ma va verificato.
        try:
            q = float(riga.get("quantita") or 1)
            tot = float(riga.get("prezzo_totale") or (riga.get("prezzo_unitario") or 0) * q)
            p1 = round(tot / q, 4)
        except (TypeError, ValueError, ZeroDivisionError):
            p1 = None
        if cand and p1 and cand["prezzo"]:
            rif = float(cand["prezzo"])
            if abs(p1 - rif) < abs(prezzo - rif):
                prezzo, n_pezzi = p1, 1
        if n_pezzi > 1:
            stato = "da_verificare"
    if cand:
        diff = (prezzo - float(cand["prezzo"])) / float(cand["prezzo"]) * 100 if cand["prezzo"] else 100.0
        esito_confronto = {"id": cand["id"], "prezzo": cand["prezzo"], "fonte": cand["fonte"],
                           "data": cand["data"], "diff_pct": round(diff, 2)}
        if abs(diff) > _soglia():
            stato = "da_verificare"
    nota = f"fattura {riga['numero_fattura']} del {riga['data_fattura']} · {riga['fornitore_nome']}"
    if n_pezzi > 1:
        nota += f" · cartone da {n_pezzi}{' (presunto)' if presunto else ''}"
    elif presunto:
        nota += " · «CT» letto come 1 bottiglia (più vicino al prezzo registrato)"
    r = vmf.registra_prezzo(bottiglia_id, fornitore_id, prezzo, tipo="pagato", data=riga["data_fattura"],
                            fonte="fattura", fe_riga_id=fe_riga_id, stato=stato, note=nota, utente=utente)
    conn = _conn()
    try:
        cur = conn.cursor()
        if cand:
            cur.execute("UPDATE vini_prezzi_fornitore SET confronto_id = ? WHERE id = ?", (cand["id"], r["id"]))
        cur.execute(
            "INSERT INTO vini_fe_righe (fe_riga_id, fattura_id, piva, stato, bottiglia_id, prezzo_id, utente, updated_at) "
            "VALUES (?, ?, ?, 'abbinata', ?, ?, ?, datetime('now','localtime')) "
            "ON CONFLICT(fe_riga_id) DO UPDATE SET stato='abbinata', bottiglia_id=excluded.bottiglia_id, "
            "prezzo_id=excluded.prezzo_id, utente=excluded.utente, updated_at=excluded.updated_at",
            (fe_riga_id, riga["fattura_id"], piva, bottiglia_id, r["id"], utente),
        )
        if ricorda:
            cur.execute("INSERT INTO vini_fe_mappa (piva, chiave, bottiglia_id, ignora) VALUES (?, ?, ?, 0) "
                        "ON CONFLICT(piva, chiave) DO UPDATE SET bottiglia_id = excluded.bottiglia_id, ignora = 0",
                        (piva, chiave(riga["descrizione"]), bottiglia_id))
        conn.commit()
    finally:
        conn.close()
    # entro soglia: la fattura sostituisce il prezzo del carico (anche il fornitore)
    if cand and stato == "ok":
        vmf.scarta_prezzo(int(cand["id"]), utente=utente)
    costo = vmf.riallinea_costo(bottiglia_id, utente=utente)
    return {"prezzo_id": r["id"], "stato": stato, "prezzo": prezzo, "confronto": esito_confronto, "costo": costo}


def applica_a_uguali(fe_riga_id: int, utente: Optional[str] = None) -> int:
    """Dopo un abbinamento (o un «non è in cantina») fatto a mano: le altre righe
    ancora da abbinare con la stessa P.IVA e la stessa descrizione seguono subito
    la stessa scelta (prima succedeva solo al ricaricamento della pagina, e la
    riga sembrava non sparire: ne compariva subito una identica)."""
    riga = fe.riga(fe_riga_id)
    if not riga:
        return 0
    k = chiave(riga["descrizione"])
    conn = _conn()
    try:
        m = conn.execute("SELECT bottiglia_id, ignora FROM vini_fe_mappa WHERE piva = ? AND chiave = ?",
                         (riga["fornitore_piva"], k)).fetchone()
        altre = [r[0] for r in conn.execute(
            "SELECT fe_riga_id FROM vini_fe_righe WHERE stato = 'da_abbinare' AND piva = ? AND fe_riga_id <> ?",
            (riga["fornitore_piva"], fe_riga_id)).fetchall()]
    finally:
        conn.close()
    if not m:
        return 0
    fatte = 0
    for rid in altre:
        r = fe.riga(rid)
        if not r or chiave(r["descrizione"]) != k:
            continue
        try:
            if m["ignora"]:
                ignora(rid, utente=utente, ricorda=False)
            elif m["bottiglia_id"]:
                abbina(rid, int(m["bottiglia_id"]), utente=utente, ricorda=False)
            fatte += 1
        except ValueError:
            pass
    return fatte


def ignora(fe_riga_id: int, utente: Optional[str] = None, ricorda: bool = True) -> None:
    riga = fe.riga(fe_riga_id)
    if not riga:
        raise ValueError(f"Riga di fattura id={fe_riga_id} non trovata")
    conn = _conn()
    try:
        cur = conn.cursor()
        cur.execute(
            "INSERT INTO vini_fe_righe (fe_riga_id, fattura_id, piva, stato, utente, updated_at) "
            "VALUES (?, ?, ?, 'ignorata', ?, datetime('now','localtime')) "
            "ON CONFLICT(fe_riga_id) DO UPDATE SET stato='ignorata', utente=excluded.utente, updated_at=excluded.updated_at",
            (fe_riga_id, riga["fattura_id"], riga["fornitore_piva"], utente),
        )
        if ricorda:
            cur.execute("INSERT INTO vini_fe_mappa (piva, chiave, bottiglia_id, ignora) VALUES (?, ?, NULL, 1) "
                        "ON CONFLICT(piva, chiave) DO UPDATE SET bottiglia_id = NULL, ignora = 1",
                        (riga["fornitore_piva"], chiave(riga["descrizione"])))
        conn.commit()
    finally:
        conn.close()


def risolvi(prezzo_id: int, vale: str, utente: Optional[str] = None) -> Dict[str, Any]:
    """Fattura «da verificare»: vale la fattura (il carico si scarta) o vale il
    prezzo registrato prima (la fattura si scarta)."""
    if vale not in ("fattura", "carico"):
        raise ValueError("vale: fattura | carico")
    conn = _conn()
    try:
        cur = conn.cursor()
        p = cur.execute("SELECT * FROM vini_prezzi_fornitore WHERE id = ? AND fonte = 'fattura'", (prezzo_id,)).fetchone()
        if not p:
            raise ValueError(f"Prezzo da fattura id={prezzo_id} non trovato")
        if vale == "fattura":
            cur.execute("UPDATE vini_prezzi_fornitore SET stato = 'ok' WHERE id = ?", (prezzo_id,))
            conn.commit()
            conf = p["confronto_id"]
            bid = p["bottiglia_id"]
        else:
            conf, bid = None, p["bottiglia_id"]
    finally:
        conn.close()
    if vale == "fattura":
        if conf:
            vmf.scarta_prezzo(int(conf), utente=utente)
        return {"id": prezzo_id, "costo": vmf.riallinea_costo(bid, utente=utente)}
    return vmf.scarta_prezzo(prezzo_id, utente=utente)


def conferma_sicuri(soglia_punteggio: int = 85, utente: Optional[str] = None) -> Dict[str, Any]:
    """Abbina in blocco le righe il cui primo suggerimento è netto: punteggio alto,
    annata uguale, e staccato dal secondo."""
    st = stato(limite=10000)
    fatte, saltate = 0, 0
    for r in st["da_abbinare"]:
        s = r["suggerimenti"]
        if not s or r["emittente"] is None:
            saltate += 1
            continue
        primo = s[0]
        secondo = s[1]["punteggio"] if len(s) > 1 else 0
        if primo["punteggio"] >= soglia_punteggio and primo["punteggio"] - secondo >= 15 \
                and (not r["annata"] or (primo["annata"] or "") == r["annata"]):
            try:
                abbina(r["fe_riga_id"], primo["bottiglia_id"], utente=utente)
                fatte += 1
            except ValueError:
                saltate += 1
        else:
            saltate += 1
    return {"abbinate": fatte, "restano": saltate}


# ─────────────────────────────────────────────
# PAGINA
# ─────────────────────────────────────────────

def stato(limite: int = 200) -> Dict[str, Any]:
    em = emittenti()
    conn = _conn()
    try:
        cur = conn.cursor()
        bott = _bottiglie(cur)
        conteggi = {r["stato"]: r["n"] for r in cur.execute(
            "SELECT stato, COUNT(*) AS n FROM vini_fe_righe GROUP BY stato").fetchall()}
        da = cur.execute("SELECT fe_riga_id, piva FROM vini_fe_righe WHERE stato = 'da_abbinare' "
                         "ORDER BY fattura_id DESC, fe_riga_id LIMIT ?", (limite,)).fetchall()
        verif = [dict(r) for r in cur.execute(
            """
            SELECT p.id, p.bottiglia_id, p.prezzo, p.data, p.note, p.confronto_id, p.fe_riga_id,
                   f.nome AS fornitore_nome, b.PRODUTTORE AS produttore, b.DESCRIZIONE AS descrizione,
                   b.ANNATA AS annata, c.prezzo AS confronto_prezzo, c.fonte AS confronto_fonte,
                   c.data AS confronto_data, cf.nome AS confronto_fornitore
              FROM vini_prezzi_fornitore p
              JOIN vini_bottiglie b ON b.id = p.bottiglia_id
              LEFT JOIN vini_fornitori f ON f.id = p.fornitore_id
              LEFT JOIN vini_prezzi_fornitore c ON c.id = p.confronto_id
              LEFT JOIN vini_fornitori cf ON cf.id = c.fornitore_id
             WHERE p.fonte = 'fattura' AND p.stato = 'da_verificare'
             ORDER BY p.data DESC
            """).fetchall()]
        recenti = [dict(r) for r in cur.execute(
            """
            SELECT r.fe_riga_id, r.bottiglia_id, r.updated_at, b.PRODUTTORE AS produttore,
                   b.DESCRIZIONE AS descrizione, b.ANNATA AS annata, p.prezzo, p.data, p.stato,
                   f.nome AS fornitore_nome
              FROM vini_fe_righe r
              JOIN vini_bottiglie b ON b.id = r.bottiglia_id
              LEFT JOIN vini_prezzi_fornitore p ON p.id = r.prezzo_id
              LEFT JOIN vini_fornitori f ON f.id = p.fornitore_id
             WHERE r.stato = 'abbinata' ORDER BY r.updated_at DESC LIMIT 40
            """).fetchall()]
        piva_da = [r[0] for r in cur.execute(
            "SELECT DISTINCT piva FROM vini_fe_righe WHERE stato = 'da_abbinare'").fetchall()]
    finally:
        conn.close()

    righe = []
    for x in da:
        r = fe.riga(x["fe_riga_id"])
        if not r:
            continue
        e = em.get(x["piva"])
        righe.append({
            "fe_riga_id": r["fe_riga_id"], "descrizione": r["descrizione"], "codice": r["codice_articolo"],
            "quantita": r["quantita"], "prezzo": _prezzo_netto(r), "data": r["data_fattura"],
            "numero_fattura": r["numero_fattura"], "fornitore_fattura": r["fornitore_nome"], "piva": r["fornitore_piva"],
            "annata": annata(r["descrizione"]), "formato": formato(r["descrizione"]),
            "pezzi": pezzi_per_unita(r)[0], "pezzi_presunti": pezzi_per_unita(r)[1],
            "emittente": ({"tipo": e["tipo"], "fornitore": e.get("fornitore_nome") or NOME_DIRETTO} if e else None),
            "suggerimenti": suggerisci(r["descrizione"], r["fornitore_piva"], _bott=bott),
        })

    # emittenti senza classificazione (con righe da abbinare)
    da_classificare = []
    if piva_da:
        per_piva: Dict[str, Dict[str, Any]] = {}
        for r in _righe_vino():
            p = r["fornitore_piva"]
            if p in piva_da and p not in em:
                d = per_piva.setdefault(p, {"piva": p, "nome": r["fornitore_nome"], "righe": 0, "esempi": []})
                d["righe"] += 1
                if len(d["esempi"]) < 3 and r["descrizione"] not in d["esempi"] and _e_bottiglia(r):
                    d["esempi"].append(r["descrizione"])
        da_classificare = sorted(per_piva.values(), key=lambda d: -d["righe"])

    return {
        "dal": _dal(), "soglia_pct": _soglia(), "conteggi": conteggi,
        "emittenti": sorted(em.values(), key=lambda e: (e["tipo"], e.get("nome") or "")),
        "da_classificare": da_classificare,
        "da_abbinare": righe, "da_verificare": verif, "recenti": recenti,
    }
