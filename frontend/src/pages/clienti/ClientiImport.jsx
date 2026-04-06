// @version: v1.2-clienti-import
// Import clienti + prenotazioni da TheFork XLSX + revisione diff
import React, { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
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
          {result.diff_trovati > 0 && (
            <p className="text-xs text-amber-600 text-center mt-2 font-medium">
              {result.diff_trovati} differenze trovate su clienti protetti — scorri in basso per revisionarle
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

// Etichette italiane per i campi
const CAMPO_LABELS = {
  nome: "Nome", cognome: "Cognome", titolo: "Titolo", email: "Email",
  telefono: "Telefono", telefono2: "Telefono 2", data_nascita: "Data nascita",
  lingua: "Lingua", indirizzo: "Indirizzo", cap: "CAP", citta: "Città",
  paese: "Paese", pref_cibo: "Pref. cibo", pref_bevande: "Pref. bevande",
  pref_posto: "Pref. posto", restrizioni_dietetiche: "Restrizioni",
  allergie: "Allergie", note_thefork: "Note TheFork",
};

function DiffReviewSection({ onCountChange }) {
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState({});
  const [toast, setToast] = useState({ show: false, message: "", type: "success" });

  const showToast = (message, type = "success") => {
    setToast({ show: true, message, type });
    setTimeout(() => setToast({ show: false, message: "", type: "success" }), 4000);
  };

  const fetchDiff = useCallback(async () => {
    try {
      const res = await apiFetch(`${API_BASE}/clienti/import/diff?stato=pending`);
      if (!res.ok) throw new Error("Errore caricamento diff");
      const d = await res.json();
      setData(d);
      if (onCountChange) onCountChange(d.totale_diff || 0);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [onCountChange]);

  useEffect(() => { fetchDiff(); }, [fetchDiff]);

  const handleAction = async (ids, azione) => {
    const key = ids.join(",");
    setActing(prev => ({ ...prev, [key]: true }));
    try {
      const res = await apiFetch(`${API_BASE}/clienti/import/diff/risolvi`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids, azione }),
      });
      if (!res.ok) throw new Error("Errore");
      const r = await res.json();
      showToast(azione === "applica"
        ? `${r.applicati} modifiche applicate`
        : `${r.ignorati} modifiche ignorate`);
      fetchDiff();
    } catch (err) {
      showToast(err.message, "error");
    } finally {
      setActing(prev => ({ ...prev, [key]: false }));
    }
  };

  const handleBulkAll = async (azione) => {
    if (!data?.clienti?.length) return;
    const allIds = data.clienti.flatMap(c => c.diff.map(d => d.id));
    if (!confirm(`Sei sicuro di voler ${azione === "applica" ? "APPLICARE" : "IGNORARE"} tutte le ${allIds.length} differenze?`)) return;
    await handleAction(allIds, azione);
  };

  if (loading) return <div className="text-sm text-neutral-500 py-4">Caricamento revisioni...</div>;
  if (!data || data.totale_diff === 0) return null;

  return (
    <div className="mb-8">
      <h2 className="text-lg font-bold text-neutral-900 mb-3">
        Revisione Differenze Import
        <span className="ml-2 px-2 py-0.5 bg-amber-100 text-amber-700 text-xs font-bold rounded-full">
          {data.totale_diff}
        </span>
      </h2>
      <p className="text-sm text-neutral-500 mb-4">
        Queste differenze sono state trovate tra i dati nel CRM e l'ultimo import TheFork.
        Per ogni campo puoi decidere se applicare il valore TheFork o mantenere quello attuale.
      </p>

      {/* Azioni globali */}
      <div className="flex gap-2 mb-4">
        <button onClick={() => handleBulkAll("applica")}
          className="px-3 py-1.5 text-xs font-semibold bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition">
          Applica tutte ({data.totale_diff})
        </button>
        <button onClick={() => handleBulkAll("ignora")}
          className="px-3 py-1.5 text-xs font-semibold bg-neutral-500 text-white rounded-lg hover:bg-neutral-600 transition">
          Ignora tutte
        </button>
      </div>

      {data.clienti.map(cliente => {
        const allIds = cliente.diff.map(d => d.id);
        const allKey = allIds.join(",");
        return (
          <div key={cliente.cliente_id} className="bg-white rounded-xl border border-neutral-200 shadow-sm mb-3 overflow-hidden">
            {/* Header cliente */}
            <div className="flex items-center justify-between bg-neutral-50 px-4 py-2.5 border-b border-neutral-200">
              <div>
                <button onClick={() => navigate(`/clienti/${cliente.cliente_id}`)}
                  className="text-sm font-bold text-teal-700 hover:underline">
                  {cliente.cognome} {cliente.nome}
                </button>
                <span className="text-xs text-neutral-400 ml-2">
                  {cliente.telefono || ""} {cliente.email ? `· ${cliente.email}` : ""}
                </span>
              </div>
              <div className="flex gap-1.5">
                <button onClick={() => handleAction(allIds, "applica")} disabled={acting[allKey]}
                  className="px-2 py-1 text-xs font-medium bg-teal-100 text-teal-700 rounded hover:bg-teal-200 transition disabled:opacity-50">
                  Applica tutto
                </button>
                <button onClick={() => handleAction(allIds, "ignora")} disabled={acting[allKey]}
                  className="px-2 py-1 text-xs font-medium bg-neutral-100 text-neutral-600 rounded hover:bg-neutral-200 transition disabled:opacity-50">
                  Ignora tutto
                </button>
              </div>
            </div>

            {/* Righe diff */}
            <div className="divide-y divide-neutral-100">
              {cliente.diff.map(d => {
                const dKey = String(d.id);
                return (
                  <div key={d.id} className="flex items-center px-4 py-2 text-sm gap-3">
                    <div className="w-28 text-xs font-semibold text-neutral-500 uppercase shrink-0">
                      {CAMPO_LABELS[d.campo] || d.campo}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="px-2 py-0.5 bg-red-50 text-red-700 text-xs rounded border border-red-200 truncate max-w-[200px]" title={d.valore_crm}>
                          {d.valore_crm}
                        </span>
                        <span className="text-neutral-400 text-xs">→</span>
                        <span className="px-2 py-0.5 bg-emerald-50 text-emerald-700 text-xs rounded border border-emerald-200 truncate max-w-[200px]" title={d.valore_thefork}>
                          {d.valore_thefork}
                        </span>
                      </div>
                    </div>
                    <div className="flex gap-1 shrink-0">
                      <button onClick={() => handleAction([d.id], "applica")} disabled={acting[dKey]}
                        className="px-2 py-1 text-xs bg-teal-600 text-white rounded hover:bg-teal-700 transition disabled:opacity-50">
                        Applica
                      </button>
                      <button onClick={() => handleAction([d.id], "ignora")} disabled={acting[dKey]}
                        className="px-2 py-1 text-xs bg-neutral-200 text-neutral-600 rounded hover:bg-neutral-300 transition disabled:opacity-50">
                        Ignora
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}

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

function ExportSection() {
  const [exporting, setExporting] = useState(false);

  const handleExport = async () => {
    setExporting(true);
    try {
      const res = await apiFetch(`${API_BASE}/clienti/export/google-csv`);
      if (!res.ok) throw new Error("Errore export");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `trgb_clienti_google_${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      alert(err.message);
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="mb-8">
      <h2 className="text-lg font-bold text-neutral-900 mb-3">Export Contatti</h2>
      <div className="bg-white rounded-xl border border-neutral-200 p-5 shadow-sm">
        <p className="text-sm text-neutral-600 mb-3">
          Esporta i clienti in formato CSV compatibile con Google Contacts / Gmail.
          Include nome, email, telefono, compleanni, allergie, tag come gruppi.
        </p>
        <button onClick={handleExport} disabled={exporting}
          className={`px-4 py-2 rounded-lg text-sm font-semibold transition ${
            exporting ? "bg-neutral-200 text-neutral-400" : "bg-emerald-600 text-white hover:bg-emerald-700"
          }`}>
          {exporting ? "Esportazione..." : "Scarica CSV per Google Contacts"}
        </button>
      </div>
    </div>
  );
}

export default function ClientiImport() {
  const [diffCount, setDiffCount] = useState(0);

  return (
    <>
      <ClientiNav current="import" diffCount={diffCount} />
      <div className="min-h-screen bg-neutral-50">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6">
          <h1 className="text-2xl font-bold text-neutral-900 mb-2">Import / Export</h1>
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
            note="L'import usa il TheFork ID come chiave: i clienti già presenti vengono aggiornati (quelli protetti solo nei campi vuoti). Le differenze trovate vengono messe in coda per la tua revisione."
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

          <DiffReviewSection onCountChange={setDiffCount} />

          <ExportSection />
        </div>
      </div>
    </>
  );
}
