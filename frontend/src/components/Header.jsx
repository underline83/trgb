// FILE: frontend/src/components/Header.jsx
// @version: v3.0 — Dropdown navigazione moduli al click su titolo
import React, { useState, useEffect, useRef } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { API_BASE, apiFetch } from "../config/api";
import MODULES_MENU from "../config/modulesMenu";

export default function Header({ onLogout }) {
  const navigate = useNavigate();
  const location = useLocation();
  const username = localStorage.getItem("display_name") || localStorage.getItem("username") || "";
  const role = localStorage.getItem("role") || "";
  const isViewer = role === "viewer";

  const [open, setOpen] = useState(false);
  const [modules, setModules] = useState(null);
  const dropRef = useRef(null);

  // Carica moduli visibili (stessa logica di Home)
  useEffect(() => {
    apiFetch(`${API_BASE}/settings/modules/`)
      .then(r => r.json())
      .then(setModules)
      .catch(() => {
        setModules(Object.keys(MODULES_MENU).map(key => ({ key, roles: ["superadmin", "admin", "chef", "sommelier", "sala", "viewer"] })));
      });
  }, []);

  // Click-outside per chiudere
  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (dropRef.current && !dropRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  // Chiudi su navigazione
  useEffect(() => { setOpen(false); }, [location.pathname]);

  // Filtra moduli visibili per ruolo
  const visibleKeys = modules
    ? modules
        .filter(m => m.roles?.includes(role) || (role === "superadmin" && m.roles?.includes("admin")))
        .map(m => m.key)
        .filter(k => MODULES_MENU[k])
    : Object.keys(MODULES_MENU);

  // Rileva modulo corrente dal path
  const currentPath = location.pathname;
  const currentModule = Object.entries(MODULES_MENU).find(([_, cfg]) =>
    currentPath === cfg.go || currentPath.startsWith(cfg.go + "/")
  );
  const isHome = currentPath === "/" || currentPath === "";

  return (
    <header className="sticky top-0 z-50 bg-white border-b border-neutral-200 shadow-sm">
      {isViewer && (
        <div className="bg-amber-50 border-b border-amber-200 text-center py-1">
          <span className="text-xs text-amber-700 font-medium">
            Accesso in sola lettura — non puoi modificare o caricare dati
          </span>
        </div>
      )}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-2.5 flex items-center justify-between">

        {/* LEFT — Logo + titolo/modulo corrente (dropdown trigger) */}
        <div className="relative" ref={dropRef}>
          <button
            onClick={() => setOpen(!open)}
            className="flex items-center gap-3 cursor-pointer group"
          >
            <img
              src="/logo_tregobbi.png"
              alt="Logo Tre Gobbi"
              className="h-8 w-auto object-contain"
            />
            <div className="hidden sm:flex items-center gap-1.5">
              <span className="text-sm font-semibold text-neutral-700 tracking-wide group-hover:text-neutral-900 transition">
                {currentModule ? currentModule[1].title : "TRGB Gestionale"}
              </span>
              <svg
                className={`w-3.5 h-3.5 text-neutral-400 group-hover:text-neutral-600 transition-transform ${open ? "rotate-180" : ""}`}
                fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
              </svg>
            </div>
          </button>

          {/* Dropdown moduli */}
          {open && (
            <div className="absolute top-full left-0 mt-2 w-72 bg-white rounded-2xl shadow-2xl border border-neutral-200 py-2 z-[100] animate-in fade-in slide-in-from-top-2">
              {/* Home link */}
              <button
                onClick={() => navigate("/")}
                className={`w-full flex items-center gap-3 px-4 py-2.5 text-left text-sm transition ${
                  isHome
                    ? "bg-neutral-100 font-semibold text-neutral-900"
                    : "text-neutral-600 hover:bg-neutral-50"
                }`}
              >
                <span className="text-base w-6 text-center">🏠</span>
                <span>Home</span>
              </button>

              <div className="border-t border-neutral-100 my-1" />

              {/* Lista moduli */}
              {visibleKeys.map(key => {
                const cfg = MODULES_MENU[key];
                const active = currentModule && currentModule[0] === key;
                return (
                  <button
                    key={key}
                    onClick={() => navigate(cfg.go)}
                    className={`w-full flex items-center gap-3 px-4 py-2.5 text-left text-sm transition rounded-lg mx-0 ${
                      active
                        ? "bg-neutral-100 font-semibold text-neutral-900"
                        : `text-neutral-600 ${cfg.hoverBg}`
                    }`}
                  >
                    <span className="text-base w-6 text-center">{cfg.icon}</span>
                    <span>{cfg.title}</span>
                    {active && (
                      <span className="ml-auto text-[10px] text-neutral-400">●</span>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* RIGHT — User info + actions + logout */}
        <div className="flex items-center gap-3">
          <div className="text-right hidden sm:block">
            <div className="text-sm font-medium text-neutral-800 leading-tight">{username}</div>
            {role && (
              <div className="text-[11px] text-neutral-400 uppercase tracking-wider leading-tight">{role}</div>
            )}
          </div>
          <button
            onClick={() => navigate("/cambio-pin")}
            className="px-2.5 py-1.5 rounded-lg text-xs font-medium border border-neutral-300 text-neutral-600 hover:bg-amber-50 hover:border-amber-200 hover:text-amber-700 transition"
            title="Cambia PIN"
          >
            🔑
          </button>
          <button
            onClick={onLogout}
            className="px-3 py-1.5 rounded-lg text-xs font-medium border border-neutral-300 text-neutral-600 hover:bg-red-50 hover:border-red-200 hover:text-red-700 transition"
          >
            Logout
          </button>
        </div>

      </div>
    </header>
  );
}
