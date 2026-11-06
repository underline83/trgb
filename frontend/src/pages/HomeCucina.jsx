// FILE: frontend/src/pages/HomeCucina.jsx
// @version: v1.2 — «I miei turni» spostato in components/widgets/MieiTurniCard.jsx, ora anche nelle altre Home (2026-11-06)
// v1.1 — la Lavagna si ricarica da sola ogni 3 minuti (2026-11-04)
// v1.0 — Home dei ruoli di cucina (chef, sous_chef, commis) (2026-10-02)
//
// Marco: «quando entrano vedono la bacheca, va bene; non devono vedere il
// fatturato del giorno prima, né i coperti, né le prenotazioni. Facciamo un
// widget con i turni del dipendente, la lavagna e sotto i tasti che useranno».
//
// Gemella di DashboardSala.jsx, ma senza scappatoia «tutti i moduli»: per la
// cucina la Home è questa. I numeri di cassa li toglie anche il backend
// (/dashboard/home → vuoti per RUOLI_CUCINA), non solo questa pagina.
//
//   1. I miei turni — oggi + i prossimi 6 giorni, da /turni/miei-turni
//   2. La Lavagna   — stesso widget della Home, sola lettura
//   3. I tasti      — configurabili da Impostazioni → Home per ruolo
import React from "react";
import { useNavigate } from "react-router-dom";
import useLavagna from "../hooks/useLavagna";
import useHomeActions from "../hooks/useHomeActions";
import Lavagna from "../components/widgets/Lavagna";
import TodoPersonale from "../components/widgets/TodoPersonale";
import MieiTurniCard from "../components/widgets/MieiTurniCard";

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return "Buongiorno";
  if (h < 18) return "Buon pomeriggio";
  return "Buonasera";
}
function formatDate() {
  const d = new Date();
  const giorni = ["Domenica", "Lunedì", "Martedì", "Mercoledì", "Giovedì", "Venerdì", "Sabato"];
  const mesi = ["gennaio", "febbraio", "marzo", "aprile", "maggio", "giugno", "luglio", "agosto", "settembre", "ottobre", "novembre", "dicembre"];
  return `${giorni[d.getDay()]} ${d.getDate()} ${mesi[d.getMonth()]}`;
}


/* ── La pagina ─────────────────────────────────────────────────── */
export default function HomeCucina() {
  const navigate = useNavigate();
  const role = localStorage.getItem("role");
  const displayName = localStorage.getItem("display_name") || localStorage.getItem("username") || "";
  const { lavagna, loading: lavagnaLoading, saving, scriviNota, rimuoviNota } = useLavagna({ autoRefresh: true });
  const { actions } = useHomeActions(role);

  return (
    <div className="min-h-[calc(100dvh-56px)] bg-brand-cream px-4 lg:px-8 pt-4 pb-8">
      <div className="max-w-5xl mx-auto">
        <h1 className="font-playfair text-2xl lg:text-[28px] font-bold text-brand-ink tracking-tight leading-tight">
          {getGreeting()}{displayName ? `, ${displayName.split(" ")[0]}` : ""}
        </h1>
        <p className="text-xs text-[#a8a49e] font-medium mt-1 mb-4">{formatDate()}</p>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3.5">
          <MieiTurniCard />
          <Lavagna lavagna={lavagna} loading={lavagnaLoading} saving={saving}
                   scriviNota={scriviNota} rimuoviNota={rimuoviNota} isAdmin={false} />
          <div className="lg:col-span-2"><TodoPersonale /></div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 mt-4">
          {actions.map((a) => (
            <button key={a.id ?? a.key} type="button"
                    onClick={() => (a.route.startsWith("/carta")
                      // /carta/* è la pagina pubblica (fuori dal router del gestionale):
                      // serve un caricamento pieno, non una navigazione interna.
                      ? window.location.assign(a.route)
                      : navigate(a.route))}
                    className={`rounded-[14px] border text-left active:scale-[.97] transition-transform flex items-center gap-3 px-4 py-3.5 min-h-[64px] ${a.color || "bg-white border-neutral-200"}`}
                    style={{ boxShadow: "0 2px 10px rgba(0,0,0,.06)" }}>
              <span className="text-2xl leading-none">{a.emoji}</span>
              <span>
                <span className="block text-[14px] font-bold leading-tight">{a.label}</span>
                {a.sub && <span className="block text-[11px] opacity-60 mt-0.5">{a.sub}</span>}
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
