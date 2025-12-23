// FILE: frontend/src/components/vini/MovimentiTab.jsx
// @version: v1.0-movimenti-tab
// Movimenti Cantina — GET/POST con JWT, integrato nel Dettaglio Vino

import React, { useEffect, useMemo, useState } from "react";
import { API_BASE } from "../../config/api";

const TIPI = ["CARICO", "SCARICO", "VENDITA", "RETTIFICA"];

export default function MovimentiTab({ vinoId, onAfterChange }) {
  const token = localStorage.getItem("token");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [movimenti, setMovimenti] = useState([]);

  const [tipo, setTipo] = useState("CARICO");
  const [qta, setQta] = useState("");
  const [note, setNote] = useState("");

  const canSubmit = useMemo(() => {
    const n = Number(qta);
    return Number.isFinite(n) && n > 0 && TIPI.includes(tipo);
  }, [qta, tipo]);

  const fetchMovimenti = async () => {
    if (!token) {
      setError("Non autenticato (token mancante). Rifai login.");
      return;
    }
    if (!vinoId) return;

    setLoading(true);
    setError("");

    try {
      const resp = await fetch(`${API_BASE}/vini/${vinoId}/movimenti`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (resp.status === 401) {
        setError("Sessione scaduta. Rifai login.");
        return;
      }

      if (!resp.ok) {
        const txt = await resp.text().catch(() => "");
        throw new Error(txt || `Errore server: ${resp.status}`);
      }

      const data = await resp.json();

      // backend: { vino_id, movimenti: [...] }
      const list = Array.isArray(data?.movimenti) ? data.movimenti : [];
      setMovimenti(list);
    } catch (e) {
      setError(e?.message || "Errore caricamento movimenti.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMovimenti();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vinoId]);

  const submitMovimento = async () => {
    if (!canSubmit) return;

    setLoading(true);
    setError("");

    try {
      const payload = {
        tipo,
        qta: Number(qta),
        note: note?.trim() ? note.trim() : null,
        origine: "GESTIONALE",
      };

      const resp = await fetch(`${API_BASE}/vini/${vinoId}/movimenti`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      if (resp.status === 401) {
        setError("Sessione scaduta. Rifai login.");
        return;
      }

      if (!resp.ok) {
        const txt = await resp.text().catch(() => "");
        throw new Error(txt || `Errore inserimento: ${resp.status}`);
      }

      setQta("");
      setNote("");
      await fetchMovimenti();

      if (typeof onAfterChange === "function") {
        onAfterChange(); // es: ricarica scheda vino/giacenze
      }
    } catch (e) {
      setError(e?.message || "Errore inserimento movimento.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="border border-neutral-200 rounded-2xl bg-neutral-50 shadow-sm overflow-hidden">
      <div className="px-4 py-3 border-b border-neutral-200 bg-neutral-100 flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-neutral-800 tracking-wide uppercase">
            Movimenti cantina
          </h2>
          <p className="text-xs text-neutral-500 mt-0.5">
            Inserisci movimenti (carico/scarico/vendita/rettifica) con log utente.
          </p>
        </div>

        <button
          type="button"
          onClick={fetchMovimenti}
          disabled={loading}
          className={`px-3 py-2 rounded-xl text-xs font-semibold border shadow-sm transition ${
            loading
              ? "bg-neutral-200 border-neutral-200 text-neutral-400 cursor-not-allowed"
              : "bg-white border-neutral-300 text-neutral-700 hover:bg-neutral-50"
          }`}
        >
          {loading ? "…" : "⟳ Ricarica"}
        </button>
      </div>

      <div className="p-4 space-y-4">
        {error && (
          <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl p-3">
            {error}
          </div>
        )}

        {/* FORM */}
        <div className="bg-white border border-neutral-200 rounded-2xl p-4">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3 items-end">
            <div>
              <label className="block text-xs font-semibold text-neutral-600 mb-1 uppercase tracking-wide">
                Tipo
              </label>
              <select
                value={tipo}
                onChange={(e) => setTipo(e.target.value)}
                className="w-full border border-neutral-300 rounded-lg px-3 py-2 text-sm bg-white"
              >
                {TIPI.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-neutral-600 mb-1 uppercase tracking-wide">
                Quantità
              </label>
              <input
                type="number"
                min="1"
                value={qta}
                onChange={(e) => setQta(e.target.value)}
                className="w-full border border-neutral-300 rounded-lg px-3 py-2 text-sm bg-white"
                placeholder="es. 6"
              />
            </div>

            <div className="md:col-span-2">
              <label className="block text-xs font-semibold text-neutral-600 mb-1 uppercase tracking-wide">
                Note (opzionale)
              </label>
              <input
                type="text"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                className="w-full border border-neutral-300 rounded-lg px-3 py-2 text-sm bg-white"
                placeholder="es. carico da fattura / scarico rottura / vendita servizio…"
              />
            </div>
          </div>

          <div className="mt-3 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={submitMovimento}
              disabled={loading || !canSubmit}
              className={`px-4 py-2 rounded-xl text-sm font-semibold shadow-sm transition ${
                loading || !canSubmit
                  ? "bg-neutral-200 text-neutral-400 cursor-not-allowed"
                  : "bg-amber-700 text-white hover:bg-amber-800"
              }`}
            >
              Registra movimento
            </button>
          </div>

          <p className="mt-2 text-[11px] text-neutral-500">
            Nota: “RETTIFICA” imposta la qta come valore assoluto (non delta).
          </p>
        </div>

        {/* LISTA */}
        <div className="bg-white border border-neutral-200 rounded-2xl overflow-hidden">
          <div className="px-4 py-3 bg-neutral-50 border-b border-neutral-200 flex items-center justify-between">
            <div className="text-xs font-semibold text-neutral-700 uppercase tracking-wide">
              Storico ({movimenti.length})
            </div>
          </div>

          <div className="max-h-[360px] overflow-auto">
            <table className="w-full text-sm">
              <thead className="bg-neutral-100 sticky top-0 z-10">
                <tr className="text-xs text-neutral-600 uppercase tracking-wide">
                  <th className="px-3 py-2 text-left">Data</th>
                  <th className="px-3 py-2 text-center">Tipo</th>
                  <th className="px-3 py-2 text-center">Qta</th>
                  <th className="px-3 py-2 text-left">Note</th>
                  <th className="px-3 py-2 text-left">Origine</th>
                </tr>
              </thead>
              <tbody>
                {movimenti.map((m) => (
                  <tr key={m.id} className="border-t border-neutral-200">
                    <td className="px-3 py-2 text-xs text-neutral-700 whitespace-nowrap">
                      {(m.data_mov || "")
                        .slice(0, 16)
                        .replace("T", " ")}
                    </td>
                    <td className="px-3 py-2 text-center font-semibold">
                      {m.tipo}
                    </td>
                    <td className="px-3 py-2 text-center font-semibold text-neutral-900">
                      {m.qta}
                    </td>
                    <td className="px-3 py-2 text-sm text-neutral-800">
                      {m.note || ""}
                    </td>
                    <td className="px-3 py-2 text-xs text-neutral-600">
                      {m.origine || "—"}
                    </td>
                  </tr>
                ))}

                {movimenti.length === 0 && (
                  <tr>
                    <td
                      colSpan={5}
                      className="px-4 py-5 text-center text-sm text-neutral-500"
                    >
                      Nessun movimento registrato.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}