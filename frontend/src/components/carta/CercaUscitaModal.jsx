// frontend/src/components/carta/CercaUscitaModal.jsx
// Modulo: banca (sub-modulo carta_credito)
// @version: v1.0 (CC.4 — match manuale livello A)
//
// Modale per riconciliare manualmente un singolo movimento carta a un'uscita CG.
// Carica i candidati via GET /banca/carta/movimenti/{id}/candidati con
// algoritmo di scoring del backend, mostra lista ordinata, click su una
// candidata → POST /link → success → onMatched().
//
// Props:
//   movimento: oggetto movimento sorgente (id, data_operazione, descrizione, importo)
//   onClose:   chiamato per chiudere la modale
//   onMatched: chiamato dopo POST /link OK, per ricaricare la lista padre

import React, { useEffect, useState, useCallback } from "react";
import { API_BASE, apiFetch } from "../../config/api";
import { Btn, Modal, StatusBadge, TextInput } from "../ui";

const CARTA = `${API_BASE}/banca/carta`;

const fmtEUR = (n) =>
  Number(n).toLocaleString("it-IT", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

const fmtDate = (iso) => {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
};

// Chip score color-coded
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

// Breakdown chip mini (importo / data / fornitore)
function Breakdown({ imp, data, forn }) {
  return (
    <div className="flex gap-1 text-[10px] text-neutral-500">
      <span title="Score importo">€{Math.round(imp * 100)}</span>
      <span>·</span>
      <span title="Score data">📅{Math.round(data * 100)}</span>
      <span>·</span>
      <span title="Score fornitore">🏷{Math.round(forn * 100)}</span>
    </div>
  );
}

export default function CercaUscitaModal({ movimento, onClose, onMatched }) {
  const [candidati, setCandidati] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [linking, setLinking] = useState(null); // uscita_id in fase di link

  const loadCandidati = useCallback(async (searchTerm = "") => {
    if (!movimento) return;
    setLoading(true);
    setError("");
    try {
      const url = new URL(`${CARTA}/movimenti/${movimento.id}/candidati`);
      if (searchTerm) url.searchParams.set("search", searchTerm);
      const res = await apiFetch(url.toString());
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j?.detail || `Errore HTTP ${res.status}`);
      }
      const data = await res.json();
      setCandidati(data.candidati || []);
    } catch (e) {
      setError(e.message || "Errore di rete");
    } finally {
      setLoading(false);
    }
  }, [movimento]);

  useEffect(() => {
    loadCandidati();
  }, [loadCandidati]);

  async function linkTo(uscita_id) {
    setLinking(uscita_id);
    setError("");
    try {
      const res = await apiFetch(`${CARTA}/movimenti/${movimento.id}/link`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ uscita_id }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(j?.detail || `Errore HTTP ${res.status}`);
      }
      onMatched?.(j);
      onClose?.();
    } catch (e) {
      setError(e.message || "Errore durante il match");
    } finally {
      setLinking(null);
    }
  }

  // Submit ricerca con Enter
  function onSearchKey(e) {
    if (e.key === "Enter") {
      e.preventDefault();
      loadCandidati(search);
    }
  }

  if (!movimento) return null;

  return (
    <Modal open onClose={onClose} title="Cerca uscita CG da riconciliare" size="xl">
      {/* MOVIMENTO SORGENTE */}
      <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 mb-4">
        <div className="text-[10px] uppercase tracking-wide text-amber-700 font-semibold mb-1">
          Movimento carta
        </div>
        <div className="flex items-baseline justify-between gap-3 flex-wrap">
          <div className="min-w-0">
            <p className="font-semibold text-neutral-800 truncate">
              {movimento.descrizione}
            </p>
            <p className="text-xs text-neutral-500 mt-0.5">
              {fmtDate(movimento.data_operazione)}
              {movimento.carta_mcc ? ` · MCC ${movimento.carta_mcc.substring(0, 4)}` : ""}
              {movimento.valuta_estera
                ? ` · originale ${movimento.valuta_estera} ${Number(movimento.importo_estero).toFixed(2)}`
                : ""}
            </p>
          </div>
          <span className="font-bold text-lg tabular-nums">
            {fmtEUR(movimento.importo)}
          </span>
        </div>
      </div>

      {/* RICERCA LIBERA */}
      <div className="mb-3">
        <div className="flex gap-2">
          <TextInput
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={onSearchKey}
            placeholder="Filtra per nome fornitore (es. Esselunga)"
            className="flex-1"
          />
          <Btn size="sm" variant="secondary" onClick={() => loadCandidati(search)}>
            Cerca
          </Btn>
          {search && (
            <Btn
              size="sm"
              variant="ghost"
              onClick={() => {
                setSearch("");
                loadCandidati("");
              }}
            >
              ✕
            </Btn>
          )}
        </div>
        <p className="text-[10px] text-neutral-400 mt-1">
          Vengono mostrate solo uscite con <code>metodo='CARTA'</code> non ancora riconciliate,
          entro le tolleranze configurate (importo ± centesimi, data ± giorni).
        </p>
      </div>

      {/* ERROR */}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-800 rounded-lg px-3 py-2 text-sm mb-3">
          ⚠ {error}
        </div>
      )}

      {/* LISTA CANDIDATI */}
      {loading ? (
        <div className="py-10 text-center text-neutral-500 text-sm">
          Cerco candidate...
        </div>
      ) : candidati.length === 0 ? (
        <div className="py-10 text-center text-neutral-500 text-sm">
          <p className="font-medium text-neutral-700 mb-1">
            Nessuna uscita CG candidata trovata
          </p>
          <p className="text-xs">
            Forse l'uscita non è ancora stata creata da Fatture con "Paga con carta",
            oppure è fuori tolleranza (importo o data).
            {!search && " Prova con la ricerca libera per nome fornitore."}
          </p>
        </div>
      ) : (
        <div className="border border-neutral-200 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-neutral-50 border-b border-neutral-200 text-[10px] uppercase tracking-wide text-neutral-500">
              <tr>
                <th className="text-left px-3 py-2 font-medium">Score</th>
                <th className="text-left px-3 py-2 font-medium">Fornitore</th>
                <th className="text-right px-3 py-2 font-medium">Totale</th>
                <th className="text-left px-3 py-2 font-medium">Data pag.</th>
                <th className="text-left px-3 py-2 font-medium">Tipo</th>
                <th className="text-right px-3 py-2 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {candidati.map((c) => (
                <tr key={c.id} className="border-b border-neutral-100 last:border-b-0 hover:bg-amber-50/40">
                  <td className="px-3 py-2">
                    <div className="flex flex-col gap-0.5">
                      <ScoreChip score={c.score} />
                      <Breakdown imp={c.imp_score} data={c.data_score} forn={c.forn_score} />
                    </div>
                  </td>
                  <td className="px-3 py-2">
                    <p className="font-medium text-neutral-800 truncate max-w-[260px]" title={c.fornitore_nome}>
                      {c.fornitore_nome || "—"}
                    </p>
                    <p className="text-[10px] text-neutral-400">
                      Uscita #{c.id}
                      {c.tipo_uscita ? ` · ${c.tipo_uscita}` : ""}
                    </p>
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums font-medium">
                    {fmtEUR(c.totale)}
                  </td>
                  <td className="px-3 py-2 text-neutral-600 text-xs">
                    {fmtDate(c.data_pagamento)}
                  </td>
                  <td className="px-3 py-2 text-[10px]">
                    <StatusBadge tone="neutral" size="sm">
                      {c.metodo_pagamento}
                    </StatusBadge>
                  </td>
                  <td className="px-3 py-2 text-right">
                    <Btn
                      size="sm"
                      variant="primary"
                      loading={linking === c.id}
                      disabled={linking != null}
                      onClick={() => linkTo(c.id)}
                    >
                      Linka
                    </Btn>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* FOOTER */}
      <div className="flex justify-between items-center mt-4 pt-3 border-t border-neutral-200">
        <p className="text-[11px] text-neutral-500">
          Suggerimento: score &gt;85% è solitamente match sicuro.
        </p>
        <Btn variant="ghost" onClick={onClose}>Chiudi</Btn>
      </div>
    </Modal>
  );
}
