// @version: v1.0-statistiche-sito (2026-10-23, mig 210)
// Modulo: statistiche (aggregatore read-only) — dati dal modulo `sito`
// Visite del sito: viste al giorno contro il periodo prima, pagine, lingue,
// provenienze, dispositivi, clic per obiettivo, e i clic su «Prenota» accanto alle
// prenotazioni fatte dal sito nello stesso periodo (solo confronto fra totali).
// Fonte: GET /statistiche/sito?giorni=N (solo admin). Doc: docs/modulo_sito.md
import React, { useEffect, useState } from "react";
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from "recharts";
import { API_BASE, apiFetch } from "../../config/api";
import StatisticheNav from "./StatisticheNav";
import TrgbLoader from "../../components/TrgbLoader";
import { EmptyState } from "../../components/ui";

const PERIODI = [7, 30, 90, 365];

const OBIETTIVI = {
  prenota_apri: "Prenota (apre il widget)",
  telefono: "Telefono",
  whatsapp: "WhatsApp",
  email: "Email",
  pdf_menu: "PDF menu",
  pdf_vini: "PDF carta vini",
  mappa: "Mappa",
};
const LINGUE = { it: "Italiano", en: "English", fr: "Français", de: "Deutsch", es: "Español", uk: "Українська" };
const DISPOSITIVI = { mobile: "Mobile", desktop: "Desktop" };

const fmt = (n) => (n != null ? Number(n).toLocaleString("it-IT") : "—");
const giornoBreve = (iso) => {
  const [, m, d] = iso.split("-");
  return `${Number(d)}/${Number(m)}`;
};

function Delta({ ora, prima }) {
  if (!prima) return <span className="text-[11px] text-neutral-400">periodo prima: —</span>;
  const pct = ((ora - prima) / prima) * 100;
  const su = pct >= 0;
  return (
    <span className={`text-[11px] font-medium ${su ? "text-brand-green" : "text-brand-red"}`}>
      {su ? "+" : ""}{pct.toFixed(0)}% <span className="text-neutral-400 font-normal">({fmt(prima)} prima)</span>
    </span>
  );
}

function Kpi({ label, valore, prima, nota }) {
  return (
    <div className="bg-white rounded-2xl shadow p-4 border border-rose-100">
      <div className="text-xs text-neutral-500">{label}</div>
      <div className="text-2xl font-bold text-neutral-800 mt-1">{fmt(valore)}</div>
      {prima !== undefined && <Delta ora={valore} prima={prima} />}
      {nota && <div className="text-[11px] text-neutral-400 mt-1">{nota}</div>}
    </div>
  );
}

