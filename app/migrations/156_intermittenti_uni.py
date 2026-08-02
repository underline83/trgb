"""
Migrazione 156: comunicazione UNI-Intermittenti (modulo dipendenti)

Classificazione: [core] — la comunicazione preventiva delle chiamate dei
lavoratori intermittenti (art. 15 D.Lgs 81/2015) serve a qualunque ristorante
italiano, non solo a Tre Gobbi. I dati specifici del locale (CF datore, email
mittente) restano in `dipendenti_settings`, non nel codice.

Cosa fa (tutto idempotente, solo ADD COLUMN / CREATE IF NOT EXISTS):

1) dipendenti.sqlite3 → `dipendenti`:
   - `intermittente`         flag NUOVO: contratto intermittente vero.
     NON riusa `a_chiamata`, che ha già la semantica "extra del turismo,
     pagato a ore" (confermato da Marco 2026-07-30). Un intermittente è
     spesso anche a_chiamata, ma non viceversa: sovrascrivere la semantica
     di una colonna viva è il tipo di drift già costato caro (v. problemi.md).
   - `codice_comunicazione`  codice del UNILAV con cui è stato instaurato il
     rapporto intermittente (campo CCcodcomunicazione del modello). Lo ha il
     consulente del lavoro: va inserito a mano, una volta per lavoratore.
   ADD COLUMN nullable + UPDATE di backfill: SQLite non popola il DEFAULT
   sulle righe esistenti quando la colonna è NOT NULL (v. incidente CC.5.a).

2) dipendenti.sqlite3 → registro invii:
   - `dipendenti_uni_comunicazioni`       una riga per email inviata
   - `dipendenti_uni_comunicazioni_righe` una riga per (lavoratore, periodo)
   Il registro righe è anche l'indice di "cosa è già stato comunicato":
   l'anti-doppione dell'invio si basa su questa tabella, non su un flag sul turno.

3) `dipendenti_settings`: seed dei parametri di invio (niente hardcoded).
   Il destinatario è configurabile perché è cambiato in passato: il modulo
   PDF in circolazione punta ancora a intermittenti@mailcert.lavoro.gov.it,
   sostituito dal 1/6/2015 da intermittenti@pec.lavoro.gov.it.

4) `alert_config` (notifiche.sqlite3): seed del checker M.F
   `intermittenti_non_comunicati` — soglia_giorni = giorni di preavviso (2 = 48h).
"""

import sqlite3

from app.utils.locale_data import locale_data_path

SETTINGS_SEED = [
    ("uni_destinatario", "intermittenti@pec.lavoro.gov.it"),
    ("uni_oggetto", "Comunicazione chiamata lavoro intermittente"),
    # Formato con cui la data viene scritta nell'XML. Il modulo ministeriale ha
    # <bind><picture>DD/MM/YYYY</picture></bind> su tutti e 20 i campi data:
    # è quella picture che decide la serializzazione nei dati (il `format` è la
    # visualizzazione, il `validate` è il controllo di digitazione). Resta un
    # setting e non una costante perché di questo tracciato non esiste alcuna
    # specifica ufficiale: se un domani si scopre il contrario, si cambia qui.
    ("uni_formato_data", "DD/MM/YYYY"),
    # Da compilare in Impostazioni → Intermittenti (vuoti = invio bloccato)
    ("uni_cf_datore", ""),
    ("uni_email_mittente", ""),
]


def _add_column(cur, table, coldef_name, coldef_sql, backfill=None):
    try:
        cur.execute(f"ALTER TABLE {table} ADD COLUMN {coldef_sql}")
        print(f"  [156] {table}.{coldef_name} aggiunta")
        if backfill:
            cur.execute(backfill)
    except sqlite3.OperationalError as e:
        if "duplicate column" in str(e).lower():
            print(f"  [156] {table}.{coldef_name} già presente — skip")
        else:
            raise


