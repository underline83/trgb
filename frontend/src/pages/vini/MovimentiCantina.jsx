// @version: v1.0-movimenti-cantina-per-vino
// Movimenti Cantina — Carico/Scarico/Vendita/Rottura su singolo vino

import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { API_BASE } from "../../config/api";

const fmtDateTime = (iso) => {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    return d.toLocaleString("it-IT");
  } catch {
    return iso;
  }
};

export default function MovimentiCantina() {
  const navigate = useNavigate();
  const { id } = useParams();
  const vinoId = useMemo(() => Number(id), [id]);

  const token = localStorage.getItem("token");

  const [vino, setVino] = useState(null);
  const [movimenti, setMovimenti] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // form movimento
  const [tipo, setTipo] = useState("CARICO");
  const [qta, setQta] = useState(1);
  const [locazione, setLocazione] = useState("");
  const [note, setNote] = useState("");

  const handleLogout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("role");
    window.location.reload();
  };

  const goBack = () => {
    navigate(`/vini/magazzino/${vinoId}`);
  };

  const fetchAll = async () => {
    if (!token) {
      handleLogout();
      return;
    }
    if (!Number.isInteger(vinoId) || vinoId <= 0) {
      navigate("/vini/magazzino");
      return;
    }

    setLoading(true);
    setError("");

    try {
      // 1) vino
      const rV = await fetch(`${API_BASE}/vini/magazzino/${vinoId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (rV.status === 401) {
        alert("Sessione scaduta. Effettua di nuovo il login.");
        handleLogout();
        return;
      }
      if (rV.status === 404) {
        setError("Vino non trovato.");
        return;
      }
      if (!rV.ok) throw new Error(`Errore server (vino): ${rV.status}`);
      const vinoData = await rV.json();
      setVino(vinoData);

      // 2) movimenti
      const rM = await fetch(`${API_BASE}/vini/magazzino/${vinoId}/movimenti?limit=200`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (rM.status === 401) {
        alert("Sessione scaduta. Effettua di nuovo il login.");
        handleLogout();
        return;
      }
      if (!rM.ok) throw new Error(`Errore server (movimenti): ${rM.status}`);
      const movs = await rM.json();
      setMovimenti(Array.isArray(movs) ? movs : []);
    } catch (e) {
      setError(e?.message || "Errore di caricamento.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vinoId]);

  // preset rapidi: bottiglia / calice / rottura
  const presetVenditaBottiglia = () => {
    setTipo("VENDITA");
    setQta(1);
    setNote("BOTTIGLIA");
  };

  const presetVenditaCalice = () => {
    setTipo("VENDITA");
    setQta(1);
    setNote("CALICE"); // confermato da te
  };

  const presetRottura = () => {
    setTipo("SCARICO");
    setQta(1);
    setNote("ROTTURA");
  };

  const submitMovimento = async () => {
    if (!token) {
      handleLogout();
      return;
    }
    if (!Number.isInteger(vinoId) || vinoId <= 0) return;

    const qtaInt = parseInt(String(qta), 10);
    if (Number.isNaN(qtaInt) || qtaInt <= 0) {
      alert("Qta non valida.");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const payload = {
        tipo,
        qta: qtaInt,
        locazione: locazione?.trim() ? locazione.trim() : null,
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
      if (!resp.ok) throw new Error(`Errore server: ${resp.status}`);

      const data = await resp.json();
      if (data?.vino) setVino(data.vino);
      if (Array.isArray(data?.movimenti)) setMovimenti(data.movimenti);

      // reset minimo
      if (tipo === "CARICO") setNote("");
    } catch (e) {
      setError(e?.message || "Errore nel salvataggio.");
    } finally {
      setLoading(false);
    }
  };

  const qtaTot = useMemo(() => {
    if (!vino) return 0;
    return (
      vino.QTA_TOTALE ??
      (vino.QTA_FRIGO ?? 0) + (vino.QTA_LOC1 ?? 0) + (vino.QTA_LOC2 ?? 0) + (vino.QTA_LOC3 ?? 0)
    );
  }, [vino]);

  return (
    <div className="min-h-screen bg-neutral-100 p-6 font-sans">
      <div className="max-w-5xl mx-auto bg-white shadow-2xl rounded-3xl p-8 lg:p-10 border border-neutral-200">

        {/* HEADER */}
        <div className="flex flex-col lg:flex-row justify-between gap-4 mb-6">
          <div>
            <h1 className="text-3xl lg:text-4xl font-bold text-amber-900 tracking-wide font-playfair mb-2">
              📦 Movimenti Cantina
            </h1>
            <p className="text-neutral-600">
              Carico / Scarico / Vendita / Rottura su singolo vino.
            </p>
          </div>

          <div className="flex flex-col items-stretch gap-2 sm:flex-row sm:items-center sm:justify-end">
            <button
              type="button"
              onClick={goBack}
              className="px-4 py-2 rounded-xl text-sm font-medium border border-neutral-300 bg-neutral-50 hover:bg-neutral-100 hover:-translate-y-0.5 shadow-sm transition"
            >
              ← Torna al vino
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

        {loading && <p className="text-sm text-neutral-600">Caricamento…</p>}
        {error && !loading && <p className="text-sm text-red-600 font-medium">{error}</p>}

        {/* TESTATA VINO */}
        {vino && (
          <div className="mb-6 bg-neutral-50 border border-neutral-200 rounded-2xl p-4">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
              <div>
                <div className="text-xs text-neutral-500 font-mono">ID: {vino.id}</div>
                <div className="text-lg font-semibold text-neutral-900">{vino.DESCRIZIONE}</div>
                <div className="text-sm text-neutral-600">
                  {vino.NAZIONE}{vino.REGIONE ? ` / ${vino.REGIONE}` : ""}{vino.ANNATA ? ` — ${vino.ANNATA}` : ""}
                </div>
                {vino.PRODUTTORE && <div className="text-xs text-neutral-600 mt-1">Produttore: {vino.PRODUTTORE}</div>}
              </div>

              <div className="text-right">
                <div className="text-xs text-neutral-500 uppercase tracking-wide">Giacenza totale</div>
                <div className="text-2xl font-bold text-neutral-900">{qtaTot ?? 0}</div>
              </div>
            </div>
          </div>
        )}

        {/* AZIONI RAPIDE */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-6">
          <button
            type="button"
            onClick={presetVenditaBottiglia}
            className="px-4 py-3 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-900 hover:shadow hover:-translate-y-0.5 transition text-left"
          >
            <div className="text-sm font-semibold">💶 Vendita bottiglia</div>
            <div className="text-xs text-emerald-800/80">Imposta VENDITA, qta=1, note=BOTTIGLIA</div>
          </button>

          <button
            type="button"
            onClick={presetVenditaCalice}
            className="px-4 py-3 rounded-2xl bg-sky-50 border border-sky-200 text-sky-900 hover:shadow hover:-translate-y-0.5 transition text-left"
          >
            <div className="text-sm font-semibold">🍷 Vendita calice</div>
            <div className="text-xs text-sky-800/80">Imposta VENDITA, qta=1, note=CALICE</div>
          </button>

          <button
            type="button"
            onClick={presetRottura}
            className="px-4 py-3 rounded-2xl bg-amber-50 border border-amber-200 text-amber-900 hover:shadow hover:-translate-y-0.5 transition text-left"
          >
            <div className="text-sm font-semibold">💥 Rottura bottiglia</div>
            <div className="text-xs text-amber-800/80">Imposta SCARICO, qta=1, note=ROTTURA</div>
          </button>
        </div>

        {/* FORM MOVIMENTO */}
        <div className="bg-white border border-neutral-200 rounded-2xl p-4 mb-6">
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
                <option value="CARICO">CARICO</option>
                <option value="SCARICO">SCARICO</option>
                <option value="VENDITA">VENDITA</option>
                <option value="RETTIFICA">RETTIFICA</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-neutral-600 mb-1 uppercase tracking-wide">
                Qta
              </label>
              <input
                type="number"
                value={qta}
                onChange={(e) => setQta(e.target.value)}
                min="1"
                className="w-full border border-neutral-300 rounded-lg px-3 py-2 text-sm bg-white"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-neutral-600 mb-1 uppercase tracking-wide">
                Locazione (opzionale)
              </label>
              <input
                type="text"
                value={locazione}
                onChange={(e) => setLocazione(e.target.value)}
                placeholder="FRIGO / CANTINA A / …"
                className="w-full border border-neutral-300 rounded-lg px-3 py-2 text-sm bg-white"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-neutral-600 mb-1 uppercase tracking-wide">
                Note (opzionale)
              </label>
              <input
                type="text"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder='es. "CALICE"'
                className="w-full border border-neutral-300 rounded-lg px-3 py-2 text-sm bg-white"
              />
            </div>
          </div>

          <div className="mt-4 flex justify-end">
            <button
              type="button"
              onClick={submitMovimento}
              disabled={loading}
              className={`px-5 py-2 rounded-xl text-sm font-semibold shadow transition ${
                loading ? "bg-gray-400 text-white cursor-not-allowed" : "bg-amber-700 text-white hover:bg-amber-800"
              }`}
            >
              {loading ? "Salvo…" : "💾 Registra movimento"}
            </button>
          </div>
        </div>

        {/* TABELLA MOVIMENTI */}
        <div className="border border-neutral-200 rounded-2xl overflow-hidden shadow-sm bg-neutral-50">
          <div className="px-4 py-3 border-b border-neutral-200 bg-neutral-100 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-neutral-800 tracking-wide uppercase">
              Storico movimenti
            </h2>
            <span className="text-xs text-neutral-500">
              {movimenti.length} righe
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
                  <tr key={m.id ?? `${m.data_mov}-${m.tipo}-${m.qta}`} className="border-b border-neutral-200 bg-white">
                    <td className="px-3 py-2 text-xs text-neutral-600 whitespace-nowrap">
                      {fmtDateTime(m.data_mov)}
                    </td>
                    <td className="px-3 py-2 font-semibold text-neutral-900 whitespace-nowrap">
                      {m.tipo}
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

                {movimenti.length === 0 && !loading && (
                  <tr>
                    <td colSpan={7} className="px-4 py-6 text-center text-sm text-neutral-500">
                      Nessun movimento registrato per questo vino.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="px-4 py-3 bg-neutral-50 border-t border-neutral-200 flex justify-end">
            <button
              type="button"
              onClick={fetchAll}
              disabled={loading}
              className={`px-4 py-2 rounded-xl text-sm font-semibold shadow transition ${
                loading ? "bg-gray-400 text-white cursor-not-allowed" : "bg-neutral-900 text-white hover:bg-neutral-800"
              }`}
            >
              {loading ? "Aggiorno…" : "⟳ Aggiorna"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}