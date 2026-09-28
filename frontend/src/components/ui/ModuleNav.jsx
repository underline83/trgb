// FILE: frontend/src/components/ui/ModuleNav.jsx
// @version: v1.0 — Mattone UI condiviso: barra di navigazione di sezione (2026-09-28)
//
// Prima c'erano 11 copie scritte a mano (ViniNav, DipendentiNav, BancaNav…),
// tutte uguali: titolo + fila di tab. Su iPhone la fila finiva fuori dallo
// schermo e le ultime voci non si raggiungevano. Adesso:
//   - da sm in su: la fila di tab di sempre (scorre di lato se non ci sta, iPad);
//   - sotto sm (telefono): un pulsante con la voce attuale «🍷 Cantina ▾» che
//     apre dal basso l'elenco completo, a voci grandi da pollice.
//
// Ogni *Nav.jsx di sezione resta padrone delle SUE regole (quali tab, chi le
// vede, quale è attiva) e passa qui l'elenco già filtrato. Qui c'è solo la
// forma. Il Task Manager (tasks/Nav.jsx) ha già una sua barra in basso e non
// passa di qui.
//
// Tab: { key, label, icon, path, badge?, soon?, mobile? }
//   badge  → numero su pallino ambra (es. differenze import in Clienti)
//   soon   → voce «prossimamente», visibile ma non cliccabile
//   mobile → false = voce da computer: sul telefono finisce in fondo sotto
//            «Meglio dal computer» (non sparisce: il giorno che serve c'è)
//
// Colori: stringhe Tailwind COMPLETE nella mappa, mai composte a runtime,
// altrimenti il purge le toglie.

