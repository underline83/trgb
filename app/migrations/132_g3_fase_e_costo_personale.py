"""
Migrazione 132 — G.3 Fase E: schema costo personale completo (2026-05-16)

CONTESTO:
  Chiusa Fase D di G.3 con verifica sui dati reali di Aprile 2026, scoperto
  che il "costo personale" mostrato nel CE è solo la somma dei netti
  bonificati (`cg_uscite tipo='STIPENDIO'`). Manca tutto il "costo aziendale
  vero": carico ditta INPS, ratei 13ª/14ª/ferie/permessi, TFR maturato, INAIL.

  Esempio Aprile 2026 (dai PDF del commercialista 3GOBBI_ELAB_4.pdf,
  3GOBBI_F24_4.pdf, 3GOBBI_LUL_4.pdf):
    - Netti bonificati (oggi nel CE):                       € 12.140
    - Costo aziendale vero (ELAB pag.8 COSTO CONSUNTIVO):   € 20.489
    - Differenza nascosta:                                   €  8.349 /mese (+69%)
  Effetto sul P&L Aprile: utile passa da +13,9% a -3,2% (perdita reale).

  Marco 2026-05-16: importeremo TRE PDF dal commercialista ogni mese:
    1. LUL (Libro Unico Lavoro)  → già importato in `buste_paga`
    2. ELAB (riepilogo paghe)    → NUOVO, popolerà dipendenti_costo_consuntivo
    3. F24 (versamenti)          → NUOVO, popolerà f24_versamenti

OBIETTIVI MIG 132:
  1. Tabella `dipendenti_costo_consuntivo` in dipendenti.sqlite3:
     una riga per dipendente per mese, con tutto il dettaglio costo (lordo,
     contributi ditta, ratei, contributi su ratei, TFR, INAIL, costo totale).
     È la "single source of truth" per il P&L del personale.

  2. Tabella `f24_versamenti` in foodcost.db:
     normalizza i versamenti F24 mensili (sezioni Erario/INPS/Regioni/Comuni/
     INAIL/Altri Enti) come liste di codici tributo con importo a debito/credito,
     periodo di competenza, raggruppamento (più codici dello stesso F24).
     Cross-modulo: collegabile con banca_movimenti per riconciliazione cassa.

  3. Indici per query veloci (anno+mese, raggruppamento, periodo_competenza).

DB COLPITI:
  - dipendenti.sqlite3 → dipendenti_costo_consuntivo
  - foodcost.db        → f24_versamenti

IDEMPOTENTE: CREATE TABLE IF NOT EXISTS + CREATE INDEX IF NOT EXISTS.

PROSSIME MIG / SESSIONI G.3 FASE E:
  - E.2/E.3: parser ELAB e F24 (app/services/elab_parser.py + f24_parser.py)
  - E.4:    UI upload 3 file in Dipendenti (LUL+ELAB+F24)
  - E.5:    refactor _aggregate_stipendi nel service Conto Economico
  - E.6:    tipo 'F24_STIPENDI' su cg_spese_fisse (anti-doppio competenza)
  - E.7:    mig 133 retro import gen-apr 2026 da PDF già archiviati
  - E.8:    tab "Costi mensili" sotto modulo Dipendenti
  - E.9:    rimozione warning banner CE "costo personale parziale"
"""
import sqlite3
from pathlib import Path


# ─────────────────────────────────────────────────────────────
# DDL — dipendenti_costo_consuntivo (in dipendenti.sqlite3)
# ─────────────────────────────────────────────────────────────

