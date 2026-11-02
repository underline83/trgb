// @version: v1.0-statistiche-servizio (2026-11-02, IP.1 parte 2)
// Modulo: statistiche (aggregatore read-only) — dati dai conti di cassa iPratico Cloud (modulo cassa)
// Come lavora la sala: numeri del periodo contro il periodo prima, giorni e turni,
// orari di arrivo, sale, dimensione dei tavoli, mese per mese.
// Fonte: GET /statistiche/servizio/?giorni=N (solo admin). Servizio: vendite_conti_service.servizio_riepilogo
import React, { useEffect, useState } from "react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { API_BASE, apiFetch } from "../../config/api";
import StatisticheNav from "./StatisticheNav";
import TrgbLoader from "../../components/TrgbLoader";

const PERIODI = [
  { giorni: 30, label: "30 giorni" },
  { giorni: 90, label: "3 mesi" },
  { giorni: 365, label: "12 mesi" },
];
const ORDINE_GIORNI = [1, 2, 3, 4, 5, 6, 0]; // lunedì → domenica
const NOMI_GIORNI = ["Domenica", "Lunedì", "Martedì", "Mercoledì", "Giovedì", "Venerdì", "Sabato"];
const MESI = ["gen", "feb", "mar", "apr", "mag", "giu", "lug", "ago", "set", "ott", "nov", "dic"];

const euro = (n, dec = 0) => (n == null ? "—" : `${Number(n).toLocaleString("it-IT", { minimumFractionDigits: dec, maximumFractionDigits: dec })} €`);
const num = (n) => (n == null ? "—" : Number(n).toLocaleString("it-IT"));
const dataBreve = (iso) => { if (!iso) return "—"; const [, m, d] = iso.split("-"); return `${Number(d)} ${MESI[Number(m) - 1]}`; };
const meseBreve = (ym) => { const [y, m] = ym.split("-"); return `${MESI[Number(m) - 1]} ${y.slice(2)}`; };

function Delta({ ora, prima, inverti = false }) {
  if (ora == null || !prima) return null;
  const pct = Math.round(((ora - prima) / prima) * 100);
  if (pct === 0) return <span className="text-xs text-neutral-400">= periodo prima</span>;
  const bene = inverti ? pct < 0 : pct > 0;
  return <span className={`text-xs font-semibold ${bene ? "text-emerald-700" : "text-red-700"}`}>{pct > 0 ? "↑" : "↓"} {Math.abs(pct)}% sul periodo prima</span>;
}

function Card({ titolo, children, nota }) {
  return (
    <section className="rounded-2xl bg-white border border-neutral-200 p-4">
      <h2 className="text-xs font-bold tracking-wider uppercase text-neutral-500 mb-3 font-sans">{titolo}</h2>
      {children}
      {nota && <p className="mt-2 text-xs text-neutral-400">{nota}</p>}
    </section>
  );
}

