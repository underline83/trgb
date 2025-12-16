// @version: v1.0-dashboard-vini-placeholder
// Dashboard Vini — Placeholder (in sviluppo)

import React from "react";
import { useNavigate } from "react-router-dom";

export default function DashboardVini() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-neutral-100 p-6 font-sans">
      <div className="max-w-5xl mx-auto bg-white shadow-2xl rounded-3xl p-12 border border-neutral-200">
        <div className="flex flex-col sm:flex-row justify-between gap-4 mb-8">
          <div>
            <h1 className="text-4xl font-bold text-center sm:text-left mb-4 text-amber-900 tracking-wide font-playfair">
              📊 Dashboard Vini
            </h1>
            <p className="text-center sm:text-left text-neutral-600">
              Modulo in sviluppo: vendite, movimentazioni, vini fermi, alert.
            </p>
          </div>

          <div className="flex justify-center sm:justify-end">
            <button
              type="button"
              onClick={() => navigate("/vini")}
              className="
                px-4 py-2 rounded-xl text-sm font-medium
                border border-neutral-300 bg-neutral-50
                hover:bg-neutral-100 hover:-translate-y-0.5
                shadow-sm transition
              "
            >
              ← Torna al Menu Vini
            </button>
          </div>
        </div>

        <div className="bg-neutral-50 border border-neutral-200 rounded-2xl p-6 text-neutral-700">
          <div className="font-semibold mb-2">Cosa arriverà qui:</div>
          <ul className="list-disc pl-5 space-y-1 text-sm">
            <li>Vendite bottiglia / calice</li>
            <li>Movimentazioni (carico / scarico / rettifiche / rotture)</li>
            <li>Vini fermi da tempo</li>
            <li>Alert giacenza / prezzi / anomalie</li>
          </ul>
        </div>
      </div>
    </div>
  );
}