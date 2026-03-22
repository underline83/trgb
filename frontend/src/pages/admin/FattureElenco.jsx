// @version: v3.0-cantina-style
// Pagina Fatture Elettroniche — Layout Cantina: Filtri SX + Lista DX + Dettaglio inline
import React, { useState, useEffect, useMemo, useCallback } from "react";
import { API_BASE, apiFetch } from "../../config/api";
import FattureNav from "./FattureNav";

const FE = `${API_BASE}/contabilita/fe`;
const fmt = (v) =>
  v != null
    ? v.toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : "-";
const uniq = (arr) =>
  Array.from(new Set(arr.filter((x) => x && String(x).trim() !== ""))).sort(
    (a, b) => String(a).localeCompare(String(b), "it", { sensitivity: "base" })
  );

// ── Stili filtri ──
const fLbl = "block text-[10px] font-semibold text-neutral-500 uppercase tracking-wide mb-0.5";
const fInp = "w-full border border-neutral-300 rounded-md px-2 py-1.5 text-[11px] bg-white focus:outline-none focus:ring-2 focus:ring-teal-300";
const fSel = fInp;

export default function FattureElenco() {
  // ── Dati ──
  const [fatture, setFatture] = useState([]);
  const [loading, setLoading] = useState(true);

  // ── Filtri ──
  const [searchText, setSearchText] = useState("");
  const [searchNumero, setSearchNumero] = useState("");
  const [annoSel, setAnnoSel] = useState(String(new Date().getFullYear()));
  const [meseSel, setMeseSel] = useState("");
  const [fornitoreSel, setFornitoreSel] = useState("");
  const [pivaSel, setPivaSel] = useState("");
  const [fonteSel, setFonteSel] = useState("");
  const [pagatoSel, setPagatoSel] = useState("");
  const [importoMode, setImportoMode] = useState("any");
  const [importoVal1, setImportoVal1] = useState("");
  const [importoVal2, setImportoVal2] = useState("");
  const [tipoSel, setTipoSel] = useState(""); // "" | "autofattura"

  // ── Ordinamento ──
  const [sortKey, setSortKey] = useState("data_fattura");
  const [sortDir, setSortDir] = useState("desc");

  // ── Dettaglio inline ──
  const [openId, setOpenId] = useState(null);
  const [dettaglio, setDettaglio] = useState(null);
  const [detLoading, setDetLoading] = useState(false);

  // ── Paginazione ──
  const [page, setPage] = useState(1);
  const perPage = 50;

  // ── Fetch fatture (tutte, filtriamo lato client) ──
  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch(`${FE}/fatture?limit=10000`);
      if (!res.ok) throw new Error("Errore caricamento");
      const data = await res.json();
      setFatture(data.fatture || []);
    } catch {
      setFatture([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // ── Opzioni filtri dinamiche ──
  const anniOptions = useMemo(() => {
    const anni = fatture.map(f => f.data_fattura?.substring(0, 4)).filter(Boolean);
    return uniq(anni).reverse();
  }, [fatture]);

  const fornitoriOptions = useMemo(() =>
    uniq(fatture.map(f => f.fornitore_nome).filter(Boolean)),
  [fatture]);

  // ── Filtro base (tutti i filtri TRANNE fonte e tipo — usato per conteggi badge) ──
  const fattureBase = useMemo(() => {
    let list = [...fatture];

    if (searchText) {
      const q = searchText.toLowerCase();
      list = list.filter(f =>
        (f.fornitore_nome || "").toLowerCase().includes(q) ||
        (f.fornitore_piva || "").includes(q)
      );
    }
    if (searchNumero) {
      const q = searchNumero.toLowerCase();
      list = list.filter(f => (f.numero_fattura || "").toLowerCase().includes(q));
    }
    if (annoSel) list = list.filter(f => (f.data_fattura || "").startsWith(annoSel));
    if (meseSel) list = list.filter(f => {
      const m = (f.data_fattura || "").substring(5, 7);
      return m === meseSel;
    });
    if (fornitoreSel) list = list.filter(f => f.fornitore_nome === fornitoreSel);
    if (pivaSel) list = list.filter(f => (f.fornitore_piva || "").includes(pivaSel));
    if (pagatoSel === "si") list = list.filter(f => f.pagato);
    if (pagatoSel === "no") list = list.filter(f => !f.pagato);

    if (importoMode === "gt" && importoVal1)
      list = list.filter(f => (f.totale_fattura || 0) > parseFloat(importoVal1));
    if (importoMode === "lt" && importoVal1)
      list = list.filter(f => (f.totale_fattura || 0) < parseFloat(importoVal1));
    if (importoMode === "between" && importoVal1 && importoVal2)
      list = list.filter(f => {
        const v = f.totale_fattura || 0;
        return v >= parseFloat(importoVal1) && v <= parseFloat(importoVal2);
      });

    return list;
  }, [fatture, searchText, searchNumero, annoSel, meseSel, fornitoreSel, pivaSel, pagatoSel, importoMode, importoVal1, importoVal2]);

  // ── Filtro completo (aggiunge fonte + tipo) ──
  const fattureFiltrate = useMemo(() => {
    let list = fattureBase;
    if (fonteSel) list = list.filter(f => (f.fonte || "xml") === fonteSel);
    if (tipoSel === "autofattura") list = list.filter(f => f.is_autofattura);
    return list;
  }, [fattureBase, fonteSel, tipoSel]);

  // ── Ordinamento ──
  const fattureOrdinate = useMemo(() => {
    const list = [...fattureFiltrate];
    list.sort((a, b) => {
      let va = a[sortKey], vb = b[sortKey];
      if (sortKey === "totale_fattura" || sortKey === "imponibile_totale") {
        va = va || 0; vb = vb || 0;
        return sortDir === "asc" ? va - vb : vb - va;
      }
      va = String(va || ""); vb = String(vb || "");
      return sortDir === "asc" ? va.localeCompare(vb, "it") : vb.localeCompare(va, "it");
    });
    return list;
  }, [fattureFiltrate, sortKey, sortDir]);

  // ── Paginazione ──
  const totalPages = Math.max(1, Math.ceil(fattureOrdinate.length / perPage));
  const fattureVisibili = fattureOrdinate.slice((page - 1) * perPage, page * perPage);

  useEffect(() => { setPage(1); }, [searchText, searchNumero, annoSel, meseSel, fornitoreSel, pivaSel, fonteSel, pagatoSel, tipoSel, importoMode, importoVal1, importoVal2]);

  // ── Dettaglio ──
  const openDetail = async (id) => {
    if (openId === id) { setOpenId(null); setDettaglio(null); return; }
    setOpenId(id);
    setDetLoading(true);
    try {
      const res = await apiFetch(`${FE}/fatture/${id}`);
      if (!res.ok) throw new Error();
      setDettaglio(await res.json());
    } catch {
      setDettaglio(null);
    } finally {
      setDetLoading(false);
    }
  };

  // ── Sort helper ──
  const toggleSort = (key) => {
    if (sortKey === key) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir("desc"); }
    setPage(1);
  };
  const sortIcon = (key) => sortKey === key ? (sortDir === "asc" ? " ↑" : " ↓") : "";

  // ── Contatori filtri attivi ──
  const activeFilters = [searchText, searchNumero, annoSel, meseSel, fornitoreSel, pivaSel, fonteSel, pagatoSel, tipoSel, importoMode !== "any" ? "x" : ""].filter(Boolean).length;

  const clearFilters = () => {
    setSearchText(""); setSearchNumero(""); setAnnoSel(""); setMeseSel("");
    setFornitoreSel(""); setPivaSel(""); setFonteSel(""); setPagatoSel("");
    setTipoSel(""); setImportoMode("any"); setImportoVal1(""); setImportoVal2("");
  };

  // ── Riepilogo ──
  // Conteggi fonte: calcolati su fattureBase + filtro tipo attivo
  // Conteggi tipo: calcolati su fattureBase + filtro fonte attivo
  const totFiltrate = fattureFiltrate.length;
  const totImporto = fattureFiltrate.reduce((s, f) => s + (f.totale_fattura || 0), 0);

  const baseTipo = useMemo(() => {
    let list = fattureBase;
    if (tipoSel === "autofattura") list = list.filter(f => f.is_autofattura);
    return list;
  }, [fattureBase, tipoSel]);

  const baseFonte = useMemo(() => {
    let list = fattureBase;
    if (fonteSel) list = list.filter(f => (f.fonte || "xml") === fonteSel);
    return list;
  }, [fattureBase, fonteSel]);

  const countXml = baseTipo.filter(f => (f.fonte || "xml") === "xml").length;
  const countFic = baseTipo.filter(f => f.fonte === "fic").length;
  const countAutofatture = baseFonte.filter(f => f.is_autofattura).length;

  const MESI = ["", "Gennaio", "Febbraio", "Marzo", "Aprile", "Maggio", "Giugno", "Luglio", "Agosto", "Settembre", "Ottobre", "Novembre", "Dicembre"];

  return (
    <div className="min-h-screen bg-neutral-100 font-sans">
      <FattureNav current="fatture" />

      {/* LAYOUT: Filtri SX + Contenuto DX */}
      <div className="flex" style={{ height: "calc(100vh - 48px)" }}>

        {/* ═══════ SIDEBAR FILTRI (280px) ═══════ */}
        <div className="w-[280px] min-w-[280px] border-r border-neutral-200 bg-neutral-50 overflow-y-auto flex-shrink-0">
          <div className="p-2.5 space-y-2">

            {/* ── Ricerca ── */}
            <div className="bg-white rounded-lg p-2.5 border border-neutral-200 shadow-sm">
              <div className="text-[9px] font-extrabold text-neutral-400 uppercase tracking-widest mb-1.5">Ricerca</div>
              <div className="space-y-1.5">
                <div>
                  <label className={fLbl}>Fornitore / P.IVA</label>
                  <input type="text" value={searchText} onChange={e => setSearchText(e.target.value)}
                    placeholder="Nome fornitore o P.IVA…" className={fInp} />
                </div>
                <div>
                  <label className={fLbl}>Numero fattura</label>
                  <input type="text" value={searchNumero} onChange={e => setSearchNumero(e.target.value)}
                    placeholder="es. A0 FCH660…" className={fInp} />
                </div>
              </div>
            </div>

            {/* ── Periodo ── */}
            <div className="bg-teal-50/50 rounded-lg p-2.5 border border-teal-100 shadow-sm">
              <div className="text-[9px] font-extrabold text-teal-600 uppercase tracking-widest mb-1.5">Periodo</div>
              <div className="grid grid-cols-2 gap-1.5">
                <div>
                  <label className={fLbl}>Anno</label>
                  <select value={annoSel} onChange={e => setAnnoSel(e.target.value)} className={fSel}>
                    <option value="">Tutti</option>
                    {anniOptions.map(a => <option key={a} value={a}>{a}</option>)}
                  </select>
                </div>
                <div>
                  <label className={fLbl}>Mese</label>
                  <select value={meseSel} onChange={e => setMeseSel(e.target.value)} className={fSel}>
                    <option value="">Tutti</option>
                    {[...Array(12)].map((_, i) => {
                      const m = String(i + 1).padStart(2, "0");
                      return <option key={m} value={m}>{MESI[i + 1]}</option>;
                    })}
                  </select>
                </div>
              </div>
            </div>

            {/* ── Fornitore ── */}
            <div className="bg-blue-50/40 rounded-lg p-2.5 border border-blue-100 shadow-sm">
              <div className="text-[9px] font-extrabold text-blue-600 uppercase tracking-widest mb-1.5">Fornitore</div>
              <div className="space-y-1.5">
                <div>
                  <label className={fLbl}>Nome fornitore</label>
                  <select value={fornitoreSel} onChange={e => setFornitoreSel(e.target.value)} className={fSel}>
                    <option value="">Tutti</option>
                    {fornitoriOptions.map(f => <option key={f} value={f}>{f}</option>)}
                  </select>
                </div>
                <div>
                  <label className={fLbl}>P.IVA contiene</label>
                  <input type="text" value={pivaSel} onChange={e => setPivaSel(e.target.value)}
                    placeholder="es. 01226470993" className={fInp} />
                </div>
              </div>
            </div>

            {/* ── Importo ── */}
            <div className="bg-violet-50/40 rounded-lg p-2.5 border border-violet-100 shadow-sm">
              <div className="text-[9px] font-extrabold text-violet-600 uppercase tracking-widest mb-1.5">Importo</div>
              <div className="space-y-1.5">
                <div>
                  <label className={fLbl}>Filtro importo totale</label>
                  <div className="flex gap-1 items-center">
                    <select value={importoMode} onChange={e => setImportoMode(e.target.value)}
                      className="border border-neutral-300 rounded-md px-1.5 py-1.5 text-[11px] bg-white w-[52px]">
                      <option value="any">—</option>
                      <option value="gt">&gt;</option>
                      <option value="lt">&lt;</option>
                      <option value="between">tra</option>
                    </select>
                    <input type="number" value={importoVal1} onChange={e => setImportoVal1(e.target.value)}
                      className="w-16 border border-neutral-300 rounded-md px-1.5 py-1.5 text-[11px] bg-white" placeholder="€" />
                    {importoMode === "between" && (
                      <input type="number" value={importoVal2} onChange={e => setImportoVal2(e.target.value)}
                        className="w-16 border border-neutral-300 rounded-md px-1.5 py-1.5 text-[11px] bg-white" placeholder="€" />
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* ── Stato ── */}
            <div className="bg-emerald-50/40 rounded-lg p-2.5 border border-emerald-100 shadow-sm">
              <div className="text-[9px] font-extrabold text-emerald-600 uppercase tracking-widest mb-1.5">Stato</div>
              <div className="grid grid-cols-2 gap-1.5">
                <div>
                  <label className={fLbl}>Fonte</label>
                  <select value={fonteSel} onChange={e => setFonteSel(e.target.value)} className={fSel}>
                    <option value="">Tutte</option>
                    <option value="xml">XML</option>
                    <option value="fic">FIC</option>
                  </select>
                </div>
                <div>
                  <label className={fLbl}>Pagamento</label>
                  <select value={pagatoSel} onChange={e => setPagatoSel(e.target.value)} className={fSel}>
                    <option value="">Tutti</option>
                    <option value="si">Pagata</option>
                    <option value="no">Da pagare</option>
                  </select>
                </div>
              </div>
              <div className="mt-1.5">
                <label className={fLbl}>Tipo</label>
                <select value={tipoSel} onChange={e => setTipoSel(e.target.value)} className={fSel}>
                  <option value="">Tutte</option>
                  <option value="autofattura">Autofatture</option>
                </select>
              </div>
            </div>

            {/* ── Azioni filtri ── */}
            <div className="flex gap-1.5 pt-1">
              <button onClick={clearFilters}
                className="flex-1 px-2 py-1.5 rounded-lg text-[10px] font-semibold border border-neutral-300 bg-white hover:bg-neutral-50 text-neutral-700 transition">
                ✕ Pulisci {activeFilters > 0 && <span className="ml-1 px-1.5 py-0.5 rounded-full bg-teal-100 text-teal-800 text-[9px]">{activeFilters}</span>}
              </button>
              <button onClick={fetchAll}
                className="flex-1 px-2 py-1.5 rounded-lg text-[10px] font-semibold border border-teal-300 bg-teal-50 hover:bg-teal-100 text-teal-800 transition">
                ⟳ Ricarica
              </button>
            </div>

          </div>
        </div>

        {/* ═══════ CONTENUTO PRINCIPALE DX ═══════ */}
        <div className="flex-1 overflow-y-auto">

          {/* ── Riepilogo bar ── */}
          <div className="sticky top-0 z-10 bg-white border-b border-neutral-200 px-4 py-2 flex items-center gap-2 text-xs flex-wrap">
            <span className="font-bold text-teal-900">{totFiltrate} fatture</span>
            <span className="text-neutral-400">|</span>
            <span className="text-neutral-500">€ <strong className="text-teal-800">{fmt(totImporto)}</strong></span>
            <span className="text-neutral-400">|</span>

            {/* Badge cliccabili fonte */}
            <button onClick={() => setFonteSel(fonteSel === "xml" ? "" : "xml")}
              className={`px-2 py-0.5 rounded-full text-[10px] font-medium transition cursor-pointer ${
                fonteSel === "xml" ? "bg-neutral-700 text-white ring-1 ring-neutral-800" : "bg-neutral-100 text-neutral-600 hover:bg-neutral-200"
              }`}>
              XML: {countXml}
            </button>
            <button onClick={() => setFonteSel(fonteSel === "fic" ? "" : "fic")}
              className={`px-2 py-0.5 rounded-full text-[10px] font-medium transition cursor-pointer ${
                fonteSel === "fic" ? "bg-teal-700 text-white ring-1 ring-teal-800" : "bg-teal-50 text-teal-700 hover:bg-teal-100"
              }`}>
              FIC: {countFic}
            </button>

            {countAutofatture > 0 && (
              <>
                <span className="text-neutral-300">|</span>
                <button onClick={() => setTipoSel(tipoSel === "autofattura" ? "" : "autofattura")}
                  className={`px-2 py-0.5 rounded-full text-[10px] font-medium transition cursor-pointer ${
                    tipoSel === "autofattura" ? "bg-amber-600 text-white ring-1 ring-amber-700" : "bg-amber-50 text-amber-700 hover:bg-amber-100"
                  }`}>
                  Autofatture: {countAutofatture}
                </button>
              </>
            )}

            <div className="flex-1" />
            <span className="text-neutral-400">Pag. {page}/{totalPages}</span>
          </div>

          {loading ? (
            <div className="text-center py-20 text-neutral-400">Caricamento fatture…</div>
          ) : openId && dettaglio ? (
            /* ═══════ VISTA DETTAGLIO ═══════ */
            <DetailView
              fattura={dettaglio}
              loading={detLoading}
              onClose={() => { setOpenId(null); setDettaglio(null); }}
            />
          ) : (
            /* ═══════ LISTA TABELLA ═══════ */
            <>
              <table className="w-full text-xs">
                <thead className="bg-neutral-50 border-b border-neutral-200 sticky top-[41px] z-[5]">
                  <tr>
                    <th className="px-3 py-2 text-left cursor-pointer hover:text-teal-700" onClick={() => toggleSort("data_fattura")}>
                      Data{sortIcon("data_fattura")}
                    </th>
                    <th className="px-3 py-2 text-left cursor-pointer hover:text-teal-700" onClick={() => toggleSort("numero_fattura")}>
                      N.{sortIcon("numero_fattura")}
                    </th>
                    <th className="px-3 py-2 text-left cursor-pointer hover:text-teal-700" onClick={() => toggleSort("fornitore_nome")}>
                      Fornitore{sortIcon("fornitore_nome")}
                    </th>
                    <th className="px-3 py-2 text-right cursor-pointer hover:text-teal-700" onClick={() => toggleSort("imponibile_totale")}>
                      Netto{sortIcon("imponibile_totale")}
                    </th>
                    <th className="px-3 py-2 text-right">IVA</th>
                    <th className="px-3 py-2 text-right cursor-pointer hover:text-teal-700" onClick={() => toggleSort("totale_fattura")}>
                      Totale{sortIcon("totale_fattura")}
                    </th>
                    <th className="px-3 py-2 text-center">Righe</th>
                    <th className="px-3 py-2 text-center">Stato</th>
                    <th className="px-3 py-2 text-center">Fonte</th>
                  </tr>
                </thead>
                <tbody>
                  {fattureVisibili.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="px-4 py-12 text-center text-neutral-400">
                        {fatture.length === 0 ? "Nessuna fattura importata." : "Nessun risultato per i filtri selezionati."}
                      </td>
                    </tr>
                  ) : (
                    fattureVisibili.map(f => (
                      <tr key={f.id}
                        onClick={() => openDetail(f.id)}
                        className={`border-b border-neutral-100 cursor-pointer transition ${
                          openId === f.id ? "bg-teal-50" : "hover:bg-teal-50/30"
                        }`}>
                        <td className="px-3 py-2 text-neutral-700 tabular-nums">{f.data_fattura || "—"}</td>
                        <td className="px-3 py-2 text-neutral-600 font-mono text-[10px] max-w-[120px] truncate">{f.numero_fattura || "—"}</td>
                        <td className="px-3 py-2 font-medium text-neutral-900 max-w-[200px] truncate">
                          {f.fornitore_nome || "—"}
                          {f.is_autofattura ? <span className="ml-1.5 px-1 py-0 rounded text-[8px] font-bold bg-amber-100 text-amber-700 align-middle">AUTO</span> : null}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums text-neutral-700">€ {fmt(f.imponibile_totale)}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-neutral-400 text-[10px]">€ {fmt(f.iva_totale)}</td>
                        <td className="px-3 py-2 text-right tabular-nums font-semibold text-teal-900">€ {fmt(f.totale_fattura)}</td>
                        <td className="px-3 py-2 text-center">
                          {f.n_righe > 0
                            ? <span className="text-teal-700 font-medium">{f.n_righe}</span>
                            : <span className="text-neutral-300">—</span>}
                        </td>
                        <td className="px-3 py-2 text-center">
                          {f.pagato
                            ? <span className="px-1.5 py-0.5 rounded-full text-[9px] font-semibold bg-emerald-100 text-emerald-700">Pagata</span>
                            : <span className="px-1.5 py-0.5 rounded-full text-[9px] font-semibold bg-red-50 text-red-600">Da pagare</span>}
                        </td>
                        <td className="px-3 py-2 text-center">
                          <span className={`px-1.5 py-0.5 rounded-full text-[9px] font-medium ${
                            f.fonte === "fic" ? "bg-teal-50 text-teal-700" : "bg-neutral-100 text-neutral-600"
                          }`}>
                            {(f.fonte || "xml").toUpperCase()}
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>

              {/* Paginazione */}
              {totalPages > 1 && (
                <div className="flex items-center justify-center gap-2 py-3 border-t border-neutral-100">
                  <button disabled={page <= 1} onClick={() => setPage(p => p - 1)}
                    className="px-3 py-1 rounded-lg text-xs border border-neutral-300 bg-white hover:bg-neutral-50 disabled:opacity-40 transition">
                    ←
                  </button>
                  <span className="text-xs text-neutral-500">
                    Pagina {page} di {totalPages}
                  </span>
                  <button disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}
                    className="px-3 py-1 rounded-lg text-xs border border-neutral-300 bg-white hover:bg-neutral-50 disabled:opacity-40 transition">
                    →
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}


// ═══════════════════════════════════════════════════════
// COMPONENTE DETTAGLIO FATTURA (inline, stile Cantina)
// ═══════════════════════════════════════════════════════
function DetailView({ fattura, loading, onClose }) {
  if (loading) return <div className="text-center py-20 text-neutral-400">Caricamento dettaglio…</div>;
  if (!fattura) return <div className="text-center py-20 text-neutral-400">Fattura non trovata</div>;

  const righe = fattura.righe || [];
  const totaleRighe = righe.reduce((s, r) => s + (r.prezzo_totale || 0), 0);

  return (
    <div className="p-4 sm:p-6 space-y-4">
      {/* Nav bar */}
      <div className="flex items-center justify-between">
        <button onClick={onClose}
          className="text-xs text-teal-700 hover:text-teal-900 font-medium transition">
          ← Torna alla lista
        </button>
        <span className="text-[10px] text-neutral-400">ID: {fattura.id}</span>
      </div>

      {/* Header card */}
      <div className="bg-white rounded-2xl border border-neutral-200 shadow-sm p-5">
        <div className="flex flex-col md:flex-row justify-between gap-4">
          <div className="flex-1">
            <p className="text-[10px] text-neutral-400 font-medium uppercase tracking-wider mb-1">Fornitore</p>
            <h1 className="text-xl font-bold text-teal-900 font-playfair">{fattura.fornitore_nome || "-"}</h1>
            {fattura.fornitore_piva && (
              <p className="text-sm text-neutral-500 mt-0.5">P.IVA: <span className="tabular-nums font-medium">{fattura.fornitore_piva}</span></p>
            )}
          </div>
          <div className="flex flex-col items-end gap-1 text-right">
            <div>
              <p className="text-[10px] text-neutral-400 font-medium uppercase tracking-wider">Fattura N.</p>
              <p className="text-lg font-bold text-neutral-900">{fattura.numero_fattura || "-"}</p>
            </div>
            <div>
              <p className="text-[10px] text-neutral-400 font-medium uppercase tracking-wider">Data</p>
              <p className="text-sm font-semibold text-neutral-800 tabular-nums">{fattura.data_fattura || "-"}</p>
            </div>
            {fattura.xml_filename && (
              <p className="text-[10px] text-neutral-400 mt-1 font-mono truncate max-w-[200px]">{fattura.xml_filename}</p>
            )}
            <span className={`mt-1 px-2 py-0.5 rounded-full text-[10px] font-semibold ${
              fattura.pagato ? "bg-emerald-100 text-emerald-700" : "bg-red-50 text-red-600"
            }`}>
              {fattura.pagato ? "Pagata" : "Da pagare"}
            </span>
          </div>
        </div>

        {/* Amounts */}
        <div className="mt-4 pt-4 border-t border-neutral-100 grid grid-cols-3 gap-4">
          <div>
            <p className="text-[10px] text-neutral-400 font-medium uppercase tracking-wider">Imponibile</p>
            <p className="text-lg font-bold text-neutral-800 tabular-nums">€ {fmt(fattura.imponibile_totale)}</p>
          </div>
          <div>
            <p className="text-[10px] text-neutral-400 font-medium uppercase tracking-wider">IVA</p>
            <p className="text-lg font-bold text-neutral-800 tabular-nums">€ {fmt(fattura.iva_totale)}</p>
          </div>
          <div>
            <p className="text-[10px] text-neutral-400 font-medium uppercase tracking-wider">Totale</p>
            <p className="text-2xl font-bold text-teal-900 tabular-nums font-playfair">€ {fmt(fattura.totale_fattura)}</p>
          </div>
        </div>
      </div>

      {/* Righe fattura */}
      <div className="bg-white rounded-2xl border border-neutral-200 shadow-sm overflow-hidden">
        <div className="px-5 py-3 border-b border-neutral-100 flex justify-between items-center">
          <h2 className="text-sm font-semibold text-neutral-800">Righe fattura ({righe.length})</h2>
          <span className="text-xs text-neutral-400">Totale righe: € {fmt(totaleRighe)}</span>
        </div>

        {righe.length === 0 ? (
          <div className="text-center py-8 text-neutral-400 text-sm">Nessuna riga presente</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-neutral-50 text-neutral-500 border-b border-neutral-200">
                <tr>
                  <th className="px-3 py-2 text-left font-medium w-8">#</th>
                  <th className="px-3 py-2 text-left font-medium">Descrizione</th>
                  <th className="px-3 py-2 text-right font-medium">Q.tà</th>
                  <th className="px-3 py-2 text-right font-medium">U.M.</th>
                  <th className="px-3 py-2 text-right font-medium">Prezzo Unit.</th>
                  <th className="px-3 py-2 text-right font-medium">Totale</th>
                  <th className="px-3 py-2 text-right font-medium">IVA %</th>
                </tr>
              </thead>
              <tbody>
                {righe.map((r, i) => (
                  <tr key={r.id || i} className="border-b border-neutral-100 hover:bg-neutral-50/50">
                    <td className="px-3 py-1.5 text-neutral-400 tabular-nums">{r.numero_linea || i + 1}</td>
                    <td className="px-3 py-1.5 text-neutral-800 font-medium max-w-md">{r.descrizione || "-"}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums text-neutral-700">{r.quantita != null ? fmt(r.quantita) : "-"}</td>
                    <td className="px-3 py-1.5 text-right text-neutral-500">{r.unita_misura || ""}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums text-neutral-700">{r.prezzo_unitario != null ? `€ ${fmt(r.prezzo_unitario)}` : "-"}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums font-semibold text-neutral-900">{r.prezzo_totale != null ? `€ ${fmt(r.prezzo_totale)}` : "-"}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums text-neutral-500">{r.aliquota_iva != null ? `${r.aliquota_iva}%` : "-"}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-teal-50/50 border-t-2 border-teal-200">
                  <td colSpan={5} className="px-3 py-2 text-right text-xs font-bold text-teal-900 uppercase tracking-wide">Totale righe</td>
                  <td className="px-3 py-2 text-right tabular-nums font-bold text-teal-900 text-sm">€ {fmt(totaleRighe)}</td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>

      {/* Meta */}
      <div className="flex justify-between items-center text-[10px] text-neutral-400 px-1">
        <span>Importato il: {fattura.data_import || "-"}</span>
        <span>Fonte: {(fattura.fonte || "xml").toUpperCase()}</span>
      </div>
    </div>
  );
}
