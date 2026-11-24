// @version: v1.6 — tab «💬 WhatsApp» col numero delle chat da rispondere; Posta e WhatsApp visibili secondo la matrice Moduli (sub clienti/posta e clienti/whatsapp, 2026-11-24) · v1.5 — badge Impostazioni sempre aggiornato (evento «clienti:diff-count», 2026-11-16) · v1.4 — tab «📥 Posta» (solo admin) col numero delle mail da gestire (2026-11-13) · v1.3 — redesign: «Anagrafica» diventa «Clienti», «Dashboard» diventa «Statistiche»; via «Prenotazioni» (ora Prenotazioni › Archivio) · v1.2-clienti-nav
// Tab navigation per il modulo Clienti CRM
// Import, Duplicati, Mailchimp spostati dentro Impostazioni (sidebar)
import React, { useState, useEffect } from "react";
import { useLocation } from "react-router-dom";
import { ModuleNav } from "../../components/ui";
import { API_BASE, apiFetch } from "../../config/api";
import { EVENTO_CONTEGGIO_DIFF } from "./DiffTheFork";
import useModuleAccess from "../../hooks/useModuleAccess";

const TABS = [
  { key: "lista", label: "Clienti", path: "/clienti/lista", icon: "📇" },
  { key: "preventivi", label: "Preventivi", path: "/clienti/preventivi", icon: "📋" },
  // Posta e WhatsApp: chi le vede lo decide la matrice Moduli (Impostazioni Sistema › Moduli)
  { key: "posta", label: "Posta", path: "/clienti/posta", icon: "📥", sub: "posta" },
  { key: "whatsapp", label: "WhatsApp", path: "/clienti/whatsapp", icon: "💬", sub: "whatsapp" },
  { key: "giftcard", label: "Gift Card", path: "/clienti/giftcard", icon: "🎁" },
  { key: "dashboard", label: "Statistiche", path: "/clienti/dashboard", icon: "📊" },
  { key: "impostazioni", label: "Impostazioni", path: "/clienti/impostazioni", icon: "⚙️", roles: ["superadmin", "admin"] },
];

export default function ClientiNav({ current, diffCount: externalDiffCount }) {
  const location = useLocation();
  const role = localStorage.getItem("role");
  const [diffCount, setDiffCount] = useState(0);
  const [posta, setPosta] = useState(0);
  const [whatsapp, setWhatsapp] = useState(0);
  const { canAccessSub, loading: permessiInCarico } = useModuleAccess();
  const puoPosta = !permessiInCarico && canAccessSub("clienti", "posta");
  const puoWhatsapp = !permessiInCarico && canAccessSub("clienti", "whatsapp");

  // Mail da gestire nella casella del gestionale (posta in arrivo, 2026-11-13)
  useEffect(() => {
    if (!puoPosta) return;
    apiFetch(`${API_BASE}/email/in?stato=nuova&limite=1`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d) setPosta(d.nuove_in_casella || 0); })
      .catch(() => {});
  }, [puoPosta, location.pathname]);

  // Chat WhatsApp che aspettano una risposta (ultimi 7 giorni, come la pagina)
  useEffect(() => {
    if (!puoWhatsapp) return;
    apiFetch(`${API_BASE}/clienti/whatsapp/conversazioni?giorni=7&limite=1`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d) setWhatsapp(d.da_rispondere || 0); })
      .catch(() => {});
  }, [puoWhatsapp, location.pathname]);

  useEffect(() => {
    if (externalDiffCount !== undefined) {
      setDiffCount(externalDiffCount);
      return;
    }
    const leggi = () => apiFetch(`${API_BASE}/clienti/import/diff/count`)
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d) setDiffCount(d.pending || 0); })
      .catch(() => {});
    leggi();
    // La coda cambia da sotto (riordino, Applica/Ignora in Impostazioni o nella scheda):
    // chi la cambia manda l'evento, col numero nuovo se lo sa, altrimenti si rilegge.
    const suEvento = (e) => (typeof e.detail === "number" ? setDiffCount(e.detail) : leggi());
    window.addEventListener(EVENTO_CONTEGGIO_DIFF, suEvento);
    return () => window.removeEventListener(EVENTO_CONTEGGIO_DIFF, suEvento);
  }, [externalDiffCount, location.pathname]);

  // superadmin eredita tutti i permessi di admin (allineato a useModuleAccess.roleMatch)
  const visibleTabs = TABS.filter((tab) => {
    if (tab.sub) return !permessiInCarico && canAccessSub("clienti", tab.sub);
    return !tab.roles || tab.roles.includes(role) || (role === "superadmin" && tab.roles.includes("admin"));
  });

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
      tabs={visibleTabs.map((t) => {
        const { sub, ...tab } = t;
        if (t.key === "impostazioni") return { ...tab, badge: diffCount };
        if (t.key === "posta") return { ...tab, badge: posta };
        if (t.key === "whatsapp") return { ...tab, badge: whatsapp };
        return tab;
      })}
      isActive={isActive}
    />
  );
}
