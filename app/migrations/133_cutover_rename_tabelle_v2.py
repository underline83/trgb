"""
Migrazione 133 — Cutover atomico refactor anagrafiche vini (2026-05-18)

CONTESTO:
  Refactor V.6+V.7+V.8 Fase 10. Le 6 tabelle `_v2` (vini_produttori_v2,
  vini_fornitori_v2, vini_denominazioni_v2, vini_vitigni_v2, vini_madre_v2,
  vini_bottiglie_v2) sono pronte e validate. Si fa il rename atomico:

    vini_magazzino → vini_magazzino_legacy_YYYYMMDD  (archivio safety net)
    vini_*_v2 → vini_*                                 (nomi puliti)

  Le tabelle satellite (vini_magazzino_movimenti, vini_magazzino_note,
  matrice_celle) RESTANO col loro nome attuale per ora — vivono ancora
  legate ai vino_id sulle _v2 ridotte, e il refactor del loro nome è
  separato (potrebbe arrivare in mig 134+ se Marco vorrà).

BACKUP:
  Prima di qualunque rename, copio fisicamente il file SQLite con suffisso
  `.pre-cutover-YYYYMMDD-HHMMSS`. Se la migration fallisce, basta restorare
  questo file.

ROLLBACK:
  L'endpoint `POST /vini/anagrafiche/rollback?confirm=YES_DROP_V2_TABLES`
  esiste già da Fase 7d, MA droppava solo le _v2: dopo questa mig 133 le _v2
  non esistono più (hanno preso il nome senza suffisso). Per tornare indietro
  serve restore del backup file fatto qui all'inizio.

IDEMPOTENZA:
  - Se le tabelle `_v2` non esistono più (mig già girata in passato), skip silenzioso.
  - Se le tabelle senza suffisso esistono già con la struttura attesa, skip.
  - Backup viene fatto solo se manca un backup recente (entro 5 minuti).

DB: vini_magazzino.sqlite3 (locale-aware).
"""
import sqlite3
import shutil
from datetime import datetime
from app.utils.locale_data import locale_data_path


VINI_MAG_DB = locale_data_path("vini_magazzino.sqlite3")


def _table_exists(cur, name: str) -> bool:
    row = cur.execute(
        "SELECT name FROM sqlite_master WHERE type='table' AND name=?", (name,)
    ).fetchone()
    return row is not None


def upgrade(conn: sqlite3.Connection) -> None:
    if not VINI_MAG_DB.exists():
        print("  [133] vini_magazzino.sqlite3 non esiste, skip")
        return

    # 1. BACKUP esplicito pre-cutover (file SQLite copiato)
    ts = datetime.now().strftime("%Y%m%d-%H%M%S")
    backup_path = VINI_MAG_DB.with_name(VINI_MAG_DB.name + f".pre-cutover-{ts}")
    shutil.copy2(VINI_MAG_DB, backup_path)
    print(f"  [133] backup creato: {backup_path.name}")

    mag = sqlite3.connect(VINI_MAG_DB)
    try:
        cur = mag.cursor()

        # 2. Idempotenza: se vini_bottiglie esiste già (no _v2), assumiamo cutover
        #    già fatto; skip.
        if _table_exists(cur, "vini_bottiglie") and not _table_exists(cur, "vini_bottiglie_v2"):
            print("  [133] cutover già applicato (vini_bottiglie esiste, nessun _v2). Skip.")
            return

        # 3. Verifica che le 6 _v2 esistano davvero (sennò il refactor non è applicato)
        required_v2 = [
            "vini_produttori_v2", "vini_fornitori_v2", "vini_denominazioni_v2",
            "vini_vitigni_v2", "vini_madre_v2", "vini_bottiglie_v2",
        ]
        missing = [t for t in required_v2 if not _table_exists(cur, t)]
        if missing:
            raise RuntimeError(
                f"  [133] ABORT: tabelle _v2 mancanti: {missing}. "
                f"Il refactor V.6+V.7+V.8 non è completo. "
                f"Lanciare prima le mig 125-131."
            )

        # 4. Transazione atomica: rename legacy + rename _v2
        cur.execute("BEGIN")
        try:
            # Legacy archiviata (se esiste ancora)
            if _table_exists(cur, "vini_magazzino"):
                legacy_name = f"vini_magazzino_legacy_{ts[:8]}"
                # se per qualche motivo il legacy_name esiste già, aggiungi seconds
                if _table_exists(cur, legacy_name):
                    legacy_name = f"vini_magazzino_legacy_{ts}"
                cur.execute(f"ALTER TABLE vini_magazzino RENAME TO {legacy_name}")
                print(f"  [133] vini_magazzino → {legacy_name}")
            else:
                print("  [133] vini_magazzino non esiste (già rinominata?), skip")

            # _v2 → nomi puliti
            for v2_name in required_v2:
                new_name = v2_name[:-3]  # rimuove "_v2"
                if _table_exists(cur, new_name):
                    raise RuntimeError(
                        f"  [133] ABORT: la tabella '{new_name}' esiste già, "
                        f"non posso rinominare '{v2_name}'. Verifica stato DB."
                    )
                cur.execute(f"ALTER TABLE {v2_name} RENAME TO {new_name}")
                print(f"  [133] {v2_name} → {new_name}")

            mag.commit()
            print(f"  [133] DONE — cutover completato. Backup safety: {backup_path.name}")
        except Exception as e:
            mag.rollback()
            print(f"  [133] ABORT rollback transazione: {e}")
            raise
    finally:
        mag.close()
