// @version: v1.2 — voce «Schermo cucina» (2026-11-24); v1.1 — Tavoli · Invii · Impostazioni; avviso «in prova» su una riga (2026-11-24)
// Modulo: comande
import React from "react";
import { useLocation } from "react-router-dom";
import { ModuleNav } from "../../components/ui";

const TABS = [
  { key: "tavoli", label: "Tavoli", path: "/comande", icon: "🍽️" },
  { key: "invii", label: "Invii", path: "/comande/invii", icon: "🧾" },
  { key: "schermo", label: "Schermo cucina", path: "/comande/schermo", icon: "🖥️" },
  { key: "impostazioni", label: "Impostazioni", path: "/comande/impostazioni", icon: "⚙️", roles: ["superadmin", "admin"] },
];

export default function ComandeNav({ current }) {
  const location = useLocation();
  const role = localStorage.getItem("role");
  const visibili = TABS.filter(
    (t) => !t.roles || t.roles.includes(role) || (role === "superadmin" && t.roles.includes("admin"))
  );
  const isActive = (t) => {
    if (t.key === "invii") return location.pathname.startsWith("/comande/invii");
    if (t.key === "schermo") return location.pathname.startsWith("/comande/schermo");
    if (t.key === "impostazioni") return location.pathname.startsWith("/comande/impostazioni");
    if (t.key === "tavoli")
      return location.pathname === "/comande" || location.pathname.startsWith("/comande/conto");
    return current === t.key;
  };
  return <ModuleNav title="Comanda" homePath="/comande" color="rose" tabs={visibili} isActive={isActive} />;
}

// Avviso fisso: finché non c'è la Cassa le comande non valgono in servizio (Marco, 24/11/2026).
// Su una riga sola, per non rubare spazio ai tavoli e al conto.
const PROVA = "Le comande di TRGB non vanno in servizio: tavoli, conti e scontrini veri restano su iPratico finché non arriva la Cassa.";

export function BannerProva() {
  return (
    <div title={PROVA} className="mb-2 truncate rounded-lg border border-amber-300 bg-amber-50 px-3 py-1 text-xs text-amber-900">
      <b>In prova.</b> Tavoli, conti e scontrini veri restano su iPratico finché non arriva la Cassa.
    </div>
  );
}

// La stessa cosa in una pastiglia, dove c'è posto solo per due parole (testata del conto).
export function ProvaPill() {
  return (
    <span title={PROVA} className="shrink-0 rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-900">
      In prova
    </span>
  );
}
