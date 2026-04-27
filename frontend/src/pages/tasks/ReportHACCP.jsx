// @version: v1.0 — Modulo I Loop HACCP completo (sessione 59 cont., 2026-04-27)
// Vista chef: report mensile HACCP con compliance %, eventi critici, top FAIL,
// breakdown per reparto, calendario gap. Pattern Home v3 originale potenziato.
import React, { useState, useEffect, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import Nav from "./Nav";
import { API_BASE, apiFetch } from "../../config/api";
import TrgbLoader from "../../components/TrgbLoader";

const HACCP = `${API_BASE}/haccp`;

const MESI = ["gennaio","febbraio","marzo","aprile","maggio","giugno","luglio","agosto","settembre","ottobre","novembre","dicembre"];

function fmtDataBreve(iso) {
  if (!iso) return "—";
  try {
    const d = new Date(iso + "T00:00:00");
    return d.toLocaleDateString("it-IT", { weekday: "short", day: "numeric", month: "short" });
  } catch { return iso; }
}

function complianceColor(pct) {
  if (pct >= 95) return { text: "text-emerald-700", bg: "bg-emerald-50", border: "border-emerald-200", bar: "bg-emerald-500" };
  if (pct >= 80) return { text: "text-amber-700",   bg: "bg-amber-50",   border: "border-amber-200",   bar: "bg-amber-500" };
  if (pct >= 60) return { text: "text-orange-700",  bg: "bg-orange-50",  border: "border-orange-200",  bar: "bg-orange-500" };
  return            { text: "text-red-700",     bg: "bg-red-50",     border: "border-red-200",     bar: "bg-red-500" };
}

export default function ReportHACCP() {
  const navigate = useNavigate();
  const oggi = useMemo(() => new Date(), []);
  const [anno, setAnno] = useState(oggi.getFullYear());
  const [mese, setMese] = useState(oggi.getMonth() + 1); // 1..12

  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const r = await apiFetch(`${HACCP}/report/${anno}/${mese}`);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const d = await r.json();
      if (d.ok) setReport(d.report);
      else throw new Error(d.detail || "Errore");
    } catch (e) {
      setError(e.message || "Errore caricamento report");
    } finally {
      setLoading(false);
    }
  }, [anno, mese]);

  useEffect(() => { load(); }, [load]);

  const meseLabel = `${MESI[mese - 1]} ${anno}`;
  const isCurrentMonth = anno === oggi.getFullYear() && mese === oggi.getMonth() + 1;

  // Navigazione mese precedente / successivo
  const goPrev = () => {
    const m = mese - 1;
    if (m < 1) { setAnno(anno - 1); setMese(12); }
    else setMese(m);
  };
  const goNext = () => {
    if (isCurrentMonth) return; // blocca futuro
    const m = mese + 1;
    if (m > 12) { setAnno(anno + 1); setMese(1); }
    else setMese(m);
  };

  const cmpKpi = report ? complianceColor(report.kpi.compliance_pct) : complianceColor(0);

  return (
    <div className="min-h-screen bg-brand-cream">
      <Nav current="haccp" />
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-5">

        {/* ═══ Header pagina ═══ */}
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3 mb-5">
          <div>
            <h1 className="font-playfair text-2xl sm:text-3xl font-bold text-brand-red tracking-tight leading-tight">
              📊 Report HACCP
            </h1>
            <p className="text-xs sm:text-sm text-neutral-500 font-medium mt-1 capitalize">
              {meseLabel}
            </p>
          </div>

          {/* Selettore mese */}
          <div className="flex items-center gap-2 bg-white rounded-[10px] border border-neutral-200 px-2 py-1" style={{ boxShadow: "0 2px 10px rgba(0,0,0,.06)" }}>
            <button onClick={goPrev}
              className="w-8 h-8 rounded-md hover:bg-neutral-100 text-neutral-600 font-bold transition"
              aria-label="Mese precedente">‹</button>
            <select value={mese} onChange={e => setMese(Number(e.target.value))}
              className="bg-transparent text-sm font-semibold text-brand-ink border-0 focus:outline-none capitalize">
              {MESI.map((m, i) => (
                <option key={i} value={i + 1}>{m}</option>
              ))}
            </select>
            <input type="number" value={anno}
              onChange={e => setAnno(Number(e.target.value) || oggi.getFullYear())}
              min="2020" max={oggi.getFullYear()}
              className="w-16 bg-transparent text-sm font-semibold text-brand-ink border-0 focus:outline-none tabular-nums" />
            <button onClick={goNext} disabled={isCurrentMonth}
              className="w-8 h-8 rounded-md hover:bg-neutral-100 text-neutral-600 font-bold transition disabled:opacity-30 disabled:cursor-not-allowed"
              aria-label="Mese successivo">›</button>
          </div>
        </div>

        {error && (
          <div className="mb-4 rounded-[14px] border border-red-200 bg-red-50 text-red-800 px-4 py-3 text-sm flex items-center justify-between"
            style={{ boxShadow: "0 2px 10px rgba(0,0,0,.06)" }}>
            <span>⚠ {error}</span>
            <button onClick={load} className="text-xs font-semibold underline">Riprova</button>
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-16">
            <TrgbLoader size={48} label="Caricamento report…" />
          </div>
        ) : !report ? (
          <p className="text-center py-16 text-neutral-500">Nessun dato disponibile per {meseLabel}.</p>
        ) : (
          <div className="space-y-4">

            {/* ═══ KPI ROW ═══ */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
              <KpiTile
                emoji="✅"
                value={`${report.kpi.compliance_pct}%`}
                label="Compliance"
                sub={`${report.kpi.n_completate} / ${report.kpi.n_istanze_totali - report.kpi.n_saltate}`}
                bg={cmpKpi.bg} border={cmpKpi.border} text={cmpKpi.text}
              />
              <KpiTile
                emoji="📋"
                value={report.kpi.n_istanze_totali}
                label="Istanze totali"
                sub={`${report.kpi.giorni_con_attivita} giorni con attività`}
                bg="bg-blue-50" border="border-blue-200" text="text-blue-900"
              />
              <KpiTile
                emoji="⚠️"
                value={report.kpi.n_eventi_critici}
                label="Eventi critici"
                sub="temperature/valori fuori soglia"
                bg={report.kpi.n_eventi_critici > 0 ? "bg-red-50" : "bg-emerald-50"}
                border={report.kpi.n_eventi_critici > 0 ? "border-red-200" : "border-emerald-200"}
                text={report.kpi.n_eventi_critici > 0 ? "text-red-900" : "text-emerald-900"}
              />
              <KpiTile
                emoji="✗"
                value={report.kpi.n_item_fail}
                label="Item FAIL"
                sub={`su ${report.kpi.n_item_eseguiti} eseguiti`}
                bg={report.kpi.n_item_fail > 0 ? "bg-red-50" : "bg-emerald-50"}
                border={report.kpi.n_item_fail > 0 ? "border-red-200" : "border-emerald-200"}
                text={report.kpi.n_item_fail > 0 ? "text-red-900" : "text-emerald-900"}
              />
              <KpiTile
                emoji="⏱"
                value={report.kpi.n_scadute}
                label="Scadute"
                sub="non chiuse entro la scadenza"
                bg={report.kpi.n_scadute > 0 ? "bg-amber-50" : "bg-neutral-50"}
                border={report.kpi.n_scadute > 0 ? "border-amber-200" : "border-neutral-200"}
                text={report.kpi.n_scadute > 0 ? "text-amber-900" : "text-neutral-900"}
              />
              <KpiTile
                emoji="📅"
                value={report.kpi.giorni_senza_attivita}
                label="Gap registro"
                sub="giorni senza dati"
                bg={report.kpi.giorni_senza_attivita > 0 ? "bg-amber-50" : "bg-emerald-50"}
                border={report.kpi.giorni_senza_attivita > 0 ? "border-amber-200" : "border-emerald-200"}
                text={report.kpi.giorni_senza_attivita > 0 ? "text-amber-900" : "text-emerald-900"}
              />
            </div>

            {/* ═══ Grid 2 colonne: per_reparto · top_fail ═══ */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

              {/* PER REPARTO */}
              <Section emoji="🏷️" title="Compliance per reparto" bg="bg-white" border="border-neutral-200" titleColor="text-brand-ink">
                {report.per_reparto.length === 0 ? (
                  <p className="text-sm text-neutral-500">Nessuna istanza nel mese.</p>
                ) : (
                  <div className="space-y-3">
                    {report.per_reparto.map(r => {
                      const c = complianceColor(r.compliance_pct);
                      return (
                        <div key={r.reparto}>
                          <div className="flex items-center justify-between text-xs mb-1">
                            <span className="font-semibold text-brand-ink">{r.reparto}</span>
                            <span className="flex items-center gap-2 text-[11px] text-neutral-600">
                              <span>{r.n_completate}/{r.n_istanze - r.n_saltate}</span>
                              <span className={`font-bold ${c.text} tabular-nums`}>{r.compliance_pct}%</span>
                            </span>
                          </div>
                          <div className="h-2 rounded-full bg-neutral-100 overflow-hidden">
                            <div className={`h-full ${c.bar} transition-all`} style={{ width: `${Math.min(100, r.compliance_pct)}%` }} />
                          </div>
                          {(r.n_scadute > 0 || r.n_saltate > 0) && (
                            <div className="text-[10px] text-neutral-500 mt-1">
                              {r.n_scadute > 0 && <span className="text-amber-600 mr-2">⏱ {r.n_scadute} scadute</span>}
                              {r.n_saltate > 0 && <span className="text-neutral-500">↷ {r.n_saltate} saltate</span>}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </Section>

              {/* TOP FAIL */}
              <Section
                emoji="🔍" title="Top item con più FAIL"
                bg={report.top_item_fail.length > 0 ? "bg-red-50" : "bg-emerald-50"}
                border={report.top_item_fail.length > 0 ? "border-red-200" : "border-emerald-200"}
                titleColor={report.top_item_fail.length > 0 ? "text-red-900" : "text-emerald-900"}
                badge={report.top_item_fail.length > 0 ? report.top_item_fail.length : null}
              >
                {report.top_item_fail.length === 0 ? (
                  <p className="text-sm text-emerald-900">✓ Nessun item con esiti FAIL nel mese.</p>
                ) : (
                  <div className="space-y-2">
                    {report.top_item_fail.map((it, i) => (
                      <div key={i} className="bg-white rounded-md border border-red-200 px-3 py-2">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-medium text-brand-ink truncate">{it.titolo}</span>
                          <span className="text-[11px] font-bold text-red-700 whitespace-nowrap tabular-nums">{it.n_fail} FAIL</span>
                        </div>
                        <div className="text-[10px] text-neutral-500 mt-0.5 flex items-center gap-2">
                          <span className="px-1.5 py-0.5 rounded bg-neutral-100 border border-neutral-200">{it.reparto}</span>
                          {it.esempi_data.length > 0 && (
                            <span className="truncate" title={it.esempi_data.join(", ")}>
                              {it.esempi_data.slice(0, 2).map(d => fmtDataBreve(d)).join(" · ")}
                              {it.esempi_data.length > 2 && " …"}
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </Section>

            </div>

            {/* ═══ EVENTI CRITICI ═══ */}
            {report.eventi_critici.length > 0 && (
              <Section emoji="🌡️" title="Eventi critici (valori fuori soglia)"
                bg="bg-red-50" border="border-red-200" titleColor="text-red-900"
                badge={report.eventi_critici.length}>
                <div className="overflow-x-auto -mx-2">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-left text-[10px] uppercase tracking-wide text-neutral-500 border-b border-red-200">
                        <th className="px-2 py-1.5 font-semibold">Data</th>
                        <th className="px-2 py-1.5 font-semibold">Reparto</th>
                        <th className="px-2 py-1.5 font-semibold">Item</th>
                        <th className="px-2 py-1.5 font-semibold text-right">Valore</th>
                        <th className="px-2 py-1.5 font-semibold">Soglia</th>
                        <th className="px-2 py-1.5 font-semibold">Da</th>
                      </tr>
                    </thead>
                    <tbody>
                      {report.eventi_critici.map((ev, i) => (
                        <tr key={i} className="border-b border-red-100 last:border-0">
                          <td className="px-2 py-1.5 tabular-nums text-neutral-700">{fmtDataBreve(ev.data)}</td>
                          <td className="px-2 py-1.5 text-neutral-600">{ev.reparto}</td>
                          <td className="px-2 py-1.5 text-brand-ink font-medium">{ev.item_titolo}</td>
                          <td className="px-2 py-1.5 text-right font-bold text-red-700 tabular-nums">
                            {ev.valore} {ev.unita_misura || ""}
                          </td>
                          <td className="px-2 py-1.5 text-neutral-500 text-[11px]">{ev.soglia}</td>
                          <td className="px-2 py-1.5 text-neutral-500 text-[11px] truncate max-w-[100px]" title={ev.rilevato_da || ""}>
                            {ev.rilevato_da || "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Section>
            )}

            {/* ═══ COMPLIANCE GIORNALIERA ═══ */}
            <Section emoji="📈" title="Compliance giornaliera" bg="bg-white" border="border-neutral-200" titleColor="text-brand-ink">
              {report.compliance_giornaliera.length === 0 ? (
                <p className="text-sm text-neutral-500">Nessun giorno con attività nel mese.</p>
              ) : (
                <div className="space-y-1">
                  {report.compliance_giornaliera.map(g => {
                    const c = complianceColor(g.compliance_pct);
                    return (
                      <div key={g.giorno} className="flex items-center gap-3 px-2 py-1.5 rounded-md hover:bg-neutral-50">
                        <span className="text-[11px] font-mono tabular-nums text-neutral-600 w-24 flex-shrink-0">
                          {fmtDataBreve(g.giorno)}
                        </span>
                        <div className="flex-1 h-2 rounded-full bg-neutral-100 overflow-hidden">
                          <div className={`h-full ${c.bar} transition-all`} style={{ width: `${Math.min(100, g.compliance_pct)}%` }} />
                        </div>
                        <span className={`text-[11px] font-bold w-12 text-right tabular-nums ${c.text}`}>{g.compliance_pct}%</span>
                        <span className="text-[10px] text-neutral-500 w-16 text-right whitespace-nowrap">
                          {g.n_completate}/{g.n_istanze - g.n_saltate}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </Section>

            {/* ═══ GAP NEL REGISTRO (giornate senza dati) ═══ */}
            {report.giornate_senza_dati.length > 0 && (
              <Section emoji="📅" title="Giorni senza alcuna attività registrata"
                bg="bg-amber-50" border="border-amber-200" titleColor="text-amber-900"
                badge={report.giornate_senza_dati.length}>
                <p className="text-xs text-amber-800 mb-3">
                  Questi giorni non hanno alcuna istanza checklist registrata. Possibile gap nel registro
                  (template inattivo, scheduler non eseguito, festivi, chiusura locale).
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {report.giornate_senza_dati.map(d => (
                    <span key={d} className="text-[11px] font-mono tabular-nums px-2 py-1 rounded bg-white border border-amber-200 text-amber-800">
                      {fmtDataBreve(d)}
                    </span>
                  ))}
                </div>
              </Section>
            )}

            {/* ═══ Footer info ═══ */}
            <div className="text-[10px] text-neutral-400 text-center pt-2 pb-4">
              Periodo: {report.data_inizio} → {report.data_fine} · sorgente: <code>tasks.sqlite3</code>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Sub-components ──────────────────────────────────────────

function KpiTile({ emoji, value, label, sub, bg, border, text }) {
  return (
    <div className={`rounded-[14px] border ${bg} ${border} px-3 py-3 flex items-start gap-3 min-h-[80px]`}
      style={{ boxShadow: "0 2px 10px rgba(0,0,0,.06)" }}>
      <span className="text-[28px] leading-none flex-shrink-0">{emoji}</span>
      <div className="min-w-0 flex-1">
        <div className={`text-2xl font-extrabold tabular-nums leading-none ${text}`}>{value ?? "—"}</div>
        <div className="text-[11px] text-brand-ink font-semibold mt-1 leading-tight">{label}</div>
        {sub && <div className="text-[10px] text-neutral-500 mt-0.5 truncate" title={sub}>{sub}</div>}
      </div>
    </div>
  );
}

function Section({ emoji, title, bg, border, titleColor, badge, children }) {
  return (
    <div className={`rounded-[14px] border ${bg} ${border} p-4`}
      style={{ boxShadow: "0 2px 10px rgba(0,0,0,.06)" }}>
      <div className="flex items-center gap-2 mb-3">
        <span className="text-[24px] leading-none flex-shrink-0" aria-hidden>{emoji}</span>
        <h3 className={`text-base font-bold font-playfair tracking-tight ${titleColor || "text-brand-ink"}`}>
          {title}
        </h3>
        {badge != null && (
          <span className="ml-1 inline-flex items-center justify-center min-w-[20px] h-[20px] px-1.5 rounded-full bg-red-600 text-white text-[10px] font-bold">
            {badge}
          </span>
        )}
      </div>
      {children}
    </div>
  );
}
