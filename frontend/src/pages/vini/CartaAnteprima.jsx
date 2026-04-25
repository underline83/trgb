// @version: v2.0 — sessione 58 fase 2 iter 6 (2026-04-25)
// Vista "tutta pagina" della carta master (vini + bevande).
// Punta allo stesso endpoint /bevande/carta dell'iframe in CartaBevande,
// ma a tutto schermo. Bottoni: indietro alla carta, reload, export.

import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { API_BASE } from "../../config/api";
import { openAuthedInNewTab } from "../../utils/authFetch";
import ViniNav from "./ViniNav";
import { Btn } from "../../components/ui";
import useToast from "../../hooks/useToast";

export default function CartaAnteprima() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [previewKey, setPreviewKey] = useState(0);
  const reload = () => setPreviewKey(k => k + 1);

  const onErr = (err) => toast(`Errore export: ${err.message}`, { kind: "error" });
  const downloadPdf = () => openAuthedInNewTab(`${API_BASE}/bevande/carta/pdf`, { onError: onErr });
  const downloadPdfStaff = () => openAuthedInNewTab(`${API_BASE}/bevande/carta/pdf-staff`, { onError: onErr });
  const downloadWord = () => openAuthedInNewTab(`${API_BASE}/bevande/carta/docx`, { onError: onErr });

  return (
    <div className="min-h-screen bg-brand-cream font-sans">
      <ViniNav current="carta" />
      <div className="max-w-7xl mx-auto p-4 sm:p-6">

        <div className="flex flex-col lg:flex-row justify-between gap-3 mb-4">
          <div>
            <h1 className="text-2xl lg:text-3xl font-bold text-brand-ink tracking-tight font-playfair mb-1">
              👁 Anteprima Carta · vista espansa
            </h1>
            <p className="text-neutral-600 text-sm">
              Carta completa (vini + tutte le sezioni bevande attive) a tutta pagina. Live dal DB.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Btn variant="secondary" size="md" onClick={() => navigate("/vini/carta")}>
              ← Centro Carta
            </Btn>
            <Btn variant="secondary" size="md" onClick={reload}>
              🔄 Ricarica
            </Btn>
            <Btn variant="secondary" size="md" onClick={downloadPdf}>📄 PDF cliente</Btn>
            <Btn variant="secondary" size="md" onClick={downloadPdfStaff}>📄 PDF staff</Btn>
            <Btn variant="secondary" size="md" onClick={downloadWord}>📝 Word</Btn>
          </div>
        </div>

        <div className="border border-neutral-200 rounded-2xl overflow-hidden bg-white shadow-sm">
          <iframe
            key={previewKey}
            src={`${API_BASE}/bevande/carta`}
            title="Carta delle Bevande — vista espansa"
            className="w-full"
            style={{ height: "calc(100vh - 160px)", border: "none" }}
          />
        </div>

      </div>
    </div>
  );
}
