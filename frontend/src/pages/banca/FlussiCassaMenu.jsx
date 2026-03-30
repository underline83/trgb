// src/pages/banca/FlussiCassaMenu.jsx
// @version: v1.1 — Menu Flussi di Cassa con permessi granulari
import React from "react";
import { useNavigate, Link } from "react-router-dom";
import { VersionBadge } from "../../config/versions";
import useModuleAccess from "../../hooks/useModuleAccess";

const CARDS = [
  { to: "/flussi-cassa/dashboard", sub: "dashboard", icon: "📊", title: "Dashboard",
    desc: "Panoramica saldo, entrate/uscite, andamento.",
    bg: "bg-emerald-50 border-emerald-200 text-emerald-900" },
  { to: "/flussi-cassa/cc", sub: "cc", icon: "🏦", title: "Conti Correnti",
    desc: "Movimenti bancari, categorie, riconciliazione.",
    bg: "bg-blue-50 border-blue-200 text-blue-900" },
  { to: "/flussi-cassa/cc/crossref", sub: "cc", icon: "🔗", title: "Riconciliazione Spese",
    desc: "Collega movimenti bancari a fatture, affitti, tasse e spese fisse.",
    bg: "bg-indigo-50 border-indigo-200 text-indigo-900" },
  { to: "/flussi-cassa/carta", sub: "carta", icon: "💳", title: "Carta di Credito",
    desc: "Estratto conto carta, riconciliazione spese.",
    bg: "bg-violet-50 border-violet-200 text-violet-900" },
  { to: "/flussi-cassa/contanti", sub: "contanti", icon: "💰", title: "Contanti",
    desc: "Contanti da versare, pre-conti, spese turno e varie.",
    bg: "bg-amber-50 border-amber-200 text-amber-900" },
  { to: "/flussi-cassa/mance", sub: "mance", icon: "🎁", title: "Mance",
    desc: "Mance registrate dai turni — per distribuzione al personale.",
    bg: "bg-rose-50 border-rose-200 text-rose-900" },
  { to: "/flussi-cassa/impostazioni", sub: "impostazioni", icon: "⚙️", title: "Impostazioni",
    desc: "Import CSV, categorie bancarie, configurazione carte.",
    bg: "bg-neutral-50 border-neutral-300 text-neutral-800" },
];

export default function FlussiCassaMenu() {
  const navigate = useNavigate();
  const { canAccessSub, loading } = useModuleAccess();

  const visible = CARDS.filter(c => canAccessSub("flussi-cassa", c.sub));

  return (
    <div className="min-h-screen bg-neutral-100 p-6 font-sans">
      <div className="max-w-5xl mx-auto bg-white shadow-2xl rounded-3xl p-12 border border-neutral-200">
        <div className="flex flex-col sm:flex-row justify-between gap-4 mb-8">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <h1 className="text-4xl font-bold text-emerald-900 tracking-wide font-playfair">
                Flussi di Cassa
              </h1>
              <VersionBadge modulo="flussiCassa" />
            </div>
            <p className="text-neutral-600 mb-2">
              Conti correnti, carta di credito, contanti e mance — tutto in un unico punto.
            </p>
          </div>
          <div className="flex justify-center sm:justify-end">
            <button onClick={() => navigate("/")}
              className="px-4 py-2 rounded-xl text-sm font-medium border border-neutral-300 bg-neutral-50 hover:bg-neutral-100 shadow-sm transition">
              ← Torna alla Home
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {visible.map(c => (
            <Link key={c.to} to={c.to}
              className={`${c.bg} border rounded-2xl p-8 shadow hover:shadow-xl hover:-translate-y-1 transition transform text-center`}>
              <div className="text-5xl mb-3">{c.icon}</div>
              <h2 className="text-xl font-semibold font-playfair">{c.title}</h2>
              <p className="text-neutral-700 text-sm mt-1">{c.desc}</p>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
