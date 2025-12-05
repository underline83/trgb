// src/pages/admin/CorrispettiviMenu.jsx
// @version: v1.1-admin-corrispettivi-menu

import React from "react";
import { Link, useNavigate } from "react-router-dom";

export default function CorrispettiviMenu() {
  const navigate = useNavigate();
  const role = localStorage.getItem("role");
  const isAdmin = role === "admin";

  return (
    <div className="min-h-screen bg-neutral-100 p-6 font-sans">
      <div className="max-w-5xl mx-auto bg-white shadow-2xl rounded-3xl p-12 border border-neutral-200">

        {/* HEADER */}
        <div className="flex flex-col sm:flex-row justify-between gap-4 mb-8">
          <div>
            <h1 className="text-4xl font-bold text-center sm:text-left mb-4 text-amber-900 tracking-wide font-playfair">
              💵 Corrispettivi — Chiusure Cassa
            </h1>
            <p className="text-center sm:text-left text-neutral-600 mb-1">
              Gestione completa di corrispettivi, chiusure cassa e analisi fatturato.
            </p>
            <p className="text-center sm:text-left text-sm text-neutral-500">
              Calendario giornaliero, dashboard riepilogativa e import Excel multi-anno.
            </p>
          </div>

          <div className="flex justify-center sm:justify-end gap-2">
            <button
              type="button"
              onClick={() => navigate("/admin")}
              className="
                px-4 py-2 rounded-xl text-sm font-medium
                border border-neutral-300 bg-neutral-50
                hover:bg-neutral-100 hover:-translate-y-0.5
                shadow-sm transition
              "
            >
              ← Torna ad Amministrazione
            </button>
          </div>
        </div>

        {/* MENU GRID */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">

          {/* CALENDARIO & CHIUSURE */}
          <Link
            to="/admin/corrispettivi/gestione"
            className="
              bg-green-50 border border-green-200 text-green-900
              rounded-2xl p-8 shadow
              hover:shadow-xl hover:-translate-y-1 transition transform
              text-center
            "
          >
            <div className="text-5xl mb-3">📅</div>
            <h2 className="text-xl font-semibold font-playfair">
              Calendario & Chiusure
            </h2>
            <p className="text-neutral-700 text-sm mt-1">
              Seleziona il giorno, inserisci o modifica la chiusura cassa.
            </p>
            <p className="text-neutral-500 text-xs mt-1">
              In futuro: vista calendario mensile con stato aperto/chiuso per ogni data.
            </p>
          </Link>

          {/* DASHBOARD CORRISPETTIVI */}
          <Link
            to="/admin/corrispettivi/dashboard"
            className="
              bg-blue-50 border border-blue-200 text-blue-900
              rounded-2xl p-8 shadow
              hover:shadow-xl hover:-translate-y-1 transition transform
              text-center
            "
          >
            <div className="text-5xl mb-3">📊</div>
            <h2 className="text-xl font-semibold font-playfair">
              Dashboard Corrispettivi
            </h2>
            <p className="text-neutral-700 text-sm mt-1">
              Andamento mensile/annuale, medie per giorno e differenze cassa.
            </p>
          </Link>

          {/* IMPORT EXCEL — SOLO ADMIN CLICCABILE */}
          {isAdmin ? (
            <Link
              to="/admin/corrispettivi/import"
              className="
                bg-yellow-50 border border-yellow-200 text-yellow-900
                rounded-2xl p-8 shadow
                hover:shadow-xl hover:-translate-y-1 transition transform
                text-center sm:col-span-2
              "
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
            <div
              className="
                bg-neutral-50 border border-neutral-200 text-neutral-500
                rounded-2xl p-8 shadow-inner
                sm:col-span-2
                text-center cursor-not-allowed
              "
            >
              <div className="text-5xl mb-3">🔒</div>
              <h2 className="text-xl font-semibold font-playfair">
                Import da Excel (solo Admin)
              </h2>
              <p className="text-neutral-600 text-sm mt-1">
                L&apos;importazione dei corrispettivi da Excel è riservata all&apos;utente Admin.
              </p>
              <p className="text-neutral-400 text-xs mt-1">
                Puoi comunque lavorare sulle chiusure giornaliere già importate.
              </p>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}