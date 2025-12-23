// @version: v1.1-magazzino-dettaglio-movimenti
// FILE: frontend/src/pages/vini/MagazzinoViniDettaglio.jsx
// Dettaglio vino + Movimenti Cantina (embedded)

import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { API_BASE } from "../../config/api";
import MagazzinoSubMenu from "../../components/vini/MagazzinoSubMenu";
import MovimentiCantina from "./MovimentiCantina";

export default function MagazzinoViniDettaglio() {
  const navigate = useNavigate();
  const { id } = useParams();

  const vinoId = useMemo(() => {
    const n = Number(id);
    return Number.isFinite(n) && n > 0 ? n : null;
  }, [id]);

  const [vino, setVino] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const token = localStorage.getItem("token");

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

    setLoading(true);
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

      if (!resp.ok) {
        const txt = await resp.text().catch(() => "");
        throw new Error(txt || `Errore server: ${resp.status}`);
      }

      const data = await resp.json();
      setVino(data);
    } catch (e) {
      setError(e?.message || "Errore caricamento vino.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchVino();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vinoId]);

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

  if (!vinoId) {
    return (
      <div className="min-h-screen bg-neutral-100 p-6 font-sans">
        <div className="max-w-4xl mx-auto bg-white shadow-2xl rounded-3xl p-10 border border-neutral-200">
          <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl p-3">
            ID vino non valido.
          </div>
          <div className="mt-4">
            <button
              type="button"
              onClick={() => navigate("/vini/magazzino")}
              className="px-4 py-2 rounded-xl text-sm font-medium border border-neutral-300 bg-neutral-50 hover:bg-neutral-100 shadow-sm transition"
            >
              ← Torna al Magazzino
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-neutral-100 p-6 font-sans">
      <div className="max-w-6xl mx-auto bg-white shadow-2xl rounded-3xl p-8 lg:p-10 border border-neutral-200">
        {/* HEADER */}
        <div className="flex flex-col lg:flex-row justify-between gap-4 mb-6">
          <div>
            <h1 className="text-3xl lg:text-4xl font-bold text-amber-900 tracking-wide font-playfair mb-2">
              🍷 Dettaglio Vino — ID {vinoId}
            </h1>
            <p className="text-neutral-600">
              Anagrafica, giacenze e movimenti cantina.
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

        <MagazzinoSubMenu />

        {error && (
          <div className="mb-4 text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl p-3">
            {error}
          </div>
        )}

        {/* BLOCCO DETTAGLIO */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
          {/* INFO PRINCIPALI */}
          <div className="lg:col-span-2">
            <div className="border border-neutral-200 rounded-2xl bg-neutral-50 shadow-sm overflow-hidden">
              <div className="px-4 py-3 border-b border-neutral-200 bg-neutral-100 flex items-center justify-between">
                <div>
                  <div className="text-sm font-semibold text-neutral-800 tracking-wide uppercase">
                    Anagrafica
                  </div>
                  <div className="text-xs text-neutral-500 mt-1">
                    Dati base del vino e prezzi
                  </div>
                </div>

                <button
                  type="button"
                  onClick={fetchVino}
                  disabled={loading}
                  className={`
                    px-3 py-1.5 rounded-lg text-xs font-semibold border shadow-sm transition
                    ${
                      loading
                        ? "bg-neutral-100 text-neutral-400 border-neutral-200 cursor-not-allowed"
                        : "bg-neutral-50 text-neutral-700 border-neutral-200 hover:bg-neutral-100"
                    }
                  `}
                >
                  {loading ? "Aggiorno…" : "⟳ Aggiorna"}
                </button>
              </div>

              <div className="p-4">
                {!vino && !loading && (
                  <div className="text-sm text-neutral-500">Nessun dato.</div>
                )}

                {vino && (
                  <div className="space-y-4">
                    <div>
                      <div className="text-[11px] text-neutral-500 font-mono mb-1">
                        ID: {vino.id}
                        {vino.id_excel ? ` (Excel: ${vino.id_excel})` : ""}
                      </div>

                      <div className="text-xl font-semibold text-neutral-900">
                        {vino.DESCRIZIONE || "—"}
                      </div>

                      {vino.DENOMINAZIONE && (
                        <div className="text-sm text-neutral-600">
                          {vino.DENOMINAZIONE}
                        </div>
                      )}

                      <div className="mt-1 text-sm text-neutral-600">
                        {(vino.NAZIONE || "—")}
                        {vino.REGIONE ? ` / ${vino.REGIONE}` : ""}
                        {vino.ANNATA ? ` — ${vino.ANNATA}` : ""}
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <div className="text-[11px] font-semibold text-neutral-600 uppercase mb-0.5">
                          Tipologia
                        </div>
                        <div className="text-sm">{vino.TIPOLOGIA || "—"}</div>
                      </div>
                      <div>
                        <div className="text-[11px] font-semibold text-neutral-600 uppercase mb-0.5">
                          Produttore
                        </div>
                        <div className="text-sm">{vino.PRODUTTORE || "—"}</div>
                      </div>
                      <div>
                        <div className="text-[11px] font-semibold text-neutral-600 uppercase mb-0.5">
                          Distributore
                        </div>
                        <div className="text-sm">{vino.DISTRIBUTORE || "—"}</div>
                      </div>
                      <div>
                        <div className="text-[11px] font-semibold text-neutral-600 uppercase mb-0.5">
                          Codice
                        </div>
                        <div className="text-sm font-mono">{vino.CODICE || "—"}</div>
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-4">
                      <div>
                        <div className="text-[11px] font-semibold text-neutral-600 uppercase mb-0.5">
                          Prezzo carta
                        </div>
                        <div className="text-sm">
                          {vino.PREZZO_CARTA != null && vino.PREZZO_CARTA !== ""
                            ? `${Number(vino.PREZZO_CARTA).toFixed(2)} €`
                            : "—"}
                        </div>
                      </div>

                      <div>
                        <div className="text-[11px] font-semibold text-neutral-600 uppercase mb-0.5">
                          Listino
                        </div>
                        <div className="text-sm">
                          {vino.EURO_LISTINO != null && vino.EURO_LISTINO !== ""
                            ? `${Number(vino.EURO_LISTINO).toFixed(2)} €`
                            : "—"}
                        </div>
                      </div>

                      <div>
                        <div className="text-[11px] font-semibold text-neutral-600 uppercase mb-0.5">
                          Sconto
                        </div>
                        <div className="text-sm">
                          {vino.SCONTO != null && vino.SCONTO !== ""
                            ? `${Number(vino.SCONTO).toFixed(2)} %`
                            : "—"}
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <span
                        className={
                          "inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-semibold border " +
                          (vino.CARTA === "SI"
                            ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                            : "bg-neutral-50 text-neutral-500 border-neutral-200")
                        }
                      >
                        CARTA: {vino.CARTA || "NO"}
                      </span>

                      <span
                        className={
                          "inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-semibold border " +
                          (vino.IPRATICO === "SI"
                            ? "bg-sky-50 text-sky-700 border-sky-200"
                            : "bg-neutral-50 text-neutral-500 border-neutral-200")
                        }
                      >
                        iPratico: {vino.IPRATICO || "NO"}
                      </span>

                      {vino.STATO_VENDITA && (
                        <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-semibold border bg-amber-50 text-amber-800 border-amber-200">
                          Stato vendita: {vino.STATO_VENDITA}
                        </span>
                      )}
                    </div>

                    {vino.NOTE && (
                      <div>
                        <div className="text-[11px] font-semibold text-neutral-600 uppercase mb-0.5">
                          Note interne
                        </div>
                        <p className="text-sm text-neutral-800 whitespace-pre-wrap">
                          {vino.NOTE}
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* GIACENZE */}
          <div>
            <div className="border border-neutral-200 rounded-2xl bg-neutral-50 shadow-sm overflow-hidden h-full">
              <div className="px-4 py-3 border-b border-neutral-200 bg-neutral-100">
                <div className="text-sm font-semibold text-neutral-800 tracking-wide uppercase">
                  Giacenze
                </div>
                <div className="text-xs text-neutral-500 mt-1">
                  Frigo + locazioni
                </div>
              </div>

              <div className="p-4">
                {!vino && <div className="text-sm text-neutral-500">—</div>}

                {vino && (
                  <div className="border border-neutral-200 rounded-xl bg-white divide-y divide-neutral-100">
                    <div className="px-3 py-2 flex justify-between text-xs">
                      <span>Frigorifero: {vino.FRIGORIFERO || "—"}</span>
                      <span className="font-semibold">{vino.QTA_FRIGO ?? 0} bt</span>
                    </div>
                    <div className="px-3 py-2 flex justify-between text-xs">
                      <span>Locazione 1: {vino.LOCAZIONE_1 || "—"}</span>
                      <span className="font-semibold">{vino.QTA_LOC1 ?? 0} bt</span>
                    </div>
                    <div className="px-3 py-2 flex justify-between text-xs">
                      <span>Locazione 2: {vino.LOCAZIONE_2 || "—"}</span>
                      <span className="font-semibold">{vino.QTA_LOC2 ?? 0} bt</span>
                    </div>
                    <div className="px-3 py-2 flex justify-between text-xs">
                      <span>Locazione 3: {vino.LOCAZIONE_3 || "—"}</span>
                      <span className="font-semibold">{vino.QTA_LOC3 ?? 0} bt</span>
                    </div>
                    <div className="px-3 py-2 flex justify-between text-xs bg-neutral-50">
                      <span className="font-semibold">Totale magazzino</span>
                      <span className="font-bold text-neutral-900">{tot} bt</span>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* MOVIMENTI (embedded) */}
        <MovimentiCantina vinoId={vinoId} />
      </div>
    </div>
  );
}