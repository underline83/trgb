// @version: v1.0 — Anteprima master Carta Bevande (sessione 2026-04-19)
// Route: /vini/carta/anteprima
// Embedda /bevande/carta in iframe + bottoni export.
// NOTA: in Fase 3 il backend esporrà /bevande/carta; finché non c'è, mostriamo un messaggio.

import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { API_BASE } from "../../config/api";
import ViniNav from "./ViniNav";
import { Btn } from "../../components/ui";

export default function CartaAnteprima() {
  const navigate = useNavigate();
  const [showPreview, setShowPreview] = useState(true);

  const previewUrl = `${API_BASE}/bevande/carta`;

  const refreshPreview = () => {
    setShowPreview(false);
    setTimeout(() => setShowPreview(true), 50);
  };

  const downloadPdf = () => window.open(`${API_BASE}/bevande/carta/pdf`, "_blank");
  const downloadPdfStaff = () => window.open(`${API_BASE}/bevande/carta/pdf-staff`, "_blank");
  const downloadWord = () => window.open(`${API_BASE}/bevande/carta/docx`, "_blank");

  return (
    <div className="min-h-screen bg-brand-cream font-sans">
      <ViniNav current="carta" />
      <div className="max-w-7xl mx-auto p-4 sm:p-6">

        <div className="flex flex-col lg:flex-row justify-between gap-4 mb-5">
          <div>
            <h1 className="text-2xl lg:text-3xl font-bold text-brand-ink tracking-tight font-playfair mb-1">
              👁 Anteprima Carta delle Bevande
            </h1>
            <p className="text-neutral-600 text-sm">
              Preview live della carta completa con tutte le sezioni attive nell'ordine configurato.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Btn variant="secondary" size="md" onClick={() => navigate("/vini/carta")}>
              ← Carta
            </Btn>
            <Btn variant="primary" size="md" onClick={refreshPreview}>
              🔄 Ricarica
            </Btn>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-4">
          <Btn variant="secondary" size="md" onClick={downloadPdf}>
            📄 PDF Cliente
          </Btn>
          <Btn variant="secondary" size="md" onClick={downloadPdfStaff}>
            📄 PDF Staff
          </Btn>
          <Btn variant="secondary" size="md" onClick={downloadWord}>
            📝 Word
          </Btn>
        </div>

        <div className="border border-neutral-200 rounded-2xl overflow-hidden bg-white">
          <div className="px-4 py-3 bg-neutral-100 border-b border-neutral-200">
            <div className="text-sm font-semibold text-neutral-800">
              Anteprima Carta delle Bevande (live)
            </div>
            <div className="text-xs text-neutral-500">
              Include vini + tutte le sezioni statiche attive.
            </div>
          </div>

          {showPreview && (
            <iframe
              src={previewUrl}
              title="Carta delle Bevande"
              className="w-full"
              style={{ height: "80vh", border: "none" }}
            />
          )}
        </div>

        <div className="mt-4 text-xs text-neutral-500 text-center">
          ⚠️ L'endpoint <code className="bg-neutral-100 px-1 rounded">/bevande/carta</code> sarà
          disponibile dopo la Fase 3 (export unificato). Fino ad allora la preview può essere vuota.
        </div>

      </div>
    </div>
  );
}
