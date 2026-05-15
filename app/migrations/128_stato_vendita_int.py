"""
Migrazione 128 — STATO_VENDITA TEXT (codici lettera) → INTEGER 0..3 (2026-05-15)

CONTESTO (V-H.F):
  La colonna `STATO_VENDITA` aveva 6 codici lettera ereditati da Excel:
    N=Non vendere, T=Cautela, V=Vendere, F=Spingere, S=Aggressivo, C=Controllare
  Sui 1287 vini in magazzino:
    - V: 385  (vendere normale)
    - C: 901  (controllare — quasi tutti fuori cantina)
    - F: 1    (spingere)
    - N/T/S: 0 (mai usati)
  Schema semplificato a 4 livelli numerici 0..3 per ordinamento naturale:
    0 = NON_VENDERE  (bloccato)
    1 = CONTROLLARE  (verifica annata/conservazione)
    2 = VENDERE      (default per nuovi vini)
    3 = SPINGERE     (promuovere attivamente)

OPERAZIONE (idempotente):
  Per ogni tabella che ha la colonna STATO_VENDITA (vini_magazzino + vini_bottiglie_v2):
    1. ADD COLUMN _STATO_VENDITA_NEW INTEGER DEFAULT 2
    2. UPDATE con CASE mapping V→2, C→1, F→3, S→3, T→1, N→0, NULL/''→2
    3. DROP COLUMN STATO_VENDITA (vecchia TEXT)
    4. RENAME COLUMN _STATO_VENDITA_NEW → STATO_VENDITA

  Tutto in transazione. SQLite >= 3.35 richiesto (DROP COLUMN). Già usato per
  rimozione nazione_origine vitigni (2026-05-14) → OK su VPS.

ROLLBACK:
  Se serve tornare alle lettere: ricreare la colonna TEXT, popolare con mapping
  inverso (2→'V', 1→'C', 3→'F', 0→'N'). Backup esplicito viene salvato sotto
  con suffisso `.pre-mig-128-<ts>`.

DB: vini_magazzino.sqlite3 (locale-aware).
"""
import shutil
import sqlite3
from datetime import datetime
from app.utils.locale_data import locale_data_path


VINI_MAG_DB = locale_data_path("vini_magazzino.sqlite3")

# Mapping lettera → livello numerico
# Tutti i 6 codici storici sono coperti (anche N/T/S mai usati, per completezza).
LETTER_TO_INT = {
    "N": 0,  # Non vendere
    "T": 1,  # Cautela → CONTROLLARE
    "V": 2,  # Vendere
    "F": 3,  # Spingere
    "S": 3,  # Aggressivo → SPINGERE (livello max)
    "C": 1,  # Controllare
}

# Tabelle target
TABELLE = ("vini_magazzino", "vini_bottiglie_v2")


def _table_exists(cur, name: str) -> bool:
    row = cur.execute(
        "SELECT name FROM sqlite_master WHERE type='table' AND name=?", (name,)
    ).fetchone()
    return row is not None


def _column_type(cur, table: str, column: str) -> str:
    """Ritorna il TYPE della colonna, o '' se non esiste."""
    for row in cur.execute(f"PRAGMA table_info({table})").fetchall():
        # cid, name, type, notnull, dflt_value, pk
        if row[1] == column:
            return (row[2] or "").upper()
    return ""


def _migrate_table(cur, table: str) -> dict:
    """Rebuild della colonna STATO_VENDITA TEXT → INTEGER su una tabella.
    Idempotente: se la colonna è già INTEGER, no-op."""
    if not _table_exists(cur, table):
        return {"table": table, "status": "skip_no_table"}

    col_type = _column_type(cur, table, "STATO_VENDITA")
    if not col_type:
        return {"table": table, "status": "skip_no_column"}

    if col_type == "INTEGER":
        # Già migrato — verifico solo i conteggi
        n = cur.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0]
        return {"table": table, "status": "skip_already_integer", "n_rows": n}

    # 1) ADD COLUMN nuova con default 2 (VENDERE)
    cur.execute(
        f"ALTER TABLE {table} ADD COLUMN _STATO_VENDITA_NEW INTEGER DEFAULT 2"
    )

    # 2) UPDATE backfill da CASE lettera → numero
    cur.execute(
        f"""
        UPDATE {table}
        SET _STATO_VENDITA_NEW = CASE STATO_VENDITA
            WHEN 'N' THEN 0
            WHEN 'T' THEN 1
            WHEN 'V' THEN 2
            WHEN 'F' THEN 3
            WHEN 'S' THEN 3
            WHEN 'C' THEN 1
            ELSE 2
        END
        """
    )
    n_aggiornati = cur.rowcount

    # 3) DROP COLUMN vecchia (richiede SQLite >= 3.35)
    cur.execute(f"ALTER TABLE {table} DROP COLUMN STATO_VENDITA")

    # 4) RENAME COLUMN nuova → vecchio nome (richiede SQLite >= 3.25)
    cur.execute(
        f"ALTER TABLE {table} RENAME COLUMN _STATO_VENDITA_NEW TO STATO_VENDITA"
    )

    # Verifica distribuzione finale
    dist = {}
    for r in cur.execute(
        f"SELECT STATO_VENDITA, COUNT(*) FROM {table} GROUP BY STATO_VENDITA ORDER BY STATO_VENDITA"
    ).fetchall():
        dist[r[0]] = r[1]

    return {
        "table": table,
        "status": "migrated",
        "n_aggiornati": n_aggiornati,
        "distribuzione": dist,
    }


def upgrade(conn: sqlite3.Connection) -> None:
    if not VINI_MAG_DB.exists():
        print("  [128] vini_magazzino.sqlite3 non esiste, skip")
        return

    # Backup esplicito pre-mig (safety per rollback rapido)
    ts = datetime.now().strftime("%Y%m%d-%H%M%S")
    backup_path = VINI_MAG_DB.with_name(VINI_MAG_DB.name + f".pre-mig-128-{ts}")
    shutil.copy2(VINI_MAG_DB, backup_path)
    print(f"  [128] backup esplicito creato: {backup_path.name}")

    mag = sqlite3.connect(VINI_MAG_DB)
    try:
        cur = mag.cursor()

        # Check SQLite version (DROP COLUMN richiede >= 3.35)
        ver = cur.execute("SELECT sqlite_version()").fetchone()[0]
        ver_parts = tuple(int(x) for x in ver.split("."))
        if ver_parts < (3, 35, 0):
            raise RuntimeError(
                f"SQLite {ver} non supporta ALTER TABLE DROP COLUMN. Serve >= 3.35. "
                f"Rollback: il backup pre-mig è in {backup_path.name}"
            )
        print(f"  [128] SQLite version {ver} OK")

        # Migra tutte le tabelle target in transazione
        results = []
        for table in TABELLE:
            r = _migrate_table(cur, table)
            results.append(r)
            print(f"  [128] {table}: {r['status']}")
            if r.get("distribuzione"):
                for k, v in r["distribuzione"].items():
                    print(f"        livello {k}: {v} righe")

        mag.commit()
        print("  [128] DONE — STATO_VENDITA ora INTEGER 0..3")
    except Exception as e:
        mag.rollback()
        print(f"  [128] ERRORE: {e}")
        raise
    finally:
        mag.close()
