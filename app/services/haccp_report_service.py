# @version: v1.0 — Modulo I Loop HACCP completo (sessione 59 cont., 2026-04-27)
# -*- coding: utf-8 -*-
"""
Servizio di reportistica HACCP mensile per chef/admin.

Aggrega dati da `tasks.sqlite3` (template + instances + executions + task_singolo)
in un payload utile per:
- Dashboard mensile (KPI compliance, top FAIL, eventi critici)
- Esportazione PDF registro mensile (iterazione successiva)

Stati di riferimento (vedi `app/schemas/tasks_schema.py`):
- checklist_instance.stato: APERTA, IN_CORSO, COMPLETATA, SCADUTA, SALTATA
- checklist_execution.stato: OK, FAIL, SKIPPED, PENDING

Nota: il "loop" qui è sintetico — gli alert/notifiche sono già gestiti dal
mattone M.F (alert_engine), questo modulo si concentra sull'aggregato consultivo
("ho fatto tutto questo mese? c'è qualcosa fuori soglia?").
"""
from __future__ import annotations

import calendar
import logging
from datetime import date
from typing import Any, Dict, List

from app.models.tasks_db import get_tasks_conn

logger = logging.getLogger("trgb.haccp_report")


def _month_bounds(anno: int, mese: int) -> tuple[str, str]:
    """Ritorna (YYYY-MM-01, YYYY-MM-LASTDAY) come stringhe ISO."""
    last_day = calendar.monthrange(anno, mese)[1]
    return f"{anno:04d}-{mese:02d}-01", f"{anno:04d}-{mese:02d}-{last_day:02d}"