export default function StatisticheServizio() {
  const [giorni, setGiorni] = useState(90);
  const [d, setD] = useState(null);
  const [errore, setErrore] = useState(null);

  useEffect(() => {
    setD(null); setErrore(null);
    apiFetch(`${API_BASE}/statistiche/servizio/?giorni=${giorni}`)
      .then(async (r) => { if (!r.ok) throw new Error((await r.json().catch(() => ({}))).detail || "Errore"); return r.json(); })
      .then(setD)
      .catch((e) => setErrore(e.message));
  }, [giorni]);

  const n = d?.numeri, p = d?.numeri_prima;
  const cella = {};
  (d?.settimana || []).forEach((s) => { cella[`${s.dow}|${s.turno}`] = s; });
  const maxCop = Math.max(1, ...(d?.settimana || []).map((s) => s.coperti_medi));
  const arrivi = (turno) => (d?.arrivi || []).filter((a) => a.turno === turno && a.coperti > 0);

  return (
    <div className="min-h-screen bg-brand-cream font-sans">
      <StatisticheNav current="servizio" />
      <div className="max-w-6xl mx-auto px-4 py-5 space-y-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-neutral-900 font-playfair">Servizio</h1>
          <p className="text-sm text-neutral-500 mt-1">
            Dai conti di cassa{d ? ` · dal ${dataBreve(d.dal)} al ${dataBreve(d.al)} · confronto con ${dataBreve(d.prima_dal)} – ${dataBreve(d.prima_al)}` : ""}
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          {PERIODI.map((x) => (
            <button key={x.giorni} type="button" onClick={() => setGiorni(x.giorni)} aria-pressed={giorni === x.giorni}
              className={`min-h-[40px] px-4 rounded-full border text-sm font-semibold ${giorni === x.giorni ? "bg-rose-800 border-rose-800 text-white" : "bg-white border-neutral-300 text-neutral-700 hover:border-rose-400"}`}>
              {x.label}
            </button>
          ))}
        </div>

        {errore && <div className="rounded-xl bg-red-50 border border-red-200 text-red-800 text-sm p-3">{errore}</div>}
        {!d && !errore && <TrgbLoader />}

        {d && (
          <>
            {/* Numeri del periodo */}
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-2">
              {[
                ["Incasso", euro(n.incasso), <Delta ora={n.incasso} prima={p.incasso} />],
                ["Coperti", num(n.coperti), <Delta ora={n.coperti} prima={p.coperti} />],
                ["A coperto", euro(n.a_coperto, 1), <Delta ora={n.a_coperto} prima={p.a_coperto} />],
                ["Coperti a servizio", num(n.coperti_a_servizio), <Delta ora={n.coperti_a_servizio} prima={p.coperti_a_servizio} />],
                ["Durata media", n.durata ? `${n.durata} min` : "—", <span className="text-xs text-neutral-500">pranzo {d.durata_turno.pranzo ?? "—"} · cena {d.durata_turno.cena ?? "—"} min</span>],
              ].map(([l, v, sotto]) => (
                <div key={l} className="rounded-xl bg-white border border-neutral-200 px-3 py-2.5">
                  <div className="text-xs font-bold text-neutral-500">{l}</div>
                  <div className="text-2xl font-bold text-neutral-900 tabular-nums">{v}</div>
                  <div>{sotto}</div>
                </div>
              ))}
            </div>
            {n.senza_coperti > 0 && (
              <p className="text-xs text-neutral-500">
                {n.senza_coperti} conti senza coperti (eventi, fatture, banco) per {euro(n.incasso_senza_coperti)}: contano nell'incasso, non nel «a coperto».
              </p>
            )}

            {/* Giorni e turni */}
            <Card titolo="Giorni e turni — media per servizio" nota="Il colore è più pieno dove ci sono più coperti.">
              <div className="overflow-x-auto -mx-1">
                <table className="w-full text-sm min-w-[480px]">
                  <thead>
                    <tr className="text-xs text-neutral-500">
                      <th className="text-left font-semibold py-1 px-1">Giorno</th>
                      <th className="text-left font-semibold py-1 px-1">Pranzo</th>
                      <th className="text-left font-semibold py-1 px-1">Cena</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ORDINE_GIORNI.map((dow) => (
                      <tr key={dow} className="border-t border-neutral-100">
                        <td className="py-1.5 px-1 font-semibold text-neutral-800">{NOMI_GIORNI[dow]}</td>
                        {["pranzo", "cena"].map((t) => {
                          const c = cella[`${dow}|${t}`];
                          if (!c || c.servizi < 2) return <td key={t} className="py-1.5 px-1 text-neutral-300">chiuso</td>;
                          const alfa = 0.08 + 0.5 * (c.coperti_medi / maxCop);
                          return (
                            <td key={t} className="py-1 px-1">
                              <div className="rounded-lg px-2.5 py-1.5" style={{ background: `rgba(159, 18, 57, ${alfa})` }}>
                                <span className="text-base font-bold tabular-nums">{num(c.coperti_medi)}</span>
                                <span className="text-xs text-neutral-700"> coperti · {euro(c.incasso_medio)} · {euro(c.a_coperto, 0)} a cop.</span>
                              </div>
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>

            {/* Arrivi */}
            <div className="grid gap-3 md:grid-cols-2">
              {["pranzo", "cena"].map((t) => (
                <Card key={t} titolo={`Arrivi a ${t} — coperti per mezz'ora`} nota="Dall'ora di apertura del conto in cassa.">
                  {arrivi(t).length === 0 ? <div className="text-sm text-neutral-400">Nessun dato.</div> : (
                    <div className="h-48">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={arrivi(t)} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#eee" />
                          <XAxis dataKey="ora" tick={{ fontSize: 11 }} />
                          <YAxis tick={{ fontSize: 11 }} />
                          <Tooltip formatter={(v) => [num(v), "coperti"]} />
                          <Bar dataKey="coperti" fill="#9f1239" radius={[4, 4, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                </Card>
              ))}
            </div>

            {/* Sale e tavoli */}
            <div className="grid gap-3 md:grid-cols-2">
              <Card titolo="Sale">
                <table className="w-full text-sm">
                  <thead><tr className="text-xs text-neutral-500"><th className="text-left font-semibold py-1">Sala</th><th className="text-right font-semibold">Coperti</th><th className="text-right font-semibold">Incasso</th><th className="text-right font-semibold">A coperto</th></tr></thead>
                  <tbody>
                    {d.sale.map((s) => (
                      <tr key={s.sala} className="border-t border-neutral-100">
                        <td className="py-1.5 font-semibold">{s.sala}</td>
                        <td className="text-right tabular-nums">{num(s.coperti)}</td>
                        <td className="text-right tabular-nums">{euro(s.incasso)}</td>
                        <td className="text-right tabular-nums">{euro(s.a_coperto, 1)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Card>
              <Card titolo="Tavoli per numero di persone">
                <table className="w-full text-sm">
                  <thead><tr className="text-xs text-neutral-500"><th className="text-left font-semibold py-1">Persone</th><th className="text-right font-semibold">Tavoli</th><th className="text-right font-semibold">A coperto</th><th className="text-right font-semibold">Durata</th></tr></thead>
                  <tbody>
                    {d.tavoli.map((t) => (
                      <tr key={t.persone} className="border-t border-neutral-100">
                        <td className="py-1.5 font-semibold">{t.persone}</td>
                        <td className="text-right tabular-nums">{num(t.conti)}</td>
                        <td className="text-right tabular-nums">{euro(t.a_coperto, 1)}</td>
                        <td className="text-right tabular-nums">{t.durata ? `${t.durata} min` : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Card>
            </div>

            {/* Mese per mese */}
            {d.mesi.length > 1 && (
              <Card titolo="Mese per mese">
                <div className="h-56">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={d.mesi.map((m) => ({ ...m, etichetta: meseBreve(m.mese) }))} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#eee" />
                      <XAxis dataKey="etichetta" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${Math.round(v / 1000)}k`} />
                      <Tooltip formatter={(v) => [euro(v), "incasso"]} />
                      <Bar dataKey="incasso" fill="#9f1239" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <div className="overflow-x-auto mt-2">
                  <table className="w-full text-sm min-w-[420px]">
                    <thead><tr className="text-xs text-neutral-500"><th className="text-left font-semibold py-1">Mese</th><th className="text-right font-semibold">Coperti</th><th className="text-right font-semibold">Incasso</th><th className="text-right font-semibold">A coperto</th></tr></thead>
                    <tbody>
                      {d.mesi.map((m) => (
                        <tr key={m.mese} className="border-t border-neutral-100">
                          <td className="py-1.5">{meseBreve(m.mese)}</td>
                          <td className="text-right tabular-nums">{num(m.coperti)}</td>
                          <td className="text-right tabular-nums">{euro(m.incasso)}</td>
                          <td className="text-right tabular-nums">{euro(m.a_coperto, 1)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            )}
            <p className="text-xs text-neutral-400">Dati di cassa fino a {dataBreve(d.dati_fino_al)} (scarico ogni notte).</p>
          </>
        )}
      </div>
    </div>
  );
}
