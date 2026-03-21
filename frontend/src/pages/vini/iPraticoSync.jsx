// @version: v1.1-ipratico-direct-id
// Pagina sincronizzazione prodotti iPratico ↔ vini TRGB
import React, { useState, useEffect, useCallback, useRef } from "react";
import { API_BASE, apiFetch } from "../../config/api";
import ViniNav from "./ViniNav";

const EP = `${API_BASE}/vini/ipratico`;

export default function IPraticoSync() {
  const [tab, setTab] = useState("mapping"); // mapping | upload | export | log
  const [stats, setStats] = useState(null);

  const loadStats = useCallback(async () => {
    try {
      const r = await apiFetch(`${EP}/stats`);
      if (r.ok) setStats(await r.json());
    } catch (_) {}
  }, []);

  useEffect(() => { loadStats(); }, [loadStats]);

  return (
    <div className="min-h-screen bg-neutral-100 font-sans">
      <ViniNav current="ipratico" />
      <div className="max-w-7xl mx-auto p-4 sm:p-6">
        <div className="bg-white shadow-xl rounded-2xl p-6 sm:p-8 border border-neutral-200">
          <h1 className="text-2xl font-bold text-amber-900 font-playfair mb-1">
            Sincronizzazione iPratico
          </h1>
          <p className="text-neutral-500 text-sm mb-4">
            Importa l'export prodotti iPratico, abbina ai vini TRGB, esporta con giacenze e prezzi aggiornati.
          </p>

          {/* Stats bar */}
          {stats && stats.total > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-5">
              {[
                { label: "Totale", val: stats.total, color: "text-neutral-800" },
                { label: "Abbinati", val: stats.matched, color: "text-emerald-700" },
                { label: "Auto", val: stats.auto, color: "text-sky-700" },
                { label: "Manuali", val: stats.manual, color: "text-violet-700" },
                { label: "Da abbinare", val: stats.unmatched, color: "text-amber-700" },
              ].map(s => (
                <div key={s.label} className="rounded-xl border border-neutral-200 bg-neutral-50 p-3 text-center">
                  <div className={`text-lg font-bold ${s.color}`}>{s.val}</div>
                  <div className="text-[10px] text-neutral-500 uppercase tracking-wide">{s.label}</div>
                </div>
              ))}
            </div>
          )}

          {/* Tabs */}
          <div className="flex gap-1 mb-5 border-b border-neutral-200">
            {[
              { key: "mapping", label: "Mapping Vini" },
              { key: "upload", label: "Importa Excel" },
              { key: "export", label: "Esporta Excel" },
              { key: "log", label: "Storico" },
            ].map(t => (
              <button key={t.key} onClick={() => setTab(t.key)}
                className={`px-5 py-2.5 text-sm font-semibold rounded-t-xl transition -mb-px ${
                  tab === t.key
                    ? "bg-amber-50 text-amber-900 border border-b-0 border-amber-200"
                    : "text-neutral-500 hover:text-neutral-800"
                }`}>
                {t.label}
              </button>
            ))}
          </div>

          {tab === "upload" && <UploadTab onDone={() => { loadStats(); setTab("mapping"); }} />}
          {tab === "mapping" && <MappingTab onUpdate={loadStats} />}
          {tab === "export" && <ExportTab />}
          {tab === "log" && <LogTab />}
        </div>
      </div>
    </div>
  );
}

