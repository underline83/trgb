// @version: v1.0-banca-crossref
// Cross-reference movimenti bancari ↔ fatture XML
import React, { useEffect, useState } from "react";
import { API_BASE, apiFetch } from "../../config/api";
import BancaNav from "./BancaNav";

const FC = `${API_BASE}/banca`;

const fmt = (n) =>
  n != null
    ? Number(n).toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : "—";

export default function BancaCrossRef() {
  const [movimenti, setMovimenti] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [soloNonCollegati, setSoloNonCollegati] = useState(false);
  const [linking, setLinking] = useState(null);
  const [expandedId, setExpandedId] = useState(null);

  useEffect(() => {
    loadData();
  }, [soloNonCollegati]);

  const loadData = async () => {
    setLoading(true);
    setError("");
    try {
      const qs = soloNonCollegati ? "?solo_non_collegati=true" : "";
      const resp = await apiFetch(`${FC}/cross-ref${qs}`);
      if (!resp.ok) throw new Error("Errore caricamento");
      setMovimenti(await resp.json());
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleLink = async (movimentoId, fatturaId) => {
    setLinking(movimentoId);
    try {
      const resp = await apiFetch(`${FC}/cross-ref/link`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ movimento_id: movimentoId, fattura_id: fatturaId }),
      });
      if (!resp.ok) throw new Error("Errore collegamento");
      await loadData();
    } catch (err) {
      setError(err.message);
    } finally {
      setLinking(null);
    }
  };

  const handleUnlink = async (linkId) => {
    try {
      await apiFetch(`${FC}/cross-ref/link/${linkId}`, { method: "DELETE" });
      await loadData();
    } catch (_) {}
  };

  const linked = movimenti.filter((m) => m.link_id);
  const unlinked = movimenti.filter((m) => !m.link_id);
  const withSuggestions = unlinked.filter((m) => m.possibili_fatture?.length > 0);

  return (
    <div className="min-h-screen bg-neutral-100 p-6 font-sans">
      <BancaNav current="crossref" />
      <div className="max-w-6xl mx-auto bg-white shadow-2xl rounded-3xl p-6 sm:p-10 border border-neutral-200 mt-4">
        <h1 className="text-3xl font-bold text-emerald-900 tracking-wide font-playfair mb-1">
          Cross-Ref Fatture
        </h1>
        <p className="text-neutral-600 text-sm mb-4">
          Collega i pagamenti bancari alle fatture XML importate per una visione completa.
        </p>

        <div className="flex items-center gap-4 mb-6">
          <div className="flex items-center gap-4 text-sm text-neutral-600">
            <span className="px-3 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-medium">
              {linked.length} collegati
            </span>
            <span className="px-3 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-medium">
              {withSuggestions.length} con suggerimenti
            </span>
            <span className="px-3 py-1 rounded-full bg-neutral-100 border border-neutral-200 text-neutral-600 text-xs font-medium">
              {unlinked.length - withSuggestions.length} senza match
            </span>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={soloNonCollegati}
              onChange={(e) => setSoloNonCollegati(e.target.checked)}
            />
            Solo non collegati
          </label>
        </div>

        {error && (
          <div className="mb-4 rounded-xl border border-red-300 bg-red-50 text-red-800 px-4 py-3 text-sm">
            {error}
          </div>
        )}

        {loading ? (
          <div className="text-center py-12 text-neutral-500">Caricamento...</div>
        ) : movimenti.length === 0 ? (
          <div className="text-center py-12 text-neutral-500">
            Nessun movimento di uscita trovato. Importa prima i movimenti bancari.
          </div>
        ) : (
          <div className="space-y-2 max-h-[70vh] overflow-y-auto">
            {movimenti.map((m) => {
              const isExpanded = expandedId === m.id;
              const hasLink = !!m.link_id;
              const hasSuggestions = m.possibili_fatture?.length > 0;

              return (
                <div
                  key={m.id}
                  className={`rounded-xl border p-4 transition ${
                    hasLink
                      ? "bg-emerald-50/50 border-emerald-200"
                      : hasSuggestions
                      ? "bg-emerald-50/50 border-emerald-200"
                      : "bg-white border-neutral-200"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs text-neutral-500 whitespace-nowrap">{m.data_contabile}</span>
                        <span className="text-sm font-semibold text-red-600 font-mono">{fmt(m.importo)}</span>
                      </div>
                      <div className="text-xs text-neutral-700 truncate" title={m.descrizione}>
                        {m.descrizione}
                      </div>
                      <div className="text-[10px] text-neutral-400 mt-0.5">
                        {m.categoria_banca}{m.sottocategoria_banca ? ` — ${m.sottocategoria_banca}` : ""}
                      </div>

                      {/* Link esistente */}
                      {hasLink && (
                        <div className="mt-2 flex items-center gap-2 text-xs">
                          <span className="text-emerald-700 font-medium">
                            Collegato a: {m.fornitore_nome} — Fatt. {m.numero_fattura} del {m.data_fattura} ({fmt(m.totale_fattura)})
                          </span>
                          <button
                            onClick={() => handleUnlink(m.link_id)}
                            className="px-2 py-0.5 rounded text-[10px] border border-red-200 text-red-500 hover:bg-red-50"
                          >
                            Scollega
                          </button>
                        </div>
                      )}
                    </div>

                    {/* Actions */}
                    {!hasLink && hasSuggestions && (
                      <button
                        onClick={() => setExpandedId(isExpanded ? null : m.id)}
                        className="px-3 py-1.5 rounded-lg text-xs font-medium border border-emerald-300 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 transition flex-shrink-0"
                      >
                        {isExpanded ? "Chiudi" : `${m.possibili_fatture.length} possibili match`}
                      </button>
                    )}
                  </div>

                  {/* Suggerimenti fatture */}
                  {isExpanded && hasSuggestions && (
                    <div className="mt-3 pt-3 border-t border-emerald-200 space-y-2">
                      {m.possibili_fatture.map((f) => (
                        <div key={f.id} className="flex items-center justify-between bg-white rounded-lg border border-neutral-200 p-3">
                          <div>
                            <div className="text-sm font-medium text-neutral-800">{f.fornitore_nome}</div>
                            <div className="text-xs text-neutral-500">
                              Fatt. {f.numero_fattura} del {f.data_fattura} — Totale: {fmt(f.totale_fattura)}
                            </div>
                          </div>
                          <button
                            onClick={() => handleLink(m.id, f.id)}
                            disabled={linking === m.id}
                            className="px-4 py-1.5 rounded-lg text-xs font-semibold bg-emerald-600 text-white hover:bg-emerald-700 transition disabled:opacity-40"
                          >
                            {linking === m.id ? "..." : "Collega"}
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
