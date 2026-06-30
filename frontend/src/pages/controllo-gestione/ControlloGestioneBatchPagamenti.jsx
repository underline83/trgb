// frontend/src/pages/controllo-gestione/ControlloGestioneBatchPagamenti.jsx
// Modulo: controllo_gestione
// @version: v1.0 (BP.2 + BP.3 — lista batch + dettaglio + azioni)
//
// Pagina dedicata alla gestione dei batch di pagamento.
// - Lista filtrabile per stato (IN_PAGAMENTO | INVIATO_CONTABILE | CHIUSO)
// - Click su batch → vista dettaglio inline
// - Dettaglio: tabella uscite + bottoni Rimuovi singola / Invia / Chiudi / Elimina batch
// - Bottone bulk "Auto-chiudi batch completati"

import React, { useEffect, useState, useCallback } from "react";
import ControlloGestioneNav from "./ControlloGestioneNav";
import { API_BASE, apiFetch } from "../../config/api";
import { Btn, StatusBadge } from "../../components/ui";
import TrgbLoader from "../../components/TrgbLoader";

const CG = `${API_BASE}/controllo-gestione`;

const fmtEUR = (n) =>
  n == null ? "—" : Number(n).toLocaleString("it-IT", {
    style: "currency", currency: "EUR",
    minimumFractionDigits: 2, maximumFractionDigits: 2,
  });

const fmtDate = (d) => {
  if (!d) return "—";
  try {
    const dt = new Date(String(d).slice(0, 10) + "T00:00:00");
    if (isNaN(dt.getTime())) return d;
    return dt.toLocaleDateString("it-IT", { day: "2-digit", month: "short", year: "2-digit" });
  } catch { return d; }
};

