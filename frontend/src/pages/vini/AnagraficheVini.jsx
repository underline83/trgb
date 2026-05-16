// src/pages/vini/AnagraficheVini.jsx
// Modulo: vini (refactor V.6+V.7+V.8 — pannello anagrafiche)
//
// Pannello di gestione delle entità master del modulo Vini: produttori,
// distributori (fornitori), denominazioni, vitigni, vini madre.
// Lavora sulle TABELLE _v2 parallele. La UI vecchia del modulo Vini non è
// toccata. Al cutover atomico (Fase 10) le _v2 sostituiscono quelle live.
//
// Storia file:
//   - Fase 6 refactor anagrafiche: nato come sotto-pagina di Impostazioni Vini.
//   - M2.5-arch (2026-05-16): promosso a tab di primo livello "Anagrafiche".
//     Questo file rimane come componente di contenuto, montato dentro
//     pages/vini/anagrafiche/AnagraficheHub.jsx. Nelle sessioni successive
//     (M2.5.1+) ogni sotto-tab verrà spinto in un file dedicato.
//
// Vedi `docs/refactor_anagrafiche_vini.md` per il design completo.

import React, { useState, useEffect, useCallback, useMemo } from "react";
import { API_BASE, apiFetch } from "../../config/api";
// M2.5.1 (2026-05-16): pannello Produttori dedicato (counts + merge + ricerca)
import ProduttoriPanel from "./anagrafiche/ProduttoriPanel";
// M2.5.2 (2026-05-16): pannello Distributori dedicato + drill-down su tutti i panel
import DistributoriPanel from "./anagrafiche/DistributoriPanel";
// M2.5.4 (2026-05-16): pannello Vitigni dedicato (counts su 5 slot + merge)
import VitigniPanel from "./anagrafiche/VitigniPanel";
import SchedaMadreV2 from "../../components/vini/SchedaMadreV2";

// Helper sort condiviso (interno al file).
function sortRowsLocal(rows, key, dir) {
  const m = dir === "desc" ? -1 : 1;
  return [...rows].sort((a, b) => {
    const av = a?.[key], bv = b?.[key];
    if (av == null && bv == null) return 0;
    if (av == null) return 1;
    if (bv == null) return -1;
    if (typeof av === "number" && typeof bv === "number") return (av - bv) * m;
    return String(av).localeCompare(String(bv), "it") * m;
  });
}
function SortThLocal({ label, sortKey, sort, setSort, className = "", align = "left" }) {
  const active = sort.key === sortKey;
  const dir = active ? sort.dir : null;
  return (
    <th
      onClick={() => setSort({ key: sortKey, dir: active && dir === "asc" ? "desc" : "asc" })}
      className={`px-3 py-2 text-${align} cursor-pointer select-none hover:bg-neutral-100 transition ${className}`}
    >
      <span className="inline-flex items-center gap-1">
        {label}
        <span className="text-[9px] text-neutral-400">{active ? (dir === "asc" ? "▲" : "▼") : "↕"}</span>
      </span>
    </th>
  );
}

// Sotto-tab Anagrafiche.
// NB: "fornitori" è il nome backend storico della tabella (vini_fornitori_v2),
// la label UI è "Distributori" perché è il vocabolario che usa Marco in
// osteria — la mappa è 1:1. Da NON rinominare lato DB/router.
const TABS = [
  { key: "stats",         label: "Panoramica",   icon: "📊" },
  { key: "produttori",    label: "Produttori",   icon: "🏛️" },
  { key: "fornitori",     label: "Distributori", icon: "🚚" },
  { key: "denominazioni", label: "Denominazioni", icon: "📜" },
  { key: "vitigni",       label: "Vitigni",      icon: "🍇" },
  { key: "madre",         label: "Vini madre",   icon: "🍷" },
];

