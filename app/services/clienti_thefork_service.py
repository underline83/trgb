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

Le connessioni le apre e le chiude il chiamante; il commit pure.
"""

from __future__ import annotations

import re
import sqlite3
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
            for field in _CAMPI_DIFF:
                if field not in record:
                    continue
                cur_val = current[field] if current else None
                new_val = record.get(field)
                cur_str = str(cur_val).strip() if cur_val else ""
                new_str = str(new_val).strip() if new_val else ""

                if not cur_str and new_str:
                    # Campo vuoto nel DB, pieno in TheFork → riempi
                    always_update[field] = new_val
                elif cur_str and new_str and cur_str.lower() != new_str.lower():
                    # Confronto case-insensitive: "Li Puma" vs "LI PUMA" NON è
                    # una differenza (il CRM normalizza i testi per scelta,
                    # TheFork esporta tutto in maiuscolo).
                    # Campo diverso → salva diff per revisione Marco
                    conn.execute(
                        "DELETE FROM clienti_import_diff WHERE cliente_id = ? AND campo = ? AND stato = 'pending'",
                        (existing["id"], field),
                    )
                    conn.execute(
                        """INSERT INTO clienti_import_diff
                           (cliente_id, campo, valore_crm, valore_thefork)
                           VALUES (?, ?, ?, ?)""",
                        (existing["id"], field, cur_str, new_str),
                    )
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
