// @version: v1.0-magazzino-ui
// Pagina Magazzino Vini — Lista + Ricerca
// Stile allineato a ViniCarta / ViniDatabase (Vintage Premium)

import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { API_BASE } from "../../config/api";

const MAGAZZINO_URL = `${API_BASE}/vini/magazzino`;

export default function MagazzinoVini() {
  const navigate = useNavigate();

  const [q, setQ] = useState("");
  const [tipologia, setTipologia] = useState("");
  const [nazione, setNazione] = useState("");
  const [produttore, setProduttore] = useState("");
  const [soloInCarta, setSoloInCarta] = useState(false);
  const [minQta, setMinQta] = useState("");

  const [vini, setVini] = useState([]);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  const fetchVini = async () => {
    setLoading(true);
    setErrorMsg("");

    try {
      const params = new URLSearchParams();

      if (q.trim()) params.append("q", q.trim());
      if (tipologia) params.append("tipologia", tipologia);
      if (nazione) params.append("nazione", nazione);
      if (produttore.trim()) params.append("produttore", produttore.trim());
      if (soloInCarta) params.append("solo_in_carta", "true");
      if (minQta !== "" && !Number.isNaN(Number(minQta))) {
        params.append("min_qta", String(minQta));
      }

      const url = `${MAGAZZINO_URL}${params.toString() ? "?" + params.toString() : ""}`;

      // NB: se hai un helper per fetch autenticato, sostituisci qui.
      const token = localStorage.getItem("token");
      const response = await fetch(url, {
        headers: token
          ? { Authorization: `Bearer ${token}` }
          : undefined,
      });

      if (!response.ok) {
        throw new Error(`Errore server: ${response.status}`);
      }

      const data = await response.json();
      setVini(Array.isArray(data) ? data : []);
    } catch (err) {
      setErrorMsg(err.message || "Errore durante il caricamento dei vini.");
    } finally {
      setLoading(false);
    }
  };

  // Primo caricamento
  useEffect(() => {
    fetchVini();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSubmit = (e) => {
    e.preventDefault();
    fetchVini();
  };

  const handleReset = () => {
    setQ("");
    setTipologia("");
    setNazione("");
    setProduttore("");
    setSoloInCarta(false);
    setMinQta("");
    fetchVini();
  };

  return (
    <div className="min-h-screen bg-neutral-100 p-6 font-sans">
      <div className="max-w-6xl mx-auto bg-white shadow-2xl rounded-3xl p-10 border border-neutral-200">

        {/* 🔙 BACK */}
        <div className="flex justify-between items-center mb-6">
          <button
            onClick={() => navigate("/vini")}
            className="px-5 py-2 rounded-xl border border-neutral-300 bg-neutral-50 text-neutral-800 hover:bg-neutral-200 transition shadow-sm"
          >
            ← Torna al Menu Vini
          </button>

          <button
            type="button"
            onClick={() => alert("TODO: aprire form nuovo vino magazzino")}
            className="px-5 py-2 rounded-xl bg-emerald-700 text-white font-semibold shadow hover:bg-emerald-800 transition"
          >
            ➕ Nuovo vino magazzino
          </button>
        </div>

        {/* HEADER */}
        <h1 className="text-4xl tracking-wide font-bold text-center mb-3 text-amber-900 font-playfair">
          🍷 Magazzino — Gestione Vini
        </h1>
        <p className="text-center text-neutral-600 mb-8">
          Vista di magazzino separata dalla Carta da Excel. Filtra, cerca e controlla le giacenze.
        </p>

        {/* FILTRI / RICERCA */}
        <form
          onSubmit={handleSubmit}
          className="bg-neutral-100 border border-neutral-300 rounded-2xl p-5 shadow-inner mb-8"
        >
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4">
            {/* Ricerca libera */}
            <div className="flex flex-col">
              <label className="text-xs font-semibold text-neutral-600 mb-1">
                Ricerca libera
              </label>
              <input
                type="text"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Descrizione, denominazione, produttore…"
                className="border border-neutral-300 rounded-lg px-3 py-2 text-sm bg-white shadow-sm"
              />
            </div>

            {/* Tipologia */}
            <div className="flex flex-col">
              <label className="text-xs font-semibold text-neutral-600 mb-1">
                Tipologia
              </label>
              <input
                type="text"
                value={tipologia}
                onChange={(e) => setTipologia(e.target.value)}
                placeholder="Es. ROSSI ITALIA"
                className="border border-neutral-300 rounded-lg px-3 py-2 text-sm bg-white shadow-sm"
              />
              {/* in futuro: select con lista controllata */}
            </div>

            {/* Nazione */}
            <div className="flex flex-col">
              <label className="text-xs font-semibold text-neutral-600 mb-1">
                Nazione
              </label>
              <input
                type="text"
                value={nazione}
                onChange={(e) => setNazione(e.target.value)}
                placeholder="Es. ITALIA, FRANCIA…"
                className="border border-neutral-300 rounded-lg px-3 py-2 text-sm bg-white shadow-sm"
              />
            </div>

            {/* Produttore */}
            <div className="flex flex-col">
              <label className="text-xs font-semibold text-neutral-600 mb-1">
                Produttore
              </label>
              <input
                type="text"
                value={produttore}
                onChange={(e) => setProduttore(e.target.value)}
                placeholder="Cerca per produttore"
                className="border border-neutral-300 rounded-lg px-3 py-2 text-sm bg-white shadow-sm"
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-4">
            <label className="flex items-center space-x-2 text-sm text-neutral-700">
              <input
                type="checkbox"
                checked={soloInCarta}
                onChange={(e) => setSoloInCarta(e.target.checked)}
                className="rounded border-neutral-400"
              />
              <span>Solo vini in carta</span>
            </label>

            <div className="flex items-center space-x-2 text-sm">
              <span className="text-neutral-700">QTA ≥</span>
              <input
                type="number"
                min="0"
                value={minQta}
                onChange={(e) => setMinQta(e.target.value)}
                className="w-24 border border-neutral-300 rounded-lg px-2 py-1 bg-white shadow-sm"
              />
            </div>

            <div className="flex gap-2 ml-auto">
              <button
                type="button"
                onClick={handleReset}
                className="px-4 py-2 rounded-xl border border-neutral-300 bg-neutral-50 text-neutral-800 hover:bg-neutral-200 text-sm shadow-sm"
              >
                Reset filtri
              </button>
              <button
                type="submit"
                disabled={loading}
                className={`px-5 py-2 rounded-xl text-white text-sm font-semibold shadow transition ${
                  loading ? "bg-gray-400 cursor-not-allowed" : "bg-amber-700 hover:bg-amber-800"
                }`}
              >
                {loading ? "Caricamento…" : "🔎 Cerca"}
              </button>
            </div>
          </div>
        </form>

        {/* ERRORI */}
        {errorMsg && (
          <div className="mb-4 px-4 py-3 rounded-xl bg-red-50 border border-red-200 text-sm text-red-800">
            {errorMsg}
          </div>
        )}

        {/* TABELLA RISULTATI */}
        <div className="bg-neutral-50 border border-neutral-200 rounded-2xl shadow-inner overflow-hidden">
          <div className="px-4 py-2 border-b border-neutral-200 flex justify-between text-xs text-neutral-600">
            <span>
              Risultati: <strong>{vini.length}</strong>
            </span>
          </div>

          <div className="overflow-x-auto max-h-[60vh]">
            <table className="min-w-full text-sm">
              <thead className="bg-neutral-200 text-neutral-800 sticky top-0 z-10">
                <tr>
                  <th className="px-3 py-2 text-left font-semibold">Tipologia</th>
                  <th className="px-3 py-2 text-left font-semibold">Nazione</th>
                  <th className="px-3 py-2 text-left font-semibold">Regione</th>
                  <th className="px-3 py-2 text-left font-semibold">Produttore</th>
                  <th className="px-3 py-2 text-left font-semibold">Descrizione</th>
                  <th className="px-3 py-2 text-right font-semibold">QTA</th>
                  <th className="px-3 py-2 text-right font-semibold">In Carta</th>
                  <th className="px-3 py-2 text-right font-semibold">Azioni</th>
                </tr>
              </thead>
              <tbody>
                {vini.length === 0 && !loading && (
                  <tr>
                    <td colSpan={8} className="px-3 py-6 text-center text-neutral-500">
                      Nessun vino trovato con i filtri correnti.
                    </td>
                  </tr>
                )}

                {vini.map((v) => (
                  <tr
                    key={v.id}
                    className="border-t border-neutral-200 hover:bg-amber-50/40 transition"
                  >
                    <td className="px-3 py-2 align-top">{v.TIPOLOGIA}</td>
                    <td className="px-3 py-2 align-top">{v.NAZIONE}</td>
                    <td className="px-3 py-2 align-top">{v.REGIONE || "-"}</td>
                    <td className="px-3 py-2 align-top">{v.PRODUTTORE || "-"}</td>
                    <td className="px-3 py-2 align-top">
                      <div className="font-semibold text-neutral-900">
                        {v.DESCRIZIONE}
                      </div>
                      {v.DENOMINAZIONE && (
                        <div className="text-xs text-neutral-600">
                          {v.DENOMINAZIONE}
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right align-top">
                      {v.QTA_TOTALE ?? 0}
                    </td>
                    <td className="px-3 py-2 text-right align-top">
                      {v.CARTA === "SI" ? "✅" : "—"}
                    </td>
                    <td className="px-3 py-2 text-right align-top">
                      <button
                        type="button"
                        onClick={() => alert(`TODO: dettaglio vino #${v.id}`)}
                        className="px-3 py-1 rounded-lg border border-neutral-300 bg-white text-xs hover:bg-neutral-100"
                      >
                        Dettaglio
                      </button>
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