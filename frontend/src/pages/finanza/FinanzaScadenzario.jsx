// @version: v1.0-finanza-scadenzario
// Gestione rateizzazioni, mutui, prestiti, affitti e spese fisse
import React, { useEffect, useState } from "react";
import { API_BASE, apiFetch } from "../../config/api";
import FinanzaNav from "./FinanzaNav";

const FC = `${API_BASE}/finanza/scadenzario`;

const TIPI = [
  { value: "RATEIZZAZIONE_FATTURA", label: "Rateizzazione fattura", icon: "📄", color: "violet" },
  { value: "RATEIZZAZIONE_ENTE", label: "Rateizzazione ente", icon: "🏛️", color: "blue" },
  { value: "MUTUO", label: "Mutuo", icon: "🏦", color: "indigo" },
  { value: "PRESTITO", label: "Prestito", icon: "💳", color: "purple" },
  { value: "AFFITTO", label: "Affitto", icon: "🏠", color: "amber" },
  { value: "SPESA_FISSA", label: "Spesa fissa", icon: "📌", color: "rose" },
];

const FREQUENZE = [
  { value: "MENSILE", label: "Mensile" },
  { value: "BIMESTRALE", label: "Bimestrale" },
  { value: "TRIMESTRALE", label: "Trimestrale" },
  { value: "SEMESTRALE", label: "Semestrale" },
  { value: "ANNUALE", label: "Annuale" },
  { value: "UNA_TANTUM", label: "Una tantum" },
];

const fmt = (n) => n != null ? Number(n).toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "—";
const fmtDate = (d) => d ? new Date(d + "T00:00:00").toLocaleDateString("it-IT", { day: "2-digit", month: "short", year: "numeric" }) : "—";

const EMPTY_FORM = {
  tipo: "RATEIZZAZIONE_FATTURA", titolo: "", descrizione: "", ente: "",
  importo_totale: 0, importo_rata: 0, num_rate: 0,
  data_inizio: "", data_fine: "", giorno_scadenza: 0, frequenza: "MENSILE",
  fattura_id: null, fattura_numero: "", fattura_fornitore: "",
  cat1: "", cat2: "", cat1_fin: "", cat2_fin: "",
  tipo_analitico: "", tipo_finanziario: "", descrizione_finanziaria: "", cat_debito: "",
  match_pattern: "", note: "", genera_rate: true,
};

