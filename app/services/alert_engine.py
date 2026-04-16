# @version: v1.1-alert-engine
# -*- coding: utf-8 -*-
"""
Alert Engine — TRGB Gestionale (mattone M.F)

Motore centralizzato per controllare soglie/scadenze e generare notifiche
tramite il servizio M.A (notifiche_service).

Pattern:
    1. Ogni "checker" è una funzione registrata nel REGISTRY.
    2. `run_all_checks()` esegue tutti i checker e restituisce un riepilogo.
    3. Ogni checker legge la propria config da `alert_config` (DB notifiche).
    4. Anti-duplicato: non crea notifiche se ne esiste già una recente.

Config da DB (tabella alert_config in notifiche.sqlite3):
    - attivo: 0/1 — se disattivato il checker viene saltato
    - soglia_giorni: interpretazione specifica per checker
    - antidup_ore: ore minime tra una notifica e la successiva dello stesso tipo
    - dest_ruolo / dest_username: chi riceve la notifica
    - canale_app / canale_wa / canale_email: canali abilitati
"""

import logging
from datetime import date, timedelta
from typing import Callable, Dict, List, Optional
from dataclasses import dataclass, field, asdict

logger = logging.getLogger("trgb.alert_engine")


# ─────────────────────────────────────────────
# DATACLASS risultato
# ─────────────────────────────────────────────

@dataclass
class CheckResult:
    """Risultato di un singolo checker."""
    checker: str
    found: int = 0
    notified: int = 0
    skipped: int = 0
    error: Optional[str] = None
    details: List[dict] = field(default_factory=list)

    def to_dict(self):
        return asdict(self)


# ─────────────────────────────────────────────
# REGISTRY
# ─────────────────────────────────────────────

_REGISTRY: Dict[str, Callable] = {}


def register_checker(name: str):
    """Decoratore per registrare un checker."""
    def wrapper(fn: Callable):
        _REGISTRY[name] = fn
        return fn
    return wrapper


def list_checkers() -> List[str]:
    return list(_REGISTRY.keys())


# ─────────────────────────────────────────────
# CONFIG LOADER
# ─────────────────────────────────────────────

_DEFAULT_CONFIG = {
    "attivo": True,
    "soglia_giorni": 7,
    "antidup_ore": 24,
    "dest_ruolo": "admin",
    "dest_username": None,
    "canale_app": True,
    "canale_wa": False,
    "canale_email": False,
}


def _get_config(checker_name: str) -> dict:
    """Carica la config per un checker dal DB. Fallback su defaults."""
    try:
        from app.models.notifiche_db import get_notifiche_conn
        conn = get_notifiche_conn()
        row = conn.execute(
            "SELECT * FROM alert_config WHERE checker = ?", (checker_name,)
        ).fetchone()
        conn.close()
        if row:
            return {
                "attivo": bool(row["attivo"]),
                "soglia_giorni": row["soglia_giorni"],
                "antidup_ore": row["antidup_ore"],
                "dest_ruolo": row["dest_ruolo"],
                "dest_username": row["dest_username"],
                "canale_app": bool(row["canale_app"]),
                "canale_wa": bool(row["canale_wa"]),
                "canale_email": bool(row["canale_email"]),
            }
    except Exception as e:
        logger.warning(f"Config load per '{checker_name}' fallito, uso defaults: {e}")
    return dict(_DEFAULT_CONFIG)


# ─────────────────────────────────────────────
# RUNNER
# ─────────────────────────────────────────────

def run_check(name: str, dry_run: bool = False) -> CheckResult:
    """Esegue un singolo checker per nome."""
    fn = _REGISTRY.get(name)
    if not fn:
        return CheckResult(checker=name, error=f"Checker '{name}' non trovato")

    cfg = _get_config(name)
    if not cfg["attivo"]:
        return CheckResult(checker=name, skipped=1, error="disattivato")

    try:
        return fn(dry_run=dry_run, config=cfg)
    except Exception as e:
        logger.exception(f"Alert checker '{name}' fallito: {e}")
        return CheckResult(checker=name, error=str(e))


