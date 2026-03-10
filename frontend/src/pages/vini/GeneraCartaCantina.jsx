// FILE: frontend/src/pages/vini/GeneraCartaCantina.jsx
// @version: v1.0
// Genera Carta PDF / DOCX dal DB cantina — visibile a tutti nel menu Cantina

import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { API_BASE } from "../../config/api";
import MagazzinoSubMenu from "../../components/vini/MagazzinoSubMenu";

export default function GeneraCartaCantina() {
  const navigate = useNavigate();
  const [showPreview, setShowPreview] = useState(false);

  const handlePdf = () => {
    const token = localStorage.getItem("token");
    window.open(`${API_BASE}/vini/cantina-tools/carta-cantina/pdf?token=${token}`, "_blank");
  };

  const handleDocx = () => {
    const token = localStorage.getItem("token");
    window.open(`${API_BASE}/vini/cantina-tools/carta-cantina/docx?token=${token}`, "_blank");
  };

  return (
    <div className="min-h-screen bg-neutral-100 p-6 font-sans">
      <div className="max-w-5xl mx-auto bg-white shadow-2xl rounded-3xl p-10 border border-neutral-200">

        {/* HEADER */}
        <div className="flex flex-col sm:flex-row justify-between gap-4 mb-6">
          <div>
            <h1 className="text-3xl lg:text-4xl font-bold text-amber-900 tracking-wide font-playfair mb-2">
              📄 Genera Carta dei Vini
            </h1>
            <p className="text-neutral-600">
              Scarica la carta dei vini generata dal database cantina.
            </p>
          </div>
        </div>

        <MagazzinoSubMenu />

        {/* DOWNLOAD */}
        <div className="mb-8">
          <div className="flex flex-wrap gap-3 mb-6">
            <button
              onClick={handlePdf}
              className="px-8 py-4 rounded-2xl text-base font-semibold bg-amber-700 text-white hover:bg-amber-800 shadow-lg transition flex items-center gap-2"
            >
              📄 Scarica PDF
            </button>
            <button
              onClick={handleDocx}
              className="px-8 py-4 rounded-2xl text-base font-semibold border border-neutral-300 bg-neutral-50 hover:bg-neutral-100 shadow transition flex items-center gap-2"
            >
              📝 Scarica Word
            </button>
          </div>

          <button
            onClick={() => setShowPreview((p) => !p)}
            className="text-sm text-amber-700 hover:text-amber-900 underline transition"
          >
            {showPreview ? "Chiudi anteprima" : "Mostra anteprima HTML"}
          </button>
        </div>

        {/* ANTEPRIMA */}
        {showPreview && (
          <div className="border border-neutral-200 rounded-2xl overflow-hidden">
            <div className="px-4 py-3 bg-neutral-100 border-b border-neutral-200">
              <div className="text-sm font-semibold text-neutral-800">
                Anteprima Carta Vini
              </div>
              <div className="text-xs text-neutral-500">
                Generata dal database cantina con le impostazioni correnti.
              </div>
            </div>
            <iframe
              src={`${API_BASE}/vini/cantina-tools/carta-cantina`}
              title="Carta Vini da Cantina"
              className="w-full"
              style={{ height: "70vh", border: "none" }}
            />
          </div>
        )}

      </div>
    </div>
  );
}
