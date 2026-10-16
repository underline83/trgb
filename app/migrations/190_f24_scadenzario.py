# Modulo: controllo_gestione (scadenzario) + dipendenti (import paghe) — [core]
# -*- coding: utf-8 -*-
"""
Migrazione 190 — F24 nello Scadenzario (2026-10-16)

Gli F24 paghe (contributi INPS, ritenute IRPEF, addizionali) non comparivano
nello Scadenzario né nel saldo previsto. Da ora l'import «ELAB / F24» crea
una rata della spesa fissa «F24 paghe» (tipo F24_STIPENDI) per ogni delega
(pagina) con SALDO FINALE > 0, con il PDF collegato. Decisione Marco
16/10/2026: una rata per pagina, perché le deleghe si pagano separatamente.

f24_deleghe (foodcost.db) — una riga per pagina compilata di un PDF F24:
  fonte_hash, fonte_pdf, pagina_pdf   da quale PDF e pagina
  tipo_f24        PAGHE | ALTRO
  data_scadenza   data stampata sul modello ("Scadenza 16 Ottobre 2026")
  anno/mese_competenza  mese paghe (dalle righe)
  saldo_finale    SALDO FINALE stampato (0 = tutta compensata)
  file_path       PDF salvato negli upload (uploads/f24/...)
  spesa_fissa_id, periodo_piano, cg_uscita_id   la rata creata (se saldo > 0)
  UNIQUE(fonte_hash, pagina_pdf)

cg_uscite.allegato_url — link generico a un documento dell'uscita (oggi: il
PDF dell'F24). Lo Scadenzario mostra 📄 e lo apre con l'autenticazione.

Solo CREATE TABLE IF NOT EXISTS + ADD COLUMN (idempotente). DB: foodcost.db.
"""


def upgrade(conn):
    conn.execute("""
        CREATE TABLE IF NOT EXISTS f24_deleghe (
            id                INTEGER PRIMARY KEY AUTOINCREMENT,
            fonte_hash        TEXT NOT NULL,
            fonte_pdf         TEXT,
            pagina_pdf        INTEGER NOT NULL,
            tipo_f24          TEXT,
            data_scadenza     TEXT,
            anno_competenza   INTEGER,
            mese_competenza   INTEGER,
            saldo_finale      REAL,
            file_path         TEXT,
            spesa_fissa_id    INTEGER,
            periodo_piano     TEXT,
            cg_uscita_id      INTEGER,
            importato_il      TEXT DEFAULT (datetime('now','localtime')),
            UNIQUE (fonte_hash, pagina_pdf)
        )
    """)
    conn.execute("CREATE INDEX IF NOT EXISTS idx_f24_deleghe_uscita ON f24_deleghe (cg_uscita_id)")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_f24_deleghe_scad ON f24_deleghe (data_scadenza)")

    cols = {r[1] for r in conn.execute("PRAGMA table_info(cg_uscite)").fetchall()}
    if "allegato_url" not in cols:
        try:
            conn.execute("ALTER TABLE cg_uscite ADD COLUMN allegato_url TEXT")
        except Exception as e:  # colonna già presente (corsa) → ok
            print(f"  · allegato_url: {e}")
    conn.commit()
