# @version: v1.0-turni-service
# -*- coding: utf-8 -*-
"""
Service Turni v2 — TRGB Gestionale

Logica condivisa per Foglio Settimana, calcolo ore nette e copia settimana.

Concetti chiave:
- **Foglio settimana**: matrice Giorno (Lun..Dom) × Slot (P1..Pn / C1..Cn) per reparto.
  Uno slot corrisponde a una singola cella con un dipendente per un servizio
  (PRANZO/CENA) di un giorno.
- **Slot index**: intero 0-based persistito in turni_calendario.slot_index.
  Mantiene la colonna visiva del dipendente nel foglio anche quando altri
  turni vengono aggiunti/rimossi (non ricalcola la posizione).
- **Servizio**: PRANZO / CENA (derivato dal tipo turno o override su turno
  singolo). Nessun servizio = turno "tutto giorno" (legacy/raro).
- **Opzionale**: stato='OPZIONALE' sul turno = asterisco giallo nel foglio
  (turno da confermare all'ultimo; non pesa nel conteggio ore).
  Il concetto "a chiamata" è invece un flag sul dipendente (a_chiamata=1 →
  persona pagata a ore senza contratto fisso).
  (da confermare). Uguale semantica del vecchio asterisco Excel.
- **Ore nette**: ore lorde (ora_fine - ora_inizio) MENO le pause staff
  del reparto (pausa_pranzo_min / pausa_cena_min).
  Se un dipendente fa doppio turno nella stessa giornata, vengono dedotte
  entrambe le pause. Se fa solo pranzo, solo quella di pranzo. Etc.
"""

from __future__ import annotations
from typing import Any, Dict, List, Optional, Tuple
from datetime import date, datetime, timedelta
import sqlite3

from app.models.dipendenti_db import get_dipendenti_conn


def _format_week_range_it(iso: str) -> str:
    """'2026-W16' → '13–19/04/2026' (o '28/04–04/05/2026' se cross-mese)."""
    try:
        monday = lunedi_settimana_iso(iso)
    except Exception:
        return iso
    sunday = monday + timedelta(days=6)
    if monday.month == sunday.month:
        return f"{monday.day:02d}–{sunday.day:02d}/{sunday.month:02d}/{sunday.year}"
    return f"{monday.day:02d}/{monday.month:02d}–{sunday.day:02d}/{sunday.month:02d}/{sunday.year}"


# ============================================================
# UTIL DATE / SETTIMANA ISO
# ============================================================
def lunedi_settimana_iso(iso_settimana: str) -> date:
    """Converte '2026-W16' in la data del lunedì (ISO week).

    Usa fromisocalendar (Python 3.8+)."""
    try:
        year_s, wk_s = iso_settimana.split("-W")
        y, w = int(year_s), int(wk_s)
        return date.fromisocalendar(y, w, 1)  # 1 = lunedì
    except Exception as e:
        raise ValueError(f"Settimana ISO non valida '{iso_settimana}': {e}")


def iso_settimana_from_date(d: date) -> str:
    """Restituisce 'YYYY-Www' ISO per la data."""
    y, w, _ = d.isocalendar()
    return f"{y}-W{w:02d}"


def settimana_corrente() -> str:
    return iso_settimana_from_date(date.today())


def giorni_settimana(iso_settimana: str) -> List[date]:
    """Restituisce i 7 giorni (Lun..Dom) della settimana ISO."""
    lun = lunedi_settimana_iso(iso_settimana)
    return [lun + timedelta(days=i) for i in range(7)]


# ============================================================
# ORE LORDE / NETTE
# ============================================================
def _parse_hhmm(s: str) -> Optional[int]:
    """'HH:MM' → minuti dalle 00:00, None se invalid.

    Accetta anche '24:00' → 1440."""
    if not s:
        return None
    try:
        hh, mm = s.split(":")
        return int(hh) * 60 + int(mm)
    except Exception:
        return None


def ore_lorde(ora_inizio: str, ora_fine: str) -> float:
    """Ritorna ore lorde decimali (può essere 0 se dati invalidi).

    Gestisce il caso 'fine' < 'inizio' assumendo attraversamento mezzanotte
    (es. 22:00→02:00 = 4h). Cap a 24h."""
    a = _parse_hhmm(ora_inizio)
    b = _parse_hhmm(ora_fine)
    if a is None or b is None:
        return 0.0
    if b == 0:
        b = 24 * 60  # '00:00' intesa come fine = mezzanotte
    diff = b - a
    if diff < 0:
        diff += 24 * 60
    if diff > 24 * 60:
        diff = 24 * 60
    return round(diff / 60.0, 2)


# Soglie orarie per pausa staff: la pausa vale SOLO per chi arriva prima
# della soglia. Chi entra 12:00 (pranzo) o 19:00 (cena) arriva "già
# mangiato" → nessuna pausa dedotta.
SOGLIA_PAUSA_PRANZO = "11:30"   # arrivo < 11:30 → diritto pausa pranzo
SOGLIA_PAUSA_CENA   = "18:30"   # arrivo < 18:30 → diritto pausa cena


def calcola_ore_nette_giorno(
    turni_giorno: List[Dict[str, Any]],
    pausa_pranzo_min: int,
    pausa_cena_min: int,
) -> float:
    """Dato l'elenco turni (già filtrati per singolo dipendente + singolo
    giorno), calcola ore nette sottraendo le pause staff in base al servizio.

    Ogni turno deve avere chiavi: ora_inizio, ora_fine, servizio (opt),
    ore_effettive (opt).

    Regole:
    - Se 'ore_effettive' è impostato sul turno, lo si usa così (override).
    - Altrimenti parte dalle ore lorde (fine - inizio).
    - Pausa PRANZO dedotta SOLO se almeno un turno PRANZO ha ora_inizio
      < SOGLIA_PAUSA_PRANZO (11:30). Chi entra 12:00 arriva già mangiato.
    - Pausa CENA dedotta SOLO se almeno un turno CENA ha ora_inizio
      < SOGLIA_PAUSA_CENA (18:30). Chi entra 19:00 arriva già mangiato.
    - Pause applicate UNA VOLTA per servizio, non una per turno.
    - Stato='OPZIONALE' o 'ANNULLATO' → il turno NON pesa nel conto (da confermare / annullato).
    """
    soglia_p = _parse_hhmm(SOGLIA_PAUSA_PRANZO) or 0
    soglia_c = _parse_hhmm(SOGLIA_PAUSA_CENA) or 0

    totale_lordo = 0.0
    diritto_pausa_pranzo = False
    diritto_pausa_cena = False

    for t in turni_giorno:
        stato = (t.get("stato") or "CONFERMATO").upper()
        if stato in ("OPZIONALE", "ANNULLATO"):
            continue

        oe = t.get("ore_effettive")
        if oe is not None:
            try:
                totale_lordo += float(oe)
            except Exception:
                pass
        else:
            totale_lordo += ore_lorde(
                t.get("ora_inizio") or "",
                t.get("ora_fine") or "",
            )

        serv = (t.get("servizio") or "").upper()
        ini = _parse_hhmm(t.get("ora_inizio") or "")
        if serv == "PRANZO" and ini is not None and ini < soglia_p:
            diritto_pausa_pranzo = True
        elif serv == "CENA" and ini is not None and ini < soglia_c:
            diritto_pausa_cena = True

    # deduci pause staff solo se spetta
    pausa_min = 0
    if diritto_pausa_pranzo:
        pausa_min += int(pausa_pranzo_min or 0)
    if diritto_pausa_cena:
        pausa_min += int(pausa_cena_min or 0)

    nette = totale_lordo - (pausa_min / 60.0)
    return round(max(0.0, nette), 2)


