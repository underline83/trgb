"""
Migrazione 071: Turni v2 — schema base (riveduta dopo decisioni Marco 2026-04-14)

Cosa fa (su dipendenti.sqlite3):

REPARTI (nuovo)
- Crea tabella `reparti` (SALA, CUCINA, estendibile in futuro)
- Ogni reparto ha orari standard pranzo/cena e pause staff (in minuti)
- Seed SALA (10:30-15:30 / 18:00-24:00) + CUCINA (09:30-15:30 / 17:30-23:00)
- Pause staff: 30 min pranzo + 30 min cena (1h totale per chi fa doppio turno)

DIPENDENTI (estensione)
- Colonna `reparto_id` (FK → reparti.id)
- Colonna `colore` (HEX univoco per persona, lo usa il foglio settimanale)

TURNI_TIPI (estensione)
- categoria TEXT NOT NULL DEFAULT 'LAVORO'  (LAVORO / RIPOSO / ASSENZA)
- ore_lavoro REAL  (override manuale, NULL = calcolo da ora_inizio/ora_fine)
- icona TEXT
- servizio TEXT  (PRANZO / CENA / NULL=tutto-giorno) — serve per il foglio settimana

TURNI_CALENDARIO (estensione)
- ore_effettive REAL  (override sul singolo giorno)
- origine TEXT NOT NULL DEFAULT 'MANUALE'  (MANUALE / COPIA / TEMPLATE)
- origine_ref_id TEXT
- NB: il valore CHIAMATA per `stato` non richiede ALTER TABLE (campo libero TEXT)

INDICI
- idx_turni_cal_data, idx_turni_cal_dip_data, idx_dipendenti_reparto

TEMPLATE SETTIMANA
- turni_template + turni_template_righe (per Fase 10)

NOTE IMPORTANTI
- NIENTE seed RIPOSO (workflow Marco: chi non compare nel foglio è a casa)
- NIENTE seed FERIE/MALATTIA/PERMESSO (vanno nel modulo Presenze v2.3)
- Chiusura settimanale: NON duplicata qui — viene letta da
  app/data/closures_config.json tramite get_closures_config() (modulo Vendite)

Idempotente: ogni ALTER e' protetto, INSERT OR IGNORE su codici univoci.

Riferimenti:
- docs/modulo_dipendenti_turni_v2.md — piano completo
- app/models/dipendenti_db.py — schema base esistente
- app/routers/closures_config_router.py — chiusure settimanali (modulo Vendite)
"""

import sqlite3
from pathlib import Path

DIPENDENTI_DB = Path(__file__).resolve().parent.parent / "data" / "dipendenti.sqlite3"


# Palette colori dipendenti — 14 tinte distinte, alta saturazione, pensate per
# essere ben distinguibili anche in stampa B/N (luminanza variata).
PALETTE_DIPENDENTI = [
    "#E8402B",  # brand-red
    "#2E7BE8",  # brand-blue
    "#2EB872",  # brand-green
    "#F59E0B",  # amber
    "#8B5CF6",  # purple
    "#EC4899",  # pink
    "#06B6D4",  # cyan
    "#84CC16",  # lime
    "#EF4444",  # red-light
    "#3B82F6",  # blue-light
    "#A855F7",  # violet
    "#14B8A6",  # teal
    "#F97316",  # orange
    "#6366F1",  # indigo
]


def _add_column_if_missing(conn, table, column, ddl):
    """ALTER TABLE ADD COLUMN se la colonna non c'e' gia'."""
    cols = {row[1] for row in conn.execute(f"PRAGMA table_info({table})").fetchall()}
    if column not in cols:
        conn.execute(f"ALTER TABLE {table} ADD COLUMN {ddl}")


