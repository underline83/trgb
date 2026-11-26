// @version: v1.6 — tab «Mese» al posto di «Settimana» (2026-11-26) · v1.5 — «Servizio» è il primo tab e la pagina d'arrivo (2026-11-26) · v1.4 — tab «Servizio» (elenco e sala insieme) (2026-11-26) · v1.3 — sul telefono «Editor Tavoli» va sotto «Meglio dal computer» (2026-11-24) · v1.2 — tab Archivio (spostato da Clienti, redesign 2026-10-19) · v1.1-recensioni — tab Recensioni (admin, sala); v1.0-prenotazioni-nav
// Tab navigation per il modulo Prenotazioni
import React from "react";
import { useLocation } from "react-router-dom";
import { ModuleNav } from "../../components/ui";

const TABS = [
  { key: "servizio", label: "Servizio", path: "/prenotazioni/servizio", icon: "🍽️" },
  { key: "planning", label: "Planning", path: "/prenotazioni/planning", icon: "📋" },
  { key: "mappa", label: "Mappa Tavoli", path: "/prenotazioni/mappa", icon: "🗺️" },
  { key: "mese", label: "Mese", path: "/prenotazioni/mese", icon: "📆" },
  { key: "archivio", label: "Archivio", path: "/prenotazioni/archivio", icon: "🗂️" },
  { key: "recensioni", label: "Recensioni", path: "/prenotazioni/recensioni", icon: "⭐", roles: ["superadmin", "admin", "sala"] },
  { key: "tavoli", label: "Editor Tavoli", path: "/prenotazioni/tavoli", icon: "✏️", roles: ["superadmin", "admin"], mobile: false },
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
    if (tab.key === "mese") return location.pathname.startsWith("/prenotazioni/mese") || location.pathname.startsWith("/prenotazioni/settimana");
    if (tab.key === "servizio") return location.pathname.startsWith("/prenotazioni/servizio");
    if (tab.key === "mappa") return location.pathname.startsWith("/prenotazioni/mappa");
    if (tab.key === "tavoli") return location.pathname.startsWith("/prenotazioni/tavoli");
    if (tab.key === "archivio") return location.pathname.startsWith("/prenotazioni/archivio");
    if (tab.key === "recensioni") return location.pathname.startsWith("/prenotazioni/recensioni");
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
