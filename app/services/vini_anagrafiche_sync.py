# Modulo: vini
"""
Service sync runtime — refactor V.6+V.7+V.8 Fase 7 (2026-05-14).

Propaga i campi anagrafici dalla "fonte di verita'" (vini_madre_v2 +
anagrafiche collegate) verso la ridondanza legacy su vini_bottiglie_v2.

CAMPI SINCRONIZZATI (dal doc refactor §3):
  - PRODUTTORE      <- vini_produttori_v2.nome (via madre.produttore_id)
  - DESCRIZIONE     <- vini_madre_v2.descrizione
  - DENOMINAZIONE   <- "{deno.nome} {deno.tipo}" (via madre.denominazione_id)
  - TIPOLOGIA       <- vini_madre_v2.tipologia
  - NAZIONE         <- vini_madre_v2.nazione || produttore.nazione (fallback)
  - REGIONE         <- vini_madre_v2.regione  || produttore.regione  (fallback)
  - DISTRIBUTORE    <- vini_fornitori_v2.nome (via madre.fornitore_id)
  - RAPPRESENTANTE  <- vini_fornitori_v2.rappresentante_nome
  - ABBINAMENTI     <- vini_madre_v2.abbinamenti

CAMPI NON TOCCATI:
  - Annata-specifici (ANNATA, FORMATO, PREZZO_*, GRADO_ALCOLICO, NOTE_*, ecc.)
  - Stati operativi (STATO_VENDITA, STATO_RIORDINO, locazioni, qta, ecc.)
  - VITIGNI TEXT legacy + 5 slot vitigno_*_id (gestiti separatamente)

REGOLA: bottiglie con madre_id IS NULL (orfani sopravvissuti alla migrazione)
NON vengono toccate. Restano con i loro campi TEXT free-form originali.

USO:
  - Trigger automatico nei PATCH del router (madre, produttore, fornitore,
    denominazione).
  - Bottone admin "Risincronizza tutto" (sync_all_bottiglie) come safety net
    contro drift accidentali.

Niente trigger SQLite — tutto applicativo, esplicito, testabile.
"""

from __future__ import annotations
import sqlite3
import time
from typing import Any, Dict, List, Optional

from app.models.vini_magazzino_db import get_magazzino_connection
from app.models.vini_anagrafiche_db import TABELLE


# Campi della bottiglia che vengono sovrascritti dal sync.
# Ordine = ordine dell'UPDATE SET (per coerenza coi tuple di valori).
SYNCED_FIELDS = [
    "PRODUTTORE",
    "DESCRIZIONE",
    "DENOMINAZIONE",
    "TIPOLOGIA",
    "NAZIONE",
    "REGIONE",
    "DISTRIBUTORE",
    "RAPPRESENTANTE",
    "ABBINAMENTI",
]


# ============================================================
# Query helper: dati joinati per un madre
# ============================================================
def _compute_synced_values(cur: sqlite3.Cursor, madre_id: int) -> Optional[Dict[str, Any]]:
    """
    Calcola i valori sincronizzati per un singolo madre via JOIN.
    Ritorna dict {campo_bottiglia: valore} o None se il madre non esiste.

    Le coalesce gestiscono i campi opzionali:
      - madre.nazione/regione con fallback a produttore.nazione/regione
      - denominazione_id NULL -> DENOMINAZIONE = NULL
      - fornitore_id NULL -> DISTRIBUTORE/RAPPRESENTANTE = NULL
    """
    sql = f"""
        SELECT
            p.nome                                                    AS produttore_nome,
            m.descrizione                                             AS descrizione,
            CASE
                WHEN d.id IS NOT NULL THEN d.nome || ' ' || d.tipo
                ELSE NULL
            END                                                       AS denominazione_display,
            m.tipologia                                               AS tipologia,
            COALESCE(m.nazione, p.nazione)                            AS nazione,
            COALESCE(m.regione, p.regione)                            AS regione,
            f.nome                                                    AS fornitore_nome,
            f.rappresentante_nome                                     AS rappresentante_nome,
            m.abbinamenti                                             AS abbinamenti
        FROM {TABELLE['madre']} m
        JOIN {TABELLE['produttori']} p ON p.id = m.produttore_id
        LEFT JOIN {TABELLE['fornitori']} f ON f.id = m.fornitore_id
        LEFT JOIN {TABELLE['denominazioni']} d ON d.id = m.denominazione_id
        WHERE m.id = ?
    """
    row = cur.execute(sql, (madre_id,)).fetchone()
    if not row:
        return None

    # row e' tupla (i campi sono nell'ordine del SELECT)
    return {
        "PRODUTTORE":     row[0],
        "DESCRIZIONE":    row[1],
        "DENOMINAZIONE":  row[2],
        "TIPOLOGIA":      row[3],
        "NAZIONE":        row[4],
        "REGIONE":        row[5],
        "DISTRIBUTORE":   row[6],
        "RAPPRESENTANTE": row[7],
        "ABBINAMENTI":    row[8],
    }


def _update_bottiglie_with_values(
    cur: sqlite3.Cursor, madre_id: int, values: Dict[str, Any]
) -> int:
    """
    Esegue UPDATE su vini_bottiglie_v2 WHERE madre_id = ?. Ritorna n. righe aggiornate.
    """
    set_clause = ", ".join(f"{f} = ?" for f in SYNCED_FIELDS)
    sql = (
        f"UPDATE {TABELLE['bottiglie']} "
        f"SET {set_clause}, UPDATED_AT = datetime('now') "
        f"WHERE madre_id = ?"
    )
    params = [values[f] for f in SYNCED_FIELDS] + [madre_id]
    cur.execute(sql, params)
    return cur.rowcount


