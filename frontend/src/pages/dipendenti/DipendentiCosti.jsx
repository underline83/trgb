// @version: v2.0 — G.3 Fase E (E.8), 2026-05-16
// Pagina "Costi Dipendenti": vista mensile del costo aziendale completo
// (dal ELAB del consulente paghe) + F24 versato del mese + cross-check.
// La vecchia versione era un placeholder.
//
// Marco 2026-05-16: questa pagina chiude il cerchio della Fase E rendendo
// visibile il dato che alimenta il Conto Economico (modalità "completo"),
// con riconciliazione automatica vs versamenti F24.

import React, { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { API_BASE, apiFetch } from "../../config/api";
import DipendentiNav from "./DipendentiNav";

const MESI = ["", "Gennaio", "Febbraio", "Marzo", "Aprile", "Maggio", "Giugno",
              "Luglio", "Agosto", "Settembre", "Ottobre", "Novembre", "Dicembre"];

const fmtEur = (n) => {
  if (n == null) return "—";
  return `€ ${Number(n).toLocaleString("it-IT", {
    minimumFractionDigits: 2, maximumFractionDigits: 2,
  })}`;
};

export default function DipendentiCosti() {
  const navigate = useNavigate();
  const oggi = new Date();
  const [anno, setAnno] = useState(oggi.getFullYear());
  const [mese, setMese] = useState(oggi.getMonth() + 1);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch(`${API_BASE}/dipendenti/costi-mensili?anno=${anno}&mese=${mese}`);
      if (res.ok) setData(await res.json());
    } finally {
      setLoading(false);
    }
  }, [anno, mese]);

  useEffect(() => { load(); }, [load]);

  const cc = data?.costo_consuntivo;
  const f24 = data?.f24;
  const cross = data?.crosscheck;

  return (
    <div className="min-h-screen bg-brand-cream pb-20">
      <DipendentiNav current="costi" />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
        {/* HEADER */}
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3 mb-6">
          <div>
            <h1 className="text-2xl font-bold text-purple-900 font-playfair">
              💰 Costi Dipendenti
            </h1>
            <div className="text-sm text-neutral-600 mt-0.5">
              Costo aziendale completo dal Riepilogo paghe (ELAB) + versamenti F24 del mese
            </div>
          </div>
          <div className="flex items-center gap-2">
            <select value={mese} onChange={(e) => setMese(+e.target.value)}
              className="border border-purple-300 rounded-lg px-2 py-1.5 text-sm bg-white">
              {MESI.slice(1).map((m, i) => <option key={i + 1} value={i + 1}>{m}</option>)}
            </select>
            <select value={anno} onChange={(e) => setAnno(+e.target.value)}
              className="border border-purple-300 rounded-lg px-2 py-1.5 text-sm bg-white">
              {[...Array(6)].map((_, i) => {
                const y = oggi.getFullYear() - 3 + i;
                return <option key={y} value={y}>{y}</option>;
              })}
            </select>
          </div>
        </div>

        {loading && !data && (
          <div className="text-center py-20 text-neutral-500">Caricamento...</div>
        )}

        {data && !cc && (
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-6">
            <h2 className="text-lg font-bold text-amber-900 mb-2">⚠ ELAB non importato per questo mese</h2>
            <p className="text-sm text-amber-800">
              Per <strong>{MESI[mese]} {anno}</strong> non è stato ancora caricato il file ELAB
              del consulente paghe. Vai su <em>Buste Paga</em> e usa il bottone
              "📑 Import ELAB / F24" per caricarlo.
            </p>
          </div>
        )}

        {cc && (
          <>
            {/* KPI HERO 4 card */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
              <KpiCard label="Costo azienda" value={fmtEur(cc.totali.costo_totale_azienda)}
                sub={`${cc.n_dipendenti} dipendenti`} color="violet" big />
              <KpiCard label="Lordo dipendenti" value={fmtEur(cc.totali.lordo)} color="sky" />
              <KpiCard label="Carico ditta" value={fmtEur(cc.totali.contributi_lordo + cc.totali.contributi_su_ratei + cc.totali.inail)}
                sub="INPS + INAIL" color="amber" />
              <KpiCard label="Ratei + TFR" value={fmtEur(cc.totali.ratei + cc.totali.tfr_maturato)}
                sub="13a/14a/ferie/TFR" color="emerald" />
            </div>

            {/* CROSS-CHECK */}
            {cross && (
              <div className={`mb-5 rounded-xl border p-3 ${
                cross.match
                  ? "bg-green-50 border-green-300"
                  : "bg-amber-50 border-amber-300"
              }`}>
                <div className={`text-xs font-bold uppercase tracking-wider mb-1 ${
                  cross.match ? "text-green-900" : "text-amber-900"
                }`}>
                  {cross.match ? "✓" : "⚠"} Cross-check ELAB vs F24
                </div>
                <div className="text-sm grid grid-cols-1 sm:grid-cols-3 gap-2 mt-1">
                  <div>Contributi INPS ELAB: <strong>{fmtEur(cross.contributi_elab)}</strong></div>
                  <div>DM10 versato F24: <strong>{fmtEur(cross.dm10_f24)}</strong></div>
                  <div>Delta: <strong className={Math.abs(cross.delta) < 5 ? "text-green-700" : "text-red-700"}>
                    {fmtEur(cross.delta)}
                  </strong></div>
                </div>
              </div>
            )}

            {/* DETTAGLIO DIPENDENTI */}
            <div className="bg-white rounded-2xl border border-neutral-200 shadow-sm overflow-hidden mb-6">
              <div className="px-5 py-3 border-b border-neutral-200 bg-violet-50">
                <h2 className="text-sm font-bold text-violet-900 uppercase tracking-wider">
                  👥 Dipendenti — costo per persona ({cc.n_dipendenti})
                </h2>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-neutral-50 text-neutral-500">
                    <tr>
                      <th className="text-left px-4 py-2 font-semibold">Matr.</th>
                      <th className="text-left px-4 py-2 font-semibold">Cognome Nome</th>
                      <th className="text-right px-3 py-2 font-semibold">Ore</th>
                      <th className="text-right px-3 py-2 font-semibold">Lordo</th>
                      <th className="text-right px-3 py-2 font-semibold">Ctr ditta</th>
                      <th className="text-right px-3 py-2 font-semibold">Ratei</th>
                      <th className="text-right px-3 py-2 font-semibold">TFR</th>
                      <th className="text-right px-3 py-2 font-semibold">Costo tot</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-100">
                    {cc.dipendenti.map(d => (
                      <tr key={d.id} className="hover:bg-neutral-50">
                        <td className="px-4 py-2 font-mono text-xs text-neutral-500">{d.matricola}</td>
                        <td className="px-4 py-2">
                          {d.dipendente_id ? (
                            <span className="text-neutral-800">{d.cognome_nome}</span>
                          ) : (
                            <span className="text-amber-700">
                              {d.cognome_nome}
                              <span className="ml-1.5 text-[10px] text-amber-600">(non abbinato)</span>
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-right font-mono text-xs text-neutral-600">
                          {d.ore_lavorate ? `${d.ore_lavorate}h` : "—"}
                        </td>
                        <td className="px-3 py-2 text-right font-mono">{fmtEur(d.retribuzione_lorda)}</td>
                        <td className="px-3 py-2 text-right font-mono text-amber-700">{fmtEur(d.contributi_lordo)}</td>
                        <td className="px-3 py-2 text-right font-mono text-emerald-700">{fmtEur(d.ratei_importo)}</td>
                        <td className="px-3 py-2 text-right font-mono text-emerald-700">{fmtEur(d.tfr_maturato)}</td>
                        <td className="px-3 py-2 text-right font-mono font-bold text-violet-900">{fmtEur(d.costo_totale)}</td>
                      </tr>
                    ))}
                    {/* Riga INAIL azienda */}
                    {cc.totali.inail > 0 && (
                      <tr className="bg-amber-50/50">
                        <td className="px-4 py-2 font-mono text-xs text-amber-700">AZIENDA</td>
                        <td className="px-4 py-2 text-amber-800">INAIL del mese</td>
                        <td className="px-3 py-2" colSpan={5}></td>
                        <td className="px-3 py-2 text-right font-mono font-bold text-amber-900">{fmtEur(cc.totali.inail)}</td>
                      </tr>
                    )}
                  </tbody>
                  <tfoot className="bg-violet-50 border-t-2 border-violet-200">
                    <tr>
                      <td colSpan={3} className="px-4 py-2 font-bold text-violet-900">TOTALI</td>
                      <td className="px-3 py-2 text-right font-mono font-bold">{fmtEur(cc.totali.lordo)}</td>
                      <td className="px-3 py-2 text-right font-mono font-bold">{fmtEur(cc.totali.contributi_lordo)}</td>
                      <td className="px-3 py-2 text-right font-mono font-bold">{fmtEur(cc.totali.ratei + cc.totali.contributi_su_ratei)}</td>
                      <td className="px-3 py-2 text-right font-mono font-bold">{fmtEur(cc.totali.tfr_maturato)}</td>
                      <td className="px-3 py-2 text-right font-mono font-bold text-violet-900 text-base">
                        {fmtEur(cc.totali.costo_totale_azienda)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
              {cc.fonte_pdf && (
                <div className="text-[10px] text-neutral-400 px-5 py-1.5 border-t border-neutral-100">
                  Fonte: {cc.fonte_pdf}
                </div>
              )}
            </div>
          </>
        )}

        {/* F24 — VERSAMENTI DEL MESE */}
        {f24 && (
          <div className="bg-white rounded-2xl border border-neutral-200 shadow-sm overflow-hidden mb-6">
            <div className="px-5 py-3 border-b border-neutral-200 bg-blue-50 flex items-center justify-between flex-wrap gap-2">
              <h2 className="text-sm font-bold text-blue-900 uppercase tracking-wider">
                🏦 F24 versati — competenza {MESI[mese]} {anno}
              </h2>
              <div className="text-sm font-mono font-bold text-blue-900">
                Saldo totale: {fmtEur(f24.saldo_totale)}
              </div>
            </div>
            <div className="divide-y divide-neutral-100">
              {f24.per_sezione.map((sez, i) => (
                <div key={i} className="px-5 py-3">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="font-semibold text-sm text-neutral-700">{sez.sezione}</span>
                    <span className="font-mono text-sm">
                      <span className="text-neutral-500">D </span>
                      <strong>{fmtEur(sez.tot_debito)}</strong>
                      {sez.tot_credito > 0 && (
                        <>
                          <span className="text-neutral-400 mx-2">·</span>
                          <span className="text-neutral-500">C </span>
                          <strong className="text-green-700">{fmtEur(sez.tot_credito)}</strong>
                        </>
                      )}
                    </span>
                  </div>
                  <div className="text-xs space-y-0.5">
                    {sez.righe.map((r, j) => (
                      <div key={j} className="flex items-center justify-between hover:bg-neutral-50 px-2 py-0.5 rounded">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="font-mono text-neutral-500">{r.codice_tributo}</span>
                          <span className="text-neutral-700 truncate">
                            {r.descrizione_tributo || "—"}
                          </span>
                          {r.periodo_rif_anno && (
                            <span className="text-neutral-400 text-[10px]">
                              {r.periodo_rif_mese?.toString().padStart(2, "0") || "—"}/{r.periodo_rif_anno}
                            </span>
                          )}
                          {r.codice_comune && <span className="text-neutral-400 text-[10px]">com.{r.codice_comune}</span>}
                          {r.codice_regione && <span className="text-neutral-400 text-[10px]">reg.{r.codice_regione}</span>}
                        </div>
                        <div className="font-mono">
                          {r.importo_debito > 0 && <span className="text-neutral-700">{fmtEur(r.importo_debito)}</span>}
                          {r.importo_credito > 0 && <span className="text-green-700 ml-2">−{fmtEur(r.importo_credito)}</span>}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            <div className="px-5 py-2 bg-neutral-50 border-t border-neutral-200 text-[10px] text-neutral-500 flex justify-between">
              <span>{f24.deleghe.length} delega/deleghe · {f24.n_righe} righe tributo</span>
              <span>{f24.deleghe.map(d => `${d.data_scadenza} (€${d.saldo})`).join(" · ")}</span>
            </div>
          </div>
        )}

        {!f24 && data && (
          <div className="bg-neutral-50 border border-neutral-200 rounded-2xl p-4 text-sm text-neutral-600">
            Nessun F24 importato per il mese di competenza <strong>{MESI[mese]} {anno}</strong>.
          </div>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
function KpiCard({ label, value, sub, color, big = false }) {
  return (
    <div className={`rounded-2xl border p-4 ${
      big ? `border-${color}-400 bg-${color}-100 shadow-md` : `border-${color}-200 bg-${color}-50`
    }`}>
      <div className={`text-[10px] uppercase tracking-wider font-semibold mb-1 text-${color}-700`}>
        {label}
      </div>
      <div className={`font-bold text-${color}-900 ${big ? "text-2xl" : "text-lg"}`}>
        {value}
      </div>
      {sub && <div className={`text-xs mt-1 text-${color}-600`}>{sub}</div>}
    </div>
  );
}
