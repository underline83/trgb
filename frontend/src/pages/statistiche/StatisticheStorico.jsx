// @version: v1.0-statistiche-storico
// Modulo: statistiche
// Storico incassi pluriennale (YoY) + analisi giorno della settimana.
// Fonte: /statistiche/storico/* — cucitura daily_closures (2021→cutover)
// + shift_closures (dal cutover). Coperti e split pranzo/cena solo era shift.
import React, { useEffect, useMemo, useState } from "react";
import { API_BASE, apiFetch } from "../../config/api";
import StatisticheNav from "./StatisticheNav";
import TrgbLoader from "../../components/TrgbLoader";
import { EmptyState } from "../../components/ui";

const EP = `${API_BASE}/statistiche`;

const MESI_SHORT = ["Gen", "Feb", "Mar", "Apr", "Mag", "Giu", "Lug", "Ago", "Set", "Ott", "Nov", "Dic"];

const fmt = (n) =>
  n != null ? Number(n).toLocaleString("it-IT", { maximumFractionDigits: 0 }) : "—";
const fmt2 = (n) =>
  n != null ? Number(n).toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "—";

function DeltaPct({ value }) {
  if (value == null) return null;
  const up = value >= 0;
  return (
    <span className={`text-[10px] font-medium ${up ? "text-brand-green" : "text-brand-red"}`}>
      {up ? "+" : ""}{value.toFixed(1)}%
    </span>
  );
}

