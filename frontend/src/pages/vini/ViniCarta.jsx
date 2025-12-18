// @version: v3.1-carta-vini-import-interno
// Pagina Carta Vini — Bottoni finali + Import Excel (solo Carta)

import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { API_BASE } from "../../config/api";

export default function ViniCarta() {
  const navigate = useNavigate();

  const [loadingImport, setLoadingImport] = useState(false);
  const [importError, setImportError] = useState("");
  const [importResultHtml, setImportResultHtml] = useState("");

  const token = localStorage.getItem("token");

  const handleLogout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("role");
    window.location.reload();
  };

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
    } catch (e) {
      setImportError(e?.message || "Errore import Excel.");
    } finally {
      setLoadingImport(false);
    }
  };

  // --- BOTTONI (se i tuoi endpoint sono diversi, qui li adegui una volta sola)
  const openHtml = () => window.open(`${API_BASE}/vini/carta/html`, "_blank");
  const downloadPdf = () => window.open(`${API_BASE}/vini/carta/pdf`, "_blank");
  const downloadWord = () => window.open(`${API_BASE}/vini/carta/word`, "_blank");

  // “Aggiorna anteprima”: in molti casi coincide con rigenerare HTML lato server.
  // Se hai già un endpoint specifico, sostituiscilo qui.
  const refreshPreview = () => window.open(`${API_BASE}/vini/carta/html`, "_blank");

  return (
    <div className="min-h-screen bg-neutral-100 p-6 font-sans">
      <div className="max-w-5xl mx-auto bg-white shadow-2xl rounded-3xl p-10 border border-neutral-200">
        {/* HEADER */}
        <div className="flex flex-col lg:flex-row justify-between gap-4 mb-6">
          <div>
            <h1 className="text-3xl lg:text-4xl font-bold text-amber-900 tracking-wide font-playfair mb-2">
              📜 Carta dei Vini
            </h1>
            <p className="text-neutral-600">
              Anteprima, esportazioni e import Excel (solo Carta).
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
                Questo è l’output del server dopo l’import.
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