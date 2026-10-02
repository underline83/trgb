# Modulo: platform (ponte task_manager ↔ cucina)
# @version: v1.0 — letture temperatura per ubicazione (2026-09-07)
# -*- coding: utf-8 -*-
"""
Servizio platform: letture di temperatura HACCP per ubicazione.

PERCHE' ESISTE
--------------
Il modulo `cucina` (Scorte & Frigoriferi) deve poter mostrare, nella scheda di
un frigo, le sue ultime temperature. Quelle temperature vivono nel modulo
`task_manager` (`tasks.sqlite3`), come `checklist_execution` di item tipo
TEMPERATURA — ed e' giusto che restino li': sono il registro HACCP, e un
secondo registro parallelo prima o poi diverge da quello vero.

La regola 4 di disciplina modulare vieta a un router di importare dal router di
un altro modulo. Questo file e' la via consentita: un servizio platform,
SOLA LETTURA, che i due moduli condividono.

IL PONTE
--------
`checklist_item.ubicazione_id` (aggiunta dalla mig 171) lega la voce di
checklist al frigo vero. Finche' un item non e' agganciato a un'ubicazione, il
frigo non ha letture da mostrare: e' il comportamento atteso, non un errore.

FUORI SOGLIA
------------
Il giudizio non e' piu' a occhio: si confronta il valore letto con le soglie
dichiarate sull'ubicazione (`temp_min`/`temp_max`). Se le soglie mancano, la
lettura si mostra senza verdetto — meglio nessun giudizio che uno inventato.
"""

from __future__ import annotations

import sqlite3
from typing import Any, Dict, List, Optional

from app.utils.locale_data import locale_data_path

TASKS_DB = locale_data_path("tasks.sqlite3")


def _conn() -> Optional[sqlite3.Connection]:
    """Connessione read-only a tasks.sqlite3, o None se il DB non c'e'."""
    if not TASKS_DB.exists():
        return None
    conn = sqlite3.connect(f"file:{TASKS_DB}?mode=ro", uri=True, timeout=15)
    conn.row_factory = sqlite3.Row
    return conn


def _ha_ponte(conn: sqlite3.Connection) -> bool:
    """La colonna ponte esiste? (ambienti pre-mig 171)."""
    cur = conn.execute("PRAGMA table_info(checklist_item)")
    return any(r[1] == "ubicazione_id" for r in cur.fetchall())


def letture_ubicazione(
    ubicazione_id: int,
    limit: int = 30,
    temp_min: float | None = None,
    temp_max: float | None = None,
) -> List[Dict[str, Any]]:
    """Ultime letture di temperatura agganciate a un'ubicazione, piu' recenti prima.

    Ritorna lista vuota (mai eccezione) se il DB task non c'e', se il ponte non
    e' ancora stato creato o se nessun item e' agganciato a questa ubicazione:
    la scheda frigo deve aprirsi comunque.
    """
    conn = _conn()
    if conn is None:
        return []
    try:
        if not _ha_ponte(conn):
            return []
        rows = conn.execute(
            """
            SELECT  e.id,
                    e.valore_numerico   AS valore,
                    e.stato,
                    e.completato_at,
                    e.completato_da,
                    e.note,
                    i.titolo            AS voce,
                    i.min_valore        AS item_min,
                    i.max_valore        AS item_max,
                    ist.data_riferimento,
                    ist.turno
            FROM checklist_execution e
            JOIN checklist_item     i   ON i.id  = e.item_id
            JOIN checklist_instance ist ON ist.id = e.instance_id
            WHERE i.ubicazione_id = ?
              AND i.tipo = 'TEMPERATURA'
              AND e.valore_numerico IS NOT NULL
            ORDER BY ist.data_riferimento DESC, e.completato_at DESC
            LIMIT ?
            """,
            (ubicazione_id, int(limit)),
        ).fetchall()
    except sqlite3.Error:
        # tasks.sqlite3 puo' essere in mezzo a un WAL checkpoint o mancare una
        # tabella su un ambiente fresco: la scheda frigo non deve morire per
        # questo.
        return []
    finally:
        conn.close()

    out: List[Dict[str, Any]] = []
    for r in rows:
        d = dict(r)
        # Soglia dell'ubicazione se c'e', altrimenti quella dichiarata
        # sull'item, altrimenti nessun verdetto.
        lo = temp_min if temp_min is not None else d.get("item_min")
        hi = temp_max if temp_max is not None else d.get("item_max")
        val = d.get("valore")
        if val is None or (lo is None and hi is None):
            d["fuori_soglia"] = None
        else:
            d["fuori_soglia"] = bool(
                (lo is not None and val < lo) or (hi is not None and val > hi)
            )
        out.append(d)
    return out


def ultima_lettura(
    ubicazione_id: int,
    temp_min: float | None = None,
    temp_max: float | None = None,
) -> Optional[Dict[str, Any]]:
    """L'ultima temperatura registrata, o None. E' quello che va in testa al giro."""
    letture = letture_ubicazione(ubicazione_id, limit=1, temp_min=temp_min, temp_max=temp_max)
    return letture[0] if letture else None


