# Modulo: cucina (sub-modulo pranzo)
"""
Migration 144 — Nuovi default testata menu pranzo (restyle PDF 2026-06-07).

Il PDF pranzo v3.0 adotta il sistema tipografico del MENU A5 stagionale
(Sabon + Courier Prime). La testata cambia: il titolo non è più
"OGGI A PRANZO: LA CUCINA DEL MERCATO" (contraddiceva il modello
settimanale) ma "PRANZO" con sottotitolo "la cucina del mercato";
il footer perde gli asterischi (non ci sono più richiami * nel layout).

Aggiorna `pranzo_settings` id=1 SOLO se i valori sono ancora identici ai
vecchi default (= mai personalizzati da Marco via Impostazioni Cucina).
Idempotente: al secondo run i valori non corrispondono più → no-op.
"""

import sqlite3

OLD_TITOLO = "OGGI A PRANZO: LA CUCINA DEL MERCATO"
NEW_TITOLO = "PRANZO"

OLD_SOTTOTITOLO = "Piatti in base agli acquisti del giorno, soggetti a disponibilità."
NEW_SOTTOTITOLO = "la cucina del mercato"

OLD_FOOTER = "*acqua, coperto e servizio inclusi\n**da Lunedì a Venerdì"
NEW_FOOTER = "acqua, coperto e servizio inclusi\nda lunedì a venerdì"


def upgrade(conn: sqlite3.Connection) -> None:
    cur = conn.cursor()
    exists = cur.execute(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='pranzo_settings'"
    ).fetchone()
    if not exists:
        return

    cur.execute(
        "UPDATE pranzo_settings SET titolo_default = ? WHERE id = 1 AND titolo_default = ?",
        (NEW_TITOLO, OLD_TITOLO),
    )
    cur.execute(
        "UPDATE pranzo_settings SET sottotitolo_default = ? WHERE id = 1 AND sottotitolo_default = ?",
        (NEW_SOTTOTITOLO, OLD_SOTTOTITOLO),
    )
    cur.execute(
        "UPDATE pranzo_settings SET footer_default = ? WHERE id = 1 AND footer_default = ?",
        (NEW_FOOTER, OLD_FOOTER),
    )
    conn.commit()
