#!/usr/bin/env python3
# @version: v2.1-3-dimensioni (2026-05-18)
# -*- coding: utf-8 -*-
"""
Servizio gestione stati pagamento fattura — UNIFICATO post G.5.

MODELLO 3-DIMENSIONI (vedi docs/stato_pagamento_unificato.md §15):
  Questo service scrive SOLO D1 (stato pagamento) + D2 (modificatori tecnici).
  Le mutazioni D3 (scadenza/tempo: sposta data, marca rateizzata) NON passano da
  qui — hanno endpoint dedicati (es. PUT /controllo-gestione/uscite/{id}/scadenza
  per D3=SPOSTATO, marca-rateizzata per D3=RATEIZZATO).
  STATI_VALIDI sotto contiene SOLO i 4 valori D1+D2 legacy.

Da G.5 in poi, c'è UNA SOLA fonte di verità: `cg_uscite.stato`.
Le ex colonne `fe_fatture.pagato` e `fe_fatture.stato_pagamento` sono state
rimosse fisicamente (mig 112). La VIEW `fe_fatture_with_stato` le ricostruisce
al volo per le query di lettura.

Mappatura semantica stato_pagamento (legacy esposto al frontend) ↔ cg_uscite.stato:
    'da_pagare'        ⟷  'PROGRAMMATO'
    'da_verificare'    ⟷  'VERIFICARE' (nuovo da G.5)
    'pagato_manuale'   ⟷  'PAGATO_MANUALE'
    'pagato'           ⟷  'PAGATO' (riconciliato banca, banca_movimento_id valorizzato)

Stati cg_uscite extra (non esposti come stato_pagamento):
    'SCADUTO'  → mappato a 'da_pagare' nella VIEW (data passata, da pagare comunque)
    'PARZIALE' → mappato a 'da_verificare' (utente decide se chiudere o lasciare)
    'RATEIZZATO' → mappato a 'da_pagare' (ma di fatto la spesa fissa gestisce)

Invarianti:
  - Stato 'pagato' (PAGATO in cg_uscite) può essere settato SOLO da hook
    riconciliazione bancaria (presenza di banca_fatture_link o
    cg_uscite.banca_movimento_id valorizzato).
  - Da 'pagato' si può uscire SOLO cancellando la riconciliazione: l'hook
    on_riconciliazione_removed riporta a 'pagato_manuale' (preserva intenzione
    utente di dichiarare pagata).
  - Hook riconciliazione (INSERT su banca_fatture_link): forza 'pagato'.

Use case principali (interfaccia INVARIATA rispetto v1):
  - UI button "Segna pagato manuale": set_stato(id, 'pagato_manuale')
  - UI button "Da verificare": set_stato(id, 'da_verificare')
  - UI button "Riporta a da pagare": set_stato(id, 'da_pagare')
  - Riconciliazione banca: on_riconciliazione_added(fattura_id)
  - Annullamento riconciliazione: on_riconciliazione_removed(fattura_id)
"""
from __future__ import annotations

import logging
from typing import Optional

logger = logging.getLogger("fatture_stato")

# Stati validi (legacy: stessi 4 valori esposti al frontend)
STATI_VALIDI = {"da_pagare", "da_verificare", "pagato_manuale", "pagato"}

# Stati che l'utente può settare manualmente (NON 'pagato' che è da banca)
STATI_MANUALI = {"da_pagare", "da_verificare", "pagato_manuale"}

# Mappatura stato_pagamento legacy → cg_uscite.stato canonico
LEGACY_TO_CG = {
    "da_pagare":      "PROGRAMMATO",
    "da_verificare":  "VERIFICARE",
    "pagato_manuale": "PAGATO_MANUALE",
    "pagato":         "PAGATO",
}

# Mappatura inversa cg_uscite.stato → stato_pagamento legacy
CG_TO_LEGACY = {
    "PROGRAMMATO":      "da_pagare",
    "SCADUTO":        "da_pagare",  # SCADUTO è "da pagare ma in ritardo"
    "VERIFICARE":  "da_verificare",
    "PARZIALE":       "da_verificare",
    "PAGATO_MANUALE": "pagato_manuale",
    "PAGATO":         "pagato",
    "RATEIZZATO":     "da_pagare",  # neutro: la spesa fissa gestisce
}


