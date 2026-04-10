// @version: v2.0-dettaglio-fattura
// Pagina dettaglio fattura singola con righe, info fornitore, link a fornitore.
// v2.0: sezione "Pagamenti & Scadenze" con override IBAN/modalità/scadenza,
// badge rateizzata e link alla spesa fissa target, stato uscita + batch.
import React, { useState, useEffect, useMemo } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import { API_BASE, apiFetch } from "../../config/api";
import FattureNav from "./FattureNav";

const FE = `${API_BASE}/contabilita/fe`;
const CG = `${API_BASE}/controllo-gestione`;
const fmt = (v) =>
  v != null
    ? v.toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : "-";

// Codici SEPA MP più comuni per il dropdown override
const MP_OPTIONS = [
  { code: "", label: "— nessun override —" },
  { code: "MP01", label: "MP01 — Contanti" },
  { code: "MP02", label: "MP02 — Assegno" },
  { code: "MP05", label: "MP05 — Bonifico" },
  { code: "MP08", label: "MP08 — Carta di pagamento" },
  { code: "MP12", label: "MP12 — RIBA" },
  { code: "MP19", label: "MP19 — SEPA Direct Debit" },
  { code: "MP23", label: "MP23 — PagoPA" },
];

const MP_LABELS = {
  MP01: "Contanti", MP02: "Assegno", MP03: "Assegno circolare",
  MP04: "Contanti presso Tesoreria", MP05: "Bonifico", MP06: "Vaglia cambiario",
  MP08: "Carta di pagamento", MP09: "RID", MP10: "RID utenze",
  MP11: "RID veloce", MP12: "RIBA", MP13: "MAV", MP14: "Quietanza erario",
  MP15: "Giroconto su conti di contabilità speciale", MP16: "Domiciliazione bancaria",
  MP17: "Domiciliazione postale", MP18: "Bollettino postale",
  MP19: "SEPA Direct Debit", MP20: "SEPA Direct Debit CORE",
  MP21: "SEPA Direct Debit B2B", MP22: "Trattenuta su somme già riscosse",
  MP23: "PagoPA",
};

const STATO_BADGE = {
  DA_PAGARE:      "bg-amber-100 text-amber-800 border-amber-200",
  SCADUTA:        "bg-red-100 text-red-800 border-red-200",
  PAGATA:         "bg-emerald-100 text-emerald-800 border-emerald-200",
  PAGATA_MANUALE: "bg-sky-100 text-sky-800 border-sky-200",
  PARZIALE:       "bg-blue-100 text-blue-800 border-blue-200",
  RATEIZZATA:     "bg-purple-100 text-purple-800 border-purple-200",
};

