// src/pages/admin/CorrispettiviMenu.jsx
// @version: v2.0-gestione-vendite-menu
// Hub principale — Gestione Vendite (ex Corrispettivi)

import React, { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { API_BASE, apiFetch } from "../../config/api";
import { VersionBadge } from "../../config/versions";
import VenditeNav from "./VenditeNav";

export default function CorrispettiviMenu() {
  const navigate = useNavigate();
  const role = localStorage.getItem("role");
  const isAdmin = role === "admin";

  // Mini-KPI
  const [kpi, setKpi] = useState(null);
  useEffect(() => {
    const y = new Date().getFullYear();
    const m = new Date().getMonth() + 1;
    apiFetch(`${API_BASE}/admin/finance/stats/monthly?year=${y}&month=${m}`)
      .then((r) => (r.ok ? r.json() : null))
      .then(setKpi)
      .catch(() => {});
  }, []);

  return (
    <div className="min-h-screen bg-neutral-100 font-sans">
      <VenditeNav current="" />

      <div className="p-6">
        <div className="max-w-5xl mx-auto bg-white shadow-2xl rounded-3xl p-12 border border-neutral-200">

          {/* HEADER */}
          <div className="flex flex-col sm:flex-row justify-between gap-4 mb-8">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <h1 className="text-4xl font-bold text-center sm:text-left text-amber-900 tracking-wide font-playfair">
                  💵 Gestione Vendite
                </h1>
                <VersionBadge modulo="corrispettivi" />
              </div>
              <p className="text-center sm:text-left text-neutral-600 mb-1">
                Corrispettivi, chiusure cassa, analisi fatturato e controllo di gestione.
              </p>
              <p className="text-center sm:text-left text-sm text-neutral-500">
                Calendario giornaliero, dashboard riepilogativa, confronto annuale e import Excel.
              </p>
            </div>

            <div className="flex justify-center sm:justify-end gap-2">
              <button
                type="button"
                onClick={() => navigate("/")}
                className="px-4 py-2 rounded-xl text-sm font-medium border border-neutral-300 bg-neutral-50 hover:bg-neutral-100 hover:-translate-y-0.5 shadow-sm transition"
              >
                ← Home
              </button>
            </div>
          </div>

          {/* MINI-KPI */}
          {kpi && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-center">
                <p className="text-[10px] uppercase tracking-wide text-amber-700">Corrispettivi mese</p>
                <p className="text-lg font-bold text-amber-900">
                  € {(kpi.totale_corrispettivi ?? 0).toLocaleString("it-IT", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                </p>
              </div>
              <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 text-center">
                <p className="text-[10px] uppercase tracking-wide text-emerald-700">Incassi mese</p>
                <p className="text-lg font-bold text-emerald-900">
                  € {(kpi.totale_incassi ?? 0).toLocaleString("it-IT", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                </p>
              </div>
              <div className="bg-neutral-50 border border-neutral-200 rounded-xl p-3 text-center">
                <p className="text-[10px] uppercase tracking-wide text-neutral-600">Media giornaliera</p>
                <p className="text-lg font-bold text-neutral-900">
                  € {(kpi.media_corrispettivi ?? 0).toLocaleString("it-IT", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                </p>
              </div>
              <div className="bg-neutral-50 border border-neutral-200 rounded-xl p-3 text-center">
                <p className="text-[10px] uppercase tracking-wide text-neutral-600">Giorni aperti</p>
                <p className="text-lg font-bold text-neutral-900">{kpi.giorni_con_chiusura ?? 0}</p>
              </div>
            </div>
          )}

          {/* MENU GRID */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">

            {/* CALENDARIO & CHIUSURE */}
            <Link
              to="/vendite/chiusure"
              className="bg-green-50 border border-green-200 text-green-900 rounded-2xl p-8 shadow hover:shadow-xl hover:-translate-y-1 transition transform text-center"
            >
              <div className="text-5xl mb-3">📅</div>
              <h2 className="text-xl font-semibold font-playfair">
                Calendario & Chiusure
              </h2>
              <p className="text-neutral-700 text-sm mt-1">
                Seleziona il giorno, inserisci o modifica la chiusura cassa.
              </p>
            </Link>

            {/* DASHBOARD */}
            <Link
              to="/vendite/dashboard"
              className="bg-blue-50 border border-blue-200 text-blue-900 rounded-2xl p-8 shadow hover:shadow-xl hover:-translate-y-1 transition transform text-center"
            >
              <div className="text-5xl mb-3">📊</div>
              <h2 className="text-xl font-semibold font-playfair">
                Dashboard Mensile
              </h2>
              <p className="text-neutral-700 text-sm mt-1">
                Andamento mensile, medie per giorno e differenze cassa.
              </p>
            </Link>

            {/* CONFRONTO ANNUALE */}
            <Link
              to="/vendite/annual"
              className="bg-emerald-50 border border-emerald-200 text-emerald-900 rounded-2xl p-8 shadow hover:shadow-xl hover:-translate-y-1 transition transform text-center"
            >
              <div className="text-5xl mb-3">📈</div>
              <h2 className="text-xl font-semibold font-playfair">
                Confronto Annuale
              </h2>
              <p className="text-neutral-700 text-sm mt-1">
                Confronta anno su anno, variazioni mensili e trend.
              </p>
            </Link>

            {/* IMPORT EXCEL — SOLO ADMIN */}
            {isAdmin ? (
              <Link
                to="/vendite/import"
                className="bg-yellow-50 border border-yellow-200 text-yellow-900 rounded-2xl p-8 shadow hover:shadow-xl hover:-translate-y-1 transition transform text-center sm:col-span-2 lg:col-span-3"
              >
                <div className="text-5xl mb-3">📤</div>
                <h2 className="text-xl font-semibold font-playfair">
                  Importa da Excel (solo Admin)
                </h2>
                <p className="text-neutral-700 text-sm mt-1">
                  Carica i file corrispettivi (archivio, 2025, 2026, …) per aggiornare il database.
                </p>
              </Link>
            ) : (
              <div className="bg-neutral-50 border border-neutral-200 text-neutral-500 rounded-2xl p-8 shadow-inner sm:col-span-2 lg:col-span-3 text-center cursor-not-allowed">
                <div className="text-5xl mb-3">🔒</div>
                <h2 className="text-xl font-semibold font-playfair">
                  Import da Excel (solo Admin)
                </h2>
                <p className="text-neutral-600 text-sm mt-1">
                  L&apos;importazione dei corrispettivi da Excel è riservata all&apos;utente Admin.
                </p>
              </div>
            )}

          </div>
        </div>
      </div>
    </div>
  );
}