def run_all_checks(dry_run: bool = False) -> List[CheckResult]:
    """Esegue tutti i checker registrati."""
    return [run_check(name, dry_run=dry_run) for name in _REGISTRY]


# ─────────────────────────────────────────────
# HELPER: anti-duplicato notifiche
# ─────────────────────────────────────────────

def _notifica_recente_esiste(tipo: str, ore: int = 24, entity_id: int = None) -> bool:
    """Controlla se esiste già una notifica dello stesso tipo nelle ultime N ore."""
    try:
        from app.models.notifiche_db import get_notifiche_conn
        conn = get_notifiche_conn()
        if entity_id is not None:
            row = conn.execute("""
                SELECT COUNT(*) as cnt FROM notifiche
                WHERE tipo = ? AND entity_id = ?
                  AND created_at >= datetime('now', 'localtime', ?)
            """, (tipo, entity_id, f"-{ore} hours")).fetchone()
        else:
            row = conn.execute("""
                SELECT COUNT(*) as cnt FROM notifiche
                WHERE tipo = ? AND entity_id IS NULL
                  AND created_at >= datetime('now', 'localtime', ?)
            """, (tipo, f"-{ore} hours")).fetchone()
        conn.close()
        return (row["cnt"] if row else 0) > 0
    except Exception as e:
        logger.warning(f"Anti-duplicato notifica fallito: {e}")
        return False


# ─────────────────────────────────────────────
# HELPER: crea notifica rispettando canali
# ─────────────────────────────────────────────

def _send_notification(config: dict, **kwargs):
    """Crea notifica in-app e/o via WA/email in base alla config canali.
    dest_username può essere una lista comma-separated → crea una notifica per utente."""
    # Canale app (notifica in-app via M.A)
    if config.get("canale_app", True):
        from app.services.notifiche_service import crea_notifica
        dest_ruolo = config.get("dest_ruolo")
        dest_usernames_raw = config.get("dest_username") or ""
        dest_usernames = [u.strip() for u in dest_usernames_raw.split(",") if u.strip()]

        if dest_usernames:
            # Notifica individuale per ogni utente selezionato
            for uname in dest_usernames:
                crea_notifica(dest_ruolo=None, dest_username=uname, **kwargs)
            # Anche per il ruolo se impostato (altri utenti con quel ruolo)
            if dest_ruolo:
                crea_notifica(dest_ruolo=dest_ruolo, dest_username=None, **kwargs)
        else:
            # Solo per ruolo (comportamento default)
            crea_notifica(dest_ruolo=dest_ruolo, dest_username=None, **kwargs)

    # Canale WhatsApp (M.C) — solo se abilitato
    if config.get("canale_wa", False):
        try:
            from app.utils.whatsapp import build_wa_link
            # Log: WA alert preparato (invio effettivo richiede numero destinatario)
            logger.info(f"WA alert: {kwargs.get('titolo', '')} [canale abilitato, invio manuale]")
        except Exception as e:
            logger.warning(f"WA notification fallita: {e}")

    # Canale email (M.D) — futuro, solo log per ora
    if config.get("canale_email", False):
        logger.info(f"Email alert: {kwargs.get('titolo', '')} [M.D non ancora implementato]")


# ═════════════════════════════════════════════
# CHECKER 1: Fatture in scadenza / scadute
# ═════════════════════════════════════════════

