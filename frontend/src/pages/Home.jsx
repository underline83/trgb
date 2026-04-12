// @version: v7.0 — Home v3.2 Magazine: card bianche + accent bar + icona tinta + dati dinamici, griglia responsive
import React, { useEffect, useState, useRef, useCallback } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { API_BASE, apiFetch } from "../config/api";
import MODULE_VERSIONS, { VersionBadge } from "../config/versions";
import MODULES_MENU from "../config/modulesMenu";
import MODULE_ICONS from "../components/icons";
import DashboardSala from "./DashboardSala";
import TrgbLoader from "../components/TrgbLoader";
import useHomeWidgets from "../hooks/useHomeWidgets";

/* ── Palette moduli Magazine: accent bar + icona tinta + fallback sub (Home v3.2) ── */
const MODULE_STYLE = {
  vini:                { accent: "#B8860B", tint: "#F5F0E6", sub1: "Carta dei Vini · Cantina", sub2: "Vendite · Dashboard" },
  acquisti:            { accent: "#6B4F7A", tint: "#EDE8F0", sub1: "Fatture · Fornitori", sub2: "Dashboard · Impostazioni" },
  vendite:             { accent: "#5A6B50", tint: "#EBF0E8", sub1: "Corrispettivi · Chiusura Turno", sub2: "Riepilogo · Dashboard" },
  ricette:             { accent: "#4A6A82", tint: "#E9EFF3", sub1: "Archivio · Ingredienti", sub2: "Matching · Food Cost" },
  "flussi-cassa":      { accent: "#2D8F7B", tint: "#E8EFEB", sub1: "CC · Carta · Contanti", sub2: "Mance · Riconciliazione" },
  "controllo-gestione":{ accent: "#4A5A68", tint: "#EAEAEA", sub1: "Dashboard P&L", sub2: "Scadenzario · Confronto" },
  statistiche:         { accent: "#888888", tint: "#EAEAEA", sub1: "Cucina · Coperti · Trend", sub2: "Dashboard e grafici" },
  prenotazioni:        { accent: "#8B5E3C", tint: "#F3EDE7", sub1: "Planning · Mappa Tavoli", sub2: "Settimana" },
  clienti:             { accent: "#4A5E82", tint: "#E8ECF3", sub1: "Anagrafica · CRM", sub2: "Dashboard" },
  dipendenti:          { accent: "#7A6352", tint: "#F0EAE4", sub1: "Buste Paga · Turni", sub2: "Scadenze" },
  impostazioni:        { accent: "#666666", tint: "#EAEAEA", sub1: "Utenti · Moduli", sub2: "Backup" },
};

/* Gobbetta accent colors cycle */
const GOB = ["#E8402B", "#2EB872", "#2E7BE8"];

