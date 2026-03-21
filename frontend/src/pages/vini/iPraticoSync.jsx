// @version: v2.0-ipratico-workflow
// Pagina sincronizzazione iPratico — workflow lineare senza tab
// Importa → Verifica → Esporta (giacenze + testi TRGB + vini mancanti)
import React, { useState, useEffect, useCallback, useRef } from "react";
import { API_BASE, apiFetch } from "../../config/api";
import ViniNav from "./ViniNav";

const EP = `${API_BASE}/vini/ipratico`;

export default function IPraticoSync() {
  const [stats, setStats] = useState(null);
  const [section, setSection] = useState("review"); // "review" | "unmatched" | "missing"

  const loadStats = useCallback(async () => {
    try {
      const r = await apiFetch(`${EP}/stats`);
      if (r.ok) setStats(await r.json());
    } catch (_) {}
  }, []);

  useEffect(() => { loadStats(); }, [loadStats]);

  const hasData = stats && stats.total > 0;

  return (
    <div className="min-h-screen bg-neutral-100 font-sans">
      <ViniNav current="ipratico" />
      <div className="max-w-6xl mx-auto p-4 sm:p-6 space-y-4">

        {/* ── Header compatto ─────────────────────────── */}
        <div className="bg-white shadow rounded-2xl p-5 border border-neutral-200">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h1 className="text-xl font-bold text-amber-900 font-playfair">iPratico Sync</h1>
              <p className="text-neutral-400 text-xs mt-0.5">
                Importa → verifica → aggiorna → esporta
              </p>
            </div>
            <ImportButton onDone={loadStats} />
          </div>

          {/* Stats bar inline */}
          {hasData && (
            <div className="flex flex-wrap gap-3 text-xs">
              <StatChip label="Bottiglie" val={stats.total} />
              <StatChip label="Abbinati" val={stats.matched} color="text-emerald-700" />
              <StatChip label="Da abbinare" val={stats.unmatched} color="text-amber-700"
                onClick={stats.unmatched > 0 ? () => setSection("unmatched") : null} />
              <StatChip label="Ignorati" val={stats.ignored} color="text-neutral-400" />
              <StatChip label="Mancanti iPr." val={stats.missing || 0} color="text-rose-600"
                onClick={stats.missing > 0 ? () => setSection("missing") : null} />
            </div>
          )}
        </div>

        {/* ── Sezione dinamica ────────────────────────── */}
        {hasData && (
          <div className="bg-white shadow rounded-2xl p-5 border border-neutral-200">
            {/* Mini-nav */}
            <div className="flex gap-1 mb-4">
              {[
                { key: "review", label: "Tutti i mapping" },
                { key: "unmatched", label: "Da abbinare", badge: stats?.unmatched },
                { key: "missing", label: "Mancanti su iPratico", badge: stats?.missing },
              ].map(s => (
                <button key={s.key} onClick={() => setSection(s.key)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                    section === s.key
                      ? "bg-amber-100 text-amber-900 shadow-sm"
                      : "text-neutral-500 hover:bg-neutral-100"
                  }`}>
                  {s.label}
                  {s.badge > 0 && (
                    <span className="ml-1.5 bg-rose-500 text-white text-[9px] px-1.5 py-0.5 rounded-full font-bold">{s.badge}</span>
                  )}
                </button>
              ))}
            </div>

            {section === "review" && <MappingTable onUpdate={loadStats} filterDefault="all" />}
            {section === "unmatched" && <MappingTable onUpdate={loadStats} filterDefault="unmatched" />}
            {section === "missing" && <MissingList />}
          </div>
        )}

        {/* ── Export ──────────────────────────────────── */}
        {hasData && <ExportSection />}

        {/* ── Storico (collapsible) ───────────────────── */}
        {hasData && <SyncLog />}
      </div>
    </div>
  );
}

/* ─── Import Button (compatto, in-header) ─────────────────────── */
function ImportButton({ onDone }) {
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const fileRef = useRef(null);

  const handleUpload = async () => {
    const file = fileRef.current?.files?.[0];
    if (!file) { fileRef.current?.click(); return; }
    setUploading(true); setError(""); setResult(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const resp = await apiFetch(`${EP}/upload`, { method: "POST", body: fd });
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        throw new Error(err.detail || "Errore importazione");
      }
      const data = await resp.json();
      setResult(data);
      fileRef.current.value = "";
      onDone();
    } catch (e) { setError(e.message); }
    setUploading(false);
  };

  return (
    <div className="flex items-center gap-2">
      <input ref={fileRef} type="file" accept=".xlsx,.xls" className="hidden"
        onChange={() => handleUpload()} />
      <button onClick={() => fileRef.current?.click()} disabled={uploading}
        className={`px-4 py-2 rounded-xl text-xs font-semibold shadow transition ${
          uploading ? "bg-neutral-300 text-neutral-500 cursor-not-allowed"
            : "bg-amber-600 text-white hover:bg-amber-700"
        }`}>
        {uploading ? "Importazione..." : "📥 Importa Excel"}
      </button>
      {result && (
        <span className="text-[10px] text-emerald-700 font-medium">
          ✓ {result.total_bottiglie} bottiglie · {result.matched} abbinati
        </span>
      )}
      {error && <span className="text-[10px] text-red-600 font-medium">{error}</span>}
    </div>
  );
}

/* ─── Mapping Table ───────────────────────────────────────────── */
function MappingTable({ onUpdate, filterDefault = "all" }) {
  const [mappings, setMappings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState(filterDefault);
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState(null);
  const [trgbSearch, setTrgbSearch] = useState("");
  const [trgbResults, setTrgbResults] = useState([]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (search) params.set("search", search);
      const url = `${EP}/mappings${params.toString() ? "?" + params : ""}`;
      const r = await apiFetch(url);
      if (r.ok) setMappings(await r.json());
    } catch (_) {}
    setLoading(false);
  }, [search]);

  useEffect(() => { load(); }, [load]);

  const filtered = mappings.filter(m => {
    if (filter === "matched") return m.vino_id != null && m.match_status !== "ignored";
    if (filter === "unmatched") return m.match_status === "unmatched";
    if (filter === "ignored") return m.match_status === "ignored";
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
    setEditing(null); setTrgbSearch(""); setTrgbResults([]);
    load(); onUpdate();
  };

  const unlinkWine = async (mapId) => {
    await apiFetch(`${EP}/mappings/${mapId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ vino_id: null }),
    });
    load(); onUpdate();
  };

  const ignoreWine = async (mapId) => {
    await apiFetch(`${EP}/ignore/${mapId}`, { method: "PUT" });
    load(); onUpdate();
  };

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <div className="flex gap-1">
          {[
            { key: "all", label: "Tutti" },
            { key: "matched", label: "Abbinati" },
            { key: "unmatched", label: "Da abbinare" },
            { key: "ignored", label: "Ignorati" },
          ].map(f => (
            <button key={f.key} onClick={() => setFilter(f.key)}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-medium transition ${
                filter === f.key
                  ? "bg-amber-100 text-amber-900 shadow-sm"
                  : "bg-neutral-100 text-neutral-500 hover:bg-neutral-200"
              }`}>
              {f.label}
            </button>
          ))}
        </div>
        <input type="text" placeholder="Cerca..." value={search} onChange={e => setSearch(e.target.value)}
          className="px-2.5 py-1 border border-neutral-300 rounded-lg text-xs flex-1 min-w-[150px]" />
        <span className="text-[10px] text-neutral-400">{filtered.length} voci</span>
      </div>

      {loading ? (
        <p className="text-neutral-400 text-xs py-6 text-center">Caricamento...</p>
      ) : filtered.length === 0 ? (
        <p className="text-neutral-400 text-xs py-6 text-center">Nessun risultato.</p>
      ) : (
        <div className="overflow-x-auto max-h-[500px] overflow-y-auto">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-white">
              <tr className="border-b text-left text-neutral-500">
                <th className="pb-2 w-10">ID</th>
                <th className="pb-2">iPratico</th>
                <th className="pb-2 w-14">Stato</th>
                <th className="pb-2">TRGB</th>
                <th className="pb-2 w-10 text-center">QTA</th>
                <th className="pb-2 w-14 text-right">Prezzo</th>
                <th className="pb-2 w-24"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(m => (
                <React.Fragment key={m.id}>
                  <tr className={`border-b border-neutral-100 hover:bg-neutral-50 ${
                    m.match_status === "ignored" ? "opacity-40" :
                    m.match_status === "unmatched" ? "bg-amber-50/40" : ""
                  }`}>
                    <td className="py-1.5 font-mono text-neutral-400">{m.ipratico_wine_id || "?"}</td>
                    <td className="py-1.5 truncate max-w-[200px]" title={m.ipratico_name}>
                      <span className="text-neutral-700">{m.ipratico_name}</span>
                    </td>
                    <td className="py-1.5">
                      <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                        m.match_status === "auto" ? "bg-sky-100 text-sky-800" :
                        m.match_status === "manual" ? "bg-violet-100 text-violet-800" :
                        m.match_status === "ignored" ? "bg-neutral-200 text-neutral-500" :
                        "bg-amber-100 text-amber-800"
                      }`}>
                        {m.match_status === "auto" ? "Auto" :
                         m.match_status === "manual" ? "Man." :
                         m.match_status === "ignored" ? "Ign." : "—"}
                      </span>
                    </td>
                    <td className="py-1.5">
                      {m.vino_id ? (
                        <span>
                          <strong>{m.trgb_produttore}</strong>
                          {m.trgb_descrizione && <span className="text-neutral-400 ml-1">{m.trgb_descrizione}</span>}
                          {m.trgb_annata && <span className="text-neutral-400 ml-1">({m.trgb_annata})</span>}
                        </span>
                      ) : m.match_status !== "ignored" ? (
                        <span className="text-neutral-300 italic">—</span>
                      ) : null}
                    </td>
                    <td className="py-1.5 text-center font-mono">{m.vino_id ? (m.trgb_qta ?? 0) : ""}</td>
                    <td className="py-1.5 text-right font-mono text-[11px]">
                      {m.vino_id && m.trgb_prezzo ? `€${Number(m.trgb_prezzo).toLocaleString("it-IT")}` : ""}
                    </td>
                    <td className="py-1.5 text-right">
                      <div className="flex gap-1 justify-end">
                        {m.match_status === "unmatched" && (
                          <>
                            <Btn onClick={() => { setEditing(m.id); setTrgbSearch(""); setTrgbResults([]); }}
                              cls="bg-amber-100 text-amber-800 hover:bg-amber-200">Abbina</Btn>
                            <Btn onClick={() => ignoreWine(m.id)}
                              cls="bg-neutral-100 text-neutral-500 hover:bg-neutral-200">Ignora</Btn>
                          </>
                        )}
                        {m.match_status === "ignored" && (
                          <Btn onClick={() => ignoreWine(m.id)}
                            cls="bg-neutral-100 text-neutral-600 hover:bg-neutral-200">Ripristina</Btn>
                        )}
                        {(m.match_status === "auto" || m.match_status === "manual") && (
                          <Btn onClick={() => unlinkWine(m.id)}
                            cls="text-red-500 hover:bg-red-50">Scollega</Btn>
                        )}
                      </div>
                    </td>
                  </tr>
                  {editing === m.id && (
                    <tr className="bg-amber-50 border-b border-amber-200">
                      <td colSpan={7} className="p-3">
                        <div className="flex items-center gap-2 mb-2">
                          <span className="text-xs font-semibold text-amber-800">Cerca vino TRGB:</span>
                          <input type="text" placeholder="Produttore, ID..."
                            value={trgbSearch} onChange={e => searchTRGB(e.target.value)}
                            className="px-2 py-1 border rounded text-xs flex-1 max-w-xs" autoFocus />
                          <Btn onClick={() => { setEditing(null); setTrgbSearch(""); setTrgbResults([]); }}
                            cls="bg-neutral-200 text-neutral-600">Annulla</Btn>
                        </div>
                        {trgbResults.length > 0 && (
                          <div className="max-h-36 overflow-y-auto border rounded bg-white">
                            {trgbResults.map(w => (
                              <button key={w.id} onClick={() => assignWine(m.id, w.id)}
                                className="w-full text-left px-3 py-1.5 text-xs hover:bg-amber-50 border-b border-neutral-100 flex justify-between">
                                <span>
                                  <strong>{w.PRODUTTORE}</strong>
                                  {w.DESCRIZIONE && <span className="ml-1 text-neutral-500">{w.DESCRIZIONE}</span>}
                                  <span className="ml-1 text-neutral-400">({w.ANNATA || "s.a."})</span>
                                </span>
                                <span className="text-neutral-400">#{w.id}</span>
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

/* ─── Missing List ────────────────────────────────────────────── */
function MissingList() {
  const [wines, setWines] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = search ? `?search=${encodeURIComponent(search)}` : "";
      const r = await apiFetch(`${EP}/missing${params}`);
      if (r.ok) setWines(await r.json());
    } catch (_) {}
    setLoading(false);
  }, [search]);

  useEffect(() => { load(); }, [load]);

  return (
    <div>
      <p className="text-xs text-neutral-500 mb-3">
        Vini TRGB non trovati nell'export iPratico — verranno <strong>aggiunti automaticamente</strong> nell'export.
      </p>

      <div className="flex items-center gap-2 mb-3">
        <input type="text" placeholder="Cerca..." value={search} onChange={e => setSearch(e.target.value)}
          className="px-2.5 py-1 border border-neutral-300 rounded-lg text-xs flex-1 min-w-[150px]" />
        <span className="text-[10px] text-neutral-400">{wines.length} mancanti</span>
      </div>

      {loading ? (
        <p className="text-neutral-400 text-xs py-6 text-center">Caricamento...</p>
      ) : wines.length === 0 ? (
        <div className="py-6 text-center">
          <span className="text-emerald-600 text-xs font-medium">✓ Tutti i vini TRGB sono su iPratico</span>
        </div>
      ) : (
        <div className="overflow-x-auto max-h-[400px] overflow-y-auto">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-white">
              <tr className="border-b text-left text-neutral-500">
                <th className="pb-2 w-10">ID</th>
                <th className="pb-2">Descrizione</th>
                <th className="pb-2">Produttore</th>
                <th className="pb-2 w-12">Annata</th>
                <th className="pb-2 w-10">Fmt</th>
                <th className="pb-2 w-10 text-center">QTA</th>
                <th className="pb-2 w-14 text-right">Prezzo</th>
              </tr>
            </thead>
            <tbody>
              {wines.map(w => (
                <tr key={w.id} className="border-b border-neutral-100 hover:bg-rose-50/30">
                  <td className="py-1.5 font-mono font-bold text-rose-600">{String(w.id).padStart(4, "0")}</td>
                  <td className="py-1.5 truncate max-w-[200px]">{w.DESCRIZIONE || "—"}</td>
                  <td className="py-1.5 font-medium">{w.PRODUTTORE || "—"}</td>
                  <td className="py-1.5 text-neutral-500">{w.ANNATA || "s.a."}</td>
                  <td className="py-1.5 text-neutral-400">{w.FORMATO || "—"}</td>
                  <td className="py-1.5 text-center font-mono">{w.QTA_TOTALE ?? 0}</td>
                  <td className="py-1.5 text-right font-mono">
                    {w.PREZZO_CARTA ? `€${Number(w.PREZZO_CARTA).toLocaleString("it-IT")}` : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/* ─── Export Section ───────────────────────────────────────────── */
function ExportSection() {
  const [exporting, setExporting] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const fileRef = useRef(null);

  const handleExport = async () => {
    const file = fileRef.current?.files?.[0];
    if (!file) { fileRef.current?.click(); return; }
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
        name: resp.headers.get("X-Updated-Name") || "0",
        matched: resp.headers.get("X-Total-Matched") || "0",
        added: resp.headers.get("X-Added-Missing") || "0",
      });
      fileRef.current.value = "";
    } catch (e) { setError(e.message); }
    setExporting(false);
  };

  return (
    <div className="bg-white shadow rounded-2xl p-5 border border-neutral-200">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-bold text-emerald-800">Esporta per iPratico</h2>
          <p className="text-[11px] text-neutral-400 mt-0.5">
            Carica lo stesso file export — aggiorna giacenze, testi (priorità TRGB), prezzi e aggiunge i vini mancanti.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <input ref={fileRef} type="file" accept=".xlsx,.xls" className="hidden"
            onChange={() => handleExport()} />
          <button onClick={() => fileRef.current?.click()} disabled={exporting}
            className={`px-4 py-2 rounded-xl text-xs font-semibold shadow transition ${
              exporting ? "bg-neutral-300 text-neutral-500 cursor-not-allowed"
                : "bg-emerald-600 text-white hover:bg-emerald-700"
            }`}>
            {exporting ? "Elaborazione..." : "📤 Genera Export"}
          </button>
        </div>
      </div>

      {error && (
        <div className="mt-3 rounded-xl border border-red-300 bg-red-50 text-red-800 px-3 py-2 text-xs">{error}</div>
      )}

      {result && (
        <div className="mt-3 flex flex-wrap gap-3 text-xs">
          <StatChip label="Abbinati" val={result.matched} color="text-emerald-700" />
          <StatChip label="Giacenze agg." val={result.qty} color="text-sky-700" />
          <StatChip label="Nomi agg." val={result.name} color="text-violet-700" />
          <StatChip label="Prezzi agg." val={result.price} color="text-amber-700" />
          <StatChip label="Vini aggiunti" val={result.added} color="text-rose-600" />
          <span className="text-emerald-600 font-medium self-center">✓ Scaricato</span>
        </div>
      )}

      <DefaultsConfig />
    </div>
  );
}

/* ─── Defaults Config (collapsible, inside export) ────────────── */
function DefaultsConfig() {
  const [open, setOpen] = useState(false);
  const [defaults, setDefaults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(null);

  const load = async () => {
    if (defaults.length) return;
    setLoading(true);
    try {
      const r = await apiFetch(`${EP}/export-defaults`);
      if (r.ok) setDefaults(await r.json());
    } catch (_) {}
    setLoading(false);
  };

  const save = async (d) => {
    setSaving(d.id);
    try {
      await apiFetch(`${EP}/export-defaults/${d.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ field_value: d.field_value }),
      });
    } catch (_) {}
    setSaving(null);
  };

  const update = (id, val) => {
    setDefaults(prev => prev.map(d => d.id === id ? { ...d, field_value: val } : d));
  };

  const groups = defaults.reduce((acc, d) => {
    if (!acc[d.field_group]) acc[d.field_group] = [];
    acc[d.field_group].push(d);
    return acc;
  }, {});

  const groupLabels = { general: "Generali", reparti: "Reparti servizio", listini: "Listini prezzo" };

  return (
    <div className="mt-3 border-t border-neutral-100 pt-2">
      <button onClick={() => { setOpen(!open); if (!open) load(); }}
        className="text-[11px] text-neutral-400 hover:text-neutral-600 transition flex items-center gap-1">
        <span>{open ? "▼" : "▶"}</span>
        <span>Campi default vini nuovi</span>
      </button>
      {open && (
        <div className="mt-2">
          {loading ? (
            <p className="text-neutral-400 text-xs py-3 text-center">Caricamento...</p>
          ) : (
            <div className="space-y-3">
              {Object.entries(groups).map(([group, items]) => (
                <div key={group}>
                  <div className="text-[10px] text-neutral-400 uppercase tracking-wide mb-1">
                    {groupLabels[group] || group}
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {items.map(d => (
                      <div key={d.id} className="flex items-center gap-1.5">
                        <label className="text-[10px] text-neutral-500 w-24 truncate" title={d.field_name}>
                          {d.label || d.field_name}
                        </label>
                        <input type="text" value={d.field_value}
                          onChange={e => update(d.id, e.target.value)}
                          onBlur={() => save(d)}
                          className="px-1.5 py-0.5 border border-neutral-200 rounded text-[11px] flex-1 min-w-0" />
                        {saving === d.id && <span className="text-[9px] text-amber-500">...</span>}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ─── Sync Log (collapsible) ──────────────────────────────────── */
function SyncLog() {
  const [open, setOpen] = useState(false);
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    if (logs.length) return;
    setLoading(true);
    try {
      const r = await apiFetch(`${EP}/sync-log`);
      if (r.ok) setLogs(await r.json());
    } catch (_) {}
    setLoading(false);
  };

  return (
    <div className="bg-white shadow rounded-2xl border border-neutral-200 overflow-hidden">
      <button onClick={() => { setOpen(!open); if (!open) load(); }}
        className="w-full px-5 py-3 flex items-center justify-between text-xs font-medium text-neutral-500 hover:bg-neutral-50 transition">
        <span>Storico sincronizzazioni</span>
        <span>{open ? "▲" : "▼"}</span>
      </button>
      {open && (
        <div className="px-5 pb-4">
          {loading ? (
            <p className="text-neutral-400 text-xs py-4 text-center">Caricamento...</p>
          ) : logs.length === 0 ? (
            <p className="text-neutral-400 text-xs py-4 text-center">Nessuna sincronizzazione.</p>
          ) : (
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b text-left text-neutral-500">
                  <th className="pb-1.5">Data</th>
                  <th className="pb-1.5">Dir.</th>
                  <th className="pb-1.5">File</th>
                  <th className="pb-1.5 text-center">Match</th>
                  <th className="pb-1.5 text-center">QTA</th>
                  <th className="pb-1.5 text-center">Prezzi</th>
                </tr>
              </thead>
              <tbody>
                {logs.map(l => (
                  <tr key={l.id} className="border-b border-neutral-100">
                    <td className="py-1.5 text-neutral-400">{l.created_at}</td>
                    <td className="py-1.5">
                      <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                        l.direction === "import" ? "bg-sky-100 text-sky-800" : "bg-emerald-100 text-emerald-800"
                      }`}>
                        {l.direction === "import" ? "Imp" : "Exp"}
                      </span>
                    </td>
                    <td className="py-1.5 truncate max-w-[150px]">{l.filename}</td>
                    <td className="py-1.5 text-center">{l.n_matched}</td>
                    <td className="py-1.5 text-center">{l.n_updated_qty || 0}</td>
                    <td className="py-1.5 text-center">{l.n_updated_price || 0}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}

/* ─── Shared components ───────────────────────────────────────── */
function StatChip({ label, val, color = "text-neutral-800", onClick }) {
  const Tag = onClick ? "button" : "div";
  return (
    <Tag onClick={onClick}
      className={`rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-1.5 flex items-center gap-1.5 ${
        onClick ? "cursor-pointer hover:bg-neutral-100 transition" : ""
      }`}>
      <span className={`text-sm font-bold ${color}`}>{val}</span>
      <span className="text-[9px] text-neutral-500 uppercase">{label}</span>
    </Tag>
  );
}

function Btn({ children, onClick, cls = "" }) {
  return (
    <button onClick={onClick}
      className={`text-[10px] px-2 py-0.5 rounded font-semibold transition ${cls}`}>
      {children}
    </button>
  );
}
