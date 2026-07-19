# @version: v1.3-selfheal-livello-cucina (2026-07-19) — init difensivo allineato allo schema post-088 + self-heal colonne
# @version: v1.2-tasks-wal-protected (ex-cucina, rinominato Phase B sessione 46)
# -*- coding: utf-8 -*-
"""
Database Task Manager — TRGB Gestionale (ex-modulo Cucina MVP, sessione 41 → Phase B sessione 46)

Contiene:
- checklist_template        — template ricorrenti (apertura/chiusura/HACCP)
- checklist_item            — voci del template (CHECKBOX/NUMERICO/TEMPERATURA/TESTO)
- checklist_instance        — istanza giornaliera generata dallo scheduler
- checklist_execution       — esecuzione tap-to-complete di una singola voce
- task_singolo              — task non ricorrente (personal todo / assegnato)
- task_alert_log            — scaffold V1 (ex-cucina_alert_log)

DB separato: app/data/tasks.sqlite3 (ex app/data/cucina.sqlite3, rinominato
dalla migrazione 086_rename_cucina_to_tasks.py).
La creazione delle tabelle e' gestita dalla migrazione 084_cucina_mvp.py (storica).
Qui abbiamo un init difensivo (CREATE IF NOT EXISTS) usato al boot
per garantire che il DB sia pronto anche su ambienti freschi.
"""

import sqlite3

from app.utils.locale_data import locale_data_path

# R6.5 — path tenant-aware. Modulo: task_manager.
DB_PATH = locale_data_path("tasks.sqlite3")


def get_tasks_conn() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH, timeout=30)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    # Fix 1.11.2 (sessione 52) — vedi nota in bevande_db.py
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA synchronous=NORMAL")
    conn.execute("PRAGMA busy_timeout=30000")
    return conn


