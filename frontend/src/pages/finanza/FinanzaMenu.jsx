// @version: v1.0-finanza-menu
import React from "react";
import { useNavigate } from "react-router-dom";
import { VersionBadge } from "../../config/versions";
import { isAdminRole } from "../../utils/authHelpers";

const CARDS = [
  { title: "Dashboard", desc: "Vista analitica e finanziaria, pivot mensili, categorie", icon: "📊", path: "/finanza/dashboard" },
  { title: "Movimenti", desc: "Lista completa con filtri, doppia classificazione, riconciliazione", icon: "📋", path: "/finanza/movimenti" },
  { title: "Scadenzario", desc: "Rateizzazioni, mutui, prestiti, affitti e spese fisse", icon: "📅", path: "/finanza/scadenzario", admin: true },
  { title: "Categorie & Regole", desc: "Gestisci regole di auto-categorizzazione, collega fornitori", icon: "🏷️", path: "/finanza/categorie", admin: true },
  { title: "Import Excel", desc: "Carica il file movimenti Excel", icon: "📥", path: "/finanza/import", admin: true },
];

export default function FinanzaMenu() {
  const navigate = useNavigate();
  const role = localStorage.getItem("role");

  return (
    <div className="min-h-screen bg-neutral-100 p-6">
      <div className="max-w-4xl mx-auto bg-white shadow-2xl rounded-3xl p-10 border border-neutral-200">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-violet-900 font-playfair tracking-wide">
              Finanza
            </h1>
            <p className="text-neutral-600 text-sm mt-1">
              Gestione finanziaria — vista analitica e finanziaria
            </p>
          </div>
          <VersionBadge modulo="finanza" />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {CARDS.filter((c) => !c.admin || isAdminRole(role)).map((c) => (
            <div
              key={c.path}
              onClick={() => navigate(c.path)}
              className="rounded-2xl border border-violet-200 bg-violet-50 p-5 cursor-pointer hover:shadow-lg hover:-translate-y-0.5 transition"
            >
              <div className="text-3xl mb-2">{c.icon}</div>
              <div className="text-lg font-semibold text-violet-900">{c.title}</div>
              <div className="text-xs text-violet-600 mt-1">{c.desc}</div>
            </div>
          ))}
        </div>

        <div className="mt-6 text-center">
          <button
            onClick={() => navigate("/")}
            className="text-sm text-neutral-400 hover:text-neutral-600"
          >
            ← Torna alla Home
          </button>
        </div>
      </div>
    </div>
  );
}
