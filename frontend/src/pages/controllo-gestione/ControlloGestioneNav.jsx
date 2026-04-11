// @version: v1.0-controllo-gestione-nav
import React from "react";
import { useNavigate, useLocation } from "react-router-dom";

const TABS = [
  { key: "dashboard", label: "Dashboard", path: "/controllo-gestione/dashboard" },
  { key: "uscite", label: "Uscite", path: "/controllo-gestione/uscite" },
  { key: "riconciliazione", label: "Riconciliazione", path: "/controllo-gestione/riconciliazione" },
  { key: "confronto", label: "Confronto", path: "/controllo-gestione/confronto" },
];

export default function ControlloGestioneNav({ current }) {
  const navigate = useNavigate();
  const location = useLocation();
  const active = current || TABS.find((t) => location.pathname === t.path)?.key || "dashboard";

  return (
    <div className="max-w-7xl mx-auto flex items-center gap-1 mt-2 mb-0">
      <button
        onClick={() => navigate("/controllo-gestione")}
        className="text-sm font-semibold text-sky-700 hover:text-sky-900 mr-3"
      >
        Controllo Gestione
      </button>
      <span className="text-neutral-300 mr-3">|</span>
      {TABS.map((t) => (
        <button
          key={t.key}
          onClick={() => navigate(t.path)}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
            active === t.key
              ? "bg-sky-600 text-white shadow"
              : "text-sky-700 hover:bg-sky-100"
          }`}
        >
          {t.label}
        </button>
      ))}
      <div className="flex-1" />
      <button
        onClick={() => navigate("/")}
        className="text-xs text-neutral-400 hover:text-neutral-600"
      >
        Home
      </button>
    </div>
  );
}
