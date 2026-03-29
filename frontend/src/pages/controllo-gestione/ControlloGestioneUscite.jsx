// @version: v1.0-controllo-gestione-uscite
// Tabellone Uscite — fatture da pagare, arretrati, scadenze
import React, { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { API_BASE, apiFetch } from "../../config/api";

const fmt = (n) => n != null ? Number(n).toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "—";

const STATO_STYLE = {
  DA_PAGARE:       { bg: "bg-amber-100", text: "text-amber-800", border: "border-amber-200", label: "Da pagare" },
  SCADUTA:         { bg: "bg-red-100",   text: "text-red-800",   border: "border-red-200",   label: "Scaduta" },
  PAGATA:          { bg: "bg-emerald-100", text: "text-emerald-800", border: "border-emerald-200", label: "Pagata" },
  PAGATA_MANUALE:  { bg: "bg-teal-100",  text: "text-teal-800",  border: "border-teal-200",  label: "Pagata *" },
  PARZIALE:        { bg: "bg-blue-100",  text: "text-blue-800",  border: "border-blue-200",  label: "Parziale" },
};

const FONTE_BADGE = {
  xml: { label: "XML", color: "bg-sky-100 text-sky-700" },
  fornitore: { label: "Default forn.", color: "bg-violet-100 text-violet-700" },
};

export default function ControlloGestioneUscite() {
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState(null);
  const [filtroStato, setFiltroStato] = useState("");
  const [filtroFornitore, setFiltroFornitore] = useState("");
  const [ordine, setOrdine] = useState("scadenza_asc");

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filtroStato) params.append("stato", filtroStato);
      if (filtroFornitore) params.append("fornitore", filtroFornitore);
      params.append("ordine", ordine);
      const res = await apiFetch(`${API_BASE}/controllo-gestione/uscite?${params}`);
      if (!res.ok) throw new Error("Errore API");
      setData(await res.json());
    } catch (e) {
      console.error("Errore caricamento uscite:", e);
    } finally {
      setLoading(false);
    }
  }, [filtroStato, filtroFornitore, ordine]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleImport = async () => {
    setImporting(true);
    setImportResult(null);
    try {
      const res = await apiFetch(`${API_BASE}/controllo-gestione/uscite/import`, { method: "POST" });
      if (!res.ok) throw new Error("Errore import");
      setImportResult(await res.json());
      fetchData();
    } catch (e) {
      setImportResult({ errore: e.message });
    } finally {
      setImporting(false);
    }
  };

  const rig = data?.riepilogo || {};
  const uscite = data?.uscite || [];

  return (
    <div className="min-h-screen bg-neutral-100 p-4 md:p-6">
      <div className="max-w-7xl mx-auto">

        {/* HEADER */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-6 gap-3">
          <div>
            <h1 className="text-2xl font-bold text-sky-900 font-playfair">Tabellone Uscite</h1>
            <p className="text-sm text-neutral-500 mt-0.5">Fatture da pagare, arretrati, scadenze</p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => navigate("/controllo-gestione")}
              className="px-3 py-1.5 text-sm rounded-lg border border-neutral-300 text-neutral-600 hover:bg-neutral-50"
            >
              &larr; Menu
            </button>
            <button
              onClick={handleImport}
              disabled={importing}
              className="px-4 py-1.5 text-sm rounded-lg bg-sky-600 text-white hover:bg-sky-700 disabled:opacity-50 font-medium"
            >
              {importing ? "Importando..." : "Importa da Acquisti"}
            </button>
          </div>
        </div>

        {/* IMPORT RESULT */}
        {importResult && (
          <div className={`mb-4 p-3 rounded-xl text-sm ${importResult.errore ? "bg-red-50 border border-red-200 text-red-700" : "bg-emerald-50 border border-emerald-200 text-emerald-700"}`}>
            {importResult.errore
              ? `Errore: ${importResult.errore}`
              : `Import completato — ${importResult.importate} nuove, ${importResult.aggiornate} aggiornate, ${importResult.saltate} invariate. ${importResult.senza_scadenza > 0 ? `⚠️ ${importResult.senza_scadenza} senza scadenza!` : ""}`
            }
          </div>
        )}

        {/* KPI CARDS */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          <KPI
            label="Da pagare"
            value={`€ ${fmt(rig.totale_da_pagare)}`}
            sub={`${rig.num_da_pagare || 0} fatture`}
            color="amber"
            onClick={() => setFiltroStato(filtroStato === "DA_PAGARE" ? "" : "DA_PAGARE")}
            active={filtroStato === "DA_PAGARE"}
          />
          <KPI
            label="Arretrati"
            value={`€ ${fmt(rig.totale_scadute)}`}
            sub={`${rig.num_scadute || 0} scadute`}
            color="red"
            onClick={() => setFiltroStato(filtroStato === "SCADUTA" ? "" : "SCADUTA")}
            active={filtroStato === "SCADUTA"}
          />
          <KPI
            label="Pagate"
            value={`€ ${fmt(rig.totale_pagate)}`}
            sub={`${rig.num_pagate || 0} fatture`}
            color="emerald"
            onClick={() => setFiltroStato(filtroStato === "PAGATA" ? "" : "PAGATA")}
            active={filtroStato === "PAGATA"}
          />
          <KPI
            label="Senza scadenza"
            value={rig.num_senza_scadenza || 0}
            sub="Da configurare"
            color="violet"
            onClick={() => navigate("/controllo-gestione/uscite/senza-scadenza")}
          />
        </div>

        {/* FILTRI */}
        <div className="flex flex-wrap gap-3 mb-4 items-center">
          <input
            type="text"
            placeholder="Cerca fornitore..."
            value={filtroFornitore}
            onChange={(e) => setFiltroFornitore(e.target.value)}
            className="px-3 py-1.5 border border-neutral-300 rounded-lg text-sm w-56 focus:border-sky-400 focus:ring-1 focus:ring-sky-200 outline-none"
          />
          <select
            value={ordine}
            onChange={(e) => setOrdine(e.target.value)}
            className="px-3 py-1.5 border border-neutral-300 rounded-lg text-sm bg-white"
          >
            <option value="scadenza_asc">Scadenza (prossime prima)</option>
            <option value="scadenza_desc">Scadenza (ultime prima)</option>
            <option value="importo_desc">Importo (alto → basso)</option>
            <option value="importo_asc">Importo (basso → alto)</option>
            <option value="fornitore">Fornitore A→Z</option>
            <option value="data_fattura">Data fattura (recenti)</option>
          </select>
          {filtroStato && (
            <button
              onClick={() => setFiltroStato("")}
              className="px-3 py-1.5 text-xs rounded-lg bg-neutral-200 text-neutral-600 hover:bg-neutral-300"
            >
              Rimuovi filtro: {STATO_STYLE[filtroStato]?.label} ×
            </button>
          )}
          <span className="text-xs text-neutral-400 ml-auto">{uscite.length} righe</span>
        </div>

        {/* TABELLONE */}
        {loading ? (
          <div className="text-center py-12 text-neutral-400">Caricamento...</div>
        ) : uscite.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-neutral-400 text-sm">
              {data ? "Nessuna uscita trovata. Clicca \"Importa da Acquisti\" per popolare." : "Errore di caricamento."}
            </p>
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-neutral-200 overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-sky-50 border-b border-sky-100">
                    <th className="px-4 py-3 text-left text-xs font-bold text-sky-800">Stato</th>
                    <th className="px-4 py-3 text-left text-xs font-bold text-sky-800">Fornitore</th>
                    <th className="px-4 py-3 text-left text-xs font-bold text-sky-800">N° Fattura</th>
                    <th className="px-4 py-3 text-left text-xs font-bold text-sky-800">Data Fatt.</th>
                    <th className="px-4 py-3 text-right text-xs font-bold text-sky-800">Importo</th>
                    <th className="px-4 py-3 text-left text-xs font-bold text-sky-800">Scadenza</th>
                    <th className="px-4 py-3 text-left text-xs font-bold text-sky-800">Mod. Pag.</th>
                    <th className="px-4 py-3 text-right text-xs font-bold text-sky-800">Pagato</th>
                    <th className="px-4 py-3 text-right text-xs font-bold text-sky-800">Residuo</th>
                  </tr>
                </thead>
                <tbody>
                  {uscite.map((u) => {
                    const st = STATO_STYLE[u.stato] || STATO_STYLE.DA_PAGARE;
                    const residuo = (u.totale || 0) - (u.importo_pagato || 0);
                    const fonte = FONTE_BADGE[u.scadenza_fonte];
                    const giorniAScad = u.data_scadenza
                      ? Math.ceil((new Date(u.data_scadenza) - new Date()) / 86400000)
                      : null;

                    return (
                      <tr key={u.id} className={`border-b border-neutral-100 hover:bg-neutral-50 ${u.stato === "SCADUTA" ? "bg-red-50/30" : ""}`}>
                        <td className="px-4 py-2.5">
                          <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-semibold ${st.bg} ${st.text} ${st.border} border`}>
                            {st.label}
                          </span>
                        </td>
                        <td className="px-4 py-2.5">
                          <div className="font-medium text-neutral-800 truncate max-w-[200px]">{u.fornitore_nome}</div>
                        </td>
                        <td className="px-4 py-2.5 text-neutral-600">{u.numero_fattura || "—"}</td>
                        <td className="px-4 py-2.5 text-neutral-500 whitespace-nowrap">
                          {u.data_fattura ? new Date(u.data_fattura + "T00:00:00").toLocaleDateString("it-IT", { day: "2-digit", month: "short", year: "2-digit" }) : "—"}
                        </td>
                        <td className="px-4 py-2.5 text-right font-semibold text-neutral-800">
                          € {fmt(u.totale)}
                        </td>
                        <td className="px-4 py-2.5">
                          {u.data_scadenza ? (
                            <div className="flex items-center gap-1.5">
                              <span className={`whitespace-nowrap ${u.stato === "SCADUTA" ? "text-red-700 font-bold" : "text-neutral-700"}`}>
                                {new Date(u.data_scadenza + "T00:00:00").toLocaleDateString("it-IT", { day: "2-digit", month: "short" })}
                              </span>
                              {giorniAScad !== null && (
                                <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${
                                  giorniAScad < 0 ? "bg-red-100 text-red-600"
                                  : giorniAScad <= 7 ? "bg-amber-100 text-amber-700"
                                  : "bg-neutral-100 text-neutral-500"
                                }`}>
                                  {giorniAScad < 0 ? `${Math.abs(giorniAScad)}gg fa` : giorniAScad === 0 ? "oggi" : `fra ${giorniAScad}gg`}
                                </span>
                              )}
                              {fonte && (
                                <span className={`text-[10px] px-1 py-0.5 rounded ${fonte.color}`}>{fonte.label}</span>
                              )}
                            </div>
                          ) : (
                            <span className="text-neutral-300 text-xs italic">nessuna</span>
                          )}
                        </td>
                        <td className="px-4 py-2.5 text-xs text-neutral-500">
                          {u.modalita_pagamento_label || "—"}
                        </td>
                        <td className="px-4 py-2.5 text-right text-emerald-700">
                          <div>{u.importo_pagato > 0 ? `€ ${fmt(u.importo_pagato)}` : "—"}</div>
                          {u.metodo_pagamento_label && (
                            <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${
                              u.metodo_pagamento === "CONTANTI" ? "bg-orange-100 text-orange-700"
                              : u.metodo_pagamento === "CARTA" ? "bg-purple-100 text-purple-700"
                              : "bg-sky-100 text-sky-700"
                            }`}>{u.metodo_pagamento_label}</span>
                          )}
                        </td>
                        <td className={`px-4 py-2.5 text-right font-bold ${
                          residuo > 0 && u.stato === "SCADUTA" ? "text-red-700" : residuo > 0 ? "text-amber-700" : "text-emerald-600"
                        }`}>
                          {residuo > 0 ? `€ ${fmt(residuo)}` : "✓"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}


function KPI({ label, value, sub, color, onClick, active }) {
  const colorMap = {
    amber: "border-amber-200 bg-amber-50",
    red: "border-red-200 bg-red-50",
    emerald: "border-emerald-200 bg-emerald-50",
    violet: "border-violet-200 bg-violet-50",
  };
  const textMap = {
    amber: "text-amber-800",
    red: "text-red-800",
    emerald: "text-emerald-800",
    violet: "text-violet-800",
  };

  return (
    <div
      onClick={onClick}
      className={`rounded-xl border p-4 cursor-pointer transition ${colorMap[color] || "border-neutral-200 bg-neutral-50"}
        ${active ? "ring-2 ring-sky-400 shadow-md" : "hover:shadow-sm"}`}
    >
      <div className={`text-xs font-semibold ${textMap[color] || "text-neutral-600"}`}>{label}</div>
      <div className={`text-lg font-bold mt-1 ${textMap[color] || "text-neutral-800"}`}>{value}</div>
      <div className="text-xs text-neutral-400 mt-0.5">{sub}</div>
    </div>
  );
}
