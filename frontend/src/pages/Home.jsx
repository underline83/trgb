// @version: v5.0 — Home v3 redesign: due pagine swipe (widget + moduli), tile SVG, estetica raffinata
import React, { useEffect, useState, useRef, useCallback } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { API_BASE, apiFetch } from "../config/api";
import MODULE_VERSIONS, { VersionBadge } from "../config/versions";
import MODULES_MENU from "../config/modulesMenu";
import MODULE_ICONS from "../components/icons";
import DashboardSala from "./DashboardSala";
import TrgbLoader from "../components/TrgbLoader";
import useHomeWidgets from "../hooks/useHomeWidgets";

/* ── Palette moduli smorzata (Home v3) ── */
const MODULE_STYLE = {
  vini:                { accent: "#B8860B", tint: "#FAF5EB", sub: "Carta \u00b7 Cantina \u00b7 Vendite" },
  acquisti:            { accent: "#2D8F7B", tint: "#EEF9F6", sub: "Fatture \u00b7 Fornitori" },
  vendite:             { accent: "#4F52B5", tint: "#EDEDFA", sub: "Corrispettivi \u00b7 Chiusure" },
  ricette:             { accent: "#C05621", tint: "#FDF3EC", sub: "Archivio \u00b7 Ingredienti \u00b7 Matching" },
  "flussi-cassa":      { accent: "#1A7F5A", tint: "#EBF8F3", sub: "CC \u00b7 Carta \u00b7 Contanti \u00b7 Mance" },
  "controllo-gestione":{ accent: "#2871B8", tint: "#EBF3FC", sub: "Dashboard \u00b7 Scadenze \u00b7 Confronto" },
  statistiche:         { accent: "#B83A52", tint: "#FCEDF0", sub: "Cucina \u00b7 Coperti \u00b7 Trend" },
  prenotazioni:        { accent: "#6B4FA8", tint: "#F1EDF9", sub: "Planning \u00b7 Mappa \u00b7 Settimana" },
  clienti:             { accent: "#1E7E8A", tint: "#ECF7F8", sub: "Anagrafica \u00b7 CRM \u00b7 Dashboard" },
  dipendenti:          { accent: "#7C4FA8", tint: "#F3EEF9", sub: "Buste Paga \u00b7 Turni \u00b7 Scadenze" },
  impostazioni:        { accent: "#6B6B6B", tint: "#F2F2F2", sub: "Utenti \u00b7 Moduli \u00b7 Backup" },
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

            {/* ════════ PAGINA 2: MODULI ════════ */}
            <div className="w-full flex-shrink-0 overflow-y-auto px-5 sm:px-8 pb-8">
              <div className="flex items-baseline justify-between mb-5 sm:mb-6">
                <h2 className="font-playfair text-[22px] sm:text-[26px] font-bold text-brand-ink tracking-tight">
                  Moduli
                </h2>
                <span className="text-[11px] text-[#a8a49e] font-medium">
                  {visibleModules.length} attivi
                </span>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-2.5 sm:gap-3.5">
                {visibleModules.map((m, idx) => {
                  const menu = MODULES_MENU[m.key];
                  const style = MODULE_STYLE[m.key];
                  if (!menu || !style) return null;
                  const IconComp = MODULE_ICONS[m.key];
                  const gobColor = GOB[idx % 3];

                  return (
                    <div
                      key={m.key}
                      onClick={() => navigate(menu.go)}
                      className="bg-white rounded-[14px] shadow-[0_1px_3px_rgba(0,0,0,.04)] cursor-pointer relative overflow-hidden active:scale-[.98] transition"
                      style={{ minHeight: 130 }}
                    >
                      {/* Gobbetta accent top */}
                      <div
                        className="absolute top-0 left-4 right-4 h-[2px] rounded-b-sm"
                        style={{ background: gobColor, opacity: 0.5 }}
                      />
                      <div className="p-4 sm:p-5 h-full flex flex-col justify-between">
                        <div
                          className="w-9 h-9 rounded-[10px] flex items-center justify-center"
                          style={{ background: style.tint, color: style.accent }}
                        >
                          {IconComp ? <IconComp size={18} /> : null}
                        </div>
                        <div className="mt-3">
                          <div className="text-[13px] sm:text-sm font-bold text-brand-ink leading-tight tracking-tight">
                            {menu.title.replace("Gestione ", "").replace("Ricette & ", "Ricette &\u00a0")}
                          </div>
                          <div className="text-[10px] text-[#a8a49e] mt-1 leading-snug">
                            {style.sub}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

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
