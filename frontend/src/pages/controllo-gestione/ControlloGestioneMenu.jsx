// @version: v1.0-controllo-gestione-menu
import React from "react";
import { useNavigate } from "react-router-dom";
import { VersionBadge } from "../../config/versions";

const CARDS = [
  { title: "Dashboard", desc: "Panorama completo: vendite, acquisti, banca, scadenze, margine", icon: "📊", path: "/controllo-gestione/dashboard" },
  { title: "Confronto Periodi", desc: "Confronta due mesi o due anni — vendite, acquisti, margine", icon: "📈", path: "/controllo-gestione/confronto" },
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
              onClick={() => navigate(c.path)}
              className="rounded-2xl border border-sky-200 bg-sky-50 p-5 cursor-pointer hover:shadow-lg hover:-translate-y-0.5 transition"
            >
              <div className="text-3xl mb-2">{c.icon}</div>
              <div className="text-lg font-semibold text-sky-900">{c.title}</div>
              <div className="text-xs text-sky-600 mt-1">{c.desc}</div>
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
