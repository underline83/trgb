"""
Migrazione 090 — Home per ruolo: tabella home_actions + seed (sessione 49, 2026-04-19)

Contesto (cfr. docs/home_per_ruolo.md):
- Gli array ADMIN_ACTIONS (Home.jsx) e SALA_ACTIONS (DashboardSala.jsx) erano
  hardcoded, uguali per tutti i ruoli non-sala. Regola granitica del CLAUDE.md:
  "Config sempre in Impostazioni, mai hardcoded". Questa migrazione sposta la
  config nel DB e permette ad admin di configurare da UI i pulsanti rapidi
  della Home per ogni ruolo.

Struttura:
  CREATE TABLE home_actions
    id, ruolo, ordine, key, label, sub, emoji, route, color, attivo, timestamps
  INDEX idx_home_actions_ruolo(ruolo, ordine)
  UNIQUE(ruolo, key) — idempotenza seed

Seed: cloniamo la config attuale su tutti i ruoli.
- 8 ruoli non-sala (admin, superadmin, contabile, sommelier, chef, sous_chef,
  commis, viewer) → stesse 5 azioni di ADMIN_ACTIONS.
- sala → 4 azioni di SALA_ACTIONS.
Totale atteso: 8*5 + 4 = 44 righe.

NOTA superadmin: ne facciamo comunque il seed (non ereditato a DB level) cosi'
admin puo' personalizzare superadmin separatamente se un giorno serve. Il BE
puo' comunque fare fallback admin→superadmin se la tabella è vuota per quel ruolo.

Idempotente: INSERT OR IGNORE su (ruolo, key).
"""

import sqlite3
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parents[2]
FOODCOST_DB = BASE_DIR / "app" / "data" / "foodcost.db"


# --- SEED DATA ----------------------------------------------------------------
# Ordine: come appare in Home oggi.
ADMIN_ACTIONS_SEED = [
    # (key, label, sub, emoji, route, color)
    ("chiusura-turno",     "Chiusura Turno",     "Fine servizio",    "💵", "/vendite/fine-turno",               "bg-indigo-50 border-indigo-200 text-indigo-900"),
    ("prenotazioni",       "Prenotazioni",       "Planning completo","📅", "/prenotazioni",                     "bg-indigo-50 border-indigo-200 text-indigo-900"),
    ("cantina-vini",       "Cantina Vini",       "Magazzino",        "🍷", "/vini/magazzino",                   "bg-amber-50 border-amber-200 text-amber-900"),
    ("food-cost",          "Food Cost",          "Ricette e costi",  "📘", "/ricette/archivio",                 "bg-orange-50 border-orange-200 text-orange-900"),
    ("controllo-gestione", "Controllo Gestione", "Dashboard P&L",    "📊", "/controllo-gestione/dashboard",     "bg-emerald-50 border-emerald-200 text-emerald-900"),
]

SALA_ACTIONS_SEED = [
    ("chiusura-turno", "Chiusura Turno",  "Fine servizio",     "💵", "/vendite/fine-turno", "bg-indigo-50 border-indigo-200 text-indigo-900"),
    ("prenotazioni",   "Prenotazioni",    "Planning completo", "📅", "/prenotazioni",       "bg-indigo-50 border-indigo-200 text-indigo-900"),
    ("carta-vini",     "Carta dei Vini",  "Cerca vini",        "🍷", "/vini/carta",         "bg-amber-50 border-amber-200 text-amber-900"),
    ("mance",          "Mance",           "Registra mance",    "💰", "/flussi-cassa/mance", "bg-emerald-50 border-emerald-200 text-emerald-900"),
]

NON_SALA_ROLES = [
    "admin", "superadmin", "contabile", "sommelier",
    "chef", "sous_chef", "commis", "viewer",
]


def _table_exists(cur: sqlite3.Cursor, name: str) -> bool:
    cur.execute(
        "SELECT name FROM sqlite_master WHERE type='table' AND name=?",
        (name,),
    )
    return cur.fetchone() is not None


def upgrade(conn: sqlite3.Connection) -> None:
    """conn = foodcost.db (dal runner). Operiamo direttamente su conn."""
    cur = conn.cursor()

    # --- 1. CREATE TABLE ------------------------------------------------------
    cur.execute("""
        CREATE TABLE IF NOT EXISTS home_actions (
            id         INTEGER PRIMARY KEY AUTOINCREMENT,
            ruolo      TEXT    NOT NULL,
            ordine     INTEGER NOT NULL DEFAULT 0,
            key        TEXT    NOT NULL,
            label      TEXT    NOT NULL,
            sub        TEXT,
            emoji      TEXT    NOT NULL DEFAULT '⭐',
            route      TEXT    NOT NULL,
            color      TEXT,
            attivo     INTEGER NOT NULL DEFAULT 1,
            created_at TEXT    DEFAULT (datetime('now')),
            updated_at TEXT    DEFAULT (datetime('now'))
        )
    """)
    cur.execute(
        "CREATE INDEX IF NOT EXISTS idx_home_actions_ruolo "
        "ON home_actions(ruolo, ordine)"
    )
    cur.execute(
        "CREATE UNIQUE INDEX IF NOT EXISTS ux_home_actions_ruolo_key "
        "ON home_actions(ruolo, key)"
    )
    print("  [090] tabella home_actions creata (o già esistente)")

    # --- 2. SEED -------------------------------------------------------------
    inserite = 0

    # Ruoli non-sala: clone ADMIN_ACTIONS_SEED
    for ruolo in NON_SALA_ROLES:
        for idx, (k, label, sub, emoji, route, color) in enumerate(ADMIN_ACTIONS_SEED):
            cur.execute(
                """
                INSERT OR IGNORE INTO home_actions
                  (ruolo, ordine, key, label, sub, emoji, route, color, attivo)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)
                """,
                (ruolo, idx, k, label, sub, emoji, route, color),
            )
            if cur.rowcount > 0:
                inserite += 1

    # Sala
    for idx, (k, label, sub, emoji, route, color) in enumerate(SALA_ACTIONS_SEED):
        cur.execute(
            """
            INSERT OR IGNORE INTO home_actions
              (ruolo, ordine, key, label, sub, emoji, route, color, attivo)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)
            """,
            ("sala", idx, k, label, sub, emoji, route, color),
        )
        if cur.rowcount > 0:
            inserite += 1

    conn.commit()

    # --- 3. REPORT -----------------------------------------------------------
    cur.execute("SELECT ruolo, COUNT(*) FROM home_actions GROUP BY ruolo ORDER BY ruolo")
    righe = cur.fetchall()
    totale = sum(n for _, n in righe)
    print(f"  [090] seed: {inserite} nuove righe inserite, totale tabella = {totale}")
    for ruolo, n in righe:
        print(f"         - {ruolo:<11} {n} azioni")