import React, { useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";

const COLORI = {
  amber:   { titolo: "text-amber-900 hover:text-amber-700",     attivo: "bg-amber-100 text-amber-900",     bordo: "border-amber-300" },
  emerald: { titolo: "text-emerald-900 hover:text-emerald-700", attivo: "bg-emerald-100 text-emerald-900", bordo: "border-emerald-300" },
  indigo:  { titolo: "text-indigo-900 hover:text-indigo-700",   attivo: "bg-indigo-100 text-indigo-900",   bordo: "border-indigo-300" },
  orange:  { titolo: "text-orange-900 hover:text-orange-700",   attivo: "bg-orange-100 text-orange-900",   bordo: "border-orange-300" },
  purple:  { titolo: "text-purple-900 hover:text-purple-700",   attivo: "bg-purple-100 text-purple-900",   bordo: "border-purple-300" },
  rose:    { titolo: "text-rose-900 hover:text-rose-700",       attivo: "bg-rose-100 text-rose-900",       bordo: "border-rose-300" },
  sky:     { titolo: "text-sky-900 hover:text-sky-700",         attivo: "bg-sky-100 text-sky-900",         bordo: "border-sky-300" },
  teal:    { titolo: "text-teal-900 hover:text-teal-700",       attivo: "bg-teal-100 text-teal-900",       bordo: "border-teal-300" },
  neutral: { titolo: "text-neutral-900 hover:text-neutral-700", attivo: "bg-neutral-100 text-neutral-900", bordo: "border-neutral-300" },
};

function Badge({ n }) {
  if (!n) return null;
  return (
    <span className="ml-1 px-1.5 py-0.5 bg-amber-500 text-white text-[10px] font-bold rounded-full leading-none">
      {n}
    </span>
  );
}

export default function ModuleNav({ title, homePath, tabs, isActive, color = "neutral" }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [aperto, setAperto] = useState(false);
  const c = COLORI[color] || COLORI.neutral;

  // Cambio pagina = sheet chiuso (anche col tasto indietro del telefono)
  useEffect(() => { setAperto(false); }, [location.pathname]);

  const attiva = tabs.find((t) => isActive(t));
  const daTelefono = tabs.filter((t) => t.mobile !== false);
  const daComputer = tabs.filter((t) => t.mobile === false);
  const badgeAltrove = tabs.some((t) => t.badge && t !== attiva);

  const vai = (path) => { setAperto(false); navigate(path); };

  return (
    <div className="bg-white border-b border-neutral-200 shadow-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6">

        {/* ── Computer / iPad: la fila di tab ── */}
        <div className="hidden sm:flex items-center justify-between h-12 gap-3">
          <div className="flex items-center gap-1 min-w-0">
            <button
              onClick={() => navigate(homePath)}
              className={`text-sm font-bold font-playfair mr-4 transition whitespace-nowrap ${c.titolo}`}
            >
              {title}
            </button>
            <div className="flex gap-0.5 overflow-x-auto min-w-0" style={{ scrollbarWidth: "none" }}>
              {tabs.map((tab) => {
                if (tab.soon) {
                  return (
                    <span key={tab.key} title="Prossimamente"
                          className="px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap text-neutral-300 cursor-default select-none">
                      <span className="mr-1 opacity-40">{tab.icon}</span>{tab.label}
                    </span>
                  );
                }
                const on = isActive(tab);
                return (
                  <button
                    key={tab.key}
                    onClick={() => navigate(tab.path)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition whitespace-nowrap ${
                      on ? `${c.attivo} shadow-sm` : "text-neutral-600 hover:bg-neutral-100 hover:text-neutral-800"
                    }`}
                  >
                    <span className="mr-1">{tab.icon}</span>
                    {tab.label}
                    <Badge n={tab.badge} />
                  </button>
                );
              })}
            </div>
          </div>
          <button
            onClick={() => navigate("/")}
            className="text-[11px] text-neutral-400 hover:text-neutral-600 transition whitespace-nowrap"
          >
            ← Home
          </button>
        </div>

        {/* ── Telefono: titolo + pulsante con la voce attuale ── */}
        <div className="flex sm:hidden items-center justify-between h-14 gap-3">
          <button
            onClick={() => navigate(homePath)}
            className={`text-base font-bold font-playfair truncate ${c.titolo}`}
          >
            {title}
          </button>
          <button
            onClick={() => setAperto(true)}
            className={`relative flex items-center gap-1.5 px-3.5 min-h-[44px] rounded-xl border text-sm font-semibold whitespace-nowrap ${c.attivo} ${c.bordo}`}
            aria-haspopup="dialog"
          >
            <span>{attiva ? attiva.icon : "☰"}</span>
            <span className="max-w-[150px] truncate">{attiva ? attiva.label : "Sezioni"}</span>
            <span className="text-xs opacity-60">▾</span>
            {badgeAltrove && (
              <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-amber-500 ring-2 ring-white" />
            )}
          </button>
        </div>
      </div>

      {aperto && (
        <div
          className="sm:hidden fixed inset-0 z-[110] flex items-end"
          style={{ background: "rgba(17,17,17,.42)" }}
          onClick={() => setAperto(false)}
          role="dialog"
          aria-label={`Sezioni di ${title}`}
        >
          <div
            className="w-full bg-brand-cream rounded-t-[22px] border-t border-[#e6e1d8] shadow-2xl overflow-y-auto overscroll-contain"
            style={{
              maxHeight: "85dvh",
              paddingBottom: "calc(18px + env(safe-area-inset-bottom))",
              paddingTop: 8,
              animation: "trgb-modnav-up .22s ease",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-center py-2">
              <div className="w-11 h-1.5 rounded-full bg-[#c8c3b8]" />
            </div>
            <div className="px-5 pt-1 pb-2 font-playfair font-bold text-[22px] text-brand-ink">{title}</div>

            <div className="px-4 flex flex-col gap-2">
              {daTelefono.map((tab) => (
                <Voce key={tab.key} tab={tab} on={isActive(tab)} c={c} onClick={() => vai(tab.path)} />
              ))}
            </div>

            {daComputer.length > 0 && (
              <>
                <div className="px-5 pt-5 pb-2 text-[11px] font-bold uppercase tracking-wider text-neutral-500">
                  Meglio dal computer
                </div>
                <div className="px-4 flex flex-col gap-2 opacity-80">
                  {daComputer.map((tab) => (
                    <Voce key={tab.key} tab={tab} on={isActive(tab)} c={c} onClick={() => vai(tab.path)} piccola />
                  ))}
                </div>
              </>
            )}

            <div className="px-4 mt-4 flex flex-col gap-2">
              <Voce tab={{ icon: "🏠", label: "Home TRGB" }} c={c} onClick={() => vai("/")} piccola />
              <button
                onClick={() => setAperto(false)}
                className="w-full min-h-[48px] rounded-2xl bg-white border border-[#e6e1d8] font-semibold text-brand-ink"
                type="button"
              >
                Chiudi
              </button>
            </div>
          </div>
          <style>{`@keyframes trgb-modnav-up{from{transform:translateY(24px);opacity:0}to{transform:none;opacity:1}}`}</style>
        </div>
      )}
    </div>
  );
}

function Voce({ tab, on, c, onClick, piccola }) {
  if (tab.soon) {
    return (
      <div className="w-full min-h-[52px] px-4 rounded-2xl bg-white/60 border border-[#e6e1d8] flex items-center gap-3 text-neutral-400">
        <span className="text-xl opacity-50">{tab.icon}</span>
        <span className="font-semibold">{tab.label}</span>
        <span className="ml-auto text-xs">prossimamente</span>
      </div>
    );
  }
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full ${piccola ? "min-h-[48px]" : "min-h-[56px]"} px-4 rounded-2xl border flex items-center gap-3 text-left ${
        on ? `${c.attivo} ${c.bordo}` : "bg-white border-[#e6e1d8] text-brand-ink active:bg-[#EFEBE3]"
      }`}
    >
      <span className="text-xl">{tab.icon}</span>
      <span className="font-semibold">{tab.label}</span>
      <Badge n={tab.badge} />
      <span className="ml-auto text-neutral-400">{on ? "●" : "›"}</span>
    </button>
  );
}