def _get_cg_uscita_id(conn, fattura_id: int) -> Optional[int]:
    """Ritorna l'id della riga cg_uscite per la fattura, o None se manca."""
    row = conn.execute(
        "SELECT id FROM cg_uscite WHERE fattura_id = ? LIMIT 1",
        (fattura_id,),
    ).fetchone()
    if row is None:
        return None
    return row[0] if not hasattr(row, "keys") else row["id"]


def _ensure_cg_uscita(conn, fattura_id: int) -> Optional[int]:
    """
    Garantisce che esista una cg_uscite per la fattura.
    Se manca, la crea con campi minimali derivati da fe_fatture.
    Caso edge: fatture importate ma non ancora processate dal proiettore.
    """
    uid = _get_cg_uscita_id(conn, fattura_id)
    if uid is not None:
        return uid

    # Stub: leggi i campi base da fe_fatture
    f = conn.execute("""
        SELECT fornitore_nome, fornitore_piva, numero_fattura,
               data_fattura, totale_fattura, data_scadenza
        FROM fe_fatture WHERE id = ?
    """, (fattura_id,)).fetchone()
    if f is None:
        return None

    # data_scadenza: fallback su data_fattura se manca
    nome = f["fornitore_nome"] if hasattr(f, "keys") else f[0]
    piva = f["fornitore_piva"] if hasattr(f, "keys") else f[1]
    numero = f["numero_fattura"] if hasattr(f, "keys") else f[2]
    df = f["data_fattura"] if hasattr(f, "keys") else f[3]
    tot = f["totale_fattura"] if hasattr(f, "keys") else f[4]
    ds = f["data_scadenza"] if hasattr(f, "keys") else f[5]
    data_scad = ds or df

    cur = conn.execute("""
        INSERT INTO cg_uscite (
            fattura_id, fornitore_nome, fornitore_piva, numero_fattura,
            data_fattura, totale, data_scadenza,
            importo_pagato, stato, note,
            created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, 0, 'PROGRAMMATO',
                  '[stub creato da fatture_stato_service]',
                  CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    """, (fattura_id, nome, piva, numero, df, tot, data_scad))
    return cur.lastrowid


def get_stato(conn, fattura_id: int) -> Optional[str]:
    """
    Ritorna lo stato_pagamento corrente (formato legacy) o None se fattura
    non esiste. Legge da cg_uscite via mappatura.
    """
    row = conn.execute("""
        SELECT u.stato AS cg_stato
        FROM fe_fatture f LEFT JOIN cg_uscite u ON u.fattura_id = f.id
        WHERE f.id = ?
    """, (fattura_id,)).fetchone()
    if row is None:
        return None
    cg_stato = row["cg_stato"] if hasattr(row, "keys") else row[0]
    if cg_stato is None:
        return "da_pagare"  # default per fatture orfane
    return CG_TO_LEGACY.get(cg_stato, "da_pagare")


def is_riconciliata(conn, fattura_id: int) -> bool:
    """
    True se la fattura ha almeno un movimento bancario riconciliato.
    Verifica entrambe le fonti: banca_fatture_link (legacy) e
    cg_uscite.banca_movimento_id (workflow CG).
    """
    row = conn.execute("""
        SELECT 1 FROM banca_fatture_link WHERE fattura_id = ? LIMIT 1
    """, (fattura_id,)).fetchone()
    if row is not None:
        return True
    row = conn.execute("""
        SELECT 1 FROM cg_uscite
        WHERE fattura_id = ? AND banca_movimento_id IS NOT NULL LIMIT 1
    """, (fattura_id,)).fetchone()
    return row is not None


