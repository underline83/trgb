// Modulo: vini
// src/pages/vini/anagrafiche/ProduttoriPanel.jsx
//
// M2.5.1 (2026-05-16) — Pannello dedicato ai Produttori (anagrafiche).
// Sostituisce la CrudList generica della Fase 6 con UI specializzata:
//   - tabella con conta vini madre / bottiglie / giacenza per produttore
//   - colonne ordinabili (nome / nazione / n.madri / n.bottiglie / giacenza)
//   - ricerca per nome + filtro nazione + checkbox "solo orfani"
//   - modale dettaglio: lista vini madre collegati + edit anagrafica
//   - merge duplicati: seleziono produttore source → cerco target → conferma
//   - eliminazione: protetta se ci sono vini madre collegati (errore 409)
//
// Backend usato:
//   GET    /vini/anagrafiche/produttori/?with_counts=true&search=&nazione=&only_orphans=
//   GET    /vini/anagrafiche/produttori/{id}?with_madri=true
//   POST   /vini/anagrafiche/produttori/                 (admin)
//   PATCH  /vini/anagrafiche/produttori/{id}             (admin) — cascade sync
//   DELETE /vini/anagrafiche/produttori/{id}             (admin) — fallisce se has madri
//   POST   /vini/anagrafiche/produttori/{src}/merge?target_id={dst}  (admin)

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { API_BASE, apiFetch } from "../../../config/api";

