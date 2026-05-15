// src/pages/vini/v2/GestioneVino2.jsx
// Modulo: vini (V.6+V.7+V.8 — Modulo Gestione Vino 2, test parallelo read-only)
//
// Entry point del nuovo modulo "Gestione Vino 2" che legge dalle tabelle _v2.
// Strategia: parallelo al modulo Vini classico, read-only durante la fase
// di test (1-3 settimane). Al cutover (Fase 10) il classico sparisce e
// questo prende il suo posto.
//
// Sub-nav: Cantina · Per Produttore · Nuovo (3-step preview) · Scheda
// (la scheda si apre cliccando una bottiglia dalla Cantina)

import React, { useState } from "react";
import { Routes, Route, useNavigate, useLocation, Navigate } from "react-router-dom";
import ViniNav from "../ViniNav";
import CantinaV2 from "./CantinaV2";
import PerProduttoreV2 from "./PerProduttoreV2";
import NuovoVinoV2 from "./NuovoVinoV2";
import SchedaVinoV2 from "./SchedaVinoV2";

const SUBTABS = [
  { key: "cantina",      label: "Cantina",      icon: "🍷", path: "/vini/v2/cantina" },
  { key: "produttore",   label: "Per produttore", icon: "🏛️", path: "/vini/v2/produttore" },
  { key: "nuovo",        label: "Nuovo vino",   icon: "➕", path: "/vini/v2/nuovo" },
];

export default function GestioneVino2() {
  const navigate = useNavigate();
  const location = useLocation();

  // Quale sub-tab è attiva (basato sul path)
  const activeSub = SUBTABS.find(t => location.pathname.startsWith(t.path))?.key
    || (location.pathname.startsWith("/vini/v2/bottiglia/") ? "cantina" : "cantina");

  return (
    <div className="min-h-screen bg-brand-cream font-sans">
      <ViniNav current="v2" />

      {/* Banner test parallelo */}
      <div className="bg-rose-50 border-b border-rose-200">
        <div className="max-w-[1100px] mx-auto px-3 py-1.5 flex items-center gap-2 text-[11px] text-rose-800">
          <span>🧪</span>
          <span>
            <strong>Modulo Gestione Vino 2 — test parallelo, READ-ONLY.</strong>{" "}
            Legge dalle tabelle <code className="font-mono bg-rose-100 px-1 py-0.5 rounded">_v2</code> del refactor anagrafiche.
            Per modificare un vino, usa la <button onClick={() => navigate("/vini/magazzino")} className="underline">Cantina classica</button>.
          </span>
        </div>
      </div>

      {/* Sub-nav delle 4 viste */}
      <div className="bg-white border-b border-neutral-200 shadow-sm">
        <div className="max-w-[1100px] mx-auto px-3 py-2 flex items-center justify-between">
          <div className="flex items-center gap-1">
            {SUBTABS.map(tab => {
              const active = activeSub === tab.key;
              return (
                <button
                  key={tab.key}
                  onClick={() => navigate(tab.path)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition whitespace-nowrap ${
                    active
                      ? "bg-amber-100 text-amber-900 shadow-sm"
                      : "text-neutral-600 hover:bg-neutral-100"
                  }`}
                >
                  <span className="mr-1">{tab.icon}</span>{tab.label}
                </button>
              );
            })}
          </div>
          <div className="text-[10px] text-neutral-400">v2 · prefisso API /vini/v2/</div>
        </div>
      </div>

      {/* Contenuto */}
      <Routes>
        <Route index element={<Navigate to="cantina" replace />} />
        <Route path="cantina" element={<CantinaV2 />} />
        <Route path="produttore" element={<PerProduttoreV2 />} />
        <Route path="nuovo" element={<NuovoVinoV2 />} />
        <Route path="bottiglia/:id" element={<SchedaVinoV2 />} />
        <Route path="*" element={<Navigate to="cantina" replace />} />
      </Routes>
    </div>
  );
}
