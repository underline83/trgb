# @version: v1.0 — previsione coperti per giorno e turno (2026-11-20)
# -*- coding: utf-8 -*-
"""
Previsione coperti — Modulo: platform (sola lettura su prenotazioni) — [core]

Quanti coperti faremo quel giorno, a pranzo e a cena: per compilare i turni
(Dipendenti › Turni) guardando il lavoro atteso, non solo le prenotazioni.

Da dove viene il numero (verificato sui dati il 2026-11-20):
- Le prenotazioni (clienti_prenotazioni) contengono anche i walk-in segnati in
  TheFork: da marzo 2026 i coperti delle chiusure turno e i pax delle
  prenotazioni coincidono (mediana 1,0 sia a pranzo che a cena). Quindi la
  storia delle prenotazioni (dal 2019) è la storia dei coperti.
- Due stime, mescolate secondo quanto manca al giorno:
  1. «solito»: mediana dei coperti dello stesso giorno della settimana e turno
     nelle ultime 8 settimane aperte; per i festivi (Natale, Capodanno, Pasqua…)
     la media dello stesso festivo negli anni scorsi, riportata al livello di
     quest'anno.
  2. «prenotati + arrivi»: i coperti già prenotati (tolta la quota che di
     solito disdice) più quanti ne sono arrivati dopo, alla stessa distanza dal
     giorno, nelle 8 settimane prima (mediana).
  Vicino al giorno pesa la 2 (85% il giorno stesso), lontano la 1.
- Forbice: 15°–85° percentile dei coperti di scarto fra veri e stimati con lo stesso metodo,
  alla stessa distanza, sullo stesso turno nelle ultime 12 settimane.
- Prova all'indietro (giu–nov 2026): errore medio ±6 coperti a cena e ±5 a
  pranzo il giorno stesso, ±7 una settimana prima (media 25 cena, 15 pranzo).
  Solo le prenotazioni: ±16 / ±9 il giorno stesso.

I parametri del modello stanno in PARAMETRI (non sono soglie operative).
Non legge il modulo Prenotazioni via router: apre clienti.sqlite3 in sola
lettura, come fa Statistiche.
"""

from __future__ import annotations

import sqlite3
import statistics as st
from collections import defaultdict
from datetime import date, timedelta
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional, Tuple

TURNI = ("pranzo", "cena")
STATI_COPERTI = ("SEATED", "ARRIVED", "LEFT", "BILL", "PARTIALLY_ARRIVED", "RECORDED")
STATI_PERSI = ("CANCELED", "NO_SHOW")

PARAMETRI = {
    "settimane_solito": 8,          # settimane per il «solito» e per gli arrivi dopo
    "settimane_forbice": 12,        # settimane per la forbice
    "anni_festivi": 3,              # anni scorsi guardati per i festivi
    "mesi_disdette": 12,            # periodo su cui si misura la quota di disdette
    "peso_prenotati": ((0, .85), (1, .80), (3, .65), (7, .45), (14, .25)),
    "forbice_percentili": (.15, .85),
}

# Festivi a data fissa (MM-GG) e vigilie che contano in sala
FESTIVI_FISSI = {
    "01-01": "Capodanno", "01-06": "Epifania", "04-25": "Liberazione",
    "05-01": "1° maggio", "06-02": "Festa della Repubblica", "08-15": "Ferragosto",
    "08-26": "Sant'Alessandro", "11-01": "Ognissanti", "12-08": "Immacolata",
    "12-24": "Vigilia di Natale", "12-25": "Natale", "12-26": "Santo Stefano",
    "12-31": "San Silvestro", "02-14": "San Valentino",
}


