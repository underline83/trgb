# @version: v1.3-clienti-wal-protected
# -*- coding: utf-8 -*-
"""
Database Clienti — TRGB Gestionale (modulo CRM)

Contiene:
- Tabella clienti (anagrafica importata da TheFork + campi extra CRM)
- Tabella clienti_tag (categorie personalizzabili: VIP, abituale, ecc.)
- Tabella clienti_tag_assoc (associazione many-to-many cliente ↔ tag, con flag auto/manuale)
- Tabella clienti_note (diario interazioni: telefonate, preferenze, eventi)
- Tabella clienti_prenotazioni (storico prenotazioni da TheFork)
- Tabella clienti_alias (merge duplicati: mappa thefork_id secondari al cliente principale)
"""

import sqlite3
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parents[2]  # .../trgb/
DATA_DIR = BASE_DIR / "app" / "data"
DATA_DIR.mkdir(parents=True, exist_ok=True)

DB_PATH = DATA_DIR / "clienti.sqlite3"


def get_clienti_conn() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH, timeout=30)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    # Fix 1.11.2 (sessione 52) — vedi nota in bevande_db.py
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA synchronous=NORMAL")
    conn.execute("PRAGMA busy_timeout=30000")
    return conn


def init_clienti_db() -> None:
    """
    Inizializza il DB clienti.
    Crea le tabelle con IF NOT EXISTS per sicurezza su DB nuovi e vecchi.
    """
    conn = get_clienti_conn()
    cur = conn.cursor()

    # ── TABELLA CLIENTI ──
    cur.execute("""
        CREATE TABLE IF NOT EXISTS clienti (
            id              INTEGER PRIMARY KEY AUTOINCREMENT,
            thefork_id      TEXT UNIQUE,

            -- Anagrafica
            titolo          TEXT,
            nome            TEXT NOT NULL,
            cognome         TEXT NOT NULL,
            email           TEXT,
            telefono        TEXT,
            telefono2       TEXT,
            data_nascita    TEXT,
            lingua          TEXT DEFAULT 'it_IT',

            -- Indirizzo
            indirizzo       TEXT,
            cap             TEXT,
            citta           TEXT,
            paese           TEXT DEFAULT 'Italy',

            -- CRM
            vip             INTEGER NOT NULL DEFAULT 0,
            rank            TEXT,
            promoter        INTEGER NOT NULL DEFAULT 0,
            newsletter      INTEGER NOT NULL DEFAULT 0,
            risk_level      TEXT,
            spending_behaviour REAL,

            -- Preferenze ristorante
            pref_cibo       TEXT,
            pref_bevande    TEXT,
            pref_posto      TEXT,
            restrizioni_dietetiche TEXT,
            allergie        TEXT,

            -- Note generali (importate da TheFork)
            note_thefork    TEXT,

            -- Stato
            attivo          INTEGER NOT NULL DEFAULT 1,
            origine         TEXT DEFAULT 'thefork',

            -- Date
            thefork_created TEXT,
            thefork_updated TEXT,
            created_at      TEXT NOT NULL DEFAULT (datetime('now','localtime')),
            updated_at      TEXT NOT NULL DEFAULT (datetime('now','localtime'))
        )
    """)

    # Trigger per aggiornare updated_at
    cur.execute("""
        CREATE TRIGGER IF NOT EXISTS clienti_update_ts
        AFTER UPDATE ON clienti
        FOR EACH ROW
        BEGIN
          UPDATE clienti
          SET updated_at = datetime('now','localtime')
          WHERE id = OLD.id;
        END
    """)

    # ── TABELLA TAG (categorie personalizzabili) ──
    cur.execute("""
        CREATE TABLE IF NOT EXISTS clienti_tag (
            id      INTEGER PRIMARY KEY AUTOINCREMENT,
            nome    TEXT NOT NULL UNIQUE,
            colore  TEXT NOT NULL DEFAULT '#0d9488',
            ordine  INTEGER NOT NULL DEFAULT 0
        )
    """)

    # Tag di default
    cur.execute("""
        INSERT OR IGNORE INTO clienti_tag (nome, colore, ordine) VALUES
        ('VIP',        '#7c3aed', 1),
        ('Abituale',   '#0d9488', 2),
        ('Occasionale','#6b7280', 3),
        ('Aziendale',  '#2563eb', 4),
        ('Turista',    '#d97706', 5),
        ('Stampa',     '#dc2626', 6),
        ('Amico',      '#059669', 7)
    """)

    # ── ASSOCIAZIONE CLIENTE ↔ TAG ──
    cur.execute("""
        CREATE TABLE IF NOT EXISTS clienti_tag_assoc (
            cliente_id  INTEGER NOT NULL REFERENCES clienti(id) ON DELETE CASCADE,
            tag_id      INTEGER NOT NULL REFERENCES clienti_tag(id) ON DELETE CASCADE,
            PRIMARY KEY (cliente_id, tag_id)
        )
    """)

    # ── DIARIO NOTE / INTERAZIONI ──
    cur.execute("""
        CREATE TABLE IF NOT EXISTS clienti_note (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            cliente_id  INTEGER NOT NULL REFERENCES clienti(id) ON DELETE CASCADE,
            tipo        TEXT NOT NULL DEFAULT 'nota',
            testo       TEXT NOT NULL,
            data        TEXT NOT NULL DEFAULT (date('now','localtime')),
            autore      TEXT,
            created_at  TEXT NOT NULL DEFAULT (datetime('now','localtime'))
        )
    """)

    # ── PRENOTAZIONI (storico TheFork) ──
    cur.execute("""
        CREATE TABLE IF NOT EXISTS clienti_prenotazioni (
            id              INTEGER PRIMARY KEY AUTOINCREMENT,
            cliente_id      INTEGER REFERENCES clienti(id) ON DELETE SET NULL,
            thefork_customer_id TEXT,
            thefork_booking_id  TEXT UNIQUE,

            -- Dettagli prenotazione
            data_pasto      TEXT NOT NULL,
            ora_pasto       TEXT,
            stato           TEXT NOT NULL,
            pax             INTEGER NOT NULL DEFAULT 2,
            tavolo          TEXT,
            canale          TEXT,
            occasione       TEXT,

            -- Note
            nota_ristorante TEXT,
            nota_cliente    TEXT,

            -- Booking info
            data_prenotazione TEXT,
            prenotato_da    TEXT,

            -- Economico
            importo_conto   TEXT,
            sconto          REAL,
            menu_preset     TEXT,
            offerta_speciale INTEGER DEFAULT 0,

            -- Yums / Imprint
            yums            INTEGER DEFAULT 0,
            imprint         INTEGER DEFAULT 0,
            importo_imprint TEXT,

            -- Risposte form personalizzati
            degustazione    TEXT,
            allergie_segnalate TEXT,
            tavolo_esterno  INTEGER DEFAULT 0,
            seggioloni      TEXT,

            -- Waiting list / walk-in
            waiting_list    INTEGER DEFAULT 0,

            created_at      TEXT NOT NULL DEFAULT (datetime('now','localtime'))
        )
    """)

    # ── ALIAS per merge duplicati ──
    # Quando mergiamo due clienti, il thefork_id del "secondario" finisce qui
    # così l'import TheFork continua a riconoscere entrambi gli ID
    cur.execute("""
        CREATE TABLE IF NOT EXISTS clienti_alias (
            id              INTEGER PRIMARY KEY AUTOINCREMENT,
            cliente_id      INTEGER NOT NULL REFERENCES clienti(id) ON DELETE CASCADE,
            thefork_id      TEXT NOT NULL UNIQUE,
            merged_from_id  INTEGER,
            created_at      TEXT NOT NULL DEFAULT (datetime('now','localtime'))
        )
    """)

    # ── ESCLUSIONI DUPLICATI ──
    # Coppie di clienti che l'utente ha esplicitamente marcato come "non duplicati"
    # (es. marito e moglie con stesso telefono)
    cur.execute("""
        CREATE TABLE IF NOT EXISTS clienti_no_duplicato (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            cliente_a   INTEGER NOT NULL REFERENCES clienti(id) ON DELETE CASCADE,
            cliente_b   INTEGER NOT NULL REFERENCES clienti(id) ON DELETE CASCADE,
            motivo      TEXT,
            created_at  TEXT NOT NULL DEFAULT (datetime('now','localtime')),
            UNIQUE(cliente_a, cliente_b)
        )
    """)

    # ── CODA REVISIONE IMPORT (diff tra CRM e TheFork) ──
    # Quando un campo è diverso tra CRM (protetto) e TheFork, la differenza
    # viene salvata qui. Marco la revisiona dalla UI e decide se applicarla o ignorarla.
    cur.execute("""
        CREATE TABLE IF NOT EXISTS clienti_import_diff (
            id              INTEGER PRIMARY KEY AUTOINCREMENT,
            cliente_id      INTEGER NOT NULL REFERENCES clienti(id) ON DELETE CASCADE,
            campo           TEXT NOT NULL,
            valore_crm      TEXT,
            valore_thefork  TEXT,
            data_import     TEXT NOT NULL DEFAULT (datetime('now','localtime')),
            stato           TEXT NOT NULL DEFAULT 'pending',
            risolto_at      TEXT,
            UNIQUE(cliente_id, campo, stato)
        )
    """)

    # ── IMPOSTAZIONI CRM (soglie segmenti, configurazioni varie) ──
    cur.execute("""
        CREATE TABLE IF NOT EXISTS clienti_impostazioni (
            chiave      TEXT PRIMARY KEY,
            valore      TEXT NOT NULL,
            descrizione TEXT
        )
    """)
    # Valori di default per le soglie dei segmenti marketing
    cur.execute("""
        INSERT OR IGNORE INTO clienti_impostazioni (chiave, valore, descrizione) VALUES
        ('seg_abituale_min',       '5',   'Visite minime negli ultimi N mesi per essere "abituale"'),
        ('seg_occasionale_min',    '1',   'Visite minime negli ultimi N mesi per essere "occasionale"'),
        ('seg_nuovo_giorni',       '90',  'Giorni dalla prima visita per essere "nuovo"'),
        ('seg_nuovo_max_visite',   '2',   'Max visite per restare "nuovo"'),
        ('seg_perso_giorni',       '365', 'Giorni senza visite per essere "perso"'),
        ('seg_finestra_mesi',      '12',  'Finestra in mesi per contare le visite (abituale/occasionale)'),
        ('preventivi_luoghi',      '["Sala","Giardino","Dehor"]', 'Luoghi disponibili per preventivi eventi (JSON array)')
    """)

    # ── ALTER TABLE sicuri per DB esistenti ──

    # Campo 'protetto' su clienti: se 1, l'import TheFork NON sovrascrive i campi anagrafica
    try:
        cur.execute("ALTER TABLE clienti ADD COLUMN protetto INTEGER NOT NULL DEFAULT 0")
    except sqlite3.OperationalError:
        pass  # colonna già esistente

    # Campo 'auto' su clienti_tag_assoc: 0=manuale (CRM), 1=automatico (import)
    # I tag manuali NON vengono toccati dall'import
    try:
        cur.execute("ALTER TABLE clienti_tag_assoc ADD COLUMN auto INTEGER NOT NULL DEFAULT 0")
    except sqlite3.OperationalError:
        pass  # colonna già esistente

    # Campi nome2/cognome2 per coppie (moglie/marito sullo stesso contatto)
    try:
        cur.execute("ALTER TABLE clienti ADD COLUMN nome2 TEXT")
    except sqlite3.OperationalError:
        pass
    try:
        cur.execute("ALTER TABLE clienti ADD COLUMN cognome2 TEXT")
    except sqlite3.OperationalError:
        pass

    # ── PRENOTAZIONI: colonne aggiuntive per modulo Prenotazioni ──
    pren_cols = [
        ("turno", "TEXT"),                       # 'pranzo' / 'cena'
        ("fonte", "TEXT"),                       # 'manuale' / 'thefork' / 'widget'
        ("creato_da", "TEXT"),                   # username TRGB
        ("conferma_inviata", "INTEGER DEFAULT 0"),
        ("reminder_inviato", "INTEGER DEFAULT 0"),
        ("token_cancellazione", "TEXT"),
        ("updated_at", "TEXT"),
        # Snapshot nome ospite da TheFork (fallback quando cliente_id e' NULL,
        # es. prenotazioni anonimizzate o senza Customer ID) — vedi migraz. 068
        ("nome_ospite", "TEXT"),
        ("cognome_ospite", "TEXT"),
    ]
    existing_pren = [r[1] for r in cur.execute("PRAGMA table_info(clienti_prenotazioni)").fetchall()]
    for col_name, col_type in pren_cols:
        if col_name not in existing_pren:
            try:
                cur.execute(f"ALTER TABLE clienti_prenotazioni ADD COLUMN {col_name} {col_type}")
            except sqlite3.OperationalError:
                pass

    # ── TABELLA TAVOLI ──
    cur.execute("""
        CREATE TABLE IF NOT EXISTS tavoli (
            id              INTEGER PRIMARY KEY AUTOINCREMENT,
            nome            TEXT NOT NULL UNIQUE,
            zona            TEXT NOT NULL DEFAULT 'sala',
            posti_min       INTEGER NOT NULL DEFAULT 2,
            posti_max       INTEGER NOT NULL DEFAULT 4,
            combinabile     INTEGER NOT NULL DEFAULT 1,
            posizione_x     REAL DEFAULT 0,
            posizione_y     REAL DEFAULT 0,
            larghezza       REAL DEFAULT 60,
            altezza         REAL DEFAULT 60,
            forma           TEXT DEFAULT 'rect',
            attivo          INTEGER NOT NULL DEFAULT 1,
            note            TEXT,
            ordine          INTEGER DEFAULT 0
        )
    """)

    # ── COMBINAZIONI TAVOLI ──
    cur.execute("""
        CREATE TABLE IF NOT EXISTS tavoli_combinazioni (
            id              INTEGER PRIMARY KEY AUTOINCREMENT,
            nome            TEXT NOT NULL,
            tavoli_ids      TEXT NOT NULL,
            posti           INTEGER NOT NULL,
            uso_frequente   INTEGER DEFAULT 0,
            note            TEXT
        )
    """)

    # ── LAYOUT TAVOLI ──
    cur.execute("""
        CREATE TABLE IF NOT EXISTS tavoli_layout (
            id              INTEGER PRIMARY KEY AUTOINCREMENT,
            nome            TEXT NOT NULL UNIQUE,
            descrizione     TEXT,
            tavoli_attivi   TEXT NOT NULL,
            posizioni       TEXT,
            attivo          INTEGER DEFAULT 0,
            created_at      TEXT DEFAULT (datetime('now','localtime'))
        )
    """)

    # ── CONFIGURAZIONE PRENOTAZIONI ──
    cur.execute("""
        CREATE TABLE IF NOT EXISTS prenotazioni_config (
            chiave      TEXT PRIMARY KEY,
            valore      TEXT NOT NULL,
            descrizione TEXT
        )
    """)
    cur.execute("""
        INSERT OR IGNORE INTO prenotazioni_config (chiave, valore, descrizione) VALUES
        ('capienza_pranzo',         '35',    'Coperti massimi pranzo'),
        ('capienza_cena',           '50',    'Coperti massimi cena'),
        ('slot_pranzo',             '["12:00","12:15","12:30","12:45","13:00","13:15","13:30","14:00"]', 'Slot orari pranzo'),
        ('slot_cena',               '["19:00","19:30","19:45","20:00","20:15","20:30","21:00","21:30"]', 'Slot orari cena'),
        ('soglia_pranzo_cena',      '15:00', 'Ora che separa pranzo da cena'),
        ('giorni_anticipo_max',     '60',    'Max giorni in avanti per widget'),
        ('giorni_anticipo_min_ore', '2',     'Min ore prima per widget'),
        ('giorno_chiusura',         '3',     'Giorno chiuso (0=dom, 3=mer)'),
        ('durata_media_tavolo_min', '90',    'Durata media permanenza minuti'),
        ('widget_attivo',           '0',     'Widget pubblico attivo (0/1)'),
        ('widget_messaggio_pieno',  'Siamo al completo per questa data. Contattaci telefonicamente per verificare disponibilita.', 'Messaggio widget pieno'),
        ('template_wa_conferma',    'Ciao {nome}, confermiamo la prenotazione per {pax} persone il {data} alle {ora}. Vi aspettiamo! - Osteria Tre Gobbi', 'Template WA conferma'),
        ('template_wa_reminder',    'Ciao {nome}, vi ricordiamo la prenotazione per domani alle {ora} ({pax} persone). A presto! - Osteria Tre Gobbi', 'Template WA reminder')
    """)

    # ── LOG EMAIL PRENOTAZIONI ──
    cur.execute("""
        CREATE TABLE IF NOT EXISTS prenotazioni_email_log (
            id                  INTEGER PRIMARY KEY AUTOINCREMENT,
            prenotazione_id     INTEGER NOT NULL,
            tipo                TEXT NOT NULL,
            destinatario        TEXT,
            inviata_at          TEXT,
            errore              TEXT,
            FOREIGN KEY (prenotazione_id) REFERENCES clienti_prenotazioni(id)
        )
    """)

    # ── INDICI ──
    cur.execute("CREATE INDEX IF NOT EXISTS idx_clienti_cognome ON clienti(cognome)")
    cur.execute("CREATE INDEX IF NOT EXISTS idx_clienti_telefono ON clienti(telefono)")
    cur.execute("CREATE INDEX IF NOT EXISTS idx_clienti_email ON clienti(email)")
    cur.execute("CREATE INDEX IF NOT EXISTS idx_clienti_vip ON clienti(vip)")
    cur.execute("CREATE INDEX IF NOT EXISTS idx_clienti_nascita ON clienti(data_nascita)")
    cur.execute("CREATE INDEX IF NOT EXISTS idx_clienti_thefork ON clienti(thefork_id)")
    cur.execute("CREATE INDEX IF NOT EXISTS idx_clienti_note_cliente ON clienti_note(cliente_id)")
    cur.execute("CREATE INDEX IF NOT EXISTS idx_clienti_tag_assoc_cliente ON clienti_tag_assoc(cliente_id)")
    cur.execute("CREATE INDEX IF NOT EXISTS idx_clienti_tag_assoc_tag ON clienti_tag_assoc(tag_id)")
    cur.execute("CREATE INDEX IF NOT EXISTS idx_pren_cliente ON clienti_prenotazioni(cliente_id)")
    cur.execute("CREATE INDEX IF NOT EXISTS idx_pren_data ON clienti_prenotazioni(data_pasto)")
    cur.execute("CREATE INDEX IF NOT EXISTS idx_pren_stato ON clienti_prenotazioni(stato)")
    cur.execute("CREATE INDEX IF NOT EXISTS idx_pren_thefork_cust ON clienti_prenotazioni(thefork_customer_id)")
    cur.execute("CREATE INDEX IF NOT EXISTS idx_pren_thefork_book ON clienti_prenotazioni(thefork_booking_id)")
    cur.execute("CREATE INDEX IF NOT EXISTS idx_alias_cliente ON clienti_alias(cliente_id)")
    cur.execute("CREATE INDEX IF NOT EXISTS idx_alias_thefork ON clienti_alias(thefork_id)")
    cur.execute("CREATE INDEX IF NOT EXISTS idx_diff_cliente ON clienti_import_diff(cliente_id)")
    cur.execute("CREATE INDEX IF NOT EXISTS idx_diff_stato ON clienti_import_diff(stato)")

    # Indici prenotazioni aggiuntivi
    cur.execute("CREATE INDEX IF NOT EXISTS idx_pren_turno ON clienti_prenotazioni(turno)")
    cur.execute("CREATE INDEX IF NOT EXISTS idx_pren_fonte ON clienti_prenotazioni(fonte)")
    cur.execute("CREATE INDEX IF NOT EXISTS idx_pren_token ON clienti_prenotazioni(token_cancellazione)")
    cur.execute("CREATE INDEX IF NOT EXISTS idx_tavoli_zona ON tavoli(zona)")
    cur.execute("CREATE INDEX IF NOT EXISTS idx_tavoli_attivo ON tavoli(attivo)")

    # ── PREVENTIVI (modulo 10 — sessione 31) ──

    cur.execute("""
        CREATE TABLE IF NOT EXISTS clienti_preventivi (
            id                INTEGER PRIMARY KEY AUTOINCREMENT,
            numero            TEXT NOT NULL,
            cliente_id        INTEGER,

            titolo            TEXT NOT NULL,
            tipo              TEXT NOT NULL DEFAULT 'cena_privata',
            data_evento       TEXT,
            ora_evento        TEXT,
            n_persone         INTEGER,
            luogo             TEXT DEFAULT 'sala',

            stato             TEXT NOT NULL DEFAULT 'bozza',
            versione          INTEGER NOT NULL DEFAULT 1,

            note_interne      TEXT,
            note_cliente      TEXT,
            condizioni        TEXT,

            scadenza_conferma TEXT,
            canale            TEXT DEFAULT 'telefono',

            prenotazione_id   INTEGER,
            template_id       INTEGER,

            totale_calcolato  REAL DEFAULT 0,

            -- Menu proposto (ristorante-oriented — sessione 32)
            menu_nome            TEXT,
            menu_prezzo_persona  REAL DEFAULT 0,
            menu_descrizione     TEXT,

            creato_da         TEXT NOT NULL,
            created_at        TEXT NOT NULL DEFAULT (datetime('now','localtime')),
            updated_at        TEXT NOT NULL DEFAULT (datetime('now','localtime')),

            FOREIGN KEY (cliente_id) REFERENCES clienti(id) ON DELETE SET NULL
        )
    """)

    cur.execute("""
        CREATE TABLE IF NOT EXISTS clienti_preventivi_righe (
            id              INTEGER PRIMARY KEY AUTOINCREMENT,
            preventivo_id   INTEGER NOT NULL,
            ordine          INTEGER NOT NULL DEFAULT 0,
            descrizione     TEXT NOT NULL,
            qta             REAL DEFAULT 1,
            prezzo_unitario REAL DEFAULT 0,
            totale_riga     REAL DEFAULT 0,
            tipo_riga       TEXT DEFAULT 'voce',
            FOREIGN KEY (preventivo_id) REFERENCES clienti_preventivi(id) ON DELETE CASCADE
        )
    """)

    cur.execute("""
        CREATE TABLE IF NOT EXISTS clienti_preventivi_template (
            id              INTEGER PRIMARY KEY AUTOINCREMENT,
            nome            TEXT NOT NULL,
            tipo            TEXT DEFAULT 'cena_privata',
            righe_json      TEXT,
            condizioni_default TEXT,
            attivo          INTEGER DEFAULT 1,
            created_at      TEXT NOT NULL DEFAULT (datetime('now','localtime')),
            updated_at      TEXT NOT NULL DEFAULT (datetime('now','localtime'))
        )
    """)

    # Trigger updated_at preventivi
    cur.execute("""
        CREATE TRIGGER IF NOT EXISTS trg_preventivi_updated
        AFTER UPDATE ON clienti_preventivi
        FOR EACH ROW
        BEGIN
            UPDATE clienti_preventivi SET updated_at = datetime('now','localtime') WHERE id = NEW.id;
        END
    """)

    cur.execute("""
        CREATE TRIGGER IF NOT EXISTS trg_preventivi_tpl_updated
        AFTER UPDATE ON clienti_preventivi_template
        FOR EACH ROW
        BEGIN
            UPDATE clienti_preventivi_template SET updated_at = datetime('now','localtime') WHERE id = NEW.id;
        END
    """)

    # ── Aggiunta colonne menu a clienti_preventivi (DB esistenti) ──
    existing_prev = {r[1] for r in cur.execute("PRAGMA table_info(clienti_preventivi)").fetchall()}
    for col_name, col_type in [
        ("menu_nome",           "TEXT"),
        ("menu_prezzo_persona", "REAL DEFAULT 0"),
        ("menu_descrizione",    "TEXT"),
    ]:
        if col_name not in existing_prev:
            try:
                cur.execute(f"ALTER TABLE clienti_preventivi ADD COLUMN {col_name} {col_type}")
            except sqlite3.OperationalError:
                pass

    # Indici preventivi
    cur.execute("CREATE INDEX IF NOT EXISTS idx_prev_cliente ON clienti_preventivi(cliente_id)")
    cur.execute("CREATE INDEX IF NOT EXISTS idx_prev_stato ON clienti_preventivi(stato)")
    cur.execute("CREATE INDEX IF NOT EXISTS idx_prev_data ON clienti_preventivi(data_evento)")
    cur.execute("CREATE INDEX IF NOT EXISTS idx_prev_numero ON clienti_preventivi(numero)")
    cur.execute("CREATE INDEX IF NOT EXISTS idx_prev_righe_prev ON clienti_preventivi_righe(preventivo_id)")

    conn.commit()
    conn.close()
