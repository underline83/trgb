// @version: v1.1-clienti-import
// Import clienti + prenotazioni da TheFork XLSX
import React, { useState } from "react";
import { API_BASE, apiFetch } from "../../config/api";
import ClientiNav from "./ClientiNav";

function ImportSection({ title, icon, instructions, endpoint, color, note }) {
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [toast, setToast] = useState({ show: false, message: "", type: "success" });

  const showToast = (message, type = "success") => {
    setToast({ show: true, message, type });
    setTimeout(() => setToast({ show: false, message: "", type: "success" }), 4000);
  };

  const handleImport = async () => {
    if (!file) return;
    setLoading(true);
    setResult(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await apiFetch(`${API_BASE}${endpoint}`, { method: "POST", body: formData });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || "Errore import");
      }
      const data = await res.json();
      setResult(data);
      showToast(`Import completato: ${data.inseriti} nuovi, ${data.aggiornati} aggiornati`);
    } catch (err) {
      showToast(err.message, "error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mb-8">
      <h2 className="text-lg font-bold text-neutral-900 mb-3">{icon} {title}</h2>

      <div className={`bg-${color}-50 border border-${color}-200 rounded-xl p-4 mb-4`}>
        <ol className="text-sm text-neutral-700 space-y-1 list-decimal list-inside">
          {instructions.map((step, i) => <li key={i}>{step}</li>)}
        </ol>
        {note && <p className="text-xs text-neutral-500 mt-2">{note}</p>}
      </div>

      <div className="bg-white rounded-xl border border-neutral-200 p-5 shadow-sm">
        <label className="block mb-4">
          <div className="border-2 border-dashed border-neutral-300 rounded-xl p-5 text-center cursor-pointer hover:border-teal-400 hover:bg-teal-50 transition">
            <input type="file" accept=".xlsx,.xls" onChange={(e) => setFile(e.target.files?.[0] || null)} className="hidden" />
            {file ? (
              <div>
                <span className="text-2xl">📄</span>
                <p className="text-sm font-medium text-neutral-800 mt-1">{file.name}</p>
                <p className="text-xs text-neutral-500">{(file.size / 1024 / 1024).toFixed(1)} MB</p>
              </div>
            ) : (
              <div>
                <span className="text-2xl">📂</span>
                <p className="text-sm text-neutral-500 mt-1">Seleziona file XLSX</p>
              </div>
            )}
          </div>
        </label>

        <button onClick={handleImport} disabled={!file || loading}
          className={`w-full py-2.5 rounded-lg text-sm font-semibold transition ${
            !file || loading ? "bg-neutral-200 text-neutral-400 cursor-not-allowed" : "bg-teal-600 text-white hover:bg-teal-700"
          }`}>
          {loading ? "Importazione in corso..." : "Avvia Import"}
        </button>
      </div>

      {result && (
        <div className="bg-white rounded-xl border border-neutral-200 p-4 shadow-sm mt-4">
          <h3 className="text-sm font-semibold text-neutral-700 mb-2">✅ Risultato</h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="text-center">
              <div className="text-xl font-bold text-emerald-600">{result.inseriti}</div>
              <div className="text-xs text-neutral-500">Nuovi</div>
            </div>
            <div className="text-center">
              <div className="text-xl font-bold text-sky-600">{result.aggiornati}</div>
              <div className="text-xs text-neutral-500">Aggiornati</div>
            </div>
            <div className="text-center">
              <div className="text-xl font-bold text-red-600">{result.errori}</div>
              <div className="text-xs text-neutral-500">Errori</div>
            </div>
            <div className="text-center">
              <div className="text-xl font-bold text-neutral-600">{result.totale_righe}</div>
              <div className="text-xs text-neutral-500">Righe</div>
            </div>
          </div>
          {result.collegati_a_clienti !== undefined && (
            <p className="text-xs text-teal-600 text-center mt-2 font-medium">
              {result.collegati_a_clienti.toLocaleString("it-IT")} prenotazioni collegate a clienti esistenti
            </p>
          )}
        </div>
      )}

      {toast.show && (
        <div className={`fixed bottom-4 right-4 px-4 py-2 rounded-lg shadow-lg text-sm font-medium z-50 ${
          toast.type === "error" ? "bg-red-600 text-white" : "bg-emerald-600 text-white"
        }`} onClick={() => setToast({ ...toast, show: false })}>
          {toast.message}
        </div>
      )}
    </div>
  );
}

export default function ClientiImport() {
  return (
    <>
      <ClientiNav current="import" />
      <div className="min-h-screen bg-neutral-50">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6">
          <h1 className="text-2xl font-bold text-neutral-900 mb-2">📥 Import TheFork</h1>
          <p className="text-sm text-neutral-500 mb-6">
            Importa prima i clienti, poi le prenotazioni. L'ordine è importante per collegare le prenotazioni ai clienti.
          </p>

          <ImportSection
            title="1. Anagrafica Clienti"
            icon="👥"
            endpoint="/clienti/import/thefork"
            color="amber"
            instructions={[
              "TheFork Manager → Clienti → Esporta",
              "Scarica il file XLSX",
              "Caricalo qui sotto",
            ]}
            note="L'import usa il TheFork ID come chiave: i clienti già presenti vengono aggiornati. I VIP ricevono automaticamente il tag."
          />

          <ImportSection
            title="2. Storico Prenotazioni"
            icon="📅"
            endpoint="/clienti/import/prenotazioni"
            color="sky"
            instructions={[
              "TheFork Manager → Prenotazioni → Esporta / Cerca",
              "Scarica il file XLSX con tutte le prenotazioni",
              "Caricalo qui sotto",
            ]}
            note="Le prenotazioni vengono collegate ai clienti tramite Customer ID. Importa PRIMA i clienti per ottenere il collegamento."
          />
        </div>
      </div>
    </>
  );
}
