// FILE: frontend/src/pages/HomeSommelier.jsx
// @version: v1.0 — Home del sommelier (2026-11-05)
// Modulo: vini (pagina Home per ruolo, come DashboardSala e HomeCucina)
//
// Marco 2026-11-05: si parte dal sommelier per vedere come la usano.
//   In testa  — i tasti (Impostazioni › Home per ruolo, ruolo sommelier)
//   Sinistra  — 🍾 Vendi o apri (stessa registrazione di Vini › Vendite) + 🥂 Calici aperti
//   Centro    — 📦 Da riordinare, 🚚 Ordini in arrivo
//   Destra    — 🧾 Fatture da abbinare, 📑 Listini, 📉 Esauriti in carta
// Tutto si ricarica da solo ogni 3 minuti; dopo una vendita i calici subito.
// «Mostra tutti i moduli» porta alla Home completa (/?full=1), come per la sala.

import React, { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { API_BASE, apiFetch } from "../config/api";
import useHomeActions from "../hooks/useHomeActions";
import useAutoRefresh from "../hooks/useAutoRefresh";
import AzioniRapideStrip from "../components/widgets/AzioniRapideStrip";
import VendiOApriCard from "../components/widgets/VendiOApriCard";
import CaliciDisponibiliCard from "../components/widgets/CaliciDisponibiliCard";
import TodoPersonale from "../components/widgets/TodoPersonale";
import {
  RiordinoCard, InArrivoCard, FattureViniCard, ListiniCard, EsauritiCartaCard,
} from "../components/widgets/CantinaWidgets";
import { Btn } from "../components/ui";

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

const leggi = async (url) => {
  try {
    const r = await apiFetch(`${API_BASE}${url}`);
    return r.ok ? await r.json() : null;
  } catch { return null; }
};

export default function HomeSommelier() {
  const navigate = useNavigate();
  const displayName = localStorage.getItem("display_name") || localStorage.getItem("username") || "";
  const { actions } = useHomeActions("sommelier");
  const [dati, setDati] = useState({});
  const [aggiornaCalici, setAggiornaCalici] = useState(0);

  const carica = useCallback(async () => {
    const [fornitori, riepilogo, conteggi, listini, dashboard] = await Promise.all([
      leggi("/vini/ordini/fornitori/"),
      leggi("/vini/ordini/riepilogo/"),
      leggi("/vini/multifornitore/fatture/conteggi/"),
      leggi("/vini/multifornitore/listini/"),
      leggi("/vini/magazzino/dashboard"),
    ]);
    setDati({ fornitori, riepilogo, conteggi, listini, dashboard });
  }, []);
  useEffect(() => { carica(); }, [carica]);
  useAutoRefresh(carica);

  return (
    <div className="bg-brand-cream min-h-[calc(100dvh-56px)]">
      <div className="px-5 lg:px-8 pt-4 pb-2">
        <h1 className="font-playfair text-2xl lg:text-[28px] font-bold text-brand-ink tracking-tight leading-tight">
          {getGreeting()}, {displayName.split(" ")[0]}
        </h1>
        <p className="text-xs text-[#a8a49e] font-medium mt-1">{formatDate()}</p>
      </div>

      <div className="px-5 lg:px-8 pb-6 flex flex-col gap-3.5">
        <AzioniRapideStrip actions={actions} onGo={(route) => navigate(route)} />

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)_minmax(0,1fr)] gap-3.5 items-start">
          {/* Sinistra: vendere e aprire, poi i calici in mescita */}
          <div className="flex flex-col gap-3.5 md:col-span-2 lg:col-span-1">
            <VendiOApriCard onRegistrata={() => setAggiornaCalici((n) => n + 1)} />
            <CaliciDisponibiliCard
              title="🥂 Calici aperti"
              compact={true}
              showResetTimer
              aggiorna={aggiornaCalici}
              onClick={(v) => navigate(`/vini/magazzino/${v.id}`)}
            />
          </div>

          {/* Centro: cosa manca e cosa arriva */}
          <div className="flex flex-col gap-3.5">
            <RiordinoCard fornitori={dati.fornitori} />
            <InArrivoCard fornitori={dati.fornitori} riepilogo={dati.riepilogo} />
          </div>

          {/* Destra: cosa registrare */}
          <div className="flex flex-col gap-3.5">
            <FattureViniCard conteggi={dati.conteggi} />
            <ListiniCard listini={dati.listini} />
            <EsauritiCartaCard dashboard={dati.dashboard} />
            <TodoPersonale compact />
          </div>
        </div>

        <div className="flex justify-center">
          <Btn variant="ghost" size="sm" onClick={() => navigate("/?full=1")}>Mostra tutti i moduli →</Btn>
        </div>
      </div>
    </div>
  );
}
