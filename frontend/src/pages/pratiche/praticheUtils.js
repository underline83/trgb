// Modulo: pratiche
// Etichette e formattazioni condivise da PraticheElenco e PraticaScheda.

export const STATI = {
  tocca_a_me:   { label: "Tocca a me",   tone: "warning" },
  tocca_a_loro: { label: "Tocca a loro", tone: "info" },
  chiusa:       { label: "Chiusa",       tone: "neutral" },
};

export function oggiISO() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function fmtData(iso) {
  if (!iso) return "";
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
}

// «scaduta da 3 gg», «scade oggi», «tra 5 gg». Il senso del termine segue lo
// stato: tocca a me = entro quando devo agire, tocca a loro = fino a quando aspetto.
export function descriviTermine(p) {
  if (!p.termine) return "nessun termine";
  const g = p.giorni_al_termine;
  if (p.stato === "chiusa" || g == null) return fmtData(p.termine);
  if (g < 0) return `${fmtData(p.termine)} · scaduta da ${-g} gg`;
  if (g === 0) return `${fmtData(p.termine)} · oggi`;
  if (g === 1) return `${fmtData(p.termine)} · domani`;
  return `${fmtData(p.termine)} · tra ${g} gg`;
}

// Contatto tappabile: email/PEC → mailto, telefono → tel.
export function hrefContatto(c) {
  if (!c) return null;
  const t = c.trim();
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(t)) return `mailto:${t}`;
  const tel = t.replace(/[^\d+]/g, "");
  if (tel.length >= 6 && /^[+\d][\d\s./-]+$/.test(t)) return `tel:${tel}`;
  return null;
}

export async function leggiErrore(res) {
  try {
    const j = await res.json();
    if (typeof j.detail === "string") return j.detail;
    if (Array.isArray(j.detail)) return j.detail.map((d) => d.msg).join(", ");
  } catch { /* corpo non JSON */ }
  return `Errore ${res.status}`;
}

export const ALLEGATO_ACCEPT = "application/pdf,image/*,.heic,.heif";
export const ALLEGATO_MAX_MB = 20;

// ── v1.1 (2026-11-02): sezioni, campi del debito, in attesa di mezzi ──

export function fmtEuro(v) {
  if (v == null || v === "") return "";
  return Number(v).toLocaleString("it-IT", { style: "currency", currency: "EUR" });
}

// Accetta «5.008,07», «5008.07», «€ 5.008,07». "" → null.
export function leggiImporto(t) {
  if (t == null) return null;
  let s = String(t).replace(/€|\s/g, "");
  if (!s) return null;
  if (s.includes(",")) s = s.replace(/\./g, "").replace(",", ".");
  const n = Number(s);
  return Number.isFinite(n) ? n : NaN;
}

// «rivedere oggi», «da rivedere da 3 gg», «revisione tra 12 gg».
export function descriviRevisione(p) {
  if (!p.in_attesa) return "";
  const g = p.giorni_alla_revisione;
  if (g == null) return "da rivedere";
  if (g < 0) return `da rivedere da ${-g} gg`;
  if (g === 0) return "da rivedere oggi";
  return `revisione il ${fmtData(p.revisione_il)} · tra ${g} gg`;
}

// Riga corta del debito: «Avviso bonario · CO275462467 · 2026 II trim. · residuo € 5.008,07».
export function rigaDebito(p) {
  const parti = [];
  if (p.tipo_atto) parti.push(p.tipo_atto);
  if (p.rif_atto) parti.push(p.rif_atto);
  if (p.periodo) parti.push(p.periodo);
  if (p.importo_residuo != null) parti.push(`residuo ${fmtEuro(p.importo_residuo)}`);
  else if (p.importo_dovuto != null) parti.push(fmtEuro(p.importo_dovuto));
  return parti.join(" · ");
}

// Rate di una spesa fissa (GET /controllo-gestione/spese-fisse/{id}/piano-rate),
// divise come le divide il connettore MCP: pagate / in distinta non abbinate in
// banca / scadute / da pagare.
export function classificaRate(rate, oggi = oggiISO()) {
  const g = { pagate: [], in_distinta: [], scadute: [], da_pagare: [] };
  (rate || []).forEach((r) => {
    if (r.uscita_stato === "PAGATO" || r.uscita_stato === "PAGATO_MANUALE") g.pagate.push(r);
    else if (r.batch_id && !r.banca_movimento_id) g.in_distinta.push(r);
    else if (r.uscita_scadenza && r.uscita_scadenza < oggi) g.scadute.push(r);
    else g.da_pagare.push(r);
  });
  const somma = (xs) => xs.reduce((t, r) => t + (Number(r.importo) || 0), 0);
  return Object.fromEntries(Object.entries(g).map(([k, xs]) => [k, { voci: xs, importo: somma(xs) }]));
}
