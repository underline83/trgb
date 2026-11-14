# Modulo: clienti — [core]
# -*- coding: utf-8 -*-
"""
Upsert clienti e prenotazioni provenienti da TheFork — un solo punto.

Lo usano:
- l'import XLSX di TheFork Manager (`clienti_router`: /clienti/import/thefork,
  /clienti/import/prenotazioni);
- l'integrazione webhook B2B API (`thefork_service`, modulo prenotazioni).

La logica di `upsert_cliente` è quella dell'import XLSX (2026-10-16 spostata qui
senza cambiarla): cliente protetto → aggiorna solo i campi TheFork-specifici,
riempie i vuoti e mette le differenze in `clienti_import_diff`; non protetto →
TheFork sovrascrive. Differenza unica, voluta: si toccano SOLO le chiavi
presenti nel `record`. L'XLSX passa sempre tutte le chiavi (comportamento
invariato); il webhook passa solo i campi che l'API dà davvero, così non azzera
ciò che l'API non espone (es. spending_behaviour numerico, yums, waiting list).

Dal 2026-11-14 le differenze su un cliente protetto passano da regole
(`valuta_differenza`): maiuscole e accenti non contano, nome/cognome/titolo
restano del CRM, lingua/telefono/email si correggono da sole nei casi sicuri,
un «ignora» di Marco viene ricordato. `riordina_coda` riapplica le regole
alla coda esistente.

Le connessioni le apre e le chiude il chiamante; il commit pure.
"""

from __future__ import annotations

import re
import sqlite3
import unicodedata
from typing import Any, Dict, Optional, Tuple

from app.utils.whatsapp import normalize_phone

_TEL_PLACEHOLDER = re.compile(r"^\+?3?9?0+$")

# Campi che su un cliente protetto si aggiornano sempre (dati di TheFork)
_SEMPRE_AGGIORNATI = ("rank", "risk_level", "spending_behaviour", "thefork_updated")

# Campi confrontabili su un cliente protetto: vuoto → riempi, diverso → diff
_CAMPI_DIFF = (
    "email", "telefono", "telefono2", "data_nascita",
    "indirizzo", "cap", "citta", "paese",
    "pref_cibo", "pref_bevande", "pref_posto",
    "restrizioni_dietetiche", "allergie", "note_thefork",
    "nome", "cognome", "titolo", "lingua",
)


def telefono_valido(tel: Optional[str]) -> bool:
    """False per i placeholder TheFork (+39 e soli zeri) e i numeri troppo corti."""
    if not tel:
        return False
    digits = re.sub(r"[^\d]", "", tel)
    return len(digits) >= 10 and not _TEL_PLACEHOLDER.match(tel.replace(" ", "").replace("-", ""))


def pulisci_telefono(tel: Optional[str]) -> Optional[str]:
    """Telefono dall'API TheFork → formato del CRM («+39…»). None se placeholder."""
    if not tel:
        return None
    grezzo = re.sub(r"[^\d+]", "", str(tel))
    if grezzo.startswith("00"):
        grezzo = "+" + grezzo[2:]
    if grezzo.startswith("+"):
        # Già internazionale (TheFork di solito manda E.164): si tiene com'è.
        # normalize_phone metterebbe «39» davanti anche a un numero danese.
        out = "+" + re.sub(r"\D", "", grezzo)
    else:
        norm = normalize_phone(grezzo)
        if not norm:
            return None
        out = "+" + norm
    return out if telefono_valido(out) else None


def trova_cliente_id(conn: sqlite3.Connection, thefork_id: Optional[str]) -> Optional[int]:
    """Cliente interno dal customer id TheFork, diretto o tramite alias (merge)."""
    if not thefork_id:
        return None
    row = conn.execute("SELECT id FROM clienti WHERE thefork_id = ?", (thefork_id,)).fetchone()
    if row:
        return row["id"]
    alias = conn.execute(
        "SELECT cliente_id FROM clienti_alias WHERE thefork_id = ?", (thefork_id,)
    ).fetchone()
    if alias:
        row = conn.execute("SELECT id FROM clienti WHERE id = ?", (alias["cliente_id"],)).fetchone()
        if row:
            return row["id"]
    return None