DDL_COSTO_CONSUNTIVO = """
CREATE TABLE IF NOT EXISTS dipendenti_costo_consuntivo (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    -- Coordinate temporali e dipendente
    anno INTEGER NOT NULL,
    mese INTEGER NOT NULL,
    dipendente_id INTEGER,                  -- FK soft dipendenti.id (NULL=non matchato)
    matricola TEXT,                         -- es. "20", "52" (codice azienda paghe)
    cognome_nome TEXT,                      -- "CARMINATI MARCO" come scritto nell'ELAB

    -- Dati base lavoro
    ore_lavorate REAL,
    retribuzione_lorda REAL,                -- "Lordo" (es. 2353,32 per Sola)
    contributi_lordo REAL,                  -- "Contributi" su lordo (carico ditta), es. 744,74

    -- Lavoro straordinario (solo se presente in ELAB)
    ore_straord REAL,
    retribuzione_straord REAL,
    contributi_straord REAL,

    -- Ratei (13a + 14a + ferie + permessi/ROL, somma maturata nel mese)
    ratei_importo REAL,                     -- es. 469,75 per Sola
    contributi_su_ratei REAL,               -- es. 145,39

    -- TFR maturato (quota mese)
    tfr_maturato REAL,                      -- es. 175,42

    -- INAIL del mese (premio + addizionale) — opzionale, può essere
    -- spalmato a livello azienda invece che per dipendente.
    inail_mese REAL,

    -- TOTALE COSTO AZIENDA del dipendente per il mese
    -- (= retribuzione_lorda + contributi_lordo + retribuzione_straord +
    --    contributi_straord + ratei_importo + contributi_su_ratei +
    --    tfr_maturato + inail_mese, somma da ELAB col "Totale")
    costo_totale REAL NOT NULL,

    -- Provenienza
    fonte_pdf TEXT,                         -- es. "3GOBBI_ELAB_4.pdf"
    fonte_hash TEXT,                        -- sha256 del PDF (anti re-import duplicato)
    importato_il TEXT DEFAULT CURRENT_TIMESTAMP,
    note TEXT,

    -- 1 record per (anno, mese, dipendente)
    UNIQUE (anno, mese, dipendente_id),
    UNIQUE (anno, mese, matricola)
);
"""

IDX_COSTO_CONSUNTIVO = [
    "CREATE INDEX IF NOT EXISTS idx_dcc_anno_mese ON dipendenti_costo_consuntivo (anno, mese);",
    "CREATE INDEX IF NOT EXISTS idx_dcc_dipendente ON dipendenti_costo_consuntivo (dipendente_id);",
    "CREATE INDEX IF NOT EXISTS idx_dcc_hash ON dipendenti_costo_consuntivo (fonte_hash);",
]


# ─────────────────────────────────────────────────────────────
# DDL — f24_versamenti (in foodcost.db)
# ─────────────────────────────────────────────────────────────

DDL_F24_VERSAMENTI = """
CREATE TABLE IF NOT EXISTS f24_versamenti (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    -- ID di raggruppamento: tutti i tributi della stessa delega F24 hanno
    -- lo stesso raggruppamento_id. Es. F24 stipendi Aprile 2026 ha N righe
    -- (1001 IRPEF, DM10 INPS, 3802 add. regionale, ...) tutte con stesso id.
    raggruppamento_id TEXT NOT NULL,        -- es. "F24_2026-04_stipendi"

    -- Coordinate temporali
    data_scadenza TEXT,                     -- es. "2026-05-16" (data versamento F24)
    anno_competenza INTEGER,                -- es. 2026 (anno del lavoro/dovuto)
    mese_competenza INTEGER,                -- es. 4 (mese del lavoro/dovuto)

    -- Sezione del modulo F24
    sezione TEXT NOT NULL,                  -- 'ERARIO' | 'INPS' | 'REGIONI' |
                                            -- 'IMU_TRIBUTI_LOCALI' | 'INAIL' |
                                            -- 'ALTRI_ENTI'

    -- Codice tributo (es. 1001=IRPEF dip, 1040=ritenute autonomi, DM10=INPS,
    -- 3802=add regionale, 3847=add comunale acconto, 13100=INAIL, ...)
    codice_tributo TEXT NOT NULL,
    descrizione_tributo TEXT,               -- legenda human-readable

    -- Periodo riferimento del SINGOLO codice tributo (può differire dal
    -- mese_competenza, es. recuperi mesi precedenti compensati)
    periodo_rif_anno INTEGER,
    periodo_rif_mese INTEGER,

    -- Codici aggiuntivi per sezione
    codice_sede TEXT,                       -- INPS: 1200, ...; INAIL: 13100, ...
    matricola_inps TEXT,                    -- es. 1213048807
    codice_regione TEXT,                    -- per add regionali (es. "10" Lombardia)
    codice_comune TEXT,                     -- catastale (A794 Bergamo, C937 Comun Nuov)
    codice_ente TEXT,                       -- INPS "C10", "DM10", "EBTU", "EST1"

    -- Importi
    importo_debito REAL DEFAULT 0,          -- importo a debito (versato)
    importo_credito REAL DEFAULT 0,         -- importo a credito (compensato)
    saldo REAL,                             -- saldo singolo codice (debito - credito)

    -- Riconciliazione cassa con banca
    banca_movimento_id INTEGER,             -- FK soft banca_movimenti.id
    data_pagamento_effettiva TEXT,          -- dalla banca, quando regolato

    -- Provenienza
    fonte_pdf TEXT,                         -- es. "3GOBBI_F24_4.pdf"
    fonte_hash TEXT,                        -- sha256 del PDF
    pagina_pdf INTEGER,                     -- 1, 2, 3 (alcuni F24 hanno più pagine)
    importato_il TEXT DEFAULT CURRENT_TIMESTAMP,
    note TEXT
);
"""

