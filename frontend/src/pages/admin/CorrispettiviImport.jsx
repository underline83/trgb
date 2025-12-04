// @version: v1.2
import React, { useState } from "react";
import { useNavigate } from "react-router-dom";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;

// Opzioni per il selettore: archivio + anni
const IMPORT_OPTIONS = [
  "archivio",
  "2021",
  "2022",
  "2023",
  "2024",
  "2025",
  "2026",
];

export default function CorrispettiviImport() {
  const navigate = useNavigate();

  // di default propongo "archivio" per fare la one-shot storica
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
    if (!file) {
      setError("Seleziona prima un file Excel (.xlsb / .xlsx / .xls).");
      return;
    }

    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const token = localStorage.getItem("token");

      const res = await fetch(
        `${API_BASE_URL}/admin/finance/import-corrispettivi-file?year=${encodeURIComponent(
          year
        )}`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
          },
          body: formData,
        }
      );

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || "Errore generico nell'import.");
      }

      const data = await res.json();
      setResult(data);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-neutral-100 p-6 font-sans">
      <div className="max-w-3xl mx-auto bg-white shadow-2xl rounded-3xl p-10 border border-neutral-200">
        {/* HEADER */}
        <div className="flex flex-col sm:flex-row justify-between gap-4 mb-8">
          <div>
            <h1 className="text-3xl sm:text-4xl font-bold text-amber-900 tracking-wide font-playfair mb-2">
              📤 Import corrispettivi da Excel
            </h1>
            <p className="text-neutral-600 text-sm sm:text-base">
              Carica il file annuale dei corrispettivi per popolare il gestionale.
            </p>
          </div>

          <div className="flex flex-col gap-2 sm:items-end">
            <button
              type="button"
              onClick={() => navigate("/admin/corrispettivi")}
              className="px-4 py-2 rounded-xl text-sm font-medium border border-neutral-300 bg-neutral-50 hover:bg-neutral-100 shadow-sm transition"
            >
              ← Torna ai Corrispettivi
            </button>
            <button
              type="button"
              onClick={() => navigate("/admin")}
              className="px-4 py-2 rounded-xl text-xs font-medium border border-neutral-200 bg-white hover:bg-neutral-50 shadow-sm transition"
            >
              ← Amministrazione
            </button>
          </div>
        </div>

        {/* FORM */}
        <div className="space-y-6">
          {/* MODALITÀ / FOGLIO */}
          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-1">
              Foglio da importare
            </label>
            <select
              value={year}
              onChange={(e) => setYear(e.target.value)}
              className="w-48 px-3 py-2 border border-neutral-300 rounded-xl bg-neutral-50 text-sm"
            >
              {IMPORT_OPTIONS.map((opt) => (
                <option key={opt} value={opt}>
                  {opt === "archivio" ? "archivio (storico 2021–…)" : opt}
                </option>
              ))}
            </select>
            <p className="text-xs text-neutral-500 mt-1">
              • <strong>archivio</strong> → usa il foglio <code>archivio</code> e
              importa tutte le date presenti (2021, 2022, 2023, …).<br />
              • <strong>anno (es. 2025)</strong> → usa il foglio con lo stesso nome
              (es. <code>2025</code>) e importa solo quell&apos;anno.
            </p>
          </div>

          {/* FILE */}
          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-1">
              File Excel
            </label>
            <input
              type="file"
              accept=".xlsb,.xlsx,.xls"
              onChange={handleFileChange}
              className="block w-full text-sm text-neutral-700
                         file:mr-4 file:py-2 file:px-4
                         file:rounded-xl file:border-0
                         file:text-sm file:font-medium
                         file:bg-amber-50 file:text-amber-900
                         hover:file:bg-amber-100"
            />
            <p className="text-xs text-neutral-500 mt-1">
              Standard colonne: DATA, GIORNO, CORRISPETTIVI-TOT, CORRISPETTIVI,
              IVA 10%, IVA 22%, FATTURE, CONTANTI, POS BPM, POS SELLA, THEFORKPAY,
              PAYPAL/STRIPE, BONIFICI, MANCE DIG, CASH, TOTALE.
            </p>
          </div>

          {/* BOTTONI */}
          <div className="flex items-center gap-3">
            <button
              type="button"
              disabled={loading || !file}
              onClick={handleImport}
              className={`px-5 py-2 rounded-xl text-sm font-semibold shadow
                ${
                  loading || !file
                    ? "bg-neutral-200 text-neutral-500 cursor-not-allowed"
                    : "bg-amber-600 text-white hover:bg-amber-700 transition"
                }`}
            >
              {loading ? "Import in corso..." : "Importa corrispettivi"}
            </button>

            {file && !loading && (
              <span className="text-xs text-neutral-500">
                File: <strong>{file.name}</strong>
              </span>
            )}
          </div>

          {/* MESSAGGI */}
          {error && (
            <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
              Errore durante l&apos;import: {error}
            </div>
          )}

          {result && (
            <div className="mt-4 rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
              <p className="font-semibold mb-1">
                Import completato ({result.year})
              </p>
              <p>
                Inserite: <strong>{result.inserted}</strong>
                <br />
                Aggiornate: <strong>{result.updated}</strong>
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}