def collega_cliente_esistente(conn: sqlite3.Connection, record: Dict[str, Any]) -> Optional[int]:
    """
    Cliente TheFork nuovo per TRGB: se nel CRM c'è UN cliente inserito a mano
    (senza id TheFork) con lo stesso telefono o la stessa email, gli si assegna
    l'id TheFork e l'upsert successivo lo aggiorna invece di crearne un altro.
    Con più candidati non si collega niente (meglio un doppione che un'unione
    sbagliata). Ritorna l'id del cliente collegato, o None.
    """
    tf_id = record.get("thefork_id")
    if not tf_id or trova_cliente_id(conn, tf_id):
        return None

    email = (record.get("email") or "").strip().lower()
    telefoni = {normalize_phone(t) for t in (record.get("telefono"), record.get("telefono2")) if t}
    telefoni.discard(None)
    if not email and not telefoni:
        return None

    filtri, args = [], []
    if email:
        filtri.append("LOWER(TRIM(email)) = ?")
        args.append(email)
    for t in telefoni:
        coda = t[-9:]  # ultime 9 cifre: il numero senza prefisso, qualunque formato abbia nel CRM
        filtri.append("REPLACE(REPLACE(telefono,' ',''),'-','') LIKE ?")
        args.append(f"%{coda}")
        filtri.append("REPLACE(REPLACE(telefono2,' ',''),'-','') LIKE ?")
        args.append(f"%{coda}")
    righe = conn.execute(
        f"""SELECT id, email, telefono, telefono2 FROM clienti
            WHERE thefork_id IS NULL AND COALESCE(attivo, 1) = 1 AND ({' OR '.join(filtri)})""",
        args,
    ).fetchall()

    candidati = []
    for r in righe:
        tel_r = {normalize_phone(t) for t in (r["telefono"], r["telefono2"]) if t}
        if (email and (r["email"] or "").strip().lower() == email) or (telefoni & tel_r):
            candidati.append(r["id"])
    if len(candidati) != 1:
        return None
    conn.execute("UPDATE clienti SET thefork_id = ? WHERE id = ? AND thefork_id IS NULL", (tf_id, candidati[0]))
    return candidati[0]


# ── Regole delle differenze su un cliente protetto (2026-11-14) ──────────────
# Marco 13/11: «le cose descrittive sul nostro programma devono avere la
# priorità». Per ogni campo diverso tra CRM e TheFork si decide:
#   "applica" → prende il valore di TheFork, senza chiedere
#   "ignora"  → resta il CRM, niente in coda
#   "chiedi"  → va nella coda di revisione (Impostazioni e scheda cliente)
# Un «ignora» deciso da Marco viene ricordato: la stessa coppia non torna.

# Anagrafica descrittiva: su un cliente protetto vince sempre il CRM
_CAMPI_CRM_VINCE = ("nome", "cognome", "titolo")

# Alias di Apple («Nascondi la mia email»): non è un indirizzo da preferire
_EMAIL_ALIAS = re.compile(r"@privaterelay\.appleid\.com$", re.IGNORECASE)

# DEFAULT_FALLBACK: la lingua di partenza si legge dal default della colonna clienti.lingua
_LINGUA_FALLBACK = "it_IT"


def _testo_confronto(v: Any) -> str:
    """Testo per il confronto: senza maiuscole, accenti, spazi e punteggiatura."""
    s = unicodedata.normalize("NFKD", str(v or "")).encode("ascii", "ignore").decode().lower()
    return re.sub(r"[^a-z0-9@]", "", s)


def _uguali(a: Any, b: Any) -> bool:
    """«De Leidi» = «DELEIDI», «Saltini(?)» = «Saltini». Per i testi non latini
    (cirillico, cinese…) la normalizzazione li svuoterebbe: si confrontano interi."""
    na, nb = _testo_confronto(a), _testo_confronto(b)
    if na and nb:
        return na == nb
    return str(a or "").strip().lower() == str(b or "").strip().lower()


def _cifre(t: Any) -> str:
    return re.sub(r"\D", "", str(t or ""))


def _prefisso_locale() -> str:
    """Prefisso del paese del locale: quello che normalize_phone mette ai numeri nazionali."""
    return (normalize_phone("3" + "0" * 9) or "")[:-10]


