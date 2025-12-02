// @version: v3.1-magazzino-id
// Magazzino Vini — Lista + filtri (con ricerca per ID)

import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { API_BASE } from "../../config/api";

export default function MagazzinoVini() {
  const navigate = useNavigate();
  const [idFilter, setIdFilter] = useState("");
  const [q, setQ] = useState("");
  const [tipologia, setTipologia] = useState("");
  const [nazione, setNazione] = useState("");
  const [soloInCarta, setSoloInCarta] = useState(false);
  const [soloConGiacenza, setSoloConGiacenza] = useState(true);

  const [vini, setVini] = useState([]);
  const [loading, setLoading] = useState(false);

  const token = localStorage.getItem("token");

  const logout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("role");
    window.location.href = "/";
  };

  const fetchVini = async () => {
    setLoading(true);

    const params = new URLSearchParams();

    // 🔍 filtro ID diretto
    if (idFilter) {
      params.append("id", idFilter.trim());
    }

    if (q) params.append("q", q.trim());
    if (tipologia) params.append("tipologia", tipologia.trim());
    if (nazione) params.append("nazione", nazione.trim());
    if (soloInCarta) params.append("solo_in_carta", "true");
    if (soloConGiacenza) params.append("min_qta", "1");

    const url = `${API_BASE}/vini/magazzino?${params.toString()}`;

    try {
      const res = await fetch(url, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!res.ok) {
        throw new Error(`Errore server: ${res.status}`);
      }

      const data = await res.json();
      setVini(data || []);
    } catch (err) {
      console.error(err);
      setVini([]);
    }

    setLoading(false);
  };

  useEffect(() => {
    fetchVini();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSubmit = (e) => {
    e.preventDefault();
    fetchVini();
  };

  return (
    <div className="min-h-screen bg-neutral-100 p-6 font-sans">
      <div className="max-w-6xl mx-auto bg-white shadow-2xl rounded-3xl p-10 border border-neutral-200">

        {/* HEADER + BOTTONI */}
        <div className="flex flex-col sm:flex-row justify-between gap-4 mb-8">
          <div>
            <h1 className="text-4xl font-bold text-amber-900 tracking-wide font-playfair mb-2">
              🍷 Magazzino Vini — Cantina Interna
            </h1>
            <p className="text-neutral-600">
              Vista di magazzino con giacenze per locazione. (per ora solo lettura)
            </p>
          </div>

          <div className="flex gap-3 justify-end">
            <button
              type="button"
              onClick={() => navigate("/vini")}
              className="px-4 py-2 rounded-xl text-sm font-medium border border-neutral-300 bg-neutral-50 hover:bg-neutral-100 hover:-translate-y-0.5 shadow-sm transition"
            >
              ← Torna al Menu Vini
            </button>
            <button
              type="button"
              onClick={logout}
              className="px-4 py-2 rounded-xl text-sm font-medium border border-red-300 text-red-700 bg-red-50 hover:bg-red-100 hover:-translate-y-0.5 shadow-sm transition"
            >
              Logout
            </button>
          </div>
        </div>

        {/* FORM FILTRI */}
        <form
          onSubmit={handleSubmit}
          className="bg-neutral-50 border border-neutral-300 rounded-2xl p-6 mb-8 shadow-inner space-y-4"
        >
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">

            {/* 🔢 ID VINO */}
            <div className="flex flex-col">
              <label className="text-xs font-semibold text-neutral-700 mb-1">
                ID Vino
              </label>
              <input
                type="number"
                min="1"
                value={idFilter}
                onChange={(e) => setIdFilter(e.target.value)}
                placeholder="es. 125"
                className="border border-neutral-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-amber-400"
              />
            </div>

            {/* 🔍 RICERCA LIBERA */}
            <div className="flex flex-col md:col-span-2">
              <label className="text-xs font-semibold text-neutral-700 mb-1">
                RICERCA LIBERA
              </label>
              <input
                type="text"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Descrizione, produttore, denominazione..."
                className="border border-neutral-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-amber-400"
              />
            </div>

            {/* TIPOLOGIA */}
            <div className="flex flex-col">
              <label className="text-xs font-semibold text-neutral-700 mb-1">
                TIPOLOGIA
              </label>
              <input
                type="text"
                value={tipologia}
                onChange={(e) => setTipologia(e.target.value)}
                placeholder="es. ROSSI ITALIA"
                className="border border-neutral-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-amber-400"
              />
            </div>

            {/* NAZIONE */}
            <div className="flex flex-col">
              <label className="text-xs font-semibold text-neutral-700 mb-1">
                NAZIONE
              </label>
              <input
                type="text"
                value={nazione}
                onChange={(e) => setNazione(e.target.value)}
                placeholder="es. ITALIA, FRANCIA..."
                className="border border-neutral-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-amber-400"
              />
            </div>
          </div>

          {/* CHECKBOX + BOTTONI */}
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 mt-2">
            <div className="flex flex-wrap items-center gap-4 text-sm text-neutral-800">
              <label className="inline-flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={soloInCarta}
                  onChange={(e) => setSoloInCarta(e.target.checked)}
                  className="rounded border-neutral-400"
                />
                <span>Solo vini in carta (CARTA = SI)</span>
              </label>

              <label className="inline-flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={soloConGiacenza}
                  onChange={(e) => setSoloConGiacenza(e.target.checked)}
                  className="rounded border-neutral-400"
                />
                <span>Solo con giacenza (QTA_TOTALE &gt; 0)</span>
              </label>
            </div>

            <button
              type="submit"
              disabled={loading}
              className={`px-6 py-2 rounded-xl text-sm font-semibold text-white shadow transition ${
                loading ? "bg-gray-400 cursor-not-allowed" : "bg-amber-700 hover:bg-amber-800"
              }`}
            >
              {loading ? "Caricamento…" : "🍷 Applica filtri"}
            </button>
          </div>
        </form>

        {/* LISTA VINI */}
        <div className="bg-white border border-neutral-300 rounded-2xl shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-neutral-200 flex justify-between items-center text-sm text-neutral-700">
            <span className="font-semibold uppercase tracking-wide">
              Lista vini di magazzino
            </span>
            <span className="text-neutral-500">
              {vini.length} risultato{vini.length === 1 ? "" : "i"}
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-neutral-50 border-b border-neutral-200">
                <tr>
                  <th className="px-3 py-2 text-left font-semibold text-neutral-700">ID</th>
                  <th className="px-3 py-2 text-left font-semibold text-neutral-700">TIPOLOGIA</th>
                  <th className="px-3 py-2 text-left font-semibold text-neutral-700">VINO</th>
                  <th className="px-3 py-2 text-left font-semibold text-neutral-700">ANNATA</th>
                  <th className="px-3 py-2 text-left font-semibold text-neutral-700">PRODUTTORE</th>
                  <th className="px-3 py-2 text-left font-semibold text-neutral-700">ORIGINE</th>
                  <th className="px-3 py-2 text-right font-semibold text-neutral-700">QTA TOT.</th>
                  <th className="px-3 py-2 text-center font-semibold text-neutral-700">CARTA</th>
                  <th className="px-3 py-2 text-center font-semibold text-neutral-700">STATO</th>
                </tr>
              </thead>
              <tbody>
                {vini.length === 0 && !loading && (
                  <tr>
                    <td
                      colSpan={9}
                      className="px-4 py-6 text-center text-neutral-500 italic"
                    >
                      Nessun vino trovato con i filtri attuali.
                    </td>
                  </tr>
                )}

                {vini.map((v) => (
                  <tr
                    key={v.id}
                    className="border-b border-neutral-100 hover:bg-neutral-50 cursor-pointer"
                    onClick={() => navigate(`/vini/magazzino/${v.id}`)}
                  >
                    <td className="px-3 py-2 text-neutral-700">{v.id}</td>
                    <td className="px-3 py-2 text-neutral-700">{v.TIPOLOGIA}</td>
                    <td className="px-3 py-2 text-neutral-800">
                      <div className="font-semibold">{v.DESCRIZIONE}</div>
                      {v.DENOMINAZIONE && (
                        <div className="text-xs text-neutral-500">
                          {v.DENOMINAZIONE}
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2 text-neutral-700">{v.ANNATA || "-"}</td>
                    <td className="px-3 py-2 text-neutral-700">{v.PRODUTTORE || "-"}</td>
                    <td className="px-3 py-2 text-neutral-700">{v.NAZIONE || "-"}</td>
                    <td className="px-3 py-2 text-right text-neutral-800 font-semibold">
                      {v.QTA_TOTALE ?? 0}
                    </td>
                    <td className="px-3 py-2 text-center text-neutral-700">
                      {v.CARTA === "SI" ? "✅" : ""}
                    </td>
                    <td className="px-3 py-2 text-center text-neutral-700">
                      {v.STATO_VENDITA || ""}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

      </div>
    </div>
  );
}