# @version: v1.0 — turni chiusi nel calendario → fasce chiuse in TRGB e online chiuso su TheFork (2026-11-19)
# -*- coding: utf-8 -*-
"""
Chiusure → Prenotazioni e TheFork — Modulo: prenotazioni — [core]

Decisione di Marco (2026-11-19): le chiusure si fanno UNA volta, in TRGB
(Vendite › Chiusure). Su TheFork non si chiude più a mano: l'API B2B non
permette di leggere le chiusure fatte su TheFork Manager, quindi la strada è
una sola, TRGB → TheFork.

Per ogni turno chiuso con una data (giorni chiusi + turni chiusi, da oggi in
poi; il giorno fisso no, è l'orario normale che TheFork conosce già):

  1. in TRGB le fasce del turno diventano chiuse (aperta = 0, online_aperta = 0,
     online_modo = 'chiusura'), con riga nel registro delle fasce;
  2. su TheFork si chiude l'online su tutto il turno con un override solo
     (startTime → endTime), così restano chiusi anche gli orari che TheFork ha
     e le fasce TRGB no (TheFork ignora gli orari fuori servizio).

Un turno che torna aperto: le fasce con online_modo = 'chiusura' tornano aperte
(e al motore online), su TheFork si riapre il turno e si richiudono subito le
fasce che in TRGB restano chiuse online per altri motivi.

Quando gira: subito dopo un salvataggio del calendario (ascoltatore di
calendario_chiusure, in un thread) e a ogni giro del motore online (10 minuti,
anche con il motore spento). Se non c'è niente da cambiare non chiama TheFork.
"""

from __future__ import annotations

import logging
import threading
from datetime import date, datetime, timedelta
from typing import Any, Dict, List, Optional, Set, Tuple

from app.services import calendario_chiusure

log = logging.getLogger("trgb.prenotazioni.chiusure")

UTENTE = "chiusure"
MODO = "chiusura"
_lock = threading.Lock()


def _soglia(cfg: Dict[str, str]) -> str:
    s = (cfg.get("soglia_pranzo_cena") or "15:00")[:5]
    return s if len(s) == 5 and s[2] == ":" else "15:00"


def finestra_turno(cfg: Dict[str, str], turno: str) -> Tuple[str, str]:
    """Orari (HH:MM) che coprono tutto il turno per l'override TheFork."""
    soglia = _soglia(cfg)
    if turno == "pranzo":
        fine = (datetime.strptime(soglia, "%H:%M") - timedelta(minutes=15)).strftime("%H:%M")
        return "06:00", fine
    return soglia, "23:45"


def _tf_pronto() -> bool:
    from app.services import thefork_service as tf
    try:
        return bool(tf.credenziali_presenti() and tf._restaurant_uuid_atteso())
    except Exception:  # noqa: BLE001
        return False


def _registra(conn, data: str, ore: str, modifica: str, esito: Optional[str], utente: str) -> None:
    try:
        conn.execute(
            "INSERT INTO prenotazioni_fasce_log (data_pasto, ore, modifica, thefork_esito, utente) VALUES (?, ?, ?, ?, ?)",
            (data, ore, modifica, esito, utente),
        )
        conn.commit()
    except Exception as e:  # noqa: BLE001
        log.warning("registro fasce %s: %s", data, e)


def _tf_turno(conn, cfg: Dict[str, str], data: str, turno: str, aperta: bool, utente: str, motivo: str) -> str:
    """Override TheFork su tutto il turno. Ritorna l'esito (anche «non configurato»)."""
    if not _tf_pronto():
        return "TheFork non configurato: cambiato solo in TRGB"
    from app.services import thefork_service as tf
    inizio, fine = finestra_turno(cfg, turno)
    try:
        tf.imposta_online(data, inizio, fine, aperta)
        esito = f"ok: {turno} {'riaperto' if aperta else 'chiuso'} online su TheFork ({inizio}–{fine})"
    except Exception as e:  # noqa: BLE001
        log.warning("TheFork %s %s %s: %s", data, turno, "apri" if aperta else "chiudi", e)
        esito = f"errore TheFork: {e}"
    _registra(conn, data, f"{inizio}–{fine}", f"{turno}: {'turno riaperto' if aperta else 'turno chiuso'} — {motivo}", esito, utente)
    return esito


