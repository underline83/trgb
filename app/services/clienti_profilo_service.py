# Modulo: clienti — [core]
# -*- coding: utf-8 -*-
"""
Segmenti e stelle dei clienti, calcolati da TRGB (2026-11-16, mig 236).

Decisione di Marco (16/11/2026): il rank di TheFork resta in scheda come
informazione ma non si usa; il rank è nostro, a stelle (massimo 6):
  - fino a 3 stelle NERE  → quanto viene: punti da visite recenti e vecchie,
    eventi confermati da preventivo, meno i no-show;
  - fino a 2 stelle ARGENTO → quanto spende: scontrino medio a coperto dai conti
    di cassa abbinati (abbinamento_conti_service.spesa_per_cliente);
  - 1 stella ORO → la mette solo Marco (superadmin), colonna clienti.stella_oro.
Il segmento dice a che punto è il rapporto: Di casa, Affezionato, Nuovo, Una volta,
In calo, Dormiente, Perso, Mai venuto. Le due cose sono indipendenti.

Tutte le soglie stanno in clienti_impostazioni (Clienti › Impostazioni › Segmenti e
Stelle); i valori qui sotto sono solo il ripiego se manca la riga.

Il risultato sta in clienti_profilo (uno per cliente attivo): lo leggono lista,
conteggi, scheda, Planning, newsletter e la rubrica del telefono. Si ricalcola
tutto una volta al giorno (thread, dopo le 4) e quando si salvano le soglie; il
singolo cliente si ricalcola quando si apre la sua scheda.
"""

from __future__ import annotations

import logging
import threading
import time
from collections import Counter, defaultdict
from datetime import date, datetime, timedelta
from typing import Any, Dict, Iterable, List, Optional, Tuple

from app.models.clienti_db import get_clienti_conn

logger = logging.getLogger("trgb.clienti.profilo")

SEGMENTI = ("di_casa", "affezionato", "nuovo", "una_volta", "in_calo", "dormiente", "perso", "mai_venuto")

# DEFAULT_FALLBACK — i valori veri sono in clienti_impostazioni (mig 236)
_DEFAULT: Dict[str, float] = {
    "seg_dicasa_visite": 3, "seg_dicasa_mesi": 12,
    "seg_affezionato_visite": 2, "seg_affezionato_mesi": 24,
    "seg_attivo_mesi": 12, "seg_recente_mesi": 24, "seg_perso_anni": 5,
    "seg_nuovo_giorni": 90,
    "stelle_mesi_recenti": 24,
    "stelle_punti_recente": 10, "stelle_max_recenti": 60,
    "stelle_punti_vecchia": 3, "stelle_max_vecchie": 15,
    "stelle_punti_evento": 15, "stelle_malus_noshow": 15,
    "stelle_soglia_1": 10, "stelle_soglia_2": 20, "stelle_soglia_3": 40,
    "argento_soglia_1": 75.0, "argento_soglia_2": 90.0,
    "attenzione_noshow": 2,
}

_STATI_EVENTO = ("confermato", "prenotato")  # preventivo diventato evento
_COLONNE = ("cliente_id", "segmento", "punti", "stelle_nere", "stelle_argento", "scontrino_medio",
            "conti_cassa", "visite", "visite_recenti", "prima_visita", "ultima_visita",
            "no_show", "eventi", "attenzione", "aggiornato_at")
_ORA_NOTTURNA = 4  # il ricalcolo completo parte dopo quest'ora (tecnico, non operativo)


# ─────────────────────────────────────────────────────────── soglie ───
def soglie(conn) -> Dict[str, float]:
    imp = {r[0]: r[1] for r in conn.execute("SELECT chiave, valore FROM clienti_impostazioni")}
    out: Dict[str, float] = {}
    for k, v in _DEFAULT.items():
        try:
            val = float(str(imp.get(k, v)).replace(",", "."))
            out[k] = val if isinstance(v, float) else int(val)
        except (TypeError, ValueError):
            out[k] = v
    return out


def _stati_venuto() -> str:
    try:
        from app.services import prenotazioni_stati
        return prenotazioni_stati.sql_in(prenotazioni_stati.gruppo("venuto"))
    except Exception:  # noqa: BLE001 — locale senza modulo prenotazioni
        return "('SEATED','ARRIVED','LEFT','BILL','PARTIALLY_ARRIVED')"


def _mesi_fa(oggi: date, mesi: float) -> date:
    return oggi - timedelta(days=round(mesi * 30.4375))