const fmtDateTime = (d) => {
  if (!d) return "—";
  try {
    const dt = new Date(String(d).replace(" ", "T"));
    if (isNaN(dt.getTime())) return d;
    return dt.toLocaleString("it-IT", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" });
  } catch { return d; }
};

const STATI = [
  { key: "IN_PAGAMENTO",     label: "In pagamento", tone: "warning", icon: "🖨" },
  { key: "INVIATO_CONTABILE", label: "Inviato",     tone: "info",    icon: "📨" },
  { key: "CHIUSO",            label: "Chiuso",      tone: "success", icon: "✓" },
];

// ──────────────────────────────────────────────────────────────────────

export default function ControlloGestioneBatchPagamenti() {
  const [statoSel, setStatoSel] = useState("IN_PAGAMENTO");
  const [batch, setBatch] = useState([]);
  const [counts, setCounts] = useState({ IN_PAGAMENTO: 0, INVIATO_CONTABILE: 0, CHIUSO: 0 });
  const [selectedId, setSelectedId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [autoClosing, setAutoClosing] = useState(false);

  const loadList = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      // Carica solo lo stato selezionato
      const r1 = await apiFetch(`${CG}/pagamenti-batch?stato=${statoSel}`);
      if (!r1.ok) throw new Error(`HTTP ${r1.status}`);
      const d1 = await r1.json();
      setBatch(d1.batch || []);

      // Carica counter per ognuno dei 3 stati (chiamate parallele)
      const counters = await Promise.all(
        STATI.map(s => apiFetch(`${CG}/pagamenti-batch?stato=${s.key}`)
          .then(r => r.ok ? r.json() : { batch: [] })
          .then(d => [s.key, (d.batch || []).length])
        )
      );
      const newCounts = Object.fromEntries(counters);
      setCounts(prev => ({ ...prev, ...newCounts }));
    } catch (e) {
      setError(e.message || "Errore caricamento");
    } finally {
      setLoading(false);
    }
  }, [statoSel]);

  useEffect(() => { loadList(); }, [loadList]);

  async function handleAutoCloseAll() {
    if (!window.confirm("Auto-chiudi tutti i batch dove tutte le uscite sono già state pagate?")) return;
    setAutoClosing(true);
    setError(""); setInfo("");
    try {
      const r = await apiFetch(`${CG}/pagamenti-batch/auto-close-all`, { method: "POST" });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d?.detail || `HTTP ${r.status}`);
      setInfo(`Auto-close completato: ${d.n_chiusi} batch chiusi, ${d.n_skipped} saltati (ancora con uscite aperte).`);
      await loadList();
    } catch (e) {
      setError(e.message || "Errore");
    } finally {
      setAutoClosing(false);
    }
  }

  // ──────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-brand-cream">
      <ControlloGestioneNav current="batch-pagamenti" />

      <div className="max-w-7xl mx-auto p-4 sm:p-6">
        {/* HEADER */}
        <div className="flex items-start justify-between mb-4 flex-wrap gap-3">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-brand-ink tracking-tight">
              Batch pagamenti
            </h1>
            <p className="text-sm text-neutral-500 mt-1">
              Gestione dei batch di pagamento creati dallo scadenzario. Da qui invii al contabile, chiudi i batch completati, rimuovi singole uscite.
            </p>
          </div>
          <Btn
            variant="secondary"
            size="sm"
            loading={autoClosing}
            onClick={handleAutoCloseAll}
            disabled={autoClosing}
          >
            ✓ Auto-chiudi batch completati
          </Btn>
        </div>

        {/* ALERT */}
        {error && (
          <div className="mb-3 bg-red-50 border border-red-200 text-red-800 rounded-xl px-4 py-3 text-sm">
            ⚠ {error}
            <button onClick={() => setError("")} className="float-right text-red-600 hover:text-red-800">×</button>
          </div>
        )}
        {info && (
          <div className="mb-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl px-4 py-3 text-sm">
            ✓ {info}
            <button onClick={() => setInfo("")} className="float-right text-emerald-700 hover:text-emerald-900">×</button>
          </div>
        )}

        {/* TAB STATI */}
        <div className="bg-white rounded-2xl shadow-lg border border-neutral-200 p-2 mb-4 inline-flex gap-1 flex-wrap">
          {STATI.map(s => {
            const active = statoSel === s.key;
            return (
              <button
                key={s.key}
                onClick={() => { setStatoSel(s.key); setSelectedId(null); }}
                className={`px-3 py-2 rounded-lg text-sm font-medium transition flex items-center gap-2 ${
                  active
                    ? "bg-sky-100 text-sky-900 shadow-sm"
                    : "text-neutral-600 hover:bg-neutral-100"
                }`}
              >
                <span>{s.icon}</span>
                <span>{s.label}</span>
                <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${active ? "bg-sky-200 text-sky-800" : "bg-neutral-200 text-neutral-600"}`}>
                  {counts[s.key] ?? 0}
                </span>
              </button>
            );
          })}
        </div>

        {/* CONTENT */}
        {selectedId ? (
          <BatchDetail
            batchId={selectedId}
            onClose={() => { setSelectedId(null); loadList(); }}
            onAfterAction={loadList}
            setError={setError}
            setInfo={setInfo}
          />
        ) : loading ? (
          <div className="py-12"><TrgbLoader label="Caricamento batch..." /></div>
        ) : batch.length === 0 ? (
          <div className="bg-white rounded-2xl shadow-lg border border-neutral-200 p-8 text-center text-sm text-neutral-500">
            Nessun batch in stato "{STATI.find(s => s.key === statoSel)?.label}".
          </div>
        ) : (
          <BatchList batch={batch} onSelect={setSelectedId} />
        )}
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────
// Lista batch
// ──────────────────────────────────────────────────────────────

function BatchList({ batch, onSelect }) {
  return (
    <div className="bg-white rounded-2xl shadow-lg border border-neutral-200 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-neutral-50 border-b border-neutral-200 text-[11px] uppercase tracking-wide text-neutral-500">
            <tr>
              <th className="text-left px-4 py-3 font-medium">Titolo</th>
              <th className="text-left px-4 py-3 font-medium">Creato</th>
              <th className="text-right px-4 py-3 font-medium">Uscite</th>
              <th className="text-right px-4 py-3 font-medium">Totale</th>
              <th className="text-left px-4 py-3 font-medium">Inviato</th>
              <th className="text-left px-4 py-3 font-medium">Chiuso</th>
              <th className="text-right px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {batch.map(b => (
              <tr
                key={b.id}
                onClick={() => onSelect(b.id)}
                className="border-b border-neutral-100 hover:bg-sky-50 cursor-pointer transition"
              >
                <td className="px-4 py-3">
                  <div className="font-medium text-neutral-800">{b.titolo}</div>
                  <div className="text-[10px] text-neutral-400">#{b.id}</div>
                </td>
                <td className="px-4 py-3 text-neutral-500 text-xs">{fmtDateTime(b.created_at)}</td>
                <td className="px-4 py-3 text-right tabular-nums">{b.n_uscite}</td>
                <td className="px-4 py-3 text-right tabular-nums font-medium">{fmtEUR(b.totale)}</td>
                <td className="px-4 py-3 text-xs text-neutral-500">{b.inviato_contabile_at ? fmtDate(b.inviato_contabile_at) : "—"}</td>
                <td className="px-4 py-3 text-xs text-neutral-500">{b.chiuso_at ? fmtDate(b.chiuso_at) : "—"}</td>
                <td className="px-4 py-3 text-right">
                  <span className="text-sky-700 text-xs">Apri →</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────
// Dettaglio batch
// ──────────────────────────────────────────────────────────────

function BatchDetail({ batchId, onClose, onAfterAction, setError, setInfo }) {
  const [batch, setBatch] = useState(null);
  const [loading, setLoading] = useState(true);
  const [savingAction, setSavingAction] = useState(null); // 'invia' | 'chiudi' | 'elimina' | 'auto-close'
  const [removingId, setRemovingId] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await apiFetch(`${CG}/pagamenti-batch/${batchId}`);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      setBatch(await r.json());
    } catch (e) {
      setError(e.message || "Errore caricamento dettaglio");
    } finally {
      setLoading(false);
    }
  }, [batchId, setError]);

  useEffect(() => { load(); }, [load]);

  async function transitTo(newStato) {
    const label = newStato === "INVIATO_CONTABILE" ? "Inviato al contabile" : newStato === "CHIUSO" ? "Chiuso" : newStato;
    if (!window.confirm(`Marcare il batch come "${label}"?`)) return;
    setSavingAction(newStato);
    try {
      const r = await apiFetch(`${CG}/pagamenti-batch/${batchId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stato: newStato }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok || d?.ok === false) throw new Error(d?.error || `HTTP ${r.status}`);
      setInfo(`Batch marcato "${label}".`);
      await load();
      onAfterAction?.();
    } catch (e) {
      setError(e.message || "Errore");
    } finally {
      setSavingAction(null);
    }
  }

  async function autoClose() {
    setSavingAction("auto-close");
    try {
      const r = await apiFetch(`${CG}/pagamenti-batch/${batchId}/auto-close`, { method: "POST" });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d?.detail || `HTTP ${r.status}`);
      if (d.chiuso) {
        setInfo(`Batch chiuso (${d.n_tot ?? 0} uscite, tutte pagate).`);
        await load();
        onAfterAction?.();
      } else {
        setError(`Impossibile chiudere: ${d.motivo || "—"}`);
      }
    } catch (e) {
      setError(e.message || "Errore");
    } finally {
      setSavingAction(null);
    }
  }

  async function eliminaBatch() {
    if (!window.confirm("Eliminare il batch?\nLe uscite verranno scollegate (NON cancellate), il batch sparirà.")) return;
    setSavingAction("elimina");
    try {
      const r = await apiFetch(`${CG}/pagamenti-batch/${batchId}`, { method: "DELETE" });
      const d = await r.json().catch(() => ({}));
      if (!r.ok || d?.ok === false) throw new Error(d?.error || `HTTP ${r.status}`);
      setInfo("Batch eliminato.");
      onClose();
    } catch (e) {
      setError(e.message || "Errore");
      setSavingAction(null);
    }
  }

  async function rimuoviUscita(uscitaId, nomeFornitore) {
    if (!window.confirm(`Rimuovere "${nomeFornitore}" dal batch?\nL'uscita torna nello scadenzario come da pagare.`)) return;
    setRemovingId(uscitaId);
    try {
      const r = await apiFetch(`${CG}/pagamenti-batch/${batchId}/uscite/${uscitaId}`, { method: "DELETE" });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d?.detail || `HTTP ${r.status}`);
      setInfo(`Uscita rimossa dal batch (${d.n_uscite_rimanenti ?? 0} rimanenti).`);
      if (d.batch_vuoto) {
        // Batch svuotato: ricarico la lista padre e chiudo
        onClose();
      } else {
        await load();
        onAfterAction?.();
      }
    } catch (e) {
      setError(e.message || "Errore");
    } finally {
      setRemovingId(null);
    }
  }

  if (loading || !batch) {
    return <div className="py-12"><TrgbLoader label="Caricamento dettaglio..." /></div>;
  }

  const stato = STATI.find(s => s.key === batch.stato);
  const uscite = batch.uscite || [];

  return (
    <div className="space-y-4">
      {/* Header dettaglio */}
      <div className="bg-white rounded-2xl shadow-lg border border-neutral-200 px-5 py-4">
        <div className="flex items-start justify-between flex-wrap gap-3 mb-3">
          <div>
            <button onClick={onClose} className="text-xs text-sky-600 hover:text-sky-800 mb-1">← Torna alla lista</button>
            <h2 className="text-lg font-bold text-brand-ink">{batch.titolo}</h2>
            <p className="text-xs text-neutral-500 mt-0.5">
              #{batch.id} · creato {fmtDateTime(batch.created_at)}
              {batch.inviato_contabile_at && ` · inviato ${fmtDateTime(batch.inviato_contabile_at)}`}
              {batch.chiuso_at && ` · chiuso ${fmtDateTime(batch.chiuso_at)}`}
            </p>
          </div>
          <StatusBadge tone={stato?.tone || "neutral"} size="lg">
            {stato?.icon} {stato?.label || batch.stato}
          </StatusBadge>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Stat label="Uscite" value={uscite.length} sub={`(header: ${batch.n_uscite})`} />
          <Stat label="Totale" value={fmtEUR(batch.totale)} />
          <Stat label="Pagate" value={`${uscite.filter(u => ["PAGATO","PAGATO_MANUALE"].includes(u.stato)).length} / ${uscite.length}`} />
          <Stat label="Stato" value={stato?.label || batch.stato} />
        </div>

        {batch.note && (
          <div className="mt-3 bg-amber-50 border-l-4 border-amber-300 px-3 py-2 text-xs text-amber-900">
            <strong>Note:</strong> {batch.note}
          </div>
        )}

        {/* Azioni stato */}
        <div className="mt-4 pt-3 border-t border-neutral-100 flex flex-wrap gap-2">
          {batch.stato === "IN_PAGAMENTO" && (
            <Btn variant="primary" size="sm" loading={savingAction === "INVIATO_CONTABILE"} onClick={() => transitTo("INVIATO_CONTABILE")}>
              📨 Invia al contabile
            </Btn>
          )}
          {batch.stato !== "CHIUSO" && (
            <>
              <Btn variant="success" size="sm" loading={savingAction === "CHIUSO"} onClick={() => transitTo("CHIUSO")}>
                ✓ Chiudi batch
              </Btn>
              <Btn variant="chip" tone="emerald" size="sm" loading={savingAction === "auto-close"} onClick={autoClose}>
                Auto-chiudi (se completato)
              </Btn>
            </>
          )}
          <Btn variant="chip" tone="red" size="sm" loading={savingAction === "elimina"} onClick={eliminaBatch}>
            🗑 Elimina batch
          </Btn>
        </div>
      </div>

      {/* Tabella uscite */}
      <div className="bg-white rounded-2xl shadow-lg border border-neutral-200 overflow-hidden">
        <div className="px-5 py-3 border-b border-neutral-200 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-neutral-700">Uscite nel batch ({uscite.length})</h3>
          {uscite.length === 0 && batch.n_uscite > 0 && (
            <span className="text-xs text-emerald-700">Tutte le uscite originali sono state pagate e sganciate</span>
          )}
        </div>
        {uscite.length === 0 ? (
          <div className="p-6 text-center text-sm text-neutral-500">
            {batch.n_uscite > 0
              ? "Le uscite originali sono state pagate (pagamento_batch_id si azzera al pagamento). Puoi chiudere il batch."
              : "Nessuna uscita."}
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-neutral-50 border-b border-neutral-200 text-[11px] uppercase tracking-wide text-neutral-500">
              <tr>
                <th className="text-left px-3 py-2 font-medium">Scadenza</th>
                <th className="text-left px-3 py-2 font-medium">Fornitore / Descrizione</th>
                <th className="text-left px-3 py-2 font-medium">Tipo</th>
                <th className="text-right px-3 py-2 font-medium">Importo</th>
                <th className="text-center px-3 py-2 font-medium">Stato</th>
                <th className="text-right px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {uscite.map(u => {
                const pagata = ["PAGATO","PAGATO_MANUALE"].includes(u.stato);
                return (
                  <tr key={u.id} className="border-b border-neutral-100 hover:bg-neutral-50">
                    <td className="px-3 py-2 text-xs text-neutral-600 whitespace-nowrap">{fmtDate(u.data_scadenza)}</td>
                    <td className="px-3 py-2">
                      <div className="font-medium text-neutral-800">{u.fornitore_nome}</div>
                      <div className="text-[11px] text-neutral-500">
                        {u.numero_fattura && u.numero_fattura !== "—" ? `n. ${u.numero_fattura}` : (u.periodo_riferimento || u.sf_titolo || "")}
                      </div>
                    </td>
                    <td className="px-3 py-2 text-xs text-neutral-500">{u.tipo_uscita}</td>
                    <td className="px-3 py-2 text-right tabular-nums font-medium">
                      {fmtEUR((u.totale ?? 0) - (u.importo_pagato ?? 0))}
                    </td>
                    <td className="px-3 py-2 text-center">
                      <StatusBadge tone={pagata ? "success" : "warning"} size="sm">{u.stato}</StatusBadge>
                    </td>
                    <td className="px-3 py-2 text-right">
                      {!pagata && batch.stato !== "CHIUSO" && (
                        <Btn
                          size="sm"
                          variant="chip"
                          tone="red"
                          loading={removingId === u.id}
                          onClick={() => rimuoviUscita(u.id, u.fornitore_nome)}
                        >
                          ✕ Rimuovi
                        </Btn>
                      )}
                      {pagata && (
                        <span className="text-[10px] text-neutral-400">— già pagata</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Nota informativa */}
      <p className="text-[11px] text-neutral-500 px-1">
        Tip: "Auto-chiudi (se completato)" chiude solo se tutte le uscite originali del batch sono state pagate.
        Quando un'uscita viene pagata via riconciliazione bancaria, viene automaticamente sganciata dal batch (pagamento_batch_id → NULL).
      </p>
    </div>
  );
}

function Stat({ label, value, sub }) {
  return (
    <div className="bg-neutral-50 rounded-lg px-3 py-2">
      <div className="text-[10px] uppercase tracking-wide text-neutral-500">{label}</div>
      <div className="text-base font-bold text-brand-ink tabular-nums mt-0.5">{value}</div>
      {sub && <div className="text-[10px] text-neutral-400">{sub}</div>}
    </div>
  );
}
