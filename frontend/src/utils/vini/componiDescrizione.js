// src/utils/vini/componiDescrizione.js
// Modulo: vini
//
// Composizione automatica della descrizione di un vino (M2.9, 2026-05-16).
//
// Gemello frontend dell'helper backend `app/services/vini_descrizione.py`.
// Stessa regola di composizione, replicata per avere preview live nel wizard
// senza chiamate API.
//
// REGOLA:
//   descrizione = "{denominazione} {nome_etichetta} ({vitigni}) {grado}%"
//   Salto gli ingredienti mancanti (no placeholder).
//
// DOVE VIVE OGNI INGREDIENTE (decisione Marco 2026-05-16):
//   - denominazione    → madre.denominazione_id → display completo
//   - nome_etichetta   → madre.nome_etichetta (NEW col mig 130, può essere null)
//   - vitigni          → bottiglia (per annata, può cambiare tra annate)
//   - grado            → bottiglia (per annata)
//
// La descrizione del MADRE usa: madre.denominazione + madre.nome_etichetta
// + madre.grado_alcolico_tipico + stringa vitigni "tipica" (dalla creazione).
//
// La descrizione della BOTTIGLIA usa: madre.denominazione + madre.nome_etichetta
// + bottiglia.vitigni + bottiglia.grado. Quindi due annate dello stesso madre
// possono avere descrizioni leggermente diverse se grado/blend variano.

/**
 * Compone la descrizione di un vino dai 4 ingredienti.
 *
 * @param {Object} opts
 * @param {string=} opts.denominazione  Display completo (es. "Barolo DOCG")
 * @param {string=} opts.nome_etichetta  Cru/fantasia (es. "Castiglione"). Può essere vuoto.
 * @param {string=} opts.vitigni  Stringa già formattata ("Nebbiolo 100%" o
 *                                "Nebbiolo 95%, Barbera 5%"). Può essere vuota.
 * @param {string|number=} opts.grado  Grado alcolico (es. "14.5" o 14.5).
 *
 * @returns {string}  La descrizione composta. Mai null. Stringa vuota se nessun input.
 *
 * Esempi:
 *   componiDescrizione({ denominazione: "Barolo DOCG", nome_etichetta: "Castiglione",
 *                        vitigni: "Nebbiolo 100%", grado: "14.5" })
 *   → "Barolo DOCG Castiglione (Nebbiolo 100%) 14.5%"
 *
 *   componiDescrizione({ denominazione: "Chianti Classico DOCG",
 *                        vitigni: "Sangiovese 100%", grado: 13.5 })
 *   → "Chianti Classico DOCG (Sangiovese 100%) 13.5%"
 */
export default function componiDescrizione({
  denominazione,
  nome_etichetta,
  vitigni,
  grado,
} = {}) {
  const parts = [];

  const denom = (denominazione || "").toString().trim();
  if (denom) parts.push(denom);

  const nome = (nome_etichetta || "").toString().trim();
  if (nome) parts.push(nome);

  const vit = (vitigni || "").toString().trim();
  if (vit) parts.push(`(${vit})`);

  if (grado != null && grado !== "") {
    const num = parseFloat(String(grado).replace(",", "."));
    if (Number.isFinite(num) && num > 0) {
      // Format "14%" se intero, "14.5%" se decimale; rimuove zero finali (.0)
      const formatted = num % 1 === 0 ? `${num}%` : `${num.toString().replace(/\.?0+$/, "")}%`;
      parts.push(formatted);
    }
  }

  return parts.join(" ");
}

/**
 * Helper: converte una lista vitigni [{vitigno_label, pct}, ...] in stringa
 * formattata "Nebbiolo 100%" o "Nebbiolo 95%, Barbera 5%".
 * Se pct vuoto/0/null mette solo il nome (es. "Nebbiolo, Barbera").
 */
export function vitigniToString(vitigniList) {
  if (!vitigniList || !vitigniList.length) return "";
  return vitigniList.map(v => {
    const nome = (v.vitigno_label || v.nome || "").trim();
    if (!nome) return "";
    const pct = v.pct;
    const pctNum = pct == null || pct === "" ? null : parseFloat(pct);
    if (Number.isFinite(pctNum) && pctNum > 0) {
      return pctNum % 1 === 0 ? `${nome} ${pctNum}%` : `${nome} ${pctNum}%`;
    }
    return nome;
  }).filter(Boolean).join(", ");
}
