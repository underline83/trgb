// @version: v2.2-no-ipratico-tab — iPratico spostato dentro Impostazioni (sessione 39)
// Tab navigation persistente per la sezione vini
// Ordine: Dashboard, Cantina, Carta, Vendite, Impostazioni
// Impostazioni visibile solo per admin e sommelier
import React from "react";
import { useNavigate } from "react-router-dom";

const TABS = [
  { key: "dashboard", label: "Dashboard", path: "/vini/dashboard", icon: "📊" },
  { key: "cantina", label: "Cantina", path: "/vini/magazzino", icon: "🍷" },
  // V.6+V.7+V.8 — Modulo "Cantina 2" (test parallelo read-only sulle tabelle _v2).
  // Solo admin/sommelier per ora. Al cutover atomico (Fase 10) la "Cantina"
  // classica viene sostituita dalla v2 e questa entry sparisce.
  // Rinomina M2.5-arch (2026-05-16): era "Gestione 2", ora "Cantina 2" perché
  // di fatto è una cantina alternativa. "Gestione" viene liberato per il nuovo
  // tab Anagrafiche (gestione produttori/distributori/denominazioni/vitigni/madre).
  { key: "v2", label: "Cantina 2", path: "/vini/v2", icon: "🧪", roles: ["admin", "sommelier"] },
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
  const navigate = useNavigate();
  const role = localStorage.getItem("role");

  // superadmin eredita tutti i permessi di admin (allineato a useModuleAccess.roleMatch)
  const visibleTabs = TABS.filter((tab) => !tab.roles || tab.roles.includes(role) || (role === "superadmin" && tab.roles.includes("admin")));

  return (
    <div className="bg-white border-b border-neutral-200 shadow-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        <div className="flex items-center justify-between h-12">
          {/* Left: brand + tabs */}
          <div className="flex items-center gap-1">
            <button
              onClick={() => navigate("/vini")}
              className="text-sm font-bold text-amber-900 font-playfair mr-4 hover:text-amber-700 transition whitespace-nowrap"
            >
              Vini
            </button>
            <div className="flex gap-0.5">
              {visibleTabs.map((tab) => {
                const active = current === tab.key;
                return (
                  <button
                    key={tab.key}
                    onClick={() => navigate(tab.path)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition whitespace-nowrap ${
                      active
                        ? "bg-amber-100 text-amber-900 shadow-sm"
                        : "text-neutral-600 hover:bg-neutral-100 hover:text-neutral-800"
                    }`}
                  >
                    <span className="mr-1">{tab.icon}</span>
                    {tab.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Right: back link */}
          <button
            onClick={() => navigate("/")}
            className="text-[11px] text-neutral-400 hover:text-neutral-600 transition hidden sm:block"
          >
            ← Home
          </button>
        </div>
      </div>
    </div>
  );
}
