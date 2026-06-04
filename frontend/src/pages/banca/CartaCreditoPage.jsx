// src/pages/banca/CartaCreditoPage.jsx
// Modulo: banca (sub-modulo carta_credito)
// @version: v1.0 — UI vera (CC.3)
//
// Sostituisce lo scheletro v0.1. Mostra:
//  - Anagrafica carta corrente (multi-carta ready, oggi 1 sola)
//  - Drop-zone upload PDF estratto BPM
//  - Tabella estratti con riga espandibile → dettaglio movimenti inline
//  - Match livello A (movimento↔uscita CG) e livello B (estratto↔addebito CC)
//    sono SOLO READ-ONLY in CC.3 — la modifica/riconciliazione arriva in CC.4/CC.5.
//
// Endpoint:
//   GET    /banca/carta/carte
//   GET    /banca/carta/estratti?carta_id=
//   GET    /banca/carta/estratti/{id}      ← include movimenti
//   POST   /banca/carta/upload             ← multipart file=<pdf>
//   DELETE /banca/carta/estratti/{id}

import React, { useEffect, useState, useCallback, useRef } from "react";
import FlussiCassaNav from "./FlussiCassaNav";
import { API_BASE, apiFetch } from "../../config/api";
import { Btn, StatusBadge, EmptyState } from "../../components/ui";
import TrgbLoader from "../../components/TrgbLoader";
import CercaUscitaModal from "../../components/carta/CercaUscitaModal";
import AutomatchModal from "../../components/carta/AutomatchModal";
import CercaAddebitoCcModal from "../../components/carta/CercaAddebitoCcModal";

const CARTA = `${API_BASE}/banca/carta`;

// ──────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────

const fmtEUR = (n) =>
  n == null
    ? "—"
    : Number(n).toLocaleString("it-IT", {
        style: "currency",
        currency: "EUR",
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      });

const fmtDateIT = (iso) => {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
};

const fmtDateShort = (iso) => {
  if (!iso) return "—";
  const [, m, d] = iso.split("-");
  return `${d}/${m}`;
};

const MESI_IT = [
  "Gen", "Feb", "Mar", "Apr", "Mag", "Giu",
  "Lug", "Ago", "Set", "Ott", "Nov", "Dic",
];

const periodoLabel = (iso) => {
  if (!iso) return "—";
  const [y, m] = iso.split("-");
  return `${MESI_IT[parseInt(m, 10) - 1]} ${y}`;
};

// ──────────────────────────────────────────────────────────────
// Componente principale
// ──────────────────────────────────────────────────────────────

