// src/components/widgets/CaliciDisponibiliCard.jsx
// @version: v1.1 — sessione 2026-05-11
// Widget compatto: lista vini con bottiglia in mescita + toggle on/off rapido.
// Usato da ViniVendite (admin/sommelier) e DashboardSala (per la sala).
//
// Endpoint: GET /vini/magazzino/calici-disponibili/  → lista vini con
// BOTTIGLIA_APERTA=1. Il toggle off chiama PATCH /vini/magazzino/{id} con
// BOTTIGLIA_APERTA=0 e refresha la lista.
//
// v1.1: alert visivo (⚠) se bottiglia aperta da > ALERT_HOURS ore.
// `data_apertura` arriva dall'endpoint (MAX data_mov movimento VENDITA [CALICI]).
//
// Props:
//   - title (default "🥂 Calici disponibili")
//   - compact (default false): se true, layout piu' fitto per home/dashboard
//   - showToggleOff (default true): mostra X per spegnere il flag inline
//   - onClick (opzionale): callback (vino) quando si clicca una riga (es. apri scheda)

import React, { useState, useEffect, useCallback } from "react";
import { API_BASE, apiFetch } from "../../config/api";
import useViniWidgetSettings from "../../hooks/useViniWidgetSettings";

// Soglie di età della bottiglia in mescita (in ore).
// Sessione 2026-05-12 (V-H.G): valori letti da vini_widget_settings.
// I default (12 / 36) sono fallback se la fetch non è ancora completata.
// Colore riga + alert dipendono dalla zona:
//   < freshHours                  → sfondo verde (fresca)
//   freshHours ≤ età < alertHours → sfondo giallo (attenzione)
//   ≥ alertHours                  → sfondo rosso + icona ⚠

/** Ritorna le ore trascorse da una data ISO. Null se data invalida. */
function hoursSince(isoString) {
  if (!isoString) return null;
  const d = new Date(isoString);
  if (Number.isNaN(d.getTime())) return null;
  const diffMs = Date.now() - d.getTime();
  return diffMs / (1000 * 60 * 60);
}

/** Format umano: "12h", "1g 6h", "2g". */
function formatAge(hours) {
  if (hours == null) return "";
  if (hours < 1) return "<1h";
  if (hours < 24) return `${Math.round(hours)}h`;
  const d = Math.floor(hours / 24);
  const h = Math.round(hours - d * 24);
  return h > 0 ? `${d}g ${h}h` : `${d}g`;
}

export default function CaliciDisponibiliCard({
  title = "🥂 Calici disponibili",
  compact = false,
  showToggleOff = true,
  onClick = null,
}) {
  const [vini, setVini] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);
  const { get: getSetting } = useViniWidgetSettings();
  const FRESH_HOURS = Number(getSetting("calici_fresh_hours", 12));
  const ALERT_HOURS = Number(getSetting("calici_alert_hours", 36));

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
          Nessuna bottiglia in mescita.<br />
          Si attiva automaticamente registrando una vendita "calici" da Vendite,
          oppure manualmente dal toggle nella scheda vino (tab Giacenze).
        </div>
      ) : (
        <ul className="divide-y divide-neutral-100">
          {vini.map(v => {
            const ore = hoursSince(v.data_apertura);
            // Determina zona di freschezza (verde / giallo / rosso).
            let zone = "neutro"; // se data_apertura mancante
            if (ore != null) {
              if (ore < FRESH_HOURS) zone = "fresca";
              else if (ore < ALERT_HOURS) zone = "attenzione";
              else zone = "vecchia";
            }
            const bgRow = {
              fresca:     "bg-emerald-50/60 hover:bg-emerald-50",
              attenzione: "bg-amber-50/60 hover:bg-amber-100/60",
              vecchia:    "bg-red-50/60 hover:bg-red-100/60",
              neutro:     onClick ? "hover:bg-amber-50" : "",
            }[zone];
            const colorLabel = {
              fresca:     "text-emerald-700",
              attenzione: "text-amber-700",
              vecchia:    "text-red-600 font-semibold",
              neutro:     "text-neutral-400",
            }[zone];
            return (
            <li key={v.id}
                onClick={onClick ? () => onClick(v) : undefined}
                className={`flex items-center gap-3 px-4 ${compact ? "py-2" : "py-2.5"} ${
                  onClick ? "cursor-pointer" : ""
                } ${bgRow} transition`}>
              {/* Icona alert se bottiglia aperta da > ALERT_HOURS */}
              {zone === "vecchia" && (
                <span
                  className="shrink-0 w-6 h-6 rounded-full bg-red-100 border border-red-300 flex items-center justify-center text-red-700 text-xs"
                  title={`Aperta da ${formatAge(ore)} (oltre ${ALERT_HOURS}h)`}
                  aria-label="Bottiglia aperta da troppo tempo"
                >
                  ⚠
                </span>
              )}
              <div className="min-w-0 flex-1">
                <div className={`${compact ? "text-xs" : "text-sm"} font-semibold text-neutral-900 truncate`}>
                  {v.DESCRIZIONE}
                  {v.ANNATA && <span className="text-neutral-500 font-normal"> · {v.ANNATA}</span>}
                </div>
                <div className="text-[10px] text-neutral-500 truncate">
                  {[v.PRODUTTORE, v.REGIONE, v.TIPOLOGIA].filter(Boolean).join(" · ")}
                  {ore != null && (
                    <span className={`ml-1.5 ${colorLabel}`}>
                      · aperta da {formatAge(ore)}
                    </span>
                  )}
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
            );
          })}
        </ul>
      )}
    </div>
  );
}
