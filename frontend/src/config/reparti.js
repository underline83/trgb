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
