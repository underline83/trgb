// @version: v1.1-mattoni — M.I primitives (Btn, EmptyState) su CTA + paginazione
// Dettaglio prodotti con filtri, ricerca e paginazione
import React, { useEffect, useState } from "react";
import { API_BASE, apiFetch } from "../../config/api";
import StatisticheNav from "./StatisticheNav";
import { Btn, EmptyState } from "../../components/ui";

const EP = `${API_BASE}/statistiche`;

const MESI = [
  "Gennaio", "Febbraio", "Marzo", "Aprile", "Maggio", "Giugno",
  "Luglio", "Agosto", "Settembre", "Ottobre", "Novembre", "Dicembre",
];

const fmt = (n) =>
  n != null
    ? Number(n).toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : "—";

const fmtInt = (n) =>
  n != null ? Number(n).toLocaleString("it-IT") : "—";

const ANNI = [];
for (let y = 2020; y <= new Date().getFullYear() + 1; y++) ANNI.push(y);

const PAGE_SIZE = 50;

export default function StatisticheProdotti() {
  const now = new Date();
  const [loading, setLoading] = useState(true);
  const [prodotti, setProdotti] = useState([]);
  const [categorie, setCategorie] = useState([]);

  // Filtri
  const [anno, setAnno] = useState(now.getFullYear());
  const [mese, setMese] = useState("");
  const [categoria, setCategoria] = useState("");
  const [q, setQ] = useState("");
  const [offset, setOffset] = useState(0);

  // Carica categorie per il filtro
  useEffect(() => {
    apiFetch(`${EP}/categorie?anno=${anno}`)
      .then((r) => r.ok ? r.json() : [])
      .then(setCategorie)
      .catch(() => {});
  }, [anno]);

  // Carica prodotti
  useEffect(() => {
    loadProdotti();
  }, [anno, mese, categoria, q, offset]);

  const loadProdotti = async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (anno) params.set("anno", anno);
    if (mese) params.set("mese", mese);
    if (categoria) params.set("categoria", categoria);
    if (q.trim()) params.set("q", q.trim());
    params.set("limit", PAGE_SIZE);
    params.set("offset", offset);

    try {
      const resp = await apiFetch(`${EP}/prodotti?${params}`);
      if (resp.ok) setProdotti(await resp.json());
    } catch (_) {}
    setLoading(false);
  };

  const handleSearch = (e) => {
    e.preventDefault();
    setOffset(0);
    loadProdotti();
  };

  return (
    <div className="min-h-screen bg-brand-cream p-6 font-sans">
      <StatisticheNav current="prodotti" />
      <div className="max-w-6xl mx-auto bg-white shadow-2xl rounded-3xl p-6 sm:p-10 border border-neutral-200 mt-4">
        <h1 className="text-3xl font-bold text-rose-900 tracking-wide font-playfair mb-1">
          Dettaglio Prodotti
        </h1>
        <p className="text-neutral-600 text-sm mb-6">
          Visualizza e cerca tutti i prodotti venduti. Filtra per anno, mese e categoria.
        </p>

        {/* Filtri */}
        <form onSubmit={handleSearch} className="flex flex-wrap items-end gap-3 mb-6">
          <div>
            <label className="block text-xs text-neutral-500 mb-1">Anno</label>
            <select
              value={anno}
              onChange={(e) => { setAnno(Number(e.target.value)); setOffset(0); }}
              className="border border-neutral-300 rounded-lg px-3 py-1.5 text-sm"
            >
              {ANNI.map((y) => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs text-neutral-500 mb-1">Mese</label>
            <select
              value={mese}
              onChange={(e) => { setMese(e.target.value); setOffset(0); }}
              className="border border-neutral-300 rounded-lg px-3 py-1.5 text-sm"
            >
              <option value="">Tutti</option>
              {MESI.map((m, i) => (
                <option key={i + 1} value={i + 1}>{m}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs text-neutral-500 mb-1">Categoria</label>
            <select
              value={categoria}
              onChange={(e) => { setCategoria(e.target.value); setOffset(0); }}
              className="border border-neutral-300 rounded-lg px-3 py-1.5 text-sm"
            >
              <option value="">Tutte</option>
              {categorie.map((c, i) => (
                <option key={i} value={c.categoria}>{c.categoria}</option>
              ))}
            </select>
          </div>
          <div className="flex-1 min-w-[150px]">
            <label className="block text-xs text-neutral-500 mb-1">Cerca prodotto</label>
            <input
              type="text"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="es. pizza, birra..."
              className="border border-neutral-300 rounded-lg px-3 py-1.5 text-sm w-full"
            />
          </div>
          <Btn type="submit" variant="primary" size="sm">Cerca</Btn>
        </form>

        {/* Tabella prodotti */}
        {loading ? (
          <p className="text-neutral-400 text-sm py-8 text-center">Caricamento...</p>
        ) : prodotti.length === 0 ? (
          <EmptyState
            icon="🔎"
            title="Nessun prodotto trovato"
            description="Modifica i filtri o la ricerca per vedere più risultati."
            compact
          />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-neutral-200 text-left text-neutral-500">
                    <th className="py-2 px-2">Prodotto</th>
                    <th className="py-2 px-2">Categoria</th>
                    <th className="py-2 px-2 text-right">Quantità</th>
                    <th className="py-2 px-2 text-right">Totale €</th>
                    <th className="py-2 px-2 text-right">Prezzo medio</th>
                  </tr>
                </thead>
                <tbody>
                  {prodotti.map((p, i) => (
                    <tr key={i} className="border-b border-neutral-50 hover:bg-neutral-50">
                      <td className="py-2 px-2 font-medium">{p.prodotto}</td>
                      <td className="py-2 px-2 text-neutral-500">{p.categoria}</td>
                      <td className="py-2 px-2 text-right">{fmtInt(p.quantita)}</td>
                      <td className="py-2 px-2 text-right font-medium">{fmt(p.totale_euro)}</td>
                      <td className="py-2 px-2 text-right text-neutral-500">{fmt(p.prezzo_medio)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Paginazione */}
            <div className="flex items-center justify-between mt-4">
              <Btn
                variant="ghost"
                size="sm"
                onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
                disabled={offset === 0}
              >
                ← Precedenti
              </Btn>
              <span className="text-xs text-neutral-400">
                {offset + 1}–{offset + prodotti.length}
              </span>
              <Btn
                variant="ghost"
                size="sm"
                onClick={() => setOffset(offset + PAGE_SIZE)}
                disabled={prodotti.length < PAGE_SIZE}
              >
                Successivi →
              </Btn>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