def upgrade(conn):
    # ── 1+2+3) DB dipendenti ────────────────────────────────────────────
    dip_path = locale_data_path("dipendenti.sqlite3")
    dconn = sqlite3.connect(dip_path)
    try:
        cur = dconn.cursor()

        _add_column(cur, "dipendenti", "intermittente",
                    "intermittente INTEGER DEFAULT 0",
                    "UPDATE dipendenti SET intermittente = 0 WHERE intermittente IS NULL")
        _add_column(cur, "dipendenti", "codice_comunicazione",
                    "codice_comunicazione TEXT")

        cur.execute("""
            CREATE TABLE IF NOT EXISTS dipendenti_uni_comunicazioni (
                id              INTEGER PRIMARY KEY AUTOINCREMENT,
                tipo            TEXT NOT NULL DEFAULT 'NUOVA',   -- NUOVA | ANNULLAMENTO
                annulla_di_id   INTEGER REFERENCES dipendenti_uni_comunicazioni(id),
                periodo_dal     TEXT,                            -- YYYY-MM-DD (min righe)
                periodo_al      TEXT,                            -- YYYY-MM-DD (max righe)
                destinatario    TEXT NOT NULL,
                oggetto         TEXT NOT NULL,
                mittente        TEXT,
                cf_datore       TEXT,
                allegato_nome   TEXT,
                allegato_path   TEXT,
                allegato_hash   TEXT,
                eml_path        TEXT,
                esito           TEXT NOT NULL DEFAULT 'BOZZA',   -- BOZZA | INVIATA | ERRORE
                errore          TEXT,
                inviata_at      TEXT,
                creata_da       TEXT,
                created_at      TEXT NOT NULL DEFAULT (datetime('now','localtime'))
            )
        """)

        cur.execute("""
            CREATE TABLE IF NOT EXISTS dipendenti_uni_comunicazioni_righe (
                id                  INTEGER PRIMARY KEY AUTOINCREMENT,
                comunicazione_id    INTEGER NOT NULL
                                    REFERENCES dipendenti_uni_comunicazioni(id) ON DELETE CASCADE,
                riga                INTEGER NOT NULL,            -- 1..10, posizione nel modulo
                dipendente_id       INTEGER REFERENCES dipendenti(id),
                codice_fiscale      TEXT NOT NULL,
                codice_comunicazione TEXT,
                data_inizio         TEXT NOT NULL,               -- YYYY-MM-DD
                data_fine           TEXT,                        -- YYYY-MM-DD, NULL = giornata singola
                UNIQUE(comunicazione_id, riga)
            )
        """)

        cur.execute("""CREATE INDEX IF NOT EXISTS idx_uni_righe_dip_data
                       ON dipendenti_uni_comunicazioni_righe(dipendente_id, data_inizio)""")
        cur.execute("""CREATE INDEX IF NOT EXISTS idx_uni_com_esito
                       ON dipendenti_uni_comunicazioni(esito, created_at)""")

        cur.execute("""
            CREATE TABLE IF NOT EXISTS dipendenti_settings (
                key TEXT PRIMARY KEY, value TEXT NOT NULL,
                updated_at TEXT NOT NULL DEFAULT (datetime('now'))
            )
        """)
        for key, val in SETTINGS_SEED:
            cur.execute(
                "INSERT OR IGNORE INTO dipendenti_settings (key, value) VALUES (?, ?)",
                (key, val),
            )

        dconn.commit()
        print("  [156] registro UNI-Intermittenti + settings OK")
    finally:
        dconn.close()

    # ── 4) alert_config (M.F) ───────────────────────────────────────────
    notif_path = locale_data_path("notifiche.sqlite3")
    nconn = sqlite3.connect(notif_path)
    try:
        row = nconn.execute(
            "SELECT 1 FROM sqlite_master WHERE type='table' AND name='alert_config'"
        ).fetchone()
        if not row:
            print("  [156] alert_config non presente — seed saltato (fallback engine)")
            return
        nconn.execute(
            """
            INSERT OR IGNORE INTO alert_config
                (checker, attivo, soglia_giorni, antidup_ore, dest_ruolo)
            VALUES ('intermittenti_non_comunicati', 1, 2, 12, 'admin')
            """
        )
        nconn.commit()
        print("  [156] alert_config seed: intermittenti_non_comunicati (48h, antidup 12h)")
    finally:
        nconn.close()