def compute_monthly_report(anno: int, mese: int) -> Dict[str, Any]:
    """
    Aggregato mensile HACCP per il chef. Read-only, non modifica nulla.
    """
    if not (1 <= mese <= 12):
        raise ValueError("Mese fuori range (1-12)")
    if anno < 2020 or anno > 2100:
        raise ValueError("Anno fuori range (2020-2100)")

    inizio, fine = _month_bounds(anno, mese)
    last_day = int(fine[-2:])

    out: Dict[str, Any] = {
        "anno": anno,
        "mese": mese,
        "data_inizio": inizio,
        "data_fine": fine,
        "kpi": {
            "n_istanze_totali": 0,
            "n_completate": 0,
            "n_in_corso": 0,
            "n_aperte": 0,
            "n_scadute": 0,
            "n_saltate": 0,
            "compliance_pct": 0.0,
            "n_item_eseguiti": 0,
            "n_item_ok": 0,
            "n_item_fail": 0,
            "n_item_skipped": 0,
            "n_eventi_critici": 0,
            "giorni_con_attivita": 0,
            "giorni_senza_attivita": 0,
            "n_task_singoli_completati": 0,
            "n_task_singoli_aperti": 0,
            "n_task_singoli_scaduti": 0,
        },
        "per_reparto": [],            # [{reparto, n_istanze, n_completate, compliance_pct}]
        "compliance_giornaliera": [], # [{giorno, n_istanze, n_completate, compliance_pct}]
        "top_item_fail": [],          # [{titolo, reparto, n_fail, esempi_data}]
        "eventi_critici": [],         # [{data, reparto, item_titolo, valore, soglia, note}]
        "giornate_senza_dati": [],    # date senza alcuna esecuzione (gap nel registro)
    }

    try:
        conn = get_tasks_conn()
        cur = conn.cursor()

        # ── 1. KPI istanze per stato ──────────────────────────────────
        rows = cur.execute("""
            SELECT stato, COUNT(*) AS n
              FROM checklist_instance
             WHERE data_riferimento BETWEEN ? AND ?
             GROUP BY stato
        """, (inizio, fine)).fetchall()
        for r in rows:
            n = r["n"] or 0
            out["kpi"]["n_istanze_totali"] += n
            if r["stato"] == "COMPLETATA":
                out["kpi"]["n_completate"] = n
            elif r["stato"] == "IN_CORSO":
                out["kpi"]["n_in_corso"] = n
            elif r["stato"] == "APERTA":
                out["kpi"]["n_aperte"] = n
            elif r["stato"] == "SCADUTA":
                out["kpi"]["n_scadute"] = n
            elif r["stato"] == "SALTATA":
                out["kpi"]["n_saltate"] = n

        # Compliance % istanze (completate / (totali - saltate))
        denom = out["kpi"]["n_istanze_totali"] - out["kpi"]["n_saltate"]
        if denom > 0:
            out["kpi"]["compliance_pct"] = round(
                100.0 * out["kpi"]["n_completate"] / denom, 1
            )

        # ── 2. KPI executions (granularità item) ──────────────────────
        rows = cur.execute("""
            SELECT e.stato, COUNT(*) AS n
              FROM checklist_execution e
              JOIN checklist_instance i ON i.id = e.instance_id
             WHERE i.data_riferimento BETWEEN ? AND ?
               AND e.stato != 'PENDING'
             GROUP BY e.stato
        """, (inizio, fine)).fetchall()
        for r in rows:
            n = r["n"] or 0
            out["kpi"]["n_item_eseguiti"] += n
            if r["stato"] == "OK":
                out["kpi"]["n_item_ok"] = n
            elif r["stato"] == "FAIL":
                out["kpi"]["n_item_fail"] = n
            elif r["stato"] == "SKIPPED":
                out["kpi"]["n_item_skipped"] = n

        # ── 3. Per reparto ────────────────────────────────────────────
        rows = cur.execute("""
            SELECT t.reparto AS reparto,
                   COUNT(*) AS n_istanze,
                   SUM(CASE WHEN i.stato = 'COMPLETATA' THEN 1 ELSE 0 END) AS n_completate,
                   SUM(CASE WHEN i.stato = 'SALTATA' THEN 1 ELSE 0 END) AS n_saltate,
                   SUM(CASE WHEN i.stato = 'SCADUTA' THEN 1 ELSE 0 END) AS n_scadute
              FROM checklist_instance i
              JOIN checklist_template t ON t.id = i.template_id
             WHERE i.data_riferimento BETWEEN ? AND ?
             GROUP BY t.reparto
             ORDER BY n_istanze DESC
        """, (inizio, fine)).fetchall()
        for r in rows:
            tot = r["n_istanze"] or 0
            comp = r["n_completate"] or 0
            saltate = r["n_saltate"] or 0
            denom_r = tot - saltate
            comp_pct = round(100.0 * comp / denom_r, 1) if denom_r > 0 else 0.0
            out["per_reparto"].append({
                "reparto": r["reparto"] or "—",
                "n_istanze": tot,
                "n_completate": comp,
                "n_saltate": saltate,
                "n_scadute": r["n_scadute"] or 0,
                "compliance_pct": comp_pct,
            })

        # ── 4. Compliance giornaliera ─────────────────────────────────
        rows = cur.execute("""
            SELECT data_riferimento AS giorno,
                   COUNT(*) AS n_istanze,
                   SUM(CASE WHEN stato = 'COMPLETATA' THEN 1 ELSE 0 END) AS n_completate,
                   SUM(CASE WHEN stato = 'SALTATA' THEN 1 ELSE 0 END) AS n_saltate
              FROM checklist_instance
             WHERE data_riferimento BETWEEN ? AND ?
             GROUP BY data_riferimento
             ORDER BY data_riferimento
        """, (inizio, fine)).fetchall()
        giorni_visti: set[str] = set()
        for r in rows:
            tot = r["n_istanze"] or 0
            comp = r["n_completate"] or 0
            saltate = r["n_saltate"] or 0
            denom_r = tot - saltate
            comp_pct = round(100.0 * comp / denom_r, 1) if denom_r > 0 else 0.0
            out["compliance_giornaliera"].append({
                "giorno": r["giorno"],
                "n_istanze": tot,
                "n_completate": comp,
                "n_saltate": saltate,
                "compliance_pct": comp_pct,
            })
            giorni_visti.add(r["giorno"])

        out["kpi"]["giorni_con_attivita"] = len(giorni_visti)
        # Giorni del mese SENZA istanze (non programmate / nessun template attivo / gap)
        # Limite "fino a oggi" per non considerare giorni futuri come gap
        oggi = date.today()
        for d in range(1, last_day + 1):
            giorno_iso = f"{anno:04d}-{mese:02d}-{d:02d}"
            if giorno_iso > oggi.isoformat():
                break  # non considerare il futuro come gap
            if giorno_iso not in giorni_visti:
                out["giornate_senza_dati"].append(giorno_iso)
        out["kpi"]["giorni_senza_attivita"] = len(out["giornate_senza_dati"])

        # ── 5. Top item FAIL (max 5) ──────────────────────────────────
        rows = cur.execute("""
            SELECT it.titolo AS titolo,
                   t.reparto AS reparto,
                   COUNT(*) AS n_fail,
                   GROUP_CONCAT(i.data_riferimento) AS date_esempio
              FROM checklist_execution e
              JOIN checklist_item it ON it.id = e.item_id
              JOIN checklist_instance i ON i.id = e.instance_id
              JOIN checklist_template t ON t.id = i.template_id
             WHERE i.data_riferimento BETWEEN ? AND ?
               AND e.stato = 'FAIL'
             GROUP BY it.id
             ORDER BY n_fail DESC, it.titolo
             LIMIT 5
        """, (inizio, fine)).fetchall()
        for r in rows:
            esempi = (r["date_esempio"] or "").split(",")
            out["top_item_fail"].append({
                "titolo": r["titolo"],
                "reparto": r["reparto"] or "—",
                "n_fail": r["n_fail"] or 0,
                "esempi_data": esempi[:3],  # prime 3 occorrenze
            })

        # ── 6. Eventi critici (TEMPERATURA fuori soglia) ──────────────
        # Item di tipo TEMPERATURA con valore_numerico fuori [min_valore, max_valore]
        rows = cur.execute("""
            SELECT i.data_riferimento AS giorno,
                   t.reparto AS reparto,
                   it.titolo AS titolo,
                   it.tipo AS tipo,
                   it.min_valore AS min_v,
                   it.max_valore AS max_v,
                   it.unita_misura AS um,
                   e.valore_numerico AS valore,
                   e.note AS note,
                   e.completato_da AS chi
              FROM checklist_execution e
              JOIN checklist_item it ON it.id = e.item_id
              JOIN checklist_instance i ON i.id = e.instance_id
              JOIN checklist_template t ON t.id = i.template_id
             WHERE i.data_riferimento BETWEEN ? AND ?
               AND it.tipo IN ('TEMPERATURA', 'NUMERICO')
               AND e.valore_numerico IS NOT NULL
               AND (
                    (it.min_valore IS NOT NULL AND e.valore_numerico < it.min_valore)
                 OR (it.max_valore IS NOT NULL AND e.valore_numerico > it.max_valore)
               )
             ORDER BY i.data_riferimento DESC, it.titolo
             LIMIT 50
        """, (inizio, fine)).fetchall()
        for r in rows:
            soglia_str = ""
            if r["min_v"] is not None and r["max_v"] is not None:
                soglia_str = f"{r['min_v']}÷{r['max_v']} {r['um'] or ''}".strip()
            elif r["min_v"] is not None:
                soglia_str = f"≥ {r['min_v']} {r['um'] or ''}".strip()
            elif r["max_v"] is not None:
                soglia_str = f"≤ {r['max_v']} {r['um'] or ''}".strip()
            out["eventi_critici"].append({
                "data": r["giorno"],
                "reparto": r["reparto"] or "—",
                "item_titolo": r["titolo"],
                "tipo": r["tipo"],
                "valore": r["valore"],
                "unita_misura": r["um"],
                "soglia": soglia_str,
                "note": r["note"],
                "rilevato_da": r["chi"],
            })
        out["kpi"]["n_eventi_critici"] = len(out["eventi_critici"])

        # ── 7. Task singoli (per chiusura loop) ───────────────────────
        rows = cur.execute("""
            SELECT stato, COUNT(*) AS n
              FROM task_singolo
             WHERE COALESCE(data_scadenza, '9999-12-31') BETWEEN ? AND ?
             GROUP BY stato
        """, (inizio, fine)).fetchall()
        for r in rows:
            n = r["n"] or 0
            if r["stato"] == "COMPLETATO":
                out["kpi"]["n_task_singoli_completati"] = n
            elif r["stato"] in ("APERTO", "IN_CORSO"):
                out["kpi"]["n_task_singoli_aperti"] += n
            elif r["stato"] == "SCADUTO":
                out["kpi"]["n_task_singoli_scaduti"] = n

        conn.close()
    except Exception as e:
        logger.error(f"compute_monthly_report({anno}-{mese}): {e}")
        out["error"] = str(e)

    return out


