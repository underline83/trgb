// @version: v1.3-canali — selettore canale (banca/carta/contanti) in split-pane
// Workbench Riconciliazione — split-pane dedicato, uno per canale di pagamento.
//
// SX: worklist uscite "Da collegare", filtrata per canale selezionato:
//     - banca    → stato=PAGATA_MANUALE, banca_movimento_id NULL, metodo_pagamento NOT IN (CARTA,CONTANTI)
//     - carta    → stato=PAGATA_MANUALE, metodo_pagamento=CARTA  (predisposizione modulo futuro)
//     - contanti → stato=PAGATA_MANUALE, metodo_pagamento=CONTANTI  (edge case, di norma vuoto)
//
// DX: pannello dipende dal canale:
//     - banca    → RiconciliaBancaPanel (Auto + Ricerca libera su banca_movimenti)
//     - carta    → PagaCartaPanel (placeholder + marca come pagata con carta)
//     - contanti → PagaContantiPanel (marca come pagata in contanti)
//
// Flusso:
//   1) Utente sceglie il canale (default: banca)
//   2) Worklist ricaricata per quel canale via GET /controllo-gestione/uscite/da-riconciliare?canale=...
//   3) Clic su una riga → pannello DX del canale
//   4) Azione completata → worklist si aggiorna, passa al successivo

import React, { useState, useEffect, useCallback, useMemo } from "react";
import { Link, useNavigate } from "react-router-dom";
import { API_BASE, apiFetch } from "../../config/api";
import ControlloGestioneNav from "./ControlloGestioneNav";
import RiconciliaBancaPanel from "../../components/riconciliazione/RiconciliaBancaPanel";
import PagaCartaPanel from "../../components/riconciliazione/PagaCartaPanel";
import PagaContantiPanel from "../../components/riconciliazione/PagaContantiPanel";
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

// ── Definizione canali ──
const CANALI = [
  {
    key: "banca",
    label: "Banca",
    icon: "🏦",
    emptyHint: "Nessuna uscita da collegare ai movimenti bancari.",
    activeClass: "bg-violet-100 text-violet-900 border-violet-300",
    idleClass:   "text-neutral-600 border-transparent hover:bg-neutral-50",
    kpiClass:    "text-violet-600",
  },
  {
    key: "carta",
    label: "Carta",
    icon: "💳",
    emptyHint: "Nessuna uscita in attesa di riconciliazione carta. Il modulo Carta di Credito e' in arrivo.",
    activeClass: "bg-amber-100 text-amber-900 border-amber-300",
    idleClass:   "text-neutral-600 border-transparent hover:bg-neutral-50",
    kpiClass:    "text-amber-600",
  },
  {
    key: "contanti",
    label: "Contanti",
    icon: "💵",
    emptyHint: "Nessuna uscita da registrare in contanti.",
    activeClass: "bg-emerald-100 text-emerald-900 border-emerald-300",
    idleClass:   "text-neutral-600 border-transparent hover:bg-neutral-50",
    kpiClass:    "text-emerald-600",
  },
];

export default function ControlloGestioneRiconciliazione() {
  const navigate = useNavigate();
  const [canale, setCanale] = useState("banca");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [uscite, setUscite] = useState([]);
  const [totale, setTotale] = useState(0);
  const [selected, setSelected] = useState(null); // uscita selezionata nel pane DX
  const [q, setQ] = useState("");

  const canaleCfg = CANALI.find((c) => c.key === canale) || CANALI[0];

  const fetchWorklist = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await apiFetch(`${CG}/uscite/da-riconciliare?limit=300&canale=${canale}`);
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
  }, [canale]);

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

  const handleClosed = useCallback(() => {
    // Dopo azione completata (linked/paid): ricarica worklist e sposta selezione
    fetchWorklist();
  }, [fetchWorklist]);

  // Quando si cambia canale: resetta selezione e ricerca
  const handleCanaleChange = (newCanale) => {
    if (newCanale === canale) return;
    setCanale(newCanale);
    setSelected(null);
    setQ("");
  };

  return (
    <div className="min-h-screen bg-brand-cream">
      <ControlloGestioneNav current="riconciliazione" />

      {/* Header */}
      <div className="bg-white border-b border-neutral-200 px-6 py-4">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold text-sky-900 font-playfair">Riconciliazione</h1>
            <p className="text-sm text-neutral-500 mt-0.5">
              Collega le uscite dichiarate pagate al canale di pagamento corrispondente
            </p>
          </div>

          <div className="flex items-center gap-3">
            {/* Selettore canale */}
            <div className="flex items-center gap-1 bg-neutral-100 rounded-lg p-1">
              {CANALI.map((c) => {
                const active = canale === c.key;
                return (
                  <button
                    key={c.key}
                    onClick={() => handleCanaleChange(c.key)}
                    className={`px-3 py-1.5 rounded-md text-sm font-medium transition border ${
                      active ? c.activeClass + " shadow-sm" : c.idleClass
                    }`}
                  >
                    <span className="mr-1.5">{c.icon}</span>
                    {c.label}
                  </button>
                );
              })}
            </div>

            <div className="text-right">
              <div className="text-xs text-neutral-500">Da collegare</div>
              <div className={`text-2xl font-bold ${canaleCfg.kpiClass}`}>{totale}</div>
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
            <h2 className="text-sm font-semibold text-neutral-700">
              {canaleCfg.icon} Worklist {canaleCfg.label}
            </h2>
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
                  ? canaleCfg.emptyHint
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

        {/* Pane DX: pannello dipende dal canale */}
        <div className="w-1/2 bg-white border border-neutral-200 rounded-lg flex flex-col overflow-hidden">
          {selected ? (
            canale === "banca" ? (
              <RiconciliaBancaPanel
                key={`banca-${selected.id}`}
                uscitaId={selected.id}
                contextLabel={labelContext(selected)}
                dataRif={selected.data_pagamento || selected.data_scadenza}
                importo={Math.abs(Number(selected.totale) || 0)}
                onLinked={handleClosed}
                compact
              />
            ) : canale === "carta" ? (
              <PagaCartaPanel
                key={`carta-${selected.id}`}
                uscitaId={selected.id}
                contextLabel={labelContext(selected)}
                dataRif={selected.data_pagamento || selected.data_scadenza}
                importo={Math.abs(Number(selected.totale) || 0)}
                onPaid={handleClosed}
                compact
              />
            ) : (
              <PagaContantiPanel
                key={`contanti-${selected.id}`}
                uscitaId={selected.id}
                contextLabel={labelContext(selected)}
                dataRif={selected.data_pagamento || selected.data_scadenza}
                importo={Math.abs(Number(selected.totale) || 0)}
                onPaid={handleClosed}
                compact
              />
            )
          ) : (
            <div className="flex-1 flex items-center justify-center">
              <EmptyState
                icon="👈"
                title="Seleziona una uscita"
                description={`Clicca su una riga della worklist per iniziare la riconciliazione ${canaleCfg.label.toLowerCase()}.`}
                compact
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
