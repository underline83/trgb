"""
Migrazione 105 — Modulo J Lista Spesa Cucina (Fase 1 MVP, sessione 59 cont. c, 2026-04-27)

Tabella semplice per la lista della spesa testuale del chef:
- titolo: testo libero (es. "olio EVO", "pancetta 500g", "burro chiarificato")
- quantita_libera: testo libero (es. "5 kg", "2 vaschette") — NO unit conversion ora
- urgente: 0/1
- fatto: 0/1 (checkbox per spuntare quando comprato/ricevuto)
- fornitore_freeform: testo libero (es. "METRO", "Fornaio Rossi") — niente FK supplier ora
- ingredient_id NULL FK: per la Fase 2 (4.9 link ingrediente + storico prezzi)
- note: testo libero
- created_by, completato_da, created_at, completato_at

Idempotente: CREATE TABLE IF NOT EXISTS.
"""
import sqlite3


def upgrade(conn: sqlite3.Connection) -> None:
    """conn = foodcost.db"""
    cur = conn.cursor()

    cur.execute("""
        CREATE TABLE IF NOT EXISTS lista_spesa_items (
            id                  INTEGER PRIMARY KEY AUTOINCREMENT,
            titolo              TEXT NOT NULL,
            quantita_libera     TEXT,
            urgente             INTEGER NOT NULL DEFAULT 0,
            fatto               INTEGER NOT NULL DEFAULT 0,
            fornitore_freeform  TEXT,
            ingredient_id       INTEGER,
            note                TEXT,
            created_by          TEXT,
            completato_da       TEXT,
            created_at          TEXT NOT NULL DEFAULT (datetime('now','localtime')),
            completato_at       TEXT,
            FOREIGN KEY (ingredient_id) REFERENCES ingredients(id) ON DELETE SET NULL
        )
    """)

    # Indici utili per i filtri standard
    cur.execute("""
        CREATE INDEX IF NOT EXISTS idx_lista_spesa_fatto
        ON lista_spesa_items(fatto)
    """)
    cur.execute("""
        CREATE INDEX IF NOT EXISTS idx_lista_spesa_urgente
        ON lista_spesa_items(urgente, fatto)
    """)
    cur.execute("""
        CREATE INDEX IF NOT EXISTS idx_lista_spesa_created
        ON lista_spesa_items(created_at DESC)
    """)

    conn.commit()
    n = cur.execute("SELECT COUNT(*) FROM lista_spesa_items").fetchone()[0]
    print(f"  [105] lista_spesa_items: tabella pronta ({n} item esistenti)")