export default function FattureDettaglio() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const fromScadenzario = searchParams.get("from") === "scadenzario";

  const [fattura, setFattura] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Stato per override IBAN/modalità/scadenza
  const [editingScadenza, setEditingScadenza] = useState(false);
  const [editingIban, setEditingIban] = useState(false);
  const [editingMp, setEditingMp] = useState(false);
  const [draftScadenza, setDraftScadenza] = useState("");
  const [draftIban, setDraftIban] = useState("");
  const [draftMp, setDraftMp] = useState("");
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState(null);

  const showToast = (msg, kind = "ok") => {
    setToast({ msg, kind });
    setTimeout(() => setToast(null), 3000);
  };

  const refetch = async () => {
    try {
      const res = await apiFetch(`${FE}/fatture/${id}`);
      if (!res.ok) throw new Error("refresh failed");
      setFattura(await res.json());
    } catch (e) {
      console.error("refresh:", e);
    }
  };

  useEffect(() => {
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await apiFetch(`${FE}/fatture/${id}`);
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.detail || "Fattura non trovata");
        }
        setFattura(await res.json());
      } catch (e) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  // ── Save helpers per i tre dispatcher v2.0 ──
  const saveScadenza = async () => {
    if (!fattura?.uscita?.uscita_id || !draftScadenza) return;
    setSaving(true);
    try {
      const res = await apiFetch(`${CG}/uscite/${fattura.uscita.uscita_id}/scadenza`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ data_scadenza: draftScadenza }),
      });
      const j = await res.json();
      if (!j.ok) throw new Error(j.error || "Errore");
      showToast("Scadenza aggiornata");
      setEditingScadenza(false);
      await refetch();
    } catch (e) {
      showToast(e.message || "Errore di rete", "err");
    } finally {
      setSaving(false);
    }
  };

  const saveIban = async () => {
    if (!fattura?.uscita?.uscita_id) return;
    setSaving(true);
    try {
      const res = await apiFetch(`${CG}/uscite/${fattura.uscita.uscita_id}/iban`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ iban: draftIban || null }),
      });
      const j = await res.json();
      if (!j.ok) throw new Error(j.error || "Errore");
      showToast(draftIban ? "IBAN aggiornato" : "Override IBAN rimosso");
      setEditingIban(false);
      await refetch();
    } catch (e) {
      showToast(e.message || "Errore di rete", "err");
    } finally {
      setSaving(false);
    }
  };

  const saveMp = async () => {
    if (!fattura?.uscita?.uscita_id) return;
    setSaving(true);
    try {
      const res = await apiFetch(`${CG}/uscite/${fattura.uscita.uscita_id}/modalita-pagamento`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ modalita_pagamento: draftMp || null }),
      });
      const j = await res.json();
      if (!j.ok) throw new Error(j.error || "Errore");
      showToast(draftMp ? "Modalità aggiornata" : "Override modalità rimosso");
      setEditingMp(false);
      await refetch();
    } catch (e) {
      showToast(e.message || "Errore di rete", "err");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-neutral-100 font-sans">
        <FattureNav current="elenco" />
        <div className="max-w-5xl mx-auto p-6">
          <div className="text-center py-20 text-neutral-400">Caricamento fattura...</div>
        </div>
      </div>
    );
  }

  if (error || !fattura) {
    return (
      <div className="min-h-screen bg-neutral-100 font-sans">
        <FattureNav current="elenco" />
        <div className="max-w-5xl mx-auto p-6">
          <div className="bg-white rounded-2xl border border-red-200 p-8 text-center">
            <p className="text-red-700 font-medium mb-4">{error || "Fattura non trovata"}</p>
            <button
              onClick={() => navigate("/acquisti/elenco")}
              className="px-4 py-2 rounded-xl text-sm font-medium border border-neutral-300 bg-white hover:bg-neutral-50 transition"
            >
              ← Torna all'elenco
            </button>
          </div>
        </div>
      </div>
    );
  }

  const righe = fattura.righe || [];
  const totaleRighe = righe.reduce((s, r) => s + (r.prezzo_totale || 0), 0);

  // Valori "effettivi" v2.0 (già calcolati dal backend)
  const scadenzaEff = fattura.data_scadenza_effettiva;
  const scadenzaXml = fattura.data_scadenza_xml;
  const hasScadenzaOverride = !!fattura.data_prevista_pagamento && fattura.data_prevista_pagamento !== scadenzaXml;
  const ibanEff = fattura.iban_effettivo;
  const hasIbanOverride = !!fattura.iban_beneficiario;
  const mpEff = fattura.modalita_pagamento_effettiva;
  const mpLabel = mpEff ? (MP_LABELS[mpEff] || mpEff) : null;
  const hasMpOverride = !!fattura.modalita_pagamento_override;
  const isRateizzata = fattura.is_rateizzata;
  const uscita = fattura.uscita;
  const statoUscita = uscita?.uscita_stato || (fattura.pagato ? "PAGATA" : null);
  const statoBadgeClass = statoUscita ? STATO_BADGE[statoUscita] || "bg-neutral-100 text-neutral-700 border-neutral-200" : null;

  return (
    <div className="min-h-screen bg-neutral-100 font-sans">
      <FattureNav current="elenco" />
      <div className="max-w-5xl mx-auto p-4 sm:p-6">
        {/* BACK */}
        <button
          onClick={() => fromScadenzario ? navigate("/controllo-gestione/uscite") : navigate(-1)}
          className="text-xs text-neutral-500 hover:text-teal-700 mb-3 transition"
        >
          ← {fromScadenzario ? "Torna allo Scadenzario" : "Torna indietro"}
        </button>

        {/* TOAST */}
        {toast && (
          <div className={`fixed top-4 right-4 z-50 px-4 py-2 rounded-lg shadow-lg text-sm font-medium ${
            toast.kind === "err" ? "bg-red-600 text-white" : "bg-emerald-600 text-white"
          }`}>
            {toast.msg}
          </div>
        )}

        {/* HEADER CARD */}
        <div className="bg-white rounded-2xl border border-neutral-200 shadow-sm p-6 mb-4">
          <div className="flex flex-col md:flex-row justify-between gap-4">
            {/* Left: Fornitore */}
            <div className="flex-1">
              <p className="text-[10px] text-neutral-400 font-medium uppercase tracking-wider mb-1">Fornitore</p>
              <h1 className="text-xl font-bold text-teal-900 font-playfair">
                {fattura.fornitore_nome || "-"}
              </h1>
              {fattura.fornitore_piva && (
                <p className="text-sm text-neutral-500 mt-0.5">
                  P.IVA: <span className="tabular-nums font-medium">{fattura.fornitore_piva}</span>
                </p>
              )}
              {fattura.fornitore_piva && (
                <button
                  onClick={() => navigate(`/acquisti/fornitore/${encodeURIComponent(fattura.fornitore_piva)}`)}
                  className="mt-2 text-xs text-teal-700 hover:text-teal-900 font-medium underline underline-offset-2 transition"
                >
                  Vedi tutte le fatture di questo fornitore →
                </button>
              )}
            </div>

            {/* Right: Meta */}
            <div className="flex flex-col items-end gap-1 text-right">
              <div>
                <p className="text-[10px] text-neutral-400 font-medium uppercase tracking-wider">Fattura N.</p>
                <p className="text-lg font-bold text-neutral-900">{fattura.numero_fattura || "-"}</p>
              </div>
              <div>
                <p className="text-[10px] text-neutral-400 font-medium uppercase tracking-wider">Data</p>
                <p className="text-sm font-semibold text-neutral-800 tabular-nums">{fattura.data_fattura || "-"}</p>
              </div>
              {fattura.xml_filename && (
                <p className="text-[10px] text-neutral-400 mt-1 font-mono truncate max-w-[200px]">
                  {fattura.xml_filename}
                </p>
              )}
            </div>
          </div>

          {/* Amounts */}
          <div className="mt-4 pt-4 border-t border-neutral-100 grid grid-cols-3 gap-4">
            <div>
              <p className="text-[10px] text-neutral-400 font-medium uppercase tracking-wider">Imponibile</p>
              <p className="text-lg font-bold text-neutral-800 tabular-nums">€ {fmt(fattura.imponibile_totale)}</p>
            </div>
            <div>
              <p className="text-[10px] text-neutral-400 font-medium uppercase tracking-wider">IVA</p>
              <p className="text-lg font-bold text-neutral-800 tabular-nums">€ {fmt(fattura.iva_totale)}</p>
            </div>
            <div>
              <p className="text-[10px] text-neutral-400 font-medium uppercase tracking-wider">Totale</p>
              <p className="text-2xl font-bold text-teal-900 tabular-nums font-playfair">€ {fmt(fattura.totale_fattura)}</p>
            </div>
          </div>
        </div>

        {/* PAGAMENTI & SCADENZE (v2.0) */}
        <div className={`rounded-2xl border shadow-sm p-5 mb-4 ${
          isRateizzata ? "bg-purple-50 border-purple-200" : "bg-white border-neutral-200"
        }`}>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-neutral-800 flex items-center gap-2">
              Pagamenti & Scadenze
              {statoBadgeClass && (
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border ${statoBadgeClass}`}>
                  {statoUscita}
                </span>
              )}
              {isRateizzata && (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold border bg-purple-100 text-purple-800 border-purple-200">
                  Rateizzata
                </span>
              )}
            </h2>
            {uscita?.batch_titolo && (
              <span className="text-[11px] text-indigo-700 bg-indigo-50 border border-indigo-200 rounded-full px-3 py-1">
                In batch: <span className="font-semibold">{uscita.batch_titolo}</span> ({uscita.batch_stato})
              </span>
            )}
          </div>

          {isRateizzata && (
            <div className="mb-4 p-3 bg-purple-100/60 border border-purple-300 rounded-lg text-sm text-purple-900">
              Questa fattura è stata rateizzata nella spesa fissa{" "}
              <span className="font-semibold">{fattura.rateizzata_sf_titolo || `#${fattura.rateizzata_in_spesa_fissa_id}`}</span>.
              Le uscite effettive vivono nel piano rate di quella spesa fissa — la modifica di scadenza/IBAN/modalità qui non ha effetto diretto sulle rate.
              <button
                onClick={() => navigate(`/controllo-gestione/spese-fisse?highlight=${fattura.rateizzata_in_spesa_fissa_id}`)}
                className="ml-2 underline font-medium hover:text-purple-700"
              >
                Vai alla spesa fissa →
              </button>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* SCADENZA */}
            <div className="p-3 bg-neutral-50 rounded-lg border border-neutral-200">
              <div className="flex items-center justify-between mb-1">
                <p className="text-[10px] text-neutral-500 font-medium uppercase tracking-wider">Scadenza effettiva</p>
                {hasScadenzaOverride && (
                  <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 border border-amber-200">override</span>
                )}
              </div>
              {editingScadenza ? (
                <div className="space-y-2">
                  <input
                    type="date"
                    value={draftScadenza}
                    onChange={(e) => setDraftScadenza(e.target.value)}
                    className="w-full px-2 py-1 text-sm border border-neutral-300 rounded focus:outline-none focus:ring-2 focus:ring-teal-400"
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={saveScadenza}
                      disabled={saving || !draftScadenza}
                      className="flex-1 px-2 py-1 text-xs font-medium bg-teal-600 text-white rounded hover:bg-teal-700 disabled:opacity-50"
                    >
                      Salva
                    </button>
                    <button
                      onClick={() => setEditingScadenza(false)}
                      className="px-2 py-1 text-xs border border-neutral-300 rounded hover:bg-neutral-100"
                    >
                      Annulla
                    </button>
                  </div>
                </div>
              ) : (
                <div>
                  <p className="text-sm font-bold text-neutral-900 tabular-nums">{scadenzaEff || "—"}</p>
                  {hasScadenzaOverride && scadenzaXml && (
                    <p className="text-[10px] text-neutral-400 mt-0.5">XML: <span className="tabular-nums">{scadenzaXml}</span></p>
                  )}
                  {!isRateizzata && uscita?.uscita_id && statoUscita !== "PAGATA" && (
                    <button
                      onClick={() => {
                        setDraftScadenza(scadenzaEff || "");
                        setEditingScadenza(true);
                      }}
                      className="mt-2 text-[10px] text-teal-700 hover:text-teal-900 font-medium underline"
                    >
                      Modifica
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* MODALITÀ PAGAMENTO */}
            <div className="p-3 bg-neutral-50 rounded-lg border border-neutral-200">
              <div className="flex items-center justify-between mb-1">
                <p className="text-[10px] text-neutral-500 font-medium uppercase tracking-wider">Modalità pagamento</p>
                {hasMpOverride && (
                  <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 border border-amber-200">override</span>
                )}
              </div>
              {editingMp ? (
                <div className="space-y-2">
                  <select
                    value={draftMp}
                    onChange={(e) => setDraftMp(e.target.value)}
                    className="w-full px-2 py-1 text-sm border border-neutral-300 rounded focus:outline-none focus:ring-2 focus:ring-teal-400"
                  >
                    {MP_OPTIONS.map((o) => (
                      <option key={o.code || "_empty"} value={o.code}>{o.label}</option>
                    ))}
                  </select>
                  <div className="flex gap-2">
                    <button
                      onClick={saveMp}
                      disabled={saving}
                      className="flex-1 px-2 py-1 text-xs font-medium bg-teal-600 text-white rounded hover:bg-teal-700 disabled:opacity-50"
                    >
                      Salva
                    </button>
                    <button
                      onClick={() => setEditingMp(false)}
                      className="px-2 py-1 text-xs border border-neutral-300 rounded hover:bg-neutral-100"
                    >
                      Annulla
                    </button>
                  </div>
                </div>
              ) : (
                <div>
                  <p className="text-sm font-bold text-neutral-900">{mpEff || "—"}</p>
                  {mpLabel && mpLabel !== mpEff && (
                    <p className="text-[10px] text-neutral-500 mt-0.5">{mpLabel}</p>
                  )}
                  {hasMpOverride && fattura.modalita_pagamento_xml && (
                    <p className="text-[10px] text-neutral-400 mt-0.5">XML: {fattura.modalita_pagamento_xml}</p>
                  )}
                  {!isRateizzata && uscita?.uscita_id && statoUscita !== "PAGATA" && (
                    <button
                      onClick={() => {
                        setDraftMp(fattura.modalita_pagamento_override || "");
                        setEditingMp(true);
                      }}
                      className="mt-2 text-[10px] text-teal-700 hover:text-teal-900 font-medium underline"
                    >
                      Modifica
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* IBAN */}
            <div className="p-3 bg-neutral-50 rounded-lg border border-neutral-200">
              <div className="flex items-center justify-between mb-1">
                <p className="text-[10px] text-neutral-500 font-medium uppercase tracking-wider">IBAN beneficiario</p>
                {hasIbanOverride && (
                  <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 border border-amber-200">override</span>
                )}
              </div>
              {editingIban ? (
                <div className="space-y-2">
                  <input
                    type="text"
                    value={draftIban}
                    onChange={(e) => setDraftIban(e.target.value.toUpperCase().replace(/\s/g, ""))}
                    placeholder="IT60X..."
                    className="w-full px-2 py-1 text-xs font-mono border border-neutral-300 rounded focus:outline-none focus:ring-2 focus:ring-teal-400"
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={saveIban}
                      disabled={saving}
                      className="flex-1 px-2 py-1 text-xs font-medium bg-teal-600 text-white rounded hover:bg-teal-700 disabled:opacity-50"
                    >
                      Salva
                    </button>
                    <button
                      onClick={() => setEditingIban(false)}
                      className="px-2 py-1 text-xs border border-neutral-300 rounded hover:bg-neutral-100"
                    >
                      Annulla
                    </button>
                  </div>
                </div>
              ) : (
                <div>
                  <p className="text-xs font-mono font-semibold text-neutral-900 break-all">{ibanEff || "—"}</p>
                  {hasIbanOverride && fattura.iban_fornitore && fattura.iban_fornitore !== ibanEff && (
                    <p className="text-[9px] text-neutral-400 mt-0.5 font-mono break-all">Fornitore: {fattura.iban_fornitore}</p>
                  )}
                  {!isRateizzata && uscita?.uscita_id && statoUscita !== "PAGATA" && (
                    <button
                      onClick={() => {
                        setDraftIban(fattura.iban_beneficiario || "");
                        setEditingIban(true);
                      }}
                      className="mt-2 text-[10px] text-teal-700 hover:text-teal-900 font-medium underline"
                    >
                      Modifica
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Info pagamento effettivo */}
          {(fattura.data_effettiva_pagamento || uscita?.data_pagamento) && (
            <div className="mt-4 pt-3 border-t border-neutral-200 text-xs text-neutral-600 flex gap-4 flex-wrap">
              <span>
                Pagata il: <span className="font-semibold text-neutral-900">{fattura.data_effettiva_pagamento || uscita?.data_pagamento}</span>
              </span>
              {uscita?.metodo_pagamento && (
                <span>
                  Metodo: <span className="font-semibold text-neutral-900">{uscita.metodo_pagamento}</span>
                </span>
              )}
              {uscita?.banca_movimento_id && (
                <span className="text-emerald-700">✓ Riconciliata con banca</span>
              )}
            </div>
          )}
        </div>

        {/* RIGHE */}
        <div className="bg-white rounded-2xl border border-neutral-200 shadow-sm overflow-hidden">
          <div className="px-5 py-3 border-b border-neutral-100 flex justify-between items-center">
            <h2 className="text-sm font-semibold text-neutral-800">
              Righe fattura ({righe.length})
            </h2>
            <span className="text-xs text-neutral-400">
              Totale righe: € {fmt(totaleRighe)}
            </span>
          </div>

          {righe.length === 0 ? (
            <div className="text-center py-10 text-neutral-400 text-sm">
              Nessuna riga presente per questa fattura
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs sm:text-sm">
                <thead className="bg-neutral-50 text-neutral-500 border-b border-neutral-200">
                  <tr>
                    <th className="px-4 py-2 text-left font-medium w-8">#</th>
                    <th className="px-4 py-2 text-left font-medium">Descrizione</th>
                    <th className="px-4 py-2 text-right font-medium">Q.tà</th>
                    <th className="px-4 py-2 text-right font-medium">U.M.</th>
                    <th className="px-4 py-2 text-right font-medium">Prezzo Unit.</th>
                    <th className="px-4 py-2 text-right font-medium">Totale</th>
                    <th className="px-4 py-2 text-right font-medium">IVA %</th>
                  </tr>
                </thead>
                <tbody>
                  {righe.map((r, i) => (
                    <tr key={r.id || i} className="border-b border-neutral-100 hover:bg-neutral-50/50">
                      <td className="px-4 py-2 text-neutral-400 tabular-nums">{r.numero_linea || i + 1}</td>
                      <td className="px-4 py-2 text-neutral-800 font-medium">
                        <div className="max-w-md">
                          {r.descrizione || "-"}
                        </div>
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums text-neutral-700">
                        {r.quantita != null ? fmt(r.quantita) : "-"}
                      </td>
                      <td className="px-4 py-2 text-right text-neutral-500">{r.unita_misura || ""}</td>
                      <td className="px-4 py-2 text-right tabular-nums text-neutral-700">
                        {r.prezzo_unitario != null ? `€ ${fmt(r.prezzo_unitario)}` : "-"}
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums font-semibold text-neutral-900">
                        {r.prezzo_totale != null ? `€ ${fmt(r.prezzo_totale)}` : "-"}
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums text-neutral-500">
                        {r.aliquota_iva != null ? `${r.aliquota_iva}%` : "-"}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-teal-50/50 border-t-2 border-teal-200">
                    <td colSpan={5} className="px-4 py-2 text-right text-xs font-bold text-teal-900 uppercase tracking-wide">
                      Totale righe
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums font-bold text-teal-900 text-sm">
                      € {fmt(totaleRighe)}
                    </td>
                    <td />
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>

        {/* META INFO */}
        <div className="mt-3 flex justify-between items-center text-[10px] text-neutral-400 px-1">
          <span>Importato il: {fattura.data_import || "-"}</span>
          <span>ID: {fattura.id}</span>
        </div>
      </div>
    </div>
  );
}