def _pasqua(anno: int) -> date:
    a, b, c = anno % 19, anno // 100, anno % 100
    d, e = b // 4, b % 4
    f = (b + 8) // 25
    g = (b - f + 1) // 3
    h = (19 * a + b - d - g + 15) % 30
    i, k = c // 4, c % 4
    l_ = (32 + 2 * e + 2 * i - h - k) % 7
    m = (a + 11 * h + 22 * l_) // 451
    mese = (h + l_ - 7 * m + 114) // 31
    giorno = ((h + l_ - 7 * m + 114) % 31) + 1
    return date(anno, mese, giorno)


def festivo(d: date) -> Optional[str]:
    """Nome del festivo (o vigilia che conta) o None."""
    p = _pasqua(d.year)
    if d == p:
        return "Pasqua"
    if d == p + timedelta(days=1):
        return "Pasquetta"
    return FESTIVI_FISSI.get(d.strftime("%m-%d"))


def _stesso_festivo(nome: str, anno: int) -> Optional[date]:
    if nome == "Pasqua":
        return _pasqua(anno)
    if nome == "Pasquetta":
        return _pasqua(anno) + timedelta(days=1)
    for mmgg, n in FESTIVI_FISSI.items():
        if n == nome:
            return date(anno, int(mmgg[:2]), int(mmgg[3:]))
    return None


def _quantile(v: List[float], q: float) -> float:
    s = sorted(v)
    if not s:
        return 0.0
    pos = q * (len(s) - 1)
    lo = int(pos)
    hi = min(lo + 1, len(s) - 1)
    return s[lo] + (s[hi] - s[lo]) * (pos - lo)


def _peso(lead: int) -> float:
    pts = PARAMETRI["peso_prenotati"]
    if lead <= pts[0][0]:
        return pts[0][1]
    for (a, wa), (b, wb) in zip(pts, pts[1:]):
        if a <= lead <= b:
            return wa + (wb - wa) * (lead - a) / (b - a)
    return pts[-1][1]


class _Storia:
    """Coperti finali e anticipo delle prenotazioni, giorno per giorno."""

    def __init__(self, conn: sqlite3.Connection, dal: date):
        self.finali: Dict[Tuple[str, str], int] = defaultdict(int)
        self.anticipi: Dict[Tuple[str, str], List[Tuple[int, int]]] = defaultdict(list)
        segn = ",".join("?" * len(STATI_COPERTI))
        for dp, turno, pax, dpren in conn.execute(
            f"""SELECT data_pasto, turno, COALESCE(pax,0), data_prenotazione
                FROM clienti_prenotazioni
                WHERE data_pasto >= ? AND stato IN ({segn}) AND COALESCE(pax,0) > 0
                  AND turno IN ('pranzo','cena')""",
            (dal.isoformat(), *STATI_COPERTI),
        ):
            k = (dp, turno)
            self.finali[k] += pax
            self.anticipi[k].append((_anticipo(dp, dpren), pax))
        # Quota di coperti prenotati con anticipo che poi disdice o non viene
        self.disdette: Dict[Tuple[str, int], float] = {}
        self._conn = conn
        self.oggi = date.today()   # le settimane «di confronto» sono solo quelle già passate

    def prenotati_prima(self, k: Tuple[str, str], lead: int) -> int:
        """Coperti (poi venuti) già prenotati prima del giorno -lead (cioè con anticipo > lead)."""
        return sum(p for a, p in self.anticipi.get(k, ()) if a >= lead + 1)

    def quota_disdette(self, turno: str, lead: int, oggi: date) -> float:
        lead = max(1, min(lead, 14))
        chiave = (turno, lead)
        if chiave not in self.disdette:
            dal = (oggi - timedelta(days=30 * PARAMETRI["mesi_disdette"])).isoformat()
            segn = ",".join("?" * (len(STATI_COPERTI) + len(STATI_PERSI)))
            r = dict(self._conn.execute(
                f"""SELECT stato IN ({",".join("?" * len(STATI_PERSI))}), SUM(COALESCE(pax,0))
                    FROM clienti_prenotazioni
                    WHERE data_pasto BETWEEN ? AND ? AND turno = ? AND stato IN ({segn})
                      AND julianday(data_pasto) - julianday(substr(data_prenotazione,1,10)) >= ?
                    GROUP BY 1""",
                (*STATI_PERSI, dal, (oggi - timedelta(days=1)).isoformat(), turno,
                 *STATI_COPERTI, *STATI_PERSI, lead),
            ).fetchall())
            persi, venuti = r.get(1) or 0, r.get(0) or 0
            self.disdette[chiave] = persi / (persi + venuti) if persi + venuti else 0.0
        return self.disdette[chiave]