/* ─── Upload Tab ───────────────────────────────────────────────── */
function UploadTab({ onDone }) {
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const fileRef = useRef(null);

  const handleUpload = async () => {
    const file = fileRef.current?.files?.[0];
    if (!file) { setError("Seleziona un file Excel da importare."); return; }
    setUploading(true); setError(""); setResult(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const resp = await apiFetch(`${EP}/upload`, { method: "POST", body: fd });
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        throw new Error(err.detail || "Errore importazione");
      }
      setResult(await resp.json());
      fileRef.current.value = "";
    } catch (e) { setError(e.message); }
    setUploading(false);
  };

  return (
    <div>
      <p className="text-sm text-neutral-600 mb-4">
        Carica l'export prodotti iPratico (.xlsx). Vengono estratte le <strong>Bottiglie</strong> e
        abbinate automaticamente ai vini TRGB per produttore e annata.
      </p>

      <div className="rounded-2xl border-2 border-dashed border-neutral-300 bg-neutral-50 p-8 text-center mb-6">
        <div className="text-4xl mb-3">📥</div>
        <p className="text-sm text-neutral-600 mb-4">
          Formato: <strong>lct_*_export_products.xlsx</strong>
        </p>
        <div className="flex items-center justify-center gap-3">
          <input ref={fileRef} type="file" accept=".xlsx,.xls" className="text-sm" />
          <button onClick={handleUpload} disabled={uploading}
            className={`px-5 py-2.5 rounded-xl text-sm font-semibold shadow transition ${
              uploading ? "bg-neutral-300 text-neutral-500 cursor-not-allowed"
                : "bg-amber-600 text-white hover:bg-amber-700"
            }`}>
            {uploading ? "Importazione..." : "Importa"}
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-4 rounded-xl border border-red-300 bg-red-50 text-red-800 px-4 py-3 text-sm">{error}</div>
      )}

      {result && (
        <div className="rounded-xl border border-emerald-300 bg-emerald-50 text-emerald-800 px-4 py-4 text-sm mb-4">
          <div className="font-semibold mb-2">Importazione completata</div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Stat label="Prodotti totali" val={result.total_products} />
            <Stat label="Bottiglie" val={result.total_bottiglie} />
            <Stat label="Abbinati (ID)" val={result.matched} color="text-emerald-700" />
            <Stat label="Da abbinare" val={result.unmatched} color="text-amber-700" />
          </div>
          <button onClick={onDone}
            className="mt-4 px-4 py-2 bg-emerald-600 text-white rounded-xl text-sm font-semibold hover:bg-emerald-700 transition">
            Vai al Mapping →
          </button>
        </div>
      )}
    </div>
  );
}

