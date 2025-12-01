// @version: v1.0-magazzino-dettaglio
// Scheda Vino Magazzino — Dettaglio + Movimenti + Note

import React, { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { API_BASE } from "../../config/api";

export default function VinoMagazzinoDettaglio() {
  const navigate = useNavigate();
  const { id } = useParams();
  const vinoId = Number(id);

  const token = localStorage.getItem("token");

  const [loading, setLoading] = useState(true);
  const [vino, setVino] = useState(null);
  const [movimenti, setMovimenti] = useState([]);
  const [note, setNote] = useState([]);

  // Form nuovo movimento
  const [movTipo, setMovTipo] = useState("CARICO");
  const [movQta, setMovQta] = useState("");
  const [movLocazione, setMovLocazione] = useState("");
  const [movNote, setMovNote] = useState("");

  // Form nuova nota
  const [notaText, setNotaText] = useState("");

  const fetchVino = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/vini/magazzino/${vinoId}`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      if (!res.ok) throw new Error(`Errore ${res.status}`);
      const data = await res.json();
      setVino(data);
    } catch (err) {
      console.error("Errore caricando vino:", err);
      alert("Errore nel caricamento del vino.");
    }
    setLoading(false);
  };

  const fetchMovimenti = async () => {
    try {
      const res = await fetch(
        `${API_BASE}/vini/magazzino/${vinoId}/movimenti?limit=100`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );
      if (!res.ok) throw new Error(`Errore ${res.status}`);
      const data = await res.json();
      setMovimenti(data || []);
    } catch (err) {
      console.error("Errore caricando movimenti:", err);
      setMovimenti([]);
    }
  };

  const fetchNote = async () => {
    try {
      const res = await fetch(`${API_BASE}/vini/magazzino/${vinoId}/note`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      if (!res.ok) throw new Error(`Errore ${res.status}`);
      const data = await res.json();
      setNote(data || []);
    } catch (err) {
      console.error("Errore caricando note:", err);
      setNote([]);
    }
  };

  useEffect(() => {
    if (!vinoId) return;
    fetchVino();
    fetchMovimenti();
    fetchNote();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vinoId]);

  const handleNuovoMovimento = async (e) => {
    e.preventDefault();

    if (!movQta || Number(movQta) <= 0) {
      alert("Inserisci una quantità > 0.");
      return;
    }

    try {
      const res = await fetch(`${API_BASE}/vini/magazzino/${vinoId}/movimenti`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          tipo: movTipo,
          qta: Number(movQta),
          locazione: movLocazione || null,
          note: movNote || null,
          origine: "GESTIONALE",
          data_mov: null,
        }),
      });

      if (!res.ok) {
        const txt = await res.text();
        throw new Error(`Errore movimento: ${res.status} - ${txt}`);
      }

      const data = await res.json();
      if (data.vino) setVino(data.vino);
      if (data.movimenti) setMovimenti(data.movimenti);

      setMovQta("");
      setMovLocazione("");
      setMovNote("");
    } catch (err) {
      console.error(err);
      alert("Errore nella registrazione del movimento.");
    }
  };

  const handleNuovaNota = async (e) => {
    e.preventDefault();
    if (!notaText.trim()) {
      alert("La nota non può essere vuota.");
      return;
    }

    try {
      const res = await fetch(`${API_BASE}/vini/magazzino/${vinoId}/note`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ nota: notaText.trim() }),
      });

      if (!res.ok) {
        const txt = await res.text();
        throw new Error(`Errore nota: ${res.status} - ${txt}`);
      }

      const data = await res.json();
      setNote(data || []);
      setNotaText("");
    } catch (err) {
      console.error(err);
      alert("Errore nel salvataggio della nota.");
    }
  };

  if (loading || !vino) {
    return (
      <div className="min-h-screen bg-neutral-100 p-6 flex items-center justify-center">
        <div className="text-neutral-700 text-lg">Caricamento scheda vino…</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-neutral-100 p-6 font-sans">
      <div className="max-w-6xl mx-auto bg-white shadow-2xl rounded-3xl p-10 border border-neutral-200 space-y-8">

        {/* HEADER + BACK */}
        <div className="flex flex-col sm:flex-row justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-amber-900 font-playfair mb-2">
              Scheda Vino — Magazzino
            </h1>
            <p className="text-neutral-600 text-sm">
              ID #{vino.id} — {vino.TIPOLOGIA} · {vino.NAZIONE}
            </p>
          </div>
          <div className="flex items-start justify-end gap-3">
            <button
              type="button"
              onClick={() => navigate("/vini/magazzino")}
              className="px-4 py-2 rounded-xl text-sm font-medium border border-neutral-300 bg-neutral-50 hover:bg-neutral-100 shadow-sm transition"
            >
              ← Torna alla lista
            </button>
            <button
              type="button"
              onClick={() => navigate("/vini")}
              className="px-4 py-2 rounded-xl text-sm font-medium border border-neutral-300 bg-neutral-50 hover:bg-neutral-100 shadow-sm transition"
            >
              🍷 Menu Vini
            </button>
          </div>
        </div>

        {/* CARD PRINCIPALE ANAGRAFICA + MAGAZZINO */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* ANAGRAFICA */}
          <div className="lg:col-span-2 bg-amber-50 border border-amber-200 rounded-2xl p-6 shadow-inner space-y-3">
            <div className="text-sm uppercase tracking-wide text-amber-700 font-semibold">
              Anagrafica vino
            </div>
            <div className="text-2xl font-bold text-amber-900 font-playfair">
              {vino.DESCRIZIONE}
            </div>
            <div className="text-neutral-700">
              {vino.DENOMINAZIONE && (
                <div className="text-sm italic mb-1">{vino.DENOMINAZIONE}</div>
              )}
              <div className="text-sm">
                {vino.PRODUTTORE && (
                  <span className="font-semibold">{vino.PRODUTTORE}</span>
                )}
                {vino.REGIONE && (
                  <span className="ml-2">
                    · {vino.REGIONE} ({vino.NAZIONE})
                  </span>
                )}
              </div>
              {vino.ANNATA && (
                <div className="mt-1 text-sm">
                  Annata: <span className="font-semibold">{vino.ANNATA}</span> {/* ✅ ANNATA */}
                </div>
              )}
              {vino.VITIGNI && (
                <div className="mt-1 text-sm">
                  Vitigni: <span className="font-semibold">{vino.VITIGNI}</span>
                </div>
              )}
              {vino.GRADO_ALCOLICO && (
                <div className="mt-1 text-sm">
                  Grado alcolico:{" "}
                  <span className="font-semibold">
                    {vino.GRADO_ALCOLICO.toString().replace(".", ",")}%
                  </span>
                </div>
              )}
            </div>

            <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
              <div className="space-y-1">
                <div className="font-semibold text-neutral-800">Codice</div>
                <div className="text-neutral-700">{vino.CODICE || "—"}</div>
              </div>
              <div className="space-y-1">
                <div className="font-semibold text-neutral-800">
                  Distributore
                </div>
                <div className="text-neutral-700">
                  {vino.DISTRIBUTORE || "—"}
                </div>
              </div>
            </div>

            <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
              <div className="space-y-1">
                <div className="font-semibold text-neutral-800">
                  Prezzo Carta
                </div>
                <div className="text-neutral-700">
                  {vino.PREZZO_CARTA != null
                    ? `${vino.PREZZO_CARTA.toFixed(2)} €`
                    : "—"}
                </div>
              </div>
              <div className="space-y-1">
                <div className="font-semibold text-neutral-800">
                  Listino / Sconto
                </div>
                <div className="text-neutral-700">
                  {vino.EURO_LISTINO != null
                    ? `${vino.EURO_LISTINO.toFixed(2)} €`
                    : "—"}{" "}
                  {vino.SCONTO != null && `· Sconto ${vino.SCONTO}%`}
                </div>
              </div>
              <div className="space-y-1">
                <div className="font-semibold text-neutral-800">
                  In carta / iPratico
                </div>
                <div className="text-neutral-700">
                  Carta: {vino.CARTA || "—"} · iPratico: {vino.IPRATICO || "—"}
                </div>
              </div>
            </div>
          </div>

          {/* MAGAZZINO */}
          <div className="bg-neutral-50 border border-neutral-200 rounded-2xl p-6 shadow-inner space-y-4">
            <div className="text-sm uppercase tracking-wide text-neutral-600 font-semibold">
              Magazzino
            </div>

            <div className="text-4xl font-bold text-neutral-900 text-center mb-2">
              {vino.QTA_TOTALE ?? 0}
            </div>
            <div className="text-xs text-neutral-500 text-center mb-4">
              Bottiglie totali
            </div>

            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="font-semibold">Frigorifero</span>
                <span>
                  {vino.FRIGORIFERO || "—"} · {vino.QTA_FRIGO ?? 0} bt
                </span>
              </div>
              <div className="flex justify-between">
                <span className="font-semibold">Locazione 1</span>
                <span>
                  {vino.LOCAZIONE_1 || "—"} · {vino.QTA_LOC1 ?? 0} bt
                </span>
              </div>
              <div className="flex justify-between">
                <span className="font-semibold">Locazione 2</span>
                <span>
                  {vino.LOCAZIONE_2 || "—"} · {vino.QTA_LOC2 ?? 0} bt
                </span>
              </div>
              <div className="flex justify-between">
                <span className="font-semibold">Locazione 3</span>
                <span>
                  {vino.LOCAZIONE_3 || "—"} · {vino.QTA_LOC3 ?? 0} bt
                </span>
              </div>
            </div>

            {vino.STATO_VENDITA && (
              <div className="mt-3 text-sm">
                <div className="font-semibold text-neutral-800">
                  Stato vendita
                </div>
                <div className="text-neutral-700">
                  Codice:{" "}
                  <span className="font-mono">{vino.STATO_VENDITA}</span>
                </div>
                {vino.NOTE_STATO && (
                  <div className="text-neutral-700 mt-1">
                    {vino.NOTE_STATO}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* MOVIMENTI + FORM NUOVO MOVIMENTO */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Movimenti */}
          <div className="lg:col-span-2 bg-white border border-neutral-200 rounded-2xl p-6 shadow-sm">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-semibold text-neutral-900">
                Movimenti di cantina
              </h2>
            </div>
            {movimenti.length === 0 ? (
              <div className="text-sm text-neutral-500">
                Nessun movimento registrato.
              </div>
            ) : (
              <div className="max-h-80 overflow-auto text-sm">
                <table className="w-full border-collapse">
                  <thead>
                    <tr className="border-b border-neutral-200 text-xs uppercase tracking-wide text-neutral-500 bg-neutral-50">
                      <th className="px-2 py-2 text-left">Data</th>
                      <th className="px-2 py-2 text-left">Tipo</th>
                      <th className="px-2 py-2 text-right">Qta</th>
                      <th className="px-2 py-2 text-left">Locazione</th>
                      <th className="px-2 py-2 text-left">Note</th>
                      <th className="px-2 py-2 text-left">Origine</th>
                      <th className="px-2 py-2 text-left">Utente</th>
                    </tr>
                  </thead>
                  <tbody>
                    {movimenti.map((m) => (
                      <tr
                        key={m.id}
                        className="border-b border-neutral-100 text-xs"
                      >
                        <td className="px-2 py-1 align-top">
                          {m.data_mov || m.created_at}
                        </td>
                        <td className="px-2 py-1 align-top font-semibold">
                          {m.tipo}
                        </td>
                        <td className="px-2 py-1 align-top text-right">
                          {m.qta}
                        </td>
                        <td className="px-2 py-1 align-top">
                          {m.locazione || "—"}
                        </td>
                        <td className="px-2 py-1 align-top">
                          {m.note || "—"}
                        </td>
                        <td className="px-2 py-1 align-top">
                          {m.origine || "—"}
                        </td>
                        <td className="px-2 py-1 align-top">
                          {m.utente || "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Form nuovo movimento */}
          <div className="bg-neutral-50 border border-neutral-200 rounded-2xl p-6 shadow-inner">
            <h2 className="text-lg font-semibold text-neutral-900 mb-3">
              Nuovo movimento
            </h2>
            <form className="space-y-3" onSubmit={handleNuovoMovimento}>
              <div className="space-y-1 text-sm">
                <label className="font-medium text-neutral-800">
                  Tipo movimento
                </label>
                <select
                  value={movTipo}
                  onChange={(e) => setMovTipo(e.target.value)}
                  className="w-full border border-neutral-300 rounded-lg p-2 text-sm bg-white"
                >
                  <option value="CARICO">CARICO</option>
                  <option value="SCARICO">SCARICO</option>
                  <option value="VENDITA">VENDITA</option>
                  <option value="RETTIFICA">RETTIFICA</option>
                </select>
              </div>

              <div className="space-y-1 text-sm">
                <label className="font-medium text-neutral-800">Quantità</label>
                <input
                  type="number"
                  min="1"
                  value={movQta}
                  onChange={(e) => setMovQta(e.target.value)}
                  className="w-full border border-neutral-300 rounded-lg p-2 text-sm bg-white"
                  placeholder="Numero di bottiglie"
                />
              </div>

              <div className="space-y-1 text-sm">
                <label className="font-medium text-neutral-800">
                  Locazione (opzionale)
                </label>
                <input
                  type="text"
                  value={movLocazione}
                  onChange={(e) => setMovLocazione(e.target.value)}
                  className="w-full border border-neutral-300 rounded-lg p-2 text-sm bg-white"
                  placeholder="Es. Frigo 1-2, Scaffale 3-2…"
                />
              </div>

              <div className="space-y-1 text-sm">
                <label className="font-medium text-neutral-800">
                  Note (opzionale)
                </label>
                <textarea
                  value={movNote}
                  onChange={(e) => setMovNote(e.target.value)}
                  className="w-full border border-neutral-300 rounded-lg p-2 text-sm bg-white"
                  rows={3}
                  placeholder="Es. Servizio, evento, rettifica inventario…"
                />
              </div>

              <button
                type="submit"
                className="w-full mt-2 px-4 py-2 rounded-xl text-sm font-semibold text-white bg-amber-700 hover:bg-amber-800 shadow transition"
              >
                Registra movimento
              </button>
            </form>
          </div>
        </div>

        {/* NOTE OPERATIVE */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Lista note */}
          <div className="lg:col-span-2 bg-white border border-neutral-200 rounded-2xl p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-neutral-900 mb-3">
              Note operative
            </h2>
            {note.length === 0 ? (
              <div className="text-sm text-neutral-500">
                Nessuna nota registrata.
              </div>
            ) : (
              <div className="space-y-3 text-sm max-h-64 overflow-auto">
                {note.map((n) => (
                  <div
                    key={n.id}
                    className="border border-neutral-200 rounded-xl p-3 bg-neutral-50"
                  >
                    <div className="text-neutral-800 whitespace-pre-wrap">
                      {n.nota}
                    </div>
                    <div className="mt-1 text-xs text-neutral-500 flex justify-between">
                      <span>{n.autore || "—"}</span>
                      <span>{n.created_at}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Nuova nota */}
          <div className="bg-neutral-50 border border-neutral-200 rounded-2xl p-6 shadow-inner">
            <h2 className="text-lg font-semibold text-neutral-900 mb-3">
              Aggiungi nota
            </h2>
            <form className="space-y-3" onSubmit={handleNuovaNota}>
              <textarea
                value={notaText}
                onChange={(e) => setNotaText(e.target.value)}
                className="w-full border border-neutral-300 rounded-lg p-2 text-sm bg-white"
                rows={5}
                placeholder="Annotazioni operative su questo vino…"
              />
              <button
                type="submit"
                className="w-full px-4 py-2 rounded-xl text-sm font-semibold text-white bg-neutral-800 hover:bg-neutral-900 shadow transition"
              >
                Salva nota
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}