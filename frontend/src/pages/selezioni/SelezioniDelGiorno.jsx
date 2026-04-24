// @version: v1.0-selezioni — Pagina shell unica per le 4 zone (macellaio/pescato/salumi/formaggi)
// Layout sidebar a sinistra + contenuto a destra (stile uniformato a ViniImpostazioni / ClientiImpostazioni).
// La zona attiva e' presa da useParams(":zona"). I 4 pannelli sono renderizzati da <ZonaPanel />
// guidato da ZONA_CONFIG.

import React from "react";
import { useNavigate, useParams, Navigate } from "react-router-dom";
import { Btn } from "../../components/ui";
import ZonaPanel from "./ZonaPanel";
import { ZONA_CONFIG, ZONA_ORDER, isValidZona } from "./zonaConfig";
import RicetteNav from "../ricette/RicetteNav";

export default function SelezioniDelGiorno() {
  const navigate = useNavigate();
  const { zona } = useParams();

  // Se zona mancante o invalida → redirect alla prima zona dell'ordine
  if (!zona) return <Navigate to={`/selezioni/${ZONA_ORDER[0]}`} replace />;
  if (!isValidZona(zona)) return <Navigate to={`/selezioni/${ZONA_ORDER[0]}`} replace />;

  const cfgAttiva = ZONA_CONFIG[zona];

  return (
    <div className="min-h-screen bg-brand-cream font-sans">
      <RicetteNav current="selezioni" />
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6">

        {/* HEADER PAGINA */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-brand-ink flex items-center gap-2">
              <span>🍽️</span>
              <span>Selezioni del Giorno</span>
            </h1>
            <p className="text-sm text-neutral-500 mt-1">
              Macellaio, Pescato, Salumi e Formaggi — disponibilita' del giorno per la sala
            </p>
          </div>
          <Btn variant="ghost" size="md" onClick={() => navigate("/")}>
            ← Home
          </Btn>
        </div>

        {/* LAYOUT SIDEBAR + CONTENT */}
        <div className="flex gap-6">

          {/* SIDEBAR */}
          <div className="w-56 flex-shrink-0">
            <h2 className="text-xs font-bold text-neutral-400 uppercase tracking-wider mb-3 px-3">
              Zone
            </h2>
            <nav className="space-y-0.5">
              {ZONA_ORDER.map(key => {
                const cfg = ZONA_CONFIG[key];
                const active = key === zona;
                return (
                  <button
                    key={key}
                    onClick={() => navigate(`/selezioni/${key}`)}
                    className={`w-full text-left px-3 py-2.5 rounded-lg transition flex items-start gap-2.5 min-h-[44px] ${
                      active
                        ? `${cfg.accent.active} shadow-sm`
                        : "text-neutral-600 hover:bg-neutral-100 hover:text-neutral-800"
                    }`}
                  >
                    <span className="text-base mt-0.5">{cfg.icon}</span>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium">
                        {cfg.label}
                      </div>
                      {cfg.desc && (
                        <div className={`text-[11px] mt-0.5 leading-tight ${
                          active ? "opacity-80" : "text-neutral-400"
                        }`}>
                          {cfg.desc}
                        </div>
                      )}
                    </div>
                  </button>
                );
              })}
            </nav>
          </div>

          {/* CONTENT */}
          <div className="flex-1 min-w-0">
            <main className="bg-white border border-neutral-200 rounded-2xl p-6 shadow-sm min-h-[500px]">
              <ZonaPanel zona={zona} key={zona} />
            </main>
          </div>

        </div>
      </div>
    </div>
  );
}
