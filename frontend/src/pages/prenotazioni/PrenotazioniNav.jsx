// @version: v1.0-prenotazioni-nav
// Tab navigation per il modulo Prenotazioni
import React from "react";
import { useLocation } from "react-router-dom";
import { ModuleNav } from "../../components/ui";

const TABS = [
  { key: "planning", label: "Planning", path: "/prenotazioni/planning", icon: "📋" },
  { key: "mappa", label: "Mappa Tavoli", path: "/prenotazioni/mappa", icon: "🗺️" },
  { key: "settimana", label: "Settimana", path: "/prenotazioni/settimana", icon: "📆" },
  { key: "tavoli", label: "Editor Tavoli", path: "/prenotazioni/tavoli", icon: "✏️", roles: ["superadmin", "admin"] },
  { key: "impostazioni", label: "Impostazioni", path: "/prenotazioni/impostazioni", icon: "⚙️", roles: ["superadmin", "admin"] },
];

export default function PrenotazioniNav({ current }) {
  const location = useLocation();
  const role = localStorage.getItem("role");

  // superadmin eredita tutti i permessi di admin (allineato a useModuleAccess.roleMatch)
  const visibleTabs = TABS.filter((tab) => !tab.roles || tab.roles.includes(role) || (role === "superadmin" && tab.roles.includes("admin")));

  const isActive = (tab) => {
    if (tab.key === "impostazioni") return location.pathname.startsWith("/prenotazioni/impostazioni");
    if (tab.key === "planning") return location.pathname.startsWith("/prenotazioni/planning");
    if (tab.key === "settimana") return location.pathname.startsWith("/prenotazioni/settimana");
    if (tab.key === "mappa") return location.pathname.startsWith("/prenotazioni/mappa");
    if (tab.key === "tavoli") return location.pathname.startsWith("/prenotazioni/tavoli");
    return current === tab.key;
  };

  return (
    <ModuleNav
      title="Prenotazioni"
      homePath="/prenotazioni"
      color="indigo"
      tabs={visibleTabs}
      isActive={isActive}
    />
  );
}
