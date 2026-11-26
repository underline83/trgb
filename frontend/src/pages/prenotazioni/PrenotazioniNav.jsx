// @version: v1.8 — Planning e Mappa Tavoli tolti dalla barra: sono viste di «Servizio» (2026-11-26) · v1.7 — «Editor Tavoli» tolto dalla barra: si apre da Impostazioni (2026-11-26) · v1.6 — tab «Mese» al posto di «Settimana» (2026-11-26) · v1.5 — «Servizio» è il primo tab e la pagina d'arrivo (2026-11-26) · v1.4 — tab «Servizio» (elenco e sala insieme) (2026-11-26) · v1.3 — sul telefono «Editor Tavoli» va sotto «Meglio dal computer» (2026-11-24) · v1.2 — tab Archivio (spostato da Clienti, redesign 2026-10-19) · v1.1-recensioni — tab Recensioni (admin, sala); v1.0-prenotazioni-nav
// Tab navigation per il modulo Prenotazioni
import React from "react";
import { useLocation } from "react-router-dom";
import { ModuleNav } from "../../components/ui";

const TABS = [
  { key: "servizio", label: "Servizio", path: "/prenotazioni/servizio", icon: "🍽️" },
  { key: "mese", label: "Mese", path: "/prenotazioni/mese", icon: "📆" },
  { key: "archivio", label: "Archivio", path: "/prenotazioni/archivio", icon: "🗂️" },
  { key: "recensioni", label: "Recensioni", path: "/prenotazioni/recensioni", icon: "⭐", roles: ["superadmin", "admin", "sala"] },
  { key: "impostazioni", label: "Impostazioni", path: "/prenotazioni/impostazioni", icon: "⚙️", roles: ["superadmin", "admin"] },
];

export default function PrenotazioniNav({ current }) {
  const location = useLocation();
  const role = localStorage.getItem("role");

  // superadmin eredita tutti i permessi di admin (allineato a useModuleAccess.roleMatch)
  const visibleTabs = TABS.filter((tab) => !tab.roles || tab.roles.includes(role) || (role === "superadmin" && tab.roles.includes("admin")));

  const isActive = (tab) => {
    // l'Editor Tavoli si apre da Impostazioni (2026-11-26): mentre ci sei, resta acceso «Impostazioni»
    if (tab.key === "impostazioni") return location.pathname.startsWith("/prenotazioni/impostazioni") || location.pathname.startsWith("/prenotazioni/tavoli");
    if (tab.key === "mese") return location.pathname.startsWith("/prenotazioni/mese") || location.pathname.startsWith("/prenotazioni/settimana");
    // Elenco del giorno (ex Planning) e Mappa Tavoli sono viste di Servizio: stanno sotto lo stesso tab
    if (tab.key === "servizio") return ["/prenotazioni/servizio", "/prenotazioni/planning", "/prenotazioni/mappa"].some((p) => location.pathname.startsWith(p));
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
