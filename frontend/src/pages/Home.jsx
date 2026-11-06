// @version: v10.2 — ruolo sommelier → HomeSommelier (2026-11-05)
// v10.1 — Incasso/Coperti solo ad admin e capo sala (flag mostra_numeri_cassa) (2026-11-05)
// v10.0 — proposta B: card unica «Il turno» (prenotazioni + Lavagna + selezioni,
//   tab sul turno in corso), striscia in testa con azioni rapide e incasso/coperti,
//   a destra Preventivi in attesa e To-do; si ricarica da sola ogni 3 minuti (2026-11-04)
// v9.5 — widget «⏳ Preventivi in attesa» sotto le Selezioni; la pagina 1 scorre in verticale su iPad/desktop (2026-11-03)
// v9.4 — ruoli di cucina (chef, sous_chef, commis) → HomeCucina: turni, Lavagna, tasti;
//   niente incasso/coperti/prenotazioni, nemmeno con ?full=1 (2026-10-02)
// v9.3 — Home v3.6: widget Bacheca sostituito da La Lavagna
//   (briefing di servizio auto-composto + nota del turno + eventi).
//   La card Alert e' stata assorbita: gli alert scorrono nello strato eventi.
import React, { useEffect, useState, useRef, useCallback } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { API_BASE, apiFetch } from "../config/api";
import MODULE_VERSIONS, { VersionBadge } from "../config/versions";
import MODULES_MENU, { menuFor } from "../config/modulesMenu";
import DashboardSala from "./DashboardSala";
import HomeCucina from "./HomeCucina";
import HomeSommelier from "./HomeSommelier";
import TrgbLoader from "../components/TrgbLoader";
import useHomeWidgets from "../hooks/useHomeWidgets";
import useLavagna from "../hooks/useLavagna";
import useHomeActions from "../hooks/useHomeActions";
import TurnoCard from "../components/widgets/TurnoCard";
import AzioniRapideStrip from "../components/widgets/AzioniRapideStrip";
import { KpiIncasso, KpiCoperti } from "../components/widgets/KpiMini";
import TodoPersonale from "../components/widgets/TodoPersonale";
import PreventiviInAttesaCard from "../components/widgets/PreventiviInAttesaCard";
// R8c: filtra Home grid per moduli attivi del locale (feature flags).
import { useActiveModules } from "../utils/activeModules";

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
  pratiche:            { sub1: "Enti, fornitori, studi, creditori", sub2: "" },
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
  // Sala e cucina hanno la loro Home (sotto): lì si ricaricano da sole, qui no,
  // altrimenti ogni 3 minuti partirebbero due giri di chiamate.
  const homePropria = (["sala", "sommelier"].includes(role) && !searchParams.get("full")) || ["chef", "sous_chef", "commis"].includes(role);
  const { data: widgets, loading: widgetsLoading } = useHomeWidgets({ autoRefresh: !homePropria });
  const {
    lavagna,
    loading: lavagnaLoading,
    saving: lavagnaSaving,
    scriviNota,
    rimuoviNota,
  } = useLavagna({ autoRefresh: !homePropria });
  // Azioni rapide configurate in Impostazioni (con fallback statico se BE down)
  const { actions: homeActions } = useHomeActions();
  // R8c: feature flags moduli per locale (su tregobbi wildcard → no-op).
  const { isMenuKeyActive } = useActiveModules();

  // Sala → dashboard dedicata (dopo gli hook)
  const isSalaDashboard = role === "sala" && !searchParams.get("full");

  // Fetch moduli visibili
  useEffect(() => {
    apiFetch(`${API_BASE}/settings/modules/`)
      .then((r) => r.json())
      .then(setModules)
      .catch(() => {
        setModules(Object.keys(MODULES_MENU).map((key) => ({ key, roles: ["superadmin", "admin", "chef", "sommelier", "capo_sala", "sala", "viewer"] })));
      })
      .finally(() => setModulesLoading(false));
  }, []);

  // "selezioni" non ha piu' tile a se' in Home: vive sotto "Gestione Cucina" (sub di ricette)
  // Le selezioni del giorno stanno nella card «Il turno» a pagina 1 (dalla Lavagna).
  // R8c: ulteriore filtro sui moduli attivi per il locale corrente (feature flags).
  const visibleModules = modules
    .filter((m) => m.key !== "selezioni")
    .filter((m) =>
      m.roles?.includes(role) || (role === "superadmin" && m.roles?.includes("admin"))
    )
    .filter((m) => isMenuKeyActive(m.key));

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
  // Sommelier → Home sua (2026-11-05); «Mostra tutti i moduli» = /?full=1.
  if (role === "sommelier" && !searchParams.get("full")) {
    return <HomeSommelier />;
  }
  // Cucina: la Home è HomeCucina, senza scappatoia «tutti i moduli» — i
  // numeri di cassa/sala non devono vedersi (il backend li manda vuoti).
  if (["chef", "sous_chef", "commis"].includes(role)) {
    return <HomeCucina />;
  }

  const loading = modulesLoading || widgetsLoading;
  const turno = getTurno();
  const isAdmin = role === "admin" || role === "superadmin";

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

            {/* ════════ PAGINA 1: IL TURNO (Home v10, proposta B 2026-11-04) ════════
                Striscia in testa (azioni rapide + incasso/coperti), poi a sinistra
                la card unica «Il turno», a destra Preventivi e To-do.
                Su telefono: azioni → turno → preventivi → to-do → numeri. */}
            <div className="w-full flex-shrink-0 lg:min-h-0 lg:overflow-y-auto px-5 lg:px-8 pb-4">
              <div className="flex flex-col gap-3.5 lg:h-full lg:min-h-[560px]">

                <AzioniRapideStrip
                  actions={homeActions}
                  onGo={(route) => navigate(resolveRoute(route))}
                  extra={widgets?.mostra_numeri_cassa && (
                    <>
                      <div className="hidden lg:block"><KpiIncasso incasso={widgets?.incasso_ieri} /></div>
                      <div className="hidden lg:block"><KpiCoperti coperti={widgets?.coperti_mese} /></div>
                    </>
                  )}
                />

                <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)] gap-3.5 lg:flex-1 lg:min-h-0">
                  <TurnoCard
                    prenotazioni={widgets?.prenotazioni}
                    lavagna={lavagna}
                    lavagnaLoading={lavagnaLoading}
                    saving={lavagnaSaving}
                    scriviNota={scriviNota}
                    rimuoviNota={rimuoviNota}
                    isAdmin={isAdmin}
                  />

                  <div className="flex flex-col gap-3.5 lg:min-h-0 lg:overflow-y-auto">
                    {/* Preventivi in attesa di conferma: si vede solo se ce ne sono */}
                    <PreventiviInAttesaCard />
                    {/* Le mie cose da fare — lista personale (2026-10-03) */}
                    <TodoPersonale compact />
                    {/* Numeri di cassa: su telefono qui in fondo, su iPad nella striscia.
                        Solo admin e capo sala (flag dal backend, 2026-11-05). */}
                    {widgets?.mostra_numeri_cassa && (
                      <div className="grid grid-cols-2 gap-3.5 lg:hidden">
                        <KpiIncasso incasso={widgets?.incasso_ieri} />
                        <KpiCoperti coperti={widgets?.coperti_mese} />
                      </div>
                    )}
                    <button
                      onClick={() => setPage(1)}
                      className="text-[12px] text-[#a8a49e] text-center hover:text-brand-ink transition py-2 lg:mt-auto"
                    >
                      Tutti i moduli →
                    </button>
                  </div>
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
                      const menu = menuFor(heroModule.key, role);
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
                      const menu = menuFor(m.key, role);
                      if (!menu) return null;
                      const fb = MODULE_FALLBACK[m.key] || {};
                      const summary = widgets?.moduli?.find((s) => s.key === m.key);
                      const badge = summary?.badge || 0;

                      // Acquisti: card avanzata con 3 colonne KPI (sessione 2026-05-10)
                      if (m.key === "acquisti" && summary?.metrics) {
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
                            <div className="flex items-center gap-2">
                              <span className="text-[24px] leading-none">{menu.icon}</span>
                              <div className="text-[13px] sm:text-sm font-bold leading-tight">{menu.title}</div>
                            </div>
                            {/* Riga 1: mese corrente — acquisti € + (% del venduto) */}
                            <div className="text-[11px] opacity-80 mt-2 leading-snug capitalize">
                              <span className="font-semibold">{summary.metrics.mese_label || "Mese"}</span>
                              {": "}
                              <span className="font-bold">€ {(summary.metrics.acquisti_mese_eur || 0).toLocaleString("it-IT", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</span>
                              {summary.metrics.pct_su_fatturato != null && (
                                <span className="ml-1 opacity-70">({summary.metrics.pct_su_fatturato.toFixed(1)}% del venduto)</span>
                              )}
                            </div>
                            {/* Riga 2: mese precedente — più piccolo per confronto */}
                            <div className="text-[10px] opacity-55 leading-snug capitalize">
                              {summary.metrics.mese_prev_label || "Mese prec."}
                              {": "}
                              € {(summary.metrics.acquisti_mese_prev_eur || 0).toLocaleString("it-IT", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                              {summary.metrics.pct_su_fatturato_prev != null && (
                                <span className="ml-1">({summary.metrics.pct_su_fatturato_prev.toFixed(1)}%)</span>
                              )}
                            </div>
                            <div className="grid grid-cols-3 gap-1 mt-2">
                              {[
                                { label: "Scaduti",       eur: summary.metrics.scaduti_eur,    n: summary.metrics.scaduti_n,    color: "text-brand-red" },
                                { label: "Entro 30gg",    eur: summary.metrics.entro_30gg_eur, n: summary.metrics.entro_30gg_n, color: "text-amber-700" },
                                { label: "Oltre 30gg",    eur: summary.metrics.oltre_30gg_eur, n: summary.metrics.oltre_30gg_n, color: "text-slate-700" },
                              ].map((col) => (
                                <div key={col.label} className="bg-white/40 rounded-lg px-1.5 py-1.5 text-center">
                                  <div className="text-[8px] uppercase tracking-wide opacity-60 leading-tight truncate">{col.label}</div>
                                  <div className={`text-[12px] font-bold tabular-nums leading-tight ${col.color}`}>
                                    € {Math.round(col.eur || 0).toLocaleString("it-IT")}
                                  </div>
                                  <div className="text-[8px] opacity-50 leading-tight">{col.n || 0} fatt.</div>
                                </div>
                              ))}
                            </div>
                          </div>
                        );
                      }

                      // Controllo Gestione: card avanzata con KPI P&L (audit Marco 2026-05-16)
                      // Mostra l'ultimo MESE CHIUSO (con ELAB caricato), non il mese corrente
                      // parziale che darebbe numeri fuorvianti. Vedi _controllo_gestione_metrics.
                      if (m.key === "controllo-gestione" && summary?.metrics?.utile_mese_eur != null) {
                        const cm = summary.metrics;
                        const isUtilePositivo = (cm.utile_mese_eur ?? 0) >= 0;
                        // Benchmark ristorazione: food cost sano 28-35%, personale sano 25-35%
                        const fcOk = cm.food_cost_pct != null && cm.food_cost_pct >= 20 && cm.food_cost_pct <= 35;
                        const persOk = cm.personale_pct != null && cm.personale_pct >= 20 && cm.personale_pct <= 35;
                        // Alert messaggio compatto + tooltip esplicito
                        const alertChip = cm.alert
                          ? (cm.alert === "elab_mai_caricato"
                              ? { label: "Dati parziali", tooltip: "Nessun ELAB importato — carica i PDF paghe in Dipendenti → Buste Paga per il P&L completo" }
                              : { label: `${cm.n_mesi_arretrati} mesi indietro`, tooltip: `L'ultimo ELAB importato è di ${cm.n_mesi_arretrati} mesi fa — carica i PDF paghe per i mesi mancanti` })
                          : null;
                        return (
                          <div
                            key={m.key}
                            onClick={() => navigate(menu.go)}
                            className={`rounded-[14px] border cursor-pointer active:scale-[.97] transition-transform relative overflow-hidden ${menu.color}`}
                            style={{ boxShadow: "0 2px 10px rgba(0,0,0,.06)", padding: 16, minHeight: 110 }}
                          >
                            {alertChip && (
                              <span className="absolute top-2.5 right-2.5 text-[9px] font-medium text-white rounded-full"
                                style={{ background: "#BA7517", padding: "2px 8px", boxShadow: "0 1px 3px rgba(186,117,23,.3)" }}
                                title={alertChip.tooltip}>
                                ⚠ {alertChip.label}
                              </span>
                            )}
                            <div className="flex items-center gap-2">
                              <span className="text-[24px] leading-none">{menu.icon}</span>
                              <div className="text-[13px] sm:text-sm font-bold leading-tight">{menu.title}</div>
                            </div>
                            {/* Riga 1: utile netto dell'ultimo mese chiuso */}
                            <div className="text-[11px] opacity-90 mt-2 leading-snug">
                              <span className="font-semibold capitalize">{cm.mese_label}</span>
                              {": utile "}
                              <span className={`font-bold ${isUtilePositivo ? "" : "text-brand-red"}`}>
                                € {(cm.utile_mese_eur || 0).toLocaleString("it-IT", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                              </span>
                              {cm.utile_mese_pct != null && (
                                <span className="ml-1 opacity-70">({cm.utile_mese_pct.toFixed(1)}% sui ricavi)</span>
                              )}
                            </div>
                            {/* Riga 2: mese precedente (riferimento visivo) */}
                            {cm.utile_mese_prev_eur != null && (
                              <div className="text-[10px] opacity-55 leading-snug capitalize">
                                {cm.mese_prev_label}: € {(cm.utile_mese_prev_eur || 0).toLocaleString("it-IT", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                                {cm.utile_mese_prev_pct != null && (
                                  <span className="ml-1">({cm.utile_mese_prev_pct.toFixed(1)}%)</span>
                                )}
                              </div>
                            )}
                            {/* Indicatori benchmark salute (food cost % + personale %) */}
                            <div className="grid grid-cols-2 gap-1 mt-2.5">
                              {[
                                { label: "Food cost", pct: cm.food_cost_pct, ok: fcOk, target: "28-35%" },
                                { label: "Personale", pct: cm.personale_pct, ok: persOk, target: "25-35%" },
                              ].map((kp) => (
                                <div key={kp.label}
                                  className="bg-white/50 rounded-lg px-2 py-1.5"
                                  title={`${kp.label} ${kp.pct == null ? "non disponibile" : `${kp.pct.toFixed(1)}% (benchmark sano ${kp.target})`}`}>
                                  <div className="flex items-center justify-between leading-tight">
                                    <span className="text-[8px] uppercase tracking-wide opacity-60 font-semibold">{kp.label}</span>
                                    <span className={`text-[10px] ${kp.pct == null ? "opacity-40" : kp.ok ? "text-emerald-600" : "text-amber-600"}`}>
                                      {kp.pct == null ? "—" : kp.ok ? "✓" : "⚠"}
                                    </span>
                                  </div>
                                  <div className={`text-[13px] font-bold tabular-nums leading-tight ${kp.pct == null ? "opacity-40" : ""}`}>
                                    {kp.pct == null ? "—" : `${kp.pct.toFixed(1)}%`}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        );
                      }

                      // Card standard per gli altri moduli
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
                  href="https://underlinestudio.it"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-1.5 text-[11px] text-brand-ink/60 hover:text-brand-ink/85 transition select-none"
                  aria-label="Designed and developed by Marco Carminati — Underline Studio"
                >
                  Designed &amp; developed by Marco Carminati
                  <span className="mx-1.5 opacity-50">·</span>
                  <span className="font-medium">Underline Studio</span>
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

