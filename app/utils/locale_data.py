# @version: v2.0 — R6.5 push 3 (sessione 2026-05-05)
# -*- coding: utf-8 -*-
"""
Helper centralizzato per il path dei DB SQLite e file dati del locale corrente.

Razionale (R6.5 del refactor monorepo):
- I dati del locale (DB SQLite + JSON config) vivono in `locali/<TRGB_LOCALE>/data/`.
- Storicamente vivevano in `app/data/`. R6 + R6.5 hanno gradualmente spostato:
    - R6 (29/04): introduce `locale_data_path()` con fallback automatico
    - R6.5 push 1 (02/05): applica il helper a 10 DB + JSON config
    - R6.5 push 2 (04/05): sposta fisicamente i 10 DB in `locali/tregobbi/data/`
    - R6.5 push 3 (05/05): rimuove il fallback automatico — fail-loud invece di
      silent fallback. Vedi sezione "Perché niente fallback runtime".

Modulo: platform/data. Vedi docs/refactor_monorepo.md §3 R6/R6.5,
docs/sicurezza_backup.md, docs/r6_5_push_2_runbook.md, docs/problemi.md S60-INC1.

==============================================================================
PERCHÉ NIENTE FALLBACK RUNTIME (post-incidente 4 maggio 2026)
==============================================================================
La v1 di questo helper aveva fallback automatico:
    return locali/<id>/data/<file> if exists else app/data/<file>

L'incidente del 3 maggio è stato causato da questa ambiguità: il backend al
boot apriva connessioni SQLite verso path inconsistenti (locale-aware per
alcuni moduli, legacy per altri), generando race con WAL e file stub da 4096
byte creati nel posto sbagliato. Backend zombie per 36h, DB svuotati, perdita
dati operativi 1.5 giornate piene (S60-INC1).

La v2 elimina il fallback. Ogni file ha UN SOLO path canonico:
`locali/<TRGB_LOCALE>/data/<filename>`. Se un caller cerca un file che non
esiste lì, si solleva FileNotFoundError esplicito (fail-loud) invece di
fallback silente. Questo costringe a:
- Spostare ogni file rimasto in `app/data/` nel path corretto (operazione mv)
- Fixare ogni codice che ancora costruisce path via `Path("app/data/...")`
- Niente più "il backend continua a funzionare ma sta leggendo da posto sbagliato"
==============================================================================
"""
from __future__ import annotations

import os
import logging
from pathlib import Path

# Root del repo (parent di app/utils/)
_REPO_ROOT = Path(__file__).resolve().parents[2]

logger = logging.getLogger(__name__)


def _current_locale() -> str:
    """Default 'tregobbi' per backward compat con osteria di Marco."""
    return os.environ.get("TRGB_LOCALE", "tregobbi").strip() or "tregobbi"


def locale_data_path(filename: str) -> Path:
    """
    Ritorna il path canonico al file dati del locale corrente.

    Path UNICO: `locali/<TRGB_LOCALE>/data/<filename>`.

    Comportamento (v2.0, post R6.5 push 3):
    - Se la directory `locali/<TRGB_LOCALE>/data/` non esiste, viene creata
      (mkdir parents=True, exist_ok=True).
    - Ritorna sempre il path nuovo, indipendentemente dal fatto che il file
      esista o no. La creazione del file è responsabilità del caller (es.
      sqlite3.connect crea il DB al primo open, json.dump scrive un nuovo
      file).
    - **Niente fallback ad app/data/** (rimosso in R6.5 push 3 dopo
      l'incidente del 3 maggio per eliminare l'ambiguità di path).

    Migrazione one-shot (R6.5 push 2/3):
    - Tutti i file devono essere fisicamente in `locali/<id>/data/` PRIMA del
      deploy della v2. Se manca un file, il primo accesso troverà directory
      vuota e si comporterà come "primo boot" (es. SQLite crea DB vuoto,
      auth_service.py crea users.json di emergenza).
    - Per evitarlo: spostare manualmente i file residui da `app/data/` a
      `locali/<id>/data/` prima del push v2 (vedi docs/r6_5_push_2_runbook.md).

    Esempio:
        from app.utils.locale_data import locale_data_path
        DB_PATH = locale_data_path("foodcost.db")
        conn = sqlite3.connect(DB_PATH)

    Per accedere alla cartella base: vedi `locale_data_dir()`.
    """
    locale = _current_locale()
    base = _REPO_ROOT / "locali" / locale / "data"
    base.mkdir(parents=True, exist_ok=True)
    return base / filename


def locale_data_dir() -> Path:
    """
    Ritorna la directory base dati per il locale corrente.
    Crea la cartella se non esiste.
    """
    locale = _current_locale()
    p = _REPO_ROOT / "locali" / locale / "data"
    p.mkdir(parents=True, exist_ok=True)
    return p


def assert_locale_data_exists(filename: str) -> Path:
    """
    Variante stretta di `locale_data_path()` per i caller che si aspettano un
    file ESISTENTE. Solleva FileNotFoundError se il file non c'è.

    Da usare nei punti dove un file mancante è un sintomo grave (es. backup
    runner, integrity checker). Non usare nelle init_*_database (che possono
    legittimamente creare il DB al primo accesso).
    """
    p = locale_data_path(filename)
    if not p.exists():
        raise FileNotFoundError(
            f"File atteso ma non trovato: {p}. "
            f"Probabile mancato spostamento da app/data/ in locali/{_current_locale()}/data/. "
            f"Vedi docs/r6_5_push_2_runbook.md."
        )
    return p