# ─────────────────────────────────────────────────────────── regole ───
def segmento_da_visite(visite: List[date], oggi: date, s: Dict[str, float]) -> str:
    """visite = giorni distinti in cui il cliente è venuto (passati)."""
    if not visite:
        return "mai_venuto"
    ultima, prima, n = max(visite), min(visite), len(visite)
    entro = lambda mesi: sum(1 for d in visite if d >= _mesi_fa(oggi, mesi))  # noqa: E731
    if n == 1 and prima >= oggi - timedelta(days=s["seg_nuovo_giorni"]):
        return "nuovo"
    if entro(s["seg_dicasa_mesi"]) >= s["seg_dicasa_visite"]:
        return "di_casa"
    if entro(s["seg_affezionato_mesi"]) >= s["seg_affezionato_visite"] and ultima >= _mesi_fa(oggi, s["seg_attivo_mesi"]):
        return "affezionato"
    if ultima >= _mesi_fa(oggi, s["seg_recente_mesi"]):
        # tornava (2+ visite) e non si vede da più di seg_attivo_mesi → In calo
        if n >= 2 and ultima < _mesi_fa(oggi, s["seg_attivo_mesi"]):
            return "in_calo"
        return "una_volta"
    if ultima >= _mesi_fa(oggi, s["seg_perso_anni"] * 12):
        return "dormiente"
    return "perso"


def punti(visite_recenti: int, visite_vecchie: int, eventi: int, no_show: int,
          s: Dict[str, float]) -> Tuple[int, Dict[str, int]]:
    pr = int(min(visite_recenti * s["stelle_punti_recente"], s["stelle_max_recenti"]))
    pv = int(min(visite_vecchie * s["stelle_punti_vecchia"], s["stelle_max_vecchie"]))
    pe = int(eventi * s["stelle_punti_evento"])
    pn = int(no_show * s["stelle_malus_noshow"])
    return pr + pv + pe - pn, {"visite_recenti": pr, "visite_vecchie": pv, "eventi": pe, "no_show": -pn}


def stelle_nere(p: int, s: Dict[str, float]) -> int:
    if p >= s["stelle_soglia_3"]:
        return 3
    if p >= s["stelle_soglia_2"]:
        return 2
    return 1 if p >= s["stelle_soglia_1"] else 0


def stelle_argento(scontrino_medio: Optional[float], s: Dict[str, float]) -> int:
    if scontrino_medio is None:
        return 0  # dato che non c'è, non «spende poco»
    if scontrino_medio >= s["argento_soglia_2"]:
        return 2
    return 1 if scontrino_medio >= s["argento_soglia_1"] else 0


# ─────────────────────────────────────────────────────────── calcolo ───
def _segnaposti(ids: List[int]) -> str:
    return ", ".join("?" for _ in ids)


def _calcola(conn, ids: Optional[List[int]] = None) -> List[Dict[str, Any]]:
    s = soglie(conn)
    oggi = date.today()
    V = _stati_venuto()
    filtro, args = "", []
    if ids is not None:
        if not ids:
            return []
        filtro, args = f" AND cliente_id IN ({_segnaposti(ids)})", list(ids)

    attivi = [r[0] for r in conn.execute(
        "SELECT id FROM clienti WHERE COALESCE(attivo, 1) = 1"
        + (f" AND id IN ({_segnaposti(ids)})" if ids is not None else ""), args)]

    visite: Dict[int, set] = defaultdict(set)
    for cid, dp in conn.execute(
        f"SELECT cliente_id, data_pasto FROM clienti_prenotazioni "
        f"WHERE stato IN {V} AND cliente_id IS NOT NULL AND data_pasto <= ?{filtro}",
        [oggi.isoformat()] + args,
    ):
        try:
            visite[cid].add(date.fromisoformat(str(dp)[:10]))
        except ValueError:
            continue
    no_show = dict(conn.execute(
        f"SELECT cliente_id, COUNT(*) FROM clienti_prenotazioni "
        f"WHERE stato = 'NO_SHOW' AND cliente_id IS NOT NULL{filtro} GROUP BY cliente_id", args).fetchall())
    eventi = dict(conn.execute(
        f"SELECT cliente_id, COUNT(*) FROM clienti_preventivi "
        f"WHERE stato IN {_STATI_EVENTO!r} AND cliente_id IS NOT NULL{filtro} GROUP BY cliente_id",
        args).fetchall())
    try:
        from app.services.abbinamento_conti_service import spesa_per_cliente
        spesa = spesa_per_cliente(ids)
    except Exception as e:  # noqa: BLE001 — locale senza modulo cassa
        logger.debug("spesa per cliente non disponibile: %s", e)
        spesa = {}

    soglia_recenti = _mesi_fa(oggi, s["stelle_mesi_recenti"])
    adesso = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    out = []
    for cid in attivi:
        vs = sorted(visite.get(cid, ()))
        recenti = sum(1 for d in vs if d >= soglia_recenti)
        ns, ev = int(no_show.get(cid, 0)), int(eventi.get(cid, 0))
        p, _ = punti(recenti, len(vs) - recenti, ev, ns, s)
        sp = spesa.get(cid)
        media = round(sp["totale"] / sp["coperti"], 2) if sp and sp["coperti"] else None
        out.append({
            "cliente_id": cid,
            "segmento": segmento_da_visite(vs, oggi, s),
            "punti": p,
            "stelle_nere": stelle_nere(p, s),
            "stelle_argento": stelle_argento(media, s),
            "scontrino_medio": media,
            "conti_cassa": int(sp["conti"]) if sp else 0,
            "visite": len(vs),
            "visite_recenti": recenti,
            "prima_visita": vs[0].isoformat() if vs else None,
            "ultima_visita": vs[-1].isoformat() if vs else None,
            "no_show": ns,
            "eventi": ev,
            "attenzione": 1 if ns >= s["attenzione_noshow"] else 0,
            "aggiornato_at": adesso,
        })
    return out


