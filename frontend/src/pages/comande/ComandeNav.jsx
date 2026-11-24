// @version: v1.0 — Tavoli · Invii · Impostazioni (2026-11-24)
// Modulo: comande
import React from "react";
import { useLocation } from "react-router-dom";
import { ModuleNav } from "../../components/ui";

const TABS = [
  { key: "tavoli", label: "Tavoli", path: "/comande", icon: "🍽️" },
  { key: "invii", label: "Invii", path: "/comande/invii", icon: "🧾" },
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
    if (t.key === "impostazioni") return location.pathname.startsWith("/comande/impostazioni");
    if (t.key === "tavoli")
      return location.pathname === "/comande" || location.pathname.startsWith("/comande/conto");
    return current === t.key;
  };
  return <ModuleNav title="Comanda" homePath="/comande" color="rose" tabs={visibili} isActive={isActive} />;
}

// Avviso fisso: finché non c'è la Cassa le comande non valgono in servizio (Marco, 24/11/2026).
export function BannerProva() {
  return (
    <div className="mb-4 rounded-xl border border-amber-300 bg-amber-50 px-4 py-2.5 text-sm text-amber-900">
      <b>In prova.</b> Le comande di TRGB non vanno in servizio: tavoli, conti e scontrini veri
      restano su iPratico finché non arriva la Cassa.
    </div>
  );
}
