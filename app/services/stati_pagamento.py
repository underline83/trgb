# Modulo: controllo_gestione (cross-modulo: anche acquisti via fatture_stato_service)
"""
Costanti e helper centralizzati per gli stati di pagamento di `cg_uscite`.

Tassonomia a 2 livelli (G.8, 2026-05-11):

    MACRO        SOTTO              Significato
    ──────────────────────────────────────────────────────────────
    CHIUSO       PAGATO             Riconciliato banca (match movimento)
    CHIUSO       PAGATO_MANUALE     Pagato dichiarato, da riconciliare

    APERTO       PROGRAMMATO        Scadenza futura
    APERTO       SCADUTO            Scadenza passata, da gestire
    APERTO       VERIFICARE         Dubbio sul pagamento, controllare
    APERTO       SPOSTATO           Scadenza rinegoziata (G.7)
    APERTO       RATEIZZATO         Piano rate aperto
    APERTO       PARZIALE           Pagato in parte, residuo da pagare

RAZIONALE:
  Prima di G.8 i check semantici "è chiuso?" / "è aperto?" erano sparsi nel
  codice come tuple IN list hardcoded (es. `if stato in (PAGATO, PAGATO_MANUALE,
  PARZIALE)`). Ogni nuovo sotto-stato (VERIFICARE in G.5, SPOSTATO/RATEIZZATO
  in G.6/G.7) richiedeva di rivedere TUTTI i punti di check, e inevitabilmente
  qualcuno veniva dimenticato → bug di distruzione dati.

  Ora c'è UN solo punto di verità (queste costanti) + la colonna GENERATED
  `cg_uscite.stato_macro` che si autocalcola. Il codice usa:
    - `is_chiuso(stato)` / `is_aperto(stato)` per check Python
    - `WHERE stato_macro = 'CHIUSO'` per query SQL

ESPORTATO:
  STATI_CHIUSI, STATI_APERTI, STATI_VALIDI   — frozenset
  STATO_MACRO                                — dict sotto → macro
  is_chiuso(stato), is_aperto(stato)         — bool
  derive_macro(stato)                        — 'CHIUSO' | 'APERTO'
"""
from __future__ import annotations

from typing import Optional


# ── Costanti base ──

#: Stati "CHIUSO": la fattura è considerata pagata (anche se non ancora
#: riconciliata in banca). Una volta in CHIUSO, il workflow esce dall'attivo.
STATI_CHIUSI: frozenset[str] = frozenset({
    "PAGATO",
    "PAGATO_MANUALE",
})

#: Stati "APERTO": la fattura ha ancora una posizione attiva (in attesa,
#: scaduta, in dubbio, rinegoziata, in piano rate o pagata parzialmente).
STATI_APERTI: frozenset[str] = frozenset({
    "PROGRAMMATO",
    "SCADUTO",
    "VERIFICARE",
    "SPOSTATO",
    "RATEIZZATO",
    "PARZIALE",
})

#: Tutti gli stati validi (unione CHIUSI + APERTI).
STATI_VALIDI: frozenset[str] = STATI_CHIUSI | STATI_APERTI


# ── Mappa sotto-stato → macro-stato (lookup veloce) ──

STATO_MACRO: dict[str, str] = {
    **{s: "CHIUSO" for s in STATI_CHIUSI},
    **{s: "APERTO" for s in STATI_APERTI},
}


# ── Helper ──

def is_chiuso(stato: Optional[str]) -> bool:
    """True se lo stato è uno dei CHIUSI (PAGATO/PAGATO_MANUALE)."""
    return stato in STATI_CHIUSI


def is_aperto(stato: Optional[str]) -> bool:
    """True se lo stato è uno degli APERTI. Default per stati ignoti: True
    (interpretazione difensiva: non considerare un valore sconosciuto come
    "chiuso", per non escluderlo da workflow di pagamento)."""
    if stato is None:
        return True
    return stato not in STATI_CHIUSI


def derive_macro(stato: Optional[str]) -> str:
    """Ritorna 'CHIUSO' se lo stato è in STATI_CHIUSI, altrimenti 'APERTO'.
    Equivalente lato Python della GENERATED column cg_uscite.stato_macro."""
    return "CHIUSO" if stato in STATI_CHIUSI else "APERTO"


def is_valido(stato: Optional[str]) -> bool:
    """True se lo stato è un valore noto del workflow (CHIUSO o APERTO)."""
    return stato in STATI_VALIDI
