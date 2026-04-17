// @version: v1.0-dashboard-iniziale — placeholder Dashboard Dipendenti (sessione 39)
// KPI essenziali: headcount attivo, scadenze (scaduti + in_scadenza), buste paga mese corrente.
// Shortcut verso sotto-sezioni Anagrafica, Turni, Scadenze.
// Pattern: purple = dipendenti. Stile coerente con DashboardVini ma molto piu' snello.
import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { API_BASE, apiFetch } from "../../config/api";
import DipendentiNav from "./DipendentiNav";

function fmtEuro(val) {
  if (val == null || Number.isNaN(Number(val))) return "—";
  return Number(val).toLocaleString("it-IT", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
}

function meseCorrenteISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function meseCorrenteLabel() {
  return new Date().toLocaleString("it-IT", { month: "long", year: "numeric" });
}

export default function DashboardDipendenti() {
  const navigate = useNavigate();

  const [headcount, setHeadcount] = useState(null);
  const [scadenze, setScadenze] = useState(null); // { scaduti, in_scadenza, validi, totale }
  const [bpMese, setBpMese] = useState(null); // { count, netto }
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    setLoading(true);

    const mese = meseCorrenteISO();

    Promise.allSettled([
      apiFetch(`${API_BASE}/dipendenti/?include_inactive=false`).then((r) => r.json()),
      apiFetch(`${API_BASE}/dipendenti/scadenze`).then((r) => r.json()),
      apiFetch(`${API_BASE}/dipendenti/buste-paga?mese=${mese}`).then((r) => r.json()),
    ])
      .then(([rDip, rScad, rBp]) => {
        if (!alive) return;
        // Headcount
        if (rDip.status === "fulfilled") {
          const data = rDip.value;
          const list = Array.isArray(data) ? data : data.dipendenti || [];
          setHeadcount(list.length);
        }
        // Scadenze riepilogo
        if (rScad.status === "fulfilled" && rScad.value?.riepilogo) {
          setScadenze(rScad.value.riepilogo);
        }
        // Buste paga mese — il BE filtra gia' per mese (YYYY-MM). Usa riepilogo se presente.
        if (rBp.status === "fulfilled") {
          const data = rBp.value;
          const list = Array.isArray(data) ? data : data.buste || data.buste_paga || [];
          const netto =
            data?.riepilogo?.totale_netto ??
            list.reduce((acc, b) => acc + Number(b.netto || 0), 0);
          const count = data?.riepilogo?.totale ?? list.length;
          setBpMese({ count, netto });
        }
      })
      .catch((e) => {
        if (alive) setError(e.message || "Errore caricamento dati");
      })
      .finally(() => {
        if (alive) setLoading(false);
      });

    return () => {
      alive = false;
    };
  }, []);

  const shortcuts = [
    {
      key: "anagrafica",
      label: "Anagrafica",
      icon: "🗂️",
      to: "/dipendenti/anagrafica",
      desc: "Dati personali, ruoli, documenti",
    },
    {
      key: "turni",
      label: "Turni",
      icon: "📅",
      to: "/dipendenti/turni",
      desc: "Foglio settimana SALA/CUCINA",
    },
    {
      key: "buste-paga",
      label: "Buste Paga",
      icon: "📋",
      to: "/dipendenti/buste-paga",
      desc: "Cedolini, netti, contributi",
    },
    {
      key: "scadenze",
      label: "Scadenze",
      icon: "🚨",
      to: "/dipendenti/scadenze",
      desc: "HACCP, sicurezza, visite mediche",
    },
  ];

  return (
    <div className="min-h-screen bg-brand-cream font-sans">
      <DipendentiNav current="dashboard" />

      <div className="max-w-7xl mx-auto p-4 sm:p-6 space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-purple-900 font-playfair">
            Dashboard Dipendenti
          </h1>
          <p className="text-sm text-neutral-600 mt-1">
            Panoramica veloce del personale: headcount, scadenze, buste paga del mese.
          </p>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded-lg text-sm">
            {error}
          </div>
        )}

        {/* KPI cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {/* Headcount */}
          <button
            onClick={() => navigate("/dipendenti/anagrafica")}
            className="bg-white border border-purple-200 rounded-2xl shadow-sm p-5 text-left hover:shadow-md transition"
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs uppercase tracking-wide text-neutral-500">
                Dipendenti attivi
              </span>
              <span className="text-2xl">👥</span>
            </div>
            <div className="text-3xl font-bold text-purple-900">
              {loading ? "…" : headcount ?? "—"}
            </div>
            <div className="text-xs text-neutral-500 mt-1">Clicca per anagrafica</div>
          </button>

          {/* Scadenze */}
          <button
            onClick={() => navigate("/dipendenti/scadenze")}
            className="bg-white border border-amber-200 rounded-2xl shadow-sm p-5 text-left hover:shadow-md transition"
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs uppercase tracking-wide text-neutral-500">
                Scadenze documenti
              </span>
              <span className="text-2xl">🚨</span>
            </div>
            {loading ? (
              <div className="text-3xl font-bold text-neutral-400">…</div>
            ) : scadenze ? (
              <div>
                <div className="flex items-baseline gap-3">
                  <div className="text-3xl font-bold text-red-600">
                    {scadenze.scaduti ?? 0}
                  </div>
                  <div className="text-sm text-neutral-600">scadute</div>
                </div>
                <div className="flex items-baseline gap-3 mt-1">
                  <div className="text-xl font-semibold text-amber-600">
                    {scadenze.in_scadenza ?? 0}
                  </div>
                  <div className="text-sm text-neutral-600">in scadenza</div>
                </div>
              </div>
            ) : (
              <div className="text-3xl font-bold text-neutral-400">—</div>
            )}
          </button>

          {/* Buste paga mese */}
          <button
            onClick={() => navigate("/dipendenti/buste-paga")}
            className="bg-white border border-sky-200 rounded-2xl shadow-sm p-5 text-left hover:shadow-md transition"
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs uppercase tracking-wide text-neutral-500">
                Buste paga {meseCorrenteLabel()}
              </span>
              <span className="text-2xl">📋</span>
            </div>
            {loading ? (
              <div className="text-3xl font-bold text-neutral-400">…</div>
            ) : bpMese ? (
              <div>
                <div className="text-3xl font-bold text-sky-900">
                  {fmtEuro(bpMese.netto)}
                </div>
                <div className="text-xs text-neutral-500 mt-1">
                  {bpMese.count} cedolin{bpMese.count === 1 ? "o" : "i"} importat
                  {bpMese.count === 1 ? "o" : "i"}
                </div>
              </div>
            ) : (
              <div className="text-3xl font-bold text-neutral-400">—</div>
            )}
          </button>
        </div>

        {/* Shortcuts alle sotto-sezioni */}
        <div>
          <h2 className="text-sm font-semibold text-neutral-700 mb-3 uppercase tracking-wide">
            Sezioni
          </h2>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {shortcuts.map((s) => (
              <button
                key={s.key}
                onClick={() => navigate(s.to)}
                className="bg-white border border-neutral-200 rounded-xl p-4 text-left hover:border-purple-300 hover:shadow-sm transition"
              >
                <div className="text-2xl mb-1">{s.icon}</div>
                <div className="text-sm font-semibold text-purple-900">{s.label}</div>
                <div className="text-xs text-neutral-500 mt-0.5 leading-snug">
                  {s.desc}
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Footer nota */}
        <div className="text-center text-xs text-neutral-400 pt-4">
          Dashboard iniziale — KPI e grafici piu' avanzati verranno aggiunti nelle prossime sessioni.
        </div>
      </div>
    </div>
  );
}
