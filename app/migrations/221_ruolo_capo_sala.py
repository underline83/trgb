# Modulo: platform (ruoli) — [core]
"""
Migrazione 221 — Nuovo ruolo «capo_sala» (2026-10-30)

Marco: «il livello attuale di Sommelier in realtà è il Capo Sala». Il ruolo
`capo_sala` nasce con ESATTAMENTE i permessi che oggi ha `sommelier` (codice,
modules.json, home). Il sommelier resta uguale per ora: Marco lo ridefinirà
aggiungendo altre cose. Gli utenti si spostano a mano da Gestione Utenti.

Qui: azioni rapide della Home. Al ruolo capo_sala si copiano quelle che il
sommelier ha oggi (comprese le personalizzazioni fatte da Impostazioni →
Home per ruolo). Se capo_sala ha già almeno un'azione non si tocca niente.

Idempotente.
"""

import sqlite3


def upgrade(conn: sqlite3.Connection) -> None:
    """conn = foodcost.db."""
    cur = conn.cursor()
    if not cur.execute(
        "SELECT 1 FROM sqlite_master WHERE type='table' AND name='home_actions'"
    ).fetchone():
        print("  [221] home_actions assente, niente da fare")
        return
    if cur.execute("SELECT 1 FROM home_actions WHERE ruolo = 'capo_sala'").fetchone():
        print("  [221] capo_sala ha già le sue azioni, niente da fare")
        return
    cur.execute("""
        INSERT INTO home_actions (ruolo, ordine, key, label, sub, emoji, route, color, attivo)
        SELECT 'capo_sala', ordine, key, label, sub, emoji, route, color, attivo
          FROM home_actions WHERE ruolo = 'sommelier'
         ORDER BY ordine, id
    """)
    print(f"  [221] home_actions: {cur.rowcount} azioni copiate da sommelier a capo_sala")
