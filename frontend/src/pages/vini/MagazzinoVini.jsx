// @version: v1.1-magazzino-filtri
// Pagina Magazzino Vini — Lista + Dettaglio base (read-only) con filtri avanzati

import React, { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { API_BASE } from "../../config/api";

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

  const [giacenzaMode, setGiacenzaMode] = useState("any"); // any | gt | lt | between
  const [giacenzaVal1, setGiacenzaVal1] = useState("");
  const [giacenzaVal2, setGiacenzaVal2] = useState("");

  const [prezzoMode, setPrezzoMode] = useState("any"); // any | gt | lt | between
  const [prezzoVal1, setPrezzoVal1] = useState("");
  const [prezzoVal2, setPrezzoVal2] = useState("");

  const [onlyMissingListino, setOnlyMissingListino] = useState(false);

  // Opzioni per i select
  const [tipologieOptions, setTipologieOptions] = useState([]);
  const [nazioniOptions, setNazioniOptions] = useState([]);
  const [produttoriOptions, setProduttoriOptions] = useState([]);

  const token = localStorage.getItem("token");

  const handleLogout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("role");
    window.location.reload();
  };

  // ------------------------------------------------
  // FETCH DATI MAGAZZINO (una volta + pulsante aggiorna)
  // ------------------------------------------------
  const fetchVini = async () => {
    if (!token) {
      handleLogout();
      return;
    }

    setLoading(true);
    setError("");

    try {
      // Per ora nessun filtro lato backend, facciamo tutto lato frontend
      const url = `${API_BASE}/vini/magazzino`;
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

      if (data.length > 0 && !selectedVino) {
        setSelectedVino(data[0]);
      }

      // Costruisco le liste per i select
      const uniq = (arr) =>
        Array.from(new Set(arr.filter((x) => x && String(x).trim() !== ""))).sort(
          (a, b) => String(a).localeCompare(String(b), "it", { sensitivity: "base" })
        );

      setTipologieOptions(uniq(data.map((v) => v.TIPOLOGIA)));
      setNazioniOptions(uniq(data.map((v) => v.NAZIONE)));
      setProduttoriOptions(uniq(data.map((v) => v.PRODUTTORE)));
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
  // FILTRI lato frontend
  // ------------------------------------------------
  const viniFiltrati = useMemo(() => {
    let out = [...vini];

    // 1) Ricerca per ID
    if (searchId.trim()) {
      const idTrim = searchId.trim();
      const idNum = parseInt(idTrim, 10);

      out = out.filter((v) => {
        // Provo match esatto numerico, altrimenti match stringa
        if (!Number.isNaN(idNum) && v.id != null) {
          if (v.id === idNum) return true;
        }
        if (v.id_excel != null && !Number.isNaN(idNum)) {
          if (v.id_excel === idNum) return true;
        }
        return String(v.id ?? "")
          .toLowerCase()
          .includes(idTrim.toLowerCase());
      });
    }

    // 2) Ricerca libera (descrizione, denominazione, produttore, regione, nazione, codice)
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
        return campi.some(
          (c) => c && String(c).toLowerCase().includes(needle)
        );
      });
    }

    // 3) Tipologia
    if (tipologiaSel) {
      out = out.filter((v) => v.TIPOLOGIA === tipologiaSel);
    }

    // 4) Nazione
    if (nazioneSel) {
      out = out.filter((v) => v.NAZIONE === nazioneSel);
    }

    // 5) Produttore
    if (produttoreSel) {
      out = out.filter((v) => v.PRODUTTORE === produttoreSel);
    }

    // 6) Filtro giacenza (su QTA_TOTALE)
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

        if (giacenzaMode === "gt" && g1 != null) {
          return tot > g1;
        }
        if (giacenzaMode === "lt" && g1 != null) {
          return tot < g1;
        }
        if (giacenzaMode === "between" && g1 != null && g2 != null) {
          return tot >= Math.min(g1, g2) && tot <= Math.max(g1, g2);
        }
        return true;
      });
    }

    // 7) Filtro prezzo listino (EURO_LISTINO)
    const parseFloatSafe = (val) => {
      const n = parseFloat(String(val).replace(",", "."));
      return Number.isNaN(n) ? null : n;
    };

    const p1 = parseFloatSafe(prezzoVal1);
    const p2 = parseFloatSafe(prezzoVal2);

    if (prezzoMode !== "any") {
      out = out.filter((v) => {
        if (v.EURO_LISTINO == null) return false;
        const prezzo = parseFloatSafe(v.EURO_LISTINO);
        if (prezzo == null) return false;

        if (prezzoMode === "gt" && p1 != null) {
          return prezzo > p1;
        }
        if (prezzoMode === "lt" && p1 != null) {
          return prezzo < p1;
        }
        if (prezzoMode === "between" && p1 != null && p2 != null) {
          return prezzo >= Math.min(p1, p2) && prezzo <= Math.max(p1, p2);
        }
        return true;
      });
    }

    // 8) Solo vini senza prezzo listino
    if (onlyMissingListino) {
      out = out.filter(
        (v) => v.EURO_LISTINO == null || v.EURO_LISTINO === ""
      );
    }

    return out;
  }, [
    vini,
    searchId,
    searchText,
    tipologiaSel,
    nazioneSel,
    produttoreSel,
    giacenzaMode,
    giacenzaVal1,
    giacenzaVal2,
    prezzoMode,
    prezzoVal1,
    prezzoVal2,
    onlyMissingListino,
  ]);

  // ------------------------------------------------
  const handleRowClick = (vino) => {
    setSelectedVino(vino);
  };

  // ------------------------------------------------
  // RENDER
  // ------------------------------------------------
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
              Vista di magazzino con filtri avanzati su ID, tipologia, nazione,
              produttore, giacenza e listino.
            </p>
          </div>

          <div className="flex flex-col items-stretch gap-2 sm:flex-row sm:items-center sm:justify-end">
            <button
              type="button"
              onClick={() => navigate("/vini")}
              className="
                px-4 py-2 rounded-xl text-sm font-medium
                border border-neutral-300 bg-neutral-50
                hover:bg-neutral-100 hover:-translate-y-0.5
                shadow-sm transition
              "
            >
              ← Torna al Menu Vini
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
          {/* Riga 1: ID + ricerca libera */}
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

          {/* Riga 2: Tipologia / Nazione / Produttore */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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

          {/* Riga 3: Giacenza + Prezzo + missing listino */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
            {/* Filtro giacenza */}
            <div>
              <label className="block text-xs font-semibold text-neutral-600 mb-1 uppercase tracking-wide">
                Filtro giacenza (Q.TA totale)
              </label>
              <div className="flex gap-2 items-center">
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
            </div>

            {/* Filtro prezzo listino */}
            <div>
              <label className="block text-xs font-semibold text-neutral-600 mb-1 uppercase tracking-wide">
                Filtro prezzo listino (€)
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

            {/* Missing listino + bottone aggiorna */}
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
                            {vino.QTA_TOTALE ??
                              (vino.QTA_FRIGO ?? 0) +
                                (vino.QTA_LOC1 ?? 0) +
                                (vino.QTA_LOC2 ?? 0) +
                                (vino.QTA_LOC3 ?? 0)}
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
                  Vista sintetica; in seguito qui aggiungeremo movimenti e note.
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
                        {selectedVino.id_excel
                          ? ` (Excel: ${selectedVino.id_excel})`
                          : ""}
                      </div>
                      <div className="text-xs font-semibold text-neutral-600 uppercase tracking-wide">
                        Vino
                      </div>
                      <div className="mt-0.5 font-semibold text-neutral-900">
                        {selectedVino.DESCRIZIONE}
                      </div>
                      {selectedVino.DENOMINAZIONE && (
                        <div className="text-xs text-neutral-600">
                          {selectedVino.DENOMINAZIONE}
                        </div>
                      )}
                      <div className="mt-1 text-xs text-neutral-600">
                        {selectedVino.NAZIONE}
                        {selectedVino.REGIONE
                          ? ` / ${selectedVino.REGIONE}`
                          : ""}
                        {selectedVino.ANNATA
                          ? ` — ${selectedVino.ANNATA}`
                          : ""}
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <div className="text-[11px] font-semibold text-neutral-600 uppercase mb-0.5">
                          Produttore
                        </div>
                        <div className="text-sm">
                          {selectedVino.PRODUTTORE || "—"}
                        </div>
                      </div>
                      <div>
                        <div className="text-[11px] font-semibold text-neutral-600 uppercase mb-0.5">
                          Distributore
                        </div>
                        <div className="text-sm">
                          {selectedVino.DISTRIBUTORE || "—"}
                        </div>
                      </div>
                    </div>

                    {/* Giacenze per locazione */}
                    <div>
                      <div className="text-[11px] font-semibold text-neutral-600 uppercase mb-1">
                        Giacenze per locazione
                      </div>
                      <div className="border border-neutral-200 rounded-xl bg-white divide-y divide-neutral-100">
                        <div className="px-3 py-2 flex justify-between text-xs">
                          <span>
                            Frigorifero: {selectedVino.FRIGORIFERO || "—"}
                          </span>
                          <span className="font-semibold">
                            {selectedVino.QTA_FRIGO ?? 0} bt
                          </span>
                        </div>
                        <div className="px-3 py-2 flex justify-between text-xs">
                          <span>
                            Locazione 1: {selectedVino.LOCAZIONE_1 || "—"}
                          </span>
                          <span className="font-semibold">
                            {selectedVino.QTA_LOC1 ?? 0} bt
                          </span>
                        </div>
                        <div className="px-3 py-2 flex justify-between text-xs">
                          <span>
                            Locazione 2: {selectedVino.LOCAZIONE_2 || "—"}
                          </span>
                          <span className="font-semibold">
                            {selectedVino.QTA_LOC2 ?? 0} bt
                          </span>
                        </div>
                        <div className="px-3 py-2 flex justify-between text-xs">
                          <span>
                            Locazione 3: {selectedVino.LOCAZIONE_3 || "—"}
                          </span>
                          <span className="font-semibold">
                            {selectedVino.QTA_LOC3 ?? 0} bt
                          </span>
                        </div>
                        <div className="px-3 py-2 flex justify-between text-xs bg-neutral-50 rounded-b-xl">
                          <span className="font-semibold">Totale magazzino</span>
                          <span className="font-bold text-neutral-900">
                            {selectedVino.QTA_TOTALE ??
                              (selectedVino.QTA_FRIGO ?? 0) +
                                (selectedVino.QTA_LOC1 ?? 0) +
                                (selectedVino.QTA_LOC2 ?? 0) +
                                (selectedVino.QTA_LOC3 ?? 0)}{" "}
                            bt
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Prezzi */}
                    <div className="grid grid-cols-3 gap-3">
                      <div>
                        <div className="text-[11px] font-semibold text-neutral-600 uppercase mb-0.5">
                          Prezzo carta
                        </div>
                        <div className="text-sm">
                          {selectedVino.PREZZO_CARTA != null
                            ? `${Number(
                                selectedVino.PREZZO_CARTA
                              ).toFixed(2)} €`
                            : "—"}
                        </div>
                      </div>
                      <div>
                        <div className="text-[11px] font-semibold text-neutral-600 uppercase mb-0.5">
                          Listino
                        </div>
                        <div className="text-sm">
                          {selectedVino.EURO_LISTINO != null &&
                          selectedVino.EURO_LISTINO !== ""
                            ? `${Number(
                                selectedVino.EURO_LISTINO
                              ).toFixed(2)} €`
                            : "—"}
                        </div>
                      </div>
                      <div>
                        <div className="text-[11px] font-semibold text-neutral-600 uppercase mb-0.5">
                          Sconto
                        </div>
                        <div className="text-sm">
                          {selectedVino.SCONTO != null
                            ? `${Number(selectedVino.SCONTO).toFixed(2)} %`
                            : "—"}
                        </div>
                      </div>
                    </div>

                    {/* Flag carta / iPratico / stato */}
                    <div className="flex flex-wrap gap-2">
                      <span
                        className={
                          "inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-semibold border " +
                          (selectedVino.CARTA === "SI"
                            ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                            : "bg-neutral-50 text-neutral-500 border-neutral-200")
                        }
                      >
                        CARTA: {selectedVino.CARTA || "NO"}
                      </span>
                      <span
                        className={
                          "inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-semibold border " +
                          (selectedVino.IPRATICO === "SI"
                            ? "bg-sky-50 text-sky-700 border-sky-200"
                            : "bg-neutral-50 text-neutral-500 border-neutral-200")
                        }
                      >
                        iPratico: {selectedVino.IPRATICO || "NO"}
                      </span>
                      {selectedVino.STATO_VENDITA && (
                        <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-semibold border bg-amber-50 text-amber-800 border-amber-200">
                          Stato vendita: {selectedVino.STATO_VENDITA}
                        </span>
                      )}
                    </div>

                    {/* Note */}
                    {selectedVino.NOTE && (
                      <div>
                        <div className="text-[11px] font-semibold text-neutral-600 uppercase mb-0.5">
                          Note interne
                        </div>
                        <p className="text-sm text-neutral-800 whitespace-pre-wrap">
                          {selectedVino.NOTE}
                        </p>
                      </div>
                    )}
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