def upgrade(conn):
    """conn e' foodcost.db (ignorato). Apriamo dipendenti.sqlite3 direttamente."""
    if not DIPENDENTI_DB.exists():
        # init_dipendenti_db() creera' il DB con lo schema gia' aggiornato
        return

    dconn = sqlite3.connect(str(DIPENDENTI_DB))
    try:
        # Verifica che le tabelle esistano (DB potrebbe essere stato creato vuoto)
        tables = {
            row[0] for row in dconn.execute(
                "SELECT name FROM sqlite_master WHERE type='table'"
            ).fetchall()
        }
        if "turni_tipi" not in tables or "turni_calendario" not in tables:
            return  # init_dipendenti_db() pendente

        # ---------------------------------------------------------------
        # 1. REPARTI — nuova tabella + seed SALA / CUCINA
        # ---------------------------------------------------------------
        dconn.execute(
            """
            CREATE TABLE IF NOT EXISTS reparti (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              codice TEXT NOT NULL UNIQUE,
              nome TEXT NOT NULL,
              icona TEXT,
              colore TEXT,
              ordine INTEGER NOT NULL DEFAULT 0,
              attivo INTEGER NOT NULL DEFAULT 1,

              -- orari standard del reparto (override possibile sul singolo turno)
              pranzo_inizio TEXT,         -- "HH:MM"
              pranzo_fine   TEXT,         -- "HH:MM"
              cena_inizio   TEXT,
              cena_fine     TEXT,

              -- pause staff in minuti (da scalare dal calcolo ore lavorate)
              pausa_pranzo_min INTEGER NOT NULL DEFAULT 30,
              pausa_cena_min   INTEGER NOT NULL DEFAULT 30,

              created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
              updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
            )
            """
        )

        reparti_seed = [
            # codice, nome, icona, colore, ordine, p_in, p_fi, c_in, c_fi
            ("SALA",   "Sala",   "🍽️", "#2E7BE8", 10, "10:30", "15:30", "18:00", "24:00"),
            ("CUCINA", "Cucina", "👨‍🍳", "#E8402B", 20, "09:30", "15:30", "17:30", "23:00"),
        ]
        for s in reparti_seed:
            dconn.execute(
                """
                INSERT OR IGNORE INTO reparti
                (codice, nome, icona, colore, ordine, attivo,
                 pranzo_inizio, pranzo_fine, cena_inizio, cena_fine,
                 pausa_pranzo_min, pausa_cena_min)
                VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?, ?, 30, 30)
                """,
                s
            )

        # ---------------------------------------------------------------
        # 2. DIPENDENTI: reparto_id + colore
        # ---------------------------------------------------------------
        _add_column_if_missing(
            dconn, "dipendenti", "reparto_id",
            "reparto_id INTEGER REFERENCES reparti(id)"
        )
        _add_column_if_missing(
            dconn, "dipendenti", "colore",
            "colore TEXT"
        )
        dconn.execute(
            "CREATE INDEX IF NOT EXISTS idx_dipendenti_reparto "
            "ON dipendenti(reparto_id)"
        )

        # Backfill colore: assegna un colore della palette ai dipendenti che ne sono privi
        # rotazione semplice per id — se due dipendenti hanno colori troppo simili,
        # Marco li potrà cambiare a mano dall'anagrafica.
        rows = dconn.execute(
            "SELECT id FROM dipendenti WHERE colore IS NULL OR colore = '' ORDER BY id"
        ).fetchall()
        for i, (did,) in enumerate(rows):
            colore = PALETTE_DIPENDENTI[i % len(PALETTE_DIPENDENTI)]
            dconn.execute(
                "UPDATE dipendenti SET colore = ? WHERE id = ?",
                (colore, did)
            )

        # Backfill reparto_id: deduzione dal campo `ruolo` (se contiene "sala" → SALA, "cuoco/chef/cucina" → CUCINA).
        # Se non si capisce, lascia NULL (Marco lo sistemerà a mano).
        sala_id = dconn.execute("SELECT id FROM reparti WHERE codice='SALA'").fetchone()
        cucina_id = dconn.execute("SELECT id FROM reparti WHERE codice='CUCINA'").fetchone()
        sala_id = sala_id[0] if sala_id else None
        cucina_id = cucina_id[0] if cucina_id else None

        rows = dconn.execute(
            "SELECT id, ruolo FROM dipendenti WHERE reparto_id IS NULL"
        ).fetchall()
        for did, ruolo in rows:
            r = (ruolo or "").lower()
            target = None
            if any(k in r for k in ("sala", "cameriere", "cameriera", "barista", "sommelier")):
                target = sala_id
            elif any(k in r for k in ("cuoco", "cuoca", "chef", "cucina", "pizzaiolo", "lavapiatti", "aiuto cucina")):
                target = cucina_id
            if target:
                dconn.execute(
                    "UPDATE dipendenti SET reparto_id = ? WHERE id = ?",
                    (target, did)
                )

        # ---------------------------------------------------------------
        # 3. TURNI_TIPI: nuove colonne (categoria, ore_lavoro, icona, servizio)
        # ---------------------------------------------------------------
        _add_column_if_missing(
            dconn, "turni_tipi", "categoria",
            "categoria TEXT NOT NULL DEFAULT 'LAVORO'"
        )
        _add_column_if_missing(
            dconn, "turni_tipi", "ore_lavoro",
            "ore_lavoro REAL"
        )
        _add_column_if_missing(
            dconn, "turni_tipi", "icona",
            "icona TEXT"
        )
        _add_column_if_missing(
            dconn, "turni_tipi", "servizio",
            "servizio TEXT"   # 'PRANZO' / 'CENA' / NULL=tutto-giorno
        )

        # ---------------------------------------------------------------
        # 4. TURNI_CALENDARIO: nuove colonne
        #    NB: 'stato' accetta CONFERMATO / CHIAMATA / ANNULLATO (campo libero TEXT,
        #    nessun ALTER necessario)
        # ---------------------------------------------------------------
        _add_column_if_missing(
            dconn, "turni_calendario", "ore_effettive",
            "ore_effettive REAL"
        )
        _add_column_if_missing(
            dconn, "turni_calendario", "origine",
            "origine TEXT NOT NULL DEFAULT 'MANUALE'"
        )
        _add_column_if_missing(
            dconn, "turni_calendario", "origine_ref_id",
            "origine_ref_id TEXT"
        )

        # ---------------------------------------------------------------
        # 5. Indici prestazionali
        # ---------------------------------------------------------------
        dconn.execute(
            "CREATE INDEX IF NOT EXISTS idx_turni_cal_data "
            "ON turni_calendario(data)"
        )
        dconn.execute(
            "CREATE INDEX IF NOT EXISTS idx_turni_cal_dip_data "
            "ON turni_calendario(dipendente_id, data)"
        )

        # ---------------------------------------------------------------
        # 6. Tabelle template settimanali (per Fase 10)
        # ---------------------------------------------------------------
        dconn.execute(
            """
            CREATE TABLE IF NOT EXISTS turni_template (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              nome TEXT NOT NULL,
              descrizione TEXT,
              attivo INTEGER NOT NULL DEFAULT 1,
              created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
              updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
            )
            """
        )
        dconn.execute(
            """
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
            """
        )
        dconn.execute(
            "CREATE INDEX IF NOT EXISTS idx_tmpl_righe_tmpl "
            "ON turni_template_righe(template_id)"
        )

        # ---------------------------------------------------------------
        # 7. Backfill ore_lavoro per i turni LAVORO esistenti
        #    Calcolo: differenza ora_fine - ora_inizio in ore decimali
        #    Solo dove ore_lavoro IS NULL e categoria='LAVORO'
        #    NB: NON sottrae le pause staff qui — quelle vengono scalate
        #    dal calcolo orario nel servizio (turni_service.calcola_ore_nette)
        # ---------------------------------------------------------------
        rows = dconn.execute(
            "SELECT id, ora_inizio, ora_fine FROM turni_tipi "
            "WHERE ore_lavoro IS NULL AND categoria = 'LAVORO'"
        ).fetchall()
        for tid, oi, of in rows:
            try:
                if not oi or not of:
                    continue
                hi, mi = [int(x) for x in oi.split(":")[:2]]
                hf, mf = [int(x) for x in of.split(":")[:2]]
                start = hi + mi / 60.0
                end = hf + mf / 60.0
                ore = end - start if end >= start else (24 - start + end)
                dconn.execute(
                    "UPDATE turni_tipi SET ore_lavoro = ? WHERE id = ?",
                    (round(ore, 2), tid)
                )
            except Exception:
                # se i campi sono malformati lasciamo NULL: il FE fallback su 0
                pass

        # ---------------------------------------------------------------
        # 8. Backfill servizio sui turni_tipi esistenti
        #    Heuristica: se il nome contiene "pranzo"/"sera"/"cena" lo deduciamo,
        #    altrimenti usiamo l'orario (inizio < 17:00 → PRANZO, altrimenti CENA).
        # ---------------------------------------------------------------
        rows = dconn.execute(
            "SELECT id, nome, ora_inizio FROM turni_tipi "
            "WHERE servizio IS NULL AND categoria = 'LAVORO'"
        ).fetchall()
        for tid, nome, oi in rows:
            n = (nome or "").lower()
            servizio = None
            if "pranzo" in n or "lunch" in n or "mattin" in n:
                servizio = "PRANZO"
            elif "cena" in n or "sera" in n or "dinner" in n:
                servizio = "CENA"
            elif oi:
                try:
                    h = int(oi.split(":")[0])
                    servizio = "PRANZO" if h < 17 else "CENA"
                except Exception:
                    pass
            if servizio:
                dconn.execute(
                    "UPDATE turni_tipi SET servizio = ? WHERE id = ?",
                    (servizio, tid)
                )

        dconn.commit()
    finally:
        dconn.close()
