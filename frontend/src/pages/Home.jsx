// @version: v9.2 — Home v3.5: azioni rapide da DB (useHomeActions) — sessione 49
import React, { useEffect, useState, useRef, useCallback } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { API_BASE, apiFetch } from "../config/api";
import MODULE_VERSIONS, { VersionBadge } from "../config/versions";
import MODULES_MENU from "../config/modulesMenu";
import DashboardSala from "./DashboardSala";
import TrgbLoader from "../components/TrgbLoader";
import useHomeWidgets from "../hooks/useHomeWidgets";
import useComunicazioni from "../hooks/useComunicazioni";
import useHomeActions from "../hooks/useHomeActions";
import SelezioniCard from "../components/widgets/SelezioniCard";
import underlineStudioMark from "../assets/brand/underline-studio-mark.svg";

/* ── Fallback subtitle per moduli (usati quando il backend non ha ancora dati) ── */
const MODULE_FALLBACK = {
  vini:                { sub1: "Carta, cantina, vendite, dashboard", sub2: "" },
  acquisti:            { sub1: "Fatture XML, fornitori, dashboard", sub2: "" },
  vendite:             { sub1: "Corrispettivi, chiusure cassa, dashboard", sub2: "" },
  ricette:             { sub1: "Archivio, ingredienti, matching, dashboard", sub2: "" },
  selezioni:           { sub1: "Macellaio, pescato, salumi, formaggi", sub2: "" },
  "flussi-cassa":      { sub1: "CC, carta, contanti, mance", sub2: "" },
  "controllo-gestione":{ sub1: "Dashboard P&L, scadenzario, confronto", sub2: "" },
  statistiche:         { sub1: "Cucina, coperti, trend, grafici", sub2: "" },
  prenotazioni:        { sub1: "Planning, mappa tavoli, settimana", sub2: "" },
  clienti:             { sub1: "Anagrafica, CRM, dashboard", sub2: "" },
  dipendenti:          { sub1: "Buste paga, turni, scadenze", sub2: "" },
  impostazioni:        { sub1: "Utenti, moduli, backup", sub2: "" },
};

/* Azioni rapide: caricate via useHomeActions() dal DB (sessione 49).
 * Se la route base del DB e' "/prenotazioni", in UI la espandiamo a
 * /prenotazioni/planning/YYYY-MM-DD cosi' admin va dritto al planning di oggi
 * (stesso comportamento prima della migrazione a DB). */
function resolveRoute(baseRoute) {
  if (baseRoute === "/prenotazioni") {
    return "/prenotazioni/planning/" + new Date().toISOString().slice(0, 10);
  }
  return baseRoute;
}

/* Gobbette SVG mini */
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

/* ── Helpers ── */
function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return "Buongiorno";
  if (h < 18) return "Buon pomeriggio";
  return "Buonasera";
}

function getTurno() {
  const h = new Date().getHours();
  if (h < 15) return { label: "Pranzo", emoji: "☀️" };
  return { label: "Cena", emoji: "🌙" };
}

function formatDate() {
  const d = new Date();
  const giorni = ["Domenica","Lunedì","Martedì","Mercoledì","Giovedì","Venerdì","Sabato"];
  const mesi = ["gennaio","febbraio","marzo","aprile","maggio","giugno","luglio","agosto","settembre","ottobre","novembre","dicembre"];
  return `${giorni[d.getDay()]} ${d.getDate()} ${mesi[d.getMonth()]}`;
}

