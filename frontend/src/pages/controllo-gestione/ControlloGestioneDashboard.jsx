// @version: v1.0-controllo-gestione-dashboard
// Dashboard unificata: vendite, acquisti, banca, scadenze, margine, andamento annuale
import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { API_BASE, apiFetch } from "../../config/api";
import ControlloGestioneNav from "./ControlloGestioneNav";

const CG = `${API_BASE}/controllo-gestione`;

const fmt = (n) =>
  n != null
    ? Number(n).toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : "—";

const fmtK = (n) => {
  if (n == null) return "—";
  const abs = Math.abs(n);
  if (abs >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return fmt(n);
};

const fmtDate = (d) =>
  d ? new Date(d + "T00:00:00").toLocaleDateString("it-IT", { day: "2-digit", month: "short" }) : "—";

const MESI = ["", "Gennaio", "Febbraio", "Marzo", "Aprile", "Maggio", "Giugno",
  "Luglio", "Agosto", "Settembre", "Ottobre", "Novembre", "Dicembre"];

export default function ControlloGestioneDashboard() {
  const navigate = useNavigate();
  const oggi = new Date();
  const [anno, setAnno] = useState(oggi.getFullYear());
  const [mese, setMese] = useState(oggi.getMonth() + 1);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => { load(); }, [anno, mese]);

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const r = await apiFetch(`${CG}/dashboard?anno=${anno}&mese=${mese}`);
      if (!r.ok) throw new Error("Errore caricamento dashboard");
      setData(await r.json());
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  // Selettore periodo
  const PeriodSelector = () => (
    <div className="flex items-center gap-2">
      <select value={mese} onChange={(e) => setMese(+e.target.value)}
        className="border border-sky-300 rounded-lg px-2 py-1.5 text-sm bg-white focus:ring-2 focus:ring-sky-500">
        {MESI.slice(1).map((m, i) => <option key={i + 1} value={i + 1}>{m}</option>)}
      </select>
      <select value={anno} onChange={(e) => setAnno(+e.target.value)}
        className="border border-sky-300 rounded-lg px-2 py-1.5 text-sm bg-white focus:ring-2 focus:ring-sky-500">
        {[...Array(6)].map((_, i) => {
          const y = oggi.getFullYear() - 3 + i;
          return <option key={y} value={y}>{y}</option>;
        })}
      </select>
    </div>
  );

  // KPI Card
  const KPI = ({ label, value, sub, icon, color = "indigo", onClick, alert: isAlert }) => (
    <div
      onClick={onClick}
      className={`rounded-2xl border p-4 ${onClick ? "cursor-pointer hover:shadow-lg hover:-translate-y-0.5" : ""} transition
        ${isAlert ? "border-red-300 bg-red-50" : `border-${color}-200 bg-${color}-50`}`}
    >
      <div className="flex items-center justify-between mb-1">
        <span className="text-2xl">{icon}</span>
        {sub && (
          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
            typeof sub === "number"
              ? sub > 0 ? "bg-emerald-100 text-emerald-700" : sub < 0 ? "bg-red-100 text-red-700" : "bg-neutral-100 text-neutral-600"
              : "bg-neutral-100 text-neutral-600"
          }`}>
            {typeof sub === "number" ? `${sub > 0 ? "+" : ""}${sub}%` : sub}
          </span>
        )}
      </div>
      <div className={`text-xl font-bold ${isAlert ? "text-red-800" : `text-${color}-900`}`}>
        {value}
      </div>
      <div className={`text-xs mt-0.5 ${isAlert ? "text-red-600" : `text-${color}-600`}`}>{label}</div>
    </div>
  );

  if (loading && !data) {
    return (
      <div className="min-h-screen bg-neutral-100 p-6">
        <ControlloGestioneNav current="dashboard" />
        <div className="max-w-7xl mx-auto mt-4 text-center py-20 text-neutral-400">Caricamento...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-neutral-100 p-6">
        <ControlloGestioneNav current="dashboard" />
        <div className="max-w-7xl mx-auto mt-4 text-center py-20 text-red-500">{error}</div>
      </div>
    );
  }

  const d = data;
  const v = d?.vendite || {};
  const a = d?.acquisti || {};
  const b = d?.banca || {};
  const s = d?.scadenze || {};
  const m = d?.margine || {};
  const andamento = d?.andamento || [];

  // Calcola max per barre andamento
  const maxAnd = Math.max(
    ...andamento.map((r) => Math.max(r.vendite || 0, r.acquisti || 0, r.banca_uscite || 0)),
    1
  );

  return (
    <div className="min-h-screen bg-neutral-100 p-6 font-sans">
      <ControlloGestioneNav current="dashboard" />

      <div className="max-w-7xl mx-auto bg-white shadow-2xl rounded-3xl p-6 sm:p-8 border border-neutral-200 mt-4">
        {/* Header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-6 gap-3">
          <div>
            <h1 className="text-2xl font-bold text-sky-900 font-playfair tracking-wide">
              Controllo di Gestione
            </h1>
            <p className="text-sm text-neutral-500 mt-0.5">
              Panorama finanziario — {d?.periodo}
            </p>
          </div>
          <PeriodSelector />
        </div>

        {loading && <div className="text-xs text-sky-400 mb-3 animate-pulse">Aggiornamento...</div>}

        {/* ─── RIGA KPI PRINCIPALE ─── */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
          <KPI icon="💵" label="Vendite mese"
            value={`€ ${fmt(v.totale_corrispettivi)}`}
            sub={v.variazione_mese_prec}
            color="emerald"
            onClick={() => navigate("/vendite/dashboard")} />

          <KPI icon="📦" label="Acquisti mese"
            value={`€ ${fmt(a.totale_acquisti)}`}
            sub={a.variazione_mese_prec}
            color="teal"
            onClick={() => navigate("/acquisti/dashboard")} />

          <KPI icon="📊" label="Margine lordo"
            value={`€ ${fmt(m.margine_lordo)}`}
            sub={m.margine_pct != null ? `${m.margine_pct}%` : null}
            color={m.margine_lordo >= 0 ? "emerald" : "red"} />

          <KPI icon="🏦" label="Saldo banca"
            value={`€ ${fmt(b.saldo_conto)}`}
            sub={`${b.num_movimenti} mov.`}
            color="blue"
            onClick={() => navigate("/banca/dashboard")} />

          <KPI icon="📅" label="Scadenze 30gg"
            value={`€ ${fmt(s.prossime_30gg?.importo)}`}
            sub={`${s.prossime_30gg?.num || 0} rate`}
            color="violet"
            onClick={() => navigate("/finanza/scadenzario")} />

          <KPI icon="🚨" label="Rate scadute"
            value={s.rate_scadute?.num > 0 ? `€ ${fmt(s.rate_scadute?.importo)}` : "Nessuna"}
            sub={s.rate_scadute?.num > 0 ? `${s.rate_scadute.num} rate` : null}
            alert={s.rate_scadute?.num > 0}
            color="red" />
        </div>

        {/* ─── RIGA 2: ANDAMENTO ANNUALE + PROSSIME SCADENZE ─── */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">

          {/* Andamento annuale — occupa 2/3 */}
          <div className="lg:col-span-2 rounded-2xl border border-sky-100 bg-sky-50/30 p-5">
            <h2 className="text-sm font-bold text-sky-800 mb-3">
              Andamento {anno} — Vendite vs Acquisti
            </h2>
            <div className="space-y-1.5">
              {andamento.map((r) => {
                const isCurrentMonth = r.mese === mese;
                return (
                  <div key={r.mese} className={`flex items-center gap-2 text-xs ${isCurrentMonth ? "font-bold" : ""}`}>
                    <span className="w-8 text-right text-neutral-500 shrink-0">{r.mese_label}</span>
                    <div className="flex-1 flex flex-col gap-0.5">
                      {/* Barra vendite */}
                      <div className="flex items-center gap-1">
                        <div className="h-3 rounded-sm bg-emerald-400"
                          style={{ width: `${Math.max((r.vendite / maxAnd) * 100, 0)}%`, minWidth: r.vendite > 0 ? "2px" : "0" }} />
                        {r.vendite > 0 && <span className="text-emerald-700 shrink-0">{fmtK(r.vendite)}</span>}
                      </div>
                      {/* Barra acquisti */}
                      <div className="flex items-center gap-1">
                        <div className="h-3 rounded-sm bg-teal-400"
                          style={{ width: `${Math.max((r.acquisti / maxAnd) * 100, 0)}%`, minWidth: r.acquisti > 0 ? "2px" : "0" }} />
                        {r.acquisti > 0 && <span className="text-teal-700 shrink-0">{fmtK(r.acquisti)}</span>}
                      </div>
                    </div>
                    {/* Margine */}
                    <span className={`w-14 text-right shrink-0 ${r.margine >= 0 ? "text-emerald-700" : "text-red-600"}`}>
                      {r.vendite > 0 || r.acquisti > 0 ? fmtK(r.margine) : ""}
                    </span>
                  </div>
                );
              })}
            </div>
            <div className="flex items-center gap-4 mt-3 text-xs text-neutral-500">
              <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-emerald-400 inline-block" /> Vendite</span>
              <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-teal-400 inline-block" /> Acquisti</span>
              <span className="flex items-center gap-1">Margine</span>
            </div>
          </div>

          {/* Prossime scadenze — occupa 1/3 */}
          <div className="rounded-2xl border border-violet-100 bg-violet-50/30 p-5">
            <h2 className="text-sm font-bold text-violet-800 mb-3">
              Prossime scadenze
            </h2>
            {s.prossime_rate?.length > 0 ? (
              <div className="space-y-2">
                {s.prossime_rate.map((r) => (
                  <div key={r.id} className={`flex items-center justify-between text-xs p-2 rounded-lg ${
                    r.stato === "SCADUTA" ? "bg-red-100 border border-red-200" : "bg-white border border-violet-100"
                  }`}>
                    <div>
                      <div className="font-semibold text-neutral-800 truncate" style={{ maxWidth: 180 }}>
                        {r.titolo}
                      </div>
                      <div className="text-neutral-500">
                        {fmtDate(r.data_scadenza)}
                        {r.stato === "SCADUTA" && <span className="ml-1 text-red-600 font-bold">SCADUTA</span>}
                      </div>
                    </div>
                    <div className="font-bold text-violet-800 whitespace-nowrap">
                      € {fmt(r.importo)}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-neutral-400 py-4 text-center">Nessuna scadenza imminente</p>
            )}
            {s.totale_residuo > 0 && (
              <div className="mt-3 pt-3 border-t border-violet-200 flex justify-between text-xs">
                <span className="text-violet-600">Debito residuo totale</span>
                <span className="font-bold text-violet-800">€ {fmt(s.totale_residuo)}</span>
              </div>
            )}
          </div>
        </div>

        {/* ─── RIGA 3: TOP FORNITORI + CATEGORIE ACQUISTI ─── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">

          {/* Top fornitori mese */}
          <div className="rounded-2xl border border-teal-100 bg-teal-50/30 p-5">
            <h2 className="text-sm font-bold text-teal-800 mb-3">
              Top fornitori — {d?.periodo}
            </h2>
            {d?.top_fornitori?.length > 0 ? (
              <div className="space-y-1.5">
                {d.top_fornitori.map((f, i) => {
                  const maxF = d.top_fornitori[0]?.totale || 1;
                  return (
                    <div key={i} className="flex items-center gap-2 text-xs">
                      <span className="w-5 text-right text-neutral-400 shrink-0">{i + 1}.</span>
                      <div className="flex-1 min-w-0">
                        <div className="truncate font-medium text-neutral-800">{f.fornitore_nome}</div>
                        <div className="h-2 rounded-full bg-teal-200 mt-0.5">
                          <div className="h-2 rounded-full bg-teal-500" style={{ width: `${(f.totale / maxF) * 100}%` }} />
                        </div>
                      </div>
                      <span className="text-teal-700 font-semibold whitespace-nowrap shrink-0">
                        € {fmt(f.totale)}
                      </span>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-xs text-neutral-400 py-4 text-center">Nessuna fattura nel periodo</p>
            )}
          </div>

          {/* Categorie acquisti mese */}
          <div className="rounded-2xl border border-amber-100 bg-amber-50/30 p-5">
            <h2 className="text-sm font-bold text-amber-800 mb-3">
              Acquisti per categoria — {d?.periodo}
            </h2>
            {d?.categorie_acquisti?.length > 0 ? (
              <div className="space-y-1.5">
                {d.categorie_acquisti.map((c, i) => {
                  const maxC = d.categorie_acquisti[0]?.totale || 1;
                  return (
                    <div key={i} className="flex items-center gap-2 text-xs">
                      <div className="flex-1 min-w-0">
                        <div className="truncate font-medium text-neutral-800">{c.categoria}</div>
                        <div className="h-2 rounded-full bg-amber-200 mt-0.5">
                          <div className="h-2 rounded-full bg-amber-500" style={{ width: `${(c.totale / maxC) * 100}%` }} />
                        </div>
                      </div>
                      <span className="text-amber-700 font-semibold whitespace-nowrap shrink-0">
                        € {fmt(c.totale)}
                      </span>
                      <span className="text-neutral-400 shrink-0">{c.num_fatture}f</span>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-xs text-neutral-400 py-4 text-center">Nessuna fattura categorizzata</p>
            )}
          </div>
        </div>

        {/* ─── RIGA 4: DETTAGLIO VENDITE MESE ─── */}
        <div className="rounded-2xl border border-emerald-100 bg-emerald-50/30 p-5">
          <h2 className="text-sm font-bold text-emerald-800 mb-3">
            Dettaglio vendite — {d?.periodo}
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
            <div className="bg-white rounded-xl border border-emerald-100 p-3">
              <div className="text-neutral-500">Corrispettivi</div>
              <div className="text-lg font-bold text-emerald-800">€ {fmt(v.totale_corrispettivi)}</div>
            </div>
            <div className="bg-white rounded-xl border border-emerald-100 p-3">
              <div className="text-neutral-500">Media giornaliera</div>
              <div className="text-lg font-bold text-emerald-800">€ {fmt(v.media_giornaliera)}</div>
            </div>
            <div className="bg-white rounded-xl border border-emerald-100 p-3">
              <div className="text-neutral-500">Giorni apertura</div>
              <div className="text-lg font-bold text-emerald-800">{v.giorni_apertura || 0}</div>
            </div>
            <div className="bg-white rounded-xl border border-emerald-100 p-3">
              <div className="text-neutral-500">POS totale</div>
              <div className="text-lg font-bold text-emerald-800">€ {fmt(v.totale_pos)}</div>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
