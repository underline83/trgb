// src/components/widgets/CaliciDisponibiliCard.jsx
// @version: v1.0 — sessione 58 (2026-04-25)
// Widget compatto: lista vini con bottiglia in mescita + toggle on/off rapido.
// Usato da ViniVendite (admin/sommelier) e DashboardSala (per la sala).
//
// Endpoint: GET /vini/magazzino/calici-disponibili/  → lista vini con
// BOTTIGLIA_APERTA=1. Il toggle off chiama PATCH /vini/magazzino/{id} con
// BOTTIGLIA_APERTA=0 e refresha la lista.
//
// Props:
//   - title (default "🥂 Calici disponibili")
//   - compact (default false): se true, layout piu' fitto per home/dashboard
//   - showToggleOff (default true): mostra X per spegnere il flag inline
//   - onClick (opzionale): callback (vino) quando si clicca una riga (es. apri scheda)

import React, { useState, useEffect, useCallback } from "react";
import { API_BASE, apiFetch } from "../../config/api";

export default function CaliciDisponibiliCard({
  title = "🥂 Calici disponibili",
  compact = false,
  showToggleOff = true,
  onClick = null,
}) {
  const [vini, setVini] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);

  const fetchVini = useCallback(async () => {
    setLoading(true);
    try {
      const r = await apiFetch(`${API_BASE}/vini/magazzino/calici-disponibili/`);
      if (r.ok) setVini(await r.json());
    } catch {} finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchVini(); }, [fetchVini]);

  const spegniBottiglia = async (vinoId, e) => {
    if (e) e.stopPropagation();
    if (!window.confirm("Spegnere il flag 'bottiglia in mescita'? Il vino non apparira' piu' nella carta calici se la giacenza e' 0.")) return;
    setBusyId(vinoId);
    try {
      const r = await apiFetch(`${API_BASE}/vini/magazzino/${vinoId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ BOTTIGLIA_APERTA: 0 }),
      });
      if (!r.ok) throw new Error(`Errore ${r.status}`);
      await fetchVini();
    } catch (err) {
      alert(err.message || "Errore");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="bg-white border border-amber-200 rounded-xl shadow-sm overflow-hidden">
      <div className="px-4 py-2 bg-amber-50 border-b border-amber-200 flex items-center justify-between">
        <h3 className="text-sm font-bold text-amber-900">{title}</h3>
        <span className="text-[11px] text-amber-700 font-medium">
          {loading ? "..." : `${vini.length} ${vini.length === 1 ? "bottiglia" : "bottiglie"}`}
        </span>
      </div>
      {loading ? (
        <div className="px-4 py-6 text-center text-xs text-neutral-400">Caricamento…</div>
      ) : vini.length === 0 ? (
        <div className="px-4 py-6 text-center text-xs text-neutral-500">
          Nessuna bottiglia in mescita. Aprine una dalla scheda vino per iniziare.
        </div>
      ) : (
        <ul className="divide-y divide-neutral-100">
          {vini.map(v => (
            <li key={v.id}
                onClick={onClick ? () => onClick(v) : undefined}
                className={`flex items-center gap-3 px-4 ${compact ? "py-2" : "py-2.5"} ${
                  onClick ? "hover:bg-amber-50 cursor-pointer" : ""
                } transition`}>
              <div className="min-w-0 flex-1">
                <div className={`${compact ? "text-xs" : "text-sm"} font-semibold text-neutral-900 truncate`}>
                  {v.DESCRIZIONE}
                  {v.ANNATA && <span className="text-neutral-500 font-normal"> · {v.ANNATA}</span>}
                </div>
                <div className="text-[10px] text-neutral-500 truncate">
                  {[v.PRODUTTORE, v.REGIONE, v.TIPOLOGIA].filter(Boolean).join(" · ")}
                </div>
              </div>
              <div className="text-right shrink-0">
                {v.PREZZO_CALICE != null && (
                  <div className={`${compact ? "text-xs" : "text-sm"} font-bold text-amber-700 tabular-nums`}>
                    {Number(v.PREZZO_CALICE).toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €
                  </div>
                )}
                <div className="text-[10px] text-neutral-400">
                  giacenza: {v.QTA_TOTALE ?? 0} bt
                </div>
              </div>
              {showToggleOff && (
                <button type="button" onClick={(e) => spegniBottiglia(v.id, e)} disabled={busyId === v.id}
                  title="Spegni flag (la bottiglia non e' piu' in mescita)"
                  className="shrink-0 w-7 h-7 rounded-full border border-neutral-300 bg-white text-neutral-500 hover:bg-red-50 hover:border-red-300 hover:text-red-600 transition text-xs disabled:opacity-40">
                  {busyId === v.id ? "…" : "✕"}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
