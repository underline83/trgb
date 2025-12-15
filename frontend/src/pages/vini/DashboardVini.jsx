// @version: v0.1-dashboard-vini-placeholder
// Dashboard Vini — placeholder (in sviluppo)

import React from "react";
import { useNavigate } from "react-router-dom";
import MagazzinoSubMenu from "../../components/vini/MagazzinoSubMenu";

export default function DashboardVini() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-neutral-100 p-6 font-sans">
      <div className="max-w-4xl mx-auto bg-white shadow-2xl rounded-3xl p-8 border border-neutral-200">
        <h1 className="text-3xl font-bold text-amber-900 font-playfair mb-4">
          📊 Dashboard Vini
        </h1>

        <MagazzinoSubMenu />

        <p className="text-neutral-600 text-sm">
          Modulo in sviluppo.
          <br />
          Qui confluiranno:
        </p>

        <ul className="mt-3 list-disc list-inside text-sm text-neutral-700 space-y-1">
          <li>Vendite per periodo</li>
          <li>Vini fermi da X giorni</li>
          <li>Alert giacenze basse</li>
          <li>Rotazione cantina</li>
        </ul>

        <button
          onClick={() => navigate("/vini")}
          className="mt-6 px-4 py-2 rounded-xl text-sm border border-neutral-300 bg-neutral-50 hover:bg-neutral-100"
        >
          ← Torna al menu vini
        </button>
      </div>
    </div>
  );
}