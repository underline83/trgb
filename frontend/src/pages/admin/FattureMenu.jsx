// @version: v2.0-menu-kpi
// Hub fatture elettroniche con mini-KPI, ricerca rapida
import React, { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { API_BASE, apiFetch } from "../../config/api";

const FE = `${API_BASE}/contabilita/fe`;
const fmt = (v) =>
  v != null
    ? v.toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : "-";

export default function FattureMenu() {
  const navigate = useNavigate();
  const [kpi, setKpi] = useState(null);
  const [search, setSearch] = useState("");

  // Load KPIs
  useEffect(() => {
    (async () => {
      try {
        const res = await apiFetch(`${FE}/stats/kpi`);
        if (res.ok) setKpi(await res.json());
      } catch { /* ok */ }
    })();
  }, []);

  const handleSearch = () => {
    if (search.trim()) {
      navigate(`/admin/fatture/elenco?q=${encodeURIComponent(search.trim())}`);
    }
  };

  const handleSearchKey = (e) => {
    if (e.key === "Enter") handleSearch();
  };

  return (
    <div className="min-h-screen bg-neutral-100 p-6 font-sans">
      <div className="max-w-5xl mx-auto bg-white shadow-2xl rounded-3xl p-8 sm:p-10 border border-neutral-200">
        {/* HEADER */}
        <div className="flex flex-col sm:flex-row justify-between gap-4 mb-6">
          <div>
            <h1 className="text-3xl sm:text-4xl font-bold text-amber-900 tracking-wide font-playfair mb-1">
              Fatture Elettroniche
            </h1>
            <p className="text-neutral-500 text-sm">
              Import, analisi e categorizzazione acquisti da fatture XML
            </p>
          </div>
          <div className="flex flex-col gap-2 sm:items-end">
            <button
              type="button"
              onClick={() => navigate("/admin")}
              className="px-4 py-2 rounded-xl text-sm font-medium border border-neutral-300 bg-neutral-50 hover:bg-neutral-100 shadow-sm transition"
            >
              ← Amministrazione
            </button>
          </div>
        </div>

        {/* MINI KPI */}
        {kpi && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
            {[
              { label: "Fatture", value: kpi.n_fatture, bg: "bg-blue-50 border-blue-200" },
              { label: "Totale Spesa", value: `€ ${fmt(kpi.totale_spesa)}`, bg: "bg-amber-50 border-amber-200" },
              { label: "Fornitori", value: kpi.n_fornitori, bg: "bg-green-50 border-green-200" },
              { label: "Media Mensile", value: `€ ${fmt(kpi.spesa_media_mensile)}`, bg: "bg-purple-50 border-purple-200" },
            ].map((c) => (
              <div key={c.label} className={`rounded-xl border p-3 ${c.bg}`}>
                <p className="text-[10px] text-neutral-500 font-medium uppercase tracking-wider">{c.label}</p>
                <p className="text-lg font-bold text-neutral-900 font-playfair tabular-nums">{c.value}</p>
              </div>
            ))}
          </div>
        )}

        {/* SEARCH BAR */}
        <div className="mb-6">
          <div className="relative">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={handleSearchKey}
              placeholder="Cerca fattura per fornitore, P.IVA, numero..."
              className="w-full text-sm border border-neutral-300 rounded-2xl px-5 py-3 pr-12 bg-neutral-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-300 focus:border-amber-400 transition"
            />
            <button
              onClick={handleSearch}
              className="absolute right-2 top-1/2 -translate-y-1/2 px-3 py-1.5 rounded-xl bg-amber-600 text-white text-xs font-semibold hover:bg-amber-700 transition"
            >
              Cerca
            </button>
          </div>
        </div>

        {/* GRID MENU */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <Link
            to="/admin/fatture/dashboard"
            className="bg-blue-50 border border-blue-200 text-blue-900 rounded-2xl p-6 shadow hover:shadow-lg hover:-translate-y-0.5 transition transform"
          >
            <div className="flex items-center gap-3 mb-2">
              <span className="text-3xl">📈</span>
              <h2 className="text-lg font-semibold font-playfair">Dashboard Acquisti</h2>
            </div>
            <p className="text-neutral-600 text-xs">
              KPI, grafici mensili, categorie, confronto annuale e anomalie.
            </p>
          </Link>

          <Link
            to="/admin/fatture/elenco"
            className="bg-amber-50 border border-amber-200 text-amber-900 rounded-2xl p-6 shadow hover:shadow-lg hover:-translate-y-0.5 transition transform"
          >
            <div className="flex items-center gap-3 mb-2">
              <span className="text-3xl">📋</span>
              <h2 className="text-lg font-semibold font-playfair">Elenco Fatture</h2>
            </div>
            <p className="text-neutral-600 text-xs">
              Ricerca avanzata, filtri per data/importo/fornitore, dettaglio completo.
            </p>
            {kpi && (
              <span className="inline-block mt-2 text-[10px] font-medium bg-amber-200/60 text-amber-800 px-2 py-0.5 rounded-full">
                {kpi.n_fatture} fatture
              </span>
            )}
          </Link>

          <Link
            to="/admin/fatture/fornitori"
            className="bg-teal-50 border border-teal-200 text-teal-900 rounded-2xl p-6 shadow hover:shadow-lg hover:-translate-y-0.5 transition transform"
          >
            <div className="flex items-center gap-3 mb-2">
              <span className="text-3xl">🏢</span>
              <h2 className="text-lg font-semibold font-playfair">Fornitori</h2>
            </div>
            <p className="text-neutral-600 text-xs">
              Elenco fornitori, spesa totale, numero fatture e storico acquisti.
            </p>
            {kpi && (
              <span className="inline-block mt-2 text-[10px] font-medium bg-teal-200/60 text-teal-800 px-2 py-0.5 rounded-full">
                {kpi.n_fornitori} fornitori
              </span>
            )}
          </Link>

          <Link
            to="/admin/fatture/import"
            className="bg-green-50 border border-green-200 text-green-900 rounded-2xl p-6 shadow hover:shadow-lg hover:-translate-y-0.5 transition transform"
          >
            <div className="flex items-center gap-3 mb-2">
              <span className="text-3xl">📤</span>
              <h2 className="text-lg font-semibold font-playfair">Import XML</h2>
            </div>
            <p className="text-neutral-600 text-xs">
              Carica file XML o archivi ZIP. Duplicati scartati automaticamente.
            </p>
          </Link>

          <Link
            to="/admin/fatture/categorie"
            className="bg-purple-50 border border-purple-200 text-purple-900 rounded-2xl p-6 shadow hover:shadow-lg hover:-translate-y-0.5 transition transform"
          >
            <div className="flex items-center gap-3 mb-2">
              <span className="text-3xl">🏷️</span>
              <h2 className="text-lg font-semibold font-playfair">Categorie Fornitori</h2>
            </div>
            <p className="text-neutral-600 text-xs">
              Assegna categorie, gestisci l'albero Cat.1/Cat.2, escludi fornitori.
            </p>
            {kpi && (
              <span className="inline-block mt-2 text-[10px] font-medium bg-purple-200/60 text-purple-800 px-2 py-0.5 rounded-full">
                {kpi.n_fornitori} fornitori
              </span>
            )}
          </Link>
        </div>
      </div>
    </div>
  );
}
