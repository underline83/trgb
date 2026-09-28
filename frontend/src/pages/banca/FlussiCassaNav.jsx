// src/pages/banca/FlussiCassaNav.jsx
// @version: v1.1 — Tab navigation con permessi granulari
import React from "react";
import { ModuleNav } from "../../components/ui";
import useModuleAccess from "../../hooks/useModuleAccess";

const TABS = [
  { key: "dashboard",    label: "Dashboard",        path: "/flussi-cassa/dashboard",    icon: "📊" },
  { key: "cc",           label: "Conti Correnti",    path: "/flussi-cassa/cc",           icon: "🏦" },
  { key: "crossref",     label: "Riconciliazione",   path: "/flussi-cassa/cc/crossref",  icon: "🔗", perm: "cc" },
  { key: "carta",        label: "Carta di Credito",  path: "/flussi-cassa/carta",        icon: "💳" },
  { key: "contanti",     label: "Contanti",          path: "/flussi-cassa/contanti",     icon: "💰" },
  { key: "mance",        label: "Mance",             path: "/flussi-cassa/mance",        icon: "🎁" },
  { key: "impostazioni", label: "Impostazioni",      path: "/flussi-cassa/impostazioni", icon: "⚙️" },
];

export default function FlussiCassaNav({ current }) {
  const { canAccessSub } = useModuleAccess();

  const visibleTabs = TABS.filter(tab => canAccessSub("flussi-cassa", tab.perm || tab.key));

  return (
    <ModuleNav
      title="Flussi di Cassa"
      homePath="/flussi-cassa"
      color="emerald"
      tabs={visibleTabs}
      isActive={(tab) => current === tab.key}
    />
  );
}
