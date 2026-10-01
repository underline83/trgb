// @version: v1.1-ricette-nav-orange
// Tab navigation persistente per la sezione ricette
// Matching e Impostazioni visibili solo per admin/sommelier
import React from "react";
import { ModuleNav } from "../../components/ui";

const TABS = [
  { key: "cucina-dashboard", label: "Cucina", path: "/cucina/dashboard", icon: "🍳" },
  // 2026-09-28: la sotto-app da telefono (Oggi/Scorte/Frigo/Spesa). Stava solo
  // nel menu moduli in alto; Marco non la trovava nel menu della sezione.
  // Stessa scelta di ViniNav con «Cantina mobile».
  { key: "cucina-mobile", label: "Cucina iPhone", path: "/cucina/mobile", icon: "📱" },
  { key: "archivio", label: "Ricette", path: "/ricette/archivio", icon: "📚" },
  { key: "ingredienti", label: "Ingredienti", path: "/ricette/ingredienti", icon: "🧾" },
  { key: "spesa", label: "Spesa", path: "/cucina/spesa", icon: "🛒" },
  { key: "menu", label: "Menu", path: "/menu-carta", icon: "📋" },
  { key: "dashboard", label: "Food Cost", path: "/ricette/dashboard", icon: "📊", roles: ["admin", "sommelier"] },
  { key: "settings", label: "Impostazioni", path: "/ricette/settings", icon: "⚙️", roles: ["admin"] },
];

export default function RicetteNav({ current }) {
  const role = localStorage.getItem("role");

  // superadmin eredita tutti i permessi di admin (allineato a useModuleAccess.roleMatch)
  const visibleTabs = TABS.filter((tab) => !tab.roles || tab.roles.includes(role) || (role === "superadmin" && tab.roles.includes("admin")));

  return (
    <ModuleNav
      title="Gestione Cucina"
      homePath="/ricette"
      color="orange"
      tabs={visibleTabs}
      isActive={(tab) => current === tab.key}
    />
  );
}