# ============================================================
# CONFLITTI ORARI — Fase 7
# ============================================================
def _minuti_start_end(ora_inizio: str, ora_fine: str) -> Optional[Tuple[int, int]]:
    """Ritorna (start_min, end_min) in minuti dalle 00:00, gestendo mezzanotte.

    - '00:00' come ora_fine viene interpretato come 24:00 (1440).
    - Se end < start assume attraversamento della mezzanotte → +1440.
    - Ritorna None se gli orari sono invalidi.
    """
    a = _parse_hhmm(ora_inizio)
    b = _parse_hhmm(ora_fine)
    if a is None or b is None:
        return None
    if b == 0:
        b = 24 * 60
    if b < a:
        b += 24 * 60
    if b <= a:
        return None
    return (a, b)


def _overlap_minuti(a_s: int, a_e: int, b_s: int, b_e: int) -> int:
    """Ritorna i minuti di sovrapposizione tra due intervalli [s,e).

    0 = niente sovrapposizione, >0 = minuti in comune."""
    lo = max(a_s, b_s)
    hi = min(a_e, b_e)
    return max(0, hi - lo)


def calcola_conflitti_dipendente_giorno(
    turni_dipendente_giorno: List[Dict[str, Any]],
) -> Dict[int, List[Dict[str, Any]]]:
    """Data una lista di turni dello **stesso dipendente nello stesso giorno**,
    ritorna un dict { turno_id: [ { other_id, overlap_min, other_ora_inizio,
    other_ora_fine, other_servizio, other_stato, other_turno_nome } ] }.

    Regole:
    - Turni con stato ANNULLATO sono ignorati (non generano warning).
    - Turni OPZIONALE generano warning (è utile vedere un "potenziale doppio
      turno" da confermare).
    - Overlap calcolato in minuti; se 0 niente warning.
    - La mappa contiene solo i turni che HANNO almeno un conflitto.
    """
    out: Dict[int, List[Dict[str, Any]]] = {}
    # Pre-calcolo intervalli validi
    items: List[Tuple[Dict[str, Any], int, int]] = []
    for t in turni_dipendente_giorno:
        stato = (t.get("stato") or "CONFERMATO").upper()
        if stato == "ANNULLATO":
            continue
        rng = _minuti_start_end(t.get("ora_inizio") or "", t.get("ora_fine") or "")
        if rng is None:
            continue
        items.append((t, rng[0], rng[1]))

    n = len(items)
    for i in range(n):
        ti, si, ei = items[i]
        for j in range(i + 1, n):
            tj, sj, ej = items[j]
            ov = _overlap_minuti(si, ei, sj, ej)
            if ov <= 0:
                continue
            # Warning per ti rispetto a tj
            out.setdefault(int(ti["id"]), []).append({
                "other_id": int(tj["id"]),
                "overlap_min": ov,
                "other_ora_inizio": tj.get("ora_inizio"),
                "other_ora_fine": tj.get("ora_fine"),
                "other_servizio": (tj.get("servizio") or "").upper(),
                "other_stato": (tj.get("stato") or "CONFERMATO").upper(),
                "other_turno_nome": tj.get("turno_nome"),
            })
            # Warning simmetrico per tj rispetto a ti
            out.setdefault(int(tj["id"]), []).append({
                "other_id": int(ti["id"]),
                "overlap_min": ov,
                "other_ora_inizio": ti.get("ora_inizio"),
                "other_ora_fine": ti.get("ora_fine"),
                "other_servizio": (ti.get("servizio") or "").upper(),
                "other_stato": (ti.get("stato") or "CONFERMATO").upper(),
                "other_turno_nome": ti.get("turno_nome"),
            })
    return out


def calcola_conflitti_su_turni(
    turni: List[Dict[str, Any]],
) -> Dict[int, List[Dict[str, Any]]]:
    """Versione batch: raggruppa per (dipendente_id, data) e chiama il calcolo
    sui gruppi con ≥2 turni. Input arbitrario (tipicamente settimana/mese).

    Ritorna `{turno_id: [warning, ...]}` solo per turni coinvolti in conflitti.
    """
    by_key: Dict[Tuple[int, str], List[Dict[str, Any]]] = {}
    for t in turni:
        key = (int(t["dipendente_id"]), t["data"])
        by_key.setdefault(key, []).append(t)

    out: Dict[int, List[Dict[str, Any]]] = {}
    for key, lst in by_key.items():
        if len(lst) < 2:
            continue
        gruppi = calcola_conflitti_dipendente_giorno(lst)
        for tid, warns in gruppi.items():
            out[tid] = warns
    return out


def carica_conflitti_dipendente_giorno(
    dipendente_id: int, data_iso: str,
) -> List[Dict[str, Any]]:
    """Ritorna i warning per i turni del dipendente in quella data,
    formato per API:
    [ { turno_id, warnings: [ { other_id, overlap_min, ... } ] }, ... ].
    """
    conn = get_dipendenti_conn()
    try:
        cur = conn.cursor()
        cur.execute(
            """SELECT tc.id, tc.data, tc.dipendente_id, tc.turno_tipo_id,
                      COALESCE(tc.ora_inizio, tt.ora_inizio) AS ora_inizio,
                      COALESCE(tc.ora_fine, tt.ora_fine) AS ora_fine,
                      tc.stato, tc.slot_index,
                      COALESCE(tt.servizio,'') AS servizio,
                      tt.nome AS turno_nome
               FROM turni_calendario tc
               JOIN turni_tipi tt ON tt.id = tc.turno_tipo_id
               WHERE tc.dipendente_id = ? AND tc.data = ?
               ORDER BY tc.ora_inizio""",
            (dipendente_id, data_iso),
        )
        turni = [dict(r) for r in cur.fetchall()]
    finally:
        conn.close()

    mapping = calcola_conflitti_dipendente_giorno(turni)
    out: List[Dict[str, Any]] = []
    for t in turni:
        tid = int(t["id"])
        if tid in mapping:
            out.append({
                "turno_id": tid,
                "ora_inizio": t["ora_inizio"],
                "ora_fine": t["ora_fine"],
                "servizio": t["servizio"],
                "stato": t["stato"],
                "warnings": mapping[tid],
            })
    return out


# ============================================================
# FOGLIO SETTIMANA — BUILD MATRICE
# ============================================================
def _reparto_row(conn: sqlite3.Connection, reparto_id: int) -> Optional[Dict[str, Any]]:
    cur = conn.cursor()
    cur.execute(
        """SELECT id, codice, nome, icona, colore,
                  pranzo_inizio, pranzo_fine, cena_inizio, cena_fine,
                  pausa_pranzo_min, pausa_cena_min
           FROM reparti WHERE id = ?""",
        (reparto_id,),
    )
    r = cur.fetchone()
    return dict(r) if r else None


