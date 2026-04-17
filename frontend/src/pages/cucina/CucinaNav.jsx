// CucinaNav (responsive — P2-BIS sessione 44)
// - Mobile (<sm): bottom-tab bar iOS-style + optional top-title bar.
// - sm+: top-nav orizzontale (come nella versione MVP).
//
// Il componente expose `<CucinaNav current="..." />` identico al vecchio
// contract: current ∈ home | agenda | settimana | tasks | templates.
//
// Path: il file vive in pages/cucina/ per backward-compat con 7 pagine
// che lo importano da "./CucinaNav". La spec parlava di components/cucina,
// ma il beneficio dello spostamento e' zero (e la surface di rottura alta).

import React, { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { VersionBadge } from "../../config/versions";

// Voci "pane" navigazione top (sm+)
const ITEMS_TOP = [
  { key: "home",      label: "Home",      to: "/cucina",                   icon: "🍳" },
  { key: "agenda",    label: "Agenda",    to: "/cucina/agenda",            icon: "📋" },
  { key: "settimana", label: "Settimana", to: "/cucina/agenda/settimana",  icon: "🗓️" },
  { key: "tasks",     label: "Task",      to: "/cucina/tasks",             icon: "✅" },
  { key: "templates", label: "Template",  to: "/cucina/templates",         icon: "🧩", adminOnly: true },
];

// Tab bar mobile (<sm) — 4 slot max iOS-style
const TABS_MOBILE = [
  { key: "agenda",    label: "Oggi",      to: "/cucina/agenda",           icon: "🍳" },
  { key: "settimana", label: "Settimana", to: "/cucina/agenda/settimana", icon: "📅" },
  { key: "tasks",     label: "Task",      to: "/cucina/tasks",            icon: "✅" },
  { key: "menu",      label: "Menu",      to: null,                       icon: "⋯" }, // apre sheet
];

function isAdminLike(role) {
  return role === "admin" || role === "superadmin" || role === "chef";
}

export default function CucinaNav({ current = "home" }) {
  const navigate = useNavigate();
  const location = useLocation();
  const role = typeof localStorage !== "undefined" ? localStorage.getItem("role") || "" : "";
  const admin = isAdminLike(role);

  const items = ITEMS_TOP.filter(i => !i.adminOnly || admin);
  const [menuOpen, setMenuOpen] = useState(false);

  // Auto-detect current tab per la bottom-bar (ignora la prop "current"
  // che su mobile mappa 1:1 con pathname)
  const active = autoActive(location.pathname, current);

  return (
    <>
      {/* ================= TOP BAR (sm+) ================= */}
      <div className="hidden sm:block bg-white border-b border-red-200 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-2 flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <button
              onClick={() => navigate("/")}
              className="text-neutral-400 hover:text-neutral-700 text-xl min-w-[44px] min-h-[44px] flex items-center justify-center"
              title="Torna alla Home principale"
              type="button"
            >
              ←
            </button>
            <Link to="/cucina" className="flex items-center gap-2">
              <span className="text-2xl">🍳</span>
              <span className="font-playfair font-bold text-lg text-brand-red">Cucina</span>
              <VersionBadge modulo="cucina" />
            </Link>
          </div>
          <nav className="flex gap-1 flex-wrap">
            {items.map(i => {
              const isActive = i.key === current;
              return (
                <Link
                  key={i.key}
                  to={i.to}
                  className={
                    "px-3 py-2 rounded-lg text-sm font-medium transition min-h-[44px] flex items-center gap-1.5 " +
                    (isActive
                      ? "bg-red-100 text-brand-red border border-red-300"
                      : "text-neutral-700 hover:bg-red-50 border border-transparent")
                  }
                >
                  <span>{i.icon}</span>
                  <span>{i.label}</span>
                </Link>
              );
            })}
          </nav>
        </div>
      </div>

      {/* Safe-area top spacer su mobile: evita che il primo header sticky
          di pagina finisca sotto la notch/dynamic-island */}
      <div
        className="sm:hidden bg-brand-cream"
        style={{ height: "env(safe-area-inset-top)" }}
        aria-hidden="true"
      />

      {/* ================= BOTTOM TAB BAR (<sm) ================= */}
      <nav
        className="sm:hidden fixed left-0 right-0 bottom-0 z-30 border-t border-[#e6e1d8]"
        style={{
          background: "rgba(244,241,236,.96)",
          backdropFilter: "saturate(1.2) blur(12px)",
          WebkitBackdropFilter: "saturate(1.2) blur(12px)",
          paddingBottom: "calc(6px + env(safe-area-inset-bottom))",
          paddingTop: 6,
        }}
        role="tablist"
        aria-label="Navigazione cucina"
      >
        <div className="max-w-lg mx-auto flex">
          {TABS_MOBILE.map(t => {
            const isActive = t.key === active;
            const common =
              "flex-1 min-h-[49px] flex flex-col items-center justify-center gap-0.5 " +
              "text-[10px] font-semibold transition-colors";
            const colorCls = isActive ? "text-brand-red" : "text-neutral-500";
            if (t.key === "menu") {
              return (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => setMenuOpen(true)}
                  className={`${common} ${colorCls}`}
                  role="tab"
                  aria-selected={isActive}
                >
                  <span className="text-xl leading-none">{t.icon}</span>
                  <span>{t.label}</span>
                </button>
              );
            }
            return (
              <Link
                key={t.key}
                to={t.to}
                className={`${common} ${colorCls}`}
                role="tab"
                aria-selected={isActive}
              >
                <span className="text-xl leading-none">{t.icon}</span>
                <span>{t.label}</span>
              </Link>
            );
          })}
        </div>
      </nav>

      {/* ================= MENU SHEET (mobile) ================= */}
      {menuOpen && (
        <MenuSheet
          admin={admin}
          onClose={() => setMenuOpen(false)}
          onNavigate={(to) => { setMenuOpen(false); navigate(to); }}
        />
      )}
    </>
  );
}

