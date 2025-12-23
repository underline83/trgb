// FILE: frontend/src/pages/vini/MovimentiCantina.jsx
// @version: v1.2-movimenti-auth-fix
// Pagina Movimenti Cantina — lettura + inserimento
// FIX: parsing risposta backend { vino_id, movimenti: [] }

import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { API_BASE } from "../../config/api";
import MagazzinoSubMenu from "../../components/vini/MagazzinoSubMenu";

export default function MovimentiCantina() {
  const navigate = useNavigate();
  const { id } = useParams();
  const vinoId = useMemo(() => Number(id), [id]);

  const token = localStorage.getItem("token");

  const [vino, setVino] = useState(null);
  const [movimenti, setMovimenti] = useState([]);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // form nuovo movimento
  const [tipo, setTipo] = useState("CARICO");
  const [qta, setQta] = useState(1);
  const [note, setNote] = useState("");

  const handleLogout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("role");
    window.location.reload();
  };

  const fetchData = async () => {
    if (!token) {
      handleLogout();
      return;
    }

    if (!Number.isInteger(vinoId) || vinoId <= 0) {
      navigate("/vini/magazzino", { replace: true });
      return;
    }

    setLoading(true);
    setError("");

    try {
      const vinoRes = await fetch(`${API_BASE}/vini/magazzino/${vinoId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (vinoRes.status === 401) {
        alert("Sessione scaduta. Effettua di nuovo il login.");
        handleLogout();
        return;
      }

      if (!vinoRes.ok) {
        const txt = await vinoRes.text().catch(() => "");
        throw new Error(txt || `Errore server: ${vinoRes.status}`);
      }

      const vinoData = await vinoRes.json();
      setVino(vinoData);

      const movRes = await fetch(`${API_BASE}/vini/magazzino/${vinoId}/movimenti?limit=200`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (movRes.status === 401) {
        alert("Sessione scaduta. Effettua di nuovo il login.");
        handleLogout();
        return;
      }

      if (!movRes.ok) {
        const txt = await movRes.text().catch(() => "");
        throw new Error(txt || `Errore server movimenti: ${movRes.status}`);
      }

      const movData = await movRes.json();
      const list = Array.isArray(movData) ? movData : (movData?.movimenti ?? []);
      setMovimenti(list);
    } catch (e) {
      setError(e?.message || "Errore caricamento movimenti.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vinoId]);

  const submitMovimento = async (e) => {
    e.preventDefault();

    if (!token) {
      handleLogout();
      return;
    }

    if (!Number.isInteger(vinoId) || vinoId <= 0) return;

    setLoading(true);
    setError("");

    try {
      const payload = {
        tipo,
        qta: Number(qta),
        note: note?.trim() ? note.trim() : null,
        origine: "GESTIONALE",
      };

      const resp = await fetch(`${API_BASE}/vini/magazzino/${vinoId}/movimenti`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });

      if (resp.status === 401) {
        alert("Sessione scaduta. Effettua di nuovo il login.");
        handleLogout();
        return;
      }

      if (!resp.ok) {
        const txt = await resp.text().catch(() => "");
        throw new Error(txt || `Errore inserimento: ${resp.status}`);
      }

      setNote("");
      setQta(1);
      await fetchData();
    } catch (e2) {
      setError(e2?.message || "Errore inserimento movimento.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-neutral-100 p-6 font-sans">
      <div className="max-w-6xl mx-auto bg-white shadow-2xl rounded-3xl p-8 lg:p-10 border border-neutral-200">
        {/* HEADER */}
        <div className="flex flex-col lg:flex-row justify-between gap-4 mb-6">
          <div>
            <h1 className="text-3xl lg:text-4xl font-bold text-amber-900 tracking-wide font-playfair mb-2">
              📦 Movimenti Cantina
            </h1>
            <p className="text-neutral-600">
              Carico / Scarico / Vendita / Rettifica — vino selezionato.
            </p>
          </div>

          <div className="flex flex-col items-stretch gap-2 sm:flex-row sm:items-center sm:justify-end">
            <button
              type="button"
              onClick={() => navigate(`/vini/magazzino/${vinoId}`)}
              className="
                px-4 py-2 rounded-xl text-sm font-medium
                border border-neutral-300 bg-neutral-50
                hover:bg-neutral-100 hover:-translate-y-0.5
                shadow-sm transition
              "
            >
              ← Torna al Dettaglio
            </button>

            <button
              type="button"
              onClick={fetchData}
              disabled={loading}
              className={`
                px-4 py-2 rounded-xl text-sm font-semibold shadow-sm transition
                ${
                  loading
                    ? "bg-gray-300 text-white cursor-not-allowed"
                    : "bg-amber-700 text-white hover:bg-amber-800"
                }
              `}
            >
              {loading ? "Aggiorno…" : "⟳ Ricarica"}
            </button>

            <button
              type="button"
              onClick={handleLogout}
              className="
                px-4 py-2 rounded-xl text-sm font-medium
                border border-red-200 bg-red-50 text-red-700
                hover:bg-red-100 hover:-translate-y-0.5
                shadow-sm transition
              "
            >
              Logout
            </button>
          </div>
        </div>

        <MagazzinoSubMenu vinoId={vinoId} />

        {error && (
          <div className="mb-6 text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl p-3">
            {error}
          </div>
        )}

        {/* INFO VINO */}
        <div className="mb-6 border border-neutral-200 rounded-2xl bg-neutral-50 shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-neutral-200 bg-neutral-100">
            <div className="text-sm font-semibold text-neutral-800 tracking-wide uppercase">
              Vino selezionato
            </div>
          </div>
          <div className="p-4">
            {!vino ? (
              <div className="text-neutral-500">Caricamento vino…</div>
            ) : (
              <div>
                <div className="text-xs text-neutral-500 font-mono mb-1">
                  ID: {vino.id} {vino.id_excel ? `(Excel: ${vino.id_excel})` : ""}
                </div>
                <div className="text-lg font-semibold text-neutral-900">
                  {vino.DESCRIZIONE}
                </div>
                <div className="text-sm text-neutral-600">
                  {vino.NAZIONE}
                  {vino.REGIONE ? ` / ${vino.REGIONE}` : ""}
                  {vino.ANNATA ? ` — ${vino.ANNATA}` : ""}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* FORM MOVIMENTO */}
        <div className="mb-6 border border-neutral-200 rounded-2xl bg-white shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-neutral-200 bg-neutral-100">
            <div className="text-sm font-semibold text-neutral-800 tracking-wide uppercase">
              Nuovo movimento
            </div>
          </div>

          <form onSubmit={submitMovimento} className="p-4 grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
            <div>
              <label className="block text-xs font-semibold text-neutral-600 mb-1 uppercase tracking-wide">
                Tipo
              </label>
              <select
                value={tipo}
                onChange={(e) => setTipo(e.target.value)}
                className="w-full border border-neutral-300 rounded-lg px-3 py-2 text-sm bg-white"
              >
                <option value="CARICO">CARICO</option>
                <option value="SCARICO">SCARICO</option>
                <option value="VENDITA">VENDITA</option>
                <option value="RETTIFICA">RETTIFICA</option>
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
              />
            </div>

            <div className="md:col-span-2">
              <label className="block text-xs font-semibold text-neutral-600 mb-1 uppercase tracking-wide">
                Note
              </label>
              <input
                type="text"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="es. carico da fornitore / rottura / servizio..."
                className="w-full border border-neutral-300 rounded-lg px-3 py-2 text-sm bg-white"
              />
            </div>

            <div className="md:col-span-4">
              <button
                type="submit"
                disabled={loading}
                className={`
                  w-full px-4 py-3 rounded-2xl text-sm font-semibold shadow-sm transition
                  ${
                    loading
                      ? "bg-gray-300 text-white cursor-not-allowed"
                      : "bg-purple-700 text-white hover:bg-purple-800"
                  }
                `}
              >
                {loading ? "Salvo…" : "✅ Registra movimento"}
              </button>
            </div>
          </form>
        </div>

        {/* LISTA MOVIMENTI */}
        <div className="border border-neutral-200 rounded-2xl bg-neutral-50 shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-neutral-200 bg-neutral-100 flex items-center justify-between">
            <div className="text-sm font-semibold text-neutral-800 tracking-wide uppercase">
              Storico movimenti
            </div>
            <div className="text-xs text-neutral-500">
              {movimenti.length} movimenti
            </div>
          </div>

          <div className="max-h-[520px] overflow-auto">
            <table className="w-full text-sm">
              <thead className="bg-neutral-100 sticky top-0 z-10">
                <tr className="text-xs text-neutral-600 uppercase tracking-wide">
                  <th className="px-3 py-2 text-left">Data</th>
                  <th className="px-3 py-2 text-left">Tipo</th>
                  <th className="px-3 py-2 text-center">Qta</th>
                  <th className="px-3 py-2 text-left">Note</th>
                </tr>
              </thead>
              <tbody>
                {movimenti.map((m) => (
                  <tr key={m.id ?? `${m.data_mov}-${m.tipo}-${m.qta}`} className="border-b border-neutral-200 bg-white">
                    <td className="px-3 py-2 text-xs text-neutral-600 whitespace-nowrap">
                      {m.data_mov ?? "—"}
                    </td>
                    <td className="px-3 py-2 font-semibold text-neutral-900">
                      {m.tipo ?? "—"}
                    </td>
                    <td className="px-3 py-2 text-center font-semibold">
                      {m.qta ?? "—"}
                    </td>
                    <td className="px-3 py-2 text-xs text-neutral-700 whitespace-pre-wrap">
                      {m.note ?? "—"}
                    </td>
                  </tr>
                ))}

                {movimenti.length === 0 && !loading && (
                  <tr>
                    <td colSpan={4} className="px-4 py-6 text-center text-sm text-neutral-500">
                      Nessun movimento registrato.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {loading && (
            <div className="px-4 py-3 text-sm text-neutral-600 bg-neutral-50 border-t border-neutral-200">
              Caricamento…
            </div>
          )}
        </div>
      </div>
    </div>
  );
}