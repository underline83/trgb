# @version: v1.1 — online deciso a mano o dal motore per tavoli (online_modo, mig 216); v1.0 — fasce orarie del servizio (2026-10-16, mig 195)
# -*- coding: utf-8 -*-
"""
Fasce orarie del servizio — Modulo: prenotazioni — [core]

Copia «Modifica servizio › Andamento per fascia oraria» di TheFork Manager, con
TRGB come posto dove si decide: per ogni fascia di un giorno

  aperta         la fascia si prenota (0 = chiusa anche al telefono; solo TRGB)
  online_aperta  la fascia si vende online (→ TheFork via override availability)
  max_coperti    coperti che arrivano in quella fascia (solo TRGB)
  max_online     coperti online in quella fascia (solo TRGB: l'API TheFork non
                 permette di cambiare il pacing, solo di aprire/chiudere)

Le fasce sono gli slot di prenotazioni_config (slot_pranzo / slot_cena). Una
prenotazione conta nella fascia dell'ultimo slot non successivo al suo orario.
Default dei limiti: prenotazioni_config.fascia_max_{coperti|online}_{turno}
(vuoto = nessun limite). In prenotazioni_fasce stanno solo le eccezioni del
giorno; ogni modifica finisce in prenotazioni_fasce_log con l'esito TheFork.
"""

from __future__ import annotations

import json
import logging
from typing import Any, Dict, List, Optional

from app.services import thefork_service as tf

log = logging.getLogger("trgb.prenotazioni.fasce")

STATI_ESCLUSI = ("CANCELED", "NO_SHOW", "REFUSED")
CAMPI = ("aperta", "online_aperta", "max_coperti", "max_online")


def _minuti(ora: Any) -> Optional[int]:
    try:
        h, m = str(ora)[:5].split(":")
        return int(h) * 60 + int(m)
    except (ValueError, AttributeError):
        return None


def _hhmm(m: int) -> str:
    return f"{m // 60:02d}:{m % 60:02d}"


def _intero(v: Any) -> Optional[int]:
    if v is None or str(v).strip() == "":
        return None
    try:
        n = int(float(v))
    except (TypeError, ValueError):
        return None
    return n if n >= 0 else None


def _config(conn) -> Dict[str, str]:
    return {r["chiave"]: r["valore"] for r in conn.execute("SELECT chiave, valore FROM prenotazioni_config")}


def _slot(config: Dict[str, str], turno: str) -> List[str]:
    try:
        lista = json.loads(config.get(f"slot_{turno}") or "[]")
    except ValueError:
        lista = []
    minuti = sorted({m for m in (_minuti(x) for x in lista) if m is not None})
    return [_hhmm(m) for m in minuti]


def default_turno(config: Dict[str, str], turno: str) -> Dict[str, Optional[int]]:
    return {
        "max_coperti": _intero(config.get(f"fascia_max_coperti_{turno}")),
        "max_online": _intero(config.get(f"fascia_max_online_{turno}")),
    }


def _eccezioni(conn, data: str) -> Dict[str, Dict[str, Any]]:
    try:
        rows = conn.execute("SELECT * FROM prenotazioni_fasce WHERE data_pasto = ?", (data,)).fetchall()
    except Exception:  # mig 195 non ancora passata
        return {}
    return {r["ora"]: dict(r) for r in rows}


def _auto(conn, data: str) -> Dict[str, Dict[str, Any]]:
    try:
        return {r["ora"]: dict(r) for r in conn.execute(
            "SELECT * FROM prenotazioni_fasce_auto WHERE data_pasto = ?", (data,))}
    except Exception:  # mig 216 non ancora passata
        return {}


