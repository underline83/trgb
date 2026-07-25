"""
Migrazione 156 — Seed 2 rum in carta distillati (2026-07-25)

Contesto: Marco aggiunge due rum alla sezione Distillati della Carta Bevande.
Prezzi bottiglia (prezzo consigliato al pubblico, ricerca 2026-07-25):
  - Planteray XO 20th Anniversary (Barbados, 40%) ~ 46 EUR
  - Papagayo Reserva (Paraguay, 40%)              ~ 37 EUR
Prezzo al bicchierino scelto da Marco: 9 EUR / 7 EUR.

Idempotente: controlla la presenza per (sezione, produttore, nome) prima di
inserire. Se bevande.sqlite3 o la tabella bevande_voci non esistono ancora,
salta (ci pensa il seed di bevande_db.py + inserimento da UI).

NB: bevande_voci vive in bevande.sqlite3 — il runner passa la connessione di
foodcost.db, quindi apriamo la nostra (stesso pattern delle migrazioni 152/153).
"""

import sqlite3

from app.utils.locale_data import locale_data_path

VOCI = [
    {
        "sezione_key": "distillati",
        "tipologia": "Rum",
        "regione": "BARBADOS",
        "produttore": "PLANTERAY",
        "nome": "XO 20th Anniversary",
        "gradazione": 40.0,
        "prezzo_eur": 9.0,
        "note_interne": "Prezzo bottiglia consigliato ~46 EUR (rilevato 2026-07-25)",
    },
    {
        "sezione_key": "distillati",
        "tipologia": "Rum",
        "regione": "PARAGUAY",
        "produttore": "PAPAGAYO",
        "nome": "Reserva",
        "gradazione": 40.0,
        "prezzo_eur": 7.0,
        "note_interne": "Prezzo bottiglia consigliato ~37 EUR (rilevato 2026-07-25)",
    },
]


def upgrade(conn):
    bev_path = locale_data_path("bevande.sqlite3")
    bconn = sqlite3.connect(bev_path)
    bconn.row_factory = sqlite3.Row
    try:
        row = bconn.execute(
            "SELECT 1 FROM sqlite_master WHERE type='table' AND name='bevande_voci'"
        ).fetchone()
        if not row:
            print("  bevande_voci non ancora presente — salto (ci pensa il seed)")
            return

        inseriti = 0
        for v in VOCI:
            esiste = bconn.execute(
                "SELECT 1 FROM bevande_voci "
                "WHERE sezione_key = ? AND produttore = ? AND nome = ?",
                (v["sezione_key"], v["produttore"], v["nome"]),
            ).fetchone()
            if esiste:
                print(f"  {v['produttore']} {v['nome']} già in carta — salto")
                continue
            bconn.execute(
                "INSERT INTO bevande_voci "
                "(sezione_key, tipologia, regione, produttore, nome, "
                " gradazione, prezzo_eur, note_interne, attivo) "
                "VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)",
                (
                    v["sezione_key"], v["tipologia"], v["regione"],
                    v["produttore"], v["nome"], v["gradazione"],
                    v["prezzo_eur"], v["note_interne"],
                ),
            )
            inseriti += 1
            print(f"  + {v['produttore']} {v['nome']} — {v['prezzo_eur']:.0f} EUR")

        bconn.commit()
        print(f"  seed rum completato: {inseriti} voci inserite")
    finally:
        bconn.close()
