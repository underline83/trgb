// @version: v2.4-premium-clean
import React from "react";
import { useNavigate } from "react-router-dom";

export default function Home() {
  console.log(">>> HOME.jsx ATTIVATO");

  const navigate = useNavigate();

  const menu = [
    {
      title: "Gestione Vini",
      subtitle: "Carta, database, vendite, impostazioni",
      icon: "🍷",
      go: () => navigate("/vini"),
      color: "bg-amber-50 border-amber-200 text-amber-900",
    },
    {
      title: "Gestione Ricette",
      subtitle: "Archivio ricette, costi, stampa PDF",
      icon: "📘",
      go: () => navigate("/ricette"),
      color: "bg-blue-50 border-blue-200 text-blue-900",
    },
    {
      title: "Food Cost",
      subtitle: "Analisi costi, materie prime, porzioni",
      icon: "📊",
      go: () => navigate("/foodcost"),
      color: "bg-green-50 border-green-200 text-green-900",
    },
    {
      title: "Prodotti & Magazzino",
      subtitle: "Movimenti, giacenze, valorizzazioni",
      icon: "📦",
      go: () => navigate("/magazzino"),
      color: "bg-neutral-50 border-neutral-300 text-neutral-700",
    },
  ];

  return (
    <div className="min-h-screen bg-neutral-100 p-6">
      <div className="max-w-5xl mx-auto bg-white shadow-2xl rounded-3xl p-12 border border-neutral-200">
        {/* HEADER */}
        <h1 className="text-4xl font-bold text-center mb-4">
          Osteria Tre Gobbi — Sistema Gestionale
        </h1>

        <p className="text-center text-neutral-600 mb-10">
          Seleziona un'area per iniziare.
        </p>

        {/* GRID MENU */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          {menu.map((m) => (
            <div
              key={m.title}
              onClick={m.go}
              className={`
                rounded-2xl border shadow-lg p-6 cursor-pointer
                hover:shadow-xl hover:-translate-y-1 transition
                ${m.color}
              `}
            >
              <div className="text-4xl mb-2">{m.icon}</div>
              <div className="text-xl font-semibold">{m.title}</div>
              <div className="text-sm opacity-80">{m.subtitle}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}