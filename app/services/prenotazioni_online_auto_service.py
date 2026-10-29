# @version: v1.0 — vendita online per fascia decisa dal motore per tavoli (2026-10-29, mig 216)
# -*- coding: utf-8 -*-
"""
Vendita online automatica — Modulo: prenotazioni — [core]

Passo 3 della disponibilità per tavoli. Il problema: un gruppo preso a mano
(o dal sito) TheFork non lo vede, e continua a vendere tavoli che non ci sono.
TheFork dall'API permette solo di aprire o chiudere la vendita online di una
fascia (override availability), non di limitarla: quindi, fascia per fascia,

  online aperto  ⇔  la fascia è aperta, non è piena (limiti TRGB)
                    e il motore per tavoli trova ancora posto per
                    `soglia_online_tavolo` persone (default 6) a quell'ora
                    senza lasciare fuori nessuno.

Modalità (prenotazioni_config.online_automatico):
  spento  non calcola niente
  prova   calcola e mostra nel pannello Fasce («il motore chiuderebbe»), non tocca niente
  attivo  apre/chiude in TRGB e su TheFork (via prenotazioni_fasce_service.imposta_fasce)

Una fascia cambiata a mano dalla sala (online_modo = 'manuale') il motore non la
tocca finché qualcuno non la rimette in automatico. Ogni cambio finisce nel
registro delle fasce con il motivo. Si ricalcola dopo ogni cambio di
prenotazioni, sale, blocchi (in background) e comunque ogni 10 minuti.
"""

from __future__ import annotations

import logging
import threading
import time
from datetime import date, datetime, timedelta
from typing import Any, Dict, List, Optional

from app.models.clienti_db import get_clienti_conn

log = logging.getLogger("trgb.prenotazioni.online_auto")

UTENTE = "motore tavoli"
MODI = ("spento", "prova", "attivo")
_lock = threading.Lock()
_stato: Dict[str, Any] = {"avviato": False}


def _config(conn) -> Dict[str, str]:
    return {r["chiave"]: r["valore"] for r in conn.execute("SELECT chiave, valore FROM prenotazioni_config")}


def modo(cfg: Dict[str, str]) -> str:
    m = (cfg.get("online_automatico") or "spento").strip().lower()
    return m if m in MODI else "spento"


def _int(v, d):
    try:
        return int(v) if v not in (None, "") else d
    except (TypeError, ValueError):
        return d


def _ok(conn) -> bool:
    try:
        conn.execute("SELECT 1 FROM prenotazioni_fasce_auto LIMIT 1")
        return True
    except Exception:  # mig 216 non ancora passata
        return False


def calcola(conn, data: str, turno: str, cfg: Optional[Dict[str, str]] = None,
            adesso: Optional[datetime] = None) -> List[Dict[str, Any]]:
    """Per ogni fascia del turno: il motore vuole l'online aperto o chiuso, e perché."""
    from app.services import prenotazioni_fasce_service as fasce_srv
    from app.services import prenotazioni_tavoli_service as tavoli_srv
    cfg = cfg or _config(conn)
    adesso = adesso or datetime.now()
    soglia = _int(cfg.get("soglia_online_tavolo"), 6)
    fasce = fasce_srv.fasce_giorno(conn, data, turno, cfg)["fasce"]
    if not fasce:
        return []
    ver = tavoli_srv.Verificatore(conn, data, turno)
    out = []
    for f in fasce:
        if data == adesso.date().isoformat() and f["ora"] < adesso.strftime("%H:%M"):
            continue   # orario già passato
        if not f["aperta"]:
            continue   # fascia chiusa a mano: online già chiuso
        if f["piena"]:
            vuole, motivo = False, f"fascia piena ({f['coperti']} su {f['max_coperti']} coperti)"
        elif f["online_piena"]:
            vuole, motivo = False, f"online pieno ({f['online']} su {f['max_online']})"
        elif not ver.ha_tavoli:
            vuole, motivo = True, "nessun tavolo in mappa: decide la capienza"
        else:
            v = ver.verifica(soglia, f["ora"])
            if v["entra"]:
                vuole, motivo = True, f"c'è posto per {soglia} ({v['tavolo']['nome']})"
            else:
                vuole, motivo = False, f"nessun tavolo libero per {soglia} persone alle {f['ora']}"
        out.append({"ora": f["ora"], "vuole_aperto": vuole, "motivo": motivo,
                    "online_aperta": f["online_aperta"], "online_modo": f.get("online_modo")})
    return out


