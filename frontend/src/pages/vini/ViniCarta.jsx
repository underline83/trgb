// FILE: frontend/src/pages/vini/ViniCarta.jsx
// @version: v3.2-carta-vini-preview-embedded-fixed
// Pagina Carta Vini — Bottoni finali + Import Excel (solo Carta) + Preview embedded

import React, { useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { API_BASE } from "../../config/api";

export default function ViniCarta() {
  const navigate = useNavigate();
  const iframeRef = useRef(null);

  const [loadingImport, setLoadingImport] = useState(false);
  const [importError, setImportError] = useState("");
  const [importResultHtml, setImportResultHtml] = useState("");

  const [previewTs, setPreviewTs] = useState(Date.now());

  const token = localStorage.getItem("token");

  const handleLogout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("role");
    window.location.reload();
  };

  // --- ENDPOINTS REALI (router v2.06)
  const htmlUrl = useMemo(() => `${API_BASE}/vini/carta`, []);
  const pdfUrl = useMemo(() => `${API_BASE}/vini/carta/pdf`, []);
  const docxUrl = useMemo(() => `${API_BASE}/vini/carta/docx`, []);

  // Preview url con cache-busting
  const previewUrl = useMemo(() => `${htmlUrl}?ts=${previewTs}`, [htmlUrl, previewTs]);

  // --- IMPORT EXCEL (solo carta)
  const handleImportExcel = async (file) => {
    if (!file) return;

    if (!token) {
      handleLogout();
      return;
    }

    setLoadingImport(true);
    setImportError("");
    setImportResultHtml("");

    try {
      const form = new FormData();
      form.append("file", file);

      const resp = await fetch(`${API_BASE}/vini/upload?format=html`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
        },
        body: form,
      });

      if (resp.status === 401) {
        alert("Sessione scaduta. Effettua di nuovo il login.");
        handleLogout();
        return;
      }

      if (!resp.ok) {
        const txt = await resp.text().catch(() => "");
        throw new Error(txt || `Errore server: ${resp.status}`);
      }

      const html = await resp.text();
      setImportResultHtml(html);

      // dopo import: aggiorna anteprima embedded
      setPreviewTs(Date.now());
    } catch (e) {
      setImportError(e?.message || "Errore import Excel.");
    } finally {
      setLoadingImport(false);
    }
  };

  // --- BOTTONI
  const openHtml = () => window.open(htmlUrl, "_blank", "noopener,noreferrer");
  const downloadPdf = () => window.open(pdfUrl, "_blank", "noopener,noreferrer");
  const downloadWord = () => window.open(docxUrl, "_blank", "noopener,noreferrer");

  // Aggiorna anteprima: refresh iframe (bust cache)
  const refreshPreview = () => setPreviewTs(Date.now());

  return (
    <div className="min-h-screen bg-neutral-100 p-6 font-sans">
      <div className="max-w-6xl mx-auto bg-white shadow-2xl rounded-3xl p-10 border border-neutral-200">
        {/* HEADER */}
        <div className="flex flex-col lg:flex-row justify-between gap-4 mb-6">
          <div>
            <h1 className="text-3xl lg:text-4xl font-bold text-amber-900 tracking-wide font-playfair mb-2">
              📜 Carta dei Vini
            </h1>
            <p className="text-neutral-600">
              Anteprima in pagina, esportazioni e import Excel (solo Carta).
            </p>
          </div>

          <div className="flex flex-col items-stretch gap-2 sm:flex-row sm:items-center sm:justify-end">
            <button
              type="button"
              onClick={() => navigate("/vini")}
              className="px-4 py-2 rounded-xl text-sm font-medium border border-neutral-300 bg-neutral-50 hover:bg-neutral-100 hover:-translate-y-0.5 shadow-sm transition"
            >
              ← Torna al Menu Vini
            </button>

            <button
              type="button"
              onClick={handleLogout}
              className="px-4 py-2 rounded-xl text-sm font-medium border border-red-200 bg-red-50 text-red-700 hover:bg-red-100 hover:-translate-y-0.5 shadow-sm transition"
            >
              Logout
            </button>
          </div>
        </div>

        {/* BOTTONI (ordine richiesto) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 mb-6">
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

          <label className="px-4 py-3 rounded-2xl text-sm font-semibold border border-blue-200 bg-blue-50 text-blue-900 hover:bg-blue-100 shadow-sm transition cursor-pointer text-center">
            {loadingImport ? "Importo…" : "Importa file Excel"}
            <input
              type="file"
              accept=".xlsx,.xls"
              className="hidden"
              onChange={(e) => handleImportExcel(e.target.files?.[0])}
              disabled={loadingImport}
            />
          </label>
        </div>

        {/* PREVIEW EMBEDDED */}
        <div className="border border-neutral-200 rounded-2xl overflow-hidden shadow-sm bg-white mb-6">
          <div className="px-4 py-3 bg-neutral-100 border-b border-neutral-200 flex items-center justify-between">
            <div className="text-sm font-semibold text-neutral-800">
              Anteprima Carta (HTML)
            </div>
            <div className="text-xs text-neutral-500">
              Endpoint: /vini/carta
            </div>
          </div>

          <iframe
            ref={iframeRef}
            title="Anteprima Carta Vini"
            src={previewUrl}
            className="w-full h-[75vh] bg-white"
          />
        </div>

        {/* ESITO IMPORT */}
        {importError && (
          <div className="mb-4 text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl p-3">
            {importError}
          </div>
        )}

        {importResultHtml && (
          <div className="border border-neutral-200 rounded-2xl overflow-hidden">
            <div className="px-4 py-3 bg-neutral-100 border-b border-neutral-200">
              <div className="text-sm font-semibold text-neutral-800">
                Esito import (HTML)
              </div>
              <div className="text-xs text-neutral-500">
                Output del server dopo l’import (solo controllo).
              </div>
            </div>
            <div
              className="p-4 text-sm"
              dangerouslySetInnerHTML={{ __html: importResultHtml }}
            />
          </div>
        )}
      </div>
    </div>
  );
}