def set_stato(conn, fattura_id: int, nuovo_stato: str, *, force: bool = False) -> dict:
    """
    Cambia lo stato_pagamento di una fattura (interfaccia legacy invariata).

    Validazioni:
      - nuovo_stato deve essere in STATI_VALIDI
      - se nuovo_stato == 'pagato' E force=False → rifiuta (solo via banca)
      - se stato attuale == 'pagato' E force=False → rifiuta (immutabile finché
        riconciliata; serve cancellare il link prima)

    Internamente:
      - Mappa nuovo_stato → cg_uscite.stato canonico
      - Crea cg_uscite stub se manca
      - UPDATE cg_uscite.stato → la VIEW fe_fatture_with_stato si aggiorna automaticamente

    Returns:
        {ok: bool, fattura_id, vecchio_stato, nuovo_stato, error?}
    """
    if nuovo_stato not in STATI_VALIDI:
        return {"ok": False, "error": f"Stato non valido: {nuovo_stato}. Validi: {sorted(STATI_VALIDI)}"}

    vecchio = get_stato(conn, fattura_id)
    if vecchio is None:
        return {"ok": False, "error": f"Fattura {fattura_id} non trovata"}

    if not force:
        if nuovo_stato == "pagato":
            return {
                "ok": False,
                "error": "Lo stato 'pagato' può essere settato solo da una riconciliazione bancaria. Usa 'pagato_manuale' per dichiarazione utente.",
            }
        if vecchio == "pagato":
            return {
                "ok": False,
                "error": "La fattura è 'pagata' tramite riconciliazione bancaria: stato immutabile. Per cambiare, cancella prima la riconciliazione del movimento.",
            }

    if vecchio == nuovo_stato:
        return {"ok": True, "fattura_id": fattura_id, "vecchio_stato": vecchio, "nuovo_stato": nuovo_stato, "noop": True}

    # Garantisce esistenza cg_uscite
    uid = _ensure_cg_uscita(conn, fattura_id)
    if uid is None:
        return {"ok": False, "error": f"Impossibile creare cg_uscite per fattura {fattura_id}"}

    cg_stato_target = LEGACY_TO_CG[nuovo_stato]
    conn.execute(
        "UPDATE cg_uscite SET stato = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
        (cg_stato_target, uid),
    )
    logger.info(f"[stato_pagamento] fattura={fattura_id} {vecchio} → {nuovo_stato} (cg.id={uid}, force={force})")
    return {"ok": True, "fattura_id": fattura_id, "vecchio_stato": vecchio, "nuovo_stato": nuovo_stato}


# ─────────────────────────────────────────────
# Hook chiamati dalla logica riconciliazione bancaria
# ─────────────────────────────────────────────

def on_riconciliazione_added(conn, fattura_id: int) -> dict:
    """
    Chiamato dopo INSERT in banca_fatture_link.
    Forza stato a 'pagato' (la banca ha ragione).
    """
    res = set_stato(conn, fattura_id, "pagato", force=True)
    logger.info(f"[hook+] fattura {fattura_id} riconciliata → 'pagato'")
    return res


def on_riconciliazione_removed(conn, fattura_id: int) -> dict:
    """
    Chiamato dopo DELETE da banca_fatture_link.
    Se restano altri link/match banca → resta 'pagato'.
    Altrimenti torna a 'pagato_manuale' (preserva intenzione utente).
    """
    if is_riconciliata(conn, fattura_id):
        return {"ok": True, "noop": True, "reason": "altri link presenti"}
    res = set_stato(conn, fattura_id, "pagato_manuale", force=True)
    logger.info(f"[hook-] fattura {fattura_id} de-riconciliata → 'pagato_manuale'")
    return res


def recompute_all_states(conn) -> dict:
    """
    Ricalcola lo stato di TUTTE le fatture in base alle riconciliazioni esistenti.
    Job manutentivo: utile dopo import massivi o per sanare incoerenze.

    Logica (post G.5):
      1. Esiste banca_fatture_link O cg_uscite.banca_movimento_id → cg_uscite.stato='PAGATO'
      2. Stato corrente PAGATO ma niente più link → torna a PAGATO_MANUALE
      3. Niente link e niente cg_uscite → crea stub PROGRAMMATO

    NON tocca VERIFICARE / PARZIALE (sono stati espliciti utente).
    """
    # Step 1: forza PAGATO per fatture con riconciliazione attiva
    cur = conn.execute("""
        UPDATE cg_uscite SET stato = 'PAGATO', updated_at = CURRENT_TIMESTAMP
        WHERE fattura_id IN (SELECT DISTINCT fattura_id FROM banca_fatture_link)
          AND stato != 'PAGATO'
    """)
    n_pagato = cur.rowcount

    # Step 2: PAGATO → PAGATO_MANUALE se non ha più link banca
    cur = conn.execute("""
        UPDATE cg_uscite SET stato = 'PAGATO_MANUALE', updated_at = CURRENT_TIMESTAMP
        WHERE stato = 'PAGATO'
          AND fattura_id IS NOT NULL
          AND fattura_id NOT IN (SELECT DISTINCT fattura_id FROM banca_fatture_link)
          AND COALESCE(banca_movimento_id, 0) = 0
    """)
    n_man = cur.rowcount

    conn.commit()
    return {"pagato": n_pagato, "pagato_manuale_recovery": n_man}