function formatComDate(isoStr) {
  if (!isoStr) return "";
  const d = new Date(isoStr);
  const now = new Date();
  const diffDays = Math.floor((now - d) / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return `Oggi ${d.getHours().toString().padStart(2,"0")}:${d.getMinutes().toString().padStart(2,"0")}`;
  if (diffDays === 1) return "Ieri";
  if (diffDays < 7) return `${diffDays}gg fa`;
  return d.toLocaleDateString("it-IT", { day: "numeric", month: "short" });
}

function dotColor(stato) {
  if (["RECORDED", "ARRIVED", "SEATED"].includes(stato)) return "#2EB872";
  if (["BILL", "LEFT"].includes(stato)) return "#a8a49e";
  return "#D4A017";
}

const URGENZA_STYLE = {
  urgente:    "bg-red-50 text-red-700 border-red-200",
  importante: "bg-orange-50 text-orange-700 border-orange-200",
  normale:    "bg-indigo-50 text-indigo-700 border-indigo-200",
};
const URGENZA_LABEL = { urgente: "Urgente", importante: "Importante", normale: "Info" };


/* ============================================================
   HOME COMPONENT
   ============================================================ */
export default function Home() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const role = localStorage.getItem("role");
  const displayName = localStorage.getItem("display_name") || localStorage.getItem("username") || "";

  // TUTTI gli hook SOPRA l'early return (regola degli hooks: stesso numero a ogni render).
  // Se un sala naviga a /?full=1, lo stesso componente Home viene ri-renderizzato
  // senza l'early return → se gli hook fossero sotto, React #310.
  const [modules, setModules] = useState([]);
  const [modulesLoading, setModulesLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [turnoTab, setTurnoTab] = useState("pranzo");
  const { data: widgets, loading: widgetsLoading } = useHomeWidgets();
  const { comunicazioni, loading: comLoading, nonLette, segnaLetta } = useComunicazioni();
  // Azioni rapide configurate in Impostazioni (con fallback statico se BE down)
  const { actions: homeActions } = useHomeActions();

  // Sala → dashboard dedicata (dopo gli hook)
  const isSalaDashboard = role === "sala" && !searchParams.get("full");

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

  // "selezioni" non ha piu' tile a se' in Home: vive sotto "Gestione Cucina" (sub di ricette)
  // Il widget SelezioniCard a pagina 1 resta (e' un widget di servizio, non un tile modulo).
  const visibleModules = modules
    .filter((m) => m.key !== "selezioni")
    .filter((m) =>
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

  // Sala senza ?full=1 → dashboard dedicata. Gli hook sopra sono TUTTI stati chiamati
  // anche in questo ramo, quindi quando l'utente clicca "Mostra tutti i moduli"
  // (→ /?full=1) il re-render non cambia il numero di hook (no React #310).
  if (isSalaDashboard) {
    return <DashboardSala />;
  }

  const loading = modulesLoading || widgetsLoading;
  const turno = getTurno();

  // Prenotazioni per turno
  const allPren = widgets?.prenotazioni?.lista || [];
  const prenPranzo = allPren.filter((r) => r.turno === "pranzo");
  const prenCena = allPren.filter((r) => r.turno === "cena");
  const prenVisible = turnoTab === "pranzo" ? prenPranzo : prenCena;
  const paxPranzo = widgets?.prenotazioni?.pranzo_pax || 0;
  const paxCena = widgets?.prenotazioni?.cena_pax || 0;

  return (
    <div className="bg-brand-cream flex flex-col lg:overflow-hidden min-h-[calc(100dvh-56px)] lg:h-[calc(100dvh-56px)]">

      {/* ── Header bar + Dot indicator ── */}
      <div className="flex-shrink-0 px-5 lg:px-8 pt-3 pb-1">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="font-playfair text-2xl lg:text-[28px] font-bold text-brand-ink tracking-tight leading-tight">
              {getGreeting()}, {displayName.split(" ")[0] || "Marco"}
            </h1>
            <p className="text-xs text-[#a8a49e] font-medium mt-1">
              {formatDate()}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 bg-white border border-[#e5e2dd] rounded-[10px] px-3 py-1.5">
              <div className="w-2 h-2 rounded-full bg-emerald-500" />
              <span className="text-xs font-semibold text-brand-ink">
                {turno.emoji} {turno.label}
              </span>
            </div>
          </div>
        </div>
        {/* Dot indicator */}
        <div className="flex justify-center gap-2 mt-2.5 pb-1">
          {[0, 1].map((i) => (
            <button
              key={i}
              onClick={() => setPage(i)}
              className={`h-[7px] rounded-full transition-all duration-300 ${
                page === i ? "w-6 bg-brand-ink" : "w-[7px] bg-[#d4d0ca]"
              }`}
              aria-label={i === 0 ? "Dashboard" : "Moduli"}
            />
          ))}
        </div>
      </div>

      {/* ── Swipe container ── */}
      {loading ? (
        <div className="flex-1 flex items-center justify-center">
          <TrgbLoader size={56} label="Caricamento…" />
        </div>
      ) : (
        <div
          ref={containerRef}
          className="flex-1 overflow-x-hidden lg:overflow-hidden min-h-0"
          onTouchStart={onTouchStart}
          onTouchEnd={onTouchEnd}
        >
          <div
            className="flex lg:h-full transition-transform duration-400 ease-[cubic-bezier(.25,.1,.25,1)]"
            style={{ transform: `translateX(-${page * 100}%)` }}
          >

            {/* ════════ PAGINA 1: COMMAND CENTER 3 COLONNE ════════ */}
            <div className="w-full flex-shrink-0 lg:min-h-0 px-5 lg:px-8 pb-4">
              <div className="lg:h-full grid grid-cols-1 lg:grid-cols-[1.3fr_1fr_.7fr] gap-3.5">

                {/* ═══ COL 1: Prenotazioni + Mini stats ═══ */}
                <div className="flex flex-col gap-3.5 lg:min-h-0">
                  {/* Prenotazioni */}
                  <div className="bg-white rounded-[14px] shadow-[0_2px_10px_rgba(0,0,0,.06)] flex flex-col overflow-hidden max-h-[360px] lg:max-h-none lg:flex-1 lg:min-h-0">
                    <div className="flex items-center justify-between px-4 pt-3.5 pb-2">
                      <span className="text-[10px] font-bold uppercase tracking-[1.2px] text-[#a8a49e]">
                        📅 Prenotazioni oggi
                      </span>
                      <div className="flex items-baseline gap-1">
                        <span className="text-xl font-extrabold text-brand-ink leading-none">
                          {widgets?.prenotazioni?.totale_pax || 0}
                        </span>
                        <span className="text-[10px] text-[#a8a49e] font-medium">pax</span>
                      </div>
                    </div>
                    {/* Turno tabs */}
                    <div className="flex border-b border-[#f0ede8]">
                      <button
                        onClick={() => setTurnoTab("pranzo")}
                        className={`flex-1 text-center py-2 text-[11px] font-semibold transition ${
                          turnoTab === "pranzo" ? "text-brand-ink border-b-2 border-brand-ink font-bold" : "text-[#a8a49e]"
                        }`}
                      >
                        ☀️ Pranzo · {paxPranzo} pax
                      </button>
                      <button
                        onClick={() => setTurnoTab("cena")}
                        className={`flex-1 text-center py-2 text-[11px] font-semibold transition ${
                          turnoTab === "cena" ? "text-brand-ink border-b-2 border-brand-ink font-bold" : "text-[#a8a49e]"
                        }`}
                      >
                        🌙 Cena · {paxCena} pax
                      </button>
                    </div>
                    {/* Lista */}
                    <div className="flex-1 overflow-y-auto">
                      {prenVisible.length > 0 ? (
                        prenVisible.map((r, i) => (
                          <div key={i} className={`flex items-center gap-2.5 px-4 py-2.5 ${i < prenVisible.length - 1 ? "border-b border-[#f8f6f2]" : ""}`}>
                            <span className="text-[11px] font-semibold text-[#a8a49e] w-10 flex-shrink-0 tabular-nums">{r.ora?.slice(0, 5)}</span>
                            <div className="flex-1 min-w-0">
                              <div className="text-[13px] font-semibold text-brand-ink leading-tight truncate">{r.nome}</div>
                              {r.nota && <div className="text-[11px] text-[#a8a49e] mt-0.5 truncate">{r.nota}</div>}
                            </div>
                            <span className="text-[13px] font-bold text-brand-ink w-6 text-right">{r.pax}</span>
                            <div className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: dotColor(r.stato) }} />
                          </div>
                        ))
                      ) : (
                        <div className="px-4 py-8 text-center text-[13px] text-[#a8a49e]">
                          Nessuna prenotazione per {turnoTab === "pranzo" ? "pranzo" : "cena"}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Mini stats */}
                  <div className="grid grid-cols-2 gap-3.5 flex-shrink-0">
                    <div className="bg-white rounded-[14px] shadow-[0_2px_10px_rgba(0,0,0,.06)] border border-indigo-200 p-4">
                      <div className="text-[9px] font-bold uppercase tracking-wider text-[#a8a49e] mb-2">💵 Incasso ieri</div>
                      <div className="text-2xl font-extrabold text-brand-ink leading-none tracking-tight">
                        € {(widgets?.incasso_ieri?.totale || 0).toLocaleString("it-IT", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                      </div>
                      {widgets?.incasso_ieri?.delta_pct != null && (
                        <div className={`text-[11px] font-semibold mt-1.5 ${widgets.incasso_ieri.delta_pct >= 0 ? "text-[#2EB872]" : "text-brand-red"}`}>
                          {widgets.incasso_ieri.delta_pct >= 0 ? "↑" : "↓"} {Math.abs(widgets.incasso_ieri.delta_pct)}%
                        </div>
                      )}
                    </div>
                    <div className="bg-white rounded-[14px] shadow-[0_2px_10px_rgba(0,0,0,.06)] border border-rose-200 p-4">
                      <div className="text-[9px] font-bold uppercase tracking-wider text-[#a8a49e] mb-2">
                        📈 Coperti {new Date().toLocaleString("it-IT", { month: "short" })}
                      </div>
                      <div className="text-2xl font-extrabold text-brand-ink leading-none tracking-tight">
                        {widgets?.coperti_mese?.totale || 0}
                      </div>
                      {widgets?.coperti_mese?.anno_precedente > 0 && (
                        <div className="text-[11px] font-semibold text-[#2E7BE8] mt-1.5">
                          vs {widgets.coperti_mese.anno_precedente} prec.
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* ═══ COL 2: Alert + Bacheca ═══ */}
                <div className="flex flex-col gap-3.5 lg:min-h-0">
                  {/* Alert */}
                  {widgets?.alerts?.length > 0 && (
                    <div className="bg-white rounded-[14px] shadow-[0_2px_10px_rgba(0,0,0,.06)] border border-red-200 flex-shrink-0">
                      <div className="flex items-center justify-between px-4 pt-3.5 pb-2">
                        <span className="text-[10px] font-bold uppercase tracking-[1.2px] text-[#a8a49e]">⚠️ Attenzione</span>
                        <span className="text-[10px] font-bold text-white rounded-full text-center"
                          style={{ background: "#E8402B", padding: "2px 7px", minWidth: 20 }}>
                          {widgets.alerts.length}
                        </span>
                      </div>
                      <div className="px-1 pb-2">
                        {widgets.alerts.map((a, i) => {
                          const menuEntry = MODULES_MENU[a.modulo];
                          return (
                            <div key={i} className="flex items-center gap-2.5 px-3 py-2 cursor-pointer hover:bg-brand-cream rounded-lg transition">
                              <span className="text-base flex-shrink-0">{menuEntry?.icon || "⚠️"}</span>
                              <span className="text-[12px] text-brand-ink flex-1 font-medium">{a.testo}</span>
                              <ChevronRight />
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Widget Selezioni del Giorno — 4 mini-blocchi (macellaio/pescato/salumi/formaggi) */}
                  <SelezioniCard data={widgets?.selezioni} />

                  {/* Bacheca comunicazioni */}
                  <div className="bg-white rounded-[14px] shadow-[0_2px_10px_rgba(0,0,0,.06)] flex flex-col overflow-hidden max-h-[420px] lg:max-h-none lg:flex-1 lg:min-h-0">
                    <div className="flex items-center justify-between px-4 pt-4 pb-2.5 border-b border-[#f0ede8]">
                      <span className="text-[12px] font-bold uppercase tracking-[1px] text-[#a8a49e]">📋 Bacheca</span>
                      {nonLette > 0 && (
                        <span className="text-[10px] font-bold text-white rounded-full text-center"
                          style={{ background: "#E8402B", padding: "2px 7px", minWidth: 20 }}>
                          {nonLette}
                        </span>
                      )}
                    </div>
                    <div className="flex-1 overflow-y-auto">
                      {comunicazioni.length > 0 ? (
                        comunicazioni.map((c) => (
                          <div
                            key={c.id}
                            className={`px-4 py-4 border-b border-[#f0ede8] cursor-pointer transition ${c.letta ? "opacity-50" : ""}`}
                            onClick={() => { if (!c.letta) segnaLetta(c.id); }}
                          >
                            <div className="flex items-center gap-2.5 mb-1.5">
                              <span className={`text-[11px] font-bold uppercase tracking-[.6px] px-2 py-1 rounded-md border ${URGENZA_STYLE[c.urgenza] || URGENZA_STYLE.normale}`}>
                                {URGENZA_LABEL[c.urgenza] || "Info"}
                              </span>
                              {!c.letta && <div className="w-2 h-2 rounded-full bg-brand-blue flex-shrink-0" />}
                            </div>
                            <div className="text-[15px] font-bold text-brand-ink leading-snug">{c.titolo}</div>
                            {c.messaggio && <div className="text-[14px] text-[#555] mt-1 leading-relaxed line-clamp-3">{c.messaggio}</div>}
                            <div className="text-[12px] text-[#a8a49e] mt-2">
                              {formatComDate(c.created_at)}{c.autore ? ` — ${c.autore}` : ""}
                            </div>
                          </div>
                        ))
                      ) : (
                        <div className="px-4 py-8 text-center text-[13px] text-[#a8a49e]">
                          Nessuna comunicazione
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* ═══ COL 3: Azioni rapide (config da Impostazioni → Home per ruolo) ═══ */}
                <div className="grid grid-cols-2 lg:flex lg:flex-col gap-2.5 lg:overflow-visible pb-2 lg:pb-0">
                  {homeActions.map((a) => (
                    <div
                      key={a.id ?? a.key}
                      onClick={() => navigate(resolveRoute(a.route))}
                      className={`rounded-[14px] border cursor-pointer active:scale-[.97] transition-transform flex items-center gap-3 px-4 py-3.5 ${a.color || ""}`}
                      style={{ boxShadow: "0 2px 10px rgba(0,0,0,.06)" }}
                    >
                      <span className="text-2xl leading-none">{a.emoji}</span>
                      <div className="min-w-0">
                        <div className="text-[14px] font-bold leading-tight truncate">{a.label}</div>
                        {a.sub && <div className="text-[11px] opacity-60 mt-0.5 hidden lg:block">{a.sub}</div>}
                      </div>
                    </div>
                  ))}
                  <div className="hidden lg:block lg:flex-1" />
                  <button
                    onClick={() => setPage(1)}
                    className="col-span-2 lg:col-span-1 text-[12px] text-[#a8a49e] text-center lg:mt-2 hover:text-brand-ink transition py-2"
                  >
                    Tutti i moduli →
                  </button>
                </div>
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
                              <div className="text-[15px] sm:text-base font-bold leading-tight">{menu.title}</div>
                              <div className="text-[12px] opacity-75 mt-0.5 truncate">{summary?.line1 || fb.sub1 || ""}</div>
                              <div className="text-[11px] opacity-60 truncate">{summary?.line2 || fb.sub2 || ""}</div>
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
                            <div className="text-[13px] sm:text-sm font-bold leading-tight">{menu.title}</div>
                            <div className="text-[11px] opacity-70 mt-1 leading-snug truncate">{summary?.line1 || fb.sub1 || ""}</div>
                            <div className="text-[11px] opacity-55 leading-snug truncate">{summary?.line2 || fb.sub2 || ""}</div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })()}

              {/* Footer versione + firma creator (sessione 60, 2026-04-29).
                  La firma "Marco Carminati — Underline Studio" e' branding del
                  CREATORE del prodotto TRGB, non del cliente Tre Gobbi. Visibile
                  a tutti i clienti che useranno TRGB in futuro (come "Designed
                  in California" sui prodotti Apple). Modulo: platform/UI primitives. */}
              <div className="mt-10 flex flex-col items-center gap-1.5">
                <GobbetteMini className="opacity-30" />
                <span className="text-[10px] text-brand-ink/30">
                  TRGB Gestionale v{MODULE_VERSIONS.sistema.version}
                </span>
                <a
                  href="https://underline-studio.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-1 flex items-center gap-1.5 text-[10px] text-brand-ink/25 hover:text-brand-ink/50 transition select-none"
                  aria-label="Designed and developed by Marco Carminati — Underline Studio"
                >
                  <span>Designed &amp; developed by</span>
                  <span className="font-medium">Marco Carminati</span>
                  <span className="opacity-50">·</span>
                  <img
                    src={underlineStudioMark}
                    alt="Underline Studio"
                    className="h-2.5 w-auto opacity-70"
                  />
                </a>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}


/* ── Componenti interni ── */

function ChevronRight() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#ccc" strokeWidth="2">
      <path strokeLinecap="round" d="M9 6l6 6-6 6" />
    </svg>
  );
}
