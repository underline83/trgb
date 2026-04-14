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
- **Chiamata**: stato='CHIAMATA' sul turno = asterisco giallo nel foglio
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
    - Stato='CHIAMATA' o 'ANNULLATO' → il turno NON pesa nel conto (è da confermare / annullato).
    """
    soglia_p = _parse_hhmm(SOGLIA_PAUSA_PRANZO) or 0
    soglia_c = _parse_hhmm(SOGLIA_PAUSA_CENA) or 0

    totale_lordo = 0.0
    diritto_pausa_pranzo = False
    diritto_pausa_cena = False

    for t in turni_giorno:
        stato = (t.get("stato") or "CONFERMATO").upper()
        if stato in ("CHIAMATA", "ANNULLATO"):
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
            """SELECT id, nome, cognome, ruolo, colore, reparto_id
               FROM dipendenti
               WHERE attivo = 1 AND reparto_id = ?
               ORDER BY cognome, nome""",
            (reparto_id,),
        )
        dipendenti = [dict(r) for r in cur.fetchall()]

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
                  d.ruolo   AS dipendente_ruolo
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
# CHIUSURE — da modulo Vendite
# ============================================================
def giorni_chiusi_nella_settimana(iso_settimana: str) -> List[str]:
    """Restituisce le date chiuse (YYYY-MM-DD) in questa settimana,
    combinando giorno_chiusura_settimanale + giorni_chiusi espliciti."""
    try:
        from app.routers.closures_config_router import get_closures_config
        cfg = get_closures_config()
    except Exception:
        cfg = {}
    giorno_fisso = cfg.get("giorno_chiusura_settimanale")  # 0..6 o None
    giorni_chiusi_expl = set(cfg.get("giorni_chiusi") or [])

    out = set()
    for d in giorni_settimana(iso_settimana):
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
                if (tt.get("stato") or "CONFERMATO").upper() not in ("CHIAMATA", "ANNULLATO")
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
            "ore_lorde": round(ore_lorde_tot, 2),
            "ore_nette": round(ore_nette_tot, 2),
            "ore_per_giorno": per_giorno,
            "semaforo": sem,
        })
    return out


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
