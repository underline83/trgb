// src/pages/vini/MatricePicker.jsx
// @version: v1.0
// Griglia visuale per gestire le celle matrice.
// Ogni cella = 1 bottiglia. Click per assegnare/rimuovere.

import React, { useState, useEffect, useMemo } from "react";
import { API_BASE, apiFetch } from "../../config/api";

/**
 * MatricePicker — griglia visuale per locazione 3 (matrice).
 * Props:
 *   - vinoId: number — id del vino corrente (se null, siamo in creazione)
 *   - onVinoUpdated: (vino) => void — callback dopo ogni modifica
 *   - disabled: boolean
 */
export default function MatricePicker({ vinoId, onVinoUpdated, disabled = false }) {
  const [stato, setStato] = useState(null);   // {righe, colonne, nome, celle: [{riga,colonna,vino_id,DESCRIZIONE,...}]}
  const [myCelle, setMyCelle] = useState([]); // celle del vino corrente: [{riga, colonna}]
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [expanded, setExpanded] = useState(false);

  // Carica stato matrice completo
  const fetchStato = async () => {
    try {
      const r = await apiFetch(`${API_BASE}/vini/cantina-tools/matrice/stato`);
      if (r.ok) {
        const data = await r.json();
        setStato(data);
      }
    } catch {} finally { setLoading(false); }
  };

  // Carica celle del vino corrente
  const fetchMyCelle = async () => {
    if (!vinoId) { setMyCelle([]); return; }
    try {
      const r = await apiFetch(`${API_BASE}/vini/cantina-tools/matrice/celle/${vinoId}`);
      if (r.ok) {
        const data = await r.json();
        setMyCelle(data.celle || []);
      }
    } catch {}
  };

  useEffect(() => {
    fetchStato();
    fetchMyCelle();
  }, [vinoId]);

  // Mappa veloce: "riga,colonna" -> {vino_id, DESCRIZIONE, ...}
  const occupiedMap = useMemo(() => {
    if (!stato?.celle) return {};
    const m = {};
    for (const c of stato.celle) {
      m[`${c.riga},${c.colonna}`] = c;
    }
    return m;
  }, [stato]);

  // Set delle mie celle per lookup veloce
  const mySet = useMemo(() => {
    const s = new Set();
    for (const c of myCelle) s.add(`${c.riga},${c.colonna}`);
    return s;
  }, [myCelle]);

  const handleCellClick = async (riga, colonna) => {
    if (disabled || saving || !vinoId) return;
    const key = `${riga},${colonna}`;
    const isMine = mySet.has(key);
    const isOccupied = occupiedMap[key];

    if (isOccupied && !isMine) {
      // Cella occupata da un altro vino
      setError(`Cella (${riga},${colonna}) occupata da: ${isOccupied.DESCRIZIONE || "altro vino"}`);
      setTimeout(() => setError(""), 4000);
      return;
    }

    setSaving(true);
    setError("");
    try {
      const endpoint = isMine ? "rimuovi" : "assegna";
      const r = await apiFetch(`${API_BASE}/vini/cantina-tools/matrice/${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vino_id: vinoId, riga, colonna }),
      });
      if (!r.ok) {
        const e = await r.json().catch(() => ({}));
        throw new Error(e.detail || `Errore ${r.status}`);
      }
      const data = await r.json();
      if (data.vino && onVinoUpdated) onVinoUpdated(data.vino);
      // Ricarica
      await Promise.all([fetchStato(), fetchMyCelle()]);
    } catch (e) {
      setError(e.message);
      setTimeout(() => setError(""), 4000);
    } finally { setSaving(false); }
  };

  if (loading) {
    return <div className="text-xs text-neutral-400">Caricamento matrice…</div>;
  }

  if (!stato || stato.righe === 0) {
    return (
      <div className="text-xs text-neutral-500 bg-neutral-50 rounded-lg p-3 border border-dashed border-neutral-300">
        Matrice non configurata. Vai a <strong>Impostazioni → Locazioni</strong> per creare una locazione di tipo Matrice.
      </div>
    );
  }

  const { righe, colonne, nome } = stato;

  return (
    <div className="space-y-2">
      {/* Header con conteggio */}
      <div className="flex items-center justify-between">
        <div className="text-[11px] font-semibold text-neutral-600 uppercase tracking-wide">
          {nome} — {myCelle.length} {myCelle.length === 1 ? "bottiglia" : "bottiglie"}
        </div>
        <button type="button" onClick={() => setExpanded(!expanded)}
          className="text-xs text-amber-700 hover:text-amber-900 font-medium transition">
          {expanded ? "Chiudi griglia" : "Apri griglia"}
        </button>
      </div>

      {/* Celle assegnate come tag */}
      {myCelle.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {myCelle.map(c => (
            <span key={`${c.riga},${c.colonna}`}
              className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium bg-amber-100 text-amber-800 border border-amber-200 rounded-lg">
              ({c.riga},{c.colonna})
              {!disabled && (
                <button type="button" onClick={() => handleCellClick(c.riga, c.colonna)}
                  className="text-amber-500 hover:text-red-600 font-bold ml-0.5" title="Rimuovi">×</button>
              )}
            </span>
          ))}
        </div>
      )}

      {/* Errore */}
      {error && (
        <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-2 py-1">{error}</div>
      )}

      {/* Griglia espandibile */}
      {expanded && (
        <div className="border border-neutral-200 rounded-xl p-3 bg-neutral-50 overflow-x-auto">
          {saving && (
            <div className="text-[10px] text-amber-600 mb-1">Salvataggio…</div>
          )}
          {/* Legenda */}
          <div className="flex gap-3 mb-2 text-[10px]">
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-amber-500 border border-amber-600 inline-block"></span> Questo vino</span>
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-neutral-300 border border-neutral-400 inline-block"></span> Occupata</span>
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-white border border-neutral-200 inline-block"></span> Libera</span>
          </div>
          {/* Intestazione colonne */}
          <div className="inline-block">
            <div className="flex">
              <div className="w-8 h-6"></div>
              {Array.from({ length: colonne }, (_, c) => (
                <div key={c} className="w-8 h-6 text-center text-[9px] font-bold text-neutral-500">{c + 1}</div>
              ))}
            </div>
            {/* Righe */}
            {Array.from({ length: righe }, (_, r) => (
              <div key={r} className="flex">
                <div className="w-8 h-8 flex items-center justify-center text-[9px] font-bold text-neutral-500">{r + 1}</div>
                {Array.from({ length: colonne }, (_, c) => {
                  const key = `${r + 1},${c + 1}`;
                  const isMine = mySet.has(key);
                  const occ = occupiedMap[key];
                  const isOther = occ && !isMine;

                  let cls = "w-8 h-8 border text-[8px] font-medium flex items-center justify-center cursor-pointer transition-all rounded-sm ";
                  if (isMine) {
                    cls += "bg-amber-500 border-amber-600 text-white hover:bg-amber-600";
                  } else if (isOther) {
                    cls += "bg-neutral-300 border-neutral-400 text-neutral-500 cursor-not-allowed";
                  } else {
                    cls += "bg-white border-neutral-200 text-neutral-300 hover:bg-emerald-50 hover:border-emerald-300 hover:text-emerald-600";
                  }
                  if (disabled) cls += " cursor-not-allowed opacity-60";

                  return (
                    <div key={key} className={cls}
                      onClick={() => !isOther && handleCellClick(r + 1, c + 1)}
                      title={
                        isMine ? `Tuo: (${r+1},${c+1}) — click per rimuovere` :
                        isOther ? `Occupata: ${occ.DESCRIZIONE || "?"}` :
                        `Libera: (${r+1},${c+1}) — click per assegnare`
                      }>
                      {isMine ? "●" : isOther ? "■" : ""}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
