# Modulo: vini
"""
Composizione automatica della descrizione di un vino (M2.9, 2026-05-16).

REGOLA (concordata con Marco):
  La "descrizione" di un vino è la composizione strutturata di 4 ingredienti
  presenti nel modello v2:

    {denominazione} {nome_etichetta} ({vitigni con %}) {grado}%

  Esempi:
    "Barolo DOCG Castiglione (Nebbiolo 100%) 14.5%"
    "Langhe Rosso DOC Sorì Tildin (Nebbiolo 95%, Barbera 5%) 14%"
    "Chianti Classico DOCG (Sangiovese 100%) 13.5%"       (senza nome etichetta)
    "Barbera d'Asti DOCG Vigna Vecchia"                   (senza vitigni e grado)

REGOLA "salti gli elementi mancanti":
  Se uno dei 4 pezzi manca, lo si salta. Niente "(?)" o placeholder. Quando
  in futuro l'utente compila il pezzo mancante, la descrizione si aggiorna
  automaticamente (se descrizione_auto=1 sul madre).

DOVE VIVE OGNI INGREDIENTE:
  - denominazione      → madre.denominazione_id → denominazioni_v2.nome + tipo
  - nome_etichetta     → madre.nome_etichetta (NEW colonna mig 130)
  - vitigni            → bottiglia.vitigno_1_id..vitigno_5_id + pct
                         (sono per annata; per il madre prendiamo dalla prima
                         bottiglia in cantina, oppure dalla stringa input wizard)
  - grado              → bottiglia.GRADO_ALCOLICO (per annata)

NB: l'helper Python qui è autoritativo (backend). Il frontend ha un helper
gemello in `frontend/src/utils/vini/componiDescrizione.js` per la preview
live mentre l'utente compila il wizard. Sono 10 righe identiche in 2 lingue —
acceptable per il valore "vedo l'anteprima mentre digito".
"""

from typing import Optional


def componi_descrizione(
    denominazione: Optional[str] = None,
    nome_etichetta: Optional[str] = None,
    vitigni: Optional[str] = None,
    grado: Optional[str] = None,
) -> str:
    """
    Compone la descrizione di un vino dai 4 ingredienti.

    Args:
        denominazione: display completo della denominazione (es. "Barolo DOCG"),
                       NON il codice eAmbrosia. Tipicamente `{nome} {tipo}`.
        nome_etichetta: nome aggiuntivo del vino (cru/fantasia, es. "Castiglione").
                        Può essere None o stringa vuota.
        vitigni:       stringa già formattata dei vitigni (es. "Nebbiolo 100%" o
                       "Nebbiolo 95%, Barbera 5%"). Può essere None.
        grado:         grado alcolico come stringa o numero (es. "14.5" o 14.5).
                       Aggiunge "%" alla fine. Può essere None.

    Returns:
        La descrizione composta. Mai None: se tutti i campi sono vuoti
        restituisce stringa vuota "".

    Esempi:
        componi_descrizione("Barolo DOCG", "Castiglione", "Nebbiolo 100%", "14.5")
        → "Barolo DOCG Castiglione (Nebbiolo 100%) 14.5%"

        componi_descrizione("Chianti Classico DOCG", None, "Sangiovese 100%", 13.5)
        → "Chianti Classico DOCG (Sangiovese 100%) 13.5%"

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

    if grado is not None:
        try:
            grado_str = str(grado).strip().replace(",", ".")
            grado_num = float(grado_str) if grado_str else None
            if grado_num is not None and grado_num > 0:
                # Format: "14.5%" senza decimali inutili, ma mantieni .5 se serve
                if grado_num == int(grado_num):
                    parts.append(f"{int(grado_num)}%")
                else:
                    # Una sola cifra decimale è sufficiente per gradi alcolici
                    parts.append(f"{grado_num:.1f}%".rstrip("0").rstrip(".") + "%"
                                 if False
                                 else f"{grado_num:g}%")  # %g rimuove zero finali
        except (TypeError, ValueError):
            # grado non parsabile → skip
            pass

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