_lock = threading.Lock()


def ricalcola(ids: Optional[Iterable[int]] = None) -> Dict[str, Any]:
    """Ricalcola e salva il profilo (tutti, o solo gli ids dati)."""
    ids_l = None if ids is None else [int(i) for i in ids]
    with _lock:
        conn = get_clienti_conn()
        try:
            righe = _calcola(conn, ids_l)
            if ids_l is None:
                conn.execute("DELETE FROM clienti_profilo")
            elif ids_l:
                conn.execute(f"DELETE FROM clienti_profilo WHERE cliente_id IN ({_segnaposti(ids_l)})", ids_l)
            conn.executemany(
                f"INSERT INTO clienti_profilo ({', '.join(_COLONNE)}) VALUES ({_segnaposti(list(_COLONNE))})",
                [tuple(r[c] for c in _COLONNE) for r in righe],
            )
            conn.commit()
        finally:
            conn.close()
    return {
        "clienti": len(righe),
        "segmenti": dict(Counter(r["segmento"] for r in righe)),
        "stelle_nere": dict(Counter(r["stelle_nere"] for r in righe)),
        "stelle_argento": dict(Counter(r["stelle_argento"] for r in righe)),
    }


# ─────────────────────────────────────────────────────────── letture ───
def profilo(cliente_id: int) -> Dict[str, Any]:
    """Profilo fresco di un cliente, con il perché delle stelle (scheda)."""
    ricalcola([cliente_id])
    conn = get_clienti_conn()
    try:
        s = soglie(conn)
        r = conn.execute("SELECT * FROM clienti_profilo WHERE cliente_id = ?", (cliente_id,)).fetchone()
        oro = conn.execute(
            "SELECT stella_oro, stella_oro_da, stella_oro_il FROM clienti WHERE id = ?", (cliente_id,)).fetchone()
    finally:
        conn.close()
    if not r:
        return {}
    d = dict(r)
    _, dettaglio = punti(d["visite_recenti"], d["visite"] - d["visite_recenti"], d["eventi"], d["no_show"], s)
    d["dettaglio_punti"] = dettaglio
    d["soglie"] = {k: s[k] for k in ("stelle_soglia_1", "stelle_soglia_2", "stelle_soglia_3",
                                     "argento_soglia_1", "argento_soglia_2", "stelle_mesi_recenti")}
    if oro:
        d.update({"stella_oro": oro["stella_oro"] or 0, "stella_oro_da": oro["stella_oro_da"],
                  "stella_oro_il": oro["stella_oro_il"]})
    return d


