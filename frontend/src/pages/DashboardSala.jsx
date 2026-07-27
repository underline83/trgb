// FILE: frontend/src/pages/DashboardSala.jsx
// @version: v5.3 — widget Bacheca sostituito da La Lavagna (briefing di servizio,
//   sola lettura per il ruolo sala). Stesso componente della Home.
// Dashboard per utenti sala — prenotazioni oggi, La Lavagna (briefing di servizio), azioni rapide

import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import useHomeWidgets from "../hooks/useHomeWidgets";
import useLavagna from "../hooks/useLavagna";
import useHomeActions from "../hooks/useHomeActions";
import TrgbLoader from "../components/TrgbLoader";
import SelezioniCard from "../components/widgets/SelezioniCard";
import Lavagna from "../components/widgets/Lavagna";
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


/* ── Stato prenotazione dot color ── */
function dotColor(stato) {
  if (["RECORDED", "ARRIVED", "SEATED"].includes(stato)) return "#2EB872";
  if (["BILL", "LEFT"].includes(stato)) return "#a8a49e";
  return "#D4A017";
}


/* ============================================================
   DASHBOARD SALA — COMPONENT
   ============================================================ */
export default function DashboardSala() {
  const navigate = useNavigate();
  const displayName = localStorage.getItem("display_name") || localStorage.getItem("username") || "Sala";
  const { data: widgets, loading: wLoading } = useHomeWidgets();
  const {
    lavagna,
    loading: lavagnaLoading,
    saving: lavagnaSaving,
    scriviNota,
    rimuoviNota,
  } = useLavagna();
  // Azioni rapide configurate in Impostazioni (con fallback statico se BE down)
  const { actions: salaActions } = useHomeActions("sala");
  const [turnoTab, setTurnoTab] = useState("pranzo"); // pranzo | cena

  const loading = wLoading || lavagnaLoading;
  const turno = getTurno();

  // Filtra prenotazioni per turno
  const allPren = widgets?.prenotazioni?.lista || [];
  const prenPranzo = allPren.filter((r) => r.turno === "pranzo");
  const prenCena = allPren.filter((r) => r.turno === "cena");
  const prenVisible = turnoTab === "pranzo" ? prenPranzo : prenCena;
  const paxPranzo = widgets?.prenotazioni?.pranzo_pax || 0;
  const paxCena = widgets?.prenotazioni?.cena_pax || 0;

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

      {/* ── Layout 3 colonne (landscape) / stack (portrait) ── */}
      <div className="flex-1 min-h-0 px-5 lg:px-8 pb-4">
        <div className="h-full grid grid-cols-1 lg:grid-cols-[1.3fr_1fr_.7fr] gap-3.5">

          {/* ═══ COL 1: Prenotazioni oggi ═══ */}
          <div className="bg-white rounded-[14px] shadow-[0_2px_10px_rgba(0,0,0,.06)] flex flex-col overflow-hidden min-h-[300px] lg:min-h-0">
            {/* Header */}
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
                  turnoTab === "pranzo"
                    ? "text-brand-ink border-b-2 border-brand-ink font-bold"
                    : "text-[#a8a49e]"
                }`}
              >
                ☀️ Pranzo · {paxPranzo} pax
              </button>
              <button
                onClick={() => setTurnoTab("cena")}
                className={`flex-1 text-center py-2 text-[11px] font-semibold transition ${
                  turnoTab === "cena"
                    ? "text-brand-ink border-b-2 border-brand-ink font-bold"
                    : "text-[#a8a49e]"
                }`}
              >
                🌙 Cena · {paxCena} pax
              </button>
            </div>

            {/* Lista prenotazioni */}
            <div className="flex-1 overflow-y-auto">
              {prenVisible.length > 0 ? (
                prenVisible.map((r, i) => (
                  <div
                    key={i}
                    className={`flex items-center gap-2.5 px-4 py-2.5 ${
                      i < prenVisible.length - 1 ? "border-b border-[#f8f6f2]" : ""
                    }`}
                  >
                    <span className="text-[11px] font-semibold text-[#a8a49e] w-10 flex-shrink-0 tabular-nums">
                      {r.ora?.slice(0, 5)}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="text-[13px] font-semibold text-brand-ink leading-tight truncate">
                        {r.nome}
                      </div>
                      {r.nota && (
                        <div className="text-[11px] text-[#a8a49e] mt-0.5 truncate">{r.nota}</div>
                      )}
                    </div>
                    <span className="text-[13px] font-bold text-brand-ink w-6 text-right">{r.pax}</span>
                    <div
                      className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                      style={{ background: dotColor(r.stato) }}
                    />
                  </div>
                ))
              ) : (
                <div className="px-4 py-8 text-center text-[13px] text-[#a8a49e]">
                  Nessuna prenotazione per {turnoTab === "pranzo" ? "pranzo" : "cena"}
                </div>
              )}
            </div>
          </div>

          {/* ═══ COL 2: Selezioni del Giorno + Calici + Lavagna ═══ */}
          <div className="flex flex-col gap-3.5 min-h-0">
          <SelezioniCard data={widgets?.selezioni} />
          <CaliciDisponibiliCard
            title="🥂 Calici al banco"
            compact={true}
            onClick={(v) => navigate(`/vini/magazzino/${v.id}`)}
          />
          {/* La Lavagna — briefing di servizio (stesso widget della Home).
              Qui conta piu' che altrove: la sala atterra su questa pagina, non
              sulla Home. Con ruolo "sala" e' in sola lettura (isAdmin=false):
              briefing e nota si vedono, il campo di scrittura no. */}
          <Lavagna
            lavagna={lavagna}
            loading={lavagnaLoading}
            saving={lavagnaSaving}
            scriviNota={scriviNota}
            rimuoviNota={rimuoviNota}
            isAdmin={false}
          />
          </div>

          {/* ═══ COL 3: Azioni rapide (config da Impostazioni → Home per ruolo) ═══ */}
          <div className="flex flex-row lg:flex-col gap-2.5 overflow-x-auto lg:overflow-visible pb-2 lg:pb-0">
            {salaActions.map((a) => (
              <div
                key={a.id ?? a.key}
                onClick={() => navigate(a.route)}
                className={`rounded-[14px] border cursor-pointer active:scale-[.97] transition-transform flex items-center gap-3 px-4 py-3.5 flex-shrink-0 lg:flex-shrink ${a.color || ""}`}
                style={{ minWidth: 150, boxShadow: "0 2px 10px rgba(0,0,0,.06)" }}
              >
                <span className="text-2xl leading-none">{a.emoji}</span>
                <div>
                  <div className="text-[14px] font-bold leading-tight">{a.label}</div>
                  {a.sub && <div className="text-[11px] opacity-60 mt-0.5 hidden lg:block">{a.sub}</div>}
                </div>
              </div>
            ))}

            <div className="flex-1"></div>

            {/* Link home completa */}
            <Btn
              variant="ghost"
              size="sm"
              onClick={() => navigate("/?full=1")}
              className="lg:mt-2 flex-shrink-0"
            >
              Mostra tutti i moduli →
            </Btn>
          </div>
        </div>
      </div>
    </div>
  );
}