/* Azioni rapide (v1 — fisse) */
const QUICK_ACTIONS = [
  { label: "Chiusura Turno",     go: "/vendite/fine-turno",      iconKey: "vendite",      accent: "#E8402B" },
  { label: "Nuova Prenotazione", go: "/prenotazioni/planning/" + new Date().toISOString().slice(0, 10), iconKey: "prenotazioni", accent: "#2E7BE8" },
  { label: "Cerca Vino",         go: "/vini/magazzino",           iconKey: "vini",         accent: "#2EB872" },
  { label: "Food Cost",          go: "/ricette/archivio",         iconKey: "ricette",      accent: "#C05621" },
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
                    const IconComp = MODULE_ICONS[a.modulo];
                    return (
                      <div
                        key={i}
                        className={`flex items-center gap-3 px-3.5 py-2.5 cursor-pointer ${
                          i < widgets.alerts.length - 1 ? "border-b border-brand-cream" : ""
                        }`}
                      >
                        <div
                          className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
                          style={{ background: (a.accent || "#999") + "0c", color: a.accent || "#999" }}
                        >
                          {IconComp ? <IconComp size={14} /> : null}
                        </div>
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
                  label="Prenotazioni oggi"
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
                  <WidgetCard className="flex-1">
                    <div className="p-4">
                      <div className="text-[9px] font-bold uppercase tracking-wider text-[#a8a49e] mb-2">
                        Incasso ieri
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
                  <WidgetCard className="flex-1">
                    <div className="p-4">
                      <div className="text-[9px] font-bold uppercase tracking-wider text-[#a8a49e] mb-2">
                        Coperti {new Date().toLocaleString("it-IT", { month: "short" })}
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
                  <div className="grid grid-cols-2 gap-1 p-2">
                    {QUICK_ACTIONS.map((q) => {
                      const IconComp = MODULE_ICONS[q.iconKey];
                      return (
                        <div
                          key={q.go}
                          onClick={() => navigate(q.go)}
                          className="flex items-center gap-3 px-3 py-3 cursor-pointer rounded-[10px] active:scale-[.98] transition"
                          style={{ background: q.accent + "05" }}
                        >
                          <div
                            className="w-8 h-8 rounded-[9px] flex items-center justify-center flex-shrink-0"
                            style={{ background: q.accent + "0e", color: q.accent }}
                          >
                            {IconComp ? <IconComp size={16} /> : null}
                          </div>
                          <span className="text-[13px] font-semibold text-brand-ink">{q.label}</span>
                        </div>
                      );
                    })}
                  </div>
                </WidgetCard>
              </div>
            </div>

            {/* ════════ PAGINA 2: MODULI (Magazine) ════════ */}
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
                // Separa "prenotazioni" come hero (se visibile)
                const heroKey = "prenotazioni";
                const heroModule = visibleModules.find((m) => m.key === heroKey);
                const restModules = visibleModules.filter((m) => m.key !== heroKey);

                return (
                  <>
                    {/* ── Hero: Prenotazioni (span 2 col) ── */}
                    {heroModule && (() => {
                      const menu = MODULES_MENU[heroModule.key];
                      const style = MODULE_STYLE[heroModule.key];
                      const IconComp = MODULE_ICONS[heroModule.key];
                      const summary = widgets?.moduli?.find((s) => s.key === heroModule.key);
                      const badge = summary?.badge || 0;
                      if (!menu || !style) return null;

                      return (
                        <div className="mb-3">
                          <div className="text-[10px] font-semibold uppercase tracking-[1.2px] text-[#a8a49e] mb-2.5 ml-1">
                            Oggi
                          </div>
                          <div
                            onClick={() => navigate(menu.go)}
                            className="bg-white rounded-[14px] cursor-pointer active:scale-[.98] transition-transform relative overflow-hidden"
                            style={{ boxShadow: "0 2px 8px rgba(0,0,0,.05)" }}
                          >
                            {/* Gobbette accent strip */}
                            <div
                              className="absolute top-0 left-0 right-0 h-[3px]"
                              style={{ background: "linear-gradient(90deg, #E8402B, #2EB872, #2E7BE8)" }}
                            />
                            <div className="flex items-center gap-3.5 px-5 py-4">
                              <div
                                className="w-12 h-12 rounded-[13px] flex items-center justify-center flex-shrink-0"
                                style={{ background: style.tint, color: style.accent }}
                              >
                                {IconComp ? <IconComp size={24} /> : null}
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="text-[15px] font-bold text-brand-ink leading-tight">
                                  {menu.title}
                                </div>
                                <div className="text-[12px] text-[#888] mt-0.5">
                                  {summary?.line1 || style.sub1 || ""}
                                </div>
                                <div className="text-[11px] text-[#aaa]">
                                  {summary?.line2 || style.sub2 || ""}
                                </div>
                              </div>
                              {badge > 0 && (
                                <span
                                  className="flex-shrink-0 text-[10px] font-bold text-white rounded-full text-center"
                                  style={{ background: "#E8402B", padding: "2px 7px", minWidth: 20 }}
                                >
                                  {badge}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })()}

                    {/* ── Griglia moduli: 3 col landscape, 2 col portrait ── */}
                    <div className="text-[10px] font-semibold uppercase tracking-[1.2px] text-[#a8a49e] mb-2.5 ml-1 mt-4">
                      Tutti i moduli
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-2.5">
                      {restModules.map((m) => {
                        const menu = MODULES_MENU[m.key];
                        const style = MODULE_STYLE[m.key];
                        if (!menu || !style) return null;
                        const IconComp = MODULE_ICONS[m.key];
                        const summary = widgets?.moduli?.find((s) => s.key === m.key);
                        const badge = summary?.badge || 0;

                        return (
                          <div
                            key={m.key}
                            onClick={() => navigate(menu.go)}
                            className="bg-white rounded-[14px] cursor-pointer active:scale-[.97] transition-transform relative overflow-hidden"
                            style={{ boxShadow: "0 2px 8px rgba(0,0,0,.05)", padding: 16 }}
                          >
                            {/* Accent bar top */}
                            <div
                              className="absolute top-0 left-0 right-0 h-[3px]"
                              style={{ background: style.accent }}
                            />
                            {/* Badge */}
                            {badge > 0 && (
                              <span
                                className="absolute top-3 right-3 text-[10px] font-bold text-white rounded-full text-center"
                                style={{ background: "#E8402B", padding: "2px 7px", minWidth: 20 }}
                              >
                                {badge}
                              </span>
                            )}
                            {/* Icon */}
                            <div
                              className="w-[38px] h-[38px] rounded-[11px] flex items-center justify-center"
                              style={{ background: style.tint, color: style.accent }}
                            >
                              {IconComp ? <IconComp size={20} /> : null}
                            </div>
                            {/* Text — nome completo, 2 righe dinamiche con fallback statico */}
                            <div className="mt-2.5">
                              <div className="text-[13px] font-bold text-brand-ink leading-tight">
                                {menu.title}
                              </div>
                              <div className="text-[11px] text-[#888] mt-1 leading-snug truncate">
                                {summary?.line1 || style.sub1 || ""}
                              </div>
                              <div className="text-[11px] text-[#aaa] leading-snug truncate">
                                {summary?.line2 || style.sub2 || ""}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </>
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
