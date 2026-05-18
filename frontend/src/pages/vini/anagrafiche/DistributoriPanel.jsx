// Modulo: vini
// src/pages/vini/anagrafiche/DistributoriPanel.jsx
//
// M2.5.2 (2026-05-16) — Pannello dedicato ai Distributori (fornitori in DB).
// Pattern identico a ProduttoriPanel: tabella con counts, filtri, dettaglio
// con lista vini distribuiti + drill-down inline alla SchedaMadreV2, merge
// duplicati. NB: la tabella DB resta `vini_fornitori_v2` — qui usiamo "Distributori"
// come label UI perché è il vocabolario di Marco/osteria. La mappa è 1:1.
//
// Backend usato:
//   GET    /vini/anagrafiche/fornitori/?with_counts=true&search=&only_orphans=
//   GET    /vini/anagrafiche/fornitori/{id}?with_madri=true
//   POST   /vini/anagrafiche/fornitori/                  (admin)
//   PATCH  /vini/anagrafiche/fornitori/{id}              (admin) — cascade sync
//   DELETE /vini/anagrafiche/fornitori/{id}              (admin) — fallisce se has madri
//   POST   /vini/anagrafiche/fornitori/{src}/merge?target_id={dst}  (admin)
//   GET    /vini/v2/madri-raggruppate/?fornitore_id={id}  (per drill-down con annate)

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { API_BASE, apiFetch } from "../../../config/api";
import SchedaMadreV2 from "../../../components/vini/SchedaMadreV2";
// M2.5.5: helper condivisi.
import { sortRows, SortTh } from "../../../utils/vini/sortableTable";
import MergeAnagraficaModal from "../../../components/vini/MergeAnagraficaModal";
// M2.8: primitive M.I. Palette amber (modulo Vini), no più blue per entità.
import { Btn, Card, Modal, FieldLabel, TextInput, Textarea } from "../../../components/ui";