def build_foglio_settimana(
    reparto_id: int,
    iso_settimana: str,
) -> Dict[str, Any]:
    """Costruisce la struttura completa del foglio settimana per un reparto.

    Restituisce dict:
    {
      'reparto': {...},
      'settimana': '2026-W16',
      'giorni': ['2026-04-13', ..., '2026-04-19'],
      'dipendenti': [{ id, nome, cognome, colore, ... }],
      'turni': [{ id, data, servizio, slot_index, dipendente_id, stato,
                  ora_inizio, ora_fine, note, turno_tipo_id }],
      'max_slot_pranzo': 4, 'max_slot_cena': 4
    }
    """
    giorni = giorni_settimana(iso_settimana)
    from_date = giorni[0].isoformat()
    to_date = giorni[-1].isoformat()

    conn = get_dipendenti_conn()
    try:
        rep = _reparto_row(conn, reparto_id)
        if not rep:
            raise ValueError(f"Reparto {reparto_id} non trovato")

        cur = conn.cursor()

        # Dipendenti attivi del reparto
        cur.execute(
            """SELECT id, nome, cognome, ruolo, colore, reparto_id,
                      COALESCE(a_chiamata, 0) AS a_chiamata
               FROM dipendenti
               WHERE attivo = 1 AND reparto_id = ?
               ORDER BY cognome, nome""",
            (reparto_id,),
        )
        dipendenti = [dict(r) for r in cur.fetchall()]
        for d in dipendenti:
            d["a_chiamata"] = bool(d.get("a_chiamata") or 0)

        # Turni della settimana, solo dipendenti del reparto
        cur.execute(
            f"""SELECT
                  tc.id,
                  tc.data,
                  tc.dipendente_id,
                  tc.turno_tipo_id,
                  COALESCE(tc.ora_inizio, tt.ora_inizio) AS ora_inizio,
                  COALESCE(tc.ora_fine, tt.ora_fine) AS ora_fine,
                  tc.stato,
                  tc.note,
                  tc.slot_index,
                  tc.ore_effettive,
                  tc.origine,
                  COALESCE(tt.servizio, '') AS servizio,
                  tt.categoria AS turno_categoria,
                  tt.colore_bg, tt.colore_testo, tt.nome AS turno_nome,
                  d.nome    AS dipendente_nome,
                  d.cognome AS dipendente_cognome,
                  d.colore  AS dipendente_colore,
                  d.ruolo   AS dipendente_ruolo,
                  COALESCE(d.a_chiamata, 0) AS dipendente_a_chiamata
                FROM turni_calendario tc
                JOIN dipendenti d ON d.id = tc.dipendente_id
                JOIN turni_tipi tt ON tt.id = tc.turno_tipo_id
                WHERE d.reparto_id = ?
                  AND tc.data BETWEEN ? AND ?
                ORDER BY tc.data, tc.slot_index, tc.id""",
            (reparto_id, from_date, to_date),
        )
        turni = [dict(r) for r in cur.fetchall()]

        # Calcola max slot usato per dimensionare il foglio
        max_slot_pranzo = 3  # default minimo 4 colonne (0..3)
        max_slot_cena = 3
        for t in turni:
            si = t.get("slot_index")
            if si is None:
                continue
            if (t.get("servizio") or "").upper() == "PRANZO":
                if si > max_slot_pranzo:
                    max_slot_pranzo = si
            elif (t.get("servizio") or "").upper() == "CENA":
                if si > max_slot_cena:
                    max_slot_cena = si

        # Arricchisci turni con info conflitti orari (Fase 7)
        conflitti_map = calcola_conflitti_su_turni(turni)
        for t in turni:
            tid = int(t["id"])
            warns = conflitti_map.get(tid, [])
            t["has_conflict"] = len(warns) > 0
            t["conflict_with_ids"] = [w["other_id"] for w in warns]
            t["conflicts"] = warns  # dettaglio per tooltip FE

        return {
            "reparto": rep,
            "settimana": iso_settimana,
            "giorni": [g.isoformat() for g in giorni],
            "dipendenti": dipendenti,
            "turni": turni,
            "max_slot_pranzo": max_slot_pranzo,
            "max_slot_cena": max_slot_cena,
        }
    finally:
        conn.close()


# ============================================================
# VISTA MESE — griglia 6×7 (Fase 5)
# ============================================================
def build_vista_mese(reparto_id: int, anno: int, mese: int) -> Dict[str, Any]:
    """Costruisce la struttura vista mensile a griglia (6×7 = 42 giorni).

    La griglia parte dal LUNEDÌ della settimana che contiene il 1° del mese
    e copre 6 settimane complete. In questo modo:
    - le prime celle possono mostrare la coda del mese precedente
    - le ultime celle possono mostrare l'inizio del mese successivo
    - ogni riga = 1 settimana Lun..Dom

    Restituisce:
    {
      'reparto': {...},
      'anno': 2026, 'mese': 4,
      'mese_inizio': '2026-04-01',
      'mese_fine': '2026-04-30',
      'giorni': ['2026-03-30', ..., '2026-05-10'],   # 42 date
      'settimane_iso': ['2026-W14', ..., 'W19'],     # 6 codici ISO
      'dipendenti': [...],
      'turni': [...],                                 # solo dati essenziali (no formula)
      'chiusure': [...]
    }
    """
    if mese < 1 or mese > 12:
        raise ValueError(f"Mese non valido: {mese}")

    primo_mese = date(anno, mese, 1)
    # Ultimo giorno del mese
    if mese == 12:
        ultimo_mese = date(anno, 12, 31)
    else:
        ultimo_mese = date(anno, mese + 1, 1) - timedelta(days=1)

    # Trova lunedì della settimana contenente il 1° del mese
    delta_lun = primo_mese.weekday()  # 0=lun..6=dom
    start = primo_mese - timedelta(days=delta_lun)
    # 42 giorni totali (6 settimane complete)
    giorni = [start + timedelta(days=i) for i in range(42)]
    from_date = giorni[0].isoformat()
    to_date = giorni[-1].isoformat()

    # Codici settimana ISO per le 6 settimane (per deep-link)
    settimane_iso: List[str] = []
    for i in range(6):
        lun = giorni[i * 7]
        settimane_iso.append(iso_settimana_from_date(lun))

    conn = get_dipendenti_conn()
    try:
        rep = _reparto_row(conn, reparto_id)
        if not rep:
            raise ValueError(f"Reparto {reparto_id} non trovato")

        cur = conn.cursor()

        # Dipendenti attivi del reparto
        cur.execute(
            """SELECT id, nome, cognome, ruolo, colore, reparto_id,
                      COALESCE(a_chiamata, 0) AS a_chiamata
               FROM dipendenti
               WHERE attivo = 1 AND reparto_id = ?
               ORDER BY cognome, nome""",
            (reparto_id,),
        )
        dipendenti = [dict(r) for r in cur.fetchall()]
        for d in dipendenti:
            d["a_chiamata"] = bool(d.get("a_chiamata") or 0)

        # Turni nel range (42 giorni), solo dipendenti del reparto
        cur.execute(
            """SELECT
                  tc.id,
                  tc.data,
                  tc.dipendente_id,
                  tc.turno_tipo_id,
                  tc.slot_index,
                  COALESCE(tc.ora_inizio, tt.ora_inizio) AS ora_inizio,
                  COALESCE(tc.ora_fine, tt.ora_fine) AS ora_fine,
                  tc.stato,
                  tc.note,
                  COALESCE(tt.servizio, '') AS servizio,
                  d.nome    AS dipendente_nome,
                  d.cognome AS dipendente_cognome,
                  d.colore  AS dipendente_colore,
                  COALESCE(d.a_chiamata, 0) AS dipendente_a_chiamata
                FROM turni_calendario tc
                JOIN dipendenti d ON d.id = tc.dipendente_id
                JOIN turni_tipi tt ON tt.id = tc.turno_tipo_id
                WHERE d.reparto_id = ?
                  AND tc.data BETWEEN ? AND ?
                ORDER BY tc.data, tc.slot_index, tc.id""",
            (reparto_id, from_date, to_date),
        )
        turni = [dict(r) for r in cur.fetchall()]
        for t in turni:
            t["dipendente_a_chiamata"] = bool(t.get("dipendente_a_chiamata") or 0)

        chiusure = giorni_chiusi_nel_range(giorni)

        return {
            "reparto": rep,
            "anno": anno,
            "mese": mese,
            "mese_inizio": primo_mese.isoformat(),
            "mese_fine": ultimo_mese.isoformat(),
            "giorni": [g.isoformat() for g in giorni],
            "settimane_iso": settimane_iso,
            "dipendenti": dipendenti,
            "turni": turni,
            "chiusure": chiusure,
        }
    finally:
        conn.close()


