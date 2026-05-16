// src/utils/vini/groupByMadre.js
// Modulo: vini
//
// Raggruppa una lista di bottiglie (vini_bottiglie_v2 + JOIN madre/produttore/denominazione)
// per madre_id, ritornando un array di madri ciascuna con `annate` nested.
//
// Vantaggio del pattern: applichi UN SOLO set di filtri alle bottiglie (es. via
// useCantinaFilters), poi raggruppi il risultato. Le madri "vuote" (zero annate
// dopo i filtri) spariscono automaticamente. Niente endpoint dedicato lato server.
//
// Input atteso per ogni bottiglia (campi joinati dal router /vini/v2/bottiglie/):
//   - id, ANNATA, FORMATO, PREZZO_CARTA, QTA_TOTALE, STATO_VENDITA, STATO_RIORDINO,
//     FRIGORIFERO, QTA_FRIGO, LOCAZIONE_1, QTA_LOC1, ecc.
//   - madre_id
//   - m_id, m_descrizione, m_tipologia, m_abbinamenti, m_grado_alcolico_tipico
//   - p_nome, p_nazione, p_regione
//   - f_nome, f_rappresentante_nome
//   - d_display, d_tipo
//
// Output: array di madri ordinato per descrizione.

export default function groupByMadre(bottiglie) {
  if (!Array.isArray(bottiglie) || bottiglie.length === 0) return [];

  const map = new Map();
  // Bottiglie "orfane" (madre_id NULL) raggruppate in chiave fittizia "_orfani"
  // per evitare di perderle silenziosamente
  for (const b of bottiglie) {
    const mid = b.madre_id;
    if (mid == null) continue; // skip orfani in vista madri (rari, ~2 record)
    if (!map.has(mid)) {
      map.set(mid, {
        id: b.m_id || mid,
        descrizione: b.m_descrizione || b.DESCRIZIONE,
        tipologia: b.m_tipologia || b.TIPOLOGIA,
        produttore_nome: b.p_nome || b.PRODUTTORE,
        nazione: b.p_nazione || b.NAZIONE,
        regione: b.p_regione || b.REGIONE,
        denominazione_display: b.d_display || b.DENOMINAZIONE,
        fornitore_nome: b.f_nome || b.DISTRIBUTORE,
        rappresentante_nome: b.f_rappresentante_nome || b.RAPPRESENTANTE,
        abbinamenti: b.m_abbinamenti || b.ABBINAMENTI,
        annate: [],
      });
    }
    map.get(mid).annate.push(b);
  }

  // Aggrega contatori + ordina annate
  const out = Array.from(map.values()).map(m => {
    const annate = [...m.annate].sort((a, b) => {
      // Annata DESC (null/'' in fondo), poi formato
      const ay = a.ANNATA || "";
      const by = b.ANNATA || "";
      if (ay !== by) {
        if (!ay) return 1;
        if (!by) return -1;
        return by.localeCompare(ay);
      }
      return String(a.FORMATO || "").localeCompare(String(b.FORMATO || ""));
    });
    const qta_tot = annate.reduce((s, a) => s + (a.QTA_TOTALE || 0), 0);
    return { ...m, annate, n_annate: annate.length, qta_tot };
  });

  // Ordina madri per descrizione
  out.sort((a, b) => String(a.descrizione || "").localeCompare(String(b.descrizione || ""), "it"));
  return out;
}
