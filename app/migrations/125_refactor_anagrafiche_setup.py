"""
Migrazione 125 — Refactor anagrafiche vini: setup impalcatura (2026-05-12)

CONTESTO (sessione 2026-05-12, V.6+V.7+V.8):
  Strategia blue-green per il refactor strutturale del modulo Vini.
  Vedi `docs/refactor_anagrafiche_vini.md` per il design completo.

  Questa migrazione è la FASE 1: setup impalcatura. Crea le 6 nuove tabelle
  `_v2` parallele nel DB `vini_magazzino.sqlite3`, idempotenti. Le tabelle
  esistenti (`vini_magazzino`, `vini_magazzino_movimenti`, ecc.) NON vengono
  toccate. Marco continua a usare il modulo Vini normalmente.

  Le tabelle _v2 vengono popolate in fasi successive:
    - Fase 2: backend service + endpoint scheletro
    - Fase 3: seed denominazioni (eAmbrosia API + PDF MASAF)
    - Fase 4: seed vitigni
    - Fase 5: migrazione dati esistenti (clustering produttori → madre → bottiglie)
    - Fase 6+7+8: UI nuova + sync + workflow inserimento
    - Fase 10: cutover atomico (rename tabelle)

OBIETTIVI:
  1. Backup esplicito pre-mig (`.pre-mig-125-<timestamp>`).
  2. CREATE TABLE vini_produttori_v2     (cantine)
  3. CREATE TABLE vini_fornitori_v2      (distributori + rappresentante inline)
  4. CREATE TABLE vini_denominazioni_v2  (DOC/DOCG/IGT/AOC… seed da eAmbrosia)
  5. CREATE TABLE vini_vitigni_v2        (anagrafica canonica vitigni)
  6. CREATE TABLE vini_madre_v2          (etichetta stabile, FK a produttori/fornitori/denominazioni)
  7. CREATE TABLE vini_bottiglie_v2      (= vini_magazzino + madre_id + 5 slot vitigno)
  8. INSERT INTO vini_bottiglie_v2 SELECT … FROM vini_magazzino
     (copia 1287 vini, madre_id e vitigno_* slot iniziano NULL)

  Idempotente: re-run è no-op (controllo esistenza tabelle via sqlite_master).

DB: vini_magazzino.sqlite3 (locale-aware).

ROLLBACK:
  Per annullare: DROP TABLE delle 6 tabelle _v2. I dati live in
  vini_magazzino/movimenti/note NON sono toccati. Endpoint admin di rollback
  rapido verrà aggiunto in fase 7.
"""
import shutil
import sqlite3
from datetime import datetime

from app.utils.locale_data import locale_data_path


VINI_MAG_DB = locale_data_path("vini_magazzino.sqlite3")


def _table_exists(cur: sqlite3.Cursor, name: str) -> bool:
    row = cur.execute(
        "SELECT name FROM sqlite_master WHERE type='table' AND name=?", (name,)
    ).fetchone()
    return row is not None


