# @version: v3.0-deprecated (sessione 2026-05-12, V-H.J)
# -*- coding: utf-8 -*-
"""
DEPRECATO 2026-05-12 (V-H.J).

Questo modulo conteneva la logica del vecchio import Excel:
  - normalize_dataframe()  → mapping colonne Excel storico → DB
  - init_database()        → init DB legacy `vini.sqlite3`
  - clear_vini_table()     → svuota tabella vini staging
  - upload_vini_from_df()  → upsert su staging table

Eliminato perché il flusso v2 (template + import-v2 + export-v2) ha
sostituito completamente l'eredità Excel del vecchio formato. La logica
attuale vive in `app/services/vini_xlsx_v2.py`.

Le costanti di validazione (TIPOLOGIA_VALIDE, FORMATO_VALIDI) sono state
promosse in `app/services/vini_xlsx_v2.py` come single source of truth.

Il file è mantenuto vuoto solo per evitare ImportError accidentali in
import legacy. Eliminare definitivamente in V-H.I (cleanup completo legacy).
"""

from __future__ import annotations

# Backwards compat stubs (per evitare ImportError se qualche file legacy
# importa ancora qui). Tutti raise NotImplementedError.

def normalize_dataframe(*args, **kwargs):  # pragma: no cover
    raise NotImplementedError(
        "normalize_dataframe è stato eliminato in V-H.J (sessione 2026-05-12). "
        "Usa il template v2 (GET /vini/cantina-tools/template-v2) e l'import "
        "v2 (POST /vini/cantina-tools/import-v2)."
    )


def init_database(*args, **kwargs):  # pragma: no cover
    raise NotImplementedError(
        "init_database (DB legacy 'vini.sqlite3') è stato eliminato in V-H.J. "
        "Il DB di magazzino è 'vini_magazzino.sqlite3'."
    )
