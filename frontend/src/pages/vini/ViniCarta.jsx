// @version: v2.4-premium-stable
// Carta Vini — Anteprima HTML + PDF + Word
// Allineata al design “Vintage Premium”

import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { API_BASE } from "../../config/api";

const CARTA_URL = `${API_BASE}/vini/carta`;
const CARTA_PDF_URL = `${CARTA_URL}/pdf`;
const CARTA_DOCX_URL = `${CARTA_URL}/docx`;

export default function ViniCarta() {
  const [loading, setLoading] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const navigate = useNavigate();

  const refreshPreview = () => {
    setLoading(true);
    setReloadKey((k) => k + 1);
    setTimeout(() => setLoading(false), 600);
  };

  return (
    <div className="min-h-screen bg-neutral-100 p-6 font-sans">
      <div className="max-w-6xl mx-auto bg-white shadow-2xl rounded-3xl p-12 border border-neutral-200">
        
        {/* HEADER + BACK BUTTON */}
        <div className="flex flex-col sm:flex-row justify-between gap-4 mb-8">
          <div>
            <h1 className="text-4xl font-bold text-center sm:text-left mb-3 text-amber-900 tracking-wide font-playfair">
              📜 Carta dei Vini — Anteprima
            </h1>
            <p className="text-center sm:text-left text-neutral-600">
              Generata automaticamente dal database aggiornato.
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

        {/* TOOLBAR */}
        <div className="flex flex-wrap items-center gap-4 bg-neutral-100 border border-neutral-300 rounded-xl p-5 shadow-inner mb-8">

          {/* AGGIORNA */}
          <button
            onClick={refreshPreview}
            disabled={loading}
            className={`px-6 py-3 rounded-xl text-white font-semibold shadow transition ${
              loading ? "bg-gray-400 cursor-not-allowed" : "bg-amber-700 hover:bg-amber-800"
            }`}
          >
            {loading ? "Aggiornamento…" : "🔄 Aggiorna Anteprima"}
          </button>

          {/* HTML */}
          <a
            href={CARTA_URL}
            target="_blank"
            rel="noreferrer"
            className="px-5 py-3 rounded-xl text-amber-900 border border-amber-300 bg-amber-100 hover:bg-amber-200 transition shadow-sm font-medium"
          >
            🌐 Apri HTML
          </a>

          {/* PDF */}
          <button
            onClick={() => window.open(CARTA_PDF_URL, "_blank")}
            className="px-6 py-3 rounded-xl text-amber-900 bg-yellow-200 border border-yellow-400 shadow hover:bg-yellow-300 transition font-semibold"
          >
            📄 Scarica PDF
          </button>

          {/* WORD */}
          <button
            onClick={() => window.open(CARTA_DOCX_URL, "_blank")}
            className="px-6 py-3 rounded-xl text-blue-900 bg-blue-100 border border-blue-300 shadow hover:bg-blue-200 transition font-semibold"
          >
            📝 Scarica Word
          </button>
        </div>

        {/* ANTEPRIMA */}
        <div className="rounded-2xl shadow-2xl border border-neutral-300 bg-white overflow-hidden">
          {loading ? (
            <div className="h-[80vh] flex items-center justify-center text-amber-900 text-xl font-semibold animate-pulse">
              Caricamento della nuova carta…
            </div>
          ) : (
            <iframe
              key={reloadKey}
              src={CARTA_URL}
              className="w-full"
              style={{
                height: "calc(100vh - 260px)",
                minHeight: "900px",
                border: "none",
              }}
              title="Anteprima Carta Vini"
            />
          )}
        </div>

      </div>
    </div>
  );
}