// src/utils/vini/componiDescrizione.js
// Modulo: vini
//
// Descrizione di un vino e grado alcolico (M2.9 2026-05-16, rivisto 2026-11-23).
//
// Gemello frontend dell'helper backend `app/services/vini_descrizione.py`
// (componi_descrizione, formatta_grado, descrizione_con_grado): stessa regola,
// replicata per avere la preview live nel wizard senza chiamate API.
//
// REGOLA (Marco, 2026-11-23):
//   descrizione = "{denominazione} {nome_etichetta} ({vitigni})"  — SENZA grado.
//   Il grado cambia da annata ad annata e vive solo in GRADO_ALCOLICO della
//   bottiglia: chi stampa (carta, iPratico, etichette, inventari) lo aggiunge
//   in fondo con descrizioneConGrado(); con BIO e formato, descrizioneCarta().
//   Salto gli ingredienti mancanti.
//
// DOVE VIVE OGNI INGREDIENTE:
//   - denominazione    → madre.denominazione_id → display completo
//   - nome_etichetta   → madre.nome_etichetta (col mig 130, può essere null)
//   - vitigni          → bottiglia (per annata, può cambiare tra annate)
//   - grado            → bottiglia.GRADO_ALCOLICO (per annata) — fuori dalla
//                        descrizione; madre.grado_alcolico_tipico è solo la
//                        proposta per le annate nuove.

/**
 * Grado come si stampa: "14,5%" (virgola), "14%" se intero, "0%" per gli
 * analcolici. Stringa vuota se manca o non è un numero.
 */
export function formattaGrado(grado) {
  if (grado == null || grado === "") return "";
  const num = parseFloat(String(grado).replace(",", "."));
  if (!Number.isFinite(num) || num < 0) return "";
  if (num % 1 === 0) return `${num}%`;
  return `${String(num).replace(".", ",")}%`;
}

/**
 * Descrizione da stampare: la descrizione + il grado dell'annata in fondo.
 *   descrizioneConGrado("Barolo DOCG (Nebbiolo 100%)", 14.5) → "Barolo DOCG (Nebbiolo 100%) 14,5%"
 */
export function descrizioneConGrado(descrizione, grado) {
  const desc = (descrizione || "").toString().trim();
  const g = formattaGrado(grado);
  return g ? `${desc} ${g}`.trim() : desc;
}

/**
 * Riga da stampare (vini 4.20, 2026-11-23): descrizione + grado, poi «BIO» se il
 * flag è acceso e il formato (etichetta già pronta, es. "Magnum 1,5 L") se c'è.
 * Gemello di vini_descrizione.descrizione_carta.
 *   descrizioneCarta("Corne (65% Merlot)", 15.5, 1, "Magnum 1,5 L") → "Corne (65% Merlot) 15,5% · BIO · Magnum 1,5 L"
 */
export function descrizioneCarta(descrizione, grado, biologico, formato = "") {
  const testo = descrizioneConGrado(descrizione, grado);
  const extra = [];
  if (biologico) extra.push("BIO");
  if (formato) extra.push(formato);
  return extra.length ? [testo, ...extra].filter(Boolean).join(" · ") : testo;
}

/**
 * Compone la descrizione di un vino: denominazione + nome etichetta + (vitigni).
 *
 * @param {Object} opts
 * @param {string=} opts.denominazione  Display completo (es. "Barolo DOCG")
 * @param {string=} opts.nome_etichetta  Cru/fantasia (es. "Castiglione"). Può essere vuoto.
 * @param {string=} opts.vitigni  Stringa già formattata ("Nebbiolo 100%" o
 *                                "Nebbiolo 95%, Barbera 5%"). Può essere vuota.
 * @param {string|number=} opts.grado  IGNORATO dal 2026-11-23 (resta per compatibilità
 *                                coi chiamanti): il grado non entra nella descrizione.
 *
 * @returns {string}  La descrizione composta. Mai null. Stringa vuota se nessun input.
 *
 * Esempi:
 *   componiDescrizione({ denominazione: "Barolo DOCG", nome_etichetta: "Castiglione",
 *                        vitigni: "Nebbiolo 100%", grado: "14.5" })
 *   → "Barolo DOCG Castiglione (Nebbiolo 100%)"
 */
export default function componiDescrizione({
  denominazione,
  nome_etichetta,
  vitigni,
} = {}) {
  const parts = [];

  const denom = (denominazione || "").toString().trim();
  if (denom) parts.push(denom);

  const nome = (nome_etichetta || "").toString().trim();
  if (nome) parts.push(nome);

  const vit = (vitigni || "").toString().trim();
  if (vit) parts.push(`(${vit})`);

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