def applica(conn, data: str, turno: str, cfg: Optional[Dict[str, str]] = None,
            adesso: Optional[datetime] = None) -> Dict[str, Any]:
    """Calcola, salva in prenotazioni_fasce_auto e (se attivo) apre/chiude le fasce."""
    from app.services import prenotazioni_fasce_service as fasce_srv
    cfg = cfg or _config(conn)
    m = modo(cfg)
    if m == "spento" or not _ok(conn):
        return {"modo": m, "cambi": []}
    voci = calcola(conn, data, turno, cfg, adesso)
    conn.execute("DELETE FROM prenotazioni_fasce_auto WHERE data_pasto = ? AND turno = ?", (data, turno))
    for v in voci:
        conn.execute("""
            INSERT OR REPLACE INTO prenotazioni_fasce_auto (data_pasto, ora, turno, vuole_aperto, motivo, updated_at)
            VALUES (?, ?, ?, ?, ?, datetime('now','localtime'))
        """, (data, v["ora"], turno, 1 if v["vuole_aperto"] else 0, v["motivo"]))
    conn.commit()
    cambi = []
    if m == "attivo":
        for stato in (False, True):
            ore = [v for v in voci if v["online_modo"] != "manuale"
                   and v["vuole_aperto"] == stato and v["online_aperta"] != stato]
            if not ore:
                continue
            motivo = ore[0]["motivo"] if len({v["motivo"] for v in ore}) == 1 else ("posto esaurito" if not stato else "torna posto")
            r = fasce_srv.imposta_fasce(conn, data, turno, [v["ora"] for v in ore], {"online_aperta": stato},
                                        UTENTE, modo="auto", motivo=motivo)
            cambi.append({"ore": [v["ora"] for v in ore], "aperta": stato, "motivo": motivo, "thefork": r.get("thefork")})
            log.info("online %s %s %s: %s", "aperto" if stato else "chiuso", data, [v["ora"] for v in ore], motivo)
    return {"modo": m, "cambi": cambi, "fasce": voci}


def giro(adesso: Optional[datetime] = None) -> Dict[str, Any]:
    """Tutti i turni da oggi a online_automatico_giorni avanti."""
    adesso = adesso or datetime.now()
    with _lock:
        conn = get_clienti_conn()
        try:
            cfg = _config(conn)
            if modo(cfg) == "spento" or not _ok(conn):
                return {"modo": modo(cfg)}
            giorni = _int(cfg.get("online_automatico_giorni"), 14)
            try:
                from app.services.prenotazioni_sito_service import turni_chiusi
            except Exception:
                turni_chiusi = None
            cambi = 0
            for i in range(giorni + 1):
                d = adesso.date() + timedelta(days=i)
                chiusi = turni_chiusi(cfg, d) if turni_chiusi else set()
                for turno in ("pranzo", "cena"):
                    if turno in chiusi:
                        continue
                    try:
                        cambi += len(applica(conn, d.isoformat(), turno, cfg, adesso)["cambi"])
                    except Exception as e:  # noqa: BLE001 — un giorno storto non ferma gli altri
                        log.warning("online automatico %s %s: %s", d, turno, e)
            _stato.update(ultimo=adesso.strftime("%Y-%m-%d %H:%M:%S"), cambi=cambi, modo=modo(cfg))
            return dict(_stato)
        finally:
            conn.close()


def ricalcola_giorno(data: str) -> None:
    """Dopo un cambio (prenotazione, sala, blocco…): ricalcola quel giorno in background."""
    try:
        d = date.fromisoformat(str(data)[:10])
    except ValueError:
        return

    def _lavoro():
        time.sleep(2)  # lascia chiudere la transazione di chi ha chiamato
        with _lock:
            conn = get_clienti_conn()
            try:
                cfg = _config(conn)
                if modo(cfg) == "spento":
                    return
                if d < date.today() or d > date.today() + timedelta(days=_int(cfg.get("online_automatico_giorni"), 14)):
                    return
                for turno in ("pranzo", "cena"):
                    applica(conn, d.isoformat(), turno, cfg)
            except Exception as e:  # noqa: BLE001
                log.warning("online automatico %s: %s", data, e)
            finally:
                conn.close()

    threading.Thread(target=_lavoro, name="online-auto-giorno", daemon=True).start()


_in_coda = threading.Event()


def ricalcola_presto() -> None:
    """Dopo una scrittura qualsiasi sulle prenotazioni: un giro completo fra pochi secondi (una sola volta)."""
    if _in_coda.is_set():
        return
    _in_coda.set()

    def _lavoro():
        time.sleep(3)
        _in_coda.clear()
        try:
            giro()
        except Exception as e:  # noqa: BLE001
            log.warning("online automatico: %s", e)

    threading.Thread(target=_lavoro, name="online-auto-presto", daemon=True).start()


def avvia_periodico(minuti: int = 10) -> None:
    if _stato.get("avviato"):
        return
    _stato["avviato"] = True

    def _ciclo():
        time.sleep(120)
        while True:
            try:
                giro()
            except Exception as e:  # noqa: BLE001
                log.warning("online automatico: %s", e)
            time.sleep(minuti * 60)

    threading.Thread(target=_ciclo, name="online-auto", daemon=True).start()


def stato() -> Dict[str, Any]:
    return dict(_stato)
