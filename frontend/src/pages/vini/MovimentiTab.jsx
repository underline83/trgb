// FILE: frontend/src/components/vini/MovimentiTab.jsx
// @version: v1.0-movimenti-tab
// Tab Movimenti Cantina — form inserimento + lista movimenti (con fallback endpoint)

import React, { useEffect, useMemo, useState } from "react";
import { API_BASE } from "../../config/api";

/**
 * NOTE IMPORTANTI
 * - In base alla tua storia API, in alcuni punti il backend risponde su:
 *    1) /vini/magazzino/:id/movimenti
 *    2) /vini/:id/movimenti
 *   Qui facciamo fallback automatico (prima prova magazzino, poi prova base).
 */
function buildEndpoints(vinoId) {
  const base1 = `${API_BASE}/vini/magazzino/${vinoId}/movimenti`;
  const base2 = `${API_BASE}/vini/${vinoId}/movimenti`;
  return { base1, base2 };
}

export default function MovimentiTab({ vinoId, onAfterChange }) {
  const token = useMemo(() => localStorage.getItem("token"), []);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const [movimenti, setMovimenti] = useState([]);

  // form
  const [tipo, setTipo] = useState("SCARICO");
  const [qta, setQta] = useState(1);
  const [note, setNote] = useState("");
  const [origine, setOrigine] = useState("GESTIONALE");

  const { base1, base2 } = useMemo(() => buildEndpoints(vinoId), [vinoId]);

  const authHeaders = useMemo(() => {
    if (!token) return {};
    return { Authorization: `Bearer ${token}` };
  }, [token]);

  async function fetchJsonWithFallback(urlA, urlB) {
    const tryOne = async (url) => {
      const resp = await fetch(url, { headers: authHeaders });
      return resp;
    };

    const respA = await tryOne(urlA);
    if (respA.ok) return respA;

    // se 404/redirect/altro, proviamo il fallback
    const respB = await tryOne(urlB);
    return respB;
  }

  async function postJsonWithFallback(urlA, urlB, body) {
    const tryOne = async (url) => {
      const resp = await fetch(url, {
        method: "POST",
        headers: {
          ...authHeaders,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });
      return resp;
    };

    const respA = await tryOne(urlA);
    if (respA.ok) return respA;

    const respB = await tryOne(urlB);
    return respB;
  }

  const loadMovimenti = async () => {
    if (!vinoId) return;
    if (!token) return;

    setLoading(true);
    setError("");

    try {
      // Per convenzione tua: spesso c’è ?limit=200
      const urlA = `${base1}?limit=200`;
      const urlB = `${base2}?limit=200`;

      const resp = await fetchJsonWithFallback(urlA, urlB);

      if (resp.status === 401) {
        setError("Sessione scaduta. Rifai login.");
        return;
      }
      if (!resp.ok) {
        const txt = await resp.text().catch(() => "");
        throw new Error(txt || `Errore caricamento movimenti: ${resp.status}`);
      }

      const data = await resp.json();

      // backend può restituire:
      // - { vino_id, movimenti: [...] }
      // oppure direttamente [...]
      const list = Array.isArray(data) ? data : data.movimenti || [];
      setMovimenti(list);
    } catch (e) {
      setError(e?.message || "Errore caricamento movimenti.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadMovimenti();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vinoId]);

  const handleSubmit = async () => {
    if (!vinoId) return;
    if (!token) return;

    setSaving(true);
    setError("");

    try {
      const payload = {
        tipo: String(tipo || "").toUpperCase(),
        qta: Number(qta),
        note: note?.trim() || "",
        origine: origine?.trim() || "GESTIONALE",
      };

      if (!payload.tipo) throw new Error("Seleziona il tipo movimento.");
      if (!Number.isInteger(payload.qta) || payload.qta <= 0) {
        throw new Error("Qta deve essere un intero positivo.");
      }

      const resp = await postJsonWithFallback(base1, base2, payload);

      if (resp.status === 401) {
        setError("Sessione scaduta. Rifai login.");
        return;
      }
      if (!resp.ok) {
        const txt = await resp.text().catch(() => "");
        throw new Error(txt || `Errore salvataggio movimento: ${resp.status}`);
      }

      // reset form “soft”
      setNote("");
      setQta(1);

      // reload
      await loadMovimenti();
      if (typeof onAfterChange === "function") onAfterChange();
    } catch (e) {
      setError(e?.message || "Errore salvataggio movimento.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="border border-neutral-200 rounded-2xl bg-white shadow-sm overflow-hidden">
      <div className="px-4 py-3 bg-neutral-100 border-b border-neutral-200 flex items-start justify-between gap-4">
        <div>
          <h3 className="text-sm font-semibold text-neutral-800 tracking-wide uppercase">
            📦 Movimenti Cantina
          </h3>
          <p className="text-xs text-neutral-500 mt-1">
            Registra carico/scarico/vendita/rottura e tieni traccia storico.
          </p>
        </div>

        <button
          type="button"
          onClick={loadMovimenti}
          disabled={loading}
          className={`
            px-4 py-2 rounded-xl text-sm font-semibold shadow-sm transition
            ${loading ? "bg-gray-300 text-white cursor-not-allowed" : "bg-neutral-50 border border-neutral-300 hover:bg-neutral-100"}
          `}
        >
          {loading ? "Aggiorno…" : "⟳ Aggiorna"}
        </button>
      </div>

      <div className="p-4 space-y-4">
        {/* FORM */}
        <div className="bg-neutral-50 border border-neutral-200 rounded-2xl p-4">
          <div className="grid grid-cols-1 md:grid-cols-6 gap-3 items-end">
            <div className="md:col-span-2">
              <label className="block text-xs font-semibold text-neutral-600 mb-1 uppercase tracking-wide">
                Tipo movimento
              </label>
              <select
                value={tipo}
                onChange={(e) => setTipo(e.target.value)}
                className="w-full border border-neutral-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-amber-300"
              >
                <option value="CARICO">CARICO</option>
                <option value="SCARICO">SCARICO</option>
                <option value="VENDITA">VENDITA</option>
                <option value="ROTTURA">ROTTURA</option>
                <option value="RETTIFICA">RETTIFICA</option>
              </select>
            </div>

            <div className="md:col-span-1">
              <label className="block text-xs font-semibold text-neutral-600 mb-1 uppercase tracking-wide">
                Qta
              </label>
              <input
                type="number"
                value={qta}
                min={1}
                step={1}
                onChange={(e) => setQta(e.target.value)}
                className="w-full border border-neutral-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-amber-300"
              />
            </div>

            <div className="md:col-span-2">
              <label className="block text-xs font-semibold text-neutral-600 mb-1 uppercase tracking-wide">
                Nota (facoltativa)
              </label>
              <input
                type="text"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="es. Vendita tavolo 12 / Rottura in servizio / Carico fattura..."
                className="w-full border border-neutral-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-amber-300"
              />
            </div>

            <div className="md:col-span-1">
              <label className="block text-xs font-semibold text-neutral-600 mb-1 uppercase tracking-wide">
                Origine
              </label>
              <input
                type="text"
                value={origine}
                onChange={(e) => setOrigine(e.target.value)}
                className="w-full border border-neutral-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-amber-300"
              />
            </div>

            <div className="md:col-span-6 flex justify-end">
              <button
                type="button"
                onClick={handleSubmit}
                disabled={saving}
                className={`
                  px-5 py-2 rounded-xl text-sm font-semibold shadow-sm transition
                  ${saving ? "bg-gray-300 text-white cursor-not-allowed" : "bg-amber-700 text-white hover:bg-amber-800"}
                `}
              >
                {saving ? "Salvo…" : "✓ Registra movimento"}
              </button>
            </div>
          </div>

          {error && (
            <div className="mt-3 text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl p-3">
              {error}
            </div>
          )}
        </div>

        {/* LISTA MOVIMENTI */}
        <div className="border border-neutral-200 rounded-2xl overflow-hidden">
          <div className="px-4 py-3 bg-neutral-100 border-b border-neutral-200 flex items-center justify-between">
            <div className="text-sm font-semibold text-neutral-800">
              Storico movimenti
            </div>
            <div className="text-xs text-neutral-500">
              {movimenti.length} record
            </div>
          </div>

          <div className="max-h-[360px] overflow-auto bg-white">
            <table className="w-full text-sm">
              <thead className="bg-neutral-50 sticky top-0 z-10">
                <tr className="text-xs text-neutral-600 uppercase tracking-wide">
                  <th className="px-3 py-2 text-left">Data</th>
                  <th className="px-3 py-2 text-left">Tipo</th>
                  <th className="px-3 py-2 text-center">Qta</th>
                  <th className="px-3 py-2 text-left">Note</th>
                  <th className="px-3 py-2 text-left">Origine</th>
                </tr>
              </thead>
              <tbody>
                {movimenti.map((m, idx) => (
                  <tr
                    key={m.id ?? `${idx}-${m.data_mov ?? ""}`}
                    className="border-b border-neutral-100 hover:bg-amber-50/40 transition"
                  >
                    <td className="px-3 py-2 text-xs text-neutral-600 whitespace-nowrap">
                      {m.data_mov || m.data || "—"}
                    </td>
                    <td className="px-3 py-2 font-semibold text-neutral-900 whitespace-nowrap">
                      {m.tipo || "—"}
                    </td>
                    <td className="px-3 py-2 text-center font-semibold">
                      {m.qta ?? "—"}
                    </td>
                    <td className="px-3 py-2 text-xs text-neutral-700">
                      {m.note || "—"}
                    </td>
                    <td className="px-3 py-2 text-xs text-neutral-600">
                      {m.origine || "—"}
                    </td>
                  </tr>
                ))}

                {!loading && movimenti.length === 0 && (
                  <tr>
                    <td
                      colSpan={5}
                      className="px-4 py-6 text-center text-sm text-neutral-500"
                    >
                      Nessun movimento registrato per questo vino.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {loading && (
            <div className="px-4 py-3 text-sm text-neutral-600 bg-neutral-50 border-t border-neutral-200">
              Caricamento movimenti…
            </div>
          )}
        </div>
      </div>
    </div>
  );
}