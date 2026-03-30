// FILE: frontend/src/components/Header.jsx
// @version: v3.1 — Dropdown navigazione moduli con sotto-menu
import React, { useState, useEffect, useRef } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { API_BASE, apiFetch } from "../config/api";
import MODULES_MENU from "../config/modulesMenu";

const isAdminRole = (r) => ["admin", "superadmin"].includes(r);
const isSuperAdmin = (r) => r === "superadmin";
const canSee = (check, role) => {
  if (!check) return true;
  if (check === "admin") return isAdminRole(role);
  if (check === "superadmin") return isSuperAdmin(role);
  return true;
};

export default function Header({ onLogout }) {
  const navigate = useNavigate();
  const location = useLocation();
  const username = localStorage.getItem("display_name") || localStorage.getItem("username") || "";
  const role = localStorage.getItem("role") || "";
  const isViewer = role === "viewer";

  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState(null); // key del modulo espanso
  const [modules, setModules] = useState(null);
  const dropRef = useRef(null);

  // Carica moduli visibili
  useEffect(() => {
    apiFetch(`${API_BASE}/settings/modules/`)
      .then(r => r.json())
      .then(setModules)
      .catch(() => {
        setModules(Object.keys(MODULES_MENU).map(key => ({ key, roles: ["superadmin", "admin", "chef", "sommelier", "sala", "viewer"] })));
      });
  }, []);

  // Click-outside
  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (dropRef.current && !dropRef.current.contains(e.target)) {
        setOpen(false);
        setExpanded(null);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  // Chiudi su navigazione
  useEffect(() => { setOpen(false); setExpanded(null); }, [location.pathname]);

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

  // Auto-espandi il modulo corrente quando si apre il dropdown
  const handleOpen = () => {
    if (open) {
      setOpen(false);
      setExpanded(null);
    } else {
      setOpen(true);
      setExpanded(currentModule ? currentModule[0] : null);
    }
  };

  const handleModuleClick = (key, cfg) => {
    if (expanded === key) {
      // Già espanso: vai al menu principale del modulo
      navigate(cfg.go);
    } else {
      // Espandi sotto-menu
      setExpanded(key);
    }
  };

  const handleSubClick = (path) => {
    navigate(path);
  };

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

        {/* LEFT — Logo + titolo/modulo corrente */}
        <div className="relative" ref={dropRef}>
          <button
            onClick={handleOpen}
            className="flex items-center gap-3 cursor-pointer group"
          >
            <img src="/logo_tregobbi.png" alt="Logo" className="h-8 w-auto object-contain" />
            <div className="hidden sm:flex items-center gap-1.5">
              {currentModule && (
                <span className="text-base mr-0.5">{currentModule[1].icon}</span>
              )}
              <span className="text-sm font-semibold text-neutral-700 tracking-wide group-hover:text-neutral-900 transition">
                {currentModule ? currentModule[1].title : "TRGB Gestionale"}
              </span>
              <svg
                className={`w-3.5 h-3.5 text-neutral-400 group-hover:text-neutral-600 transition-transform duration-200 ${open ? "rotate-180" : ""}`}
                fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
              </svg>
            </div>
          </button>

          {/* ── Dropdown ── */}
          {open && (
            <div className="absolute top-full left-0 mt-2 w-80 bg-white rounded-2xl shadow-2xl border border-neutral-200 py-2 z-[100] max-h-[calc(100vh-80px)] overflow-y-auto">
              {/* Home */}
              <button
                onClick={() => navigate("/")}
                className={`w-full flex items-center gap-3 px-4 py-2 text-left text-sm transition ${
                  isHome ? "bg-neutral-100 font-semibold text-neutral-900" : "text-neutral-600 hover:bg-neutral-50"
                }`}
              >
                <span className="text-base w-6 text-center">🏠</span>
                <span>Home</span>
              </button>

              <div className="border-t border-neutral-100 my-1" />

              {/* Moduli */}
              {visibleKeys.map(key => {
                const cfg = MODULES_MENU[key];
                const isActive = currentModule && currentModule[0] === key;
                const isExpanded = expanded === key;
                const visibleSubs = (cfg.sub || []).filter(s => canSee(s.check, role));

                return (
                  <div key={key}>
                    {/* Riga modulo */}
                    <button
                      onClick={() => handleModuleClick(key, cfg)}
                      className={`w-full flex items-center gap-3 px-4 py-2.5 text-left text-sm transition ${
                        isActive
                          ? `font-semibold text-neutral-900 ${cfg.hoverBg}`
                          : `text-neutral-700 ${cfg.hoverBg}`
                      }`}
                    >
                      <span className="text-base w-6 text-center">{cfg.icon}</span>
                      <span className="flex-1">{cfg.title}</span>
                      {visibleSubs.length > 0 && (
                        <svg
                          className={`w-3 h-3 text-neutral-400 transition-transform duration-200 ${isExpanded ? "rotate-90" : ""}`}
                          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                        </svg>
                      )}
                    </button>

                    {/* Sotto-menu (espandibile) */}
                    {isExpanded && visibleSubs.length > 0 && (
                      <div className="ml-9 mr-3 mb-1 border-l-2 border-neutral-200 pl-3 py-0.5">
                        {visibleSubs.map(s => {
                          const subActive = currentPath === s.go || currentPath.startsWith(s.go + "/");
                          return (
                            <button
                              key={s.go}
                              onClick={() => handleSubClick(s.go)}
                              className={`w-full text-left px-3 py-1.5 rounded-lg text-[13px] transition ${
                                subActive
                                  ? "bg-neutral-100 font-semibold text-neutral-900"
                                  : "text-neutral-500 hover:text-neutral-800 hover:bg-neutral-50"
                              }`}
                            >
                              {s.label}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* RIGHT — User info + logout */}
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