@register_checker("fatture_scadenza")
def _check_fatture_scadenza(dry_run: bool = False, config: dict = None) -> CheckResult:
    """
    Controlla fatture non pagate con data_scadenza entro soglia_giorni
    o già scadute. Genera una notifica riepilogativa.
    """
    from app.models.foodcost_db import get_foodcost_connection
    cfg = config or _get_config("fatture_scadenza")

    result = CheckResult(checker="fatture_scadenza")
    oggi = date.today().isoformat()
    soglia = (date.today() + timedelta(days=cfg["soglia_giorni"])).isoformat()

    try:
        conn = get_foodcost_connection()

        scadute = conn.execute("""
            SELECT id, fornitore_nome, totale_fattura, data_scadenza
            FROM fe_fatture
            WHERE COALESCE(pagato, 0) = 0
              AND data_scadenza IS NOT NULL AND data_scadenza != ''
              AND data_scadenza < ?
        """, (oggi,)).fetchall()

        in_scadenza = conn.execute("""
            SELECT id, fornitore_nome, totale_fattura, data_scadenza
            FROM fe_fatture
            WHERE COALESCE(pagato, 0) = 0
              AND data_scadenza IS NOT NULL AND data_scadenza != ''
              AND data_scadenza >= ? AND data_scadenza <= ?
        """, (oggi, soglia)).fetchall()

        conn.close()

        n_scadute = len(scadute)
        n_in_scadenza = len(in_scadenza)
        result.found = n_scadute + n_in_scadenza

        if result.found == 0:
            return result

        for r in scadute:
            result.details.append({
                "id": r["id"], "fornitore": r["fornitore_nome"],
                "totale": r["totale_fattura"], "scadenza": r["data_scadenza"],
                "stato": "scaduta"
            })
        for r in in_scadenza:
            result.details.append({
                "id": r["id"], "fornitore": r["fornitore_nome"],
                "totale": r["totale_fattura"], "scadenza": r["data_scadenza"],
                "stato": "in_scadenza"
            })

        if dry_run:
            result.skipped = result.found
            return result

        if _notifica_recente_esiste("alert_fatture_scadenza", ore=cfg["antidup_ore"]):
            result.skipped = result.found
            return result

        parti = []
        if n_scadute > 0:
            parti.append(f"{n_scadute} scadut{'a' if n_scadute == 1 else 'e'}")
        if n_in_scadenza > 0:
            parti.append(f"{n_in_scadenza} in scadenza entro {cfg['soglia_giorni']}gg")

        totale_euro = sum(
            (r["totale_fattura"] or 0) for r in list(scadute) + list(in_scadenza)
        )

        _send_notification(cfg,
            tipo="alert_fatture_scadenza",
            titolo=f"Fatture: {' + '.join(parti)}",
            messaggio=f"Totale: €{totale_euro:,.2f}",
            link="/acquisti/fatture",
            icona="💰",
            urgenza="alta" if n_scadute > 0 else "normale",
            modulo="acquisti",
        )
        result.notified = 1
        return result

    except Exception as e:
        result.error = str(e)
        logger.exception(f"Checker fatture_scadenza: {e}")
        return result


# ═════════════════════════════════════════════
# CHECKER 2: Documenti dipendenti in scadenza
# ═════════════════════════════════════════════

@register_checker("dipendenti_scadenze")
def _check_dipendenti_scadenze(dry_run: bool = False, config: dict = None) -> CheckResult:
    """
    Controlla documenti dipendenti che scadono entro alert_giorni del documento.
    soglia_giorni dalla config non sovrascrive alert_giorni del singolo documento,
    ma serve come fallback se il documento non ha alert_giorni impostato.
    """
    from app.models.dipendenti_db import get_dipendenti_conn
    cfg = config or _get_config("dipendenti_scadenze")

    result = CheckResult(checker="dipendenti_scadenze")
    oggi = date.today().isoformat()
    fallback_giorni = cfg["soglia_giorni"]  # usato come default se alert_giorni è NULL

    try:
        conn = get_dipendenti_conn()

        rows = conn.execute("""
            SELECT ds.id, ds.tipo, ds.descrizione, ds.data_scadenza,
                   ds.alert_giorni, ds.stato,
                   d.nome, d.cognome
            FROM dipendenti_scadenze ds
            JOIN dipendenti d ON ds.dipendente_id = d.id
            WHERE ds.data_scadenza IS NOT NULL
              AND ds.data_scadenza != ''
              AND ds.data_scadenza <= date(?, '+' || COALESCE(ds.alert_giorni, ?) || ' days')
              AND ds.data_scadenza >= date(?, '-30 days')
              AND COALESCE(ds.stato, 'VALIDO') != 'SCADUTO'
              AND COALESCE(d.attivo, 1) = 1
        """, (oggi, fallback_giorni, oggi)).fetchall()
        conn.close()

        result.found = len(rows)
        if result.found == 0:
            return result

        scaduti = []
        imminenti = []
        for r in rows:
            info = {
                "id": r["id"],
                "dipendente": f"{r['nome']} {r['cognome']}",
                "tipo": r["tipo"],
                "descrizione": r["descrizione"],
                "scadenza": r["data_scadenza"],
            }
            if r["data_scadenza"] < oggi:
                info["stato"] = "scaduto"
                scaduti.append(info)
            else:
                info["stato"] = "imminente"
                imminenti.append(info)
            result.details.append(info)

        if dry_run:
            result.skipped = result.found
            return result

        if _notifica_recente_esiste("alert_dipendenti_scadenze", ore=cfg["antidup_ore"]):
            result.skipped = result.found
            return result

        parti = []
        if scaduti:
            parti.append(f"{len(scaduti)} già scadut{'o' if len(scaduti) == 1 else 'i'}")
        if imminenti:
            parti.append(f"{len(imminenti)} in scadenza")

        _send_notification(cfg,
            tipo="alert_dipendenti_scadenze",
            titolo=f"Documenti dipendenti: {' + '.join(parti)}",
            messaggio=", ".join(
                f"{d['dipendente']} ({d['tipo']})"
                for d in (scaduti + imminenti)[:5]
            ) + ("..." if len(scaduti) + len(imminenti) > 5 else ""),
            link="/dipendenti/scadenze",
            icona="📋",
            urgenza="alta" if scaduti else "normale",
            modulo="dipendenti",
        )
        result.notified = 1
        return result

    except Exception as e:
        result.error = str(e)
        logger.exception(f"Checker dipendenti_scadenze: {e}")
        return result