export default function AnagraficheVini() {
  const [tab, setTab] = useState("stats");

  return (
    <div className="space-y-5">
      <div className="border-b border-amber-200 pb-3">
        <h2 className="text-2xl font-semibold text-amber-900 font-playfair">
          📚 Anagrafiche Vini
        </h2>
        <p className="text-xs text-neutral-500 mt-1">
          Gestione produttori, distributori, denominazioni, vitigni e vini madre.
          Lavoriamo sulle tabelle <code className="font-mono">_v2</code> parallele del refactor V.6+V.7+V.8:
          al cutover atomico (Fase 10) sostituiranno quelle live.
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
        {/* M2.5.1 (2026-05-16): Produttori usa il nuovo pannello dedicato (ProduttoriPanel)
            con counts/merge/ricerca. Gli altri sotto-tab verranno rilavorati uno alla volta
            (M2.5.2 Distributori, M2.5.3 Denominazioni, M2.5.4 Vitigni). */}
        {tab === "produttori"    && <ProduttoriPanel />}
        {tab === "fornitori"     && <DistributoriPanel />}
        {tab === "denominazioni" && <DenominazioniPanel />}
        {tab === "vitigni"       && <VitigniPanel />}
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
        <Card label="Distributori"  value={stats.fornitori}     tab="fornitori"     color="border-blue-300 bg-blue-50" />
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

      <CrudListTable items={items} fields={fields} loading={loading}
        onEdit={setEditing} onDelete={handleDelete} />

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

// Tabella CrudList separata per gestire lo stato di ordinamento isolato (M2.5.2).
function CrudListTable({ items, fields, loading, onEdit, onDelete }) {
  const [sort, setSort] = useState({ key: fields[0]?.key || "id", dir: "asc" });
  const sorted = useMemo(() => sortRowsLocal(items, sort.key, sort.dir), [items, sort]);
  return (
    <div className="border border-neutral-200 rounded-xl overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-neutral-50 text-xs uppercase tracking-wider text-neutral-600">
          <tr>
            <SortThLocal label="ID" sortKey="id" sort={sort} setSort={setSort} className="w-12" />
            {fields.map(f => (
              <SortThLocal key={f.key} label={f.label} sortKey={f.key} sort={sort} setSort={setSort} />
            ))}
            <th className="px-3 py-2 text-right">Azioni</th>
          </tr>
        </thead>
        <tbody>
          {loading && (
            <tr><td colSpan={fields.length + 2} className="px-3 py-6 text-center text-neutral-500">Carico…</td></tr>
          )}
          {!loading && sorted.length === 0 && (
            <tr><td colSpan={fields.length + 2} className="px-3 py-6 text-center text-neutral-500">Nessun risultato.</td></tr>
          )}
          {!loading && sorted.map(item => (
            <tr key={item.id} className="border-t border-neutral-100 hover:bg-neutral-50">
              <td className="px-3 py-2 font-mono text-xs text-neutral-500">{item.id}</td>
              {fields.map(f => (
                <td key={f.key} className="px-3 py-2">
                  {String(item[f.key] ?? "")}
                </td>
              ))}
              <td className="px-3 py-2 text-right space-x-1">
                <button onClick={() => onEdit(item)}
                  className="px-2 py-1 text-xs rounded border border-neutral-300 hover:bg-neutral-100">
                  ✏️
                </button>
                <button onClick={() => onDelete(item)}
                  className="px-2 py-1 text-xs rounded border border-red-300 text-red-700 hover:bg-red-50">
                  🗑
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
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
  const role = (typeof localStorage !== "undefined" ? localStorage.getItem("role") : "") || "";
  const canEdit = role === "admin" || role === "superadmin" || role === "sommelier";

  const [items, setItems] = useState([]);
  const [search, setSearch] = useState("");
  const [nazione, setNazione] = useState("");
  const [tipo, setTipo] = useState("");
  const [loading, setLoading] = useState(true);
  const [syncResult, setSyncResult] = useState(null);
  const [syncing, setSyncing] = useState(false);
  // M2.5.3: modali edit/nuovo/merge per CRUD admin
  const [editing, setEditing] = useState(null);    // null | "new" | <denominazione>
  const [merging, setMerging] = useState(null);    // null | <denominazione source>

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
        {canEdit && (
          <button onClick={() => setEditing("new")}
            className="px-4 py-1.5 rounded-lg bg-violet-700 text-white text-sm font-semibold hover:bg-violet-800 shadow-sm ml-auto">
            + Nuova denominazione
          </button>
        )}
      </div>

      <DenominazioniTable
        items={items} loading={loading}
        canEdit={canEdit}
        onEdit={setEditing}
        onMerge={setMerging}
        onReload={reload}
      />

      {editing && canEdit && (
        <DenominazioneEditModal
          item={editing === "new" ? {} : editing}
          isNew={editing === "new"}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); reload(); }}
        />
      )}
      {merging && canEdit && (
        <MergeDenominazioniModal
          source={merging}
          candidates={items.filter(d => d.id !== merging.id)}
          onClose={() => setMerging(null)}
          onDone={() => { setMerging(null); reload(); }}
        />
      )}
    </div>
  );
}

// Sotto-componente: tabella denominazioni con ordinamento + drill-down vini + azioni admin.
function DenominazioniTable({ items, loading, canEdit, onEdit, onMerge, onReload }) {
  const [sort, setSort] = useState({ key: "nome", dir: "asc" });
  const itemsWithDisplay = useMemo(
    () => items.map(d => ({ ...d, _display: `${d.nome || ""} ${d.tipo || ""}`.trim() })),
    [items]
  );
  const sorted = useMemo(() => sortRowsLocal(itemsWithDisplay, sort.key, sort.dir), [itemsWithDisplay, sort]);
  const [detail, setDetail] = useState(null);

  const openDetail = async (did) => {
    try {
      const [rDet, rMadri] = await Promise.all([
        apiFetch(`${API_BASE}/vini/anagrafiche/denominazioni/${did}?with_madri=true`),
        apiFetch(`${API_BASE}/vini/v2/madri-raggruppate/?denominazione_id=${did}`),
      ]);
      if (!rDet.ok) throw new Error(`HTTP ${rDet.status}`);
      const det = await rDet.json();
      det._madri_complete = rMadri.ok ? await rMadri.json() : [];
      setDetail(det);
    } catch (e) {
      alert(`Errore: ${e.message}`);
    }
  };

  const handleDelete = async (d) => {
    if (!window.confirm(`Eliminare la denominazione "${d.nome} ${d.tipo}"?\nOperazione irreversibile.`)) return;
    try {
      const r = await apiFetch(`${API_BASE}/vini/anagrafiche/denominazioni/${d.id}`, { method: "DELETE" });
      if (!r.ok) {
        const err = await r.json().catch(() => ({ detail: r.statusText }));
        throw new Error(err.detail || `HTTP ${r.status}`);
      }
      onReload && onReload();
    } catch (e) {
      alert(e.message);
    }
  };

  return (
    <>
      <div className="border border-neutral-200 rounded-xl overflow-hidden max-h-[60vh] overflow-y-auto">
        <table className="w-full text-sm">
          <thead className="bg-neutral-50 text-xs uppercase tracking-wider text-neutral-600 sticky top-0 z-10">
            <tr>
              <th className="px-3 py-2 text-left w-12">ID</th>
              <SortThLocal label="Codice eAmbrosia" sortKey="codice_eambrosia" sort={sort} setSort={setSort} />
              <SortThLocal label="Display canonico" sortKey="_display"         sort={sort} setSort={setSort} />
              <SortThLocal label="Nazione"          sortKey="nazione"          sort={sort} setSort={setSort} />
              <SortThLocal label="Regione"          sortKey="regione"          sort={sort} setSort={setSort} />
              <SortThLocal label="Source"           sortKey="source"           sort={sort} setSort={setSort} />
              {canEdit && <th className="px-3 py-2 text-right">Azioni</th>}
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={canEdit ? 7 : 6} className="px-3 py-6 text-center text-neutral-500">Carico…</td></tr>}
            {!loading && sorted.length === 0 && <tr><td colSpan={canEdit ? 7 : 6} className="px-3 py-6 text-center text-neutral-500">Nessun risultato.</td></tr>}
            {!loading && sorted.map(d => {
              // "manual" = aggiunta a mano dall'utente (non viene da eAmbrosia/MASAF).
              // Sono le candidate naturali al merge verso una denominazione seedata.
              const isManual = !d.codice_eambrosia && (d.source !== "eambrosia") && (d.source !== "masaf");
              return (
                <tr key={d.id} className="border-t border-neutral-100 hover:bg-violet-50 cursor-pointer transition"
                    onClick={() => openDetail(d.id)} title="Apri lista vini con questa denominazione">
                  <td className="px-3 py-1.5 font-mono text-xs text-neutral-500">{d.id}</td>
                  <td className="px-3 py-1.5 font-mono text-xs">{d.codice_eambrosia || (isManual ? <span className="text-amber-700 italic">manuale</span> : "—")}</td>
                  <td className="px-3 py-1.5 font-semibold text-violet-900 hover:underline">{d.nome} {d.tipo}</td>
                  <td className="px-3 py-1.5">{d.nazione}</td>
                  <td className="px-3 py-1.5">{d.regione || "—"}</td>
                  <td className="px-3 py-1.5 text-xs text-neutral-500">{d.source || "—"}</td>
                  {canEdit && (
                    <td className="px-3 py-1.5 text-right whitespace-nowrap" onClick={e => e.stopPropagation()}>
                      <button onClick={() => onEdit(d)}
                        className="px-2 py-1 text-xs rounded border border-neutral-300 hover:bg-neutral-100 mr-1"
                        title="Modifica denominazione">✏️</button>
                      <button onClick={() => onMerge(d)}
                        className="px-2 py-1 text-xs rounded border border-violet-400 text-violet-800 hover:bg-violet-50 mr-1"
                        title="Fondi in un'altra denominazione (duplicati)">🔀</button>
                      <button onClick={() => handleDelete(d)}
                        className="px-2 py-1 text-xs rounded border border-red-300 text-red-700 hover:bg-red-50"
                        title="Elimina (bloccato se ci sono vini collegati)">🗑</button>
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {detail && <DenominazioneDetailModal denominazione={detail} onClose={() => setDetail(null)} />}
    </>
  );
}


// ════════════════════════════════════════════════════════════════
// MODALE EDIT / NUOVA DENOMINAZIONE
// ════════════════════════════════════════════════════════════════
const DENO_FIELDS = [
  { key: "nome",             label: "Nome",             required: true,  placeholder: "es. Barolo" },
  { key: "tipo",             label: "Tipo",             required: true,  placeholder: "DOCG / DOC / IGT / AOC / IGP / DOP" },
  { key: "nazione",          label: "Nazione",          required: true,  placeholder: "Italia / Francia / …" },
  { key: "regione",          label: "Regione",                            placeholder: "es. Piemonte" },
  { key: "tipo_ue",          label: "Tipo UE",                            placeholder: "DOP / PDO / IGP / PGI" },
  { key: "codice_eambrosia", label: "Codice eAmbrosia",                   placeholder: "(facoltativo, solo se ufficiale)" },
];

function DenominazioneEditModal({ item, isNew, onClose, onSaved }) {
  const [form, setForm] = useState(() => {
    const init = {};
    DENO_FIELDS.forEach(f => { init[f.key] = item[f.key] ?? ""; });
    return init;
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const save = async () => {
    setError("");
    for (const f of DENO_FIELDS) {
      if (f.required && !String(form[f.key] || "").trim()) {
        setError(`Campo obbligatorio: ${f.label}`); return;
      }
    }
    const payload = {};
    DENO_FIELDS.forEach(f => {
      const v = form[f.key];
      if (v !== "" && v != null) payload[f.key] = v;
    });
    // Per le nuove denominazioni aggiunte manualmente, marca source=manual.
    if (isNew && !payload.source) payload.source = "manual";
    setSaving(true);
    try {
      const url = `${API_BASE}/vini/anagrafiche/denominazioni/${isNew ? "" : item.id}`;
      const r = await apiFetch(url, {
        method: isNew ? "POST" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!r.ok) {
        const err = await r.json().catch(() => ({ detail: r.statusText }));
        throw new Error(err.detail || "errore");
      }
      onSaved();
    } catch (e) {
      setError(e.message || "Errore salvataggio");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full p-5 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <h3 className="text-base font-bold mb-1 text-neutral-900">
          {isNew ? "🆕 Nuova denominazione" : `✏️ Modifica denominazione #${item.id}`}
        </h3>
        <p className="text-xs text-neutral-500 mb-3">
          {isNew
            ? "Aggiunta manuale per casi non presenti in eAmbrosia/MASAF. Verrà marcata source=\"manual\"."
            : "Se questa è una denominazione seedata, attenzione: il prossimo sync potrebbe sovrascrivere i campi (eAmbrosia/MASAF sono la fonte canonica)."}
        </p>
        <div className="grid grid-cols-2 gap-3">
          {DENO_FIELDS.map(f => (
            <div key={f.key} className={f.key === "nome" || f.key === "codice_eambrosia" ? "col-span-2" : ""}>
              <label className="block text-xs font-semibold text-neutral-700 mb-1">
                {f.label}{f.required && <span className="text-red-500"> *</span>}
              </label>
              <input type="text" value={form[f.key] ?? ""}
                onChange={e => setForm(p => ({ ...p, [f.key]: e.target.value }))}
                placeholder={f.placeholder || ""}
                className="w-full px-3 py-1.5 rounded-lg border border-neutral-300 text-sm focus:outline-none focus:ring-2 focus:ring-violet-300" />
            </div>
          ))}
        </div>
        {error && <div className="mt-3 text-xs text-red-700 bg-red-50 border border-red-200 rounded p-2">{error}</div>}
        <div className="flex justify-end gap-2 mt-5">
          <button onClick={onClose}
            className="px-4 py-1.5 rounded-lg border border-neutral-300 text-sm hover:bg-neutral-50">
            Annulla
          </button>
          <button onClick={save} disabled={saving}
            className="px-5 py-1.5 rounded-lg bg-violet-700 text-white text-sm font-semibold hover:bg-violet-800 disabled:opacity-40">
            {saving ? "Salvo…" : (isNew ? "Crea" : "Salva")}
          </button>
        </div>
      </div>
    </div>
  );
}


// ════════════════════════════════════════════════════════════════
// MODALE MERGE DENOMINAZIONI
// ════════════════════════════════════════════════════════════════
function MergeDenominazioniModal({ source, candidates, onClose, onDone }) {
  const [search, setSearch] = useState("");
  const [targetId, setTargetId] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const arr = q
      ? candidates.filter(c => `${c.nome || ""} ${c.tipo || ""} ${c.codice_eambrosia || ""}`.toLowerCase().includes(q))
      : candidates;
    return arr.slice(0, 50);
  }, [search, candidates]);
  const target = candidates.find(c => c.id === targetId) || null;

  const doMerge = async () => {
    if (!target) return;
    if (!window.confirm(
      `Confermare il merge?\n\n` +
      `SORGENTE: #${source.id} ${source.nome} ${source.tipo}\n` +
      `DESTINAZIONE: #${target.id} ${target.nome} ${target.tipo}\n\n` +
      `Tutti i vini madre che usano la sorgente passeranno alla destinazione. ` +
      `La sorgente verrà ELIMINATA. Operazione irreversibile.`
    )) return;
    setBusy(true); setError("");
    try {
      const url = `${API_BASE}/vini/anagrafiche/denominazioni/${source.id}/merge?target_id=${target.id}`;
      const r = await apiFetch(url, { method: "POST" });
      if (!r.ok) {
        const err = await r.json().catch(() => ({ detail: r.statusText }));
        throw new Error(err.detail || "errore");
      }
      const report = await r.json();
      alert(`✓ Merge completato.\n${report.n_madre_spostati} vini madre spostati.`);
      onDone();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[85vh] overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="px-5 py-3 border-b border-violet-200 bg-gradient-to-r from-violet-50 to-white">
          <h3 className="text-base font-bold text-violet-900">🔀 Fondi denominazione</h3>
          <p className="text-xs text-neutral-600 mt-1">
            Sposta tutti i vini madre alla destinazione, poi elimina la sorgente.
            Tipico: una "manuale" che il sync ha poi portato come ufficiale → fondi la manuale dentro la seedata.
          </p>
        </div>
        <div className="px-5 py-3 grid grid-cols-2 gap-3 border-b border-neutral-200 bg-neutral-50">
          <div>
            <div className="text-[10px] uppercase tracking-wider text-rose-700 font-semibold">Sorgente (sarà eliminata)</div>
            <div className="text-sm font-bold text-neutral-900">#{source.id} {source.nome} {source.tipo}</div>
            <div className="text-xs text-neutral-600 mt-0.5">
              {source.codice_eambrosia ? `${source.codice_eambrosia} · ` : ""}{source.nazione || "—"}
              {source.regione ? ` · ${source.regione}` : ""}
            </div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wider text-emerald-700 font-semibold">Destinazione</div>
            {target ? (
              <>
                <div className="text-sm font-bold text-neutral-900">#{target.id} {target.nome} {target.tipo}</div>
                <div className="text-xs text-neutral-600 mt-0.5">
                  {target.codice_eambrosia ? `${target.codice_eambrosia} · ` : ""}{target.nazione || "—"}
                  {target.regione ? ` · ${target.regione}` : ""}
                </div>
              </>
            ) : (
              <div className="text-sm text-neutral-400 italic">— seleziona dalla lista —</div>
            )}
          </div>
        </div>
        <div className="px-5 py-2 border-b border-neutral-200">
          <input type="text" placeholder="Cerca destinazione (nome, tipo, codice eAmbrosia)…"
            value={search} onChange={e => setSearch(e.target.value)}
            className="w-full px-3 py-1.5 rounded-lg border border-neutral-300 text-sm focus:outline-none focus:ring-2 focus:ring-violet-300" />
        </div>
        <div className="flex-1 overflow-auto">
          <table className="w-full text-sm">
            <thead className="bg-neutral-50 text-[10px] uppercase tracking-wider text-neutral-600 sticky top-0">
              <tr>
                <th className="px-3 py-1.5 text-left w-10"></th>
                <th className="px-3 py-1.5 text-left w-12">ID</th>
                <th className="px-3 py-1.5 text-left">Codice / Display</th>
                <th className="px-3 py-1.5 text-left">Naz / Reg</th>
                <th className="px-3 py-1.5 text-left">Source</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(c => (
                <tr key={c.id}
                    className={`border-t border-neutral-100 cursor-pointer transition ${
                      c.id === targetId ? "bg-emerald-50" : "hover:bg-neutral-50"
                    }`}
                    onClick={() => setTargetId(c.id)}>
                  <td className="px-3 py-1 text-center">
                    <input type="radio" checked={c.id === targetId} onChange={() => setTargetId(c.id)} />
                  </td>
                  <td className="px-3 py-1 font-mono text-[11px] text-neutral-500">{c.id}</td>
                  <td className="px-3 py-1">
                    {c.codice_eambrosia && <span className="font-mono text-[10px] text-neutral-500 mr-1">{c.codice_eambrosia}</span>}
                    <span className="font-semibold">{c.nome} {c.tipo}</span>
                  </td>
                  <td className="px-3 py-1 text-xs text-neutral-600">{[c.nazione, c.regione].filter(Boolean).join(" · ") || "—"}</td>
                  <td className="px-3 py-1 text-xs text-neutral-500">{c.source || "—"}</td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={5} className="px-3 py-6 text-center text-neutral-500 text-xs">Nessun candidato. Affina la ricerca.</td></tr>
              )}
            </tbody>
          </table>
        </div>
        {error && <div className="px-5 py-2 text-xs text-red-700 bg-red-50 border-t border-red-200">{error}</div>}
        <div className="px-5 py-3 border-t border-neutral-200 bg-neutral-50 flex justify-end gap-2">
          <button onClick={onClose} disabled={busy}
            className="px-4 py-1.5 rounded-lg border border-neutral-300 text-sm hover:bg-neutral-50 disabled:opacity-40">
            Annulla
          </button>
          <button onClick={doMerge} disabled={!target || busy}
            className="px-5 py-1.5 rounded-lg bg-violet-700 text-white text-sm font-semibold hover:bg-violet-800 disabled:opacity-40">
            {busy ? "Merge in corso…" : `Fondi → #${target?.id || "?"}`}
          </button>
        </div>
      </div>
    </div>
  );
}

// Modale dettaglio denominazione con drill-down vini.
function DenominazioneDetailModal({ denominazione: d, onClose }) {
  const madriComplete = d._madri_complete || [];
  const madriIndex = useMemo(
    () => Object.fromEntries(madriComplete.map(m => [m.id, m])),
    [madriComplete]
  );
  const lista = (d.vini_madre && d.vini_madre.length)
    ? d.vini_madre
    : madriComplete.map(m => ({
        id: m.id, descrizione: m.descrizione, tipologia: m.tipologia,
        produttore_nome: m.produttore_nome,
        n_bottiglie: (m.annate || []).length,
        qta_tot: m.qta_tot || 0,
      }));

  const [sort, setSort] = useState({ key: "descrizione", dir: "asc" });
  const sortedLista = useMemo(() => sortRowsLocal(lista, sort.key, sort.dir), [lista, sort]);

  const [openMadreId, setOpenMadreId] = useState(null);
  const openMadre = openMadreId ? madriIndex[openMadreId] : null;

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl max-w-5xl w-full max-h-[92vh] overflow-hidden flex flex-col"
           onClick={e => e.stopPropagation()}>
        <div className="px-5 py-3 border-b border-violet-200 bg-gradient-to-r from-violet-50 to-white flex items-start justify-between gap-3 flex-shrink-0">
          <div className="min-w-0">
            <div className="text-[10px] uppercase tracking-wider text-violet-700">Denominazione #{d.id}{d.codice_eambrosia ? ` · ${d.codice_eambrosia}` : ""}</div>
            <h3 className="text-lg font-semibold font-playfair text-violet-900 truncate">📜 {d.nome} {d.tipo}</h3>
            <p className="text-xs text-neutral-700 mt-0.5">
              {[d.nazione, d.regione, d.source].filter(Boolean).join(" · ") || "—"}
            </p>
          </div>
          <button onClick={onClose}
            className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-neutral-300 hover:bg-neutral-50 flex-shrink-0">
            Chiudi
          </button>
        </div>
        <div className="grid grid-cols-3 gap-2 px-5 py-2 bg-neutral-50 border-b border-neutral-200 text-xs flex-shrink-0">
          <div><span className="text-neutral-500">Vini madre:</span> <strong>{d.n_madre || 0}</strong></div>
          <div><span className="text-neutral-500">Bottiglie:</span> <strong>{d.n_bottiglie || 0}</strong></div>
          <div><span className="text-neutral-500">Giacenza:</span> <strong>{d.qta_bottiglie || 0}</strong></div>
        </div>

        {openMadre && (
          <div className="px-3 py-2 bg-rose-50 border-b border-rose-200 flex items-center gap-2 flex-shrink-0">
            <button onClick={() => setOpenMadreId(null)}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-white border border-neutral-300 hover:bg-neutral-50 shadow-sm">
              ← Vini con {d.nome} {d.tipo}
            </button>
            <span className="text-xs font-bold text-rose-900">🍷 Scheda Vino Madre</span>
          </div>
        )}

        <div className="flex-1 overflow-auto min-h-0 bg-neutral-50">
          {openMadre ? (
            <div className="p-3"><SchedaMadreV2 madre={openMadre} onClose={() => setOpenMadreId(null)} /></div>
          ) : lista.length === 0 ? (
            <div className="p-8 text-center text-sm text-neutral-500">Nessun vino madre con questa denominazione.</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-white text-xs uppercase tracking-wider text-neutral-600 sticky top-0 z-10 border-b border-neutral-200">
                <tr>
                  <th className="px-3 py-2 text-left w-12">ID</th>
                  <SortThLocal label="Descrizione" sortKey="descrizione"     sort={sort} setSort={setSort} />
                  <SortThLocal label="Produttore"  sortKey="produttore_nome" sort={sort} setSort={setSort} />
                  <SortThLocal label="Tipologia"   sortKey="tipologia"       sort={sort} setSort={setSort} />
                  <SortThLocal label="Btg"         sortKey="n_bottiglie"     sort={sort} setSort={setSort} align="right" />
                  <SortThLocal label="Giac."       sortKey="qta_tot"         sort={sort} setSort={setSort} align="right" />
                </tr>
              </thead>
              <tbody>
                {sortedLista.map(m => {
                  const canDrill = !!madriIndex[m.id];
                  return (
                    <tr key={m.id}
                        className={`border-t border-neutral-100 transition ${canDrill ? "cursor-pointer hover:bg-violet-50" : "opacity-60"}`}
                        onClick={() => canDrill && setOpenMadreId(m.id)}
                        title={canDrill ? "Apri scheda vino madre" : "Scheda non disponibile"}>
                      <td className="px-3 py-1.5 font-mono text-[11px] text-neutral-500">{m.id}</td>
                      <td className="px-3 py-1.5 font-semibold text-violet-900 hover:underline">{m.descrizione}</td>
                      <td className="px-3 py-1.5 text-xs text-neutral-700">{m.produttore_nome || <span className="text-neutral-400">—</span>}</td>
                      <td className="px-3 py-1.5 text-xs text-neutral-700">{m.tipologia || "—"}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums">{m.n_bottiglie || 0}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums">{m.qta_tot || 0}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
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

  // Sort colonne (M2.5.2). Arricchiamo ogni riga con `_produttore_nome` per ordinare
  // per nome produttore senza dover andare via FK.
  const [sort, setSort] = useState({ key: "descrizione", dir: "asc" });
  const itemsEnriched = useMemo(
    () => items.map(m => ({ ...m, _produttore_nome: prodById[m.produttore_id]?.nome || "" })),
    [items, prodById]
  );
  const sorted = useMemo(() => sortRowsLocal(itemsEnriched, sort.key, sort.dir), [itemsEnriched, sort]);

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
          <thead className="bg-neutral-50 text-xs uppercase tracking-wider text-neutral-600 sticky top-0 z-10">
            <tr>
              <th className="px-3 py-2 text-left w-12">ID</th>
              <SortThLocal label="Descrizione"   sortKey="descrizione"        sort={sort} setSort={setSort} />
              <SortThLocal label="Produttore"    sortKey="_produttore_nome"   sort={sort} setSort={setSort} />
              <SortThLocal label="Tipologia"     sortKey="tipologia"          sort={sort} setSort={setSort} />
              <SortThLocal label="Denominazione" sortKey="denominazione_id"   sort={sort} setSort={setSort} />
              <th className="px-3 py-2 text-right">Azioni</th>
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={6} className="px-3 py-6 text-center text-neutral-500">Carico…</td></tr>}
            {!loading && sorted.length === 0 && <tr><td colSpan={6} className="px-3 py-6 text-center text-neutral-500">Nessun risultato.</td></tr>}
            {!loading && sorted.map(m => (
              <tr key={m.id} className="border-t border-neutral-100 hover:bg-neutral-50">
                <td className="px-3 py-1.5 font-mono text-xs text-neutral-500">{m.id}</td>
                <td className="px-3 py-1.5 font-semibold">{m.descrizione}</td>
                <td className="px-3 py-1.5 text-xs">{m._produttore_nome || `#${m.produttore_id}`}</td>
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
