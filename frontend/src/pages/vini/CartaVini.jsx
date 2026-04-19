// @version: v3.6-panel — ora pannello interno della shell CartaBevande (sidebar 8 sezioni)
// Era una pagina stand-alone con ViniNav e wrapper min-h-screen; ora renderizzato
// dentro CartaBevande come pannello per la sezione "vini".
// Route: /vini/carta/vini (gestita dalla shell CartaBevande via :sezione)

import React, { useState } from "react";
import { API_BASE } from "../../config/api";
import { Btn } from "../../components/ui";

export default function CartaVini() {
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
    <div>
      {/* HEADER PANNELLO */}
      <div className="flex flex-col lg:flex-row justify-between gap-4 mb-6">
        <div>
          <h2 className="text-2xl lg:text-3xl font-bold text-amber-900 tracking-wide font-playfair mb-1">
            📜 Carta dei Vini
          </h2>
          <p className="text-neutral-600 text-sm">
            Anteprima live ed esportazioni (HTML, PDF, Word). Le voci arrivano dalla Cantina.
          </p>
        </div>
      </div>

      {/* BOTTONI AZIONI */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
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
      <div className="border border-neutral-200 rounded-2xl overflow-hidden">
        <div className="px-4 py-3 bg-neutral-50 border-b border-neutral-200">
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
            style={{ height: "75vh", border: "none" }}
          />
        )}
      </div>
    </div>
  );
}
