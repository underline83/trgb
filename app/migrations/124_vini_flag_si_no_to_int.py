"""
Migrazione 124 — Vini: normalizzazione 4 flag SI/NO → INTEGER 0/1
                 + eliminazione DISCONTINUATO (consolidato in STATO_RIORDINO='X')
                 (2026-05-12)

CONTESTO (sessione 2026-05-12, V-H.E):
  La tabella `vini_magazzino` ha 5 flag TEXT con valori 'SI'/'NO'/NULL,
  eredità dell'import Excel originale. Marco ha esplicitato:
  - il DB è la nuova source-of-truth (Excel non esiste più);
  - i flag devono essere boolean reali (INTEGER 0/1) come `BOTTIGLIA_APERTA`,
    `FORZA_PREZZO`, `PREZZO_CALICE_MANUALE` (già INTEGER);
  - `DISCONTINUATO='SI'` ha lo stesso significato di `STATO_RIORDINO='X'`
    ("Non ricomprare"): è una ridondanza Excel da rimuovere.

I 4 flag da normalizzare:
  CARTA, IPRATICO, BIOLOGICO, VENDITA_CALICE

Eliminato:
  DISCONTINUATO (consolidato in STATO_RIORDINO='X')

STRATEGIA:
  1. Pre-check: count vini con DISCONTINUATO='SI' (per log).
  2. Consolida: UPDATE STATO_RIORDINO='X' WHERE DISCONTINUATO='SI'
     AND (STATO_RIORDINO IS NULL OR STATO_RIORDINO != 'X').
     (Per i conflitti — vino DISCONTINUATO='SI' con STATO_RIORDINO già
     valorizzato a qualcosa di diverso da 'X' — sovrascriviamo a 'X' perché
     l'intent dell'utente è "fuori catalogo", che ha priorità sulla
     sottocategoria di riordino precedente.)
  3. ADD COLUMN <flag>_INT INTEGER (con default coerente).
  4. UPDATE backfill: 'SI' → 1, 'NO' → 0, NULL → NULL (o default).
  5. DROP COLUMN dei 4 flag TEXT vecchi + DROP COLUMN DISCONTINUATO.
  6. RENAME COLUMN <flag>_INT → <flag> (nome canonico).

NB su CHECK constraints:
  Le nuove colonne INTEGER NON hanno CHECK constraint (in SQLite non si può
  ADD CHECK a una colonna esistente senza ricreare la tabella). La validazione
  resta a livello Pydantic e logica BE. Sufficiente per il prodotto attuale.

NB su backup:
  push.sh fa backup automatico pre-deploy. In aggiunta, questa migration
  crea backup esplicito `vini_magazzino.sqlite3.pre-mig-124-YYYYMMDD-HHMMSS`
  nello stesso path del DB prima di toccarlo. Recovery: rinominare il backup
  al nome originale.

DB: vini_magazzino.sqlite3 (locale-aware).
Idempotente: la presenza delle colonne INTEGER nuove (e l'assenza di quelle
TEXT vecchie) viene controllata via PRAGMA table_info → re-run no-op.
"""
import shutil
import sqlite3
from datetime import datetime

from app.utils.locale_data import locale_data_path


VINI_MAG_DB = locale_data_path("vini_magazzino.sqlite3")


def _column_type(cur: sqlite3.Cursor, table: str, column: str) -> str | None:
    """Ritorna il tipo della colonna (uppercase) oppure None se non esiste."""
    for row in cur.execute(f"PRAGMA table_info({table})"):
        # row: (cid, name, type, notnull, dflt_value, pk)
        if row[1] == column:
            return (row[2] or "").upper()
    return None


