// @version: v1.1-with-nav
// Pagina dettaglio fornitore: lista prodotti acquistati con categorizzazione per riga
import React, { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { API_BASE, apiFetch } from "../../config/api";
import FattureNav from "./FattureNav";

const CAT_BASE = `${API_BASE}/contabilita/fe/categorie`;

export default function FattureFornitoreDettaglio() {
  const { piva } = useParams();
  const navigate = useNavigate();

  const [prodotti, setProdotti] = useState([]);
  const [categorie, setCategorie] = useState([]);
  const [statsFornitore, setStatsFornitore] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(null); // desc being saved
  const [filter, setFilter] = useState("tutti"); // tutti | assegnati | non_assegnati
  const [search, setSearch] = useState("");

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [resProd, resCat, resStats] = await Promise.all([
        apiFetch(`${CAT_BASE}/fornitori/${encodeURIComponent(piva)}/prodotti`),
        apiFetch(CAT_BASE),
        apiFetch(`${CAT_BASE}/fornitori/${encodeURIComponent(piva)}/stats`),
      ]);
      if (resProd.ok) setProdotti(await resProd.json());
      if (resCat.ok) setCategorie(await resCat.json());
      if (resStats.ok) setStatsFornitore(await resStats.json());
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [piva]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // nome fornitore dal primo prodotto
  const fornNome = prodotti.length > 0 ? (prodotti[0].fornitore_nome || piva) : piva;

  const handleAssign = async (prod, catId, subId) => {
    setSaving(prod.descrizione);
    try {
      await apiFetch(`${CAT_BASE}/fornitori/prodotti/assegna`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fornitore_piva: piva,
          fornitore_nome: fornNome,
          descrizione: prod.descrizione,
          categoria_id: catId || null,
          sottocategoria_id: subId || null,
        }),
      });
      await fetchData();
    } catch (e) {
      console.error(e);
    } finally {
      setSaving(null);
    }
  };

  // Filtro
  let filtered = prodotti;
  if (filter === "assegnati") filtered = filtered.filter((p) => p.categoria_id);
  if (filter === "non_assegnati") filtered = filtered.filter((p) => !p.categoria_id);
  if (search.trim()) {
    const q = search.toLowerCase();
    filtered = filtered.filter((p) => p.descrizione?.toLowerCase().includes(q));
  }

  const nAssegnati = prodotti.filter((p) => p.categoria_id).length;
  const nTotali = prodotti.length;
  const totaleSpesa = prodotti.reduce((s, p) => s + (p.totale_spesa || 0), 0);

  return (
    <div className="min-h-screen bg-neutral-100 font-sans">
      <FattureNav current="categorie" />
      <div className="max-w-7xl mx-auto p-4 sm:p-6">
      <div className="bg-white shadow-xl rounded-2xl p-6 sm:p-8 border border-neutral-200">
        {/* HEADER */}
        <div className="flex flex-col sm:flex-row justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl font-bold text-amber-900 font-playfair mb-1">
              Prodotti — {loading ? "..." : fornNome}
            </h1>
            <p className="text-neutral-500 text-sm">
              Categorizza i singoli prodotti acquistati da questo fornitore.
            </p>
          </div>
        </div>

        {/* STATS RIEPILOGO */}
        {!loading && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
            <div className="bg-amber-50 rounded-xl p-4 border border-amber-200 text-center">
              <div className="text-2xl font-bold text-amber-900">{nTotali}</div>
              <div className="text-xs text-neutral-600">Prodotti unici</div>
            </div>
            <div className="bg-green-50 rounded-xl p-4 border border-green-200 text-center">
              <div className="text-2xl font-bold text-green-800">{nAssegnati}</div>
              <div className="text-xs text-neutral-600">Categorizzati</div>
            </div>
            <div className="bg-red-50 rounded-xl p-4 border border-red-200 text-center">
              <div className="text-2xl font-bold text-red-700">{nTotali - nAssegnati}</div>
              <div className="text-xs text-neutral-600">Da assegnare</div>
            </div>
            <div className="bg-blue-50 rounded-xl p-4 border border-blue-200 text-center">
              <div className="text-2xl font-bold text-blue-900">
                {totaleSpesa.toLocaleString("it-IT", { minimumFractionDigits: 2 })}
              </div>
              <div className="text-xs text-neutral-600">Totale spesa €</div>
            </div>
          </div>
        )}

        {/* BREAKDOWN PER CATEGORIA (mini) */}
        {statsFornitore.length > 0 && (
          <div className="mb-6 flex flex-wrap gap-2">
            {statsFornitore.map((s, i) => (
              <span key={i} className={`text-xs px-2 py-1 rounded-full border ${
                s.categoria === "(Non categorizzato)"
                  ? "bg-neutral-100 border-neutral-300 text-neutral-600"
                  : "bg-amber-50 border-amber-200 text-amber-800"
              }`}>
                {s.categoria}{s.sottocategoria ? ` > ${s.sottocategoria}` : ""}
                <span className="ml-1 font-semibold">
                  {s.totale_spesa?.toLocaleString("it-IT", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}€
                </span>
              </span>
            ))}
          </div>
        )}

        {/* FILTRI */}
        <div className="flex flex-wrap gap-3 mb-4 items-center">
          <input type="text" placeholder="Cerca prodotto..."
            value={search} onChange={(e) => setSearch(e.target.value)}
            className="px-3 py-2 border border-neutral-300 rounded-xl text-sm w-64" />
          <select value={filter} onChange={(e) => setFilter(e.target.value)}
            className="px-3 py-2 border border-neutral-300 rounded-xl text-sm">
            <option value="tutti">Tutti ({nTotali})</option>
            <option value="non_assegnati">Da assegnare ({nTotali - nAssegnati})</option>
            <option value="assegnati">Assegnati ({nAssegnati})</option>
          </select>
          <span className="text-xs text-neutral-500">
            {nAssegnati}/{nTotali} categorizzati ({nTotali > 0 ? Math.round(nAssegnati / nTotali * 100) : 0}%)
          </span>
        </div>

        {loading ? (
          <p className="text-neutral-500 text-sm">Caricamento prodotti...</p>
        ) : filtered.length === 0 ? (
          <p className="text-neutral-500 text-sm">Nessun prodotto trovato.</p>
        ) : (
          <div className="border border-neutral-200 rounded-2xl overflow-hidden shadow-sm">
            <div className="max-h-[60vh] overflow-y-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-neutral-50 text-neutral-600 sticky top-0">
                  <tr>
                    <th className="px-3 py-2 text-left w-[35%]">Descrizione prodotto</th>
                    <th className="px-3 py-2 text-right">Righe</th>
                    <th className="px-3 py-2 text-right">Q.tà tot</th>
                    <th className="px-3 py-2 text-right">€ medio</th>
                    <th className="px-3 py-2 text-right">€ totale</th>
                    <th className="px-3 py-2 text-left">Categoria</th>
                    <th className="px-3 py-2 text-left">Sotto-cat.</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((p, idx) => {
                    const selCat = categorie.find((c) => c.id === p.categoria_id);
                    const subcats = selCat?.sottocategorie || [];
                    const isSaving = saving === p.descrizione;
                    return (
                      <tr key={idx}
                        className={`border-t border-neutral-200 ${!p.categoria_id ? "bg-amber-50/30" : ""}`}>
                        <td className="px-3 py-2">
                          <div className="text-xs leading-tight" title={p.descrizione}>
                            {p.descrizione?.length > 80
                              ? p.descrizione.substring(0, 80) + "..."
                              : p.descrizione}
                          </div>
                        </td>
                        <td className="px-3 py-2 text-right text-neutral-500">{p.n_righe}</td>
                        <td className="px-3 py-2 text-right text-neutral-500">
                          {p.quantita_totale?.toLocaleString("it-IT", { maximumFractionDigits: 1 })}
                          {p.unita_misura ? ` ${p.unita_misura}` : ""}
                        </td>
                        <td className="px-3 py-2 text-right text-neutral-500">
                          {p.prezzo_medio?.toLocaleString("it-IT", { minimumFractionDigits: 2 })}
                        </td>
                        <td className="px-3 py-2 text-right font-medium">
                          {p.totale_spesa?.toLocaleString("it-IT", { minimumFractionDigits: 2 })}
                        </td>
                        <td className="px-3 py-2">
                          <select
                            value={p.categoria_id || ""}
                            disabled={isSaving}
                            onChange={(e) => {
                              const newCatId = e.target.value ? Number(e.target.value) : null;
                              handleAssign(p, newCatId, null);
                            }}
                            className="px-1 py-0.5 border border-neutral-300 rounded text-xs w-full">
                            <option value="">—</option>
                            {categorie.map((c) => (
                              <option key={c.id} value={c.id}>{c.nome}</option>
                            ))}
                          </select>
                        </td>
                        <td className="px-3 py-2">
                          <select
                            value={p.sottocategoria_id || ""}
                            disabled={isSaving || !p.categoria_id}
                            onChange={(e) => {
                              const newSubId = e.target.value ? Number(e.target.value) : null;
                              handleAssign(p, p.categoria_id, newSubId);
                            }}
                            className="px-1 py-0.5 border border-neutral-300 rounded text-xs w-full">
                            <option value="">—</option>
                            {subcats.map((s) => (
                              <option key={s.id} value={s.id}>{s.nome}</option>
                            ))}
                          </select>
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
    </div>
  );
}
