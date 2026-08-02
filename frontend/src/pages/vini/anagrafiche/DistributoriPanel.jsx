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
//
// O1 (2026-08-02) — "Modalità contatti": edit inline di rappresentante/telefono/
// email direttamente in tabella, senza aprire il modale una riga alla volta.
// Serve a riempire i contatti dei 40 distributori in una seduta: al 2026-08-02
// erano 0/40 valorizzati, ed è il prerequisito dell'invio ordini via WhatsApp
// (piano O5). Vedi `docs/modulo_vini_ordini.md` §O1.

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { API_BASE, apiFetch } from "../../../config/api";
import SchedaMadreV2 from "../../../components/vini/SchedaMadreV2";
// M2.5.5: helper condivisi.
import { sortRows, SortTh } from "../../../utils/vini/sortableTable";
import MergeAnagraficaModal from "../../../components/vini/MergeAnagraficaModal";
// M2.8: primitive M.I. Palette amber (modulo Vini), no più blue per entità.
import { Btn, Card, Modal, FieldLabel, TextInput, Textarea } from "../../../components/ui";
// O1: mattone M.C — validazione telefono con la stessa funzione che poi
// costruirà il link wa.me. Mai fare .replace a mano sul numero (CLAUDE.md).
import { normalizePhone } from "../../../utils/whatsapp";

// O1: colonne editabili inline in modalità contatti, nell'ordine di tabulazione.
const CONTATTO_COLS = [
  { key: "rappresentante_nome",     label: "Rappresentante", icon: "👤", placeholder: "Nome e cognome", width: "w-56" },
  { key: "rappresentante_telefono", label: "Telefono",       icon: "📱", placeholder: "348 1234567",    width: "w-44" },
  { key: "rappresentante_email",    label: "Email",          icon: "✉️", placeholder: "nome@dominio.it", width: "w-64" },
];

