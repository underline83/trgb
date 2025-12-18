// FILE: frontend/src/pages/vini/MovimentiCantina.jsx
// @version: v1.0-movimenti-cantina-operativo

import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { API_BASE } from "../../config/api";
import MagazzinoSubMenu from "../../components/vini/MagazzinoSubMenu";

export default function MovimentiCantina() {
  const { id } = useParams();
  const navigate = useNavigate();
  const token = localStorage.getItem("token");

  const [vino, setVino] = useState(null);
  const [movimenti, setMovimenti] = useState([]);
  const [loading, setLoading] = useState(false);

  const [tipo, setTipo] = useState("CARICO");
  const [qta, setQta] = useState("");
  const [locazione, setLocazione] = useState("");
  const [note, setNote] = useState("");

  // ----------------------------------
  const fetchData = async () => {
    setLoading(true);
    try {
      const [vinoRes, movRes] = await Promise.all([
        fetch(`${API_BASE}/vini/magazzino/${id}`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetch(`${API_BASE}/vini/magazzino/${id}/movimenti`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
      ]);

      if (!vinoRes.ok || !movRes.ok) {
        throw new Error("Errore caricamento dati");
      }

      setVino(await vinoRes.json());
      setMovimenti(await movRes.json());
    } catch (err) {
      alert(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    // eslint-disable-next-line
  }, [id]);

  // ----------------------------------
  const submitMovimento = async () => {
    if (!qta || Number(qta) <= 0) {
      alert("Inserisci una quantità valida");
      return;
    }

    const payload = {
      tipo,
      qta: Number(qta),
      locazione: locazione || null,
      note: note || null,
    };

    try {
      const res = await fetch(
        `${API_BASE}/vini/magazzino/${id}/movimenti`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payload),
        }
      );

      if (!res.ok) {
        throw new Error("Errore inserimento movimento");
      }

      setQta("");
      setLocazione("");
      setNote("");
      fetchData();
    } catch (err) {
      alert(err.message);
    }
  };

  // ----------------------------------
  if (!vino) {
    return <div className="p-6">Caricamento…</div>;
  }

  return (
    <div className="min-h-screen bg-neutral-100 p-6">
      <div className="max-w-5xl mx-auto bg-white rounded-3xl shadow-2xl p-8 border">

        <MagazzinoSubMenu />

        {/* HEADER */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-amber-900 font-playfair">
            📦 Movimenti Cantina
          </h1>
          <p className="text-neutral-600 mt-1">
            {vino.DESCRIZIONE} — {vino.PRODUTTORE || "Produttore n.d."}
          </p>
        </div>

        {/* FORM MOVIMENTO */}
        <div className="border rounded-2xl p-4 mb-8 bg-neutral-50">
          <h2 className="text-sm font-semibold mb-3 uppercase tracking-wide">
            Nuovo movimento
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <select
              value={tipo}
              onChange={(e) => setTipo(e.target.value)}
              className="border rounded-lg px-3 py-2 text-sm"
            >
              <option value="CARICO">Carico</option>
              <option value="SCARICO">Scarico</option>
              <option value="VENDITA">Vendita</option>
              <option value="RETTIFICA">Rettifica</option>
            </select>

            <input
              type="number"
              placeholder="Quantità"
              value={qta}
              onChange={(e) => setQta(e.target.value)}
              className="border rounded-lg px-3 py-2 text-sm"
            />

            <input
              type="text"
              placeholder="Locazione (opz.)"
              value={locazione}
              onChange={(e) => setLocazione(e.target.value)}
              className="border rounded-lg px-3 py-2 text-sm"
            />

            <button
              onClick={submitMovimento}
              className="bg-amber-700 text-white rounded-xl px-4 py-2 font-semibold hover:bg-amber-800"
            >
              Registra
            </button>
          </div>

          <textarea
            placeholder="Note (opzionali)"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className="w-full mt-3 border rounded-lg px-3 py-2 text-sm"
          />
        </div>

        {/* STORICO */}
        <div>
          <h2 className="text-sm font-semibold mb-3 uppercase tracking-wide">
            Storico movimenti
          </h2>

          <div className="border rounded-2xl overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-neutral-100">
                <tr>
                  <th className="px-3 py-2 text-left">Data</th>
                  <th className="px-3 py-2">Tipo</th>
                  <th className="px-3 py-2">Qta</th>
                  <th className="px-3 py-2">Locazione</th>
                  <th className="px-3 py-2 text-left">Note</th>
                </tr>
              </thead>
              <tbody>
                {movimenti.map((m) => (
                  <tr key={m.id} className="border-t">
                    <td className="px-3 py-2">
                      {m.data_mov?.slice(0, 16).replace("T", " ")}
                    </td>
                    <td className="px-3 py-2 text-center font-semibold">
                      {m.tipo}
                    </td>
                    <td className="px-3 py-2 text-center">
                      {m.qta}
                    </td>
                    <td className="px-3 py-2 text-center">
                      {m.locazione || "—"}
                    </td>
                    <td className="px-3 py-2">
                      {m.note || ""}
                    </td>
                  </tr>
                ))}

                {movimenti.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-4 text-center text-neutral-500">
                      Nessun movimento registrato.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="mt-6">
          <button
            onClick={() => navigate(`/vini/magazzino/${id}`)}
            className="text-sm text-neutral-600 hover:underline"
          >
            ← Torna al dettaglio vino
          </button>
        </div>

      </div>
    </div>
  );
}