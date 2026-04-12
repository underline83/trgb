// @version: v8.0 — Home v3.3 Originale Potenziato: emoji + colori modulesMenu + dati dinamici + badge + hero + griglia responsive
import React, { useEffect, useState, useRef, useCallback } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { API_BASE, apiFetch } from "../config/api";
import MODULE_VERSIONS, { VersionBadge } from "../config/versions";
import MODULES_MENU from "../config/modulesMenu";
import DashboardSala from "./DashboardSala";
import TrgbLoader from "../components/TrgbLoader";
import useHomeWidgets from "../hooks/useHomeWidgets";

/* ── Fallback subtitle per moduli (usati quando il backend non ha ancora dati) ── */
const MODULE_FALLBACK = {
  vini:                { sub1: "Carta, cantina, vendite, dashboard", sub2: "" },
  acquisti:            { sub1: "Fatture XML, fornitori, dashboard", sub2: "" },
  vendite:             { sub1: "Corrispettivi, chiusure cassa, dashboard", sub2: "" },
  ricette:             { sub1: "Ricette, ingredienti, costi, matching", sub2: "" },
  "flussi-cassa":      { sub1: "CC, carta, contanti, mance", sub2: "" },
  "controllo-gestione":{ sub1: "Dashboard P&L, scadenzario, confronto", sub2: "" },
  statistiche:         { sub1: "Cucina, coperti, trend, grafici", sub2: "" },
  prenotazioni:        { sub1: "Planning, mappa tavoli, settimana", sub2: "" },
  clienti:             { sub1: "Anagrafica, CRM, dashboard", sub2: "" },
  dipendenti:          { sub1: "Buste paga, turni, scadenze", sub2: "" },
  impostazioni:        { sub1: "Utenti, moduli, backup", sub2: "" },
};

/* Azioni rapide (v2 — emoji + colori modulesMenu) */
const QUICK_ACTIONS = [
  { label: "Chiusura Turno",     go: "/vendite/fine-turno",      icon: "💵", color: "bg-indigo-50 border-indigo-200 text-indigo-900" },
  { label: "Nuova Prenotazione", go: "/prenotazioni/planning/" + new Date().toISOString().slice(0, 10), icon: "📅", color: "bg-indigo-50 border-indigo-200 text-indigo-900" },
  { label: "Cerca Vino",         go: "/vini/magazzino",           icon: "🍷", color: "bg-amber-50 border-amber-200 text-amber-900" },
  { label: "Food Cost",          go: "/ricette/archivio",         icon: "📘", color: "bg-orange-50 border-orange-200 text-orange-900" },
];

/* Gobbette SVG mini (header) */
function GobbetteMini({ className = "" }) {
  return (
    <svg viewBox="15 28 155 28" className={`h-4 w-auto ${className}`} aria-hidden="true">
      <g fill="none" strokeLinecap="round" strokeLinejoin="round" strokeWidth="5">
        <path d="M 20 50 Q 37 30 55 42" stroke="#E8402B" />
        <path d="M 75 50 Q 92 30 110 42" stroke="#2EB872" />
        <path d="M 130 50 Q 147 30 165 42" stroke="#2E7BE8" />
      </g>
    </svg>
  );
}

/* ── Saluto contestuale ── */
function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return "Buongiorno";
  if (h < 18) return "Buon pomeriggio";
  return "Buonasera";
}

/* ── Formatta data italiana ── */
function formatDate() {
  const d = new Date();
  const giorni = ["Domenica","Lunedì","Martedì","Mercoledì","Giovedì","Venerdì","Sabato"];
  const mesi = ["gennaio","febbraio","marzo","aprile","maggio","giugno","luglio","agosto","settembre","ottobre","novembre","dicembre"];
  return `${giorni[d.getDay()]} ${d.getDate()} ${mesi[d.getMonth()]}`;
}

/* ============================================================
   HOME COMPONENT
   ============================================================ */
