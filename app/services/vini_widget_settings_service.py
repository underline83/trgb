# Modulo: vini
"""
Service: vini_widget_settings — accesso ai settings operativi del modulo Vini.

Espone una API unica per leggere/scrivere le soglie configurabili del
modulo Vini (calici, dashboard, decidi-prezzo, ritmo vendita, prezzo calice
automatico, ecc.). Vedi mig 123 e tabella `vini_widget_settings` per la
lista completa.

PATTERN:
  - Cache in-memory dopo prima lettura (settings cambia raramente).
  - Invalidazione esplicita su PUT/reset via `invalidate_cache()`.
  - Fallback hardcoded se la chiave manca (es. DB non ancora migrato in dev).

USO:
    from app.services.vini_widget_settings_service import get_widget_setting
    fresh_hours = get_widget_setting("calici_fresh_hours", default=12, tipo="int")
"""

from __future__ import annotations
from typing import Any, Dict, Optional
import sqlite3

from app.utils.locale_data import locale_data_path


SETTINGS_DB = locale_data_path("vini_settings.sqlite3")


# Cache process-local: { key: (raw_value: str, tipo: str) }
_cache: Dict[str, tuple] = {}
_cache_loaded: bool = False


# Default operativi delle 12 soglie. Single source of truth: questo modulo.
# La migration 123 importa da qui per il seed iniziale.
# Schema: (key, value_str, tipo, descrizione).
WIDGET_DEFAULTS = [
    # Calici disponibili (widget Dashboard)
    ("calici_fresh_hours",            "12",  "int",     "Ore: bottiglia aperta da meno → sfondo verde (zona fresca)"),
    ("calici_alert_hours",            "36",  "int",     "Ore: bottiglia aperta da più → alert rosso (zona critica)"),
    # Dashboard Vini — cutoff temporali
    ("vini_fermi_giorni",             "30",  "int",     "Giorni: vino senza movimenti = 'fermo'"),
    ("top_vendute_giorni",            "30",  "int",     "Giorni: finestra calcolo 'top vendute'"),
    # Alert "Vini in carta senza giacenza" — qta suggerita
    ("qta_suggerita_giorni_storico",  "60",  "int",     "Giorni: finestra storico vendite per calcolare qta suggerita riordino"),
    ("qta_suggerita_divisore",        "2",   "float",   "Divisore: vendite_60gg / N = qta suggerita (default 2 = metà del venduto)"),
    # Metriche ritmo vendita (vini_metrics.py)
    ("ritmo_soglia_top",              "5",   "float",   "Bottiglie/mese: ≥ N → 'top seller'"),
    ("ritmo_soglia_medio",            "1",   "float",   "Bottiglie/mese: ≥ N → 'medio', sotto = 'poco'"),
    # DecidiPrezzoCalice (modale sommelier)
    ("decidi_calice_soglia_warn_pct", "40",  "percent", "%: prezzo oltre +N% del default → zona morbida (no obbligo nota)"),
    ("decidi_calice_soglia_block_pct","50",  "percent", "%: prezzo oltre +N% del default → nota obbligatoria"),
    # Prezzo calice automatico (fallback / ricalcola-batch)
    ("prezzo_calice_divisore",        "5",   "float",   "Divisore default: PREZZO_CARTA / N = prezzo calice automatico"),
    ("prezzo_calice_step_round",      "0.5", "float",   "Step arrotondamento prezzo calice (es. 0.5 = €,50)"),
]


# Map veloce key → (value_str, tipo) per fallback in-process se DB assente.
_FALLBACK: Dict[str, tuple] = {
    key: (value, tipo) for key, value, tipo, _descr in WIDGET_DEFAULTS
}


def _coerce(raw: str, tipo: str) -> Any:
    """Converte stringa DB al tipo dichiarato."""
    if tipo == "int":
        return int(raw)
    if tipo in ("float", "percent"):
        return float(raw)
    return raw


def _load_all() -> None:
    """Carica tutta la tabella in cache (chiamato lazy al primo accesso)."""
    global _cache, _cache_loaded
    _cache = {}
    try:
        if not SETTINGS_DB.exists():
            _cache_loaded = True
            return
        conn = sqlite3.connect(SETTINGS_DB)
        cur = conn.cursor()
        # Verifica esistenza tabella (mig 123 potrebbe non essere ancora applicata)
        row = cur.execute(
            "SELECT name FROM sqlite_master WHERE type='table' AND name='vini_widget_settings'"
        ).fetchone()
        if not row:
            conn.close()
            _cache_loaded = True
            return
        rows = cur.execute(
            "SELECT key, value, tipo FROM vini_widget_settings"
        ).fetchall()
        for key, value, tipo in rows:
            _cache[key] = (value, tipo or "int")
        conn.close()
    except sqlite3.Error:
        # Best effort: se qualcosa va storto, restiamo coi fallback.
        pass
    finally:
        _cache_loaded = True


def get_widget_setting(key: str, default: Optional[Any] = None, tipo: Optional[str] = None) -> Any:
    """
    Ritorna il valore tipizzato per la chiave.

    Args:
        key: nome della soglia (vedi WIDGET_DEFAULTS in mig 123).
        default: fallback se chiave assente e non c'è fallback hardcoded.
        tipo: forza tipo se chiave assente sia in DB che in _FALLBACK
              (altrimenti viene dedotto).

    Returns:
        Valore tipizzato (int, float, str a seconda di `tipo`).
    """
    global _cache_loaded
    if not _cache_loaded:
        _load_all()

    if key in _cache:
        raw, t = _cache[key]
        try:
            return _coerce(raw, t)
        except (TypeError, ValueError):
            pass

    if key in _FALLBACK:
        raw, t = _FALLBACK[key]
        try:
            return _coerce(raw, tipo or t)
        except (TypeError, ValueError):
            pass

    return default


