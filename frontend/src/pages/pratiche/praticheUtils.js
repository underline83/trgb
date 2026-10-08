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
