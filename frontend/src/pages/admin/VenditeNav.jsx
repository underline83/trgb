// @version: v2.1-vendite-nav-indigo
// Tab navigation persistente per la sezione Gestione Vendite
// I tab admin-only sono nascosti per ruoli sala/sommelier
import React from "react";
import { ModuleNav } from "../../components/ui";
import { isAdminRole, isSuperAdminRole } from "../../utils/authHelpers";

const TABS = [
  { key: "fine-turno", label: "Chiusura Turno", path: "/vendite/fine-turno", icon: "🔔", check: null },
  { key: "chiusure", label: "Chiusure", path: "/vendite/chiusure", icon: "📅", check: "admin" },
  { key: "riepilogo", label: "Riepilogo", path: "/vendite/riepilogo", icon: "📋", check: "admin" },
  { key: "dashboard", label: "Dashboard", path: "/vendite/dashboard", icon: "📊", check: "admin" },
  // Mance e Contanti spostati in Flussi di Cassa
  { key: "impostazioni", label: "Impostazioni", path: "/vendite/impostazioni", icon: "⚙️", check: "admin" },
];

export default function VenditeNav({ current }) {
  const role = localStorage.getItem("role");

  const visibleTabs = TABS.filter(tab =>
    tab.check === null
    || (tab.check === "admin" && isAdminRole(role))
    || (tab.check === "superadmin" && isSuperAdminRole(role))
  );

  return (
    <ModuleNav
      title="Vendite"
      homePath="/vendite"
      color="indigo"
      tabs={visibleTabs}
      isActive={(tab) => current === tab.key}
    />
  );
}
