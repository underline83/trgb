// @version: v1.4 — tab «📥 Posta» (solo admin) col numero delle mail da gestire (2026-11-13) · v1.3 — redesign: «Anagrafica» diventa «Clienti», «Dashboard» diventa «Statistiche»; via «Prenotazioni» (ora Prenotazioni › Archivio) · v1.2-clienti-nav
// Tab navigation per il modulo Clienti CRM
// Import, Duplicati, Mailchimp spostati dentro Impostazioni (sidebar)
import React, { useState, useEffect } from "react";
import { useLocation } from "react-router-dom";
import { ModuleNav } from "../../components/ui";
import { API_BASE, apiFetch } from "../../config/api";

const TABS = [
  { key: "lista", label: "Clienti", path: "/clienti/lista", icon: "📇" },
  { key: "preventivi", label: "Preventivi", path: "/clienti/preventivi", icon: "📋" },
  { key: "posta", label: "Posta", path: "/clienti/posta", icon: "📥", roles: ["superadmin", "admin"] },
  { key: "giftcard", label: "Gift Card", path: "/clienti/giftcard", icon: "🎁" },
  { key: "dashboard", label: "Statistiche", path: "/clienti/dashboard", icon: "📊" },
  { key: "impostazioni", label: "Impostazioni", path: "/clienti/impostazioni", icon: "⚙️", roles: ["superadmin", "admin"] },
];

export default function ClientiNav({ current, diffCount: externalDiffCount }) {
  const location = useLocation();
  const role = localStorage.getItem("role");
  const [diffCount, setDiffCount] = useState(0);
  const [posta, setPosta] = useState(0);
  const puoPosta = role === "admin" || role === "superadmin";

  // Mail da gestire nella casella del gestionale (posta in arrivo, 2026-11-13)
  useEffect(() => {
    if (!puoPosta) return;
    apiFetch(`${API_BASE}/email/in?stato=nuova&limite=1`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d) setPosta(d.nuove_in_casella || 0); })
      .catch(() => {});
  }, [puoPosta, location.pathname]);

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
      tabs={visibleTabs.map((t) => (t.key === "impostazioni" ? { ...t, badge: diffCount } : t.key === "posta" ? { ...t, badge: posta } : t))}
      isActive={isActive}
    />
  );
}