def upgrade(conn: sqlite3.Connection) -> None:
    """conn = foodcost.db (passato dal runner, non usato). Apre vini_magazzino.sqlite3."""
    if not VINI_MAG_DB.exists():
        print("  [125] vini_magazzino.sqlite3 non esiste, skip")
        return

    # ── 0. Backup esplicito pre-migration ──
    ts = datetime.now().strftime("%Y%m%d-%H%M%S")
    backup_path = VINI_MAG_DB.parent / f"{VINI_MAG_DB.name}.pre-mig-125-{ts}"
    try:
        shutil.copy2(VINI_MAG_DB, backup_path)
        print(f"  [125] backup creato: {backup_path}")
    except Exception as e:
        print(f"  [125] ⚠ backup fallito: {e} — abort per safety")
        raise

    mag = sqlite3.connect(VINI_MAG_DB)
    try:
        cur = mag.cursor()

        # ── 1. vini_produttori_v2 ──
        if not _table_exists(cur, "vini_produttori_v2"):
            cur.execute("""
                CREATE TABLE vini_produttori_v2 (
                    id           INTEGER PRIMARY KEY AUTOINCREMENT,
                    nome         TEXT NOT NULL,
                    nazione      TEXT NOT NULL,
                    regione      TEXT,
                    provincia    TEXT,
                    citta        TEXT,
                    note         TEXT,
                    created_at   TEXT NOT NULL DEFAULT (datetime('now')),
                    updated_at   TEXT NOT NULL DEFAULT (datetime('now'))
                )
            """)
            cur.execute("CREATE INDEX idx_vp2_nome ON vini_produttori_v2 (nome)")
            cur.execute("CREATE INDEX idx_vp2_nazione ON vini_produttori_v2 (nazione)")
            print("  [125] CREATE TABLE vini_produttori_v2")
        else:
            print("  [125] vini_produttori_v2 già esistente, skip")

        # ── 2. vini_fornitori_v2 ──
        if not _table_exists(cur, "vini_fornitori_v2"):
            cur.execute("""
                CREATE TABLE vini_fornitori_v2 (
                    id                          INTEGER PRIMARY KEY AUTOINCREMENT,
                    nome                        TEXT NOT NULL,
                    nazione                     TEXT,
                    regione                     TEXT,
                    provincia                   TEXT,
                    citta                       TEXT,
                    rappresentante_nome         TEXT,
                    rappresentante_telefono     TEXT,
                    rappresentante_email        TEXT,
                    note                        TEXT,
                    created_at                  TEXT NOT NULL DEFAULT (datetime('now')),
                    updated_at                  TEXT NOT NULL DEFAULT (datetime('now'))
                )
            """)
            cur.execute("CREATE INDEX idx_vf2_nome ON vini_fornitori_v2 (nome)")
            print("  [125] CREATE TABLE vini_fornitori_v2")
        else:
            print("  [125] vini_fornitori_v2 già esistente, skip")

        # ── 3. vini_denominazioni_v2 ──
        # Popolata in Fase 3 via API eAmbrosia + parsing PDF MASAF
        if not _table_exists(cur, "vini_denominazioni_v2"):
            cur.execute("""
                CREATE TABLE vini_denominazioni_v2 (
                    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
                    codice_eambrosia    TEXT UNIQUE,
                    nome                TEXT NOT NULL,
                    tipo                TEXT NOT NULL,
                    tipo_ue             TEXT,
                    nazione             TEXT NOT NULL,
                    regione             TEXT,
                    link_disciplinare   TEXT,
                    attiva              INTEGER NOT NULL DEFAULT 1,
                    source              TEXT,
                    last_synced_at      TEXT,
                    created_at          TEXT NOT NULL DEFAULT (datetime('now')),
                    updated_at          TEXT NOT NULL DEFAULT (datetime('now'))
                    -- NOTA mig 126: rimosso UNIQUE(nazione, nome, tipo) — troppo restrittivo
                    -- per eAmbrosia (es. "Dealu Mare" RO ha 4 codici diversi con stesso nome+tipo).
                    -- La chiave naturale è codice_eambrosia (già UNIQUE, sufficiente).
                )
            """)
            cur.execute("CREATE INDEX idx_vd2_nazione ON vini_denominazioni_v2 (nazione)")
            cur.execute("CREATE INDEX idx_vd2_tipo ON vini_denominazioni_v2 (tipo)")
            cur.execute("CREATE INDEX idx_vd2_nome ON vini_denominazioni_v2 (nome)")
            print("  [125] CREATE TABLE vini_denominazioni_v2")
        else:
            print("  [125] vini_denominazioni_v2 già esistente, skip")

        # ── 4. vini_vitigni_v2 ──
        if not _table_exists(cur, "vini_vitigni_v2"):
            cur.execute("""
                CREATE TABLE vini_vitigni_v2 (
                    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
                    nome                TEXT NOT NULL UNIQUE,
                    nazione_origine     TEXT,
                    note                TEXT,
                    created_at          TEXT NOT NULL DEFAULT (datetime('now')),
                    updated_at          TEXT NOT NULL DEFAULT (datetime('now'))
                )
            """)
            cur.execute("CREATE INDEX idx_vv2_nome ON vini_vitigni_v2 (nome)")
            print("  [125] CREATE TABLE vini_vitigni_v2")
        else:
            print("  [125] vini_vitigni_v2 già esistente, skip")

        # ── 5. vini_madre_v2 ──
        # FK soft (SQLite non forzata): puntano alle nuove anagrafiche.
        if not _table_exists(cur, "vini_madre_v2"):
            cur.execute("""
                CREATE TABLE vini_madre_v2 (
                    id                      INTEGER PRIMARY KEY AUTOINCREMENT,
                    produttore_id           INTEGER NOT NULL,
                    fornitore_id            INTEGER,
                    denominazione_id        INTEGER,
                    descrizione             TEXT NOT NULL,
                    tipologia               TEXT NOT NULL,
                    nazione                 TEXT,
                    regione                 TEXT,
                    grado_alcolico_tipico   REAL,
                    abbinamenti             TEXT,
                    note_madre              TEXT,
                    created_at              TEXT NOT NULL DEFAULT (datetime('now')),
                    updated_at              TEXT NOT NULL DEFAULT (datetime('now'))
                )
            """)
            cur.execute("CREATE INDEX idx_vm2_produttore ON vini_madre_v2 (produttore_id)")
            cur.execute("CREATE INDEX idx_vm2_fornitore ON vini_madre_v2 (fornitore_id)")
            cur.execute("CREATE INDEX idx_vm2_denominazione ON vini_madre_v2 (denominazione_id)")
            cur.execute("CREATE INDEX idx_vm2_descrizione ON vini_madre_v2 (descrizione)")
            print("  [125] CREATE TABLE vini_madre_v2")
        else:
            print("  [125] vini_madre_v2 già esistente, skip")

        # ── 6. vini_bottiglie_v2 ──
        # Struttura completa: tutte le colonne di vini_magazzino + madre_id +
        # 5 slot vitigno. I campi anagrafici (PRODUTTORE, REGIONE, ecc.) restano
        # per retrocompat e ridondanza voluta (sync-ati via service).
        if not _table_exists(cur, "vini_bottiglie_v2"):
            cur.execute("""
                CREATE TABLE vini_bottiglie_v2 (
                    id              INTEGER PRIMARY KEY AUTOINCREMENT,
                    id_excel        INTEGER,

                    -- Link al madre (NULL = vino orfano sopravvissuto)
                    madre_id        INTEGER,

                    -- Anagrafica base (sincronizzata da madre, fallback per orfani)
                    TIPOLOGIA       TEXT NOT NULL,
                    NAZIONE         TEXT NOT NULL,
                    CODICE          TEXT,
                    REGIONE         TEXT,
                    DESCRIZIONE     TEXT NOT NULL,
                    DENOMINAZIONE   TEXT,
                    ANNATA          TEXT,
                    VITIGNI         TEXT,
                    GRADO_ALCOLICO  REAL,
                    FORMATO         TEXT,
                    PRODUTTORE      TEXT,
                    DISTRIBUTORE    TEXT,
                    RAPPRESENTANTE  TEXT DEFAULT '',

                    -- Prezzi
                    PREZZO_CARTA            REAL,
                    EURO_LISTINO            REAL,
                    SCONTO                  REAL,
                    NOTE_PREZZO             TEXT,
                    PREZZO_CALICE           REAL,
                    PREZZO_CALICE_MANUALE   INTEGER DEFAULT 0,

                    -- Flag operativi (INTEGER 0/1 post V-H.E)
                    CARTA               INTEGER,
                    IPRATICO            INTEGER,
                    BIOLOGICO           INTEGER DEFAULT 0,
                    VENDITA_CALICE      INTEGER DEFAULT 0,
                    FORZA_PREZZO        INTEGER DEFAULT 0,
                    BOTTIGLIA_APERTA    INTEGER DEFAULT 0,
                    DATA_APERTURA       TEXT,
                    ABBINAMENTI         TEXT,

                    -- Stati codificati
                    STATO_VENDITA       TEXT,
                    STATO_RIORDINO      TEXT,
                    STATO_CONSERVAZIONE TEXT,
                    NOTE_STATO          TEXT,

                    -- Locazioni e quantità
                    FRIGORIFERO         TEXT,
                    QTA_FRIGO           INTEGER DEFAULT 0,
                    LOCAZIONE_1         TEXT,
                    QTA_LOC1            INTEGER DEFAULT 0,
                    LOCAZIONE_2         TEXT,
                    QTA_LOC2            INTEGER DEFAULT 0,
                    LOCAZIONE_3         TEXT,
                    QTA_LOC3            INTEGER DEFAULT 0,
                    QTA_TOTALE          INTEGER DEFAULT 0,

                    -- 5 slot vitigno con percentuale
                    vitigno_1_id    INTEGER,
                    vitigno_1_pct   REAL,
                    vitigno_2_id    INTEGER,
                    vitigno_2_pct   REAL,
                    vitigno_3_id    INTEGER,
                    vitigno_3_pct   REAL,
                    vitigno_4_id    INTEGER,
                    vitigno_4_pct   REAL,
                    vitigno_5_id    INTEGER,
                    vitigno_5_pct   REAL,

                    -- Metadati
                    NOTE        TEXT,
                    ORIGINE     TEXT,
                    CREATED_AT  TEXT,
                    UPDATED_AT  TEXT
                )
            """)
            # Indici principali (replicati da vini_magazzino + 1 per madre_id)
            cur.execute("CREATE INDEX idx_vb2_tipologia ON vini_bottiglie_v2 (TIPOLOGIA)")
            cur.execute("CREATE INDEX idx_vb2_regione ON vini_bottiglie_v2 (REGIONE)")
            cur.execute("CREATE INDEX idx_vb2_produttore ON vini_bottiglie_v2 (PRODUTTORE)")
            cur.execute("CREATE INDEX idx_vb2_descrizione ON vini_bottiglie_v2 (DESCRIZIONE)")
            cur.execute("CREATE INDEX idx_vb2_distributore ON vini_bottiglie_v2 (DISTRIBUTORE)")
            cur.execute("CREATE INDEX idx_vb2_madre ON vini_bottiglie_v2 (madre_id)")
            cur.execute("CREATE UNIQUE INDEX idx_vb2_id_excel_unique ON vini_bottiglie_v2 (id_excel) WHERE id_excel IS NOT NULL")
            print("  [125] CREATE TABLE vini_bottiglie_v2")
        else:
            print("  [125] vini_bottiglie_v2 già esistente, skip")

        # ── 7. Popolamento vini_bottiglie_v2 da vini_magazzino ──
        # Idempotente: copia solo se la tabella _v2 è vuota.
        n_v2 = cur.execute("SELECT COUNT(*) FROM vini_bottiglie_v2").fetchone()[0]
        if n_v2 == 0:
            # Colonne IN COMUNE tra vini_magazzino e vini_bottiglie_v2.
            # `madre_id` e i 10 slot vitigno restano NULL (popolati in Fase 5).
            common_cols = """
                id, id_excel,
                TIPOLOGIA, NAZIONE, CODICE, REGIONE,
                DESCRIZIONE, DENOMINAZIONE, ANNATA, VITIGNI, GRADO_ALCOLICO, FORMATO,
                PRODUTTORE, DISTRIBUTORE, RAPPRESENTANTE,
                PREZZO_CARTA, EURO_LISTINO, SCONTO, NOTE_PREZZO,
                PREZZO_CALICE, PREZZO_CALICE_MANUALE,
                CARTA, IPRATICO, BIOLOGICO, VENDITA_CALICE,
                FORZA_PREZZO, BOTTIGLIA_APERTA, DATA_APERTURA, ABBINAMENTI,
                STATO_VENDITA, STATO_RIORDINO, STATO_CONSERVAZIONE, NOTE_STATO,
                FRIGORIFERO, QTA_FRIGO, LOCAZIONE_1, QTA_LOC1,
                LOCAZIONE_2, QTA_LOC2, LOCAZIONE_3, QTA_LOC3, QTA_TOTALE,
                NOTE, ORIGINE, CREATED_AT, UPDATED_AT
            """
            cur.execute(f"""
                INSERT INTO vini_bottiglie_v2 ({common_cols})
                SELECT {common_cols}
                FROM vini_magazzino
            """)
            n_copied = cur.rowcount
            print(f"  [125] copiati {n_copied} vini da vini_magazzino → vini_bottiglie_v2")
        else:
            print(f"  [125] vini_bottiglie_v2 già popolata ({n_v2} righe), skip copia")

        mag.commit()
        print("  [125] DONE — impalcatura pronta. Marco continua a usare il modulo Vini normalmente.")
        print("  [125] Prossime fasi: 2) endpoint scheletro · 3) seed denominazioni · 4) seed vitigni · 5) migrazione dati")
    finally:
        mag.close()