function autoActive(pathname, fallback) {
  if (pathname.startsWith("/cucina/tasks"))                return "tasks";
  if (pathname.startsWith("/cucina/agenda/settimana"))     return "settimana";
  if (pathname.startsWith("/cucina/agenda"))               return "agenda";
  if (pathname.startsWith("/cucina/instances"))            return "agenda";
  if (pathname.startsWith("/cucina/templates"))            return "menu";
  if (pathname === "/cucina")                              return fallback === "home" ? null : fallback;
  return fallback;
}

// ── Menu sheet (mobile) — Template + Home ────────────────────────

function MenuSheet({ admin, onClose, onNavigate }) {
  return (
    <div
      className="sm:hidden fixed inset-0 z-[80] flex items-end"
      style={{ background: "rgba(17,17,17,.42)" }}
      onClick={onClose}
    >
      <div
        className="w-full bg-brand-cream rounded-t-[22px] border-t border-[#e6e1d8] shadow-2xl"
        style={{
          paddingBottom: "calc(22px + env(safe-area-inset-bottom))",
          paddingTop: 10,
          animation: "trgb-sheet-up .25s ease",
        }}
        onClick={e => e.stopPropagation()}
      >
        <div className="flex justify-center py-2">
          <div className="w-11 h-1.5 rounded-full bg-[#c8c3b8]" />
        </div>
        <div className="px-5 pt-2 pb-1 font-playfair font-bold text-[22px] text-brand-ink">
          Altri
        </div>
        <div className="px-4 pt-3 flex flex-col gap-2">
          <MenuItem icon="🍳" label="Home Cucina" onClick={() => onNavigate("/cucina")} />
          {admin && (
            <MenuItem icon="🧩" label="Template checklist" onClick={() => onNavigate("/cucina/templates")} />
          )}
          <MenuItem icon="🏠" label="Home generale TRGB" onClick={() => onNavigate("/")} />
        </div>
        <div className="px-4 mt-4">
          <button
            onClick={onClose}
            className="w-full min-h-[48px] rounded-2xl bg-white border border-[#e6e1d8] font-semibold text-brand-ink hover:bg-[#EFEBE3]"
            type="button"
          >
            Chiudi
          </button>
        </div>
      </div>
      <style>{`@keyframes trgb-sheet-up { from { transform: translateY(20px); opacity: 0 } to { transform: translateY(0); opacity: 1 } }`}</style>
    </div>
  );
}

function MenuItem({ icon, label, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full min-h-[56px] px-4 rounded-2xl bg-white border border-[#e6e1d8] flex items-center gap-3 hover:bg-[#EFEBE3] text-left"
    >
      <span className="text-xl">{icon}</span>
      <span className="font-semibold text-brand-ink">{label}</span>
      <span className="ml-auto text-neutral-400">›</span>
    </button>
  );
}
