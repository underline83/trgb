// @version: v3.0-riconciliazione-banca
// Scadenzario Uscite — layout Cantina: filtri SX, KPI in alto, tabella sticky sortable
// + Riconciliazione Banca: match uscite ↔ movimenti bancari
import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { API_BASE, apiFetch } from "../../config/api";

const fmt = (n) => n != null ? Number(n).toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "—";
const fmtDate = (d) => d ? new Date(d + "T00:00:00").toLocaleDateString("it-IT", { day: "2-digit", month: "short" }) : null;
const fmtDateFull = (d) => d ? new Date(d + "T00:00:00").toLocaleDateString("it-IT", { day: "2-digit", month: "short", year: "2-digit" }) : null;
const giorniA = (d) => d ? Math.ceil((new Date(d) - new Date()) / 86400000) : null;

const STATO_STYLE = {
  DA_PAGARE:       { bg: "bg-amber-100", text: "text-amber-800", border: "border-amber-200", label: "Da pagare" },
  SCADUTA:         { bg: "bg-red-100",   text: "text-red-800",   border: "border-red-200",   label: "Scaduta" },
  PAGATA:          { bg: "bg-emerald-100", text: "text-emerald-800", border: "border-emerald-200", label: "Pagata" },
  PAGATA_MANUALE:  { bg: "bg-teal-100",  text: "text-teal-800",  border: "border-teal-200",  label: "Pagata *" },
  PARZIALE:        { bg: "bg-blue-100",  text: "text-blue-800",  border: "border-blue-200",  label: "Parziale" },
};

const TIPO_USCITA_STYLE = {
  FATTURA:      { label: "Fattura", color: "bg-sky-50 text-sky-700 border-sky-200" },
  SPESA_FISSA:  { label: "Spesa fissa", color: "bg-indigo-50 text-indigo-700 border-indigo-200" },
  STIPENDIO:    { label: "Stipendio", color: "bg-purple-50 text-purple-700 border-purple-200" },
};

// ── Sort helper ──
function sortRows(rows, sortCol, sortDir) {
  if (!sortCol) return rows;
  return [...rows].sort((a, b) => {
    let va = a[sortCol], vb = b[sortCol];
    if (va == null && vb == null) return 0;
    if (va == null) return 1;
    if (vb == null) return -1;
    if (typeof va === "number" && typeof vb === "number") return sortDir === "asc" ? va - vb : vb - va;
    va = String(va).toLowerCase(); vb = String(vb).toLowerCase();
    return sortDir === "asc" ? va.localeCompare(vb, "it") : vb.localeCompare(va, "it");
  });
}