// Helper: ordinamento generico stabile su array di oggetti.
function sortRows(rows, key, dir) {
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

function SortTh({ label, sortKey, sort, setSort, className = "", align = "left" }) {
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

export default function ProduttoriPanel() {
  const role = (typeof localStorage !== "undefined" ? localStorage.getItem("role") : "") || "";
  const canEdit = role === "admin" || role === "superadmin" || role === "sommelier";

  // Dati
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Filtri
  const [search, setSearch] = useState("");
  const [nazione, setNazione] = useState("");
  const [onlyOrphans, setOnlyOrphans] = useState(false);

  // Ordinamento (default: nome asc)
  const [sort, setSort] = useState({ key: "nome", dir: "asc" });

  // Modali
  const [editing, setEditing] = useState(null);  // null | "new" | <produttore>
  const [detailOf, setDetailOf] = useState(null); // null | <produttore con vini_madre>
  const [merging, setMerging] = useState(null);   // null | <produttore source>

  const reload = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const params = new URLSearchParams();
      params.set("with_counts", "true");
      if (search) params.set("search", search);
      if (nazione) params.set("nazione", nazione);
      if (onlyOrphans) params.set("only_orphans", "true");
      const r = await apiFetch(`${API_BASE}/vini/anagrafiche/produttori/?${params}`);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      setItems(await r.json());
    } catch (e) {
      setError(String(e.message || e));
    } finally {
      setLoading(false);
    }
  }, [search, nazione, onlyOrphans]);

  useEffect(() => { reload(); }, [reload]);

  // Lista nazioni (dropdown) — derivata dai dati caricati (semplice, no fetch separata)
  const nazioniDisponibili = useMemo(
    () => [...new Set(items.map(i => i.nazione).filter(Boolean))].sort(),
    [items]
  );

  const sorted = useMemo(() => sortRows(items, sort.key, sort.dir), [items, sort]);

  // KPI riassuntivi
  const totN = items.length;
  const totMadre = items.reduce((s, p) => s + (p.n_madre || 0), 0);
  const totBottiglie = items.reduce((s, p) => s + (p.n_bottiglie || 0), 0);
  const totQta = items.reduce((s, p) => s + (p.qta_bottiglie || 0), 0);
  const nOrfani = items.filter(p => (p.n_madre || 0) === 0).length;

  return (
    <div className="space-y-3">
      {/* Toolbar filtri */}
      <div className="flex items-center gap-2 flex-wrap p-3 bg-amber-50 border border-amber-200 rounded-lg">
        <input
          type="text"
          placeholder="Cerca produttore per nome…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="flex-1 min-w-[200px] px-3 py-1.5 rounded-lg border border-amber-300 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-amber-300"
        />
        <select value={nazione} onChange={e => setNazione(e.target.value)}
          className="px-3 py-1.5 rounded-lg border border-amber-300 text-sm bg-white">
          <option value="">Tutte le nazioni</option>
          {nazioniDisponibili.map(n => <option key={n} value={n}>{n}</option>)}
        </select>
        <label className="flex items-center gap-1.5 text-xs text-amber-900 bg-white border border-amber-300 rounded-lg px-2 py-1.5 cursor-pointer">
          <input type="checkbox" checked={onlyOrphans} onChange={e => setOnlyOrphans(e.target.checked)} />
          Solo orfani (0 vini)
        </label>
        {canEdit && (
          <button onClick={() => setEditing("new")}
            className="px-4 py-1.5 rounded-lg bg-amber-700 text-white text-sm font-semibold hover:bg-amber-800 shadow-sm">
            + Nuovo produttore
          </button>
        )}
      </div>

      {/* Riepilogo KPI */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-2 text-xs">
        <div className="bg-white border border-neutral-200 rounded-lg p-2">
          <div className="text-[10px] text-neutral-500 uppercase tracking-wide">Produttori</div>
          <div className="text-lg font-bold text-neutral-900">{totN}</div>
        </div>
        <div className="bg-white border border-neutral-200 rounded-lg p-2">
          <div className="text-[10px] text-neutral-500 uppercase tracking-wide">Vini madre</div>
          <div className="text-lg font-bold text-neutral-900">{totMadre}</div>
        </div>
        <div className="bg-white border border-neutral-200 rounded-lg p-2">
          <div className="text-[10px] text-neutral-500 uppercase tracking-wide">Bottiglie (annate)</div>
          <div className="text-lg font-bold text-neutral-900">{totBottiglie}</div>
        </div>
        <div className="bg-white border border-neutral-200 rounded-lg p-2">
          <div className="text-[10px] text-neutral-500 uppercase tracking-wide">Giacenza tot.</div>
          <div className="text-lg font-bold text-neutral-900">{totQta}</div>
        </div>
        <div className="bg-rose-50 border border-rose-200 rounded-lg p-2">
          <div className="text-[10px] text-rose-700 uppercase tracking-wide">Orfani (0 vini)</div>
          <div className="text-lg font-bold text-rose-900">{nOrfani}</div>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-2 text-sm text-red-700">{error}</div>
      )}

      {/* Tabella */}
      <div className="border border-neutral-200 rounded-xl overflow-hidden">
        <div className="max-h-[60vh] overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="bg-neutral-50 text-xs uppercase tracking-wider text-neutral-600 sticky top-0 z-10">
              <tr>
                <th className="px-3 py-2 text-left w-12">ID</th>
                <SortTh label="Nome"    sortKey="nome"          sort={sort} setSort={setSort} />
                <SortTh label="Nazione" sortKey="nazione"       sort={sort} setSort={setSort} />
                <SortTh label="Regione" sortKey="regione"       sort={sort} setSort={setSort} />
                <SortTh label="Madri"   sortKey="n_madre"       sort={sort} setSort={setSort} align="right" />
                <SortTh label="Btg"     sortKey="n_bottiglie"   sort={sort} setSort={setSort} align="right" />
                <SortTh label="Giac."   sortKey="qta_bottiglie" sort={sort} setSort={setSort} align="right" />
                <th className="px-3 py-2 text-right">Azioni</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr><td colSpan={8} className="px-3 py-8 text-center text-neutral-500">Carico…</td></tr>
              )}
              {!loading && sorted.length === 0 && (
                <tr><td colSpan={8} className="px-3 py-8 text-center text-neutral-500">Nessun risultato.</td></tr>
              )}
              {!loading && sorted.map(p => {
                const isOrfano = (p.n_madre || 0) === 0;
                return (
                  <tr key={p.id}
                      className={`border-t border-neutral-100 hover:bg-amber-50/50 cursor-pointer transition ${isOrfano ? "bg-rose-50/30" : ""}`}
                      onClick={() => openDetail(p.id)}>
                    <td className="px-3 py-1.5 font-mono text-[11px] text-neutral-500">{p.id}</td>
                    <td className="px-3 py-1.5 font-semibold text-neutral-900">{p.nome}</td>
                    <td className="px-3 py-1.5 text-neutral-700">{p.nazione || <span className="text-neutral-400">—</span>}</td>
                    <td className="px-3 py-1.5 text-neutral-700">{p.regione || <span className="text-neutral-400">—</span>}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums font-medium">{p.n_madre || 0}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums">{p.n_bottiglie || 0}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums">{p.qta_bottiglie || 0}</td>
                    <td className="px-3 py-1.5 text-right whitespace-nowrap" onClick={e => e.stopPropagation()}>
                      {canEdit && (
                        <>
                          <button onClick={() => setEditing(p)}
                            className="px-2 py-1 text-xs rounded border border-neutral-300 hover:bg-neutral-100 mr-1"
                            title="Modifica anagrafica">✏️</button>
                          <button onClick={() => setMerging(p)}
                            className="px-2 py-1 text-xs rounded border border-amber-400 text-amber-800 hover:bg-amber-50 mr-1"
                            title="Fondi in un altro produttore (duplicati)">🔀</button>
                          <button onClick={() => handleDelete(p)}
                            className="px-2 py-1 text-xs rounded border border-red-300 text-red-700 hover:bg-red-50"
                            disabled={!isOrfano}
                            title={isOrfano ? "Elimina (nessun vino collegato)" : `Bloccato: ${p.n_madre} vini madre collegati`}>🗑</button>
                        </>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* MODALE DETTAGLIO */}
      {detailOf && (
        <ProduttoreDetailModal
          produttore={detailOf}
          onClose={() => setDetailOf(null)}
          onEdit={() => { setEditing(detailOf); setDetailOf(null); }}
        />
      )}

      {/* MODALE EDIT / NUOVO */}
      {editing && canEdit && (
        <ProduttoreEditModal
          item={editing === "new" ? {} : editing}
          isNew={editing === "new"}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); reload(); }}
        />
      )}

      {/* MODALE MERGE */}
      {merging && canEdit && (
        <MergeProduttoriModal
          source={merging}
          candidates={items.filter(p => p.id !== merging.id)}
          onClose={() => setMerging(null)}
          onDone={() => { setMerging(null); reload(); }}
        />
      )}
    </div>
  );

  // ---- helpers locali (chiusi sul componente) ----
  async function openDetail(pid) {
    try {
      const r = await apiFetch(`${API_BASE}/vini/anagrafiche/produttori/${pid}?with_madri=true`);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      setDetailOf(await r.json());
    } catch (e) {
      alert(`Errore caricamento dettaglio: ${e.message}`);
    }
  }

  async function handleDelete(p) {
    if (!window.confirm(`Eliminare il produttore "${p.nome}"?\nOperazione irreversibile.`)) return;
    try {
      const r = await apiFetch(`${API_BASE}/vini/anagrafiche/produttori/${p.id}`, { method: "DELETE" });
      if (!r.ok) {
        const err = await r.json().catch(() => ({ detail: r.statusText }));
        throw new Error(err.detail || `HTTP ${r.status}`);
      }
      reload();
    } catch (e) {
      alert(e.message);
    }
  }
}