def init_tasks_db() -> None:
    """
    Init difensivo al boot: CREATE TABLE IF NOT EXISTS per tutte le tabelle.
    La migrazione 084 fa lo stesso + seed, questo e' un safety net.
    """
    conn = get_tasks_conn()
    cur = conn.cursor()

    cur.execute("""
        CREATE TABLE IF NOT EXISTS checklist_template (
            id                  INTEGER PRIMARY KEY AUTOINCREMENT,
            nome                TEXT NOT NULL,
            reparto             TEXT NOT NULL DEFAULT 'CUCINA',
            frequenza           TEXT NOT NULL DEFAULT 'GIORNALIERA',
            turno               TEXT,
            ora_scadenza_entro  TEXT,
            attivo              INTEGER NOT NULL DEFAULT 0,
            note                TEXT,
            created_by          TEXT,
            livello_cucina      TEXT,
            created_at          TEXT NOT NULL DEFAULT (datetime('now','localtime')),
            updated_at          TEXT NOT NULL DEFAULT (datetime('now','localtime'))
        )
    """)

    cur.execute("""
        CREATE TABLE IF NOT EXISTS checklist_item (
            id              INTEGER PRIMARY KEY AUTOINCREMENT,
            template_id     INTEGER NOT NULL,
            ordine          INTEGER NOT NULL DEFAULT 0,
            titolo          TEXT NOT NULL,
            tipo            TEXT NOT NULL DEFAULT 'CHECKBOX',
            obbligatorio    INTEGER NOT NULL DEFAULT 1,
            min_valore      REAL,
            max_valore      REAL,
            unita_misura    TEXT,
            note            TEXT,
            FOREIGN KEY (template_id) REFERENCES checklist_template(id) ON DELETE CASCADE
        )
    """)

    cur.execute("""
        CREATE TABLE IF NOT EXISTS checklist_instance (
            id                  INTEGER PRIMARY KEY AUTOINCREMENT,
            template_id         INTEGER NOT NULL,
            data_riferimento    TEXT NOT NULL,
            turno               TEXT,
            scadenza_at         TEXT,
            stato               TEXT NOT NULL DEFAULT 'APERTA',
            assegnato_user      TEXT,
            completato_at       TEXT,
            completato_da       TEXT,
            score_compliance    INTEGER,
            note                TEXT,
            livello_cucina      TEXT,
            created_at          TEXT NOT NULL DEFAULT (datetime('now','localtime')),
            FOREIGN KEY (template_id) REFERENCES checklist_template(id) ON DELETE CASCADE,
            UNIQUE(template_id, data_riferimento, turno)
        )
    """)

    cur.execute("""
        CREATE TABLE IF NOT EXISTS checklist_execution (
            id              INTEGER PRIMARY KEY AUTOINCREMENT,
            instance_id     INTEGER NOT NULL,
            item_id         INTEGER NOT NULL,
            stato           TEXT NOT NULL DEFAULT 'PENDING',
            valore_numerico REAL,
            valore_testo    TEXT,
            completato_at   TEXT,
            completato_da   TEXT,
            note            TEXT,
            FOREIGN KEY (instance_id) REFERENCES checklist_instance(id) ON DELETE CASCADE,
            FOREIGN KEY (item_id) REFERENCES checklist_item(id) ON DELETE CASCADE,
            UNIQUE(instance_id, item_id)
        )
    """)

    cur.execute("""
        CREATE TABLE IF NOT EXISTS task_singolo (
            id                      INTEGER PRIMARY KEY AUTOINCREMENT,
            titolo                  TEXT NOT NULL,
            descrizione             TEXT,
            data_scadenza           TEXT,
            ora_scadenza            TEXT,
            assegnato_user          TEXT,
            priorita                TEXT NOT NULL DEFAULT 'MEDIA',
            stato                   TEXT NOT NULL DEFAULT 'APERTO',
            completato_at           TEXT,
            completato_da           TEXT,
            note_completamento      TEXT,
            origine                 TEXT NOT NULL DEFAULT 'MANUALE',
            ref_modulo              TEXT,
            ref_id                  INTEGER,
            created_by              TEXT,
            livello_cucina          TEXT,
            created_at              TEXT NOT NULL DEFAULT (datetime('now','localtime')),
            updated_at              TEXT NOT NULL DEFAULT (datetime('now','localtime'))
        )
    """)

    cur.execute("""
        CREATE TABLE IF NOT EXISTS task_alert_log (
            id                  INTEGER PRIMARY KEY AUTOINCREMENT,
            instance_id         INTEGER,
            task_id             INTEGER,
            tipo_alert          TEXT NOT NULL,
            canale              TEXT NOT NULL DEFAULT 'APP',
            destinatario        TEXT,
            inviato_at          TEXT NOT NULL DEFAULT (datetime('now','localtime')),
            stato               TEXT NOT NULL DEFAULT 'INVIATO',
            note                TEXT,
            FOREIGN KEY (instance_id) REFERENCES checklist_instance(id) ON DELETE SET NULL
        )
    """)

    # ── Self-heal colonne (v1.3, 2026-07-19) ─────────────────────────────
    # Lezione S60-INC1 + MEP estate: se questo init ricrea un DB da zero
    # DOPO che le migrazioni ADD COLUMN sono gia' marcate applicate, il file
    # resta per sempre con lo schema vecchio (la migrazione non rigira).
    # Quindi: ogni colonna aggiunta da migrazioni successive alla 084 va
    # dichiarata ANCHE qui, sia nel CREATE sopra sia in questa mappa di heal
    # per i DB gia' esistenti.
    HEAL_COLUMNS = {
        "checklist_template": [("livello_cucina", "TEXT")],
        "checklist_instance": [("livello_cucina", "TEXT")],
        "task_singolo":       [("livello_cucina", "TEXT")],
    }
    for table, cols in HEAL_COLUMNS.items():
        existing = {row[1] for row in cur.execute(f"PRAGMA table_info({table})").fetchall()}
        for col, coltype in cols:
            if col not in existing:
                try:
                    cur.execute(f"ALTER TABLE {table} ADD COLUMN {col} {coltype}")
                    cur.execute(
                        f"CREATE INDEX IF NOT EXISTS idx_{table}_{col} ON {table}({col})"
                    )
                    print(f"[tasks_db] self-heal: aggiunta {table}.{col}")
                except sqlite3.OperationalError as e:
                    print(f"[tasks_db] self-heal {table}.{col} fallito: {e}")

    # Indici (safety net — la migrazione li crea gia')
    cur.execute("CREATE INDEX IF NOT EXISTS idx_tmpl_attivo ON checklist_template(attivo)")
    cur.execute("CREATE INDEX IF NOT EXISTS idx_tmpl_reparto ON checklist_template(reparto)")
    cur.execute("CREATE INDEX IF NOT EXISTS idx_item_tmpl ON checklist_item(template_id, ordine)")
    cur.execute("CREATE INDEX IF NOT EXISTS idx_inst_data ON checklist_instance(data_riferimento)")
    cur.execute("CREATE INDEX IF NOT EXISTS idx_inst_stato ON checklist_instance(stato)")
    cur.execute("CREATE INDEX IF NOT EXISTS idx_inst_user ON checklist_instance(assegnato_user)")
    cur.execute("CREATE INDEX IF NOT EXISTS idx_exec_inst ON checklist_execution(instance_id)")
    cur.execute("CREATE INDEX IF NOT EXISTS idx_task_data ON task_singolo(data_scadenza)")
    cur.execute("CREATE INDEX IF NOT EXISTS idx_task_user ON task_singolo(assegnato_user)")
    cur.execute("CREATE INDEX IF NOT EXISTS idx_task_stato ON task_singolo(stato)")
    cur.execute("CREATE INDEX IF NOT EXISTS idx_alertlog_inst ON task_alert_log(instance_id)")
    cur.execute("CREATE INDEX IF NOT EXISTS idx_alertlog_task ON task_alert_log(task_id)")

    conn.commit()
    conn.close()