# ═════════════════════════════════════════════
# CHECKER 3: Vini sotto scorta minima
# ═════════════════════════════════════════════

@register_checker("vini_sottoscorta")
def _check_vini_sottoscorta(dry_run: bool = False, config: dict = None) -> CheckResult:
    """
    Controlla vini con quantità inferiore alla scorta minima.
    Resiliente: se la colonna scorta_minima non esiste, esce senza errore.
    """
    cfg = config or _get_config("vini_sottoscorta")
    result = CheckResult(checker="vini_sottoscorta")

    try:
        try:
            from app.models import vini_db
            if hasattr(vini_db, 'get_vini_conn'):
                conn = vini_db.get_vini_conn()
            else:
                raise ImportError("get_vini_conn non disponibile")
        except Exception:
            import sqlite3 as _sqlite3
            from pathlib import Path
            vini_path = Path(__file__).resolve().parents[1] / "data" / "vini.sqlite3"
            conn = _sqlite3.connect(str(vini_path))
            conn.row_factory = _sqlite3.Row

        try:
            rows = conn.execute("""
                SELECT id, COALESCE(DESCRIZIONE, PRODUTTORE, '') as nome,
                       COALESCE(qta, 0) as qta,
                       scorta_minima
                FROM vini
                WHERE COALESCE(scorta_minima, 0) > 0
                  AND COALESCE(qta, 0) < scorta_minima
                  AND COALESCE(attivo, 1) = 1
            """).fetchall()
        except Exception:
            conn.close()
            result.error = "colonna scorta_minima non presente"
            return result

        conn.close()

        result.found = len(rows)
        if result.found == 0:
            return result

        for r in rows:
            result.details.append({
                "id": r["id"],
                "nome": r["nome"],
                "qta": r["qta"],
                "scorta_minima": r["scorta_minima"],
            })

        if dry_run:
            result.skipped = result.found
            return result

        if _notifica_recente_esiste("alert_vini_sottoscorta", ore=cfg["antidup_ore"]):
            result.skipped = result.found
            return result

        _send_notification(cfg,
            tipo="alert_vini_sottoscorta",
            titolo=f"{result.found} vin{'o' if result.found == 1 else 'i'} sotto scorta minima",
            messaggio=", ".join(
                f"{d['nome']} ({d['qta']}/{d['scorta_minima']})"
                for d in result.details[:5]
            ) + ("..." if result.found > 5 else ""),
            link="/vini/magazzino/",
            icona="🍷",
            urgenza="normale",
            modulo="vini",
        )
        result.notified = 1
        return result

    except Exception as e:
        result.error = str(e)
        logger.exception(f"Checker vini_sottoscorta: {e}")
        return result
