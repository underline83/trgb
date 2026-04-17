// Nav del modulo Cucina — riuso pattern DipendentiNav
// Mostra bottoni Home/Agenda/Task/Template con evidenza voce corrente.

import React from "react";
import { Link, useNavigate } from "react-router-dom";
import { VersionBadge } from "../../config/versions";

const ITEMS = [
  { key: "home",      label: "Home",      to: "/cucina",                   icon: "🍳" },
  { key: "agenda",    label: "Agenda",    to: "/cucina/agenda",            icon: "📋" },
  { key: "settimana", label: "Settimana", to: "/cucina/agenda/settimana",  icon: "🗓️" },
  { key: "tasks",     label: "Task",      to: "/cucina/tasks",             icon: "✅" },
  { key: "templates", label: "Template",  to: "/cucina/templates",         icon: "🧩", adminOnly: true },
];

export default function CucinaNav({ current = "home" }) {
  const navigate = useNavigate();
  const role = localStorage.getItem("role") || "";
  const isAdmin = role === "admin" || role === "superadmin" || role === "chef";

  const items = ITEMS.filter(i => !i.adminOnly || isAdmin);

  return (
    <div className="bg-white border-b border-red-200 sticky top-0 z-10">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-2 flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <button
            onClick={() => navigate("/")}
            className="text-neutral-400 hover:text-neutral-700 text-xl"
            title="Torna alla Home principale"
          >
            ←
          </button>
          <Link to="/cucina" className="flex items-center gap-2">
            <span className="text-2xl">🍳</span>
            <span className="font-playfair font-bold text-lg text-red-900">Cucina</span>
            <VersionBadge modulo="cucina" />
          </Link>
        </div>
        <nav className="flex gap-1 flex-wrap">
          {items.map(i => {
            const active = i.key === current;
            return (
              <Link
                key={i.key}
                to={i.to}
                className={
                  "px-3 py-2 rounded-lg text-sm font-medium transition min-h-[44px] flex items-center gap-1.5 " +
                  (active
                    ? "bg-red-100 text-red-900 border border-red-300"
                    : "text-neutral-700 hover:bg-red-50 border border-transparent")
                }
              >
                <span>{i.icon}</span>
                <span>{i.label}</span>
              </Link>
            );
          })}
        </nav>
      </div>
    </div>
  );
}