# ============================================================
# CHIUSURE — da modulo Vendite
# ============================================================
def _get_closures_cfg() -> Dict[str, Any]:
    try:
        from app.routers.closures_config_router import get_closures_config
        return get_closures_config() or {}
    except Exception:
        return {}


def giorni_chiusi_nella_settimana(iso_settimana: str) -> List[str]:
    """Restituisce le date chiuse (YYYY-MM-DD) in questa settimana,
    combinando giorno_chiusura_settimanale + giorni_chiusi espliciti."""
    return giorni_chiusi_nel_range(giorni_settimana(iso_settimana))


def giorni_chiusi_nel_range(date_list: List[date]) -> List[str]:
    """Restituisce le date chiuse (YYYY-MM-DD) in un range arbitrario di date,
    combinando giorno_chiusura_settimanale + giorni_chiusi espliciti.
    Usato da vista mensile (42 giorni) e settimana (7)."""
    cfg = _get_closures_cfg()
    giorno_fisso = cfg.get("giorno_chiusura_settimanale")  # 0..6 o None
    giorni_chiusi_expl = set(cfg.get("giorni_chiusi") or [])

    out = set()
    for d in date_list:
        iso = d.isoformat()
        if iso in giorni_chiusi_expl:
            out.add(iso)
        elif giorno_fisso is not None and d.weekday() == int(giorno_fisso):
            out.add(iso)
    return sorted(out)


# ============================================================
# ORE NETTE PER SETTIMANA (per pannello laterale)
# ============================================================
def ore_nette_settimana_per_reparto(
    reparto_id: int,
    iso_settimana: str,
) -> List[Dict[str, Any]]:
    """Calcola ore lorde e nette di ciascun dipendente del reparto per la settimana.

    Output:
    [
      { 'dipendente_id': 5, 'nome':'Luca', 'cognome':'Rossi',
        'ore_lorde': 42.0, 'ore_nette': 39.5,
        'ore_per_giorno': {'2026-04-13': {'lordo':8, 'netto':7.5}, ...},
        'semaforo': 'verde' | 'giallo' | 'rosso' }
    ]
    """
    foglio = build_foglio_settimana(reparto_id, iso_settimana)
    rep = foglio["reparto"]
    pausa_p = rep.get("pausa_pranzo_min") or 30
    pausa_c = rep.get("pausa_cena_min") or 30
    giorni = foglio["giorni"]
    dipendenti = foglio["dipendenti"]
    turni = foglio["turni"]

    # raggruppa turni per (dip_id, data)
    by_dip_day: Dict[Tuple[int, str], List[Dict[str, Any]]] = {}
    for t in turni:
        key = (int(t["dipendente_id"]), t["data"])
        by_dip_day.setdefault(key, []).append(t)

    out: List[Dict[str, Any]] = []
    for d in dipendenti:
        dip_id = int(d["id"])
        ore_lorde_tot = 0.0
        ore_nette_tot = 0.0
        per_giorno: Dict[str, Dict[str, float]] = {}
        for g in giorni:
            tt_list = by_dip_day.get((dip_id, g), [])
            if not tt_list:
                per_giorno[g] = {"lordo": 0.0, "netto": 0.0}
                continue
            lordo = sum(
                ore_lorde(tt.get("ora_inizio") or "", tt.get("ora_fine") or "")
                for tt in tt_list
                if (tt.get("stato") or "CONFERMATO").upper() not in ("OPZIONALE", "ANNULLATO")
            )
            netto = calcola_ore_nette_giorno(tt_list, pausa_p, pausa_c)
            per_giorno[g] = {"lordo": round(lordo, 2), "netto": round(netto, 2)}
            ore_lorde_tot += lordo
            ore_nette_tot += netto

        # Semaforo CCNL ristorazione/turismo: 40 contratto, 48 max settimanali
        if ore_nette_tot <= 40:
            sem = "verde"
        elif ore_nette_tot <= 48:
            sem = "giallo"
        else:
            sem = "rosso"

        out.append({
            "dipendente_id": dip_id,
            "nome": d["nome"],
            "cognome": d["cognome"],
            "colore": d.get("colore"),
            "a_chiamata": bool(d.get("a_chiamata") or 0),
            "ore_lorde": round(ore_lorde_tot, 2),
            "ore_nette": round(ore_nette_tot, 2),
            "ore_per_giorno": per_giorno,
            "semaforo": sem,
        })
    return out


