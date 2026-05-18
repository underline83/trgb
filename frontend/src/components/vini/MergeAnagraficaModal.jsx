// Modulo: vini
// src/components/vini/MergeAnagraficaModal.jsx
//
// M2.5.5 (2026-05-16) — Modale generico di merge anagrafiche. Sostituisce le 4
// implementazioni separate (MergeProduttoriModal, MergeDistributoriModal,
// MergeDenominazioniModal, MergeVitigniModal) che erano quasi identiche con
// solo variazioni di palette, label e conteggio.
//
// Tutti i merge anagrafiche seguono lo stesso pattern:
//   POST /vini/anagrafiche/{kind}/{source.id}/merge?target_id={target.id}
//   - source: l'item che viene ELIMINATO
//   - target: dove confluiscono le entità collegate
//   - response: { source_id, target_id, n_*_spostati|n_bottiglie_modificate, ... }
//
// Props:
//   kind:              "produttori" | "fornitori" | "denominazioni" | "vitigni"
//   palette:           "amber" | "blue" | "violet" | "emerald"
//   source:            l'oggetto sorgente (deve avere id + nome)
//   candidates:        lista candidati per il target (escludendo già la source)
//   countField:        nome del campo numerico da mostrare per ogni candidato
//                      (es. "n_madre" o "n_bottiglie")
//   countLabel:        label umano del countField (es. "vini madre", "bottiglie")
//   reportField:       nome del campo nel response del backend per il conteggio
//                      di righe modificate (es. "n_madre_spostati"
//                      | "n_bottiglie_modificate")
//   reportLabel:       label per l'alert finale (es. "vini madre spostati")
//   renderSubtitle:    funzione opzionale (item) => string per mostrare info extra
//                      sotto al nome (es. rappresentante per i distributori,
//                      codice eAmbrosia per le denominazioni)
//   onClose, onDone

import React, { useMemo, useState } from "react";
import { API_BASE, apiFetch } from "../../config/api";

const PALETTES = {
  amber:   { ring: "focus:ring-amber-300",   btn: "bg-amber-700 hover:bg-amber-800",     border: "border-amber-200",   from: "from-amber-50",   text: "text-amber-900" },
  blue:    { ring: "focus:ring-blue-300",    btn: "bg-blue-700 hover:bg-blue-800",       border: "border-blue-200",    from: "from-blue-50",    text: "text-blue-900" },
  violet:  { ring: "focus:ring-violet-300",  btn: "bg-violet-700 hover:bg-violet-800",   border: "border-violet-200",  from: "from-violet-50",  text: "text-violet-900" },
  emerald: { ring: "focus:ring-emerald-300", btn: "bg-emerald-700 hover:bg-emerald-800", border: "border-emerald-200", from: "from-emerald-50", text: "text-emerald-900" },
};

const TITLES = {
  produttori:    "🔀 Fondi produttore",
  fornitori:     "🔀 Fondi distributore",
  denominazioni: "🔀 Fondi denominazione",
  vitigni:       "🔀 Fondi vitigno",
};
const SUBTITLES = {
  produttori:    "Sposta i vini madre della sorgente nella destinazione, poi elimina la sorgente.",
  fornitori:     "Sposta tutti i vini distribuiti nella destinazione, poi elimina la sorgente.",
  denominazioni: "Sposta tutti i vini madre alla destinazione, poi elimina la sorgente. Tipico: una manuale che il sync ha poi portato come ufficiale.",
  vitigni:       "Sostituisce il vitigno sorgente con quello di destinazione su tutti i 5 slot di tutte le bottiglie. Tipico: duplicati di case (Nebbiolo vs nebbiolo).",
};

