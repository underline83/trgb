// @version: v3.0 — S2 cutover (2026-05-18): Cantina 2 promossa a "Cantina".
// La Cantina classica viene spenta (i file restano in _legacy.jsx come archivio).
// Tab navigation persistente per la sezione vini.
// Ordine: Dashboard, Cantina, Anagrafiche, Carta, Sommelier, Vendite, Impostazioni
// Impostazioni visibile solo per admin e sommelier
import React from "react";
import { ModuleNav } from "../../components/ui";

const TABS = [
  { key: "dashboard", label: "Dashboard", path: "/vini/dashboard", icon: "📊" },
  // S2 cutover (2026-05-18): la tab "Cantina" ora punta direttamente alle _v2.
  // La Cantina classica (`/vini/magazzino`) è deprecata, route in App.jsx
  // redirect a `/vini/v2/cantina`.
  { key: "cantina", label: "Cantina", path: "/vini/v2/cantina", icon: "🍷" },
  // V.9 fase 1 (2026-08-03): pagina mobile per l'uso col telefono in cantina.
  { key: "cantina-mobile", label: "Cantina mobile", path: "/vini/cantina-mobile", icon: "📱" },
  // O6 (2026-08-02): pagina Ordini fornitore-centrica. Sta subito dopo Cantina
  // perché è lì che si va quando si guarda cosa manca. Vedi
  // docs/modulo_vini_ordini.md.
  { key: "ordini", label: "Ordini", path: "/vini/ordini", icon: "📦" },
  // M2.5-arch (2026-05-16): tab "Anagrafiche" — pannello dedicato alle entità master
  // (produttori, distributori, denominazioni, vitigni, vini madre). Promosso dalla
  // sotto-pagina "🧪 Anagrafiche (beta)" che viveva sotto Impostazioni.
  { key: "anagrafiche", label: "Anagrafiche", path: "/vini/anagrafiche", icon: "📚", roles: ["admin", "sommelier"] },
  { key: "carta", label: "Carta", path: "/vini/carta", icon: "📜" },
  { key: "carta-staff", label: "Sommelier", path: "/vini/carta-staff", icon: "🥂" },
  { key: "vendite", label: "Vendite", path: "/vini/vendite", icon: "🛒" },
  { key: "settings", label: "Impostazioni", path: "/vini/settings", icon: "⚙️", roles: ["admin", "sommelier"] },
];

export default function ViniNav({ current }) {
  const role = localStorage.getItem("role");

  // superadmin eredita tutti i permessi di admin (allineato a useModuleAccess.roleMatch)
  const visibleTabs = TABS.filter((tab) => !tab.roles || tab.roles.includes(role) || (role === "superadmin" && tab.roles.includes("admin")));

  return (
    <ModuleNav
      title="Vini"
      homePath="/vini"
      color="amber"
      tabs={visibleTabs}
      isActive={(tab) => current === tab.key}
    />
  );
}
