# @version: v1.0 — Note di credito fase 1 (2026-10-02)
# -*- coding: utf-8 -*-
"""
Filtri SQL condivisi su fe_fatture — "cosa conta come costo".

Modulo: platform (usato da acquisti, controllo_gestione, ricette/matching,
dashboard, alert). Classificazione: [core]

PERCHÉ ESISTE
-------------
Fino al 2026-10 le note di credito (TipoDocumento TD04) non entravano mai in
fe_fatture: il sync FIC chiedeva solo `type=expense`. Alcune query le
escludevano già "per sicurezza" (conto economico, scadenzario CG, candidati
riconciliazione), molte altre no. Da roadmap A.1 fase 1 il sync scarica anche
le note di credito (`type=passive_credit_note`, salvate con
tipo_documento='TD04'): ogni query che SOMMA o ELENCA costi/debiti deve
escluderle, altrimenti verrebbero contate come costi in positivo.

Questo è il punto unico dove si decide. Fase 2 (note di credito in negativo
nel conto economico) partirà da qui.

USO
---
    from app.services.fatture_filtri import escludi_nc

    f\"\"\"... WHERE COALESCE(f.is_autofattura, 0) = 0
           AND {escludi_nc("f")} ...\"\"\"

    escludi_nc("")  → tabella senza alias (colonne nude)

Query che avevano già il filtro scritto a mano prima di questo modulo (stesso
effetto, lasciate com'erano): conto_economico.py, controllo_gestione_router
(proiezione fatture → cg_uscite), fe_import (totale categoria mese),
fe_proforme_router (candidati).

ATTENZIONE: tipo_documento NULL = fattura normale (le righe FIC storiche non
hanno il campo valorizzato). Per questo il COALESCE a 'TD01'.
"""

TIPO_NOTA_CREDITO = "TD04"


def _col(alias: str) -> str:
    return f"{alias}.tipo_documento" if alias else "tipo_documento"


def escludi_nc(alias: str = "f") -> str:
    """Clausola SQL: vero se il documento NON è una nota di credito."""
    return f"COALESCE({_col(alias)}, 'TD01') <> '{TIPO_NOTA_CREDITO}'"


def is_nc(alias: str = "f") -> str:
    """Clausola SQL: vero se il documento È una nota di credito."""
    return f"COALESCE({_col(alias)}, 'TD01') = '{TIPO_NOTA_CREDITO}'"