# ============================================================
# VISTA PER DIPENDENTE — timeline N settimane (Fase 6)
# ============================================================
def build_vista_dipendente(
    dipendente_id: int,
    settimana_inizio: str,
    num_settimane: int = 4,
) -> Dict[str, Any]:
    """Costruisce la timeline di un singolo dipendente su N settimane consecutive.

    Input:
    - dipendente_id: id del dipendente
    - settimana_inizio: 'YYYY-Www' (prima settimana della timeline)
    - num_settimane: quante settimane mostrare (default 4, min 1, max 12)

    Restituisce:
    {
      'dipendente': { id, nome, cognome, ruolo, colore, reparto_id,
                      reparto_nome, reparto_colore, a_chiamata, pausa_pranzo_min,
                      pausa_cena_min },
      'settimana_inizio': '2026-W16',
      'settimana_fine':   '2026-W19',
      'num_settimane': 4,
      'settimane': [
        {
          'iso': '2026-W16',
          'giorni': ['2026-04-13', ..., '2026-04-19'],
          'chiusure': ['2026-04-14'],
          'per_giorno': {
            '2026-04-13': {
              'turni': [ { id, data, servizio, slot_index, turno_tipo_id,
                           turno_nome, colore_bg, colore_testo,
                           ora_inizio, ora_fine, stato, note, ore_lorde } ],
              'ore_lorde': 8.0,
              'ore_nette': 7.5,
              'is_chiusura': false,
              'is_riposo': false
            },
            ...
          },
          'ore_lorde': 40.0,
          'ore_nette': 37.5,
          'giorni_lavorati': 5,
          'riposi': 1,              # giorni non chiusi senza turni
          'semaforo': 'verde'
        }, ...
      ],
      'totali': {
        'ore_lorde': 160.0, 'ore_nette': 150.0,
        'giorni_lavorati': 20, 'riposi': 4, 'chiusure': 4, 'opzionali': 2
      }
    }
    """
    if num_settimane < 1:
        num_settimane = 1
    if num_settimane > 12:
        num_settimane = 12

    # Range totale: N settimane contigue Lun..Dom
    lun0 = lunedi_settimana_iso(settimana_inizio)
    giorni_all: List[date] = [lun0 + timedelta(days=i) for i in range(num_settimane * 7)]
    from_date = giorni_all[0].isoformat()
    to_date = giorni_all[-1].isoformat()

    settimane_iso: List[str] = []
    for i in range(num_settimane):
        settimane_iso.append(iso_settimana_from_date(giorni_all[i * 7]))

    conn = get_dipendenti_conn()
    try:
        cur = conn.cursor()

        # Dipendente + reparto
        cur.execute(
            """SELECT d.id, d.nome, d.cognome, d.ruolo, d.colore, d.reparto_id,
                      COALESCE(d.a_chiamata, 0) AS a_chiamata,
                      r.nome AS reparto_nome, r.colore AS reparto_colore,
                      r.codice AS reparto_codice,
                      COALESCE(r.pausa_pranzo_min, 30) AS pausa_pranzo_min,
                      COALESCE(r.pausa_cena_min, 30)   AS pausa_cena_min
               FROM dipendenti d
               LEFT JOIN reparti r ON r.id = d.reparto_id
               WHERE d.id = ?""",
            (dipendente_id,),
        )
        row = cur.fetchone()
        if not row:
            raise ValueError(f"Dipendente {dipendente_id} non trovato")
        dip = dict(row)
        dip["a_chiamata"] = bool(dip.get("a_chiamata") or 0)
        pausa_p = int(dip.get("pausa_pranzo_min") or 30)
        pausa_c = int(dip.get("pausa_cena_min") or 30)

        # Turni del dipendente nel range
        cur.execute(
            """SELECT
                  tc.id,
                  tc.data,
                  tc.dipendente_id,
                  tc.turno_tipo_id,
                  tc.slot_index,
                  COALESCE(tc.ora_inizio, tt.ora_inizio) AS ora_inizio,
                  COALESCE(tc.ora_fine, tt.ora_fine) AS ora_fine,
                  tc.stato,
                  tc.note,
                  tc.ore_effettive,
                  tc.origine,
                  COALESCE(tt.servizio, '') AS servizio,
                  tt.nome       AS turno_nome,
                  tt.categoria  AS turno_categoria,
                  tt.colore_bg, tt.colore_testo
                FROM turni_calendario tc
                JOIN turni_tipi tt ON tt.id = tc.turno_tipo_id
                WHERE tc.dipendente_id = ?
                  AND tc.data BETWEEN ? AND ?
                ORDER BY tc.data, tc.slot_index, tc.id""",
            (dipendente_id, from_date, to_date),
        )
        turni_all = [dict(r) for r in cur.fetchall()]
    finally:
        conn.close()

    # Chiusure su tutto il range (una sola chiamata)
    chiusure_all = set(giorni_chiusi_nel_range(giorni_all))

    # Raggruppa turni per data
    by_day: Dict[str, List[Dict[str, Any]]] = {}
    for t in turni_all:
        # pre-calcolo ore lorde per singolo turno (utile a FE)
        t["ore_lorde"] = ore_lorde(t.get("ora_inizio") or "", t.get("ora_fine") or "")
        by_day.setdefault(t["data"], []).append(t)

    # Totali periodo
    tot_lorde = 0.0
    tot_nette = 0.0
    tot_lavorati = 0
    tot_riposi = 0
    tot_chiusure = 0
    tot_opzionali = 0

    settimane_out: List[Dict[str, Any]] = []
    for wi in range(num_settimane):
        giorni_w = giorni_all[wi * 7:(wi + 1) * 7]
        giorni_w_iso = [g.isoformat() for g in giorni_w]
        per_giorno: Dict[str, Dict[str, Any]] = {}
        ore_l_w = 0.0
        ore_n_w = 0.0
        lavorati_w = 0
        riposi_w = 0

        for g_iso in giorni_w_iso:
            is_ch = g_iso in chiusure_all
            turni_giorno = by_day.get(g_iso, [])
            # Separa turni CONFERMATI da OPZIONALI/ANNULLATI per ore
            turni_attivi = [
                t for t in turni_giorno
                if (t.get("stato") or "CONFERMATO").upper() not in ("OPZIONALE", "ANNULLATO")
            ]
            lordo_g = sum(
                t.get("ore_lorde") or 0.0 for t in turni_attivi
            )
            netto_g = calcola_ore_nette_giorno(turni_giorno, pausa_p, pausa_c)
            opzionali_g = sum(
                1 for t in turni_giorno
                if (t.get("stato") or "").upper() == "OPZIONALE"
            )

            is_riposo = (not is_ch) and (len(turni_attivi) == 0)
            if len(turni_attivi) > 0:
                lavorati_w += 1
            elif not is_ch:
                riposi_w += 1

            tot_opzionali += opzionali_g
            ore_l_w += lordo_g
            ore_n_w += netto_g

            per_giorno[g_iso] = {
                "turni": turni_giorno,
                "ore_lorde": round(lordo_g, 2),
                "ore_nette": round(netto_g, 2),
                "is_chiusura": is_ch,
                "is_riposo": is_riposo,
                "opzionali": opzionali_g,
            }

        chiusure_w = [g for g in giorni_w_iso if g in chiusure_all]
        tot_chiusure += len(chiusure_w)
        tot_lavorati += lavorati_w
        tot_riposi += riposi_w
        tot_lorde += ore_l_w
        tot_nette += ore_n_w

        # Semaforo CCNL settimanale (come ore_nette_settimana_per_reparto)
        if ore_n_w <= 40:
            sem = "verde"
        elif ore_n_w <= 48:
            sem = "giallo"
        else:
            sem = "rosso"

        settimane_out.append({
            "iso": settimane_iso[wi],
            "giorni": giorni_w_iso,
            "chiusure": chiusure_w,
            "per_giorno": per_giorno,
            "ore_lorde": round(ore_l_w, 2),
            "ore_nette": round(ore_n_w, 2),
            "giorni_lavorati": lavorati_w,
            "riposi": riposi_w,
            "semaforo": sem,
        })

    return {
        "dipendente": dip,
        "settimana_inizio": settimane_iso[0],
        "settimana_fine":   settimane_iso[-1],
        "num_settimane": num_settimane,
        "settimane": settimane_out,
        "totali": {
            "ore_lorde": round(tot_lorde, 2),
            "ore_nette": round(tot_nette, 2),
            "giorni_lavorati": tot_lavorati,
            "riposi": tot_riposi,
            "chiusure": tot_chiusure,
            "opzionali": tot_opzionali,
        },
    }


