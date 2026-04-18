// @version: v1.2-mattoni — M.I primitives (Btn, EmptyState) su CTA/empty worklist+pane
// Workbench Riconciliazione Banca — split-pane dedicato.
// SX: worklist uscite "Da collegare" (PAGATA_MANUALE senza movimento bancario)
// DX: pannello riutilizzabile RiconciliaBancaPanel con tab Auto + Ricerca libera
//
// Flusso:
//   1) Utente apre la pagina (da KPI in scadenzario o dal menu CG)
//   2) Worklist precaricata via GET /controllo-gestione/uscite/da-riconciliare
//   3) Clic su riga → pannello DX cerca candidati per quella uscita
//   4) Collega → worklist si aggiorna, rimuove l'item e seleziona il successivo

import React, { useState, useEffect, useCallback, useMemo } from "react";
import { Link, useNavigate } from "react-router-dom";
import { API_BASE, apiFetch } from "../../config/api";
import ControlloGestioneNav from "./ControlloGestioneNav";
import RiconciliaBancaPanel from "../../components/riconciliazione/RiconciliaBancaPanel";
import StatoRiconciliazioneBadge from "../../components/riconciliazione/StatoRiconciliazioneBadge";
import Tooltip from "../../components/Tooltip";
import { Btn, EmptyState } from "../../components/ui";

const CG = `${API_BASE}/controllo-gestione`;

const fmt = (n) => n != null ? Number(n).toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "—";
const fmtDate = (d) => d ? new Date(d + "T00:00:00").toLocaleDateString("it-IT", { day: "2-digit", month: "short", year: "2-digit" }) : "—";

// ── Descrizione "tipo" di una uscita, compatta ──
function tipoUscita(u) {
  if (u.fattura_id) return "Fattura";
  if (u.spesa_fissa_id) return u.spesa_fissa_tipo || "Spesa fissa";
  return "Uscita";
}

function labelContext(u) {
  const who = u.fornitore_nome || u.spesa_fissa_titolo || "—";
  return `${who} · € ${fmt(u.totale)} · ${fmtDate(u.data_pagamento || u.data_scadenza)}`;
}

