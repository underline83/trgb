# @version: v2.0-dipendenti-db
# -*- coding: utf-8 -*-
"""
Database Dipendenti — TRGB Gestionale

Contiene:
- Tabella dipendenti (anagrafica + indirizzo + IBAN)
- Tabella turni_tipi (tipologie di turno)
- Tabella turni_calendario (calendario turni)
- Tabella dipendenti_allegati (documenti/corsi allegati)
- Tabella buste_paga (cedolini importati da PDF)
- Tabella dipendenti_scadenze (documenti con scadenza: HACCP, corsi, ecc.)
- Tabella dipendenti_presenze (ferie, malattie, permessi)
- Tabella dipendenti_contratti (contratti di lavoro)
"""

import os
import sqlite3
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parents[2]  # .../trgb/
DATA_DIR = BASE_DIR / "app" / "data"
DATA_DIR.mkdir(parents=True, exist_ok=True)

DB_PATH = DATA_DIR / "dipendenti.sqlite3"


def get_dipendenti_conn() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_dipendenti_db() -> None:
    """
    Inizializza il DB dipendenti se non esiste.
    Se il file è già presente, NON modifica lo schema (niente migrazioni qui).
    Per modifiche strutturali importanti preferiamo cancellare il file
    quando non ci sono dati, come nel tuo caso.
    """
    need_init = not DB_PATH.exists()

    conn = get_dipendenti_conn()
    cur = conn.cursor()

    if need_init:
        # ------------------------------------------------------------
        # TABELLA DIPENDENTI — anagrafica + indirizzo + IBAN
        # ------------------------------------------------------------
        cur.execute(
            """
            CREATE TABLE dipendenti (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              codice TEXT NOT NULL UNIQUE,
              nome TEXT NOT NULL,
              cognome TEXT NOT NULL,
              ruolo TEXT NOT NULL,

              telefono TEXT,
              email TEXT,
              note TEXT,

              -- Indirizzo completo
              indirizzo_via TEXT,
              indirizzo_civico TEXT,
              indirizzo_cap TEXT,
              indirizzo_citta TEXT,
              indirizzo_provincia TEXT,
              indirizzo_paese TEXT,

              -- IBAN per pagamenti/stipendi
              iban TEXT,

              attivo INTEGER NOT NULL DEFAULT 1,

              created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
              updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
            );
            """
        )

        # Trigger per aggiornare updated_at
        cur.execute(
            """
            CREATE TRIGGER dipendenti_update_ts
            AFTER UPDATE ON dipendenti
            FOR EACH ROW
            BEGIN
              UPDATE dipendenti
              SET updated_at = datetime('now','localtime')
              WHERE id = OLD.id;
            END;
            """
        )

        # ------------------------------------------------------------
        # TABELLA TURNI_TIPI — definizione tipologie di turno
        # ------------------------------------------------------------
        cur.execute(
            """
            CREATE TABLE turni_tipi (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              codice TEXT NOT NULL UNIQUE,
              nome TEXT NOT NULL,
              ruolo TEXT NOT NULL,
              colore_bg TEXT NOT NULL,
              colore_testo TEXT NOT NULL,
              ora_inizio TEXT NOT NULL,  -- "HH:MM"
              ora_fine   TEXT NOT NULL,  -- "HH:MM"
              ordine INTEGER NOT NULL DEFAULT 0,
              attivo INTEGER NOT NULL DEFAULT 1,
              created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
              updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
            );
            """
        )

        cur.execute(
            """
            CREATE TRIGGER turni_tipi_update_ts
            AFTER UPDATE ON turni_tipi
            FOR EACH ROW
            BEGIN
              UPDATE turni_tipi
              SET updated_at = datetime('now','localtime')
              WHERE id = OLD.id;
            END;
            """
        )

        # ------------------------------------------------------------
        # TABELLA TURNI_CALENDARIO — turni assegnati per giorno
        # ------------------------------------------------------------
        cur.execute(
            """
            CREATE TABLE turni_calendario (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              dipendente_id INTEGER NOT NULL,
              turno_tipo_id INTEGER NOT NULL,
              data TEXT NOT NULL,            -- "YYYY-MM-DD"
              ora_inizio TEXT,               -- opzionale: override
              ora_fine TEXT,                 -- opzionale: override
              stato TEXT NOT NULL DEFAULT 'CONFERMATO',
              note TEXT,
              created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
              updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
              FOREIGN KEY (dipendente_id) REFERENCES dipendenti(id),
              FOREIGN KEY (turno_tipo_id) REFERENCES turni_tipi(id)
            );
            """
        )

        cur.execute(
            """
            CREATE TRIGGER turni_calendario_update_ts
            AFTER UPDATE ON turni_calendario
            FOR EACH ROW
            BEGIN
              UPDATE turni_calendario
              SET updated_at = datetime('now','localtime')
              WHERE id = OLD.id;
            END;
            """
        )

        # ------------------------------------------------------------
        # TABELLA DIPENDENTI_ALLEGATI — documenti/corsi allegati
        # ------------------------------------------------------------
        cur.execute(
            """
            CREATE TABLE dipendenti_allegati (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              dipendente_id INTEGER NOT NULL,
              filename TEXT NOT NULL,       -- nome file memorizzato (es. su NAS / storage)
              label TEXT,                   -- nome leggibile: "Contratto 2025", "Corso HACCP", ...
              note TEXT,
              uploaded_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
              FOREIGN KEY (dipendente_id) REFERENCES dipendenti(id)
            );
            """
        )

        conn.commit()

    # ────────────────────────────────────────────────────────────
    # TABELLE v2.0 — create con IF NOT EXISTS per DB nuovi e vecchi
    # ────────────────────────────────────────────────────────────

    # Colonne aggiuntive su dipendenti (safe: ignora se già esistono)
    for col_def in [
        "costo_orario REAL",
        "giorno_paga INTEGER DEFAULT 27",
        "codice_fiscale TEXT",
        "data_nascita TEXT",
        "tipo_rapporto TEXT",
        "livello TEXT",
        "qualifica TEXT",
    ]:
        try:
            cur.execute(f"ALTER TABLE dipendenti ADD COLUMN {col_def}")
        except Exception:
            pass

    # ── BUSTE PAGA ──
    cur.execute("""
        CREATE TABLE IF NOT EXISTS buste_paga (
            id              INTEGER PRIMARY KEY AUTOINCREMENT,
            dipendente_id   INTEGER NOT NULL REFERENCES dipendenti(id),
            mese            INTEGER NOT NULL,
            anno            INTEGER NOT NULL,
            lordo           REAL,
            netto           REAL NOT NULL,
            contributi_inps REAL,
            irpef           REAL,
            addizionali     REAL,
            tfr_maturato    REAL,
            ore_lavorate    REAL,
            ore_straordinario REAL,
            pdf_filename    TEXT,
            pdf_path        TEXT,
            note            TEXT,
            importato_il    TEXT DEFAULT (datetime('now','localtime')),
            uscita_netto_id INTEGER,
            stato           TEXT DEFAULT 'IMPORTATO',
            UNIQUE(dipendente_id, mese, anno)
        )
    """)

    # Aggiungi colonna fonte se non esiste (v2.1)
    for col_def in [
        "fonte TEXT DEFAULT 'MANUALE'",
    ]:
        try:
            cur.execute(f"ALTER TABLE buste_paga ADD COLUMN {col_def}")
        except Exception:
            pass

    # ── SCADENZE DOCUMENTI ──
    cur.execute("""
        CREATE TABLE IF NOT EXISTS dipendenti_scadenze (
            id              INTEGER PRIMARY KEY AUTOINCREMENT,
            dipendente_id   INTEGER NOT NULL REFERENCES dipendenti(id),
            tipo            TEXT NOT NULL,
            descrizione     TEXT,
            data_rilascio   TEXT,
            data_scadenza   TEXT NOT NULL,
            ente_rilascio   TEXT,
            pdf_filename    TEXT,
            pdf_path        TEXT,
            stato           TEXT DEFAULT 'VALIDO',
            alert_giorni    INTEGER DEFAULT 30,
            note            TEXT,
            created_at      TEXT DEFAULT (datetime('now','localtime'))
        )
    """)

    # ── PRESENZE ──
    cur.execute("""
        CREATE TABLE IF NOT EXISTS dipendenti_presenze (
            id              INTEGER PRIMARY KEY AUTOINCREMENT,
            dipendente_id   INTEGER NOT NULL REFERENCES dipendenti(id),
            data            TEXT NOT NULL,
            tipo            TEXT NOT NULL,
            ore             REAL,
            turno_tipo_id   INTEGER REFERENCES turni_tipi(id),
            note            TEXT,
            created_at      TEXT DEFAULT (datetime('now','localtime')),
            UNIQUE(dipendente_id, data)
        )
    """)

    # ── CONTRATTI (predisposto per futuro) ──
    cur.execute("""
        CREATE TABLE IF NOT EXISTS dipendenti_contratti (
            id              INTEGER PRIMARY KEY AUTOINCREMENT,
            dipendente_id   INTEGER NOT NULL REFERENCES dipendenti(id),
            tipo            TEXT NOT NULL,
            livello         TEXT,
            ccnl            TEXT DEFAULT 'TURISMO',
            data_inizio     TEXT NOT NULL,
            data_fine       TEXT,
            data_prova_fine TEXT,
            ore_settimanali REAL DEFAULT 40,
            ral             REAL,
            pdf_filename    TEXT,
            pdf_path        TEXT,
            note            TEXT,
            attivo          INTEGER DEFAULT 1,
            created_at      TEXT DEFAULT (datetime('now','localtime'))
        )
    """)

    # Indici
    cur.execute("CREATE INDEX IF NOT EXISTS idx_buste_paga_dip ON buste_paga(dipendente_id)")
    cur.execute("CREATE INDEX IF NOT EXISTS idx_buste_paga_periodo ON buste_paga(anno, mese)")
    cur.execute("CREATE INDEX IF NOT EXISTS idx_scadenze_dip ON dipendenti_scadenze(dipendente_id)")
    cur.execute("CREATE INDEX IF NOT EXISTS idx_scadenze_data ON dipendenti_scadenze(data_scadenza)")
    cur.execute("CREATE INDEX IF NOT EXISTS idx_presenze_dip ON dipendenti_presenze(dipendente_id)")
    cur.execute("CREATE INDEX IF NOT EXISTS idx_presenze_data ON dipendenti_presenze(data)")
    cur.execute("CREATE INDEX IF NOT EXISTS idx_contratti_dip ON dipendenti_contratti(dipendente_id)")

    # ────────────────────────────────────────────────────────────
    # TURNI v2 — reparti, colonne extra, indici, template
    # (in sync con migrazione 071_turni_v2_schema.py)
    # ────────────────────────────────────────────────────────────

    # Tabella reparti (SALA, CUCINA, …)
    cur.execute("""
        CREATE TABLE IF NOT EXISTS reparti (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          codice TEXT NOT NULL UNIQUE,
          nome TEXT NOT NULL,
          icona TEXT,
          colore TEXT,
          ordine INTEGER NOT NULL DEFAULT 0,
          attivo INTEGER NOT NULL DEFAULT 1,
          pranzo_inizio TEXT,
          pranzo_fine   TEXT,
          cena_inizio   TEXT,
          cena_fine     TEXT,
          pausa_pranzo_min INTEGER NOT NULL DEFAULT 30,
          pausa_cena_min   INTEGER NOT NULL DEFAULT 30,
          created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
          updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
        )
    """)
    for s in [
        ("SALA",   "Sala",   "🍽️", "#2E7BE8", 10, "10:30", "15:30", "18:00", "24:00"),
        ("CUCINA", "Cucina", "👨‍🍳", "#E8402B", 20, "09:30", "15:30", "17:30", "23:00"),
    ]:
        try:
            cur.execute(
                """
                INSERT OR IGNORE INTO reparti
                (codice, nome, icona, colore, ordine, attivo,
                 pranzo_inizio, pranzo_fine, cena_inizio, cena_fine,
                 pausa_pranzo_min, pausa_cena_min)
                VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?, ?, 30, 30)
                """,
                s
            )
        except Exception:
            pass

    # Colonne extra su dipendenti (reparto + colore univoco + a chiamata)
    # a_chiamata=1 → dipendente pagato a ore, senza contratto fisso
    for col_def in [
        "reparto_id INTEGER REFERENCES reparti(id)",
        "colore TEXT",
        "a_chiamata INTEGER DEFAULT 0",
        "trasmissione_telematica INTEGER DEFAULT 0",
    ]:
        try:
            cur.execute(f"ALTER TABLE dipendenti ADD COLUMN {col_def}")
        except Exception:
            pass
    cur.execute("CREATE INDEX IF NOT EXISTS idx_dipendenti_reparto ON dipendenti(reparto_id)")

    # Colonne extra su turni_tipi
    for col_def in [
        "categoria TEXT NOT NULL DEFAULT 'LAVORO'",
        "ore_lavoro REAL",
        "icona TEXT",
        "servizio TEXT",            # 'PRANZO' / 'CENA' / NULL
    ]:
        try:
            cur.execute(f"ALTER TABLE turni_tipi ADD COLUMN {col_def}")
        except Exception:
            pass

    # Colonne extra su turni_calendario
    # NB: 'stato' resta TEXT libero — accetta CONFERMATO / OPZIONALE / ANNULLATO
    # (OPZIONALE = turno non ancora confermato, non pesa nel conteggio ore)
    for col_def in [
        "ore_effettive REAL",
        "origine TEXT NOT NULL DEFAULT 'MANUALE'",
        "origine_ref_id TEXT",
        "slot_index INTEGER",   # posizione colonna foglio settimana (0-based)
    ]:
        try:
            cur.execute(f"ALTER TABLE turni_calendario ADD COLUMN {col_def}")
        except Exception:
            pass

    # Indici turni_calendario
    cur.execute("CREATE INDEX IF NOT EXISTS idx_turni_cal_data ON turni_calendario(data)")
    cur.execute("CREATE INDEX IF NOT EXISTS idx_turni_cal_dip_data ON turni_calendario(dipendente_id, data)")
    cur.execute("CREATE INDEX IF NOT EXISTS idx_turni_cal_data_servizio_slot ON turni_calendario(data, slot_index)")

    # Tabelle template settimanali
    cur.execute("""
        CREATE TABLE IF NOT EXISTS turni_template (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          nome TEXT NOT NULL,
          descrizione TEXT,
          attivo INTEGER NOT NULL DEFAULT 1,
          created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
          updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
        )
    """)
    cur.execute("""
        CREATE TABLE IF NOT EXISTS turni_template_righe (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          template_id INTEGER NOT NULL,
          dipendente_id INTEGER NOT NULL,
          giorno_settimana INTEGER NOT NULL,
          turno_tipo_id INTEGER NOT NULL,
          note TEXT,
          FOREIGN KEY (template_id) REFERENCES turni_template(id) ON DELETE CASCADE,
          FOREIGN KEY (dipendente_id) REFERENCES dipendenti(id),
          FOREIGN KEY (turno_tipo_id) REFERENCES turni_tipi(id)
        )
    """)
    cur.execute("CREATE INDEX IF NOT EXISTS idx_tmpl_righe_tmpl ON turni_template_righe(template_id)")

    # NB: nessun seed RIPOSO/FERIE/ecc.
    #  - il workflow di Marco non usa il "tipo riposo": chi non compare in foglio = a casa
    #  - le assenze (FERIE/MALATTIA/PERMESSO) vivono nel modulo Presenze v2.3

    conn.commit()
    conn.close()
