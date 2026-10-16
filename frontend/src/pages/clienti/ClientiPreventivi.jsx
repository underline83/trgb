// @version: v1.2 — filtri visibili anche sotto lg, periodo «Prossimi» di default
// Modulo: clienti (sub-modulo preventivi)
// Lista preventivi con filtri, stats, paginazione — Fase A (10.1)
// v1.2 (2026-10-16): la sidebar filtri era `hidden lg:block` (invisibile su iPad
//   verticale e telefono) e l'anno corrente era sempre attivo: gli eventi del 2027
//   sparivano. Ora «Periodo» parte da «Prossimi» (eventi da oggi + senza data) e
//   sotto lg i filtri stanno sopra la tabella. Le bozze automatiche con un titolo
//   vero compaiono col badge «non salvata» (manca solo «Crea preventivo»).
import React, { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { API_BASE, apiFetch } from "../../config/api";
import ClientiNav from "./ClientiNav";
import { Btn } from "../../components/ui";

const PAGE_SIZE = 50;

const STATI_COLORI = {
  bozza:      "bg-neutral-100 text-neutral-600",
  inviato:    "bg-blue-100 text-blue-700",
  in_attesa:  "bg-amber-100 text-amber-700",
  confermato: "bg-emerald-100 text-emerald-700",
  prenotato:  "bg-indigo-100 text-indigo-700",
  completato: "bg-emerald-50 text-emerald-600",
  fatturato:  "bg-neutral-100 text-neutral-500",
  rifiutato:  "bg-red-100 text-red-600",
  scaduto:    "bg-orange-100 text-orange-700",
};

const STATI_LABEL = {
  bozza:      "Bozza",
  inviato:    "Inviato",
  in_attesa:  "In attesa",
  confermato: "Confermato",
  prenotato:  "Prenotato",
  completato: "Completato",
  fatturato:  "Fatturato",
  rifiutato:  "Rifiutato",
  scaduto:    "Scaduto",
};

// Periodo: «prossimi» (default), «» = tutti, oppure un anno (abilita il mese)
const PERIODO_DEFAULT = "prossimi";
const ANNO_CORRENTE = new Date().getFullYear();
const ANNI = [ANNO_CORRENTE + 1, ANNO_CORRENTE, ANNO_CORRENTE - 1, ANNO_CORRENTE - 2].map(String);

const TIPI_LABEL = {
  cena_privata: "Cena privata",
  aperitivo:    "Aperitivo",
  degustazione: "Degustazione",
  catering:     "Catering",
  altro:        "Altro",
};

export default function ClientiPreventivi() {
  const navigate = useNavigate();
  const [preventivi, setPreventivi] = useState([]);
  const [totale, setTotale] = useState(0);
  const [loading, setLoading] = useState(true);
  const [offset, setOffset] = useState(0);
  const [stats, setStats] = useState(null);

  // Filtri
  const [q, setQ] = useState("");
  const [stato, setStato] = useState("");
  const [tipo, setTipo] = useState("");
  const [periodo, setPeriodo] = useState(PERIODO_DEFAULT);
  const [mese, setMese] = useState("");
  const [filtriAperti, setFiltriAperti] = useState(false); // solo sotto lg
  const anno = /^\d{4}$/.test(periodo) ? periodo : "";
  const nFiltriAttivi = [q, stato, tipo, periodo !== PERIODO_DEFAULT ? periodo || "tutti" : "", anno && mese]
    .filter(Boolean).length;

  // Il mese ha senso solo con un anno: tornando a Prossimi/Tutti si azzera
  useEffect(() => { if (!anno) setMese(""); }, [anno]);

  const resetFiltri = () => {
    setQ(""); setStato(""); setTipo(""); setPeriodo(PERIODO_DEFAULT); setMese("");
  };

  const fetchPreventivi = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (q) params.set("q", q);
      if (stato) params.set("stato", stato);
      if (tipo) params.set("tipo", tipo);
      if (periodo === "prossimi") params.set("periodo", "prossimi");
      if (anno) params.set("anno", anno);
      if (anno && mese) params.set("mese", mese);
      params.set("limit", PAGE_SIZE);
      params.set("offset", offset);

      const res = await apiFetch(`${API_BASE}/preventivi?${params}`);
      const data = await res.json();
      setPreventivi(data.items || []);
      setTotale(data.total || 0);
    } catch (err) {
      console.error("Errore caricamento preventivi", err);
    } finally {
      setLoading(false);
    }
  }, [q, stato, tipo, periodo, anno, mese, offset]);

  useEffect(() => { fetchPreventivi(); }, [fetchPreventivi]);

  useEffect(() => {
    apiFetch(`${API_BASE}/preventivi/stats`)
      .then((r) => r.json())
      .then((data) => setStats(data))
      .catch(() => {});
  }, []);

  useEffect(() => { setOffset(0); }, [q, stato, tipo, periodo, mese]);

  const pagina = Math.floor(offset / PAGE_SIZE) + 1;
  const totalePagine = Math.ceil(totale / PAGE_SIZE);

  // Calcola "scade tra X giorni"
  const giorniAllaScadenza = (scadenza) => {
    if (!scadenza) return null;
    const oggi = new Date();
    oggi.setHours(0, 0, 0, 0);
    const sc = new Date(scadenza);
    const diff = Math.ceil((sc - oggi) / (1000 * 60 * 60 * 24));
    return diff;
  };

  return (
    <>
      <ClientiNav current="preventivi" />
      <div className="min-h-screen bg-brand-cream">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
          {/* Header + KPI + Nuovo */}
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-2xl font-bold text-neutral-900">📋 Preventivi</h1>
              <p className="text-sm text-neutral-500 mt-1">
                {totale} preventiv{totale === 1 ? "o" : "i"} trovat{totale === 1 ? "o" : "i"}
              </p>
            </div>
            <div className="flex items-center gap-4">
              {stats && (
                <div className="flex gap-4 text-center">
                  <div>
                    <div className="text-lg font-bold text-amber-600">{stats.in_ballo}</div>
                    <div className="text-[10px] text-neutral-500 uppercase">In ballo</div>
                  </div>
                  <div>
                    <div className="text-lg font-bold text-emerald-700">{stats.confermati_mese}</div>
                    <div className="text-[10px] text-neutral-500 uppercase">Confermati</div>
                  </div>
                  <div>
                    <div className="text-lg font-bold text-indigo-700">€{stats.valore_totale_mese?.toLocaleString("it-IT")}</div>
                    <div className="text-[10px] text-neutral-500 uppercase">Valore mese</div>
                  </div>
                </div>
              )}
              <Btn variant="primary" size="md" onClick={() => navigate("/clienti/preventivi/nuovo")}>
                + Nuovo preventivo
              </Btn>
            </div>
          </div>

          <div className="flex flex-col lg:flex-row gap-4 lg:gap-6">
            {/* FILTRI: sidebar da lg in su, pannello sopra la tabella sotto lg */}
            <div className="w-full lg:w-56 flex-shrink-0">
              {/* Barra compatta sotto lg: cerca + periodo sempre visibili */}
              <div className="lg:hidden bg-white rounded-xl border border-neutral-200 p-3 shadow-sm space-y-2">
                <div className="flex gap-2">
                  <input type="text" value={q} onChange={(e) => setQ(e.target.value)}
                    placeholder="Cerca titolo, numero, cliente..."
                    className="flex-1 min-w-0 border border-neutral-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-300 outline-none" />
                  <select value={periodo} onChange={(e) => setPeriodo(e.target.value)}
                    className="w-32 border border-neutral-300 rounded-lg px-2 py-2 text-sm bg-white">
                    <option value="prossimi">Prossimi</option>
                    <option value="">Tutti</option>
                    {ANNI.map((a) => <option key={a} value={a}>{a}</option>)}
                  </select>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <button type="button" onClick={() => setFiltriAperti((v) => !v)}
                    className="text-xs font-medium text-indigo-700 px-2 py-2 min-h-[44px]">
                    {filtriAperti ? "▲ Meno filtri" : "▼ Altri filtri"}{nFiltriAttivi > 0 ? ` (${nFiltriAttivi} attivi)` : ""}
                  </button>
                  {nFiltriAttivi > 0 && (
                    <Btn variant="ghost" size="sm" onClick={resetFiltri}>Resetta</Btn>
                  )}
                </div>
              </div>

              <div className={`${filtriAperti ? "block mt-2" : "hidden"} lg:block lg:mt-0 bg-white rounded-xl border border-neutral-200 p-4 shadow-sm space-y-4`}>
                <h3 className="hidden lg:block text-xs font-semibold text-neutral-500 uppercase tracking-wider">Filtri</h3>

                <div className="hidden lg:block">
                  <label className="text-xs text-neutral-600 font-medium">Cerca</label>
                  <input type="text" value={q} onChange={(e) => setQ(e.target.value)}
                    placeholder="Titolo, numero, cliente..."
                    className="w-full mt-1 border border-neutral-300 rounded-lg px-3 py-1.5 text-sm focus:ring-2 focus:ring-indigo-300 outline-none" />
                </div>

                <div>
                  <label className="text-xs text-neutral-600 font-medium">Stato</label>
                  <select value={stato} onChange={(e) => setStato(e.target.value)}
                    className="w-full mt-1 border border-neutral-300 rounded-lg px-3 py-1.5 text-sm">
                    <option value="">Tutti</option>
                    {Object.entries(STATI_LABEL).map(([k, v]) => (
                      <option key={k} value={k}>{v}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-xs text-neutral-600 font-medium">Tipo</label>
                  <select value={tipo} onChange={(e) => setTipo(e.target.value)}
                    className="w-full mt-1 border border-neutral-300 rounded-lg px-3 py-1.5 text-sm">
                    <option value="">Tutti</option>
                    {Object.entries(TIPI_LABEL).map(([k, v]) => (
                      <option key={k} value={k}>{v}</option>
                    ))}
                  </select>
                </div>

                <div className="hidden lg:block">
                  <label className="text-xs text-neutral-600 font-medium">Periodo evento</label>
                  <select value={periodo} onChange={(e) => setPeriodo(e.target.value)}
                    className="w-full mt-1 border border-neutral-300 rounded-lg px-3 py-1.5 text-sm">
                    <option value="prossimi">Prossimi (da oggi + senza data)</option>
                    <option value="">Tutti</option>
                    {ANNI.map((a) => <option key={a} value={a}>{a}</option>)}
                  </select>
                </div>

                <div>
                  <label className="text-xs text-neutral-600 font-medium">Mese</label>
                  <select value={mese} onChange={(e) => setMese(e.target.value)} disabled={!anno}
                    title={anno ? "" : "Scegli prima un anno in Periodo"}
                    className="w-full mt-1 border border-neutral-300 rounded-lg px-3 py-1.5 text-sm disabled:bg-neutral-50 disabled:text-neutral-400">
                    <option value="">Tutti</option>
                    {["Gennaio","Febbraio","Marzo","Aprile","Maggio","Giugno","Luglio","Agosto","Settembre","Ottobre","Novembre","Dicembre"].map((m, i) => (
                      <option key={i+1} value={i+1}>{m}</option>
                    ))}
                  </select>
                </div>

                <Btn variant="ghost" size="sm" onClick={resetFiltri} className="w-full hidden lg:inline-flex">
                  Resetta filtri
                </Btn>
              </div>
            </div>

            {/* TABELLA */}
            <div className="flex-1 min-w-0">
              <div className="bg-white rounded-xl border border-neutral-200 shadow-sm overflow-hidden">
                {loading ? (
                  <div className="p-12 text-center text-neutral-400">Caricamento...</div>
                ) : preventivi.length === 0 ? (
                  <div className="p-12 text-center text-neutral-400">
                    {nFiltriAttivi > 0 || periodo === "prossimi" ? (
                      <>
                        Nessun preventivo con questi filtri.
                        {periodo === "prossimi" && " Gli eventi passati sono in «Tutti»."}
                        <div className="mt-3">
                          <Btn variant="ghost" size="sm" onClick={() => { resetFiltri(); setPeriodo(""); }}>Mostra tutti</Btn>
                        </div>
                      </>
                    ) : "Nessun preventivo trovato. Crea il primo!"}
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-neutral-50 border-b border-neutral-200">
                        <tr>
                          <th className="px-3 py-2 text-left text-xs font-medium text-neutral-500">Numero</th>
                          <th className="px-3 py-2 text-left text-xs font-medium text-neutral-500">Titolo</th>
                          <th className="px-3 py-2 text-left text-xs font-medium text-neutral-500">Cliente</th>
                          <th className="px-3 py-2 text-left text-xs font-medium text-neutral-500">Data evento</th>
                          <th className="px-3 py-2 text-center text-xs font-medium text-neutral-500">Pax</th>
                          <th className="px-3 py-2 text-right text-xs font-medium text-neutral-500">Totale</th>
                          <th className="px-3 py-2 text-left text-xs font-medium text-neutral-500">Stato</th>
                          <th className="px-3 py-2 text-left text-xs font-medium text-neutral-500">Scadenza</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-neutral-100">
                        {preventivi.map((p) => {
                          const gg = giorniAllaScadenza(p.scadenza_conferma);
                          const scadenzaUrgente = gg !== null && gg >= 0 && gg <= 3 && !["confermato","prenotato","completato","fatturato","rifiutato","scaduto"].includes(p.stato);
                          return (
                            <tr key={p.id}
                              onClick={() => navigate(`/clienti/preventivi/${p.id}`)}
                              className="hover:bg-indigo-50 transition cursor-pointer">
                              <td className="px-3 py-2.5 font-mono text-xs text-neutral-500 whitespace-nowrap">
                                {p.numero}
                              </td>
                              <td className="px-3 py-2.5 font-medium text-neutral-900 max-w-[260px]">
                                <div className="truncate">{p.titolo}</div>
                                {!!p.is_bozza_auto && (
                                  <span
                                    className="inline-block mt-0.5 text-[10px] px-2 py-0.5 rounded-full font-medium bg-orange-100 text-orange-700 border border-orange-200"
                                    title="Compilato ma mai salvato: aprilo e premi «Salva modifiche»"
                                  >
                                    non salvata
                                  </span>
                                )}
                              </td>
                              <td className="px-3 py-2.5">
                                {p.cliente_id ? (
                                  <span className="text-indigo-700 font-medium">
                                    {p.cliente_cognome} {p.cliente_nome}
                                  </span>
                                ) : (
                                  <span className="text-neutral-400 text-xs">—</span>
                                )}
                              </td>
                              <td className="px-3 py-2.5 text-neutral-600 whitespace-nowrap">
                                {p.data_evento || "—"}
                              </td>
                              <td className="px-3 py-2.5 text-center font-medium">{p.n_persone || "—"}</td>
                              <td className="px-3 py-2.5 text-right font-medium text-neutral-900">
                                {p.n_menu >= 2 ? (
                                  <span
                                    className="inline-block text-[10px] px-2 py-0.5 rounded-full font-medium bg-amber-100 text-amber-800 border border-amber-200"
                                    title="Preventivo con menu alternativi: il cliente ne sceglie uno"
                                  >
                                    {p.n_menu} alternative
                                  </span>
                                ) : p.totale_calcolato ? (
                                  `€${p.totale_calcolato.toLocaleString("it-IT", {minimumFractionDigits: 2})}`
                                ) : (
                                  "—"
                                )}
                              </td>
                              <td className="px-3 py-2.5">
                                <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${STATI_COLORI[p.stato] || "bg-neutral-100 text-neutral-600"}`}>
                                  {STATI_LABEL[p.stato] || p.stato}
                                </span>
                              </td>
                              <td className="px-3 py-2.5 text-xs whitespace-nowrap">
                                {gg !== null ? (
                                  <span className={scadenzaUrgente ? "text-red-600 font-semibold" : "text-neutral-500"}>
                                    {gg < 0 ? "Scaduto" : gg === 0 ? "Oggi" : `${gg}g`}
                                  </span>
                                ) : "—"}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}

                {/* PAGINAZIONE */}
                {totalePagine > 1 && (
                  <div className="flex items-center justify-between px-4 py-3 border-t border-neutral-200 bg-neutral-50">
                    <Btn variant="secondary" size="sm" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}>
                      ← Precedente
                    </Btn>
                    <span className="text-xs text-neutral-500">Pagina {pagina} di {totalePagine}</span>
                    <Btn variant="secondary" size="sm" disabled={offset + PAGE_SIZE >= totale} onClick={() => setOffset(offset + PAGE_SIZE)}>
                      Successiva →
                    </Btn>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