export default function Home() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const role = localStorage.getItem("role");
  const displayName = localStorage.getItem("display_name") || localStorage.getItem("username") || "";

  // Sala → dashboard semplificata
  if (role === "sala" && !searchParams.get("full")) {
    return <DashboardSala />;
  }

  const [modules, setModules] = useState([]);
  const [modulesLoading, setModulesLoading] = useState(true);
  const [page, setPage] = useState(0);
  const { data: widgets, loading: widgetsLoading } = useHomeWidgets();

  // Fetch moduli visibili
  useEffect(() => {
    apiFetch(`${API_BASE}/settings/modules/`)
      .then((r) => r.json())
      .then(setModules)
      .catch(() => {
        setModules(Object.keys(MODULES_MENU).map((key) => ({ key, roles: ["superadmin", "admin", "chef", "sommelier", "sala", "viewer"] })));
      })
      .finally(() => setModulesLoading(false));
  }, []);

  const visibleModules = modules.filter((m) =>
    m.roles?.includes(role) || (role === "superadmin" && m.roles?.includes("admin"))
  );

  /* ── Swipe gesture ── */
  const touchStartX = useRef(0);
  const containerRef = useRef(null);

  const onTouchStart = useCallback((e) => {
    touchStartX.current = e.touches[0].clientX;
  }, []);

  const onTouchEnd = useCallback((e) => {
    const dx = e.changedTouches[0].clientX - touchStartX.current;
    if (Math.abs(dx) > 60) {
      if (dx < 0 && page === 0) setPage(1);
      if (dx > 0 && page === 1) setPage(0);
    }
  }, [page]);

  const loading = modulesLoading || widgetsLoading;

  return (
    <div className="min-h-[100dvh] bg-brand-cream flex flex-col">

      {/* ── Header bar ── */}
      <div className="flex items-center justify-between px-5 sm:px-8 py-3">
        <div className="flex items-center gap-2">
          <GobbetteMini />
          <span className="text-sm font-extrabold text-brand-ink tracking-wide">TRGB</span>
        </div>
        <div className="w-8 h-8 rounded-[10px] bg-[#e8e4de] flex items-center justify-center">
          <span className="text-xs font-bold text-[#a8a49e]">
            {displayName.charAt(0).toUpperCase() || "?"}
          </span>
        </div>
      </div>

      {/* ── Dot indicator ── */}
      <div className="flex justify-center gap-2 pb-2">
        {[0, 1].map((i) => (
          <button
            key={i}
            onClick={() => setPage(i)}
            className={`h-[7px] rounded-full transition-all duration-300 ${
              page === i ? "w-6 bg-brand-ink" : "w-[7px] bg-[#d4d0ca]"
            }`}
            aria-label={i === 0 ? "Widget" : "Moduli"}
          />
        ))}
      </div>

      {/* ── Swipe container ── */}
      {loading ? (
        <div className="flex-1 flex items-center justify-center">
          <TrgbLoader size={56} label="Caricamento…" />
        </div>
      ) : (
        <div
          ref={containerRef}
          className="flex-1 overflow-hidden"
          onTouchStart={onTouchStart}
          onTouchEnd={onTouchEnd}
        >
          <div
            className="flex h-full transition-transform duration-400 ease-[cubic-bezier(.25,.1,.25,1)]"
            style={{ transform: `translateX(-${page * 100}%)` }}
          >
            {/* ════════ PAGINA 1: WIDGET ════════ */}
            <div className="w-full flex-shrink-0 overflow-y-auto px-5 sm:px-8 pb-8">

              {/* Saluto */}
              <div className="mb-5 sm:mb-7">
                <h1 className="font-playfair text-2xl sm:text-3xl font-bold text-brand-ink tracking-tight leading-tight">
                  {getGreeting()}, {displayName.split(" ")[0] || "Marco"}
                </h1>
                <p className="text-xs text-[#a8a49e] font-medium mt-1">
                  {formatDate()}
                </p>
              </div>

              {/* Widget: Alert */}
              {widgets?.alerts?.length > 0 && (
                <WidgetCard label="Attenzione" right={<span className="text-sm font-bold text-brand-red">{widgets.alerts.length}</span>}>
                  {widgets.alerts.map((a, i) => {
                    const menuEntry = MODULES_MENU[a.modulo];
                    return (
                      <div
                        key={i}
                        className={`flex items-center gap-3 px-3.5 py-2.5 cursor-pointer ${
                          i < widgets.alerts.length - 1 ? "border-b border-brand-cream" : ""
                        }`}
                      >
                        <span className="text-lg flex-shrink-0">{menuEntry?.icon || "⚠️"}</span>
                        <span className="text-[13px] text-brand-ink flex-1 font-medium">{a.testo}</span>
                        <ChevronRight />
                      </div>
                    );
                  })}
                </WidgetCard>
              )}

              {/* Widget row: Prenotazioni + Stats */}
              <div className="grid grid-cols-1 lg:grid-cols-[1.5fr_.5fr] gap-3.5 sm:gap-4 mt-3.5 sm:mt-4">

                {/* Prenotazioni oggi */}
                <WidgetCard
                  className="border border-indigo-200"
                  label="📅 Prenotazioni oggi"
                  right={
                    <div className="flex items-baseline gap-1">
                      <span className="text-xl font-extrabold text-brand-ink leading-none">
                        {widgets?.prenotazioni?.totale_pax || 0}
                      </span>
                      <span className="text-[10px] text-[#a8a49e] font-medium">pax</span>
                    </div>
                  }
                >
                  {widgets?.prenotazioni?.lista?.length > 0 ? (
                    widgets.prenotazioni.lista.map((r, i) => (
                      <div
                        key={i}
                        className={`flex items-center gap-2.5 px-3.5 sm:px-4 py-2.5 ${
                          i < widgets.prenotazioni.lista.length - 1 ? "border-b border-[#f8f6f2]" : ""
                        }`}
                      >
                        <span className="text-[11px] font-semibold text-[#a8a49e] w-9 flex-shrink-0 tabular-nums">
                          {r.ora?.slice(0, 5)}
                        </span>
                        <div className="flex-1 min-w-0">
                          <div className="text-[13px] font-semibold text-brand-ink leading-tight truncate">{r.nome}</div>
                          {r.nota && <div className="text-[11px] text-[#a8a49e] mt-0.5 truncate">{r.nota}</div>}
                        </div>
                        <span className="text-[13px] font-bold text-brand-ink w-6 text-right">{r.pax}</span>
                        <div
                          className="w-1.5 h-1.5 rounded-full"
                          style={{ background: r.stato === "RECORDED" || r.stato === "ARRIVED" || r.stato === "SEATED" ? "#2EB872" : "#D4A017" }}
                        />
                      </div>
                    ))
                  ) : (
                    <div className="px-4 py-6 text-center text-[13px] text-[#a8a49e]">
                      Nessuna prenotazione per oggi
                    </div>
                  )}
                </WidgetCard>

                {/* Stats colonna */}
                <div className="flex flex-row lg:flex-col gap-3.5 sm:gap-4">
                  <WidgetCard className="flex-1 border border-indigo-200">
                    <div className="p-4">
                      <div className="text-[9px] font-bold uppercase tracking-wider text-[#a8a49e] mb-2">
                        💵 Incasso ieri
                      </div>
                      <div className="text-2xl sm:text-[28px] font-extrabold text-brand-ink leading-none tracking-tight">
                        {"\u20AC"} {(widgets?.incasso_ieri?.totale || 0).toLocaleString("it-IT", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                      </div>
                      {widgets?.incasso_ieri?.delta_pct != null && (
                        <div className={`text-[11px] font-semibold mt-1.5 ${widgets.incasso_ieri.delta_pct >= 0 ? "text-[#2EB872]" : "text-brand-red"}`}>
                          {widgets.incasso_ieri.delta_pct >= 0 ? "\u2191" : "\u2193"} {Math.abs(widgets.incasso_ieri.delta_pct)}%
                        </div>
                      )}
                    </div>
                  </WidgetCard>
                  <WidgetCard className="flex-1 border border-rose-200">
                    <div className="p-4">
                      <div className="text-[9px] font-bold uppercase tracking-wider text-[#a8a49e] mb-2">
                        📈 Coperti {new Date().toLocaleString("it-IT", { month: "short" })}
                      </div>
                      <div className="text-2xl sm:text-[28px] font-extrabold text-brand-ink leading-none tracking-tight">
                        {widgets?.coperti_mese?.totale || 0}
                      </div>
                      {widgets?.coperti_mese?.anno_precedente > 0 && (
                        <div className="text-[11px] font-semibold text-[#2E7BE8] mt-1.5">
                          vs {widgets.coperti_mese.anno_precedente} prec.
                        </div>
                      )}
                    </div>
                  </WidgetCard>
                </div>
              </div>

              {/* Widget: Azioni rapide */}
              <div className="mt-3.5 sm:mt-4">
                <WidgetCard label="Azioni rapide">
                  <div className="grid grid-cols-2 gap-1.5 p-2">
                    {QUICK_ACTIONS.map((q) => (
                      <div
                        key={q.go}
                        onClick={() => navigate(q.go)}
                        className={`flex items-center gap-3 px-3 py-3 cursor-pointer rounded-[10px] border active:scale-[.98] transition ${q.color}`}
                      >
                        <span className="text-lg flex-shrink-0">{q.icon}</span>
                        <span className="text-[13px] font-semibold">{q.label}</span>
                      </div>
                    ))}
                  </div>
                </WidgetCard>
              </div>
            </div>

            {/* ════════ PAGINA 2: MODULI (Originale Potenziato) ════════ */}
            <div className="w-full flex-shrink-0 overflow-y-auto px-5 sm:px-8 pb-8">
              <div className="flex items-baseline justify-between mb-5 sm:mb-6">
                <h2 className="font-playfair text-[22px] sm:text-[26px] font-bold text-brand-ink tracking-tight">
                  Moduli
                </h2>
                <span className="text-[11px] text-[#a8a49e] font-medium">
                  {visibleModules.length} attivi
                </span>
              </div>

              {(() => {
                const heroKey = "prenotazioni";
                const heroModule = visibleModules.find((m) => m.key === heroKey);
                const restModules = visibleModules.filter((m) => m.key !== heroKey);

                return (
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-2.5 sm:gap-3">
                    {/* ── Hero: Prenotazioni (span 2 col) ── */}
                    {heroModule && (() => {
                      const menu = MODULES_MENU[heroModule.key];
                      if (!menu) return null;
                      const fb = MODULE_FALLBACK[heroModule.key] || {};
                      const summary = widgets?.moduli?.find((s) => s.key === heroModule.key);
                      const badge = summary?.badge || 0;

                      return (
                        <div
                          onClick={() => navigate(menu.go)}
                          className={`col-span-2 rounded-[14px] border cursor-pointer active:scale-[.98] transition-transform relative overflow-hidden ${menu.color}`}
                          style={{ boxShadow: "0 2px 10px rgba(0,0,0,.06)", padding: "16px 20px", minHeight: 80 }}
                        >
                          {badge > 0 && (
                            <span className="absolute top-3 right-3 text-[10px] font-bold text-white rounded-full text-center"
                              style={{ background: "#E8402B", padding: "2px 7px", minWidth: 20, boxShadow: "0 1px 3px rgba(232,64,43,.3)" }}>
                              {badge}
                            </span>
                          )}
                          <div className="flex items-center gap-3.5">
                            <span className="text-[32px] leading-none flex-shrink-0">{menu.icon}</span>
                            <div className="flex-1 min-w-0">
                              <div className="text-[15px] sm:text-base font-bold leading-tight">
                                {menu.title}
                              </div>
                              <div className="text-[12px] opacity-75 mt-0.5 truncate">
                                {summary?.line1 || fb.sub1 || ""}
                              </div>
                              <div className="text-[11px] opacity-60 truncate">
                                {summary?.line2 || fb.sub2 || ""}
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })()}

                    {/* ── Card moduli ── */}
                    {restModules.map((m) => {
                      const menu = MODULES_MENU[m.key];
                      if (!menu) return null;
                      const fb = MODULE_FALLBACK[m.key] || {};
                      const summary = widgets?.moduli?.find((s) => s.key === m.key);
                      const badge = summary?.badge || 0;

                      return (
                        <div
                          key={m.key}
                          onClick={() => navigate(menu.go)}
                          className={`rounded-[14px] border cursor-pointer active:scale-[.97] transition-transform relative overflow-hidden ${menu.color}`}
                          style={{ boxShadow: "0 2px 10px rgba(0,0,0,.06)", padding: 16, minHeight: 110 }}
                        >
                          {badge > 0 && (
                            <span className="absolute top-2.5 right-2.5 text-[10px] font-bold text-white rounded-full text-center"
                              style={{ background: "#E8402B", padding: "2px 7px", minWidth: 20, boxShadow: "0 1px 3px rgba(232,64,43,.3)" }}>
                              {badge}
                            </span>
                          )}
                          <span className="text-[28px] leading-none">{menu.icon}</span>
                          <div className="mt-2.5">
                            <div className="text-[13px] sm:text-sm font-bold leading-tight">
                              {menu.title}
                            </div>
                            <div className="text-[11px] opacity-70 mt-1 leading-snug truncate">
                              {summary?.line1 || fb.sub1 || ""}
                            </div>
                            <div className="text-[11px] opacity-55 leading-snug truncate">
                              {summary?.line2 || fb.sub2 || ""}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })()}

              {/* Footer versione */}
              <div className="mt-10 flex flex-col items-center gap-1.5">
                <GobbetteMini className="opacity-30" />
                <span className="text-[10px] text-brand-ink/30">
                  TRGB Gestionale v{MODULE_VERSIONS.sistema.version}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}


/* ── Componenti interni ── */

function WidgetCard({ label, right, className = "", children }) {
  return (
    <div className={`bg-white rounded-[14px] shadow-[0_1px_3px_rgba(0,0,0,.04)] ${className}`}>
      {label && (
        <div className="flex items-center justify-between px-4 pt-3.5 pb-2.5">
          <span className="text-[10px] font-bold uppercase tracking-[1.2px] text-[#a8a49e]">
            {label}
          </span>
          {right}
        </div>
      )}
      {children}
    </div>
  );
}

function ChevronRight() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#ccc" strokeWidth="2">
      <path strokeLinecap="round" d="M9 6l6 6-6 6" />
    </svg>
  );
}
