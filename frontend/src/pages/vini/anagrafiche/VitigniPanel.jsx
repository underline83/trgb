// Modulo: vini
// src/pages/vini/anagrafiche/VitigniPanel.jsx
//
// M2.5.4 (2026-05-16) — Pannello dedicato ai Vitigni.
// I vitigni hanno solo {nome, note} ma sono usati dalle bottiglie tramite 5 slot
// denormalizzati (vitigno_1_id..vitigno_5_id) con percentuale. Counts e merge
// considerano tutti gli slot.
//
// Backend:
//   GET    /vini/anagrafiche/vitigni/?with_counts=true&search=&only_orphans=
//   GET    /vini/anagrafiche/vitigni/{id}?with_madri=true
//   POST   /vini/anagrafiche/vitigni/                  (admin)
//   PATCH  /vini/anagrafiche/vitigni/{id}              (admin)
//   DELETE /vini/anagrafiche/vitigni/{id}              (admin) — bloccato se usato
//   POST   /vini/anagrafiche/vitigni/{src}/merge?target_id={dst}  (admin)

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { API_BASE, apiFetch } from "../../../config/api";
// M2.5.5: helper condivisi.
import { sortRows, SortTh } from "../../../utils/vini/sortableTable";
import MergeAnagraficaModal from "../../../components/vini/MergeAnagraficaModal";
// M2.8: primitive M.I. Palette amber (modulo Vini), no più emerald per entità.
import { Btn, Card, Modal, FieldLabel, TextInput, Textarea } from "../../../components/ui";

