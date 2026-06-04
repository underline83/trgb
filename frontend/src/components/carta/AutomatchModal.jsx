// frontend/src/components/carta/AutomatchModal.jsx
// Modulo: banca (sub-modulo carta_credito)
// @version: v1.0 (CC.4 D2 — auto-match bulk con anteprima checkbox)
//
// Apre dry_run sul backend (POST /banca/carta/estratti/{id}/automatch?dry_run=true),
// mostra l'anteprima dei match suggeriti con checkbox (auto-selezionati i match
// con score ≥ soglia di settings), permette all'utente di scegliere quali
// applicare, e su conferma chiama l'endpoint in apply mode con la lista mov_ids.
//
// Props:
//   estrattoId: int
//   onClose:    callback per chiudere
//   onApplied:  callback dopo apply OK con risultato { n_applied, n_skipped, ... }

import React, { useEffect, useState } from "react";
import { API_BASE, apiFetch } from "../../config/api";
import { Btn, Modal, StatusBadge } from "../ui";

const CARTA = `${API_BASE}/banca/carta`;

const fmtEUR = (n) =>
  Number(n).toLocaleString("it-IT", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

const fmtDateShort = (iso) => {
  if (!iso) return "—";
  const [, m, d] = iso.split("-");
  return `${d}/${m}`;
};

function ScoreChip({ score }) {
  let tone = "neutral";
  if (score >= 0.85) tone = "success";
  else if (score >= 0.5) tone = "warning";
  else tone = "danger";
  return (
    <StatusBadge tone={tone} size="sm">
      {Math.round(score * 100)}%
    </StatusBadge>
  );
}

export default function AutomatchModal({ estrattoId, onClose, onApplied }) {
  const [phase, setPhase] = useState("loading"); // "loading" | "preview" | "applying" | "done"
  const [preview, setPreview] = useState([]);
  const [selected, setSelected] = useState({}); // {[movimento_id]: bool}
  const [error, setError] = useState("");
  const [applyResult, setApplyResult] = useState(null);

  useEffect(() => {
    loadDryRun();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [estrattoId]);

  async function loadDryRun() {
    setPhase("loading");
    setError("");
    try {
      const res = await apiFetch(
        `${CARTA}/estratti/${estrattoId}/automatch?dry_run=true`,
        { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" }
      );
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j?.detail || `Errore HTTP ${res.status}`);
      }
      const data = await res.json();
      const previewList = data.preview || [];
      setPreview(previewList);
      // Inizializza selected: spuntato di default sopra la soglia auto
      const init = {};
      previewList.forEach((p) => {
        init[p.movimento_id] = !!p.auto_select;
      });
      setSelected(init);
      setPhase("preview");
    } catch (e) {
      setError(e.message || "Errore di rete");
      setPhase("preview");
    }
  }

  function toggle(movId) {
    setSelected((prev) => ({ ...prev, [movId]: !prev[movId] }));
  }

  function selectAll(value) {
    const next = {};
    preview.forEach((p) => {
      next[p.movimento_id] = value;
    });
    setSelected(next);
  }

  async function apply() {
    const mov_ids = preview
      .filter((p) => selected[p.movimento_id])
      .map((p) => p.movimento_id);
    if (mov_ids.length === 0) {
      setError("Seleziona almeno un match da applicare.");
      return;
    }
    setPhase("applying");
    setError("");
    try {
      const res = await apiFetch(
        `${CARTA}/estratti/${estrattoId}/automatch?dry_run=false`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ mov_ids }),
        }
      );
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(j?.detail || `Errore HTTP ${res.status}`);
      }
      setApplyResult(j);
      setPhase("done");
    } catch (e) {
      setError(e.message || "Errore durante l'applicazione");
      setPhase("preview");
    }
  }

  function finish() {
    onApplied?.(applyResult);
    onClose?.();
  }

  // Conteggi
  const nSelected = Object.values(selected).filter(Boolean).length;
  const nAuto = preview.filter((p) => p.auto_select).length;
  const nDeboli = preview.length - nAuto;

  return (
    <Modal
      open
      onClose={phase === "applying" ? undefined : onClose}
      title="Auto-match livello A — anteprima"
      size="2xl"
    >
      {phase === "loading" && (
        <div className="py-10 text-center text-neutral-500 text-sm">
          Cerco candidate per tutti i movimenti dell'estratto...
        </div>
      )}

      {phase !== "loading" && error && (
        <div className="bg-red-50 border border-red-200 text-red-800 rounded-lg px-3 py-2 text-sm mb-3">
          ⚠ {error}
        </div>
      )}

      {phase === "preview" && preview.length === 0 && !error && (
        <div className="py-10 text-center text-sm text-neutral-500">
          <p className="font-medium text-neutral-700 mb-1">
            Nessun candidato trovato
          </p>
          <p className="text-xs">
            Tutti i movimenti di questo estratto sono già riconciliati, oppure non ci sono
            uscite CG con metodo='CARTA' compatibili. Crea le uscite da Fatture
            cliccando "Paga con carta" e riprova.
          </p>
        </div>
      )}

      {phase === "preview" && preview.length > 0 && (
        <>
          {/* Header con conteggi e azioni rapide */}
          <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
            <div className="text-xs text-neutral-600">
              <span className="font-medium">{preview.length}</span> candidate trovate ·
              <StatusBadge tone="success" size="sm" className="ml-1">{nAuto} ≥85%</StatusBadge>
              {nDeboli > 0 && (
                <StatusBadge tone="warning" size="sm" className="ml-1">{nDeboli} sotto soglia</StatusBadge>
              )}
            </div>
            <div className="flex gap-2">
              <Btn size="sm" variant="ghost" onClick={() => selectAll(true)}>
                Tutti
              </Btn>
              <Btn size="sm" variant="ghost" onClick={() => selectAll(false)}>
                Nessuno
              </Btn>
              <Btn
                size="sm"
                variant="ghost"
                onClick={() => {
                  // Solo auto-select (score ≥ soglia)
                  const next = {};
                  preview.forEach((p) => {
                    next[p.movimento_id] = !!p.auto_select;
                  });
                  setSelected(next);
                }}
              >
                Solo ≥85%
              </Btn>
            </div>
          </div>

          <p className="text-[11px] text-neutral-500 mb-2">
            Le righe sopra l'85% sono spuntate di default. Sotto soglia: revisiona prima di applicare.
          </p>

          {/* Tabella anteprima */}
          <div className="border border-neutral-200 rounded-xl overflow-hidden max-h-[480px] overflow-y-auto">
            <table className="w-full text-xs">
              <thead className="bg-neutral-50 border-b border-neutral-200 text-[10px] uppercase tracking-wide text-neutral-500 sticky top-0">
                <tr>
                  <th className="px-3 py-2 w-8"></th>
                  <th className="text-left px-3 py-2 font-medium">Score</th>
                  <th className="text-left px-3 py-2 font-medium">Movimento carta</th>
                  <th className="px-2 py-2 text-neutral-400">→</th>
                  <th className="text-left px-3 py-2 font-medium">Uscita CG</th>
                </tr>
              </thead>
              <tbody>
                {preview.map((p) => {
                  const isChecked = !!selected[p.movimento_id];
                  return (
                    <tr
                      key={p.movimento_id}
                      className={`border-b border-neutral-100 last:border-b-0 ${
                        isChecked ? "bg-emerald-50/40" : ""
                      } hover:bg-neutral-50`}
                    >
                      <td className="px-3 py-2 text-center">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => toggle(p.movimento_id)}
                          className="w-4 h-4 cursor-pointer accent-emerald-600"
                        />
                      </td>
                      <td className="px-3 py-2">
                        <ScoreChip score={p.score} />
                        <div className="flex gap-1 mt-0.5 text-[9px] text-neutral-400">
                          <span title="Score importo">€{Math.round(p.imp_score * 100)}</span>
                          <span>·</span>
                          <span title="Score data">📅{Math.round(p.data_score * 100)}</span>
                          <span>·</span>
                          <span title="Score fornitore">🏷{Math.round(p.forn_score * 100)}</span>
                        </div>
                      </td>
                      <td className="px-3 py-2">
                        <p
                          className="font-medium text-neutral-800 truncate max-w-[180px]"
                          title={p.mov_descrizione}
                        >
                          {p.mov_descrizione}
                        </p>
                        <p className="text-[10px] text-neutral-500 tabular-nums">
                          {fmtDateShort(p.mov_data)} · {fmtEUR(p.mov_importo)}
                        </p>
                      </td>
                      <td className="px-2 py-2 text-center text-neutral-300">→</td>
                      <td className="px-3 py-2">
                        <p
                          className="font-medium text-neutral-800 truncate max-w-[180px]"
                          title={p.uscita_fornitore}
                        >
                          {p.uscita_fornitore || "—"}
                        </p>
                        <p className="text-[10px] text-neutral-500 tabular-nums">
                          #{p.uscita_id} · {fmtDateShort(p.uscita_data_pagamento)} · {fmtEUR(p.uscita_totale)}
                        </p>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      {phase === "applying" && (
        <div className="py-10 text-center text-neutral-500 text-sm">
          Applico {nSelected} match...
        </div>
      )}

      {phase === "done" && applyResult && (
        <div className="py-6">
          <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3 mb-3">
            <p className="font-semibold text-emerald-800">
              ✓ {applyResult.n_applied} match applicati
            </p>
            {applyResult.n_skipped > 0 && (
              <p className="text-xs text-emerald-700 mt-1">
                {applyResult.n_skipped} scartati durante l'apply (probabilmente già linkati nel frattempo).
              </p>
            )}
          </div>
          {applyResult.applied && applyResult.applied.length > 0 && (
            <details className="text-xs text-neutral-600">
              <summary className="cursor-pointer text-neutral-500">Dettagli applicati</summary>
              <ul className="mt-2 space-y-0.5 ml-4 list-disc">
                {applyResult.applied.map((a) => (
                  <li key={a.movimento_id}>
                    mov #{a.movimento_id} → uscita #{a.uscita_id} ({Math.round(a.score * 100)}%)
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}

      {/* FOOTER */}
      <div className="flex justify-between items-center mt-4 pt-3 border-t border-neutral-200 gap-2">
        {phase === "preview" && preview.length > 0 && (
          <p className="text-[11px] text-neutral-500">
            {nSelected} di {preview.length} selezionati
          </p>
        )}
        <div className="flex gap-2 ml-auto">
          {phase === "preview" && preview.length > 0 && (
            <>
              <Btn variant="ghost" onClick={onClose}>Annulla</Btn>
              <Btn
                variant="primary"
                onClick={apply}
                disabled={nSelected === 0}
              >
                Applica {nSelected > 0 ? nSelected : ""} match
              </Btn>
            </>
          )}
          {(phase === "preview" && preview.length === 0) && (
            <Btn variant="ghost" onClick={onClose}>Chiudi</Btn>
          )}
          {phase === "done" && (
            <Btn variant="primary" onClick={finish}>Chiudi</Btn>
          )}
        </div>
      </div>
    </Modal>
  );
}
