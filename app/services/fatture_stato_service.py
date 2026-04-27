#!/usr/bin/env python3
# @version: v1.0-stati-pagamento (Modulo M, 2026-04-27)
# -*- coding: utf-8 -*-
"""
Servizio gestione stati pagamento fattura (Modulo M).

4 stati validi:
  - da_pagare         (default)
  - da_verificare     (utente in dubbio)
  - pagato_manuale    (utente dichiara, "Pagato*")
  - pagato            (riconciliazione banca, IMMUTABILE manualmente)

Invarianti:
  - Stato 'pagato' può essere settato SOLO da hook riconciliazione
    (presenza di banca_fatture_link).
  - Da 'pagato' si può uscire SOLO cancellando la riconciliazione
    (DELETE banca_fatture_link), che fa scattare recompute → torna a
    'pagato_manuale' (preserva intenzione).
  - Hook riconciliazione: INSERT su banca_fatture_link → setta 'pagato'
    (sovrascrive qualsiasi stato precedente — la banca ha sempre ragione).

Compatibilità legacy:
  - fe_fatture.pagato (0/1) viene SEMPRE sincronizzato col nuovo stato:
      pagato=1 ⇔ stato_pagamento IN ('pagato_manuale', 'pagato')
  - Codice vecchio che legge `pagato` continua a funzionare.

Use case principali:
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

# Stati validi
STATI_VALIDI = {"da_pagare", "da_verificare", "pagato_manuale", "pagato"}

# Stati che l'utente può settare manualmente (NON 'pagato' che è da banca)
STATI_MANUALI = {"da_pagare", "da_verificare", "pagato_manuale"}


def get_stato(conn, fattura_id: int) -> Optional[str]:
    """Ritorna lo stato_pagamento corrente o None se fattura non esiste."""
    row = conn.execute(
        "SELECT stato_pagamento FROM fe_fatture WHERE id = ?",
        (fattura_id,),
    ).fetchone()
    return row["stato_pagamento"] if row else None


def is_riconciliata(conn, fattura_id: int) -> bool:
    """True se la fattura ha almeno un movimento bancario riconciliato."""
    row = conn.execute(
        "SELECT 1 FROM banca_fatture_link WHERE fattura_id = ? LIMIT 1",
        (fattura_id,),
    ).fetchone()
    return row is not None


def _sync_pagato_legacy(conn, fattura_id: int, nuovo_stato: str) -> None:
    """Sincronizza il vecchio campo `pagato` 0/1 con il nuovo stato."""
    pagato = 1 if nuovo_stato in ("pagato_manuale", "pagato") else 0
    conn.execute(
        "UPDATE fe_fatture SET pagato = ? WHERE id = ?",
        (pagato, fattura_id),
    )


def set_stato(conn, fattura_id: int, nuovo_stato: str, *, force: bool = False) -> dict:
    """
    Cambia lo stato_pagamento di una fattura.

    Validazioni:
      - nuovo_stato deve essere in STATI_VALIDI
      - se nuovo_stato == 'pagato' E force=False → rifiuta (solo via banca)
      - se stato attuale == 'pagato' E force=False → rifiuta (immutabile finché
        riconciliata; serve cancellare il link prima)

    Sincronizza fe_fatture.pagato per legacy compat.

    Args:
        force: bypass delle validazioni. Usato dagli hook riconciliazione
               (interno) e dal job di re-sync.

    Returns:
        {ok: bool, fattura_id, vecchio_stato, nuovo_stato, error?}
    """
    if nuovo_stato not in STATI_VALIDI:
        return {"ok": False, "error": f"Stato non valido: {nuovo_stato}. Validi: {sorted(STATI_VALIDI)}"}

    vecchio = get_stato(conn, fattura_id)
    if vecchio is None:
        return {"ok": False, "error": f"Fattura {fattura_id} non trovata"}

    if not force:
        # Setta 'pagato' solo via riconciliazione automatica
        if nuovo_stato == "pagato":
            return {
                "ok": False,
                "error": "Lo stato 'pagato' può essere settato solo da una riconciliazione bancaria. Usa 'pagato_manuale' per dichiarazione utente.",
            }
        # Esci da 'pagato' solo cancellando il link banca
        if vecchio == "pagato":
            return {
                "ok": False,
                "error": "La fattura è 'pagata' tramite riconciliazione bancaria: stato immutabile. Per cambiare, cancella prima la riconciliazione del movimento.",
            }

    # No-op se invariato
    if vecchio == nuovo_stato:
        return {"ok": True, "fattura_id": fattura_id, "vecchio_stato": vecchio, "nuovo_stato": nuovo_stato, "noop": True}

    conn.execute(
        "UPDATE fe_fatture SET stato_pagamento = ? WHERE id = ?",
        (nuovo_stato, fattura_id),
    )
    _sync_pagato_legacy(conn, fattura_id, nuovo_stato)

    logger.info(f"[stato_pagamento] fattura={fattura_id} {vecchio} → {nuovo_stato} (force={force})")
    return {"ok": True, "fattura_id": fattura_id, "vecchio_stato": vecchio, "nuovo_stato": nuovo_stato}


# ─────────────────────────────────────────────
# Hook chiamati dalla logica riconciliazione bancaria
# ─────────────────────────────────────────────

def on_riconciliazione_added(conn, fattura_id: int) -> None:
    """
    Chiamato dopo INSERT in banca_fatture_link.
    Forza stato a 'pagato' (la banca ha ragione, sovrascrive ogni stato precedente).
    """
    res = set_stato(conn, fattura_id, "pagato", force=True)
    logger.info(f"[hook+] fattura {fattura_id} riconciliata → 'pagato'")
    return res


def on_riconciliazione_removed(conn, fattura_id: int) -> None:
    """
    Chiamato dopo DELETE da banca_fatture_link.
    Verifica se restano altri link: se sì, resta 'pagato'. Se no, torna a
    'pagato_manuale' (preserva intenzione utente di dichiarare pagata).
    """
    if is_riconciliata(conn, fattura_id):
        # Ci sono ancora altri movimenti riconciliati, resta 'pagato'
        return {"ok": True, "noop": True, "reason": "altri link presenti"}
    res = set_stato(conn, fattura_id, "pagato_manuale", force=True)
    logger.info(f"[hook-] fattura {fattura_id} de-riconciliata → 'pagato_manuale'")
    return res


def recompute_all_states(conn) -> dict:
    """
    Ricalcola lo stato_pagamento di TUTTE le fatture in base ai dati esistenti.
    Job manutentivo: utile dopo import massivi o per sanare incoerenze.

    Logica (uguale al backfill della mig 103):
      1. Esiste banca_fatture_link → 'pagato'
      2. else if pagato=1 → 'pagato_manuale'
      3. else → 'da_pagare'

    NON tocca 'da_verificare' (è uno stato esplicito utente che non si può
    derivare).
    """
    # Step 1: pagati da banca
    cur = conn.execute(
        """
        UPDATE fe_fatture
           SET stato_pagamento = 'pagato'
         WHERE id IN (SELECT DISTINCT fattura_id FROM banca_fatture_link)
           AND stato_pagamento != 'pagato'
        """
    )
    n_pagato = cur.rowcount

    # Step 2: pagato_manuale (pagato=1 ma no banca, e stato attuale non pagato/da_verificare)
    cur = conn.execute(
        """
        UPDATE fe_fatture
           SET stato_pagamento = 'pagato_manuale'
         WHERE pagato = 1
           AND id NOT IN (SELECT DISTINCT fattura_id FROM banca_fatture_link)
           AND stato_pagamento NOT IN ('pagato', 'pagato_manuale', 'da_verificare')
        """
    )
    n_man = cur.rowcount

    # Step 3: da_pagare (pagato=0 e nessun link e stato attuale 'pagato' fasullo)
    cur = conn.execute(
        """
        UPDATE fe_fatture
           SET stato_pagamento = 'da_pagare'
         WHERE pagato = 0
           AND id NOT IN (SELECT DISTINCT fattura_id FROM banca_fatture_link)
           AND stato_pagamento = 'pagato'
        """
    )
    n_dpa = cur.rowcount

    # Sync legacy field
    conn.execute(
        """
        UPDATE fe_fatture
           SET pagato = CASE
               WHEN stato_pagamento IN ('pagato', 'pagato_manuale') THEN 1
               ELSE 0
           END
        """
    )
    conn.commit()
    return {"pagato": n_pagato, "pagato_manuale": n_man, "da_pagare_recovery": n_dpa}
