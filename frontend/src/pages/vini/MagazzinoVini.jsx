// @version: v1.3-magazzino-frontend
// Lista Magazzino Vini — Vintage Premium + filtro ID + prezzi carta/listino

import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { API_BASE } from "../../config/api";
import ViniMagazzinoDettaglio from "./ViniMagazzinoDettaglio";

const API_URL = `${API_BASE}/vini/magazzino`;

export default function MagazzinoVini() {
  const navigate = useNavigate();

  const [vini, setVini] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // filtri
  const [searchText, setSearchText] = useState("");
  const [filterId, setFilterId] = useState(""); // ID MAGAZZINO
  const [tipologia, setTipologia] = useState("");
  const [nazione, setNazione] = useState("");
  const [produttore, setProduttore] = useState("");
  const [soloInCarta, setSoloInCarta] = useState(false);
  const [minQta, setMinQta] = useState(1);

  const [selectedVino, setSelectedVino] = useState(null);

  const token = localStorage.getItem("token");

  const fetchVini = async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();

      if (searchText.trim()) params.append("q", searchText.trim());
      if (filterId.trim()) params.append("id", filterId.trim()); // backend: filtro per id magazzino
      if (tipologia) params.append("tipologia", tipologia);
      if (nazione) params.append("nazione", nazione);
      if (produttore.trim()) params.append("produttore", produttore.trim());
      if (soloInCarta) params.append("solo_in_carta", "true");
      if (minQta !== "" && !Number.isNaN(Number(minQta))) {
        params.append("min_qta", String(minQta));
      }

      const resp = await fetch(`${API_URL}/?${params.toString()}`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!resp.ok) {
        throw new Error(`Errore ${resp.status}`);
      }

      const data = await resp.json();
      setVini(data);
    } catch (err) {
      console.error(err);
      setError(err.message || "Errore nel caricamento vini.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchVini();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSubmit = (e) => {
    e.preventDefault();
    fetchVini();
  };

  const handleReset = () => {
    setSearchText("");
    setFilterId("");
    setTipologia("");
    setNazione("");
    setProduttore("");
    setSoloInCarta(false);
    setMinQta(1);
    fetchVini();
  };

  return (
    <div className="min-h-screen bg-neutral-100 p-6 font-sans">
      <div className="max-w-6xl mx-auto bg-white shadow-2xl rounded-3xl p-8 border border-neutral-200">
        {/* HEADER + BACK */}
        <div className="flex flex-col sm:flex-row justify-between gap-4 mb-6">
          <div>
            <h1 className="text-3xl sm:text-4xl font-bold text-amber-900 tracking-wide font-playfair mb-2">
              📦 Magazzino Vini — Osteria Tre Gobbi
            </h1>
            <p className="text-neutral-600">
              Ricerca per ID, testo, produttore, tipologia… e vedi subito
              giacenze, prezzi in carta e a listino.
            </p>
          </div>

          <div className="flex justify-center sm:justify-end">
            <button
              type="button"
              onClick={() => navigate("/vini")}
              className="px-4 py-2 rounded-xl text-sm font-medium border border-neutral-300 bg-neutral-50 hover:bg-neutral-100 hover:-translate-y-0.5 shadow-sm transition"
            >
              ← Torna al Menu Vini
            </button>
          </div>
        </div>

        {/* FILTRI */}
        <form
          onSubmit={handleSubmit}
          className="bg-neutral-50 border border-neutral-300 rounded-2xl p-4 mb-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4"
        >
          {/* ID MAGAZZINO */}
          <div>
            <label className="block text-xs font-semibold text-neutral-600 mb-1">
              ID Magazzino
            </label>
            <input
              type="number"
              value={filterId}
              onChange={(e) => setFilterId(e.target.value)}
              className="w-full border border-neutral-300 rounded-lg px-3 py-2 text-sm"
              placeholder="es. 8302"
            />
          </div>

          {/* RICERCA TESTO */}
          <div>
            <label className="block text-xs font-semibold text-neutral-600 mb-1">
              Ricerca libera
            </label>
            <input
              type="text"
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              className="w-full border border-neutral-300 rounded-lg px-3 py-2 text-sm"
              placeholder="descrizione, denominazione, produttore…"
            />
          </div>

          {/* PRODUTTORE */}
          <div>
            <label className="block text-xs font-semibold text-neutral-600 mb-1">
              Produttore
            </label>
            <input
              type="text"
              value={produttore}
              onChange={(e) => setProduttore(e.target.value)}
              className="w-full border border-neutral-300 rounded-lg px-3 py-2 text-sm"
              placeholder="Filtra per produttore"
            />
          </div>

          {/* MIN QTA */}
          <div>
            <label className="block text-xs font-semibold text-neutral-600 mb-1">
              Quantità minima
            </label>
            <input
              type="number"
              value={minQta}
              onChange={(e) => setMinQta(e.target.value)}
              className="w-full border border-neutral-300 rounded-lg px-3 py-2 text-sm"
              min="0"
            />
          </div>

          {/* SOLO IN CARTA */}
          <div className="flex items-center space-x-2 sm:col-span-2">
            <input
              id="soloCarta"
              type="checkbox"
              checked={soloInCarta}
              onChange={(e) => setSoloInCarta(e.target.checked)}
              className="h-4 w-4"
            />
            <label htmlFor="soloCarta" className="text-sm text-neutral-700">
              Mostra solo vini in carta
            </label>
          </div>

          {/* BOTTONI */}
          <div className="flex flex-wrap gap-2 sm:col-span-2 lg:col-span-4 justify-end">
            <button
              type="button"
              onClick={handleReset}
              className="px-4 py-2 rounded-lg border border-neutral-300 text-sm text-neutral-700 bg-white hover:bg-neutral-100 transition"
            >
              Reset filtri
            </button>
            <button
              type="submit"
              disabled={loading}
              className={`px-5 py-2 rounded-lg text-sm font-semibold text-white shadow ${
                loading
                  ? "bg-gray-400 cursor-not-allowed"
                  : "bg-amber-700 hover:bg-amber-800"
              } transition`}
            >
              {loading ? "Caricamento…" : "🔍 Cerca"}
            </button>
          </div>
        </form>

        {/* ERRORI */}
        {error && (
          <div className="mb-4 text-red-700 bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm">
            Errore: {error}
          </div>
        )}

        {/* LISTA VINI */}
        <div className="space-y-3 max-h-[60vh] overflow-auto pr-1">
          {vini.length === 0 && !loading && (
            <div className="text-center text-neutral-500 text-sm py-8">
              Nessun vino trovato con i filtri correnti.
            </div>
          )}

          {vini.map((vino) => {
            const prezzoCarta =
              vino.PREZZO_CARTA !== null && vino.PREZZO_CARTA !== undefined
                ? Number(vino.PREZZO_CARTA)
                : null;
            const prezzoListino =
              vino.EURO_LISTINO !== null && vino.EURO_LISTINO !== undefined
                ? Number(vino.EURO_LISTINO)
                : null;

            return (
              <button
                key={vino.id}
                type="button"
                onClick={() => setSelectedVino(vino)}
                className="w-full text-left bg-white border border-neutral-200 rounded-2xl px-4 py-3 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition flex flex-col sm:flex-row sm:items-center gap-2"
              >
                <div className="flex-1">
                  <div className="flex flex-wrap items-baseline gap-2">
                    <span className="text-xs font-mono text-neutral-500">
                      #{vino.id}
                    </span>
                    <span className="font-semibold text-sm sm:text-base text-amber-900">
                      {vino.DESCRIZIONE}
                    </span>
                    {vino.ANNATA && (
                      <span className="text-xs text-neutral-600">
                        ({vino.ANNATA})
                      </span>
                    )}
                  </div>

                  <div className="text-xs text-neutral-600 mt-1 flex flex-wrap gap-2">
                    <span>{vino.TIPOLOGIA}</span>
                    {vino.REGIONE && <span>· {vino.REGIONE}</span>}
                    {vino.NAZIONE && <span>· {vino.NAZIONE}</span>}
                    {vino.FORMATO && <span>· {vino.FORMATO}</span>}
                    {vino.PRODUTTORE && (
                      <span className="font-medium">· {vino.PRODUTTORE}</span>
                    )}
                  </div>

                  <div className="text-xs text-neutral-700 mt-1">
                    Carta:{" "}
                    {prezzoCarta !== null && !Number.isNaN(prezzoCarta)
                      ? `€ ${prezzoCarta.toFixed(2)}`
                      : "-"}
                    {"  ·  "}
                    Listino:{" "}
                    {prezzoListino !== null && !Number.isNaN(prezzoListino)
                      ? `€ ${prezzoListino.toFixed(2)}`
                      : "-"}
                  </div>
                </div>

                <div className="flex flex-col items-end text-right text-xs text-neutral-700 min-w-[90px]">
                  <span className="font-semibold">
                    Totale: {vino.QTA_TOTALE ?? 0} pz
                  </span>
                  <span className="text-[11px] text-neutral-500">
                    Frigo: {vino.QTA_FRIGO ?? 0} · Loc1: {vino.QTA_LOC1 ?? 0} ·
                    Loc2: {vino.QTA_LOC2 ?? 0}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* PANNELLO DETTAGLIO */}
      {selectedVino && (
        <ViniMagazzinoDettaglio
          vino={selectedVino}
          onClose={() => setSelectedVino(null)}
          onUpdated={fetchVini}
        />
      )}
    </div>
  );
}