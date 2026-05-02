"""
Migrazione 077: Turni v2 Fase 10 — estensione tabelle template settimanali.

Contesto:
- Le tabelle `turni_template` e `turni_template_righe` sono state create in
  migrazione 071 con uno schema MINIMO: (dipendente_id, giorno_settimana,
  turno_tipo_id, note). Non basta per ricreare fedelmente una settimana del
  foglio attuale, che ha anche servizio (PRANZO/CENA), slot_index, orari
  override (ora_inizio/fine), stato (CONFERMATO/OPZIONALE) e appartiene a un
  reparto specifico.
- Questa migrazione estende lo schema con i campi mancanti SENZA ricreare le
  tabelle (rispetta dati esistenti, anche se nella pratica 071-076 non hanno
  ancora popolato nulla).

Modifiche su dipendenti.sqlite3:

turni_template
- + reparto_id INTEGER  (FK -> reparti.id, template per reparto specifico)

turni_template_righe
- + servizio TEXT        (PRANZO / CENA / NULL)
- + slot_index INTEGER   (posizione nella colonna del servizio, 0-based)
- + ora_inizio TEXT      (HH:MM, override opzionale)
- + ora_fine TEXT        (HH:MM, override opzionale)
- + stato TEXT DEFAULT 'CONFERMATO'  (CONFERMATO / OPZIONALE / ANNULLATO)

NOTA: turno_tipo_id resta NOT NULL da 071. Il service passera' sempre il
turno_tipo "default reparto" se Marco non lo specifica esplicitamente.

Idempotente: ogni ALTER e' protetto da check PRAGMA table_info.
"""

import sqlite3

from app.utils.locale_data import locale_data_path

# R6.5 — path tenant-aware
DIP_DB = locale_data_path("dipendenti.sqlite3")


def _cols(conn, table):
    return {r[1] for r in conn.execute(f"PRAGMA table_info({table})").fetchall()}


def _add_col(conn, table, col, ddl):
    if col in _cols(conn, table):
        print(f"  · {table}.{col} gia' presente")
        return
    try:
        conn.execute(f"ALTER TABLE {table} ADD COLUMN {col} {ddl}")
        print(f"  + {table}.{col}")
    except sqlite3.OperationalError as e:
        print(f"  ⚠ {table}.{col}: {e}")


def upgrade(conn):
    """conn e' foodcost.db (ignorato). Apriamo dipendenti.sqlite3 direttamente."""
    if not DIP_DB.exists():
        print("  · dipendenti.sqlite3 non esiste ancora, skip")
        return

    dconn = sqlite3.connect(str(DIP_DB))
    try:
        has_tpl = dconn.execute(
            "SELECT name FROM sqlite_master WHERE type='table' AND name='turni_template'"
        ).fetchone()
        if not has_tpl:
            print("  · turni_template non esiste (migrazione 071 non applicata?), skip")
            return

        # turni_template.reparto_id
        _add_col(dconn, "turni_template", "reparto_id", "INTEGER")

        # turni_template_righe.*
        _add_col(dconn, "turni_template_righe", "servizio", "TEXT")
        _add_col(dconn, "turni_template_righe", "slot_index", "INTEGER")
        _add_col(dconn, "turni_template_righe", "ora_inizio", "TEXT")
        _add_col(dconn, "turni_template_righe", "ora_fine", "TEXT")
        _add_col(
            dconn,
            "turni_template_righe",
            "stato",
            "TEXT DEFAULT 'CONFERMATO'",
        )

        # Indici utili
        dconn.execute(
            "CREATE INDEX IF NOT EXISTS idx_turni_template_reparto "
            "ON turni_template(reparto_id)"
        )
        dconn.execute(
            "CREATE INDEX IF NOT EXISTS idx_tmpl_righe_giorno "
            "ON turni_template_righe(template_id, giorno_settimana)"
        )
        print("  + idx_turni_template_reparto, idx_tmpl_righe_giorno")

        dconn.commit()
    finally:
        dconn.close()
