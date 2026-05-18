"""
Migrazione 131 — Vino madre: vitigni strutturati (5 slot, 2026-05-18)

CONTESTO:
  Le bottiglie hanno già 5 slot strutturati (vitigno_1_id..vitigno_5_id +
  vitigno_1_pct..vitigno_5_pct) dalla mig 125, popolati dal clustering Fase 5.
  Il MADRE invece aveva la sola descrizione testuale: i vitigni "tipici"
  dell'etichetta non erano interrogabili e si perdevano nelle composizioni.

  M2.9-bis (sessione 2026-05-18): l'utente compila i vitigni "tipici" del
  madre nel modal di promozione (e nel wizard). Devono essere persistiti
  strutturati per supportare:
    - composizione descrizione del madre (componi_descrizione)
    - query future tipo "tutti i madri con Nebbiolo ≥ 80%"
    - simmetria architettonica con bottiglie

  DECISIONE (Marco 2026-05-18): vitigni sul madre = "tipici" / di riferimento.
  Vitigni sulle bottiglie = "effettivi per quella annata", possono divergere.
  Sono semantiche distinte. Non sincronizziamo: il madre è la stella polare,
  la bottiglia è il dato per quella specifica annata in cantina.

SCHEMA:
  ALTER TABLE vini_madre_v2 ADD COLUMN vitigno_1_id INTEGER
  ALTER TABLE vini_madre_v2 ADD COLUMN vitigno_1_pct REAL
  ... (×5)

BACKFILL:
  Per ogni madre con almeno una bottiglia, copio i vitigni dalla bottiglia
  più rappresentativa = quella con ANNATA più recente (DESC), fallback id MAX.
  È una scelta arbitraria ma sensata: l'annata recente riflette il blend
  attualmente in produzione del produttore.
  Madri senza bottiglie restano NULL: l'utente li compilerà quando crea
  la prima bottiglia o tramite il modal di promozione.

  Il backfill viene fatto SOLO se i 5 slot del madre sono tutti NULL
  (idempotente: re-running non sovrascrive scelte manuali).

DB: vini_magazzino.sqlite3 (locale-aware), tabella vini_madre_v2.
Idempotente: ADD COLUMN con check pragma + backfill solo se vuoto.
"""
import sqlite3
from app.utils.locale_data import locale_data_path


VINI_MAG_DB = locale_data_path("vini_magazzino.sqlite3")


def upgrade(conn: sqlite3.Connection) -> None:
    if not VINI_MAG_DB.exists():
        print("  [131] vini_magazzino.sqlite3 non esiste, skip")
        return

    mag = sqlite3.connect(VINI_MAG_DB)
    try:
        cur = mag.cursor()

        # Verifica esistenza tabella
        row = cur.execute(
            "SELECT name FROM sqlite_master WHERE type='table' AND name='vini_madre_v2'"
        ).fetchone()
        if not row:
            print("  [131] vini_madre_v2 non esiste, skip (refactor V.6+V.7+V.8 non applicato)")
            return

        # Check colonne esistenti (idempotenza)
        cols = [c[1] for c in cur.execute("PRAGMA table_info(vini_madre_v2)").fetchall()]

        added = 0
        for i in range(1, 6):
            col_id = f"vitigno_{i}_id"
            col_pct = f"vitigno_{i}_pct"
            if col_id not in cols:
                cur.execute(f"ALTER TABLE vini_madre_v2 ADD COLUMN {col_id} INTEGER")
                added += 1
            if col_pct not in cols:
                cur.execute(f"ALTER TABLE vini_madre_v2 ADD COLUMN {col_pct} REAL")
                added += 1
        if added:
            print(f"  [131] aggiunte {added} colonne vitigno_X_id / vitigno_X_pct su vini_madre_v2")
        else:
            print("  [131] colonne vitigni già presenti, skip ALTER")

        mag.commit()

        # --- BACKFILL: per ogni madre con slot vuoti, copia dalla bottiglia
        # più recente del madre (annata DESC, id DESC). Idempotente: salta i
        # madri che hanno già almeno un vitigno_X_id valorizzato.
        # Verifico anche che la tabella bottiglie esista (refactor applicato).
        bot_row = cur.execute(
            "SELECT name FROM sqlite_master WHERE type='table' AND name='vini_bottiglie_v2'"
        ).fetchone()
        if not bot_row:
            print("  [131] vini_bottiglie_v2 non esiste, skip backfill")
            mag.commit()
            return

        # Madri ancora vuoti su tutti i 5 slot
        madri_vuoti = cur.execute("""
            SELECT id FROM vini_madre_v2
            WHERE vitigno_1_id IS NULL
              AND vitigno_2_id IS NULL
              AND vitigno_3_id IS NULL
              AND vitigno_4_id IS NULL
              AND vitigno_5_id IS NULL
        """).fetchall()

        backfilled = 0
        skipped_no_bottiglia = 0
        for (mid,) in madri_vuoti:
            # Bottiglia più rappresentativa di questo madre
            bot = cur.execute("""
                SELECT vitigno_1_id, vitigno_1_pct,
                       vitigno_2_id, vitigno_2_pct,
                       vitigno_3_id, vitigno_3_pct,
                       vitigno_4_id, vitigno_4_pct,
                       vitigno_5_id, vitigno_5_pct
                FROM vini_bottiglie_v2
                WHERE madre_id = ?
                ORDER BY CAST(ANNATA AS INTEGER) DESC, id DESC
                LIMIT 1
            """, (mid,)).fetchone()
            if not bot:
                skipped_no_bottiglia += 1
                continue
            # Skippa se la bottiglia stessa è tutta NULL (madre senza vitigni reali)
            if all(v is None for v in bot):
                skipped_no_bottiglia += 1
                continue
            cur.execute("""
                UPDATE vini_madre_v2 SET
                    vitigno_1_id = ?, vitigno_1_pct = ?,
                    vitigno_2_id = ?, vitigno_2_pct = ?,
                    vitigno_3_id = ?, vitigno_3_pct = ?,
                    vitigno_4_id = ?, vitigno_4_pct = ?,
                    vitigno_5_id = ?, vitigno_5_pct = ?
                WHERE id = ?
            """, (*bot, mid))
            backfilled += 1

        mag.commit()
        print(f"  [131] backfill vitigni completato: {backfilled} madri popolati, "
              f"{skipped_no_bottiglia} skippati (no bottiglie o bottiglia senza vitigni)")
        print("  [131] DONE")
    finally:
        mag.close()
