# Modulo: vini
"""
Descrizione di un vino e grado alcolico (M2.9 2026-05-16, rivisto 2026-11-23).

REGOLA (concordata con Marco, 2026-11-23):
  La "descrizione" di un vino NON contiene il grado alcolico. Il grado cambia
  da annata ad annata e vive SOLO nel campo GRADO_ALCOLICO della bottiglia:
  chi stampa il vino (carta, calici, pagina cliente, iPratico, etichette,
  inventari) lo aggiunge in fondo con `descrizione_con_grado()`.

  Perché: con il grado scritto nel testo, correggere il campo non cambiava
  la carta (caso Patrizio 2021: campo 16, carta 15). Il testo arrivava
  dall'import Excel o dalla descrizione automatica col grado tipico del madre.

  Descrizione composta (madre con descrizione_auto=1), 3 ingredienti:

    {denominazione} {nome_etichetta} ({vitigni con %})

  Esempi:
    "Barolo DOCG Castiglione (Nebbiolo 100%)"
    "Langhe Rosso DOC Sorì Tildin (Nebbiolo 95%, Barbera 5%)"
    "Barbera d'Asti DOCG Vigna Vecchia"                   (senza vitigni)

  In stampa, con GRADO_ALCOLICO = 14.5 sulla bottiglia:
    "Barolo DOCG Castiglione (Nebbiolo 100%) 14,5%"

REGOLA "salti gli elementi mancanti":
  Se un pezzo manca, lo si salta. Niente "(?)" o placeholder. Senza grado
  sulla bottiglia, in stampa non compare nessun grado.

DOVE VIVE OGNI INGREDIENTE:
  - denominazione      → madre.denominazione_id → denominazioni.nome + tipo
  - nome_etichetta     → madre.nome_etichetta (colonna mig 130)
  - vitigni            → bottiglia.vitigno_1_id..vitigno_5_id + pct
                         (per annata; per il madre gli slot "tipici", mig 131)
  - grado              → bottiglia.GRADO_ALCOLICO (per annata) — NON nella
                         descrizione. madre.grado_alcolico_tipico resta solo
                         come proposta per le annate nuove nel wizard.

NB: l'helper Python qui è autoritativo (backend). Il frontend ha i gemelli in
`frontend/src/utils/vini/componiDescrizione.js` (componiDescrizione,
formattaGrado, descrizioneConGrado): devono restare allineati.
"""

import re
from typing import Optional, Tuple


def formatta_grado(grado) -> str:
    """
    Grado alcolico come si stampa: "14,5%" (virgola italiana), "14%" se intero.
    Stringa vuota se il grado manca, non è un numero o è negativo.
    Lo 0 si stampa ("0%"): è il caso dei vini analcolici.

        formatta_grado(14.5)  → "14,5%"
        formatta_grado("13")  → "13%"
        formatta_grado(0)     → "0%"
        formatta_grado(None)  → ""
    """
    if grado is None:
        return ""
    try:
        s = str(grado).strip().replace(",", ".")
        num = float(s) if s else None
    except (TypeError, ValueError):
        return ""
    if num is None or num < 0:
        return ""
    if num == int(num):
        return f"{int(num)}%"
    return f"{num:g}".replace(".", ",") + "%"


def descrizione_con_grado(descrizione: Optional[str], grado) -> str:
    """
    Descrizione da stampare: la descrizione + il grado dell'annata in fondo.

        descrizione_con_grado("Bergamasca Rosso IGT Patrizio (Cabernet 40%, Merlot 60%)", 16)
        → "Bergamasca Rosso IGT Patrizio (Cabernet 40%, Merlot 60%) 16%"
    """
    desc = (descrizione or "").strip()
    g = formatta_grado(grado)
    if not g:
        return desc
    return f"{desc} {g}".strip()


# Grado scritto a mano nel testo (eredità import Excel): "13,5%", "14.5 %",
# "13,5°", "12% vol". Si cerca solo FUORI dalle parentesi (dentro ci sono le
# percentuali dei vitigni) e non attaccato ad altre cifre ("100%").
_RE_GRADO_TESTO = re.compile(
    r"(?<![\d.,])(\d{1,2}(?:[.,]\d{1,2})?)\s*(?:%|°)(?:\s*vol\.?)?", re.IGNORECASE
)


