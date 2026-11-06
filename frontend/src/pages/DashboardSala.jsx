// FILE: frontend/src/pages/DashboardSala.jsx
// @version: v6.1 — «I miei turni» a destra, sotto i Calici (2026-11-06)
// v6.0 — Home v10 per la sala: card unica «Il turno» (prenotazioni +
//   Lavagna + selezioni, tab sul turno in corso), azioni rapide in testa, a destra
//   Calici e To-do; si ricarica da sola ogni 3 minuti (2026-11-04)
// v5.3 — widget Bacheca sostituito da La Lavagna (briefing di servizio,
//   sola lettura per il ruolo sala). Stesso componente della Home.
// Dashboard per utenti sala — prenotazioni oggi, La Lavagna (briefing di servizio), azioni rapide

import React from "react";
import { useNavigate } from "react-router-dom";
import useHomeWidgets from "../hooks/useHomeWidgets";
import useLavagna from "../hooks/useLavagna";
import useHomeActions from "../hooks/useHomeActions";
import TrgbLoader from "../components/TrgbLoader";
import TurnoCard from "../components/widgets/TurnoCard";
import AzioniRapideStrip from "../components/widgets/AzioniRapideStrip";
import TodoPersonale from "../components/widgets/TodoPersonale";
import MieiTurniCard from "../components/widgets/MieiTurniCard";
import CaliciDisponibiliCard from "../components/widgets/CaliciDisponibiliCard";
import { Btn } from "../components/ui";

/* ── Saluto contestuale ── */
function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return "Buongiorno";
  if (h < 18) return "Buon pomeriggio";
  return "Buonasera";
}

/* ── Turno attuale ── */
function getTurno() {
  const h = new Date().getHours();
  if (h < 15) return { label: "Pranzo", emoji: "☀️" };
  return { label: "Cena", emoji: "🌙" };
}

/* ── Formatta data italiana ── */
function formatDate() {
  const d = new Date();
  const giorni = ["Domenica","Lunedì","Martedì","Mercoledì","Giovedì","Venerdì","Sabato"];
  const mesi = ["gennaio","febbraio","marzo","aprile","maggio","giugno","luglio","agosto","settembre","ottobre","novembre","dicembre"];
  return `${giorni[d.getDay()]} ${d.getDate()} ${mesi[d.getMonth()]}`;
}




/* ============================================================
   DASHBOARD SALA — COMPONENT
   ============================================================ */
export default function DashboardSala() {
  const navigate = useNavigate();
  const displayName = localStorage.getItem("display_name") || localStorage.getItem("username") || "Sala";
  const { data: widgets, loading: wLoading } = useHomeWidgets({ autoRefresh: true });
  const {
    lavagna,
    loading: lavagnaLoading,
    saving: lavagnaSaving,
    scriviNota,
    rimuoviNota,
  } = useLavagna({ autoRefresh: true });
  // Azioni rapide configurate in Impostazioni (con fallback statico se BE down)
  const { actions: salaActions } = useHomeActions("sala");

  const loading = wLoading || lavagnaLoading;
  const turno = getTurno();

  if (loading) {
    return (
      <div className="min-h-[100dvh] bg-brand-cream flex items-center justify-center">
        <TrgbLoader size={56} label="Caricamento…" />
      </div>
    );
  }

  return (
    <div className="bg-brand-cream flex flex-col overflow-hidden" style={{ height: "calc(100dvh - 56px)" }}>
      {/* ── Header ── */}
      <div className="flex-shrink-0 px-5 lg:px-8 pt-4 pb-2">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="font-playfair text-2xl lg:text-[28px] font-bold text-brand-ink tracking-tight leading-tight">
              {getGreeting()}, {displayName.split(" ")[0]}
            </h1>
            <p className="text-xs text-[#a8a49e] font-medium mt-1">
              {formatDate()}
            </p>
          </div>
          <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 rounded-[10px] px-3 py-1.5">
            <div className="w-2 h-2 rounded-full bg-emerald-500"></div>
            <span className="text-xs font-semibold text-emerald-800">
              {turno.emoji} {turno.label}
            </span>
          </div>
        </div>
      </div>

      {/* ── Azioni in testa, poi «Il turno» a sinistra e Calici/To-do a destra ── */}
      <div className="flex-1 min-h-0 px-5 lg:px-8 pb-4 overflow-y-auto lg:overflow-hidden">
        <div className="flex flex-col gap-3.5 lg:h-full">
          <AzioniRapideStrip actions={salaActions} onGo={(route) => navigate(route)} />

          <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)] gap-3.5 lg:flex-1 lg:min-h-0">
            {/* La sala atterra qui, non sulla Home: Lavagna in sola lettura
                (isAdmin=false), briefing e nota si vedono, il campo no. */}
            <TurnoCard
              prenotazioni={widgets?.prenotazioni}
              lavagna={lavagna}
              lavagnaLoading={lavagnaLoading}
              saving={lavagnaSaving}
              scriviNota={scriviNota}
              rimuoviNota={rimuoviNota}
              isAdmin={false}
            />

            <div className="flex flex-col gap-3.5 lg:min-h-0 lg:overflow-y-auto">
              <CaliciDisponibiliCard
                title="🥂 Calici al banco"
                compact={true}
                onClick={(v) => navigate(`/vini/magazzino/${v.id}`)}
              />
              <MieiTurniCard nascondiSeNonCollegato />
              <TodoPersonale compact />
              <Btn
                variant="ghost"
                size="sm"
                onClick={() => navigate("/?full=1")}
                className="lg:mt-auto flex-shrink-0"
              >
                Mostra tutti i moduli →
              </Btn>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