def crea_task_guasto(
    titolo: str,
    descrizione: str | None,
    created_by: str,
    ref_id: int | None = None,
) -> Optional[int]:
    """Apre un task singolo nel Task Manager per un guasto frigo.

    Unica scrittura di questo ponte, e volutamente l'unica: un guasto deve
    finire nella lista dei task di tutti, non in una to-do parallela dentro le
    scorte che nessuno guarda. Ritorna l'id del task, o None se il modulo task
    non e' disponibile (il guasto resta comunque registrato in
    `cucina_manutenzioni`).
    """
    if not TASKS_DB.exists():
        return None
    try:
        conn = sqlite3.connect(TASKS_DB, timeout=30)
        try:
            conn.execute("PRAGMA busy_timeout=30000")
            cur = conn.cursor()
            cur.execute(
                """
                INSERT INTO task_singolo
                    (titolo, descrizione, priorita, stato, origine,
                     ref_modulo, ref_id, created_by)
                VALUES (?, ?, 'ALTA', 'APERTO', 'AUTOMATICA', 'cucina', ?, ?)
                """,
                (titolo, descrizione, ref_id, created_by),
            )
            task_id = cur.lastrowid
            conn.commit()
            return task_id
        finally:
            conn.close()
    except sqlite3.Error:
        return None


# ─────────────────────────────────────────────────────────────
# Le temperature di OGGI (2026-10-02)
# ─────────────────────────────────────────────────────────────
#
# Marco: «il primo che apre la Cucina iPhone deve inserire la temperatura;
# solo admin, superadmin e oste/cuoco hanno il tasto ignora». Il client chiede
# qui se oggi c'e' una checklist di temperature ancora aperta; scrive i valori
# con i normali endpoint del Task Manager (/tasks/execution/item/{id}/check e
# /tasks/instances/{id}/completa), cosi' il registro HACCP resta uno solo.

def temperature_oggi(oggi: str) -> List[Dict[str, Any]]:
    """Istanze di OGGI che contengono voci TEMPERATURA agganciate a un frigo.

    Ritorna [{instance_id, stato, turno, template, voci:[...]}]; lista vuota se
    non c'e' niente (o se il DB task non e' raggiungibile: il gate non deve
    mai bloccare la cucina per un problema tecnico).
    """
    conn = _conn()
    if conn is None:
        return []
    try:
        if not _ha_ponte(conn):
            return []
        ist = conn.execute(
            """
            SELECT DISTINCT ist.id, ist.stato, ist.turno, t.nome
              FROM checklist_instance ist
              JOIN checklist_template t ON t.id = ist.template_id
              JOIN checklist_item i     ON i.template_id = t.id
             WHERE ist.data_riferimento = ?
               AND i.tipo = 'TEMPERATURA' AND i.ubicazione_id IS NOT NULL
             ORDER BY ist.id
            """,
            (oggi,),
        ).fetchall()
        out = []
        for r in ist:
            voci = conn.execute(
                """
                SELECT i.id AS item_id, i.titolo, i.ubicazione_id, i.min_valore, i.max_valore,
                       i.unita_misura, e.stato AS stato_voce, e.valore_numerico AS valore,
                       e.completato_da
                  FROM checklist_item i
                  LEFT JOIN checklist_execution e ON e.item_id = i.id AND e.instance_id = ?
                 WHERE i.template_id = (SELECT template_id FROM checklist_instance WHERE id = ?)
                   AND i.tipo = 'TEMPERATURA' AND i.ubicazione_id IS NOT NULL
                 ORDER BY i.ordine, i.id
                """,
                (r["id"], r["id"]),
            ).fetchall()
            out.append({"instance_id": r["id"], "stato": r["stato"], "turno": r["turno"],
                        "template": r["nome"], "voci": [dict(v) for v in voci]})
        return out
    except sqlite3.Error:
        return []
    finally:
        conn.close()


def salta_temperature(instance_id: int, utente: str, motivo: str) -> bool:
    """Il tasto «ignora»: segna l'istanza SALTATA con chi e perche'.

    Il permesso (admin/chef) lo controlla il router: qui solo la scrittura.
    Resta nel registro HACCP come saltata, con nome e motivo: ignorare non
    cancella niente, lo dichiara.
    """
    if not TASKS_DB.exists():
        return False
    conn = sqlite3.connect(TASKS_DB, timeout=30)
    try:
        cur = conn.execute(
            """
            UPDATE checklist_instance
               SET stato = 'SALTATA', completato_at = datetime('now','localtime'),
                   completato_da = ?, note = ?
             WHERE id = ? AND stato NOT IN ('COMPLETATA','SALTATA')
            """,
            (utente, motivo, instance_id),
        )
        conn.commit()
        return cur.rowcount > 0
    finally:
        conn.close()
