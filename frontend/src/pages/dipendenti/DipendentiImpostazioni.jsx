// @version: v2.1-mattoni — refactor leggero con StatusBadge + EmptyState (M.I)
// Layout impostazioni modulo Dipendenti: sidebar a sinistra con sezioni, contenuto a destra.
// Modello: ClientiImpostazioni.jsx. Le sezioni "reparti" embeddano GestioneReparti.
// Nota: il wrapper full-height custom (flex flex-col) NON usa PageLayout perché
//   gestisce la sidebar che riempie tutta l'altezza. Solo i micro-componenti M.I.
import React, { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import DipendentiNav from "./DipendentiNav";
import GestioneReparti from "./GestioneReparti";
import { StatusBadge, EmptyState } from "../../components/ui";

// ── Sidebar items ──
const SECTIONS = [
  { key: "reparti",          label: "Reparti",           icon: "🏢", desc: "SALA, CUCINA, ... orari standard, pause staff, colore e icona", ready: true  },
  { key: "soglie_ccnl",      label: "Soglie CCNL",       icon: "⚡", desc: "Personalizza soglie 40h/48h per semaforo ore",                   ready: false },
  { key: "template_wa",      label: "Template WhatsApp", icon: "📨", desc: "Modifica il testo di default per l'invio turni via WA",         ready: false },
];

export default function DipendentiImpostazioni() {
  const { section: urlSection } = useParams();
  const navigate = useNavigate();
  const [section, setSection] = useState(urlSection || "reparti");

  useEffect(() => {
    if (urlSection && urlSection !== section) setSection(urlSection);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlSection]);

  const goTo = (key) => {
    setSection(key);
    // URL statico: non abbiamo route parametrico, quindi manteniamo solo lo state
    // (se in futuro si vuole deep-link, cambiare la route in App.jsx con /:section?)
  };

  const currentSection = SECTIONS.find((s) => s.key === section) || SECTIONS[0];

  return (
    <div className="min-h-screen bg-brand-cream flex flex-col">
      <DipendentiNav current="impostazioni" />
      <div className="flex-1 min-h-0">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 h-full">
          <div className="flex gap-6 h-full">
            {/* ── Sidebar ── */}
            <div className="w-60 flex-shrink-0">
              <h2 className="text-xs font-bold text-neutral-400 uppercase tracking-wider mb-3 px-3">
                Impostazioni Dipendenti
              </h2>
              <nav className="space-y-0.5">
                {SECTIONS.map((s) => {
                  const active = section === s.key;
                  const disabled = !s.ready;
                  return (
                    <button
                      key={s.key}
                      onClick={() => !disabled && goTo(s.key)}
                      disabled={disabled}
                      className={`w-full text-left px-3 py-2.5 rounded-lg transition flex items-start gap-2.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue/40 focus-visible:ring-offset-1 ${
                        active
                          ? "bg-purple-50 text-purple-900 shadow-sm border border-purple-200"
                          : disabled
                            ? "text-neutral-300 cursor-not-allowed"
                            : "text-neutral-600 hover:bg-neutral-100 hover:text-neutral-800"
                      }`}
                    >
                      <span className="text-sm mt-0.5">{s.icon}</span>
                      <div className="flex-1 min-w-0">
                        <div className={`text-sm font-medium flex items-center gap-1.5 ${active ? "text-purple-900" : ""}`}>
                          {s.label}
                          {disabled && (
                            <StatusBadge tone="neutral" size="sm">Prossimamente</StatusBadge>
                          )}
                        </div>
                        <div className="text-[11px] text-neutral-400 mt-0.5 leading-tight">{s.desc}</div>
                      </div>
                    </button>
                  );
                })}
              </nav>
            </div>

            {/* ── Content ── */}
            <div className="flex-1 min-w-0 bg-white shadow-sm rounded-xl border border-neutral-200 overflow-hidden flex flex-col">
              {section === "reparti" && <GestioneReparti embedded />}
              {section === "soglie_ccnl" && <PlaceholderSection s={currentSection} />}
              {section === "template_wa" && <PlaceholderSection s={currentSection} />}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function PlaceholderSection({ s }) {
  return (
    <div className="flex-1 flex items-center justify-center p-12">
      <EmptyState
        icon={s.icon}
        title={s.label}
        description={`${s.desc} — Sezione in preparazione.`}
        watermark
      />
    </div>
  );
}
