// src/pages/admin/CorrispettiviMenu.jsx
// @version: v2.0-gestione-vendite-menu
// Hub principale — Gestione Vendite (ex Corrispettivi)

import React, { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { API_BASE, apiFetch } from "../../config/api";
import { VersionBadge } from "../../config/versions";
import { isAdminRole, isSuperAdminRole } from "../../utils/authHelpers";
import VenditeNav from "./VenditeNav";

export default function CorrispettiviMenu() {
  const navigate = useNavigate();
  const role = localStorage.getItem("role");
  const isAdmin = isAdminRole(role);

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
    <div className="min-h-screen bg-brand-cream font-sans">
      <VenditeNav current="" />

      <div className="p-6">
        <div className="max-w-5xl mx-auto bg-white shadow-2xl rounded-3xl p-12 border border-neutral-200">

          {/* HEADER */}
          <div className="flex flex-col sm:flex-row justify-between gap-4 mb-8">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <h1 className="text-4xl font-bold text-center sm:text-left text-indigo-900 tracking-wide font-playfair">
                  💵 Gestione Vendite
                </h1>
                <VersionBadge modulo="corrispettivi" />
              </div>
              <p className="text-center sm:text-left text-neutral-600 mb-1">
                Corrispettivi, chiusure cassa, analisi fatturato e controllo di gestione.
              </p>
              <p className="text-center sm:text-left text-sm text-neutral-500">
                Calendario giornaliero, dashboard riepilogativa e import Excel.
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
              <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-3 text-center">
                <p className="text-[10px] uppercase tracking-wide text-indigo-700">Corrispettivi mese</p>
                <p className="text-lg font-bold text-indigo-900">
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

          {/* ── TILE PRINCIPALI ── */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 mb-8">

            {/* CHIUSURA TURNO — form inserimento */}
            <Link
              to="/vendite/fine-turno"
              className="bg-indigo-50 border border-indigo-200 text-indigo-900 rounded-2xl p-8 shadow hover:shadow-xl hover:-translate-y-1 transition transform text-center"
            >
              <div className="text-5xl mb-3">🔔</div>
              <h2 className="text-xl font-semibold font-playfair">
                Chiusura Turno
              </h2>
              <p className="text-neutral-600 text-sm mt-1">
                Compila la chiusura fine servizio pranzo o cena.
              </p>
            </Link>

            {/* LISTA CHIUSURE — storico admin */}
            {isAdmin && (
              <Link
                to="/vendite/chiusure"
                className="bg-green-50 border border-green-200 text-green-900 rounded-2xl p-8 shadow hover:shadow-xl hover:-translate-y-1 transition transform text-center"
              >
                <div className="text-5xl mb-3">📋</div>
                <h2 className="text-xl font-semibold font-playfair">
                  Lista Chiusure
                </h2>
                <p className="text-neutral-600 text-sm mt-1">
                  Storico chiusure turno con dettaglio, quadratura e filtri.
                </p>
              </Link>
            )}

            {/* RIEPILOGO MENSILE */}
            {isAdmin && (
              <Link
                to="/vendite/riepilogo"
                className="bg-blue-50 border border-blue-200 text-blue-900 rounded-2xl p-8 shadow hover:shadow-xl hover:-translate-y-1 transition transform text-center"
              >
                <div className="text-5xl mb-3">📅</div>
                <h2 className="text-xl font-semibold font-playfair">
                  Riepilogo Mensile
                </h2>
                <p className="text-neutral-600 text-sm mt-1">
                  Lista chiusure mese per mese, totali annuali e medie giornaliere.
                </p>
              </Link>
            )}

            {/* DASHBOARD */}
            {isAdmin && (
              <Link
                to="/vendite/dashboard"
                className="bg-blue-50 border border-blue-200 text-blue-900 rounded-2xl p-8 shadow hover:shadow-xl hover:-translate-y-1 transition transform text-center"
              >
                <div className="text-5xl mb-3">📊</div>
                <h2 className="text-xl font-semibold font-playfair">
                  Dashboard
                </h2>
                <p className="text-neutral-600 text-sm mt-1">
                  Analisi mensile, trimestrale e annuale con confronto anno su anno.
                </p>
              </Link>
            )}

            {/* GESTIONE CONTANTI — superadmin */}
            {isSuperAdminRole(role) && (
              <Link
                to="/vendite/contanti"
                className="bg-orange-50 border border-orange-200 text-orange-900 rounded-2xl p-8 shadow hover:shadow-xl hover:-translate-y-1 transition transform text-center"
              >
                <div className="text-5xl mb-3">💰</div>
                <h2 className="text-xl font-semibold font-playfair">
                  Gestione Contanti
                </h2>
                <p className="text-neutral-600 text-sm mt-1">
                  Contanti da versare, pre-conti e versamenti banca.
                </p>
              </Link>
            )}

            {/* IMPORT & IMPOSTAZIONI */}
            {isAdmin && (
              <Link
                to="/vendite/impostazioni"
                className="bg-yellow-50 border border-yellow-200 text-yellow-900 rounded-2xl p-8 shadow hover:shadow-xl hover:-translate-y-1 transition transform text-center"
              >
                <div className="text-5xl mb-3">⚙️</div>
                <h2 className="text-xl font-semibold font-playfair">
                  Import & Impostazioni
                </h2>
                <p className="text-neutral-600 text-sm mt-1">
                  Carica corrispettivi da Excel, configura impostazioni vendite.
                </p>
              </Link>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
