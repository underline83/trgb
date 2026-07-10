"""
Migrazione 148: bonifica FK di ipratico_product_map (audit 2026-06-12 A2-02).

ipratico_product_map (in foodcost.db) dichiara FOREIGN KEY (vino_id) REFERENCES
vini_magazzino(id), ma la tabella `vini_magazzino` NON esiste in foodcost.db (i
vini vivi stanno in `vini_bottiglie`, che è in vini_magazzino.sqlite3 — un altro
file, quindi una FK cross-database che SQLite non può nemmeno far rispettare).
Risultato: foreign_key_check segnala TUTTE le righe come orfane (1264 al 10/07),
pur essendo i dati sani (ogni vino_id esiste in vini_bottiglie).

Fix: ricostruire la tabella SENZA quella FK impossibile. Nessun dato toccato.
Idempotente: rifà solo se la FK verso vini_magazzino è ancora presente.
"""


def _has_bad_fk(conn):
    row = conn.execute(
        "SELECT sql FROM sqlite_master WHERE type='table' AND name='ipratico_product_map'"
    ).fetchone()
    return bool(row) and "REFERENCES vini_magazzino(" in (row[0] or "")


def upgrade(conn):
    if not conn.execute(
        "SELECT 1 FROM sqlite_master WHERE type='table' AND name='ipratico_product_map'"
    ).fetchone():
        print("  ipratico_product_map assente — skip")
        return
    if not _has_bad_fk(conn):
        print("  ipratico_product_map già senza FK impossibile — skip")
        return

    conn.executescript(
        """
        PRAGMA foreign_keys=OFF;
        BEGIN;
        CREATE TABLE ipratico_product_map_new (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            ipratico_uuid TEXT NOT NULL UNIQUE,
            ipratico_wine_id TEXT,
            ipratico_name TEXT,
            ipratico_category TEXT,
            vino_id INTEGER,
            match_status TEXT DEFAULT 'unmatched'
                CHECK (match_status IN ('auto','manual','unmatched','ignored')),
            last_sync_at TEXT,
            created_at TEXT DEFAULT (datetime('now')),
            updated_at TEXT DEFAULT (datetime('now'))
        );
        INSERT INTO ipratico_product_map_new
            SELECT id, ipratico_uuid, ipratico_wine_id, ipratico_name,
                   ipratico_category, vino_id, match_status, last_sync_at,
                   created_at, updated_at
            FROM ipratico_product_map;
        DROP TABLE ipratico_product_map;
        ALTER TABLE ipratico_product_map_new RENAME TO ipratico_product_map;
        CREATE INDEX idx_ipm_wine_id ON ipratico_product_map(ipratico_wine_id);
        CREATE INDEX idx_ipm_vino_id ON ipratico_product_map(vino_id);
        COMMIT;
        PRAGMA foreign_keys=ON;
        """
    )
    n = conn.execute("SELECT COUNT(*) FROM ipratico_product_map").fetchone()[0]
    print(f"  ✔ ipratico_product_map ricostruita senza FK impossibile ({n} righe)")
