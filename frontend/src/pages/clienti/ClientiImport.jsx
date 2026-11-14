// @version: v2.0-mattoni — refactor con M.I UI primitives (PageLayout, Btn, StatusBadge)
// Import clienti + prenotazioni da TheFork XLSX + revisione diff
import React, { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { API_BASE, apiFetch } from "../../config/api";
import ClientiNav from "./ClientiNav";
import { PageLayout, Btn, StatusBadge } from "../../components/ui";
import { DiffRighe, risolviDifferenze } from "./DiffTheFork";

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

        <Btn
          variant="primary"
          size="md"
          onClick={handleImport}
          disabled={!file || loading}
          loading={loading}
          className="w-full"
        >
          {loading ? "Importazione in corso..." : "Avvia Import"}
        </Btn>
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

function DiffReviewSection({ onCountChange }) {
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState({});
  const [riordino, setRiordino] = useState(null); // anteprima del riordino con le regole
  const [riordinando, setRiordinando] = useState(false);
  const [toast, setToast] = useState({ show: false, message: "", type: "success" });

  const showToast = (message, type = "success") => {
    setToast({ show: true, message, type });
    setTimeout(() => setToast({ show: false, message: "", type: "success" }), 4000);
  };

  // Riapplica le regole alla coda: prima un'anteprima, poi «Procedi»
  const riordina = async (prova) => {
    setRiordinando(true);
    try {
      const res = await apiFetch(`${API_BASE}/clienti/import/diff/riordina`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prova }),
      });
      if (!res.ok) throw new Error(res.status === 403 ? "Solo l'amministratore può riordinare la coda" : "Errore nel riordino");
      const r = await res.json();
      if (prova) {
        setRiordino(r);
      } else {
        setRiordino(null);
        showToast(`Chiuse ${r.chiuse}, applicate ${r.applicate}: restano ${r.restano} da guardare`);
        fetchDiff();
      }
    } catch (err) {
      showToast(err.message, "error");
    } finally {
      setRiordinando(false);
    }
  };

  const fetchDiff = useCallback(async () => {
    try {
      const res = await apiFetch(`${API_BASE}/clienti/import/diff?stato=pending`);
      if (!res.ok) throw new Error("Errore caricamento diff");
      const d = await res.json();
      setData(d);
      if (onCountChange) onCountChange(d.totale ?? d.totale_diff ?? 0);
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
      const r = await risolviDifferenze(ids, azione);
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
  const totale = data.totale ?? data.totale_diff;
  const NOMI_CAMPO = { cognome: "cognomi", nome: "nomi", lingua: "lingue", telefono: "telefoni", email: "email", titolo: "titoli" };

  return (
    <div className="mb-8">
      <h2 className="text-lg font-bold text-neutral-900 mb-3 flex items-center gap-2">
        Revisione Differenze Import
        <StatusBadge tone="warning" size="md">{totale}</StatusBadge>
      </h2>
      <p className="text-sm text-neutral-500 mb-4">
        Dati diversi tra il CRM e TheFork sui clienti protetti. Per ogni campo puoi applicare il valore
        di TheFork o tenere il nostro; un «Ignora» viene ricordato. Le trovi anche nella scheda del cliente.
        {totale > data.totale_diff && ` Qui sotto le ultime ${data.totale_diff} di ${totale}.`}
      </p>

      {/* Riordino con le regole (2026-11-14) */}
      <div className="bg-white rounded-xl border border-neutral-200 shadow-sm p-4 mb-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex-1 min-w-[240px] text-sm text-neutral-600">
            <span className="font-semibold text-neutral-800">Regole automatiche:</span> maiuscole e accenti non contano;
            nome, cognome e titolo restano i nostri; la lingua di TheFork vale solo se da noi c'è quella di partenza;
            prefissi invertiti («+93» per «+39») e alias email di Apple si sistemano da soli.
          </div>
          {!riordino && (
            <Btn variant="secondary" size="md" onClick={() => riordina(true)} loading={riordinando} disabled={riordinando}>
              Riordina la coda con le regole
            </Btn>
          )}
        </div>
        {riordino && (
          <div className="mt-3 rounded-lg bg-neutral-50 border border-neutral-200 p-3 text-sm space-y-2">
            <div>
              Chiudo <b>{riordino.chiuse}</b>, applico <b>{riordino.applicate}</b> dati di TheFork,
              restano <b>{riordino.restano}</b> da guardare.
            </div>
            <div className="text-xs text-neutral-500">
              {Object.entries(riordino.per_campo || {})
                .sort((a, b) => (b[1].chiuse + b[1].applicate + b[1].restano) - (a[1].chiuse + a[1].applicate + a[1].restano))
                .map(([campo, c]) => `${NOMI_CAMPO[campo] || campo}: ${[c.chiuse && `${c.chiuse} chiuse`, c.applicate && `${c.applicate} applicate`, c.restano && `${c.restano} restano`].filter(Boolean).join(", ")}`)
                .join(" · ")}
            </div>
            <div className="flex gap-2">
              <Btn variant="primary" size="md" onClick={() => riordina(false)} loading={riordinando} disabled={riordinando}>
                Procedi
              </Btn>
              <Btn variant="ghost" size="md" onClick={() => setRiordino(null)} disabled={riordinando}>
                Annulla
              </Btn>
            </div>
          </div>
        )}
      </div>

      {/* Azioni globali */}
      <div className="flex gap-2 mb-4">
        <Btn variant="primary" size="sm" onClick={() => handleBulkAll("applica")}>
          Applica tutte ({data.totale_diff})
        </Btn>
        <Btn variant="secondary" size="sm" onClick={() => handleBulkAll("ignora")}>
          Ignora tutte
        </Btn>
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
                <Btn variant="chip" tone="emerald" size="sm" onClick={() => handleAction(allIds, "applica")} disabled={acting[allKey]}>
                  Applica tutto
                </Btn>
                <Btn variant="chip" tone="neutral" size="sm" onClick={() => handleAction(allIds, "ignora")} disabled={acting[allKey]}>
                  Ignora tutto
                </Btn>
              </div>
            </div>

            {/* Righe diff (componente condiviso con la scheda cliente) */}
            <DiffRighe diff={cliente.diff} onAction={handleAction} acting={acting} />
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
        <Btn variant="success" size="md" onClick={handleExport} disabled={exporting} loading={exporting}>
          {exporting ? "Esportazione..." : "Scarica CSV per Google Contacts"}
        </Btn>
      </div>
    </div>
  );
}

export default function ClientiImport({ embedded = false }) {
  const [diffCount, setDiffCount] = useState(0);

  const content = (
    <>
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
    </>
  );

  if (embedded) return content;

  return (
    <PageLayout
      nav={<ClientiNav current="impostazioni" diffCount={diffCount} />}
      className="max-w-3xl"
    >
      {content}
    </PageLayout>
  );
}
