// @version: v1.0 — Modulo J Lista Spesa Cucina Fase 1 MVP (sessione 59 cont. c, 2026-04-27)
// CRUD lista spesa testuale: titolo + quantità + urgente + fornitore freeform.
// Stile Home v3 originale potenziato (palette orange cucina + RicetteNav).
import React, { useState, useEffect, useCallback, useMemo } from "react";
import RicetteNav from "../ricette/RicetteNav";
import { API_BASE, apiFetch } from "../../config/api";
import TrgbLoader from "../../components/TrgbLoader";

const SP = `${API_BASE}/lista-spesa`;

function fmtFa(isoDate) {
  if (!isoDate) return "";
  try {
    const d = new Date(isoDate.replace(" ", "T"));
    const min = Math.floor((Date.now() - d.getTime()) / 60000);
    if (min < 1) return "ora";
    if (min < 60) return `${min}m fa`;
    const h = Math.floor(min / 60);
    if (h < 24) return `${h}h fa`;
    const g = Math.floor(h / 24);
    if (g === 1) return "ieri";
    if (g < 7) return `${g}gg fa`;
    return d.toLocaleDateString("it-IT", { day: "numeric", month: "short" });
  } catch { return ""; }
}

export default function ListaSpesa() {
  const [items, setItems] = useState([]);
  const [kpi, setKpi] = useState({ tot: 0, da_fare: 0, fatti: 0, urgenti_aperti: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Filtri
  const [filtroStato, setFiltroStato] = useState("da_fare"); // tutti|da_fare|fatti
  const [soloUrgenti, setSoloUrgenti] = useState(false);
  const [filtroFornitore, setFiltroFornitore] = useState("");

  // Form add (quick)
  const [newTitolo, setNewTitolo] = useState("");
  const [newQta, setNewQta] = useState("");
  const [newFornitore, setNewFornitore] = useState("");
  const [newUrgente, setNewUrgente] = useState(false);
  const [adding, setAdding] = useState(false);

  // Edit modal
  const [editItem, setEditItem] = useState(null);

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const params = new URLSearchParams({
        stato: filtroStato,
        solo_urgenti: soloUrgenti ? "true" : "false",
      });
      if (filtroFornitore.trim()) params.set("fornitore", filtroFornitore.trim());
      const r = await apiFetch(`${SP}/items/?${params.toString()}`);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const d = await r.json();
      if (d.ok) {
        setItems(d.items || []);
        setKpi(d.kpi || { tot: 0, da_fare: 0, fatti: 0, urgenti_aperti: 0 });
      }
    } catch (e) {
      setError(e.message || "Errore caricamento");
    } finally {
      setLoading(false);
    }
  }, [filtroStato, soloUrgenti, filtroFornitore]);

  useEffect(() => { load(); }, [load]);

  const addItem = async (e) => {
    if (e) e.preventDefault();
    const t = newTitolo.trim();
    if (!t) return;
    setAdding(true);
    try {
      const r = await apiFetch(`${SP}/items/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          titolo: t,
          quantita_libera: newQta.trim() || null,
          fornitore_freeform: newFornitore.trim() || null,
          urgente: newUrgente,
        }),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      // Reset form
      setNewTitolo(""); setNewQta(""); setNewUrgente(false);
      // Mantieni fornitore (spesso si aggiungono più item dello stesso fornitore)
      load();
    } catch (e) {
      alert(`Errore aggiunta: ${e.message || e}`);
    } finally {
      setAdding(false);
    }
  };

  const toggleFatto = async (item) => {
    try {
      const r = await apiFetch(`${SP}/items/${item.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fatto: !item.fatto }),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      load();
    } catch (e) {
      alert(`Errore: ${e.message || e}`);
    }
  };

  const toggleUrgente = async (item) => {
    try {
      const r = await apiFetch(`${SP}/items/${item.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ urgente: !item.urgente }),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      load();
    } catch (e) {
      alert(`Errore: ${e.message || e}`);
    }
  };

  const deleteItem = async (item) => {
    if (!window.confirm(`Eliminare "${item.titolo}"?`)) return;
    try {
      const r = await apiFetch(`${SP}/items/${item.id}`, { method: "DELETE" });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      load();
    } catch (e) {
      alert(`Errore: ${e.message || e}`);
    }
  };

  const svuotaCompletati = async () => {
    if (kpi.fatti === 0) return;
    if (!window.confirm(`Eliminare definitivamente ${kpi.fatti} item completat${kpi.fatti === 1 ? "o" : "i"}?`)) return;
    try {
      const r = await apiFetch(`${SP}/items/`, { method: "DELETE" });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      load();
    } catch (e) {
      alert(`Errore: ${e.message || e}`);
    }
  };

  const saveEdit = async () => {
    if (!editItem) return;
    try {
      const r = await apiFetch(`${SP}/items/${editItem.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          titolo: editItem.titolo,
          quantita_libera: editItem.quantita_libera,
          fornitore_freeform: editItem.fornitore_freeform,
          note: editItem.note,
          urgente: !!editItem.urgente,
        }),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      setEditItem(null);
      load();
    } catch (e) {
      alert(`Errore: ${e.message || e}`);
    }
  };

  // Raggruppa items per fornitore (con "—" per quelli senza fornitore)
  const itemsByFornitore = useMemo(() => {
    const groups = {};
    items.forEach(it => {
      const k = it.fornitore_freeform || "Senza fornitore";
      if (!groups[k]) groups[k] = [];
      groups[k].push(it);
    });
    return groups;
  }, [items]);

  return (
    <div className="min-h-screen bg-brand-cream">
      <RicetteNav current="spesa" />

      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-5">

        {/* ═══ Header ═══ */}
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3 mb-5">
          <div>
            <h1 className="font-playfair text-2xl sm:text-3xl font-bold text-orange-900 tracking-tight leading-tight">
              🛒 Lista della Spesa
            </h1>
            <p className="text-xs sm:text-sm text-neutral-500 font-medium mt-1">
              Cosa serve in cucina — checklist condivisa
            </p>
          </div>
        </div>

        {/* ═══ KPI ROW ═══ */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
          <KpiTile emoji="📋" value={kpi.tot} label="Totale" sub="in lista"
            bg="bg-white" border="border-neutral-200" text="text-neutral-900" />
          <KpiTile emoji="🛒" value={kpi.da_fare} label="Da comprare" sub="ancora aperti"
            bg="bg-orange-50" border="border-orange-200" text="text-orange-900" />
          <KpiTile emoji="⚡" value={kpi.urgenti_aperti} label="Urgenti" sub="non ancora fatti"
            bg={kpi.urgenti_aperti > 0 ? "bg-red-50" : "bg-emerald-50"}
            border={kpi.urgenti_aperti > 0 ? "border-red-200" : "border-emerald-200"}
            text={kpi.urgenti_aperti > 0 ? "text-red-900" : "text-emerald-900"} />
          <KpiTile emoji="✅" value={kpi.fatti} label="Completati" sub="da svuotare"
            bg="bg-emerald-50" border="border-emerald-200" text="text-emerald-900" />
        </div>

        {/* ═══ FORM AGGIUNGI ═══ */}
        <div className="bg-white rounded-[14px] border border-orange-200 p-4 mb-4"
          style={{ boxShadow: "0 2px 10px rgba(0,0,0,.06)" }}>
          <div className="text-[10px] uppercase tracking-[1.2px] text-orange-700 mb-3 font-bold">
            ➕ Aggiungi voce
          </div>
          <form onSubmit={addItem} className="flex flex-col sm:flex-row gap-2">
            <input
              type="text"
              value={newTitolo}
              onChange={e => setNewTitolo(e.target.value)}
              placeholder="Es. Olio EVO, pancetta, burro chiarificato…"
              className="flex-1 px-3 py-2 rounded-lg border border-neutral-300 text-sm focus:border-orange-400 focus:ring-1 focus:ring-orange-200 min-h-[44px]"
              required
              autoFocus
            />
            <input
              type="text"
              value={newQta}
              onChange={e => setNewQta(e.target.value)}
              placeholder="Quantità"
              className="w-full sm:w-32 px-3 py-2 rounded-lg border border-neutral-300 text-sm focus:border-orange-400 focus:ring-1 focus:ring-orange-200 min-h-[44px]"
            />
            <input
              type="text"
              value={newFornitore}
              onChange={e => setNewFornitore(e.target.value)}
              placeholder="Fornitore"
              className="w-full sm:w-40 px-3 py-2 rounded-lg border border-neutral-300 text-sm focus:border-orange-400 focus:ring-1 focus:ring-orange-200 min-h-[44px]"
            />
            <label className="flex items-center gap-2 px-3 py-2 rounded-lg border border-neutral-300 bg-neutral-50 text-sm cursor-pointer hover:bg-red-50 hover:border-red-200 transition min-h-[44px] select-none">
              <input
                type="checkbox"
                checked={newUrgente}
                onChange={e => setNewUrgente(e.target.checked)}
                className="w-4 h-4 accent-red-600"
              />
              <span className="text-red-700 font-semibold">⚡ Urgente</span>
            </label>
            <button
              type="submit"
              disabled={adding || !newTitolo.trim()}
              className="px-5 py-2 rounded-lg bg-orange-600 text-white text-sm font-bold hover:bg-orange-700 disabled:opacity-40 transition min-h-[44px]"
            >
              {adding ? "…" : "+ Aggiungi"}
            </button>
          </form>
        </div>

        {/* ═══ FILTRI ═══ */}
        <div className="flex flex-wrap items-center gap-2 mb-4">
          <div className="flex rounded-lg border border-neutral-200 overflow-hidden bg-white">
            {[
              { val: "da_fare", label: "Da fare", count: kpi.da_fare },
              { val: "fatti",   label: "Fatti",   count: kpi.fatti },
              { val: "tutti",   label: "Tutti",   count: kpi.tot },
            ].map(f => (
              <button key={f.val}
                onClick={() => setFiltroStato(f.val)}
                className={`px-3 py-1.5 text-xs font-semibold transition ${
                  filtroStato === f.val
                    ? "bg-orange-100 text-orange-900"
                    : "text-neutral-600 hover:bg-neutral-50"
                }`}
              >
                {f.label} <span className="text-[10px] opacity-60 ml-1 tabular-nums">({f.count})</span>
              </button>
            ))}
          </div>

          <button
            onClick={() => setSoloUrgenti(!soloUrgenti)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition ${
              soloUrgenti
                ? "bg-red-100 text-red-900 border-red-300"
                : "bg-white text-neutral-600 border-neutral-200 hover:bg-red-50"
            }`}
          >
            ⚡ Solo urgenti
          </button>

          <input
            type="text"
            value={filtroFornitore}
            onChange={e => setFiltroFornitore(e.target.value)}
            placeholder="Cerca fornitore…"
            className="px-3 py-1.5 rounded-lg border border-neutral-200 text-xs focus:border-orange-400 focus:ring-1 focus:ring-orange-200 w-40"
          />

          <div className="flex-1" />

          {kpi.fatti > 0 && filtroStato !== "da_fare" && (
            <button
              onClick={svuotaCompletati}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-white border border-emerald-200 text-emerald-800 hover:bg-emerald-50 transition"
            >
              🗑 Svuota completati ({kpi.fatti})
            </button>
          )}
        </div>

        {/* ═══ LISTA ═══ */}
        {error && (
          <div className="mb-4 rounded-[14px] border border-red-200 bg-red-50 text-red-800 px-4 py-3 text-sm flex items-center justify-between"
            style={{ boxShadow: "0 2px 10px rgba(0,0,0,.06)" }}>
            <span>⚠ {error}</span>
            <button onClick={load} className="text-xs font-semibold underline">Riprova</button>
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-16">
            <TrgbLoader size={48} label="Caricamento lista…" />
          </div>
        ) : items.length === 0 ? (
          <div className="bg-white rounded-[14px] border border-neutral-200 p-10 text-center"
            style={{ boxShadow: "0 2px 10px rgba(0,0,0,.06)" }}>
            <div className="text-5xl mb-3">🛒</div>
            <p className="text-neutral-700 font-semibold mb-1">
              {filtroStato === "da_fare" ? "Niente da comprare. Tutto a posto!" :
               filtroStato === "fatti" ? "Nessuna voce completata." :
               "Lista vuota — aggiungi la prima voce sopra."}
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {Object.entries(itemsByFornitore).map(([fornitore, group]) => (
              <div key={fornitore}
                className="bg-white rounded-[14px] border border-neutral-200 overflow-hidden"
                style={{ boxShadow: "0 2px 10px rgba(0,0,0,.06)" }}>
                <div className="px-4 py-2 border-b border-neutral-100 bg-orange-50/40 flex items-center justify-between">
                  <span className="text-[11px] font-bold uppercase tracking-[1.2px] text-orange-800">
                    🏷️ {fornitore}
                  </span>
                  <span className="text-[10px] text-neutral-500 tabular-nums">
                    {group.length} voc{group.length === 1 ? "e" : "i"}
                  </span>
                </div>
                <ul>
                  {group.map(it => (
                    <SpesaRow key={it.id} item={it}
                      onToggleFatto={toggleFatto}
                      onToggleUrgente={toggleUrgente}
                      onEdit={() => setEditItem({ ...it })}
                      onDelete={deleteItem}
                    />
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}

        {/* ═══ Footer hint ═══ */}
        <div className="text-[10px] text-neutral-400 text-center pt-6 pb-2">
          Fase 1 MVP testuale · Fase 2 (link ingredienti, generazione da menu) in roadmap
        </div>
      </div>

      {/* ═══ MODALE EDIT ═══ */}
      {editItem && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center justify-center p-0 sm:p-4"
          onClick={() => setEditItem(null)}>
          <div className="bg-white w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl shadow-2xl"
            onClick={e => e.stopPropagation()}>
            <div className="px-5 py-4 border-b border-neutral-200 bg-orange-50 flex items-center justify-between">
              <h3 className="font-playfair font-bold text-lg text-orange-900">Modifica voce</h3>
              <button onClick={() => setEditItem(null)} className="text-neutral-400 hover:text-neutral-700 text-2xl leading-none">&times;</button>
            </div>
            <div className="p-5 space-y-3">
              <div>
                <label className="text-[10px] uppercase tracking-wide text-neutral-500 font-bold block mb-1">Titolo</label>
                <input type="text" value={editItem.titolo || ""}
                  onChange={e => setEditItem({ ...editItem, titolo: e.target.value })}
                  className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-sm focus:border-orange-400 focus:ring-1 focus:ring-orange-200" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] uppercase tracking-wide text-neutral-500 font-bold block mb-1">Quantità</label>
                  <input type="text" value={editItem.quantita_libera || ""}
                    onChange={e => setEditItem({ ...editItem, quantita_libera: e.target.value })}
                    placeholder="es. 5 kg, 2 latte"
                    className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-sm focus:border-orange-400 focus:ring-1 focus:ring-orange-200" />
                </div>
                <div>
                  <label className="text-[10px] uppercase tracking-wide text-neutral-500 font-bold block mb-1">Fornitore</label>
                  <input type="text" value={editItem.fornitore_freeform || ""}
                    onChange={e => setEditItem({ ...editItem, fornitore_freeform: e.target.value })}
                    placeholder="es. METRO"
                    className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-sm focus:border-orange-400 focus:ring-1 focus:ring-orange-200" />
                </div>
              </div>
              <div>
                <label className="text-[10px] uppercase tracking-wide text-neutral-500 font-bold block mb-1">Note</label>
                <textarea value={editItem.note || ""}
                  onChange={e => setEditItem({ ...editItem, note: e.target.value })}
                  rows={2}
                  className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-sm focus:border-orange-400 focus:ring-1 focus:ring-orange-200" />
              </div>
              <label className="flex items-center gap-2 px-3 py-2 rounded-lg border border-neutral-200 bg-neutral-50 cursor-pointer hover:bg-red-50 hover:border-red-200 transition">
                <input type="checkbox" checked={!!editItem.urgente}
                  onChange={e => setEditItem({ ...editItem, urgente: e.target.checked })}
                  className="w-4 h-4 accent-red-600" />
                <span className="text-sm text-red-700 font-semibold">⚡ Urgente</span>
              </label>
            </div>
            <div className="px-5 py-3 border-t border-neutral-200 bg-neutral-50 flex justify-end gap-2">
              <button onClick={() => setEditItem(null)}
                className="px-4 py-2 rounded-lg border border-neutral-300 text-neutral-600 text-sm hover:bg-white transition">
                Annulla
              </button>
              <button onClick={saveEdit}
                className="px-5 py-2 rounded-lg bg-orange-600 text-white text-sm font-bold hover:bg-orange-700 transition">
                Salva
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Sub-components ──────────────────────────────────────────

function KpiTile({ emoji, value, label, sub, bg, border, text }) {
  return (
    <div className={`rounded-[14px] border ${bg} ${border} px-3 py-3 flex items-start gap-3 min-h-[80px]`}
      style={{ boxShadow: "0 2px 10px rgba(0,0,0,.06)" }}>
      <span className="text-[28px] leading-none flex-shrink-0">{emoji}</span>
      <div className="min-w-0 flex-1">
        <div className={`text-2xl font-extrabold tabular-nums leading-none ${text}`}>{value ?? "—"}</div>
        <div className="text-[11px] text-brand-ink font-semibold mt-1 leading-tight">{label}</div>
        {sub && <div className="text-[10px] text-neutral-500 mt-0.5 truncate" title={sub}>{sub}</div>}
      </div>
    </div>
  );
}

function SpesaRow({ item, onToggleFatto, onToggleUrgente, onEdit, onDelete }) {
  const fatto = !!item.fatto;
  const urgente = !!item.urgente;
  return (
    <li className={`flex items-center gap-3 px-4 py-2.5 border-b border-neutral-100 last:border-0 transition ${
      fatto ? "bg-neutral-50/50" : urgente ? "bg-red-50/30" : "hover:bg-orange-50/30"
    }`}>
      {/* Checkbox toggle fatto — touch target 44pt */}
      <button onClick={() => onToggleFatto(item)}
        className={`w-7 h-7 rounded-md border-2 flex items-center justify-center transition flex-shrink-0 ${
          fatto
            ? "bg-emerald-500 border-emerald-500 text-white"
            : "bg-white border-neutral-300 hover:border-orange-400"
        }`}
        aria-label={fatto ? "Segna come da fare" : "Segna come fatto"}
        title={fatto ? "Riapri" : "Spunta come fatto"}
      >
        {fatto && <span className="text-sm font-bold">✓</span>}
      </button>

      {/* Contenuto cliccabile per edit */}
      <button onClick={onEdit}
        className="flex-1 min-w-0 text-left flex flex-col items-start"
      >
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`text-sm font-semibold ${fatto ? "line-through text-neutral-400" : "text-brand-ink"}`}>
            {item.titolo}
          </span>
          {item.quantita_libera && (
            <span className={`text-xs px-1.5 py-0.5 rounded bg-neutral-100 ${fatto ? "text-neutral-400" : "text-neutral-700"}`}>
              {item.quantita_libera}
            </span>
          )}
          {urgente && !fatto && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-red-100 text-red-700 font-bold border border-red-200">
              ⚡ URGENTE
            </span>
          )}
        </div>
        {(item.note || item.created_by) && (
          <div className="text-[10px] text-neutral-400 mt-0.5 truncate w-full">
            {item.note && <span>{item.note}</span>}
            {item.note && item.created_by && <span className="mx-1">·</span>}
            {item.created_by && <span>{item.created_by}</span>}
            <span className="mx-1">·</span>
            <span>{fatto && item.completato_at ? `fatto ${fmtFa(item.completato_at)}` : `aggiunto ${fmtFa(item.created_at)}`}</span>
          </div>
        )}
      </button>

      {/* Azioni rapide */}
      <div className="flex items-center gap-1 flex-shrink-0">
        {!fatto && (
          <button onClick={() => onToggleUrgente(item)}
            className={`w-8 h-8 rounded-md flex items-center justify-center text-sm transition ${
              urgente
                ? "bg-red-100 text-red-700 hover:bg-red-200"
                : "text-neutral-400 hover:bg-red-50 hover:text-red-600"
            }`}
            title={urgente ? "Togli urgente" : "Segna urgente"}
            aria-label="Toggle urgente"
          >
            ⚡
          </button>
        )}
        <button onClick={() => onDelete(item)}
          className="w-8 h-8 rounded-md flex items-center justify-center text-sm text-neutral-400 hover:bg-red-50 hover:text-red-600 transition"
          title="Elimina voce"
          aria-label="Elimina"
        >
          🗑
        </button>
      </div>
    </li>
  );
}
