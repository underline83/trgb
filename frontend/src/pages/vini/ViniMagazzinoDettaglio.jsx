// @version: v1.2-magazzino-dettaglio
// Dettaglio Vino Magazzino — prezzi carta/listino + giacenze

import React, { useEffect, useState } from "react";
import { API_BASE } from "../../config/api";

const API_MAG = `${API_BASE}/vini/magazzino`;

export default function ViniMagazzinoDettaglio({ vino, onClose, onUpdated }) {
  const [dettaglio, setDettaglio] = useState(vino);
  const [movimenti, setMovimenti] = useState([]);
  const [loading, setLoading] = useState(false);

  const [movTipo, setMovTipo] = useState("CARICO");
  const [movQta, setMovQta] = useState(1);
  const [movNota, setMovNota] = useState("");

  const token = localStorage.getItem("token");

  const fetchDettaglio = async () => {
    setLoading(true);
    try {
      const resp = await fetch(`${API_MAG}/${vino.id}`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      const data = await resp.json();
      setDettaglio(data);

      const respMov = await fetch(`${API_MAG}/${vino.id}/movimenti`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      const movs = await respMov.json();
      setMovimenti(movs);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDettaglio();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vino.id]);

  const handleMovimento = async (e) => {
    e.preventDefault();
    try {
      const resp = await fetch(`${API_MAG}/${vino.id}/movimenti`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          tipo: movTipo,
          qta: Number(movQta),
          note: movNota || null,
        }),
      });

      if (!resp.ok) {
        const err = await resp.json();
        throw new Error(err.detail || "Errore movimento");
      }

      setMovQta(1);
      setMovNota("");
      await fetchDettaglio();
      if (onUpdated) onUpdated();
    } catch (err) {
      alert(err.message);
    }
  };

  if (!dettaglio) return null;

  const prezzoCarta =
    dettaglio.PREZZO_CARTA !== null && dettaglio.PREZZO_CARTA !== undefined
      ? Number(dettaglio.PREZZO_CARTA)
      : null;
  const prezzoListino =
    dettaglio.EURO_LISTINO !== null && dettaglio.EURO_LISTINO !== undefined
      ? Number(dettaglio.EURO_LISTINO)
      : null;

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-40">
      <div className="bg-white max-w-4xl w-full mx-4 rounded-3xl shadow-2xl border border-neutral-300 overflow-hidden">
        {/* HEADER */}
        <div className="flex justify-between items-start gap-4 px-6 py-4 border-b border-neutral-200 bg-neutral-50">
          <div>
            <div className="flex items-baseline gap-2 flex-wrap">
              <span className="text-xs font-mono text-neutral-500">
                #{dettaglio.id}
              </span>
              <h2 className="text-xl font-bold text-amber-900 font-playfair">
                {dettaglio.DESCRIZIONE}
              </h2>
              {dettaglio.ANNATA && (
                <span className="text-sm text-neutral-600">
                  ({dettaglio.ANNATA})
                </span>
              )}
            </div>
            <div className="text-xs text-neutral-600 mt-1 flex flex-wrap gap-2">
              <span>{dettaglio.TIPOLOGIA}</span>
              {dettaglio.REGIONE && <span>· {dettaglio.REGIONE}</span>}
              {dettaglio.NAZIONE && <span>· {dettaglio.NAZIONE}</span>}
              {dettaglio.FORMATO && <span>· {dettaglio.FORMATO}</span>}
              {dettaglio.PRODUTTORE && (
                <span className="font-medium">· {dettaglio.PRODUTTORE}</span>
              )}
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="text-sm px-3 py-1 rounded-full bg-neutral-200 hover:bg-neutral-300 transition"
          >
            ✕ Chiudi
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 p-6">
          {/* COLONNA SINISTRA: PREZZI + GIACENZE */}
          <div className="space-y-4">
            <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 text-sm">
              <h3 className="font-semibold text-amber-900 mb-2">
                Prezzi & visibilità
              </h3>
              <p>
                <span className="font-medium">Prezzo carta:</span>{" "}
                {prezzoCarta !== null && !Number.isNaN(prezzoCarta)
                  ? `€ ${prezzoCarta.toFixed(2)}`
                  : "-"}
              </p>
              <p>
                <span className="font-medium">€ Listino fornitore:</span>{" "}
                {prezzoListino !== null && !Number.isNaN(prezzoListino)
                  ? `€ ${prezzoListino.toFixed(2)}`
                  : "-"}
              </p>
              <p className="mt-2 text-xs text-neutral-600">
                Carta: {dettaglio.CARTA || "—"} · iPratico:{" "}
                {dettaglio.IPRATICO || "—"}
              </p>
            </div>

            <div className="bg-green-50 border border-green-200 rounded-2xl p-4 text-sm">
              <h3 className="font-semibold text-green-900 mb-2">
                Giacenze & locazioni
              </h3>
              <p>
                <span className="font-medium">Totale:</span>{" "}
                {dettaglio.QTA_TOTALE ?? 0} pz
              </p>
              <p className="text-xs mt-1">
                Frigo: {dettaglio.QTA_FRIGO ?? 0} · Loc1:{" "}
                {dettaglio.QTA_LOC1 ?? 0} · Loc2: {dettaglio.QTA_LOC2 ?? 0}
              </p>
              <p className="text-xs mt-1 text-neutral-600">
                Frigorifero: {dettaglio.FRIGORIFERO || "—"}
                <br />
                Locazione 1: {dettaglio.LOCAZIONE_1 || "—"}
                <br />
                Locazione 2: {dettaglio.LOCAZIONE_2 || "—"}
              </p>
            </div>
          </div>

          {/* COLONNA CENTRALE: MOVIMENTI */}
          <div className="space-y-3">
            <div className="bg-neutral-50 border border-neutral-200 rounded-2xl p-4 text-sm">
              <h3 className="font-semibold text-neutral-900 mb-2">
                Movimento rapido
              </h3>
              <form className="space-y-2" onSubmit={handleMovimento}>
                <div className="flex gap-2">
                  <select
                    value={movTipo}
                    onChange={(e) => setMovTipo(e.target.value)}
                    className="border border-neutral-300 rounded-lg px-2 py-1 text-sm flex-1"
                  >
                    <option value="CARICO">CARICO (+)</option>
                    <option value="SCARICO">SCARICO (-)</option>
                    <option value="VENDITA">VENDITA (-)</option>
                    <option value="RETTIFICA">RETTIFICA (=)</option>
                  </select>
                  <input
                    type="number"
                    min="1"
                    value={movQta}
                    onChange={(e) => setMovQta(e.target.value)}
                    className="w-20 border border-neutral-300 rounded-lg px-2 py-1 text-sm"
                  />
                </div>
                <textarea
                  value={movNota}
                  onChange={(e) => setMovNota(e.target.value)}
                  className="w-full border border-neutral-300 rounded-lg px-2 py-1 text-xs"
                  rows={2}
                  placeholder="Nota (servizio, evento, rettifica…)"
                />
                <button
                  type="submit"
                  className="w-full mt-1 px-3 py-1.5 rounded-lg bg-amber-700 hover:bg-amber-800 text-white text-sm font-semibold transition"
                >
                  Registra movimento
                </button>
              </form>
            </div>

            <div className="bg-neutral-50 border border-neutral-200 rounded-2xl p-4 text-xs max-h-64 overflow-auto">
              <h3 className="font-semibold text-neutral-900 mb-2">
                Ultimi movimenti
              </h3>
              {movimenti.length === 0 && (
                <p className="text-neutral-500">Nessun movimento registrato.</p>
              )}
              <ul className="space-y-1">
                {movimenti.map((m) => (
                  <li key={m.id} className="border-b border-neutral-200 pb-1">
                    <div className="flex justify-between">
                      <span className="font-medium">{m.tipo}</span>
                      <span>{m.data_mov}</span>
                    </div>
                    <div className="flex justify-between text-neutral-700">
                      <span>Qta: {m.qta}</span>
                      {m.locazione && <span>Loc: {m.locazione}</span>}
                    </div>
                    {m.note && (
                      <div className="text-neutral-600 text-[11px] mt-0.5">
                        {m.note}
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* COLONNA DESTRA: NOTE LIBERE */}
          <div className="space-y-3 text-xs text-neutral-700">
            <div className="bg-neutral-50 border border-neutral-200 rounded-2xl p-4 h-full">
              <h3 className="font-semibold text-neutral-900 mb-2">
                Note vino
              </h3>
              {dettaglio.NOTE ? (
                <p className="whitespace-pre-wrap">{dettaglio.NOTE}</p>
              ) : (
                <p className="text-neutral-500">
                  Nessuna nota salvata. In futuro qui potremo gestire note
                  strutturate (es. verticale di annate, difetti bottiglie,
                  ecc.).
                </p>
              )}
            </div>
          </div>
        </div>

        {loading && (
          <div className="px-6 pb-4 text-xs text-neutral-500">
            Aggiornamento dati…
          </div>
        )}
      </div>
    </div>
  );
}