// @version: v2.0-mattoni — refactor leggero con M.I primitives (Btn, StatusBadge, EmptyState)
// Impostazioni Flussi Cassa: Import CSV + Categorie (sidebar stile ClientiImpostazioni).
// Nota: NON usa PageLayout (sidebar full-height custom). Fix wrapper a bg-brand-cream (TRGB-02).
import React, { useEffect, useState, useRef } from "react";
import { API_BASE, apiFetch } from "../../config/api";
import FlussiCassaNav from "./FlussiCassaNav";
import { Btn, StatusBadge, EmptyState } from "../../components/ui";

const FC = `${API_BASE}/banca`;

const fmt = (n) =>
  n != null
    ? Number(n).toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : "—";

const COLORI_PRESET = [
  "#059669", "#dc2626", "#2563eb", "#d97706", "#7c3aed",
  "#db2777", "#0891b2", "#65a30d", "#ea580c", "#6b7280",
];

// ---------------------------------------------------------------
// SIDEBAR MENU
// ---------------------------------------------------------------
const MENU = [
  { key: "import",            label: "Import CSV",              icon: "📥", desc: "Carica movimenti bancari da CSV" },
  { key: "categorie",         label: "Categorie Banca",         icon: "🏷️", desc: "Categorie per classificare i movimenti" },
  { key: "cat-registrazione", label: "Categorie Registrazione", icon: "📋", desc: "Categorie registrazione corrispettivi" },
  { key: "duplicati",         label: "Pulizia Duplicati",       icon: "🧹", desc: "Trova e rimuovi movimenti duplicati" },
];

export default function BancaImpostazioni() {
  const [activeSection, setActiveSection] = useState("import");

  const sectionRenderers = {
    "import":            () => <TabImport />,
    "categorie":         () => <TabCategorie />,
    "cat-registrazione": () => <TabCategorieRegistrazione />,
    "duplicati":         () => <TabDuplicati />,
  };

  return (
    <>
      <FlussiCassaNav current="impostazioni" />
      <div className="min-h-screen bg-brand-cream font-sans">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
          <div className="flex gap-6">

            {/* SIDEBAR */}
            <div className="w-56 flex-shrink-0">
              <h2 className="text-xs font-bold text-neutral-400 uppercase tracking-wider mb-3 px-3">
                Impostazioni Flussi Cassa
              </h2>
              <nav className="space-y-0.5">
                {MENU.map(item => {
                  const active = activeSection === item.key;
                  return (
                    <button key={item.key} onClick={() => setActiveSection(item.key)}
                      className={`w-full text-left px-3 py-2.5 rounded-lg transition flex items-start gap-2.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue/40 focus-visible:ring-offset-1 ${
                        active
                          ? "bg-emerald-50 text-emerald-900 shadow-sm border border-emerald-200"
                          : "text-neutral-600 hover:bg-neutral-100 hover:text-neutral-800"
                      }`}>
                      <span className="text-sm mt-0.5">{item.icon}</span>
                      <div className="flex-1 min-w-0">
                        <div className={`text-sm font-medium ${active ? "text-emerald-900" : ""}`}>{item.label}</div>
                        {item.desc && <div className="text-[11px] text-neutral-400 mt-0.5 leading-tight">{item.desc}</div>}
                      </div>
                    </button>
                  );
                })}
              </nav>
            </div>

            {/* CONTENT */}
            <div className="flex-1 min-w-0">
              <main className="bg-white border border-neutral-200 rounded-2xl p-6 shadow-sm min-h-[500px]">
                {sectionRenderers[activeSection]?.()}
              </main>
            </div>

          </div>
        </div>
      </div>
    </>
  );
}


