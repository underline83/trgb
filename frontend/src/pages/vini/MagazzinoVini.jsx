// @version: v1.2-magazzino
// Pagina Magazzino Vini — Lista (read-only)

import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { API_BASE } from "../../config/api";

export default function MagazzinoVini() {
  const navigate = useNavigate();
  const [vini, setVini] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Filtri
  const [searchText, setSearchText] = useState("");
  const [searchId, setSearchId] = useState("");      // 🔎 filtro ID
  const [tipologia, setTipologia] = useState("");
  const [nazione, setNazione] = useState("");
  const [soloInCarta, setSoloInCarta] = useState(false);
  const [soloConGiacenza, setSoloConGiacenza] = useState(true);

  const token = localStorage.getItem("token");

  const handleLogout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("role");
    window.location.reload();
  };

  const fetchVini = async () => {
    if (!token) {
      handleLogout();
      return;
    }

    setLoading(true);
    setError("");

    try {
      const params = new URLSearchParams();

      if (searchText.trim()) params.append("q", searchText.trim());
      if (tipologia.trim()) params.append("tipologia", tipologia.trim());
      if (nazione.trim()) params.append("nazione", nazione.trim());
      if (soloInCarta) params.append("solo_in_carta", "true");
      if (soloConGiacenza) params.append("min_qta", "1");

      const url = `${API_BASE}/vini/magazzino?${params.toString()}`;
      const resp = await fetch(url, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (resp.status === 401) {
        alert("Sessione scaduta. Effettua di nuovo il login.");
        handleLogout();
        return;
      }

      if (!resp.ok) {
        throw new Error(`Errore server: ${resp.status}`);
      }

      const data = await resp.json();
      setVini(data);
    } catch (err) {
      setError(err.message || "Errore di caricamento.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchVini();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Filtro extra per ID lato frontend
  const filteredVini = vini.filter((v) => {
    if (searchId.trim() && !String(v.id).includes(searchId.trim())) {
      return false;
    }
    return true;
  });

  const handleRowClick = (vino) => {
    navigate(`/vini/magazzino/${vino.id}`, { state: { vino } });
  };

  return (
    <div className="min-h-screen bg-neutral-100 p-6 font-sans">
      <div className="max-w-6xl mx-auto bg-white shadow-2xl rounded-3xl p-8 lg:p-10 border border-neutral-200">

        {/* HEADER */}
        <div className="flex flex-col lg:flex-row justify-between gap-4 mb-6">
          <div>
            <h1 className="text-3xl lg:text-4xl font-bold text-amber-900 tracking-wide font-playfair mb-2">
              🍷 Magazzino Vini — Cantina Interna
            </h1>
            <p className="text-neutral-600">
              Vista di magazzino con giacenze per locazione.
            </p>
          </div>

          <div className="flex flex-col items-stretch gap-2 sm:flex-row sm:items-center sm:justify-end">
            <button
              type="button"
              onClick={() => navigate("/vini")}
              className="px-4 py-2 rounded-xl text-sm font-medium border border-neutral-300 bg-neutral-50 hover:bg-neutral-100 hover:-translate-y-0.5 shadow-sm transition"
            >
              ← Torna al Menu Vini
            </button>
            <button
              type="button"
              onClick={handleLogout}
              className="px-4 py-2 rounded-xl text-sm font-medium border border-red-200 bg-red-50 text-red-700 hover:bg-red-100 hover:-translate-y-0.5 shadow-sm transition"
            >
              Logout
            </button>
          </div>
        </div>

        {/* FILTRI */}
        <div className="bg-neutral-50 border border-neutral-300 rounded-2xl p-4 lg:p-5 shadow-inner mb-6">
          <div className="grid grid-cols-1 md:grid-cols-5 gap-4 items-end">
            {/* Ricerca libera */}
            <div className="md:col-span-2">
              <label className="block text-xs font-semibold text-neutral-600 mb-1 uppercase tracking-wide">
                Ricerca libera
              </label>
              <input
                type="text"
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
                placeholder="Descrizione, produttore, denominazione…"
                className="w-full border border-neutral-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-amber-300"
              />
            </div>

            {/* Ricerca per ID */}
            <div>
              <label className="block text-xs font-semibold text-neutral-600 mb-1 uppercase tracking-wide">
                ID Vino
              </label>
              <input
                type="text"
                value={searchId}
                onChange={(e) => setSearchId(e.target.value)}
                placeholder="es. 1234"
                className="w-full border border-neutral-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-amber-300"
              />
            </div>

            {/* Tipologia */}
            <div>
              <label className="block text-xs font-semibold text-neutral-600 mb-1 uppercase tracking-wide">
                Tipologia
              </label>
              <input
                type="text"
                value={tipologia}
                onChange={(e) => setTipologia(e.target.value)}
                placeholder="es. ROSSI ITALIA"
                className="w-full border border-neutral-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-amber-300"
              />
            </div>

            {/* Nazione */}
            <div>
              <label className="block text-xs font-semibold text-neutral-600 mb-1 uppercase tracking-wide">
                Nazione
              </label>
              <input
                type="text"
                value={nazione}
                onChange={(e) => setNazione(e.target.value)}
                placeholder="es. ITALIA, FRANCIA…"
                className="w-full border border-neutral-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-amber-300"
              />
            </div>
          </div>

          {/* Flag */}
          <div className="mt-4 flex flex-wrap gap-4 items-center justify-between">
            <div className="flex flex-wrap gap-4">
              <label className="inline-flex items-center gap-2 text-sm text-neutral-700">
                <input
                  type="checkbox"
                  checked={soloInCarta}
                  onChange={(e) => setSoloInCarta(e.target.checked)}
                  className="rounded border-neutral-400"
                />
                <span>Solo vini in carta (CARTA = SI)</span>
              </label>

              <label className="inline-flex items-center gap-2 text-sm text-neutral-700">
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
              type="button"
              onClick={fetchVini}
              disabled={loading}
              className={`mt-3 sm:mt-0 px-5 py-2 rounded-xl text-sm font-semibold shadow transition ${
                loading
                  ? "bg-gray-400 text-white cursor-not-allowed"
                  : "bg-amber-700 text-white hover:bg-amber-800"
              }`}
            >
              {loading ? "Caricamento…" : "🔎 Applica filtri"}
            </button>
          </div>

          {error && (
            <p className="mt-3 text-sm text-red-600 font-medium">
              {error}
            </p>
          )}
        </div>

        {/* LISTA */}
        <div className="border border-neutral-200 rounded-2xl overflow-hidden shadow-sm bg-neutral-50">
          <div className="px-4 py-3 border-b border-neutral-200 bg-neutral-100 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-neutral-800 tracking-wide uppercase">
              Lista vini di magazzino
            </h2>
            <span className="text-xs text-neutral-500">
              {filteredVini.length} risultati
            </span>
          </div>

          <div className="max-h-[520px] overflow-auto">
            <table className="w-full text-sm">
              <thead className="bg-neutral-100 sticky top-0 z-10">
                <tr className="text-xs text-neutral-600 uppercase tracking-wide">
                  <th className="px-3 py-2 text-left">ID</th>
                  <th className="px-3 py-2 text-left">Tipologia</th>
                  <th className="px-3 py-2 text-left">Vino</th>
                  <th className="px-3 py-2 text-left">Annata</th>
                  <th className="px-3 py-2 text-left">Produttore</th>
                  <th className="px-3 py-2 text-left">Origine</th>
                  <th className="px-3 py-2 text-center">Qta Tot.</th>
                  <th className="px-3 py-2 text-center">Carta</th>
                  <th className="px-3 py-2 text-center">Stato</th>
                </tr>
              </thead>
              <tbody>
                {filteredVini.map((vino) => (
                  <tr
                    key={vino.id}
                    className="cursor-pointer border-b border-neutral-200 hover:bg-amber-50 transition bg-white"
                    onClick={() => handleRowClick(vino)}
                  >
                    <td className="px-3 py-2 align-top text-xs font-mono text-neutral-600">
                      {vino.id}
                    </td>
                    <td className="px-3 py-2 align-top whitespace-nowrap text-xs text-neutral-700">
                      {vino.TIPOLOGIA}
                    </td>
                    <td className="px-3 py-2 align-top">
                      <div className="font-semibold text-neutral-900">
                        {vino.DESCRIZIONE}
                      </div>
                      {vino.DENOMINAZIONE && (
                        <div className="text-xs text-neutral-600">
                          {vino.DENOMINAZIONE}
                        </div>
                      )}
                      {vino.CODICE && (
                        <div className="text-[11px] text-neutral-500 mt-0.5">
                          Cod: <span className="font-mono">{vino.CODICE}</span>
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2 align-top text-sm text-neutral-800 whitespace-nowrap">
                      {vino.ANNATA || "-"}
                    </td>
                    <td className="px-3 py-2 align-top text-sm text-neutral-800">
                      {vino.PRODUTTORE || "-"}
                    </td>
                    <td className="px-3 py-2 align-top text-xs text-neutral-700">
                      {vino.NAZIONE}
                      {vino.REGIONE ? ` / ${vino.REGIONE}` : ""}
                    </td>
                    <td className="px-3 py-2 align-top text-center text-sm font-semibold text-neutral-900">
                      {vino.QTA_TOTALE ?? 0}
                    </td>
                    <td className="px-3 py-2 align-top text-center">
                      <span
                        className={
                          "inline-flex items-center px-2 py-1 rounded-full text-[11px] font-semibold " +
                          (vino.CARTA === "SI"
                            ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                            : "bg-neutral-50 text-neutral-500 border border-neutral-200")
                        }
                      >
                        {vino.CARTA === "SI" ? "In carta" : "No"}
                      </span>
                    </td>
                    <td className="px-3 py-2 align-top text-center">
                      {vino.STATO_VENDITA ? (
                        <span className="inline-flex items-center px-2 py-1 rounded-full text-[11px] font-semibold bg-amber-50 text-amber-800 border border-amber-200">
                          {vino.STATO_VENDITA}
                        </span>
                      ) : (
                        <span className="text-[11px] text-neutral-400">—</span>
                      )}
                    </td>
                  </tr>
                ))}

                {filteredVini.length === 0 && !loading && (
                  <tr>
                    <td
                      colSpan={9}
                      className="px-4 py-6 text-center text-sm text-neutral-500"
                    >
                      Nessun vino trovato con i filtri attuali.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {loading && (
            <div className="px-4 py-3 text-sm text-neutral-600 bg-neutral-50 border-t border-neutral-200">
              Caricamento dati magazzino…
            </div>
          )}
        </div>
      </div>
    </div>
  );
}