function Classifica({ titolo, righe, etichetta = (v) => v || "—", vuoto = "Niente nel periodo" }) {
  const max = Math.max(1, ...righe.map((r) => r.n));
  return (
    <div className="bg-white rounded-2xl shadow p-5">
      <h2 className="text-base font-bold text-neutral-800 mb-3">{titolo}</h2>
      {righe.length === 0 ? (
        <p className="text-sm text-neutral-400">{vuoto}</p>
      ) : (
        <ul className="space-y-1.5">
          {righe.map((r) => (
            <li key={r.valore} className="text-sm">
              <div className="flex justify-between gap-2">
                <span className="truncate text-neutral-700" title={r.valore}>{etichetta(r.valore)}</span>
                <span className="font-medium text-neutral-800 tabular-nums">{fmt(r.n)}</span>
              </div>
              <div className="h-1.5 bg-neutral-100 rounded-full mt-0.5">
                <div className="h-1.5 bg-brand-blue rounded-full" style={{ width: `${(r.n / max) * 100}%` }} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function StatisticheSito() {
  const [giorni, setGiorni] = useState(30);
  const [dati, setDati] = useState(null);
  const [loading, setLoading] = useState(true);
  const [errore, setErrore] = useState(null);

  useEffect(() => {
    let vivo = true;
    (async () => {
      setLoading(true);
      setErrore(null);
      try {
        const res = await apiFetch(`${API_BASE}/statistiche/sito?giorni=${giorni}`);
        if (!res.ok) throw new Error(res.status === 403 ? "Riservato agli admin" : `Errore ${res.status}`);
        const j = await res.json();
        if (vivo) setDati(j);
      } catch (e) {
        if (vivo) setErrore(e.message);
      } finally {
        if (vivo) setLoading(false);
      }
    })();
    return () => { vivo = false; };
  }, [giorni]);

  const t = dati?.totali;
  const pren = dati?.prenotazioni;
  const serie = (dati?.giorni || []).map((g) => ({ ...g, etichetta: giornoBreve(g.giorno) }));
  const nessunDato = dati && !dati.dati_dal;

  return (
    <div className="min-h-screen bg-brand-cream p-6 font-sans">
      <StatisticheNav current="sito" />
      <div className="max-w-6xl mx-auto mt-4 space-y-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-3xl font-bold text-rose-900 tracking-wide font-playfair">Sito</h1>
            <p className="text-neutral-600 text-sm mt-1">
              Visite del sito e clic sui contatti, senza cookie e senza dati personali.
              {dati?.periodo && (
                <span className="text-neutral-400"> Dal {new Date(dati.periodo.da).toLocaleDateString("it-IT")} al {new Date(dati.periodo.a).toLocaleDateString("it-IT")}.</span>
              )}
            </p>
          </div>
          <div className="flex gap-1 bg-white rounded-xl shadow p-1">
            {PERIODI.map((p) => (
              <button
                key={p}
                onClick={() => setGiorni(p)}
                className={`min-h-[44px] px-4 rounded-lg text-sm font-medium ${giorni === p ? "bg-rose-100 text-rose-900" : "text-neutral-600 hover:bg-neutral-50"}`}
              >
                {p === 365 ? "1 anno" : `${p} giorni`}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <TrgbLoader size={48} label="Caricamento…" className="py-12" />
        ) : errore ? (
          <EmptyState icon="⚠️" title="Non riesco a leggere le visite" description={errore} />
        ) : nessunDato ? (
          <EmptyState icon="🌐" title="Ancora nessuna visita registrata"
            description="Le visite arrivano quando sul sito c'è lo snippet di TRGB e il dominio è in locale.json › sito › domini." />
        ) : (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Kpi label="Pagine viste" valore={t.viste} prima={t.viste_prima} />
              <Kpi label="Visitatori (somma giornaliera)" valore={t.unici_giorno} prima={t.unici_giorno_prima}
                nota="Chi torna in giorni diversi conta più volte" />
              <Kpi label="Clic su Prenota" valore={t.clic_prenota} prima={t.clic_prenota_prima} />
              <Kpi label="Prenotazioni dal sito" valore={pren.totale} prima={pren.totale_prima}
                nota={`${fmt(pren.coperti)} coperti`} />
            </div>

            <div className="bg-white rounded-2xl shadow p-5">
              <h2 className="text-base font-bold text-neutral-800 mb-1">Viste al giorno</h2>
              <p className="text-xs text-neutral-400 mb-3">In grigio lo stesso giorno del periodo prima.</p>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={serie} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis dataKey="etichetta" tick={{ fontSize: 11 }} interval="preserveStartEnd" minTickGap={16} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Line type="monotone" dataKey="viste_prima" name="Periodo prima" stroke="#d1d5db" strokeWidth={2} dot={false} />
                    <Line type="monotone" dataKey="viste" name="Viste" stroke="#2E7BE8" strokeWidth={2} dot={false} />
                    <Line type="monotone" dataKey="unici" name="Visitatori" stroke="#2EB872" strokeWidth={1.5} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="bg-white rounded-2xl shadow p-5">
              <h2 className="text-base font-bold text-neutral-800 mb-1">Clic su Prenota e prenotazioni dal sito</h2>
              <p className="text-xs text-neutral-400 mb-3">{pren.nota}</p>
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={serie} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis dataKey="etichetta" tick={{ fontSize: 11 }} interval="preserveStartEnd" minTickGap={16} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Bar dataKey="clic_prenota" name="Clic su Prenota" fill="#2E7BE8" />
                    <Bar dataKey="prenotazioni" name="Prenotazioni dal sito" fill="#E8402B" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="bg-white rounded-2xl shadow p-5">
              <h2 className="text-base font-bold text-neutral-800 mb-3">Clic per obiettivo</h2>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {dati.clic.map((c) => (
                  <div key={c.obiettivo} className={`rounded-xl p-3 border ${c.obiettivo === "prenota_apri" ? "border-brand-blue bg-blue-50" : "border-neutral-200"}`}>
                    <div className="text-xs text-neutral-500">{OBIETTIVI[c.obiettivo] || c.obiettivo}</div>
                    <div className="text-xl font-bold text-neutral-800">{fmt(c.n)}</div>
                    <Delta ora={c.n} prima={c.n_prima} />
                  </div>
                ))}
              </div>
            </div>

            <div className="grid md:grid-cols-2 gap-4">
              <Classifica titolo="Pagine più viste" righe={dati.pagine} />
              <Classifica titolo="Provenienze" righe={dati.provenienze}
                etichetta={(v) => (v === "diretto" ? "Diretto / app / segnalibro" : v === "interno" ? "Dal sito stesso" : v)} />
              <Classifica titolo="Lingue" righe={dati.lingue} etichetta={(v) => LINGUE[v] || v || "—"} />
              <Classifica titolo="Mobile o desktop" righe={dati.dispositivi} etichetta={(v) => DISPOSITIVI[v] || "Non detto"} />
              {dati.campagne.length > 0 && (
                <Classifica titolo="Campagne (utm: fonte / mezzo / campagna)" righe={dati.campagne} />
              )}
            </div>
            <p className="text-[11px] text-neutral-400">
              Dati dal {new Date(dati.dati_dal).toLocaleDateString("it-IT")}. Non si contano i bot, le pagine di prova e i browser esclusi con ?nonconto=1.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
