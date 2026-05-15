// src/pages/vini/AnagraficheVini.jsx
// Modulo: vini (refactor V.6+V.7+V.8 Fase 6 — UI "🧪 beta")
//
// Sezione separata sotto Impostazioni Vini per gestire le anagrafiche del
// nuovo modello: produttori, fornitori, denominazioni, vitigni, vini madre.
// Lavora SULLE TABELLE _v2 parallele — la UI vecchia del modulo Vini non
// è toccata. Fase 6 del refactor anagrafiche.
//
// Vedi `docs/refactor_anagrafiche_vini.md` per il design completo.

import React, { useState, useEffect, useCallback } from "react";
import { API_BASE, apiFetch } from "../../config/api";

const TABS = [
  { key: "stats",         label: "Panoramica",   icon: "📊" },
  { key: "produttori",    label: "Produttori",   icon: "🏛️" },
  { key: "fornitori",     label: "Fornitori",    icon: "🚚" },
  { key: "denominazioni", label: "Denominazioni", icon: "📜" },
  { key: "vitigni",       label: "Vitigni",      icon: "🍇" },
  { key: "madre",         label: "Vini madre",   icon: "🍷" },
];

export default function AnagraficheVini() {
  const [tab, setTab] = useState("stats");

  return (
    <div className="space-y-5">
      <div className="border-b border-amber-200 pb-3">
        <h2 className="text-xl font-semibold text-amber-900 font-playfair">
          🧪 Anagrafiche Vini (beta)
        </h2>
        <p className="text-xs text-neutral-500 mt-1">
          Refactor V.6+V.7+V.8 — lavora sulle tabelle <code className="font-mono">_v2</code> parallele.
          La UI vecchia del modulo Vini resta intatta. Al cutover atomico (Fase 10) queste tabelle
          sostituiranno quelle live.
        </p>
      </div>

      {/* Tab navigation */}
      <div className="flex flex-wrap gap-1 border-b border-neutral-200">
        {TABS.map(t => {
          const active = tab === t.key;
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`px-4 py-2 text-sm font-semibold rounded-t-lg transition border-b-2 ${
                active
                  ? "border-amber-700 bg-amber-50 text-amber-900"
                  : "border-transparent text-neutral-600 hover:bg-neutral-50"
              }`}
            >
              <span className="mr-1.5">{t.icon}</span>{t.label}
            </button>
          );
        })}
      </div>

      {/* Tab content */}
      <div className="pt-2">
        {tab === "stats"         && <StatsPanel onJump={setTab} />}
        {tab === "produttori"    && <CrudList kind="produttori"    fields={PRODUTTORE_FIELDS}    titleSing="Produttore"    titlePl="Produttori"    />}
        {tab === "fornitori"     && <CrudList kind="fornitori"     fields={FORNITORE_FIELDS}     titleSing="Fornitore"     titlePl="Fornitori"     />}
        {tab === "denominazioni" && <DenominazioniPanel />}
        {tab === "vitigni"       && <CrudList kind="vitigni"       fields={VITIGNO_FIELDS}       titleSing="Vitigno"       titlePl="Vitigni"       />}
        {tab === "madre"         && <MadrePanel />}
      </div>
    </div>
  );
}

// ===============================================================
// STATS — Panoramica con conteggi e link veloci
// ===============================================================
function StatsPanel({ onJump }) {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const r = await apiFetch(`${API_BASE}/vini/anagrafiche/stats/`);
        if (r.ok) setStats(await r.json());
      } catch {} finally { setLoading(false); }
    })();
  }, []);

  if (loading) return <div className="text-sm text-neutral-500">Carico panoramica…</div>;
  if (!stats) return <div className="text-sm text-red-600">Errore caricamento.</div>;

  const Card = ({ label, value, tab, color }) => (
    <button onClick={() => onJump(tab)}
      className={`text-left rounded-xl border-2 p-4 ${color} hover:shadow-md transition`}>
      <div className="text-2xl font-bold tabular-nums">{value}</div>
      <div className="text-xs uppercase tracking-wider text-neutral-600 mt-1">{label}</div>
    </button>
  );

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <Card label="Produttori"    value={stats.produttori}    tab="produttori"    color="border-amber-300 bg-amber-50" />
        <Card label="Fornitori"     value={stats.fornitori}     tab="fornitori"     color="border-blue-300 bg-blue-50" />
        <Card label="Denominazioni" value={stats.denominazioni} tab="denominazioni" color="border-violet-300 bg-violet-50" />
        <Card label="Vitigni"       value={stats.vitigni}       tab="vitigni"       color="border-emerald-300 bg-emerald-50" />
        <Card label="Vini madre"    value={stats.madre}         tab="madre"         color="border-rose-300 bg-rose-50" />
        <Card label="Bottiglie (in v2)" value={stats.bottiglie}  tab="madre"        color="border-neutral-300 bg-white" />
      </div>

      <div className="border border-neutral-200 rounded-xl p-4 bg-neutral-50 text-xs text-neutral-700 space-y-2 leading-relaxed">
        <p><strong>Strategia blue-green:</strong> queste tabelle (con suffisso <code className="font-mono">_v2</code>) sono parallele a quelle in produzione. La UI vecchia del modulo Vini continua a usare <code className="font-mono">vini_magazzino</code> originale. Quando tutto è validato, lo swap atomico le sostituisce.</p>
        <p><strong>Cose da fare</strong> (priorità per il cutover):</p>
        <ul className="list-disc list-inside pl-2 space-y-1">
          <li>Verificare i 350 produttori e correggere eventuali nomi sbagliati (es. "CAMPERCHI" → "Camperchi" se serve)</li>
          <li>Assegnare le ~725 denominazioni non matchate automaticamente (tab Denominazioni → filtro "no match")</li>
          <li>Aggiungere i ~10 vitigni mancanti (Clairette, Verdeca, Susumaniello, Vernaccia, Catarratto, Zibibbo, Gewürztraminer, ecc.)</li>
        </ul>
      </div>

      <SyncAllPanel />
    </div>
  );
}


