// @version: v1.0 — Analisi Utenze U3 (spec docs/spec_utenze.md, sessione 2026-07-17)
// Upload bollette A2A (luce+gas) → parser backend → KPI + serie storica.
// SOLA ANALISI: la contabilità resta su fe_fatture (zero doppio conteggio CE).
// M.I primitives (PageLayout, Btn, Modal, EmptyState) — pagina nuova → li usa.
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer, ReferenceLine,
} from "recharts";
import { API_BASE, apiFetch } from "../../config/api";
import { Btn, Modal, EmptyState } from "../../components/ui";
import PageLayout from "../../components/ui/PageLayout";
import ControlloGestioneNav from "./ControlloGestioneNav";

const U = `${API_BASE}/controllo-gestione/utenze`;

const fmtEur = (n, dec = 2) =>
  n != null ? Number(n).toLocaleString("it-IT", { minimumFractionDigits: dec, maximumFractionDigits: dec }) : "—";
const fmtNum = (n, dec = 0) =>
  n != null ? Number(n).toLocaleString("it-IT", { maximumFractionDigits: dec }) : "—";
const fmtDate = (d) =>
  d ? new Date(d + "T00:00:00").toLocaleDateString("it-IT", { day: "2-digit", month: "short", year: "numeric" }) : "—";
const fmtMese = (ym) => {
  if (!ym) return "";
  const [y, m] = ym.split("-");
  return `${["", "Gen", "Feb", "Mar", "Apr", "Mag", "Giu", "Lug", "Ago", "Set", "Ott", "Nov", "Dic"][Number(m)]} ${y.slice(2)}`;
};

// Palette grafici (TRGB-02): fasce luce = scala blu, gas = verde/ambra
const COL = {
  F1: "#1e40af", F2: "#2E7BE8", F3: "#93c5fd",
  reale: "#2EB872", stimata: "#f59e0b",
  potenza: "#2E7BE8", limite: "#E8402B",
};

const TIPO_META = {
  LUCE: { icon: "💡", label: "Energia elettrica", chip: "bg-amber-100 text-amber-800 border-amber-200" },
  GAS: { icon: "🔥", label: "Gas naturale", chip: "bg-orange-100 text-orange-800 border-orange-200" },
};

