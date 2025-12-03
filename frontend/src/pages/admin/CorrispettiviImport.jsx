// @version: v1.0
import React, { useState } from "react";
import { useNavigate } from "react-router-dom";

// Se hai già un file config centrale, sostituisci con l'import corretto.
// In molti tuoi componenti il base URL è preso da VITE_API_BASE_URL.
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;

export default function CorrispettiviImport() {
  const navigate = useNavigate();

  const [year, setYear] = useState(new Date().getFullYear());
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
      formData.append("year", year);

      const token = localStorage.getItem("token");

// NON mandare year nel form-data
const formData = new FormData();
formData.append("file", file);

const token = localStorage.getItem("token");

const res = await fetch(
  `${API_BASE_URL}/admin/finance/import-corrispettivi-file?year=${year}`,
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
              Carica il file dei corrispettivi (es. 2025) per importare o aggiornare
              le chiusure cassa nel gestionale.
            </p>
          </div>

          <div className="flex flex-col gap-2 sm:items-end">
            <button
              type="button"
              onClick={() => navigate("/admin/corrispettivi")}
              className="px-4 py-2 rounded-xl text-sm font-medium border border-neutral-300 bg-neutral-50 hover:bg-neutral-100 hover:-translate-y-0.5 shadow-sm transition"
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

        {/* FORM IMPORT */}
        <div className="space-y-6">

          {/* ANNO */}
          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-1">
              Anno (foglio Excel)
            </label>
            <input
              type="number"
              value={year}
              onChange={(e) => setYear(Number(e.target.value))}
              className="w-32 px-3 py-2 border border-neutral-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-300 focus:border-amber-400 bg-neutral-50"
              min="2020"
              max="2100"
            />
            <p className="text-xs text-neutral-500 mt-1">
              Deve corrispondere al nome del foglio nel file (es. &quot;2025&quot;).
            </p>
          </div>

          {/* FILE */}
          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-1">
              File corrispettivi (Excel)
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
              Usa il file che compili oggi in Excel (corrispettivi, metodi pagamento, ecc.).
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
                    : "bg-amber-600 text-white hover:bg-amber-700 hover:-translate-y-0.5 transition"
                }`}
            >
              {loading ? "Import in corso..." : "Importa corrispettivi"}
            </button>

            {file && !loading && (
              <span className="text-xs text-neutral-500">
                File selezionato: <strong>{file.name}</strong>
              </span>
            )}
          </div>

          {/* MESSAGGI */}
          {error && (
            <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
              Errore durante l'import: {error}
            </div>
          )}

          {result && (
            <div className="mt-4 rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
              <p className="font-semibold mb-1">
                Import completato per l'anno {result.year}.
              </p>
              <p>
                Righe inserite: <strong>{result.inserted}</strong>
                <br />
                Righe aggiornate: <strong>{result.updated}</strong>
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
