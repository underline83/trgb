// @version: v2.0-cantina-style
// Elenco fornitori — Layout Cantina: Filtri SX + Lista DX, click apre dettaglio
import React, { useState, useEffect, useMemo, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { API_BASE, apiFetch } from "../../config/api";
import FattureNav from "./FattureNav";

const FE = `${API_BASE}/contabilita/fe`;
const CAT_BASE = `${API_BASE}/contabilita/fe/categorie`;
const fmt = (v) =>
  v != null
    ? v.toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : "-";

// ── Stili filtri (identici a FattureElenco) ──
const fLbl = "block text-[10px] font-semibold text-neutral-500 uppercase tracking-wide mb-0.5";
const fInp = "w-full border border-neutral-300 rounded-md px-2 py-1.5 text-[11px] bg-white focus:outline-none focus:ring-2 focus:ring-teal-300";
const fSel = fInp;

export default function FattureFornitoriElenco() {
  const navigate = useNavigate();

  // ── Dati ──
  const [fornitori, setFornitori] = useState([]);
  const [categorie, setCategorie] = useState([]);
  const [loading, setLoading] = useState(true);

  // ── Filtri ──
  const [searchText, setSearchText] = useState("");
  const [annoSel, setAnnoSel] = useState(String(new Date().getFullYear()));
  const [categoriaSel, setCategoriaSel] = useState("");
  const [ordineSel, setOrdineSel] = useState("totale_desc");

  // ── Fetch ──
  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [resForn, resCat] = await Promise.all([
        apiFetch(`${FE}/stats/fornitori${annoSel ? `?year=${annoSel}` : ""}`),
        apiFetch(CAT_BASE),
      ]);
      if (resForn.ok) setFornitori(await resForn.json());
      if (resCat.ok) setCategorie(await resCat.json());
    } catch (e) {
      console.error("[FornitoriElenco]", e);
    } finally {
      setLoading(false);
    }
  }, [annoSel]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // ── Anni disponibili dal dataset ──
  const anniOptions = useMemo(() => {
    const set = new Set();
    fornitori.forEach((f) => {
      if (f.primo_acquisto) set.add(f.primo_acquisto.substring(0, 4));
      if (f.ultimo_acquisto) set.add(f.ultimo_acquisto.substring(0, 4));
    });
    return [...set].sort().reverse();
  }, [fornitori]);

  // ── Filtra + Ordina ──
  const filtered = useMemo(() => {
    let list = [...fornitori];

    // Ricerca testo
    if (searchText.trim()) {
      const q = searchText.toLowerCase();
      list = list.filter(
        (f) =>
          f.fornitore_nome?.toLowerCase().includes(q) ||
          f.fornitore_piva?.toLowerCase().includes(q)
      );
    }

    // Ordinamento
    list.sort((a, b) => {
      switch (ordineSel) {
        case "totale_desc": return (b.totale_fatture || 0) - (a.totale_fatture || 0);
        case "totale_asc": return (a.totale_fatture || 0) - (b.totale_fatture || 0);
        case "fatture_desc": return (b.numero_fatture || 0) - (a.numero_fatture || 0);
        case "fatture_asc": return (a.numero_fatture || 0) - (b.numero_fatture || 0);
        case "nome_asc": return (a.fornitore_nome || "").localeCompare(b.fornitore_nome || "", "it");
        case "nome_desc": return (b.fornitore_nome || "").localeCompare(a.fornitore_nome || "", "it");
        case "ultimo_desc": return (b.ultimo_acquisto || "").localeCompare(a.ultimo_acquisto || "");
        case "ultimo_asc": return (a.ultimo_acquisto || "").localeCompare(b.ultimo_acquisto || "");
        default: return 0;
      }
    });

    return list;
  }, [fornitori, searchText, ordineSel]);

  // ── KPI ──
  const totFornitori = filtered.length;
  const totSpesa = filtered.reduce((s, f) => s + (f.totale_fatture || 0), 0);
  const totFatture = filtered.reduce((s, f) => s + (f.numero_fatture || 0), 0);

  // ── Contatori filtri attivi ──
  const activeFilters = [searchText, annoSel, categoriaSel, ordineSel !== "totale_desc" ? "x" : ""].filter(Boolean).length;

  const clearFilters = () => {
    setSearchText(""); setAnnoSel(""); setCategoriaSel(""); setOrdineSel("totale_desc");
  };

  return (
    <div className="min-h-screen bg-neutral-100 font-sans">
      <FattureNav current="fornitori" />

      {/* LAYOUT: Filtri SX + Contenuto DX */}
      <div className="flex" style={{ height: "calc(100vh - 48px)" }}>

        {/* ═══════ SIDEBAR FILTRI (280px) ═══════ */}
        <div className="w-[280px] min-w-[280px] border-r border-neutral-200 bg-neutral-50 overflow-y-auto flex-shrink-0">
          <div className="p-2.5 space-y-2">

            {/* ── Ricerca ── */}
            <div className="bg-white rounded-lg p-2.5 border border-neutral-200 shadow-sm">
              <div className="text-[9px] font-extrabold text-neutral-400 uppercase tracking-widest mb-1.5">Ricerca</div>
              <div>
                <label className={fLbl}>Fornitore / P.IVA</label>
                <input type="text" value={searchText} onChange={e => setSearchText(e.target.value)}
                  placeholder="Nome fornitore o P.IVA..." className={fInp} />
              </div>
            </div>

            {/* ── Periodo ── */}
            <div className="bg-teal-50/50 rounded-lg p-2.5 border border-teal-100 shadow-sm">
              <div className="text-[9px] font-extrabold text-teal-600 uppercase tracking-widest mb-1.5">Periodo</div>
              <div>
                <label className={fLbl}>Anno</label>
                <select value={annoSel} onChange={e => setAnnoSel(e.target.value)} className={fSel}>
                  <option value="">Tutti gli anni</option>
                  {anniOptions.map(a => <option key={a} value={a}>{a}</option>)}
                </select>
              </div>
            </div>

            {/* ── Ordinamento ── */}
            <div className="bg-blue-50/40 rounded-lg p-2.5 border border-blue-100 shadow-sm">
              <div className="text-[9px] font-extrabold text-blue-600 uppercase tracking-widest mb-1.5">Ordinamento</div>
              <div>
                <label className={fLbl}>Ordina per</label>
                <select value={ordineSel} onChange={e => setOrdineSel(e.target.value)} className={fSel}>
                  <option value="totale_desc">Spesa totale (alto → basso)</option>
                  <option value="totale_asc">Spesa totale (basso → alto)</option>
                  <option value="fatture_desc">N. fatture (alto → basso)</option>
                  <option value="fatture_asc">N. fatture (basso → alto)</option>
                  <option value="nome_asc">Nome (A → Z)</option>
                  <option value="nome_desc">Nome (Z → A)</option>
                  <option value="ultimo_desc">Ultimo acquisto (recente)</option>
                  <option value="ultimo_asc">Ultimo acquisto (vecchio)</option>
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
          <div className="sticky top-0 z-10 bg-white border-b border-neutral-200 px-4 py-2 flex items-center gap-3 text-xs flex-wrap">
            <span className="font-bold text-teal-900">{totFornitori} fornitori</span>
            <span className="text-neutral-400">|</span>
            <span className="text-neutral-500">{totFatture} fatture</span>
            <span className="text-neutral-400">|</span>
            <span className="text-neutral-500">Totale spesa: <strong className="text-teal-800">€ {fmt(totSpesa)}</strong></span>
            {totFornitori > 0 && (
              <>
                <span className="text-neutral-400">|</span>
                <span className="text-neutral-500">Media: <strong className="text-teal-800">€ {fmt(totSpesa / totFornitori)}</strong>/fornitore</span>
              </>
            )}
          </div>

          {loading ? (
            <div className="text-center py-20 text-neutral-400">Caricamento fornitori...</div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-20 text-neutral-400">
              {fornitori.length === 0 ? "Nessun fornitore trovato." : "Nessun risultato per i filtri selezionati."}
            </div>
          ) : (
            <table className="w-full text-xs">
              <thead className="bg-neutral-50 border-b border-neutral-200 sticky top-[41px] z-[5]">
                <tr>
                  <th className="px-3 py-2 text-left">Fornitore</th>
                  <th className="px-3 py-2 text-left hidden sm:table-cell">P.IVA</th>
                  <th className="px-3 py-2 text-right">Fatture</th>
                  <th className="px-3 py-2 text-right">Totale €</th>
                  <th className="px-3 py-2 text-right hidden md:table-cell">Media/Fatt.</th>
                  <th className="px-3 py-2 text-center hidden md:table-cell">Primo</th>
                  <th className="px-3 py-2 text-center hidden md:table-cell">Ultimo</th>
                  <th className="px-3 py-2 w-8"></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((f, idx) => {
                  const media = f.numero_fatture > 0 ? f.totale_fatture / f.numero_fatture : 0;
                  return (
                    <tr
                      key={idx}
                      className="border-b border-neutral-100 hover:bg-teal-50/40 cursor-pointer transition"
                      onClick={() =>
                        navigate(`/acquisti/fornitore/${encodeURIComponent(f.fornitore_piva || f.fornitore_nome)}`)
                      }
                    >
                      <td className="px-3 py-2.5 font-medium text-neutral-900">
                        {f.fornitore_nome || "—"}
                      </td>
                      <td className="px-3 py-2.5 text-neutral-500 text-[10px] hidden sm:table-cell font-mono">
                        {f.fornitore_piva || "—"}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums">
                        {f.numero_fatture}
                      </td>
                      <td className="px-3 py-2.5 text-right font-semibold tabular-nums text-teal-900">
                        € {fmt(f.totale_fatture)}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-neutral-500 hidden md:table-cell">
                        € {fmt(media)}
                      </td>
                      <td className="px-3 py-2.5 text-center text-[10px] text-neutral-500 hidden md:table-cell">
                        {f.primo_acquisto || "—"}
                      </td>
                      <td className="px-3 py-2.5 text-center text-[10px] text-neutral-500 hidden md:table-cell">
                        {f.ultimo_acquisto || "—"}
                      </td>
                      <td className="px-3 py-2.5 text-center text-neutral-400">→</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