def get_all_widget_settings() -> Dict[str, Dict[str, Any]]:
    """
    Ritorna dict completo dei settings: { key: {value, tipo, descrizione} }.
    Usato dall'endpoint GET /vini/settings/widget/.
    """
    if not SETTINGS_DB.exists():
        return {}
    try:
        conn = sqlite3.connect(SETTINGS_DB)
        conn.row_factory = sqlite3.Row
        cur = conn.cursor()
        row = cur.execute(
            "SELECT name FROM sqlite_master WHERE type='table' AND name='vini_widget_settings'"
        ).fetchone()
        if not row:
            conn.close()
            return {}
        rows = cur.execute(
            "SELECT key, value, tipo, descrizione, updated_at FROM vini_widget_settings ORDER BY key"
        ).fetchall()
        conn.close()
        result: Dict[str, Dict[str, Any]] = {}
        for r in rows:
            tipo = r["tipo"] or "int"
            try:
                typed_value = _coerce(r["value"], tipo)
            except (TypeError, ValueError):
                typed_value = r["value"]
            result[r["key"]] = {
                "value": typed_value,
                "raw": r["value"],
                "tipo": tipo,
                "descrizione": r["descrizione"],
                "updated_at": r["updated_at"],
            }
        return result
    except sqlite3.Error:
        return {}


def set_widget_setting(key: str, value: Any) -> bool:
    """
    Aggiorna un setting esistente. Ritorna True se OK, False se chiave non esiste.
    Invalida la cache.
    """
    if not SETTINGS_DB.exists():
        return False
    try:
        conn = sqlite3.connect(SETTINGS_DB)
        cur = conn.cursor()
        row = cur.execute(
            "SELECT tipo FROM vini_widget_settings WHERE key = ?", (key,)
        ).fetchone()
        if not row:
            conn.close()
            return False
        # Normalizza al tipo dichiarato
        tipo = row[0] or "int"
        try:
            typed = _coerce(str(value), tipo)
            raw = str(typed)
        except (TypeError, ValueError):
            conn.close()
            return False
        cur.execute(
            "UPDATE vini_widget_settings SET value = ?, updated_at = datetime('now') WHERE key = ?",
            (raw, key),
        )
        conn.commit()
        conn.close()
        invalidate_cache()
        return True
    except sqlite3.Error:
        return False


def reset_widget_settings() -> int:
    """
    Ripristina tutti i settings ai default catturati in WIDGET_DEFAULTS.
    Cancella le righe esistenti e ricrea con i valori canonici.
    Ritorna numero righe re-inserite. Solo admin.
    """
    if not SETTINGS_DB.exists():
        return 0
    conn = sqlite3.connect(SETTINGS_DB)
    cur = conn.cursor()
    # Assicura tabella esistente (caso edge: reset chiamato prima della mig)
    cur.execute("""
        CREATE TABLE IF NOT EXISTS vini_widget_settings (
            key         TEXT PRIMARY KEY,
            value       TEXT NOT NULL,
            tipo        TEXT NOT NULL DEFAULT 'int',
            descrizione TEXT,
            updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
        )
    """)
    cur.execute("DELETE FROM vini_widget_settings")
    n = 0
    for key, value, tipo, descr in WIDGET_DEFAULTS:
        cur.execute(
            """
            INSERT INTO vini_widget_settings (key, value, tipo, descrizione)
            VALUES (?, ?, ?, ?)
            """,
            (key, value, tipo, descr),
        )
        n += 1
    conn.commit()
    conn.close()
    invalidate_cache()
    return n


def invalidate_cache() -> None:
    """Forza ricarica al prossimo `get_widget_setting`."""
    global _cache, _cache_loaded
    _cache = {}
    _cache_loaded = False


# ============================================================
# HELPER PREZZO CALICE
# ------------------------------------------------------------
# Riusato da: vini_magazzino_router.py (carta-staff + calici-disponibili),
# vini_repository.py (carta cliente + sezione calici), vini_router.py
# (carta cliente), vini_pricing_router.py (ricalcola-calici bulk).
# Esposto qui per single-source-of-truth.
# ============================================================
def calcola_prezzo_calice_default(prezzo_carta: Optional[float]) -> Optional[float]:
    """
    Calcola il prezzo calice default da PREZZO_CARTA.

    Default storico: PREZZO_CARTA / 5, arrotondato a step 0.5.
    Configurabile via widget_settings:
      - `prezzo_calice_divisore` (default 5)
      - `prezzo_calice_step_round` (default 0.5)

    Ritorna None se prezzo_carta è None, 0 o invalido.
    """
    if not prezzo_carta or prezzo_carta <= 0:
        return None
    try:
        divisore = float(get_widget_setting("prezzo_calice_divisore", default=5))
        step = float(get_widget_setting("prezzo_calice_step_round", default=0.5))
    except Exception:
        divisore, step = 5.0, 0.5
    if divisore <= 0:
        divisore = 5.0
    raw = prezzo_carta / divisore
    if step and step > 0:
        return round(raw / step) * step
    return raw
