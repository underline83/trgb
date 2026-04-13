// FILE: frontend/src/components/Header.jsx
// @version: v6.0 — dropdown M1: lista accordion sempre aperta + ricerca live
import React, { useState, useEffect, useRef } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import MODULES_MENU from "../config/modulesMenu";
import useModuleAccess from "../hooks/useModuleAccess";
import Tooltip from "./Tooltip";
import { canActivateSuperMode, toggleSuperMode, isSuperModeActive } from "../utils/authHelpers";
import TrgbWordmark from "./TrgbWordmark";
import useNotifiche from "../hooks/useNotifiche";
import NotifichePanel from "./NotifichePanel";

// Estrae il nome color Tailwind (es "amber") da una classe "bg-amber-50 border-amber-200 text-amber-900"
function getAccentColor(colorClass) {
  if (!colorClass) return "neutral";
  const m = colorClass.match(/bg-([a-z]+)-\d+/);
  return m ? m[1] : "neutral";
}

// Normalizza per ricerca case/accent-insensitive
function norm(s) {
  return (s || "").toString().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

export default function Header({ onLogout }) {
  const navigate = useNavigate();
  const location = useLocation();
  const username = localStorage.getItem("display_name") || localStorage.getItem("username") || "";
  const role = localStorage.getItem("role") || "";
  const isViewer = role === "viewer";

  const { visibleModules, canAccessSub, modules: modulesData } = useModuleAccess();

  const [open, setOpen] = useState(false);
  const [notificheOpen, setNotificheOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  // ── Notifiche (mattone M.A) ──
  const {
    totaleNonLette,
    notifiche: listaNotifiche,
    comunicazioni: listaComunicazioni,
    loading: notificheLoading,
    caricaTutto: caricaNotifiche,
    segnaLetta,
    segnaTutteLette,
    segnaComunicazioneLetta,
  } = useNotifiche();
  const dropRef = useRef(null);
  const searchInputRef = useRef(null);

  // Click-outside (mousedown per desktop, touchstart per touch)
  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (dropRef.current && !dropRef.current.contains(e.target)) {
        setOpen(false);
        setSearchQuery("");
      }
    };
    document.addEventListener("mousedown", handler);
    document.addEventListener("touchstart", handler);
    return () => {
      document.removeEventListener("mousedown", handler);
      document.removeEventListener("touchstart", handler);
    };
  }, [open]);

  // Autofocus su input ricerca all'apertura (desktop)
  useEffect(() => {
    if (open && searchInputRef.current) {
      // piccolo delay per evitare layout shift iniziale
      const t = setTimeout(() => {
        if (searchInputRef.current) searchInputRef.current.focus();
      }, 50);
      return () => clearTimeout(t);
    }
  }, [open]);

  // Escape = chiudi dropdown
  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (e.key === "Escape") {
        setOpen(false);
        setSearchQuery("");
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open]);

  // Chiudi su navigazione
  useEffect(() => { setOpen(false); setSearchQuery(""); }, [location.pathname, location.search]);

  // Filtra moduli visibili per ruolo (da useModuleAccess)
  const visibleKeys = visibleModules
    ? visibleModules.filter(k => MODULES_MENU[k])
    : Object.keys(MODULES_MENU);

  // Rileva modulo corrente dal path
  const currentPath = location.pathname;
  const currentModule = Object.entries(MODULES_MENU).find(([_, cfg]) =>
    currentPath === cfg.go || currentPath.startsWith(cfg.go + "/")
  );
  const isHome = currentPath === "/" || currentPath === "";

  const handleOpen = () => {
    setOpen(prev => {
      if (prev) { setSearchQuery(""); return false; }
      return true;
    });
  };

  const goTo = (path) => { navigate(path); };

  // ── Costruisci lista filtrata per dropdown M1 ──
  const q = norm(searchQuery.trim());
  const homeMatches = !q || "home".includes(q) || norm("Home").includes(q);

  const filteredGroups = visibleKeys
    .map(key => {
      const cfg = MODULES_MENU[key];
      const titleMatch = !q || norm(cfg.title).includes(q);
      // Filtra sub per permessi (canAccessSub)
      const accessibleSubs = (cfg.sub || []).filter(s => {
        const pathParts = s.go.replace(/\?.*$/, "").split("/").filter(Boolean);
        const subKey = pathParts.length > 1 ? pathParts[1] : null;
        return subKey ? canAccessSub(key, subKey) : true;
      });
      // Filtra sub per query
      const matchingSubs = !q ? accessibleSubs : accessibleSubs.filter(s => norm(s.label).includes(q));
      // Se il titolo matcha, mostra TUTTE le sub accessibili. Se no, solo quelle che matchano.
      const subsToShow = titleMatch ? accessibleSubs : matchingSubs;
      const hasAnything = titleMatch || matchingSubs.length > 0;
      return { key, cfg, subs: subsToShow, visible: hasAnything };
    })
    .filter(g => g.visible);

  const totalResults = (homeMatches ? 1 : 0) + filteredGroups.reduce((acc, g) => acc + 1 + g.subs.length, 0);
  const noResults = q && totalResults === 0;

  return (
    <header className="sticky top-0 z-50 bg-brand-cream border-b border-neutral-200 shadow-sm">
      {isViewer && (
        <div className="bg-amber-50 border-b border-amber-200 text-center py-1">
          <span className="text-xs text-amber-700 font-medium">
            Accesso in sola lettura — non puoi modificare o caricare dati
          </span>
        </div>
      )}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-2.5 grid grid-cols-3 items-center gap-4">

        {/* LEFT — Wordmark TRGB (link alla Home) */}
        <button
          onClick={() => goTo("/")}
          className="flex items-center cursor-pointer group justify-self-start"
          aria-label="Vai alla home"
        >
          <TrgbWordmark size="md" className="group-hover:opacity-80 transition-opacity" />
        </button>

        {/* CENTER — Pulsante menu moduli con modulo corrente */}
        <div className="relative justify-self-center" ref={dropRef}>
          <button
            onClick={handleOpen}
            className="flex items-center gap-1.5 cursor-pointer group px-3 py-1.5 rounded-lg hover:bg-white/60 transition"
          >
            {currentModule && (
              <span className="text-base mr-0.5">{currentModule[1].icon}</span>
            )}
            <span className="text-sm font-semibold text-brand-ink tracking-wide group-hover:text-brand-ink/80 transition">
              {currentModule ? currentModule[1].title : "Menu"}
            </span>
            <svg
              className={`w-3.5 h-3.5 text-neutral-400 group-hover:text-neutral-600 transition-transform duration-200 ${open ? "rotate-180" : ""}`}
              fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          {/* ── Dropdown + Flyout ── */}
          {open && (
            <div
              className="absolute top-full left-1/2 -translate-x-1/2 mt-2 z-[100]"
              style={{ display: "flex", alignItems: "flex-start" }}
            >
              {/* Colonna principale — lista moduli */}
              <div
                ref={listRef}
                className="w-64 bg-white rounded-2xl shadow-2xl border border-neutral-200 py-2 max-h-[calc(100dvh-80px)] overflow-y-auto relative"
                onMouseLeave={!isTouch ? handleContainerLeave : undefined}
              >
                {/* Home */}
                <button
                  onClick={() => goTo("/")}
                  onMouseEnter={() => { clearTimeout(leaveTimer.current); clearTimeout(intentTimer.current); setHovered(null); }}
                  className={`w-full flex items-center gap-3 px-4 py-2.5 text-left text-sm transition ${
                    isHome ? "bg-neutral-100 font-semibold text-neutral-900" : "text-neutral-600 hover:bg-neutral-50"
                  }`}
                >
                  <span className="text-base w-6 text-center">🏠</span>
                  <span>Home</span>
                </button>

                <div className="border-t border-neutral-100 my-1 mx-2" />

                {/* Moduli */}
                {visibleKeys.map(key => {
                  const cfg = MODULES_MENU[key];
                  const isActive = currentModule && currentModule[0] === key;
                  const isHov = hovered === key;
                  // Filtra sotto-menu: usa permessi granulari da modules.json
                  const visibleSubs = (cfg.sub || []).filter(s => {
                    // Estrai sub key dal path (es. "/flussi-cassa/mance" → "mance")
                    const pathParts = s.go.replace(/\?.*$/, "").split("/").filter(Boolean);
                    const subKey = pathParts.length > 1 ? pathParts[1] : null;
                    return subKey ? canAccessSub(key, subKey) : true;
                  });

                  const hasSubs = visibleSubs.length > 0;
                  const handleRowClick = () => {
                    // B.1 — Su touch: se il modulo ha sotto-voci, il primo tap apre il flyout,
                    // il secondo tap sullo stesso row naviga al path principale.
                    // Su desktop: comportamento storico (click naviga sempre).
                    if (isTouch && hasSubs) {
                      if (isHov) {
                        goTo(cfg.go);
                      } else {
                        activateHover(key);
                      }
                    } else {
                      goTo(cfg.go);
                    }
                  };

                  return (
                    <div
                      key={key}
                      ref={el => { rowRefs.current[key] = el; }}
                      onMouseEnter={!isTouch ? () => handleRowEnter(key) : undefined}
                      className="relative"
                    >
                      <button
                        onClick={handleRowClick}
                        className={`w-full flex items-center gap-3 px-4 py-2.5 text-left text-sm transition ${
                          isActive
                            ? `font-semibold text-neutral-900 ${cfg.hoverBg}`
                            : isHov
                              ? `text-neutral-900 ${cfg.hoverBg}`
                              : `text-neutral-700 hover:bg-neutral-50`
                        }`}
                      >
                        <span className="text-base w-6 text-center">{cfg.icon}</span>
                        <span className="flex-1">{cfg.title}</span>
                        {visibleSubs.length > 0 && (
                          <svg
                            className={`w-3 h-3 transition-colors ${isHov ? "text-neutral-600" : "text-neutral-300"}`}
                            fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}
                          >
                            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                          </svg>
                        )}
                      </button>
                    </div>
                  );
                })}
              </div>

              {/* Flyout sotto-menu — posizionato allineato alla riga */}
              {hovered && (() => {
                const cfg = MODULES_MENU[hovered];
                if (!cfg) return null;
                const visibleSubs = (cfg.sub || []).filter(s => {
                  const pathParts = s.go.replace(/\?.*$/, "").split("/").filter(Boolean);
                  const subKey = pathParts.length > 1 ? pathParts[1] : null;
                  return subKey ? canAccessSub(hovered, subKey) : true;
                });
                if (visibleSubs.length === 0) return null;

                return (
                  <div
                    className="absolute left-full"
                    style={{ top: flyoutTop, paddingLeft: 4 }}
                    onMouseEnter={!isTouch ? handleFlyoutEnter : undefined}
                    onMouseLeave={!isTouch ? handleContainerLeave : undefined}
                  >
                    {/* Ponte invisibile — safe zone tra colonna e flyout (solo desktop) */}
                    {!isTouch && (
                      <div
                        className="absolute"
                        style={{ left: -16, top: 0, width: 20, height: "100%" }}
                        onMouseEnter={handleFlyoutEnter}
                      />
                    )}

                    <div className="w-52 bg-white rounded-2xl shadow-2xl border border-neutral-200 py-2">
                      {/* Titoletto */}
                      <div className="px-4 py-1.5 text-[11px] font-semibold text-neutral-400 uppercase tracking-wider">
                        {cfg.title}
                      </div>
                      <div className="border-t border-neutral-100 mx-2 mb-1" />

                      {visibleSubs.map(s => {
                        const subActive = currentPath === s.go || currentPath.startsWith(s.go + "/")
                          || (s.go.includes("?") && location.pathname + location.search === s.go);
                        return (
                          <button
                            key={s.go}
                            onClick={() => goTo(s.go)}
                            className={`w-full text-left px-4 py-2 text-[13px] transition ${
                              subActive
                                ? "bg-neutral-100 font-semibold text-neutral-900"
                                : "text-neutral-600 hover:text-neutral-900 hover:bg-neutral-50"
                            }`}
                          >
                            {s.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })()}

            </div>
          )}
        </div>

        {/* RIGHT — User info + logout */}
        <div className="flex items-center gap-3 justify-self-end">
          <div className="text-right hidden sm:block select-none"
            onDoubleClick={(e) => {
              // Triplo click = doubleClick + click ravvicinato
              if (!canActivateSuperMode(role)) return;
              if (e.detail >= 2) {
                // Attendi un terzo click entro 400ms
                const handler = () => {
                  const newState = toggleSuperMode();
                  window.location.reload();
                };
                const el = e.currentTarget;
                const tripleHandler = (ev) => {
                  handler();
                  el.removeEventListener("click", tripleHandler);
                };
                el.addEventListener("click", tripleHandler);
                setTimeout(() => el.removeEventListener("click", tripleHandler), 400);
              }
            }}>
            <div className="text-sm font-medium text-neutral-800 leading-tight">
              {username}
              {canActivateSuperMode(role) && isSuperModeActive() && (
                <Tooltip label="Modalità gestione">
                  <span className="inline-block w-1.5 h-1.5 rounded-full bg-amber-400 ml-1.5 align-middle" />
                </Tooltip>
              )}
            </div>
            {role && (
              <div className="text-[11px] text-neutral-400 uppercase tracking-wider leading-tight">
                {role === "superadmin" ? "admin" : role}
              </div>
            )}
          </div>
          {/* ── Campanello notifiche (M.A) ── */}
          <div className="relative">
            <Tooltip label="Notifiche">
              <button
                onClick={() => {
                  if (!notificheOpen) caricaNotifiche();
                  setNotificheOpen(prev => !prev);
                }}
                className="px-2.5 py-1.5 rounded-lg text-xs font-medium border border-neutral-300 text-neutral-600 hover:bg-brand-blue/5 hover:border-brand-blue/30 hover:text-brand-blue transition relative"
              >
                🔔
                {totaleNonLette > 0 && (
                  <span className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] rounded-full bg-brand-red text-white text-[10px] font-bold flex items-center justify-center px-1 shadow-sm">
                    {totaleNonLette > 99 ? "99+" : totaleNonLette}
                  </span>
                )}
              </button>
            </Tooltip>
            {notificheOpen && (
              <NotifichePanel
                notifiche={listaNotifiche}
                comunicazioni={listaComunicazioni}
                loading={notificheLoading}
                onSegnaLetta={segnaLetta}
                onSegnaTutteLette={segnaTutteLette}
                onSegnaComunicazioneLetta={segnaComunicazioneLetta}
                onChiudi={() => setNotificheOpen(false)}
              />
            )}
          </div>

          <Tooltip label="Cambia PIN">
            <button
              onClick={() => navigate("/cambio-pin")}
              className="px-2.5 py-1.5 rounded-lg text-xs font-medium border border-neutral-300 text-neutral-600 hover:bg-amber-50 hover:border-amber-200 hover:text-amber-700 transition"
            >
              🔑
            </button>
          </Tooltip>
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