const LS_CONTATTI = "vini_distributori_contatti";

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

  // ── O1 — Modalità contatti ────────────────────────────────
  const [contattiMode, setContattiMode] = useState(() => {
    try { return localStorage.getItem(LS_CONTATTI) === "true"; } catch { return false; }
  });
  const [onlySenzaTel, setOnlySenzaTel] = useState(false);
  // Cella in edit: {id, key} — un solo input aperto alla volta.
  const [cell, setCell] = useState(null);
  const [savingCell, setSavingCell] = useState(null);
  const [cellError, setCellError] = useState(null);

  useEffect(() => {
    try { localStorage.setItem(LS_CONTATTI, String(contattiMode)); } catch {}
  }, [contattiMode]);

  // Uscendo dalla modalità contatti chiudo l'eventuale cella aperta (altrimenti
  // resta un input orfano su una colonna non più renderizzata) e spengo il
  // filtro "senza telefono": la sua checkbox sparisce, e una lista filtrata da
  // un controllo invisibile fa sembrare che manchino dei distributori.
  useEffect(() => {
    if (!contattiMode) { setCell(null); setCellError(null); setOnlySenzaTel(false); }
  }, [contattiMode]);

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

  // O1: il filtro "senza telefono" è client-side (il backend non lo espone e
  // non vale un parametro nuovo per 40 righe già tutte in memoria).
  const visibili = useMemo(
    () => (onlySenzaTel ? items.filter(f => !hasTel(f)) : items),
    [items, onlySenzaTel]
  );
  const sorted = useMemo(() => sortRows(visibili, sort.key, sort.dir), [visibili, sort]);

  // KPI
  const totN = items.length;
  const totMadre = items.reduce((s, f) => s + (f.n_madre || 0), 0);
  const totBottiglie = items.reduce((s, f) => s + (f.n_bottiglie || 0), 0);
  const totQta = items.reduce((s, f) => s + (f.qta_bottiglie || 0), 0);
  const nOrfani = items.filter(f => (f.n_madre || 0) === 0).length;

  // O1: completezza contatti. Conta solo i distributori "vivi" (con almeno un
  // vino): un orfano senza telefono non è un buco da riempire, è un residuo.
  const attivi = useMemo(() => items.filter(f => (f.n_madre || 0) > 0), [items]);
  const nConTel = attivi.filter(hasTel).length;
  const nConEmail = attivi.filter(f => !!String(f.rappresentante_email || "").trim()).length;
  const pctTel = attivi.length ? Math.round((nConTel / attivi.length) * 100) : 0;
  // Numeri che normalizePhone non riesce a interpretare → wa.me non funzionerà.
  const nTelInvalidi = attivi.filter(f => hasTel(f) && !normalizePhone(f.rappresentante_telefono)).length;

  /**
   * O1 — Salva un singolo campo contatto (PATCH parziale) con update ottimistico.
   * Il backend applica il cascade sync solo su `nome`/`rappresentante_nome`
   * (vedi `_FORNITORE_CAMPI_CASCADE` nel router), quindi telefono ed email
   * costano una UPDATE secca.
   */
  const saveField = useCallback(async (fornitore, key, rawValue) => {
    const value = String(rawValue ?? "").trim();
    const precedente = String(fornitore[key] ?? "");
    if (value === precedente) return true;          // niente da salvare
    if (key === "nome" && !value) {                 // il nome è NOT NULL
      setCellError({ id: fornitore.id, key, msg: "Il nome non può essere vuoto" });
      return false;
    }

    setSavingCell({ id: fornitore.id, key });
    setCellError(null);
    // Ottimistico: la riga si aggiorna subito, così il ritmo di data entry
    // non si spezza aspettando la rete.
    setItems(prev => prev.map(x => (x.id === fornitore.id ? { ...x, [key]: value } : x)));
    try {
      const r = await apiFetch(`${API_BASE}/vini/anagrafiche/fornitori/${fornitore.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [key]: value }),
      });
      if (!r.ok) {
        const err = await r.json().catch(() => ({ detail: r.statusText }));
        throw new Error(err.detail || `HTTP ${r.status}`);
      }
      // Il PATCH restituisce già la riga aggiornata: la riallineo, così se il
      // backend canonicalizza un valore (trim, "" -> NULL) la UI non resta a
      // mostrare quello che ho scritto io fino al prossimo reload.
      // `_sync` è diagnostica del cascade, non un campo della riga: fuori.
      const row = await r.json().catch(() => null);
      if (row && row.id) {
        const { _sync, ...pulito } = row;
        setItems(prev => prev.map(x => (x.id === row.id ? { ...x, ...pulito } : x)));
      }
      return true;
    } catch (e) {
      // Rollback: rimetto il valore che c'era prima, non lascio la UI a mentire.
      setItems(prev => prev.map(x => (x.id === fornitore.id ? { ...x, [key]: fornitore[key] } : x)));
      setCellError({ id: fornitore.id, key, msg: String(e.message || e) });
      return false;
    } finally {
      setSavingCell(null);
    }
  }, []);

  // Colonne renderizzate, per il colSpan delle righe "vuoto"/"carico":
  // ID + Nome + (3 contatti | rappr./città/btg/giac.) + Madri + Azioni.
  const nColonne = 2 + (contattiMode ? CONTATTO_COLS.length : 4) + 2;

  /** O1 — Enter conferma e scende alla stessa colonna della riga successiva. */
  const goNextRow = useCallback((currentId, key) => {
    const idx = sorted.findIndex(f => f.id === currentId);
    const next = idx >= 0 ? sorted[idx + 1] : null;
    setCell(next ? { id: next.id, key } : null);
  }, [sorted]);

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
          {/* O1 — toggle modalità contatti */}
          {canEdit && (
            <button
              type="button"
              onClick={() => setContattiMode(v => !v)}
              aria-pressed={contattiMode}
              title="Compila rappresentante, telefono ed email direttamente in tabella"
              className={`text-xs font-semibold rounded-lg px-3 py-1.5 border transition min-h-[34px] ${
                contattiMode
                  ? "bg-amber-600 text-white border-amber-700 shadow-sm"
                  : "bg-white text-amber-900 border-amber-300 hover:bg-amber-50"
              }`}
            >
              📱 Contatti
            </button>
          )}
          {contattiMode && (
            <label className="flex items-center gap-1.5 text-xs text-amber-900 bg-white border border-amber-300 rounded-lg px-2 py-1.5 cursor-pointer">
              <input type="checkbox" checked={onlySenzaTel} onChange={e => setOnlySenzaTel(e.target.checked)} />
              Solo senza telefono
            </label>
          )}
          {canEdit && (
            <Btn variant="warning" size="sm" onClick={() => setEditing("new")}>
              + Nuovo distributore
            </Btn>
          )}
        </div>
      </Card>

      {/* O1 — Barra completezza contatti. Visibile solo in modalità contatti:
          altrove sarebbe rumore. */}
      {contattiMode && (
        <div className="bg-white border border-amber-200 rounded-xl p-3">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="text-xs text-neutral-700">
              <strong className="text-sm text-neutral-900 tabular-nums">{nConTel}/{attivi.length}</strong>{" "}
              distributori attivi hanno il telefono del rappresentante
              <span className="text-neutral-400"> · {nConEmail} con email</span>
            </div>
            <div className="flex items-center gap-2">
              {nTelInvalidi > 0 && (
                <span className="text-[11px] font-semibold text-amber-800 bg-amber-50 border border-amber-200 rounded-full px-2 py-0.5">
                  ⚠️ {nTelInvalidi} numer{nTelInvalidi === 1 ? "o" : "i"} non valid{nTelInvalidi === 1 ? "o" : "i"}
                </span>
              )}
              <span className={`text-[11px] font-bold tabular-nums rounded-full px-2 py-0.5 border ${
                pctTel === 100 ? "bg-emerald-50 text-emerald-800 border-emerald-200"
                : pctTel >= 50 ? "bg-amber-50 text-amber-800 border-amber-200"
                : "bg-rose-50 text-rose-800 border-rose-200"
              }`}>
                {pctTel}%
              </span>
            </div>
          </div>
          <div className="mt-2 h-1.5 w-full bg-neutral-100 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${pctTel === 100 ? "bg-emerald-500" : "bg-amber-500"}`}
              style={{ width: `${pctTel}%` }}
            />
          </div>
          <p className="text-[11px] text-neutral-500 mt-2 leading-relaxed">
            Click su una cella per scriverci dentro · <kbd className="font-mono">Invio</kbd> salva e scende alla riga sotto ·
            {" "}<kbd className="font-mono">Esc</kbd> annulla. Serve per mandare gli ordini su WhatsApp senza riscriverli a mano.
          </p>
        </div>
      )}

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
                {contattiMode ? (
                  <>
                    {/* Colonne contatto NON ordinabili di proposito: ordinare su
                        una colonna che si sta compilando fa saltare la riga al
                        suo nuovo posto a ogni Invio, e la lista scappa sotto le
                        dita. Per isolare i buchi c'è "Solo senza telefono". */}
                    {CONTATTO_COLS.map(c => (
                      <th key={c.key} className={`px-3 py-2 text-left ${c.width}`}>
                        {c.icon} {c.label}
                      </th>
                    ))}
                    <SortTh label="Madri" sortKey="n_madre" sort={sort} setSort={setSort} align="right" />
                  </>
                ) : (
                  /* Ordine colonne invariato rispetto a M2.5.2: la vista
                     normale non deve cambiare per colpa della modalità contatti. */
                  <>
                    <SortTh label="Rappresentante" sortKey="rappresentante_nome" sort={sort} setSort={setSort} />
                    <SortTh label="Città"          sortKey="citta"               sort={sort} setSort={setSort} />
                    <SortTh label="Madri"          sortKey="n_madre"             sort={sort} setSort={setSort} align="right" />
                    <SortTh label="Btg"            sortKey="n_bottiglie"         sort={sort} setSort={setSort} align="right" />
                    <SortTh label="Giac."          sortKey="qta_bottiglie"       sort={sort} setSort={setSort} align="right" />
                  </>
                )}
                <th className="px-3 py-2 text-right">Azioni</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr><td colSpan={nColonne} className="px-3 py-8 text-center text-neutral-500">Carico…</td></tr>
              )}
              {!loading && sorted.length === 0 && (
                <tr>
                  <td colSpan={nColonne} className="px-3 py-8 text-center text-neutral-500">
                    {onlySenzaTel && items.length > 0
                      ? "🎉 Tutti i distributori filtrati hanno il telefono."
                      : "Nessun risultato."}
                  </td>
                </tr>
              )}
              {!loading && sorted.map(f => {
                const isOrfano = (f.n_madre || 0) === 0;
                // In modalità contatti la riga NON apre il dettaglio: il click
                // serve a entrare nella cella, un modale che si apre sotto le
                // dita mentre si scrive è il modo più rapido per far odiare
                // questa schermata.
                const rowClick = contattiMode ? undefined : () => openDetail(f.id);
                return (
                  <tr key={f.id}
                      className={`border-t border-neutral-100 transition ${contattiMode ? "hover:bg-amber-50/40" : "hover:bg-amber-50 cursor-pointer"} ${isOrfano ? "bg-rose-50/30" : ""}`}
                      onClick={rowClick}>
                    <td className="px-3 py-1.5 font-mono text-[11px] text-neutral-500">{f.id}</td>
                    <td className="px-3 py-1.5 font-semibold text-neutral-900">
                      {contattiMode ? (
                        <button type="button" onClick={() => openDetail(f.id)}
                                className="text-left hover:text-amber-800 hover:underline"
                                title="Apri dettaglio distributore">
                          {f.nome}
                        </button>
                      ) : f.nome}
                    </td>
                    {contattiMode ? (
                      <>
                        {CONTATTO_COLS.map(c => (
                          <td key={c.key} className={`px-2 py-1 ${c.width}`}>
                            <ContattoCell
                              fornitore={f}
                              col={c}
                              editing={cell?.id === f.id && cell?.key === c.key}
                              saving={savingCell?.id === f.id && savingCell?.key === c.key}
                              error={cellError?.id === f.id && cellError?.key === c.key ? cellError.msg : null}
                              readOnly={!canEdit}
                              onOpen={() => { setCellError(null); setCell({ id: f.id, key: c.key }); }}
                              onCancel={() => setCell(null)}
                              onCommit={async (val, andThen) => {
                                const ok = await saveField(f, c.key, val);
                                if (!ok) return;                     // resto sulla cella in errore
                                if (andThen === "next") { goNextRow(f.id, c.key); return; }
                                // Chiudo solo se nel frattempo l'utente non ha
                                // già aperto un'altra cella (blur → click su
                                // un'altra colonna: il blur risolve DOPO).
                                setCell(prev => (prev && prev.id === f.id && prev.key === c.key ? null : prev));
                              }}
                            />
                          </td>
                        ))}
                        <td className="px-3 py-1.5 text-right tabular-nums font-medium">{f.n_madre || 0}</td>
                      </>
                    ) : (
                      <>
                        <td className="px-3 py-1.5 text-neutral-700">{f.rappresentante_nome || <span className="text-neutral-400">—</span>}</td>
                        <td className="px-3 py-1.5 text-neutral-700">{f.citta || <span className="text-neutral-400">—</span>}</td>
                        <td className="px-3 py-1.5 text-right tabular-nums font-medium">{f.n_madre || 0}</td>
                        <td className="px-3 py-1.5 text-right tabular-nums">{f.n_bottiglie || 0}</td>
                        <td className="px-3 py-1.5 text-right tabular-nums">{f.qta_bottiglie || 0}</td>
                      </>
                    )}
                    <td className="px-3 py-1.5 text-right whitespace-nowrap" onClick={e => e.stopPropagation()}>
                      {canEdit && (
                        <>
                          <button onClick={() => setEditing(f)}
                            className="px-2 py-1 text-xs rounded border border-neutral-300 hover:bg-neutral-100 mr-1"
                            title="Modifica anagrafica">✏️</button>
                          {!contattiMode && (
                            <button onClick={() => setMerging(f)}
                              className="px-2 py-1 text-xs rounded border border-amber-400 text-amber-800 hover:bg-amber-50 mr-1"
                              title="Fondi in un altro distributore (duplicati)">🔀</button>
                          )}
                          {!contattiMode && (
                            <button onClick={() => handleDelete(f)}
                              className="px-2 py-1 text-xs rounded border border-red-300 text-red-700 hover:bg-red-50"
                              disabled={!isOrfano}
                              title={isOrfano ? "Elimina (nessun vino collegato)" : `Bloccato: ${f.n_madre} vini madre collegati`}>🗑</button>
                          )}
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


// ════════════════════════════════════════════════════════════════
// O1 — CELLA CONTATTO EDITABILE INLINE
// ════════════════════════════════════════════════════════════════

/** true se il distributore ha un telefono valorizzato (anche non normalizzabile). */
function hasTel(f) {
  return !!String(f?.rappresentante_telefono || "").trim();
}

/**
 * Cella di tabella che passa da testo a input al click.
 *
 * Tastiera (è il punto di tutta la fase O1 — 40 righe da riempire di fila):
 *   Invio → salva e apre la stessa colonna sulla riga sotto
 *   Tab   → salva e lascia che il browser porti al campo successivo
 *   Esc   → annulla e ripristina il valore precedente
 *   blur  → salva (perdere quello che si è scritto cliccando fuori è
 *           il modo più veloce per far perdere fiducia in una schermata)
 */
function ContattoCell({ fornitore, col, editing, saving, error, readOnly, onOpen, onCancel, onCommit }) {
  const iniziale = String(fornitore[col.key] ?? "");
  const [draft, setDraft] = useState(iniziale);
  const inputRef = useRef(null);
  // `annullato` evita che l'onBlur scatenato da Esc risalvi il valore.
  const annullato = useRef(false);
  // `gia_salvato` evita il doppio PATCH: dopo Invio/Tab l'input perde il focus
  // e l'onBlur richiamerebbe onCommit una seconda volta. Non basta il controllo
  // "valore invariato" dentro saveField, perché quella closure vede ancora la
  // riga PRIMA dell'update ottimistico e considererebbe il valore cambiato.
  const gia_salvato = useRef(false);

  // Dipendenza su `fornitore.id`, NON sull'oggetto `fornitore`: quello viene
  // ricreato da ogni setItems (update ottimistico e rollback), e con la dep
  // sull'oggetto l'effetto ripartirebbe A CELLA APERTA sovrascrivendo quello
  // che l'utente sta scrivendo. Caso concreto: PATCH fallito -> rollback ->
  // il testo appena digitato spariva proprio mentre la cella resta aperta per
  // farlo correggere.
  useEffect(() => {
    if (editing) {
      setDraft(String(fornitore[col.key] ?? ""));
      annullato.current = false;
      gia_salvato.current = false;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing, fornitore.id, col.key]);

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  if (editing && !readOnly) {
    const isTel = col.key === "rappresentante_telefono";
    const telNonValido = isTel && draft.trim() && !normalizePhone(draft);
    return (
      <div className="relative">
        <input
          ref={inputRef}
          type={col.key === "rappresentante_email" ? "email" : isTel ? "tel" : "text"}
          inputMode={isTel ? "tel" : undefined}
          value={draft}
          placeholder={col.placeholder}
          /* readOnly e non disabled: un input disabilitato perde il focus, e al
             termine di un salvataggio fallito la cella resterebbe aperta senza
             cursore, costringendo a ricliccarci sopra. */
          readOnly={saving}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={e => {
            if (saving) { if (e.key !== "Escape") e.preventDefault(); return; }
            if (e.key === "Enter") {
              e.preventDefault(); gia_salvato.current = true; onCommit(draft, "next");
            } else if (e.key === "Escape") {
              e.preventDefault(); annullato.current = true; onCancel();
            } else if (e.key === "Tab") {
              gia_salvato.current = true; onCommit(draft, "close");
            }
          }}
          onBlur={() => {
            if (saving || annullato.current || gia_salvato.current) return;
            onCommit(draft, "close");
          }}
          className={`w-full px-2 py-1 rounded-md border text-sm focus:outline-none focus:ring-2 ${
            telNonValido
              ? "border-amber-400 focus:ring-amber-400"
              : "border-amber-500 focus:ring-amber-500"
          }`}
          style={{ minHeight: "32px", fontSize: "16px" }}  /* 16px: iOS non zooma */
        />
        {telNonValido && (
          <div className="absolute z-20 mt-0.5 text-[10px] text-amber-800 bg-amber-50 border border-amber-200 rounded px-1.5 py-0.5 whitespace-nowrap">
            WhatsApp non riuscirà a usarlo
          </div>
        )}
        {error && (
          <div className="absolute z-20 mt-0.5 text-[10px] text-red-700 bg-red-50 border border-red-200 rounded px-1.5 py-0.5 whitespace-nowrap">
            {error}
          </div>
        )}
      </div>
    );
  }

  const valore = String(fornitore[col.key] ?? "").trim();
  const telNonValido = col.key === "rappresentante_telefono" && valore && !normalizePhone(valore);

  return (
    <button
      type="button"
      disabled={readOnly}
      onClick={onOpen}
      title={readOnly ? "Serve il ruolo admin o sommelier" : `Modifica ${col.label.toLowerCase()}`}
      className={`w-full text-left px-2 py-1 rounded-md border border-transparent transition min-h-[32px] ${
        readOnly ? "cursor-default" : "hover:border-amber-300 hover:bg-amber-50/60 cursor-text"
      }`}
    >
      {saving ? (
        <span className="text-xs text-neutral-400">salvo…</span>
      ) : valore ? (
        <span className={`text-sm ${telNonValido ? "text-amber-800" : "text-neutral-800"}`}>
          {valore}{telNonValido && <span title="Numero non interpretabile da wa.me"> ⚠️</span>}
        </span>
      ) : (
        <span className="text-sm text-neutral-300">{readOnly ? "—" : col.placeholder}</span>
      )}
      {/* <span block> e non <div>: dentro un <button> è ammesso solo phrasing content. */}
      {error && <span className="block text-[10px] text-red-700 mt-0.5">{error}</span>}
    </button>
  );
}