export default function FinanzaScadenzario() {
  const [scadenze, setScadenze] = useState([]);
  const [overview, setOverview] = useState(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("overview"); // overview | lista | nuova | dettaglio
  const [filtroTipo, setFiltroTipo] = useState("");
  const [filtroStato, setFiltroStato] = useState("ATTIVO");
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [editId, setEditId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");
  const [dettaglio, setDettaglio] = useState(null);
  const [suggerimenti, setSuggerimenti] = useState([]);
  const [loadingSugg, setLoadingSugg] = useState(false);
  const [creatingId, setCreatingId] = useState(null);

  useEffect(() => { loadAll(); }, []);
  useEffect(() => { if (tab === "lista") loadScadenze(); }, [filtroTipo, filtroStato]);

  const loadAll = async () => {
    setLoading(true);
    try {
      const [ovR, scR] = await Promise.all([
        apiFetch(`${FC}/dashboard/overview`),
        apiFetch(`${FC}/?stato=ATTIVO`),
      ]);
      if (ovR.ok) setOverview(await ovR.json());
      if (scR.ok) setScadenze(await scR.json());
    } catch (_) {}
    setLoading(false);
  };

  const loadScadenze = async () => {
    const p = new URLSearchParams();
    if (filtroTipo) p.set("tipo", filtroTipo);
    if (filtroStato) p.set("stato", filtroStato);
    const resp = await apiFetch(`${FC}/?${p}`);
    if (resp.ok) setScadenze(await resp.json());
  };

  const loadDettaglio = async (id) => {
    const resp = await apiFetch(`${FC}/${id}`);
    if (resp.ok) {
      setDettaglio(await resp.json());
      setTab("dettaglio");
    }
  };

  const handleSave = async () => {
    if (!form.titolo.trim()) { setMsg("Titolo obbligatorio"); return; }
    setSaving(true); setMsg("");
    try {
      const url = editId ? `${FC}/${editId}` : FC;
      const method = editId ? "PUT" : "POST";
      const resp = await apiFetch(url, {
        method, headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!resp.ok) throw new Error("Errore salvataggio");
      const data = await resp.json();
      setMsg(editId ? "Aggiornato" : `Creato con ${data.rate_generate || 0} rate generate`);
      setEditId(null); setForm({ ...EMPTY_FORM });
      loadAll();
      setTimeout(() => { setTab("lista"); setMsg(""); }, 1500);
    } catch (err) { setMsg(err.message); }
    finally { setSaving(false); }
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Eliminare questa scadenza e tutte le sue rate?")) return;
    await apiFetch(`${FC}/${id}`, { method: "DELETE" });
    loadAll(); loadScadenze();
  };

  const handlePagaRata = async (rataId) => {
    await apiFetch(`${FC}/rate/${rataId}/paga`, { method: "POST" });
    if (dettaglio) loadDettaglio(dettaglio.scadenza.id);
    loadAll();
  };

  const loadSuggerimenti = async () => {
    setLoadingSugg(true);
    try {
      const resp = await apiFetch(`${FC}/estrai-suggerimenti`);
      if (resp.ok) {
        const data = await resp.json();
        setSuggerimenti(data.suggerimenti || []);
      }
    } catch (_) {}
    setLoadingSugg(false);
  };

  const handleCreaFromSugg = async (sugg) => {
    setCreatingId(sugg.match_pattern);
    try {
      const body = {
        tipo: sugg.tipo_suggerito,
        titolo: sugg.titolo,
        ente: sugg.ente || "",
        importo_rata: sugg.importo_rata,
        importo_totale: 0,
        num_rate: 0,
        data_inizio: sugg.prima_data || "",
        data_fine: "",
        giorno_scadenza: sugg.giorno_scadenza || 0,
        frequenza: sugg.frequenza || "MENSILE",
        cat1: sugg.cat1 || "", cat2: sugg.cat2 || "",
        cat1_fin: sugg.cat1_fin || "", cat2_fin: sugg.cat2_fin || "",
        tipo_analitico: sugg.tipo_analitico || "",
        tipo_finanziario: sugg.tipo_finanziario || "",
        descrizione_finanziaria: sugg.descrizione_finanziaria || "",
        cat_debito: sugg.cat_debito || "",
        match_pattern: sugg.match_pattern || "",
        note: `Estratto automaticamente da ${sugg.num_pagamenti_trovati} pagamenti storici`,
        genera_rate: false,
      };
      const resp = await apiFetch(`${FC}/estrai-crea`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (resp.ok) {
        const data = await resp.json();
        setMsg(`"${sugg.titolo}" creato con ${data.rate_create} rate storiche`);
        loadSuggerimenti();
        loadAll();
      }
    } catch (_) { setMsg("Errore creazione"); }
    setCreatingId(null);
  };

  const startEdit = (s) => {
    setEditId(s.id);
    setForm({
      tipo: s.tipo, titolo: s.titolo, descrizione: s.descrizione || "", ente: s.ente || "",
      importo_totale: s.importo_totale || 0, importo_rata: s.importo_rata || 0, num_rate: s.num_rate || 0,
      data_inizio: s.data_inizio || "", data_fine: s.data_fine || "",
      giorno_scadenza: s.giorno_scadenza || 0, frequenza: s.frequenza || "MENSILE",
      fattura_id: s.fattura_id, fattura_numero: s.fattura_numero || "", fattura_fornitore: s.fattura_fornitore || "",
      cat1: s.cat1 || "", cat2: s.cat2 || "", cat1_fin: s.cat1_fin || "", cat2_fin: s.cat2_fin || "",
      tipo_analitico: s.tipo_analitico || "", tipo_finanziario: s.tipo_finanziario || "",
      descrizione_finanziaria: s.descrizione_finanziaria || "", cat_debito: s.cat_debito || "",
      match_pattern: s.match_pattern || "", note: s.note || "", genera_rate: false,
    });
    setTab("nuova");
  };

  const getTipoInfo = (tipo) => TIPI.find((t) => t.value === tipo) || TIPI[0];
  const inputCls = "border border-neutral-300 rounded-lg px-2 py-1.5 text-sm w-full focus:ring-2 focus:ring-violet-300 outline-none";
  const labelCls = "text-[10px] font-semibold text-neutral-500 uppercase tracking-wider mb-0.5";

  return (
    <div className="min-h-screen bg-neutral-100 p-6 font-sans">
      <FinanzaNav current="scadenzario" />
      <div className="max-w-7xl mx-auto bg-white shadow-2xl rounded-3xl p-6 sm:p-10 border border-neutral-200 mt-4">
        <div className="flex items-center justify-between mb-1">
          <h1 className="text-3xl font-bold text-violet-900 tracking-wide font-playfair">Scadenzario</h1>
          <button onClick={() => { setEditId(null); setForm({ ...EMPTY_FORM }); setTab("nuova"); }}
            className="px-4 py-2 rounded-xl text-sm font-semibold bg-violet-600 text-white hover:bg-violet-700 shadow transition">
            + Nuova scadenza
          </button>
        </div>
        <p className="text-neutral-600 text-sm mb-4">Rateizzazioni, mutui, prestiti, affitti e spese fisse</p>

        {/* Tabs */}
        <div className="flex gap-1 mb-5 border-b border-neutral-200">
          {[
            { id: "overview", label: "Panoramica" },
            { id: "lista", label: `Scadenze (${scadenze.length})` },
            { id: "estrai", label: "Estrai da movimenti" },
            { id: "nuova", label: editId ? "Modifica" : "Nuova" },
            ...(dettaglio ? [{ id: "dettaglio", label: `Dettaglio: ${dettaglio.scadenza.titolo}` }] : []),
          ].map((t) => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition -mb-px ${
                tab === t.id ? "border-violet-600 text-violet-800" : "border-transparent text-neutral-500 hover:text-violet-600"
              }`}>{t.label}</button>
          ))}
        </div>

        {loading ? <div className="text-center py-12 text-neutral-500">Caricamento...</div> : (
          <>
            {/* OVERVIEW */}
            {tab === "overview" && overview && (
              <div>
                {/* KPI */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
                  <div className="rounded-xl border border-violet-200 bg-violet-50 p-4 text-center">
                    <div className="text-2xl font-bold text-violet-800">{overview.totale_impegni}</div>
                    <div className="text-[10px] text-violet-600">Impegni attivi</div>
                  </div>
                  <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-center">
                    <div className="text-2xl font-bold text-red-700">{overview.rate_scadute.num}</div>
                    <div className="text-[10px] text-red-500">Rate scadute ({fmt(overview.rate_scadute.importo)})</div>
                  </div>
                  <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-center">
                    <div className="text-2xl font-bold text-amber-700">{overview.rate_prossime_30gg.num}</div>
                    <div className="text-[10px] text-amber-500">Prossimi 30gg ({fmt(overview.rate_prossime_30gg.importo)})</div>
                  </div>
                  <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-4 text-center">
                    <div className="text-2xl font-bold text-neutral-800">{fmt(overview.totale_residuo)}</div>
                    <div className="text-[10px] text-neutral-500">Residuo totale</div>
                  </div>
                </div>

                {/* Per tipo */}
                {overview.per_tipo.length > 0 && (
                  <div className="mb-6">
                    <h3 className="text-sm font-semibold text-neutral-700 mb-2">Per tipologia</h3>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                      {overview.per_tipo.map((pt) => {
                        const info = getTipoInfo(pt.tipo);
                        return (
                          <div key={pt.tipo} className="rounded-xl border border-neutral-200 p-3 flex items-center gap-3">
                            <span className="text-2xl">{info.icon}</span>
                            <div>
                              <div className="text-xs font-semibold text-neutral-800">{info.label}</div>
                              <div className="text-[10px] text-neutral-500">
                                {pt.num_scadenze} attive — residuo {fmt(pt.residuo)}
                                {pt.scadute > 0 && <span className="text-red-500 ml-1">({pt.scadute} scadute)</span>}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Prossime scadenze */}
                <h3 className="text-sm font-semibold text-neutral-700 mb-2">Prossime scadenze</h3>
                {overview.prossime_scadenze.length === 0 ? (
                  <div className="text-center py-6 text-emerald-600 font-medium">Nessuna scadenza in arrivo!</div>
                ) : (
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-left text-neutral-500 text-xs">
                        <th className="pb-2 w-24">Scadenza</th>
                        <th className="pb-2">Titolo</th>
                        <th className="pb-2">Ente</th>
                        <th className="pb-2 w-12 text-center">Rata</th>
                        <th className="pb-2 w-28 text-right">Importo</th>
                        <th className="pb-2 w-20">Stato</th>
                        <th className="pb-2 w-20"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {overview.prossime_scadenze.map((r) => {
                        const isScaduta = r.stato === "SCADUTA";
                        return (
                          <tr key={r.id} className={`border-b border-neutral-100 ${isScaduta ? "bg-red-50" : "hover:bg-violet-50"} transition`}>
                            <td className={`py-2 text-xs font-mono ${isScaduta ? "text-red-600 font-bold" : "text-neutral-500"}`}>
                              {fmtDate(r.data_scadenza)}
                            </td>
                            <td className="py-2 text-xs font-medium cursor-pointer hover:text-violet-700"
                              onClick={() => loadDettaglio(r.scadenza_id)}>{r.titolo}</td>
                            <td className="py-2 text-xs text-neutral-400">{r.ente}</td>
                            <td className="py-2 text-xs text-center text-neutral-500">#{r.numero_rata}</td>
                            <td className="py-2 text-xs text-right font-mono font-semibold text-red-600">{fmt(r.importo)}</td>
                            <td className="py-2">
                              <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold ${
                                isScaduta ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700"
                              }`}>{r.stato === "SCADUTA" ? "SCADUTA" : "Da pagare"}</span>
                            </td>
                            <td className="py-2 text-right">
                              <button onClick={() => handlePagaRata(r.id)}
                                className="text-[10px] px-2 py-1 rounded-lg bg-emerald-100 text-emerald-700 hover:bg-emerald-200 font-medium">
                                Paga
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>
            )}

            {/* LISTA */}
            {tab === "lista" && (
              <div>
                <div className="flex gap-2 mb-4">
                  <select value={filtroTipo} onChange={(e) => setFiltroTipo(e.target.value)} className="border rounded-lg px-2 py-1.5 text-sm">
                    <option value="">Tutti i tipi</option>
                    {TIPI.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                  <select value={filtroStato} onChange={(e) => setFiltroStato(e.target.value)} className="border rounded-lg px-2 py-1.5 text-sm">
                    <option value="ATTIVO">Attive</option>
                    <option value="COMPLETATO">Completate</option>
                    <option value="SOSPESO">Sospese</option>
                    <option value="">Tutte</option>
                  </select>
                </div>

                {scadenze.length === 0 ? (
                  <div className="text-center py-8 text-neutral-400">Nessuna scadenza trovata.</div>
                ) : (
                  <div className="space-y-3">
                    {scadenze.map((s) => {
                      const info = getTipoInfo(s.tipo);
                      const progress = s.totale_rate > 0 ? Math.round((s.rate_pagate / s.totale_rate) * 100) : 0;
                      return (
                        <div key={s.id} className="rounded-xl border border-neutral-200 p-4 hover:shadow-md transition cursor-pointer"
                          onClick={() => loadDettaglio(s.id)}>
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                              <span className="text-2xl">{info.icon}</span>
                              <div>
                                <div className="text-sm font-semibold text-neutral-800">{s.titolo}</div>
                                <div className="text-[10px] text-neutral-400">
                                  {info.label} — {s.ente || "—"} — {s.frequenza}
                                </div>
                              </div>
                            </div>
                            <div className="text-right">
                              <div className="text-sm font-mono font-bold text-neutral-800">{fmt(s.importo_totale)}</div>
                              <div className="text-[10px] text-neutral-400">
                                {s.rate_pagate}/{s.totale_rate} rate — pagato {fmt(s.totale_pagato)}
                              </div>
                            </div>
                          </div>
                          {/* Progress bar */}
                          <div className="mt-2 h-1.5 bg-neutral-100 rounded-full overflow-hidden">
                            <div className="h-full bg-violet-500 rounded-full transition-all" style={{ width: `${progress}%` }} />
                          </div>
                          <div className="flex justify-between mt-1">
                            <span className="text-[9px] text-neutral-400">{progress}% completato</span>
                            {s.prossima_scadenza && (
                              <span className={`text-[9px] ${s.prossima_scadenza < new Date().toISOString().slice(0, 10) ? "text-red-500 font-bold" : "text-neutral-400"}`}>
                                Prossima: {fmtDate(s.prossima_scadenza)}
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* ESTRAI DA MOVIMENTI */}
            {tab === "estrai" && (
              <div>
                <div className="flex items-center justify-between mb-4">
                  <p className="text-xs text-neutral-400">
                    Analizza i movimenti importati per trovare pagamenti ricorrenti (prestiti, rateizzazioni, affitti, spese fisse).
                  </p>
                  <button onClick={loadSuggerimenti} disabled={loadingSugg}
                    className="px-4 py-2 rounded-xl text-sm font-semibold bg-violet-600 text-white hover:bg-violet-700 shadow transition disabled:opacity-50">
                    {loadingSugg ? "Analisi..." : "Analizza movimenti"}
                  </button>
                </div>

                {msg && (
                  <div className="mb-4 rounded-xl border border-emerald-300 bg-emerald-50 text-emerald-800 px-4 py-3 text-sm">{msg}</div>
                )}

                {suggerimenti.length === 0 && !loadingSugg ? (
                  <div className="text-center py-8 text-neutral-400">
                    Clicca "Analizza movimenti" per trovare pattern ricorrenti nei tuoi dati.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {suggerimenti.map((s, i) => {
                      const info = getTipoInfo(s.tipo_suggerito);
                      const isCreating = creatingId === s.match_pattern;
                      return (
                        <div key={i} className="rounded-xl border border-neutral-200 p-4 hover:shadow-md transition">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                              <span className="text-2xl">{info.icon}</span>
                              <div>
                                <div className="text-sm font-semibold text-neutral-800">{s.titolo}</div>
                                <div className="text-[10px] text-neutral-400">
                                  {info.label} — {s.num_pagamenti_trovati} pagamenti trovati
                                  {s.ente && ` — ${s.ente}`}
                                </div>
                              </div>
                            </div>
                            <button onClick={() => handleCreaFromSugg(s)} disabled={isCreating}
                              className="px-4 py-2 rounded-xl text-xs font-semibold bg-emerald-600 text-white hover:bg-emerald-700 shadow transition disabled:opacity-50">
                              {isCreating ? "Creazione..." : "Crea scadenza"}
                            </button>
                          </div>
                          <div className="mt-3 grid grid-cols-5 gap-3 text-xs">
                            <div>
                              <span className="text-neutral-400">Importo medio</span>
                              <div className="font-mono font-semibold text-red-600">{fmt(s.importo_rata)}</div>
                            </div>
                            <div>
                              <span className="text-neutral-400">Range</span>
                              <div className="font-mono text-neutral-600">{fmt(s.importo_min)} — {fmt(s.importo_max)}</div>
                            </div>
                            <div>
                              <span className="text-neutral-400">Periodo</span>
                              <div className="text-neutral-600">{fmtDate(s.prima_data)} → {fmtDate(s.ultima_data)}</div>
                            </div>
                            <div>
                              <span className="text-neutral-400">Giorno</span>
                              <div className="text-neutral-600">{s.giorno_scadenza || "variabile"}</div>
                            </div>
                            <div>
                              <span className="text-neutral-400">Categorie</span>
                              <div className="text-neutral-600 truncate">{s.cat1 || s.cat1_fin || "—"} / {s.cat2 || s.cat2_fin || "—"}</div>
                            </div>
                          </div>
                          {(s.descrizione_finanziaria || s.cat_debito) && (
                            <div className="mt-1 text-[10px] text-violet-500">
                              {s.descrizione_finanziaria && `Fin: ${s.descrizione_finanziaria}`}
                              {s.cat_debito && ` — Debito: ${s.cat_debito}`}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* NUOVA / MODIFICA */}
            {tab === "nuova" && (
              <div className="max-w-2xl">
                <h2 className="text-lg font-semibold text-neutral-800 mb-4">
                  {editId ? "Modifica scadenza" : "Nuova scadenza"}
                </h2>

                {msg && (
                  <div className={`mb-4 rounded-xl border px-4 py-3 text-sm ${
                    msg.includes("Errore") ? "border-red-300 bg-red-50 text-red-800" : "border-emerald-300 bg-emerald-50 text-emerald-800"
                  }`}>{msg}</div>
                )}

                {/* Tipo */}
                <div className="mb-4">
                  <div className={labelCls}>Tipo</div>
                  <div className="grid grid-cols-3 gap-2">
                    {TIPI.map((t) => (
                      <button key={t.value} onClick={() => setForm({ ...form, tipo: t.value })}
                        className={`rounded-xl border p-3 text-left transition ${
                          form.tipo === t.value ? "border-violet-400 bg-violet-50 shadow" : "border-neutral-200 hover:bg-neutral-50"
                        }`}>
                        <div className="text-xl">{t.icon}</div>
                        <div className="text-xs font-medium mt-1">{t.label}</div>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Info base */}
                <div className="grid grid-cols-2 gap-3 mb-4">
                  <div className="col-span-2">
                    <div className={labelCls}>Titolo</div>
                    <input className={inputCls} value={form.titolo}
                      onChange={(e) => setForm({ ...form, titolo: e.target.value })}
                      placeholder="es. Rateizzazione F24 2025, Mutuo BPM, Affitto sede..." />
                  </div>
                  <div>
                    <div className={labelCls}>Ente / Fornitore / Banca</div>
                    <input className={inputCls} value={form.ente}
                      onChange={(e) => setForm({ ...form, ente: e.target.value })}
                      placeholder="Agenzia Entrate, BPM, proprietario..." />
                  </div>
                  <div>
                    <div className={labelCls}>Pattern match (per auto-riconciliazione)</div>
                    <input className={inputCls} value={form.match_pattern}
                      onChange={(e) => setForm({ ...form, match_pattern: e.target.value })}
                      placeholder="Testo che appare nel mov. banca" />
                  </div>
                </div>

                {/* Fattura collegata (solo per RATEIZZAZIONE_FATTURA) */}
                {form.tipo === "RATEIZZAZIONE_FATTURA" && (
                  <div className="rounded-xl border border-blue-200 bg-blue-50/30 p-4 mb-4">
                    <div className="text-xs font-bold text-blue-800 mb-2">Fattura collegata</div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <div className={labelCls}>N. Fattura</div>
                        <input className={inputCls} value={form.fattura_numero}
                          onChange={(e) => setForm({ ...form, fattura_numero: e.target.value })} />
                      </div>
                      <div>
                        <div className={labelCls}>Fornitore</div>
                        <input className={inputCls} value={form.fattura_fornitore}
                          onChange={(e) => setForm({ ...form, fattura_fornitore: e.target.value })} />
                      </div>
                    </div>
                  </div>
                )}

                {/* Importi e rate */}
                <div className="grid grid-cols-3 gap-3 mb-4">
                  <div>
                    <div className={labelCls}>Importo totale</div>
                    <input type="number" step="0.01" className={inputCls} value={form.importo_totale}
                      onChange={(e) => setForm({ ...form, importo_totale: parseFloat(e.target.value) || 0 })} />
                  </div>
                  <div>
                    <div className={labelCls}>Importo rata</div>
                    <input type="number" step="0.01" className={inputCls} value={form.importo_rata}
                      onChange={(e) => setForm({ ...form, importo_rata: parseFloat(e.target.value) || 0 })} />
                  </div>
                  <div>
                    <div className={labelCls}>Numero rate</div>
                    <input type="number" className={inputCls} value={form.num_rate}
                      onChange={(e) => setForm({ ...form, num_rate: parseInt(e.target.value) || 0 })} />
                  </div>
                </div>

                {/* Date e frequenza */}
                <div className="grid grid-cols-4 gap-3 mb-4">
                  <div>
                    <div className={labelCls}>Data inizio</div>
                    <input type="date" className={inputCls} value={form.data_inizio}
                      onChange={(e) => setForm({ ...form, data_inizio: e.target.value })} />
                  </div>
                  <div>
                    <div className={labelCls}>Data fine</div>
                    <input type="date" className={inputCls} value={form.data_fine}
                      onChange={(e) => setForm({ ...form, data_fine: e.target.value })} />
                  </div>
                  <div>
                    <div className={labelCls}>Frequenza</div>
                    <select className={inputCls} value={form.frequenza}
                      onChange={(e) => setForm({ ...form, frequenza: e.target.value })}>
                      {FREQUENZE.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <div className={labelCls}>Giorno scadenza</div>
                    <input type="number" min="0" max="31" className={inputCls} value={form.giorno_scadenza}
                      onChange={(e) => setForm({ ...form, giorno_scadenza: parseInt(e.target.value) || 0 })}
                      placeholder="0 = auto" />
                  </div>
                </div>

                {/* Genera rate automaticamente */}
                {!editId && (
                  <label className="flex items-center gap-2 mb-4 cursor-pointer">
                    <input type="checkbox" checked={form.genera_rate}
                      onChange={(e) => setForm({ ...form, genera_rate: e.target.checked })}
                      className="rounded border-neutral-300" />
                    <span className="text-sm text-neutral-700">Genera rate automaticamente</span>
                  </label>
                )}

                {/* Note */}
                <div className="mb-4">
                  <div className={labelCls}>Note</div>
                  <textarea className={inputCls} rows={2} value={form.note}
                    onChange={(e) => setForm({ ...form, note: e.target.value })} />
                </div>

                <div className="flex gap-3">
                  <button onClick={handleSave} disabled={saving}
                    className="px-6 py-2.5 rounded-xl text-sm font-semibold bg-violet-600 text-white hover:bg-violet-700 shadow transition disabled:opacity-50">
                    {saving ? "Salvataggio..." : editId ? "Aggiorna" : "Crea scadenza"}
                  </button>
                  <button onClick={() => { setEditId(null); setForm({ ...EMPTY_FORM }); setTab("lista"); setMsg(""); }}
                    className="px-4 py-2 rounded-xl text-sm text-neutral-500 hover:text-neutral-700 border border-neutral-300">
                    Annulla
                  </button>
                </div>
              </div>
            )}

            {/* DETTAGLIO */}
            {tab === "dettaglio" && dettaglio && (
              <div>
                {(() => {
                  const s = dettaglio.scadenza;
                  const info = getTipoInfo(s.tipo);
                  const rate = dettaglio.rate;
                  const pagate = rate.filter((r) => r.stato === "PAGATA").length;
                  const totPagato = rate.reduce((acc, r) => acc + (r.importo_pagato || 0), 0);
                  return (
                    <>
                      {/* Header */}
                      <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-3">
                          <span className="text-3xl">{info.icon}</span>
                          <div>
                            <div className="text-xl font-bold text-neutral-800">{s.titolo}</div>
                            <div className="text-xs text-neutral-400">
                              {info.label} — {s.ente || "—"} — {s.frequenza} — {s.stato}
                            </div>
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <button onClick={() => startEdit(s)}
                            className="text-xs px-3 py-1.5 rounded-lg bg-amber-100 text-amber-700 hover:bg-amber-200 font-medium">
                            Modifica
                          </button>
                          <button onClick={() => handleDelete(s.id)}
                            className="text-xs px-3 py-1.5 rounded-lg bg-red-100 text-red-600 hover:bg-red-200 font-medium">
                            Elimina
                          </button>
                        </div>
                      </div>

                      {/* KPI mini */}
                      <div className="grid grid-cols-4 gap-3 mb-6">
                        <div className="rounded-xl border p-3 text-center">
                          <div className="text-lg font-bold text-neutral-800">{fmt(s.importo_totale)}</div>
                          <div className="text-[10px] text-neutral-400">Totale</div>
                        </div>
                        <div className="rounded-xl border p-3 text-center">
                          <div className="text-lg font-bold text-emerald-700">{fmt(totPagato)}</div>
                          <div className="text-[10px] text-neutral-400">Pagato</div>
                        </div>
                        <div className="rounded-xl border p-3 text-center">
                          <div className="text-lg font-bold text-red-600">{fmt(s.importo_totale - totPagato)}</div>
                          <div className="text-[10px] text-neutral-400">Residuo</div>
                        </div>
                        <div className="rounded-xl border p-3 text-center">
                          <div className="text-lg font-bold text-violet-700">{pagate}/{rate.length}</div>
                          <div className="text-[10px] text-neutral-400">Rate pagate</div>
                        </div>
                      </div>

                      {s.note && <div className="text-xs text-neutral-500 mb-4 italic">{s.note}</div>}

                      {/* Tabella rate */}
                      <h3 className="text-sm font-semibold text-neutral-700 mb-2">Piano rate</h3>
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b text-left text-neutral-500 text-xs">
                            <th className="pb-2 w-12">#</th>
                            <th className="pb-2 w-28">Scadenza</th>
                            <th className="pb-2 w-28 text-right">Importo</th>
                            {(s.tipo === "MUTUO" || s.tipo === "PRESTITO") && (
                              <>
                                <th className="pb-2 w-24 text-right">Capitale</th>
                                <th className="pb-2 w-24 text-right">Interessi</th>
                              </>
                            )}
                            <th className="pb-2 w-28 text-right">Pagato</th>
                            <th className="pb-2 w-24">Data pag.</th>
                            <th className="pb-2 w-20">Stato</th>
                            <th className="pb-2 w-20"></th>
                          </tr>
                        </thead>
                        <tbody>
                          {rate.map((r) => (
                            <tr key={r.id} className={`border-b border-neutral-100 ${
                              r.stato === "SCADUTA" ? "bg-red-50" : r.stato === "PAGATA" ? "bg-emerald-50/50" : "hover:bg-neutral-50"
                            }`}>
                              <td className="py-2 text-xs text-neutral-400">{r.numero_rata}</td>
                              <td className={`py-2 text-xs font-mono ${r.stato === "SCADUTA" ? "text-red-600 font-bold" : ""}`}>
                                {fmtDate(r.data_scadenza)}
                              </td>
                              <td className="py-2 text-xs text-right font-mono font-semibold">{fmt(r.importo)}</td>
                              {(s.tipo === "MUTUO" || s.tipo === "PRESTITO") && (
                                <>
                                  <td className="py-2 text-xs text-right font-mono text-neutral-500">{r.importo_capitale ? fmt(r.importo_capitale) : ""}</td>
                                  <td className="py-2 text-xs text-right font-mono text-neutral-400">{r.importo_interessi ? fmt(r.importo_interessi) : ""}</td>
                                </>
                              )}
                              <td className="py-2 text-xs text-right font-mono text-emerald-700">{r.importo_pagato ? fmt(r.importo_pagato) : ""}</td>
                              <td className="py-2 text-xs text-neutral-400">{r.data_pagamento ? fmtDate(r.data_pagamento) : ""}</td>
                              <td className="py-2">
                                <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold ${
                                  r.stato === "PAGATA" ? "bg-emerald-100 text-emerald-700" :
                                  r.stato === "SCADUTA" ? "bg-red-100 text-red-700" :
                                  "bg-amber-100 text-amber-700"
                                }`}>{r.stato === "PAGATA" ? "Pagata" : r.stato === "SCADUTA" ? "Scaduta" : "Da pagare"}</span>
                              </td>
                              <td className="py-2 text-right">
                                {r.stato !== "PAGATA" && (
                                  <button onClick={() => handlePagaRata(r.id)}
                                    className="text-[10px] px-2 py-1 rounded-lg bg-emerald-100 text-emerald-700 hover:bg-emerald-200 font-medium">
                                    Paga
                                  </button>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </>
                  );
                })()}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
