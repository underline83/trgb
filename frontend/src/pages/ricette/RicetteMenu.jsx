// @version: v2.0-hub-kpi
// Menu hub Gestione Ricette — con KPI rapidi e accesso veloce
import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { API_BASE, apiFetch } from "../../config/api";
import { VersionBadge } from "../../config/versions";
import { isAdminRole } from "../../utils/authHelpers";
import RicetteNav from "./RicetteNav";

export default function RicetteMenu() {
  const navigate = useNavigate();
  const role = localStorage.getItem("role");
  const isAdmin = isAdminRole(role) || role === "sommelier";

  const [stats, setStats] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        const r = await apiFetch(`${API_BASE}/foodcost/ricette`);
        if (r.ok) {
          const ricette = await r.json();
          const attive = ricette.filter((r) => !r.is_disabled);
          const fcValues = attive.filter((r) => r.food_cost_pct != null).map((r) => r.food_cost_pct);
          const avgFc = fcValues.length > 0 ? fcValues.reduce((a, b) => a + b, 0) / fcValues.length : 0;
          const critiche = fcValues.filter((v) => v > 45).length;
          const basi = attive.filter((r) => r.is_base).length;
          setStats({ totale: attive.length, avgFc, critiche, basi });
        }
      } catch {}
    })();
  }, []);

  const tiles = [
    {
      title: "Nuova ricetta",
      subtitle: "Inserimento guidato con sub-ricette",
      icon: "➕",
      path: "/ricette/nuova",
      color: "bg-orange-50 border-orange-200 text-orange-900",
    },
    {
      title: "Archivio ricette",
      subtitle: "Lista completa con food cost calcolato",
      icon: "📚",
      path: "/ricette/archivio",
      color: "bg-blue-50 border-blue-200 text-blue-900",
    },
    {
      title: "Ingredienti & prezzi",
      subtitle: "Anagrafica, fornitori, storico prezzi",
      icon: "🧾",
      path: "/ricette/ingredienti",
      color: "bg-green-50 border-green-200 text-green-900",
    },
    {
      title: "Scelta del Macellaio",
      subtitle: "Tagli di carne disponibili, gestiti da cucina e sala",
      icon: "🥩",
      path: "/macellaio",
      color: "bg-red-50 border-red-200 text-red-900",
    },
    ...(isAdmin
      ? [
          {
            title: "Matching fatture",
            subtitle: "Collega righe fattura XML agli ingredienti",
            icon: "🔗",
            path: "/ricette/matching",
            color: "bg-purple-50 border-purple-200 text-purple-900",
          },
          {
            title: "Dashboard",
            subtitle: "Panoramica food cost e analisi margini",
            icon: "📊",
            path: "/ricette/dashboard",
            color: "bg-indigo-50 border-indigo-200 text-indigo-900",
          },
          {
            title: "Impostazioni",
            subtitle: "Import/export, backup, PDF ricette, macellaio, servizi",
            icon: "⚙️",
            path: "/ricette/settings",
            color: "bg-neutral-50 border-neutral-300 text-neutral-800",
          },
        ]
      : []),
  ];

  return (
    <div className="min-h-screen bg-brand-cream font-sans">
      <RicetteNav current="" />
      <div className="max-w-5xl mx-auto p-4 sm:p-6">

        {/* HEADER */}
        <div className="flex flex-col sm:flex-row justify-between gap-4 mb-6">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <h1 className="text-3xl lg:text-4xl font-bold text-orange-900 tracking-wide font-playfair">
                Gestione Cucina
              </h1>
              <VersionBadge modulo="ricette" />
            </div>
            <p className="text-neutral-600">
              Ricette, food cost, ingredienti e scelta del macellaio.
            </p>
          </div>
        </div>

        {/* KPI CARDS */}
        {stats && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
            <div className="bg-white rounded-xl border border-neutral-200 p-4 text-center shadow-sm">
              <div className="text-2xl font-bold text-orange-900">{stats.totale}</div>
              <div className="text-xs text-neutral-500 mt-1">Ricette attive</div>
            </div>
            <div className="bg-white rounded-xl border border-neutral-200 p-4 text-center shadow-sm">
              <div className={`text-2xl font-bold ${stats.avgFc > 40 ? "text-red-600" : stats.avgFc > 30 ? "text-yellow-600" : "text-green-600"}`}>
                {stats.avgFc.toFixed(1)}%
              </div>
              <div className="text-xs text-neutral-500 mt-1">Food Cost medio</div>
            </div>
            <div className="bg-white rounded-xl border border-neutral-200 p-4 text-center shadow-sm">
              <div className={`text-2xl font-bold ${stats.critiche > 0 ? "text-red-600" : "text-green-600"}`}>
                {stats.critiche}
              </div>
              <div className="text-xs text-neutral-500 mt-1">FC &gt; 45%</div>
            </div>
            <div className="bg-white rounded-xl border border-neutral-200 p-4 text-center shadow-sm">
              <div className="text-2xl font-bold text-blue-700">{stats.basi}</div>
              <div className="text-xs text-neutral-500 mt-1">Ricette base</div>
            </div>
          </div>
        )}

        {/* GRID MENU */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {tiles.map((tile) => (
            <button
              key={tile.title}
              type="button"
              onClick={() => navigate(tile.path)}
              className={`${tile.color} w-full text-left rounded-2xl border p-6 shadow hover:shadow-lg hover:-translate-y-0.5 transition transform cursor-pointer`}
            >
              <div className="text-3xl mb-2">{tile.icon}</div>
              <div className="text-lg font-semibold font-playfair mb-1">{tile.title}</div>
              <div className="text-sm text-neutral-700 opacity-90">{tile.subtitle}</div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
