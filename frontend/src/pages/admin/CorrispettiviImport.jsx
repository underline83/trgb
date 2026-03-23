// @version: v3.0-sidebar-layout
// Impostazioni Vendite — Layout sidebar + contenuto (stile ViniImpostazioni)
import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import VenditeNav from "./VenditeNav";
import CalendarioChiusure from "./CalendarioChiusure";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;

// Opzioni per il selettore import
const IMPORT_OPTIONS = ["archivio", "2021", "2022", "2023", "2024", "2025", "2026"];

// ---------------------------------------------------------------
// SIDEBAR MENU
// ---------------------------------------------------------------
const MENU = [
  { key: "chiusure",  label: "Calendario Chiusure", icon: "📅" },
  { key: "import",    label: "Import Corrispettivi", icon: "📤" },
];

// ---------------------------------------------------------------
// SEZIONE: Import Corrispettivi
// ---------------------------------------------------------------
function SezioneImport() {
  const [year, setYear] = useState("archivio");
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  const handleFileChange = (e) => {
    setFile(e.target.files[0] || null);
    setResult(null);
    setError(null);
  };

  const handleImport = async () => {
    if (!file) { setError("Seleziona prima un file Excel (.xlsb / .xlsx / .xls)."); return; }
    setLoading(true); setError(null); setResult(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const token = localStorage.getItem("token");
      const res = await fetch(
        `${API_BASE_URL}/admin/finance/import-corrispettivi-file?year=${encodeURIComponent(year)}`,
        { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: formData }
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || "Errore generico nell'import.");
      }
      setResult(await res.json());
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-indigo-900 font-playfair mb-1">Import corrispettivi da Excel</h2>
        <p className="text-neutral-500 text-sm">Carica il file annuale dei corrispettivi per popolare il gestionale.</p>
      </div>

      {/* Foglio */}
      <div>
        <label className="block text-sm font-medium text-neutral-700 mb-1">Foglio da importare</label>
        <select value={year} onChange={(e) => setYear(e.target.value)}
          className="w-48 px-3 py-2 border border-neutral-300 rounded-xl bg-neutral-50 text-sm">
          {IMPORT_OPTIONS.map((opt) => (
            <option key={opt} value={opt}>{opt === "archivio" ? "archivio (storico 2021–…)" : opt}</option>
          ))}
        </select>
        <p className="text-xs text-neutral-500 mt-1">
          <strong>archivio</strong> → importa tutte le date presenti. <strong>anno</strong> → importa solo quell'anno.
        </p>
      </div>

      {/* File */}
      <div>
        <label className="block text-sm font-medium text-neutral-700 mb-1">File Excel</label>
        <input type="file" accept=".xlsb,.xlsx,.xls" onChange={handleFileChange}
          className="block w-full text-sm text-neutral-700 file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-sm file:font-medium file:bg-indigo-50 file:text-indigo-900 hover:file:bg-indigo-100" />
        <p className="text-xs text-neutral-500 mt-1">
          Colonne standard: DATA, GIORNO, CORRISPETTIVI-TOT, CORRISPETTIVI, IVA 10%, IVA 22%, FATTURE, CONTANTI, POS BPM, POS SELLA, THEFORKPAY, PAYPAL/STRIPE, BONIFICI, MANCE DIG, CASH, TOTALE.
        </p>
      </div>

      {/* Bottone */}
      <div className="flex items-center gap-3">
        <button type="button" disabled={loading || !file} onClick={handleImport}
          className={`px-5 py-2 rounded-xl text-sm font-semibold shadow ${loading || !file ? "bg-neutral-200 text-neutral-500 cursor-not-allowed" : "bg-indigo-600 text-white hover:bg-indigo-700 transition"}`}>
          {loading ? "Import in corso..." : "Importa corrispettivi"}
        </button>
        {file && !loading && <span className="text-xs text-neutral-500">File: <strong>{file.name}</strong></span>}
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          Errore: {error}
        </div>
      )}
      {result && (
        <div className="rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
          <p className="font-semibold mb-1">Import completato ({result.year})</p>
          <p>Inserite: <strong>{result.inserted}</strong> — Aggiornate: <strong>{result.updated}</strong></p>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------
// SEZIONE: Calendario Chiusure
// ---------------------------------------------------------------
function SezioneChiusure() {
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-bold text-indigo-900 font-playfair mb-1">Calendario chiusure</h2>
        <p className="text-neutral-500 text-sm">Configura il giorno di chiusura settimanale e i giorni di ferie/chiusure straordinarie.</p>
      </div>
      <CalendarioChiusure />
    </div>
  );
}

// ===============================================================
// MAIN COMPONENT
// ===============================================================
export default function CorrispettiviImport() {
  const navigate = useNavigate();
  const [activeSection, setActiveSection] = useState("chiusure");

  const sectionRenderers = {
    chiusure: () => <SezioneChiusure />,
    import: () => <SezioneImport />,
  };

  return (
    <div className="min-h-screen bg-neutral-100 font-sans">
      <VenditeNav current="impostazioni" />

      <div className="max-w-6xl mx-auto p-4 sm:p-6 space-y-5">

        {/* HEADER */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-indigo-900 font-playfair">
              Impostazioni Vendite
            </h1>
            <p className="text-neutral-500 text-sm mt-1">
              Chiusure, import dati e configurazione modulo vendite.
            </p>
          </div>
          <button onClick={() => navigate("/vendite")}
            className="px-4 py-2 rounded-xl text-sm font-medium border border-neutral-300 bg-neutral-50 hover:bg-neutral-100 shadow-sm transition">
            ← Vendite
          </button>
        </div>

        {/* SIDEBAR + CONTENT */}
        <div className="flex flex-col md:flex-row gap-6">

          {/* SIDEBAR */}
          <nav className="md:w-56 shrink-0">
            <div className="bg-white border border-neutral-200 rounded-2xl overflow-hidden shadow-sm">
              {MENU.map(item => (
                <button key={item.key} onClick={() => setActiveSection(item.key)}
                  className={`w-full flex items-center gap-3 px-4 py-3 text-sm font-medium text-left transition border-l-3 ${
                    activeSection === item.key
                      ? "bg-indigo-50 text-indigo-900 border-l-indigo-700"
                      : "text-neutral-600 hover:bg-neutral-50 border-l-transparent hover:text-neutral-800"
                  }`}>
                  <span className="text-base">{item.icon}</span>
                  <span>{item.label}</span>
                </button>
              ))}
            </div>
          </nav>

          {/* CONTENT */}
          <main className="flex-1 bg-white border border-neutral-200 rounded-2xl p-6 shadow-sm min-h-[500px]">
            {sectionRenderers[activeSection]?.()}
          </main>

        </div>
      </div>
    </div>
  );
}