def togli_grado(descrizione: Optional[str]) -> Tuple[str, Optional[float]]:
    """
    Toglie il grado scritto a mano da una descrizione.

    Ritorna (descrizione_pulita, grado_trovato). Se non c'è un grado sicuro
    ritorna (descrizione invariata, None). Prudente: tocca il testo solo se
    fuori dalle parentesi c'è UNA sola percentuale tra 0 e 25 (due o più =
    probabilmente vitigni scritti senza parentesi, si lascia stare).

        togli_grado("Barolo DOCG Vigna Francia 14,5% (MAGNUM)")
        → ("Barolo DOCG Vigna Francia (MAGNUM)", 14.5)
    """
    testo = descrizione or ""
    pezzi = re.split(r"(\([^)]*\))", testo)
    trovati = []
    for i, p in enumerate(pezzi):
        if p.startswith("("):
            continue
        for m in _RE_GRADO_TESTO.finditer(p):
            trovati.append((i, m))
    if len(trovati) != 1:
        return testo, None
    i, m = trovati[0]
    try:
        grado = float(m.group(1).replace(",", "."))
    except ValueError:
        return testo, None
    if not (0 <= grado <= 25):
        return testo, None
    p = pezzi[i]
    pezzi[i] = p[: m.start()] + " " + p[m.end():]
    nuovo = "".join(pezzi)
    nuovo = re.sub(r"\s+,", ",", nuovo)
    nuovo = re.sub(r"\(\s+", "(", nuovo)
    nuovo = re.sub(r"\s{2,}", " ", nuovo).strip()
    nuovo = re.sub(r"[\s,\-–]+$", "", nuovo)
    return nuovo, grado


def componi_descrizione(
    denominazione: Optional[str] = None,
    nome_etichetta: Optional[str] = None,
    vitigni: Optional[str] = None,
    grado: Optional[str] = None,
) -> str:
    """
    Compone la descrizione di un vino: denominazione + nome etichetta + (vitigni).

    Il parametro `grado` resta per compatibilità con i chiamanti ma è IGNORATO
    dal 2026-11-23: il grado non entra più nella descrizione, lo aggiunge chi
    stampa (vedi `descrizione_con_grado`).

    Returns:
        La descrizione composta. Mai None: se tutti i campi sono vuoti
        restituisce stringa vuota "".

    Esempi:
        componi_descrizione("Barolo DOCG", "Castiglione", "Nebbiolo 100%", "14.5")
        → "Barolo DOCG Castiglione (Nebbiolo 100%)"

        componi_descrizione("Barbera d'Asti DOCG", "Vigna Vecchia", None, None)
        → "Barbera d'Asti DOCG Vigna Vecchia"
    """
    parts = []

    if denominazione and str(denominazione).strip():
        parts.append(str(denominazione).strip())

    if nome_etichetta and str(nome_etichetta).strip():
        parts.append(str(nome_etichetta).strip())

    vit_str = (str(vitigni).strip() if vitigni is not None else "")
    if vit_str:
        parts.append(f"({vit_str})")

    return " ".join(parts)


def vitigni_to_string(vitigni_list) -> str:
    """
    Helper di formato: converte una lista [{nome, pct}, ...] in stringa
    "Nebbiolo 100%" o "Nebbiolo 95%, Barbera 5%".

    Accetta sia oggetti dict che oggetti con attributi `nome` e `pct`.
    Se pct è None/0/vuoto, mette solo il nome (es. "Nebbiolo, Barbera").
    """
    if not vitigni_list:
        return ""
    parts = []
    for v in vitigni_list:
        if isinstance(v, dict):
            nome = (v.get("nome") or v.get("vitigno_label") or "").strip()
            pct = v.get("pct")
        else:
            nome = (getattr(v, "nome", None) or "").strip()
            pct = getattr(v, "pct", None)
        if not nome:
            continue
        try:
            pct_num = float(pct) if pct not in (None, "", 0) else None
        except (TypeError, ValueError):
            pct_num = None
        if pct_num is not None and pct_num > 0:
            # Mostra come intero se è intero, altrimenti decimale
            if pct_num == int(pct_num):
                parts.append(f"{nome} {int(pct_num)}%")
            else:
                parts.append(f"{nome} {pct_num:g}%")
        else:
            parts.append(nome)
    return ", ".join(parts)
