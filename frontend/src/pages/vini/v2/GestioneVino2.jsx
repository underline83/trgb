// src/pages/vini/v2/GestioneVino2.jsx
// Modulo: vini (V.6+V.7+V.8 — Modulo "Cantina 2", test parallelo read-only)
//
// Entry point della nuova "Cantina 2" che legge dalle tabelle _v2.
// Strategia: parallelo al modulo Vini classico, read-only durante la fase
// di test (1-3 settimane). Al cutover (Fase 10) il classico sparisce e
// questo prende il suo posto.
//
// Rinomina M2.5-arch (2026-05-16): label "Gestione 2" → "Cantina 2".
// La parola "Gestione" viene liberata per il nuovo tab "Anagrafiche" dedicato
// a produttori/distributori/denominazioni/vitigni/madre. Il file resta come
// GestioneVino2.jsx (path /vini/v2) per non rompere link/routing esistenti.
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

      {/* Header unico: brand + sub-nav + warning READ-ONLY in linea (compatto come Cantina classica) */}
      <div className="bg-white border-b border-neutral-200 shadow-sm">
        <div className="max-w-[1100px] mx-auto px-3 py-2 flex items-center gap-3">
          <h1 className="text-xl font-bold text-amber-900 tracking-wide whitespace-nowrap">🧪 Cantina 2</h1>
          <div className="flex items-center gap-0.5">
            {SUBTABS.map(tab => {
              const active = activeSub === tab.key;
              return (
                <button
                  key={tab.key}
                  onClick={() => navigate(tab.path)}
                  className={`px-2.5 py-1.5 rounded-lg text-xs font-medium transition whitespace-nowrap ${
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
          <span className="ml-auto inline-flex items-center gap-1.5 text-[10px] text-rose-700 bg-rose-50 border border-rose-200 px-2 py-1 rounded-md whitespace-nowrap">
            <span>🔒</span>
            <span><strong>READ-ONLY</strong></span>
            <button onClick={() => navigate("/vini/magazzino")} className="underline hover:text-rose-900">
              modifica in Cantina classica →
            </button>
          </span>
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
