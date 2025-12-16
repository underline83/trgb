// src/pages/vini/MovimentiCantina.jsx
// @version: v1.0-movimenti-cantina-attivo
// Pagina Movimenti Cantina — per singolo vino

import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { API_BASE } from "../../config/api";
import MagazzinoSubMenu from "../../components/vini/MagazzinoSubMenu";

export default function MovimentiCantina() {
  const navigate = useNavigate();
  const { id } = useParams();

  const [vino, setVino] = useState(null);
  const [movimenti, setMovimenti] = useState([]);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const token = localStorage.getItem("token");

  const handleLogout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("role");
    window.location.reload();
  };

  const fetchAll = async () => {
    if (!token) {
      handleLogout();
      return;
    }
    if (!id) return;

    setLoading(true);
    setError("");
    try {
      const [respVino, respMov] = await Promise.all([
        fetch(`${API_BASE}/vini/magazzino/${id}`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetch(`${API_BASE}/vini/magazzino/${id}/movimenti?limit=200`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
      ]);

      if (respVino.status === 401 || respMov.status === 401) {
        alert("Sessione scaduta. Effettua di nuovo il login.");
        handleLogout();
        return;
      }
      if (!respVino.ok) throw new Error(`Errore vino: ${respVino.status}`);
      if (!respMov.ok) throw new Error(`Errore movimenti: ${respMov.status}`);

      const v = await respVino.json();
      const m = await respMov.json();

      setVino(v);
      setMovimenti(Array.isArray(m) ? m : []);
    } catch (e) {
      setError(e.message || "Errore di caricamento.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const tot = useMemo(() => {
    if (!vino) return 0;
    return (
      vino.QTA_TOTALE ??
      (vino.QTA_FRIGO ?? 0) +
        (vino.QTA_LOC1 ?? 0) +
        (vino.QTA_LOC2 ?? 0) +
        (vino.QTA_LOC3 ?? 0)
    );
  }, [vino]);

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
              Carico / scarico / vendita / rettifica per il vino selezionato.
            </p>
          </div>

          <div className="flex flex-col items-stretch gap-2 sm:flex-row sm:items-center sm:justify-end">
            <button
              type="button"
              onClick={() => navigate("/vini/magazzino")}
              className="px-4 py-2 rounded-xl text-sm font-medium border border-neutral-300 bg-neutral-50 hover:bg-neutral-100 hover:-translate-y-0.5 shadow-sm transition"
            >
              ← Torna al Magazzino
            </button>

            <button
              type="button"
              onClick={handleLogout}
              className="px-4 py-2 rounded-xl text-sm font-medium border border-red-200 bg-red-50 text-red-700 hover:bg-red-100 hover:-translate-y-0.5 shadow-sm transition"
            >
              Logout
            </button>
          </div>
        </div>

        {/* SUBMENU */}
        <div className="mb-5">
          <MagazzinoSubMenu showDettaglio />
        </div>

        {loading && <p className="text-sm text-neutral-600">Caricamento…</p>}
        {error && !loading && (
          <p className="text-sm text-red-600 font-medium">{error}</p>
        )}

        {!loading && !error && vino && (
          <div className="mb-6 border border-neutral-200 rounded-2xl p-4 bg-neutral-50">
            <div className="text-xs text-neutral-500 font-mono">ID: {vino.id}</div>
            <div className="text-lg font-semibold text-neutral-900">
              {vino.DESCRIZIONE}
            </div>
            <div className="text-sm text-neutral-600">
              {vino.PRODUTTORE || "—"} · {vino.NAZIONE}
              {vino.REGIONE ? ` / ${vino.REGIONE}` : ""}
              {vino.ANNATA ? ` — ${vino.ANNATA}` : ""}
            </div>
            <div className="mt-2 text-sm">
              <span className="font-semibold">Giacenza totale:</span> {tot} bt
            </div>
          </div>
        )}

        {/* LISTA MOVIMENTI (read-only per ora) */}
        {!loading && !error && (
          <div className="border border-neutral-200 rounded-2xl overflow-hidden shadow-sm bg-neutral-50">
            <div className="px-4 py-3 border-b border-neutral-200 bg-neutral-100 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-neutral-800 tracking-wide uppercase">
                Movimenti recenti
              </h2>
              <button
                type="button"
                onClick={fetchAll}
                className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-amber-700 text-white hover:bg-amber-800 shadow-sm transition"
              >
                ⟳ Ricarica
              </button>
            </div>

            <div className="max-h-[520px] overflow-auto">
              <table className="w-full text-sm">
                <thead className="bg-neutral-100 sticky top-0 z-10">
                  <tr className="text-xs text-neutral-600 uppercase tracking-wide">
                    <th className="px-3 py-2 text-left">Data</th>
                    <th className="px-3 py-2 text-left">Tipo</th>
                    <th className="px-3 py-2 text-center">Qta</th>
                    <th className="px-3 py-2 text-left">Locazione</th>
                    <th className="px-3 py-2 text-left">Utente</th>
                    <th className="px-3 py-2 text-left">Note</th>
                  </tr>
                </thead>
                <tbody>
                  {movimenti.map((m) => (
                    <tr
                      key={m.id ?? `${m.data_mov}-${m.tipo}-${m.qta}`}
                      className="border-b border-neutral-200 bg-white hover:bg-amber-50 transition"
                    >
                      <td className="px-3 py-2 text-xs text-neutral-600 whitespace-nowrap">
                        {m.data_mov || "—"}
                      </td>
                      <td className="px-3 py-2 text-xs font-semibold">
                        {m.tipo || "—"}
                      </td>
                      <td className="px-3 py-2 text-center font-semibold">
                        {m.qta ?? "—"}
                      </td>
                      <td className="px-3 py-2 text-xs">{m.locazione || "—"}</td>
                      <td className="px-3 py-2 text-xs">{m.utente || "—"}</td>
                      <td className="px-3 py-2 text-xs text-neutral-700">
                        {m.note || "—"}
                      </td>
                    </tr>
                  ))}

                  {movimenti.length === 0 && (
                    <tr>
                      <td
                        colSpan={6}
                        className="px-4 py-6 text-center text-sm text-neutral-500"
                      >
                        Nessun movimento registrato.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}