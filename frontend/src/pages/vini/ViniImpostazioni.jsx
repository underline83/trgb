// @version: v1.0-vini-impostazioni-menu-finale
// Impostazioni Modulo Vini — Vintage Premium (Admin tools + liste controllate)

import React from "react";
import { Link, useNavigate } from "react-router-dom";

export default function ViniImpostazioni() {
  const navigate = useNavigate();
  const role = localStorage.getItem("role"); // "admin" ecc.
  const isAdmin = role === "admin";

  return (
    <div className="min-h-screen bg-neutral-100 p-6 font-sans">
      <div className="max-w-5xl mx-auto bg-white shadow-2xl rounded-3xl p-12 border border-neutral-200">
        {/* HEADER */}
        <div className="flex flex-col sm:flex-row justify-between gap-4 mb-8">
          <div>
            <h1 className="text-4xl font-bold text-center sm:text-left mb-4 text-amber-900 tracking-wide font-playfair">
              ⚙️ Impostazioni Modulo Vini
            </h1>
            <p className="text-center sm:text-left text-neutral-600 mb-2">
              Import, allineamenti, liste controllate e strumenti tecnici.
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

        {/* GRID */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          {/* LISTE CONTROLLATE */}
          <div
            className="
              bg-amber-50 border border-amber-200 text-amber-900
              rounded-2xl p-8 shadow
              text-center
            "
          >
            <div className="text-5xl mb-3">📚</div>
            <h2 className="text-xl font-semibold font-playfair">
              Liste controllate
            </h2>
            <p className="text-neutral-700 text-sm mt-1">
              Tipologie, Nazioni, Regioni, Produttori (source: magazzino)
            </p>
            <div className="mt-4 text-xs text-neutral-600">
              (UI in arrivo — per ora le liste derivano dai dati esistenti)
            </div>
          </div>

          {/* IMPORT CARTA (EXCEL) */}
          <div
            className={
              `
              rounded-2xl p-8 shadow text-center border
              ` +
              (isAdmin
                ? "bg-blue-50 border-blue-200 text-blue-900 hover:shadow-xl hover:-translate-y-1 transition transform"
                : "bg-neutral-50 border-neutral-300 text-neutral-400 cursor-not-allowed")
            }
            title={!isAdmin ? "Solo admin" : ""}
          >
            <div className="text-5xl mb-3">📥</div>
            <h2 className="text-xl font-semibold font-playfair">
              Import / Database Carta (Excel)
            </h2>
            <p className="text-sm mt-1">
              Import, refresh, verifiche coerenza
            </p>
            {!isAdmin && (
              <span className="inline-block mt-3 text-xs font-semibold bg-neutral-200 px-2 py-0.5 rounded">
                Solo admin
              </span>
            )}
            {isAdmin && (
              <div className="mt-4 text-xs text-neutral-700">
                Vai da <strong>Database & Ricerca Vini</strong> per ora.
              </div>
            )}
          </div>

          {/* ALLINEAMENTO ID / SICUREZZA DB */}
          <div
            className={
              `
              rounded-2xl p-8 shadow text-center border relative
              ` +
              (isAdmin
                ? "bg-purple-50 border-purple-200 text-purple-900"
                : "bg-neutral-50 border-neutral-300 text-neutral-400 cursor-not-allowed")
            }
            title={!isAdmin ? "Solo admin" : ""}
          >
            <div className="text-5xl mb-3">🛡️</div>
            <h2 className="text-xl font-semibold font-playfair">
              Allineamenti & Protezioni ID
            </h2>
            <p className="text-sm mt-1">
              Fix ID, check duplicati, modalità import sicura
            </p>
            <span className="absolute top-3 right-4 text-xs font-semibold bg-neutral-200 px-2 py-0.5 rounded">
              In sviluppo
            </span>
            {!isAdmin && (
              <span className="inline-block mt-3 text-xs font-semibold bg-neutral-200 px-2 py-0.5 rounded">
                Solo admin
              </span>
            )}
          </div>

          {/* TOOL TECNICI */}
          <div
            className="
              bg-neutral-50 border border-neutral-300 text-neutral-800
              rounded-2xl p-8 shadow
              text-center
            "
          >
            <div className="text-5xl mb-3">🧰</div>
            <h2 className="text-xl font-semibold font-playfair">
              Tool tecnici
            </h2>
            <p className="text-neutral-700 text-sm mt-1">
              Diagnostica, export, manutenzione
            </p>
            <div className="mt-4 text-xs text-neutral-600">
              (UI in arrivo)
            </div>
          </div>
        </div>

        {/* FOOTER */}
        <div className="mt-8 text-xs text-neutral-500">
          Nota: alcune sezioni sono volutamente “In sviluppo” per mantenere il menu
          già identico a come sarà a fine progetto.
        </div>
      </div>
    </div>
  );
}