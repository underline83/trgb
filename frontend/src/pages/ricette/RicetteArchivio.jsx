// @version: v0.1
import React from "react";
import { useNavigate } from "react-router-dom";

export default function RicetteArchivio() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-neutral-100 p-6">
      <div className="max-w-5xl mx-auto bg-white rounded-3xl shadow-2xl p-10 border">

        <div className="flex justify-end mb-6">
          <button
            onClick={() => navigate("/ricette")}
            className="px-4 py-2 rounded-xl border bg-neutral-50 hover:bg-neutral-100 transition"
          >
            ← Torna al Menu Ricette
          </button>
        </div>

        <h1 className="text-4xl font-playfair text-blue-900 mb-3">
          📚 Archivio Ricette
        </h1>
        <p className="text-neutral-600 mb-6">
          Lista completa, filtri e ricerca.
        </p>

        <div className="bg-neutral-50 border border-neutral-300 p-6 rounded-xl shadow-inner">
          Archivio in sviluppo…
        </div>

      </div>
    </div>
  );
}