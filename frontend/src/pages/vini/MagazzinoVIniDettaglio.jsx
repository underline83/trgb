// FILE: frontend/src/pages/vini/MagazzinoViniDettaglio.jsx
// @version: v1.1-dettaglio-con-movimenti
// Pagina Dettaglio Vino Magazzino — scheda + movimenti (component separato)

import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { API_BASE } from "../../config/api";
import MagazzinoSubMenu from "../../components/vini/MagazzinoSubMenu";
import MovimentiTab from "../../components/vini/MovimentiTab";

export default function MagazzinoViniDettaglio() {
  const navigate = useNavigate();
  const { id } = useParams();

  const vinoId = useMemo(() => Number(id), [id]);

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
    if (!token) {
      handleLogout();
      return;
    }

    if (!Number.isInteger(vinoId) || vinoId <= 0) {
      navigate("/vini/magazzino", { replace: true });
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
      setError(e?.message || "Errore di caricamento dettaglio.");
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

  return (
    <div className="min-h-screen bg-neutral-100 p-6 font-sans">
      <div className="max-w-6xl mx-auto bg-white shadow-2xl rounded-3xl p-8 lg:p-10 border border-neutral-200">
        {/* HEADER */}
        <div className="flex flex-col lg:flex-row justify-between gap-4 mb-6">
          <div>
            <h1 className="text-3xl lg:text-4xl font-bold text-amber-900 tracking-wide font-playfair mb-2">
              🏷️ Dettaglio Vino — Magazzino
            </h1>
            <p className="text-neutral-600">
              Scheda vino + giacenze + movimenti cantina.
            </p>
          </div>

          <div className="flex flex-col items-stretch gap-2 sm:flex-row sm:items-center sm:justify-end">
            <button
              type="button"
              onClick={() => navigate("/vini/magazzino")}
              className="
                px-4 py-2 rounded-xl text-sm font-medium
                border border-neutral-300 bg-neutral-50
                hover:bg-neutral-100 hover:-translate-y-0.5
                shadow-sm transition
              "
            >
              ← Torna a Magazzino
            </button>

            <button
              type="button"
              onClick={fetchVino}
              disabled={loading}
              className={`
                px-4 py-2 rounded-xl text-sm font-semibold shadow-sm transition
                ${
                  loading
                    ? "bg-gray-300 text-white cursor-not-allowed"
                    : "bg-amber-700 text-white hover:bg-amber-800"
                }
              `}
            >
              {loading ? "Aggiorno…" : "⟳ Aggiorna scheda"}
            </button>

            <button
              type="button"
              onClick={handleLogout}
              className="
                px-4 py-2 rounded-xl text-sm font-medium
                border border-red-200 bg-red-50 text-red-700
                hover:bg-red-100 hover:-translate-y-0.5
                shadow-sm transition
              "
            >
              Logout
            </button>
          </div>
        </div>

        {/* SUBMENU (coerenza struttura finale) */}
        <MagazzinoSubMenu />

        {error && (
          <div className="mb-6 text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl p-3">
            {error}
          </div>
        )}

        {!vino && !loading && !error && (
          <div className="text-neutral-500">Nessun dato vino.</div>
        )}

        {vino && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* COLONNA SCHEDA */}
            <div className="lg:col-span-1">
              <div className="border border-neutral-200 rounded-2xl bg-neutral-50 shadow-sm overflow-hidden">
                <div className="px-4 py-3 border-b border-neutral-200 bg-neutral-100">
                  <h2 className="text-sm font-semibold text-neutral-800 tracking-wide uppercase">
                    Scheda vino
                  </h2>
                  <p className="text-xs text-neutral-500 mt-1">
                    ID: <span className="font-mono">{vino.id}</span>
                    {vino.id_excel ? (
                      <>
                        {" "}
                        — Excel:{" "}
                        <span className="font-mono">{vino.id_excel}</span>
                      </>
                    ) : null}
                  </p>
                </div>

                <div className="p-4 space-y-4">
                  <div>
                    <div className="text-xs font-semibold text-neutral-600 uppercase tracking-wide">
                      Vino
                    </div>
                    <div className="mt-1 text-lg font-semibold text-neutral-900">
                      {vino.DESCRIZIONE}
                    </div>
                    {vino.DENOMINAZIONE && (
                      <div className="text-sm text-neutral-600">
                        {vino.DENOMINAZIONE}
                      </div>
                    )}
                    <div className="mt-1 text-sm text-neutral-700">
                      {vino.NAZIONE}
                      {vino.REGIONE ? ` / ${vino.REGIONE}` : ""}
                      {vino.ANNATA ? ` — ${vino.ANNATA}` : ""}
                    </div>
                    {vino.CODICE && (
                      <div className="text-xs text-neutral-500 mt-1">
                        Cod: <span className="font-mono">{vino.CODICE}</span>
                      </div>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-3">
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
                        Stato vendita
                      </div>
                      <div className="text-sm">{vino.STATO_VENDITA || "—"}</div>
                    </div>
                  </div>

                  {/* GIACENZE */}
                  <div>
                    <div className="text-[11px] font-semibold text-neutral-600 uppercase mb-1">
                      Giacenze per locazione
                    </div>

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
                        <span className="font-bold text-neutral-900">
                          {tot || 0} bt
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* PREZZI */}
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <div className="text-[11px] font-semibold text-neutral-600 uppercase mb-0.5">
                        Carta €
                      </div>
                      <div className="text-sm">
                        {vino.PREZZO_CARTA != null && vino.PREZZO_CARTA !== ""
                          ? `${Number(vino.PREZZO_CARTA).toFixed(2)}`
                          : "—"}
                      </div>
                    </div>

                    <div>
                      <div className="text-[11px] font-semibold text-neutral-600 uppercase mb-0.5">
                        Listino €
                      </div>
                      <div className="text-sm">
                        {vino.EURO_LISTINO != null && vino.EURO_LISTINO !== ""
                          ? `${Number(vino.EURO_LISTINO).toFixed(2)}`
                          : "—"}
                      </div>
                    </div>

                    <div>
                      <div className="text-[11px] font-semibold text-neutral-600 uppercase mb-0.5">
                        Sconto %
                      </div>
                      <div className="text-sm">
                        {vino.SCONTO != null && vino.SCONTO !== ""
                          ? `${Number(vino.SCONTO).toFixed(2)}`
                          : "—"}
                      </div>
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
              </div>
            </div>

            {/* COLONNA MOVIMENTI */}
            <div className="lg:col-span-2 space-y-6">
              <MovimentiTab vinoId={vinoId} onAfterChange={fetchVino} />

              {/* spazio per future cards: vendite calice/bottiglia, alert, ecc. */}
              <div className="border border-neutral-200 rounded-2xl bg-neutral-50 p-4">
                <div className="text-sm font-semibold text-neutral-800">
                  Prossimi step (UI)
                </div>
                <ul className="mt-2 text-sm text-neutral-600 list-disc pl-5 space-y-1">
                  <li>Movimenti: scelta “locazione” + aggiornamento quantità per locazione.</li>
                  <li>Vendita al calice: log dedicato + impatto inventario.</li>
                  <li>Rottura bottiglia: preset rapido + nota obbligatoria.</li>
                  <li>Storico filtrabile (tipo/data/utente).</li>
                </ul>
              </div>
            </div>
          </div>
        )}

        {loading && (
          <div className="mt-6 text-sm text-neutral-600">
            Caricamento dettaglio…
          </div>
        )}
      </div>
    </div>
  );
}