// ════════════════════════════════════════════════════════════════
// MODALE DETTAGLIO PRODUTTORE — con lista vini madre collegati
// ════════════════════════════════════════════════════════════════
function ProduttoreDetailModal({ produttore: p, onClose, onEdit }) {
  const vini = p.vini_madre || [];
  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl max-w-3xl w-full max-h-[85vh] overflow-hidden flex flex-col"
           onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="px-5 py-3 border-b border-amber-200 bg-gradient-to-r from-amber-50 to-white flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[10px] uppercase tracking-wider text-amber-700">Produttore #{p.id}</div>
            <h3 className="text-lg font-semibold font-playfair text-amber-900 truncate">🏛️ {p.nome}</h3>
            <p className="text-xs text-neutral-700 mt-0.5">
              {[p.citta, p.provincia, p.regione, p.nazione].filter(Boolean).join(" · ") || "—"}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={onEdit}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-amber-700 text-white hover:bg-amber-800">
              ✏️ Modifica
            </button>
            <button onClick={onClose}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-neutral-300 hover:bg-neutral-50">
              Chiudi
            </button>
          </div>
        </div>

        {/* KPI */}
        <div className="grid grid-cols-3 gap-2 px-5 py-3 bg-neutral-50 border-b border-neutral-200 text-xs">
          <div><span className="text-neutral-500">Vini madre:</span> <strong>{p.n_madre || 0}</strong></div>
          <div><span className="text-neutral-500">Bottiglie:</span> <strong>{p.n_bottiglie || 0}</strong></div>
          <div><span className="text-neutral-500">Giacenza:</span> <strong>{p.qta_bottiglie || 0}</strong></div>
        </div>

        {/* Note */}
        {p.note && (
          <div className="px-5 py-2 border-b border-neutral-200 text-xs text-neutral-700 italic bg-amber-50/40">
            {p.note}
          </div>
        )}

        {/* Lista vini madre */}
        <div className="flex-1 overflow-auto">
          {vini.length === 0 ? (
            <div className="p-8 text-center text-sm text-neutral-500">
              Nessun vino madre collegato a questo produttore.
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-neutral-50 text-xs uppercase tracking-wider text-neutral-600 sticky top-0">
                <tr>
                  <th className="px-3 py-2 text-left">ID</th>
                  <th className="px-3 py-2 text-left">Descrizione</th>
                  <th className="px-3 py-2 text-left">Tipologia</th>
                  <th className="px-3 py-2 text-left">Denominazione</th>
                  <th className="px-3 py-2 text-right">Btg</th>
                  <th className="px-3 py-2 text-right">Giac.</th>
                </tr>
              </thead>
              <tbody>
                {vini.map(m => (
                  <tr key={m.id} className="border-t border-neutral-100 hover:bg-neutral-50">
                    <td className="px-3 py-1.5 font-mono text-[11px] text-neutral-500">{m.id}</td>
                    <td className="px-3 py-1.5 font-semibold">{m.descrizione}</td>
                    <td className="px-3 py-1.5 text-xs text-neutral-700">{m.tipologia || "—"}</td>
                    <td className="px-3 py-1.5 text-xs text-neutral-700">{m.denominazione_display || <span className="text-neutral-400">—</span>}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums">{m.n_bottiglie}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums">{m.qta_tot}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}


// ════════════════════════════════════════════════════════════════
// MODALE EDIT / NUOVO PRODUTTORE
// ════════════════════════════════════════════════════════════════
const PRODUTTORE_FIELDS = [
  { key: "nome",      label: "Nome",      required: true,  placeholder: "es. Marchesi di Barolo" },
  { key: "nazione",   label: "Nazione",   required: true,  placeholder: "Italia / Francia / …" },
  { key: "regione",   label: "Regione",   placeholder: "es. Piemonte" },
  { key: "provincia", label: "Provincia", placeholder: "es. CN" },
  { key: "citta",     label: "Città",     placeholder: "es. Barolo" },
  { key: "note",      label: "Note",      type: "textarea" },
];

function ProduttoreEditModal({ item, isNew, onClose, onSaved }) {
  const [form, setForm] = useState(() => {
    const init = {};
    PRODUTTORE_FIELDS.forEach(f => { init[f.key] = item[f.key] ?? ""; });
    return init;
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const save = async () => {
    setError("");
    for (const f of PRODUTTORE_FIELDS) {
      if (f.required && !String(form[f.key] || "").trim()) {
        setError(`Campo obbligatorio: ${f.label}`); return;
      }
    }
    const payload = {};
    PRODUTTORE_FIELDS.forEach(f => {
      const v = form[f.key];
      if (v !== "" && v != null) payload[f.key] = v;
    });
    setSaving(true);
    try {
      const url = `${API_BASE}/vini/anagrafiche/produttori/${isNew ? "" : item.id}`;
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
      <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full p-5" onClick={e => e.stopPropagation()}>
        <h3 className="text-base font-bold mb-4 text-neutral-900">
          {isNew ? "🆕 Nuovo produttore" : `✏️ Modifica produttore #${item.id}`}
        </h3>
        <div className="space-y-3">
          {PRODUTTORE_FIELDS.map(f => (
            <div key={f.key}>
              <label className="block text-xs font-semibold text-neutral-700 mb-1">
                {f.label}{f.required && <span className="text-red-500"> *</span>}
              </label>
              {f.type === "textarea" ? (
                <textarea rows={3} value={form[f.key] ?? ""}
                  onChange={e => setForm(p => ({ ...p, [f.key]: e.target.value }))}
                  className="w-full px-3 py-1.5 rounded-lg border border-neutral-300 text-sm focus:outline-none focus:ring-2 focus:ring-amber-300" />
              ) : (
                <input type="text" value={form[f.key] ?? ""}
                  onChange={e => setForm(p => ({ ...p, [f.key]: e.target.value }))}
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
          <button onClick={save} disabled={saving}
            className="px-5 py-1.5 rounded-lg bg-amber-700 text-white text-sm font-semibold hover:bg-amber-800 disabled:opacity-40">
            {saving ? "Salvo…" : (isNew ? "Crea" : "Salva")}
          </button>
        </div>
      </div>
    </div>
  );
}


// ════════════════════════════════════════════════════════════════
// MODALE MERGE — fondi due produttori duplicati
// ════════════════════════════════════════════════════════════════
function MergeProduttoriModal({ source, candidates, onClose, onDone }) {
  const [search, setSearch] = useState("");
  const [targetId, setTargetId] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const arr = q ? candidates.filter(c => (c.nome || "").toLowerCase().includes(q)) : candidates;
    return arr.slice(0, 50);
  }, [search, candidates]);

  const target = candidates.find(c => c.id === targetId) || null;

  const doMerge = async () => {
    if (!target) return;
    if (!window.confirm(
      `Confermare il merge?\n\n` +
      `SORGENTE: #${source.id} ${source.nome} (${source.n_madre || 0} vini madre)\n` +
      `DESTINAZIONE: #${target.id} ${target.nome}\n\n` +
      `Tutti i vini madre della sorgente verranno spostati nella destinazione. ` +
      `Il produttore sorgente verrà ELIMINATO. Operazione irreversibile.`
    )) return;
    setBusy(true); setError("");
    try {
      const url = `${API_BASE}/vini/anagrafiche/produttori/${source.id}/merge?target_id=${target.id}`;
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
      <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[85vh] overflow-hidden flex flex-col"
           onClick={e => e.stopPropagation()}>
        <div className="px-5 py-3 border-b border-amber-200 bg-gradient-to-r from-amber-50 to-white">
          <h3 className="text-base font-bold text-amber-900">🔀 Fondi produttore</h3>
          <p className="text-xs text-neutral-600 mt-1">
            Sposta tutti i vini madre della sorgente nella destinazione, poi elimina la sorgente.
            Usalo quando hai due produttori duplicati (es. "CAMPERCHI" e "Camperchi").
          </p>
        </div>

        <div className="px-5 py-3 grid grid-cols-2 gap-3 border-b border-neutral-200 bg-neutral-50">
          <div>
            <div className="text-[10px] uppercase tracking-wider text-rose-700 font-semibold">Sorgente (sarà eliminata)</div>
            <div className="text-sm font-bold text-neutral-900">#{source.id} {source.nome}</div>
            <div className="text-xs text-neutral-600 mt-0.5">
              {[source.nazione, source.regione].filter(Boolean).join(" · ") || "—"} · <strong>{source.n_madre || 0}</strong> vini madre
            </div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wider text-emerald-700 font-semibold">Destinazione</div>
            {target ? (
              <>
                <div className="text-sm font-bold text-neutral-900">#{target.id} {target.nome}</div>
                <div className="text-xs text-neutral-600 mt-0.5">
                  {[target.nazione, target.regione].filter(Boolean).join(" · ") || "—"} · <strong>{target.n_madre || 0}</strong> vini madre
                </div>
              </>
            ) : (
              <div className="text-sm text-neutral-400 italic">— seleziona dalla lista —</div>
            )}
          </div>
        </div>

        <div className="px-5 py-2 border-b border-neutral-200">
          <input type="text" placeholder="Cerca destinazione…"
            value={search} onChange={e => setSearch(e.target.value)}
            className="w-full px-3 py-1.5 rounded-lg border border-neutral-300 text-sm focus:outline-none focus:ring-2 focus:ring-amber-300" />
        </div>

        <div className="flex-1 overflow-auto">
          <table className="w-full text-sm">
            <thead className="bg-neutral-50 text-[10px] uppercase tracking-wider text-neutral-600 sticky top-0">
              <tr>
                <th className="px-3 py-1.5 text-left w-10"></th>
                <th className="px-3 py-1.5 text-left w-12">ID</th>
                <th className="px-3 py-1.5 text-left">Nome</th>
                <th className="px-3 py-1.5 text-left">Naz/Reg</th>
                <th className="px-3 py-1.5 text-right">Madri</th>
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
                  <td className="px-3 py-1 font-semibold">{c.nome}</td>
                  <td className="px-3 py-1 text-xs text-neutral-600">{[c.nazione, c.regione].filter(Boolean).join(" · ") || "—"}</td>
                  <td className="px-3 py-1 text-right tabular-nums">{c.n_madre || 0}</td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={5} className="px-3 py-6 text-center text-neutral-500 text-xs">Nessun candidato. Affina la ricerca.</td></tr>
              )}
            </tbody>
          </table>
        </div>

        {error && (
          <div className="px-5 py-2 text-xs text-red-700 bg-red-50 border-t border-red-200">{error}</div>
        )}

        <div className="px-5 py-3 border-t border-neutral-200 bg-neutral-50 flex justify-end gap-2">
          <button onClick={onClose} disabled={busy}
            className="px-4 py-1.5 rounded-lg border border-neutral-300 text-sm hover:bg-neutral-50 disabled:opacity-40">
            Annulla
          </button>
          <button onClick={doMerge} disabled={!target || busy}
            className="px-5 py-1.5 rounded-lg bg-amber-700 text-white text-sm font-semibold hover:bg-amber-800 disabled:opacity-40">
            {busy ? "Merge in corso…" : `Fondi → #${target?.id || "?"}`}
          </button>
        </div>
      </div>
    </div>
  );
}