// ═══════════════════════════════════════════════════════
// TAB IMPORT CSV
// ═══════════════════════════════════════════════════════
function TabImport() {
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [importLog, setImportLog] = useState([]);
  const [logLoading, setLogLoading] = useState(true);
  const fileRef = useRef(null);

  useEffect(() => { loadLog(); }, []);

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
    if (!file) { setError("Seleziona un file CSV da importare."); return; }
    if (!file.name.endsWith(".csv")) { setError("Il file deve essere in formato .csv"); return; }

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
    <div>
      {/* Upload area */}
      <div className="rounded-2xl border-2 border-dashed border-neutral-300 bg-neutral-50 p-8 text-center mb-6">
        <div className="text-4xl mb-3">📥</div>
        <p className="text-sm text-neutral-600 mb-4">
          Formato atteso: <strong>ElencoEntrateUsciteAndamento_*.csv</strong>
        </p>
        <div className="flex items-center justify-center gap-3">
          <input ref={fileRef} type="file" accept=".csv" className="text-sm" />
          <Btn onClick={handleUpload} variant="success" size="md" loading={uploading} disabled={uploading}>
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
        <div className="mb-6 rounded-xl border border-emerald-300 bg-emerald-50 text-emerald-800 px-4 py-4 text-sm">
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
          icon="📥"
          title="Nessuna importazione effettuata"
          description="Carica un CSV della banca per iniziare."
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
  );
}


