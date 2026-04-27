// @version: v3.3-mattoni — M.I primitives (Btn) su azioni filtri (Pulisci/Ricarica), tocco minimo
// Pagina Fatture Elettroniche — Layout Cantina: Filtri SX + Lista DX + Dettaglio inline
// Il dettaglio inline usa il componente riutilizzabile FattureDettaglio
// (stesso che gira in /acquisti/dettaglio/:id e in ControlloGestioneUscite),
// per mantenere una sola grafica/logica coerente in tutta l'app.
import React, { useState, useEffect, useMemo, useCallback } from "react";
import { API_BASE, apiFetch } from "../../config/api";
import FattureNav from "./FattureNav";
import FattureDettaglio from "./FattureDettaglio";
import { Btn } from "../../components/ui";
import StatoPagamentoBadge, { STATI_PAGAMENTO } from "../../components/StatoPagamentoBadge";

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
const fInp = "w-full border border-neutral-300 rounded-md px-2.5 py-2.5 text-[11px] bg-white focus:outline-none focus:ring-2 focus:ring-teal-300";
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
  const [mostraEsclusi, setMostraEsclusi] = useState(false); // S40-8: nascondi fornitori esclusi da acquisti

  // ── Ordinamento ──
  const [sortKey, setSortKey] = useState("data_fattura");
  const [sortDir, setSortDir] = useState("desc");

  // ── Dettaglio inline ──
  // Il fetch è gestito direttamente da FattureDettaglio, qui teniamo solo l'id
  // della fattura aperta per il toggle e l'highlight di riga.
  const [openId, setOpenId] = useState(null);

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

    // S40-8: nascondi fatture dei fornitori esclusi da acquisti (default)
    if (!mostraEsclusi) {
      list = list.filter(f => !f.escluso_acquisti);
    }

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
  }, [fatture, searchText, searchNumero, annoSel, meseSel, fornitoreSel, pivaSel, pagatoSel, importoMode, importoVal1, importoVal2, mostraEsclusi]);

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
  // Toggle semplice: il componente FattureDettaglio gestisce il fetch autonomamente.
  const openDetail = (id) => {
    setOpenId(openId === id ? null : id);
  };

  // ── Segna pagata manuale (CG) ──
  // Chiamato dal bottone nella sidebar di FattureDettaglio (prop onSegnaPagata)
  const segnaPagata = async (id) => {
    if (!window.confirm("Segnare questa fattura come pagata (in attesa di riconciliazione banca)?")) return;
    try {
      const res = await apiFetch(`${API_BASE}/controllo-gestione/fattura/${id}/segna-pagata-manuale`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ metodo_pagamento: "CONTO_CORRENTE" }),
      });
      const data = await res.json();
      if (!data.ok) { alert(data.error || "Errore"); return; }
      // Aggiorna la riga nella lista; FattureDettaglio fa il proprio refetch
      setFatture(prev => prev.map(f => f.id === id ? { ...f, pagato: 1 } : f));
    } catch { alert("Errore di rete"); }
  };

  // ── Cambio stato pagamento (Modulo M.2, 2026-04-27) ──
  // Endpoint: PUT /contabilita/fe/fatture/{id}/stato-pagamento
  // Stati settabili manualmente: da_pagare, da_verificare, pagato_manuale.
  // Lo stato 'pagato' (definitivo) si attiva da hook riconciliazione bancaria.
  const cambiaStato = async (id, nuovoStato) => {
    if (!STATI_PAGAMENTO[nuovoStato] || nuovoStato === "pagato") {
      alert("Stato non valido o non settabile manualmente.");
      return;
    }
    const url = `${API_BASE}/contabilita/fe/fatture/${id}/stato-pagamento`;
    try {
      const res = await apiFetch(url, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stato: nuovoStato }),
      });
      if (!res.ok) {
        const body = await res.text().catch(() => "");
        alert(`Errore HTTP ${res.status}: ${body.slice(0, 300)}`);
        return;
      }
      const data = await res.json();
      if (!data.ok) { alert(data.error || "Errore"); return; }
      // Aggiorna riga nella lista
      setFatture(prev => prev.map(f => f.id === id ? {
        ...f,
        stato_pagamento: nuovoStato,
        pagato: nuovoStato === "pagato_manuale" ? 1 : 0,
      } : f));
    } catch (e) {
      alert(`Errore di rete: ${e.message || e.name}`);
    }
  };

  // ── Riporta a NON pagata (toggle inverso) — 2026-04-27 ──
  // Endpoint backend: POST /contabilita/fe/fatture/segna-non-pagate
  // (gestisce sia fe_fatture.pagato che cg_uscite.stato in atomico)
  const segnaNonPagata = async (id) => {
    if (!window.confirm("Riportare questa fattura a NON pagata?\n\nL'eventuale uscita in Controllo Gestione torna in stato 'da pagare'/'scaduta'.")) return;
    const url = `${API_BASE}/contabilita/fe/fatture/segna-non-pagate`;
    const opts = {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fattura_ids: [id] }),
    };
    // 1 retry automatico dopo 1.5s su TypeError (network / restart momentaneo)
    let res;
    try {
      res = await apiFetch(url, opts);
    } catch (e1) {
      if (e1 instanceof TypeError) {
        await new Promise((r) => setTimeout(r, 1500));
        try { res = await apiFetch(url, opts); }
        catch (e2) {
          alert(`Errore di rete: backend non risponde. Aspetta qualche secondo e riprova.\n\nDettagli: ${e2.message || e2.name}`);
          return;
        }
      } else {
        alert(`Errore: ${e1.message || e1.name}`);
        return;
      }
    }
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      alert(`Errore HTTP ${res.status}: ${body.slice(0, 300)}`);
      return;
    }
    let data;
    try { data = await res.json(); } catch { data = { ok: true }; }
    if (!data.ok) { alert(data.error || "Errore: response non ok"); return; }
    setFatture(prev => prev.map(f => f.id === id ? { ...f, pagato: 0 } : f));
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
    <div className="min-h-screen bg-brand-cream font-sans">
      <FattureNav current="fatture" />

      {/* LAYOUT: Filtri SX + Contenuto DX */}
      <div className="flex" style={{ height: "calc(100dvh - 48px)" }}>

        {/* ═══════ SIDEBAR FILTRI (280px) ═══════ */}
        <div className="w-sidebar min-w-sidebar border-r border-neutral-200 bg-neutral-50 overflow-y-auto flex-shrink-0">
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
                      className="border border-neutral-300 rounded-md px-2 py-2.5 text-[11px] bg-white w-[56px]">
                      <option value="any">—</option>
                      <option value="gt">&gt;</option>
                      <option value="lt">&lt;</option>
                      <option value="between">tra</option>
                    </select>
                    <input type="number" value={importoVal1} onChange={e => setImportoVal1(e.target.value)}
                      className="w-16 border border-neutral-300 rounded-md px-2 py-2.5 text-[11px] bg-white" placeholder="€" />
                    {importoMode === "between" && (
                      <input type="number" value={importoVal2} onChange={e => setImportoVal2(e.target.value)}
                        className="w-16 border border-neutral-300 rounded-md px-2 py-2.5 text-[11px] bg-white" placeholder="€" />
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
              {/* S40-8: toggle fornitori esclusi — visibile solo se ce ne sono */}
              {fatture.some(f => f.escluso_acquisti) && (
                <label className="flex items-center gap-2 text-[10px] text-neutral-600 cursor-pointer mt-2 pt-1.5 border-t border-emerald-200">
                  <input type="checkbox" checked={mostraEsclusi} onChange={e => setMostraEsclusi(e.target.checked)}
                    className="accent-amber-600" />
                  Mostra fornitori esclusi ({fatture.filter(f => f.escluso_acquisti).length})
                </label>
              )}
            </div>

            {/* ── Azioni filtri ── */}
            <div className="flex gap-1.5 pt-1">
              <Btn variant="secondary" size="sm" onClick={clearFilters} className="flex-1">
                ✕ Pulisci {activeFilters > 0 && <span className="ml-1 px-1.5 py-0.5 rounded-full bg-teal-100 text-teal-800 text-[9px]">{activeFilters}</span>}
              </Btn>
              <Btn variant="chip" tone="emerald" size="sm" onClick={fetchAll} className="flex-1">
                ⟳ Ricarica
              </Btn>
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
          ) : openId ? (
            /* ═══════ VISTA DETTAGLIO (componente unificato) ═══════ */
            <div className="p-4 sm:p-6">
              <div className="mb-3 flex items-center justify-between">
                <button
                  onClick={() => setOpenId(null)}
                  className="text-xs text-teal-700 hover:text-teal-900 font-medium transition"
                >
                  ← Torna alla lista
                </button>
                <span className="text-[10px] text-neutral-400">ID: {openId}</span>
              </div>
              <FattureDettaglio
                fatturaId={openId}
                inline={true}
                onClose={() => setOpenId(null)}
                onSegnaPagata={segnaPagata}
                onSegnaNonPagata={segnaNonPagata}
                onCambiaStato={cambiaStato}
                onFatturaUpdated={(f) => {
                  // Sync riga nella lista con eventuali modifiche effettuate nel dettaglio
                  setFatture(prev => prev.map(x => x.id === f.id ? { ...x, ...f } : x));
                }}
              />
            </div>
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
                    <th className="px-3 py-2 text-right hidden xl:table-cell">IVA</th>
                    <th className="px-3 py-2 text-right cursor-pointer hover:text-teal-700" onClick={() => toggleSort("totale_fattura")}>
                      Totale{sortIcon("totale_fattura")}
                    </th>
                    <th className="px-3 py-2 text-center hidden xl:table-cell">Righe</th>
                    <th className="px-3 py-2 text-center">Stato</th>
                    <th className="px-3 py-2 text-center hidden xl:table-cell">Fonte</th>
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
                          {!!f.escluso_acquisti && <span className="ml-1.5 px-1 py-0 rounded text-[8px] font-bold bg-amber-100 text-amber-700 align-middle uppercase">escluso</span>}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums text-neutral-700">€ {fmt(f.imponibile_totale)}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-neutral-400 text-[10px] hidden xl:table-cell">€ {fmt(f.iva_totale)}</td>
                        <td className="px-3 py-2 text-right tabular-nums font-semibold text-teal-900">€ {fmt(f.totale_fattura)}</td>
                        <td className="px-3 py-2 text-center hidden xl:table-cell">
                          {f.n_righe > 0
                            ? <span className="text-teal-700 font-medium">{f.n_righe}</span>
                            : <span className="text-neutral-300">—</span>}
                        </td>
                        <td className="px-3 py-2 text-center">
                          <StatoPagamentoBadge stato={f.stato_pagamento || (f.pagato ? "pagato_manuale" : "da_pagare")} />
                        </td>
                        <td className="px-3 py-2 text-center hidden xl:table-cell">
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
// NOTA: il componente locale DetailView è stato rimosso in v3.1.
// Il dettaglio fattura inline è ora gestito dal componente riutilizzabile
// FattureDettaglio (stesso componente usato nella route /acquisti/dettaglio/:id
// e nello split-pane dello Scadenzario in ControlloGestioneUscite).
