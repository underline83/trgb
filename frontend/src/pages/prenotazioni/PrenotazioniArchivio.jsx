// @version: v2.3 — ordinamento per data e ora del pasto o per data di inserimento, dal più recente o dal più vecchio (2026-11-27); v2.2 — su iPhone ricerca e filtri in cima (prima sotto i 1024 px non c'erano) ed elenco a schede al posto della tabella (2026-11-24); v2.1 — filtro stati dalla tabella stati (In opzione, Lista d'attesa) (2026-11-13) · v2.0 — spostato da Clienti a Prenotazioni › Archivio (redesign 2026-10-19), API /prenotazioni/archivio/ · v1.1-mattoni
// Archivio prenotazioni: tutte, con filtri, ricerca, paginazione
import React, { useState, useEffect, useCallback } from "react";
import usePrenotazioniStati from "./components/statiPrenotazioni";
import { useNavigate } from "react-router-dom";
import { API_BASE, apiFetch } from "../../config/api";
import PrenotazioniNav from "./PrenotazioniNav";
import { Btn, StatusBadge, EmptyState } from "../../components/ui";

const PAGE_SIZE = 50;

const STATO_TONE = {
  SEATED: "success",
  ARRIVED: "success",
  BILL: "success",
  LEFT: "neutral",
  RECORDED: "info",
  CANCELED: "danger",
  NO_SHOW: "warning",
  REFUSED: "danger",
  REQUESTED: "brand",
  PARTIALLY_ARRIVED: "warning",
  OPTION: "warning",
  WAITLIST: "brand",
};

const STATI_LABEL = {
  SEATED: "Seduto",
  ARRIVED: "Arrivato",
  BILL: "Conto",
  LEFT: "Uscito",
  RECORDED: "Prenotato",
  CANCELED: "Cancellata",
  NO_SHOW: "No Show",
  REFUSED: "Rifiutata",
  REQUESTED: "Richiesta",
  PARTIALLY_ARRIVED: "Parziale",
  OPTION: "In opzione",
  WAITLIST: "Lista d'attesa",
};

// «Inserita»: giorno e ora in cui la prenotazione è entrata, e chi l'ha inserita
const inseritaIl = (quando) => {
  if (!quando) return "—";
  const [g, o] = String(quando).split(/[ T]/);
  const [a, m, d] = g.split("-");
  return `${d}/${m}/${a}${o ? ` ${o.slice(0, 5)}` : ""}`;
};
const inseritaDa = (p) => {
  if (p.creato_da === "thefork-api") return "da TheFork";
  if (p.creato_da === "sito") return "dal sito";
  if (p.creato_da) return `da ${p.creato_da}`;
  return p.fonte === "thefork" || p.fonte === "widget" ? "da TheFork" : "";
};

