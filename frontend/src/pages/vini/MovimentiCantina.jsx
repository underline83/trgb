// src/pages/vini/MovimentiCantina.jsx
// @version: v1.0-movimenti-inserimento
// Movimenti Cantina — Inserimento + Lista movimenti per vino (magazzino)

import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { API_BASE } from "../../config/api";
import MagazzinoSubMenu from "../../components/vini/MagazzinoSubMenu";

const formatDateTime = (iso) => {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleString("it-IT");
  } catch {
    return iso;
  }
};

export default function MovimentiCantina() {
  const navigate = useNavigate();
  const { id } = useParams(); // vino_id

  const token = localStorage.getItem("token");

  const [vino, setVino] = useState(null);
  const [movimenti, setMovimenti] = useState([]);

  const [loading, setLoading] = useState(true);
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState("");

  // FORM
  const [tipo, setTipo] = useState("CARICO");
  const [qta, setQta] = useState(1);
  const [locazione, setLocazione] = useState("");
  const [note, setNote] = useState("");
  const [origine, setOrigine] = useState("GESTIONALE");

  const handleLogout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("role");
    window.location.reload();
  };

  const vinoIdNum = useMemo(() => {
    const n = parseInt(String(id || ""), 10);
    return Number.isNaN(n) ? null : n;
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

  const fetchAll = async () => {
    if (!token) {
      handleLogout();
      return;
    }
    if (!vinoIdNum || vinoIdNum <= 0) {
      setError("ID vino non valido.");
      setLoading(false);
      return;
    }

    setLoading(true);
    setError("");

    try {
      // 1) dettaglio vino
      const rVino = await fetch(`${API_BASE}/vini/magazzino/${vinoIdNum}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (rVino.status === 401) {
        alert("Sessione scaduta. Effettua di nuovo il login.");
        handleLogout();
        return;
      }
      if (!rVino.ok) throw new Error(`Errore caricamento vino: ${rVino.status}`);
      const vinoData = await rVino.json();
      setVino(vinoData);

      // 2) movimenti
      const rMov = await fetch(
        `${API_BASE}/vini/magazzino/${vinoIdNum}/movimenti?limit=200`,
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );

      if (rMov.status === 401) {
        alert("Sessione scaduta. Effettua di nuovo il login.");
        handleLogout();
        return;
      }
      if (!rMov.ok) throw new Error(`Errore caricamento movimenti: ${rMov.status}`);
      const movData = await rMov.json();
      setMovimenti(Array.isArray(movData) ? movData : []);
    } catch (e) {
      setError(e.message || "Errore di caricamento.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vinoIdNum]);

  const submitMovimento = async (e) => {
    e.preventDefault();
    if (!token) {
      handleLogout();
      return;
    }
    if (!vinoIdNum) return;

    const q = parseInt(String(qta), 10);
    if (Number.isNaN(q) || q <= 0) {
      alert("Quantità non valida (deve essere > 0).");
      return;
    }

    setPosting(true);
    setError("");

    try {
      const payload = {
        tipo,
        qta: q,
        locazione: locazione.trim() ? locazione.trim() : null,
        note: note.trim() ? note.trim() : null,
        origine: origine?.trim() ? origine.trim() : "GESTIONALE",
      };

      const resp = await fetch(`${API_BASE}/vini/magazzino/${vinoIdNum}/movimenti`, {
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
        throw new Error(`Errore inserimento movimento: ${resp.status} ${txt}`);
      }

      const data = await resp.json();
      // backend ritorna { vino, movimenti }
      if (data?.vino) setVino(data.vino);
      if (Array.isArray(data?.movimenti)) setMovimenti(data.movimenti);

      // reset parziale form
      setQta(1);
      setNote("");
      // locazione la lasciamo com’è (spesso ripetuta)

      // opzionale: feedback rapido
      // eslint-disable-next-line no-alert
      alert("Movimento registrato.");
    } catch (e2) {
      setError(e2.message || "Errore inserimento movimento.");
    } finally {
      setPosting(false);
    }
  };

  return (
    <div className="min-h-screen bg-neutral-100 p-6 font-sans">
      <div className="max-w-6xl mx-auto bg-white shadow-2xl rounded-3xl p-8 lg:p-10 border border-neutral-200">

        {/* HEADER */}
        <div className="flex flex-col lg:flex-row justify-between gap-4 mb-4">
          <div>
            <h1 className="text-3xl lg:text-4xl font-bold text-amber-900 tracking-wide font-playfair mb-2">
              📦 Movimenti Cantina
            </h1>
            <p className="text-neutral-600">
              Carico / Scarico / Vendita / Rettifica con aggiornamento inventario.
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

            {vinoIdNum && (
              <button
                type="button"
                onClick={() => navigate(`/vini/magazzino/${vinoIdNum}`)}
                className="px-4 py-2 rounded-xl text-sm font-medium border border-neutral-300 bg-neutral-50 hover:bg-neutral-100 hover:-translate-y-0.5 shadow-sm transition"
              >
                🍷 Dettaglio vino
              </button>
            )}

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
        <div className="mb-6">
          <MagazzinoSubMenu />
        </div>

        {loading && (
          <p className="text-sm text-neutral-600">Caricamento…</p>
        )}

        {error && !loading && (
          <p className="text-sm text-red-600 font-medium">{error}</p>
        )}

        {!loading && vino && (
          <div className="mb-6 bg-neutral-50 border border-neutral-200 rounded-2xl p-4">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
              <div>
                <div className="text-xs text-neutral-500 font-mono">ID: {vino.id}</div>
                <div className="font-semibold text-neutral-900">{vino.DESCRIZIONE}</div>
                <div className="text-xs text-neutral-600">
                  {vino.NAZIONE}
                  {vino.REGIONE ? ` / ${vino.REGIONE}` : ""}
                  {vino.ANNATA ? ` — ${vino.ANNATA}` : ""}
                  {vino.PRODUTTORE ? ` — ${vino.PRODUTTORE}` : ""}
                </div>
              </div>

              <div className="text-sm">
                <span className="text-neutral-600">Giacenza totale:</span>{" "}
                <span className="font-bold text-neutral-900">{tot} bt</span>
              </div>
            </div>
          </div>
        )}

        {/* FORM INSERIMENTO */}
        {!loading && vino && (
          <form
            onSubmit={submitMovimento}
            className="mb-8 bg-neutral-50 border border-neutral-300 rounded-2xl p-4 lg:p-5 shadow-inner"
          >
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-neutral-800 tracking-wide uppercase">
                Inserisci movimento
              </h2>
              <button
                type="button"
                onClick={fetchAll}
                className="px-3 py-2 rounded-xl text-xs font-semibold border border-neutral-300 bg-white hover:bg-neutral-100 shadow-sm transition"
              >
                ⟳ Ricarica
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-5 gap-3 items-end">
              <div>
                <label className="block text-xs font-semibold text-neutral-600 mb-1 uppercase tracking-wide">
                  Tipo
                </label>
                <select
                  value={tipo}
                  onChange={(e) => setTipo(e.target.value)}
                  className="w-full border border-neutral-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-amber-300"
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
                  className="w-full border border-neutral-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-amber-300"
                />
              </div>

              <div className="md:col-span-1">
                <label className="block text-xs font-semibold text-neutral-600 mb-1 uppercase tracking-wide">
                  Locazione (opzionale)
                </label>
                <input
                  type="text"
                  value={locazione}
                  onChange={(e) => setLocazione(e.target.value)}
                  placeholder="es. Frigo / Cantina A / Scaffale 2…"
                  className="w-full border border-neutral-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-amber-300"
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
                  placeholder="es. Fattura X / Rottura / Servizio calici…"
                  className="w-full border border-neutral-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-amber-300"
                />
              </div>
            </div>

            <div className="mt-3 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
              <div className="text-xs text-neutral-600">
                <span className="font-semibold">Origine:</span>{" "}
                <input
                  type="text"
                  value={origine}
                  onChange={(e) => setOrigine(e.target.value)}
                  className="ml-2 border border-neutral-300 rounded-lg px-2 py-1 text-xs bg-white"
                  style={{ width: 140 }}
                />
              </div>

              <button
                type="submit"
                disabled={posting}
                className={`px-5 py-2 rounded-xl text-sm font-semibold shadow transition ${
                  posting
                    ? "bg-gray-400 text-white cursor-not-allowed"
                    : "bg-amber-700 text-white hover:bg-amber-800"
                }`}
              >
                {posting ? "Salvo…" : "✅ Registra movimento"}
              </button>
            </div>
          </form>
        )}

        {/* LISTA MOVIMENTI */}
        {!loading && (
          <div className="border border-neutral-200 rounded-2xl overflow-hidden shadow-sm bg-neutral-50">
            <div className="px-4 py-3 border-b border-neutral-200 bg-neutral-100 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-neutral-800 tracking-wide uppercase">
                Movimenti registrati
              </h2>
              <span className="text-xs text-neutral-500">
                {movimenti.length} movimenti
              </span>
            </div>

            <div className="max-h-[520px] overflow-auto">
              <table className="w-full text-sm">
                <thead className="bg-neutral-100 sticky top-0 z-10">
                  <tr className="text-xs text-neutral-600 uppercase tracking-wide">
                    <th className="px-3 py-2 text-left">Data</th>
                    <th className="px-3 py-2 text-left">Tipo</th>
                    <th className="px-3 py-2 text-center">Qta</th>
                    <th className="px-3 py-2 text-left">Locazione</th>
                    <th className="px-3 py-2 text-left">Note</th>
                    <th className="px-3 py-2 text-left">Utente</th>
                    <th className="px-3 py-2 text-left">Origine</th>
                  </tr>
                </thead>
                <tbody>
                  {movimenti.map((m) => (
                    <tr key={m.id} className="border-b border-neutral-200 bg-white">
                      <td className="px-3 py-2 text-xs text-neutral-700 whitespace-nowrap">
                        {formatDateTime(m.data_mov || m.created_at)}
                      </td>
                      <td className="px-3 py-2">
                        <span className="inline-flex items-center px-2 py-1 rounded-full text-[11px] font-semibold bg-amber-50 text-amber-800 border border-amber-200">
                          {m.tipo}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-center font-semibold">
                        {m.qta}
                      </td>
                      <td className="px-3 py-2 text-xs text-neutral-700">
                        {m.locazione || "—"}
                      </td>
                      <td className="px-3 py-2 text-xs text-neutral-700">
                        {m.note || "—"}
                      </td>
                      <td className="px-3 py-2 text-xs text-neutral-700">
                        {m.utente || "—"}
                      </td>
                      <td className="px-3 py-2 text-xs text-neutral-700">
                        {m.origine || "—"}
                      </td>
                    </tr>
                  ))}

                  {movimenti.length === 0 && (
                    <tr>
                      <td colSpan={7} className="px-4 py-6 text-center text-sm text-neutral-500">
                        Nessun movimento registrato per questo vino.
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