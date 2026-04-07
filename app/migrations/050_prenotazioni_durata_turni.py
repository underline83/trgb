"""
Migrazione 050: Aggiunge durata_pranzo e durata_cena alla config prenotazioni

Splitta la durata media in due valori separati per turno.
Il vecchio durata_media_tavolo_min rimane per retrocompatibilita'.
"""


def upgrade(conn):
    cur = conn.cursor()

    nuove_chiavi = [
        ("durata_pranzo", "90", "Durata media pranzo in minuti"),
        ("durata_cena", "120", "Durata media cena in minuti"),
    ]

    for chiave, valore, desc in nuove_chiavi:
        cur.execute(
            "INSERT OR IGNORE INTO prenotazioni_config (chiave, valore, descrizione) VALUES (?, ?, ?)",
            (chiave, valore, desc),
        )

    conn.commit()