def _anticipo(data_pasto: str, data_pren: Optional[str]) -> int:
    try:
        return max(0, (date.fromisoformat(data_pasto) - date.fromisoformat(str(data_pren)[:10])).days)
    except (TypeError, ValueError):
        return 0


def _iso(d: date) -> str:
    return d.isoformat()


def _settimane_prima(s: _Storia, giorno: date, n: int) -> List[date]:
    """Gli n giorni con lo stesso nome della settimana prima di `giorno` e già passati
    (per un giorno fra 5 settimane si guardano le 8 settimane prima di oggi)."""
    i0 = max(1, (giorno - s.oggi).days // 7 + 1)
    return [giorno - timedelta(7 * i) for i in range(i0, i0 + n)]


def _solito(s: _Storia, giorno: date, turno: str) -> Tuple[Optional[float], Optional[str]]:
    """(coperti soliti, festivo) — mediana stesso giorno/turno ultime N settimane,
    oppure media dello stesso festivo negli anni scorsi riportata al livello di oggi."""
    n = PARAMETRI["settimane_solito"]
    vicine = [s.finali.get((_iso(g), turno), 0) for g in _settimane_prima(s, giorno, n)]
    vicine = [v for v in vicine if v > 0]
    nome = festivo(giorno)
    if nome:
        stime = []
        for y in range(1, PARAMETRI["anni_festivi"] + 1):
            gf = _stesso_festivo(nome, giorno.year - y)
            if not gf:
                continue
            v = s.finali.get((_iso(gf), turno), 0)
            if v <= 0:
                continue
            # livello: ultime 8 settimane prima di oggi vs le stesse di quell'anno
            rif = min(giorno, s.oggi)
            ora = sum(s.finali.get((_iso(rif - timedelta(d)), turno), 0) for d in range(1, 57))
            rif_allora = gf - (giorno - rif)
            allora = sum(s.finali.get((_iso(rif_allora - timedelta(d)), turno), 0) for d in range(1, 57))
            f = min(max(ora / allora, .6), 1.6) if allora else 1.0
            stime.append(v * f)
        if stime:
            return st.mean(stime), nome
    return (st.median(vicine) if vicine else None), None


def _arrivi_dopo(s: _Storia, giorno: date, turno: str, lead: int) -> Optional[float]:
    n = PARAMETRI["settimane_solito"]
    v = []
    for g in _settimane_prima(s, giorno, n):
        k = (_iso(g), turno)
        if s.finali.get(k, 0) > 0:
            v.append(s.finali[k] - s.prenotati_prima(k, lead))
    return st.median(v) if v else None


def _stima(s: _Storia, giorno: date, turno: str, lead: int, prenotati: float) -> Optional[Dict[str, Any]]:
    solito, nome = _solito(s, giorno, turno)
    if solito is None:
        return None
    arrivi = _arrivi_dopo(s, giorno, turno, lead)
    w = _peso(lead)
    # sui festivi gli arrivi delle settimane normali dicono poco: pesa di più il solito
    if nome:
        w *= .6
    con_prenotati = prenotati + (arrivi if arrivi is not None else max(solito - prenotati, 0))
    return {"stima": w * con_prenotati + (1 - w) * solito, "solito": solito, "festivo": nome}


def _forbice(s: _Storia, giorno: date, turno: str, lead: int) -> Tuple[float, float]:
    """Scarti (sotto, sopra) fra coperti veri e stimati, stesso turno e anticipo."""
    scarti = []
    for i in range(1, PARAMETRI["settimane_forbice"] * 7 + 1):
        g = s.oggi - timedelta(days=i)
        k = (_iso(g), turno)
        vero = s.finali.get(k, 0)
        if vero <= 0:
            continue
        r = _stima(s, g, turno, lead, s.prenotati_prima(k, lead))
        if r:
            scarti.append(vero - r["stima"])
    if len(scarti) < 10:
        return -8.0, 8.0
    q_lo, q_hi = PARAMETRI["forbice_percentili"]
    return _quantile(scarti, q_lo), _quantile(scarti, q_hi)


def _db_path() -> Path:
    from app.utils.locale_data import locale_data_path
    return locale_data_path("clienti.sqlite3")


def prevedi(giorni: Iterable[Any], oggi: Optional[date] = None,
            db_path: Optional[Path] = None, chiusi: Optional[Dict[str, Dict[str, str]]] = None
            ) -> Dict[str, Any]:
    """
    {"giorni": {"AAAA-MM-GG": {"pranzo": {...}, "cena": {...}}}, "totale_previsti": int, ...}

    Per turno: previsti, min, max, prenotati (adesso), solito, festivo, chiuso;
    per i giorni passati: fatti (coperti venuti) al posto della previsione.
    `chiusi` = {data: {turno: motivo}} dal calendario chiusure (se None lo legge).
    """
    oggi = oggi or date.today()
    giorni = [g if isinstance(g, date) else date.fromisoformat(str(g)[:10]) for g in giorni]
    out: Dict[str, Any] = {"giorni": {}, "totale_previsti": 0, "totale_prenotati": 0,
                           "oggi": oggi.isoformat(), "metodo": __doc__.split("Da dove")[0].strip()}
    if not giorni:
        return out
    p = db_path or _db_path()
    if not Path(p).exists():
        out["errore"] = "prenotazioni non disponibili"
        return out
    if chiusi is None:
        try:
            from app.services import calendario_chiusure
            chiusi = calendario_chiusure.mappa(giorni)
        except Exception:  # noqa: BLE001
            chiusi = {}
    dal = min(giorni) - timedelta(days=366 * (PARAMETRI["anni_festivi"] + 1))
    conn = sqlite3.connect(f"file:{p}?mode=ro", uri=True, timeout=10)
    try:
        s = _Storia(conn, dal)
        s.oggi = oggi
        for g in giorni:
            gi = _iso(g)
            riga: Dict[str, Any] = {}
            for turno in TURNI:
                k = (gi, turno)
                motivo = (chiusi.get(gi) or {}).get(turno)
                if motivo is not None:
                    riga[turno] = {"chiuso": True, "motivo": motivo}
                    continue
                if g < oggi:
                    riga[turno] = {"fatti": s.finali.get(k, 0)}
                    continue
                lead = (g - oggi).days
                adesso = s.finali.get(k, 0)                       # prenotati in questo momento
                prima = s.prenotati_prima(k, lead)                # prenotati prima di oggi
                tenuti = prima * (1 - s.quota_disdette(turno, lead, oggi)) if lead >= 1 else prima
                r = _stima(s, g, turno, lead, tenuti)
                if not r:
                    riga[turno] = {"prenotati": adesso, "previsti": None}
                    continue
                lo, hi = _forbice(s, g, turno, lead)
                prev = max(r["stima"], adesso)
                riga[turno] = {
                    "previsti": round(prev),
                    "min": max(round(r["stima"] + lo), adesso, 0),
                    "max": max(round(r["stima"] + hi), adesso),
                    "prenotati": adesso,
                    "solito": round(r["solito"]),
                    "festivo": r["festivo"],
                }
                out["totale_previsti"] += round(prev)
                out["totale_prenotati"] += adesso
            out["giorni"][gi] = riga
    finally:
        conn.close()
    return out
