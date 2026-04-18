// Reparti del modulo Cucina/Task Manager (sessione 45 — Phase A multi-reparto)
// Lista hardcoded usata da form, filtri, badge. Future Phase B: caricarla dal backend.

export const REPARTI = [
  { key: "cucina",       label: "Cucina",       icon: "🍳", color: "bg-red-50 border-red-200 text-red-900" },
  { key: "bar",          label: "Bar",          icon: "🍸", color: "bg-amber-50 border-amber-200 text-amber-900" },
  { key: "sala",         label: "Sala",         icon: "🍽️", color: "bg-rose-50 border-rose-200 text-rose-900" },
  { key: "pulizia",      label: "Pulizia",      icon: "🧹", color: "bg-emerald-50 border-emerald-200 text-emerald-900" },
  { key: "manutenzione", label: "Manutenzione", icon: "🔧", color: "bg-slate-50 border-slate-200 text-slate-900" },
];

export const REPARTI_KEYS = REPARTI.map(r => r.key);

export function getReparto(key) {
  return REPARTI.find(r => r.key === key) || REPARTI[0];
}

// Phase A.2 — Livelli brigata cucina (sessione 46)
export const LIVELLI_CUCINA = [
  { key: "chef",      label: "Chef",      icon: "👨‍🍳", color: "bg-red-100 border-red-300 text-red-900" },
  { key: "sous_chef", label: "Sous Chef", icon: "🥘",   color: "bg-orange-100 border-orange-300 text-orange-900" },
  { key: "commis",    label: "Commis",    icon: "🔪",   color: "bg-yellow-100 border-yellow-300 text-yellow-900" },
];

export const LIVELLI_CUCINA_KEYS = LIVELLI_CUCINA.map(l => l.key);

export function getLivelloCucina(key) {
  return LIVELLI_CUCINA.find(l => l.key === key) || null;
}