export default function ControlloGestioneRiconciliazione() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [uscite, setUscite] = useState([]);
  const [totale, setTotale] = useState(0);
  const [selected, setSelected] = useState(null); // uscita selezionata nel pane DX
  const [q, setQ] = useState("");

  const fetchWorklist = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await apiFetch(`${CG}/uscite/da-riconciliare?limit=300`);
      const j = await r.json();
      if (!r.ok || !j.ok) throw new Error(j.error || "Errore caricamento worklist");
      const list = j.uscite || [];
      setUscite(list);
      setTotale(j.totale || list.length);
      // Mantieni selezione se ancora presente, altrimenti prima riga
      setSelected((prev) => {
        if (prev && list.some((x) => x.id === prev.id)) return prev;
        return list[0] || null;
      });
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchWorklist();
  }, [fetchWorklist]);

  const filtered = useMemo(() => {
    if (!q.trim()) return uscite;
    const needle = q.trim().toLowerCase();
    return uscite.filter((u) => {
      const who = (u.fornitore_nome || u.spesa_fissa_titolo || "").toLowerCase();
      return who.includes(needle);
    });
  }, [uscite, q]);

  const handleLinked = useCallback(() => {
    // Dopo collegamento: ricarica worklist e sposta selezione al prossimo
    const currentId = selected?.id;
    const currentIdx = uscite.findIndex((u) => u.id === currentId);
    fetchWorklist().then(() => {
      // Il setSelected dentro fetchWorklist gestisce l'orfano; qui non serve altro
      // ma se vogliamo saltare al "prossimo" invece che alla prima riga,
      // lo possiamo fare con un piccolo ritardo usando ref (fuori scope v1)
    });
  }, [selected, uscite, fetchWorklist]);

  return (
    <div className="min-h-screen bg-brand-cream">
      <ControlloGestioneNav current="riconciliazione" />

      {/* Header */}
      <div className="bg-white border-b border-neutral-200 px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-sky-900 font-playfair">Riconciliazione banca</h1>
            <p className="text-sm text-neutral-500 mt-0.5">
              Collega le uscite dichiarate pagate ai movimenti bancari corrispondenti
            </p>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-right">
              <div className="text-xs text-neutral-500">Da collegare</div>
              <div className="text-2xl font-bold text-amber-600">{totale}</div>
            </div>
            <Btn variant="secondary" size="sm" onClick={() => navigate("/controllo-gestione/uscite")}>
              ← Scadenzario
            </Btn>
          </div>
        </div>
      </div>

      {error && (
        <div className="mx-6 mt-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
          {error}
        </div>
      )}

      {/* Split-pane */}
      <div className="flex gap-4 p-6" style={{ minHeight: "calc(100dvh - 180px)" }}>
        {/* Pane SX: worklist */}
        <div className="w-1/2 bg-white border border-neutral-200 rounded-lg flex flex-col overflow-hidden">
          <div className="px-4 py-3 border-b border-neutral-200 flex items-center gap-3">
            <h2 className="text-sm font-semibold text-neutral-700">Worklist</h2>
            <span className="text-xs text-neutral-500">{filtered.length} uscite</span>
            <div className="flex-1" />
            <input
              type="text"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Cerca fornitore / titolo…"
              className="px-2 py-1 text-xs border border-neutral-300 rounded w-48"
            />
            <Tooltip label="Ricarica">
              <Btn variant="secondary" size="sm" onClick={fetchWorklist}>↻</Btn>
            </Tooltip>
          </div>

          <div className="flex-1 overflow-auto">
            {loading && uscite.length === 0 ? (
              <div className="p-8 text-center text-sm text-neutral-500">Caricamento…</div>
            ) : filtered.length === 0 ? (
              <EmptyState
                icon={uscite.length === 0 ? "🎉" : "🔎"}
                title={uscite.length === 0 ? "Tutto collegato" : "Nessun risultato"}
                description={uscite.length === 0
                  ? "Nessuna uscita da collegare ai movimenti bancari."
                  : "Nessun risultato per il filtro corrente."}
                compact
              />
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-neutral-50 text-xs text-neutral-600 uppercase sticky top-0">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium">Fornitore / Titolo</th>
                    <th className="px-3 py-2 text-left font-medium w-24">Pagata il</th>
                    <th className="px-3 py-2 text-right font-medium w-24">Importo</th>
                    <th className="px-3 py-2 text-left font-medium w-20">Tipo</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((u) => {
                    const isSel = selected?.id === u.id;
                    return (
                      <tr
                        key={u.id}
                        onClick={() => setSelected(u)}
                        className={`border-t border-neutral-100 cursor-pointer hover:bg-amber-50 ${
                          isSel ? "bg-amber-100 hover:bg-amber-100" : ""
                        }`}
                      >
                        <td className="px-3 py-2">
                          <div className="font-medium text-neutral-800 truncate max-w-xs">
                            {u.fornitore_nome || u.spesa_fissa_titolo || "—"}
                          </div>
                          <div className="mt-0.5">
                            <StatoRiconciliazioneBadge stato="da_collegare" size="xs" />
                          </div>
                        </td>
                        <td className="px-3 py-2 text-neutral-700">
                          {fmtDate(u.data_pagamento || u.data_scadenza)}
                        </td>
                        <td className="px-3 py-2 text-right font-mono font-semibold text-neutral-800">
                          € {fmt(u.totale)}
                        </td>
                        <td className="px-3 py-2 text-xs text-neutral-600">{tipoUscita(u)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* Pane DX: RiconciliaBancaPanel */}
        <div className="w-1/2 bg-white border border-neutral-200 rounded-lg flex flex-col overflow-hidden">
          {selected ? (
            <RiconciliaBancaPanel
              key={selected.id}
              uscitaId={selected.id}
              contextLabel={labelContext(selected)}
              dataRif={selected.data_pagamento || selected.data_scadenza}
              importo={Math.abs(Number(selected.totale) || 0)}
              onLinked={handleLinked}
              compact
            />
          ) : (
            <div className="flex-1 flex items-center justify-center">
              <EmptyState
                icon="👈"
                title="Seleziona una uscita"
                description="Clicca su una riga della worklist per iniziare la riconciliazione."
                compact
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
