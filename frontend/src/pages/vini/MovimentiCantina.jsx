// FILE: frontend/src/pages/vini/MovimentiCantina.jsx
// @version: v1.0-movimenti-cantina-operativo
// Movimenti Cantina — Lista + Inserimento movimento sul vino selezionato
// Route attesa: /vini/magazzino/:id/movimenti

import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { API_BASE } from "../../config/api";
import MagazzinoSubMenu from "../../components/vini/MagazzinoSubMenu";

const TIPI_UI = [
  { value: "CARICO", label: "Carico" },
  { value: "SCARICO", label: "Scarico" },
  { value: "VENDITA_BOTTIGLIA", label: "Vendita bottiglia" },
  { value: "VENDITA_CALICE", label: "Vendita al calice" },
  { value: "ROTTURA", label: "Rottura bottiglia" },
  { value: "RETTIFICA", label: "Rettifica inventario" },
];

// mapping prudente verso backend (se backend accetta già ROTTURA bene, altrimenti ti torna 400)
function mapTipoToBackend(tipoUi) {
  switch (tipoUi) {
    case "VENDITA_BOTTIGLIA":
    case "VENDITA_CALICE":
      return "VENDITA";
    default:
      return tipoUi;
  }
}

export default function MovimentiCantina() {
  const navigate = useNavigate();
  const { id } = useParams();

  const vinoId = useMemo(() => {
    const n = Number(id);
    return Number.isInteger(n) && n > 0 ? n : null;
  }, [id]);

  const token = localStorage.getItem("token");

  const [vino, setVino] = useState(null);
  const [movimenti, setMovimenti] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadingVino, setLoadingVino] = useState(false);
  const [error, setError] = useState("");

  // form inserimento
  const [tipo, setTipo] = useState("CARICO");
  const [qta, setQta] = useState(1);
  const [note, setNote] = useState("");
  const [origine, setOrigine] = useState("GESTIONALE");

  const handleLogout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("role");
    window.location.reload();
  };

  const fetchVino = async () => {
    if (!vinoId) return;

    if (!token) {
      handleLogout();
      return;
    }

    setLoadingVino(true);
    setError("");

    try {
      const resp = await fetch(`${API_BASE}/vini/magazzino/${vinoId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (resp.status === 401) {
        alert("Sessione scaduta. Effettua di nuovo il login.");
        handleLogout();
        return;
      }

      if (!resp.ok) throw new Error(`Errore server: ${resp.status}`);

      const data = await resp.json();
      setVino(data);
    } catch (e) {
      setError(e?.message || "Errore caricamento vino.");
    } finally {
      setLoadingVino(false);
    }
  };

  const fetchMovimenti = async () => {
    if (!vinoId) return;

    if (!token) {
      handleLogout();
      return;
    }

    setLoading(true);
    setError("");

    try {
      // endpoint già visto in log: /vini/magazzino/{id}/movimenti?limit=200
      const resp = await fetch(
        `${API_BASE}/vini/magazzino/${vinoId}/movimenti?limit=200`,
        { headers: { Authorization: `Bearer ${token}` } }
      );

      if (resp.status === 401) {
        alert("Sessione scaduta. Effettua di nuovo il login.");
        handleLogout();
        return;
      }

      if (!resp.ok) {
        const txt = await resp.text().catch(() => "");
        throw new Error(txt || `Errore server: ${resp.status}`);
      }

      const data = await resp.json();

      // supporto a due possibili shape:
      // A) { vino_id, movimenti: [...] }
      // B) [...] (lista diretta)
      const list = Array.isArray(data) ? data : data?.movimenti || [];
      setMovimenti(list);
    } catch (e) {
      setError(e?.message || "Errore caricamento movimenti.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!vinoId) {
      navigate("/vini/magazzino", { replace: true });
      return;
    }
    fetchVino();
    fetchMovimenti();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vinoId]);

  const submitMovimento = async () => {
    if (!vinoId) return;

    if (!token) {
      handleLogout();
      return;
    }

    setError("");

    const q = Number(qta);
    if (!Number.isFinite(q) || q <= 0) {
      setError("Quantità non valida.");
      return;
    }

    const payload = {
      tipo: mapTipoToBackend(tipo),
      qta: Math.trunc(q),
      note: note?.trim() ? note.trim() : null,
      origine: origine?.trim() ? origine.trim() : "GESTIONALE",
    };

    try {
      const resp = await fetch(`${API_BASE}/vini/magazzino/${vinoId}/movimenti`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
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
        throw new Error(txt || `Errore server: ${resp.status}`);
      }

      // reset campi “operativi”
      setQta(1);
      setNote("");

      // refresh
      await fetchVino();
      await fetchMovimenti();
    } catch (e) {
      setError(e?.message || "Errore inserimento movimento.");
    }
  };

  const fmtDate = (x) => {
    if (!x) return "—";
    const d = new Date(x);
    if (Number.isNaN(d.getTime())) return String(x);
    return d.toLocaleString("it-IT");
  };

  const badgeTipo = (t) => {
    const tt = String(t || "").toUpperCase();
    if (tt.includes("CARICO")) return "bg-emerald-50 text-emerald-700 border-emerald-200";
    if (tt.includes("SCARICO")) return "bg-amber-50 text-amber-800 border-amber-200";
    if (tt.includes("VEND")) return "bg-sky-50 text-sky-700 border-sky-200";
    if (tt.includes("ROTT")) return "bg-red-50 text-red-700 border-red-200";
    if (tt.includes("RETT")) return "bg-purple-50 text-purple-800 border-purple-200";
    return "bg-neutral-50 text-neutral-700 border-neutral-200";
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
              Inserisci e controlla i movimenti sul vino selezionato.
            </p>
          </div>

          <div className="flex flex-col items-stretch gap-2 sm:flex-row sm:items-center sm:justify-end">
            <button
              type="button"
              onClick={() => navigate(`/vini/magazzino/${vinoId}`)}
              className="px-4 py-2 rounded-xl text-sm font-medium border border-neutral-300 bg-neutral-50 hover:bg-neutral-100 hover:-translate-y-0.5 shadow-sm transition"
            >
              ← Torna al dettaglio
            </button>

            <button
              type="button"
              onClick={() => navigate("/vini/magazzino")}
              className="px-4 py-2 rounded-xl text-sm font-medium border border-neutral-300 bg-neutral-50 hover:bg-neutral-100 hover:-translate-y-0.5 shadow-sm transition"
            >
              🏷️ Vai al magazzino
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
        <MagazzinoSubMenu vinoId={vinoId} />

        {error && (
          <div className="mb-4 text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl p-3">
            {error}
          </div>
        )}

        {/* INFO VINO */}
        <div className="border border-neutral-200 rounded-2xl bg-neutral-50 shadow-sm p-4 mb-6">
          {loadingVino ? (
            <div className="text-sm text-neutral-600">Carico vino…</div>
          ) : vino ? (
            <div className="flex flex-col lg:flex-row gap-3 lg:items-center lg:justify-between">
              <div>
                <div className="text-xs text-neutral-500 font-mono">
                  ID: {vino.id}
                  {vino.id_excel ? ` (Excel: ${vino.id_excel})` : ""}
                </div>
                <div className="text-lg font-semibold text-neutral-900">
                  {vino.DESCRIZIONE}
                </div>
                <div className="text-sm text-neutral-600">
                  {vino.PRODUTTORE || "—"} · {vino.NAZIONE || "—"}
                  {vino.REGIONE ? ` / ${vino.REGIONE}` : ""}
                  {vino.ANNATA ? ` · ${vino.ANNATA}` : ""}
                </div>
              </div>

              <div className="text-sm text-neutral-800">
                <div className="text-xs font-semibold text-neutral-600 uppercase tracking-wide">
                  Giacenza totale
                </div>
                <div className="text-2xl font-bold text-neutral-900">
                  {vino.QTA_TOTALE ??
                    (vino.QTA_FRIGO ?? 0) +
                      (vino.QTA_LOC1 ?? 0) +
                      (vino.QTA_LOC2 ?? 0) +
                      (vino.QTA_LOC3 ?? 0)}{" "}
                  bt
                </div>
              </div>
            </div>
          ) : (
            <div className="text-sm text-neutral-600">Vino non trovato.</div>
          )}
        </div>

        {/* INSERIMENTO MOVIMENTO */}
        <div className="border border-neutral-200 rounded-2xl bg-white shadow-sm p-5 mb-6">
          <div className="flex items-center justify-between gap-3 mb-3">
            <h2 className="text-sm font-semibold text-neutral-800 tracking-wide uppercase">
              Inserisci movimento
            </h2>
            <button
              type="button"
              onClick={() => {
                fetchVino();
                fetchMovimenti();
              }}
              className="px-4 py-2 rounded-xl text-xs font-semibold border border-neutral-300 bg-neutral-50 hover:bg-neutral-100 shadow-sm transition"
            >
              ⟳ Aggiorna
            </button>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-3">
            <div className="lg:col-span-3">
              <label className="block text-xs font-semibold text-neutral-600 mb-1 uppercase tracking-wide">
                Tipo movimento
              </label>
              <select
                value={tipo}
                onChange={(e) => setTipo(e.target.value)}
                className="w-full border border-neutral-300 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-amber-300"
              >
                {TIPI_UI.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="lg:col-span-2">
              <label className="block text-xs font-semibold text-neutral-600 mb-1 uppercase tracking-wide">
                Quantità
              </label>
              <input
                type="number"
                min="1"
                value={qta}
                onChange={(e) => setQta(e.target.value)}
                className="w-full border border-neutral-300 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-amber-300"
              />
            </div>

            <div className="lg:col-span-3">
              <label className="block text-xs font-semibold text-neutral-600 mb-1 uppercase tracking-wide">
                Origine
              </label>
              <input
                type="text"
                value={origine}
                onChange={(e) => setOrigine(e.target.value)}
                className="w-full border border-neutral-300 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-amber-300"
                placeholder="GESTIONALE"
              />
            </div>

            <div className="lg:col-span-4">
              <label className="block text-xs font-semibold text-neutral-600 mb-1 uppercase tracking-wide">
                Note (opzionale)
              </label>
              <input
                type="text"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                className="w-full border border-neutral-300 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-amber-300"
                placeholder="Es. servizio 12/12, rottura in cantina, rettifica inventario…"
              />
            </div>

            <div className="lg:col-span-12 flex justify-end">
              <button
                type="button"
                onClick={submitMovimento}
                className="px-5 py-2.5 rounded-2xl text-sm font-semibold bg-amber-700 text-white hover:bg-amber-800 shadow-sm transition"
              >
                ✅ Registra movimento
              </button>
            </div>
          </div>

          <div className="mt-3 text-xs text-neutral-500">
            Nota: “Vendita bottiglia/calice” viene salvata come <b>VENDITA</b> (distinzione la gestiamo lato UI/analisi).
          </div>
        </div>

        {/* LISTA MOVIMENTI */}
        <div className="border border-neutral-200 rounded-2xl bg-neutral-50 shadow-sm overflow-hidden">
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
                  <th className="px-3 py-2 text-left">Origine</th>
                  <th className="px-3 py-2 text-left">Note</th>
                </tr>
              </thead>
              <tbody>
                {loading && (
                  <tr>
                    <td colSpan={5} className="px-4 py-4 text-sm text-neutral-600">
                      Caricamento movimenti…
                    </td>
                  </tr>
                )}

                {!loading && movimenti.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-6 text-center text-sm text-neutral-500">
                      Nessun movimento registrato.
                    </td>
                  </tr>
                )}

                {!loading &&
                  movimenti.map((m, idx) => (
                    <tr
                      key={m.id ?? `${m.data_mov ?? "x"}-${idx}`}
                      className="border-b border-neutral-200 bg-white"
                    >
                      <td className="px-3 py-2 whitespace-nowrap text-xs text-neutral-600">
                        {fmtDate(m.data_mov || m.data || m.created_at)}
                      </td>
                      <td className="px-3 py-2">
                        <span
                          className={`inline-flex items-center px-2 py-1 rounded-full text-[11px] font-semibold border ${badgeTipo(
                            m.tipo
                          )}`}
                        >
                          {String(m.tipo || "—")}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-center font-semibold text-neutral-900">
                        {m.qta ?? m.QTA ?? "—"}
                      </td>
                      <td className="px-3 py-2 text-xs text-neutral-700">
                        {m.origine ?? m.ORIGINE ?? "—"}
                      </td>
                      <td className="px-3 py-2 text-xs text-neutral-700 whitespace-pre-wrap">
                        {m.note ?? m.NOTE ?? "—"}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="mt-6 flex justify-end">
          <button
            type="button"
            onClick={() => navigate("/vini")}
            className="px-4 py-2 rounded-xl text-sm font-medium border border-neutral-300 bg-neutral-50 hover:bg-neutral-100 shadow-sm transition"
          >
            ← Torna al Menu Vini
          </button>
        </div>
      </div>
    </div>
  );
}