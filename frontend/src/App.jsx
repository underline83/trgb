// =========================================================
// FILE: frontend/src/components/vini/MagazzinoSubMenu.jsx
// @version: v1.0-magazzino-submenu
// Sub-menu Magazzino Vini (stile allineato al menu premium)
// =========================================================

import React from "react";
import { useNavigate, useLocation } from "react-router-dom";

export default function MagazzinoSubMenu() {
  const navigate = useNavigate();
  const location = useLocation();

  const isActive = (path) => location.pathname === path;

  const btnBase =
    "px-4 py-2 rounded-xl text-sm font-semibold border shadow-sm transition " +
    "hover:-translate-y-0.5";

  const btnActive =
    "bg-amber-700 text-white border-amber-700 hover:bg-amber-800";

  const btnInactive =
    "bg-neutral-50 text-neutral-800 border-neutral-300 hover:bg-neutral-100";

  const btnDisabled =
    "bg-neutral-50 text-neutral-400 border-neutral-200 cursor-not-allowed";

  return (
    <div className="flex flex-wrap gap-2 items-center justify-between mb-6">
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => navigate("/vini")}
          className={
            "px-4 py-2 rounded-xl text-sm font-medium border border-neutral-300 bg-neutral-50 hover:bg-neutral-100 hover:-translate-y-0.5 shadow-sm transition"
          }
        >
          ← Menu Vini
        </button>

        <button
          type="button"
          onClick={() => navigate("/vini/magazzino")}
          className={
            btnBase + " " + (isActive("/vini/magazzino") ? btnActive : btnInactive)
          }
        >
          🏷️ Lista Magazzino
        </button>

        <button
          type="button"
          onClick={() => navigate("/vini/magazzino/nuovo")}
          className={
            btnBase +
            " " +
            (isActive("/vini/magazzino/nuovo") ? btnActive : btnInactive)
          }
        >
          ➕ Nuovo vino
        </button>

        {/* Placeholder: quando faremo la pagina dedicata */}
        <button type="button" className={btnBase + " " + btnDisabled} disabled>
          📦 Movimenti (in sviluppo)
        </button>

        <button type="button" className={btnBase + " " + btnDisabled} disabled>
          📊 Dashboard (in sviluppo)
        </button>
      </div>
    </div>
  );
}



// =========================================================
// FILE: frontend/src/pages/vini/MagazzinoVini.jsx
// @version: v1.2-magazzino-filtri
// Pagina Magazzino Vini — Lista + Dettaglio base (read-only) con filtri avanzati
// =========================================================

