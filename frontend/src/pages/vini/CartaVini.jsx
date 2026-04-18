// @version: v3.5-carta-bevande — rinominato da ViniCarta.jsx, ora sub-pagina della Carta Bevande
// Pagina Carta Vini — Anteprima embedded + Export (HTML/PDF/DOCX)
// Accessibile da /vini/carta/vini (hub Carta Bevande → card "Vini")

import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { API_BASE } from "../../config/api";
import ViniNav from "./ViniNav";
import { Btn } from "../../components/ui";

export default function CartaVini() {
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
    <div className="min-h-screen bg-brand-cream font-sans">
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

          <Btn variant="secondary" size="md" type="button" onClick={() => navigate("/vini/carta")}>
            ← Carta delle Bevande
          </Btn>
        </div>

        {/* BOTTONI */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-8">
          <Btn variant="primary" size="md" type="button" onClick={refreshPreview}>
            Aggiorna Anteprima
          </Btn>
          <Btn variant="secondary" size="md" type="button" onClick={openHtml}>
            Apri HTML
          </Btn>
          <Btn variant="secondary" size="md" type="button" onClick={downloadPdf}>
            Scarica PDF
          </Btn>
          <Btn variant="secondary" size="md" type="button" onClick={downloadWord}>
            Scarica Word
          </Btn>
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