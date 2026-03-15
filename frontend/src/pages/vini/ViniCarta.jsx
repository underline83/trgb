// @version: v3.3-carta-vini-anteprima
// Pagina Carta Vini — Anteprima embedded + Export (HTML/PDF/DOCX)

import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { API_BASE } from "../../config/api";
import ViniNav from "./ViniNav";

export default function ViniCarta() {
  const navigate = useNavigate();

  const [showPreview, setShowPreview] = useState(true);

  const cartaPublicUrl = `${API_BASE}/vini/carta`;
  const cartaPublicSiteUrl = "https://trgb.tregobbi.it/carta-vini";


  // --------------------------------------------------
  // AZIONI
  // --------------------------------------------------
  const refreshPreview = () => {
    setShowPreview(false);
    setTimeout(() => setShowPreview(true), 50);
  };

  const openHtml = () => {
    window.open(cartaPublicSiteUrl, "_blank");
  };

  const downloadPdf = () => {
    window.open(`${API_BASE}/vini/carta/pdf`, "_blank");
  };

  const downloadWord = () => {
    window.open(`${API_BASE}/vini/carta/docx`, "_blank");
  };

  // --------------------------------------------------
  // RENDER
  // --------------------------------------------------
  return (
    <div className="min-h-screen bg-neutral-100 font-sans">
      <ViniNav current="carta" />
      <div className="max-w-6xl mx-auto p-4 sm:p-6">
      <div className="bg-white shadow-xl rounded-2xl p-6 sm:p-8 border border-neutral-200">

        {/* HEADER */}
        <div className="flex flex-col lg:flex-row justify-between gap-4 mb-6">
          <div>
            <h1 className="text-3xl lg:text-4xl font-bold text-amber-900 tracking-wide font-playfair mb-2">
              📜 Carta dei Vini
            </h1>
            <p className="text-neutral-600">
              Anteprima live ed esportazioni (HTML, PDF, Word).
            </p>
          </div>

          <button
            type="button"
            onClick={() => navigate("/vini")}
            className="px-4 py-2 rounded-xl text-sm font-medium border border-neutral-300 bg-neutral-50 hover:bg-neutral-100 shadow-sm transition"
          >
            ← Menu Vini
          </button>
        </div>

        {/* BOTTONI */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-8">
          <button
            type="button"
            onClick={refreshPreview}
            className="px-4 py-3 rounded-2xl text-sm font-semibold bg-amber-700 text-white hover:bg-amber-800 shadow-sm transition"
          >
            Aggiorna Anteprima
          </button>

          <button
            type="button"
            onClick={openHtml}
            className="px-4 py-3 rounded-2xl text-sm font-semibold border border-neutral-300 bg-neutral-50 hover:bg-neutral-100 shadow-sm transition"
          >
            Apri HTML
          </button>

          <button
            type="button"
            onClick={downloadPdf}
            className="px-4 py-3 rounded-2xl text-sm font-semibold border border-neutral-300 bg-neutral-50 hover:bg-neutral-100 shadow-sm transition"
          >
            Scarica PDF
          </button>

          <button
            type="button"
            onClick={downloadWord}
            className="px-4 py-3 rounded-2xl text-sm font-semibold border border-neutral-300 bg-neutral-50 hover:bg-neutral-100 shadow-sm transition"
          >
            Scarica Word
          </button>

        </div>

        {/* ANTEPRIMA EMBEDDED */}
        <div className="mb-8 border border-neutral-200 rounded-2xl overflow-hidden">
          <div className="px-4 py-3 bg-neutral-100 border-b border-neutral-200">
            <div className="text-sm font-semibold text-neutral-800">
              Anteprima Carta Vini (live)
            </div>
            <div className="text-xs text-neutral-500">
              Questa è la stessa carta pubblica visibile dal sito.
            </div>
          </div>

          {showPreview && (
            <iframe
              src={cartaPublicUrl}
              title="Carta Vini"
              className="w-full"
              style={{ height: "80vh", border: "none" }}
            />
          )}
        </div>

      </div>
      </div>
    </div>
  );
}