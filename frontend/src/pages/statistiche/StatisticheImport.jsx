// @version: v1.0-statistiche-import
// Import export iPratico (.xls HTML) per mese
import React, { useEffect, useState, useRef } from "react";
import { API_BASE, apiFetch } from "../../config/api";
import StatisticheNav from "./StatisticheNav";
import Tooltip from "../../components/Tooltip";

const EP = `${API_BASE}/statistiche`;

const MESI = [
  "Gennaio", "Febbraio", "Marzo", "Aprile", "Maggio", "Giugno",
  "Luglio", "Agosto", "Settembre", "Ottobre", "Novembre", "Dicembre",
];

export default function StatisticheImport() {
  const now = new Date();
  const [anno, setAnno] = useState(now.getFullYear());
  const [mese, setMese] = useState(now.getMonth() + 1);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [imports, setImports] = useState([]);
  const [logLoading, setLogLoading] = useState(true);
  const fileRef = useRef(null);

  useEffect(() => {
    loadImports();
  }, []);

  const loadImports = async () => {
    setLogLoading(true);
    try {
      const resp = await apiFetch(`${EP}/mesi`);
      if (resp.ok) setImports(await resp.json());
    } catch (_) {}
    setLogLoading(false);
  };

  const handleUpload = async () => {
    const file = fileRef.current?.files?.[0];
    if (!file) {
      setError("Seleziona un file .xls da importare.");
      return;
    }

    setUploading(true);
    setError("");
    setResult(null);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const resp = await apiFetch(
        `${EP}/import-ipratico?anno=${anno}&mese=${mese}`,
        { method: "POST", body: formData }
      );

      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        throw new Error(err.detail || "Errore durante l'importazione");
      }

      const data = await resp.json();
      setResult(data);
      fileRef.current.value = "";
      loadImports();
    } catch (err) {
      setError(err.message);
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (a, m) => {
    if (!confirm(`Eliminare i dati di ${MESI[m - 1]} ${a}?`)) return;
    try {
      const resp = await apiFetch(`${EP}/mese/${a}/${m}`, { method: "DELETE" });
      if (resp.ok) loadImports();
      else {
        const err = await resp.json().catch(() => ({}));
        setError(err.detail || "Errore eliminazione");
      }
    } catch (err) {
      setError(err.message);
    }
  };

  // Anni disponibili
  const ANNI = [];
  for (let y = 2020; y <= now.getFullYear() + 1; y++) ANNI.push(y);

  return (
    <div className="min-h-screen bg-brand-cream p-6 font-sans">
      <StatisticheNav current="import" />
      <div className="max-w-4xl mx-auto bg-white shadow-2xl rounded-3xl p-6 sm:p-10 border border-neutral-200 mt-4">
        <h1 className="text-3xl font-bold text-rose-900 tracking-wide font-playfair mb-1">
          Import iPratico
        </h1>
        <p className="text-neutral-600 text-sm mb-6">
          Carica un export mensile iPratico (.xls). Il file sovrascrive i dati esistenti per lo stesso mese.
        </p>

        {/* Selettore mese/anno + upload */}
        <div className="rounded-2xl border-2 border-dashed border-neutral-300 bg-neutral-50 p-8 text-center mb-6">
          <div className="text-4xl mb-3">📥</div>

          <div className="flex items-center justify-center gap-3 mb-4 flex-wrap">
            <select
              value={mese}
              onChange={(e) => setMese(Number(e.target.value))}
              className="border border-neutral-300 rounded-lg px-3 py-2 text-sm"
            >
              {MESI.map((m, i) => (
                <option key={i + 1} value={i + 1}>{m}</option>
              ))}
            </select>
            <select
              value={anno}
              onChange={(e) => setAnno(Number(e.target.value))}
              className="border border-neutral-300 rounded-lg px-3 py-2 text-sm"
            >
              {ANNI.map((y) => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </div>

          <div className="flex items-center justify-center gap-3">
            <input
              ref={fileRef}
              type="file"
              accept=".xls,.xlsx"
              className="text-sm"
            />
            <button
              onClick={handleUpload}
              disabled={uploading}
              className={`px-5 py-2.5 rounded-xl text-sm font-semibold shadow transition ${
                uploading
                  ? "bg-neutral-300 text-neutral-500 cursor-not-allowed"
                  : "bg-rose-600 text-white hover:bg-rose-700"
              }`}
            >
              {uploading ? "Importazione..." : "Importa"}
            </button>
          </div>
        </div>

        {/* Risultato upload */}
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl p-4 mb-4 text-sm">
            {error}
          </div>
        )}
        {result && (
          <div className="bg-green-50 border border-green-200 text-green-800 rounded-xl p-4 mb-4 text-sm">
            <strong>Importazione completata:</strong>{" "}
            {MESI[result.mese - 1]} {result.anno} — {result.categorie} categorie,{" "}
            {result.prodotti} prodotti, totale{" "}
            {Number(result.totale_euro).toLocaleString("it-IT", {
              minimumFractionDigits: 2,
            })}{" "}
            €
          </div>
        )}

        {/* Log import precedenti */}
        <h2 className="text-xl font-bold text-neutral-800 mb-3">Mesi importati</h2>
        {logLoading ? (
          <p className="text-neutral-400 text-sm">Caricamento...</p>
        ) : imports.length === 0 ? (
          <p className="text-neutral-400 text-sm">Nessun mese importato.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-neutral-200 text-left text-neutral-500">
                  <th className="py-2 px-2">Mese</th>
                  <th className="py-2 px-2">File</th>
                  <th className="py-2 px-2 text-right">Categorie</th>
                  <th className="py-2 px-2 text-right">Prodotti</th>
                  <th className="py-2 px-2 text-right">Totale €</th>
                  <th className="py-2 px-2 text-right">Importato</th>
                  <th className="py-2 px-2"></th>
                </tr>
              </thead>
              <tbody>
                {imports.map((imp, i) => (
                  <tr key={i} className="border-b border-neutral-100 hover:bg-neutral-50">
                    <td className="py-2 px-2 font-medium">
                      {MESI[imp.mese - 1]} {imp.anno}
                    </td>
                    <td className="py-2 px-2 text-neutral-500 truncate max-w-[150px]">
                      {imp.filename}
                    </td>
                    <td className="py-2 px-2 text-right">{imp.n_categorie}</td>
                    <td className="py-2 px-2 text-right">{imp.n_prodotti}</td>
                    <td className="py-2 px-2 text-right font-medium">
                      {Number(imp.totale_euro).toLocaleString("it-IT", {
                        minimumFractionDigits: 2,
                      })}
                    </td>
                    <td className="py-2 px-2 text-right text-neutral-400">
                      {imp.imported_at ? new Date(imp.imported_at).toLocaleDateString("it-IT") : "—"}
                    </td>
                    <td className="py-2 px-2 text-right">
                      <Tooltip label="Elimina mese">
                        <button
                          onClick={() => handleDelete(imp.anno, imp.mese)}
                          className="text-red-500 hover:text-red-700 text-xs"
                        >
                          🗑️
                        </button>
                      </Tooltip>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
