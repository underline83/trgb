// @version: v1.1-statistiche-nav (2026-10-23: linguetta Sito, se il modulo sito è attivo)
// Tab navigation per la sezione Statistiche
import React from "react";
import { ModuleNav } from "../../components/ui";
import { useActiveModules } from "../../utils/activeModules";

const TABS = [
  { key: "dashboard", label: "Dashboard", path: "/statistiche/dashboard", icon: "📊" },
  { key: "prodotti", label: "Prodotti", path: "/statistiche/prodotti", icon: "🍽️" },
  { key: "coperti", label: "Coperti & Incassi", path: "/statistiche/coperti", icon: "👥" },
  { key: "storico", label: "Storico", path: "/statistiche/storico", icon: "🕰️" },
  { key: "sito", label: "Sito", path: "/statistiche/sito", icon: "🌐", roles: ["admin"], modulo: "sito" },
  { key: "import", label: "Import iPratico", path: "/statistiche/import", icon: "📥", roles: ["admin"] },
  { key: "cantina", label: "Cantina", icon: "🍷", soon: true },
  { key: "personale", label: "Personale", icon: "👤", soon: true },
];

export default function StatisticheNav({ current }) {
  const role = localStorage.getItem("role");
  const { isModuleActive } = useActiveModules();

  // superadmin eredita tutti i permessi di admin (allineato a useModuleAccess.roleMatch)
  const visibleTabs = TABS.filter((tab) => !tab.modulo || isModuleActive(tab.modulo)).filter((tab) => tab.soon || !tab.roles || tab.roles.includes(role) || (role === "superadmin" && tab.roles.includes("admin")));

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
