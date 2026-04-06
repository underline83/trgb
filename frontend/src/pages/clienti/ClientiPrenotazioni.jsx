// @version: v1.0-clienti-prenotazioni
// Vista globale prenotazioni con filtri, ricerca, paginazione
import React, { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { API_BASE, apiFetch } from "../../config/api";
import ClientiNav from "./ClientiNav";

const PAGE_SIZE = 50;

const STATI_COLORI = {
  SEATED: "bg-emerald-100 text-emerald-700",
  ARRIVED: "bg-emerald-100 text-emerald-700",
  BILL: "bg-emerald-100 text-emerald-700",
  LEFT: "bg-neutral-100 text-neutral-600",
  RECORDED: "bg-sky-100 text-sky-700",
  CANCELED: "bg-red-100 text-red-600",
  NO_SHOW: "bg-amber-100 text-amber-700",
  REFUSED: "bg-red-100 text-red-600",
  REQUESTED: "bg-blue-100 text-blue-700",
  PARTIALLY_ARRIVED: "bg-amber-100 text-amber-700",
};

const STATI_LABEL = {
  SEATED: "Seduto",
  ARRIVED: "Arrivato",
  BILL: "Conto",
  LEFT: "Uscito",
  RECORDED: "Confermata",
  CANCELED: "Cancellata",
  NO_SHOW: "No Show",
  REFUSED: "Rifiutata",
  REQUESTED: "Richiesta",
  PARTIALLY_ARRIVED: "Parziale",
};

export default function ClientiPrenotazioni() {
  const navigate = useNavigate();
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

  const fetchPrenotazioni = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (q) params.set("q", q);
      if (stato) params.set("stato", stato);
      if (canale) params.set("canale", canale);
      if (dataDa) params.set("data_da", dataDa);
      if (dataA) params.set("data_a", dataA);
      params.set("limit", PAGE_SIZE);
      params.set("offset", offset);

      const res = await apiFetch(`${API_BASE}/clienti/prenotazioni/lista?${params}`);
      const data = await res.json();
      setPrenotazioni(data.prenotazioni || []);
      setTotale(data.totale || 0);
    } catch (err) {
      console.error("Errore caricamento prenotazioni", err);
    } finally {
      setLoading(false);
    }
  }, [q, stato, canale, dataDa, dataA, offset]);

  useEffect(() => { fetchPrenotazioni(); }, [fetchPrenotazioni]);

  useEffect(() => {
    apiFetch(`${API_BASE}/clienti/prenotazioni/stats`)
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
      <ClientiNav current="prenotazioni" />
      <div className="min-h-screen bg-neutral-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
          {/* Header + KPI */}
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-2xl font-bold text-neutral-900">📅 Prenotazioni</h1>
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

          <div className="flex gap-6">
            {/* SIDEBAR FILTRI */}
            <div className="w-56 flex-shrink-0 hidden lg:block">
              <div className="bg-white rounded-xl border border-neutral-200 p-4 shadow-sm space-y-4">
                <h3 className="text-xs font-semibold text-neutral-500 uppercase tracking-wider">Filtri</h3>

                <div>
                  <label className="text-xs text-neutral-600 font-medium">Cerca</label>
                  <input type="text" value={q} onChange={(e) => setQ(e.target.value)}
                    placeholder="Nome, note..."
                    className="w-full mt-1 border border-neutral-300 rounded-lg px-3 py-1.5 text-sm focus:ring-2 focus:ring-teal-300 outline-none" />
                </div>

                <div>
                  <label className="text-xs text-neutral-600 font-medium">Stato</label>
                  <select value={stato} onChange={(e) => setStato(e.target.value)}
                    className="w-full mt-1 border border-neutral-300 rounded-lg px-3 py-1.5 text-sm">
                    <option value="">Tutti</option>
                    <option value="SEATED">Seduto</option>
                    <option value="RECORDED">Confermata</option>
                    <option value="CANCELED">Cancellata</option>
                    <option value="NO_SHOW">No Show</option>
                    <option value="ARRIVED">Arrivato</option>
                    <option value="REFUSED">Rifiutata</option>
                  </select>
                </div>

                <div>
                  <label className="text-xs text-neutral-600 font-medium">Canale</label>
                  <select value={canale} onChange={(e) => setCanale(e.target.value)}
                    className="w-full mt-1 border border-neutral-300 rounded-lg px-3 py-1.5 text-sm">
                    <option value="">Tutti</option>
                    <option value="Offline">Offline (telefono)</option>
                    <option value="TheFork">TheFork</option>
                    <option value="Walk-in">Walk-in</option>
                    <option value="Booking Module">Booking Module</option>
                    <option value="TripAdvisor">TripAdvisor</option>
                  </select>
                </div>

                <div>
                  <label className="text-xs text-neutral-600 font-medium">Da data</label>
                  <input type="date" value={dataDa} onChange={(e) => setDataDa(e.target.value)}
                    className="w-full mt-1 border border-neutral-300 rounded-lg px-3 py-1.5 text-sm" />
                </div>
                <div>
                  <label className="text-xs text-neutral-600 font-medium">A data</label>
                  <input type="date" value={dataA} onChange={(e) => setDataA(e.target.value)}
                    className="w-full mt-1 border border-neutral-300 rounded-lg px-3 py-1.5 text-sm" />
                </div>

                <button onClick={() => { setQ(""); setStato(""); setCanale(""); setDataDa(""); setDataA(""); }}
                  className="w-full text-xs text-neutral-500 hover:text-neutral-700 transition py-1">
                  Resetta filtri
                </button>
              </div>
            </div>

            {/* TABELLA */}
            <div className="flex-1 min-w-0">
              <div className="bg-white rounded-xl border border-neutral-200 shadow-sm overflow-hidden">
                {loading ? (
                  <div className="p-12 text-center text-neutral-400">Caricamento...</div>
                ) : prenotazioni.length === 0 ? (
                  <div className="p-12 text-center text-neutral-400">
                    Nessuna prenotazione trovata. Importa da TheFork per iniziare!
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-neutral-50 border-b border-neutral-200">
                        <tr>
                          <th className="px-3 py-2 text-left text-xs font-medium text-neutral-500">Data</th>
                          <th className="px-3 py-2 text-left text-xs font-medium text-neutral-500">Ora</th>
                          <th className="px-3 py-2 text-left text-xs font-medium text-neutral-500">Cliente</th>
                          <th className="px-3 py-2 text-center text-xs font-medium text-neutral-500">Pax</th>
                          <th className="px-3 py-2 text-left text-xs font-medium text-neutral-500">Stato</th>
                          <th className="px-3 py-2 text-left text-xs font-medium text-neutral-500">Canale</th>
                          <th className="px-3 py-2 text-left text-xs font-medium text-neutral-500">Tavolo</th>
                          <th className="px-3 py-2 text-left text-xs font-medium text-neutral-500">Note</th>
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
                                  className="text-teal-700 hover:text-teal-900 font-medium hover:underline"
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
                              <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${STATI_COLORI[p.stato] || "bg-neutral-100 text-neutral-600"}`}>
                                {STATI_LABEL[p.stato] || p.stato}
                              </span>
                            </td>
                            <td className="px-3 py-2.5 text-xs text-neutral-600">{fmt(p.canale)}</td>
                            <td className="px-3 py-2.5 text-xs text-neutral-600">{fmt(p.tavolo)}</td>
                            <td className="px-3 py-2.5 text-xs text-neutral-500 max-w-[200px] truncate">
                              {p.nota_ristorante || p.nota_cliente
                                ? (p.nota_ristorante || p.nota_cliente).substring(0, 60) + "..."
                                : ""}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {/* PAGINAZIONE */}
                {totalePagine > 1 && (
                  <div className="flex items-center justify-between px-4 py-3 border-t border-neutral-200 bg-neutral-50">
                    <button disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
                      className="text-xs px-3 py-1.5 rounded-lg border border-neutral-300 disabled:opacity-40 hover:bg-white transition">
                      ← Precedente
                    </button>
                    <span className="text-xs text-neutral-500">Pagina {pagina} di {totalePagine}</span>
                    <button disabled={offset + PAGE_SIZE >= totale} onClick={() => setOffset(offset + PAGE_SIZE)}
                      className="text-xs px-3 py-1.5 rounded-lg border border-neutral-300 disabled:opacity-40 hover:bg-white transition">
                      Successiva →
                    </button>
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
