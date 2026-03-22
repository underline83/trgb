// @version: v1.0-ricette-dashboard
// Dashboard Food Cost — KPI, top FC, migliori margini
import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { API_BASE, apiFetch } from "../../config/api";
import { isAdminRole } from "../../utils/authHelpers";
import RicetteNav from "./RicetteNav";

const FC = `${API_BASE}/foodcost`;

function FcBadge({ pct }) {
  if (pct == null) return <span className="text-xs text-neutral-400">—</span>;
  let color = "bg-green-100 text-green-800 border-green-300";
  if (pct > 35) color = "bg-yellow-100 text-yellow-800 border-yellow-300";
  if (pct > 45) color = "bg-red-100 text-red-800 border-red-300";
  return (
    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${color}`}>
      {pct.toFixed(1)}%
    </span>
  );
}

export default function RicetteDashboard() {
  const navigate = useNavigate();
  const role = localStorage.getItem("role");
  const isAllowed = isAdminRole(role) || role === "sommelier";

  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const r = await apiFetch(`${FC}/ricette/stats/dashboard`);
        if (!r.ok) throw new Error("Errore caricamento dashboard");
        setStats(await r.json());
      } catch (err) {
        setError(err.message || "Errore caricamento dashboard.");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (!isAllowed) {
    return (
      <div className="min-h-screen bg-neutral-100 p-6 font-sans flex items-center justify-center">
        <div className="bg-white shadow-xl rounded-2xl p-10 text-center max-w-md">
          <div className="text-5xl mb-4">🔒</div>
          <h2 className="text-xl font-bold text-neutral-800 mb-2">Accesso riservato</h2>
          <p className="text-neutral-600 text-sm mb-4">
            Questa sezione è disponibile solo per amministratori e sommelier.
          </p>
          <button onClick={() => navigate("/ricette")}
            className="px-4 py-2 rounded-xl text-sm font-medium border border-neutral-300 bg-neutral-50 hover:bg-neutral-100 shadow-sm transition">
            ← Menu Ricette
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-neutral-100 font-sans">
      <RicetteNav current="dashboard" />
      <div className="max-w-5xl mx-auto p-4 sm:p-6">

        {/* HEADER */}
        <div className="mb-6">
          <h1 className="text-3xl lg:text-4xl font-bold text-orange-900 tracking-wide font-playfair mb-1">
            Dashboard Food Cost
          </h1>
          <p className="text-neutral-600">
            Panoramica costi, margini e analisi ricette.
          </p>
        </div>

        {error && (
          <div className="mb-4 rounded-xl border border-red-300 bg-red-50 text-red-800 px-4 py-3 text-sm">
            {error}
          </div>
        )}

        {loading ? (
          <div className="text-center py-16 text-neutral-500">Caricamento dashboard...</div>
        ) : stats ? (
          <>
            {/* KPI CARDS */}
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-6">
              <KpiCard label="Ricette (piatti)" value={stats.totale_ricette} color="text-orange-900" />
              <KpiCard label="Ricette base" value={stats.totale_basi} color="text-blue-700" />
              <KpiCard
                label="FC medio"
                value={`${stats.food_cost_medio}%`}
                color={stats.food_cost_medio > 40 ? "text-red-600" : stats.food_cost_medio > 30 ? "text-yellow-600" : "text-green-600"}
              />
              <KpiCard
                label="FC > 45% (critiche)"
                value={stats.ricette_critiche}
                color={stats.ricette_critiche > 0 ? "text-red-600" : "text-green-600"}
              />
              <KpiCard
                label="FC ≤ 30% (buone)"
                value={stats.ricette_buone}
                color="text-green-600"
              />
            </div>

            {/* TABELLE AFFIANCATE */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* TOP FC */}
              <div className="bg-white rounded-2xl border border-neutral-200 shadow-sm overflow-hidden">
                <div className="px-5 py-4 border-b border-neutral-200 bg-red-50">
                  <h2 className="text-lg font-semibold text-red-900 font-playfair">
                    Top 5 — Food Cost più alto
                  </h2>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-neutral-50 text-neutral-600">
                      <tr>
                        <th className="p-3 text-left font-medium">Ricetta</th>
                        <th className="p-3 text-left font-medium">Categoria</th>
                        <th className="p-3 text-right font-medium">Costo</th>
                        <th className="p-3 text-right font-medium">Vendita</th>
                        <th className="p-3 text-center font-medium">FC %</th>
                      </tr>
                    </thead>
                    <tbody>
                      {stats.top_food_cost.map((r) => (
                        <tr key={r.id}
                          className="border-t border-neutral-100 hover:bg-red-50/40 transition cursor-pointer"
                          onClick={() => navigate(`/ricette/${r.id}`)}
                        >
                          <td className="p-3 font-medium text-neutral-900">{r.name}</td>
                          <td className="p-3 text-neutral-600">{r.category || "—"}</td>
                          <td className="p-3 text-right">{r.total_cost.toFixed(2)} €</td>
                          <td className="p-3 text-right">{r.selling_price ? `${r.selling_price.toFixed(2)} €` : "—"}</td>
                          <td className="p-3 text-center"><FcBadge pct={r.food_cost_pct} /></td>
                        </tr>
                      ))}
                      {stats.top_food_cost.length === 0 && (
                        <tr><td colSpan={5} className="p-6 text-center text-neutral-400">Nessun dato</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* BEST MARGIN */}
              <div className="bg-white rounded-2xl border border-neutral-200 shadow-sm overflow-hidden">
                <div className="px-5 py-4 border-b border-neutral-200 bg-green-50">
                  <h2 className="text-lg font-semibold text-green-900 font-playfair">
                    Top 5 — Migliori margini
                  </h2>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-neutral-50 text-neutral-600">
                      <tr>
                        <th className="p-3 text-left font-medium">Ricetta</th>
                        <th className="p-3 text-left font-medium">Categoria</th>
                        <th className="p-3 text-right font-medium">Costo</th>
                        <th className="p-3 text-right font-medium">Vendita</th>
                        <th className="p-3 text-center font-medium">FC %</th>
                      </tr>
                    </thead>
                    <tbody>
                      {stats.best_margin.map((r) => (
                        <tr key={r.id}
                          className="border-t border-neutral-100 hover:bg-green-50/40 transition cursor-pointer"
                          onClick={() => navigate(`/ricette/${r.id}`)}
                        >
                          <td className="p-3 font-medium text-neutral-900">{r.name}</td>
                          <td className="p-3 text-neutral-600">{r.category || "—"}</td>
                          <td className="p-3 text-right">{r.total_cost.toFixed(2)} €</td>
                          <td className="p-3 text-right">{r.selling_price ? `${r.selling_price.toFixed(2)} €` : "—"}</td>
                          <td className="p-3 text-center"><FcBadge pct={r.food_cost_pct} /></td>
                        </tr>
                      ))}
                      {stats.best_margin.length === 0 && (
                        <tr><td colSpan={5} className="p-6 text-center text-neutral-400">Nessun dato</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </>
        ) : null}

      </div>
    </div>
  );
}

function KpiCard({ label, value, color }) {
  return (
    <div className="bg-white rounded-xl border border-neutral-200 p-4 text-center shadow-sm">
      <div className={`text-2xl font-bold ${color}`}>{value}</div>
      <div className="text-xs text-neutral-500 mt-1">{label}</div>
    </div>
  );
}
