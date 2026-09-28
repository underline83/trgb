// @version: v2.0-refactored-nav
// Tab navigation persistente per la sezione Acquisti
import React from "react";
import { ModuleNav } from "../../components/ui";

const TABS = [
  { key: "dashboard", label: "Dashboard", path: "/acquisti/dashboard", icon: "📈" },
  { key: "fatture", label: "Fatture", path: "/acquisti/fatture", icon: "📋" },
  { key: "fornitori", label: "Fornitori", path: "/acquisti/fornitori", icon: "🏢" },
  { key: "proforme", label: "Pro-forme", path: "/acquisti/proforme", icon: "📝" },
  { key: "impostazioni", label: "Impostazioni", path: "/acquisti/impostazioni", icon: "⚙️" },
];

export default function FattureNav({ current }) {

  return (
    <ModuleNav
      title="Acquisti"
      homePath="/acquisti/dashboard"
      color="teal"
      tabs={TABS}
      isActive={(tab) => current === tab.key}
    />
  );
}
