// @version: v1.0-dettaglio-fattura
// Pagina dettaglio fattura singola con righe, info fornitore, link a fornitore
import React, { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { API_BASE, apiFetch } from "../../config/api";
import FattureNav from "./FattureNav";

const FE = `${API_BASE}/contabilita/fe`;
const fmt = (v) =>
  v != null
    ? v.toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : "-";

export default function FattureDettaglio() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [fattura, setFattura] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await apiFetch(`${FE}/fatture/${id}`);
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.detail || "Fattura non trovata");
        }
        setFattura(await res.json());
      } catch (e) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  if (loading) {
    return (
      <div className="min-h-screen bg-neutral-100 font-sans">
        <FattureNav current="elenco" />
        <div className="max-w-5xl mx-auto p-6">
          <div className="text-center py-20 text-neutral-400">Caricamento fattura...</div>
        </div>
      </div>
    );
  }

  if (error || !fattura) {
    return (
      <div className="min-h-screen bg-neutral-100 font-sans">
        <FattureNav current="elenco" />
        <div className="max-w-5xl mx-auto p-6">
          <div className="bg-white rounded-2xl border border-red-200 p-8 text-center">
            <p className="text-red-700 font-medium mb-4">{error || "Fattura non trovata"}</p>
            <button
              onClick={() => navigate("/admin/fatture/elenco")}
              className="px-4 py-2 rounded-xl text-sm font-medium border border-neutral-300 bg-white hover:bg-neutral-50 transition"
            >
              ← Torna all'elenco
            </button>
          </div>
        </div>
      </div>
    );
  }

  const righe = fattura.righe || [];
  const totaleRighe = righe.reduce((s, r) => s + (r.prezzo_totale || 0), 0);

  return (
    <div className="min-h-screen bg-neutral-100 font-sans">
      <FattureNav current="elenco" />
      <div className="max-w-5xl mx-auto p-4 sm:p-6">
        {/* BACK */}
        <button
          onClick={() => navigate(-1)}
          className="text-xs text-neutral-500 hover:text-amber-700 mb-3 transition"
        >
          ← Torna indietro
        </button>

        {/* HEADER CARD */}
        <div className="bg-white rounded-2xl border border-neutral-200 shadow-sm p-6 mb-4">
          <div className="flex flex-col md:flex-row justify-between gap-4">
            {/* Left: Fornitore */}
            <div className="flex-1">
              <p className="text-[10px] text-neutral-400 font-medium uppercase tracking-wider mb-1">Fornitore</p>
              <h1 className="text-xl font-bold text-amber-900 font-playfair">
                {fattura.fornitore_nome || "-"}
              </h1>
              {fattura.fornitore_piva && (
                <p className="text-sm text-neutral-500 mt-0.5">
                  P.IVA: <span className="tabular-nums font-medium">{fattura.fornitore_piva}</span>
                </p>
              )}
              {fattura.fornitore_piva && (
                <button
                  onClick={() => navigate(`/admin/fatture/fornitore/${encodeURIComponent(fattura.fornitore_piva)}`)}
                  className="mt-2 text-xs text-amber-700 hover:text-amber-900 font-medium underline underline-offset-2 transition"
                >
                  Vedi tutte le fatture di questo fornitore →
                </button>
              )}
            </div>

            {/* Right: Meta */}
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
                <p className="text-[10px] text-neutral-400 mt-1 font-mono truncate max-w-[200px]">
                  {fattura.xml_filename}
                </p>
              )}
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
              <p className="text-2xl font-bold text-amber-900 tabular-nums font-playfair">€ {fmt(fattura.totale_fattura)}</p>
            </div>
          </div>
        </div>

        {/* RIGHE */}
        <div className="bg-white rounded-2xl border border-neutral-200 shadow-sm overflow-hidden">
          <div className="px-5 py-3 border-b border-neutral-100 flex justify-between items-center">
            <h2 className="text-sm font-semibold text-neutral-800">
              Righe fattura ({righe.length})
            </h2>
            <span className="text-xs text-neutral-400">
              Totale righe: € {fmt(totaleRighe)}
            </span>
          </div>

          {righe.length === 0 ? (
            <div className="text-center py-10 text-neutral-400 text-sm">
              Nessuna riga presente per questa fattura
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs sm:text-sm">
                <thead className="bg-neutral-50 text-neutral-500 border-b border-neutral-200">
                  <tr>
                    <th className="px-4 py-2 text-left font-medium w-8">#</th>
                    <th className="px-4 py-2 text-left font-medium">Descrizione</th>
                    <th className="px-4 py-2 text-right font-medium">Q.tà</th>
                    <th className="px-4 py-2 text-right font-medium">U.M.</th>
                    <th className="px-4 py-2 text-right font-medium">Prezzo Unit.</th>
                    <th className="px-4 py-2 text-right font-medium">Totale</th>
                    <th className="px-4 py-2 text-right font-medium">IVA %</th>
                  </tr>
                </thead>
                <tbody>
                  {righe.map((r, i) => (
                    <tr key={r.id || i} className="border-b border-neutral-100 hover:bg-neutral-50/50">
                      <td className="px-4 py-2 text-neutral-400 tabular-nums">{r.numero_linea || i + 1}</td>
                      <td className="px-4 py-2 text-neutral-800 font-medium">
                        <div className="max-w-md">
                          {r.descrizione || "-"}
                        </div>
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums text-neutral-700">
                        {r.quantita != null ? fmt(r.quantita) : "-"}
                      </td>
                      <td className="px-4 py-2 text-right text-neutral-500">{r.unita_misura || ""}</td>
                      <td className="px-4 py-2 text-right tabular-nums text-neutral-700">
                        {r.prezzo_unitario != null ? `€ ${fmt(r.prezzo_unitario)}` : "-"}
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums font-semibold text-neutral-900">
                        {r.prezzo_totale != null ? `€ ${fmt(r.prezzo_totale)}` : "-"}
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums text-neutral-500">
                        {r.aliquota_iva != null ? `${r.aliquota_iva}%` : "-"}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-amber-50/50 border-t-2 border-amber-200">
                    <td colSpan={5} className="px-4 py-2 text-right text-xs font-bold text-amber-900 uppercase tracking-wide">
                      Totale righe
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums font-bold text-amber-900 text-sm">
                      € {fmt(totaleRighe)}
                    </td>
                    <td />
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>

        {/* META INFO */}
        <div className="mt-3 flex justify-between items-center text-[10px] text-neutral-400 px-1">
          <span>Importato il: {fattura.data_import || "-"}</span>
          <span>ID: {fattura.id}</span>
        </div>
      </div>
    </div>
  );
}