// ═══════════════════════════════════════════════════════
// TAB CATEGORIE
// ═══════════════════════════════════════════════════════
function TabCategorie() {
  const isViewer = localStorage.getItem("role") === "viewer";
  const [categorie, setCategorie] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState({
    categoria_custom: "",
    colore: "#6b7280",
    icona: "📁",
    tipo: "uscita",
  });
  const [saving, setSaving] = useState(false);

  // Drill-down
  const [expandedKey, setExpandedKey] = useState(null);
  const [drillMovimenti, setDrillMovimenti] = useState([]);
  const [drillLoading, setDrillLoading] = useState(false);

  // Inline re-categorize
  const [reCategorizingId, setReCategorizingId] = useState(null);
  const [reCatValue, setReCatValue] = useState("|");
  const [reSaving, setReSaving] = useState(false);

  useEffect(() => { loadCategorie(); }, []);

  const loadCategorie = async () => {
    setLoading(true);
    try {
      const resp = await apiFetch(`${FC}/categorie`);
      if (!resp.ok) throw new Error("Errore");
      setCategorie(await resp.json());
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const startEdit = (c) => {
    const key = `${c.categoria_banca}|${c.sottocategoria_banca || ""}`;
    setEditingId(key);
    setEditForm({
      categoria_custom: c.categoria_custom || "",
      colore: c.colore || "#6b7280",
      icona: c.icona || "📁",
      tipo: c.tipo || (c.totale >= 0 ? "entrata" : "uscita"),
    });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditForm({ categoria_custom: "", colore: "#6b7280", icona: "📁", tipo: "uscita" });
  };

  const saveMap = async (c) => {
    setSaving(true);
    setError("");
    try {
      const resp = await apiFetch(`${FC}/categorie/map`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          categoria_banca: c.categoria_banca,
          sottocategoria_banca: c.sottocategoria_banca || "",
          ...editForm,
        }),
      });
      if (!resp.ok) throw new Error("Errore salvataggio");
      cancelEdit();
      await loadCategorie();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const deleteMap = async (mapId) => {
    try {
      await apiFetch(`${FC}/categorie/map/${mapId}`, { method: "DELETE" });
      await loadCategorie();
    } catch (_) {}
  };

  const toggleDrill = async (c) => {
    const key = `${c.categoria_banca}|${c.sottocategoria_banca || ""}`;
    if (expandedKey === key) {
      setExpandedKey(null);
      setDrillMovimenti([]);
      return;
    }
    setExpandedKey(key);
    setDrillLoading(true);
    setReCategorizingId(null);
    try {
      const resp = await apiFetch(
        `${FC}/movimenti?categoria=${encodeURIComponent(c.categoria_banca)}&limit=200`
      );
      if (!resp.ok) throw new Error("Errore");
      const data = await resp.json();
      const filtered = c.sottocategoria_banca
        ? data.movimenti.filter((m) => m.sottocategoria_banca === c.sottocategoria_banca)
        : data.movimenti;
      setDrillMovimenti(filtered);
    } catch (err) {
      setError(err.message);
    } finally {
      setDrillLoading(false);
    }
  };

  const saveReCategory = async (movId) => {
    const [newCat, newSub] = reCatValue.split("|");
    if (!newCat) return;
    setReSaving(true);
    try {
      const resp = await apiFetch(`${FC}/movimenti/${movId}/categoria`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          categoria_banca: newCat,
          sottocategoria_banca: newSub || "",
        }),
      });
      if (!resp.ok) throw new Error("Errore");
      setDrillMovimenti((prev) => prev.filter((m) => m.id !== movId));
      setReCategorizingId(null);
      await loadCategorie();
    } catch (err) {
      setError(err.message);
    } finally {
      setReSaving(false);
    }
  };

  const catPairs = categorie.map((c) => ({
    val: `${c.categoria_banca}|${c.sottocategoria_banca || ""}`,
    label: c.sottocategoria_banca
      ? `${c.categoria_banca} - ${c.sottocategoria_banca}`
      : c.categoria_banca,
  }));

  return (
    <div>
      <p className="text-neutral-600 text-sm mb-4">
        Mappa le categorie importate dal CSV della banca alle tue categorie personalizzate. Clicca su una categoria per vedere i movimenti e riassegnarli.
      </p>

      {error && (
        <div className="mb-4 rounded-xl border border-red-300 bg-red-50 text-red-800 px-4 py-3 text-sm">
          {error}
        </div>
      )}

      {loading ? (
        <div className="text-center py-12 text-neutral-500">Caricamento...</div>
      ) : categorie.length === 0 ? (
        <EmptyState
          icon="🏷️"
          title="Nessuna categoria trovata"
          description="Importa prima i movimenti bancari dal tab Import CSV."
        />
      ) : (
        <div className="space-y-3">
          {categorie.map((c) => {
            const key = `${c.categoria_banca}|${c.sottocategoria_banca || ""}`;
            const isEditing = editingId === key;
            const isExpanded = expandedKey === key;

            return (
              <div
                key={key}
                className={`rounded-xl border p-4 transition ${
                  isEditing
                    ? "bg-blue-50 border-blue-300"
                    : isExpanded
                    ? "bg-neutral-50 border-emerald-300"
                    : c.categoria_custom
                    ? "bg-emerald-50/50 border-emerald-200"
                    : "bg-white border-neutral-200"
                }`}
              >
                <div className="flex items-start justify-between gap-4">
                  <div
                    className="flex-1 min-w-0 cursor-pointer"
                    onClick={() => !isEditing && toggleDrill(c)}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-sm font-semibold text-neutral-800">
                        {c.categoria_banca}
                      </span>
                      {c.sottocategoria_banca && (
                        <span className="text-xs text-neutral-500">
                          — {c.sottocategoria_banca}
                        </span>
                      )}
                      <span className="text-[10px] text-neutral-400">
                        {isExpanded ? "▼" : "▶"}
                      </span>
                    </div>
                    <div className="text-xs text-neutral-500">
                      {c.num_movimenti} movimenti · Totale: <span className={`font-mono font-semibold ${c.totale >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                        {c.totale >= 0 ? "+" : ""}{fmt(c.totale)}
                      </span>
                    </div>
                    {c.categoria_custom && !isEditing && (
                      <div className="mt-2 flex items-center gap-2">
                        <span
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium"
                          style={{ backgroundColor: (c.colore || "#6b7280") + "20", color: c.colore }}
                        >
                          {c.icona} {c.categoria_custom}
                        </span>
                        <span className="text-[10px] text-neutral-400 uppercase">{c.tipo}</span>
                      </div>
                    )}
                  </div>
                  <div className="flex gap-2 flex-shrink-0">
                    {!isEditing ? (
                      <>
                        {!isViewer && (
                          <Btn
                            variant="secondary"
                            size="sm"
                            onClick={(e) => { e.stopPropagation(); startEdit(c); }}
                          >
                            {c.categoria_custom ? "Modifica" : "Mappa"}
                          </Btn>
                        )}
                        {!isViewer && c.map_id && (
                          <Btn
                            variant="chip"
                            tone="red"
                            size="sm"
                            onClick={(e) => { e.stopPropagation(); deleteMap(c.map_id); }}
                          >
                            Rimuovi
                          </Btn>
                        )}
                      </>
                    ) : (
                      <>
                        <Btn
                          variant="success"
                          size="sm"
                          onClick={() => saveMap(c)}
                          disabled={saving || !editForm.categoria_custom.trim()}
                          loading={saving}
                        >
                          Salva
                        </Btn>
                        <Btn variant="secondary" size="sm" onClick={cancelEdit}>
                          Annulla
                        </Btn>
                      </>
                    )}
                  </div>
                </div>

                {/* Mapping form */}
                {isEditing && (
                  <div className="mt-3 pt-3 border-t border-blue-200 grid grid-cols-1 sm:grid-cols-4 gap-3">
                    <div className="sm:col-span-2">
                      <label className="text-xs text-neutral-500 mb-1 block">Nome categoria custom</label>
                      <input
                        value={editForm.categoria_custom}
                        onChange={(e) => setEditForm({ ...editForm, categoria_custom: e.target.value })}
                        placeholder="Es. Spese fornitore"
                        className="w-full border rounded-lg px-3 py-1.5 text-sm"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-neutral-500 mb-1 block">Tipo</label>
                      <select
                        value={editForm.tipo}
                        onChange={(e) => setEditForm({ ...editForm, tipo: e.target.value })}
                        className="w-full border rounded-lg px-2 py-1.5 text-sm"
                      >
                        <option value="uscita">Uscita</option>
                        <option value="entrata">Entrata</option>
                        <option value="altro">Altro</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-xs text-neutral-500 mb-1 block">Colore</label>
                      <div className="flex gap-1 flex-wrap">
                        {COLORI_PRESET.map((col) => (
                          <button
                            key={col}
                            onClick={() => setEditForm({ ...editForm, colore: col })}
                            className={`w-6 h-6 rounded-full border-2 transition ${
                              editForm.colore === col ? "border-neutral-800 scale-110" : "border-transparent"
                            }`}
                            style={{ backgroundColor: col }}
                          />
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {/* Drill-down movimenti */}
                {isExpanded && !isEditing && (
                  <div className="mt-3 pt-3 border-t border-emerald-200">
                    {drillLoading ? (
                      <div className="text-center py-4 text-neutral-400 text-sm">Caricamento movimenti...</div>
                    ) : drillMovimenti.length === 0 ? (
                      <EmptyState icon="💭" title="Nessun movimento in questa categoria" compact />
                    ) : (
                      <div className="max-h-80 overflow-y-auto">
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="border-b text-neutral-500">
                              <th className="pb-1.5 text-left w-20">Data</th>
                              <th className="pb-1.5 text-left">Descrizione</th>
                              <th className="pb-1.5 text-right w-24">Importo</th>
                              {!isViewer && <th className="pb-1.5 text-center w-28">Azione</th>}
                            </tr>
                          </thead>
                          <tbody>
                            {drillMovimenti.map((m) => (
                              <tr key={m.id} className="border-b border-neutral-100 hover:bg-white transition">
                                <td className="py-1.5 text-neutral-500">{m.data_contabile}</td>
                                <td className="py-1.5 truncate max-w-xs" title={m.descrizione}>{m.descrizione}</td>
                                <td className={`py-1.5 text-right font-mono font-semibold ${m.importo >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                                  {m.importo >= 0 ? "+" : ""}{fmt(m.importo)}
                                </td>
                                {!isViewer && (
                                <td className="py-1.5 text-center">
                                  {reCategorizingId === m.id ? (
                                    <div className="flex items-center gap-1">
                                      <select
                                        value={reCatValue}
                                        onChange={(e) => setReCatValue(e.target.value)}
                                        className="border rounded px-1 py-0.5 text-[10px] max-w-[130px]"
                                      >
                                        <option value="|">— Seleziona —</option>
                                        {catPairs
                                          .filter((p) => p.val !== key)
                                          .map((p, i) => (
                                            <option key={i} value={p.val}>{p.label}</option>
                                          ))}
                                      </select>
                                      <button
                                        onClick={() => saveReCategory(m.id)}
                                        disabled={reSaving || reCatValue === "|"}
                                        className="px-1.5 py-0.5 rounded text-[10px] bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-40"
                                      >
                                        {reSaving ? "..." : "OK"}
                                      </button>
                                      <button
                                        onClick={() => setReCategorizingId(null)}
                                        className="px-1.5 py-0.5 rounded text-[10px] border hover:bg-neutral-100"
                                      >
                                        ×
                                      </button>
                                    </div>
                                  ) : (
                                    <button
                                      onClick={() => { setReCategorizingId(m.id); setReCatValue("|"); }}
                                      className="px-2 py-0.5 rounded text-[10px] border border-neutral-300 hover:bg-neutral-100 transition"
                                    >
                                      Sposta
                                    </button>
                                  )}
                                </td>
                                )}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}


// ═══════════════════════════════════════════════════════
// TAB CATEGORIE REGISTRAZIONE (per riconciliazione)
// ═══════════════════════════════════════════════════════
const COLORI_REG = [
  "#059669", "#ef4444", "#2563eb", "#f59e0b", "#8b5cf6",
  "#ec4899", "#0ea5e9", "#14b8a6", "#65a30d", "#6b7280", "#9ca3af",
];

function TabCategorieRegistrazione() {
  const [cats, setCats] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editId, setEditId] = useState(null);      // null = nessun edit, 0 = nuova
  const [form, setForm] = useState({ codice: "", label: "", tipo: "uscita", pattern: "", colore: "#6b7280", ordine: 50 });
  const [saving, setSaving] = useState(false);

  useEffect(() => { load(); }, []);

  const load = async () => {
    setLoading(true);
    try {
      const resp = await apiFetch(`${FC}/categorie-registrazione`);
      if (!resp.ok) throw new Error("Errore caricamento");
      setCats(await resp.json());
    } catch (err) { setError(err.message); }
    setLoading(false);
  };

  const startNew = () => {
    setEditId(0);
    setForm({ codice: "", label: "", tipo: "uscita", pattern: "", colore: "#6b7280", ordine: 50 });
  };

  const startEdit = (c) => {
    setEditId(c.id);
    setForm({ codice: c.codice, label: c.label, tipo: c.tipo, pattern: c.pattern || "", colore: c.colore || "#6b7280", ordine: c.ordine });
  };

  const cancel = () => { setEditId(null); };

  const save = async () => {
    if (!form.label.trim()) return;
    setSaving(true);
    setError("");
    try {
      const url = editId === 0
        ? `${FC}/categorie-registrazione`
        : `${FC}/categorie-registrazione/${editId}`;
      const method = editId === 0 ? "POST" : "PUT";
      const body = editId === 0
        ? { ...form, codice: form.codice || form.label.toUpperCase().replace(/[^A-Z0-9]/g, "_").replace(/_+/g, "_") }
        : form;
      const resp = await apiFetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!resp.ok) {
        const e = await resp.json().catch(() => ({}));
        throw new Error(e.detail || "Errore salvataggio");
      }
      setEditId(null);
      await load();
    } catch (err) { setError(err.message); }
    setSaving(false);
  };

  const toggle = async (id) => {
    try {
      await apiFetch(`${FC}/categorie-registrazione/${id}/toggle`, { method: "PATCH" });
      await load();
    } catch (_) {}
  };

  const uscite = cats.filter(c => c.tipo === "uscita");
  const entrate = cats.filter(c => c.tipo === "entrata");

  const renderRow = (c) => {
    const isEdit = editId === c.id;
    return (
      <div key={c.id} className={`flex items-center gap-3 px-4 py-3 rounded-xl border transition ${
        isEdit ? "bg-blue-50 border-blue-300" : !c.attiva ? "bg-neutral-50 border-neutral-200 opacity-60" : "bg-white border-neutral-200"
      }`}>
        {!isEdit ? (
          <>
            <span className="w-4 h-4 rounded-full flex-shrink-0" style={{ backgroundColor: c.colore || "#6b7280" }} />
            <div className="flex-1 min-w-0">
              <span className="text-sm font-medium text-neutral-800">{c.label}</span>
              <span className="ml-2 text-[10px] font-mono text-neutral-400">{c.codice}</span>
              {c.pattern && (
                <div className="text-[10px] text-neutral-400 truncate mt-0.5" title={c.pattern}>
                  Pattern: {c.pattern}
                </div>
              )}
            </div>
            <span className="text-xs text-neutral-400 w-8 text-center">{c.ordine}</span>
            <button
              onClick={() => toggle(c.id)}
              className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue/40 focus-visible:ring-offset-1 rounded-full"
              title={c.attiva ? "Disattiva" : "Attiva"}
            >
              <StatusBadge tone={c.attiva ? "success" : "neutral"} size="sm" dot>
                {c.attiva ? "Attiva" : "Off"}
              </StatusBadge>
            </button>
            <Btn variant="secondary" size="sm" onClick={() => startEdit(c)}>
              Modifica
            </Btn>
          </>
        ) : (
          <div className="flex-1 space-y-2">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <input value={form.label} onChange={e => setForm({ ...form, label: e.target.value })}
                placeholder="Nome categoria" className="border rounded-lg px-3 py-1.5 text-sm" />
              <select value={form.tipo} onChange={e => setForm({ ...form, tipo: e.target.value })}
                className="border rounded-lg px-2 py-1.5 text-sm">
                <option value="uscita">Uscita</option>
                <option value="entrata">Entrata</option>
              </select>
              <input value={form.pattern} onChange={e => setForm({ ...form, pattern: e.target.value })}
                placeholder="Pattern auto-detect (es. COMM.POS|COMMISSIONE)" className="border rounded-lg px-3 py-1.5 text-sm sm:col-span-2" />
            </div>
            <div className="flex items-center gap-3">
              <div className="flex gap-1">
                {COLORI_REG.map(col => (
                  <button key={col} onClick={() => setForm({ ...form, colore: col })}
                    className={`w-5 h-5 rounded-full border-2 transition ${form.colore === col ? "border-neutral-800 scale-110" : "border-transparent"}`}
                    style={{ backgroundColor: col }} />
                ))}
              </div>
              <input type="number" value={form.ordine} onChange={e => setForm({ ...form, ordine: parseInt(e.target.value) || 0 })}
                className="w-16 border rounded-lg px-2 py-1 text-sm text-center" title="Ordine" />
              <div className="flex gap-2 ml-auto">
                <Btn variant="success" size="sm" onClick={save} disabled={saving || !form.label.trim()} loading={saving}>
                  Salva
                </Btn>
                <Btn variant="secondary" size="sm" onClick={cancel}>
                  Annulla
                </Btn>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <p className="text-neutral-600 text-sm">
          Categorie usate nella Riconciliazione per registrare movimenti senza fattura. I pattern servono per l'auto-detect.
        </p>
        <Btn variant="success" size="md" onClick={startNew}>
          + Nuova
        </Btn>
      </div>

      {error && (
        <div className="mb-4 rounded-xl border border-red-300 bg-red-50 text-red-800 px-4 py-3 text-sm">{error}</div>
      )}

      {editId === 0 && (
        <div className="mb-4 p-4 rounded-xl bg-blue-50 border border-blue-300 space-y-2">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <input value={form.label} onChange={e => setForm({ ...form, label: e.target.value })}
              placeholder="Nome categoria" className="border rounded-lg px-3 py-1.5 text-sm" />
            <select value={form.tipo} onChange={e => setForm({ ...form, tipo: e.target.value })}
              className="border rounded-lg px-2 py-1.5 text-sm">
              <option value="uscita">Uscita</option>
              <option value="entrata">Entrata</option>
            </select>
            <input value={form.pattern} onChange={e => setForm({ ...form, pattern: e.target.value })}
              placeholder="Pattern auto-detect (es. COMM.POS|COMMISSIONE)" className="border rounded-lg px-3 py-1.5 text-sm sm:col-span-2" />
          </div>
          <div className="flex items-center gap-3">
            <div className="flex gap-1">
              {COLORI_REG.map(col => (
                <button key={col} onClick={() => setForm({ ...form, colore: col })}
                  className={`w-5 h-5 rounded-full border-2 transition ${form.colore === col ? "border-neutral-800 scale-110" : "border-transparent"}`}
                  style={{ backgroundColor: col }} />
              ))}
            </div>
            <input type="number" value={form.ordine} onChange={e => setForm({ ...form, ordine: parseInt(e.target.value) || 0 })}
              className="w-16 border rounded-lg px-2 py-1 text-sm text-center" title="Ordine" />
            <div className="flex gap-2 ml-auto">
              <Btn variant="success" size="sm" onClick={save} disabled={saving || !form.label.trim()} loading={saving}>
                Crea
              </Btn>
              <Btn variant="secondary" size="sm" onClick={cancel}>
                Annulla
              </Btn>
            </div>
          </div>
        </div>
      )}

      {loading ? (
        <div className="text-center py-12 text-neutral-500">Caricamento...</div>
      ) : (
        <div className="space-y-6">
          <div>
            <h3 className="text-sm font-semibold text-red-700 mb-2 flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-red-500" /> Categorie Uscita ({uscite.length})
            </h3>
            <div className="space-y-2">{uscite.map(renderRow)}</div>
          </div>
          <div>
            <h3 className="text-sm font-semibold text-emerald-700 mb-2 flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" /> Categorie Entrata ({entrate.length})
            </h3>
            <div className="space-y-2">{entrate.map(renderRow)}</div>
          </div>
        </div>
      )}
    </div>
  );
}


// ───────────────────────────────────────────────────────────────
// TAB DUPLICATI — Trova e rimuovi movimenti duplicati
// ───────────────────────────────────────────────────────────────
function TabDuplicati() {
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(null);
  const [toast, setToast] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const res = await apiFetch(`${FC}/duplicati/`);
      const data = await res.json();
      setGroups(data);
    } catch (e) {
      setToast({ type: "error", msg: "Errore caricamento duplicati" });
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const handleDelete = async (keepId, deleteIds) => {
    setDeleting(keepId);
    try {
      const res = await apiFetch(
        `${FC}/duplicati/${keepId}?delete_ids=${deleteIds.join(",")}`,
        { method: "DELETE" }
      );
      const data = await res.json();
      setToast({ type: "ok", msg: `Eliminati ${data.deleted} duplicati${data.migrated ? `, migrati ${data.migrated} collegamenti` : ""}` });
      load();
    } catch (e) {
      setToast({ type: "error", msg: "Errore eliminazione" });
    }
    setDeleting(null);
  };

  const fmtDate = (d) => {
    if (!d) return "—";
    const [y, m, dd] = d.split("-");
    return `${dd}/${m}/${y}`;
  };

  const classici = groups.filter(g => g.tipo === "classico" || !g.tipo);
  const preauth = groups.filter(g => g.tipo === "preautorizzazione");

  return (
    <div>
      {toast && (
        <div className={`mb-4 px-4 py-2.5 rounded-lg text-sm font-medium ${
          toast.type === "ok" ? "bg-green-50 text-green-800 border border-green-200" : "bg-red-50 text-red-800 border border-red-200"
        }`}>
          {toast.msg}
          <button onClick={() => setToast(null)} className="ml-3 text-xs opacity-60 hover:opacity-100">✕</button>
        </div>
      )}

      {loading ? (
        <div className="text-center py-12 text-neutral-500">Analisi movimenti...</div>
      ) : groups.length === 0 ? (
        <EmptyState
          icon="✅"
          title="Nessun duplicato trovato"
          description="Tutti i movimenti sono unici."
        />
      ) : (
        <div className="space-y-6">
          {/* Pre-autorizzazioni (più importanti) */}
          {preauth.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-amber-700 mb-3 flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-amber-500" />
                Pre-autorizzazioni bancomat ({preauth.length})
              </h3>
              <p className="text-xs text-neutral-500 mb-3">
                Stesso pagamento che appare due volte: prima come pre-autorizzazione, poi come contabilizzazione.
                Stessa data valuta e importo, ma data contabile diversa.
              </p>
              {preauth.map((g, gi) => (
                <DuplicateGroup key={`pre-${gi}`} group={g} onDelete={handleDelete} deleting={deleting} fmtDate={fmtDate} />
              ))}
            </div>
          )}

          {/* Classici */}
          {classici.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-red-700 mb-3 flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-red-500" />
                Duplicati classici ({classici.length})
              </h3>
              <p className="text-xs text-neutral-500 mb-3">
                Stessa data contabile, importo e descrizione simile.
              </p>
              {classici.map((g, gi) => (
                <DuplicateGroup key={`cls-${gi}`} group={g} onDelete={handleDelete} deleting={deleting} fmtDate={fmtDate} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}


// Card singolo gruppo duplicati
function DuplicateGroup({ group, onDelete, deleting, fmtDate }) {
  const [keepId, setKeepId] = useState(null);
  const movimenti = group.movimenti || [];

  // Auto-select: per preautorizzazioni, tieni il contabilizzato (is_preauth=0).
  // Altrimenti: tieni quello con link, oppure il più recente.
  useEffect(() => {
    if (movimenti.length > 0) {
      // Preautorizzazione: tieni il contabilizzato
      const contabilizzato = movimenti.find(m => !m.is_preauth);
      if (contabilizzato) {
        setKeepId(contabilizzato.id);
        return;
      }
      const withLink = movimenti.find(m => m.has_links);
      if (withLink) {
        setKeepId(withLink.id);
      } else {
        const sorted = [...movimenti].sort((a, b) => (b.data_contabile || "").localeCompare(a.data_contabile || ""));
        setKeepId(sorted[0].id);
      }
    }
  }, [movimenti]);

  const deleteIds = movimenti.filter(m => m.id !== keepId).map(m => m.id);
  const isPreauth = group.tipo === "preautorizzazione";

  return (
    <div className="bg-white border border-neutral-200 rounded-xl p-4 mb-3 shadow-sm">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-3">
          <StatusBadge tone={isPreauth ? "warning" : "danger"} size="sm">
            {isPreauth ? "Pre-autoriz." : "Classico"}
          </StatusBadge>
          <span className="text-sm font-mono font-semibold text-neutral-800">
            {Number(group.importo).toLocaleString("it-IT", { minimumFractionDigits: 2 })} €
          </span>
          {isPreauth && group.data_valuta && (
            <span className="text-xs text-neutral-500">Data valuta: {fmtDate(group.data_valuta)}</span>
          )}
        </div>
        <Btn
          variant="danger"
          size="sm"
          onClick={() => onDelete(keepId, deleteIds)}
          disabled={deleting || !keepId || deleteIds.length === 0}
          loading={deleting === keepId}
        >
          {`Elimina ${deleteIds.length} duplicat${deleteIds.length === 1 ? "o" : "i"}`}
        </Btn>
      </div>

      <div className="space-y-2">
        {movimenti.map(m => {
          const isKeep = m.id === keepId;
          return (
            <div
              key={m.id}
              onClick={() => setKeepId(m.id)}
              className={`flex items-start gap-3 p-2.5 rounded-lg cursor-pointer transition border ${
                isKeep
                  ? "bg-emerald-50 border-emerald-300"
                  : "bg-red-50 border-red-200 opacity-70 hover:opacity-100"
              }`}
            >
              <div className={`mt-0.5 w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${
                isKeep ? "border-emerald-500 bg-emerald-500 text-white" : "border-red-300 bg-white"
              }`}>
                {isKeep ? <span className="text-[10px]">✓</span> : <span className="text-[10px] text-red-400">✕</span>}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                  <span className="text-xs font-mono text-neutral-400">#{m.id}</span>
                  <span className="text-xs text-neutral-500">{fmtDate(m.data_contabile)}</span>
                  {m.data_valuta && m.data_valuta !== m.data_contabile && (
                    <span className="text-[10px] text-neutral-400">(val: {fmtDate(m.data_valuta)})</span>
                  )}
                  {m.is_preauth ? (
                    <StatusBadge tone="warning" size="sm">pre-autoriz.</StatusBadge>
                  ) : isPreauth ? (
                    <StatusBadge tone="success" size="sm">contabilizzato</StatusBadge>
                  ) : null}
                  {m.has_links ? (
                    <StatusBadge tone="brand" size="sm">collegato</StatusBadge>
                  ) : null}
                </div>
                <div className="text-xs text-neutral-700 truncate">{m.descrizione || "—"}</div>
                {m.categoria_banca && (
                  <div className="text-[10px] text-neutral-400 mt-0.5">{m.categoria_banca}{m.sottocategoria_banca ? ` — ${m.sottocategoria_banca}` : ""}</div>
                )}
              </div>
              <div className="text-right flex-shrink-0">
                <span className={`text-xs font-semibold ${isKeep ? "text-emerald-700" : "text-red-600 line-through"}`}>
                  {isKeep ? "MANTIENI" : "ELIMINA"}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
