// @version: v1.0-movimenti-cantina
// Movimenti Cantina — Carico / Scarico / Vendita / Rottura

import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { API_BASE } from "../../config/api";

export default function MovimentiCantina() {
  const navigate = useNavigate();
  const token = localStorage.getItem("token");

  const [vini, setVini] = useState([]);
  const [vinoSel, setVinoSel] = useState(null);

  const [tipo, setTipo] = useState("CARICO");
  const [qta, setQta] = useState(1);
  const [locazione, setLocazione] = useState("");
  const [note, setNote] = useState("");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // --------------------------------
  // FETCH VINI
  // --------------------------------
  const fetchVini = async () => {
    try {
      const res = await fetch(`${API_BASE}/vini/magazzino`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Errore caricamento vini");
      const data = await res.json();
      setVini(data);
    } catch (err) {
      setError(err.message);
    }
  };

  useEffect(() => {
    fetchVini();
  }, []);

  // --------------------------------
  // INVIO MOVIMENTO
  // --------------------------------
  const handleSubmit = async () => {
    if (!vinoSel) {
      setError("Seleziona un vino");
      return;
    }

    if (!qta || qta <= 0) {
      setError("Quantità non valida");
      return;
    }

    setLoading(true);
    setError("");
    setSuccess("");

    try {
      const res = await fetch(
        `${API_BASE}/vini/magazzino/${vinoSel.id}/movimenti`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            tipo,
            qta: Number(qta),
            locazione: locazione || null,
            note: note || null,
          }),
        }
      );

      if (!res.ok) throw new Error("Errore registrazione movimento");

      setSuccess("Movimento registrato correttamente");
      setQta(1);
      setNote("");
      setLocazione("");
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // --------------------------------
  // RENDER
  // --------------------------------
  return (
    <div className="min-h-screen bg-neutral-100 p-6 font-sans">
      <div className="max-w-4xl mx-auto bg-white shadow-2xl rounded-3xl p-8 border border-neutral-200">

        {/* HEADER */}
        <div className="flex justify-between items-center mb-6">
          <div>
            <h1 className="text-3xl font-bold text-amber-900 font-playfair">
              📦 Movimenti Cantina
            </h1>
            <p className="text-neutral-600 text-sm">
              Carico, scarico, vendita, rottura, rettifica inventario
            </p>
          </div>

          <button
            onClick={() => navigate("/vini")}
            className="px-4 py-2 rounded-xl text-sm border bg-neutral-50 hover:bg-neutral-100"
          >
            ← Menu Vini
          </button>
        </div>

        {/* FORM */}
        <div className="space-y-4">

          {/* VINO */}
          <div>
            <label className="block text-xs font-semibold uppercase mb-1">
              Vino
            </label>
            <select
              value={vinoSel?.id || ""}
              onChange={(e) =>
                setVinoSel(vini.find((v) => v.id === Number(e.target.value)))
              }
              className="w-full border rounded-lg px-3 py-2"
            >
              <option value="">Seleziona vino…</option>
              {vini.map((v) => (
                <option key={v.id} value={v.id}>
                  #{v.id} — {v.DESCRIZIONE} ({v.PRODUTTORE})
                </option>
              ))}
            </select>
          </div>

          {/* TIPO */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold uppercase mb-1">
                Tipo movimento
              </label>
              <select
                value={tipo}
                onChange={(e) => setTipo(e.target.value)}
                className="w-full border rounded-lg px-3 py-2"
              >
                <option value="CARICO">Carico</option>
                <option value="SCARICO">Scarico</option>
                <option value="VENDITA">Vendita</option>
                <option value="RETTIFICA">Rettifica</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase mb-1">
                Quantità
              </label>
              <input
                type="number"
                min="1"
                value={qta}
                onChange={(e) => setQta(e.target.value)}
                className="w-full border rounded-lg px-3 py-2"
              />
            </div>
          </div>

          {/* LOCAZIONE */}
          <div>
            <label className="block text-xs font-semibold uppercase mb-1">
              Locazione (opzionale)
            </label>
            <input
              type="text"
              value={locazione}
              onChange={(e) => setLocazione(e.target.value)}
              placeholder="Frigo, Cantina, Scaffale 2…"
              className="w-full border rounded-lg px-3 py-2"
            />
          </div>

          {/* NOTE */}
          <div>
            <label className="block text-xs font-semibold uppercase mb-1">
              Note
            </label>
            <textarea
              rows="3"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="w-full border rounded-lg px-3 py-2"
            />
          </div>

          {/* FEEDBACK */}
          {error && <p className="text-red-600 text-sm">{error}</p>}
          {success && <p className="text-emerald-600 text-sm">{success}</p>}

          {/* SUBMIT */}
          <div className="pt-2">
            <button
              onClick={handleSubmit}
              disabled={loading}
              className={`px-6 py-2 rounded-xl font-semibold text-white ${
                loading
                  ? "bg-gray-400"
                  : "bg-amber-700 hover:bg-amber-800"
              }`}
            >
              {loading ? "Salvataggio…" : "Registra movimento"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}