def lingua_predefinita(conn: sqlite3.Connection) -> str:
    """La lingua che il CRM mette quando non ne sa niente (default di clienti.lingua)."""
    try:
        for r in conn.execute("PRAGMA table_info(clienti)"):
            if r[1] == "lingua" and r[4]:
                return str(r[4]).strip("'\"")
    except sqlite3.Error:
        pass
    return _LINGUA_FALLBACK


def valuta_differenza(campo: str, valore_crm: Any, valore_thefork: Any, lingua_default: str) -> str:
    """'applica' | 'ignora' | 'chiedi' per un campo di un cliente protetto."""
    crm = str(valore_crm or "").strip()
    tf = str(valore_thefork or "").strip()
    if not tf:
        return "ignora"
    if not crm:
        return "applica"  # vuoto nel CRM, pieno in TheFork → si riempie
    if _uguali(crm, tf):
        return "ignora"
    if campo in _CAMPI_CRM_VINCE:
        return "ignora"
    if campo == "lingua":
        # TheFork dà la lingua dell'app del cliente: vale solo se il CRM ha
        # ancora quella di partenza
        return "applica" if crm == lingua_default else "ignora"
    if campo in ("telefono", "telefono2"):
        if not telefono_valido(tf):
            return "ignora"
        c, t = _cifre(crm), _cifre(tf)
        if c == t:
            return "ignora"
        if len(c) >= 9 and c[-9:] == t[-9:]:
            # Stesso numero, cambia solo il prefisso. TheFork corregge solo il
            # refuso classico (prefisso a cifre invertite: «+93…» per «+39…»);
            # negli altri casi (prefisso aggiunto o tolto) resta il nostro.
            pref = _prefisso_locale()
            inv = pref[::-1]
            if pref and inv != pref and len(c) == len(t) and t.startswith(pref) and c.startswith(inv):
                return "applica"
            return "ignora"
        return "chiedi"
    if campo == "email":
        if _EMAIL_ALIAS.search(tf):
            return "ignora"
        if _EMAIL_ALIAS.search(crm):
            return "applica"  # noi abbiamo l'alias Apple, TheFork l'indirizzo vero
        return "chiedi"
    return "chiedi"


def _ignorata_prima(conn: sqlite3.Connection, cliente_id: int, campo: str, valore_thefork: Any) -> bool:
    row = conn.execute(
        "SELECT valore_thefork FROM clienti_import_diff WHERE cliente_id = ? AND campo = ? AND stato = 'ignora'",
        (cliente_id, campo),
    ).fetchone()
    return bool(row) and _uguali(row[0], valore_thefork)


def _togli_dalla_coda(conn: sqlite3.Connection, cliente_id: int, campo: str) -> None:
    conn.execute(
        "DELETE FROM clienti_import_diff WHERE cliente_id = ? AND campo = ? AND stato = 'pending'",
        (cliente_id, campo),
    )


def _metti_in_coda(conn: sqlite3.Connection, cliente_id: int, campo: str, crm: Any, tf: Any) -> None:
    _togli_dalla_coda(conn, cliente_id, campo)
    conn.execute(
        """INSERT INTO clienti_import_diff (cliente_id, campo, valore_crm, valore_thefork)
           VALUES (?, ?, ?, ?)""",
        (cliente_id, campo, str(crm or "").strip(), str(tf or "").strip()),
    )


def _chiudi(conn: sqlite3.Connection, riga: sqlite3.Row, stato: str) -> None:
    """Chiude una differenza. UNIQUE(cliente_id, campo, stato): una sola riga per
    stato e campo, quindi la decisione nuova sostituisce la vecchia."""
    conn.execute(
        "DELETE FROM clienti_import_diff WHERE cliente_id = ? AND campo = ? AND stato = ? AND id <> ?",
        (riga["cliente_id"], riga["campo"], stato, riga["id"]),
    )
    conn.execute(
        "UPDATE clienti_import_diff SET stato = ?, risolto_at = datetime('now','localtime') WHERE id = ?",
        (stato, riga["id"]),
    )


