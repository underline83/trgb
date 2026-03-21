// @version: v1.0-finanza-import
import React, { useEffect, useState, useRef } from "react";
import { API_BASE, apiFetch } from "../../config/api";
import FinanzaNav from "./FinanzaNav";

const FC = `${API_BASE}/finanza`;

export default function FinanzaImport() {
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [importLog, setImportLog] = useState([]);
  const [logLoading, setLogLoading] = useState(true);
  const [stats, setStats] = useState(null);
  const fileRef = useRef(null);

  useEffect(() => {
    loadLog();
    loadStats();
  }, []);

  const loadLog = async () => {
    setLogLoading(true);
    try {
      const resp = await apiFetch(`${FC}/import-log`);
      if (resp.ok) setImportLog(await resp.json());
    } catch (_) {}
    setLogLoading(false);
  };

  const loadStats = async () => {
    try {
      const resp = await apiFetch(`${FC}/stats`);
      if (resp.ok) setStats(await resp.json());
    } catch (_) {}
  };

  const handleUpload = async () => {
    const file = fileRef.current?.files?.[0];
    if (!file) return;
    setUploading(true);
    setError("");
    setResult(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const resp = await apiFetch(`${FC}/import`, { method: "POST", body: fd });
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        throw new Error(err.detail || "Errore import");
      }
      const data = await resp.json();
      setResult(data);
      fileRef.current.value = "";
      loadLog();
      loadStats();
    } catch (err) {
      setError(err.message);
    } finally {
      setUploading(false);
    }
  };

  const handleReset = async () => {
    if (!window.confirm("Eliminare TUTTI i movimenti finanza? Questa operazione è irreversibile.")) return;
    try {
      const resp = await apiFetch(`${FC}/reset`, { method: "DELETE" });
      if (!resp.ok) throw new Error("Errore reset");
      setResult({ ok: true, message: "Dati eliminati. Puoi reimportare il file." });
      loadStats();
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div className="min-h-screen bg-neutral-100 p-6 font-sans">
      <FinanzaNav current="import" />
      <div className="max-w-4xl mx-auto bg-white shadow-2xl rounded-3xl p-6 sm:p-10 border border-neutral-200 mt-4">
        <h1 className="text-3xl font-bold text-violet-900 tracking-wide font-playfair mb-1">
          Import Excel Finanza
        </h1>
        <p className="text-neutral-600 text-sm mb-6">
          Carica il file movimenti Excel (foglio DATI). I dati verranno importati con entrambe le classificazioni.
        </p>

        {/* Stats attuali */}
        {stats && (
          <div className="grid grid-cols-3 gap-4 mb-6">
            <div className="rounded-xl border border-violet-200 bg-violet-50 p-3 text-center">
              <div className="text-2xl font-bold text-violet-800">{stats.totale_movimenti}</div>
              <div className="text-[10px] text-violet-600">Movimenti totali</div>
            </div>
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-center">
              <div className="text-2xl font-bold text-emerald-800">{stats.riconciliati}</div>
              <div className="text-[10px] text-emerald-600">Riconciliati (X/C)</div>
            </div>
            <div className="rounded-xl border border-violet-200 bg-violet-50 p-3 text-center">
              <div className="text-2xl font-bold text-violet-800">{stats.da_riconciliare}</div>
              <div className="text-[10px] text-violet-600">Da riconciliare</div>
            </div>
          </div>
        )}

        {/* Upload */}
        <div className="rounded-xl border-2 border-dashed border-violet-300 bg-violet-50/50 p-6 text-center mb-6">
          <input
            ref={fileRef}
            type="file"
            accept=".xlsx,.xls"
            className="block w-full text-sm text-neutral-600 file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-sm file:font-semibold file:bg-violet-600 file:text-white hover:file:bg-violet-700 cursor-pointer"
          />
          <button
            onClick={handleUpload}
            disabled={uploading}
            className="mt-4 px-6 py-2.5 rounded-xl text-sm font-semibold bg-violet-600 text-white hover:bg-violet-700 shadow transition disabled:opacity-50"
          >
            {uploading ? "Importazione in corso..." : "Importa foglio DATI"}
          </button>
        </div>

        {/* Reset */}
        <div className="mb-6 text-center">
          <button
            onClick={handleReset}
            className="text-xs text-red-500 hover:text-red-700 underline"
          >
            Reset: elimina tutti i movimenti e reimporta
          </button>
        </div>

        {error && (
          <div className="mb-4 rounded-xl border border-red-300 bg-red-50 text-red-800 px-4 py-3 text-sm">
            {error}
          </div>
        )}

        {result && (
          <div className="mb-4 rounded-xl border border-emerald-300 bg-emerald-50 text-emerald-800 px-4 py-3 text-sm">
            {result.message || (
              <>
                Import completato: <strong>{result.righe_importate}</strong> righe importate
                {result.righe_scartate > 0 && <>, {result.righe_scartate} scartate</>}.
              </>
            )}
          </div>
        )}

        {/* Storico import */}
        <h2 className="text-lg font-semibold text-neutral-800 mb-3 mt-6">Storico importazioni</h2>
        {logLoading ? (
          <div className="text-sm text-neutral-400">Caricamento...</div>
        ) : importLog.length === 0 ? (
          <div className="text-sm text-neutral-400">Nessuna importazione effettuata.</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-neutral-500 text-xs">
                <th className="pb-2">Data</th>
                <th className="pb-2">File</th>
                <th className="pb-2 text-right">Importate</th>
                <th className="pb-2 text-right">Scartate</th>
              </tr>
            </thead>
            <tbody>
              {importLog.map((l) => (
                <tr key={l.id} className="border-b border-neutral-100">
                  <td className="py-2 text-xs text-neutral-500">{l.imported_at?.slice(0, 16)}</td>
                  <td className="py-2 text-xs">{l.filename}</td>
                  <td className="py-2 text-xs text-right font-mono text-emerald-700">{l.righe_importate}</td>
                  <td className="py-2 text-xs text-right font-mono text-red-500">{l.righe_scartate}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
