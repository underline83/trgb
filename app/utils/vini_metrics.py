"""
Metriche riutilizzabili sul modulo Vini.

Include il calcolo del *ritmo di vendita* (bottiglie/mese) usato sia:
  - dal widget alert "Vini in carta senza giacenza" in DashboardVini
  - dalla scheda dettaglio vino (SchedaVino)
  - potenzialmente da esportazioni / report

Lo storico del sistema parte da 2026-03-01 (prima non c'erano movimenti: il
gestionale e' entrato in produzione dopo questa data). La finestra si allarga
automaticamente col passare del tempo — piu' dati = piu' significativa.

Usage:
    from app.utils.vini_metrics import calcola_ritmo_vendita
    r = calcola_ritmo_vendita(vendite_totali=8)
    # {'bt_mese': 4.44, 'categoria': 'medio', 'label': 'Vende · 4 bt/mese', ...}
"""

from datetime import datetime, date
from typing import Optional, Dict, Any


DATA_INIZIO_STORICO = "2026-03-01"


def _parse_iso_date(s: str) -> date:
    """Parsing robusto di una data ISO (YYYY-MM-DD o YYYY-MM-DDTHH:MM:SS)."""
    if "T" in s:
        return datetime.fromisoformat(s).date()
    return date.fromisoformat(s)


def calcola_ritmo_vendita(
    vendite_totali: int,
    *,
    oggi: Optional[date] = None,
    data_inizio: str = DATA_INIZIO_STORICO,
) -> Dict[str, Any]:
    """
    Calcola il ritmo di vendita in bottiglie/mese a partire dal totale vendite
    storiche dalla data di inizio sistema ad oggi.

    Args:
        vendite_totali: bottiglie vendute complessive (tipo=VENDITA) dal
                        `data_inizio` a `oggi`.
        oggi:           data di riferimento (default: oggi). Utile per test.
        data_inizio:    ISO YYYY-MM-DD. Default 2026-03-01 (inizio sistema).

    Returns:
        dict con:
          - vendite_totali (int, come input — per comodita' consumer)
          - giorni_storico (int): giorni dal data_inizio a oggi (floor 1)
          - mesi_storico   (float): giorni_storico / 30
          - bt_mese        (float|None): ritmo mensile, None se vendite_totali=0
          - categoria      (str): "top" | "medio" | "poco" | "mai"
          - label          (str): etichetta human-friendly pronta per UI
          - color_tone     (str): chiave tonale per UI (emerald/amber/neutral)

    Soglie di categoria:
      - "top":   bt_mese >= 5       → riordina subito
      - "medio": 1 <= bt_mese < 5   → valuta
      - "poco":  0 < bt_mese < 1    → domanda bassa
      - "mai":   vendite_totali = 0 → mai venduto (candidato rimozione)

    Note importante sulla finestra:
      Il sistema e' in produzione da 2026-03-01. Finche' non accumuliamo
      >= 180gg di storico, il `bt_mese` e' una stima poco stabile. Il consumer
      UI dovrebbe mostrarlo con riserva (es. "~" prima del valore) quando
      giorni_storico < 90.
    """
    if oggi is None:
        oggi = date.today()

    try:
        inizio = _parse_iso_date(data_inizio)
    except ValueError:
        inizio = _parse_iso_date(DATA_INIZIO_STORICO)

    giorni_storico = max(1, (oggi - inizio).days)
    mesi_storico = giorni_storico / 30.0

    if vendite_totali <= 0:
        return {
            "vendite_totali": 0,
            "giorni_storico": giorni_storico,
            "mesi_storico": round(mesi_storico, 2),
            "bt_mese": None,
            "categoria": "mai",
            "label": "Mai venduto",
            "color_tone": "neutral-dark",
        }

    bt_mese = vendite_totali / mesi_storico

    if bt_mese >= 5:
        categoria = "top"
        tone = "emerald"
        label = f"Top seller · {bt_mese:.1f} bt/mese"
    elif bt_mese >= 1:
        categoria = "medio"
        tone = "amber"
        label = f"Vende · {bt_mese:.1f} bt/mese"
    else:
        categoria = "poco"
        tone = "neutral"
        label = f"Poco venduto · {bt_mese:.2f} bt/mese"

    return {
        "vendite_totali": int(vendite_totali),
        "giorni_storico": giorni_storico,
        "mesi_storico": round(mesi_storico, 2),
        "bt_mese": round(bt_mese, 2),
        "categoria": categoria,
        "label": label,
        "color_tone": tone,
    }


def giorni_dalla_ultima_vendita(
    ultima_vendita_iso: Optional[str],
    *,
    oggi: Optional[date] = None,
) -> Optional[int]:
    """
    Giorni trascorsi dall'ultima vendita (MAX data_mov tipo=VENDITA).

    Per un vino giacenza=0 in carta, questo e' l'approssimazione del momento
    in cui lo stock e' andato esaurito. Il label UI corretto e' quindi
    "Finito circa Xgg fa", non "Ultima vendita Xgg fa" (che sarebbe fuorviante
    — vedi decisione Marco sessione 2026-04-24: l'ultima vendita su un vino
    finito e' sempre subito prima del sold-out, non e' un segnale utile da
    solo).

    Returns:
        int >= 0 oppure None se ultima_vendita e' None o non parsabile.
    """
    if not ultima_vendita_iso:
        return None
    if oggi is None:
        oggi = date.today()
    try:
        d = _parse_iso_date(ultima_vendita_iso)
    except (ValueError, TypeError):
        return None
    delta = (oggi - d).days
    return max(0, delta)