export default function ControlloGestioneUtenze() {
  const [forniture, setForniture] = useState([]);
  const [consumi, setConsumi] = useState([]);
  const [bollette, setBollette] = useState([]);
  const [loading, setLoading] = useState(true);
  const [errore, setErrore] = useState(null);

  // Upload / preview
  const fileRef = useRef(null);
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState(null);     // { parsed, pdf_hash, gia_importata }
  const [confirming, setConfirming] = useState(false);
  const [flash, setFlash] = useState(null);         // { tipo: 'ok'|'err', msg }

  const flashMsg = (tipo, msg) => {
    setFlash({ tipo, msg });
    setTimeout(() => setFlash(null), 6000);
  };

  const loadAll = useCallback(async () => {
    setLoading(true);
    setErrore(null);
    try {
      const [rd, rc, rb] = await Promise.all([
        apiFetch(`${U}/`),
        apiFetch(`${U}/consumi`),
        apiFetch(`${U}/bollette`),
      ]);
      if (!rd.ok || !rc.ok || !rb.ok) throw new Error("Errore caricamento dati utenze");
      setForniture((await rd.json()).forniture || []);
      setConsumi((await rc.json()).consumi || []);
      setBollette((await rb.json()).bollette || []);
    } catch (e) {
      setErrore(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);

  // ─── Upload ────────────────────────────────────────────────────
  const handleFile = async (file) => {
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".pdf")) {
      flashMsg("err", "Serve un PDF (bolletta A2A)");
      return;
    }
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await apiFetch(`${U}/upload`, { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Errore upload");
      setPreview(data);
    } catch (e) {
      flashMsg("err", e.message);
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const handleConferma = async () => {
    if (!preview) return;
    setConfirming(true);
    try {
      const res = await apiFetch(`${U}/conferma`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pdf_hash: preview.pdf_hash }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Errore conferma");
      setPreview(null);
      flashMsg("ok", `Bolletta importata (${data.consumi_upsert} righe serie${data.fe_fattura_id ? ", agganciata alla fattura" : ""})`);
      loadAll();
    } catch (e) {
      flashMsg("err", e.message);
    } finally {
      setConfirming(false);
    }
  };

  const handleRiparse = async (id) => {
    try {
      const res = await apiFetch(`${U}/bollette/${id}/riparse`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Errore ri-analisi");
      flashMsg("ok", `Bolletta ri-analizzata (${data.consumi_upsert} righe serie aggiornate)`);
      loadAll();
    } catch (e) {
      flashMsg("err", e.message);
    }
  };

  const [riparsingAll, setRiparsingAll] = useState(false);
  const handleRiparseAll = async () => {
    setRiparsingAll(true);
    let ok = 0, err = 0;
    for (const b of bollette) {
      try {
        const res = await apiFetch(`${U}/bollette/${b.id}/riparse`, { method: "POST" });
        if (!res.ok) throw new Error();
        ok += 1;
      } catch {
        err += 1;
      }
    }
    setRiparsingAll(false);
    flashMsg(err ? "err" : "ok", `Ri-analisi completata: ${ok} ok${err ? `, ${err} errori` : ""}`);
    loadAll();
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Eliminare la bolletta e i suoi dati dalla serie?")) return;
    try {
      const res = await apiFetch(`${U}/bollette/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error((await res.json()).detail || "Errore eliminazione");
      flashMsg("ok", "Bolletta eliminata");
      loadAll();
    } catch (e) {
      flashMsg("err", e.message);
    }
  };

  // ─── Serie per i grafici — una per FORNITURA (possono esserci più POD
  //     dello stesso tipo, es. luce ristorante + luce insegna) ─────
  const serieByFornitura = useMemo(() => {
    const out = [];
    for (const { fornitura: f } of forniture) {
      const righe = consumi.filter((c) => c.fornitura_id === f.id);
      if (!righe.length) continue;
      const byMese = {};
      for (const r of righe) {
        byMese[r.anno_mese] = byMese[r.anno_mese] || { mese: r.anno_mese };
        const m = byMese[r.anno_mese];
        if (["F1", "F2", "F3"].includes(r.fascia)) m[r.fascia] = r.consumo;
        if (r.fascia === "TOT") {
          m.tot = r.consumo || 0;
          if (r.potenza_max_kw != null) m.kw = r.potenza_max_kw;
        }
        if (r.fascia === "STIMATA") m.stimata = r.consumo || 0;
      }
      const serie = Object.values(byMese)
        .map((m) => ({ ...m, reale: Math.max(0, (m.tot || 0) - (m.stimata || 0)) }))
        .sort((a, b) => a.mese.localeCompare(b.mese));
      if (serie.some((m) => m.tot || m.F1 || m.kw != null)) out.push({ f, serie });
    }
    return out;
  }, [consumi, forniture]);

  // ─── Render ────────────────────────────────────────────────────
  return (
    <PageLayout
      nav={<ControlloGestioneNav current="utenze" />}
      title="💡 Analisi Utenze"
      subtitle="Bollette A2A luce e gas — consumi, prezzi, scadenze. Analisi separata dalla contabilità (fe_fatture)."
      actions={
        <Btn onClick={() => fileRef.current?.click()} loading={uploading}>
          ⬆ Carica bolletta PDF
        </Btn>
      }
    >
      <input
        ref={fileRef} type="file" accept=".pdf" className="hidden"
        onChange={(e) => handleFile(e.target.files?.[0])}
      />

      {flash && (
        <div className={`mb-4 px-4 py-2.5 rounded-xl text-sm border ${
          flash.tipo === "ok"
            ? "bg-emerald-50 text-emerald-800 border-emerald-200"
            : "bg-red-50 text-red-800 border-red-200"
        }`}>
          {flash.msg}
        </div>
      )}

      {loading ? (
        <div className="py-16 text-center text-neutral-400 text-sm">Caricamento…</div>
      ) : errore ? (
        <EmptyState icon="⚠️" title="Errore caricamento" hint={errore} />
      ) : forniture.length === 0 ? (
        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => { e.preventDefault(); setDragOver(false); handleFile(e.dataTransfer.files?.[0]); }}
          className={`border-2 border-dashed rounded-2xl p-12 text-center transition cursor-pointer bg-white ${
            dragOver ? "border-brand-blue bg-blue-50" : "border-neutral-300"
          }`}
          onClick={() => fileRef.current?.click()}
        >
          <EmptyState
            icon="🧾"
            title="Nessuna bolletta caricata"
            hint="Trascina qui il PDF della bolletta A2A (luce o gas) o clicca per selezionarlo. Ogni bolletta porta con sé 18 mesi di storico."
          />
        </div>
      ) : (
        <>
          {/* ─── KPI per fornitura ─── */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
            {forniture.map(({ fornitura: f, ultima_bolletta: ub, kpi }) => {
              const meta = TIPO_META[f.tipo] || {};
              const giorni = kpi.giorni_a_scadenza_condizioni;
              return (
                <div key={f.id} className="bg-white rounded-2xl border border-neutral-200 shadow-sm p-5">
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xl">{meta.icon}</span>
                        <h3 className="font-bold text-brand-ink">{meta.label}</h3>
                        <span className={`text-[11px] px-2 py-0.5 rounded-full border ${meta.chip}`}>
                          {f.offerta || "—"}
                        </span>
                      </div>
                      <div className="text-xs text-neutral-500 mt-1">
                        {f.tipo === "LUCE" ? "POD" : "PDR"} {f.pod_pdr || "—"} · fornitura {f.numero_fornitura}
                      </div>
                    </div>
                    {giorni != null && (
                      <div className={`text-right text-xs px-2.5 py-1.5 rounded-xl border ${
                        giorni <= 60
                          ? "bg-red-50 text-red-700 border-red-200 font-semibold"
                          : "bg-neutral-50 text-neutral-600 border-neutral-200"
                      }`}>
                        Condizioni: {fmtDate(f.scadenza_condizioni)}
                        <div>{giorni >= 0 ? `tra ${giorni} gg` : `scadute da ${-giorni} gg`}</div>
                      </div>
                    )}
                  </div>

                  <div className="grid grid-cols-3 gap-3 text-center">
                    <div className="bg-brand-cream rounded-xl py-2.5">
                      <div className="text-lg font-bold text-brand-ink">
                        {kpi.prezzo_allin != null ? fmtEur(kpi.prezzo_allin, 3) : "—"}
                      </div>
                      <div className="text-[11px] text-neutral-500">€/{ub?.unita || (f.tipo === "LUCE" ? "kWh" : "Smc")} all-in</div>
                    </div>
                    <div className="bg-brand-cream rounded-xl py-2.5">
                      <div className="text-lg font-bold text-brand-ink">{fmtNum(kpi.consumo_annuo)}</div>
                      <div className="text-[11px] text-neutral-500">{ub?.unita || ""}/anno</div>
                    </div>
                    <div className="bg-brand-cream rounded-xl py-2.5">
                      <div className="text-lg font-bold text-brand-ink">
                        {kpi.spesa_annua != null ? `€ ${fmtEur(kpi.spesa_annua, 0)}` : "—"}
                      </div>
                      <div className="text-[11px] text-neutral-500">spesa/anno</div>
                    </div>
                  </div>

                  <div className="mt-3 flex flex-wrap gap-2 text-[11px]">
                    {f.tipo === "GAS" && kpi.pct_stimato != null && (
                      <span className={`px-2 py-1 rounded-full border ${
                        kpi.pct_stimato > 30
                          ? "bg-amber-50 text-amber-800 border-amber-200 font-semibold"
                          : "bg-neutral-50 text-neutral-600 border-neutral-200"
                      }`}>
                        {kpi.pct_stimato}% consumo stimato{kpi.pct_stimato > 30 ? " → fai l'autolettura" : ""}
                      </span>
                    )}
                    {f.tipo === "LUCE" && kpi.potenza_max_12m_kw != null && (
                      <span className="px-2 py-1 rounded-full border bg-neutral-50 text-neutral-600 border-neutral-200">
                        Potenza max 12m: {fmtEur(kpi.potenza_max_12m_kw, 1)} kW su {fmtEur(f.potenza_impegnata_kw, 0)} kW impegnati
                      </span>
                    )}
                    {f.spread != null && (
                      <span className="px-2 py-1 rounded-full border bg-neutral-50 text-neutral-600 border-neutral-200">
                        {f.indice_riferimento || "indice"} + {String(f.spread).replace(".", ",")} €/{f.tipo === "LUCE" ? "kWh" : "Smc"}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* ─── Grafici — per ogni fornitura con dati ─── */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
            {serieByFornitura.map(({ f, serie }) => (
              <React.Fragment key={f.id}>
                {f.tipo === "LUCE" && serie.some((m) => m.F1 != null) && (
                  <div className="bg-white rounded-2xl border border-neutral-200 shadow-sm p-4">
                    <h4 className="text-sm font-semibold text-brand-ink mb-2">
                      💡 Luce — consumi per fascia (kWh)
                      <span className="text-neutral-400 font-normal text-xs ml-2">POD {f.pod_pdr}</span>
                    </h4>
                    <ResponsiveContainer width="100%" height={230}>
                      <BarChart data={serie} margin={{ top: 4, right: 8, left: -12, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#eee" vertical={false} />
                        <XAxis dataKey="mese" tickFormatter={fmtMese} tick={{ fontSize: 10 }} />
                        <YAxis tick={{ fontSize: 10 }} />
                        <Tooltip labelFormatter={fmtMese} formatter={(v, n) => [`${fmtNum(v)} kWh`, n]} />
                        <Legend wrapperStyle={{ fontSize: 11 }} />
                        <Bar dataKey="F1" stackId="f" fill={COL.F1} name="F1 (punta)" />
                        <Bar dataKey="F2" stackId="f" fill={COL.F2} name="F2 (intermedia)" />
                        <Bar dataKey="F3" stackId="f" fill={COL.F3} name="F3 (fuori punta)" radius={[3, 3, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}

                {f.tipo === "GAS" && serie.some((m) => m.tot) && (
                  <div className="bg-white rounded-2xl border border-neutral-200 shadow-sm p-4">
                    <h4 className="text-sm font-semibold text-brand-ink mb-2">
                      🔥 Gas — consumi mensili (Smc)
                      <span className="text-neutral-400 font-normal text-xs ml-2">PDR {f.pod_pdr}</span>
                    </h4>
                    <ResponsiveContainer width="100%" height={230}>
                      <BarChart data={serie} margin={{ top: 4, right: 8, left: -12, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#eee" vertical={false} />
                        <XAxis dataKey="mese" tickFormatter={fmtMese} tick={{ fontSize: 10 }} />
                        <YAxis tick={{ fontSize: 10 }} />
                        <Tooltip labelFormatter={fmtMese} formatter={(v, n) => [`${fmtNum(v, 1)} Smc`, n]} />
                        <Legend wrapperStyle={{ fontSize: 11 }} />
                        <Bar dataKey="reale" stackId="g" fill={COL.reale} name="Rilevato" />
                        <Bar dataKey="stimata" stackId="g" fill={COL.stimata} name="Stimato" radius={[3, 3, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}

                {f.tipo === "LUCE" && serie.some((m) => m.kw != null) && (
                  <div className="bg-white rounded-2xl border border-neutral-200 shadow-sm p-4">
                    <h4 className="text-sm font-semibold text-brand-ink mb-2">
                      ⚡ Potenza max vs impegnata (kW)
                      <span className="text-neutral-400 font-normal text-xs ml-2">POD {f.pod_pdr}</span>
                    </h4>
                    <ResponsiveContainer width="100%" height={200}>
                      <LineChart data={serie.filter((m) => m.kw != null)} margin={{ top: 4, right: 8, left: -12, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#eee" vertical={false} />
                        <XAxis dataKey="mese" tickFormatter={fmtMese} tick={{ fontSize: 10 }} />
                        <YAxis domain={[0, Math.max(f.potenza_impegnata_kw || 0, ...serie.map((m) => m.kw || 0)) + 3]} tick={{ fontSize: 10 }} />
                        <Tooltip labelFormatter={fmtMese} formatter={(v) => [`${fmtEur(v, 1)} kW`, "Potenza max"]} />
                        {f.potenza_impegnata_kw != null && (
                          <ReferenceLine
                            y={f.potenza_impegnata_kw} stroke={COL.limite} strokeDasharray="6 4"
                            label={{ value: `impegnata ${fmtEur(f.potenza_impegnata_kw, 0)} kW`, fontSize: 10, fill: COL.limite, position: "insideTopRight" }}
                          />
                        )}
                        <Line type="monotone" dataKey="kw" stroke={COL.potenza} strokeWidth={2} dot={{ r: 2.5 }} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </React.Fragment>
            ))}
          </div>

          {/* ─── Tabella bollette ─── */}
          <div className="bg-white rounded-2xl border border-neutral-200 shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b border-neutral-100 flex items-center justify-between">
              <h4 className="text-sm font-semibold text-brand-ink">
                Bollette caricate ({bollette.length})
                {bollette.length > 0 && (
                  <Btn variant="ghost" size="sm" onClick={handleRiparseAll} loading={riparsingAll}
                       title="Ri-analizza tutti i PDF archiviati (utile dopo un aggiornamento del parser)">
                    🔄 tutte
                  </Btn>
                )}
              </h4>
              <div
                onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={(e) => { e.preventDefault(); setDragOver(false); handleFile(e.dataTransfer.files?.[0]); }}
                className={`text-[11px] px-3 py-1.5 rounded-lg border border-dashed cursor-pointer ${
                  dragOver ? "border-brand-blue bg-blue-50 text-brand-blue" : "border-neutral-300 text-neutral-400"
                }`}
                onClick={() => fileRef.current?.click()}
              >
                trascina qui un PDF
              </div>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] uppercase text-neutral-400 border-b border-neutral-100">
                  <th className="px-4 py-2">Tipo</th>
                  <th className="px-2 py-2">N. bolletta</th>
                  <th className="px-2 py-2">Periodo</th>
                  <th className="px-2 py-2 text-right">Consumo</th>
                  <th className="px-2 py-2 text-right">Totale</th>
                  <th className="px-2 py-2 text-center">Fattura</th>
                  <th className="px-2 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {bollette.map((b) => (
                  <tr key={b.id} className="border-b border-neutral-50 hover:bg-neutral-50">
                    <td className="px-4 py-2">{TIPO_META[b.tipo]?.icon} {b.tipo === "LUCE" ? "Luce" : "Gas"}</td>
                    <td className="px-2 py-2 font-mono text-xs">{b.numero_bolletta}</td>
                    <td className="px-2 py-2 text-xs text-neutral-600">
                      {fmtDate(b.periodo_da)} → {fmtDate(b.periodo_a)}
                    </td>
                    <td className="px-2 py-2 text-right">
                      {fmtNum(b.consumo_fatturato, 1)} {b.unita}
                      {b.consumo_stimato > 0 && (
                        <span className="text-[10px] text-amber-600 block">di cui {fmtNum(b.consumo_stimato, 1)} stimati</span>
                      )}
                    </td>
                    <td className="px-2 py-2 text-right font-semibold">€ {fmtEur(b.totale)}</td>
                    <td className="px-2 py-2 text-center">
                      {b.fe_fattura_id ? (
                        <a
                          href={`/acquisti/dettaglio/${b.fe_fattura_id}`}
                          className="text-brand-blue text-xs hover:underline"
                          title="Apri la fattura in Acquisti"
                        >
                          🔗 #{b.fe_fattura_id}
                        </a>
                      ) : (
                        <span className="text-neutral-300 text-xs" title="Fattura non ancora sincronizzata da FIC">—</span>
                      )}
                    </td>
                    <td className="px-2 py-2 text-right pr-4 whitespace-nowrap">
                      {(b.warnings || []).length > 0 && (
                        <span className="text-amber-500 text-xs mr-1" title={b.warnings.join("\n")}>⚠️</span>
                      )}
                      <Btn variant="ghost" size="sm" onClick={() => handleRiparse(b.id)} title="Ri-analizza il PDF (dopo un miglioramento del parser)">
                        🔄
                      </Btn>
                      <Btn variant="ghost" size="sm" onClick={() => handleDelete(b.id)} title="Elimina bolletta">
                        🗑
                      </Btn>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* ─── Modal preview → conferma ─── */}
      <Modal
        open={!!preview}
        onClose={() => setPreview(null)}
        title={preview ? `${TIPO_META[preview.parsed?.tipo]?.icon || "🧾"} Bolletta ${preview.parsed?.tipo === "LUCE" ? "luce" : "gas"} n. ${preview.parsed?.numero_bolletta || "?"}` : ""}
        footer={
          <>
            <Btn variant="secondary" onClick={() => setPreview(null)}>Annulla</Btn>
            <Btn onClick={handleConferma} loading={confirming} disabled={preview?.gia_importata}>
              {preview?.gia_importata ? "Già importata" : "Conferma import"}
            </Btn>
          </>
        }
      >
        {preview && (
          <div className="text-sm space-y-3">
            {preview.gia_importata && (
              <div className="bg-amber-50 border border-amber-200 text-amber-800 rounded-xl px-3 py-2 text-xs">
                ⚠️ Questa bolletta risulta già importata (id {preview.bolletta_esistente_id}).
              </div>
            )}
            <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
              {[
                ["Periodo", `${fmtDate(preview.parsed.periodo_da)} → ${fmtDate(preview.parsed.periodo_a)}`],
                ["Consumo fatturato", `${fmtNum(preview.parsed.consumo_fatturato, 1)} ${preview.parsed.unita}`],
                ["Totale da pagare", `€ ${fmtEur(preview.parsed.totale_da_pagare)}`],
                ["Prezzo medio consumi", `${fmtEur(preview.parsed.prezzo_medio, 4)} €/${preview.parsed.unita}`],
                ["Offerta", preview.parsed.offerta || "—"],
                ["Scadenza condizioni", fmtDate(preview.parsed.scadenza_condizioni)],
                ["Scadenza pagamento", fmtDate(preview.parsed.scadenza_pagamento)],
                ["Spesa annua dichiarata", preview.parsed.spesa_annua != null ? `€ ${fmtEur(preview.parsed.spesa_annua, 0)}` : "—"],
              ].map(([k, v]) => (
                <React.Fragment key={k}>
                  <div className="text-neutral-500 text-xs pt-0.5">{k}</div>
                  <div className="font-medium text-brand-ink">{v}</div>
                </React.Fragment>
              ))}
            </div>
            {preview.parsed.storico_mensile && (
              <div className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2">
                ✓ Storico di {Object.keys(preview.parsed.storico_mensile).length} mesi incluso: la serie si aggiorna da sola.
              </div>
            )}
            {(preview.parsed.warnings || []).length > 0 && (
              <div className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
                <div className="font-semibold mb-1">Campi non estratti:</div>
                <ul className="list-disc ml-4 space-y-0.5">
                  {preview.parsed.warnings.map((w, i) => <li key={i}>{w}</li>)}
                </ul>
              </div>
            )}
          </div>
        )}
      </Modal>
    </PageLayout>
  );
}
