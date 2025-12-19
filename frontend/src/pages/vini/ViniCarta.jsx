// @version: v3.2-carta-vini-anteprima-embedded
// Pagina Carta Vini — Anteprima embedded + Export + Import Excel (solo Carta)

import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { API_BASE } from "../../config/api";

export default function ViniCarta() {
  const navigate = useNavigate();

  const [loadingImport, setLoadingImport] = useState(false);
  const [importError, setImportError] = useState("");
  const [importResultHtml, setImportResultHtml] = useState("");
  const [showPreview, setShowPreview] = useState(true);

  const token = localStorage.getItem("token");

  const cartaPublicUrl = `${API_BASE}/vini/carta`;
  const cartaPublicSiteUrl = "https://trgb.tregobbi.it/carta-vini";

  const handleLogout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("role");
    window.location.reload();
  };

  // --------------------------------------------------
  // IMPORT EXCEL (solo carta)
  // --------------------------------------------------
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

      // forza refresh anteprima
      setShowPreview(false);
      setTimeout(() => setShowPreview(true), 50);
    } catch (e) {
      setImportError(e?.message || "Errore import Excel.");
    } finally {
      setLoadingImport(false);
    }
  };

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
    <div className="min-h-screen bg-neutral-100 p-6 font-sans">
      <div className="max-w-6xl mx-auto bg-white shadow-2xl rounded-3xl p-10 border border-neutral-200">

        {/* HEADER */}
        <div className="flex flex-col lg:flex-row justify-between gap-4 mb-6">
          <div>
            <h1 className="text-3xl lg:text-4xl font-bold text-amber-900 tracking-wide font-playfair mb-2">
              📜 Carta dei Vini
            </h1>
            <p className="text-neutral-600">
              Anteprima live, esportazioni e import Excel (solo Carta).
            </p>
          </div>

          <div className="flex flex-col sm:flex-row gap-2">
            <button
              type="button"
              onClick={() => navigate("/vini")}
              className="px-4 py-2 rounded-xl text-sm font-medium border border-neutral-300 bg-neutral-50 hover:bg-neutral-100 shadow-sm transition"
            >
              ← Menu Vini
            </button>

            <button
              type="button"
              onClick={handleLogout}
              className="px-4 py-2 rounded-xl text-sm font-medium border border-red-200 bg-red-50 text-red-700 hover:bg-red-100 shadow-sm transition"
            >
              Logout
            </button>
          </div>
        </div>

        {/* BOTTONI */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 mb-8">
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
                Output del server dopo l’import.
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