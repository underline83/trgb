// @version: v1.0-cantina-tools
// Strumenti Cantina — Sync Excel, Import/Export, Genera Carta da Cantina
// Solo admin

import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { API_BASE, apiFetch } from "../../config/api";

export default function CantinaTools() {
  const navigate = useNavigate();
  const role = localStorage.getItem("role");
  const isAdmin = role === "admin";

  // Stati
  const [syncResult, setSyncResult] = useState(null);
  const [syncLoading, setSyncLoading] = useState(false);
  const [importResult, setImportResult] = useState(null);
  const [importLoading, setImportLoading] = useState(false);
  const [error, setError] = useState("");
  const [forzaGiacenze, setForzaGiacenze] = useState(false);

  // -------------------------------------------------------
  // ACCESS CHECK
  // -------------------------------------------------------
  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-neutral-100 p-6 font-sans flex items-center justify-center">
        <div className="bg-white shadow-xl rounded-2xl p-10 text-center max-w-md">
          <div className="text-5xl mb-4">🔒</div>
          <h2 className="text-xl font-bold text-neutral-800 mb-2">Accesso riservato</h2>
          <p className="text-neutral-600 text-sm mb-4">
            Questa sezione è disponibile solo per gli amministratori.
          </p>
          <button
            onClick={() => navigate("/vini")}
            className="px-4 py-2 rounded-xl text-sm font-medium border border-neutral-300 bg-neutral-50 hover:bg-neutral-100 shadow-sm transition"
          >
            ← Menu Vini
          </button>
        </div>
      </div>
    );
  }

  // -------------------------------------------------------
  // SYNC DA EXCEL (vini.sqlite3 → cantina)
  // -------------------------------------------------------
  const handleSync = async () => {
    setSyncLoading(true);
    setError("");
    setSyncResult(null);

    try {
      const url = `${API_BASE}/vini/cantina-tools/sync-from-excel?forza_giacenze=${forzaGiacenze}`;
      const resp = await apiFetch(url, {
        method: "POST",
      });
      if (!resp.ok) {
        const txt = await resp.text().catch(() => "");
        throw new Error(txt || `Errore server: ${resp.status}`);
      }
      const data = await resp.json();
      setSyncResult(data);
    } catch (e) {
      setError(e?.message || "Errore durante la sincronizzazione.");
    } finally {
      setSyncLoading(false);
    }
  };

  // -------------------------------------------------------
  // IMPORT DIRETTO EXCEL → CANTINA
  // -------------------------------------------------------
  const handleImportExcel = async (file) => {
    if (!file) return;
    setImportLoading(true);
    setError("");
    setImportResult(null);

    try {
      const form = new FormData();
      form.append("file", file);

      const resp = await apiFetch(`${API_BASE}/vini/cantina-tools/import-excel`, {
        method: "POST",
        body: form,
      });
      if (!resp.ok) {
        const txt = await resp.text().catch(() => "");
        throw new Error(txt || `Errore server: ${resp.status}`);
      }
      const data = await resp.json();
      setImportResult(data);
    } catch (e) {
      setError(e?.message || "Errore durante l'import.");
    } finally {
      setImportLoading(false);
    }
  };

  // -------------------------------------------------------
  // EXPORT CANTINA → EXCEL
  // -------------------------------------------------------
  const handleExport = () => {
    const token = localStorage.getItem("token");
    window.open(`${API_BASE}/vini/cantina-tools/export-excel?token=${token}`, "_blank");
  };

  // -------------------------------------------------------
  // RENDER
  // -------------------------------------------------------
  return (
    <div className="min-h-screen bg-neutral-100 p-6 font-sans">
      <div className="max-w-5xl mx-auto bg-white shadow-2xl rounded-3xl p-10 border border-neutral-200">

        {/* HEADER */}
        <div className="flex flex-col sm:flex-row justify-between gap-4 mb-8">
          <div>
            <h1 className="text-3xl lg:text-4xl font-bold text-amber-900 tracking-wide font-playfair mb-2">
              🔧 Strumenti Cantina
            </h1>
            <p className="text-neutral-600">
              Sincronizzazione Excel ↔ Cantina, export, registro movimenti e modifica massiva.
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => navigate("/vini/magazzino")}
              className="px-4 py-2 rounded-xl text-sm font-medium border border-neutral-300 bg-neutral-50 hover:bg-neutral-100 shadow-sm transition"
            >
              ← Cantina
            </button>
            <button
              onClick={() => navigate("/vini")}
              className="px-4 py-2 rounded-xl text-sm font-medium border border-neutral-300 bg-neutral-50 hover:bg-neutral-100 shadow-sm transition"
            >
              Menu Vini
            </button>
          </div>
        </div>

        {/* ACCESSO RAPIDO: REGISTRO & MODIFICA MASSIVA */}
        <div className="mb-8 flex flex-wrap gap-3">
          <button
            onClick={() => navigate("/vini/magazzino/registro")}
            className="px-6 py-3 rounded-2xl text-sm font-semibold bg-purple-700 text-white hover:bg-purple-800 shadow transition flex items-center gap-2"
          >
            📜 Registro Movimenti
          </button>
          <button
            onClick={() => navigate("/vini/magazzino/admin")}
            className="px-6 py-3 rounded-2xl text-sm font-semibold bg-purple-700 text-white hover:bg-purple-800 shadow transition flex items-center gap-2"
          >
            📋 Modifica Massiva
          </button>
        </div>

        <hr className="border-neutral-200 mb-8" />

        {/* ERRORE GLOBALE */}
        {error && (
          <div className="mb-6 text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl p-3">
            {error}
          </div>
        )}

        {/* SEZIONE 1: SINCRONIZZAZIONE */}
        <div className="mb-8">
          <h2 className="text-xl font-semibold text-amber-900 font-playfair mb-3 flex items-center gap-2">
            🔄 Sincronizza Excel → Cantina
          </h2>
          <p className="text-sm text-neutral-600 mb-4">
            Prende i dati già importati nel vecchio DB (tramite Carta dei Vini → Import Excel)
            e li sincronizza nel DB cantina. I vini nuovi vengono creati, quelli esistenti
            aggiornati nell'anagrafica.
          </p>

          <div className="flex items-center gap-3 mb-4">
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={forzaGiacenze}
                onChange={(e) => setForzaGiacenze(e.target.checked)}
                className="w-4 h-4 rounded border-neutral-300 text-amber-700 focus:ring-amber-500"
              />
              <span className="text-sm font-medium text-neutral-700">
                Forza aggiornamento giacenze da Excel
              </span>
            </label>
            {forzaGiacenze && (
              <span className="text-xs text-red-600 font-semibold bg-red-50 px-2 py-0.5 rounded">
                Sovrascrive le quantità in cantina con quelle dell'Excel
              </span>
            )}
          </div>

          <button
            onClick={handleSync}
            disabled={syncLoading}
            className={`
              px-6 py-3 rounded-2xl text-sm font-semibold shadow transition
              ${syncLoading
                ? "bg-neutral-300 text-neutral-500 cursor-not-allowed"
                : forzaGiacenze
                  ? "bg-red-700 text-white hover:bg-red-800"
                  : "bg-amber-700 text-white hover:bg-amber-800"
              }
            `}
          >
            {syncLoading
              ? "Sincronizzazione in corso…"
              : forzaGiacenze
                ? "Avvia sincronizzazione (con giacenze)"
                : "Avvia sincronizzazione"
            }
          </button>

          {syncResult && (
            <div className="mt-4 bg-green-50 border border-green-200 rounded-xl p-4 text-sm">
              <p className="font-semibold text-green-800 mb-1">{syncResult.msg}</p>
              <div className="text-green-700 space-y-1">
                <p>Totale vini nell'Excel: <strong>{syncResult.totale_excel}</strong></p>
                <p>Nuovi inseriti: <strong>{syncResult.inseriti}</strong></p>
                <p>Aggiornati: <strong>{syncResult.aggiornati}</strong></p>
                {syncResult.forza_giacenze && (
                  <p>Giacenze sovrascritte: <strong>{syncResult.giacenze_forzate}</strong></p>
                )}
                {syncResult.errori?.length > 0 && (
                  <div className="mt-2">
                    <p className="font-semibold text-red-700">Errori ({syncResult.errori.length}):</p>
                    <ul className="list-disc pl-5 text-red-600 text-xs mt-1">
                      {syncResult.errori.map((e, i) => <li key={i}>{e}</li>)}
                    </ul>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        <hr className="border-neutral-200 mb-8" />

        {/* SEZIONE 2: IMPORT / EXPORT */}
        <div className="mb-8">
          <h2 className="text-xl font-semibold text-amber-900 font-playfair mb-3 flex items-center gap-2">
            📥 Import / Export Excel
          </h2>
          <p className="text-sm text-neutral-600 mb-4">
            Import diretto di un Excel nella cantina (senza passare dal vecchio DB),
            oppure esporta la cantina attuale in un Excel per lavorare offline.
          </p>

          <div className="flex flex-wrap gap-3">
            <label className={`
              px-6 py-3 rounded-2xl text-sm font-semibold shadow transition cursor-pointer text-center
              ${importLoading
                ? "bg-neutral-300 text-neutral-500 cursor-not-allowed"
                : "bg-blue-600 text-white hover:bg-blue-700"
              }
            `}>
              {importLoading ? "Importazione…" : "📤 Importa Excel → Cantina"}
              <input
                type="file"
                accept=".xlsx,.xls"
                className="hidden"
                onChange={(e) => handleImportExcel(e.target.files?.[0])}
                disabled={importLoading}
              />
            </label>

            <button
              onClick={handleExport}
              className="px-6 py-3 rounded-2xl text-sm font-semibold border border-green-300 bg-green-50 text-green-800 hover:bg-green-100 shadow transition"
            >
              📥 Esporta Cantina → Excel
            </button>
          </div>

          {importResult && (
            <div className="mt-4 bg-green-50 border border-green-200 rounded-xl p-4 text-sm">
              <p className="font-semibold text-green-800 mb-1">{importResult.msg}</p>
              <div className="text-green-700 space-y-1">
                <p>Righe nell'Excel: <strong>{importResult.righe_excel}</strong></p>
                <p>Nuovi inseriti: <strong>{importResult.inseriti}</strong></p>
                <p>Aggiornati: <strong>{importResult.aggiornati}</strong></p>
                {importResult.errori?.length > 0 && (
                  <div className="mt-2">
                    <p className="font-semibold text-red-700">Errori ({importResult.errori.length}):</p>
                    <ul className="list-disc pl-5 text-red-600 text-xs mt-1">
                      {importResult.errori.map((e, i) => <li key={i}>{e}</li>)}
                    </ul>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* INFO */}
        <div className="mt-6 text-xs text-neutral-500 bg-neutral-50 rounded-xl p-4 border border-neutral-200">
          <p className="font-semibold mb-1">Come funziona il flusso:</p>
          <p>1. Importa l'Excel nel vecchio sistema (Carta dei Vini → Importa file Excel)</p>
          <p>2. Clicca "Avvia sincronizzazione" qui per portare i dati nella cantina</p>
          <p>3. Oppure: importa direttamente un Excel nella cantina (salta il vecchio sistema)</p>
          <p>4. Esporta la cantina in Excel per lavorare offline</p>
          <p>5. Usa "Genera Carta PDF" dal menu Cantina per scaricare la carta</p>
        </div>
      </div>
    </div>
  );
}