def profili(ids: Iterable[int]) -> Dict[int, Dict[str, Any]]:
    """Stelle e segmento di più clienti (Planning). Calcola al volo chi non c'è ancora."""
    ids_l = sorted({int(i) for i in ids if i})
    if not ids_l:
        return {}

    def _leggi():
        conn = get_clienti_conn()
        try:
            return {r["cliente_id"]: dict(r) for r in conn.execute(f"""
                SELECT p.cliente_id, p.segmento, p.stelle_nere, p.stelle_argento, p.attenzione,
                       COALESCE(c.stella_oro, 0) AS stella_oro
                FROM clienti_profilo p JOIN clienti c ON c.id = p.cliente_id
                WHERE p.cliente_id IN ({_segnaposti(ids_l)})""", ids_l)}
        finally:
            conn.close()

    out = _leggi()
    mancanti = [i for i in ids_l if i not in out]
    if mancanti:
        ricalcola(mancanti)
        out = _leggi()
    return out


def conteggi() -> Dict[str, Any]:
    conn = get_clienti_conn()
    try:
        seg = dict(conn.execute("""
            SELECT p.segmento, COUNT(*) FROM clienti_profilo p
            JOIN clienti c ON c.id = p.cliente_id AND COALESCE(c.attivo, 1) = 1
            GROUP BY p.segmento""").fetchall())
        nere = dict(conn.execute("""
            SELECT p.stelle_nere, COUNT(*) FROM clienti_profilo p
            JOIN clienti c ON c.id = p.cliente_id AND COALESCE(c.attivo, 1) = 1
            GROUP BY p.stelle_nere""").fetchall())
        argento = dict(conn.execute("""
            SELECT p.stelle_argento, COUNT(*) FROM clienti_profilo p
            JOIN clienti c ON c.id = p.cliente_id AND COALESCE(c.attivo, 1) = 1
            GROUP BY p.stelle_argento""").fetchall())
        oro = conn.execute("SELECT COUNT(*) FROM clienti WHERE COALESCE(attivo, 1) = 1 AND stella_oro = 1").fetchone()[0]
        attenzione = conn.execute("""
            SELECT COUNT(*) FROM clienti_profilo p JOIN clienti c ON c.id = p.cliente_id
            WHERE COALESCE(c.attivo, 1) = 1 AND p.attenzione = 1""").fetchone()[0]
        aggiornato = conn.execute("SELECT MIN(aggiornato_at) FROM clienti_profilo").fetchone()[0]
    finally:
        conn.close()
    out: Dict[str, Any] = {k: int(seg.get(k, 0)) for k in SEGMENTI}
    out["stelle_nere"] = {str(k): int(v) for k, v in nere.items()}
    out["stelle_argento"] = {str(k): int(v) for k, v in argento.items()}
    out["oro"] = int(oro)
    out["attenzione"] = int(attenzione)
    out["aggiornato"] = aggiornato
    return out


# ─────────────────────────────────────────────────────────── stella oro ───
def imposta_oro(cliente_id: int, oro: bool, utente: str) -> Dict[str, Any]:
    conn = get_clienti_conn()
    try:
        cur = conn.execute(
            "UPDATE clienti SET stella_oro = ?, stella_oro_da = ?, stella_oro_il = ? WHERE id = ?",
            (1 if oro else 0, utente if oro else None,
             datetime.now().strftime("%Y-%m-%d %H:%M") if oro else None, cliente_id),
        )
        conn.commit()
        return {"ok": cur.rowcount == 1, "stella_oro": 1 if oro else 0}
    finally:
        conn.close()


# ─────────────────────────────────────────────────────────── notte ───
_avviato = {"ok": False}


def _da_ricalcolare() -> bool:
    conn = get_clienti_conn()
    try:
        r = conn.execute("SELECT COUNT(*), MIN(aggiornato_at) FROM clienti_profilo").fetchone()
    finally:
        conn.close()
    if not r[0]:
        return True  # tabella vuota (primo avvio): subito
    return str(r[1] or "")[:10] < date.today().isoformat() and datetime.now().hour >= _ORA_NOTTURNA


def avvia_periodico() -> None:
    """Ricalcolo completo una volta al giorno (e al primo avvio), in un thread."""
    if _avviato["ok"]:
        return
    _avviato["ok"] = True

    def _ciclo():
        time.sleep(90)
        while True:
            try:
                if _da_ricalcolare():
                    t0 = time.time()
                    r = ricalcola()
                    logger.info("Profilo clienti ricalcolato: %s clienti in %.1fs", r["clienti"], time.time() - t0)
            except Exception as e:  # noqa: BLE001
                logger.warning("Profilo clienti: %s", e)
            time.sleep(1800)

    threading.Thread(target=_ciclo, name="clienti-profilo", daemon=True).start()
