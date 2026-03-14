// src/pages/vini/MagazzinoVini.jsx
// @version: v2.0-reforming-cantina
// Pagina Cantina — Lista Vini + Dettaglio base (read-only) con filtri avanzati

import React, { useState, useEffect, useMemo, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { API_BASE, apiFetch } from "../../config/api";
import ViniNav from "./ViniNav";

const uniq = (arr) =>
  Array.from(new Set(arr.filter((x) => x && String(x).trim() !== ""))).sort(
    (a, b) => String(a).localeCompare(String(b), "it", { sensitivity: "base" })
  );

// ── Pannello filtri stampa inventario ─────────────────────
function StampaFiltrata({ onClose }) {
  const [options, setOptions] = useState(null);
  const [locOpts, setLocOpts] = useState([]);
  const [f, setF] = useState({
    tipologia: "", nazione: "", regione: "", produttore: "",
    annata: "", formato: "", carta: "", stato_vendita: "",
    stato_riordino: "", discontinuato: "", solo_giacenza: false,
    qta_min: "", qta_max: "", prezzo_min: "", prezzo_max: "", text: "",
    locazione: "",
  });

  useEffect(() => {
    apiFetch(`${API_BASE}/vini/cantina-tools/inventario/filtri-options`)
      .then(r => r.json()).then(setOptions).catch(() => {});
    apiFetch(`${API_BASE}/vini/cantina-tools/locazioni-config`)
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data) {
          const all = [
            ...(data.opzioni_frigo || []).map(v => ({ label: `Frigo: ${v}`, value: `frigo:${v}` })),
            ...(data.opzioni_locazione_1 || []).map(v => ({ label: `Loc 1: ${v}`, value: `loc1:${v}` })),
            ...(data.opzioni_locazione_2 || []).map(v => ({ label: `Loc 2: ${v}`, value: `loc2:${v}` })),
          ];
          setLocOpts(all);
        }
      })
      .catch(() => {});
  }, []);

  const set = (k) => (e) => setF(prev => ({
    ...prev, [k]: e.target.type === "checkbox" ? e.target.checked : e.target.value
  }));

  const activeCount = Object.entries(f).filter(([k, v]) =>
    v !== "" && v !== false
  ).length;

  const genera = () => {
    const token = localStorage.getItem("token");
    const p = new URLSearchParams();
    p.set("token", token);
    Object.entries(f).forEach(([k, v]) => {
      if (v !== "" && v !== false) p.set(k, String(v));
    });
    window.open(`${API_BASE}/vini/cantina-tools/inventario/filtrato/pdf?${p}`, "_blank");
  };

  const pulisci = () => setF({
    tipologia: "", nazione: "", regione: "", produttore: "",
    annata: "", formato: "", carta: "", stato_vendita: "",
    stato_riordino: "", discontinuato: "", solo_giacenza: false,
    qta_min: "", qta_max: "", prezzo_min: "", prezzo_max: "", text: "",
    locazione: "",
  });

  const sel = "w-full border border-neutral-300 rounded-lg px-2 py-1.5 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-amber-300";
  const inp = sel;
  const lbl = "block text-[10px] font-semibold text-neutral-500 uppercase tracking-wide mb-0.5";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl mx-4 max-h-[90vh] overflow-auto"
        onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-3 border-b border-neutral-200">
          <h3 className="text-base font-bold text-neutral-800">Stampa inventario filtrato</h3>
          <button onClick={onClose} className="text-neutral-400 hover:text-neutral-700 text-lg">&times;</button>
        </div>
        <div className="px-5 py-4 space-y-4">
          {/* Ricerca libera */}
          <div>
            <label className={lbl}>Ricerca libera</label>
            <input type="text" value={f.text} onChange={set("text")} placeholder="Descrizione, produttore, denominazione..." className={inp} />
          </div>

          {/* Selects principali */}
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <div>
              <label className={lbl}>Tipologia</label>
              <select value={f.tipologia} onChange={set("tipologia")} className={sel}>
                <option value="">Tutte</option>
                {options?.tipologie?.map(v => <option key={v} value={v}>{v}</option>)}
              </select>
            </div>
            <div>
              <label className={lbl}>Nazione</label>
              <select value={f.nazione} onChange={set("nazione")} className={sel}>
                <option value="">Tutte</option>
                {options?.nazioni?.map(v => <option key={v} value={v}>{v}</option>)}
              </select>
            </div>
            <div>
              <label className={lbl}>Regione</label>
              <select value={f.regione} onChange={set("regione")} className={sel}>
                <option value="">Tutte</option>
                {options?.regioni?.map(v => <option key={v} value={v}>{v}</option>)}
              </select>
            </div>
            <div>
              <label className={lbl}>Produttore</label>
              <select value={f.produttore} onChange={set("produttore")} className={sel}>
                <option value="">Tutti</option>
                {options?.produttori?.map(v => <option key={v} value={v}>{v}</option>)}
              </select>
            </div>
            <div>
              <label className={lbl}>Annata</label>
              <select value={f.annata} onChange={set("annata")} className={sel}>
                <option value="">Tutte</option>
                {options?.annate?.map(v => <option key={v} value={v}>{v}</option>)}
              </select>
            </div>
            <div>
              <label className={lbl}>Formato</label>
              <select value={f.formato} onChange={set("formato")} className={sel}>
                <option value="">Tutti</option>
                {options?.formati?.map(v => <option key={v} value={v}>{v}</option>)}
              </select>
            </div>
          </div>

          {/* Stato / Flag */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div>
              <label className={lbl}>In carta</label>
              <select value={f.carta} onChange={set("carta")} className={sel}>
                <option value="">Tutti</option>
                <option value="SI">SI</option>
                <option value="NO">NO</option>
              </select>
            </div>
            <div>
              <label className={lbl}>Stato vendita</label>
              <select value={f.stato_vendita} onChange={set("stato_vendita")} className={sel}>
                <option value="">Tutti</option>
                {options?.stati_vendita?.map(v => <option key={v} value={v}>{v}</option>)}
              </select>
            </div>
            <div>
              <label className={lbl}>Stato riordino</label>
              <select value={f.stato_riordino} onChange={set("stato_riordino")} className={sel}>
                <option value="">Tutti</option>
                {options?.stati_riordino?.map(v => <option key={v} value={v}>{v}</option>)}
              </select>
            </div>
            <div>
              <label className={lbl}>Discontinuato</label>
              <select value={f.discontinuato} onChange={set("discontinuato")} className={sel}>
                <option value="">Tutti</option>
                <option value="SI">SI</option>
                <option value="NO">NO</option>
              </select>
            </div>
          </div>

          {/* Locazione */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="md:col-span-2">
              <label className={lbl}>Locazione</label>
              <select value={f.locazione} onChange={set("locazione")} className={sel}>
                <option value="">Tutte le locazioni</option>
                {locOpts.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
          </div>

          {/* Range quantita e prezzo */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div>
              <label className={lbl}>Qta min</label>
              <input type="number" value={f.qta_min} onChange={set("qta_min")} placeholder="0" className={inp} />
            </div>
            <div>
              <label className={lbl}>Qta max</label>
              <input type="number" value={f.qta_max} onChange={set("qta_max")} placeholder="..." className={inp} />
            </div>
            <div>
              <label className={lbl}>Prezzo min</label>
              <input type="number" step="0.01" value={f.prezzo_min} onChange={set("prezzo_min")} placeholder="0.00" className={inp} />
            </div>
            <div>
              <label className={lbl}>Prezzo max</label>
              <input type="number" step="0.01" value={f.prezzo_max} onChange={set("prezzo_max")} placeholder="..." className={inp} />
            </div>
          </div>

          {/* Checkbox giacenza */}
          <label className="inline-flex items-center gap-2 text-xs text-neutral-700">
            <input type="checkbox" checked={f.solo_giacenza} onChange={set("solo_giacenza")} className="rounded border-neutral-400" />
            <span>Solo vini con giacenza positiva</span>
          </label>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-5 py-3 border-t border-neutral-200 bg-neutral-50 rounded-b-2xl">
          <div className="flex gap-2">
            <button onClick={pulisci}
              className="px-3 py-1.5 text-xs rounded-lg border border-neutral-300 hover:bg-neutral-100 transition">
              Pulisci filtri
            </button>
            {activeCount > 0 && (
              <span className="text-xs text-neutral-500 self-center">{activeCount} filtri attivi</span>
            )}
          </div>
          <button onClick={genera}
            className="px-5 py-2 text-sm font-semibold rounded-xl bg-amber-700 text-white hover:bg-amber-800 shadow-sm transition">
            Genera PDF
          </button>
        </div>
      </div>
    </div>
  );
}


export default function MagazzinoVini() {
  const navigate = useNavigate();

  const [vini, setVini] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [showStampaFiltrata, setShowStampaFiltrata] = useState(false);

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

  // ── Filtro locazioni ──
  const [locazioneSel, setLocazioneSel] = useState("");
  const [locazioniOptions, setLocazioniOptions] = useState([]);

  // ------------------------------------------------
  // FETCH DATI MAGAZZINO
  // ------------------------------------------------
  const fetchVini = async () => {
    setLoading(true);
    setError("");

    try {
      const resp = await apiFetch(`${API_BASE}/vini/magazzino`);

      if (!resp.ok) throw new Error(`Errore server: ${resp.status}`);

      const data = await resp.json();
      setVini(Array.isArray(data) ? data : []);

      if (Array.isArray(data) && data.length > 0 && !selectedVino) {
        setSelectedVino(data[0]);
      }
    } catch (err) {
      setError(err.message || "Errore di caricamento.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchVini();
    // Fetch opzioni locazioni configurate
    apiFetch(`${API_BASE}/vini/cantina-tools/locazioni-config`)
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data) {
          const allOpts = [
            ...(data.opzioni_frigo || []).map(v => ({ label: `Frigo: ${v}`, value: `frigo:${v}` })),
            ...(data.opzioni_locazione_1 || []).map(v => ({ label: `Loc 1: ${v}`, value: `loc1:${v}` })),
            ...(data.opzioni_locazione_2 || []).map(v => ({ label: `Loc 2: ${v}`, value: `loc2:${v}` })),
          ];
          setLocazioniOptions(allOpts);
        }
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ------------------------------------------------
  // OPZIONI SELECT DINAMICHE
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

    // 1) Ricerca per ID (solo id interno)
    if (searchId.trim()) {
      const idTrim = searchId.trim();
      const idNum = parseInt(idTrim, 10);

      out = out.filter((v) => {
        if (!Number.isNaN(idNum) && v.id != null) return v.id === idNum;
        return String(v.id ?? "").toLowerCase().includes(idTrim.toLowerCase());
      });
    }

    // 2) Ricerca libera
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

    // 3) Select
    if (tipologiaSel) out = out.filter((v) => v.TIPOLOGIA === tipologiaSel);
    if (nazioneSel) out = out.filter((v) => v.NAZIONE === nazioneSel);
    if (regioneSel) out = out.filter((v) => v.REGIONE === regioneSel);
    if (produttoreSel) out = out.filter((v) => v.PRODUTTORE === produttoreSel);

    // 4) Giacenza
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

    // 5) Prezzo carta
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

    // 6) Solo vini senza listino
    if (onlyMissingListino) {
      out = out.filter((v) => v.EURO_LISTINO == null || v.EURO_LISTINO === "");
    }

    // 7) Filtro locazione
    if (locazioneSel) {
      const [tipo, val] = [locazioneSel.split(":")[0], locazioneSel.substring(locazioneSel.indexOf(":") + 1)];
      out = out.filter((v) => {
        if (tipo === "frigo") return v.FRIGORIFERO === val;
        if (tipo === "loc1") return v.LOCAZIONE_1 === val;
        if (tipo === "loc2") return v.LOCAZIONE_2 === val;
        return true;
      });
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
    locazioneSel,
  ]);

  const handleRowClick = (vino) => setSelectedVino(vino);

  // ------------------------------------------------
  // RENDER
  // ------------------------------------------------
  return (
    <div className="min-h-screen bg-neutral-100 font-sans">
      <ViniNav current="cantina" />
      <div className="max-w-6xl mx-auto p-4 sm:p-6">
      <div className="bg-white shadow-xl rounded-2xl p-6 sm:p-8 border border-neutral-200">
        {/* HEADER */}
        <div className="flex flex-col lg:flex-row justify-between gap-4 mb-4">
          <div>
            <h1 className="text-3xl lg:text-4xl font-bold text-amber-900 tracking-wide font-playfair mb-2">
              🍷 Cantina
            </h1>
            <p className="text-neutral-600">
              Gestione vini, giacenze, movimenti e locazioni.
            </p>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <button onClick={() => navigate("/vini/magazzino/nuovo")}
              className="px-4 py-2 rounded-xl text-sm font-semibold bg-amber-700 text-white hover:bg-amber-800 shadow-sm transition">
              + Nuovo vino
            </button>
            <button onClick={() => {
                const token = localStorage.getItem("token");
                window.open(`${API_BASE}/vini/cantina-tools/carta-cantina/pdf?token=${token}`, "_blank");
              }}
              className="px-4 py-2 rounded-xl text-sm font-medium border border-neutral-300 bg-neutral-50 hover:bg-neutral-100 shadow-sm transition">
              Genera Carta PDF
            </button>
            <div className="relative group">
              <button
                className="px-4 py-2 rounded-xl text-sm font-medium border border-amber-300 bg-amber-50 hover:bg-amber-100 shadow-sm transition">
                Stampe Inventario ▾
              </button>
              <div className="hidden group-hover:flex flex-col absolute right-0 top-full mt-1 bg-white border border-neutral-200 rounded-xl shadow-lg z-20 min-w-[220px]">
                <button onClick={() => {
                    const token = localStorage.getItem("token");
                    window.open(`${API_BASE}/vini/cantina-tools/inventario/pdf?token=${token}`, "_blank");
                  }}
                  className="px-4 py-2.5 text-sm text-left hover:bg-amber-50 rounded-t-xl transition">
                  Tutti i vini
                </button>
                <button onClick={() => {
                    const token = localStorage.getItem("token");
                    window.open(`${API_BASE}/vini/cantina-tools/inventario/giacenza/pdf?token=${token}`, "_blank");
                  }}
                  className="px-4 py-2.5 text-sm text-left hover:bg-amber-50 transition">
                  Solo con giacenza
                </button>
                <button onClick={() => {
                    const token = localStorage.getItem("token");
                    window.open(`${API_BASE}/vini/cantina-tools/inventario/locazioni/pdf?token=${token}`, "_blank");
                  }}
                  className="px-4 py-2.5 text-sm text-left hover:bg-amber-50 transition">
                  Per locazione
                </button>
                <div className="border-t border-neutral-100" />
                <button onClick={() => setShowStampaFiltrata(true)}
                  className="px-4 py-2.5 text-sm text-left hover:bg-amber-50 rounded-b-xl transition font-medium">
                  Con filtri...
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* SUBMENU */}

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

          <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
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

            <div>
              <label className="block text-xs font-semibold text-neutral-600 mb-1 uppercase tracking-wide">
                Locazione
              </label>
              <select
                value={locazioneSel}
                onChange={(e) => setLocazioneSel(e.target.value)}
                className="w-full border border-neutral-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-amber-300"
              >
                <option value="">Tutte</option>
                {locazioniOptions.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
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
                onClick={() => {
                  setSearchId(""); setSearchText("");
                  setTipologiaSel(""); setNazioneSel(""); setRegioneSel(""); setProduttoreSel("");
                  setLocazioneSel("");
                  setGiacenzaMode("any"); setGiacenzaVal1(""); setGiacenzaVal2("");
                  setOnlyPositiveStock(false);
                  setPrezzoMode("any"); setPrezzoVal1(""); setPrezzoVal2("");
                  setOnlyMissingListino(false);
                }}
                className="px-5 py-2 rounded-xl text-sm font-semibold shadow transition border border-neutral-300 bg-white text-neutral-700 hover:bg-neutral-100"
              >
                ✕ Pulisci filtri
              </button>
              <button
                type="button"
                onClick={fetchVini}
                disabled={loading}
                className={`px-5 py-2 rounded-xl text-sm font-semibold shadow transition ${
                  loading
                    ? "bg-gray-400 text-white cursor-not-allowed"
                    : "bg-amber-700 text-white hover:bg-amber-800"
                }`}
              >
                {loading ? "Ricarico dati…" : "⟳ Ricarica"}
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
                  Lista vini in cantina
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
                          <td className="px-3 py-2 align-top whitespace-nowrap">
                            <span className="inline-flex items-center bg-slate-700 text-white text-[11px] font-bold px-2 py-0.5 rounded font-mono tracking-tight">
                              #{vino.id}
                            </span>
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
                              <span className="text-[11px] text-neutral-400">—</span>
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
                  Giacenze, movimenti e note nella scheda completa.
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
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => navigate(`/vini/magazzino/${selectedVino.id}`)}
                        className="px-3 py-2 rounded-xl text-xs font-semibold bg-amber-700 text-white hover:bg-amber-800 shadow-sm transition"
                      >
                        🍷 Apri scheda completa
                      </button>
                    </div>

                    <div>
                      <span className="inline-flex items-center bg-slate-700 text-white text-[11px] font-bold px-2 py-0.5 rounded font-mono tracking-tight mb-1">
                        #{selectedVino.id}
                      </span>
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
                        {selectedVino.REGIONE ? ` / ${selectedVino.REGIONE}` : ""}
                        {selectedVino.ANNATA ? ` — ${selectedVino.ANNATA}` : ""}
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <div className="text-[11px] font-semibold text-neutral-600 uppercase mb-0.5">
                          Produttore
                        </div>
                        <div className="text-sm">{selectedVino.PRODUTTORE || "—"}</div>
                      </div>
                      <div>
                        <div className="text-[11px] font-semibold text-neutral-600 uppercase mb-0.5">
                          Distributore
                        </div>
                        <div className="text-sm">{selectedVino.DISTRIBUTORE || "—"}</div>
                      </div>
                    </div>

                    <div>
                      <div className="text-[11px] font-semibold text-neutral-600 uppercase mb-1">
                        Giacenze per locazione
                      </div>
                      <div className="border border-neutral-200 rounded-xl bg-white divide-y divide-neutral-100">
                        <div className="px-3 py-2 flex justify-between text-xs">
                          <span>Frigorifero: {selectedVino.FRIGORIFERO || "—"}</span>
                          <span className="font-semibold">{selectedVino.QTA_FRIGO ?? 0} bt</span>
                        </div>
                        <div className="px-3 py-2 flex justify-between text-xs">
                          <span>Locazione 1: {selectedVino.LOCAZIONE_1 || "—"}</span>
                          <span className="font-semibold">{selectedVino.QTA_LOC1 ?? 0} bt</span>
                        </div>
                        <div className="px-3 py-2 flex justify-between text-xs">
                          <span>Locazione 2: {selectedVino.LOCAZIONE_2 || "—"}</span>
                          <span className="font-semibold">{selectedVino.QTA_LOC2 ?? 0} bt</span>
                        </div>
                        <div className="px-3 py-2 flex justify-between text-xs">
                          <span>Locazione 3: {selectedVino.LOCAZIONE_3 || "—"}</span>
                          <span className="font-semibold">{selectedVino.QTA_LOC3 ?? 0} bt</span>
                        </div>
                        <div className="px-3 py-2 flex justify-between text-xs bg-neutral-50 rounded-b-xl">
                          <span className="font-semibold">Totale magazzino</span>
                          <span className="font-bold text-neutral-900">
                            {(selectedVino.QTA_TOTALE ??
                              (selectedVino.QTA_FRIGO ?? 0) +
                                (selectedVino.QTA_LOC1 ?? 0) +
                                (selectedVino.QTA_LOC2 ?? 0) +
                                (selectedVino.QTA_LOC3 ?? 0)) || 0}{" "}
                            bt
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-3">
                      <div>
                        <div className="text-[11px] font-semibold text-neutral-600 uppercase mb-0.5">
                          Prezzo carta
                        </div>
                        <div className="text-sm">
                          {selectedVino.PREZZO_CARTA != null && selectedVino.PREZZO_CARTA !== ""
                            ? `${Number(selectedVino.PREZZO_CARTA).toFixed(2)} €`
                            : "—"}
                        </div>
                      </div>
                      <div>
                        <div className="text-[11px] font-semibold text-neutral-600 uppercase mb-0.5">
                          Listino
                        </div>
                        <div className="text-sm">
                          {selectedVino.EURO_LISTINO != null && selectedVino.EURO_LISTINO !== ""
                            ? `${Number(selectedVino.EURO_LISTINO).toFixed(2)} €`
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

      {showStampaFiltrata && (
        <StampaFiltrata onClose={() => setShowStampaFiltrata(false)} />
      )}
    </div>
  );
}