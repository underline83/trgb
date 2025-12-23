// @version: v1.2-movimenti-cantina-ui
// FILE: frontend/src/pages/vini/MovimentiCantina.jsx
// Movimenti Cantina — Lista + Inserimento (CARICO/SCARICO/VENDITA/RETTIFICA) con fallback endpoint

import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { API_BASE } from "../../config/api";
import MagazzinoSubMenu from "../../components/vini/MagazzinoSubMenu";

const ENDPOINTS = (vinoId) => ([
  // Struttura "magazzino"
  {
    list: `${API_BASE}/vini/magazzino/${vinoId}/movimenti?limit=200`,
    create: `${API_BASE}/vini/magazzino/${vinoId}/movimenti`,
  },
  // Fallback legacy
  {
    list: `${API_BASE}/vini/${vinoId}/movimenti`,
    create: `${API_BASE}/vini/${vinoId}/movimenti`,
  },
]);

const formatDate = (iso) => {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleString("it-IT");
  } catch {
    return iso;
  }
};

export default function MovimentiCantina({ vinoId: vinoIdProp }) {
  const navigate = useNavigate();
  const params = useParams();

  const vinoId = useMemo(() => {
    const raw = vinoIdProp ?? params.id;
    const n = Number(raw);
    return Number.isFinite(n) && n > 0 ? n : null;
  }, [vinoIdProp, params.id]);

  const token = localStorage.getItem("token");

  const [loading, setLoading] = useState(false);
  const [loadingSave, setLoadingSave] = useState(false);
  const [error, setError] = useState("");
  const [movimenti, setMovimenti] = useState([]);

  // Form
  const [tipoUi, setTipoUi] = useState("CARICO");
  const [qta, setQta] = useState(1);
  const [note, setNote] = useState("");

  const handleLogout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("role");
    window.location.reload();
  };

  const resolveTipoPayload = () => {
    // Backend: CARICO / SCARICO / VENDITA / RETTIFICA
    // UI: scorciatoie mappate su tipo+note
    const t = String(tipoUi || "").toUpperCase().trim();

    if (t === "VENDITA_BOTTIGLIA") return { tipo: "VENDITA", notePrefix: "VENDITA BOTTIGLIA" };
    if (t === "VENDITA_CALICE") return { tipo: "VENDITA", notePrefix: "VENDITA CALICE" };
    if (t === "ROTTURA") return { tipo: "SCARICO", notePrefix: "ROTTURA" };

    return { tipo: t, notePrefix: "" };
  };

  const fetchMovimenti = async () => {
    if (!vinoId) return;

    if (!token) {
      setError("Non autenticato. Accedi dal gestionale.");
      return;
    }

    setLoading(true);
    setError("");

    const tries = ENDPOINTS(vinoId);

    try {
      let lastErr = null;

      for (const ep of tries) {
        try {
          const resp = await fetch(ep.list, {
            headers: { Authorization: `Bearer ${token}` },
          });

          if (resp.status === 401) {
            alert("Sessione scaduta. Effettua di nuovo il login.");
            handleLogout();
            return;
          }

          if (resp.status === 404) {
            lastErr = new Error("Endpoint non trovato (404).");
            continue;
          }

          if (!resp.ok) {
            const txt = await resp.text().catch(() => "");
            throw new Error(txt || `Errore server: ${resp.status}`);
          }

          const data = await resp.json();
          const list = Array.isArray(data) ? data : (data.movimenti || []);
          setMovimenti(list);
          return;
        } catch (e) {
          lastErr = e;
        }
      }

      throw lastErr || new Error("Impossibile caricare movimenti.");
    } catch (e) {
      setError(e?.message || "Errore caricamento movimenti.");
    } finally {
      setLoading(false);
    }
  };

  const creaMovimento = async () => {
    if (!vinoId) return;

    if (!token) {
      setError("Non autenticato. Accedi dal gestionale.");
      return;
    }

    const q = Number(qta);
    if (!Number.isFinite(q) || q <= 0) {
      setError("Quantità non valida.");
      return;
    }

    setLoadingSave(true);
    setError("");

    const tries = ENDPOINTS(vinoId);
    const { tipo, notePrefix } = resolveTipoPayload();
    const noteFinale = [notePrefix, note].filter(Boolean).join(" — ");

    try {
      let lastErr = null;

      for (const ep of tries) {
        try {
          const resp = await fetch(ep.create, {
            method: "POST",
            headers: {
              Authorization: `Bearer ${token}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              tipo,
              qta: q,
              note: noteFinale || null,
              origine: "GESTIONALE",
            }),
          });

          if (resp.status === 401) {
            alert("Sessione scaduta. Effettua di nuovo il login.");
            handleLogout();
            return;
          }

          if (resp.status === 404) {
            lastErr = new Error("Endpoint non trovato (404).");
            continue;
          }

          if (!resp.ok) {
            const txt = await resp.text().catch(() => "");
            throw new Error(txt || `Errore server: ${resp.status}`);
          }

          setNote("");
          setQta(1);
          setTipoUi("CARICO");
          await fetchMovimenti();
          return;
        } catch (e) {
          lastErr = e;
        }
      }

      throw lastErr || new Error("Impossibile registrare movimento.");
    } catch (e) {
      setError(e?.message || "Errore salvataggio movimento.");
    } finally {
      setLoadingSave(false);
    }
  };

  useEffect(() => {
    fetchMovimenti();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vinoId]);

  const isStandalone = !vinoIdProp;

  const content = (
    <>
      {/* INSERIMENTO */}
      <div className="border border-neutral-200 rounded-2xl bg-neutral-50 shadow-sm overflow-hidden mb-6">
        <div className="px-4 py-3 border-b border-neutral-200 bg-neutral-100">
          <div className="text-sm font-semibold text-neutral-800 tracking-wide uppercase">
            Inserisci movimento
          </div>
          <div className="text-xs text-neutral-500 mt-1">
            Carico / Scarico / Vendita / Rottura / Rettifica
          </div>
        </div>

        <div className="p-4 grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
          <div className="md:col-span-4">
            <label className="block text-xs font-semibold text-neutral-600 mb-1 uppercase tracking-wide">
              Tipo
            </label>
            <select
              value={tipoUi}
              onChange={(e) => setTipoUi(e.target.value)}
              className="w-full border border-neutral-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-purple-200"
            >
              <option value="CARICO">CARICO</option>
              <option value="SCARICO">SCARICO</option>
              <option value="VENDITA_BOTTIGLIA">VENDITA (BOTTIGLIA)</option>
              <option value="VENDITA_CALICE">VENDITA (CALICE)</option>
              <option value="ROTTURA">ROTTURA BOTTIGLIA</option>
              <option value="RETTIFICA">RETTIFICA</option>
            </select>
          </div>

          <div className="md:col-span-2">
            <label className="block text-xs font-semibold text-neutral-600 mb-1 uppercase tracking-wide">
              Q.tà
            </label>
            <input
              type="number"
              min={1}
              value={qta}
              onChange={(e) => setQta(e.target.value)}
              className="w-full border border-neutral-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-purple-200"
            />
          </div>

          <div className="md:col-span-5">
            <label className="block text-xs font-semibold text-neutral-600 mb-1 uppercase tracking-wide">
              Note
            </label>
            <input
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="es. Servizio 21/12, tavolo 8, evento…"
              className="w-full border border-neutral-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-purple-200"
            />
          </div>

          <div className="md:col-span-1 flex justify-end">
            <button
              type="button"
              onClick={creaMovimento}
              disabled={loadingSave || !vinoId}
              className={`
                w-full px-4 py-2 rounded-xl text-sm font-semibold shadow-sm transition
                ${loadingSave || !vinoId ? "bg-gray-400 text-white cursor-not-allowed" : "bg-purple-700 text-white hover:bg-purple-800 hover:-translate-y-0.5"}
              `}
              title={!vinoId ? "ID vino non valido" : ""}
            >
              {loadingSave ? "…" : "OK"}
            </button>
          </div>
        </div>

        {error && (
          <div className="px-4 pb-4">
            <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl p-3">
              {error}
            </div>
          </div>
        )}
      </div>

      {/* LISTA */}
      <div className="border border-neutral-200 rounded-2xl bg-white shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-neutral-200 bg-neutral-100 flex items-center justify-between">
          <div className="text-sm font-semibold text-neutral-800 tracking-wide uppercase">
            Movimenti registrati
          </div>
          <button
            type="button"
            onClick={fetchMovimenti}
            disabled={loading || !vinoId}
            className={`
              px-3 py-1.5 rounded-lg text-xs font-semibold border shadow-sm transition
              ${loading || !vinoId ? "bg-neutral-100 text-neutral-400 border-neutral-200 cursor-not-allowed" : "bg-neutral-50 text-neutral-700 border-neutral-200 hover:bg-neutral-100"}
            `}
          >
            {loading ? "Aggiorno…" : "⟳ Aggiorna"}
          </button>
        </div>

        <div className="max-h-[360px] overflow-auto">
          <table className="w-full text-sm">
            <thead className="bg-neutral-50 sticky top-0 z-10">
              <tr className="text-xs text-neutral-600 uppercase tracking-wide">
                <th className="px-3 py-2 text-left">Data</th>
                <th className="px-3 py-2 text-left">Tipo</th>
                <th className="px-3 py-2 text-center">Q.tà</th>
                <th className="px-3 py-2 text-left">Note</th>
                <th className="px-3 py-2 text-left">Origine</th>
              </tr>
            </thead>
            <tbody>
              {movimenti.map((m, idx) => (
                <tr
                  key={m.id ?? `${m.data_mov ?? "x"}-${idx}`}
                  className="border-b border-neutral-100 hover:bg-purple-50/40 transition"
                >
                  <td className="px-3 py-2 text-xs text-neutral-600 whitespace-nowrap">
                    {formatDate(m.data_mov || m.created_at || m.data || m.ts)}
                  </td>
                  <td className="px-3 py-2 text-xs font-semibold text-neutral-800 whitespace-nowrap">
                    {m.tipo || "—"}
                  </td>
                  <td className="px-3 py-2 text-center font-semibold">
                    {m.qta ?? m.quantita ?? "—"}
                  </td>
                  <td className="px-3 py-2 text-xs text-neutral-700">
                    {m.note || "—"}
                  </td>
                  <td className="px-3 py-2 text-xs text-neutral-500">
                    {m.origine || "—"}
                  </td>
                </tr>
              ))}

              {movimenti.length === 0 && !loading && (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-sm text-neutral-500">
                    Nessun movimento registrato per questo vino.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );

  if (!isStandalone) return content;

  return (
    <div className="min-h-screen bg-neutral-100 p-6 font-sans">
      <div className="max-w-6xl mx-auto bg-white shadow-2xl rounded-3xl p-8 lg:p-10 border border-neutral-200">
        <div className="flex flex-col lg:flex-row justify-between gap-4 mb-6">
          <div>
            <h1 className="text-3xl lg:text-4xl font-bold text-purple-900 tracking-wide font-playfair mb-2">
              📦 Movimenti Cantina
            </h1>
            <p className="text-neutral-600">
              Registrazione movimenti e storico per il vino selezionato.
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
          </div>
        </div>

        <MagazzinoSubMenu />

        {!vinoId && (
          <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl p-3">
            ID vino non valido.
          </div>
        )}

        {content}
      </div>
    </div>
  );
}