def list_critical_events_recent(giorni: int = 7) -> List[Dict[str, Any]]:
    """
    Eventi critici degli ultimi N giorni — utile per widget Dashboard Cucina
    o per push notification giornaliera.
    """
    if giorni <= 0 or giorni > 90:
        giorni = 7
    try:
        conn = get_tasks_conn()
        cur = conn.cursor()
        rows = cur.execute("""
            SELECT i.data_riferimento AS giorno,
                   t.reparto AS reparto,
                   it.titolo AS titolo,
                   e.valore_numerico AS valore,
                   it.unita_misura AS um,
                   it.min_valore AS min_v,
                   it.max_valore AS max_v
              FROM checklist_execution e
              JOIN checklist_item it ON it.id = e.item_id
              JOIN checklist_instance i ON i.id = e.instance_id
              JOIN checklist_template t ON t.id = i.template_id
             WHERE i.data_riferimento >= date('now', ?)
               AND it.tipo IN ('TEMPERATURA', 'NUMERICO')
               AND e.valore_numerico IS NOT NULL
               AND (
                    (it.min_valore IS NOT NULL AND e.valore_numerico < it.min_valore)
                 OR (it.max_valore IS NOT NULL AND e.valore_numerico > it.max_valore)
               )
             ORDER BY i.data_riferimento DESC
             LIMIT 20
        """, (f"-{giorni} days",)).fetchall()
        return [dict(r) for r in rows]
    except Exception as e:
        logger.warning(f"list_critical_events_recent: {e}")
        return []
