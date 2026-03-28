// src/pages/vini/MagazzinoVini.jsx
// @version: v4.1-flags-sortable
// Pagina Cantina — Lista Vini + Dettaglio + Scheda completa inline modificabile

import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { API_BASE, apiFetch } from "../../config/api";
import { isAdminRole } from "../../utils/authHelpers";
import ViniNav from "./ViniNav";
import SchedaVino from "./SchedaVino";
import {
  STATO_VENDITA_OPTIONS, STATO_RIORDINO_OPTIONS, STATO_CONSERVAZIONE_OPTIONS,
} from "../../config/viniConstants";

const uniq = (arr) =>
  Array.from(new Set(arr.filter((x) => x && String(x).trim() !== ""))).sort(
    (a, b) => String(a).localeCompare(String(b), "it", { sensitivity: "base" })
  );

// ── Pannello filtri stampa inventario ─────────────────────
function StampaFiltrata({ onClose }) {
  const [options, setOptions] = useState(null);
  const [locConfig, setLocConfig] = useState({ frigorifero: [], locazione_1: [], locazione_2: [], locazione_3: [] });
  const [f, setF] = useState({
    tipologia: "", nazione: "", regione: "", produttore: "",
    annata: "", formato: "", carta: "", ipratico: "", biologico: "", calice: "",
    stato_vendita: "", stato_riordino: "", stato_conservazione: "", discontinuato: "",
    solo_giacenza: false,
    qta_min: "", qta_max: "", prezzo_min: "", prezzo_max: "", text: "",
    frigo_nome: "", frigo_spazio: "",
    loc1_nome: "", loc1_spazio: "",
    loc2_nome: "", loc2_spazio: "",
    loc3_nome: "", loc3_spazio: "",
  });

  useEffect(() => {
    apiFetch(`${API_BASE}/vini/cantina-tools/inventario/filtri-options`)
      .then(r => r.json()).then(setOptions).catch(() => {});
    apiFetch(`${API_BASE}/vini/cantina-tools/locazioni-config`)
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data) {
          setLocConfig({
            frigorifero: data.frigorifero || [],
            locazione_1: data.locazione_1 || [],
            locazione_2: data.locazione_2 || [],
            locazione_3: data.locazione_3 || [],
          });
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
    annata: "", formato: "", carta: "", ipratico: "", biologico: "", calice: "",
    stato_vendita: "", stato_riordino: "", stato_conservazione: "", discontinuato: "",
    solo_giacenza: false,
    qta_min: "", qta_max: "", prezzo_min: "", prezzo_max: "", text: "",
    frigo_nome: "", frigo_spazio: "",
    loc1_nome: "", loc1_spazio: "",
    loc2_nome: "", loc2_spazio: "",
    loc3_nome: "", loc3_spazio: "",
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

          {/* Flag */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div>
              <label className={lbl}>Carta Vini</label>
              <select value={f.carta} onChange={set("carta")} className={sel}>
                <option value="">Tutti</option>
                <option value="SI">SI</option>
                <option value="NO">NO</option>
              </select>
            </div>
            <div>
              <label className={lbl}>iPratico</label>
              <select value={f.ipratico || ""} onChange={set("ipratico")} className={sel}>
                <option value="">Tutti</option>
                <option value="SI">SI</option>
                <option value="NO">NO</option>
              </select>
            </div>
            <div>
              <label className={lbl}>Biologico</label>
              <select value={f.biologico || ""} onChange={set("biologico")} className={sel}>
                <option value="">Tutti</option>
                <option value="SI">SI</option>
                <option value="NO">NO</option>
              </select>
            </div>
            <div>
              <label className={lbl}>Calice</label>
              <select value={f.calice || ""} onChange={set("calice")} className={sel}>
                <option value="">Tutti</option>
                <option value="SI">SI</option>
                <option value="NO">NO</option>
              </select>
            </div>
          </div>

          {/* Stati */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div>
              <label className={lbl}>Stato vendita</label>
              <select value={f.stato_vendita} onChange={set("stato_vendita")} className={sel}>
                <option value="">Tutti</option>
                {STATO_VENDITA_OPTIONS.filter(o => o.value).map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            <div>
              <label className={lbl}>Stato riordino</label>
              <select value={f.stato_riordino} onChange={set("stato_riordino")} className={sel}>
                <option value="">Tutti</option>
                {STATO_RIORDINO_OPTIONS.filter(o => o.value).map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            <div>
              <label className={lbl}>Stato conservazione</label>
              <select value={f.stato_conservazione} onChange={set("stato_conservazione")} className={sel}>
                <option value="">Tutti</option>
                {STATO_CONSERVAZIONE_OPTIONS.filter(o => o.value).map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
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

          {/* Locazioni gerarchiche */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div>
              <label className={lbl}>Frigorifero</label>
              <select value={f.frigo_nome}
                onChange={(e) => setF(prev => ({ ...prev, frigo_nome: e.target.value, frigo_spazio: "" }))}
                className={sel}>
                <option value="">Tutti</option>
                {locConfig.frigorifero.map(item => <option key={item.nome} value={item.nome}>{item.nome}</option>)}
              </select>
            </div>
            <div>
              <label className={lbl}>Spazio frigo</label>
              <select value={f.frigo_spazio} onChange={set("frigo_spazio")}
                disabled={!f.frigo_nome || !(locConfig.frigorifero.find(i => i.nome === f.frigo_nome)?.spazi || []).length}
                className={sel + (!f.frigo_nome ? " opacity-50" : "")}>
                <option value="">Tutti</option>
                {(locConfig.frigorifero.find(i => i.nome === f.frigo_nome)?.spazi || []).map(s =>
                  <option key={s} value={s}>{s}</option>
                )}
              </select>
            </div>
            <div>
              <label className={lbl}>Locazione 1</label>
              <select value={f.loc1_nome}
                onChange={(e) => setF(prev => ({ ...prev, loc1_nome: e.target.value, loc1_spazio: "" }))}
                className={sel}>
                <option value="">Tutte</option>
                {locConfig.locazione_1.map(item => <option key={item.nome} value={item.nome}>{item.nome}</option>)}
              </select>
            </div>
            <div>
              <label className={lbl}>Spazio loc. 1</label>
              <select value={f.loc1_spazio} onChange={set("loc1_spazio")}
                disabled={!f.loc1_nome || !(locConfig.locazione_1.find(i => i.nome === f.loc1_nome)?.spazi || []).length}
                className={sel + (!f.loc1_nome ? " opacity-50" : "")}>
                <option value="">Tutti</option>
                {(locConfig.locazione_1.find(i => i.nome === f.loc1_nome)?.spazi || []).map(s =>
                  <option key={s} value={s}>{s}</option>
                )}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div>
              <label className={lbl}>Locazione 2</label>
              <select value={f.loc2_nome}
                onChange={(e) => setF(prev => ({ ...prev, loc2_nome: e.target.value, loc2_spazio: "" }))}
                className={sel}>
                <option value="">Tutte</option>
                {locConfig.locazione_2.map(item => <option key={item.nome} value={item.nome}>{item.nome}</option>)}
              </select>
            </div>
            <div>
              <label className={lbl}>Spazio loc. 2</label>
              <select value={f.loc2_spazio} onChange={set("loc2_spazio")}
                disabled={!f.loc2_nome || !(locConfig.locazione_2.find(i => i.nome === f.loc2_nome)?.spazi || []).length}
                className={sel + (!f.loc2_nome ? " opacity-50" : "")}>
                <option value="">Tutti</option>
                {(locConfig.locazione_2.find(i => i.nome === f.loc2_nome)?.spazi || []).map(s =>
                  <option key={s} value={s}>{s}</option>
                )}
              </select>
            </div>
            <div>
              <label className={lbl}>Locazione 3</label>
              <select value={f.loc3_nome}
                onChange={(e) => setF(prev => ({ ...prev, loc3_nome: e.target.value, loc3_spazio: "" }))}
                className={sel}>
                <option value="">Tutte</option>
                {locConfig.locazione_3.map(item => <option key={item.nome} value={item.nome}>{item.nome}</option>)}
              </select>
            </div>
            <div>
              <label className={lbl}>Spazio loc. 3</label>
              <select value={f.loc3_spazio} onChange={set("loc3_spazio")}
                disabled={!f.loc3_nome || !(locConfig.locazione_3.find(i => i.nome === f.loc3_nome)?.spazi || []).length}
                className={sel + (!f.loc3_nome ? " opacity-50" : "")}>
                <option value="">Tutti</option>
                {(locConfig.locazione_3.find(i => i.nome === f.loc3_nome)?.spazi || []).map(s =>
                  <option key={s} value={s}>{s}</option>
                )}
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

  const [openSchedaId, setOpenSchedaId] = useState(null);
  const schedaRef = useRef(null);      // ref per scroll al div wrapper
  const schedaCompRef = useRef(null);  // ref per accedere a hasPendingChanges()

  // ── MULTI-SELECT & BULK EDIT ──
  const role = localStorage.getItem("role");
  const isAdmin = isAdminRole(role);
  const isSommelier = role === "sommelier";
  const isSala = role === "sala";
  const canPrint = isAdmin || isSommelier || isSala;
  const canBulkEdit = isAdmin;
  const bulkMode = true; // selezione multipla sempre attiva
  const [selectedIds, setSelectedIds] = useState([]);
  const [bulkEditOpen, setBulkEditOpen] = useState(false);
  const [bulkData, setBulkData] = useState({});
  const [bulkSaving, setBulkSaving] = useState(false);
  const [bulkResult, setBulkResult] = useState(null);
  // Toast globale per feedback azioni massive
  const [toast, setToast] = useState(null); // { type: "ok"|"error", message: string }
  const showToast = (type, message, ms = 4000) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), ms);
  };
  const [tabellaOpts, setTabellaOpts] = useState({ tipologie: [], nazioni: [], regioni: [], formati: [] });

  // ------- FILTRI --------
  const [searchId, setSearchId] = useState("");
  const [searchText, setSearchText] = useState("");

  const [tipologiaSel, setTipologiaSel] = useState("");
  const [nazioneSel, setNazioneSel] = useState("");
  const [produttoreSel, setProduttoreSel] = useState("");
  const [regioneSel, setRegioneSel] = useState("");
  const [distributoreSel, setDistributoreSel] = useState("");
  const [rappresentanteSel, setRappresentanteSel] = useState("");

  // Colori per TIPOLOGIA vino — riga tabella + badge riepilogo
  // Valori reali: ROSSI, BIANCHI, BOLLICINE, ROSATI, PASSITI E VINI DA MEDITAZIONE, GRANDI FORMATI, VINI ANALCOLICI, ERRORE
  const TIPOLOGIA_COLORS = {
    ROSSI:       { row: "bg-red-50/70",    badge: "bg-red-100 text-red-800 border-red-200" },
    BIANCHI:     { row: "bg-amber-50/50",  badge: "bg-amber-100 text-amber-800 border-amber-200" },
    BOLLICINE:   { row: "bg-yellow-50/60", badge: "bg-yellow-100 text-yellow-800 border-yellow-200" },
    ROSATI:      { row: "bg-pink-50/60",   badge: "bg-pink-100 text-pink-800 border-pink-200" },
    "PASSITI E VINI DA MEDITAZIONE": { row: "bg-orange-50/50", badge: "bg-orange-100 text-orange-800 border-orange-200" },
    "GRANDI FORMATI": { row: "bg-purple-50/50", badge: "bg-purple-100 text-purple-800 border-purple-200" },
    "VINI ANALCOLICI": { row: "bg-teal-50/50", badge: "bg-teal-100 text-teal-800 border-teal-200" },
    ERRORE:      { row: "bg-gray-100/60",  badge: "bg-gray-200 text-gray-700 border-gray-300" },
  };
  const tipologiaRowColor = (tip) => {
    if (!tip) return "";
    const t = tip.toUpperCase();
    for (const [key, val] of Object.entries(TIPOLOGIA_COLORS)) {
      if (t.includes(key)) return val.row;
    }
    return "";
  };
  const tipologiaBadgeColor = (tip) => {
    if (!tip) return "bg-neutral-100 text-neutral-600 border-neutral-200";
    const t = tip.toUpperCase();
    for (const [key, val] of Object.entries(TIPOLOGIA_COLORS)) {
      if (t.includes(key)) return val.badge;
    }
    return "bg-neutral-100 text-neutral-600 border-neutral-200";
  };

  const [giacenzaMode, setGiacenzaMode] = useState("any"); // any | gt | lt | between
  const [giacenzaVal1, setGiacenzaVal1] = useState("");
  const [giacenzaVal2, setGiacenzaVal2] = useState("");
  const [onlyPositiveStock, setOnlyPositiveStock] = useState(true);

  const [prezzoMode, setPrezzoMode] = useState("any"); // any | gt | lt | between
  const [prezzoVal1, setPrezzoVal1] = useState("");
  const [prezzoVal2, setPrezzoVal2] = useState("");

  const [onlyMissingListino, setOnlyMissingListino] = useState(false);

  // ── Filtri stati ──
  const [statoVenditaSel, setStatoVenditaSel] = useState("");
  const [statoRiordinoSel, setStatoRiordinoSel] = useState("");
  const [statoConservazioneSel, setStatoConservazioneSel] = useState("");

  // ── Filtri flag ──
  const [cartaSel, setCartaSel] = useState("");           // "" | SI | NO
  const [ipraticoSel, setIpraticoSel] = useState("");     // "" | SI | NO
  const [biologicoSel, setBiologicoSel] = useState("");   // "" | SI | NO
  const [caliceSel, setCaliceSel] = useState("");          // "" | SI | NO

  // ── Ordinamento colonne ──
  const [sortKey, setSortKey] = useState(null);   // "id" | "descrizione" | "produttore" | "origine" | "qta" | "prezzo" | null
  const [sortDir, setSortDir] = useState("asc");  // "asc" | "desc"
  const handleSort = (key) => {
    if (sortKey === key) {
      setSortDir(prev => prev === "asc" ? "desc" : "asc");
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  };
  const SortIcon = ({ col }) => {
    if (sortKey !== col) return <span className="text-neutral-300 ml-0.5">↕</span>;
    return <span className="text-amber-600 ml-0.5">{sortDir === "asc" ? "↑" : "↓"}</span>;
  };

  // ── Filtro locazioni unificato ──
  const [locConfig, setLocConfig] = useState({ frigorifero: [], locazione_1: [], locazione_2: [], locazione_3: [] });
  const [locNome, setLocNome] = useState("");
  const [locSpazio, setLocSpazio] = useState("");

  // Lista unificata nomi locazioni (deduplicata, ordinata)
  const allLocNomi = useMemo(() => {
    const nomi = new Set();
    for (const items of [locConfig.frigorifero, locConfig.locazione_1, locConfig.locazione_2, locConfig.locazione_3]) {
      (items || []).forEach(i => { if (i.nome) nomi.add(i.nome); });
    }
    return [...nomi].sort((a, b) => a.localeCompare(b, "it"));
  }, [locConfig]);

  // Spazi disponibili per la locazione selezionata (unione da tutte le sezioni)
  const locSpaziOptions = useMemo(() => {
    if (!locNome) return [];
    const spazi = new Set();
    for (const items of [locConfig.frigorifero, locConfig.locazione_1, locConfig.locazione_2, locConfig.locazione_3]) {
      const found = (items || []).find(i => i.nome === locNome);
      if (found && found.spazi) found.spazi.forEach(s => spazi.add(s));
      // Per matrici genera coordinate
      if (found && found.tipo === "matrice" && found.righe && found.colonne) {
        for (let r = 1; r <= found.righe; r++)
          for (let c = 1; c <= found.colonne; c++)
            spazi.add(`(${c},${r})`);
      }
    }
    return [...spazi].sort((a, b) => a.localeCompare(b, "it"));
  }, [locConfig, locNome]);

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

    } catch (err) {
      setError(err.message || "Errore di caricamento.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchVini();
    // Fetch opzioni locazioni configurate (struttura gerarchica)
    apiFetch(`${API_BASE}/vini/cantina-tools/locazioni-config`)
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data) {
          setLocConfig({
            frigorifero: data.frigorifero || [],
            locazione_1: data.locazione_1 || [],
            locazione_2: data.locazione_2 || [],
            locazione_3: data.locazione_3 || [],
          });
        }
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── BULK EDIT: carica tabellati (per admin) ──
  useEffect(() => {
    if (!canBulkEdit) return;
    apiFetch(`${API_BASE}/settings/vini/valori-tabellati`)
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d) setTabellaOpts({ tipologie: d.tipologie || [], nazioni: d.nazioni || [], regioni: d.regioni || [], formati: d.formati || [] }); })
      .catch(() => {});
  }, []);

  const clearSelection = () => {
    setSelectedIds([]);
    setBulkEditOpen(false);
    setBulkResult(null);
  };

  const toggleSelectId = (id) => {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const toggleSelectAll = () => {
    if (selectedIds.length === viniVisibili.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(viniVisibili.map(v => v.id));
    }
  };

  const bulkPanelRef = useRef(null);
  const [bulkCommon, setBulkCommon] = useState({}); // {CAMPO: valore} per campi uniformi tra i selezionati
  const [bulkTouched, setBulkTouched] = useState(new Set()); // campi modificati dall'utente

  const openBulkEdit = () => {
    console.log("openBulkEdit called, selectedIds:", selectedIds.length);

    // Calcola valori comuni: se tutti i vini selezionati hanno lo stesso valore, pre-popola
    const BULK_FIELDS = [
      "TIPOLOGIA", "NAZIONE", "REGIONE", "FORMATO",
      "PRODUTTORE", "DISTRIBUTORE", "RAPPRESENTANTE",
      "PREZZO_CARTA", "EURO_LISTINO", "SCONTO",
      "CARTA", "IPRATICO", "BIOLOGICO", "VENDITA_CALICE",
      "STATO_VENDITA", "STATO_RIORDINO", "STATO_CONSERVAZIONE",
      "NOTE",
    ];
    const selVini = viniVisibili.filter(v => selectedIds.includes(v.id));
    const common = {};
    const prefill = {};
    for (const field of BULK_FIELDS) {
      const vals = selVini.map(v => v[field] ?? "").map(v => String(v).trim());
      const unique = [...new Set(vals)];
      if (unique.length === 1 && unique[0] !== "") {
        common[field] = unique[0];
        prefill[field] = unique[0];
      }
    }
    setBulkCommon(common);
    setBulkData(prefill);
    setBulkTouched(new Set());
    setBulkResult(null);
    setBulkEditOpen(true);
    setTimeout(() => {
      if (bulkPanelRef.current) {
        bulkPanelRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    }, 200);
  };

  const bulkFieldSet = (name, value) => {
    setBulkTouched(prev => new Set(prev).add(name));
    setBulkData(prev => {
      const next = { ...prev };
      if (value === "" || value === undefined) { delete next[name]; } else { next[name] = value; }
      return next;
    });
  };

  // Helper: classe CSS per campo bulk edit (verde se uniforme, grigio se misto)
  const bfClass = (field) =>
    "w-full rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-300 " +
    (field in bulkCommon
      ? "border-2 border-emerald-400 bg-emerald-50/40"
      : "border border-neutral-300 bg-white");
  const bfPlaceholder = (field) =>
    field in bulkCommon ? bulkCommon[field] : "— valori diversi —";

  const submitBulkEdit = async () => {
    // Invia solo i campi toccati dall'utente (non quelli pre-popolati e non modificati)
    const changedData = {};
    for (const key of bulkTouched) {
      if (key in bulkData) changedData[key] = bulkData[key];
      // Se il campo è stato toccato ma poi svuotato, non lo inviamo (= non modificare)
    }
    if (selectedIds.length === 0 || Object.keys(changedData).length === 0) return;
    if (!window.confirm(`Stai per modificare ${selectedIds.length} vini. Confermi?`)) return;
    setBulkSaving(true);
    setBulkResult(null);
    try {
      const updates = selectedIds.map(id => ({ id, ...changedData }));
      const resp = await apiFetch(`${API_BASE}/vini/magazzino/bulk-update`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ updates }),
      });
      const result = await resp.json();
      if (!resp.ok) throw new Error(result.detail || "Errore");
      setBulkResult(result);
      // Chiudi pannello, deseleziona e mostra toast di conferma
      setBulkEditOpen(false);
      setSelectedIds([]);
      const msg = `✅ Aggiornati ${result.updated} vini` +
        (result.errors?.length ? ` (${result.errors.length} errori)` : "");
      showToast("ok", msg);
      fetchVini();
    } catch (err) {
      setBulkResult({ status: "error", message: err.message });
      showToast("error", `❌ ${err.message}`);
    } finally {
      setBulkSaving(false);
    }
  };

  const [bulkDuplicating, setBulkDuplicating] = useState(false);
  const handleBulkDuplicate = async () => {
    if (selectedIds.length === 0) return;
    if (!window.confirm(`Duplicare ${selectedIds.length} vini? Verranno create copie con giacenze a zero.`)) return;
    setBulkDuplicating(true);
    try {
      const resp = await apiFetch(`${API_BASE}/vini/magazzino/bulk-duplicate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: selectedIds }),
      });
      const result = await resp.json();
      if (!resp.ok) throw new Error(result.detail || "Errore");
      showToast("ok", result.msg || `✅ Duplicati ${result.duplicati} vini`);
      setSelectedIds([]);
      fetchVini();
    } catch (err) {
      showToast("error", `❌ ${err.message || "Errore durante la duplicazione"}`);
    } finally {
      setBulkDuplicating(false);
    }
  };

  // ── STAMPA SELEZIONE PDF ──
  const handlePrintSelection = async () => {
    if (selectedIds.length === 0) return;
    try {
      const resp = await apiFetch(`${API_BASE}/vini/cantina-tools/inventario/selezione/pdf`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: selectedIds }),
      });
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        throw new Error(err.detail || "Errore generazione PDF");
      }
      const blob = await resp.blob();
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank");
    } catch (err) {
      alert(err.message || "Errore durante la stampa");
    }
  };

  // ------------------------------------------------
  // OPZIONI SELECT DINAMICHE
  // ------------------------------------------------
  const baseForOptions = useMemo(() => {
    let out = [...vini];
    if (nazioneSel) out = out.filter((v) => v.NAZIONE === nazioneSel);
    if (tipologiaSel) out = out.filter((v) => v.TIPOLOGIA === tipologiaSel);
    if (regioneSel) out = out.filter((v) => v.REGIONE === regioneSel);
    if (produttoreSel) out = out.filter((v) => v.PRODUTTORE === produttoreSel);
    if (distributoreSel) out = out.filter((v) => v.DISTRIBUTORE === distributoreSel);
    if (rappresentanteSel) out = out.filter((v) => v.RAPPRESENTANTE === rappresentanteSel);
    return out;
  }, [vini, tipologiaSel, nazioneSel, produttoreSel, regioneSel, distributoreSel, rappresentanteSel]);

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
  const distributoriOptions = useMemo(
    () => uniq(baseForOptions.map((v) => v.DISTRIBUTORE)),
    [baseForOptions]
  );
  const rappresentantiOptions = useMemo(
    () => uniq(baseForOptions.map((v) => v.RAPPRESENTANTE)),
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
          v.DISTRIBUTORE,
          v.RAPPRESENTANTE,
        ];
        return campi.some((c) => c && String(c).toLowerCase().includes(needle));
      });
    }

    // 3) Select
    if (tipologiaSel) out = out.filter((v) => v.TIPOLOGIA === tipologiaSel);
    if (nazioneSel) out = out.filter((v) => v.NAZIONE === nazioneSel);
    if (regioneSel) out = out.filter((v) => v.REGIONE === regioneSel);
    if (produttoreSel) out = out.filter((v) => v.PRODUTTORE === produttoreSel);
    if (distributoreSel) out = out.filter((v) => v.DISTRIBUTORE === distributoreSel);
    if (rappresentanteSel) out = out.filter((v) => v.RAPPRESENTANTE === rappresentanteSel);

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

    // 7) Filtri stati
    if (statoVenditaSel) out = out.filter((v) => v.STATO_VENDITA === statoVenditaSel);
    if (statoRiordinoSel) out = out.filter((v) => v.STATO_RIORDINO === statoRiordinoSel);
    if (statoConservazioneSel) out = out.filter((v) => v.STATO_CONSERVAZIONE === statoConservazioneSel);

    // 7b) Filtri flag
    if (cartaSel) out = out.filter((v) => v.CARTA === cartaSel);
    if (ipraticoSel) out = out.filter((v) => v.IPRATICO === ipraticoSel);
    if (biologicoSel) out = out.filter((v) => v.BIOLOGICO === biologicoSel);
    if (caliceSel) out = out.filter((v) => v.VENDITA_CALICE === caliceSel);

    // 8) Filtro locazione unificato (cerca in tutte le colonne)
    if (locNome) {
      const locCols = ["FRIGORIFERO", "LOCAZIONE_1", "LOCAZIONE_2", "LOCAZIONE_3"];
      if (locSpazio) {
        const full = `${locNome} - ${locSpazio}`;
        out = out.filter((v) => locCols.some(col => v[col] === full));
      } else {
        const prefix = `${locNome} - `;
        out = out.filter((v) => locCols.some(col => v[col] && (v[col] === locNome || String(v[col]).startsWith(prefix))));
      }
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
    distributoreSel,
    rappresentanteSel,
    giacenzaMode,
    giacenzaVal1,
    giacenzaVal2,
    onlyPositiveStock,
    prezzoMode,
    prezzoVal1,
    prezzoVal2,
    onlyMissingListino,
    statoVenditaSel, statoRiordinoSel, statoConservazioneSel,
    cartaSel, ipraticoSel, biologicoSel, caliceSel,
    locNome, locSpazio,
  ]);

  // Filtro riepilogo — cliccando un badge mostra solo quei vini
  const [riepilogoFilter, setRiepilogoFilter] = useState(null); // null | "tipologia:ROSSI" | "esaurite"

  // Riepilogo per tipologia dei vini filtrati
  const riepilogoTipologie = useMemo(() => {
    const counts = {};
    let totBotQ = 0;
    let esaurite = 0;
    for (const v of viniFiltrati) {
      const tip = v.TIPOLOGIA || "—";
      const q = (v.QTA_TOTALE ?? ((v.QTA_FRIGO ?? 0) + (v.QTA_LOC1 ?? 0) + (v.QTA_LOC2 ?? 0) + (v.QTA_LOC3 ?? 0))) || 0;
      if (!counts[tip]) counts[tip] = { etichette: 0, bottiglie: 0, esaurite: 0 };
      counts[tip].etichette += 1;
      counts[tip].bottiglie += q;
      if (q <= 0) { counts[tip].esaurite += 1; esaurite += 1; }
      totBotQ += q;
    }
    const sorted = Object.entries(counts).sort((a, b) => b[1].etichette - a[1].etichette);
    return { sorted, totBotQ, esaurite };
  }, [viniFiltrati]);

  // Lista vini mostrata in tabella (filtrata ulteriormente dal riepilogo + ordinata)
  const viniVisibili = useMemo(() => {
    let out;
    if (!riepilogoFilter) {
      out = [...viniFiltrati];
    } else if (riepilogoFilter === "esaurite") {
      out = viniFiltrati.filter((v) => {
        const q = (v.QTA_TOTALE ?? ((v.QTA_FRIGO ?? 0) + (v.QTA_LOC1 ?? 0) + (v.QTA_LOC2 ?? 0) + (v.QTA_LOC3 ?? 0))) || 0;
        return q <= 0;
      });
    } else {
      const tip = riepilogoFilter.replace("tipologia:", "");
      out = tip === "—"
        ? viniFiltrati.filter((v) => !v.TIPOLOGIA)
        : viniFiltrati.filter((v) => v.TIPOLOGIA === tip);
    }

    // Ordinamento per colonna
    if (sortKey) {
      const dir = sortDir === "asc" ? 1 : -1;
      out.sort((a, b) => {
        let va, vb;
        switch (sortKey) {
          case "id": va = a.id ?? 0; vb = b.id ?? 0; return (va - vb) * dir;
          case "descrizione": va = (a.DESCRIZIONE || "").toLowerCase(); vb = (b.DESCRIZIONE || "").toLowerCase(); break;
          case "produttore": va = (a.PRODUTTORE || "").toLowerCase(); vb = (b.PRODUTTORE || "").toLowerCase(); break;
          case "origine": va = ((a.NAZIONE || "") + (a.REGIONE || "")).toLowerCase(); vb = ((b.NAZIONE || "") + (b.REGIONE || "")).toLowerCase(); break;
          case "qta":
            va = (a.QTA_TOTALE ?? ((a.QTA_FRIGO ?? 0) + (a.QTA_LOC1 ?? 0) + (a.QTA_LOC2 ?? 0) + (a.QTA_LOC3 ?? 0))) || 0;
            vb = (b.QTA_TOTALE ?? ((b.QTA_FRIGO ?? 0) + (b.QTA_LOC1 ?? 0) + (b.QTA_LOC2 ?? 0) + (b.QTA_LOC3 ?? 0))) || 0;
            return (va - vb) * dir;
          case "prezzo":
            va = parseFloat(a.PREZZO_CARTA) || 0; vb = parseFloat(b.PREZZO_CARTA) || 0;
            return (va - vb) * dir;
          default: return 0;
        }
        return va < vb ? -1 * dir : va > vb ? 1 * dir : 0;
      });
    }

    return out;
  }, [viniFiltrati, riepilogoFilter, sortKey, sortDir]);

  const handleRowClick = (vino) => {
    // Se c'è una scheda aperta con modifiche non salvate, chiedi conferma
    if (openSchedaId && openSchedaId !== vino.id && schedaCompRef.current?.hasPendingChanges?.()) {
      if (!window.confirm("Hai modifiche non salvate nella scheda corrente. Vuoi passare a un altro vino?")) return;
    }
    setOpenSchedaId(vino.id);
    // Scroll to scheda after render
    setTimeout(() => {
      schedaRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 100);
  };

  // Determina se mostrare la vista dettaglio (scheda o bulk edit) al posto della lista
  const showDetailView = openSchedaId || (bulkEditOpen && selectedIds.length > 0);

  // Helper: classe CSS compatte per i filtri sidebar
  const fSel = "w-full border border-neutral-300 rounded-md px-2 py-1.5 text-[11px] bg-white focus:outline-none focus:ring-1 focus:ring-amber-300";
  const fLbl = "block text-[9px] font-bold text-neutral-500 uppercase tracking-wider mb-0.5";
  const fInp = fSel;

  // Conteggio filtri attivi
  const activeFilterCount = [
    searchText, searchId, tipologiaSel, nazioneSel, regioneSel, produttoreSel,
    distributoreSel, rappresentanteSel, locNome, statoVenditaSel, statoRiordinoSel,
    statoConservazioneSel, cartaSel, ipraticoSel, biologicoSel, caliceSel,
    onlyMissingListino && "x", onlyPositiveStock && "x",
    giacenzaMode !== "any" && "x", prezzoMode !== "any" && "x",
  ].filter(Boolean).length;

  const clearAllFilters = () => {
    setSearchId(""); setSearchText("");
    setTipologiaSel(""); setNazioneSel(""); setRegioneSel(""); setProduttoreSel(""); setDistributoreSel(""); setRappresentanteSel("");
    setLocNome(""); setLocSpazio("");
    setGiacenzaMode("any"); setGiacenzaVal1(""); setGiacenzaVal2("");
    setOnlyPositiveStock(false);
    setPrezzoMode("any"); setPrezzoVal1(""); setPrezzoVal2("");
    setOnlyMissingListino(false);
    setStatoVenditaSel(""); setStatoRiordinoSel(""); setStatoConservazioneSel("");
    setCartaSel(""); setIpraticoSel(""); setBiologicoSel(""); setCaliceSel("");
    setRiepilogoFilter(null);
  };

  // ------------------------------------------------
  // RENDER
  // ------------------------------------------------
  return (
    <div className="min-h-screen bg-neutral-100 font-sans">
      <ViniNav current="cantina" />

      {/* HEADER compatto */}
      <div className="bg-white border-b border-neutral-200 shadow-sm">
        <div className="max-w-[1100px] mx-auto px-3 py-2 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-bold text-amber-900 tracking-wide">🍷 Cantina</h1>
            <span className="text-xs text-neutral-500 hidden sm:inline">Gestione vini, giacenze e movimenti</span>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => navigate("/vini/magazzino/nuovo")}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-amber-700 text-white hover:bg-amber-800 shadow-sm transition">
              + Nuovo
            </button>
            <button onClick={() => {
                const token = localStorage.getItem("token");
                window.open(`${API_BASE}/vini/cantina-tools/carta-cantina/pdf?token=${token}`, "_blank");
              }}
              className="px-3 py-1.5 rounded-lg text-xs font-medium border border-neutral-300 bg-neutral-50 hover:bg-neutral-100 transition">
              Carta PDF
            </button>
            <div className="relative group">
              <button className="px-3 py-1.5 rounded-lg text-xs font-medium border border-amber-300 bg-amber-50 hover:bg-amber-100 transition">
                Stampe ▾
              </button>
              <div className="hidden group-hover:flex flex-col absolute right-0 top-full mt-1 bg-white border border-neutral-200 rounded-lg shadow-lg z-30 min-w-[200px]">
                <button onClick={() => {
                    const token = localStorage.getItem("token");
                    window.open(`${API_BASE}/vini/cantina-tools/inventario/pdf?token=${token}`, "_blank");
                  }}
                  className="px-3 py-2 text-xs text-left hover:bg-amber-50 rounded-t-lg transition">Tutti i vini</button>
                <button onClick={() => {
                    const token = localStorage.getItem("token");
                    window.open(`${API_BASE}/vini/cantina-tools/inventario/giacenza/pdf?token=${token}`, "_blank");
                  }}
                  className="px-3 py-2 text-xs text-left hover:bg-amber-50 transition">Solo con giacenza</button>
                <button onClick={() => {
                    const token = localStorage.getItem("token");
                    window.open(`${API_BASE}/vini/cantina-tools/inventario/locazioni/pdf?token=${token}`, "_blank");
                  }}
                  className="px-3 py-2 text-xs text-left hover:bg-amber-50 transition">Per locazione</button>
                <div className="border-t border-neutral-100" />
                <button onClick={() => setShowStampaFiltrata(true)}
                  className="px-3 py-2 text-xs text-left hover:bg-amber-50 rounded-b-lg transition font-medium">Con filtri...</button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* LAYOUT PRINCIPALE: Filtri SX + Contenuto DX */}
      <div className="flex" style={{ height: "calc(100vh - 88px)" }}>

        {/* ══════════════════════════════════════════════
            COLONNA SINISTRA: FILTRI (280px fisso)
            ══════════════════════════════════════════════ */}
        <div className="w-[280px] min-w-[280px] border-r border-neutral-200 bg-neutral-50 overflow-y-auto flex-shrink-0">
          <div className="p-2.5 space-y-2">

            {/* ── Ricerca ── */}
            <div className="bg-white rounded-lg p-2.5 border border-neutral-200 shadow-sm">
              <div className="text-[9px] font-extrabold text-neutral-400 uppercase tracking-widest mb-1.5">Ricerca</div>
              <div className="space-y-1.5">
                <div>
                  <label className={fLbl}>Ricerca libera</label>
                  <input type="text" value={searchText} onChange={(e) => setSearchText(e.target.value)}
                    placeholder="Descrizione, produttore…" className={fInp} />
                </div>
                <div>
                  <label className={fLbl}>Ricerca per ID</label>
                  <input type="text" value={searchId} onChange={(e) => setSearchId(e.target.value)}
                    placeholder="es. 1234" className={fInp} />
                </div>
              </div>
            </div>

            {/* ── Anagrafica ── */}
            <div className="bg-amber-50/50 rounded-lg p-2.5 border border-amber-100 shadow-sm">
              <div className="text-[9px] font-extrabold text-amber-600 uppercase tracking-widest mb-1.5">Anagrafica</div>
              <div className="grid grid-cols-2 gap-1.5">
                <div>
                  <label className={fLbl}>Tipologia</label>
                  <select value={tipologiaSel} onChange={(e) => setTipologiaSel(e.target.value)} className={fSel}>
                    <option value="">Tutte</option>
                    {tipologieOptions.map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div>
                  <label className={fLbl}>Nazione</label>
                  <select value={nazioneSel} onChange={(e) => setNazioneSel(e.target.value)} className={fSel}>
                    <option value="">Tutte</option>
                    {nazioniOptions.map((n) => <option key={n} value={n}>{n}</option>)}
                  </select>
                </div>
                <div>
                  <label className={fLbl}>Regione</label>
                  <select value={regioneSel} onChange={(e) => setRegioneSel(e.target.value)} className={fSel}>
                    <option value="">Tutte</option>
                    {regioniOptions.map((r) => <option key={r} value={r}>{r}</option>)}
                  </select>
                </div>
                <div>
                  <label className={fLbl}>Produttore</label>
                  <select value={produttoreSel} onChange={(e) => setProduttoreSel(e.target.value)} className={fSel}>
                    <option value="">Tutti</option>
                    {produttoriOptions.map((p) => <option key={p} value={p}>{p}</option>)}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-1.5 mt-1.5">
                <div>
                  <label className={fLbl}>Distributore</label>
                  <select value={distributoreSel} onChange={(e) => setDistributoreSel(e.target.value)} className={fSel}>
                    <option value="">Tutti</option>
                    {distributoriOptions.map((d) => <option key={d} value={d}>{d}</option>)}
                  </select>
                </div>
                <div>
                  <label className={fLbl}>Rappresentante</label>
                  <select value={rappresentanteSel} onChange={(e) => setRappresentanteSel(e.target.value)} className={fSel}>
                    <option value="">Tutti</option>
                    {rappresentantiOptions.map((r) => <option key={r} value={r}>{r}</option>)}
                  </select>
                </div>
              </div>
            </div>

            {/* ── Locazioni ── */}
            <div className="bg-emerald-50/40 rounded-lg p-2.5 border border-emerald-100 shadow-sm">
              <div className="text-[9px] font-extrabold text-emerald-600 uppercase tracking-widest mb-1.5">Locazioni</div>
              <div className="grid grid-cols-2 gap-1.5">
                <div>
                  <label className={fLbl}>Locazione</label>
                  <select value={locNome} onChange={(e) => { setLocNome(e.target.value); setLocSpazio(""); }} className={fSel}>
                    <option value="">Tutte</option>
                    {allLocNomi.map((nome) => <option key={nome} value={nome}>{nome}</option>)}
                  </select>
                </div>
                <div>
                  <label className={fLbl}>Spazio</label>
                  <select value={locSpazio} onChange={(e) => setLocSpazio(e.target.value)}
                    disabled={!locNome || !locSpaziOptions.length} className={fSel + " disabled:opacity-50"}>
                    <option value="">Tutti</option>
                    {locSpaziOptions.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
              </div>
            </div>

            {/* ── Stati ── */}
            <div className="bg-blue-50/40 rounded-lg p-2.5 border border-blue-100 shadow-sm">
              <div className="text-[9px] font-extrabold text-blue-600 uppercase tracking-widest mb-1.5">Stati</div>
              <div className="space-y-1.5">
                <div>
                  <label className={fLbl}>Stato vendita</label>
                  <select value={statoVenditaSel} onChange={(e) => setStatoVenditaSel(e.target.value)} className={fSel}>
                    <option value="">Tutti</option>
                    {STATO_VENDITA_OPTIONS.filter(o => o.value).map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className={fLbl}>Stato riordino</label>
                  <select value={statoRiordinoSel} onChange={(e) => setStatoRiordinoSel(e.target.value)} className={fSel}>
                    <option value="">Tutti</option>
                    {STATO_RIORDINO_OPTIONS.filter(o => o.value).map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className={fLbl}>Stato conservazione</label>
                  <select value={statoConservazioneSel} onChange={(e) => setStatoConservazioneSel(e.target.value)} className={fSel}>
                    <option value="">Tutti</option>
                    {STATO_CONSERVAZIONE_OPTIONS.filter(o => o.value).map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
              </div>
            </div>

            {/* ── Flag ── */}
            <div className="bg-rose-50/40 rounded-lg p-2.5 border border-rose-100 shadow-sm">
              <div className="text-[9px] font-extrabold text-rose-600 uppercase tracking-widest mb-1.5">Flag</div>
              <div className="grid grid-cols-2 gap-1.5">
                <div>
                  <label className={fLbl}>Carta Vini</label>
                  <select value={cartaSel} onChange={(e) => setCartaSel(e.target.value)} className={fSel}>
                    <option value="">Tutti</option>
                    <option value="SI">SI</option>
                    <option value="NO">NO</option>
                  </select>
                </div>
                <div>
                  <label className={fLbl}>iPratico</label>
                  <select value={ipraticoSel} onChange={(e) => setIpraticoSel(e.target.value)} className={fSel}>
                    <option value="">Tutti</option>
                    <option value="SI">SI</option>
                    <option value="NO">NO</option>
                  </select>
                </div>
                <div>
                  <label className={fLbl}>Biologico</label>
                  <select value={biologicoSel} onChange={(e) => setBiologicoSel(e.target.value)} className={fSel}>
                    <option value="">Tutti</option>
                    <option value="SI">SI</option>
                    <option value="NO">NO</option>
                  </select>
                </div>
                <div>
                  <label className={fLbl}>Calice</label>
                  <select value={caliceSel} onChange={(e) => setCaliceSel(e.target.value)} className={fSel}>
                    <option value="">Tutti</option>
                    <option value="SI">SI</option>
                    <option value="NO">NO</option>
                  </select>
                </div>
              </div>
            </div>

            {/* ── Giacenza e prezzo ── */}
            <div className="bg-violet-50/40 rounded-lg p-2.5 border border-violet-100 shadow-sm">
              <div className="text-[9px] font-extrabold text-violet-600 uppercase tracking-widest mb-1.5">Giacenza e prezzo</div>
              <div className="space-y-1.5">
                <div>
                  <label className={fLbl}>Filtro giacenza</label>
                  <div className="flex gap-1 items-center">
                    <select value={giacenzaMode} onChange={(e) => setGiacenzaMode(e.target.value)}
                      className="border border-neutral-300 rounded-md px-1.5 py-1.5 text-[11px] bg-white w-[52px]">
                      <option value="any">—</option>
                      <option value="gt">&gt;</option>
                      <option value="lt">&lt;</option>
                      <option value="between">tra</option>
                    </select>
                    <input type="number" value={giacenzaVal1} onChange={(e) => setGiacenzaVal1(e.target.value)}
                      className="w-14 border border-neutral-300 rounded-md px-1.5 py-1.5 text-[11px] bg-white" placeholder="da" />
                    {giacenzaMode === "between" && (
                      <input type="number" value={giacenzaVal2} onChange={(e) => setGiacenzaVal2(e.target.value)}
                        className="w-14 border border-neutral-300 rounded-md px-1.5 py-1.5 text-[11px] bg-white" placeholder="a" />
                    )}
                  </div>
                </div>
                <label className="flex items-center gap-1.5 text-[10px] text-neutral-700 cursor-pointer">
                  <input type="checkbox" checked={onlyPositiveStock} onChange={(e) => setOnlyPositiveStock(e.target.checked)}
                    className="rounded border-neutral-400 w-3.5 h-3.5" />
                  <span>Solo giacenza positiva</span>
                </label>
                <div>
                  <label className={fLbl}>Filtro prezzo carta €</label>
                  <div className="flex gap-1 items-center">
                    <select value={prezzoMode} onChange={(e) => setPrezzoMode(e.target.value)}
                      className="border border-neutral-300 rounded-md px-1.5 py-1.5 text-[11px] bg-white w-[52px]">
                      <option value="any">—</option>
                      <option value="gt">&gt;</option>
                      <option value="lt">&lt;</option>
                      <option value="between">tra</option>
                    </select>
                    <input type="number" step="0.01" value={prezzoVal1} onChange={(e) => setPrezzoVal1(e.target.value)}
                      className="w-16 border border-neutral-300 rounded-md px-1.5 py-1.5 text-[11px] bg-white" placeholder="da" />
                    {prezzoMode === "between" && (
                      <input type="number" step="0.01" value={prezzoVal2} onChange={(e) => setPrezzoVal2(e.target.value)}
                        className="w-16 border border-neutral-300 rounded-md px-1.5 py-1.5 text-[11px] bg-white" placeholder="a" />
                    )}
                  </div>
                </div>
                <label className="flex items-center gap-1.5 text-[10px] text-neutral-700 cursor-pointer">
                  <input type="checkbox" checked={onlyMissingListino} onChange={(e) => setOnlyMissingListino(e.target.checked)}
                    className="rounded border-neutral-400 w-3.5 h-3.5" />
                  <span>Solo senza listino</span>
                </label>
              </div>
            </div>

            {/* ── Azioni filtri ── */}
            <div className="flex gap-2 pt-1">
              <button type="button" onClick={clearAllFilters}
                className="flex-1 px-2 py-1.5 rounded-lg text-[10px] font-semibold border border-neutral-300 bg-white text-neutral-700 hover:bg-neutral-100 transition">
                ✕ Pulisci {activeFilterCount > 0 && <span className="text-amber-600">({activeFilterCount})</span>}
              </button>
              <button type="button" onClick={fetchVini} disabled={loading}
                className={`flex-1 px-2 py-1.5 rounded-lg text-[10px] font-semibold shadow transition ${
                  loading ? "bg-gray-400 text-white cursor-not-allowed" : "bg-amber-700 text-white hover:bg-amber-800"
                }`}>
                {loading ? "Ricarico…" : "⟳ Ricarica"}
              </button>
            </div>

            {error && <p className="text-[11px] text-red-600 font-medium">{error}</p>}

          </div>
        </div>

        {/* ══════════════════════════════════════════════
            COLONNA DESTRA: LISTA oppure DETTAGLIO
            ══════════════════════════════════════════════ */}
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">

          {/* Riepilogo tipologie (sempre visibile) */}
          {viniFiltrati.length > 0 && (
            <div className="px-3 py-2 border-b border-neutral-200 bg-white flex flex-wrap gap-1.5 items-center flex-shrink-0">
              <span className="text-[9px] font-extrabold text-neutral-400 uppercase tracking-widest mr-1">
                {riepilogoFilter ? <span className="text-amber-600">Filtro attivo</span> : "Riepilogo"}
              </span>
              {riepilogoTipologie.sorted.map(([tip, data]) => {
                const filterKey = `tipologia:${tip}`;
                const isActive = riepilogoFilter === filterKey;
                return (
                  <button key={tip} type="button"
                    onClick={() => setRiepilogoFilter(isActive ? null : filterKey)}
                    className={`inline-flex items-center gap-1 px-2 py-1 rounded-md border text-[10px] font-semibold transition cursor-pointer ${tipologiaBadgeColor(tip)} ${isActive ? "ring-2 ring-amber-400 shadow-md" : "hover:shadow-sm"}`}>
                    <span>{tip}</span>
                    <span className="opacity-60">·</span>
                    <span>{data.etichette}</span>
                    <span className="opacity-40 font-normal">({data.bottiglie}bt)</span>
                    {data.esaurite > 0 && <span className="text-[9px] text-red-600 font-bold ml-0.5">⚠{data.esaurite}</span>}
                  </button>
                );
              })}
              {riepilogoTipologie.esaurite > 0 && (
                <button type="button"
                  onClick={() => setRiepilogoFilter(riepilogoFilter === "esaurite" ? null : "esaurite")}
                  className={`inline-flex items-center gap-1 px-2 py-1 rounded-md border text-[10px] font-bold transition cursor-pointer bg-red-50 text-red-700 border-red-200 ${riepilogoFilter === "esaurite" ? "ring-2 ring-red-400 shadow-md" : "hover:shadow-sm"}`}>
                  🔄 {riepilogoTipologie.esaurite}
                </button>
              )}
              <span className="ml-auto text-[10px] text-neutral-500 flex-shrink-0">
                {viniFiltrati.length} etichette · {riepilogoTipologie.totBotQ} bt
              </span>
            </div>
          )}

          {/* ── VISTA: LISTA VINI (quando nessun dettaglio aperto) ── */}
          {!showDetailView && (
            <div className="flex-1 overflow-auto min-h-0">
              <table className="w-full text-[11px]">
                <thead className="bg-neutral-100 sticky top-0 z-10">
                  <tr className="text-[9px] text-neutral-600 uppercase tracking-wide select-none">
                    <th className="px-1.5 py-2 text-center w-8">
                      <input type="checkbox" checked={viniVisibili.length > 0 && selectedIds.length === viniVisibili.length}
                        onChange={toggleSelectAll} className="rounded border-violet-400 text-violet-600 focus:ring-violet-300 w-3.5 h-3.5" />
                    </th>
                    <th className="px-2 py-2 text-left w-12 cursor-pointer hover:text-amber-700 transition" onClick={() => handleSort("id")}>
                      ID <SortIcon col="id" />
                    </th>
                    <th className="px-2 py-2 text-left cursor-pointer hover:text-amber-700 transition" onClick={() => handleSort("descrizione")}>
                      Vino <SortIcon col="descrizione" />
                    </th>
                    <th className="px-2 py-2 text-left w-20 cursor-pointer hover:text-amber-700 transition" onClick={() => handleSort("produttore")}>
                      Produttore <SortIcon col="produttore" />
                    </th>
                    <th className="px-2 py-2 text-left w-16 cursor-pointer hover:text-amber-700 transition" onClick={() => handleSort("origine")}>
                      Origine <SortIcon col="origine" />
                    </th>
                    <th className="px-2 py-2 text-center w-10 cursor-pointer hover:text-amber-700 transition" onClick={() => handleSort("qta")}>
                      Qta <SortIcon col="qta" />
                    </th>
                    <th className="px-2 py-2 text-center w-14 cursor-pointer hover:text-amber-700 transition" onClick={() => handleSort("prezzo")}>
                      Prezzo <SortIcon col="prezzo" />
                    </th>
                    <th className="px-2 py-2 text-center w-20">Flag</th>
                  </tr>
                </thead>
                <tbody>
                  {viniVisibili.map((vino) => {
                    const tot = vino.QTA_TOTALE ?? (vino.QTA_FRIGO ?? 0) + (vino.QTA_LOC1 ?? 0) + (vino.QTA_LOC2 ?? 0) + (vino.QTA_LOC3 ?? 0);
                    const isBulkSelected = selectedIds.includes(vino.id);
                    return (
                      <tr key={vino.id}
                        className={
                          "cursor-pointer border-b border-neutral-100 hover:bg-amber-50/70 transition " +
                          (isBulkSelected ? "bg-violet-50/80 " : (tipologiaRowColor(vino.TIPOLOGIA) || "bg-white"))
                        }
                        onClick={() => handleRowClick(vino)}>
                        <td className="px-1.5 py-1.5 text-center" onClick={e => e.stopPropagation()}>
                          <input type="checkbox" checked={isBulkSelected}
                            onChange={() => toggleSelectId(vino.id)}
                            className="rounded border-violet-400 text-violet-600 focus:ring-violet-300 w-3.5 h-3.5" />
                        </td>
                        <td className="px-2 py-1.5 whitespace-nowrap">
                          <span className="inline-flex items-center bg-slate-700 text-white text-[10px] font-bold px-1.5 py-0.5 rounded font-mono">
                            #{vino.id}
                          </span>
                        </td>
                        <td className="px-2 py-1.5">
                          <div className="font-semibold text-neutral-900 truncate max-w-[240px]">{vino.DESCRIZIONE}</div>
                          {vino.DENOMINAZIONE && <div className="text-[10px] text-neutral-500 truncate max-w-[240px]">{vino.DENOMINAZIONE}</div>}
                        </td>
                        <td className="px-2 py-1.5 text-neutral-700 truncate max-w-[100px]">{vino.PRODUTTORE || "—"}</td>
                        <td className="px-2 py-1.5 text-[10px] text-neutral-600 truncate max-w-[90px]">
                          {vino.NAZIONE}{vino.REGIONE ? ` / ${vino.REGIONE}` : ""}
                        </td>
                        <td className="px-2 py-1.5 text-center font-bold text-neutral-900">{tot}</td>
                        <td className="px-2 py-1.5 text-center text-[10px] text-neutral-600">
                          {vino.PREZZO_CARTA ? `€${Number(vino.PREZZO_CARTA).toLocaleString("it-IT", { minimumFractionDigits: 0 })}` : "—"}
                        </td>
                        <td className="px-1 py-1.5 text-center">
                          <div className="flex flex-wrap gap-0.5 justify-center">
                            {vino.CARTA === "SI" && <span className="inline-block px-1 py-0 rounded text-[8px] font-bold bg-emerald-100 text-emerald-700 border border-emerald-200" title="Carta Vini">C</span>}
                            {vino.IPRATICO === "SI" && <span className="inline-block px-1 py-0 rounded text-[8px] font-bold bg-sky-100 text-sky-700 border border-sky-200" title="iPratico">iP</span>}
                            {vino.VENDITA_CALICE === "SI" && <span className="inline-block px-1 py-0 rounded text-[8px] font-bold bg-amber-100 text-amber-700 border border-amber-200" title="Calice">🥂</span>}
                            {vino.BIOLOGICO === "SI" && <span className="inline-block px-1 py-0 rounded text-[8px] font-bold bg-lime-100 text-lime-700 border border-lime-200" title="Biologico">🌿</span>}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {viniVisibili.length === 0 && !loading && (
                    <tr>
                      <td colSpan={8} className="px-4 py-8 text-center text-sm text-neutral-500">
                        Nessun vino trovato con i filtri attuali.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
              {loading && (
                <div className="px-4 py-3 text-xs text-neutral-600 bg-neutral-50 border-t border-neutral-200">
                  Caricamento dati magazzino…
                </div>
              )}
            </div>
          )}

          {/* ── VISTA: DETTAGLIO VINO (sostituisce la lista) ── */}
          {openSchedaId && !bulkEditOpen && (() => {
            const curIdx = viniVisibili.findIndex(v => v.id === openSchedaId);
            const prevVino = curIdx > 0 ? viniVisibili[curIdx - 1] : null;
            const nextVino = curIdx >= 0 && curIdx < viniVisibili.length - 1 ? viniVisibili[curIdx + 1] : null;
            const goTo = (vino) => {
              if (schedaCompRef.current?.hasPendingChanges?.()) {
                if (!window.confirm("Hai modifiche non salvate. Vuoi passare a un altro vino?")) return;
              }
              setOpenSchedaId(vino.id);
            };
            return (
            <div className="flex-1 overflow-auto min-h-0">
              {/* Barra navigazione */}
              <div className="px-3 py-2 bg-amber-50 border-b border-amber-200 flex items-center gap-2 flex-shrink-0">
                <button onClick={() => setOpenSchedaId(null)}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-white border border-neutral-300 hover:bg-neutral-50 transition shadow-sm">
                  ← Lista
                </button>
                <div className="flex items-center gap-1 ml-2">
                  <button onClick={() => prevVino && goTo(prevVino)} disabled={!prevVino}
                    className="px-2 py-1 rounded-md text-xs font-bold bg-white border border-neutral-300 hover:bg-amber-100 transition shadow-sm disabled:opacity-30 disabled:cursor-not-allowed"
                    title={prevVino ? `← ${prevVino.DESCRIZIONE}` : "Primo vino"}>
                    ‹
                  </button>
                  <span className="text-[10px] text-amber-700 font-medium min-w-[60px] text-center">
                    {curIdx >= 0 ? `${curIdx + 1} / ${viniVisibili.length}` : "—"}
                  </span>
                  <button onClick={() => nextVino && goTo(nextVino)} disabled={!nextVino}
                    className="px-2 py-1 rounded-md text-xs font-bold bg-white border border-neutral-300 hover:bg-amber-100 transition shadow-sm disabled:opacity-30 disabled:cursor-not-allowed"
                    title={nextVino ? `→ ${nextVino.DESCRIZIONE}` : "Ultimo vino"}>
                    ›
                  </button>
                </div>
                <span className="text-xs text-amber-800 font-medium ml-2">
                  #{openSchedaId}
                </span>
              </div>
              <div className="p-3" ref={schedaRef}>
                <SchedaVino
                  ref={schedaCompRef}
                  vinoId={openSchedaId}
                  inline={true}
                  onClose={() => { setOpenSchedaId(null); }}
                  onVinoUpdated={(updatedVino) => {
                    setVini(prev => prev.map(v => v.id === updatedVino.id ? { ...v, ...updatedVino } : v));
                  }}
                />
              </div>
            </div>
            );
          })()}

          {/* ── VISTA: BULK EDIT (sostituisce la lista) ── */}
          {canBulkEdit && bulkEditOpen && selectedIds.length > 0 && (
            <div className="flex-1 overflow-auto min-h-0">
              {/* Barra "torna alla lista" */}
              <div className="px-3 py-2 bg-violet-50 border-b border-violet-200 flex items-center gap-3 flex-shrink-0">
                <button onClick={() => { setBulkEditOpen(false); }}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-white border border-neutral-300 hover:bg-neutral-50 transition shadow-sm">
                  ← Torna alla lista
                </button>
                <span className="text-xs text-violet-800 font-medium">
                  Modifica massiva — {selectedIds.length} vini
                </span>
              </div>
              <div ref={bulkPanelRef} className="p-4">
                <p className="text-xs text-neutral-500 mb-2">
                  I campi con valore uniforme sono pre-compilati. Modifica solo quelli che vuoi cambiare.
                </p>
                <div className="flex gap-4 mb-4 text-[10px]">
                  <span className="flex items-center gap-1"><span className="w-3 h-3 rounded border-2 border-emerald-400 bg-emerald-50 inline-block"></span> Valore uniforme</span>
                  <span className="flex items-center gap-1"><span className="w-3 h-3 rounded border-2 border-neutral-300 bg-white inline-block"></span> Valori diversi</span>
                </div>

                <div className="space-y-4">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <div>
                      <label className="block text-[11px] font-semibold text-neutral-600 uppercase tracking-wide mb-0.5">Tipologia</label>
                      <select name="TIPOLOGIA" value={bulkData.TIPOLOGIA ?? ""} onChange={e => bulkFieldSet(e.target.name, e.target.value)} className={bfClass("TIPOLOGIA")}>
                        <option value="">{bfPlaceholder("TIPOLOGIA")}</option>
                        {(tabellaOpts.tipologie || []).map(t => <option key={t} value={t}>{t}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-neutral-600 uppercase tracking-wide mb-0.5">Nazione</label>
                      <select name="NAZIONE" value={bulkData.NAZIONE ?? ""} onChange={e => bulkFieldSet(e.target.name, e.target.value)} className={bfClass("NAZIONE")}>
                        <option value="">{bfPlaceholder("NAZIONE")}</option>
                        {(tabellaOpts.nazioni || []).map(t => <option key={t} value={t}>{t}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-neutral-600 uppercase tracking-wide mb-0.5">Regione</label>
                      <select name="REGIONE" value={bulkData.REGIONE ?? ""} onChange={e => bulkFieldSet(e.target.name, e.target.value)} className={bfClass("REGIONE")}>
                        <option value="">{bfPlaceholder("REGIONE")}</option>
                        {(tabellaOpts.regioni || []).map(t => <option key={typeof t === "object" ? t.nome : t} value={typeof t === "object" ? t.nome : t}>{typeof t === "object" ? t.nome : t}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-neutral-600 uppercase tracking-wide mb-0.5">Formato</label>
                      <select name="FORMATO" value={bulkData.FORMATO ?? ""} onChange={e => bulkFieldSet(e.target.name, e.target.value)} className={bfClass("FORMATO")}>
                        <option value="">{bfPlaceholder("FORMATO")}</option>
                        {(tabellaOpts.formati || []).map(t => <option key={typeof t === "object" ? t.formato : t} value={typeof t === "object" ? t.formato : t}>{typeof t === "object" ? t.formato : t}</option>)}
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div>
                      <label className="block text-[11px] font-semibold text-neutral-600 uppercase tracking-wide mb-0.5">Produttore</label>
                      <input type="text" name="PRODUTTORE" value={bulkData.PRODUTTORE ?? ""} onChange={e => bulkFieldSet(e.target.name, e.target.value)}
                        placeholder={bfPlaceholder("PRODUTTORE")} className={bfClass("PRODUTTORE")} />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-neutral-600 uppercase tracking-wide mb-0.5">Distributore</label>
                      <input type="text" name="DISTRIBUTORE" value={bulkData.DISTRIBUTORE ?? ""} onChange={e => bulkFieldSet(e.target.name, e.target.value)}
                        placeholder={bfPlaceholder("DISTRIBUTORE")} className={bfClass("DISTRIBUTORE")} />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-neutral-600 uppercase tracking-wide mb-0.5">Rappresentante</label>
                      <input type="text" name="RAPPRESENTANTE" value={bulkData.RAPPRESENTANTE ?? ""} onChange={e => bulkFieldSet(e.target.name, e.target.value)}
                        placeholder={bfPlaceholder("RAPPRESENTANTE")} className={bfClass("RAPPRESENTANTE")} />
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <label className="block text-[11px] font-semibold text-neutral-600 uppercase tracking-wide mb-0.5">Prezzo carta €</label>
                      <input type="number" step="0.01" name="PREZZO_CARTA" value={bulkData.PREZZO_CARTA ?? ""} onChange={e => bulkFieldSet(e.target.name, e.target.value)}
                        placeholder={bfPlaceholder("PREZZO_CARTA")} className={bfClass("PREZZO_CARTA")} />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-neutral-600 uppercase tracking-wide mb-0.5">Listino €</label>
                      <input type="number" step="0.01" name="EURO_LISTINO" value={bulkData.EURO_LISTINO ?? ""} onChange={e => bulkFieldSet(e.target.name, e.target.value)}
                        placeholder={bfPlaceholder("EURO_LISTINO")} className={bfClass("EURO_LISTINO")} />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-neutral-600 uppercase tracking-wide mb-0.5">Sconto %</label>
                      <input type="number" step="0.01" name="SCONTO" value={bulkData.SCONTO ?? ""} onChange={e => bulkFieldSet(e.target.name, e.target.value)}
                        placeholder={bfPlaceholder("SCONTO")} className={bfClass("SCONTO")} />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <div>
                      <label className="block text-[11px] font-semibold text-neutral-600 uppercase tracking-wide mb-0.5">Carta Vini</label>
                      <select name="CARTA" value={bulkData.CARTA ?? ""} onChange={e => bulkFieldSet(e.target.name, e.target.value)} className={bfClass("CARTA")}>
                        <option value="">{bfPlaceholder("CARTA")}</option><option value="SI">SI</option><option value="NO">NO</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-neutral-600 uppercase tracking-wide mb-0.5">iPratico</label>
                      <select name="IPRATICO" value={bulkData.IPRATICO ?? ""} onChange={e => bulkFieldSet(e.target.name, e.target.value)} className={bfClass("IPRATICO")}>
                        <option value="">{bfPlaceholder("IPRATICO")}</option><option value="SI">SI</option><option value="NO">NO</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-neutral-600 uppercase tracking-wide mb-0.5">Biologico</label>
                      <select name="BIOLOGICO" value={bulkData.BIOLOGICO ?? ""} onChange={e => bulkFieldSet(e.target.name, e.target.value)} className={bfClass("BIOLOGICO")}>
                        <option value="">{bfPlaceholder("BIOLOGICO")}</option><option value="SI">SI</option><option value="NO">NO</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-neutral-600 uppercase tracking-wide mb-0.5">Calice</label>
                      <select name="VENDITA_CALICE" value={bulkData.VENDITA_CALICE ?? ""} onChange={e => bulkFieldSet(e.target.name, e.target.value)} className={bfClass("VENDITA_CALICE")}>
                        <option value="">{bfPlaceholder("VENDITA_CALICE")}</option><option value="SI">SI</option><option value="NO">NO</option>
                      </select>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                    <div>
                      <label className="block text-[11px] font-semibold text-neutral-600 uppercase tracking-wide mb-0.5">Stato vendita</label>
                      <select name="STATO_VENDITA" value={bulkData.STATO_VENDITA ?? ""} onChange={e => bulkFieldSet(e.target.name, e.target.value)} className={bfClass("STATO_VENDITA")}>
                        <option value="">{bfPlaceholder("STATO_VENDITA")}</option>
                        {STATO_VENDITA_OPTIONS.filter(o => o.value).map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-neutral-600 uppercase tracking-wide mb-0.5">Stato riordino</label>
                      <select name="STATO_RIORDINO" value={bulkData.STATO_RIORDINO ?? ""} onChange={e => bulkFieldSet(e.target.name, e.target.value)} className={bfClass("STATO_RIORDINO")}>
                        <option value="">{bfPlaceholder("STATO_RIORDINO")}</option>
                        {STATO_RIORDINO_OPTIONS.filter(o => o.value).map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-neutral-600 uppercase tracking-wide mb-0.5">Stato conservazione</label>
                      <select name="STATO_CONSERVAZIONE" value={bulkData.STATO_CONSERVAZIONE ?? ""} onChange={e => bulkFieldSet(e.target.name, e.target.value)} className={bfClass("STATO_CONSERVAZIONE")}>
                        <option value="">{bfPlaceholder("STATO_CONSERVAZIONE")}</option>
                        {STATO_CONSERVAZIONE_OPTIONS.filter(o => o.value).map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-neutral-600 uppercase tracking-wide mb-0.5">Note interne</label>
                    <textarea name="NOTE" value={bulkData.NOTE ?? ""} onChange={e => bulkFieldSet(e.target.name, e.target.value)}
                      rows={2} placeholder={bfPlaceholder("NOTE")} className={bfClass("NOTE")} />
                  </div>
                </div>

                <div className="flex items-center gap-3 mt-5 pt-4 border-t border-neutral-200">
                  <button onClick={submitBulkEdit} disabled={bulkSaving || bulkTouched.size === 0}
                    className="px-5 py-2 rounded-xl text-sm font-bold bg-amber-700 text-white hover:bg-amber-800 shadow transition disabled:opacity-40 disabled:cursor-not-allowed">
                    {bulkSaving ? "Salvataggio…" : `💾 Applica a ${selectedIds.length} vini`}
                  </button>
                  <button onClick={() => setBulkEditOpen(false)}
                    className="px-4 py-2 rounded-xl text-sm font-medium border border-neutral-300 bg-white hover:bg-neutral-50 transition">
                    Annulla
                  </button>
                  {bulkTouched.size > 0 && (
                    <span className="text-xs text-violet-600 font-semibold">
                      {bulkTouched.size} camp{bulkTouched.size === 1 ? "o" : "i"} modificat{bulkTouched.size === 1 ? "o" : "i"}
                    </span>
                  )}
                </div>

                {bulkResult && (
                  <div className={`mt-3 p-3 rounded-lg text-sm ${bulkResult.status === "ok" ? "bg-emerald-50 text-emerald-800 border border-emerald-200" : "bg-red-50 text-red-800 border border-red-200"}`}>
                    {bulkResult.status === "ok"
                      ? `✅ Aggiornati ${bulkResult.updated} vini${bulkResult.errors?.length ? `. Errori: ${bulkResult.errors.join(", ")}` : ""}`
                      : `❌ ${bulkResult.message || "Errore"}`}
                  </div>
                )}
              </div>
            </div>
          )}

        </div>
      </div>

      {showStampaFiltrata && (
        <StampaFiltrata onClose={() => setShowStampaFiltrata(false)} />
      )}

      {/* BARRA FISSA IN BASSO — selezione multipla */}
      {selectedIds.length > 0 && !bulkEditOpen && (
        <div className="fixed bottom-0 left-0 right-0 z-50 bg-violet-700 text-white shadow-2xl border-t-2 border-violet-400">
          <div className="max-w-[1100px] mx-auto px-4 py-2.5 flex items-center justify-between gap-3">
            <span className="text-xs font-semibold">
              {selectedIds.length} selezionat{selectedIds.length === 1 ? "o" : "i"}
            </span>
            <div className="flex items-center gap-2">
              {canBulkEdit && (
                <button onClick={openBulkEdit}
                  className="px-4 py-1.5 rounded-lg text-xs font-bold bg-white text-violet-800 hover:bg-violet-50 transition shadow">
                  ✏️ Modifica
                </button>
              )}
              {canBulkEdit && (
                <button onClick={handleBulkDuplicate} disabled={bulkDuplicating}
                  className="px-4 py-1.5 rounded-lg text-xs font-bold bg-blue-400 text-blue-900 hover:bg-blue-300 transition shadow disabled:opacity-40">
                  {bulkDuplicating ? "Duplico…" : "📋 Duplica"}
                </button>
              )}
              {canPrint && (
                <button onClick={handlePrintSelection}
                  className="px-4 py-1.5 rounded-lg text-xs font-bold bg-emerald-400 text-emerald-900 hover:bg-emerald-300 transition shadow">
                  🖨️ Stampa
                </button>
              )}
              <button onClick={() => setSelectedIds([])}
                className="px-3 py-1.5 rounded-lg text-[10px] font-medium border border-violet-400 text-violet-100 hover:bg-violet-600 transition">
                Deseleziona
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── TOAST NOTIFICA GLOBALE ── */}
      {toast && (
        <div className={`fixed top-6 left-1/2 -translate-x-1/2 z-[999] px-6 py-3 rounded-xl shadow-2xl text-sm font-semibold
          transition-all animate-[fadeSlide_0.3s_ease-out]
          ${toast.type === "ok"
            ? "bg-emerald-600 text-white border border-emerald-400"
            : "bg-red-600 text-white border border-red-400"}`}>
          {toast.message}
        </div>
      )}
    </div>
  );
}