// ===============================================================
// SYNC ALL — Risincronizza tutte le bottiglie dalle anagrafiche
// (Fase 7 — safety net contro drift)
// ===============================================================
function SyncAllPanel() {
  const [busy, setBusy] = useState(false);
  const [report, setReport] = useState(null);
  const [error, setError] = useState("");

  const run = async () => {
    if (!window.confirm(
      "Risincronizzare tutte le bottiglie dalle anagrafiche?\n\n" +
      "Operazione idempotente. Aggiorna i campi PRODUTTORE, DESCRIZIONE, " +
      "DENOMINAZIONE, ecc. su tutte le bottiglie con madre_id. " +
      "Le bottiglie orfane (senza madre_id) non sono toccate."
    )) return;
    setBusy(true); setError(""); setReport(null);
    try {
      const r = await apiFetch(`${API_BASE}/vini/anagrafiche/sync-all`, { method: "POST" });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      setReport(await r.json());
    } catch (e) {
      setError(String(e.message || e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="border border-amber-200 rounded-xl p-4 bg-amber-50 space-y-2">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-amber-900">🔄 Risincronizza tutto</div>
          <div className="text-xs text-amber-800 mt-0.5">
            Safety net: ricalcola i campi anagrafici di tutte le bottiglie dal loro vino madre.
            Da usare se sospetti drift (es. dopo modifiche manuali su DB).
          </div>
        </div>
        <button
          onClick={run}
          disabled={busy}
          className="px-4 py-2 rounded-lg bg-amber-700 hover:bg-amber-800 text-white text-sm font-semibold disabled:opacity-50 whitespace-nowrap"
        >
          {busy ? "Sync in corso…" : "Avvia sync"}
        </button>
      </div>
      {report && (
        <div className="text-xs bg-white border border-amber-200 rounded-lg p-3 font-mono tabular-nums">
          <div>✓ Madre processati: <strong>{report.n_madre_processati}</strong></div>
          <div>✓ Bottiglie aggiornate: <strong>{report.n_bottiglie_aggiornate}</strong></div>
          <div>· Orfane skippate (madre_id NULL): {report.n_orfani_skippati}</div>
          <div>· Durata: {report.durata_sec}s</div>
        </div>
      )}
      {error && (
        <div className="text-xs bg-red-50 border border-red-300 rounded-lg p-2 text-red-800">
          Errore: {error}
        </div>
      )}
    </div>
  );
}

// ===============================================================
// CRUD LIST GENERICO — usato per produttori, fornitori, vitigni
// ===============================================================
function CrudList({ kind, fields, titleSing, titlePl }) {
  const [items, setItems] = useState([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null);  // null | "new" | item
  const [error, setError] = useState("");

  const baseUrl = `${API_BASE}/vini/anagrafiche/${kind}/`;

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const q = search ? `?search=${encodeURIComponent(search)}` : "";
      const r = await apiFetch(`${baseUrl}${q}`);
      if (r.ok) setItems(await r.json());
    } catch (e) { setError(e?.message || "errore"); }
    finally { setLoading(false); }
  }, [baseUrl, search]);

  useEffect(() => { reload(); }, [reload]);

  const handleSave = async (data) => {
    const isNew = editing === "new";
    const url = isNew ? baseUrl : `${baseUrl}${editing.id}`;
    const method = isNew ? "POST" : "PATCH";
    const r = await apiFetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (!r.ok) {
      const err = await r.json().catch(() => ({ detail: r.statusText }));
      throw new Error(err.detail || "errore");
    }
    setEditing(null);
    await reload();
  };

  const handleDelete = async (item) => {
    if (!window.confirm(`Eliminare "${item.nome}"? Operazione irreversibile.`)) return;
    const r = await apiFetch(`${baseUrl}${item.id}`, { method: "DELETE" });
    if (!r.ok) {
      const err = await r.json().catch(() => ({ detail: r.statusText }));
      alert(err.detail || "errore eliminazione");
      return;
    }
    await reload();
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3 flex-wrap">
        <input
          type="text"
          placeholder={`Cerca ${titlePl.toLowerCase()}…`}
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="flex-1 min-w-[200px] px-3 py-1.5 rounded-lg border border-neutral-300 text-sm focus:outline-none focus:ring-2 focus:ring-amber-300"
        />
        <button onClick={() => setEditing("new")}
          className="px-4 py-1.5 rounded-lg bg-amber-700 text-white text-sm font-semibold hover:bg-amber-800">
          + Nuovo {titleSing}
        </button>
        <span className="text-xs text-neutral-500">{items.length} risultati</span>
      </div>

      {error && <div className="bg-red-50 border border-red-200 rounded-lg p-2 text-sm text-red-700">{error}</div>}

      <div className="border border-neutral-200 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-neutral-50 text-xs uppercase tracking-wider text-neutral-600">
            <tr>
              <th className="px-3 py-2 text-left">ID</th>
              {fields.map(f => (
                <th key={f.key} className="px-3 py-2 text-left">{f.label}</th>
              ))}
              <th className="px-3 py-2 text-right">Azioni</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={fields.length + 2} className="px-3 py-6 text-center text-neutral-500">Carico…</td></tr>
            )}
            {!loading && items.length === 0 && (
              <tr><td colSpan={fields.length + 2} className="px-3 py-6 text-center text-neutral-500">Nessun risultato.</td></tr>
            )}
            {!loading && items.map(item => (
              <tr key={item.id} className="border-t border-neutral-100 hover:bg-neutral-50">
                <td className="px-3 py-2 font-mono text-xs text-neutral-500">{item.id}</td>
                {fields.map(f => (
                  <td key={f.key} className="px-3 py-2">
                    {String(item[f.key] ?? "")}
                  </td>
                ))}
                <td className="px-3 py-2 text-right space-x-1">
                  <button onClick={() => setEditing(item)}
                    className="px-2 py-1 text-xs rounded border border-neutral-300 hover:bg-neutral-100">
                    ✏️
                  </button>
                  <button onClick={() => handleDelete(item)}
                    className="px-2 py-1 text-xs rounded border border-red-300 text-red-700 hover:bg-red-50">
                    🗑
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {editing && (
        <EditModal
          fields={fields}
          item={editing === "new" ? {} : editing}
          isNew={editing === "new"}
          title={editing === "new" ? `Nuovo ${titleSing}` : `Modifica ${titleSing}`}
          onSave={handleSave}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}

// ===============================================================
// MODALE DI EDIT GENERICA
// ===============================================================
function EditModal({ fields, item, isNew, title, onSave, onClose }) {
  const [form, setForm] = useState(() => {
    const init = {};
    fields.forEach(f => { init[f.key] = item[f.key] ?? ""; });
    return init;
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const handleChange = (key, value) => setForm(p => ({ ...p, [key]: value }));

  const handleSubmit = async () => {
    setError("");
    // Validazione obbligatori
    for (const f of fields) {
      if (f.required && (!form[f.key] || String(form[f.key]).trim() === "")) {
        setError(`Campo obbligatorio: ${f.label}`);
        return;
      }
    }
    // Prepara payload (rimuovi stringhe vuote opzionali)
    const payload = {};
    fields.forEach(f => {
      const v = form[f.key];
      if (v !== "" && v !== null && v !== undefined) {
        if (f.type === "number") payload[f.key] = Number(v);
        else payload[f.key] = v;
      } else if (f.required) {
        payload[f.key] = v;
      }
    });
    setSaving(true);
    try {
      await onSave(payload);
    } catch (e) {
      setError(e.message || "Errore salvataggio");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4"
         onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full p-5"
           onClick={e => e.stopPropagation()}>
        <h3 className="text-base font-bold mb-4 text-neutral-900">{title}</h3>
        <div className="space-y-3">
          {fields.map(f => (
            <div key={f.key}>
              <label className="block text-xs font-semibold text-neutral-700 mb-1">
                {f.label}{f.required && <span className="text-red-500"> *</span>}
              </label>
              {f.type === "textarea" ? (
                <textarea value={form[f.key] ?? ""}
                  onChange={e => handleChange(f.key, e.target.value)}
                  rows={3}
                  className="w-full px-3 py-1.5 rounded-lg border border-neutral-300 text-sm focus:outline-none focus:ring-2 focus:ring-amber-300" />
              ) : (
                <input type={f.type === "number" ? "number" : "text"}
                  value={form[f.key] ?? ""}
                  onChange={e => handleChange(f.key, e.target.value)}
                  placeholder={f.placeholder || ""}
                  className="w-full px-3 py-1.5 rounded-lg border border-neutral-300 text-sm focus:outline-none focus:ring-2 focus:ring-amber-300" />
              )}
            </div>
          ))}
        </div>
        {error && <div className="mt-3 text-xs text-red-700 bg-red-50 border border-red-200 rounded p-2">{error}</div>}
        <div className="flex justify-end gap-2 mt-5">
          <button onClick={onClose}
            className="px-4 py-1.5 rounded-lg border border-neutral-300 text-sm hover:bg-neutral-50">
            Annulla
          </button>
          <button onClick={handleSubmit} disabled={saving}
            className="px-5 py-1.5 rounded-lg bg-amber-700 text-white text-sm font-semibold hover:bg-amber-800 disabled:opacity-40">
            {saving ? "Salvo…" : (isNew ? "Crea" : "Salva")}
          </button>
        </div>
      </div>
    </div>
  );
}

// ===============================================================
// DEFINIZIONI CAMPI PER OGNI ENTITÀ
// ===============================================================
const PRODUTTORE_FIELDS = [
  { key: "nome",      label: "Nome",      required: true,  placeholder: "es. Marchesi di Barolo" },
  { key: "nazione",   label: "Nazione",   required: true,  placeholder: "Italia / Francia / …" },
  { key: "regione",   label: "Regione",                    placeholder: "es. Piemonte" },
  { key: "provincia", label: "Provincia",                  placeholder: "es. CN" },
  { key: "citta",     label: "Città",                      placeholder: "es. Barolo" },
  { key: "note",      label: "Note",      type: "textarea" },
];

const FORNITORE_FIELDS = [
  { key: "nome",                    label: "Nome distributore", required: true,  placeholder: "es. Mediawine srl" },
  { key: "nazione",                 label: "Nazione" },
  { key: "regione",                 label: "Regione" },
  { key: "provincia",               label: "Provincia" },
  { key: "citta",                   label: "Città" },
  { key: "rappresentante_nome",     label: "Rappresentante (nome)",     placeholder: "es. Luca Rossi" },
  { key: "rappresentante_telefono", label: "Rappresentante (telefono)", placeholder: "es. 348 1234567" },
  { key: "rappresentante_email",    label: "Rappresentante (email)",    placeholder: "luca@..." },
  { key: "note",                    label: "Note", type: "textarea" },
];

const VITIGNO_FIELDS = [
  { key: "nome", label: "Nome", required: true, placeholder: "es. Nebbiolo" },
  { key: "note", label: "Note", type: "textarea", placeholder: "Sinonimi, caratteristiche, regioni dove è coltivato, ecc." },
];

// ===============================================================
// DENOMINAZIONI — UI dedicata (gestione + sync)
// ===============================================================
function DenominazioniPanel() {
  const [items, setItems] = useState([]);
  const [search, setSearch] = useState("");
  const [nazione, setNazione] = useState("");
  const [tipo, setTipo] = useState("");
  const [loading, setLoading] = useState(true);
  const [syncResult, setSyncResult] = useState(null);
  const [syncing, setSyncing] = useState(false);

  const reload = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (search) params.set("search", search);
    if (nazione) params.set("nazione", nazione);
    if (tipo) params.set("tipo", tipo);
    params.set("solo_attive", "true");
    try {
      const r = await apiFetch(`${API_BASE}/vini/anagrafiche/denominazioni/?${params}`);
      if (r.ok) setItems(await r.json());
    } finally { setLoading(false); }
  }, [search, nazione, tipo]);

  useEffect(() => { reload(); }, [reload]);

  const handleSync = async (dryRun) => {
    setSyncing(true); setSyncResult(null);
    try {
      const r = await apiFetch(
        `${API_BASE}/vini/anagrafiche/denominazioni/sync?dry_run=${dryRun}`,
        { method: "POST" }
      );
      const json = await r.json();
      setSyncResult(json);
      if (!dryRun) await reload();
    } catch (e) { setSyncResult({ error: e.message }); }
    finally { setSyncing(false); }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 flex-wrap p-3 bg-violet-50 border border-violet-200 rounded-lg">
        <span className="text-xs font-semibold text-violet-900">Sync da fonti ufficiali UE:</span>
        <button onClick={() => handleSync(true)} disabled={syncing}
          className="px-3 py-1 rounded text-xs font-semibold border border-violet-400 text-violet-800 bg-white hover:bg-violet-50 disabled:opacity-40">
          {syncing ? "…" : "Dry-run (preview)"}
        </button>
        <button onClick={() => handleSync(false)} disabled={syncing}
          className="px-3 py-1 rounded text-xs font-semibold bg-violet-700 text-white hover:bg-violet-800 disabled:opacity-40">
          {syncing ? "…" : "Sync (commit)"}
        </button>
        {syncResult && (
          <span className="text-xs ml-2 text-violet-900">
            {syncResult.error ? `❌ ${syncResult.error}` :
              syncResult.dry_run ? `Preview: ${syncResult.denominazioni_pronte} pronte` :
              `✓ ${syncResult.upsert?.inseriti || 0} inseriti, ${syncResult.upsert?.aggiornati || 0} aggiornati, ${syncResult.upsert?.invariati || 0} invariati`}
          </span>
        )}
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <input type="text" placeholder="Cerca per nome o codice…"
          value={search} onChange={e => setSearch(e.target.value)}
          className="flex-1 min-w-[200px] px-3 py-1.5 rounded-lg border border-neutral-300 text-sm" />
        <select value={nazione} onChange={e => setNazione(e.target.value)}
          className="px-3 py-1.5 rounded-lg border border-neutral-300 text-sm">
          <option value="">Tutte le nazioni</option>
          <option>Italia</option><option>Francia</option><option>Germania</option><option>Austria</option>
          <option>Spagna</option><option>Grecia</option><option>Portogallo</option>
        </select>
        <select value={tipo} onChange={e => setTipo(e.target.value)}
          className="px-3 py-1.5 rounded-lg border border-neutral-300 text-sm">
          <option value="">Tutti i tipi</option>
          <option>DOCG</option><option>DOC</option><option>IGT</option><option>AOC</option>
          <option>IGP</option><option>DOP</option><option>PDO</option><option>PGI</option>
        </select>
        <span className="text-xs text-neutral-500">{items.length} risultati</span>
      </div>

      <div className="border border-neutral-200 rounded-xl overflow-hidden max-h-[60vh] overflow-y-auto">
        <table className="w-full text-sm">
          <thead className="bg-neutral-50 text-xs uppercase tracking-wider text-neutral-600 sticky top-0">
            <tr>
              <th className="px-3 py-2 text-left">ID</th>
              <th className="px-3 py-2 text-left">Codice eAmbrosia</th>
              <th className="px-3 py-2 text-left">Display canonico</th>
              <th className="px-3 py-2 text-left">Nazione</th>
              <th className="px-3 py-2 text-left">Regione</th>
              <th className="px-3 py-2 text-left">Source</th>
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={6} className="px-3 py-6 text-center text-neutral-500">Carico…</td></tr>}
            {!loading && items.length === 0 && <tr><td colSpan={6} className="px-3 py-6 text-center text-neutral-500">Nessun risultato.</td></tr>}
            {!loading && items.map(d => (
              <tr key={d.id} className="border-t border-neutral-100 hover:bg-neutral-50">
                <td className="px-3 py-1.5 font-mono text-xs text-neutral-500">{d.id}</td>
                <td className="px-3 py-1.5 font-mono text-xs">{d.codice_eambrosia || "—"}</td>
                <td className="px-3 py-1.5 font-semibold">{d.nome} {d.tipo}</td>
                <td className="px-3 py-1.5">{d.nazione}</td>
                <td className="px-3 py-1.5">{d.regione || "—"}</td>
                <td className="px-3 py-1.5 text-xs text-neutral-500">{d.source || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ===============================================================
// VINI MADRE — UI dedicata (lista + assign denominazione + edit)
// ===============================================================
function MadrePanel() {
  const [items, setItems] = useState([]);
  const [search, setSearch] = useState("");
  const [filtroProd, setFiltroProd] = useState("");
  const [filtroNoDeno, setFiltroNoDeno] = useState(false);
  const [produttori, setProduttori] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null);
  const [viewAnnate, setViewAnnate] = useState(null);  // Fase 8 — drill-down annate

  // Carica lista produttori per il dropdown
  useEffect(() => {
    (async () => {
      try {
        const r = await apiFetch(`${API_BASE}/vini/anagrafiche/produttori/`);
        if (r.ok) setProduttori(await r.json());
      } catch {}
    })();
  }, []);

  const reload = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (search) params.set("search", search);
    if (filtroProd) params.set("produttore_id", filtroProd);
    try {
      const r = await apiFetch(`${API_BASE}/vini/anagrafiche/madre/?${params}`);
      if (r.ok) {
        let data = await r.json();
        if (filtroNoDeno) data = data.filter(m => !m.denominazione_id);
        setItems(data);
      }
    } finally { setLoading(false); }
  }, [search, filtroProd, filtroNoDeno]);

  useEffect(() => { reload(); }, [reload]);

  const prodById = Object.fromEntries(produttori.map(p => [p.id, p]));

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <input type="text" placeholder="Cerca per descrizione…"
          value={search} onChange={e => setSearch(e.target.value)}
          className="flex-1 min-w-[200px] px-3 py-1.5 rounded-lg border border-neutral-300 text-sm" />
        <select value={filtroProd} onChange={e => setFiltroProd(e.target.value)}
          className="px-3 py-1.5 rounded-lg border border-neutral-300 text-sm max-w-[200px]">
          <option value="">Tutti i produttori</option>
          {produttori.map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}
        </select>
        <label className="flex items-center gap-1 text-xs">
          <input type="checkbox" checked={filtroNoDeno}
            onChange={e => setFiltroNoDeno(e.target.checked)} />
          Solo senza denominazione
        </label>
        <span className="text-xs text-neutral-500">{items.length} risultati</span>
      </div>

      <div className="border border-neutral-200 rounded-xl overflow-hidden max-h-[60vh] overflow-y-auto">
        <table className="w-full text-sm">
          <thead className="bg-neutral-50 text-xs uppercase tracking-wider text-neutral-600 sticky top-0">
            <tr>
              <th className="px-3 py-2 text-left">ID</th>
              <th className="px-3 py-2 text-left">Descrizione</th>
              <th className="px-3 py-2 text-left">Produttore</th>
              <th className="px-3 py-2 text-left">Tipologia</th>
              <th className="px-3 py-2 text-left">Denominazione</th>
              <th className="px-3 py-2 text-right">Azioni</th>
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={6} className="px-3 py-6 text-center text-neutral-500">Carico…</td></tr>}
            {!loading && items.length === 0 && <tr><td colSpan={6} className="px-3 py-6 text-center text-neutral-500">Nessun risultato.</td></tr>}
            {!loading && items.map(m => (
              <tr key={m.id} className="border-t border-neutral-100 hover:bg-neutral-50">
                <td className="px-3 py-1.5 font-mono text-xs text-neutral-500">{m.id}</td>
                <td className="px-3 py-1.5 font-semibold">{m.descrizione}</td>
                <td className="px-3 py-1.5 text-xs">{prodById[m.produttore_id]?.nome || `#${m.produttore_id}`}</td>
                <td className="px-3 py-1.5 text-xs">{m.tipologia}</td>
                <td className="px-3 py-1.5 text-xs">
                  {m.denominazione_id ? `#${m.denominazione_id}` :
                    <span className="text-amber-700 font-semibold">— da assegnare —</span>}
                </td>
                <td className="px-3 py-1.5 text-right whitespace-nowrap">
                  <button onClick={() => setViewAnnate(m)}
                    className="px-2 py-1 text-xs rounded border border-neutral-300 hover:bg-neutral-100 mr-1"
                    title="Vedi annate in cantina">
                    🍷
                  </button>
                  <button onClick={() => setEditing(m)}
                    className="px-2 py-1 text-xs rounded border border-neutral-300 hover:bg-neutral-100"
                    title="Modifica vino madre">
                    ✏️
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {editing && (
        <MadreEditModal
          madre={editing}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); reload(); }}
        />
      )}

      {viewAnnate && (
        <AnnateModal
          madre={viewAnnate}
          produttoreName={prodById[viewAnnate.produttore_id]?.nome}
          onClose={() => setViewAnnate(null)}
        />
      )}
    </div>
  );
}

// ===============================================================
// MODALE EDIT VINO MADRE (con assegnazione denominazione + produttore)
// ===============================================================
function MadreEditModal({ madre, onClose, onSaved }) {
  const [form, setForm] = useState({
    descrizione: madre.descrizione || "",
    tipologia: madre.tipologia || "",
    produttore_id: madre.produttore_id || "",
    fornitore_id: madre.fornitore_id || "",
    denominazione_id: madre.denominazione_id || "",
    nazione: madre.nazione || "",
    regione: madre.regione || "",
    grado_alcolico_tipico: madre.grado_alcolico_tipico ?? "",
    abbinamenti: madre.abbinamenti || "",
    note_madre: madre.note_madre || "",
  });
  const [produttori, setProduttori] = useState([]);
  const [fornitori, setFornitori] = useState([]);
  const [denoSearch, setDenoSearch] = useState("");
  const [denoResults, setDenoResults] = useState([]);
  const [currentDeno, setCurrentDeno] = useState(null);  // denominazione attualmente assegnata
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    (async () => {
      const [pr, fr] = await Promise.all([
        apiFetch(`${API_BASE}/vini/anagrafiche/produttori/`).then(r => r.json()),
        apiFetch(`${API_BASE}/vini/anagrafiche/fornitori/`).then(r => r.json()),
      ]);
      setProduttori(pr); setFornitori(fr);
    })();
  }, []);

  // Carica la denominazione corrente quando il madre arriva con denominazione_id già settato
  useEffect(() => {
    if (!form.denominazione_id) { setCurrentDeno(null); return; }
    // Se l'ho già caricata (stesso id), skip
    if (currentDeno && currentDeno.id === Number(form.denominazione_id)) return;
    (async () => {
      try {
        const r = await apiFetch(`${API_BASE}/vini/anagrafiche/denominazioni/${form.denominazione_id}`);
        if (r.ok) setCurrentDeno(await r.json());
        else setCurrentDeno(null);
      } catch { setCurrentDeno(null); }
    })();
  }, [form.denominazione_id]);  // eslint-disable-line react-hooks/exhaustive-deps

  // Ricerca denominazioni live
  useEffect(() => {
    if (!denoSearch || denoSearch.length < 2) { setDenoResults([]); return; }
    let cancelled = false;
    const t = setTimeout(async () => {
      const r = await apiFetch(
        `${API_BASE}/vini/anagrafiche/denominazioni/?search=${encodeURIComponent(denoSearch)}${form.nazione ? "&nazione=" + form.nazione : ""}`
      );
      if (r.ok && !cancelled) setDenoResults((await r.json()).slice(0, 10));
    }, 250);
    return () => { cancelled = true; clearTimeout(t); };
  }, [denoSearch, form.nazione]);

  // La denominazione attualmente visualizzata: prima cerca tra i risultati search,
  // poi nel valore caricato all'aperture del modale (currentDeno).
  const selectedDeno =
    denoResults.find(d => d.id === Number(form.denominazione_id))
    || (currentDeno && currentDeno.id === Number(form.denominazione_id) ? currentDeno : null);

  const handleSave = async () => {
    setError(""); setSaving(true);
    try {
      const payload = { ...form };
      // Coerce: stringhe vuote a null per FK
      ["fornitore_id", "denominazione_id"].forEach(k => {
        if (payload[k] === "" || payload[k] === null) delete payload[k];
        else payload[k] = Number(payload[k]);
      });
      if (payload.grado_alcolico_tipico === "" || payload.grado_alcolico_tipico === null) {
        delete payload.grado_alcolico_tipico;
      } else {
        payload.grado_alcolico_tipico = Number(payload.grado_alcolico_tipico);
      }
      payload.produttore_id = Number(payload.produttore_id);
      const r = await apiFetch(`${API_BASE}/vini/anagrafiche/madre/${madre.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!r.ok) {
        const err = await r.json();
        throw new Error(err.detail || "errore");
      }
      onSaved();
    } catch (e) { setError(e.message); }
    finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto p-5"
           onClick={e => e.stopPropagation()}>
        <h3 className="text-base font-bold mb-1 text-neutral-900">Vino madre #{madre.id}</h3>
        <p className="text-xs text-neutral-500 mb-4">Modifica anagrafica del vino (etichetta stabile, indipendente dall'annata)</p>

        <div className="grid grid-cols-2 gap-3 text-sm">
          <Field label="Descrizione" required>
            <input type="text" value={form.descrizione}
              onChange={e => setForm(p => ({ ...p, descrizione: e.target.value }))}
              className="w-full px-2 py-1 border rounded" />
          </Field>
          <Field label="Tipologia" required>
            <select value={form.tipologia} onChange={e => setForm(p => ({ ...p, tipologia: e.target.value }))}
              className="w-full px-2 py-1 border rounded">
              {["BOLLICINE","BIANCHI","ROSSI","ROSATI","GRANDI FORMATI","PASSITI E VINI DA MEDITAZIONE","VINI ANALCOLICI","ERRORE"].map(t =>
                <option key={t}>{t}</option>)}
            </select>
          </Field>
          <Field label="Produttore" required>
            <select value={form.produttore_id} onChange={e => setForm(p => ({ ...p, produttore_id: e.target.value }))}
              className="w-full px-2 py-1 border rounded">
              <option value="">— seleziona —</option>
              {produttori.map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}
            </select>
          </Field>
          <Field label="Fornitore (distributore)">
            <select value={form.fornitore_id} onChange={e => setForm(p => ({ ...p, fornitore_id: e.target.value }))}
              className="w-full px-2 py-1 border rounded">
              <option value="">— nessuno —</option>
              {fornitori.map(f => <option key={f.id} value={f.id}>{f.nome}</option>)}
            </select>
          </Field>
          <Field label="Nazione">
            <input type="text" value={form.nazione}
              onChange={e => setForm(p => ({ ...p, nazione: e.target.value }))}
              className="w-full px-2 py-1 border rounded" />
          </Field>
          <Field label="Regione">
            <input type="text" value={form.regione}
              onChange={e => setForm(p => ({ ...p, regione: e.target.value }))}
              className="w-full px-2 py-1 border rounded" />
          </Field>
          <Field label="Grado alcolico tipico">
            <input type="number" step="0.1" value={form.grado_alcolico_tipico}
              onChange={e => setForm(p => ({ ...p, grado_alcolico_tipico: e.target.value }))}
              className="w-full px-2 py-1 border rounded" />
          </Field>
          <Field label="Denominazione">
            {form.denominazione_id && selectedDeno ? (
              <div className="flex items-center gap-2 px-2 py-1 bg-amber-50 border border-amber-200 rounded">
                <span className="flex-1 text-xs">
                  <strong>{selectedDeno.nome} {selectedDeno.tipo}</strong> · {selectedDeno.nazione}
                  {selectedDeno.regione && ` · ${selectedDeno.regione}`}
                </span>
                <button type="button"
                  onClick={() => { setForm(p => ({ ...p, denominazione_id: "" })); setDenoSearch(""); setCurrentDeno(null); }}
                  className="text-xs px-2 py-0.5 border border-red-300 text-red-700 rounded hover:bg-red-50">
                  Rimuovi
                </button>
              </div>
            ) : form.denominazione_id && !selectedDeno ? (
              <div className="text-xs text-neutral-500 italic">#{form.denominazione_id} (caricamento…)</div>
            ) : (
              <div className="space-y-1">
                <input type="text" placeholder="Cerca denominazione (min 2 caratteri)…"
                  value={denoSearch} onChange={e => setDenoSearch(e.target.value)}
                  className="w-full px-2 py-1 border rounded" />
                {denoResults.length > 0 && (
                  <div className="border rounded max-h-32 overflow-y-auto bg-white shadow-sm">
                    {denoResults.map(d => (
                      <div key={d.id}
                        onClick={() => { setForm(p => ({ ...p, denominazione_id: d.id })); setDenoSearch(""); }}
                        className="px-2 py-1 text-xs cursor-pointer hover:bg-amber-50">
                        <strong>{d.nome} {d.tipo}</strong> · {d.nazione}
                        {d.regione && ` · ${d.regione}`}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </Field>
        </div>

        <div className="mt-3">
          <Field label="Abbinamenti consigliati">
            <textarea value={form.abbinamenti}
              onChange={e => setForm(p => ({ ...p, abbinamenti: e.target.value }))}
              rows={2}
              className="w-full px-2 py-1 border rounded text-sm" />
          </Field>
        </div>
        <div className="mt-3">
          <Field label="Note madre">
            <textarea value={form.note_madre}
              onChange={e => setForm(p => ({ ...p, note_madre: e.target.value }))}
              rows={2}
              className="w-full px-2 py-1 border rounded text-sm" />
          </Field>
        </div>

        {error && <div className="mt-3 text-xs text-red-700 bg-red-50 border border-red-200 rounded p-2">{error}</div>}

        <div className="flex justify-end gap-2 mt-5">
          <button onClick={onClose}
            className="px-4 py-1.5 rounded-lg border border-neutral-300 text-sm hover:bg-neutral-50">Annulla</button>
          <button onClick={handleSave} disabled={saving}
            className="px-5 py-1.5 rounded-lg bg-amber-700 text-white text-sm font-semibold hover:bg-amber-800 disabled:opacity-40">
            {saving ? "Salvo…" : "Salva"}
          </button>
        </div>
      </div>
    </div>
  );
}

// Piccolo helper per i campi del form
function Field({ label, required, children }) {
  return (
    <div>
      <label className="block text-[11px] font-semibold text-neutral-700 uppercase tracking-wider mb-1">
        {label}{required && <span className="text-red-500"> *</span>}
      </label>
      {children}
    </div>
  );
}


// ===============================================================
// MODALE ANNATE — Fase 8 vista read-only "madre → annate"
// ===============================================================
function AnnateModal({ madre, produttoreName, onClose }) {
  const [bottiglie, setBottiglie] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    (async () => {
      setLoading(true); setError("");
      try {
        const r = await apiFetch(`${API_BASE}/vini/anagrafiche/madre/${madre.id}/bottiglie`);
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        setBottiglie(await r.json());
      } catch (e) {
        setError(String(e.message || e));
      } finally {
        setLoading(false);
      }
    })();
  }, [madre.id]);

  // Aggregati per riepilogo header
  const totQta = bottiglie.reduce((s, b) => s + (b.QTA_TOTALE || 0), 0);
  const annate = [...new Set(bottiglie.map(b => b.ANNATA).filter(Boolean))].sort().reverse();
  const formati = [...new Set(bottiglie.map(b => b.FORMATO).filter(Boolean))];

  const fmtEuro = (v) => (v == null || v === "" ? "—" : `€ ${Number(v).toFixed(2)}`);

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-5xl max-h-[90vh] overflow-hidden flex flex-col"
           onClick={e => e.stopPropagation()}>

        {/* Header — info del madre */}
        <div className="px-5 py-3 border-b border-neutral-200 bg-gradient-to-r from-rose-50 to-amber-50">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="text-xs uppercase tracking-wider text-neutral-500">Vino madre #{madre.id}</div>
              <h3 className="text-lg font-semibold font-playfair text-neutral-900 truncate">
                🍷 {madre.descrizione}
              </h3>
              <div className="text-xs text-neutral-700 mt-0.5">
                {produttoreName || `Produttore #${madre.produttore_id}`}
                {madre.tipologia && <span className="text-neutral-500"> · {madre.tipologia}</span>}
                {madre.nazione && <span className="text-neutral-500"> · {madre.nazione}</span>}
                {madre.regione && <span className="text-neutral-500"> · {madre.regione}</span>}
              </div>
            </div>
            <button onClick={onClose}
              className="px-3 py-1 rounded-lg text-sm border border-neutral-300 hover:bg-neutral-100">
              Chiudi
            </button>
          </div>

          {!loading && bottiglie.length > 0 && (
            <div className="mt-2 flex items-center gap-4 text-xs">
              <span><strong>{bottiglie.length}</strong> bottiglie in cantina</span>
              <span><strong>{totQta}</strong> pezzi totali</span>
              {annate.length > 0 && (
                <span>Annate: <strong>{annate.slice(0, 5).join(", ")}{annate.length > 5 ? "…" : ""}</strong></span>
              )}
              {formati.length > 0 && (
                <span>Formati: <strong>{formati.join(", ")}</strong></span>
              )}
            </div>
          )}
        </div>

        {/* Tabella annate */}
        <div className="overflow-auto flex-1">
          {loading && <div className="p-6 text-center text-neutral-500">Carico annate…</div>}
          {error && <div className="p-6 text-center text-red-700">Errore: {error}</div>}
          {!loading && !error && bottiglie.length === 0 && (
            <div className="p-6 text-center text-neutral-500">
              Nessuna annata in cantina per questo vino madre.
            </div>
          )}
          {!loading && !error && bottiglie.length > 0 && (
            <table className="w-full text-sm">
              <thead className="bg-neutral-50 text-xs uppercase tracking-wider text-neutral-600 sticky top-0">
                <tr>
                  <th className="px-3 py-2 text-left">ID</th>
                  <th className="px-3 py-2 text-left">Annata</th>
                  <th className="px-3 py-2 text-left">Formato</th>
                  <th className="px-3 py-2 text-right">Carta</th>
                  <th className="px-3 py-2 text-right">Calice</th>
                  <th className="px-3 py-2 text-right">Listino</th>
                  <th className="px-3 py-2 text-center">Qta</th>
                  <th className="px-3 py-2 text-center">Stato</th>
                  <th className="px-3 py-2 text-left">Locazioni</th>
                </tr>
              </thead>
              <tbody>
                {bottiglie.map(b => {
                  const loc = [
                    b.FRIGORIFERO && `Frigo: ${b.QTA_FRIGO || 0}`,
                    b.LOCAZIONE_1 && `${b.LOCAZIONE_1}: ${b.QTA_LOC1 || 0}`,
                    b.LOCAZIONE_2 && `${b.LOCAZIONE_2}: ${b.QTA_LOC2 || 0}`,
                    b.LOCAZIONE_3 && `${b.LOCAZIONE_3}: ${b.QTA_LOC3 || 0}`,
                  ].filter(Boolean).join(" · ");
                  return (
                    <tr key={b.id} className="border-t border-neutral-100 hover:bg-neutral-50">
                      <td className="px-3 py-1.5 font-mono text-xs text-neutral-500">{b.id}</td>
                      <td className="px-3 py-1.5 font-semibold">{b.ANNATA || "—"}</td>
                      <td className="px-3 py-1.5 text-xs">{b.FORMATO || "—"}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums">{fmtEuro(b.PREZZO_CARTA)}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums">
                        {b.VENDITA_CALICE ? fmtEuro(b.PREZZO_CALICE_MANUALE || b.PREZZO_CALICE) : <span className="text-neutral-400">—</span>}
                      </td>
                      <td className="px-3 py-1.5 text-right tabular-nums text-xs text-neutral-600">{fmtEuro(b.EURO_LISTINO)}</td>
                      <td className="px-3 py-1.5 text-center tabular-nums font-semibold">{b.QTA_TOTALE || 0}</td>
                      <td className="px-3 py-1.5 text-center text-xs">
                        <span className="inline-block px-1.5 py-0.5 rounded bg-neutral-100 font-mono">{b.STATO_VENDITA != null ? b.STATO_VENDITA : "—"}</span>
                        {b.STATO_RIORDINO && <span className="ml-1 text-amber-700">{b.STATO_RIORDINO}</span>}
                      </td>
                      <td className="px-3 py-1.5 text-xs text-neutral-600">{loc || "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-2 border-t border-neutral-200 bg-neutral-50 text-xs text-neutral-600">
          Vista read-only. Per modificare quantità, prezzi o stato di una bottiglia,
          usa il Magazzino Vini classico (l'edit live non passa ancora da qui — verrà al cutover Fase 10).
        </div>
      </div>
    </div>
  );
}