export default function PrenotazioniArchivio() {
  const navigate = useNavigate();
  const { stati: statiElenco } = usePrenotazioniStati();  // filtro dalla tabella stati (2026-11-13)
  const [prenotazioni, setPrenotazioni] = useState([]);
  const [totale, setTotale] = useState(0);
  const [loading, setLoading] = useState(true);
  const [offset, setOffset] = useState(0);
  const [stats, setStats] = useState(null);

  // Filtri
  const [q, setQ] = useState("");
  const [stato, setStato] = useState("");
  const [canale, setCanale] = useState("");
  const [dataDa, setDataDa] = useState("");
  const [dataA, setDataA] = useState("");
  const [ordine, setOrdine] = useState("pasto_desc");        // pasto_desc | pasto_asc | inserita_desc | inserita_asc
  const [filtriAperti, setFiltriAperti] = useState(false);   // telefono/iPad dritto: filtri a scomparsa
  const filtriAttivi = [stato, canale, dataDa, dataA].filter(Boolean).length;

  const fetchPrenotazioni = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (q) params.set("q", q);
      if (stato) params.set("stato", stato);
      if (canale) params.set("canale", canale);
      if (dataDa) params.set("data_da", dataDa);
      if (dataA) params.set("data_a", dataA);
      params.set("ordine", ordine);
      params.set("limit", PAGE_SIZE);
      params.set("offset", offset);

      const res = await apiFetch(`${API_BASE}/prenotazioni/archivio/?${params}`);
      const data = await res.json();
      setPrenotazioni(data.prenotazioni || []);
      setTotale(data.totale || 0);
    } catch (err) {
      console.error("Errore caricamento prenotazioni", err);
    } finally {
      setLoading(false);
    }
  }, [q, stato, canale, dataDa, dataA, ordine, offset]);
  // Intestazione che ordina: primo tocco dal più recente, secondo al contrario
  const ordinaPer = (campo) => { setOrdine(ordine === `${campo}_desc` ? `${campo}_asc` : `${campo}_desc`); setOffset(0); };
  const Ordinabile = ({ campo, children, colSpan }) => (
    <th colSpan={colSpan} className="px-3 py-2 text-left text-xs font-medium text-neutral-500" aria-sort={ordine.startsWith(campo) ? (ordine.endsWith("asc") ? "ascending" : "descending") : "none"}>
      <button type="button" onClick={() => ordinaPer(campo)} title="Ordina" className={`inline-flex items-center gap-1 hover:text-neutral-900 ${ordine.startsWith(campo) ? "text-indigo-900 font-bold" : ""}`}>
        {children}<span aria-hidden="true">{ordine.startsWith(campo) ? (ordine.endsWith("asc") ? "▲" : "▼") : "↕"}</span>
      </button>
    </th>
  );

  useEffect(() => { fetchPrenotazioni(); }, [fetchPrenotazioni]);

  useEffect(() => {
    apiFetch(`${API_BASE}/prenotazioni/archivio/riepilogo/`)
      .then((r) => r.json())
      .then((data) => setStats(data))
      .catch(() => {});
  }, []);

  useEffect(() => { setOffset(0); }, [q, stato, canale, dataDa, dataA]);

  const pagina = Math.floor(offset / PAGE_SIZE) + 1;
  const totalePagine = Math.ceil(totale / PAGE_SIZE);
  const fmt = (v) => (v != null && v !== "" && v !== "None" ? v : "—");

  return (
    <>
      <PrenotazioniNav current="archivio" />
      <div className="min-h-screen bg-brand-cream">
        <div className="max-w-7xl mx-auto px-3 sm:px-6 py-3 sm:py-4">
          {/* Header + KPI */}
          <div className="flex items-center justify-between flex-wrap gap-x-4 gap-y-2 mb-3 sm:mb-4">
            <div>
              <h1 className="text-xl sm:text-2xl font-bold text-neutral-900" style={{ fontFamily: "'Playfair Display', Georgia, serif" }}>Archivio prenotazioni</h1>
              <p className="text-sm text-neutral-500 mt-1">
                {totale.toLocaleString("it-IT")} prenotazion{totale === 1 ? "e" : "i"} trovat{totale === 1 ? "a" : "e"}
              </p>
            </div>
            {stats && (
              <div className="flex gap-4 text-center">
                <div>
                  <div className="text-lg font-bold text-emerald-700">{stats.totale?.toLocaleString("it-IT")}</div>
                  <div className="text-[10px] text-neutral-500 uppercase">Totale</div>
                </div>
                <div>
                  <div className="text-lg font-bold text-amber-600">{stats.no_show}</div>
                  <div className="text-[10px] text-neutral-500 uppercase">No Show</div>
                </div>
                <div>
                  <div className="text-lg font-bold text-teal-700">{stats.pax_medio}</div>
                  <div className="text-[10px] text-neutral-500 uppercase">Pax medio</div>
                </div>
              </div>
            )}
          </div>

          <div className="flex flex-col lg:flex-row gap-3 lg:gap-6">
            {/* FILTRI: colonna a sinistra da lg; sotto, ricerca sempre a vista e il resto a scomparsa */}
            <div className="w-full lg:w-56 flex-shrink-0">
              <div className="bg-white rounded-xl border border-neutral-200 p-3 lg:p-4 shadow-sm">
                <h3 className="hidden lg:block text-xs font-semibold text-neutral-500 uppercase tracking-wider mb-4">Filtri</h3>

                <div className="flex items-end gap-2">
                  <div className="flex-1 min-w-0">
                    <label className="hidden lg:block text-xs text-neutral-600 font-medium">Cerca</label>
                    <input type="search" value={q} onChange={(e) => setQ(e.target.value)}
                      placeholder="Nome, note..."
                      className="w-full lg:mt-1 border border-neutral-300 rounded-lg px-3 py-1.5 max-lg:min-h-[44px] text-base lg:text-sm focus:ring-2 focus:ring-teal-300 outline-none" />
                  </div>
                  <button type="button" onClick={() => setFiltriAperti(!filtriAperti)}
                    className={`lg:hidden flex-shrink-0 px-3 min-h-[44px] rounded-lg border text-sm font-medium ${filtriAttivi ? "bg-teal-50 border-teal-300 text-teal-800" : "bg-white border-neutral-300 text-neutral-700"}`}>
                    Filtri{filtriAttivi ? ` · ${filtriAttivi}` : ""} {filtriAperti ? "▲" : "▼"}
                  </button>
                </div>

                <div className={`${filtriAperti ? "grid" : "hidden"} grid-cols-2 gap-3 mt-3 lg:mt-4 lg:block lg:space-y-4`}>

                <div>
                  <label className="text-xs text-neutral-600 font-medium">Stato</label>
                  <select value={stato} onChange={(e) => setStato(e.target.value)}
                    className="w-full mt-1 border border-neutral-300 rounded-lg px-3 py-1.5 max-lg:min-h-[44px] text-base lg:text-sm">
                    <option value="">Tutti</option>
                    {statiElenco.map((s) => <option key={s.codice} value={s.codice}>{s.etichetta}</option>)}
                  </select>
                </div>

                <div>
                  <label className="text-xs text-neutral-600 font-medium">Canale</label>
                  <select value={canale} onChange={(e) => setCanale(e.target.value)}
                    className="w-full mt-1 border border-neutral-300 rounded-lg px-3 py-1.5 max-lg:min-h-[44px] text-base lg:text-sm">
                    <option value="">Tutti</option>
                    <option value="Offline">Offline (telefono)</option>
                    <option value="TheFork">TheFork</option>
                    <option value="Walk-in">Walk-in</option>
                    <option value="Booking Module">Booking Module</option>
                    <option value="TripAdvisor">TripAdvisor</option>
                  </select>
                </div>

                <div>
                  <label className="text-xs text-neutral-600 font-medium">Ordina per</label>
                  <select value={ordine} onChange={(e) => { setOrdine(e.target.value); setOffset(0); }}
                    className="w-full mt-1 border border-neutral-300 rounded-lg px-3 py-1.5 max-lg:min-h-[44px] text-base lg:text-sm">
                    <option value="pasto_desc">Data e ora — dalla più recente</option>
                    <option value="pasto_asc">Data e ora — dalla più vecchia</option>
                    <option value="inserita_desc">Inserimento — le ultime inserite</option>
                    <option value="inserita_asc">Inserimento — le prime inserite</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs text-neutral-600 font-medium">Da data</label>
                  <input type="date" value={dataDa} onChange={(e) => setDataDa(e.target.value)}
                    className="w-full mt-1 border border-neutral-300 rounded-lg px-3 py-1.5 max-lg:min-h-[44px] text-base lg:text-sm" />
                </div>
                <div>
                  <label className="text-xs text-neutral-600 font-medium">A data</label>
                  <input type="date" value={dataA} onChange={(e) => setDataA(e.target.value)}
                    className="w-full mt-1 border border-neutral-300 rounded-lg px-3 py-1.5 max-lg:min-h-[44px] text-base lg:text-sm" />
                </div>

                <Btn variant="ghost" size="sm"
                  onClick={() => { setQ(""); setStato(""); setCanale(""); setDataDa(""); setDataA(""); }}
                  className="w-full max-lg:col-span-2 max-lg:min-h-[44px]">
                  Resetta filtri
                </Btn>
                </div>
              </div>
            </div>

            {/* TABELLA */}
            <div className="flex-1 min-w-0">
              <div className="bg-white rounded-xl border border-neutral-200 shadow-sm overflow-hidden">
                {loading ? (
                  <div className="p-12 text-center text-neutral-400">Caricamento...</div>
                ) : prenotazioni.length === 0 ? (
                  <EmptyState
                    icon="📅"
                    title="Nessuna prenotazione trovata"
                    description="Importa da TheFork o regola i filtri per iniziare."
                    compact
                  />
                ) : (
                  <>
                  {/* Telefono: una scheda per prenotazione */}
                  <div className="sm:hidden divide-y divide-neutral-100">
                    {prenotazioni.map((p) => {
                      const nota = p.nota_ristorante || p.nota_cliente || "";
                      const contenuto = (
                        <>
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <div className={`text-[15px] font-medium truncate ${p.cliente_id ? "text-teal-800" : "text-neutral-400"}`}>
                                {p.cliente_id ? `${p.cliente_vip ? "⭐ " : ""}${p.cliente_cognome || ""} ${p.cliente_nome || ""}` : "Non collegato"}
                              </div>
                              <div className="text-xs text-neutral-500 mt-0.5">
                                {(p.data_pasto || "").split("-").reverse().join("/")}
                                {p.ora_pasto ? ` · ${p.ora_pasto.substring(0, 5)}` : ""} · <span className="font-semibold text-neutral-700">{p.pax}</span> pax
                                {fmt(p.tavolo) !== "—" ? ` · tav. ${p.tavolo}` : ""}
                                {fmt(p.canale) !== "—" ? ` · ${p.canale}` : ""}
                              </div>
                            </div>
                            <span className="flex-shrink-0">
                              <StatusBadge tone={STATO_TONE[p.stato] || "neutral"} size="sm">
                                {STATI_LABEL[p.stato] || p.stato}
                              </StatusBadge>
                            </span>
                          </div>
                          {nota && <div className="mt-1 text-xs text-neutral-500 line-clamp-2">{nota}</div>}
                        </>
                      );
                      return p.cliente_id ? (
                        <button key={p.id} type="button" onClick={() => navigate(`/clienti/${p.cliente_id}`)}
                          className="block w-full text-left px-3 py-2.5 min-h-[56px] active:bg-teal-50">
                          {contenuto}
                        </button>
                      ) : (
                        <div key={p.id} className="px-3 py-2.5 min-h-[56px]">{contenuto}</div>
                      );
                    })}
                  </div>
                  <div className="hidden sm:block overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-neutral-50 border-b border-neutral-200">
                        <tr>
                          <Ordinabile campo="pasto" colSpan={2}>Data e ora</Ordinabile>
                          <th className="px-3 py-2 text-left text-xs font-medium text-neutral-500">Cliente</th>
                          <th className="px-3 py-2 text-center text-xs font-medium text-neutral-500">Pax</th>
                          <th className="px-3 py-2 text-left text-xs font-medium text-neutral-500">Stato</th>
                          <th className="px-3 py-2 text-left text-xs font-medium text-neutral-500">Canale</th>
                          <th className="px-3 py-2 text-left text-xs font-medium text-neutral-500">Tavolo</th>
                          <th className="px-3 py-2 text-left text-xs font-medium text-neutral-500">Note</th>
                          <Ordinabile campo="inserita">Inserita</Ordinabile>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-neutral-100">
                        {prenotazioni.map((p) => (
                          <tr key={p.id} className="hover:bg-teal-50 transition">
                            <td className="px-3 py-2.5 font-medium text-neutral-900 whitespace-nowrap">
                              {p.data_pasto}
                            </td>
                            <td className="px-3 py-2.5 text-neutral-600 whitespace-nowrap">
                              {p.ora_pasto ? p.ora_pasto.substring(0, 5) : "—"}
                            </td>
                            <td className="px-3 py-2.5">
                              {p.cliente_id ? (
                                <button
                                  onClick={() => navigate(`/clienti/${p.cliente_id}`)}
                                  className="text-left text-teal-700 hover:text-teal-900 font-medium hover:underline"
                                >
                                  {p.cliente_vip ? "⭐ " : ""}
                                  {p.cliente_cognome} {p.cliente_nome}
                                </button>
                              ) : (
                                <span className="text-neutral-400 text-xs">Non collegato</span>
                              )}
                            </td>
                            <td className="px-3 py-2.5 text-center font-medium">{p.pax}</td>
                            <td className="px-3 py-2.5">
                              <StatusBadge tone={STATO_TONE[p.stato] || "neutral"} size="sm">
                                {STATI_LABEL[p.stato] || p.stato}
                              </StatusBadge>
                            </td>
                            <td className="px-3 py-2.5 text-xs text-neutral-600">{fmt(p.canale)}</td>
                            <td className="px-3 py-2.5 text-xs text-neutral-600">{fmt(p.tavolo)}</td>
                            <td className="px-3 py-2.5 text-xs text-neutral-500 max-w-[200px] truncate">
                              {p.nota_ristorante || p.nota_cliente
                                ? (p.nota_ristorante || p.nota_cliente).substring(0, 60) + "..."
                                : ""}
                            </td>
                            {/* Quando è stata inserita e da chi (utente di TRGB, oppure TheFork / sito) */}
                            <td className="px-3 py-2.5 text-xs text-neutral-600 whitespace-nowrap">
                              {inseritaIl(p.data_prenotazione)}
                              <div className="text-neutral-500">{inseritaDa(p)}</div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  </>
                )}

                {/* PAGINAZIONE */}
                {totalePagine > 1 && (
                  <div className="flex items-center justify-between gap-2 px-3 sm:px-4 py-3 border-t border-neutral-200 bg-neutral-50">
                    <Btn variant="secondary" size="sm" disabled={offset === 0}
                      onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}>
                      ← Precedente
                    </Btn>
                    <span className="text-xs text-neutral-500">Pagina {pagina} di {totalePagine}</span>
                    <Btn variant="secondary" size="sm" disabled={offset + PAGE_SIZE >= totale}
                      onClick={() => setOffset(offset + PAGE_SIZE)}>
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