/* ─── Mapping Tab ──────────────────────────────────────────────── */
function MappingTab({ onUpdate }) {
  const [mappings, setMappings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all"); // all | matched | unmatched
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState(null); // map_id being edited
  const [trgbSearch, setTrgbSearch] = useState("");
  const [trgbResults, setTrgbResults] = useState([]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filter === "matched") params.set("status", "auto");
      if (filter === "unmatched") params.set("status", "unmatched");
      if (search) params.set("search", search);
      const url = `${EP}/mappings${params.toString() ? "?" + params : ""}`;
      const r = await apiFetch(url);
      if (r.ok) setMappings(await r.json());
    } catch (_) {}
    setLoading(false);
  }, [filter, search]);

  useEffect(() => { load(); }, [load]);

  const filtered = mappings.filter(m => {
    if (filter === "matched") return m.vino_id != null;
    if (filter === "unmatched") return m.vino_id == null;
    return true;
  });

  const searchTRGB = async (q) => {
    setTrgbSearch(q);
    if (q.length < 2) { setTrgbResults([]); return; }
    try {
      const r = await apiFetch(`${EP}/trgb-wines?search=${encodeURIComponent(q)}`);
      if (r.ok) setTrgbResults(await r.json());
    } catch (_) {}
  };

  const assignWine = async (mapId, vinoId) => {
    await apiFetch(`${EP}/mappings/${mapId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ vino_id: vinoId }),
    });
    setEditing(null);
    setTrgbSearch("");
    setTrgbResults([]);
    load();
    onUpdate();
  };

  const unlinkWine = async (mapId) => {
    await apiFetch(`${EP}/mappings/${mapId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ vino_id: null }),
    });
    load();
    onUpdate();
  };

  return (
    <div>
      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="flex gap-1">
          {[
            { key: "all", label: "Tutti" },
            { key: "matched", label: "Abbinati" },
            { key: "unmatched", label: "Da abbinare" },
          ].map(f => (
            <button key={f.key} onClick={() => setFilter(f.key)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                filter === f.key
                  ? "bg-amber-100 text-amber-900 shadow-sm"
                  : "bg-neutral-100 text-neutral-600 hover:bg-neutral-200"
              }`}>
              {f.label}
            </button>
          ))}
        </div>
        <input type="text" placeholder="Cerca produttore, nome..."
          value={search} onChange={e => setSearch(e.target.value)}
          className="px-3 py-1.5 border border-neutral-300 rounded-lg text-xs flex-1 min-w-[200px]" />
        <span className="text-xs text-neutral-400">{filtered.length} voci</span>
      </div>

      {loading ? (
        <p className="text-neutral-500 text-sm py-8 text-center">Caricamento...</p>
      ) : filtered.length === 0 ? (
        <p className="text-neutral-400 text-sm py-8 text-center">
          Nessun mapping trovato. Importa prima l'export iPratico.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b text-left text-neutral-500">
                <th className="pb-2 w-12">ID</th>
                <th className="pb-2">iPratico (Nome)</th>
                <th className="pb-2 w-16">Stato</th>
                <th className="pb-2">TRGB (Produttore / Denom.)</th>
                <th className="pb-2 w-12 text-center">QTA</th>
                <th className="pb-2 w-16 text-right">Prezzo</th>
                <th className="pb-2 w-20"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(m => (
                <React.Fragment key={m.id}>
                  <tr className={`border-b border-neutral-100 hover:bg-neutral-50 ${
                    !m.vino_id ? "bg-amber-50/40" : ""
                  }`}>
                    <td className="py-2 font-mono text-neutral-400">{m.ipratico_wine_id || "?"}</td>
                    <td className="py-2">
                      <div className="font-medium text-neutral-800 truncate max-w-xs" title={m.ipratico_name}>
                        {m.ip_nome || m.ipratico_name}
                      </div>
                      <div className="text-[10px] text-neutral-400">
                        {m.ip_annata && <span>{m.ip_annata}</span>}
                        {m.ip_produttore && <span className="ml-1">· {m.ip_produttore}</span>}
                      </div>
                    </td>
                    <td className="py-2">
                      <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                        m.match_status === "auto" ? "bg-sky-100 text-sky-800" :
                        m.match_status === "manual" ? "bg-violet-100 text-violet-800" :
                        "bg-amber-100 text-amber-800"
                      }`}>
                        {m.match_status === "auto" ? "Auto" : m.match_status === "manual" ? "Manuale" : "—"}
                      </span>
                    </td>
                    <td className="py-2">
                      {m.vino_id ? (
                        <div>
                          <span className="font-medium">{m.trgb_produttore}</span>
                          {m.trgb_descrizione && <span className="text-neutral-400 ml-1">· {m.trgb_descrizione}</span>}
                          {m.trgb_annata && <span className="text-neutral-400 ml-1">({m.trgb_annata})</span>}
                          <span className="text-neutral-300 ml-1">#{m.vino_id}</span>
                        </div>
                      ) : (
                        <span className="text-neutral-400 italic">Non abbinato</span>
                      )}
                    </td>
                    <td className="py-2 text-center font-mono">{m.vino_id ? (m.trgb_qta ?? 0) : ""}</td>
                    <td className="py-2 text-right font-mono">
                      {m.vino_id && m.trgb_prezzo ? `€${Number(m.trgb_prezzo).toLocaleString("it-IT", { minimumFractionDigits: 0 })}` : ""}
                    </td>
                    <td className="py-2 text-right">
                      {m.vino_id ? (
                        <button onClick={() => unlinkWine(m.id)}
                          className="text-[10px] px-1.5 py-0.5 text-red-500 hover:bg-red-50 rounded">
                          Scollega
                        </button>
                      ) : (
                        <button onClick={() => { setEditing(m.id); setTrgbSearch(""); setTrgbResults([]); }}
                          className="text-[10px] px-2 py-0.5 bg-amber-100 text-amber-800 rounded hover:bg-amber-200 font-semibold">
                          Abbina
                        </button>
                      )}
                    </td>
                  </tr>
                  {editing === m.id && (
                    <tr className="bg-amber-50 border-b border-amber-200">
                      <td colSpan={7} className="p-3">
                        <div className="flex items-center gap-2 mb-2">
                          <span className="text-xs font-semibold text-amber-800">Cerca vino TRGB:</span>
                          <input type="text" placeholder="Produttore, denominazione..."
                            value={trgbSearch} onChange={e => searchTRGB(e.target.value)}
                            className="px-2 py-1 border rounded text-xs flex-1 max-w-xs" autoFocus />
                          <button onClick={() => { setEditing(null); setTrgbSearch(""); setTrgbResults([]); }}
                            className="text-xs px-2 py-1 bg-neutral-200 rounded">Annulla</button>
                        </div>
                        {trgbResults.length > 0 && (
                          <div className="max-h-40 overflow-y-auto border rounded bg-white">
                            {trgbResults.map(w => (
                              <button key={w.id} onClick={() => assignWine(m.id, w.id)}
                                className="w-full text-left px-3 py-1.5 text-xs hover:bg-amber-50 border-b border-neutral-100 flex justify-between">
                                <span>
                                  <strong>{w.PRODUTTORE}</strong>
                                  {w.DENOMINAZIONE && <span className="ml-1 text-neutral-500">{w.DENOMINAZIONE}</span>}
                                  <span className="ml-1 text-neutral-400">({w.ANNATA || "s.a."})</span>
                                  <span className="ml-1 text-neutral-300">{w.FORMATO}</span>
                                </span>
                                <span className="text-neutral-400">#{w.id} · Q:{w.QTA}</span>
                              </button>
                            ))}
                          </div>
                        )}
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/* ─── Export Tab ────────────────────────────────────────────────── */
function ExportTab() {
  const [exporting, setExporting] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const fileRef = useRef(null);

  const handleExport = async () => {
    const file = fileRef.current?.files?.[0];
    if (!file) { setError("Seleziona l'export iPratico originale."); return; }
    setExporting(true); setError(""); setResult(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const resp = await apiFetch(`${EP}/export`, { method: "POST", body: fd });
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        throw new Error(err.detail || "Errore export");
      }
      const blob = await resp.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = resp.headers.get("Content-Disposition")?.match(/filename="(.+)"/)?.[1] || "ipratico_sync.xlsx";
      a.click();
      URL.revokeObjectURL(url);
      setResult({
        qty: resp.headers.get("X-Updated-Qty") || "0",
        price: resp.headers.get("X-Updated-Price") || "0",
        matched: resp.headers.get("X-Total-Matched") || "0",
      });
      fileRef.current.value = "";
    } catch (e) { setError(e.message); }
    setExporting(false);
  };

  return (
    <div>
      <p className="text-sm text-neutral-600 mb-4">
        Carica lo <strong>stesso file</strong> export iPratico. Le giacenze Warehouse_quantity e i
        prezzi Ristorante verranno aggiornati con i dati TRGB per i vini abbinati.
        Scaricherai il file modificato pronto per l'importazione in iPratico.
      </p>

      <div className="rounded-2xl border-2 border-dashed border-neutral-300 bg-neutral-50 p-8 text-center mb-6">
        <div className="text-4xl mb-3">📤</div>
        <div className="flex items-center justify-center gap-3">
          <input ref={fileRef} type="file" accept=".xlsx,.xls" className="text-sm" />
          <button onClick={handleExport} disabled={exporting}
            className={`px-5 py-2.5 rounded-xl text-sm font-semibold shadow transition ${
              exporting ? "bg-neutral-300 text-neutral-500 cursor-not-allowed"
                : "bg-emerald-600 text-white hover:bg-emerald-700"
            }`}>
            {exporting ? "Elaborazione..." : "Genera Export"}
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-4 rounded-xl border border-red-300 bg-red-50 text-red-800 px-4 py-3 text-sm">{error}</div>
      )}

      {result && (
        <div className="rounded-xl border border-emerald-300 bg-emerald-50 text-emerald-800 px-4 py-4 text-sm">
          <div className="font-semibold mb-2">Export generato e scaricato</div>
          <div className="grid grid-cols-3 gap-3">
            <Stat label="Vini abbinati" val={result.matched} color="text-emerald-700" />
            <Stat label="Giacenze aggiornate" val={result.qty} color="text-sky-700" />
            <Stat label="Prezzi aggiornati" val={result.price} color="text-violet-700" />
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── Log Tab ──────────────────────────────────────────────────── */
function LogTab() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const r = await apiFetch(`${EP}/sync-log`);
        if (r.ok) setLogs(await r.json());
      } catch (_) {}
      setLoading(false);
    })();
  }, []);

  if (loading) return <p className="text-neutral-500 text-sm py-8 text-center">Caricamento...</p>;
  if (logs.length === 0) return <p className="text-neutral-400 text-sm py-8 text-center">Nessuna sincronizzazione effettuata.</p>;

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b text-left text-neutral-500">
            <th className="pb-2">Data</th>
            <th className="pb-2">Direzione</th>
            <th className="pb-2">File</th>
            <th className="pb-2 text-center">Abbinati</th>
            <th className="pb-2 text-center">QTA agg.</th>
            <th className="pb-2 text-center">Prezzi agg.</th>
            <th className="pb-2 text-center">Non abb.</th>
          </tr>
        </thead>
        <tbody>
          {logs.map(l => (
            <tr key={l.id} className="border-b border-neutral-100 hover:bg-neutral-50">
              <td className="py-2 text-neutral-500">{l.created_at}</td>
              <td className="py-2">
                <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                  l.direction === "import" ? "bg-sky-100 text-sky-800" : "bg-emerald-100 text-emerald-800"
                }`}>
                  {l.direction === "import" ? "Import" : "Export"}
                </span>
              </td>
              <td className="py-2 truncate max-w-xs">{l.filename}</td>
              <td className="py-2 text-center">{l.n_matched}</td>
              <td className="py-2 text-center">{l.n_updated_qty || 0}</td>
              <td className="py-2 text-center">{l.n_updated_price || 0}</td>
              <td className="py-2 text-center text-amber-600">{l.n_unmatched || 0}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ─── Stat helper ──────────────────────────────────────────────── */
function Stat({ label, val, color = "text-neutral-800" }) {
  return (
    <div>
      <div className={`text-xs text-neutral-500`}>{label}</div>
      <div className={`text-lg font-bold ${color}`}>{val}</div>
    </div>
  );
}