# ============================================================
# COPIA SETTIMANA
# ============================================================
def copia_settimana(
    reparto_id: int,
    from_iso: str,
    to_iso: str,
    sovrascrivi: bool = False,
) -> Dict[str, Any]:
    """Copia tutti i turni di un reparto dalla settimana `from_iso` alla `to_iso`.

    - sovrascrivi=False (default): se la settimana destinazione ha già turni,
      errore. Così evitiamo sorprese.
    - sovrascrivi=True: cancella turni destinazione PRIMA di copiare.

    Restituisce: { 'copiati': N, 'cancellati': M, 'saltati_chiusure': K }.
    """
    src_giorni = [d.isoformat() for d in giorni_settimana(from_iso)]
    dst_giorni = [d.isoformat() for d in giorni_settimana(to_iso)]
    if len(src_giorni) != 7 or len(dst_giorni) != 7:
        raise ValueError("Settimana non valida")

    # Mappa src_iso -> dst_iso per weekday
    mapping = dict(zip(src_giorni, dst_giorni))

    chiusi_dst = set(giorni_chiusi_nella_settimana(to_iso))

    conn = get_dipendenti_conn()
    try:
        cur = conn.cursor()

        # Turni destinazione esistenti?
        cur.execute(
            """SELECT COUNT(*) AS n FROM turni_calendario tc
               JOIN dipendenti d ON d.id = tc.dipendente_id
               WHERE d.reparto_id = ? AND tc.data BETWEEN ? AND ?""",
            (reparto_id, dst_giorni[0], dst_giorni[-1]),
        )
        n_dst = cur.fetchone()["n"]

        cancellati = 0
        if n_dst > 0:
            if not sovrascrivi:
                raise ValueError(
                    f"La settimana destinazione ha già {n_dst} turni. "
                    f"Usa sovrascrivi=True per cancellarli."
                )
            # Cancella
            cur.execute(
                """DELETE FROM turni_calendario
                   WHERE id IN (
                     SELECT tc.id FROM turni_calendario tc
                     JOIN dipendenti d ON d.id = tc.dipendente_id
                     WHERE d.reparto_id = ? AND tc.data BETWEEN ? AND ?
                   )""",
                (reparto_id, dst_giorni[0], dst_giorni[-1]),
            )
            cancellati = cur.rowcount

        # Turni sorgente
        cur.execute(
            """SELECT tc.*
               FROM turni_calendario tc
               JOIN dipendenti d ON d.id = tc.dipendente_id
               WHERE d.reparto_id = ? AND tc.data BETWEEN ? AND ?""",
            (reparto_id, src_giorni[0], src_giorni[-1]),
        )
        src_rows = [dict(r) for r in cur.fetchall()]

        copiati = 0
        saltati = 0
        for r in src_rows:
            nuova_data = mapping.get(r["data"])
            if not nuova_data:
                continue
            if nuova_data in chiusi_dst:
                saltati += 1
                continue
            cur.execute(
                """INSERT INTO turni_calendario
                   (dipendente_id, turno_tipo_id, data, ora_inizio, ora_fine,
                    stato, note, slot_index, ore_effettive, origine, origine_ref_id)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'COPIA', ?)""",
                (
                    r["dipendente_id"], r["turno_tipo_id"], nuova_data,
                    r.get("ora_inizio"), r.get("ora_fine"),
                    r.get("stato") or "CONFERMATO",
                    r.get("note"),
                    r.get("slot_index"),
                    r.get("ore_effettive"),
                    str(r["id"]),  # origine_ref_id = turno sorgente
                ),
            )
            copiati += 1

        conn.commit()
        return {
            "copiati": copiati,
            "cancellati": cancellati,
            "saltati_chiusure": saltati,
        }
    finally:
        conn.close()


# ============================================================
# FASE 10 — TEMPLATE SETTIMANA TIPO
# ============================================================
def lista_templates(reparto_id: Optional[int] = None) -> List[Dict[str, Any]]:
    """Lista template (opzionalmente filtrati per reparto).

    Ogni entry include il numero di righe e una piccola preview
    (n_dipendenti_distinti) utile per la UI.
    """
    conn = get_dipendenti_conn()
    try:
        cur = conn.cursor()
        base = (
            "SELECT t.id, t.nome, t.descrizione, t.reparto_id, t.attivo, "
            "       t.created_at, t.updated_at, "
            "       r.codice AS reparto_codice, r.nome AS reparto_nome, r.colore AS reparto_colore, "
            "       (SELECT COUNT(*) FROM turni_template_righe tr WHERE tr.template_id = t.id) AS n_righe, "
            "       (SELECT COUNT(DISTINCT tr.dipendente_id) FROM turni_template_righe tr WHERE tr.template_id = t.id) AS n_dipendenti "
            "FROM turni_template t "
            "LEFT JOIN reparti r ON r.id = t.reparto_id "
            "WHERE t.attivo = 1 "
        )
        params: List[Any] = []
        if reparto_id is not None:
            base += "AND t.reparto_id = ? "
            params.append(reparto_id)
        base += "ORDER BY t.updated_at DESC, t.id DESC"
        cur.execute(base, params)
        return [dict(r) for r in cur.fetchall()]
    finally:
        conn.close()


def get_template_dettaglio(template_id: int) -> Optional[Dict[str, Any]]:
    """Dettaglio template con tutte le righe (giorni+servizi+dipendenti)."""
    conn = get_dipendenti_conn()
    try:
        cur = conn.cursor()
        cur.execute(
            "SELECT t.*, r.codice AS reparto_codice, r.nome AS reparto_nome, "
            "       r.colore AS reparto_colore "
            "FROM turni_template t "
            "LEFT JOIN reparti r ON r.id = t.reparto_id "
            "WHERE t.id = ?",
            (template_id,),
        )
        row = cur.fetchone()
        if not row:
            return None
        out = dict(row)

        cur.execute(
            "SELECT tr.id, tr.template_id, tr.dipendente_id, tr.giorno_settimana, "
            "       tr.turno_tipo_id, tr.servizio, tr.slot_index, "
            "       tr.ora_inizio, tr.ora_fine, tr.stato, tr.note, "
            "       d.nome AS dipendente_nome, d.cognome AS dipendente_cognome, "
            "       d.colore AS dipendente_colore, d.attivo AS dipendente_attivo, "
            "       tt.nome AS turno_tipo_nome, tt.categoria AS turno_tipo_categoria "
            "FROM turni_template_righe tr "
            "LEFT JOIN dipendenti d ON d.id = tr.dipendente_id "
            "LEFT JOIN turni_tipi tt ON tt.id = tr.turno_tipo_id "
            "WHERE tr.template_id = ? "
            "ORDER BY tr.giorno_settimana, tr.servizio, tr.slot_index, tr.id",
            (template_id,),
        )
        out["righe"] = [dict(r) for r in cur.fetchall()]
        return out
    finally:
        conn.close()


