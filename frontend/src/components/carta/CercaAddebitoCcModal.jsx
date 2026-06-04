// frontend/src/components/carta/CercaAddebitoCcModal.jsx
// Modulo: banca (sub-modulo carta_credito)
// @version: v1.0 (CC.5.a — match manuale livello B)
//
// Modale per riconciliare un estratto carta con il movimento CC bancario che
// rappresenta il suo addebito mensile (1:1).
//
// Props:
//   estratto:    oggetto estratto sorgente (id, data_chiusura, data_valuta_addebito,
//                addebito_totale_cc, banca_movimento_id se già linkato, ...)
//   onClose:     callback per chiudere
//   onMatched:   callback dopo POST /link-cc OK
//   onUnlinked:  callback dopo DELETE /link-cc OK

import React, { useEffect, useState, useCallback } from "react";
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

const fmtDate = (iso) => {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
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

export default function CercaAddebitoCcModal({ estratto, onClose, onMatched, onUnlinked }) {
  const [candidati, setCandidati] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [linking, setLinking] = useState(null); // movimento_cc_id in fase di link
  const [unlinking, setUnlinking] = useState(false);

  const alreadyLinked = estratto?.banca_movimento_id != null;

  const loadCandidati = useCallback(async () => {
    if (!estratto) return;
    setLoading(true);
    setError("");
    try {
      const res = await apiFetch(`${CARTA}/estratti/${estratto.id}/candidati-cc`);
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
  }, [estratto]);

  useEffect(() => {
    if (!alreadyLinked) loadCandidati();
    else setLoading(false);
  }, [loadCandidati, alreadyLinked]);

  async function linkTo(mov_cc_id) {
    setLinking(mov_cc_id);
    setError("");
    try {
      const res = await apiFetch(`${CARTA}/estratti/${estratto.id}/link-cc`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ movimento_cc_id: mov_cc_id }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j?.detail || `Errore HTTP ${res.status}`);
      onMatched?.(j);
      onClose?.();
    } catch (e) {
      setError(e.message || "Errore durante il match");
    } finally {
      setLinking(null);
    }
  }

  async function unlink() {
    if (!window.confirm("Scollegare questo estratto dal suo addebito CC?")) return;
    setUnlinking(true);
    setError("");
    try {
      const res = await apiFetch(`${CARTA}/estratti/${estratto.id}/link-cc`, {
        method: "DELETE",
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j?.detail || `Errore HTTP ${res.status}`);
      onUnlinked?.(j);
      onClose?.();
    } catch (e) {
      setError(e.message || "Errore durante l'unlink");
    } finally {
      setUnlinking(false);
    }
  }

  if (!estratto) return null;

  return (
    <Modal open onClose={onClose} title="Match livello B — addebito sul CC bancario" size="xl">
      {/* ESTRATTO SORGENTE */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 mb-4">
        <div className="text-[10px] uppercase tracking-wide text-blue-700 font-semibold mb-1">
          Estratto carta
        </div>
        <div className="flex items-baseline justify-between gap-3 flex-wrap">
          <div className="min-w-0">
            <p className="font-semibold text-neutral-800">
              Chiusura {fmtDate(estratto.data_chiusura)} · valuta addebito {fmtDate(estratto.data_valuta_addebito)}
            </p>
            <p className="text-xs text-neutral-500 mt-0.5">
              Cerco un movimento sul CC con importo opposto e data vicina al {fmtDate(estratto.data_valuta_addebito)}
            </p>
          </div>
          <span className="font-bold text-lg tabular-nums">
            {fmtEUR(estratto.addebito_totale_cc)}
          </span>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-800 rounded-lg px-3 py-2 text-sm mb-3">
          ⚠ {error}
        </div>
      )}

      {/* GIÀ LINKATO */}
      {alreadyLinked && !error && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-4">
          <p className="font-semibold text-emerald-800 mb-2">
            ✓ Già riconciliato con il movimento CC #{estratto.banca_movimento_id}
          </p>
          <p className="text-xs text-emerald-700 mb-3">
            L'addebito mensile è stato collegato. Se vuoi rifare il match, prima scollega.
          </p>
          <Btn variant="danger" size="sm" loading={unlinking} onClick={unlink}>
            🔓 Stacca link
          </Btn>
        </div>
      )}

      {/* LISTA CANDIDATI (solo se non già linkato) */}
      {!alreadyLinked && (
        <>
          {loading ? (
            <div className="py-10 text-center text-neutral-500 text-sm">Cerco movimenti CC...</div>
          ) : candidati.length === 0 ? (
            <div className="py-10 text-center text-neutral-500 text-sm">
              <p className="font-medium text-neutral-700 mb-1">
                Nessun movimento CC candidato
              </p>
              <p className="text-xs">
                Forse l'addebito carta non è ancora arrivato sul tuo CC bancario (di solito 1–3 giorni
                dopo la valuta dichiarata), oppure non hai ancora importato l'estratto bancario di quel
                periodo via "Flussi di Cassa › Conti Correnti".
              </p>
            </div>
          ) : (
            <div className="border border-neutral-200 rounded-xl overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-neutral-50 border-b border-neutral-200 text-[10px] uppercase tracking-wide text-neutral-500">
                  <tr>
                    <th className="text-left px-3 py-2 font-medium">Score</th>
                    <th className="text-left px-3 py-2 font-medium">Descrizione</th>
                    <th className="text-left px-3 py-2 font-medium">Banca</th>
                    <th className="text-right px-3 py-2 font-medium">Importo</th>
                    <th className="text-left px-3 py-2 font-medium">Data</th>
                    <th className="text-right px-3 py-2 font-medium"></th>
                  </tr>
                </thead>
                <tbody>
                  {candidati.map((c) => (
                    <tr key={c.id} className="border-b border-neutral-100 last:border-b-0 hover:bg-blue-50/40">
                      <td className="px-3 py-2">
                        <ScoreChip score={c.score} />
                        <div className="flex gap-1 mt-0.5 text-[9px] text-neutral-400">
                          <span title="Score importo">€{Math.round(c.imp_score * 100)}</span>
                          <span>·</span>
                          <span title="Score data">📅{Math.round(c.data_score * 100)}</span>
                        </div>
                      </td>
                      <td className="px-3 py-2">
                        <p className="text-neutral-800 truncate max-w-[260px]" title={c.descrizione}>
                          {c.descrizione || "—"}
                        </p>
                        <p className="text-[10px] text-neutral-400">Mov. #{c.id}</p>
                      </td>
                      <td className="px-3 py-2 text-xs text-neutral-600">
                        {c.banca || "—"}
                        {c.rapporto ? <span className="text-neutral-400"> · {c.rapporto}</span> : ""}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums font-medium">
                        − {fmtEUR(c.importo_abs)}
                      </td>
                      <td className="px-3 py-2 text-neutral-600 text-xs">
                        {fmtDate(c.data_contabile)}
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
        </>
      )}

      {/* FOOTER */}
      <div className="flex justify-between items-center mt-4 pt-3 border-t border-neutral-200">
        <p className="text-[11px] text-neutral-500">
          Match B = riconciliazione 1:1 esatta (estratto ↔ bonifico CC). Tolleranze molto strette.
        </p>
        <Btn variant="ghost" onClick={onClose}>Chiudi</Btn>
      </div>
    </Modal>
  );
}
