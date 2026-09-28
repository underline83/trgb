// @version: v1.0-statistiche-nav
// Tab navigation per la sezione Statistiche
import React from "react";
import { ModuleNav } from "../../components/ui";

const TABS = [
  { key: "dashboard", label: "Dashboard", path: "/statistiche/dashboard", icon: "📊" },
  { key: "prodotti", label: "Prodotti", path: "/statistiche/prodotti", icon: "🍽️" },
  { key: "coperti", label: "Coperti & Incassi", path: "/statistiche/coperti", icon: "👥" },
  { key: "storico", label: "Storico", path: "/statistiche/storico", icon: "🕰️" },
  { key: "import", label: "Import iPratico", path: "/statistiche/import", icon: "📥", roles: ["admin"] },
  { key: "cantina", label: "Cantina", icon: "🍷", soon: true },
  { key: "personale", label: "Personale", icon: "👤", soon: true },
];

export default function StatisticheNav({ current }) {
  const role = localStorage.getItem("role");

  // superadmin eredita tutti i permessi di admin (allineato a useModuleAccess.roleMatch)
  const visibleTabs = TABS.filter((tab) => tab.soon || !tab.roles || tab.roles.includes(role) || (role === "superadmin" && tab.roles.includes("admin")));

  return (
    <ModuleNav
      title="Statistiche"
      homePath="/statistiche"
      color="rose"
      tabs={visibleTabs}
      isActive={(tab) => current === tab.key}
    />
  );
}
