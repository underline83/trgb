// @version: v1.0-banca-nav
// Tab navigation per la sezione Banca
import React from "react";
import { ModuleNav } from "../../components/ui";

const TABS = [
  { key: "dashboard", label: "Dashboard", path: "/banca/dashboard", icon: "📊" },
  { key: "movimenti", label: "Movimenti", path: "/banca/movimenti", icon: "📋" },
  { key: "crossref", label: "Fatture", path: "/banca/crossref", icon: "🔗" },
  { key: "impostazioni", label: "Impostazioni", path: "/banca/impostazioni", icon: "⚙️", roles: ["admin"] },
];

export default function BancaNav({ current }) {
  const role = localStorage.getItem("role");

  // superadmin eredita tutti i permessi di admin (allineato a useModuleAccess.roleMatch)
  const visibleTabs = TABS.filter((tab) => !tab.roles || tab.roles.includes(role) || (role === "superadmin" && tab.roles.includes("admin")));

  return (
    <ModuleNav
      title="Banca"
      homePath="/banca"
      color="emerald"
      tabs={visibleTabs}
      isActive={(tab) => current === tab.key}
    />
  );
}