import React, { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { API_BASE } from "../../config/api";
import MagazzinoSubMenu from "../../components/vini/MagazzinoSubMenu";

const uniq = (arr) =>
  Array.from(new Set(arr.filter((x) => x && String(x).trim() !== ""))).sort(
    (a, b) => String(a).localeCompare(String(b), "it", { sensitivity: "base" })
  );

export default function MagazzinoVini() {
  const navigate = useNavigate();

  const [vini, setVini] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [selectedVino, setSelectedVino] = useState(null);

  // ------- FILTRI --------
  const [searchId, setSearchId] = useState("");
  const [searchText, setSearchText] = useState("");

  const [tipologiaSel, setTipologiaSel] = useState("");
  const [nazioneSel, setNazioneSel] = useState("");
  const [produttoreSel, setProduttoreSel] = useState("");
  const [regioneSel, setRegioneSel] = useState("");

  const [giacenzaMode, setGiacenzaMode] = useState("any"); // any | gt | lt | between
  const [giacenzaVal1, setGiacenzaVal1] = useState("");
  const [giacenzaVal2, setGiacenzaVal2] = useState("");
  const [onlyPositiveStock, setOnlyPositiveStock] = useState(false);

  const [prezzoMode, setPrezzoMode] = useState("any"); // any | gt | lt | between
  const [prezzoVal1, setPrezzoVal1] = useState("");
  const [prezzoVal2, setPrezzoVal2] = useState("");

  const [onlyMissingListino, setOnlyMissingListino] = useState(false);

  const token = localStorage.getItem("token");

  const handleLogout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("role");
    window.location.reload();
  };

  // ------------------------------------------------
  // FETCH DATI MAGAZZINO
  // ------------------------------------------------
  const fetchVini = async () => {
    if (!token) {
      handleLogout();
      return;
    }

    setLoading(true);
    setError("");

    try {
      const url = `${API_BASE}/vini/magazzino`;
      const resp = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (resp.status === 401) {
        alert("Sessione scaduta. Effettua di nuovo il login.");
        handleLogout();
        return;
      }
      if (!resp.ok) throw new Error(`Errore server: ${resp.status}`);

      const data = await resp.json();
      setVini(data);

      if (data.length > 0 && !selectedVino) setSelectedVino(data[0]);
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

  // ------------------------------------------------
  // OPZIONI SELECT DINAMICHE (combinazioni)
  // ------------------------------------------------
  const baseForOptions = useMemo(() => {
    let out = [...vini];
    if (nazioneSel) out = out.filter((v) => v.NAZIONE === nazioneSel);
    if (tipologiaSel) out = out.filter((v) => v.TIPOLOGIA === tipologiaSel);
    if (regioneSel) out = out.filter((v) => v.REGIONE === regioneSel);
    if (produttoreSel) out = out.filter((v) => v.PRODUTTORE === produttoreSel);
    return out;
  }, [vini, tipologiaSel, nazioneSel, produttoreSel, regioneSel]);

  const tipologieOptions = useMemo(
    () => uniq(baseForOptions.map((v) => v.TIPOLOGIA)),
    [baseForOptions]
  );
  const nazioniOptions = useMemo(
    () => uniq(baseForOptions.map((v) => v.NAZIONE)),
    [baseForOptions]
  );
  const regioniOptions = useMemo(
    () => uniq(baseForOptions.map((v) => v.REGIONE)),
    [baseForOptions]
  );
  const produttoriOptions = useMemo(
    () => uniq(baseForOptions.map((v) => v.PRODUTTORE)),
    [baseForOptions]
  );

  // ------------------------------------------------
  // FILTRI LISTA
  // ------------------------------------------------
  const viniFiltrati = useMemo(() => {
    let out = [...vini];

    // ID
    if (searchId.trim()) {
      const idTrim = searchId.trim();
      const idNum = parseInt(idTrim, 10);

      out = out.filter((v) => {
        if (!Number.isNaN(idNum) && v.id != null && v.id === idNum) return true;
        return String(v.id ?? "").toLowerCase().includes(idTrim.toLowerCase());
      });
    }

    // Ricerca libera
    if (searchText.trim()) {
      const needle = searchText.trim().toLowerCase();
      out = out.filter((v) => {
        const campi = [
          v.DESCRIZIONE,
          v.DENOMINAZIONE,
          v.PRODUTTORE,
          v.REGIONE,
          v.NAZIONE,
          v.CODICE,
        ];
        return campi.some((c) => c && String(c).toLowerCase().includes(needle));
      });
    }

    // select combinati
    if (tipologiaSel) out = out.filter((v) => v.TIPOLOGIA === tipologiaSel);
    if (nazioneSel) out = out.filter((v) => v.NAZIONE === nazioneSel);
    if (regioneSel) out = out.filter((v) => v.REGIONE === regioneSel);
    if (produttoreSel) out = out.filter((v) => v.PRODUTTORE === produttoreSel);

    // giacenza
    const parseIntSafe = (val) => {
      const n = parseInt(val, 10);
      return Number.isNaN(n) ? null : n;
    };
    const g1 = parseIntSafe(giacenzaVal1);
    const g2 = parseIntSafe(giacenzaVal2);

    if (giacenzaMode !== "any") {
      out = out.filter((v) => {
        const tot =
          (v.QTA_TOTALE ??
            (v.QTA_FRIGO ?? 0) +
              (v.QTA_LOC1 ?? 0) +
              (v.QTA_LOC2 ?? 0) +
              (v.QTA_LOC3 ?? 0)) || 0;

        if (giacenzaMode === "gt" && g1 != null) return tot > g1;
        if (giacenzaMode === "lt" && g1 != null) return tot < g1;
        if (giacenzaMode === "between" && g1 != null && g2 != null) {
          return tot >= Math.min(g1, g2) && tot <= Math.max(g1, g2);
        }
        return true;
      });
    }

    if (onlyPositiveStock) {
      out = out.filter((v) => {
        const tot =
          (v.QTA_TOTALE ??
            (v.QTA_FRIGO ?? 0) +
              (v.QTA_LOC1 ?? 0) +
              (v.QTA_LOC2 ?? 0) +
              (v.QTA_LOC3 ?? 0)) || 0;
        return tot > 0;
      });
    }

    // prezzo vendita = PREZZO_CARTA
    const parseFloatSafe = (val) => {
      const n = parseFloat(String(val).replace(",", "."));
      return Number.isNaN(n) ? null : n;
    };
    const p1 = parseFloatSafe(prezzoVal1);
    const p2 = parseFloatSafe(prezzoVal2);

    if (prezzoMode !== "any") {
      out = out.filter((v) => {
        if (v.PREZZO_CARTA == null || v.PREZZO_CARTA === "") return false;
        const prezzo = parseFloatSafe(v.PREZZO_CARTA);
        if (prezzo == null) return false;

        if (prezzoMode === "gt" && p1 != null) return prezzo > p1;
        if (prezzoMode === "lt" && p1 != null) return prezzo < p1;
        if (prezzoMode === "between" && p1 != null && p2 != null) {
          return prezzo >= Math.min(p1, p2) && prezzo <= Math.max(p1, p2);
        }
        return true;
      });
    }

    if (onlyMissingListino) {
      out = out.filter((v) => v.EURO_LISTINO == null || v.EURO_LISTINO === "");
    }

    return out;
  }, [
    vini,
    searchId,
    searchText,
    tipologiaSel,
    nazioneSel,
    regioneSel,
    produttoreSel,
    giacenzaMode,
    giacenzaVal1,
    giacenzaVal2,
    onlyPositiveStock,
    prezzoMode,
    prezzoVal1,
    prezzoVal2,
    onlyMissingListino,
  ]);

  const handleRowClick = (vino) => setSelectedVino(vino);

  return (
    <div className="min-h-screen bg-neutral-100 p-6 font-sans">
      <div className="max-w-6xl mx-auto bg-white shadow-2xl rounded-3xl p-8 lg:p-10 border border-neutral-200">
        <MagazzinoSubMenu />

        {/* HEADER */}
        <div className="flex flex-col lg:flex-row justify-between gap-4 mb-6">
          <div>
            <h1 className="text-3xl lg:text-4xl font-bold text-amber-900 tracking-wide font-playfair mb-2">
              🍷 Magazzino Vini — Cantina Interna
            </h1>
            <p className="text-neutral-600">
              Vista di magazzino con filtri avanzati su ID, tipologia, nazione,
              regione, produttore, giacenza e prezzi.
            </p>
          </div>

          <div className="flex flex-col items-stretch gap-2 sm:flex-row sm:items-center sm:justify-end">
            <button
              type="button"
              onClick={() => navigate("/vini/magazzino/nuovo")}
              className="
                px-4 py-2 rounded-xl text-sm font-semibold
                bg-amber-700 text-white
                hover:bg-amber-800 hover:-translate-y-0.5
                shadow-sm transition
              "
            >
              ➕ Nuovo vino
            </button>

            <button
              type="button"
              onClick={handleLogout}
              className="
                px-4 py-2 rounded-xl text-sm font-medium
                border border-red-200 bg-red-50 text-red-700
                hover:bg-red-100 hover:-translate-y-0.5
                shadow-sm transition
              "
            >
              Logout
            </button>
          </div>
        </div>

        {/* FILTRI */}
        <div className="bg-neutral-50 border border-neutral-300 rounded-2xl p-4 lg:p-5 shadow-inner mb-6 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-semibold text-neutral-600 mb-1 uppercase tracking-wide">
                Ricerca per ID
              </label>
              <input
                type="text"
                value={searchId}
                onChange={(e) => setSearchId(e.target.value)}
                placeholder="es. 1234"
                className="w-full border border-neutral-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-amber-300"
              />
            </div>
            <div className="md:col-span-2">
              <label className="block text-xs font-semibold text-neutral-600 mb-1 uppercase tracking-wide">
                Ricerca libera
              </label>
              <input
                type="text"
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
                placeholder="Descrizione, denominazione, produttore, regione, nazione, codice…"
                className="w-full border border-neutral-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-amber-300"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <label className="block text-xs font-semibold text-neutral-600 mb-1 uppercase tracking-wide">
                Tipologia
              </label>
              <select
                value={tipologiaSel}
                onChange={(e) => setTipologiaSel(e.target.value)}
                className="w-full border border-neutral-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-amber-300"
              >
                <option value="">Tutte</option>
                {tipologieOptions.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-neutral-600 mb-1 uppercase tracking-wide">
                Nazione
              </label>
              <select
                value={nazioneSel}
                onChange={(e) => setNazioneSel(e.target.value)}
                className="w-full border border-neutral-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-amber-300"
              >
                <option value="">Tutte</option>
                {nazioniOptions.map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-neutral-600 mb-1 uppercase tracking-wide">
                Regione
              </label>
              <select
                value={regioneSel}
                onChange={(e) => setRegioneSel(e.target.value)}
                className="w-full border border-neutral-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-amber-300"
              >
                <option value="">Tutte</option>
                {regioniOptions.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-neutral-600 mb-1 uppercase tracking-wide">
                Produttore
              </label>
              <select
                value={produttoreSel}
                onChange={(e) => setProduttoreSel(e.target.value)}
                className="w-full border border-neutral-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-amber-300"
              >
                <option value="">Tutti</option>
                {produttoriOptions.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
            <div>
              <label className="block text-xs font-semibold text-neutral-600 mb-1 uppercase tracking-wide">
                Filtro giacenza (Q.TA totale)
              </label>
              <div className="flex gap-2 items-center mb-2">
                <select
                  value={giacenzaMode}
                  onChange={(e) => setGiacenzaMode(e.target.value)}
                  className="border border-neutral-300 rounded-lg px-2 py-2 text-xs bg-white"
                >
                  <option value="any">Tutte</option>
                  <option value="gt">&gt;</option>
                  <option value="lt">&lt;</option>
                  <option value="between">tra</option>
                </select>
                <input
                  type="number"
                  value={giacenzaVal1}
                  onChange={(e) => setGiacenzaVal1(e.target.value)}
                  className="w-20 border border-neutral-300 rounded-lg px-2 py-2 text-xs bg-white"
                  placeholder="da"
                />
                {giacenzaMode === "between" && (
                  <input
                    type="number"
                    value={giacenzaVal2}
                    onChange={(e) => setGiacenzaVal2(e.target.value)}
                    className="w-20 border border-neutral-300 rounded-lg px-2 py-2 text-xs bg-white"
                    placeholder="a"
                  />
                )}
              </div>
              <label className="inline-flex items-center gap-2 text-xs text-neutral-700">
                <input
                  type="checkbox"
                  checked={onlyPositiveStock}
                  onChange={(e) => setOnlyPositiveStock(e.target.checked)}
                  className="rounded border-neutral-400"
                />
                <span>Solo vini con giacenza positiva</span>
              </label>
            </div>

            <div>
              <label className="block text-xs font-semibold text-neutral-600 mb-1 uppercase tracking-wide">
                Filtro prezzo vendita (carta) €
              </label>
              <div className="flex gap-2 items-center">
                <select
                  value={prezzoMode}
                  onChange={(e) => setPrezzoMode(e.target.value)}
                  className="border border-neutral-300 rounded-lg px-2 py-2 text-xs bg-white"
                >
                  <option value="any">Tutti</option>
                  <option value="gt">&gt;</option>
                  <option value="lt">&lt;</option>
                  <option value="between">tra</option>
                </select>
                <input
                  type="number"
                  step="0.01"
                  value={prezzoVal1}
                  onChange={(e) => setPrezzoVal1(e.target.value)}
                  className="w-24 border border-neutral-300 rounded-lg px-2 py-2 text-xs bg-white"
                  placeholder="da"
                />
                {prezzoMode === "between" && (
                  <input
                    type="number"
                    step="0.01"
                    value={prezzoVal2}
                    onChange={(e) => setPrezzoVal2(e.target.value)}
                    className="w-24 border border-neutral-300 rounded-lg px-2 py-2 text-xs bg-white"
                    placeholder="a"
                  />
                )}
              </div>
            </div>

            <div className="flex flex-col gap-2 items-start md:items-end">
              <label className="inline-flex items-center gap-2 text-sm text-neutral-700">
                <input
                  type="checkbox"
                  checked={onlyMissingListino}
                  onChange={(e) => setOnlyMissingListino(e.target.checked)}
                  className="rounded border-neutral-400"
                />
                <span>Solo vini senza prezzo listino</span>
              </label>

              <button
                type="button"
                onClick={fetchVini}
                disabled={loading}
                className={`
                  px-5 py-2 rounded-xl text-sm font-semibold
                  shadow transition
                  ${
                    loading
                      ? "bg-gray-400 text-white cursor-not-allowed"
                      : "bg-amber-700 text-white hover:bg-amber-800"
                  }
                `}
              >
                {loading ? "Ricarico dati…" : "⟳ Ricarica dal server"}
              </button>
            </div>
          </div>

          {error && (
            <p className="mt-1 text-sm text-red-600 font-medium">{error}</p>
          )}
        </div>

        {/* LAYOUT LISTA + DETTAGLIO */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* LISTA */}
          <div className="lg:col-span-2">
            <div className="border border-neutral-200 rounded-2xl overflow-hidden shadow-sm bg-neutral-50">
              <div className="px-4 py-3 border-b border-neutral-200 bg-neutral-100 flex items-center justify-between">
                <h2 className="text-sm font-semibold text-neutral-800 tracking-wide uppercase">
                  Lista vini di magazzino
                </h2>
                <span className="text-xs text-neutral-500">
                  {viniFiltrati.length} risultati su {vini.length} totali
                </span>
              </div>

              <div className="max-h-[480px] overflow-auto">
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
                    {viniFiltrati.map((vino) => {
                      const isSelected =
                        selectedVino && selectedVino.id === vino.id;
                      const tot =
                        vino.QTA_TOTALE ??
                        (vino.QTA_FRIGO ?? 0) +
                          (vino.QTA_LOC1 ?? 0) +
                          (vino.QTA_LOC2 ?? 0) +
                          (vino.QTA_LOC3 ?? 0);

                      return (
                        <tr
                          key={vino.id}
                          className={
                            "cursor-pointer border-b border-neutral-200 hover:bg-amber-50 transition " +
                            (isSelected ? "bg-amber-50/80" : "bg-white")
                          }
                          onClick={() => handleRowClick(vino)}
                        >
                          <td className="px-3 py-2 align-top text-xs text-neutral-500 whitespace-nowrap font-mono">
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
                                Cod:{" "}
                                <span className="font-mono">{vino.CODICE}</span>
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
                            {tot}
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
                              <span className="text-[11px] text-neutral-400">
                                —
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}

                    {viniFiltrati.length === 0 && !loading && (
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

          {/* DETTAGLIO */}
          <div>
            <div className="border border-neutral-200 rounded-2xl bg-neutral-50 shadow-sm h-full flex flex-col">
              <div className="px-4 py-3 border-b border-neutral-200 bg-neutral-100">
                <h2 className="text-sm font-semibold text-neutral-800 tracking-wide uppercase">
                  Dettaglio vino
                </h2>
                <p className="text-xs text-neutral-500 mt-1">
                  Vista sintetica; movimenti e note stanno nella pagina dettaglio.
                </p>
              </div>

              <div className="p-4 text-sm text-neutral-800 flex-1 overflow-auto">
                {!selectedVino && (
                  <p className="text-neutral-500">
                    Seleziona un vino dall&apos;elenco per vedere il dettaglio.
                  </p>
                )}

                {selectedVino && (
                  <div className="space-y-3">
                    <div>
                      <div className="text-[11px] text-neutral-500 font-mono mb-1">
                        ID: {selectedVino.id}
                      </div>
                      <div className="text-xs font-semibold text-neutral-600 uppercase tracking-wide">
                        Vino
                      </div>
                      <div className="mt-0.5 font-semibold text-neutral-900">
                        {selectedVino.DESCRIZIONE}
                      </div>
                      <div className="mt-1 text-xs text-neutral-600">
                        {selectedVino.NAZIONE}
                        {selectedVino.REGIONE ? ` / ${selectedVino.REGIONE}` : ""}
                        {selectedVino.ANNATA ? ` — ${selectedVino.ANNATA}` : ""}
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => navigate(`/vini/magazzino/${selectedVino.id}`)}
                      className="
                        w-full px-4 py-2 rounded-xl text-sm font-semibold
                        bg-amber-700 text-white hover:bg-amber-800
                        shadow-sm transition
                      "
                    >
                      🔎 Apri dettaglio completo (movimenti)
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}



// =========================================================
// FILE: frontend/src/pages/vini/MagazzinoViniDettaglio.jsx
// @version: v1.1-magazzino-vini-dettaglio-movimenti
// Dettaglio singolo vino + Movimenti (CARICO/SCARICO/VENDITA/RETTIFICA)
// =========================================================

import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { API_BASE } from "../../config/api";
import MagazzinoSubMenu from "../../components/vini/MagazzinoSubMenu";

export default function MagazzinoViniDettaglio() {
  const navigate = useNavigate();
  const { id } = useParams();

  const token = localStorage.getItem("token");

  const [vino, setVino] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [movimenti, setMovimenti] = useState([]);
  const [loadingMov, setLoadingMov] = useState(false);
  const [errorMov, setErrorMov] = useState("");

  const [submitMov, setSubmitMov] = useState(false);
  const [movOk, setMovOk] = useState("");
  const [movErr, setMovErr] = useState("");

  const [movForm, setMovForm] = useState({
    tipo: "CARICO",
    qta: 1,
    locazione: "",
    note: "",
    origine: "GESTIONALE",
  });

  const handleLogout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("role");
    window.location.reload();
  };

  const vinoIdNum = useMemo(() => {
    const n = Number(id);
    return Number.isInteger(n) && n > 0 ? n : null;
  }, [id]);

  const fetchVino = async () => {
    if (!token) {
      handleLogout();
      return;
    }
    if (!vinoIdNum) {
      setError("ID vino non valido.");
      setLoading(false);
      return;
    }

    setLoading(true);
    setError("");

    try {
      const resp = await fetch(`${API_BASE}/vini/magazzino/${vinoIdNum}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (resp.status === 401) {
        alert("Sessione scaduta. Effettua di nuovo il login.");
        handleLogout();
        return;
      }
      if (resp.status === 404) throw new Error("Vino non trovato.");
      if (!resp.ok) throw new Error(`Errore server: ${resp.status}`);

      const data = await resp.json();
      setVino(data);
    } catch (e) {
      setError(e.message || "Errore di caricamento.");
    } finally {
      setLoading(false);
    }
  };

  const fetchMovimenti = async () => {
    if (!token) return;
    if (!vinoIdNum) return;

    setLoadingMov(true);
    setErrorMov("");

    try {
      const resp = await fetch(`${API_BASE}/vini/magazzino/${vinoIdNum}/movimenti?limit=100`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (resp.status === 401) {
        alert("Sessione scaduta. Effettua di nuovo il login.");
        handleLogout();
        return;
      }
      if (!resp.ok) throw new Error(`Errore movimenti: ${resp.status}`);

      const data = await resp.json();
      setMovimenti(Array.isArray(data) ? data : []);
    } catch (e) {
      setErrorMov(e.message || "Errore caricamento movimenti.");
    } finally {
      setLoadingMov(false);
    }
  };

  useEffect(() => {
    fetchVino();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vinoIdNum]);

  useEffect(() => {
    // carico movimenti dopo il vino
    if (vinoIdNum) fetchMovimenti();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vinoIdNum]);

  const handleMovChange = (field) => (e) => {
    const value = field === "qta" ? Number(e.target.value) : e.target.value;
    setMovForm((prev) => ({ ...prev, [field]: value }));
  };

  const submitMovimento = async (e) => {
    e.preventDefault();
    setMovOk("");
    setMovErr("");

    if (!token) {
      handleLogout();
      return;
    }
    if (!vinoIdNum) {
      setMovErr("ID vino non valido.");
      return;
    }
    if (!movForm.qta || movForm.qta <= 0) {
      setMovErr("Quantità non valida.");
      return;
    }

    setSubmitMov(true);
    try {
      const resp = await fetch(`${API_BASE}/vini/magazzino/${vinoIdNum}/movimenti`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          tipo: movForm.tipo,
          qta: movForm.qta,
          locazione: movForm.locazione?.trim() || null,
          note: movForm.note?.trim() || null,
          origine: movForm.origine || "GESTIONALE",
        }),
      });

      if (resp.status === 401) {
        alert("Sessione scaduta. Effettua di nuovo il login.");
        handleLogout();
        return;
      }

      const data = await resp.json().catch(() => ({}));

      if (!resp.ok) {
        const detail =
          data && data.detail
            ? Array.isArray(data.detail)
              ? data.detail.map((d) => d.msg || JSON.stringify(d)).join(" | ")
              : String(data.detail)
            : `Errore server: ${resp.status}`;
        throw new Error(detail);
      }

      // router ritorna { vino, movimenti }
      if (data.vino) setVino(data.vino);
      if (Array.isArray(data.movimenti)) setMovimenti(data.movimenti);

      setMovOk("Movimento registrato.");
      setMovForm((prev) => ({ ...prev, note: "", qta: 1 }));
    } catch (e2) {
      setMovErr(e2.message || "Errore durante registrazione movimento.");
    } finally {
      setSubmitMov(false);
    }
  };

  const goBack = () => navigate("/vini/magazzino");

  return (
    <div className="min-h-screen bg-neutral-100 p-6 font-sans">
      <div className="max-w-5xl mx-auto bg-white shadow-2xl rounded-3xl p-8 lg:p-10 border border-neutral-200">
        <MagazzinoSubMenu />

        {/* HEADER */}
        <div className="flex flex-col lg:flex-row justify-between gap-4 mb-6">
          <div>
            <h1 className="text-3xl lg:text-4xl font-bold text-amber-900 tracking-wide font-playfair mb-2">
              🍷 Dettaglio Vino Magazzino
            </h1>
            <p className="text-neutral-600">Scheda + movimenti cantina.</p>
          </div>

          <div className="flex flex-col items-stretch gap-2 sm:flex-row sm:items-center sm:justify-end">
            <button
              type="button"
              onClick={goBack}
              className="px-4 py-2 rounded-xl text-sm font-medium border border-neutral-300 bg-neutral-50 hover:bg-neutral-100 hover:-translate-y-0.5 shadow-sm transition"
            >
              ← Torna alla lista
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

        {loading && <p className="text-sm text-neutral-600">Caricamento dettaglio…</p>}
        {error && !loading && <p className="text-sm text-red-600 font-medium">{error}</p>}

        {!loading && !error && vino && (
          <div className="space-y-6">
            {/* INFO */}
            <section className="border border-neutral-200 rounded-2xl p-4 bg-neutral-50">
              <div className="text-[11px] text-neutral-500 font-mono mb-2">ID: {vino.id}</div>

              <div className="text-xs font-semibold text-neutral-600 uppercase tracking-wide">Vino</div>
              <div className="mt-0.5 font-semibold text-neutral-900">{vino.DESCRIZIONE}</div>

              <div className="mt-1 text-xs text-neutral-600">
                {vino.NAZIONE}
                {vino.REGIONE ? ` / ${vino.REGIONE}` : ""}
                {vino.ANNATA ? ` — ${vino.ANNATA}` : ""}
              </div>

              <div className="mt-3 grid grid-cols-2 gap-3">
                <div>
                  <div className="text-[11px] font-semibold text-neutral-600 uppercase mb-0.5">Produttore</div>
                  <div className="text-sm">{vino.PRODUTTORE || "—"}</div>
                </div>
                <div>
                  <div className="text-[11px] font-semibold text-neutral-600 uppercase mb-0.5">Distributore</div>
                  <div className="text-sm">{vino.DISTRIBUTORE || "—"}</div>
                </div>
              </div>

              {/* GIACENZE */}
              <div className="mt-4">
                <div className="text-[11px] font-semibold text-neutral-600 uppercase mb-1">
                  Giacenze per locazione
                </div>
                <div className="border border-neutral-200 rounded-xl bg-white divide-y divide-neutral-100">
                  <div className="px-3 py-2 flex justify-between text-xs">
                    <span>Frigorifero: {vino.FRIGORIFERO || "—"}</span>
                    <span className="font-semibold">{vino.QTA_FRIGO ?? 0} bt</span>
                  </div>
                  <div className="px-3 py-2 flex justify-between text-xs">
                    <span>Locazione 1: {vino.LOCAZIONE_1 || "—"}</span>
                    <span className="font-semibold">{vino.QTA_LOC1 ?? 0} bt</span>
                  </div>
                  <div className="px-3 py-2 flex justify-between text-xs">
                    <span>Locazione 2: {vino.LOCAZIONE_2 || "—"}</span>
                    <span className="font-semibold">{vino.QTA_LOC2 ?? 0} bt</span>
                  </div>
                  <div className="px-3 py-2 flex justify-between text-xs">
                    <span>Locazione 3: {vino.LOCAZIONE_3 || "—"}</span>
                    <span className="font-semibold">{vino.QTA_LOC3 ?? 0} bt</span>
                  </div>
                  <div className="px-3 py-2 flex justify-between text-xs bg-neutral-50 rounded-b-xl">
                    <span className="font-semibold">Totale magazzino</span>
                    <span className="font-bold text-neutral-900">{vino.QTA_TOTALE ?? 0} bt</span>
                  </div>
                </div>
              </div>
            </section>

            {/* MOVIMENTI */}
            <section className="border border-neutral-200 rounded-2xl p-4 bg-neutral-50">
              <div className="flex items-center justify-between gap-3 mb-3">
                <h2 className="text-sm font-semibold text-neutral-800 uppercase tracking-wide">
                  Movimenti cantina
                </h2>
                <button
                  type="button"
                  onClick={fetchMovimenti}
                  className="px-4 py-2 rounded-xl text-sm font-semibold bg-amber-700 text-white hover:bg-amber-800 shadow-sm transition"
                  disabled={loadingMov}
                >
                  {loadingMov ? "Ricarico…" : "⟳ Ricarica movimenti"}
                </button>
              </div>

              {errorMov && <div className="mb-3 text-sm text-red-700">{errorMov}</div>}
              {movOk && <div className="mb-3 text-sm text-emerald-700">{movOk}</div>}
              {movErr && <div className="mb-3 text-sm text-red-700">{movErr}</div>}

              {/* FORM MOVIMENTO */}
              <form onSubmit={submitMovimento} className="grid grid-cols-1 md:grid-cols-4 gap-3 mb-4">
                <div>
                  <label className="block text-xs font-semibold text-neutral-600 mb-1 uppercase tracking-wide">
                    Tipo
                  </label>
                  <select
                    value={movForm.tipo}
                    onChange={handleMovChange("tipo")}
                    className="w-full border border-neutral-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-amber-300"
                  >
                    <option value="CARICO">CARICO</option>
                    <option value="SCARICO">SCARICO</option>
                    <option value="VENDITA">VENDITA</option>
                    <option value="RETTIFICA">RETTIFICA</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-neutral-600 mb-1 uppercase tracking-wide">
                    Quantità
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={movForm.qta}
                    onChange={handleMovChange("qta")}
                    className="w-full border border-neutral-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-amber-300"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-neutral-600 mb-1 uppercase tracking-wide">
                    Locazione (opz.)
                  </label>
                  <input
                    type="text"
                    value={movForm.locazione}
                    onChange={handleMovChange("locazione")}
                    placeholder="Frigo / Loc1 / ecc."
                    className="w-full border border-neutral-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-amber-300"
                  />
                </div>

                <div className="flex items-end">
                  <button
                    type="submit"
                    disabled={submitMov}
                    className={`w-full px-4 py-2 rounded-xl text-sm font-semibold shadow transition ${
                      submitMov ? "bg-gray-400 text-white cursor-not-allowed" : "bg-amber-700 text-white hover:bg-amber-800"
                    }`}
                  >
                    {submitMov ? "Salvo…" : "➕ Registra"}
                  </button>
                </div>

                <div className="md:col-span-4">
                  <label className="block text-xs font-semibold text-neutral-600 mb-1 uppercase tracking-wide">
                    Note (opz.)
                  </label>
                  <input
                    type="text"
                    value={movForm.note}
                    onChange={handleMovChange("note")}
                    placeholder="es. Vendita al calice / Rottura / Inventario…"
                    className="w-full border border-neutral-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-amber-300"
                  />
                </div>
              </form>

              {/* LISTA MOVIMENTI */}
              <div className="border border-neutral-200 rounded-xl bg-white overflow-hidden">
                <div className="px-3 py-2 bg-neutral-100 border-b border-neutral-200 text-xs font-semibold text-neutral-600 uppercase tracking-wide">
                  Ultimi movimenti
                </div>

                <div className="max-h-[320px] overflow-auto">
                  {loadingMov && (
                    <div className="px-3 py-3 text-sm text-neutral-600">
                      Caricamento movimenti…
                    </div>
                  )}

                  {!loadingMov && movimenti.length === 0 && (
                    <div className="px-3 py-3 text-sm text-neutral-500">
                      Nessun movimento registrato.
                    </div>
                  )}

                  {!loadingMov && movimenti.length > 0 && (
                    <table className="w-full text-sm">
                      <thead className="bg-neutral-50 sticky top-0">
                        <tr className="text-xs text-neutral-600 uppercase tracking-wide">
                          <th className="px-3 py-2 text-left">Data</th>
                          <th className="px-3 py-2 text-left">Tipo</th>
                          <th className="px-3 py-2 text-center">Qta</th>
                          <th className="px-3 py-2 text-left">Locazione</th>
                          <th className="px-3 py-2 text-left">Note</th>
                          <th className="px-3 py-2 text-left">Utente</th>
                        </tr>
                      </thead>
                      <tbody>
                        {movimenti.map((m) => (
                          <tr key={m.id} className="border-t border-neutral-100">
                            <td className="px-3 py-2 text-xs text-neutral-600 whitespace-nowrap">
                              {m.data_mov || "—"}
                            </td>
                            <td className="px-3 py-2 font-semibold">{m.tipo}</td>
                            <td className="px-3 py-2 text-center font-semibold">
                              {m.qta}
                            </td>
                            <td className="px-3 py-2 text-xs">{m.locazione || "—"}</td>
                            <td className="px-3 py-2 text-xs">{m.note || "—"}</td>
                            <td className="px-3 py-2 text-xs">{m.utente || "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>
            </section>
          </div>
        )}
      </div>
    </div>
  );
}



// =========================================================
// FILE: frontend/src/pages/vini/MagazzinoViniNuovo.jsx
// @version: v1.1-magazzino-nuovo-no-idexcel-formati
// Nuovo vino: tolto ID EXCEL, FORMATO come select descrittiva
// =========================================================

import React, { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { API_BASE } from "../../config/api";
import MagazzinoSubMenu from "../../components/vini/MagazzinoSubMenu";

const FORMAT_OPTIONS = [
  { value: "BT", label: "BT — Bottiglia 0,75 L" },
  { value: "MG", label: "MG — Magnum 1,5 L" },
  { value: "DM", label: "DM — Double Magnum 3,0 L" },
  { value: "JR", label: "JR — Jeroboam 3,0 L" },
  { value: "IG", label: "IG — Imperiale 6,0 L" },
];

export default function MagazzinoViniNuovo() {
  const navigate = useNavigate();

  const [loadingOptions, setLoadingOptions] = useState(false);
  const [optionsError, setOptionsError] = useState("");

  const [tipologie, setTipologie] = useState([]);
  const [nazioni, setNazioni] = useState([]);
  const [regioni, setRegioni] = useState([]);
  const [produttori, setProduttori] = useState([]);

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [submitSuccess, setSubmitSuccess] = useState("");

  const token = localStorage.getItem("token");

  const handleLogout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("role");
    window.location.reload();
  };

  useEffect(() => {
    if (!token) {
      handleLogout();
      return;
    }

    const fetchOptions = async () => {
      setLoadingOptions(true);
      setOptionsError("");

      try {
        const resp = await fetch(`${API_BASE}/vini/magazzino`, {
          headers: { Authorization: `Bearer ${token}` },
        });

        if (resp.status === 401) {
          alert("Sessione scaduta. Effettua nuovamente il login.");
          handleLogout();
          return;
        }
        if (!resp.ok) throw new Error(`Errore server: ${resp.status}`);

        const data = await resp.json();

        const uniq = (arr) =>
          Array.from(
            new Set(
              arr
                .filter((x) => x != null)
                .map((x) => String(x).trim())
                .filter((x) => x !== "")
            )
          ).sort((a, b) => a.localeCompare(b, "it", { sensitivity: "base" }));

        setTipologie(uniq(data.map((v) => v.TIPOLOGIA)));
        setNazioni(uniq(data.map((v) => v.NAZIONE)));
        setRegioni(uniq(data.map((v) => v.REGIONE)));
        setProduttori(uniq(data.map((v) => v.PRODUTTORE)));
      } catch (err) {
        setOptionsError(err.message || "Errore nel caricamento suggerimenti.");
      } finally {
        setLoadingOptions(false);
      }
    };

    fetchOptions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [form, setForm] = useState({
    TIPOLOGIA: "",
    NAZIONE: "ITALIA",
    REGIONE: "",
    CODICE: "",
    DESCRIZIONE: "",
    DENOMINAZIONE: "",
    ANNATA: "",
    VITIGNI: "",
    GRADO_ALCOLICO: "",
    FORMATO: "BT",
    PRODUTTORE: "",
    DISTRIBUTORE: "",

    PREZZO_CARTA: "",
    EURO_LISTINO: "",
    SCONTO: "",
    NOTE_PREZZO: "",

    CARTA: "SI",
    IPRATICO: "NO",

    STATO_VENDITA: "",
    NOTE_STATO: "",

    FRIGORIFERO: "",
    QTA_FRIGO: "",
    LOCAZIONE_1: "",
    QTA_LOC1: "",
    LOCAZIONE_2: "",
    QTA_LOC2: "",
    LOCAZIONE_3: "",
    QTA_LOC3: "",

    NOTE: "",
  });

  const handleChange = (field) => (e) => {
    const value = e.target.value;
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleCheckboxSiNo = (field) => (e) => {
    const checked = e.target.checked;
    setForm((prev) => ({ ...prev, [field]: checked ? "SI" : "NO" }));
  };

  const numberOrNull = (val) => {
    if (val === "" || val === null || val === undefined) return null;
    const n = Number(String(val).replace(",", "."));
    return Number.isNaN(n) ? null : n;
  };

  const intOrZero = (val) => {
    if (val === "" || val === null || val === undefined) return 0;
    const n = parseInt(val, 10);
    return Number.isNaN(n) ? 0 : n;
  };

  const nullIfEmpty = (val) => {
    if (val === "" || val === null || val === undefined) return null;
    const s = String(val).trim();
    return s === "" ? null : s;
  };

  // Suggerimenti “formato”
  const formatoLabel = useMemo(() => {
    const f = FORMAT_OPTIONS.find((x) => x.value === form.FORMATO);
    return f ? f.label : form.FORMATO;
  }, [form.FORMATO]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitError("");
    setSubmitSuccess("");

    if (!token) {
      handleLogout();
      return;
    }

    if (!form.DESCRIZIONE.trim()) return setSubmitError("La descrizione del vino è obbligatoria.");
    if (!form.TIPOLOGIA.trim()) return setSubmitError("La tipologia è obbligatoria.");
    if (!form.NAZIONE.trim()) return setSubmitError("La nazione è obbligatoria.");

    const haLocazione =
      (form.FRIGORIFERO && form.FRIGORIFERO.trim() !== "") ||
      (form.LOCAZIONE_1 && form.LOCAZIONE_1.trim() !== "") ||
      (form.LOCAZIONE_2 && form.LOCAZIONE_2.trim() !== "") ||
      (form.LOCAZIONE_3 && form.LOCAZIONE_3.trim() !== "");

    if (!haLocazione) {
      setSubmitError("Devi indicare almeno una locazione (frigorifero o locazione 1/2/3).");
      return;
    }

    const payload = {
      TIPOLOGIA: form.TIPOLOGIA.trim(),
      NAZIONE: form.NAZIONE.trim() || "ITALIA",
      REGIONE: nullIfEmpty(form.REGIONE),
      CODICE: nullIfEmpty(form.CODICE),

      DESCRIZIONE: form.DESCRIZIONE.trim(),
      DENOMINAZIONE: nullIfEmpty(form.DENOMINAZIONE),
      ANNATA: nullIfEmpty(form.ANNATA),
      VITIGNI: nullIfEmpty(form.VITIGNI),
      GRADO_ALCOLICO: numberOrNull(form.GRADO_ALCOLICO),
      FORMATO: form.FORMATO?.trim() || "BT",

      PRODUTTORE: nullIfEmpty(form.PRODUTTORE),
      DISTRIBUTORE: nullIfEmpty(form.DISTRIBUTORE),

      PREZZO_CARTA: numberOrNull(form.PREZZO_CARTA),
      EURO_LISTINO: numberOrNull(form.EURO_LISTINO),
      SCONTO: numberOrNull(form.SCONTO),
      NOTE_PREZZO: nullIfEmpty(form.NOTE_PREZZO),

      CARTA: form.CARTA === "SI" ? "SI" : "NO",
      IPRATICO: form.IPRATICO === "SI" ? "SI" : "NO",

      STATO_VENDITA: nullIfEmpty(form.STATO_VENDITA),
      NOTE_STATO: nullIfEmpty(form.NOTE_STATO),

      FRIGORIFERO: nullIfEmpty(form.FRIGORIFERO),
      QTA_FRIGO: intOrZero(form.QTA_FRIGO),

      LOCAZIONE_1: nullIfEmpty(form.LOCAZIONE_1),
      QTA_LOC1: intOrZero(form.QTA_LOC1),

      LOCAZIONE_2: nullIfEmpty(form.LOCAZIONE_2),
      QTA_LOC2: intOrZero(form.QTA_LOC2),

      LOCAZIONE_3: nullIfEmpty(form.LOCAZIONE_3),
      QTA_LOC3: intOrZero(form.QTA_LOC3),

      NOTE: nullIfEmpty(form.NOTE),
    };

    setSubmitting(true);
    try {
      const resp = await fetch(`${API_BASE}/vini/magazzino`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });

      if (resp.status === 401) {
        alert("Sessione scaduta. Effettua nuovamente il login.");
        handleLogout();
        return;
      }

      const data = await resp.json().catch(() => ({}));

      if (!resp.ok) {
        const detail =
          data && data.detail
            ? Array.isArray(data.detail)
              ? data.detail.map((d) => d.msg || JSON.stringify(d)).join(" | ")
              : String(data.detail)
            : `Errore server: ${resp.status}`;
        throw new Error(detail);
      }

      setSubmitSuccess(`Vino creato (formato: ${formatoLabel}).`);
      if (data.id) navigate(`/vini/magazzino/${data.id}`);
      else navigate("/vini/magazzino");
    } catch (err) {
      setSubmitError(err.message || "Errore durante il salvataggio.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-neutral-100 p-6 font-sans">
      <div className="max-w-5xl mx-auto bg-white shadow-2xl rounded-3xl p-8 lg:p-10 border border-neutral-200">
        <MagazzinoSubMenu />

        <div className="flex flex-col lg:flex-row justify-between gap-4 mb-6">
          <div>
            <h1 className="text-3xl lg:text-4xl font-bold text-amber-900 tracking-wide font-playfair mb-2">
              ➕ Nuovo vino — Magazzino
            </h1>
            <p className="text-neutral-600 text-sm">
              Campi obbligatori: <strong>Tipologia</strong>, <strong>Nazione</strong>,{" "}
              <strong>Descrizione</strong> e almeno una <strong>locazione</strong>.
            </p>
          </div>
        </div>

        {optionsError && (
          <div className="mb-4 text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl px-4 py-2">
            {optionsError}
          </div>
        )}
        {submitError && (
          <div className="mb-4 text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl px-4 py-2">
            {submitError}
          </div>
        )}
        {submitSuccess && (
          <div className="mb-4 text-sm text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-2">
            {submitSuccess}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* ANAGRAFICA */}
          <section className="border border-neutral-200 rounded-2xl p-4 lg:p-5 bg-neutral-50">
            <h2 className="text-sm font-semibold text-neutral-800 mb-3 uppercase tracking-wide">
              Anagrafica vino
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-semibold text-neutral-600 mb-1 uppercase tracking-wide">
                  Tipologia *
                </label>
                <input
                  list="tipologie-list"
                  value={form.TIPOLOGIA}
                  onChange={handleChange("TIPOLOGIA")}
                  className="w-full border border-neutral-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-amber-300"
                  placeholder="es. ROSSI ITALIA"
                />
                <datalist id="tipologie-list">
                  {tipologie.map((t) => (
                    <option key={t} value={t} />
                  ))}
                </datalist>
              </div>

              <div>
                <label className="block text-xs font-semibold text-neutral-600 mb-1 uppercase tracking-wide">
                  Nazione *
                </label>
                <input
                  list="nazioni-list"
                  value={form.NAZIONE}
                  onChange={handleChange("NAZIONE")}
                  className="w-full border border-neutral-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-amber-300"
                  placeholder="ITALIA, FRANCIA…"
                />
                <datalist id="nazioni-list">
                  {nazioni.map((n) => (
                    <option key={n} value={n} />
                  ))}
                </datalist>
              </div>

              <div>
                <label className="block text-xs font-semibold text-neutral-600 mb-1 uppercase tracking-wide">
                  Regione
                </label>
                <input
                  list="regioni-list"
                  value={form.REGIONE}
                  onChange={handleChange("REGIONE")}
                  className="w-full border border-neutral-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-amber-300"
                  placeholder="es. PIEMONTE"
                />
                <datalist id="regioni-list">
                  {regioni.map((r) => (
                    <option key={r} value={r} />
                  ))}
                </datalist>
              </div>
            </div>

            <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="md:col-span-2">
                <label className="block text-xs font-semibold text-neutral-600 mb-1 uppercase tracking-wide">
                  Descrizione vino *
                </label>
                <input
                  type="text"
                  value={form.DESCRIZIONE}
                  onChange={handleChange("DESCRIZIONE")}
                  className="w-full border border-neutral-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-amber-300"
                  placeholder="Testo completo come appare sulla carta"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-neutral-600 mb-1 uppercase tracking-wide">
                  Formato
                </label>
                <select
                  value={form.FORMATO}
                  onChange={handleChange("FORMATO")}
                  className="w-full border border-neutral-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-amber-300"
                >
                  {FORMAT_OPTIONS.map((f) => (
                    <option key={f.value} value={f.value}>
                      {f.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-semibold text-neutral-600 mb-1 uppercase tracking-wide">
                  Produttore
                </label>
                <input
                  list="produttori-list"
                  value={form.PRODUTTORE}
                  onChange={handleChange("PRODUTTORE")}
                  className="w-full border border-neutral-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-amber-300"
                  placeholder="es. Gaja"
                />
                <datalist id="produttori-list">
                  {produttori.map((p) => (
                    <option key={p} value={p} />
                  ))}
                </datalist>
              </div>

              <div>
                <label className="block text-xs font-semibold text-neutral-600 mb-1 uppercase tracking-wide">
                  Distributore
                </label>
                <input
                  type="text"
                  value={form.DISTRIBUTORE}
                  onChange={handleChange("DISTRIBUTORE")}
                  className="w-full border border-neutral-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-amber-300"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-neutral-600 mb-1 uppercase tracking-wide">
                  Codice interno
                </label>
                <input
                  type="text"
                  value={form.CODICE}
                  onChange={handleChange("CODICE")}
                  className="w-full border border-neutral-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-amber-300"
                  placeholder="Codice gestionale / iPratico"
                />
              </div>
            </div>

            <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="flex items-center gap-4">
                <label className="inline-flex items-center gap-2 text-sm text-neutral-700">
                  <input
                    type="checkbox"
                    checked={form.CARTA === "SI"}
                    onChange={handleCheckboxSiNo("CARTA")}
                    className="rounded border-neutral-400"
                  />
                  <span>In carta</span>
                </label>
                <label className="inline-flex items-center gap-2 text-sm text-neutral-700">
                  <input
                    type="checkbox"
                    checked={form.IPRATICO === "SI"}
                    onChange={handleCheckboxSiNo("IPRATICO")}
                    className="rounded border-neutral-400"
                  />
                  <span>Presente su iPratico</span>
                </label>
              </div>
            </div>
          </section>

          {/* MAGAZZINO */}
          <section className="border border-neutral-200 rounded-2xl p-4 lg:p-5 bg-neutral-50">
            <h2 className="text-sm font-semibold text-neutral-800 mb-3 uppercase tracking-wide">
              Magazzino — locazioni e giacenze iniziali
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="border border-neutral-200 rounded-xl bg-white p-3 space-y-2">
                <div className="text-[11px] font-semibold text-neutral-600 uppercase">
                  Frigorifero
                </div>
                <input
                  type="text"
                  value={form.FRIGORIFERO}
                  onChange={handleChange("FRIGORIFERO")}
                  className="w-full border border-neutral-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-amber-300"
                />
                <input
                  type="number"
                  value={form.QTA_FRIGO}
                  onChange={handleChange("QTA_FRIGO")}
                  className="w-24 border border-neutral-300 rounded-lg px-3 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-amber-300"
                  placeholder="0"
                />
              </div>

              <div className="border border-neutral-200 rounded-xl bg-white p-3 space-y-2">
                <div className="text-[11px] font-semibold text-neutral-600 uppercase">
                  Locazione 1
                </div>
                <input
                  type="text"
                  value={form.LOCAZIONE_1}
                  onChange={handleChange("LOCAZIONE_1")}
                  className="w-full border border-neutral-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-amber-300"
                />
                <input
                  type="number"
                  value={form.QTA_LOC1}
                  onChange={handleChange("QTA_LOC1")}
                  className="w-24 border border-neutral-300 rounded-lg px-3 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-amber-300"
                  placeholder="0"
                />
              </div>
            </div>
          </section>

          {/* FOOTER */}
          <div className="flex justify-end gap-3">
            <button
              type="button"
              onClick={() => navigate("/vini/magazzino")}
              className="px-4 py-2 rounded-xl text-sm font-medium border border-neutral-300 bg-neutral-50 hover:bg-neutral-100 shadow-sm transition"
            >
              Annulla
            </button>
            <button
              type="submit"
              disabled={submitting}
              className={`px-5 py-2 rounded-xl text-sm font-semibold shadow transition ${
                submitting
                  ? "bg-gray-400 text-white cursor-not-allowed"
                  : "bg-amber-700 text-white hover:bg-amber-800"
              }`}
            >
              {submitting ? "Salvataggio…" : "💾 Salva nuovo vino"}
            </button>
          </div>

          <div className="text-xs text-neutral-500">
            {loadingOptions
              ? "Caricamento suggerimenti…"
              : "Suggerimenti caricati da vini_magazzino (tipologie, nazioni, regioni, produttori)."}
          </div>
        </form>
      </div>
    </div>
  );
}



// =========================================================
// FILE: frontend/src/App.jsx
// @version: v3.4-premium-magazzino-stabile-no-missing-import
// App principale — Routing TRGB Gestionale Web
// (tolti import/route non esistenti per evitare errori Vite)
// =========================================================

import React, { useState } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";

import Login from "./pages/Login";
import Home from "./pages/Home";

// --- GESTIONE VINI ---
import ViniMenu from "./pages/vini/ViniMenu";
import ViniCarta from "./pages/vini/ViniCarta";
import ViniDatabase from "./pages/vini/ViniDatabase";
import ViniVendite from "./pages/vini/ViniVendite";
import ViniImpostazioni from "./pages/vini/ViniImpostazioni";

// --- MAGAZZINO VINI ---
import MagazzinoVini from "./pages/vini/MagazzinoVini";
import MagazzinoViniDettaglio from "./pages/vini/MagazzinoViniDettaglio";
import MagazzinoViniNuovo from "./pages/vini/MagazzinoViniNuovo";

// --- GESTIONE RICETTE ---
import RicetteMenu from "./pages/ricette/RicetteMenu";
import RicetteNuova from "./pages/ricette/RicetteNuova";
import RicetteArchivio from "./pages/ricette/RicetteArchivio";
import RicetteImport from "./pages/ricette/RicetteImport";
import RicetteIngredienti from "./pages/ricette/RicetteIngredienti";
import RicetteIngredientiPrezzi from "./pages/ricette/RicetteIngredientiPrezzi";

// --- AREA AMMINISTRAZIONE ---
import AdminMenu from "./pages/admin/AdminMenu";
import CorrispettiviMenu from "./pages/admin/CorrispettiviMenu";
import CorrispettiviImport from "./pages/admin/CorrispettiviImport";
import CorrispettiviGestione from "./pages/admin/CorrispettiviGestione";
import CorrispettiviDashboard from "./pages/admin/CorrispettiviDashboard";

import FattureMenu from "./pages/admin/FattureMenu";
import FattureImport from "./pages/admin/FattureImport";
import FattureDashboard from "./pages/admin/FattureDashboard";

import DipendentiMenu from "./pages/admin/DipendentiMenu";
import DipendentiAnagrafica from "./pages/admin/DipendentiAnagrafica";
import DipendentiTurni from "./pages/admin/DipendentiTurni";
import DipendentiCosti from "./pages/admin/DipendentiCosti";

export default function App() {
  const [token, setToken] = useState(localStorage.getItem("token"));
  const [role, setRole] = useState(localStorage.getItem("role"));

  if (!token) {
    return <Login setToken={setToken} setRole={setRole} />;
  }

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />

        {/* --- VINI --- */}
        <Route path="/vini" element={<ViniMenu />} />
        <Route path="/vini/carta" element={<ViniCarta />} />
        <Route path="/vini/database" element={<ViniDatabase />} />
        <Route path="/vini/vendite" element={<ViniVendite />} />
        <Route path="/vini/settings" element={<ViniImpostazioni />} />

        {/* --- MAGAZZINO VINI --- */}
        <Route path="/vini/magazzino" element={<MagazzinoVini />} />
        <Route path="/vini/magazzino/nuovo" element={<MagazzinoViniNuovo />} />
        <Route path="/vini/magazzino/:id" element={<MagazzinoViniDettaglio />} />

        {/* --- RICETTE --- */}
        <Route path="/ricette" element={<RicetteMenu />} />
        <Route path="/ricette/nuova" element={<RicetteNuova />} />
        <Route path="/ricette/archivio" element={<RicetteArchivio />} />
        <Route path="/ricette/import" element={<RicetteImport />} />
        <Route path="/ricette/ingredienti" element={<RicetteIngredienti />} />
        <Route path="/ricette/ingredienti/:id/prezzi" element={<RicetteIngredientiPrezzi />} />

        {/* --- ADMIN --- */}
        <Route path="/admin" element={<AdminMenu />} />
        <Route path="/admin/corrispettivi" element={<CorrispettiviMenu />} />
        <Route path="/admin/corrispettivi/import" element={<CorrispettiviImport />} />
        <Route path="/admin/corrispettivi/gestione" element={<CorrispettiviGestione />} />
        <Route path="/admin/corrispettivi/dashboard" element={<CorrispettiviDashboard />} />

        <Route path="/admin/fatture" element={<FattureMenu />} />
        <Route path="/admin/fatture/import" element={<FattureImport />} />
        <Route path="/admin/fatture/dashboard" element={<FattureDashboard />} />

        <Route path="/admin/dipendenti" element={<DipendentiMenu />} />
        <Route path="/admin/dipendenti/anagrafica" element={<DipendentiAnagrafica />} />
        <Route path="/admin/dipendenti/turni" element={<DipendentiTurni />} />
        <Route path="/admin/dipendenti/costi" element={<DipendentiCosti />} />

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}