export default function CartaCreditoPage() {
  const [carte, setCarte] = useState([]);
  const [cartaCorrenteId, setCartaCorrenteId] = useState(null);
  const [estratti, setEstratti] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");

  // Espansione riga estratto + dettaglio movimenti
  const [expandedId, setExpandedId] = useState(null);
  const [details, setDetails] = useState({}); // { [estrattoId]: {...estratto, movimenti:[...]} }
  const [detailsLoadingId, setDetailsLoadingId] = useState(null);

  // Upload
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef(null);

  // CC.4: modale match livello A
  // { movimento: {...}, estrattoId: int } | null
  const [cercaUscita, setCercaUscita] = useState(null);

  // CC.4 D2: modale auto-match bulk (estrattoId in cui aprire)
  const [automatchEstrattoId, setAutomatchEstrattoId] = useState(null);

  // CC.5.a: modale match livello B (estratto su cui aprire — oggetto intero per info sorgente)
  const [matchBEstratto, setMatchBEstratto] = useState(null);

  // ── Caricamento iniziale ────────────────────────────────────
  useEffect(() => {
    loadCarte();
  }, []);

  useEffect(() => {
    if (cartaCorrenteId) loadEstratti(cartaCorrenteId);
  }, [cartaCorrenteId]);

  async function loadCarte() {
    setError("");
    try {
      const res = await apiFetch(`${CARTA}/carte`);
      if (!res.ok) throw new Error("Errore nel caricamento delle carte");
      const data = await res.json();
      setCarte(data.carte || []);
      // Auto-seleziona la prima attiva
      if (data.carte?.length && !cartaCorrenteId) {
        setCartaCorrenteId(data.carte[0].id);
      } else if (!data.carte?.length) {
        setLoading(false);
      }
    } catch (e) {
      setError(e.message || "Errore di rete");
      setLoading(false);
    }
  }

  async function loadEstratti(cartaId) {
    setLoading(true);
    setError("");
    try {
      const res = await apiFetch(`${CARTA}/estratti?carta_id=${cartaId}`);
      if (!res.ok) throw new Error("Errore nel caricamento degli estratti");
      const data = await res.json();
      setEstratti(data.estratti || []);
    } catch (e) {
      setError(e.message || "Errore di rete");
    } finally {
      setLoading(false);
    }
  }

  async function loadDetail(estrattoId, force = false) {
    if (details[estrattoId] && !force) return; // già in cache
    setDetailsLoadingId(estrattoId);
    try {
      const res = await apiFetch(`${CARTA}/estratti/${estrattoId}`);
      if (!res.ok) throw new Error("Errore nel caricamento del dettaglio");
      const data = await res.json();
      setDetails((prev) => ({ ...prev, [estrattoId]: data }));
    } catch (e) {
      setError(e.message || "Errore di rete");
    } finally {
      setDetailsLoadingId(null);
    }
  }

  // CC.4: dopo un match/unlink, ricarica il dettaglio per aggiornare i chip
  async function refreshAfterMatch(estrattoId) {
    await loadDetail(estrattoId, true);
  }

  // CC.4: scollega un movimento dalla sua uscita CG (stato → PAGATO_MANUALE)
  async function unlinkMovimento(movimento_id, estrattoId) {
    if (!window.confirm("Scollegare questo movimento dalla sua uscita CG? L'uscita tornerà 'Pagato manuale'.")) return;
    try {
      const res = await apiFetch(`${CARTA}/movimenti/${movimento_id}/link`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j?.detail || `Errore HTTP ${res.status}`);
      }
      setInfo("Link rimosso. L'uscita CG è tornata in 'Pagato manuale'.");
      await refreshAfterMatch(estrattoId);
    } catch (e) {
      setError(e.message || "Errore di rete");
    }
  }

  function toggleExpand(estrattoId) {
    if (expandedId === estrattoId) {
      setExpandedId(null);
    } else {
      setExpandedId(estrattoId);
      loadDetail(estrattoId);
    }
  }

  // ── Upload PDF ──────────────────────────────────────────────
  const handleFile = useCallback(
    async (file) => {
      if (!file) return;
      if (!file.name.toLowerCase().endsWith(".pdf")) {
        setError("Il file deve essere un PDF Banco BPM");
        return;
      }
      setUploading(true);
      setError("");
      setInfo("");
      try {
        const formData = new FormData();
        formData.append("file", file);
        const res = await apiFetch(`${CARTA}/upload`, {
          method: "POST",
          body: formData,
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) {
          // Errori specifici dal backend
          if (res.status === 409) {
            const eid = json?.detail?.estratto_id || json?.estratto_id;
            setError(
              `Questo PDF è già stato importato${eid ? ` (estratto #${eid})` : ""}. ` +
                `Per ri-importare, elimina prima l'estratto esistente.`
            );
          } else if (res.status === 422) {
            const d = json?.detail || {};
            setError(
              `Sanity check fallito: l'estratto non quadra. ` +
                `Delta movimenti: ${d.delta_quadratura}€, delta addebito: ${d.delta_addebito}€. ` +
                (d.warnings?.length ? `Warning: ${d.warnings.join("; ")}` : "")
            );
          } else {
            setError(json?.detail || json?.error || `Errore HTTP ${res.status}`);
          }
          return;
        }
        setInfo(
          `Estratto importato — ${json.movimenti_inseriti} movimenti (totale ${fmtEUR(
            json.totale_movimenti
          )}, addebito CC ${fmtEUR(json.addebito_totale_cc)} il ${fmtDateIT(
            json.data_valuta_addebito
          )}).` +
            (json.movimenti_skipped_dup
              ? ` ${json.movimenti_skipped_dup} duplicati saltati.`
              : "")
        );
        // Ricarica liste
        await loadCarte();
        if (cartaCorrenteId) await loadEstratti(cartaCorrenteId);
      } catch (e) {
        setError(e.message || "Errore di rete");
      } finally {
        setUploading(false);
      }
    },
    [cartaCorrenteId]
  );

  const handleDrop = useCallback(
    (e) => {
      e.preventDefault();
      setDragOver(false);
      const file = e.dataTransfer?.files?.[0];
      handleFile(file);
    },
    [handleFile]
  );

  // ── Delete estratto ─────────────────────────────────────────
  async function deleteEstratto(estrattoId) {
    if (
      !window.confirm(
        "Eliminare questo estratto? Verranno cancellati anche tutti i suoi movimenti. " +
          "L'operazione è bloccata se ci sono link con fatture."
      )
    )
      return;
    setError("");
    setInfo("");
    try {
      const res = await apiFetch(`${CARTA}/estratti/${estrattoId}`, {
        method: "DELETE",
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json?.detail || `Errore HTTP ${res.status}`);
        return;
      }
      setInfo(`Estratto eliminato (${json.movimenti_eliminati} movimenti rimossi).`);
      setExpandedId(null);
      setDetails((prev) => {
        const copy = { ...prev };
        delete copy[estrattoId];
        return copy;
      });
      await loadEstratti(cartaCorrenteId);
      await loadCarte();
    } catch (e) {
      setError(e.message || "Errore di rete");
    }
  }

  // ── Carta corrente ──────────────────────────────────────────
  const cartaCorrente = carte.find((c) => c.id === cartaCorrenteId);

  // ──────────────────────────────────────────────────────────────
  // Render
  // ──────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-brand-cream">
      <FlussiCassaNav current="carta" />

      <div className="max-w-7xl mx-auto p-4 sm:p-6">
        {/* TITOLO PAGINA */}
        <div className="mb-4">
          <h1 className="text-xl sm:text-2xl font-bold text-brand-ink tracking-tight">
            Carta di Credito
          </h1>
          <p className="text-sm text-neutral-500 mt-1">
            Importa l'estratto conto, visualizza i movimenti e riconciliali con le spese del controllo di gestione.
          </p>
        </div>

        {/* ALERT */}
        {error && (
          <div className="mb-3 bg-red-50 border border-red-200 text-red-800 rounded-xl px-4 py-3 text-sm">
            <strong>⚠ </strong> {error}
            <button
              onClick={() => setError("")}
              className="float-right text-red-600 hover:text-red-800 ml-2"
              aria-label="Chiudi"
            >
              ×
            </button>
          </div>
        )}
        {info && (
          <div className="mb-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl px-4 py-3 text-sm">
            <strong>✓ </strong> {info}
            <button
              onClick={() => setInfo("")}
              className="float-right text-emerald-700 hover:text-emerald-900 ml-2"
              aria-label="Chiudi"
            >
              ×
            </button>
          </div>
        )}

        {loading && !carte.length ? (
          <div className="py-16">
            <TrgbLoader label="Caricamento carte..." />
          </div>
        ) : carte.length === 0 ? (
          // ── STATO VUOTO — nessuna carta ─────────────────────
          <div className="bg-white rounded-2xl shadow-lg border border-neutral-200 p-8">
            <EmptyState
              icon="💳"
              title="Nessuna carta di credito"
              description="Carica un PDF di estratto Banco BPM per registrare la prima carta. L'anagrafica viene creata automaticamente dal codice posizione."
            />
            <DropZone
              onFile={handleFile}
              uploading={uploading}
              dragOver={dragOver}
              setDragOver={setDragOver}
              onDrop={handleDrop}
              fileInputRef={fileInputRef}
            />
          </div>
        ) : (
          <>
            {/* ── ANAGRAFICA CARTA ─────────────────────────── */}
            <div className="bg-white rounded-2xl shadow-lg border border-neutral-200 px-5 py-4 mb-3">
              <div className="flex items-center justify-between gap-4 flex-wrap">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-12 h-12 rounded-xl bg-amber-100 flex items-center justify-center text-2xl shrink-0">
                    💳
                  </div>
                  <div className="min-w-0">
                    {carte.length > 1 ? (
                      <select
                        value={cartaCorrenteId || ""}
                        onChange={(e) => setCartaCorrenteId(Number(e.target.value))}
                        className="font-semibold text-base bg-transparent border-b border-neutral-300 focus:outline-none focus:border-brand-blue"
                      >
                        {carte.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.nickname}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <p className="font-semibold text-base truncate">
                        {cartaCorrente?.nickname || "—"}
                      </p>
                    )}
                    <p className="text-xs text-neutral-500 mt-0.5 truncate">
                      Codice posizione {cartaCorrente?.codice_posizione || "—"} ·
                      {cartaCorrente?.titolare ? ` Intestata a ${cartaCorrente.titolare}` : ""}
                    </p>
                  </div>
                </div>
                <div className="flex gap-6 text-right">
                  <Stat label="Limite" value={cartaCorrente?.limite_utilizzo ? fmtEUR(cartaCorrente.limite_utilizzo) : "—"} />
                  <Stat label="Estratti" value={cartaCorrente?.n_estratti ?? 0} />
                  <Stat label="Movimenti" value={cartaCorrente?.n_movimenti ?? 0} />
                </div>
              </div>
            </div>

            {/* ── DROP ZONE UPLOAD ─────────────────────────── */}
            <DropZone
              onFile={handleFile}
              uploading={uploading}
              dragOver={dragOver}
              setDragOver={setDragOver}
              onDrop={handleDrop}
              fileInputRef={fileInputRef}
            />

            {/* ── LISTA ESTRATTI ───────────────────────────── */}
            <div className="flex items-baseline justify-between mt-5 mb-2">
              <h3 className="text-sm font-semibold text-neutral-700">
                Estratti importati
              </h3>
              <span className="text-[11px] text-neutral-400">
                Click su una riga per vedere i movimenti
              </span>
            </div>

            {loading && carte.length > 0 ? (
              <div className="py-10">
                <TrgbLoader label="Caricamento estratti..." />
              </div>
            ) : estratti.length === 0 ? (
              <div className="bg-white rounded-2xl shadow-lg border border-neutral-200 p-6 text-center text-sm text-neutral-500">
                Nessun estratto importato per questa carta. Carica il primo PDF qui sopra.
              </div>
            ) : (
              <div className="bg-white rounded-2xl shadow-lg border border-neutral-200 overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-neutral-50 border-b border-neutral-200 text-[11px] uppercase tracking-wide text-neutral-500">
                      <tr>
                        <th className="w-8 px-2 py-3"></th>
                        <th className="text-left px-3 py-3 font-medium">Periodo</th>
                        <th className="text-left px-3 py-3 font-medium">Chiusura → Valuta addebito</th>
                        <th className="text-right px-3 py-3 font-medium">Mov.</th>
                        <th className="text-right px-3 py-3 font-medium">Totale movimenti</th>
                        <th className="text-right px-3 py-3 font-medium">Addebito CC</th>
                        <th className="text-center px-3 py-3 font-medium">Quadra</th>
                        <th className="text-center px-3 py-3 font-medium">Match B (CC)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {estratti.map((e) => (
                        <EstrattoRow
                          key={e.id}
                          estratto={e}
                          expanded={expandedId === e.id}
                          detail={details[e.id]}
                          detailLoading={detailsLoadingId === e.id}
                          onToggle={() => toggleExpand(e.id)}
                          onDelete={() => deleteEstratto(e.id)}
                          onCerca={(mov) => setCercaUscita({ movimento: mov, estrattoId: e.id })}
                          onUnlink={(movId) => unlinkMovimento(movId, e.id)}
                          onAutomatch={() => setAutomatchEstrattoId(e.id)}
                          onMatchB={() => setMatchBEstratto(e)}
                        />
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* ── MODALE CERCA USCITA (CC.4 D1) ──────────── */}
            {cercaUscita && (
              <CercaUscitaModal
                movimento={cercaUscita.movimento}
                onClose={() => setCercaUscita(null)}
                onMatched={() => {
                  setInfo(`Movimento riconciliato con uscita CG.`);
                  refreshAfterMatch(cercaUscita.estrattoId);
                  setCercaUscita(null);
                }}
              />
            )}

            {/* ── MODALE AUTO-MATCH (CC.4 D2) ─────────────── */}
            {automatchEstrattoId != null && (
              <AutomatchModal
                estrattoId={automatchEstrattoId}
                onClose={() => setAutomatchEstrattoId(null)}
                onApplied={(result) => {
                  const n = result?.n_applied || 0;
                  setInfo(`Auto-match completato: ${n} link applicati${result?.n_skipped ? `, ${result.n_skipped} scartati` : ""}.`);
                  refreshAfterMatch(automatchEstrattoId);
                  setAutomatchEstrattoId(null);
                }}
              />
            )}

            {/* ── MODALE MATCH LIVELLO B (CC.5.a) ──────────── */}
            {matchBEstratto && (
              <CercaAddebitoCcModal
                estratto={matchBEstratto}
                onClose={() => setMatchBEstratto(null)}
                onMatched={() => {
                  setInfo("Estratto collegato al movimento CC. Match livello B completato.");
                  // Refresh lista estratti per aggiornare la chip Match B
                  if (cartaCorrenteId) loadEstratti(cartaCorrenteId);
                  setMatchBEstratto(null);
                }}
                onUnlinked={() => {
                  setInfo("Estratto scollegato dal movimento CC.");
                  if (cartaCorrenteId) loadEstratti(cartaCorrenteId);
                  setMatchBEstratto(null);
                }}
              />
            )}

            {/* ── LEGENDA ──────────────────────────────────── */}
            {estratti.length > 0 && (
              <div className="flex flex-wrap gap-x-4 gap-y-2 mt-4 text-[11px] text-neutral-500 px-1">
                <LegendItem><StatusBadge tone="warning" size="sm">Non matchato</StatusBadge> Estratto da collegare all'addebito mensile sul CC</LegendItem>
                <LegendItem><StatusBadge tone="success" size="sm">CC #—</StatusBadge> Estratto già collegato all'addebito CC</LegendItem>
                <LegendItem><StatusBadge tone="info" size="sm">→ Uscita CG</StatusBadge> Movimento riconciliato con un'uscita di Controllo Gestione</LegendItem>
                <LegendItem><StatusBadge tone="warning" size="sm">USD</StatusBadge> Movimento in valuta estera</LegendItem>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────
// Sub-componenti
// ──────────────────────────────────────────────────────────────

function Stat({ label, value }) {
  return (
    <div className="text-right">
      <div className="text-[10px] uppercase tracking-wide text-neutral-500">{label}</div>
      <div className="text-sm font-semibold text-brand-ink tabular-nums">{value}</div>
    </div>
  );
}

function LegendItem({ children }) {
  return <span className="inline-flex items-center gap-1.5">{children}</span>;
}

function DropZone({ onFile, uploading, dragOver, setDragOver, onDrop, fileInputRef }) {
  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={onDrop}
      className={`mt-3 rounded-2xl border-2 border-dashed text-center transition px-6 py-5 ${
        dragOver
          ? "border-brand-blue bg-blue-50/50"
          : "border-violet-200 bg-violet-50/30"
      }`}
    >
      <div className="flex items-center justify-center gap-3 flex-wrap">
        <span className="text-2xl">📄</span>
        <span className="text-sm text-neutral-700">
          Trascina qui il PDF dell'estratto carta — oppure
        </span>
        <input
          ref={fileInputRef}
          type="file"
          accept="application/pdf,.pdf"
          className="hidden"
          onChange={(e) => onFile(e.target.files?.[0])}
        />
        <Btn
          variant="primary"
          size="sm"
          loading={uploading}
          onClick={() => fileInputRef.current?.click()}
        >
          Scegli file
        </Btn>
      </div>
      <p className="text-[11px] text-neutral-500 mt-2">
        Formati supportati: PDF Banco BPM · max 10 MB · dedup automatica su sha256
      </p>
    </div>
  );
}

function EstrattoRow({ estratto, expanded, detail, detailLoading, onToggle, onDelete, onCerca, onUnlink, onAutomatch, onMatchB }) {
  const e = estratto;
  const matchB = e.banca_movimento_id;

  return (
    <>
      <tr
        onClick={onToggle}
        className={`border-b border-neutral-100 cursor-pointer hover:bg-neutral-50 transition ${
          expanded ? "bg-amber-50/40" : ""
        }`}
      >
        <td className="px-2 py-3 text-neutral-400 text-center">
          {expanded ? "▾" : "▸"}
        </td>
        <td className="px-3 py-3 font-semibold text-neutral-800">
          {periodoLabel(e.data_chiusura)}
        </td>
        <td className="px-3 py-3 text-neutral-500 text-xs">
          {fmtDateShort(e.data_chiusura)} → {fmtDateShort(e.data_valuta_addebito)}
        </td>
        <td className="px-3 py-3 text-right tabular-nums">{e.n_movimenti}</td>
        <td className="px-3 py-3 text-right tabular-nums font-medium">
          {fmtEUR(e.totale_movimenti)}
        </td>
        <td className="px-3 py-3 text-right tabular-nums">
          {fmtEUR(e.addebito_totale_cc)}
        </td>
        <td className="px-3 py-3 text-center">
          {e.quadra ? (
            <span className="text-emerald-600 text-lg leading-none">✓</span>
          ) : (
            <span className="text-amber-600 text-lg leading-none">!</span>
          )}
        </td>
        <td
          className="px-3 py-3 text-center"
          onClick={(ev) => {
            // Apri modale match B senza espandere la riga
            ev.stopPropagation();
            onMatchB?.();
          }}
          title={matchB ? `Match B attivo (mov. CC #${matchB}) — click per gestire` : "Click per cercare l'addebito mensile su CC"}
        >
          {matchB ? (
            <StatusBadge tone="success" size="sm" className="cursor-pointer hover:opacity-80">
              ✓ CC #{matchB}
            </StatusBadge>
          ) : (
            <StatusBadge tone="warning" size="sm" className="cursor-pointer hover:opacity-80">
              🔍 Cerca
            </StatusBadge>
          )}
        </td>
      </tr>

      {expanded && (
        <tr className="bg-amber-50/40 border-b border-neutral-100">
          <td colSpan={8} className="px-4 py-4">
            {detailLoading ? (
              <div className="py-6">
                <TrgbLoader size={32} label="Caricamento movimenti..." />
              </div>
            ) : !detail ? (
              <div className="text-center text-sm text-neutral-500 py-4">—</div>
            ) : (
              <EstrattoDetail
                detail={detail}
                onDelete={onDelete}
                onCerca={onCerca}
                onUnlink={onUnlink}
                onAutomatch={onAutomatch}
              />
            )}
          </td>
        </tr>
      )}
    </>
  );
}

function EstrattoDetail({ detail, onDelete, onCerca, onUnlink, onAutomatch }) {
  const m = detail.movimenti || [];
  const nEsteri = m.filter((x) => x.valuta_estera).length;
  const nMatchati = m.filter((x) => x.match_uscita_id).length;
  const nNonMatchati = m.length - nMatchati;

  return (
    <div>
      <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
        <span className="text-xs text-neutral-500">
          Dettaglio movimenti · {m.length} righe
          {nMatchati > 0 ? ` · ${nMatchati} riconciliati` : ""}
          {nEsteri ? ` · ${nEsteri} in valuta estera` : ""}
          {detail.imposta_bollo
            ? ` · bollo ${fmtEUR(detail.imposta_bollo)}`
            : ""}
          {detail.spese_invio
            ? ` · spese invio ${fmtEUR(detail.spese_invio)}`
            : ""}
        </span>
        <div className="flex gap-2 items-center">
          {detail.pdf_filename && (
            <span className="text-[10px] text-neutral-400 italic truncate max-w-[200px]">
              {detail.pdf_filename}
            </span>
          )}
          {nNonMatchati > 0 && (
            <Btn variant="chip" tone="emerald" size="sm" onClick={onAutomatch}>
              🔗 Auto-match CG ({nNonMatchati})
            </Btn>
          )}
          <Btn variant="chip" tone="red" size="sm" onClick={onDelete}>
            🗑 Elimina estratto
          </Btn>
        </div>
      </div>

      <div className="bg-white border border-neutral-200 rounded-xl overflow-hidden">
        <table className="w-full text-xs">
          <thead className="bg-neutral-50 text-[10px] uppercase tracking-wide text-neutral-500 border-b border-neutral-200">
            <tr>
              <th className="text-left px-3 py-2 font-medium w-20">Data op.</th>
              <th className="text-left px-3 py-2 font-medium">Descrizione</th>
              <th className="text-right px-3 py-2 font-medium w-24">Importo</th>
              <th className="text-center px-3 py-2 font-medium w-24">Estero</th>
              <th className="text-center px-3 py-2 font-medium w-20">MCC</th>
              <th className="text-center px-3 py-2 font-medium w-44">Match CG (livello A)</th>
            </tr>
          </thead>
          <tbody>
            {m.map((mov) => (
              <tr key={mov.id} className="border-b border-neutral-100 last:border-b-0 hover:bg-neutral-50">
                <td className="px-3 py-2 text-neutral-500 tabular-nums">
                  {fmtDateShort(mov.data_operazione)}
                </td>
                <td className="px-3 py-2 truncate max-w-[260px]" title={mov.descrizione}>
                  {mov.descrizione}
                </td>
                <td className="px-3 py-2 text-right tabular-nums font-medium">
                  {fmtEUR(mov.importo)}
                </td>
                <td className="px-3 py-2 text-center">
                  {mov.valuta_estera ? (
                    <span className="inline-block px-1.5 py-0.5 text-[10px] bg-amber-100 text-amber-800 rounded border border-amber-200">
                      {mov.valuta_estera} {Number(mov.importo_estero).toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                  ) : (
                    <span className="text-neutral-300">—</span>
                  )}
                </td>
                <td className="px-3 py-2 text-center text-neutral-400 tabular-nums text-[10px]">
                  {mov.carta_mcc ? mov.carta_mcc.substring(0, 4) : "—"}
                </td>
                <td className="px-3 py-2 text-center">
                  {mov.match_uscita_id ? (
                    <div className="inline-flex items-center gap-1.5">
                      <span
                        className="inline-block px-1.5 py-0.5 text-[10px] bg-emerald-100 text-emerald-800 rounded border border-emerald-200 max-w-[140px] truncate"
                        title={`Uscita CG #${mov.match_uscita_id} · ${mov.match_uscita_fornitore || ""} · ${fmtEUR(mov.match_uscita_totale)}`}
                      >
                        ✓ #{mov.match_uscita_id} {mov.match_uscita_fornitore?.slice(0, 14) || ""}
                      </span>
                      <button
                        onClick={(ev) => {
                          ev.stopPropagation();
                          onUnlink?.(mov.id);
                        }}
                        className="text-[10px] text-neutral-400 hover:text-red-600 underline"
                        title="Stacca link (riporta a Pagato manuale)"
                      >
                        stacca
                      </button>
                    </div>
                  ) : (
                    <Btn
                      size="sm"
                      variant="ghost"
                      onClick={(ev) => {
                        ev.stopPropagation();
                        onCerca?.(mov);
                      }}
                    >
                      🔍 Cerca
                    </Btn>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {detail.warnings && detail.warnings.length > 0 && (
        <div className="mt-2 text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          <strong>Warning parser:</strong> {detail.warnings.join("; ")}
        </div>
      )}
    </div>
  );
}