def risolvi_differenze(conn: sqlite3.Connection, ids, azione: str) -> Tuple[int, int]:
    """Applica o ignora differenze in coda (scelta di Marco). Ritorna (applicati, ignorati)."""
    applicati = ignorati = 0
    for diff_id in ids:
        riga = conn.execute(
            "SELECT * FROM clienti_import_diff WHERE id = ? AND stato = 'pending'", (diff_id,)
        ).fetchone()
        if not riga:
            continue
        if azione == "applica":
            if riga["campo"] not in _CAMPI_DIFF:  # anti-injection: solo campi noti
                continue
            conn.execute(
                f"UPDATE clienti SET {riga['campo']} = ? WHERE id = ?",
                (riga["valore_thefork"], riga["cliente_id"]),
            )
            applicati += 1
        else:
            ignorati += 1
        _chiudi(conn, riga, azione)
    return applicati, ignorati


def riordina_coda(conn: sqlite3.Connection, scrivi: bool = False) -> Dict[str, Any]:
    """
    Riapplica le regole alle differenze in coda, col valore che il CRM ha ADESSO.
    scrivi=False conta soltanto. Le chiuse dalle regole vanno in stato
    'auto_ignora' / 'auto_applica' (traccia, non tornano in coda).
    """
    ling = lingua_predefinita(conn)
    campi = ", ".join(_CAMPI_DIFF)
    clienti = {
        r["id"]: r for r in conn.execute(
            f"""SELECT id, {campi} FROM clienti WHERE id IN
                (SELECT cliente_id FROM clienti_import_diff WHERE stato = 'pending')"""
        )
    }
    righe = conn.execute("SELECT * FROM clienti_import_diff WHERE stato = 'pending' ORDER BY id").fetchall()
    conti = {"chiuse": 0, "applicate": 0, "restano": 0, "per_campo": {}}
    for riga in righe:
        campo = riga["campo"]
        per = conti["per_campo"].setdefault(campo, {"chiuse": 0, "applicate": 0, "restano": 0})
        cliente = clienti.get(riga["cliente_id"])
        if cliente is None or campo not in _CAMPI_DIFF:
            esito, attuale = "ignora", None
        else:
            attuale = cliente[campo]
            esito = valuta_differenza(campo, attuale, riga["valore_thefork"], ling)
            if esito == "chiedi" and _ignorata_prima(conn, riga["cliente_id"], campo, riga["valore_thefork"]):
                esito = "ignora"
        if esito == "applica":
            conti["applicate"] += 1
            per["applicate"] += 1
            if scrivi:
                conn.execute(f"UPDATE clienti SET {campo} = ? WHERE id = ?",
                             (riga["valore_thefork"], riga["cliente_id"]))
                _chiudi(conn, riga, "auto_applica")
        elif esito == "ignora":
            conti["chiuse"] += 1
            per["chiuse"] += 1
            if scrivi:
                _chiudi(conn, riga, "auto_ignora")
        else:
            conti["restano"] += 1
            per["restano"] += 1
            if scrivi and str(attuale or "").strip() != (riga["valore_crm"] or ""):
                conn.execute("UPDATE clienti_import_diff SET valore_crm = ? WHERE id = ?",
                             (str(attuale or "").strip(), riga["id"]))
    return conti