def fasce_giorno(conn, data: str, turno: str, config: Optional[Dict[str, str]] = None) -> Dict[str, Any]:
    config = config or _config(conn)
    dflt = default_turno(config, turno)
    auto = {o: a for o, a in _auto(conn, data).items() if a["turno"] == turno}
    eccezioni = {o: e for o, e in _eccezioni(conn, data).items() if e["turno"] == turno}
    ore = sorted(set(_slot(config, turno)) | set(eccezioni), key=_minuti)

    pren = conn.execute(f"""
        SELECT ora_pasto, pax, thefork_booking_id, fonte FROM clienti_prenotazioni
        WHERE data_pasto = ? AND turno = ? AND stato NOT IN ({','.join('?' * len(STATI_ESCLUSI))})
    """, (data, turno, *STATI_ESCLUSI)).fetchall()

    conti = {o: {"coperti": 0, "online": 0, "prenotazioni": 0} for o in ore}
    minuti_ore = [(_minuti(o), o) for o in ore]
    for p in pren:
        m = _minuti(p["ora_pasto"])
        if m is None or not minuti_ore:
            continue
        fascia = minuti_ore[0][1]
        for mo, o in minuti_ore:
            if mo <= m:
                fascia = o
        c = conti[fascia]
        c["coperti"] += p["pax"] or 0
        c["prenotazioni"] += 1
        if p["thefork_booking_id"] or p["fonte"] == "sito":  # online = TheFork + il nostro sito
            c["online"] += p["pax"] or 0

    fasce = []
    for o in ore:
        e = eccezioni.get(o) or {}
        aperta = bool(e.get("aperta", 1))
        max_coperti = e["max_coperti"] if e.get("max_coperti") is not None else dflt["max_coperti"]
        max_online = e["max_online"] if e.get("max_online") is not None else dflt["max_online"]
        c = conti[o]
        fasce.append({
            "ora": o,
            "aperta": aperta,
            "online_aperta": aperta and bool(e.get("online_aperta", 1)),
            "max_coperti": max_coperti,
            "max_online": max_online,
            "limiti_del_giorno": e.get("max_coperti") is not None or e.get("max_online") is not None,
            **c,
            "piena": max_coperti is not None and c["coperti"] >= max_coperti,
            "online_piena": max_online is not None and c["online"] >= max_online,
            "thefork_esito": e.get("thefork_esito"),
            # vendita online automatica (mig 216): chi l'ha decisa e cosa vuole il motore per tavoli
            "online_modo": e.get("online_modo"),
            "auto_vuole_aperto": (bool(auto[o]["vuole_aperto"]) if o in auto else None),
            "auto_motivo": (auto[o]["motivo"] if o in auto else None),
            "aggiornato_da": e.get("aggiornato_da"),
            "updated_at": e.get("updated_at"),
        })
    return {"data": data, "turno": turno, "default": dflt, "fasce": fasce}


def _gruppi_contigui(ore: List[str], passo: int = 15) -> List[List[str]]:
    """Raggruppa orari consecutivi (a distanza `passo` minuti) per una sola chiamata TheFork."""
    gruppi: List[List[str]] = []
    for o in sorted(ore, key=_minuti):
        if gruppi and _minuti(o) - _minuti(gruppi[-1][-1]) == passo:
            gruppi[-1].append(o)
        else:
            gruppi.append([o])
    return gruppi


def _descrivi(modifiche: Dict[str, Any]) -> str:
    parti = []
    if "aperta" in modifiche:
        parti.append("fascia aperta" if modifiche["aperta"] else "fascia chiusa")
    if "online_aperta" in modifiche:
        parti.append("online aperto" if modifiche["online_aperta"] else "online chiuso")
    for k, nome in (("max_coperti", "max coperti"), ("max_online", "max online")):
        if k in modifiche:
            parti.append(f"{nome} {modifiche[k] if modifiche[k] is not None else 'default'}")
    return ", ".join(parti)


