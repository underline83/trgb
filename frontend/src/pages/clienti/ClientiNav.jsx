// @version: v1.2-clienti-nav
// Tab navigation per il modulo Clienti CRM
// Import, Duplicati, Mailchimp spostati dentro Impostazioni (sidebar)
import React, { useState, useEffect } from "react";
import { useLocation } from "react-router-dom";
import { ModuleNav } from "../../components/ui";
import { API_BASE, apiFetch } from "../../config/api";

const TABS = [
  { key: "lista", label: "Anagrafica", path: "/clienti/lista", icon: "📇" },
  { key: "prenotazioni", label: "Prenotazioni", path: "/clienti/prenotazioni", icon: "📅" },
  { key: "preventivi", label: "Preventivi", path: "/clienti/preventivi", icon: "📋" },
  { key: "giftcard", label: "Gift Card", path: "/clienti/giftcard", icon: "🎁" },
  { key: "dashboard", label: "Dashboard", path: "/clienti/dashboard", icon: "📊" },
  { key: "impostazioni", label: "Impostazioni", path: "/clienti/impostazioni", icon: "⚙️", roles: ["superadmin", "admin"] },
];

export default function ClientiNav({ current, diffCount: externalDiffCount }) {
  const location = useLocation();
  const role = localStorage.getItem("role");
  const [diffCount, setDiffCount] = useState(0);

  useEffect(() => {
    if (externalDiffCount !== undefined) {
      setDiffCount(externalDiffCount);
      return;
    }
    apiFetch(`${API_BASE}/clienti/import/diff/count`)
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d) setDiffCount(d.pending || 0); })
      .catch(() => {});
  }, [externalDiffCount]);

  // superadmin eredita tutti i permessi di admin (allineato a useModuleAccess.roleMatch)
  const visibleTabs = TABS.filter((tab) => !tab.roles || tab.roles.includes(role) || (role === "superadmin" && tab.roles.includes("admin")));

  // Impostazioni attivo anche per sotto-path
  const isActive = (tab) => {
    if (tab.key === "impostazioni") return location.pathname.startsWith("/clienti/impostazioni");
    if (tab.key === "preventivi") return location.pathname.startsWith("/clienti/preventivi");
    return current === tab.key;
  };

  return (
    <ModuleNav
      title="Clienti"
      homePath="/clienti"
      color="teal"
      tabs={visibleTabs.map((t) => (t.key === "impostazioni" ? { ...t, badge: diffCount } : t))}
      isActive={isActive}
    />
  );
}