IDX_F24_VERSAMENTI = [
    "CREATE INDEX IF NOT EXISTS idx_f24_raggruppamento ON f24_versamenti (raggruppamento_id);",
    "CREATE INDEX IF NOT EXISTS idx_f24_competenza ON f24_versamenti (anno_competenza, mese_competenza);",
    "CREATE INDEX IF NOT EXISTS idx_f24_scadenza ON f24_versamenti (data_scadenza);",
    "CREATE INDEX IF NOT EXISTS idx_f24_banca ON f24_versamenti (banca_movimento_id);",
    "CREATE INDEX IF NOT EXISTS idx_f24_codice ON f24_versamenti (codice_tributo);",
    "CREATE INDEX IF NOT EXISTS idx_f24_hash ON f24_versamenti (fonte_hash);",
]


# ─────────────────────────────────────────────────────────────
# UPGRADE
# ─────────────────────────────────────────────────────────────

def _resolve_dipendenti_db(conn: sqlite3.Connection) -> Path | None:
    """Ricava il path di dipendenti.sqlite3 dalla connessione foodcost.db.
    Pattern usato già dalla mig 060."""
    db_list = conn.execute("PRAGMA database_list").fetchall()
    main_path = None
    for _, name, path in db_list:
        if name == "main":
            main_path = Path(path)
            break
    if main_path is None:
        return None
    return main_path.parent / "dipendenti.sqlite3"


def upgrade(conn: sqlite3.Connection) -> None:
    """conn = foodcost.db (passata dal runner)."""
    cur = conn.cursor()

    # ─── 1. f24_versamenti in foodcost.db ───
    print("  [132] CREATE TABLE f24_versamenti in foodcost.db...")
    cur.executescript(DDL_F24_VERSAMENTI)
    for idx_sql in IDX_F24_VERSAMENTI:
        cur.execute(idx_sql)

    # Conta righe (sarà 0 al primo run, >0 al re-run = no-op)
    n_f24 = cur.execute("SELECT COUNT(*) FROM f24_versamenti").fetchone()[0]
    print(f"  [132]   ok — tabella f24_versamenti pronta ({n_f24} righe esistenti)")

    # ─── 2. dipendenti_costo_consuntivo in dipendenti.sqlite3 ───
    dip_path = _resolve_dipendenti_db(conn)
    if dip_path is None:
        print("  [132] ⚠ impossibile risolvere path dipendenti.sqlite3 — skip parte dipendenti")
    elif not dip_path.exists():
        print(f"  [132] ⚠ {dip_path} non esiste — skip parte dipendenti")
    else:
        print(f"  [132] CREATE TABLE dipendenti_costo_consuntivo in {dip_path.name}...")
        dip_conn = sqlite3.connect(str(dip_path))
        try:
            dip_cur = dip_conn.cursor()
            dip_cur.executescript(DDL_COSTO_CONSUNTIVO)
            for idx_sql in IDX_COSTO_CONSUNTIVO:
                dip_cur.execute(idx_sql)
            dip_conn.commit()
            n_dcc = dip_cur.execute(
                "SELECT COUNT(*) FROM dipendenti_costo_consuntivo"
            ).fetchone()[0]
            print(f"  [132]   ok — tabella dipendenti_costo_consuntivo pronta ({n_dcc} righe esistenti)")
        finally:
            dip_conn.close()

    print("  [132] DONE")