# ============================================================
# API PUBBLICA — sync per madre
# ============================================================
def sync_bottiglie_from_madre(madre_id: int) -> int:
    """
    Aggiorna i campi anagrafici di tutte le bottiglie con questo madre_id.

    Ritorna numero di righe aggiornate (0 se nessuna bottiglia collegata o
    se il madre non esiste).
    """
    conn = get_magazzino_connection()
    try:
        cur = conn.cursor()
        values = _compute_synced_values(cur, madre_id)
        if values is None:
            return 0
        n = _update_bottiglie_with_values(cur, madre_id, values)
        conn.commit()
        return n
    finally:
        conn.close()


# ============================================================
# API PUBBLICA — sync cascade da produttore
# ============================================================
def sync_bottiglie_from_produttore(produttore_id: int) -> Dict[str, int]:
    """
    Cascade: aggiorna tutte le bottiglie di tutti i madre con questo produttore_id.

    Una sola connessione/transazione per ridurre overhead.
    Ritorna {n_madre, n_bottiglie}.
    """
    conn = get_magazzino_connection()
    try:
        cur = conn.cursor()
        madre_ids = [
            r[0] for r in cur.execute(
                f"SELECT id FROM {TABELLE['madre']} WHERE produttore_id = ?",
                (produttore_id,),
            ).fetchall()
        ]
        n_bot = 0
        for mid in madre_ids:
            values = _compute_synced_values(cur, mid)
            if values is None:
                continue
            n_bot += _update_bottiglie_with_values(cur, mid, values)
        conn.commit()
        return {"n_madre": len(madre_ids), "n_bottiglie": n_bot}
    finally:
        conn.close()


# ============================================================
# API PUBBLICA — sync cascade da fornitore
# ============================================================
def sync_bottiglie_from_fornitore(fornitore_id: int) -> Dict[str, int]:
    """
    Cascade: aggiorna tutte le bottiglie di tutti i madre con questo fornitore_id.
    Ritorna {n_madre, n_bottiglie}.
    """
    conn = get_magazzino_connection()
    try:
        cur = conn.cursor()
        madre_ids = [
            r[0] for r in cur.execute(
                f"SELECT id FROM {TABELLE['madre']} WHERE fornitore_id = ?",
                (fornitore_id,),
            ).fetchall()
        ]
        n_bot = 0
        for mid in madre_ids:
            values = _compute_synced_values(cur, mid)
            if values is None:
                continue
            n_bot += _update_bottiglie_with_values(cur, mid, values)
        conn.commit()
        return {"n_madre": len(madre_ids), "n_bottiglie": n_bot}
    finally:
        conn.close()


# ============================================================
# API PUBBLICA — sync cascade da denominazione
# ============================================================
def sync_bottiglie_from_denominazione(denominazione_id: int) -> Dict[str, int]:
    """
    Cascade: aggiorna tutte le bottiglie di tutti i madre con questa denominazione_id.
    Ritorna {n_madre, n_bottiglie}.
    """
    conn = get_magazzino_connection()
    try:
        cur = conn.cursor()
        madre_ids = [
            r[0] for r in cur.execute(
                f"SELECT id FROM {TABELLE['madre']} WHERE denominazione_id = ?",
                (denominazione_id,),
            ).fetchall()
        ]
        n_bot = 0
        for mid in madre_ids:
            values = _compute_synced_values(cur, mid)
            if values is None:
                continue
            n_bot += _update_bottiglie_with_values(cur, mid, values)
        conn.commit()
        return {"n_madre": len(madre_ids), "n_bottiglie": n_bot}
    finally:
        conn.close()


# ============================================================
# API PUBBLICA — full resync (safety net)
# ============================================================
def sync_all_bottiglie() -> Dict[str, Any]:
    """
    Full resync: itera su TUTTI i madre e propaga ai loro bottiglie.

    Safety net contro drift accidentali. Da chiamare via bottone admin
    "Risincronizza tutto" in Impostazioni Vini.

    Ritorna {n_madre_processati, n_bottiglie_aggiornate, durata_sec,
             n_orfani_skippati}.
    """
    t0 = time.time()
    conn = get_magazzino_connection()
    try:
        cur = conn.cursor()
        madre_ids = [
            r[0] for r in cur.execute(
                f"SELECT id FROM {TABELLE['madre']}"
            ).fetchall()
        ]
        n_bot = 0
        for mid in madre_ids:
            values = _compute_synced_values(cur, mid)
            if values is None:
                continue
            n_bot += _update_bottiglie_with_values(cur, mid, values)

        # Conteggio orfani (informativo)
        n_orfani = cur.execute(
            f"SELECT COUNT(*) FROM {TABELLE['bottiglie']} WHERE madre_id IS NULL"
        ).fetchone()[0]

        conn.commit()
        return {
            "n_madre_processati": len(madre_ids),
            "n_bottiglie_aggiornate": n_bot,
            "n_orfani_skippati": n_orfani,
            "durata_sec": round(time.time() - t0, 2),
        }
    finally:
        conn.close()
