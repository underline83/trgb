"""
Migrazione 126 — Fix vincolo UNIQUE troppo restrittivo su vini_denominazioni_v2 (2026-05-13)

CONTESTO:
  La mig 125 ha creato `vini_denominazioni_v2` con vincolo `UNIQUE(nazione, nome, tipo)`
  oltre a `codice_eambrosia UNIQUE`. Durante il primo sync dall'API eAmbrosia
  (Fase 3) sono emerse 5 collisioni reali: denominazioni rumene con stesso nome
  storico ma codici eAmbrosia diversi (es. "Dealu Mare" PDO con 4 codici diversi
  per disciplinari progressivi). I dati eAmbrosia sono fonte di verità → il
  vincolo `(nazione, nome, tipo)` è troppo restrittivo. La vera chiave naturale
  è `codice_eambrosia` (già UNIQUE, sufficiente).

AZIONE:
  Drop & recreate `vini_denominazioni_v2` senza il vincolo `(nazione, nome, tipo)`.
  La tabella è praticamente vuota (sync fallito per la collisione), quindi safe.
  Idempotente: skip se il vincolo è già stato rimosso.

DB: vini_magazzino.sqlite3 (locale-aware).
"""
import sqlite3
from app.utils.locale_data import locale_data_path


VINI_MAG_DB = locale_data_path("vini_magazzino.sqlite3")


def upgrade(conn: sqlite3.Connection) -> None:
    if not VINI_MAG_DB.exists():
        print("  [126] vini_magazzino.sqlite3 non esiste, skip")
        return

    mag = sqlite3.connect(VINI_MAG_DB)
    try:
        cur = mag.cursor()

        # Verifica esistenza tabella
        row = cur.execute(
            "SELECT sql FROM sqlite_master WHERE type='table' AND name='vini_denominazioni_v2'"
        ).fetchone()
        if not row:
            print("  [126] vini_denominazioni_v2 non esiste (mig 125 non ancora applicata?), skip")
            return

        schema = row[0] or ""
        # Idempotency check: se non c'è più il vincolo, skip
        if "UNIQUE(nazione, nome, tipo)" not in schema and "UNIQUE (nazione, nome, tipo)" not in schema:
            print("  [126] vincolo già rimosso, skip")
            return

        n_rows = cur.execute("SELECT COUNT(*) FROM vini_denominazioni_v2").fetchone()[0]
        print(f"  [126] vini_denominazioni_v2 ha {n_rows} righe, drop & recreate")

        # Salva dati esistenti (se ci sono — improbabile, sync fallito atomicamente)
        rows_backup = []
        if n_rows > 0:
            rows_backup = cur.execute(
                "SELECT codice_eambrosia, nome, tipo, tipo_ue, nazione, regione, "
                "link_disciplinare, attiva, source, last_synced_at, created_at, updated_at "
                "FROM vini_denominazioni_v2"
            ).fetchall()

        cur.execute("DROP TABLE vini_denominazioni_v2")
        cur.execute("""
            CREATE TABLE vini_denominazioni_v2 (
                id                  INTEGER PRIMARY KEY AUTOINCREMENT,
                codice_eambrosia    TEXT UNIQUE,
                nome                TEXT NOT NULL,
                tipo                TEXT NOT NULL,
                tipo_ue             TEXT,
                nazione             TEXT NOT NULL,
                regione             TEXT,
                link_disciplinare   TEXT,
                attiva              INTEGER NOT NULL DEFAULT 1,
                source              TEXT,
                last_synced_at      TEXT,
                created_at          TEXT NOT NULL DEFAULT (datetime('now')),
                updated_at          TEXT NOT NULL DEFAULT (datetime('now'))
            )
        """)
        cur.execute("CREATE INDEX idx_vd2_nazione ON vini_denominazioni_v2 (nazione)")
        cur.execute("CREATE INDEX idx_vd2_tipo ON vini_denominazioni_v2 (tipo)")
        cur.execute("CREATE INDEX idx_vd2_nome ON vini_denominazioni_v2 (nome)")
        print("  [126] tabella ricreata senza vincolo UNIQUE(nazione, nome, tipo)")

        # Ripristina eventuali righe esistenti
        if rows_backup:
            cur.executemany(
                """INSERT INTO vini_denominazioni_v2
                   (codice_eambrosia, nome, tipo, tipo_ue, nazione, regione,
                    link_disciplinare, attiva, source, last_synced_at, created_at, updated_at)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                rows_backup,
            )
            print(f"  [126] ripristinate {len(rows_backup)} righe")

        mag.commit()
        print("  [126] DONE")
    finally:
        mag.close()