export default function MergeAnagraficaModal({
  kind,
  palette = "amber",
  source,
  candidates,
  countField = "n_madre",
  countLabel = "vini madre",
  reportField = "n_madre_spostati",
  reportLabel = "vini madre spostati",
  renderSubtitle,
  onClose,
  onDone,
}) {
  const p = PALETTES[palette] || PALETTES.amber;
  const [search, setSearch] = useState("");
  const [targetId, setTargetId] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const arr = q
      ? candidates.filter(c => `${c.nome || ""} ${c.tipo || ""} ${c.codice_eambrosia || ""} ${c.rappresentante_nome || ""}`.toLowerCase().includes(q))
      : candidates;
    return arr.slice(0, 50);
  }, [search, candidates]);

  const target = candidates.find(c => c.id === targetId) || null;

  const doMerge = async () => {
    if (!target) return;
    const srcLabel = source.nome + (source.tipo ? ` ${source.tipo}` : "");
    const tgtLabel = target.nome + (target.tipo ? ` ${target.tipo}` : "");
    if (!window.confirm(
      `Confermare il merge?\n\n` +
      `SORGENTE: #${source.id} ${srcLabel} (${source[countField] || 0} ${countLabel})\n` +
      `DESTINAZIONE: #${target.id} ${tgtLabel}\n\n` +
      `Le entità collegate alla sorgente passeranno alla destinazione. ` +
      `La sorgente verrà ELIMINATA. Operazione irreversibile.`
    )) return;
    setBusy(true); setError("");
    try {
      const url = `${API_BASE}/vini/anagrafiche/${kind}/${source.id}/merge?target_id=${target.id}`;
      const r = await apiFetch(url, { method: "POST" });
      if (!r.ok) {
        const err = await r.json().catch(() => ({ detail: r.statusText }));
        throw new Error(err.detail || "errore");
      }
      const report = await r.json();
      alert(`✓ Merge completato.\n${report[reportField] || 0} ${reportLabel}.`);
      onDone();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const renderItemSubtitle = (item) => {
    if (renderSubtitle) return renderSubtitle(item);
    // Fallback: per default mostriamo countField + nazione/regione se ci sono.
    const parts = [];
    if (item[countField] != null) parts.push(`${item[countField]} ${countLabel}`);
    if (item.nazione) parts.push(item.nazione);
    if (item.regione) parts.push(item.regione);
    return parts.filter(Boolean).join(" · ") || "—";
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-3xl shadow-2xl max-w-2xl w-full max-h-[85vh] overflow-hidden flex flex-col"
           onClick={e => e.stopPropagation()}>
        <div className={`px-5 py-3 border-b ${p.border} bg-gradient-to-r ${p.from} to-white`}>
          <h3 className={`text-base font-bold ${p.text}`}>{TITLES[kind] || "🔀 Fondi anagrafica"}</h3>
          <p className="text-xs text-neutral-600 mt-1">{SUBTITLES[kind] || ""}</p>
        </div>

        <div className="px-5 py-3 grid grid-cols-2 gap-3 border-b border-neutral-200 bg-neutral-50">
          <div>
            <div className="text-[10px] uppercase tracking-wider text-rose-700 font-semibold">Sorgente (sarà eliminata)</div>
            <div className="text-sm font-bold text-neutral-900">#{source.id} {source.nome}{source.tipo ? ` ${source.tipo}` : ""}</div>
            <div className="text-xs text-neutral-600 mt-0.5">{renderItemSubtitle(source)}</div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wider text-emerald-700 font-semibold">Destinazione</div>
            {target ? (
              <>
                <div className="text-sm font-bold text-neutral-900">#{target.id} {target.nome}{target.tipo ? ` ${target.tipo}` : ""}</div>
                <div className="text-xs text-neutral-600 mt-0.5">{renderItemSubtitle(target)}</div>
              </>
            ) : (
              <div className="text-sm text-neutral-400 italic">— seleziona dalla lista —</div>
            )}
          </div>
        </div>

        <div className="px-5 py-2 border-b border-neutral-200">
          <input type="text" placeholder="Cerca destinazione…"
            value={search} onChange={e => setSearch(e.target.value)}
            className={`w-full px-3 py-1.5 rounded-lg border border-neutral-300 text-sm focus:outline-none focus:ring-2 ${p.ring}`} />
        </div>

        <div className="flex-1 overflow-auto">
          <table className="w-full text-sm">
            <thead className="bg-neutral-50 text-[10px] uppercase tracking-wider text-neutral-600 sticky top-0">
              <tr>
                <th className="px-3 py-1.5 text-left w-10"></th>
                <th className="px-3 py-1.5 text-left w-12">ID</th>
                <th className="px-3 py-1.5 text-left">Nome</th>
                <th className="px-3 py-1.5 text-right">{countLabel}</th>
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
                    <span className="font-semibold">{c.nome}{c.tipo ? ` ${c.tipo}` : ""}</span>
                    {renderSubtitle && (
                      <div className="text-[10px] text-neutral-500 mt-0.5">{renderSubtitle(c)}</div>
                    )}
                  </td>
                  <td className="px-3 py-1 text-right tabular-nums">{c[countField] || 0}</td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={4} className="px-3 py-6 text-center text-neutral-500 text-xs">Nessun candidato. Affina la ricerca.</td></tr>
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
            className={`px-5 py-1.5 rounded-lg ${p.btn} text-white text-sm font-semibold disabled:opacity-40`}>
            {busy ? "Merge in corso…" : `Fondi → #${target?.id || "?"}`}
          </button>
        </div>
      </div>
    </div>
  );
}