export default function DistributoriPanel() {
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
      const r = await apiFetch(`${API_BASE}/vini/anagrafiche/fornitori/?${params}`);
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

  // KPI
  const totN = items.length;
  const totMadre = items.reduce((s, f) => s + (f.n_madre || 0), 0);
  const totBottiglie = items.reduce((s, f) => s + (f.n_bottiglie || 0), 0);
  const totQta = items.reduce((s, f) => s + (f.qta_bottiglie || 0), 0);
  const nOrfani = items.filter(f => (f.n_madre || 0) === 0).length;

  return (
    <div className="space-y-3">
      {/* Toolbar filtri */}
      <Card tone="amber" radius="2xl" padding="sm">
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex-1 min-w-[200px]">
            <TextInput value={search} onChange={setSearch} placeholder="Cerca distributore o rappresentante…" />
          </div>
          <label className="flex items-center gap-1.5 text-xs text-amber-900 bg-white border border-amber-300 rounded-lg px-2 py-1.5 cursor-pointer">
            <input type="checkbox" checked={onlyOrphans} onChange={e => setOnlyOrphans(e.target.checked)} />
            Solo orfani (0 vini)
          </label>
          {canEdit && (
            <Btn variant="warning" size="sm" onClick={() => setEditing("new")}>
              + Nuovo distributore
            </Btn>
          )}
        </div>
      </Card>

      {/* KPI */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-2 text-xs">
        <div className="bg-white border border-neutral-200 rounded-lg p-2">
          <div className="text-[10px] text-neutral-500 uppercase tracking-wide">Distributori</div>
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
                <SortTh label="Nome"           sortKey="nome"                sort={sort} setSort={setSort} />
                <SortTh label="Rappresentante" sortKey="rappresentante_nome" sort={sort} setSort={setSort} />
                <SortTh label="Città"          sortKey="citta"               sort={sort} setSort={setSort} />
                <SortTh label="Madri"          sortKey="n_madre"             sort={sort} setSort={setSort} align="right" />
                <SortTh label="Btg"            sortKey="n_bottiglie"         sort={sort} setSort={setSort} align="right" />
                <SortTh label="Giac."          sortKey="qta_bottiglie"       sort={sort} setSort={setSort} align="right" />
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
              {!loading && sorted.map(f => {
                const isOrfano = (f.n_madre || 0) === 0;
                return (
                  <tr key={f.id}
                      className={`border-t border-neutral-100 hover:bg-amber-50 cursor-pointer transition ${isOrfano ? "bg-rose-50/30" : ""}`}
                      onClick={() => openDetail(f.id)}>
                    <td className="px-3 py-1.5 font-mono text-[11px] text-neutral-500">{f.id}</td>
                    <td className="px-3 py-1.5 font-semibold text-neutral-900">{f.nome}</td>
                    <td className="px-3 py-1.5 text-neutral-700">{f.rappresentante_nome || <span className="text-neutral-400">—</span>}</td>
                    <td className="px-3 py-1.5 text-neutral-700">{f.citta || <span className="text-neutral-400">—</span>}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums font-medium">{f.n_madre || 0}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums">{f.n_bottiglie || 0}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums">{f.qta_bottiglie || 0}</td>
                    <td className="px-3 py-1.5 text-right whitespace-nowrap" onClick={e => e.stopPropagation()}>
                      {canEdit && (
                        <>
                          <button onClick={() => setEditing(f)}
                            className="px-2 py-1 text-xs rounded border border-neutral-300 hover:bg-neutral-100 mr-1"
                            title="Modifica anagrafica">✏️</button>
                          <button onClick={() => setMerging(f)}
                            className="px-2 py-1 text-xs rounded border border-amber-400 text-amber-800 hover:bg-amber-50 mr-1"
                            title="Fondi in un altro distributore (duplicati)">🔀</button>
                          <button onClick={() => handleDelete(f)}
                            className="px-2 py-1 text-xs rounded border border-red-300 text-red-700 hover:bg-red-50"
                            disabled={!isOrfano}
                            title={isOrfano ? "Elimina (nessun vino collegato)" : `Bloccato: ${f.n_madre} vini madre collegati`}>🗑</button>
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

      {detailOf && (
        <DistributoreDetailModal
          fornitore={detailOf}
          onClose={() => setDetailOf(null)}
          onEdit={() => { setEditing(detailOf); setDetailOf(null); }}
        />
      )}
      {editing && canEdit && (
        <DistributoreEditModal
          item={editing === "new" ? {} : editing}
          isNew={editing === "new"}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); reload(); }}
        />
      )}
      {merging && canEdit && (
        <MergeAnagraficaModal
          kind="fornitori"
          palette="amber"
          source={merging}
          candidates={items.filter(f => f.id !== merging.id)}
          countField="n_madre"
          countLabel="vini madre"
          reportField="n_madre_spostati"
          reportLabel="vini madre spostati"
          renderSubtitle={c => {
            const parts = [];
            if (c.n_madre != null) parts.push(`${c.n_madre} vini`);
            if (c.rappresentante_nome) parts.push(`rappr. ${c.rappresentante_nome}`);
            return parts.join(" · ") || "—";
          }}
          onClose={() => setMerging(null)}
          onDone={() => { setMerging(null); reload(); }}
        />
      )}
    </div>
  );

  async function openDetail(fid) {
    try {
      const [rDet, rMadri] = await Promise.all([
        apiFetch(`${API_BASE}/vini/anagrafiche/fornitori/${fid}?with_madri=true`),
        apiFetch(`${API_BASE}/vini/v2/madri-raggruppate/?fornitore_id=${fid}`),
      ]);
      if (!rDet.ok) throw new Error(`HTTP ${rDet.status} (dettaglio)`);
      const det = await rDet.json();
      det._madri_complete = rMadri.ok ? await rMadri.json() : [];
      setDetailOf(det);
    } catch (e) {
      alert(`Errore caricamento dettaglio: ${e.message}`);
    }
  }

  async function handleDelete(f) {
    if (!window.confirm(`Eliminare il distributore "${f.nome}"?\nOperazione irreversibile.`)) return;
    try {
      const r = await apiFetch(`${API_BASE}/vini/anagrafiche/fornitori/${f.id}`, { method: "DELETE" });
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
// MODALE DETTAGLIO DISTRIBUTORE
// ════════════════════════════════════════════════════════════════
function DistributoreDetailModal({ fornitore: f, onClose, onEdit }) {
  const madriComplete = f._madri_complete || [];
  const madriIndex = useMemo(
    () => Object.fromEntries(madriComplete.map(m => [m.id, m])),
    [madriComplete]
  );
  const lista = (f.vini_madre && f.vini_madre.length)
    ? f.vini_madre
    : madriComplete.map(m => ({
        id: m.id, descrizione: m.descrizione, tipologia: m.tipologia,
        produttore_nome: m.produttore_nome,
        denominazione_display: m.denominazione_display,
        n_bottiglie: (m.annate || []).length,
        qta_tot: m.qta_tot || 0,
      }));

  const [sort, setSort] = useState({ key: "descrizione", dir: "asc" });
  const sortedLista = useMemo(() => sortRows(lista, sort.key, sort.dir), [lista, sort]);

  const [openMadreId, setOpenMadreId] = useState(null);
  const openMadre = openMadreId ? madriIndex[openMadreId] : null;

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-3xl shadow-2xl max-w-5xl w-full max-h-[92vh] overflow-hidden flex flex-col"
           onClick={e => e.stopPropagation()}>
        <div className="px-5 py-3 border-b border-amber-200 bg-gradient-to-r from-amber-50 to-white flex items-start justify-between gap-3 flex-shrink-0">
          <div className="min-w-0">
            <div className="text-[10px] uppercase tracking-wider text-amber-700">Distributore #{f.id}</div>
            <h3 className="text-lg font-semibold font-playfair text-amber-900 truncate">🚚 {f.nome}</h3>
            <p className="text-xs text-neutral-700 mt-0.5">
              {[f.citta, f.provincia, f.regione, f.nazione].filter(Boolean).join(" · ") || "—"}
              {f.rappresentante_nome && <span> · <strong>{f.rappresentante_nome}</strong>{f.rappresentante_telefono ? ` (${f.rappresentante_telefono})` : ""}</span>}
            </p>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {!openMadre && <Btn variant="warning" size="sm" onClick={onEdit}>✏️ Modifica</Btn>}
            <Btn variant="secondary" size="sm" onClick={onClose}>Chiudi</Btn>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2 px-5 py-2 bg-neutral-50 border-b border-neutral-200 text-xs flex-shrink-0">
          <div><span className="text-neutral-500">Vini madre:</span> <strong>{f.n_madre || 0}</strong></div>
          <div><span className="text-neutral-500">Bottiglie:</span> <strong>{f.n_bottiglie || 0}</strong></div>
          <div><span className="text-neutral-500">Giacenza:</span> <strong>{f.qta_bottiglie || 0}</strong></div>
        </div>

        {f.note && !openMadre && (
          <div className="px-5 py-2 border-b border-neutral-200 text-xs text-neutral-700 italic bg-amber-50/40 flex-shrink-0">
            {f.note}
          </div>
        )}

        {openMadre && (
          <div className="px-3 py-2 bg-rose-50 border-b border-rose-200 flex items-center gap-2 flex-shrink-0">
            <button onClick={() => setOpenMadreId(null)}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-white border border-neutral-300 hover:bg-neutral-50 shadow-sm">
              ← Vini distribuiti da {f.nome}
            </button>
            <span className="text-xs font-bold text-rose-900">🍷 Scheda Vino Madre</span>
          </div>
        )}

        <div className="flex-1 overflow-auto min-h-0 bg-neutral-50">
          {openMadre ? (
            <div className="p-3">
              <SchedaMadreV2 madre={openMadre} onClose={() => setOpenMadreId(null)} />
            </div>
          ) : lista.length === 0 ? (
            <div className="p-8 text-center text-sm text-neutral-500">
              Nessun vino madre distribuito da questo fornitore.
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
                {sortedLista.map(m => {
                  const canDrill = !!madriIndex[m.id];
                  return (
                    <tr key={m.id}
                        className={`border-t border-neutral-100 transition ${canDrill ? "cursor-pointer hover:bg-amber-50" : "opacity-60"}`}
                        onClick={() => canDrill && setOpenMadreId(m.id)}
                        title={canDrill ? "Apri scheda vino madre" : "Scheda non disponibile (dati v2 mancanti)"}>
                      <td className="px-3 py-1.5 font-mono text-[11px] text-neutral-500">{m.id}</td>
                      <td className="px-3 py-1.5 font-semibold text-amber-900 hover:underline">{m.descrizione}</td>
                      <td className="px-3 py-1.5 text-xs text-neutral-700">{m.produttore_nome || <span className="text-neutral-400">—</span>}</td>
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
// EDIT / NUOVO DISTRIBUTORE
// ════════════════════════════════════════════════════════════════
const DISTRIBUTORE_FIELDS = [
  { key: "nome",                    label: "Nome distributore",         required: true,  placeholder: "es. Mediawine srl" },
  { key: "nazione",                 label: "Nazione" },
  { key: "regione",                 label: "Regione" },
  { key: "provincia",               label: "Provincia" },
  { key: "citta",                   label: "Città" },
  { key: "rappresentante_nome",     label: "Rappresentante (nome)",     placeholder: "es. Luca Rossi" },
  { key: "rappresentante_telefono", label: "Rappresentante (telefono)", placeholder: "es. 348 1234567" },
  { key: "rappresentante_email",    label: "Rappresentante (email)",    placeholder: "luca@..." },
  { key: "note",                    label: "Note",                      type: "textarea" },
];

function DistributoreEditModal({ item, isNew, onClose, onSaved }) {
  const [form, setForm] = useState(() => {
    const init = {};
    DISTRIBUTORE_FIELDS.forEach(f => { init[f.key] = item[f.key] ?? ""; });
    return init;
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const save = async () => {
    setError("");
    for (const f of DISTRIBUTORE_FIELDS) {
      if (f.required && !String(form[f.key] || "").trim()) {
        setError(`Campo obbligatorio: ${f.label}`); return;
      }
    }
    const payload = {};
    DISTRIBUTORE_FIELDS.forEach(f => {
      const v = form[f.key];
      if (v !== "" && v != null) payload[f.key] = v;
    });
    setSaving(true);
    try {
      const url = `${API_BASE}/vini/anagrafiche/fornitori/${isNew ? "" : item.id}`;
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
      title={isNew ? "🆕 Nuovo distributore" : `✏️ Modifica distributore #${item.id}`}
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
        {DISTRIBUTORE_FIELDS.map(f => (
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


// M2.5.5: MergeDistributoriModal sostituito da MergeAnagraficaModal generico.