def upsert_cliente(conn: sqlite3.Connection, record: Dict[str, Any]) -> Tuple[str, int, int]:
    """
    Inserisce o aggiorna un cliente TheFork. `record` deve avere `thefork_id`.
    Ritorna (esito, cliente_id, differenze_salvate) con esito 'inserito' | 'aggiornato'.
    """
    tf_id = record.get("thefork_id")
    existing = None
    if tf_id:
        cid = trova_cliente_id(conn, tf_id)
        if cid:
            existing = conn.execute(
                "SELECT id, protetto FROM clienti WHERE id = ?", (cid,)
            ).fetchone()

    diff_trovati = 0
    if existing:
        if existing["protetto"]:
            always_update = {k: record[k] for k in _SEMPRE_AGGIORNATI if k in record}
            current = conn.execute(
                f"SELECT {', '.join(_CAMPI_DIFF)} FROM clienti WHERE id = ?",
                (existing["id"],),
            ).fetchone()
            ling = lingua_predefinita(conn)
            for field in _CAMPI_DIFF:
                if field not in record:
                    continue
                cur_val = current[field] if current else None
                new_val = record.get(field)
                if not str(new_val or "").strip():
                    continue
                # Regole (2026-11-14): maiuscole/accenti non contano, l'anagrafica
                # descrittiva resta del CRM, lingua/telefono/email con criterio.
                esito = valuta_differenza(field, cur_val, new_val, ling)
                if esito == "applica":
                    always_update[field] = new_val
                    _togli_dalla_coda(conn, existing["id"], field)
                elif esito == "ignora" or _ignorata_prima(conn, existing["id"], field, new_val):
                    _togli_dalla_coda(conn, existing["id"], field)
                else:
                    # Campo diverso davvero → coda di revisione di Marco
                    _metti_in_coda(conn, existing["id"], field, cur_val, new_val)
                    diff_trovati += 1

            if always_update:
                set_clause = ", ".join(f"{k}=?" for k in always_update)
                conn.execute(
                    f"UPDATE clienti SET {set_clause} WHERE id = ?",
                    list(always_update.values()) + [existing["id"]],
                )
        else:
            # Cliente non protetto: TheFork sovrascrive
            skip = {"thefork_id", "protetto"}
            campi = [k for k in record if k not in skip]
            if campi:
                set_clause = ", ".join(f"{k}=?" for k in campi)
                conn.execute(
                    f"UPDATE clienti SET {set_clause} WHERE id = ?",
                    [record[k] for k in campi] + [existing["id"]],
                )
        return "aggiornato", existing["id"], diff_trovati

    rec = dict(record)
    rec["nome"] = rec.get("nome") or ""
    rec["cognome"] = rec.get("cognome") or ""
    cols = ", ".join(rec.keys())
    placeholders = ", ".join("?" for _ in rec)
    cur = conn.execute(
        f"INSERT INTO clienti ({cols}) VALUES ({placeholders})",
        list(rec.values()),
    )
    return "inserito", cur.lastrowid, 0


def aggiorna_tag_vip(conn: sqlite3.Connection) -> None:
    """
    Auto-tag VIP (auto=1 → tag automatico, rimovibile dall'import successivo).
    Non tocca i tag manuali (auto=0) assegnati nel CRM.
    """
    conn.execute("""
        INSERT OR IGNORE INTO clienti_tag_assoc (cliente_id, tag_id, auto)
        SELECT c.id, t.id, 1
        FROM clienti c, clienti_tag t
        WHERE c.vip = 1 AND t.nome = 'VIP'
    """)
    # Rimuovi auto-tag VIP da chi non è più VIP in TheFork
    # (solo se il tag era automatico, non se aggiunto manualmente)
    conn.execute("""
        DELETE FROM clienti_tag_assoc
        WHERE auto = 1 AND tag_id = (SELECT id FROM clienti_tag WHERE nome = 'VIP')
        AND cliente_id NOT IN (SELECT id FROM clienti WHERE vip = 1)
    """)


def upsert_prenotazione(conn: sqlite3.Connection, record: Dict[str, Any]) -> Tuple[str, Optional[int]]:
    """
    Inserisce o aggiorna una prenotazione TheFork per `thefork_booking_id`.
    Aggiorna solo le chiavi presenti nel record. Ritorna (esito, id).
    """
    booking_id = record.get("thefork_booking_id")
    existing = None
    if booking_id:
        existing = conn.execute(
            "SELECT id FROM clienti_prenotazioni WHERE thefork_booking_id = ?",
            (booking_id,),
        ).fetchone()

    if existing:
        campi = [k for k in record if k != "thefork_booking_id"]
        set_clause = ", ".join(f"{k}=?" for k in campi)
        conn.execute(
            f"UPDATE clienti_prenotazioni SET {set_clause} WHERE thefork_booking_id = ?",
            [record[k] for k in campi] + [booking_id],
        )
        return "aggiornata", existing["id"]

    cols = ", ".join(record.keys())
    placeholders = ", ".join("?" for _ in record)
    cur = conn.execute(
        f"INSERT INTO clienti_prenotazioni ({cols}) VALUES ({placeholders})",
        list(record.values()),
    )
    return "inserita", cur.lastrowid
