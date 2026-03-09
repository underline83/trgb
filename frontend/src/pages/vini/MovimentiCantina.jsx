// FILE: frontend/src/pages/vini/MovimentiCantina.jsx
// @version: v2.0-apifetch-delete

import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { API_BASE, apiFetch } from "../../config/api";
import MagazzinoSubMenu from "../../components/vini/MagazzinoSubMenu";

const TIPO_LABELS = {
  CARICO: { label: "Carico", cls: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  SCARICO: { label: "Scarico", cls: "bg-red-50 text-red-700 border-red-200" },
  VENDITA: { label: "Vendita", cls: "bg-blue-50 text-blue-700 border-blue-200" },
  RETTIFICA: { label: "Rettifica", cls: "bg-amber-50 text-amber-700 border-amber-200" },
};

export default function MovimentiCantina() {
  const { id } = useParams();
  const navigate = useNavigate();
  const role = localStorage.getItem("role");
  const canDelete = role === "admin" || role === "sommelier";

  const [vino, setVino] = useState(null);
  const [movimenti, setMovimenti] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // form nuovo movimento
  const [tipo, setTipo] = useState("CARICO");
  const [qta, setQta] = useState("");
  const [locazione, setLocazione] = useState("");
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitMsg, setSubmitMsg] = useState("");

  // ── Fetch ─────────────────────────────────────────────
  const fetchData = async () => {
    setLoading(true);
    setError("");
    try {
      const [vinoRes, movRes] = await Promise.all([
        apiFetch(`${API_BASE}/vini/magazzino/${id}`),
        apiFetch(`${API_BASE}/vini/magazzino/${id}/movimenti`),
      ]);

      if (!vinoRes.ok) throw new Error(`Errore caricamento vino: ${vinoRes.status}`);
      if (!movRes.ok) throw new Error(`Errore caricamento movimenti: ${movRes.status}`);

      setVino(await vinoRes.json());
      setMovimenti(await movRes.json());
    } catch (err) {
      setError(err.message || "Errore di caricamento.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!id || id === "undefined") {
      navigate("/vini/magazzino");
      return;
    }
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // ── Nuovo movimento ────────────────────────────────────
  const submitMovimento = async () => {
    const qtaNum = Number(qta);
    if (!qta || qtaNum <= 0) {
      alert("Inserisci una quantità valida (> 0).");
      return;
    }

    setSubmitting(true);
    setSubmitMsg("");

    const payload = {
      tipo,
      qta: qtaNum,
      locazione: locazione.trim() || null,
      note: note.trim() || null,
    };

    try {
      const res = await apiFetch(`${API_BASE}/vini/magazzino/${id}/movimenti`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || `Errore ${res.status}`);
      }

      const data = await res.json();
      if (data.vino) setVino(data.vino);
      if (data.movimenti) setMovimenti(data.movimenti);

      setQta("");
      setLocazione("");
      setNote("");
      setSubmitMsg("✅ Movimento registrato.");
      setTimeout(() => setSubmitMsg(""), 3000);
    } catch (err) {
      setSubmitMsg(`❌ ${err.message}`);
    } finally {
      setSubmitting(false);
    }
  };

  // ── Elimina movimento ──────────────────────────────────
  const deleteMovimento = async (movId) => {
    if (!window.confirm("Eliminare questo movimento? La giacenza verrà ricalcolata.")) return;

    try {
      const res = await apiFetch(`${API_BASE}/vini/magazzino/movimenti/${movId}`, {
        method: "DELETE",
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || `Errore ${res.status}`);
      }

      // Ricarica vino e movimenti per aggiornare QTA_TOTALE
      await fetchData();
    } catch (err) {
      alert(err.message);
    }
  };

  // ─────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────
  if (loading && !vino) {
    return <div className="p-6 text-neutral-600">Caricamento…</div>;
  }

  const tot = vino
    ? (vino.QTA_TOTALE ??
        (vino.QTA_FRIGO ?? 0) +
        (vino.QTA_LOC1 ?? 0) +
        (vino.QTA_LOC2 ?? 0) +
        (vino.QTA_LOC3 ?? 0))
    : 0;

  return (
    <div className="min-h-screen bg-neutral-100 p-6">
      <div className="max-w-5xl mx-auto bg-white rounded-3xl shadow-2xl p-8 border border-neutral-200">

        <MagazzinoSubMenu />

        {/* HEADER */}
        <div className="flex flex-col sm:flex-row justify-between gap-4 mb-6 mt-4">
          <div>
            <h1 className="text-2xl font-bold text-amber-900 font-playfair">
              📦 Movimenti Cantina
            </h1>
            {vino && (
              <p className="text-neutral-600 mt-1 text-sm">
                <span className="font-semibold">{vino.DESCRIZIONE}</span>
                {vino.PRODUTTORE ? ` — ${vino.PRODUTTORE}` : ""}
                {vino.ANNATA ? ` (${vino.ANNATA})` : ""}
              </p>
            )}
          </div>
          {vino && (
            <div className="flex flex-col items-end">
              <span className="text-xs text-neutral-500">Giacenza totale</span>
              <span className="text-2xl font-bold text-amber-900">{tot} bt</span>
            </div>
          )}
        </div>

        {error && <p className="text-sm text-red-600 mb-4">{error}</p>}

        {/* ── FORM NUOVO MOVIMENTO ───────────────────── */}
        <div className="border border-neutral-200 rounded-2xl p-5 mb-8 bg-neutral-50">
          <h2 className="text-sm font-semibold mb-4 uppercase tracking-wide text-neutral-700">
            Nuovo movimento
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-3">
            <select
              value={tipo}
              onChange={(e) => setTipo(e.target.value)}
              className="border border-neutral-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-amber-300"
            >
              <option value="CARICO">Carico</option>
              <option value="SCARICO">Scarico</option>
              <option value="VENDITA">Vendita</option>
              <option value="RETTIFICA">Rettifica (valore assoluto)</option>
            </select>

            <input
              type="number"
              placeholder="Quantità *"
              value={qta}
              min={1}
              onChange={(e) => setQta(e.target.value)}
              className="border border-neutral-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-amber-300"
            />

            <input
              type="text"
              placeholder="Locazione (opz.)"
              value={locazione}
              onChange={(e) => setLocazione(e.target.value)}
              className="border border-neutral-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-amber-300"
            />

            <button
              type="button"
              onClick={submitMovimento}
              disabled={submitting}
              className="bg-amber-700 text-white rounded-xl px-4 py-2 font-semibold hover:bg-amber-800 transition disabled:opacity-50"
            >
              {submitting ? "Registro…" : "Registra"}
            </button>
          </div>

          <textarea
            placeholder="Note (opzionali)"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
            className="w-full border border-neutral-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-amber-300 resize-none"
          />

          {submitMsg && (
            <p className="text-sm font-medium mt-2">{submitMsg}</p>
          )}
        </div>

        {/* ── STORICO MOVIMENTI ─────────────────────── */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-700">
              Storico movimenti
            </h2>
            {loading && <span className="text-xs text-neutral-400">Aggiornamento…</span>}
            {!canDelete && (
              <span className="text-[11px] text-neutral-400">
                (eliminazione riservata ad admin / sommelier)
              </span>
            )}
          </div>

          <div className="border border-neutral-200 rounded-2xl overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-neutral-100">
                <tr className="text-xs text-neutral-600 uppercase tracking-wide">
                  <th className="px-3 py-2 text-left">Data</th>
                  <th className="px-3 py-2 text-center">Tipo</th>
                  <th className="px-3 py-2 text-center">Qtà</th>
                  <th className="px-3 py-2 text-left">Locazione</th>
                  <th className="px-3 py-2 text-left">Note</th>
                  <th className="px-3 py-2 text-left">Utente</th>
                  {canDelete && <th className="px-3 py-2 text-center">Azioni</th>}
                </tr>
              </thead>
              <tbody>
                {movimenti.map((m) => {
                  const tipoInfo = TIPO_LABELS[m.tipo] ?? { label: m.tipo, cls: "" };
                  return (
                    <tr key={m.id} className="border-t border-neutral-100 hover:bg-neutral-50 transition">
                      <td className="px-3 py-2 text-xs text-neutral-600 whitespace-nowrap">
                        {m.data_mov?.slice(0, 16).replace("T", " ")}
                      </td>
                      <td className="px-3 py-2 text-center">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold border ${tipoInfo.cls}`}>
                          {tipoInfo.label}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-center font-semibold text-neutral-800">
                        {m.qta}
                      </td>
                      <td className="px-3 py-2 text-neutral-600 text-xs">
                        {m.locazione || "—"}
                      </td>
                      <td className="px-3 py-2 text-neutral-700 text-xs">
                        {m.note || ""}
                      </td>
                      <td className="px-3 py-2 text-neutral-500 text-xs">
                        {m.utente || "—"}
                      </td>
                      {canDelete && (
                        <td className="px-3 py-2 text-center">
                          <button
                            type="button"
                            onClick={() => deleteMovimento(m.id)}
                            className="text-xs text-red-400 hover:text-red-600 transition"
                            title="Elimina movimento"
                          >
                            🗑
                          </button>
                        </td>
                      )}
                    </tr>
                  );
                })}

                {movimenti.length === 0 && (
                  <tr>
                    <td
                      colSpan={canDelete ? 7 : 6}
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

        {/* FOOTER NAV */}
        <div className="mt-6 flex gap-4">
          <button
            type="button"
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