export default function ControlloGestioneUscite() {
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const importDone = useRef(false);

  // ── Filtri (locali, no API) ──
  const [search, setSearch] = useState("");
  const [filtroStato, setFiltroStato] = useState("");
  const [filtroTipo, setFiltroTipo] = useState(""); // FATTURA | SPESA_FISSA | ""
  const [filtroDa, setFiltroDa] = useState("");
  const [filtroA, setFiltroA] = useState("");
  const [sortCol, setSortCol] = useState("data_scadenza");
  const [sortDir, setSortDir] = useState("asc");

  // ── Selezione multipla + bulk payment ──
  const [selected, setSelected] = useState(new Set());
  const [bulkMetodo, setBulkMetodo] = useState("CONTO_CORRENTE");
  const [bulkSaving, setBulkSaving] = useState(false);

  // ── Modale modifica scadenza ──
  const [modaleScadenza, setModaleScadenza] = useState(null); // { id, fornitore_nome, totale, data_scadenza, data_scadenza_originale, stato }
  const [nuovaScadenza, setNuovaScadenza] = useState("");
  const [savingScadenza, setSavingScadenza] = useState(false);

  // ── Modale riconciliazione ──
  const [modaleBanca, setModaleBanca] = useState(null); // { uscita_id, fornitore, totale }
  const [candidati, setCandidati] = useState([]);
  const [loadingCandidati, setLoadingCandidati] = useState(false);
  const [linkingId, setLinkingId] = useState(null);

  // ── Auto-import + fetch ──
  const fetchData = useCallback(async (doImport = false) => {
    setLoading(true);
    try {
      if (doImport) {
        try {
          await apiFetch(`${API_BASE}/controllo-gestione/uscite/import`, { method: "POST" });
        } catch (importErr) {
          console.warn("Import non riuscito (i dati esistenti verranno comunque caricati):", importErr);
        }
      }
      const res = await apiFetch(`${API_BASE}/controllo-gestione/uscite`);
      if (!res.ok) throw new Error("Errore API");
      setData(await res.json());
    } catch (e) {
      console.error("Errore caricamento uscite:", e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Auto-import al primo caricamento
    if (!importDone.current) {
      importDone.current = true;
      fetchData(true);
    } else {
      fetchData(false);
    }
  }, []); // eslint-disable-line

  const allUscite = data?.uscite || [];
  const rig = data?.riepilogo || {};

  // ── Filtraggio locale ──
  const filtered = useMemo(() => {
    let rows = allUscite;
    if (search) {
      const s = search.toLowerCase();
      rows = rows.filter(u =>
        (u.fornitore_nome || "").toLowerCase().includes(s) ||
        (u.numero_fattura || "").toLowerCase().includes(s) ||
        (u.note || "").toLowerCase().includes(s) ||
        (u.periodo_riferimento || "").toLowerCase().includes(s) ||
        (u.sf_tipo_label || "").toLowerCase().includes(s) ||
        (u.data_scadenza || "").includes(s) ||
        String(u.totale || "").includes(s)
      );
    }
    if (filtroStato) {
      if (filtroStato === "PAGATA") {
        rows = rows.filter(u => u.stato === "PAGATA" || u.stato === "PAGATA_MANUALE");
      } else {
        rows = rows.filter(u => u.stato === filtroStato);
      }
    }
    if (filtroTipo) rows = rows.filter(u => (u.tipo_uscita || "FATTURA") === filtroTipo);
    if (filtroDa) rows = rows.filter(u => u.data_scadenza && u.data_scadenza >= filtroDa);
    if (filtroA) rows = rows.filter(u => u.data_scadenza && u.data_scadenza <= filtroA);
    return rows;
  }, [allUscite, search, filtroStato, filtroTipo, filtroDa, filtroA]);

  // ── Sorting locale ──
  const sorted = useMemo(() => sortRows(filtered, sortCol, sortDir), [filtered, sortCol, sortDir]);

  // ── KPI calcolati sui filtrati ──
  const kpi = useMemo(() => {
    const dp = filtered.filter(u => u.stato === "DA_PAGARE");
    const sc = filtered.filter(u => u.stato === "SCADUTA");
    const pg = filtered.filter(u => u.stato === "PAGATA" || u.stato === "PAGATA_MANUALE" || u.stato === "PARZIALE");
    return {
      da_pagare: dp.reduce((s, u) => s + (u.totale - u.importo_pagato), 0),
      n_da_pagare: dp.length,
      scadute: sc.reduce((s, u) => s + (u.totale - u.importo_pagato), 0),
      n_scadute: sc.length,
      pagate: pg.reduce((s, u) => s + u.importo_pagato, 0),
      n_pagate: pg.length,
      totale: filtered.length,
    };
  }, [filtered]);

  const handleSort = (col) => {
    if (sortCol === col) {
      setSortDir(d => d === "asc" ? "desc" : "asc");
    } else {
      setSortCol(col);
      setSortDir("asc");
    }
  };

  const SortIcon = ({ col }) => {
    if (sortCol !== col) return <span className="text-neutral-300 ml-0.5">{"\u2195"}</span>;
    return <span className="text-sky-600 ml-0.5">{sortDir === "asc" ? "\u2191" : "\u2193"}</span>;
  };

  // ── Riconciliazione: apri modale ──
  const apriRiconciliazione = async (uscita) => {
    setModaleBanca({ id: uscita.id, fornitore: uscita.fornitore_nome, totale: uscita.totale });
    setCandidati([]);
    setLoadingCandidati(true);
    try {
      const res = await apiFetch(`${API_BASE}/controllo-gestione/uscite/${uscita.id}/candidati-banca`);
      if (!res.ok) throw new Error("Errore API");
      const json = await res.json();
      setCandidati(json.candidati || []);
    } catch (e) {
      console.error("Errore candidati banca:", e);
    } finally {
      setLoadingCandidati(false);
    }
  };

  // ── Riconciliazione: collega ──
  const collegaMovimento = async (banca_movimento_id) => {
    if (!modaleBanca) return;
    setLinkingId(banca_movimento_id);
    try {
      const res = await apiFetch(`${API_BASE}/controllo-gestione/uscite/${modaleBanca.id}/riconcilia`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ banca_movimento_id }),
      });
      if (!res.ok) throw new Error("Errore API");
      const json = await res.json();
      if (json.ok) {
        setModaleBanca(null);
        fetchData(false); // Refresh tabella
      } else {
        alert(json.error || "Errore");
      }
    } catch (e) {
      console.error("Errore riconciliazione:", e);
      alert("Errore di rete");
    } finally {
      setLinkingId(null);
    }
  };

  // ── Riconciliazione: scollega ──
  const scollegaMovimento = async (uscita_id) => {
    if (!confirm("Scollegare il movimento bancario? Lo stato tornerà a 'Pagata *'")) return;
    try {
      const res = await apiFetch(`${API_BASE}/controllo-gestione/uscite/${uscita_id}/riconcilia`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Errore API");
      fetchData(false);
    } catch (e) {
      console.error("Errore scollega:", e);
      alert("Errore di rete");
    }
  };

  // ── Modifica scadenza ──
  const apriModaleScadenza = (u) => {
    // Non aprire per righe riconciliate via banca
    if (u.stato === "PAGATA") return;
    setModaleScadenza(u);
    setNuovaScadenza(u.data_scadenza || "");
  };
  const salvaScadenza = async () => {
    if (!modaleScadenza || !nuovaScadenza) return;
    setSavingScadenza(true);
    try {
      const res = await apiFetch(`${API_BASE}/controllo-gestione/uscite/${modaleScadenza.id}/scadenza`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ data_scadenza: nuovaScadenza }),
      });
      if (!res.ok) throw new Error("Errore API");
      const json = await res.json();
      if (json.ok) {
        setModaleScadenza(null);
        fetchData(false);
      } else {
        alert(json.error || "Errore");
      }
    } catch (e) {
      console.error("Errore modifica scadenza:", e);
      alert("Errore di rete");
    } finally {
      setSavingScadenza(false);
    }
  };

  // ── Selezione multipla helpers ──
  const toggleSelect = (id) => {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };
  const selezionabili = useMemo(() =>
    sorted.filter(u => ["DA_PAGARE", "SCADUTA", "PARZIALE"].includes(u.stato)).map(u => u.id),
    [sorted]
  );
  const allSelected = selezionabili.length > 0 && selezionabili.every(id => selected.has(id));
  const toggleAll = () => {
    if (allSelected) {
      setSelected(new Set());
    } else {
      setSelected(new Set(selezionabili));
    }
  };

  // ── Bulk payment ──
  const segnaPagateBulk = async () => {
    if (selected.size === 0) return;
    if (!confirm(`Segnare ${selected.size} uscit${selected.size === 1 ? "a" : "e"} come pagate (${bulkMetodo.replace("_", " ")})?`)) return;
    setBulkSaving(true);
    try {
      const res = await apiFetch(`${API_BASE}/controllo-gestione/uscite/segna-pagate-bulk`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: [...selected], metodo_pagamento: bulkMetodo }),
      });
      if (!res.ok) throw new Error("Errore API");
      const json = await res.json();
      if (json.ok) {
        setSelected(new Set());
        fetchData(false);
      } else {
        alert(json.error || "Errore");
      }
    } catch (e) {
      console.error("Errore bulk payment:", e);
      alert("Errore di rete");
    } finally {
      setBulkSaving(false);
    }
  };

  const activeFilters = [search, filtroStato, filtroTipo, filtroDa, filtroA].filter(Boolean).length;
  const clearFilters = () => { setSearch(""); setFiltroStato(""); setFiltroTipo(""); setFiltroDa(""); setFiltroA(""); };

  const fLbl = "block text-[10px] font-semibold text-neutral-500 uppercase tracking-wide mb-0.5";
  const fSel = "w-full border border-neutral-300 rounded-lg px-2 py-1.5 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-sky-300";
  const fInp = fSel;

  return (
    <div className="min-h-screen bg-neutral-100">
      {/* HEADER BAR */}
      <div className="bg-white border-b border-neutral-200 px-4 py-2.5 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate("/controllo-gestione")}
            className="text-neutral-400 hover:text-neutral-600 text-sm">&larr;</button>
          <h1 className="text-lg font-bold text-sky-900 font-playfair">Scadenzario Uscite</h1>
          <span className="text-[10px] text-neutral-400">{loading ? "Caricamento..." : `${sorted.length} righe`}</span>
        </div>
        <button onClick={() => navigate("/controllo-gestione/spese-fisse")}
          className="px-3 py-1 text-xs rounded-lg border border-indigo-200 text-indigo-700 hover:bg-indigo-50">
          Gestisci Spese Fisse
        </button>
      </div>

      {/* LAYOUT: Filtri SX + Contenuto DX */}
      <div className="flex" style={{ height: "calc(100vh - 49px)" }}>

        {/* ══════ SIDEBAR FILTRI ══════ */}
        <div className="w-[240px] min-w-[240px] border-r border-neutral-200 bg-neutral-50 overflow-y-auto flex-shrink-0">
          <div className="p-2.5 space-y-2">

            {/* Ricerca */}
            <div className="bg-white rounded-lg p-2.5 border border-neutral-200 shadow-sm">
              <div className="text-[9px] font-extrabold text-neutral-400 uppercase tracking-widest mb-1.5">Ricerca</div>
              <input type="text" value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Fornitore, fattura, importo, note..." className={fInp} />
            </div>

            {/* Stato */}
            <div className="bg-sky-50/50 rounded-lg p-2.5 border border-sky-100 shadow-sm">
              <div className="text-[9px] font-extrabold text-sky-600 uppercase tracking-widest mb-1.5">Stato</div>
              <div className="space-y-1">
                {[
                  { value: "", label: "Tutti", n: allUscite.length },
                  { value: "DA_PAGARE", label: "Da pagare", n: allUscite.filter(u => u.stato === "DA_PAGARE").length },
                  { value: "SCADUTA", label: "Scadute", n: allUscite.filter(u => u.stato === "SCADUTA").length },
                  { value: "PAGATA", label: "Pagate", n: allUscite.filter(u => u.stato === "PAGATA" || u.stato === "PAGATA_MANUALE").length },
                ].map(o => (
                  <button key={o.value} onClick={() => setFiltroStato(filtroStato === o.value ? "" : o.value)}
                    className={`w-full text-left px-2 py-1 rounded-md text-xs transition flex justify-between ${
                      filtroStato === o.value ? "bg-sky-200 text-sky-900 font-semibold" : "hover:bg-sky-100 text-neutral-700"
                    }`}>
                    <span>{o.label}</span>
                    <span className="text-neutral-400 font-normal">{o.n}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Tipo */}
            <div className="bg-indigo-50/40 rounded-lg p-2.5 border border-indigo-100 shadow-sm">
              <div className="text-[9px] font-extrabold text-indigo-600 uppercase tracking-widest mb-1.5">Tipo</div>
              <div className="space-y-1">
                {[
                  { value: "", label: "Tutti" },
                  { value: "FATTURA", label: "Fatture" },
                  { value: "SPESA_FISSA", label: "Spese fisse" },
                ].map(o => (
                  <button key={o.value} onClick={() => setFiltroTipo(filtroTipo === o.value ? "" : o.value)}
                    className={`w-full text-left px-2 py-1 rounded-md text-xs transition ${
                      filtroTipo === o.value ? "bg-indigo-200 text-indigo-900 font-semibold" : "hover:bg-indigo-100 text-neutral-700"
                    }`}>
                    {o.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Periodo */}
            <div className="bg-amber-50/40 rounded-lg p-2.5 border border-amber-100 shadow-sm">
              <div className="text-[9px] font-extrabold text-amber-600 uppercase tracking-widest mb-1.5">Periodo Scadenza</div>
              {/* Pulsanti rapidi */}
              <div className="flex flex-wrap gap-1 mb-2">
                {(() => {
                  const oggi = new Date();
                  const y = oggi.getFullYear();
                  const m = oggi.getMonth(); // 0-based
                  const pad = (n) => String(n).padStart(2, "0");
                  const primoMese = `${y}-${pad(m + 1)}-01`;
                  const ultimoMese = `${y}-${pad(m + 1)}-${new Date(y, m + 1, 0).getDate()}`;
                  const meseProssimo1 = m + 1 > 11 ? `${y + 1}-01-01` : `${y}-${pad(m + 2)}-01`;
                  const meseProssimo2 = m + 1 > 11
                    ? `${y + 1}-01-${new Date(y + 1, 1, 0).getDate()}`
                    : `${y}-${pad(m + 2)}-${new Date(y, m + 2, 0).getDate()}`;
                  const inizioTrim = `${y}-${pad(m - (m % 3) + 1)}-01`;
                  const fineTrimM = m - (m % 3) + 3;
                  const fineTrim = fineTrimM > 12
                    ? `${y + 1}-01-${new Date(y + 1, 1, 0).getDate()}`
                    : `${y}-${pad(fineTrimM)}-${new Date(y, fineTrimM, 0).getDate()}`;
                  const oggiStr = oggi.toISOString().slice(0, 10);
                  const fra7 = new Date(oggi.getTime() + 7 * 86400000).toISOString().slice(0, 10);
                  const fra30 = new Date(oggi.getTime() + 30 * 86400000).toISOString().slice(0, 10);
                  const MESI_IT = ["Gen","Feb","Mar","Apr","Mag","Giu","Lug","Ago","Set","Ott","Nov","Dic"];
                  const isActive = (da, a) => filtroDa === da && filtroA === a;
                  const toggle = (da, a) => {
                    if (isActive(da, a)) { setFiltroDa(""); setFiltroA(""); }
                    else { setFiltroDa(da); setFiltroA(a); }
                  };
                  const btn = "px-1.5 py-0.5 rounded text-[9px] font-medium border transition";
                  const act = "bg-amber-200 text-amber-900 border-amber-300";
                  const def = "bg-white text-neutral-600 border-neutral-200 hover:bg-amber-50";
                  return (
                    <>
                      <button onClick={() => toggle(primoMese, ultimoMese)}
                        className={`${btn} ${isActive(primoMese, ultimoMese) ? act : def}`}>
                        {MESI_IT[m]}
                      </button>
                      <button onClick={() => toggle(meseProssimo1, meseProssimo2)}
                        className={`${btn} ${isActive(meseProssimo1, meseProssimo2) ? act : def}`}>
                        {MESI_IT[(m + 1) % 12]}
                      </button>
                      <button onClick={() => toggle(oggiStr, fra7)}
                        className={`${btn} ${isActive(oggiStr, fra7) ? act : def}`}>
                        7gg
                      </button>
                      <button onClick={() => toggle(oggiStr, fra30)}
                        className={`${btn} ${isActive(oggiStr, fra30) ? act : def}`}>
                        30gg
                      </button>
                      <button onClick={() => toggle(inizioTrim, fineTrim)}
                        className={`${btn} ${isActive(inizioTrim, fineTrim) ? act : def}`}>
                        Trim.
                      </button>
                      <button onClick={() => toggle(`${y}-01-01`, `${y}-12-31`)}
                        className={`${btn} ${isActive(`${y}-01-01`, `${y}-12-31`) ? act : def}`}>
                        {y}
                      </button>
                    </>
                  );
                })()}
              </div>
              <div className="space-y-1.5">
                <div>
                  <label className={fLbl}>Da</label>
                  <input type="date" value={filtroDa} onChange={e => setFiltroDa(e.target.value)} className={fInp} />
                </div>
                <div>
                  <label className={fLbl}>A</label>
                  <input type="date" value={filtroA} onChange={e => setFiltroA(e.target.value)} className={fInp} />
                </div>
                {(filtroDa || filtroA) && (
                  <button onClick={() => { setFiltroDa(""); setFiltroA(""); }}
                    className="w-full text-center text-[9px] text-amber-600 hover:text-amber-800 py-0.5">
                    Rimuovi filtro periodo
                  </button>
                )}
              </div>
            </div>

            {/* Riconciliazione mini-info */}
            {rig.num_da_riconciliare > 0 && (
              <div className="bg-violet-50/60 rounded-lg p-2.5 border border-violet-200 shadow-sm">
                <div className="text-[9px] font-extrabold text-violet-600 uppercase tracking-widest mb-1.5">Riconciliazione</div>
                <div className="text-xs text-violet-800">
                  <span className="font-bold">{rig.num_da_riconciliare}</span> pagate da riconciliare
                </div>
                <div className="text-[10px] text-violet-500 mt-0.5">
                  {rig.num_riconciliate || 0} gia verificate in banca
                </div>
              </div>
            )}

            {/* Azioni */}
            <div className="flex gap-2 pt-1">
              <button onClick={clearFilters}
                className="flex-1 px-2 py-1.5 rounded-lg text-[10px] font-semibold border border-neutral-300 bg-white text-neutral-700 hover:bg-neutral-100">
                Pulisci {activeFilters > 0 && <span className="text-sky-600">({activeFilters})</span>}
              </button>
              <button onClick={() => fetchData(true)} disabled={loading}
                className="flex-1 px-2 py-1.5 rounded-lg text-[10px] font-semibold bg-sky-700 text-white hover:bg-sky-800 disabled:opacity-50">
                {loading ? "..." : "Aggiorna"}
              </button>
            </div>

          </div>
        </div>

        {/* ══════ COLONNA DESTRA: KPI + TABELLA ══════ */}
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">

          {/* KPI BAR */}
          <div className="px-3 py-2 border-b border-neutral-200 bg-white flex flex-wrap gap-2 items-center flex-shrink-0">
            <KPI label="Da pagare" value={kpi.da_pagare} n={kpi.n_da_pagare} color="amber"
              active={filtroStato === "DA_PAGARE"} onClick={() => setFiltroStato(filtroStato === "DA_PAGARE" ? "" : "DA_PAGARE")} />
            <KPI label="Scadute" value={kpi.scadute} n={kpi.n_scadute} color="red"
              active={filtroStato === "SCADUTA"} onClick={() => setFiltroStato(filtroStato === "SCADUTA" ? "" : "SCADUTA")} />
            <KPI label="Pagate" value={kpi.pagate} n={kpi.n_pagate} color="emerald"
              active={filtroStato === "PAGATA"} onClick={() => setFiltroStato(filtroStato === "PAGATA" ? "" : "PAGATA")} />
            {rig.num_riconciliate > 0 && (
              <span className="text-[10px] text-violet-600 flex items-center gap-1 ml-1">
                <BancaCheckIcon size={12} /> {rig.num_riconciliate} riconc.
              </span>
            )}
            <span className="ml-auto text-[10px] text-neutral-400 flex-shrink-0">
              {sorted.length} / {allUscite.length} righe
            </span>
          </div>

          {/* ── BARRA AZIONI BULK ── */}
          {selected.size > 0 && (
            <div className="flex items-center gap-3 px-4 py-2 bg-teal-50 border-b border-teal-200 flex-shrink-0">
              <span className="text-xs font-semibold text-teal-800">
                {selected.size} selezionat{selected.size === 1 ? "a" : "e"}
              </span>
              <select value={bulkMetodo} onChange={e => setBulkMetodo(e.target.value)}
                className="border border-teal-300 rounded-lg px-2 py-1 text-xs bg-white">
                <option value="CONTO_CORRENTE">Conto corrente</option>
                <option value="CARTA">Carta</option>
                <option value="CONTANTI">Contanti</option>
                <option value="ASSEGNO">Assegno</option>
                <option value="BONIFICO">Bonifico</option>
              </select>
              <button onClick={segnaPagateBulk} disabled={bulkSaving}
                className="px-3 py-1 rounded-lg bg-teal-600 text-white text-xs font-semibold hover:bg-teal-700 disabled:opacity-50">
                {bulkSaving ? "Salvataggio..." : "Segna pagate"}
              </button>
              <button onClick={() => setSelected(new Set())}
                className="px-2 py-1 rounded-lg text-xs text-neutral-500 hover:text-neutral-700 hover:bg-neutral-100">
                Deseleziona
              </button>
            </div>
          )}

          {/* TABELLA SCROLLABILE con STICKY HEADER */}
          <div className="flex-1 overflow-auto min-h-0">
            {loading ? (
              <div className="text-center py-20 text-neutral-400">Caricamento...</div>
            ) : sorted.length === 0 ? (
              <div className="text-center py-20 text-neutral-400 text-sm">
                {allUscite.length === 0 ? "Nessuna uscita. Verranno importate automaticamente." : "Nessun risultato per i filtri selezionati."}
              </div>
            ) : (
              <table className="w-full text-[11px]">
                <thead className="bg-neutral-100 sticky top-0 z-10">
                  <tr className="text-[9px] text-neutral-600 uppercase tracking-wide select-none">
                    <th className="px-2 py-2 text-center w-8">
                      <input type="checkbox" checked={allSelected} onChange={toggleAll}
                        className="rounded border-neutral-300 text-teal-600 focus:ring-teal-500"
                        title="Seleziona/deseleziona tutte le non pagate" />
                    </th>
                    <th className="px-3 py-2 text-left cursor-pointer hover:text-sky-700" onClick={() => handleSort("data_scadenza")}>
                      Scadenza <SortIcon col="data_scadenza" />
                    </th>
                    <th className="px-3 py-2 text-left cursor-pointer hover:text-sky-700" onClick={() => handleSort("fornitore_nome")}>
                      Fornitore <SortIcon col="fornitore_nome" />
                    </th>
                    <th className="px-3 py-2 text-left cursor-pointer hover:text-sky-700" onClick={() => handleSort("numero_fattura")}>
                      Fattura / Descrizione <SortIcon col="numero_fattura" />
                    </th>
                    <th className="px-3 py-2 text-right cursor-pointer hover:text-sky-700" onClick={() => handleSort("totale")}>
                      Importo <SortIcon col="totale" />
                    </th>
                    <th className="px-3 py-2 text-center cursor-pointer hover:text-sky-700" onClick={() => handleSort("stato")}>
                      Stato <SortIcon col="stato" />
                    </th>
                    <th className="px-3 py-2 text-left cursor-pointer hover:text-sky-700" onClick={() => handleSort("tipo_uscita")}>
                      Categoria <SortIcon col="tipo_uscita" />
                    </th>
                    <th className="px-3 py-2 text-center" title="Riconciliazione banca">
                      Banca
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {sorted.map((u) => {
                    const st = STATO_STYLE[u.stato] || STATO_STYLE.DA_PAGARE;
                    const residuo = (u.totale || 0) - (u.importo_pagato || 0);
                    const isSF = (u.tipo_uscita || "FATTURA") === "SPESA_FISSA";
                    const isStipendio = u.tipo_uscita === "STIPENDIO";
                    const isRiconciliata = !!u.banca_movimento_id;
                    const puoRiconciliare = u.stato === "PAGATA_MANUALE" && !isRiconciliata;
                    const puoSelezionare = ["DA_PAGARE", "SCADUTA", "PARZIALE"].includes(u.stato);

                    return (
                      <tr key={u.id}
                        onClick={() => apriModaleScadenza(u)}
                        className={`border-b border-neutral-100 hover:bg-sky-50/50 transition cursor-pointer ${
                        selected.has(u.id) ? "bg-teal-50/60" :
                        u.stato === "SCADUTA" ? "bg-red-50/30" : isSF ? "bg-indigo-50/20" : isStipendio ? "bg-violet-50/20" : "bg-white"
                      }`}>
                        {/* CHECKBOX */}
                        <td className="px-2 py-1.5 text-center" onClick={e => e.stopPropagation()}>
                          {puoSelezionare ? (
                            <input type="checkbox" checked={selected.has(u.id)}
                              onChange={() => toggleSelect(u.id)}
                              className="rounded border-neutral-300 text-teal-600 focus:ring-teal-500" />
                          ) : (
                            <span className="text-neutral-200">{"\u00B7"}</span>
                          )}
                        </td>
                        {/* SCADENZA */}
                        <td className="px-3 py-1.5 whitespace-nowrap">
                          {u.data_scadenza ? (
                            <span className={u.stato === "SCADUTA" ? "text-red-700 font-bold" : "text-neutral-700"}>
                              {fmtDateFull(u.data_scadenza)}
                            </span>
                          ) : (
                            <span className="text-neutral-300 italic">&mdash;</span>
                          )}
                        </td>
                        {/* FORNITORE */}
                        <td className="px-3 py-1.5">
                          <div className="font-medium text-neutral-800 truncate max-w-[180px]">{u.fornitore_nome}</div>
                        </td>
                        {/* FATTURA / DESCRIZIONE */}
                        <td className="px-3 py-1.5">
                          {isSF ? (
                            <span className="text-neutral-500 italic">
                              {u.periodo_riferimento || "&mdash;"}
                              {u.sf_frequenza && <span className="ml-1 text-[9px] text-neutral-400">({u.sf_frequenza.toLowerCase()})</span>}
                            </span>
                          ) : isStipendio ? (
                            <span className="text-violet-600 italic">
                              {u.numero_fattura || u.periodo_riferimento || "Stipendio"}
                            </span>
                          ) : (
                            <>
                              <span className="text-neutral-700">{u.numero_fattura || "&mdash;"}</span>
                              {u.data_fattura && (
                                <span className="ml-1.5 text-[9px] text-neutral-400">{fmtDateFull(u.data_fattura)}</span>
                              )}
                            </>
                          )}
                        </td>
                        {/* IMPORTO */}
                        <td className="px-3 py-1.5 text-right">
                          <span className="font-semibold text-neutral-800">&euro; {fmt(u.totale)}</span>
                          {residuo > 0 && residuo < u.totale && (
                            <div className="text-[9px] text-amber-600">res. &euro; {fmt(residuo)}</div>
                          )}
                        </td>
                        {/* STATO */}
                        <td className="px-3 py-1.5 text-center">
                          <span className={`inline-block px-1.5 py-0.5 rounded-full text-[10px] font-semibold ${st.bg} ${st.text} ${st.border} border`}>
                            {st.label}
                          </span>
                        </td>
                        {/* CATEGORIA */}
                        <td className="px-3 py-1.5">
                          {isSF ? (
                            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-indigo-100 text-indigo-700 border border-indigo-200 font-medium">
                              {u.sf_tipo_label || "Spesa fissa"}
                            </span>
                          ) : isStipendio ? (
                            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-violet-100 text-violet-700 border border-violet-200 font-medium">
                              Stipendio
                            </span>
                          ) : (
                            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-sky-50 text-sky-700 border border-sky-200 font-medium">
                              Fattura
                            </span>
                          )}
                        </td>
                        {/* BANCA (riconciliazione) */}
                        <td className="px-3 py-1.5 text-center" onClick={e => e.stopPropagation()}>
                          {isRiconciliata ? (
                            <button onClick={() => scollegaMovimento(u.id)}
                              title="Riconciliata — click per scollegare"
                              className="inline-flex items-center gap-0.5 text-emerald-600 hover:text-red-500 transition">
                              <BancaCheckIcon size={14} />
                            </button>
                          ) : puoRiconciliare ? (
                            <button onClick={() => apriRiconciliazione(u)}
                              title="Collega a movimento bancario"
                              className="inline-flex items-center gap-0.5 text-violet-500 hover:text-violet-700 transition hover:scale-110">
                              <BancaLinkIcon size={14} />
                            </button>
                          ) : u.stato === "PAGATA" && u.banca_movimento_id ? (
                            <BancaCheckIcon size={14} className="text-emerald-400" />
                          ) : (
                            <span className="text-neutral-200">&mdash;</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>

        </div>
      </div>

      {/* ══════ MODALE MODIFICA SCADENZA ══════ */}
      {modaleScadenza && (() => {
        const orig = modaleScadenza.data_scadenza_originale || modaleScadenza.data_scadenza;
        let deltaGG = 0;
        if (orig && nuovaScadenza) {
          try {
            deltaGG = Math.round((new Date(nuovaScadenza) - new Date(orig)) / 86400000);
          } catch (_) {}
        }
        const isArretrato = Math.abs(deltaGG) > 10;
        const cambiata = nuovaScadenza !== (modaleScadenza.data_scadenza || "");
        return (
          <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4"
            onClick={() => setModaleScadenza(null)}>
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-md overflow-hidden"
              onClick={e => e.stopPropagation()}>
              <div className="px-5 py-3 border-b border-neutral-200 bg-sky-50">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-bold text-sky-900">Modifica Scadenza</h3>
                    <p className="text-[11px] text-sky-600 mt-0.5">
                      {modaleScadenza.fornitore_nome} — € {fmt(modaleScadenza.totale)}
                    </p>
                  </div>
                  <button onClick={() => setModaleScadenza(null)}
                    className="text-neutral-400 hover:text-neutral-600 text-lg leading-none">&times;</button>
                </div>
              </div>
              <div className="p-5 space-y-4">
                {/* Info attuale */}
                <div className="flex items-center gap-4 text-xs">
                  <div>
                    <span className="text-neutral-500">Scadenza attuale: </span>
                    <span className="font-semibold text-neutral-800">{fmtDateFull(modaleScadenza.data_scadenza) || "—"}</span>
                  </div>
                  {orig && orig !== modaleScadenza.data_scadenza && (
                    <div>
                      <span className="text-neutral-400">Originale: </span>
                      <span className="text-neutral-600">{fmtDateFull(orig)}</span>
                    </div>
                  )}
                </div>

                {/* Input nuova data */}
                <div>
                  <label className="text-xs font-semibold text-neutral-600 block mb-1">Nuova scadenza</label>
                  <input type="date" value={nuovaScadenza} onChange={e => setNuovaScadenza(e.target.value)}
                    className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-sm focus:ring-2 focus:ring-sky-300 focus:outline-none" />
                </div>

                {/* Indicatore delta */}
                {cambiata && nuovaScadenza && (
                  <div className={`rounded-lg px-3 py-2 text-xs ${
                    isArretrato
                      ? "bg-amber-50 border border-amber-200 text-amber-800"
                      : "bg-emerald-50 border border-emerald-200 text-emerald-800"
                  }`}>
                    {deltaGG > 0 ? `+${deltaGG}` : deltaGG} giorni rispetto all'originale
                    {isArretrato
                      ? " — diventerà arretrato"
                      : " — resta spesa corrente"}
                  </div>
                )}

                {/* Stato uscita */}
                <div className="text-[10px] text-neutral-400">
                  Stato: <span className="font-medium text-neutral-600">{(STATO_STYLE[modaleScadenza.stato] || {}).label || modaleScadenza.stato}</span>
                  {modaleScadenza.numero_fattura && <span className="ml-2">Fatt. {modaleScadenza.numero_fattura}</span>}
                </div>
              </div>
              <div className="px-5 py-3 border-t border-neutral-200 bg-neutral-50 flex justify-end gap-2">
                <button onClick={() => setModaleScadenza(null)}
                  className="px-4 py-1.5 rounded-lg border border-neutral-300 text-neutral-600 text-xs hover:bg-neutral-100">
                  Annulla
                </button>
                <button onClick={salvaScadenza} disabled={savingScadenza || !cambiata || !nuovaScadenza}
                  className="px-4 py-1.5 rounded-lg bg-sky-600 text-white text-xs font-semibold hover:bg-sky-700 disabled:opacity-50">
                  {savingScadenza ? "Salvataggio..." : "Salva"}
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ══════ MODALE RICONCILIAZIONE ══════ */}
      {modaleBanca && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4"
          onClick={() => setModaleBanca(null)}>
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg max-h-[80vh] overflow-hidden"
            onClick={e => e.stopPropagation()}>

            {/* Header modale */}
            <div className="px-5 py-3 border-b border-neutral-200 bg-violet-50">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-violet-900">Riconcilia con Banca</h3>
                  <p className="text-[11px] text-violet-600 mt-0.5">
                    {modaleBanca.fornitore} &mdash; &euro; {fmt(modaleBanca.totale)}
                  </p>
                </div>
                <button onClick={() => setModaleBanca(null)}
                  className="text-neutral-400 hover:text-neutral-600 text-lg leading-none">&times;</button>
              </div>
            </div>

            {/* Body modale */}
            <div className="p-5 overflow-y-auto max-h-[60vh]">
              {loadingCandidati ? (
                <div className="text-center py-8 text-neutral-400">Ricerca movimenti...</div>
              ) : candidati.length === 0 ? (
                <div className="text-center py-8">
                  <div className="text-neutral-400 text-sm">Nessun movimento bancario compatibile trovato</div>
                  <div className="text-[10px] text-neutral-300 mt-1">
                    Criteri: importo &plusmn;10%, data &plusmn;15 giorni
                  </div>
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="text-[10px] text-neutral-500 mb-2">
                    {candidati.length} moviment{candidati.length === 1 ? "o" : "i"} compatibil{candidati.length === 1 ? "e" : "i"}
                  </div>
                  {candidati.map((c) => (
                    <div key={c.id}
                      className="border border-neutral-200 rounded-lg p-3 hover:border-violet-300 hover:bg-violet-50/30 transition">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="text-xs font-medium text-neutral-800 truncate">
                            {c.descrizione || "Movimento senza descrizione"}
                          </div>
                          <div className="flex items-center gap-3 mt-1 text-[10px] text-neutral-500">
                            <span>{fmtDateFull(c.data_contabile)}</span>
                            <span className="font-semibold text-neutral-700">&euro; {fmt(c.importo_abs)}</span>
                            {c.match_pct >= 99 ? (
                              <span className="px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700 font-semibold">
                                Match esatto
                              </span>
                            ) : (
                              <span className="px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700">
                                {c.match_pct}% match
                              </span>
                            )}
                          </div>
                          {c.categoria_banca && (
                            <div className="text-[9px] text-neutral-400 mt-0.5">{c.categoria_banca}</div>
                          )}
                        </div>
                        <button
                          onClick={() => collegaMovimento(c.id)}
                          disabled={linkingId === c.id}
                          className="px-3 py-1.5 rounded-lg text-[10px] font-semibold bg-violet-600 text-white hover:bg-violet-700 disabled:opacity-50 flex-shrink-0">
                          {linkingId === c.id ? "..." : "Collega"}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}


function KPI({ label, value, n, color, active, onClick }) {
  const cm = { amber: "border-amber-200 bg-amber-50 text-amber-800", red: "border-red-200 bg-red-50 text-red-800",
               emerald: "border-emerald-200 bg-emerald-50 text-emerald-800" };
  return (
    <button onClick={onClick}
      className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border text-[11px] font-semibold transition cursor-pointer ${cm[color] || ""} ${active ? "ring-2 ring-sky-400 shadow-md" : "hover:shadow-sm"}`}>
      <span>{label}</span>
      <span className="font-bold">&euro; {fmt(value)}</span>
      <span className="opacity-50 font-normal text-[9px]">({n})</span>
    </button>
  );
}


// ── Icone SVG inline ──
function BancaCheckIcon({ size = 16, className = "" }) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" fill="none" className={className} xmlns="http://www.w3.org/2000/svg">
      <rect x="2" y="7" width="16" height="11" rx="2" stroke="currentColor" strokeWidth="1.5" fill="none" />
      <path d="M2 10h16" stroke="currentColor" strokeWidth="1.5" />
      <path d="M8 14l2 2 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M6 7V5a4 4 0 018 0v2" stroke="currentColor" strokeWidth="1.5" fill="none" />
    </svg>
  );
}

function BancaLinkIcon({ size = 16, className = "" }) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" fill="none" className={className} xmlns="http://www.w3.org/2000/svg">
      <rect x="2" y="7" width="16" height="11" rx="2" stroke="currentColor" strokeWidth="1.5" fill="none" />
      <path d="M2 10h16" stroke="currentColor" strokeWidth="1.5" />
      <path d="M6 7V5a4 4 0 018 0v2" stroke="currentColor" strokeWidth="1.5" fill="none" />
      <circle cx="10" cy="14" r="1.5" fill="currentColor" />
    </svg>
  );
}
