// @version: v1.1-magazzino-vini-dettaglio-fix
// Pagina Magazzino Vini — Dettaglio singolo vino

import React, { useEffect, useState } from "react";
import { useNavigate, useParams, useLocation } from "react-router-dom";
import { API_BASE } from "../../config/api";

export default function MagazzinoViniDettaglio() {
  const navigate = useNavigate();
  const { vinoId } = useParams(); // ✅ coerente con App.jsx
  const location = useLocation();

  const [vino, setVino] = useState(location.state?.vino || null);
  const [loading, setLoading] = useState(!location.state?.vino);
  const [error, setError] = useState("");

  const token = localStorage.getItem("token");

  const handleLogout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("role");
    window.location.reload();
  };

  useEffect(() => {
    // se arrivo già con lo state, non fetchare
    if (vino) return;

    // validazione param
    const idNum = Number(vinoId);
    if (!Number.isInteger(idNum) || idNum <= 0) {
      setError("ID vino non valido.");
      setLoading(false);
      return;
    }

    if (!token) {
      handleLogout();
      return;
    }

    const ctrl = new AbortController();

    const fetchVino = async () => {
      setLoading(true);
      setError("");

      try {
        const resp = await fetch(`${API_BASE}/vini/magazzino/${idNum}`, {
          headers: { Authorization: `Bearer ${token}` },
          signal: ctrl.signal,
        });

        if (resp.status === 401) {
          alert("Sessione scaduta. Effettua di nuovo il login.");
          handleLogout();
          return;
        }

        if (resp.status === 404) {
          setError("Vino non trovato.");
          return;
        }

        if (!resp.ok) {
          throw new Error(`Errore server: ${resp.status}`);
        }

        const data = await resp.json();
        setVino(data);
      } catch (err) {
        if (err.name !== "AbortError") {
          setError(err.message || "Errore di caricamento.");
        }
      } finally {
        setLoading(false);
      }
    };

    fetchVino();

    return () => ctrl.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vinoId, token]);

  const goBack = () => navigate("/vini/magazzino");

  return (
    <div className="min-h-screen bg-neutral-100 p-6 font-sans">
      <div className="max-w-4xl mx-auto bg-white shadow-2xl rounded-3xl p-8 lg:p-10 border border-neutral-200">
        {/* HEADER */}
        <div className="flex flex-col lg:flex-row justify-between gap-4 mb-6">
          <div>
            <h1 className="text-3xl lg:text-4xl font-bold text-amber-900 tracking-wide font-playfair mb-2">
              🍷 Dettaglio Vino Magazzino
            </h1>
            <p className="text-neutral-600">Scheda sintetica del vino in magazzino.</p>
          </div>

          <div className="flex flex-col items-stretch gap-2 sm:flex-row sm:items-center sm:justify-end">
            <button
              type="button"
              onClick={goBack}
              className="px-4 py-2 rounded-xl text-sm font-medium border border-neutral-300 bg-neutral-50 hover:bg-neutral-100 hover:-translate-y-0.5 shadow-sm transition"
            >
              ← Torna alla lista
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

        {loading && <p className="text-sm text-neutral-600">Caricamento dettaglio…</p>}

        {error && !loading && <p className="text-sm text-red-600 font-medium">{error}</p>}

        {!loading && !error && !vino && (
          <p className="text-sm text-neutral-500">Nessun dato disponibile per questo vino.</p>
        )}

        {!loading && !error && vino && (
          <div className="space-y-4 text-sm text-neutral-800">
            <div>
              <div className="text-xs font-semibold text-neutral-600 uppercase tracking-wide">ID Vino</div>
              <div className="mt-0.5 font-mono text-sm text-neutral-800">{vino.id}</div>
            </div>

            <div>
              <div className="text-xs font-semibold text-neutral-600 uppercase tracking-wide">Vino</div>
              <div className="mt-0.5 font-semibold text-neutral-900">{vino.DESCRIZIONE}</div>
              {vino.DENOMINAZIONE && <div className="text-xs text-neutral-600">{vino.DENOMINAZIONE}</div>}
              <div className="mt-1 text-xs text-neutral-600">
                {vino.NAZIONE}
                {vino.REGIONE ? ` / ${vino.REGIONE}` : ""}
                {vino.ANNATA ? ` — ${vino.ANNATA}` : ""}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <div className="text-[11px] font-semibold text-neutral-600 uppercase mb-0.5">Produttore</div>
                <div className="text-sm">{vino.PRODUTTORE || "—"}</div>
              </div>
              <div>
                <div className="text-[11px] font-semibold text-neutral-600 uppercase mb-0.5">Distributore</div>
                <div className="text-sm">{vino.DISTRIBUTORE || "—"}</div>
              </div>
            </div>

            {/* GIACENZE */}
            <div>
              <div className="text-[11px] font-semibold text-neutral-600 uppercase mb-1">Giacenze per locazione</div>
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
                <div className="px-3 py-2 flex justify-between text-xs bg-neutral-50 rounded-b-xl">
                  <span className="font-semibold">Totale magazzino</span>
                  <span className="font-bold text-neutral-900">{vino.QTA_TOTALE ?? 0} bt</span>
                </div>
              </div>
            </div>

            {/* PREZZI */}
            <div className="grid grid-cols-3 gap-3">
              <div>
                <div className="text-[11px] font-semibold text-neutral-600 uppercase mb-0.5">Prezzo carta</div>
                <div className="text-sm">
                  {vino.PREZZO_CARTA != null ? `${Number(vino.PREZZO_CARTA).toFixed(2)} €` : "—"}
                </div>
              </div>
              <div>
                <div className="text-[11px] font-semibold text-neutral-600 uppercase mb-0.5">Listino</div>
                <div className="text-sm">
                  {vino.EURO_LISTINO != null ? `${Number(vino.EURO_LISTINO).toFixed(2)} €` : "—"}
                </div>
              </div>
              <div>
                <div className="text-[11px] font-semibold text-neutral-600 uppercase mb-0.5">Sconto</div>
                <div className="text-sm">{vino.SCONTO != null ? `${Number(vino.SCONTO).toFixed(2)} %` : "—"}</div>
              </div>
            </div>

            {/* FLAG */}
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

            {/* NOTE */}
            {vino.NOTE && (
              <div>
                <div className="text-[11px] font-semibold text-neutral-600 uppercase mb-0.5">Note interne</div>
                <p className="text-sm text-neutral-800 whitespace-pre-wrap">{vino.NOTE}</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}