def chiudi_turno(conn, cfg: Dict[str, str], data: str, turno: str, motivo: str, utente: str = UTENTE) -> Optional[Dict[str, Any]]:
    """Chiude le fasce ancora aperte del turno (TRGB + TheFork). None se era già tutto chiuso."""
    from app.services import prenotazioni_fasce_service as fasce_srv
    fasce = fasce_srv.fasce_giorno(conn, data, turno, cfg)["fasce"]
    ore = [f["ora"] for f in fasce if f["aperta"] or f["online_aperta"]]
    if not ore:
        return None
    testo = "turno chiuso" + (f" ({motivo})" if motivo else "")
    fasce_srv.imposta_fasce(conn, data, turno, ore, {"aperta": False, "online_aperta": False},
                            utente, modo=MODO, motivo=testo)
    esito = _tf_turno(conn, cfg, data, turno, False, utente, testo)
    log.info("chiuso %s %s (%s): %s", data, turno, motivo or "-", esito)
    return {"data": data, "turno": turno, "azione": "chiuso", "ore": ore, "thefork": esito}


def riapri_turno(conn, cfg: Dict[str, str], data: str, turno: str, utente: str = UTENTE) -> Optional[Dict[str, Any]]:
    """Riapre le fasce che aveva chiuso il calendario. None se non ce n'erano."""
    from app.services import prenotazioni_fasce_service as fasce_srv
    righe = conn.execute(
        "SELECT ora FROM prenotazioni_fasce WHERE data_pasto = ? AND turno = ? AND online_modo = ?",
        (data, turno, MODO),
    ).fetchall()
    ore = [r["ora"] for r in righe]
    if not ore:
        return None
    fasce_srv.imposta_fasce(conn, data, turno, ore,
                            {"aperta": True, "online_aperta": True, "online_auto": True},
                            utente, modo="manuale", motivo="turno riaperto nel calendario chiusure")
    esito = _tf_turno(conn, cfg, data, turno, True, utente, "riaperto nel calendario chiusure")
    # L'override sul turno intero ha riaperto tutto: richiudo su TheFork le fasce chiuse online per altri motivi
    if _tf_pronto() and esito.startswith("ok"):
        from app.services import thefork_service as tf
        chiuse = [f["ora"] for f in fasce_srv.fasce_giorno(conn, data, turno, cfg)["fasce"] if not f["online_aperta"]]
        for gruppo in fasce_srv._gruppi_contigui(chiuse):
            try:
                tf.imposta_online(data, gruppo[0], gruppo[-1], False)
            except Exception as e:  # noqa: BLE001
                log.warning("TheFork richiudi %s %s-%s: %s", data, gruppo[0], gruppo[-1], e)
    log.info("riaperto %s %s: %s", data, turno, esito)
    return {"data": data, "turno": turno, "azione": "riaperto", "ore": ore, "thefork": esito}


def allinea(utente: str = UTENTE, oggi: Optional[date] = None) -> Dict[str, Any]:
    """Porta fasce TRGB e TheFork in linea col calendario chiusure, da oggi in poi."""
    from app.models.clienti_db import get_clienti_conn
    oggi = oggi or date.today()
    cal = calendario_chiusure.config()
    chiusi: Set[tuple] = calendario_chiusure.date_esplicite(cal, dal=oggi)
    cambi: List[Dict[str, Any]] = []
    with _lock:
        conn = get_clienti_conn()
        try:
            cfg = {r["chiave"]: r["valore"] for r in conn.execute("SELECT chiave, valore FROM prenotazioni_config")}
            for data, turno in sorted(chiusi):
                try:
                    motivo = calendario_chiusure.chiuso(data, turno, cal) or ""
                    r = chiudi_turno(conn, cfg, data, turno, motivo, utente)
                    if r:
                        cambi.append(r)
                except Exception as e:  # noqa: BLE001 — un giorno storto non ferma gli altri
                    log.warning("chiusura %s %s: %s", data, turno, e)
            try:
                da_riaprire = {(r["data_pasto"], r["turno"]) for r in conn.execute(
                    "SELECT DISTINCT data_pasto, turno FROM prenotazioni_fasce WHERE online_modo = ? AND data_pasto >= ?",
                    (MODO, oggi.isoformat()),
                )} - chiusi
            except Exception:  # noqa: BLE001 — mig 216 non passata: niente online_modo
                da_riaprire = set()
            for data, turno in sorted(da_riaprire):
                try:
                    r = riapri_turno(conn, cfg, data, turno, utente)
                    if r:
                        cambi.append(r)
                except Exception as e:  # noqa: BLE001
                    log.warning("riapertura %s %s: %s", data, turno, e)
        finally:
            conn.close()
    return {"chiusi": len(chiusi), "cambi": cambi}


def allinea_in_background(utente: Optional[str] = None) -> None:
    def _lavoro():
        try:
            allinea(utente or UTENTE)
        except Exception as e:  # noqa: BLE001
            log.warning("allinea chiusure: %s", e)
    threading.Thread(target=_lavoro, name="chiusure-thefork", daemon=True).start()


@calendario_chiusure.al_cambio
def _calendario_cambiato(prima: Dict[str, Any], dopo: Dict[str, Any], utente: Optional[str]) -> None:
    allinea_in_background(utente)
