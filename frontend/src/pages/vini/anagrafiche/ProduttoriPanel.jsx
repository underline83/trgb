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
import SchedaMadreV2 from "../../../components/vini/SchedaMadreV2";
// M2.5.5: helper condivisi (sortRows + SortTh) e componente Merge generico.
import { sortRows, SortTh } from "../../../utils/vini/sortableTable";
import MergeAnagraficaModal from "../../../components/vini/MergeAnagraficaModal";
// M2.8: primitive M.I (palette amber unificata per tutto il modulo Vini).
import { Btn, Card, Modal, FieldLabel, TextInput, Select, Textarea } from "../../../components/ui";

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
      <Card tone="amber" radius="2xl" padding="sm">
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex-1 min-w-[200px]">
            <TextInput value={search} onChange={setSearch} placeholder="Cerca produttore per nome…" />
          </div>
          <Select value={nazione} onChange={setNazione}
            options={nazioniDisponibili}
            placeholder="Tutte le nazioni" />
          <label className="flex items-center gap-1.5 text-xs text-amber-900 bg-white border border-amber-300 rounded-lg px-2 py-1.5 cursor-pointer">
            <input type="checkbox" checked={onlyOrphans} onChange={e => setOnlyOrphans(e.target.checked)} />
            Solo orfani (0 vini)
          </label>
          {canEdit && (
            <Btn variant="warning" size="sm" onClick={() => setEditing("new")}>
              + Nuovo produttore
            </Btn>
          )}
        </div>
      </Card>

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
        <MergeAnagraficaModal
          kind="produttori"
          palette="amber"
          source={merging}
          candidates={items.filter(p => p.id !== merging.id)}
          countField="n_madre"
          countLabel="vini madre"
          reportField="n_madre_spostati"
          reportLabel="vini madre spostati"
          renderSubtitle={c => [c.nazione, c.regione].filter(Boolean).join(" · ") || "—"}
          onClose={() => setMerging(null)}
          onDone={() => { setMerging(null); reload(); }}
        />
      )}
    </div>
  );

  // ---- helpers locali (chiusi sul componente) ----
  async function openDetail(pid) {
    try {
      // 2 fetch in parallelo: dettaglio (con counts + lista madri sintetica)
      // + lista madri raggruppate con annate per il drill-down (click vino → SchedaMadreV2)
      const [rDet, rMadri] = await Promise.all([
        apiFetch(`${API_BASE}/vini/anagrafiche/produttori/${pid}?with_madri=true`),
        apiFetch(`${API_BASE}/vini/v2/madri-raggruppate/?produttore_id=${pid}`),
      ]);
      if (!rDet.ok) throw new Error(`HTTP ${rDet.status} (dettaglio)`);
      const det = await rDet.json();
      const madriComplete = rMadri.ok ? await rMadri.json() : [];
      // Index per id: la SchedaMadreV2 vuole l'oggetto completo (con annate, denominazione_display, ecc.)
      det._madri_complete = madriComplete;
      setDetailOf(det);
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
// MODALE DETTAGLIO PRODUTTORE — 2 viste:
//   (a) lista vini madre collegati (default)
//   (b) scheda madre del vino selezionato (drill-down inline)
// ════════════════════════════════════════════════════════════════
function ProduttoreDetailModal({ produttore: p, onClose, onEdit }) {
  // Vini "completi" da v2 madri-raggruppate (con annate per la SchedaMadreV2).
  // Fallback alla lista sintetica se l'altra fetch è fallita.
  const madriComplete = p._madri_complete || [];
  const madriIndex = useMemo(
    () => Object.fromEntries(madriComplete.map(m => [m.id, m])),
    [madriComplete]
  );
  const lista = (p.vini_madre && p.vini_madre.length)
    ? p.vini_madre
    : madriComplete.map(m => ({
        id: m.id, descrizione: m.descrizione, tipologia: m.tipologia,
        denominazione_display: m.denominazione_display,
        n_bottiglie: (m.annate || []).length,
        qta_tot: m.qta_tot || 0,
      }));

  // Sort lista vini interna al modale
  const [sort, setSort] = useState({ key: "descrizione", dir: "asc" });
  const sortedLista = useMemo(() => sortRows(lista, sort.key, sort.dir), [lista, sort]);

  const [openMadreId, setOpenMadreId] = useState(null);
  const openMadre = openMadreId ? madriIndex[openMadreId] : null;

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-3xl shadow-2xl max-w-5xl w-full max-h-[92vh] overflow-hidden flex flex-col"
           onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="px-5 py-3 border-b border-amber-200 bg-gradient-to-r from-amber-50 to-white flex items-start justify-between gap-3 flex-shrink-0">
          <div className="min-w-0">
            <div className="text-[10px] uppercase tracking-wider text-amber-700">Produttore #{p.id}</div>
            <h3 className="text-lg font-semibold font-playfair text-amber-900 truncate">🏛️ {p.nome}</h3>
            <p className="text-xs text-neutral-700 mt-0.5">
              {[p.citta, p.provincia, p.regione, p.nazione].filter(Boolean).join(" · ") || "—"}
            </p>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {!openMadre && (
              <Btn variant="warning" size="sm" onClick={onEdit}>✏️ Modifica</Btn>
            )}
            <Btn variant="secondary" size="sm" onClick={onClose}>Chiudi</Btn>
          </div>
        </div>

        {/* KPI */}
        <div className="grid grid-cols-3 gap-2 px-5 py-2 bg-neutral-50 border-b border-neutral-200 text-xs flex-shrink-0">
          <div><span className="text-neutral-500">Vini madre:</span> <strong>{p.n_madre || 0}</strong></div>
          <div><span className="text-neutral-500">Bottiglie:</span> <strong>{p.n_bottiglie || 0}</strong></div>
          <div><span className="text-neutral-500">Giacenza:</span> <strong>{p.qta_bottiglie || 0}</strong></div>
        </div>

        {/* Note (solo se lista) */}
        {p.note && !openMadre && (
          <div className="px-5 py-2 border-b border-neutral-200 text-xs text-neutral-700 italic bg-amber-50/40 flex-shrink-0">
            {p.note}
          </div>
        )}

        {/* Toolbar drill-down (visibile se vino aperto) */}
        {openMadre && (
          <div className="px-3 py-2 bg-amber-50 border-b border-amber-200 flex items-center gap-2 flex-shrink-0">
            <Btn variant="secondary" size="sm" onClick={() => setOpenMadreId(null)}>
              ← Lista vini di {p.nome}
            </Btn>
            <span className="text-xs font-bold text-amber-900">🍷 Scheda Vino Madre</span>
          </div>
        )}

        {/* Contenuto: lista vini OPPURE scheda madre */}
        <div className="flex-1 overflow-auto min-h-0 bg-neutral-50">
          {openMadre ? (
            <div className="p-3">
              <SchedaMadreV2 madre={openMadre} onClose={() => setOpenMadreId(null)} />
            </div>
          ) : lista.length === 0 ? (
            <div className="p-8 text-center text-sm text-neutral-500">
              Nessun vino madre collegato a questo produttore.
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-white text-xs uppercase tracking-wider text-neutral-600 sticky top-0 z-10 border-b border-neutral-200">
                <tr>
                  <th className="px-3 py-2 text-left w-12">ID</th>
                  <SortTh label="Descrizione"   sortKey="descrizione"          sort={sort} setSort={setSort} />
                  <SortTh label="Tipologia"     sortKey="tipologia"            sort={sort} setSort={setSort} />
                  <SortTh label="Denominazione" sortKey="denominazione_display" sort={sort} setSort={setSort} />
                  <SortTh label="Btg"           sortKey="n_bottiglie"          sort={sort} setSort={setSort} align="right" />
                  <SortTh label="Giac."         sortKey="qta_tot"              sort={sort} setSort={setSort} align="right" />
                </tr>
              </thead>
              <tbody>
                {sortedLista.map(m => {
                  const canDrill = !!madriIndex[m.id];
                  return (
                    <tr key={m.id}
                        className={`border-t border-neutral-100 transition ${canDrill ? "cursor-pointer hover:bg-amber-50" : "opacity-60"}`}
                        onClick={() => canDrill && setOpenMadreId(m.id)}
                        title={canDrill ? "Apri scheda vino madre" : "Scheda non disponibile (dati v2 mancanti)"}>
                      <td className="px-3 py-1.5 font-mono text-[11px] text-neutral-500">{m.id}</td>
                      <td className="px-3 py-1.5 font-semibold text-amber-900 hover:underline">{m.descrizione}</td>
                      <td className="px-3 py-1.5 text-xs text-neutral-700">{m.tipologia || "—"}</td>
                      <td className="px-3 py-1.5 text-xs text-neutral-700">{m.denominazione_display || <span className="text-neutral-400">—</span>}</td>
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
    <Modal
      open={true}
      onClose={onClose}
      title={isNew ? "🆕 Nuovo produttore" : `✏️ Modifica produttore #${item.id}`}
      tone="amber"
      size="md"
      footer={
        <>
          <Btn variant="secondary" size="md" onClick={onClose}>Annulla</Btn>
          <Btn variant="warning" size="md" onClick={save} loading={saving}>
            {saving ? "Salvo…" : (isNew ? "Crea" : "Salva")}
          </Btn>
        </>
      }
    >
      <div className="space-y-3">
        {PRODUTTORE_FIELDS.map(f => (
          <FieldLabel key={f.key} label={f.label} required={f.required}>
            {f.type === "textarea" ? (
              <Textarea rows={3} value={form[f.key]} onChange={v => setForm(p => ({ ...p, [f.key]: v }))} />
            ) : (
              <TextInput value={form[f.key]} onChange={v => setForm(p => ({ ...p, [f.key]: v }))} placeholder={f.placeholder} />
            )}
          </FieldLabel>
        ))}
      </div>
      {error && <div className="mt-3 text-xs text-red-700 bg-red-50 border border-red-200 rounded p-2">{error}</div>}
    </Modal>
  );
}


// M2.5.5: MergeProduttoriModal sostituito da MergeAnagraficaModal generico
// (vedi components/vini/MergeAnagraficaModal.jsx).
