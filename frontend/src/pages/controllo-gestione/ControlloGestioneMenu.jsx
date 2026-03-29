// @version: v1.0-controllo-gestione-menu
import React from "react";
import { useNavigate } from "react-router-dom";
import { VersionBadge } from "../../config/versions";

const CARDS = [
  { title: "Dashboard", desc: "Panorama completo: vendite, acquisti, banca, margine", icon: "📊", path: "/controllo-gestione/dashboard" },
  { title: "Scadenzario Uscite", desc: "Tutte le uscite: fatture, spese fisse, scadenze e arretrati", icon: "💸", path: "/controllo-gestione/uscite" },
  { title: "Confronto Periodi", desc: "Confronta due mesi o due anni — vendite, acquisti, margine", icon: "📈", path: "/controllo-gestione/confronto" },
  { title: "Spese Fisse", desc: "Affitti, tasse, stipendi, prestiti, rateizzazioni", icon: "🏠", path: "/controllo-gestione/spese-fisse" },
];

export default function ControlloGestioneMenu() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-neutral-100 p-6">
      <div className="max-w-4xl mx-auto bg-white shadow-2xl rounded-3xl p-10 border border-neutral-200">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-sky-900 font-playfair tracking-wide">
              Controllo di Gestione
            </h1>
            <p className="text-neutral-600 text-sm mt-1">
              Panorama finanziario unificato — vendite, acquisti, banca, scadenze
            </p>
          </div>
          <VersionBadge modulo="controlloGestione" />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {CARDS.map((c) => (
            <div
              key={c.path}
              onClick={() => !c.disabled && navigate(c.path)}
              className={`rounded-2xl border p-5 transition ${
                c.disabled
                  ? "border-neutral-200 bg-neutral-50 cursor-not-allowed opacity-60"
                  : "border-sky-200 bg-sky-50 cursor-pointer hover:shadow-lg hover:-translate-y-0.5"
              }`}
            >
              <div className="text-3xl mb-2">{c.icon}</div>
              <div className={`text-lg font-semibold ${c.disabled ? "text-neutral-500" : "text-sky-900"}`}>
                {c.title} {c.disabled && <span className="text-xs font-normal text-neutral-400 ml-1">In lavorazione</span>}
              </div>
              <div className={`text-xs mt-1 ${c.disabled ? "text-neutral-400" : "text-sky-600"}`}>{c.desc}</div>
            </div>
          ))}
        </div>

        <div className="mt-6 text-center">
          <button
            onClick={() => navigate("/")}
            className="text-sm text-neutral-400 hover:text-neutral-600"
          >
            &larr; Torna alla Home
          </button>
        </div>
      </div>
    </div>
  );
}
