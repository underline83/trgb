// @version: v1.0-impostazioni-hub (hub impostazioni modulo Dipendenti: reparti + future configurazioni)
import React from "react";
import { useNavigate } from "react-router-dom";

const SEZIONI = [
  {
    to: "/dipendenti/reparti",
    icon: "\uD83C\uDFE2",  // 🏢
    title: "Reparti",
    subtitle: "SALA, CUCINA... orari standard, pause staff, colore e icona",
    color: "bg-teal-50 border-teal-200 text-teal-900",
    ready: true,
  },
  // Placeholder per future impostazioni (template turni centralizzati, soglie CCNL personalizzate, ecc.)
  {
    icon: "\u26A1",  // ⚡
    title: "Soglie CCNL",
    subtitle: "Personalizza soglie 40h/48h per semaforo ore (prossimamente)",
    color: "bg-amber-50 border-amber-200 text-amber-900",
    ready: false,
  },
  {
    icon: "\uD83D\uDCE8",  // 📨
    title: "Template WhatsApp",
    subtitle: "Modifica il testo di default per l'invio turni via WA (prossimamente)",
    color: "bg-emerald-50 border-emerald-200 text-emerald-900",
    ready: false,
  },
];

export default function DipendentiImpostazioni() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-brand-cream p-6">
      <div className="max-w-4xl mx-auto bg-white shadow-2xl rounded-3xl p-12 border border-neutral-200">
        {/* HEADER */}
        <div className="flex items-center justify-between mb-2">
          <h1 className="text-4xl font-bold text-center flex-1">
            <span className="mr-2">{"\u2699\uFE0F"}</span> Impostazioni Dipendenti
          </h1>
        </div>
        <p className="text-center text-neutral-600 mb-6">
          Configurazioni del modulo: reparti, soglie, template.
        </p>
        <div className="text-center mb-10">
          <button onClick={() => navigate("/dipendenti")}
            className="text-sm text-neutral-500 hover:text-neutral-700 transition">
            {"\u2190"} Torna al menu Dipendenti
          </button>
        </div>

        {/* GRID tile */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          {SEZIONI.map((s) => {
            if (!s.ready) {
              return (
                <div key={s.title}
                  className={`rounded-2xl border shadow-lg p-6 opacity-50 cursor-default ${s.color}`}>
                  <div className="flex justify-between items-start mb-2">
                    <div className="text-4xl">{s.icon}</div>
                    <span className="inline-flex items-center text-[10px] bg-neutral-200 text-neutral-500 px-2 py-0.5 rounded-full font-medium">
                      Prossimamente
                    </span>
                  </div>
                  <div className="text-xl font-semibold">{s.title}</div>
                  <div className="text-sm opacity-80">{s.subtitle}</div>
                </div>
              );
            }
            return (
              <div key={s.title} onClick={() => navigate(s.to)}
                className={`rounded-2xl border shadow-lg p-6 cursor-pointer hover:shadow-xl hover:-translate-y-1 transition ${s.color}`}>
                <div className="flex justify-between items-start mb-2">
                  <div className="text-4xl">{s.icon}</div>
                </div>
                <div className="text-xl font-semibold">{s.title}</div>
                <div className="text-sm opacity-80">{s.subtitle}</div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