export default function VitigniPanel() {
  const role = (typeof localStorage !== "undefined" ? localStorage.getItem("role") : "") || "";
  const canEdit = role === "admin" || role === "superadmin" || role === "sommelier";

  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [search, setSearch] = useState("");
  const [onlyOrphans, setOnlyOrphans] = useState(false);
  const [sort, setSort] = useState({ key: "nome", dir: "asc" });

  const [editing, setEditing] = useState(null);
  const [detailOf, setDetailOf] = useState(null);
  const [merging, setMerging] = useState(null);

  const reload = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const params = new URLSearchParams();
      params.set("with_counts", "true");
      if (search) params.set("search", search);
      if (onlyOrphans) params.set("only_orphans", "true");
      const r = await apiFetch(`${API_BASE}/vini/anagrafiche/vitigni/?${params}`);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      setItems(await r.json());
    } catch (e) {
      setError(String(e.message || e));
    } finally {
      setLoading(false);
    }
  }, [search, onlyOrphans]);

  useEffect(() => { reload(); }, [reload]);

  const sorted = useMemo(() => sortRows(items, sort.key, sort.dir), [items, sort]);

  const totN = items.length;
  const totMadre = items.reduce((s, v) => s + (v.n_madre || 0), 0);
  const totBottiglie = items.reduce((s, v) => s + (v.n_bottiglie || 0), 0);
  const nOrfani = items.filter(v => (v.n_bottiglie || 0) === 0).length;

  async function openDetail(vid) {
    try {
      const rDet = await apiFetch(`${API_BASE}/vini/anagrafiche/vitigni/${vid}?with_madri=true`);
      if (!rDet.ok) throw new Error(`HTTP ${rDet.status}`);
      const det = await rDet.json();
      // Per il drill-down vino sulla SchedaMadreV2 servono le annate (madri-raggruppate non
      // filtra per vitigno_id). Per ora apriamo solo la lista madri sintetica — il drill-down
      // sul singolo vino è disponibile via /vini/v2/cantina classico.
      det._madri_complete = [];
      setDetailOf(det);
    } catch (e) {
      alert(`Errore caricamento dettaglio: ${e.message}`);
    }
  }

  async function handleDelete(v) {
    if (!window.confirm(`Eliminare il vitigno "${v.nome}"?\nOperazione irreversibile.`)) return;
    try {
      const r = await apiFetch(`${API_BASE}/vini/anagrafiche/vitigni/${v.id}`, { method: "DELETE" });
      if (!r.ok) {
        const err = await r.json().catch(() => ({ detail: r.statusText }));
        throw new Error(err.detail || `HTTP ${r.status}`);
      }
      reload();
    } catch (e) {
      alert(e.message);
    }
  }

  return (
    <div className="space-y-3">
      {/* Toolbar */}
      <Card tone="amber" radius="2xl" padding="sm">
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex-1 min-w-[200px]">
            <TextInput value={search} onChange={setSearch} placeholder="Cerca vitigno per nome…" />
          </div>
          <label className="flex items-center gap-1.5 text-xs text-amber-900 bg-white border border-amber-300 rounded-lg px-2 py-1.5 cursor-pointer">
            <input type="checkbox" checked={onlyOrphans} onChange={e => setOnlyOrphans(e.target.checked)} />
            Solo orfani (0 bottiglie)
          </label>
          {canEdit && (
            <Btn variant="warning" size="sm" onClick={() => setEditing("new")}>
              + Nuovo vitigno
            </Btn>
          )}
        </div>
      </Card>

      {/* KPI */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
        <div className="bg-white border border-neutral-200 rounded-lg p-2">
          <div className="text-[10px] text-neutral-500 uppercase tracking-wide">Vitigni</div>
          <div className="text-lg font-bold text-neutral-900">{totN}</div>
        </div>
        <div className="bg-white border border-neutral-200 rounded-lg p-2">
          <div className="text-[10px] text-neutral-500 uppercase tracking-wide">Vini madre (totali con vitigno)</div>
          <div className="text-lg font-bold text-neutral-900">{totMadre}</div>
        </div>
        <div className="bg-white border border-neutral-200 rounded-lg p-2">
          <div className="text-[10px] text-neutral-500 uppercase tracking-wide">Bottiglie (annate)</div>
          <div className="text-lg font-bold text-neutral-900">{totBottiglie}</div>
        </div>
        <div className="bg-rose-50 border border-rose-200 rounded-lg p-2">
          <div className="text-[10px] text-rose-700 uppercase tracking-wide">Orfani (0 bottiglie)</div>
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
                <SortTh label="Nome"  sortKey="nome"          sort={sort} setSort={setSort} />
                <SortTh label="Note"  sortKey="note"          sort={sort} setSort={setSort} />
                <SortTh label="Madri" sortKey="n_madre"       sort={sort} setSort={setSort} align="right" />
                <SortTh label="Btg"   sortKey="n_bottiglie"   sort={sort} setSort={setSort} align="right" />
                <SortTh label="Giac." sortKey="qta_bottiglie" sort={sort} setSort={setSort} align="right" />
                {canEdit && <th className="px-3 py-2 text-right">Azioni</th>}
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr><td colSpan={canEdit ? 7 : 6} className="px-3 py-8 text-center text-neutral-500">Carico…</td></tr>
              )}
              {!loading && sorted.length === 0 && (
                <tr><td colSpan={canEdit ? 7 : 6} className="px-3 py-8 text-center text-neutral-500">Nessun risultato.</td></tr>
              )}
              {!loading && sorted.map(v => {
                const isOrfano = (v.n_bottiglie || 0) === 0;
                return (
                  <tr key={v.id}
                      className={`border-t border-neutral-100 hover:bg-amber-50/50 cursor-pointer transition ${isOrfano ? "bg-rose-50/30" : ""}`}
                      onClick={() => openDetail(v.id)}>
                    <td className="px-3 py-1.5 font-mono text-[11px] text-neutral-500">{v.id}</td>
                    <td className="px-3 py-1.5 font-semibold text-amber-900 hover:underline">{v.nome}</td>
                    <td className="px-3 py-1.5 text-xs text-neutral-600 truncate max-w-[300px]" title={v.note || ""}>{v.note || <span className="text-neutral-400">—</span>}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums font-medium">{v.n_madre || 0}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums">{v.n_bottiglie || 0}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums">{v.qta_bottiglie || 0}</td>
                    {canEdit && (
                      <td className="px-3 py-1.5 text-right whitespace-nowrap" onClick={e => e.stopPropagation()}>
                        <button onClick={() => setEditing(v)}
                          className="px-2 py-1 text-xs rounded border border-neutral-300 hover:bg-neutral-100 mr-1"
                          title="Modifica vitigno">✏️</button>
                        <button onClick={() => setMerging(v)}
                          className="px-2 py-1 text-xs rounded border border-amber-400 text-amber-800 hover:bg-amber-50 mr-1"
                          title="Fondi in un altro vitigno (duplicati)">🔀</button>
                        <button onClick={() => handleDelete(v)}
                          className="px-2 py-1 text-xs rounded border border-red-300 text-red-700 hover:bg-red-50"
                          disabled={!isOrfano}
                          title={isOrfano ? "Elimina (nessuna bottiglia collegata)" : `Bloccato: ${v.n_bottiglie} bottiglie lo usano`}>🗑</button>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {detailOf && (
        <VitignoDetailModal vitigno={detailOf} onClose={() => setDetailOf(null)}
          onEdit={() => { setEditing(detailOf); setDetailOf(null); }} />
      )}
      {editing && canEdit && (
        <VitignoEditModal item={editing === "new" ? {} : editing} isNew={editing === "new"}
          onClose={() => setEditing(null)} onSaved={() => { setEditing(null); reload(); }} />
      )}
      {merging && canEdit && (
        <MergeAnagraficaModal
          kind="vitigni"
          palette="amber"
          source={merging}
          candidates={items.filter(v => v.id !== merging.id)}
          countField="n_bottiglie"
          countLabel="bottiglie"
          reportField="n_bottiglie_modificate"
          reportLabel="righe slot vitigno aggiornate"
          onClose={() => setMerging(null)}
          onDone={() => { setMerging(null); reload(); }}
        />
      )}
    </div>
  );
}


// ════════════════════════════════════════════════════════════════
// MODALE DETTAGLIO VITIGNO — lista madri (senza drill-down completo).
// I vitigni non hanno endpoint madri-raggruppate dedicato; il dettaglio
// del singolo vino è raggiungibile dalla cantina classica.
// ════════════════════════════════════════════════════════════════
function VitignoDetailModal({ vitigno: v, onClose, onEdit }) {
  const lista = v.vini_madre || [];
  const [sort, setSort] = useState({ key: "descrizione", dir: "asc" });
  const sortedLista = useMemo(() => sortRows(lista, sort.key, sort.dir), [lista, sort]);

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-3xl shadow-2xl max-w-4xl w-full max-h-[92vh] overflow-hidden flex flex-col"
           onClick={e => e.stopPropagation()}>
        <div className="px-5 py-3 border-b border-amber-200 bg-gradient-to-r from-amber-50 to-white flex items-start justify-between gap-3 flex-shrink-0">
          <div className="min-w-0">
            <div className="text-[10px] uppercase tracking-wider text-amber-700">Vitigno #{v.id}</div>
            <h3 className="text-lg font-semibold font-playfair text-amber-900 truncate">🍇 {v.nome}</h3>
            {v.note && <p className="text-xs text-neutral-700 mt-0.5 italic">{v.note}</p>}
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <Btn variant="warning" size="sm" onClick={onEdit}>✏️ Modifica</Btn>
            <Btn variant="secondary" size="sm" onClick={onClose}>Chiudi</Btn>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-2 px-5 py-2 bg-neutral-50 border-b border-neutral-200 text-xs flex-shrink-0">
          <div><span className="text-neutral-500">Vini madre:</span> <strong>{v.n_madre || 0}</strong></div>
          <div><span className="text-neutral-500">Bottiglie:</span> <strong>{v.n_bottiglie || 0}</strong></div>
          <div><span className="text-neutral-500">Giacenza:</span> <strong>{v.qta_bottiglie || 0}</strong></div>
        </div>

        <div className="flex-1 overflow-auto min-h-0 bg-neutral-50">
          {lista.length === 0 ? (
            <div className="p-8 text-center text-sm text-neutral-500">
              Nessun vino madre usa questo vitigno.
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-white text-xs uppercase tracking-wider text-neutral-600 sticky top-0 z-10 border-b border-neutral-200">
                <tr>
                  <th className="px-3 py-2 text-left w-12">ID</th>
                  <SortTh label="Descrizione"   sortKey="descrizione"          sort={sort} setSort={setSort} />
                  <SortTh label="Produttore"    sortKey="produttore_nome"      sort={sort} setSort={setSort} />
                  <SortTh label="Tipologia"     sortKey="tipologia"            sort={sort} setSort={setSort} />
                  <SortTh label="Denominazione" sortKey="denominazione_display" sort={sort} setSort={setSort} />
                  <SortTh label="Btg"           sortKey="n_bottiglie"          sort={sort} setSort={setSort} align="right" />
                  <SortTh label="Giac."         sortKey="qta_tot"              sort={sort} setSort={setSort} align="right" />
                </tr>
              </thead>
              <tbody>
                {sortedLista.map(m => (
                  <tr key={m.id} className="border-t border-neutral-100 hover:bg-amber-50/40">
                    <td className="px-3 py-1.5 font-mono text-[11px] text-neutral-500">{m.id}</td>
                    <td className="px-3 py-1.5 font-semibold text-amber-900">{m.descrizione}</td>
                    <td className="px-3 py-1.5 text-xs text-neutral-700">{m.produttore_nome || <span className="text-neutral-400">—</span>}</td>
                    <td className="px-3 py-1.5 text-xs text-neutral-700">{m.tipologia || "—"}</td>
                    <td className="px-3 py-1.5 text-xs text-neutral-700">{m.denominazione_display || <span className="text-neutral-400">—</span>}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums">{m.n_bottiglie || 0}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums">{m.qta_tot || 0}</td>
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
// MODALE EDIT / NUOVO VITIGNO
// ════════════════════════════════════════════════════════════════
const VITIGNO_FIELDS = [
  { key: "nome", label: "Nome", required: true, placeholder: "es. Nebbiolo" },
  { key: "note", label: "Note", type: "textarea", placeholder: "Sinonimi, caratteristiche, regioni dove è coltivato, ecc." },
];

function VitignoEditModal({ item, isNew, onClose, onSaved }) {
  const [form, setForm] = useState(() => {
    const init = {};
    VITIGNO_FIELDS.forEach(f => { init[f.key] = item[f.key] ?? ""; });
    return init;
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const save = async () => {
    setError("");
    for (const f of VITIGNO_FIELDS) {
      if (f.required && !String(form[f.key] || "").trim()) {
        setError(`Campo obbligatorio: ${f.label}`); return;
      }
    }
    const payload = {};
    VITIGNO_FIELDS.forEach(f => {
      const v = form[f.key];
      if (v !== "" && v != null) payload[f.key] = v;
    });
    setSaving(true);
    try {
      const url = `${API_BASE}/vini/anagrafiche/vitigni/${isNew ? "" : item.id}`;
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
      title={isNew ? "🆕 Nuovo vitigno" : `✏️ Modifica vitigno #${item.id}`}
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
        {VITIGNO_FIELDS.map(f => (
          <FieldLabel key={f.key} label={f.label} required={f.required}>
            {f.type === "textarea" ? (
              <Textarea rows={3} value={form[f.key]} onChange={v => setForm(p => ({ ...p, [f.key]: v }))} placeholder={f.placeholder} />
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


// M2.5.5: MergeVitigniModal sostituito da MergeAnagraficaModal generico.
