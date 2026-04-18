// @version: v1.2-mattoni — M.I primitives (Btn, EmptyState) su CTA import + storico
// Import CSV Banco BPM + storico import
import React, { useEffect, useState, useRef } from "react";
import { API_BASE, apiFetch } from "../../config/api";
import FlussiCassaNav from "./FlussiCassaNav";
import { Btn, EmptyState } from "../../components/ui";

const FC = `${API_BASE}/banca`;

export default function BancaImport() {
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [importLog, setImportLog] = useState([]);
  const [logLoading, setLogLoading] = useState(true);
  const fileRef = useRef(null);

  useEffect(() => {
    loadLog();
  }, []);

  const loadLog = async () => {
    setLogLoading(true);
    try {
      const resp = await apiFetch(`${FC}/import-log`);
      if (resp.ok) setImportLog(await resp.json());
    } catch (_) {}
    setLogLoading(false);
  };

  const handleUpload = async () => {
    const file = fileRef.current?.files?.[0];
    if (!file) {
      setError("Seleziona un file CSV da importare.");
      return;
    }
    if (!file.name.endsWith(".csv")) {
      setError("Il file deve essere in formato .csv");
      return;
    }

    setUploading(true);
    setError("");
    setResult(null);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const resp = await apiFetch(`${FC}/import`, {
        method: "POST",
        body: formData,
      });

      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        throw new Error(err.detail || "Errore durante l'importazione");
      }

      const data = await resp.json();
      setResult(data);
      fileRef.current.value = "";
      loadLog();
    } catch (err) {
      setError(err.message);
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="min-h-screen bg-brand-cream p-6 font-sans">
      <FlussiCassaNav current="impostazioni" />
      <div className="max-w-4xl mx-auto bg-white shadow-2xl rounded-3xl p-6 sm:p-10 border border-neutral-200 mt-4">
        <h1 className="text-3xl font-bold text-emerald-900 tracking-wide font-playfair mb-1">
          Importa Movimenti
        </h1>
        <p className="text-neutral-600 text-sm mb-6">
          Carica l'export CSV da Banco BPM. I movimenti duplicati vengono automaticamente ignorati.
        </p>

        {/* Upload area */}
        <div className="rounded-2xl border-2 border-dashed border-neutral-300 bg-neutral-50 p-8 text-center mb-6">
          <div className="text-4xl mb-3">📥</div>
          <p className="text-sm text-neutral-600 mb-4">
            Formato atteso: <strong>ElencoEntrateUsciteAndamento_*.csv</strong>
          </p>
          <div className="flex items-center justify-center gap-3">
            <input
              ref={fileRef}
              type="file"
              accept=".csv"
              className="text-sm"
            />
            <Btn variant="success" size="md" onClick={handleUpload} disabled={uploading} loading={uploading}>
              {uploading ? "Importazione..." : "Importa"}
            </Btn>
          </div>
        </div>

        {error && (
          <div className="mb-4 rounded-xl border border-red-300 bg-red-50 text-red-800 px-4 py-3 text-sm">
            {error}
          </div>
        )}

        {result && (
          <div className={`mb-6 rounded-xl border px-4 py-4 text-sm ${
            result.warning
              ? "border-emerald-300 bg-emerald-50 text-emerald-800"
              : "border-emerald-300 bg-emerald-50 text-emerald-800"
          }`}>
            <div className="font-semibold mb-2">
              {result.warning ? "Attenzione" : "Importazione completata"}
            </div>
            {result.warning && (
              <div className="mb-3 text-sm">{result.warning}</div>
            )}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div>
                <div className="text-xs text-emerald-600">Righe lette</div>
                <div className="text-lg font-bold">{result.total_rows}</div>
              </div>
              <div>
                <div className="text-xs text-emerald-600">Nuovi</div>
                <div className="text-lg font-bold">{result.new}</div>
              </div>
              <div>
                <div className="text-xs text-emerald-600">Duplicati</div>
                <div className="text-lg font-bold">{result.duplicates}</div>
              </div>
              <div>
                <div className="text-xs text-emerald-600">Periodo</div>
                <div className="text-sm font-medium">{result.date_from} → {result.date_to}</div>
              </div>
            </div>
          </div>
        )}

        {/* Storico import */}
        <h2 className="text-lg font-semibold text-neutral-800 mb-3">Storico importazioni</h2>
        {logLoading ? (
          <div className="text-center py-8 text-neutral-400">Caricamento...</div>
        ) : importLog.length === 0 ? (
          <EmptyState
            icon="🏦"
            title="Nessuna importazione effettuata"
            description="Carica il primo CSV Banco BPM per iniziare a tracciare i movimenti."
            compact
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-neutral-500 text-xs">
                  <th className="pb-2">Data import</th>
                  <th className="pb-2">File</th>
                  <th className="pb-2 text-center">Righe</th>
                  <th className="pb-2 text-center">Nuovi</th>
                  <th className="pb-2 text-center">Dup.</th>
                  <th className="pb-2">Periodo dati</th>
                </tr>
              </thead>
              <tbody>
                {importLog.map((log) => (
                  <tr key={log.id} className="border-b border-neutral-100 hover:bg-neutral-50">
                    <td className="py-2 text-xs text-neutral-500">{log.created_at}</td>
                    <td className="py-2 text-xs truncate max-w-xs">{log.filename}</td>
                    <td className="py-2 text-xs text-center">{log.num_rows}</td>
                    <td className="py-2 text-xs text-center font-semibold text-emerald-700">{log.num_new}</td>
                    <td className="py-2 text-xs text-center text-neutral-400">{log.num_duplicates}</td>
                    <td className="py-2 text-xs text-neutral-500">
                      {log.date_from} → {log.date_to}
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