def imposta_fasce(conn, data: str, turno: str, ore: List[str], modifiche: Dict[str, Any],
                  utente: Optional[str], modo: str = "manuale", motivo: Optional[str] = None) -> Dict[str, Any]:
    """
    Applica `modifiche` (sottoinsieme di CAMPI; per i limiti None = torna al
    default) alle fasce `ore` del giorno. Se cambia la vendita online la scrive su
    TheFork (se configurato). Ritorna le fasce aggiornate e gli esiti TheFork.
    """
    # «online_auto»: la fascia torna a deciderla il motore per tavoli
    torna_auto = bool(modifiche.pop("online_auto", False)) if isinstance(modifiche, dict) else False
    modifiche = {k: v for k, v in modifiche.items() if k in CAMPI}
    if torna_auto and not modifiche:
        ore_ok = [_hhmm(_minuti(o)) for o in ore if _minuti(o) is not None]
        for o in ore_ok:
            try:
                conn.execute("UPDATE prenotazioni_fasce SET online_modo = NULL WHERE data_pasto = ? AND ora = ?", (data, o))
            except Exception:
                pass
        conn.execute(
            "INSERT INTO prenotazioni_fasce_log (data_pasto, ore, modifica, thefork_esito, utente) VALUES (?, ?, ?, ?, ?)",
            (data, ", ".join(ore_ok), f"{turno}: online di nuovo automatico", None, utente),
        )
        conn.commit()
        return fasce_giorno(conn, data, turno)
    for k in ("aperta", "online_aperta"):
        if k in modifiche:
            modifiche[k] = 1 if modifiche[k] else 0
    for k in ("max_coperti", "max_online"):
        if k in modifiche:
            modifiche[k] = _intero(modifiche[k])
    ore = [_hhmm(_minuti(o)) for o in ore if _minuti(o) is not None]
    if not ore or not modifiche:
        raise ValueError("Indica almeno una fascia e una modifica")

    prima = {f["ora"]: f for f in fasce_giorno(conn, data, turno)["fasce"]}
    eccezioni = _eccezioni(conn, data)
    for o in ore:
        e = eccezioni.get(o) or {"aperta": 1, "online_aperta": 1, "max_coperti": None, "max_online": None}
        nuovo = {k: e.get(k) for k in CAMPI}
        nuovo.update(modifiche)
        conn.execute("""
            INSERT INTO prenotazioni_fasce (data_pasto, ora, turno, aperta, online_aperta, max_coperti, max_online, aggiornato_da)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(data_pasto, ora) DO UPDATE SET
                turno = excluded.turno, aperta = excluded.aperta, online_aperta = excluded.online_aperta,
                max_coperti = excluded.max_coperti, max_online = excluded.max_online,
                aggiornato_da = excluded.aggiornato_da, updated_at = datetime('now','localtime')
        """, (data, o, turno, nuovo["aperta"], nuovo["online_aperta"], nuovo["max_coperti"], nuovo["max_online"], utente))
    if "online_aperta" in modifiche:  # chi ha deciso l'online: la sala (il motore poi non tocca) o il motore
        try:
            conn.executemany("UPDATE prenotazioni_fasce SET online_modo = ? WHERE data_pasto = ? AND ora = ?",
                             [(None if torna_auto else modo, data, o) for o in ore])
        except Exception:  # mig 216 non ancora passata
            pass
    conn.commit()

    dopo = {f["ora"]: f for f in fasce_giorno(conn, data, turno)["fasce"]}
    cambiate = [o for o in ore if o in dopo and (prima.get(o) or {}).get("online_aperta", True) != dopo[o]["online_aperta"]]

    esiti: List[Dict[str, Any]] = []
    if cambiate and tf.credenziali_presenti() and tf._restaurant_uuid_atteso():
        for stato in (True, False):
            for gruppo in _gruppi_contigui([o for o in cambiate if dopo[o]["online_aperta"] == stato]):
                try:
                    tf.imposta_online(data, gruppo[0], gruppo[-1], stato)
                    esito = f"ok: online {'aperto' if stato else 'chiuso'} su TheFork"
                except Exception as ex:  # noqa: BLE001 — l'esito resta scritto sulla fascia
                    log.warning("override TheFork %s %s-%s: %s", data, gruppo[0], gruppo[-1], ex)
                    esito = f"errore TheFork: {ex}"
                esiti.append({"ore": gruppo, "aperta": stato, "esito": esito})
                for o in gruppo:
                    conn.execute(
                        "UPDATE prenotazioni_fasce SET thefork_esito = ? WHERE data_pasto = ? AND ora = ?",
                        (esito, data, o),
                    )
    elif cambiate:
        esiti.append({"ore": cambiate, "esito": "TheFork non configurato: cambiato solo in TRGB"})

    # Le fasce tornate al default non servono più, salvo un errore TheFork da mostrare
    # (e salvo un «online aperto» deciso a mano: il motore non deve richiuderlo)
    manuale = "AND COALESCE(online_modo, '') != 'manuale'" if _ha_modo(conn) else ""
    conn.execute(f"""
        DELETE FROM prenotazioni_fasce
        WHERE data_pasto = ? AND aperta = 1 AND online_aperta = 1
          AND max_coperti IS NULL AND max_online IS NULL
          AND COALESCE(thefork_esito, '') NOT LIKE 'errore%'
          {manuale}
    """, (data,))
    conn.execute(
        "INSERT INTO prenotazioni_fasce_log (data_pasto, ore, modifica, thefork_esito, utente) VALUES (?, ?, ?, ?, ?)",
        (data, ", ".join(ore), f"{turno}: {_descrivi(modifiche)}" + (f" — {motivo}" if motivo else ""),
         " · ".join(e["esito"] for e in esiti) or None, utente),
    )
    conn.commit()
    out = fasce_giorno(conn, data, turno)
    out["thefork"] = esiti
    return out


def _ha_modo(conn) -> bool:
    return "online_modo" in {r[1] for r in conn.execute("PRAGMA table_info(prenotazioni_fasce)")}


def registro(conn, data: str) -> List[Dict[str, Any]]:
    try:
        return [dict(r) for r in conn.execute(
            "SELECT * FROM prenotazioni_fasce_log WHERE data_pasto = ? ORDER BY id DESC LIMIT 100", (data,)
        )]
    except Exception:
        return []
