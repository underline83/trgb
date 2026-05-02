"""
Migrazione 084: Modulo Cucina — MVP (sessione 41)

Nuovo modulo "Cucina" — checklist ricorrenti + task singoli per chef/sala.

DB separato: app/data/cucina.sqlite3

Tabelle (6):
- checklist_template        — template ricorrenti (apertura, chiusura, HACCP)
- checklist_item            — voci ordinate del template (CHECKBOX/NUMERICO/TEMPERATURA/TESTO)
- checklist_instance        — istanza giornaliera generata dallo scheduler
- checklist_execution       — esecuzione di una singola voce (tap-to-complete)
- task_singolo              — task non ricorrente assegnato a una persona
- cucina_alert_log          — scaffold V1 (lasciato vuoto in MVP)

Seed: 3 template di esempio, tutti ATTIVO=0 (Marco decide se attivarli).
"""

import sqlite3

from app.utils.locale_data import locale_data_path

# R6.5 — path tenant-aware (cucina.sqlite3 storico, rinominato a tasks.sqlite3 da mig 086)
CUCINA_DB = locale_data_path("cucina.sqlite3")


def upgrade(conn: sqlite3.Connection) -> None:
    """Riceve conn di foodcost.db dal runner, ma lavora su cucina.sqlite3."""
    CUCINA_DB.parent.mkdir(parents=True, exist_ok=True)

    cu = sqlite3.connect(CUCINA_DB)
    try:
        cur = cu.cursor()
        cur.execute("PRAGMA foreign_keys = ON")

        # ── checklist_template ────────────────────────────────────────
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
                created_at          TEXT NOT NULL DEFAULT (datetime('now','localtime')),
                updated_at          TEXT NOT NULL DEFAULT (datetime('now','localtime'))
            )
        """)

        # ── checklist_item ────────────────────────────────────────────
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

        # ── checklist_instance ────────────────────────────────────────
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
                created_at          TEXT NOT NULL DEFAULT (datetime('now','localtime')),
                FOREIGN KEY (template_id) REFERENCES checklist_template(id) ON DELETE CASCADE,
                UNIQUE(template_id, data_riferimento, turno)
            )
        """)

        # ── checklist_execution ───────────────────────────────────────
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

        # ── task_singolo ──────────────────────────────────────────────
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
                created_at              TEXT NOT NULL DEFAULT (datetime('now','localtime')),
                updated_at              TEXT NOT NULL DEFAULT (datetime('now','localtime'))
            )
        """)

        # ── cucina_alert_log (scaffold V1 — vuoto in MVP) ─────────────
        cur.execute("""
            CREATE TABLE IF NOT EXISTS cucina_alert_log (
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

        # ── INDICI ────────────────────────────────────────────────────
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
        cur.execute("CREATE INDEX IF NOT EXISTS idx_alertlog_inst ON cucina_alert_log(instance_id)")
        cur.execute("CREATE INDEX IF NOT EXISTS idx_alertlog_task ON cucina_alert_log(task_id)")

        # ── TRIGGER updated_at ────────────────────────────────────────
        cur.execute("""
            CREATE TRIGGER IF NOT EXISTS trg_cucina_tmpl_updated
            AFTER UPDATE ON checklist_template
            FOR EACH ROW
            BEGIN
                UPDATE checklist_template
                   SET updated_at = datetime('now','localtime')
                 WHERE id = NEW.id;
            END
        """)
        cur.execute("""
            CREATE TRIGGER IF NOT EXISTS trg_cucina_task_updated
            AFTER UPDATE ON task_singolo
            FOR EACH ROW
            BEGIN
                UPDATE task_singolo
                   SET updated_at = datetime('now','localtime')
                 WHERE id = NEW.id;
            END
        """)

        cu.commit()

        # ── SEED 3 TEMPLATE (tutti ATTIVO=0 di default) ───────────────
        _seed_templates(cur)
        cu.commit()

        print("  [084] cucina.sqlite3: create 6 tabelle + seed 3 template")
    finally:
        cu.close()


def _seed_templates(cur: sqlite3.Cursor) -> None:
    """
    Crea 3 template seed se non esistono gia'. Tutti attivo=0.
    Marco attiva manualmente quando vuole iniziare a usarli.
    """
    seeds = [
        {
            "nome": "Apertura cucina",
            "reparto": "CUCINA",
            "turno": "APERTURA",
            "ora_scadenza_entro": "10:30",
            "items": [
                {"titolo": "Verifica pulizia piano lavoro", "tipo": "CHECKBOX"},
                {"titolo": "Controllo luci e fornelli spenti da chiusura precedente", "tipo": "CHECKBOX"},
                {"titolo": "Apertura frigo mise en place", "tipo": "CHECKBOX"},
                {"titolo": "Controllo scorte del giorno (pane, pasta, ortaggi)", "tipo": "CHECKBOX"},
                {"titolo": "Check generale ordine cucina", "tipo": "CHECKBOX"},
            ],
        },
        {
            "nome": "Chiusura cucina",
            "reparto": "CUCINA",
            "turno": "CHIUSURA",
            "ora_scadenza_entro": "23:45",
            "items": [
                {"titolo": "Frigo carne/pesce — temperatura", "tipo": "TEMPERATURA",
                 "min_valore": 0.0, "max_valore": 4.0, "unita_misura": "°C"},
                {"titolo": "Frigo ortaggi — temperatura", "tipo": "TEMPERATURA",
                 "min_valore": 0.0, "max_valore": 4.0, "unita_misura": "°C"},
                {"titolo": "Pulizia piano lavoro cucina", "tipo": "CHECKBOX"},
                {"titolo": "Pulizia fornelli e piastra", "tipo": "CHECKBOX"},
                {"titolo": "Svuotamento e pulizia bidoni umido", "tipo": "CHECKBOX"},
                {"titolo": "Spegnimento fornelli, forno, cappa", "tipo": "CHECKBOX"},
            ],
        },
        {
            "nome": "Pulizia bar fine giornata",
            "reparto": "BAR",
            "turno": "CHIUSURA",
            "ora_scadenza_entro": "00:30",
            "items": [
                {"titolo": "Pulizia bancone bar", "tipo": "CHECKBOX"},
                {"titolo": "Lavaggio bicchieri e posate", "tipo": "CHECKBOX"},
                {"titolo": "Svuotamento cestello caffè", "tipo": "CHECKBOX"},
                {"titolo": "Spegnimento macchina caffè", "tipo": "CHECKBOX"},
            ],
        },
    ]

    for seed in seeds:
        # Idempotente: salta se gia' esiste un template con lo stesso nome
        cur.execute(
            "SELECT id FROM checklist_template WHERE nome = ?",
            (seed["nome"],),
        )
        if cur.fetchone():
            continue

        cur.execute("""
            INSERT INTO checklist_template
                (nome, reparto, frequenza, turno, ora_scadenza_entro, attivo, created_by)
            VALUES (?, ?, 'GIORNALIERA', ?, ?, 0, 'seed')
        """, (
            seed["nome"],
            seed["reparto"],
            seed["turno"],
            seed["ora_scadenza_entro"],
        ))
        tmpl_id = cur.lastrowid

        for ordine, item in enumerate(seed["items"]):
            cur.execute("""
                INSERT INTO checklist_item
                    (template_id, ordine, titolo, tipo, obbligatorio,
                     min_valore, max_valore, unita_misura)
                VALUES (?, ?, ?, ?, 1, ?, ?, ?)
            """, (
                tmpl_id,
                ordine,
                item["titolo"],
                item["tipo"],
                item.get("min_valore"),
                item.get("max_valore"),
                item.get("unita_misura"),
            ))