export default function StatisticheStorico() {
  const [loading, setLoading] = useState(true);
  const [yoy, setYoy] = useState(null);
  const [weekday, setWeekday] = useState(null);
  const [wdAnno, setWdAnno] = useState(""); // "" = tutta la storia
  const [wdLoading, setWdLoading] = useState(false);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const [yoyRes, wdRes] = await Promise.all([
          apiFetch(`${EP}/storico/yoy`),
          apiFetch(`${EP}/storico/weekday`),
        ]);
        if (yoyRes.ok) setYoy(await yoyRes.json());
        if (wdRes.ok) setWeekday(await wdRes.json());
      } catch (_) {}
      setLoading(false);
    })();
  }, []);

  const loadWeekday = async (annoVal) => {
    setWdAnno(annoVal);
    setWdLoading(true);
    try {
      const qs = annoVal ? `?anno=${annoVal}` : "";
      const res = await apiFetch(`${EP}/storico/weekday${qs}`);
      if (res.ok) setWeekday(await res.json());
    } catch (_) {}
    setWdLoading(false);
  };

  const anni = yoy?.annuale?.map((a) => a.anno) || [];
  const maxAnnuale = useMemo(
    () => Math.max(1, ...(yoy?.annuale?.map((a) => a.fatturato) || [1])),
    [yoy]
  );

  // Matrice mese × anno: matrix[mese][anno] = fatturato
  const matrix = useMemo(() => {
    const m = {};
    for (const r of yoy?.mensile || []) {
      if (!m[r.mese]) m[r.mese] = {};
      m[r.mese][r.anno] = r;
    }
    return m;
  }, [yoy]);

  // YTD: per confronto omogeneo, somma fino all'ultimo mese COMPLETO dell'anno corrente
  const ytd = useMemo(() => {
    if (!yoy?.mensile?.length) return null;
    const now = new Date();
    const annoCorrente = now.getFullYear();
    const meseLimite = now.getMonth(); // mese corrente escluso (0-based → mesi 1..meseLimite)
    if (meseLimite < 1) return null;
    const per = {};
    for (const r of yoy.mensile) {
      if (r.mese <= meseLimite) per[r.anno] = (per[r.anno] || 0) + r.fatturato;
    }
    return { meseLimite, annoCorrente, per };
  }, [yoy]);

  const maxWd = useMemo(
    () => Math.max(1, ...(weekday?.weekdays?.map((d) => d.fatt_medio) || [1])),
    [weekday]
  );

  return (
    <div className="min-h-screen bg-brand-cream p-6 font-sans">
      <StatisticheNav current="storico" />
      <div className="max-w-6xl mx-auto mt-4 space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-rose-900 tracking-wide font-playfair">Storico</h1>
          <p className="text-neutral-600 text-sm mt-1">
            Incassi anno su anno e per giorno della settimana, dalle chiusure di cassa.
            {yoy?.cutover && (
              <span className="text-neutral-400"> Coperti e split pranzo/cena disponibili dal {new Date(yoy.cutover).toLocaleDateString("it-IT")}.</span>
            )}
          </p>
        </div>

        {loading ? (
          <TrgbLoader size={48} label="Caricamento…" className="py-12" />
        ) : !yoy || yoy.annuale.length === 0 ? (
          <EmptyState icon="🕰️" title="Nessun dato storico" description="Non ci sono chiusure di cassa registrate." />
        ) : (
          <>
            {/* ═══ ANNI A CONFRONTO ═══ */}
            <div className="bg-white rounded-2xl shadow p-6">
              <h2 className="text-lg font-bold text-neutral-800 mb-4">Fatturato per anno</h2>
              <div className="flex items-end gap-2 h-48 mb-2">
                {yoy.annuale.map((a, i) => {
                  const prev = yoy.annuale[i - 1];
                  const pct = (a.fatturato / maxAnnuale) * 100;
                  const isCorrente = a.anno === new Date().getFullYear();
                  return (
                    <div key={a.anno} className="flex-1 flex flex-col items-center justify-end h-full">
                      <div className="text-[11px] font-semibold text-neutral-700 mb-0.5">{fmt(a.fatturato)} €</div>
                      {prev && (
                        <DeltaPct value={((a.fatturato - prev.fatturato) / prev.fatturato) * 100} />
                      )}
                      <div
                        className={`w-full rounded-t-md transition-all min-h-[2px] ${isCorrente ? "bg-brand-blue" : "bg-neutral-300"}`}
                        style={{ height: `${Math.max(pct, 1)}%` }}
                        title={`${a.anno}: ${fmt(a.fatturato)} € in ${a.giorni} giorni (media ${fmt(a.media_giorno)} €/g)`}
                      />
                      <div className="text-xs text-neutral-500 mt-1 font-medium">{a.anno}</div>
                      <div className="text-[10px] text-neutral-400">{a.giorni} gg · {fmt(a.media_giorno)} €/g</div>
                    </div>
                  );
                })}
              </div>
              <p className="text-[11px] text-neutral-400">
                L'anno corrente è parziale: per il confronto omogeneo vedi la riga "Parziale" nella tabella sotto.
              </p>
            </div>

            {/* ═══ MATRICE MESE × ANNO ═══ */}
            <div className="bg-white rounded-2xl shadow p-6">
              <h2 className="text-lg font-bold text-neutral-800 mb-1">Mese per mese, anno su anno</h2>
              <p className="text-xs text-neutral-400 mb-4">Delta % rispetto allo stesso mese dell'anno precedente.</p>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-neutral-200 text-neutral-500">
                      <th className="py-2 px-2 text-left">Mese</th>
                      {anni.map((y) => (
                        <th key={y} className={`py-2 px-2 text-right ${y === new Date().getFullYear() ? "text-brand-blue" : ""}`}>{y}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {Array.from({ length: 12 }, (_, i) => i + 1).map((mese) => (
                      <tr key={mese} className="border-b border-neutral-50 hover:bg-neutral-50">
                        <td className="py-1.5 px-2 font-medium text-neutral-700">{MESI_SHORT[mese - 1]}</td>
                        {anni.map((y) => {
                          const cell = matrix[mese]?.[y];
                          const prevCell = matrix[mese]?.[y - 1];
                          const delta = cell && prevCell && prevCell.fatturato > 0
                            ? ((cell.fatturato - prevCell.fatturato) / prevCell.fatturato) * 100
                            : null;
                          return (
                            <td key={y} className="py-1.5 px-2 text-right whitespace-nowrap">
                              {cell ? (
                                <>
                                  <span className="text-neutral-800">{fmt(cell.fatturato)}</span>
                                  {delta != null && <span className="ml-1"><DeltaPct value={delta} /></span>}
                                </>
                              ) : (
                                <span className="text-neutral-300">—</span>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                    {ytd && (
                      <tr className="border-t-2 border-neutral-200 bg-neutral-50 font-medium">
                        <td className="py-2 px-2 text-neutral-700">
                          Parziale <span className="text-[10px] text-neutral-400">(Gen–{MESI_SHORT[ytd.meseLimite - 1]})</span>
                        </td>
                        {anni.map((y) => {
                          const v = ytd.per[y];
                          const pv = ytd.per[y - 1];
                          const delta = v != null && pv > 0 ? ((v - pv) / pv) * 100 : null;
                          return (
                            <td key={y} className="py-2 px-2 text-right whitespace-nowrap">
                              {v != null ? (
                                <>
                                  <span className="text-neutral-800">{fmt(v)}</span>
                                  {delta != null && <span className="ml-1"><DeltaPct value={delta} /></span>}
                                </>
                              ) : (
                                <span className="text-neutral-300">—</span>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* ═══ GIORNO DELLA SETTIMANA ═══ */}
            <div className="bg-white rounded-2xl shadow p-6">
              <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                <h2 className="text-lg font-bold text-neutral-800">Giorno della settimana</h2>
                <select
                  value={wdAnno}
                  onChange={(e) => loadWeekday(e.target.value)}
                  className="border border-neutral-300 rounded-lg px-3 py-1.5 text-sm"
                >
                  <option value="">Tutta la storia</option>
                  {anni.map((y) => (
                    <option key={y} value={y}>{y}</option>
                  ))}
                </select>
              </div>

              {wdLoading ? (
                <TrgbLoader size={36} label="Caricamento…" className="py-6" />
              ) : !weekday || weekday.weekdays.every((d) => d.giorni === 0) ? (
                <EmptyState icon="📅" title="Nessun dato" description="Nessuna chiusura nel periodo selezionato." compact />
              ) : (
                <>
                  <div className="flex items-end gap-2 h-40 mb-4">
                    {weekday.weekdays.map((d) => {
                      const pct = (d.fatt_medio / maxWd) * 100;
                      return (
                        <div key={d.weekday} className="flex-1 flex flex-col items-center justify-end h-full">
                          <div className="text-[11px] font-semibold text-neutral-700 mb-1">{fmt(d.fatt_medio)} €</div>
                          <div
                            className="w-full bg-rose-400 rounded-t-md transition-all min-h-[2px]"
                            style={{ height: `${Math.max(pct, 1)}%` }}
                            title={`${d.label}: media ${fmt(d.fatt_medio)} € su ${d.giorni} giorni aperti`}
                          />
                          <div className="text-xs text-neutral-500 mt-1">{d.label.slice(0, 3)}</div>
                          <div className="text-[10px] text-neutral-400">{d.giorni} gg</div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Dettaglio turni (solo era shift_closures) */}
                  {weekday.weekdays.some((d) => d.giorni_turni > 0) && (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-neutral-200 text-left text-neutral-500">
                            <th className="py-1.5 px-2">Giorno</th>
                            <th className="py-1.5 px-2 text-right">Coperti medi</th>
                            <th className="py-1.5 px-2 text-right">di cui pranzo</th>
                            <th className="py-1.5 px-2 text-right">di cui cena</th>
                            <th className="py-1.5 px-2 text-right">€ pranzo</th>
                            <th className="py-1.5 px-2 text-right">€ cena</th>
                          </tr>
                        </thead>
                        <tbody>
                          {weekday.weekdays.filter((d) => d.giorni_turni > 0).map((d) => (
                            <tr key={d.weekday} className="border-b border-neutral-50 hover:bg-neutral-50">
                              <td className="py-1.5 px-2 font-medium">{d.label}</td>
                              <td className="py-1.5 px-2 text-right">{d.coperti_medio ?? "—"}</td>
                              <td className="py-1.5 px-2 text-right text-neutral-500">{d.coperti_pranzo_medio ?? "—"}</td>
                              <td className="py-1.5 px-2 text-right text-neutral-500">{d.coperti_cena_medio ?? "—"}</td>
                              <td className="py-1.5 px-2 text-right">{fmt2(d.fatt_pranzo_medio)}</td>
                              <td className="py-1.5 px-2 text-right">{fmt2(d.fatt_cena_medio)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      <p className="text-[11px] text-neutral-400 mt-2">
                        Coperti e split pranzo/cena calcolati solo sui giorni con chiusure turno
                        {weekday.cutover && <> (dal {new Date(weekday.cutover).toLocaleDateString("it-IT")})</>}.
                      </p>
                    </div>
                  )}
                </>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
