# @version: v1.1-tasks-scheduler (ex-cucina, Phase B sessione 46)
# -*- coding: utf-8 -*-
"""
Scheduler Task Manager (ex-Cucina) — genera istanze giornaliere e marca scadute.

In MVP tutti i template hanno frequenza=GIORNALIERA. Lo scheduler:
  1. Per ogni giorno nel range: crea un'istanza per ogni template attivo
     (INSERT OR IGNORE per idempotenza, grazie al UNIQUE su (template_id,
     data_riferimento, turno)).
  2. Marca SCADUTE le istanze con scadenza_at < adesso e stato
     ancora APERTA/IN_CORSO.

Non ha sveglia autonoma: e' chiamato in modo "lazy" da dashboard_router
a ogni apertura Home (fire-and-forget) e da endpoint admin dedicati.
"""

from __future__ import annotations

import logging
import sqlite3
from datetime import date, datetime, timedelta
from typing import Dict, Optional

logger = logging.getLogger("trgb.tasks.scheduler")


# ─── Helpers ───────────────────────────────────────────────────────────

def _compute_scadenza_at(data_rif: date, ora_scadenza_entro: Optional[str]) -> Optional[str]:
    """
    Combina data_riferimento + ora_scadenza_entro (HH:MM) in ISO 'YYYY-MM-DD HH:MM:00'.
    Se l'ora manca: None (istanza aperta a tempo indefinito).
    Edge case orario di chiusura tipo "00:30" → scade a mezzanotte e mezza
    del giorno *successivo*.
    """
    if not ora_scadenza_entro:
        return None
    try:
        hh, mm = ora_scadenza_entro.split(":")
        hh, mm = int(hh), int(mm)
    except Exception:
        return None

    scad = datetime.combine(data_rif, datetime.min.time()).replace(hour=hh, minute=mm)
    # Orari "post-mezzanotte" (00:00-04:00) interpretati come giorno successivo
    if hh < 4:
        scad = scad + timedelta(days=1)
    return scad.strftime("%Y-%m-%d %H:%M:%S")


def _turno_compat(template_turno: Optional[str], turno_filtro: Optional[str]) -> bool:
    """True se il turno del template e' compatibile col filtro."""
    if not turno_filtro:
        return True
    if not template_turno:
        # Template senza turno → visibile sempre
        return True
    return template_turno == turno_filtro


# ─── Generazione istanze ───────────────────────────────────────────────

def genera_istanze_per_data(conn: sqlite3.Connection, data_rif: date) -> int:
    """
    Crea istanze per tutti i template ATTIVI su data_rif.
    Idempotente grazie al UNIQUE constraint.

    Restituisce il numero di istanze effettivamente create (nuove).
    """
    cur = conn.cursor()

    # Template attivi con frequenza GIORNALIERA (unica in MVP).
    # Phase A multi-reparto: copiamo reparto nell'istanza per filtri veloci.
    rows = cur.execute("""
        SELECT id, turno, ora_scadenza_entro, reparto
          FROM checklist_template
         WHERE attivo = 1
           AND frequenza = 'GIORNALIERA'
    """).fetchall()

    # Verifica una volta sola se checklist_instance ha la colonna reparto
    # (post migrazione 085). Se no, useremo l'insert legacy senza reparto.
    try:
        cur.execute("PRAGMA table_info(checklist_instance)")
        has_reparto = any(row[1] == "reparto" for row in cur.fetchall())
    except Exception:
        has_reparto = False

    created = 0
    data_str = data_rif.isoformat()

    for r in rows:
        tid = r["id"]
        turno = r["turno"]
        reparto = (r["reparto"] or "cucina").strip().lower() if r["reparto"] else "cucina"
        scadenza_at = _compute_scadenza_at(data_rif, r["ora_scadenza_entro"])

        # INSERT OR IGNORE — se l'istanza esiste gia' (UNIQUE), non fa nulla
        if has_reparto:
            cur.execute("""
                INSERT OR IGNORE INTO checklist_instance
                    (template_id, data_riferimento, turno, scadenza_at, stato, reparto)
                VALUES (?, ?, ?, ?, 'APERTA', ?)
            """, (tid, data_str, turno, scadenza_at, reparto))
            if cur.rowcount > 0:
                created += 1
            continue

        cur.execute("""
            INSERT OR IGNORE INTO checklist_instance
                (template_id, data_riferimento, turno, scadenza_at, stato)
            VALUES (?, ?, ?, ?, 'APERTA')
        """, (tid, data_str, turno, scadenza_at))

        if cur.rowcount > 0:
            created += 1

    conn.commit()
    return created


def genera_istanze_range(conn: sqlite3.Connection, data_da: date, data_a: date) -> int:
    """Genera istanze per ogni giorno nel range [data_da, data_a] (inclusi)."""
    if data_a < data_da:
        return 0
    total = 0
    d = data_da
    while d <= data_a:
        total += genera_istanze_per_data(conn, d)
        d += timedelta(days=1)
    return total


# ─── Check scadenze ────────────────────────────────────────────────────

def check_scadenze(conn: sqlite3.Connection, ora_corrente: Optional[datetime] = None) -> int:
    """
    Marca SCADUTE le istanze con scadenza_at < ora_corrente e stato in
    (APERTA, IN_CORSO).

    Restituisce il numero di istanze marcate.
    """
    if ora_corrente is None:
        ora_corrente = datetime.now()
    now_str = ora_corrente.strftime("%Y-%m-%d %H:%M:%S")

    cur = conn.cursor()
    cur.execute("""
        UPDATE checklist_instance
           SET stato = 'SCADUTA'
         WHERE stato IN ('APERTA', 'IN_CORSO')
           AND scadenza_at IS NOT NULL
           AND scadenza_at < ?
    """, (now_str,))
    conn.commit()
    return cur.rowcount or 0


# ─── Score compliance ──────────────────────────────────────────────────

def calcola_score_compliance(conn: sqlite3.Connection, instance_id: int) -> int:
    """
    Ritorna lo score 0-100 basato su:
    - count item OK rispetto al totale item del template
    - item FAIL e SKIPPED contano come 0
    - se ci sono item obbligatori non eseguiti → score = 0

    Nota: in MVP non eroga penalita' fuori-range; l'operatore mette OK/FAIL
    manualmente, lo score conta solo gli OK.
    """
    cur = conn.cursor()
    row = cur.execute(
        "SELECT template_id FROM checklist_instance WHERE id = ?",
        (instance_id,),
    ).fetchone()
    if not row:
        return 0
    tid = row["template_id"]

    total = cur.execute(
        "SELECT COUNT(*) FROM checklist_item WHERE template_id = ?",
        (tid,),
    ).fetchone()[0]
    if total == 0:
        return 100

    ok = cur.execute("""
        SELECT COUNT(*) FROM checklist_execution
         WHERE instance_id = ? AND stato = 'OK'
    """, (instance_id,)).fetchone()[0]

    return int(round(100.0 * ok / total))


# ─── Trigger convenience ───────────────────────────────────────────────

def trigger_scheduler(days_ahead: int = 1) -> Dict[str, int]:
    """
    Trigger unico: genera istanze per oggi e i prossimi N giorni,
    poi controlla le scadenze. Ritorna summary.
    Usato dal dashboard_router in modalita' fire-and-forget.
    """
    from app.models.tasks_db import get_tasks_conn
    conn = get_tasks_conn()
    try:
        today = date.today()
        created = genera_istanze_range(conn, today, today + timedelta(days=days_ahead))
        scaduted = check_scadenze(conn)
        return {"created": created, "marked_scaduta": scaduted}
    finally:
        conn.close()