def upgrade(conn: sqlite3.Connection) -> None:
    """conn = foodcost.db (passato dal runner, non usato). Apre vini_magazzino.sqlite3."""
    if not VINI_MAG_DB.exists():
        print("  [124] vini_magazzino.sqlite3 non esiste, skip")
        return

    # ── 0. Backup esplicito pre-migration ──
    ts = datetime.now().strftime("%Y%m%d-%H%M%S")
    backup_path = VINI_MAG_DB.parent / f"{VINI_MAG_DB.name}.pre-mig-124-{ts}"
    try:
        shutil.copy2(VINI_MAG_DB, backup_path)
        print(f"  [124] backup creato: {backup_path}")
    except Exception as e:
        print(f"  [124] ⚠ backup fallito: {e} — abort per safety")
        raise

    mag = sqlite3.connect(VINI_MAG_DB)
    try:
        cur = mag.cursor()

        # Idempotency check: se CARTA è già INTEGER e DISCONTINUATO non esiste,
        # la migration è già stata applicata.
        carta_tipo = _column_type(cur, "vini_magazzino", "CARTA")
        disc_tipo = _column_type(cur, "vini_magazzino", "DISCONTINUATO")
        if carta_tipo == "INTEGER" and disc_tipo is None:
            print("  [124] già applicata (CARTA è INTEGER e DISCONTINUATO non esiste). Skip.")
            return

        # ── 1. Pre-check: stato attuale ──
        n_tot = cur.execute("SELECT COUNT(*) FROM vini_magazzino").fetchone()[0]
        n_disc_si = 0
        n_disc_non_x = 0
        if disc_tipo is not None:
            n_disc_si = cur.execute(
                "SELECT COUNT(*) FROM vini_magazzino WHERE DISCONTINUATO = 'SI'"
            ).fetchone()[0]
            n_disc_non_x = cur.execute(
                """
                SELECT COUNT(*) FROM vini_magazzino
                WHERE DISCONTINUATO = 'SI'
                  AND (STATO_RIORDINO IS NULL OR STATO_RIORDINO != 'X')
                """
            ).fetchone()[0]
        print(f"  [124] vini totali: {n_tot}")
        print(f"  [124] DISCONTINUATO='SI': {n_disc_si} (di cui {n_disc_non_x} da migrare a STATO_RIORDINO='X')")

        # ── 2. Consolida DISCONTINUATO → STATO_RIORDINO='X' ──
        if disc_tipo is not None and n_disc_non_x > 0:
            cur.execute(
                """
                UPDATE vini_magazzino
                SET STATO_RIORDINO = 'X',
                    UPDATED_AT = datetime('now')
                WHERE DISCONTINUATO = 'SI'
                  AND (STATO_RIORDINO IS NULL OR STATO_RIORDINO != 'X')
                """
            )
            print(f"  [124] consolidamento: {cur.rowcount} righe → STATO_RIORDINO='X'")

        # ── 3. ADD COLUMN <flag>_INT (idempotente: skip se già esistono) ──
        # `BIOLOGICO` e `VENDITA_CALICE` avevano default 'NO' → diventano default 0.
        # `CARTA` e `IPRATICO` erano nullable senza default → restano nullable.
        new_cols_spec = [
            ("CARTA_INT", "INTEGER"),
            ("IPRATICO_INT", "INTEGER"),
            ("BIOLOGICO_INT", "INTEGER DEFAULT 0"),
            ("VENDITA_CALICE_INT", "INTEGER DEFAULT 0"),
        ]
        for col_name, col_spec in new_cols_spec:
            if _column_type(cur, "vini_magazzino", col_name) is None:
                cur.execute(f"ALTER TABLE vini_magazzino ADD COLUMN {col_name} {col_spec}")
                print(f"  [124] ADD COLUMN {col_name} {col_spec}")

        # ── 4. Backfill con CAST 'SI'→1, 'NO'→0, NULL→NULL/default ──
        # Per CARTA e IPRATICO: NULL resta NULL (nessun default).
        # Per BIOLOGICO e VENDITA_CALICE: NULL → 0 (default coerente con vecchio 'NO').
        old_to_new = [
            ("CARTA", "CARTA_INT", "NULL"),
            ("IPRATICO", "IPRATICO_INT", "NULL"),
            ("BIOLOGICO", "BIOLOGICO_INT", "0"),
            ("VENDITA_CALICE", "VENDITA_CALICE_INT", "0"),
        ]
        for old_col, new_col, null_default in old_to_new:
            old_tipo = _column_type(cur, "vini_magazzino", old_col)
            # Se la vecchia colonna non esiste più, la backfill è già stata fatta in un re-run parziale
            if old_tipo is None:
                continue
            cur.execute(
                f"""
                UPDATE vini_magazzino
                SET {new_col} = CASE
                    WHEN {old_col} = 'SI' THEN 1
                    WHEN {old_col} = 'NO' THEN 0
                    ELSE {null_default}
                END
                """
            )
            print(f"  [124] backfill {old_col} → {new_col}: {cur.rowcount} righe")

        # ── 5. DROP COLUMN vecchie (idempotente) ──
        # Richiede SQLite >= 3.35 (TRGB su Python 3.12, OK).
        cols_to_drop = ["CARTA", "IPRATICO", "BIOLOGICO", "VENDITA_CALICE", "DISCONTINUATO"]
        for col in cols_to_drop:
            if _column_type(cur, "vini_magazzino", col) is not None:
                try:
                    cur.execute(f"ALTER TABLE vini_magazzino DROP COLUMN {col}")
                    print(f"  [124] DROP COLUMN {col}")
                except sqlite3.OperationalError as e:
                    # Possibile errore se la colonna è referenziata da indice/vista
                    print(f"  [124] ⚠ DROP COLUMN {col} fallita: {e}")
                    raise

        # ── 6. RENAME COLUMN <flag>_INT → <flag> ──
        renames = [
            ("CARTA_INT", "CARTA"),
            ("IPRATICO_INT", "IPRATICO"),
            ("BIOLOGICO_INT", "BIOLOGICO"),
            ("VENDITA_CALICE_INT", "VENDITA_CALICE"),
        ]
        for old_name, new_name in renames:
            if _column_type(cur, "vini_magazzino", old_name) is not None:
                cur.execute(f"ALTER TABLE vini_magazzino RENAME COLUMN {old_name} TO {new_name}")
                print(f"  [124] RENAME COLUMN {old_name} → {new_name}")

        # ── 7. Verifica finale ──
        final_types = {
            c: _column_type(cur, "vini_magazzino", c)
            for c in ["CARTA", "IPRATICO", "BIOLOGICO", "VENDITA_CALICE", "DISCONTINUATO"]
        }
        print(f"  [124] tipi finali: {final_types}")

        mag.commit()
        print("  [124] DONE")
    finally:
        mag.close()