def crea_template_da_settimana(
    reparto_id: int,
    settimana_iso: str,
    nome: str,
    descrizione: Optional[str] = None,
) -> Dict[str, Any]:
    """Snapshot della settimana corrente -> nuovo template.

    Copia tutti i turni LAVORO del reparto nella settimana specificata
    come righe_template, usando il weekday (0=lun..6=dom) al posto della data.
    Esclude stato ANNULLATO.
    """
    nome = (nome or "").strip()
    if not nome:
        raise ValueError("Nome template obbligatorio")

    giorni = [d.isoformat() for d in giorni_settimana(settimana_iso)]
    if len(giorni) != 7:
        raise ValueError("Settimana non valida")

    conn = get_dipendenti_conn()
    try:
        cur = conn.cursor()

        # Verifica reparto esistente
        if not _reparto_row(conn, reparto_id):
            raise ValueError(f"Reparto {reparto_id} non trovato")

        # Crea template
        cur.execute(
            "INSERT INTO turni_template (nome, descrizione, reparto_id, attivo) "
            "VALUES (?, ?, ?, 1)",
            (nome, (descrizione or "").strip() or None, reparto_id),
        )
        tpl_id = cur.lastrowid

        # Carica turni sorgente
        cur.execute(
            """SELECT tc.*, d.reparto_id AS dip_reparto
               FROM turni_calendario tc
               JOIN dipendenti d ON d.id = tc.dipendente_id
               WHERE d.reparto_id = ? AND tc.data BETWEEN ? AND ?
                 AND COALESCE(tc.stato,'CONFERMATO') != 'ANNULLATO'""",
            (reparto_id, giorni[0], giorni[-1]),
        )
        src_rows = [dict(r) for r in cur.fetchall()]

        data_to_weekday = {d: idx for idx, d in enumerate(giorni)}

        copiate = 0
        for r in src_rows:
            weekday = data_to_weekday.get(r["data"])
            if weekday is None:
                continue
            cur.execute(
                """INSERT INTO turni_template_righe
                   (template_id, dipendente_id, giorno_settimana, turno_tipo_id,
                    servizio, slot_index, ora_inizio, ora_fine, stato, note)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                (
                    tpl_id,
                    r["dipendente_id"],
                    weekday,
                    r["turno_tipo_id"],
                    r.get("servizio") if isinstance(r, dict) else r["servizio"],
                    r.get("slot_index") if isinstance(r, dict) else r["slot_index"],
                    r.get("ora_inizio"),
                    r.get("ora_fine"),
                    r.get("stato") or "CONFERMATO",
                    r.get("note"),
                ),
            )
            copiate += 1

        conn.commit()
        return {
            "id": tpl_id,
            "nome": nome,
            "descrizione": descrizione,
            "reparto_id": reparto_id,
            "righe_salvate": copiate,
            "settimana_sorgente": settimana_iso,
        }
    finally:
        conn.close()


def rinomina_template(
    template_id: int,
    nome: Optional[str] = None,
    descrizione: Optional[str] = None,
) -> Dict[str, Any]:
    """Aggiorna nome/descrizione. Almeno uno dei due deve essere non-None."""
    if nome is None and descrizione is None:
        raise ValueError("Nessun campo da aggiornare")
    conn = get_dipendenti_conn()
    try:
        cur = conn.cursor()
        cur.execute("SELECT id FROM turni_template WHERE id = ?", (template_id,))
        if not cur.fetchone():
            raise ValueError(f"Template {template_id} non trovato")

        sets = []
        params: List[Any] = []
        if nome is not None:
            nome = nome.strip()
            if not nome:
                raise ValueError("Nome non puo' essere vuoto")
            sets.append("nome = ?")
            params.append(nome)
        if descrizione is not None:
            sets.append("descrizione = ?")
            params.append((descrizione or "").strip() or None)
        sets.append("updated_at = datetime('now','localtime')")
        params.append(template_id)

        cur.execute(
            f"UPDATE turni_template SET {', '.join(sets)} WHERE id = ?",
            params,
        )
        conn.commit()
        return {"id": template_id, "aggiornato": True}
    finally:
        conn.close()


def elimina_template(template_id: int) -> Dict[str, Any]:
    """Soft-delete (attivo=0). Le righe NON vengono cancellate (per audit/ripristino)."""
    conn = get_dipendenti_conn()
    try:
        cur = conn.cursor()
        cur.execute(
            "UPDATE turni_template SET attivo = 0, updated_at = datetime('now','localtime') "
            "WHERE id = ?",
            (template_id,),
        )
        if cur.rowcount == 0:
            raise ValueError(f"Template {template_id} non trovato")
        conn.commit()
        return {"id": template_id, "disattivato": True}
    finally:
        conn.close()


def applica_template(
    template_id: int,
    settimana_iso: str,
    sovrascrivi: bool = False,
) -> Dict[str, Any]:
    """Applica un template a una settimana destinazione.

    - sovrascrivi=False (default): se la settimana destinazione ha già turni
      del reparto del template, errore.
    - sovrascrivi=True: cancella i turni del reparto prima di applicare.
    - Salta i giorni chiusi (dal config vendite).
    - Salta le righe di dipendenti non piu' attivi.
    """
    giorni = [d.isoformat() for d in giorni_settimana(settimana_iso)]
    if len(giorni) != 7:
        raise ValueError("Settimana non valida")

    conn = get_dipendenti_conn()
    try:
        cur = conn.cursor()

        # Carica template + reparto
        cur.execute(
            "SELECT id, reparto_id, attivo FROM turni_template WHERE id = ?",
            (template_id,),
        )
        tpl = cur.fetchone()
        if not tpl:
            raise ValueError(f"Template {template_id} non trovato")
        tpl = dict(tpl)
        if tpl.get("attivo") == 0:
            raise ValueError("Template disattivato")
        reparto_id = tpl.get("reparto_id")
        if not reparto_id:
            raise ValueError("Template senza reparto_id (template legacy — rifarlo)")

        chiusi_dst = set(giorni_chiusi_nella_settimana(settimana_iso))

        # Turni destinazione esistenti nel reparto
        cur.execute(
            """SELECT COUNT(*) AS n FROM turni_calendario tc
               JOIN dipendenti d ON d.id = tc.dipendente_id
               WHERE d.reparto_id = ? AND tc.data BETWEEN ? AND ?""",
            (reparto_id, giorni[0], giorni[-1]),
        )
        n_dst = cur.fetchone()["n"]

        cancellati = 0
        if n_dst > 0:
            if not sovrascrivi:
                raise ValueError(
                    f"La settimana destinazione ha già {n_dst} turni. "
                    "Usa sovrascrivi=True per cancellarli."
                )
            cur.execute(
                """DELETE FROM turni_calendario
                   WHERE id IN (
                     SELECT tc.id FROM turni_calendario tc
                     JOIN dipendenti d ON d.id = tc.dipendente_id
                     WHERE d.reparto_id = ? AND tc.data BETWEEN ? AND ?
                   )""",
                (reparto_id, giorni[0], giorni[-1]),
            )
            cancellati = cur.rowcount

        # Carica righe template + verifica dipendenti attivi
        cur.execute(
            """SELECT tr.*, d.attivo AS dipendente_attivo, d.reparto_id AS dip_reparto
               FROM turni_template_righe tr
               LEFT JOIN dipendenti d ON d.id = tr.dipendente_id
               WHERE tr.template_id = ?
               ORDER BY tr.giorno_settimana, tr.servizio, tr.slot_index, tr.id""",
            (template_id,),
        )
        righe = [dict(r) for r in cur.fetchall()]

        creati = 0
        saltati_chiusure = 0
        saltati_inattivi = 0
        for r in righe:
            weekday = r.get("giorno_settimana")
            if weekday is None or weekday < 0 or weekday > 6:
                continue
            data_dst = giorni[weekday]
            if data_dst in chiusi_dst:
                saltati_chiusure += 1
                continue
            if not r.get("dipendente_attivo"):
                saltati_inattivi += 1
                continue
            cur.execute(
                """INSERT INTO turni_calendario
                   (dipendente_id, turno_tipo_id, data, ora_inizio, ora_fine,
                    stato, note, slot_index, origine, origine_ref_id)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'TEMPLATE', ?)""",
                (
                    r["dipendente_id"],
                    r["turno_tipo_id"],
                    data_dst,
                    r.get("ora_inizio"),
                    r.get("ora_fine"),
                    r.get("stato") or "CONFERMATO",
                    r.get("note"),
                    r.get("slot_index"),
                    str(template_id),
                ),
            )
            creati += 1

        conn.commit()
        return {
            "template_id": template_id,
            "settimana_destinazione": settimana_iso,
            "creati": creati,
            "cancellati": cancellati,
            "saltati_chiusure": saltati_chiusure,
            "saltati_inattivi": saltati_inattivi,
        }
    finally:
        conn.close()


# ============================================================
# FASE 11 — INTEGRAZIONE MATTONI M.A (Notifiche) + M.C (WhatsApp)
# ============================================================
_GIORNI_IT = ["Lun", "Mar", "Mer", "Gio", "Ven", "Sab", "Dom"]


def pubblica_settimana(reparto_id: int, settimana_iso: str) -> Dict[str, Any]:
    """Crea una notifica M.A 'Turni settimana X pubblicati' globale per lo staff.

    I dipendenti NON sono utenti del gestionale (non hanno username), quindi
    la notifica in-app e' globale (dest_ruolo=None) cosi' tutti i ruoli la vedono:
    admin, superadmin, contabile, sommelier, sala, chef, viewer. La consegna ai
    dipendenti avviene via M.C (WhatsApp) con un altro endpoint.

    NOTA ruolo: prima usavamo dest_ruolo='admin', ma Marco ha ruolo 'superadmin'
    quindi l'uguaglianza stretta non faceva match. Notifica globale = tutti la vedono.
    """
    giorni = [d.isoformat() for d in giorni_settimana(settimana_iso)]
    if len(giorni) != 7:
        raise ValueError("Settimana non valida")

    conn = get_dipendenti_conn()
    try:
        cur = conn.cursor()
        rep = _reparto_row(conn, reparto_id)
        if not rep:
            raise ValueError(f"Reparto {reparto_id} non trovato")

        cur.execute(
            """SELECT tc.id, tc.dipendente_id
               FROM turni_calendario tc
               JOIN dipendenti d ON d.id = tc.dipendente_id
               WHERE d.reparto_id = ? AND tc.data BETWEEN ? AND ?
                 AND COALESCE(tc.stato,'CONFERMATO') != 'ANNULLATO'""",
            (reparto_id, giorni[0], giorni[-1]),
        )
        rows = cur.fetchall()
        n_turni = len(rows)
        n_dipendenti = len({r["dipendente_id"] for r in rows})
    finally:
        conn.close()

    # Crea notifica M.A
    try:
        from app.services.notifiche_service import crea_notifica
        range_human = _format_week_range_it(settimana_iso)
        reparto_nome = rep.get("nome") or f"reparto {reparto_id}"
        titolo = f"Turni {reparto_nome} pubblicati — {range_human}"
        messaggio = (
            f"Settimana {settimana_iso}: {n_dipendenti} dipendenti, {n_turni} turni. "
            "Apri per vedere i tuoi turni."
        )
        # Link alla vista self-service "I miei turni" — accessibile a tutti i ruoli.
        # Gli admin troveranno dentro la pagina un bottone per aprire il Foglio
        # Settimana completo.
        link = f"/miei-turni?settimana={settimana_iso}"
        nid = crea_notifica(
            tipo="turni",
            titolo=titolo,
            messaggio=messaggio,
            link=link,
            icona="📅",
            urgenza="normale",
            modulo="dipendenti",
            dest_ruolo=None,  # globale: admin + superadmin + tutti gli altri ruoli
        )
    except Exception as e:
        # Se M.A fallisce, non rompiamo il flusso; logghiamo ma ritorniamo ok parziale
        nid = None
        print(f"[turni.pubblica_settimana] crea_notifica fallito: {e}")

    return {
        "settimana": settimana_iso,
        "reparto_id": reparto_id,
        "n_turni": n_turni,
        "n_dipendenti": n_dipendenti,
        "notifica_id": nid,
    }


def riepilogo_settimana_per_dipendenti(
    reparto_id: int,
    settimana_iso: str,
) -> List[Dict[str, Any]]:
    """Per ogni dipendente del reparto con turni nella settimana, ritorna:

        {
          dipendente_id, nome, cognome, telefono, colore,
          n_turni: int,
          turni: [{data, giorno, servizio, ora_inizio, ora_fine, stato}],
          testo_wa: str  (messaggio pre-formattato pronto per wa.me)
        }

    Esclude dipendenti senza telefono (saranno marcati con `telefono=None`).
    Esclude turni ANNULLATI.
    """
    giorni = [d.isoformat() for d in giorni_settimana(settimana_iso)]
    if len(giorni) != 7:
        raise ValueError("Settimana non valida")
    giorni_date = [date.fromisoformat(g) for g in giorni]

    conn = get_dipendenti_conn()
    try:
        cur = conn.cursor()
        rep = _reparto_row(conn, reparto_id)
        if not rep:
            raise ValueError(f"Reparto {reparto_id} non trovato")

        cur.execute(
            """SELECT tc.id, tc.dipendente_id, tc.data, tc.servizio, tc.slot_index,
                      tc.ora_inizio, tc.ora_fine, tc.stato,
                      d.nome, d.cognome, d.telefono, d.colore
               FROM turni_calendario tc
               JOIN dipendenti d ON d.id = tc.dipendente_id
               WHERE d.reparto_id = ? AND d.attivo = 1
                 AND tc.data BETWEEN ? AND ?
                 AND COALESCE(tc.stato,'CONFERMATO') != 'ANNULLATO'
               ORDER BY d.cognome, d.nome, tc.data, tc.servizio, tc.slot_index""",
            (reparto_id, giorni[0], giorni[-1]),
        )
        rows = [dict(r) for r in cur.fetchall()]
    finally:
        conn.close()

    # Raggruppa per dipendente
    per_dip: Dict[int, Dict[str, Any]] = {}
    for r in rows:
        did = int(r["dipendente_id"])
        if did not in per_dip:
            per_dip[did] = {
                "dipendente_id": did,
                "nome": r["nome"],
                "cognome": r["cognome"],
                "telefono": r.get("telefono"),
                "colore": r.get("colore"),
                "turni": [],
            }
        per_dip[did]["turni"].append({
            "data": r["data"],
            "servizio": r.get("servizio"),
            "slot_index": r.get("slot_index"),
            "ora_inizio": (r.get("ora_inizio") or "")[:5],
            "ora_fine": (r.get("ora_fine") or "")[:5],
            "stato": r.get("stato") or "CONFERMATO",
        })

    range_human = _format_week_range_it(settimana_iso)
    reparto_nome = rep.get("nome") or ""

    out: List[Dict[str, Any]] = []
    for did, info in per_dip.items():
        # Componi messaggio WA
        lines = [f"Ciao {info['nome']}, ecco i tuoi turni {reparto_nome} della settimana {range_human}:"]
        # Raggruppa per data in ordine cronologico
        per_data: Dict[str, List[Dict[str, Any]]] = {}
        for t in info["turni"]:
            per_data.setdefault(t["data"], []).append(t)
        for d in giorni_date:
            iso = d.isoformat()
            if iso not in per_data:
                continue
            nome_giorno = _GIORNI_IT[d.weekday()]
            giorno_turni = per_data[iso]
            # Ordina per servizio (PRANZO prima di CENA) e slot_index
            giorno_turni.sort(key=lambda x: (
                0 if (x.get("servizio") or "").upper() == "PRANZO" else 1,
                x.get("slot_index") or 0,
            ))
            turni_str_parts = []
            for t in giorno_turni:
                serv = (t.get("servizio") or "").upper()
                serv_emoji = "☀️" if serv == "PRANZO" else ("🌙" if serv == "CENA" else "")
                oi = t.get("ora_inizio") or "?"
                of = t.get("ora_fine") or "?"
                opzione = " (opzionale)" if t.get("stato") == "OPZIONALE" else ""
                turni_str_parts.append(f"{serv_emoji} {oi}-{of}{opzione}".strip())
            lines.append(f"• {nome_giorno} {d.day:02d}/{d.month:02d}: " + " + ".join(turni_str_parts))
        lines.append("")
        lines.append("Fammi sapere se va bene. Grazie!")
        testo_wa = "\n".join(lines)

        info["n_turni"] = len(info["turni"])
        info["testo_wa"] = testo_wa
        out.append(info)

    # Ordina per cognome,nome
    out.sort(key=lambda x: ((x.get("cognome") or "").lower(), (x.get("nome") or "").lower()))
    return out
