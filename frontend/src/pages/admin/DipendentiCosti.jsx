import React from "react";
import { useNavigate } from "react-router-dom";

export default function DipendentiCosti() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-neutral-100 p-6 font-sans">
      <div className="max-w-5xl mx-auto bg-white shadow-2xl rounded-3xl p-10 border border-neutral-200">
        {/* HEADER */}
        <div className="flex flex-col sm:flex-row justify-between gap-4 mb-8">
          <div>
            <h1 className="text-3xl sm:text-4xl font-bold text-amber-900 tracking-wide font-playfair">
              💰 Costi Dipendenti
            </h1>
            <p className="text-neutral-600 mt-1">
              Modulo per analizzare il costo del personale per mese, ruolo e dipendente.
            </p>
          </div>

          <div className="flex flex-col items-end gap-2">
            <button
              onClick={() => navigate("/admin/dipendenti")}
              className="px-4 py-2 rounded-xl text-sm border border-neutral-300 bg-neutral-50 hover:bg-neutral-100 hover:-translate-y-0.5 shadow-sm transition"
            >
              ← Moduli Dipendenti
            </button>
            <button
              onClick={() => navigate("/admin")}
              className="px-4 py-2 rounded-xl text-xs border border-neutral-200 text-neutral-600 bg-white hover:bg-neutral-50 transition"
            >
              ← Torna all'Amministrazione
            </button>
          </div>
        </div>

        {/* FILTRI (placeholder) */}
        <div className="bg-neutral-50 border border-neutral-200 rounded-2xl p-4 mb-6">
          <h2 className="text-lg font-semibold text-neutral-800 mb-3">
            Filtri principali
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm">
            <div>
              <label className="block text-neutral-600 mb-1">Periodo</label>
              <select className="w-full border border-neutral-300 rounded-xl px-3 py-2 bg-white">
                <option>Mensile</option>
                <option>Settimanale</option>
                <option>Annuale</option>
              </select>
            </div>
            <div>
              <label className="block text-neutral-600 mb-1">Mese</label>
              <input
                type="month"
                className="w-full border border-neutral-300 rounded-xl px-3 py-2 bg-white"
              />
            </div>
            <div>
              <label className="block text-neutral-600 mb-1">Ruolo</label>
              <select className="w-full border border-neutral-300 rounded-xl px-3 py-2 bg-white">
                <option>Tutti i ruoli</option>
                {/* In futuro popoliamo da backend */}
              </select>
            </div>
          </div>
        </div>

        {/* CONTENUTO PRINCIPALE (placeholder) */}
        <div className="bg-rose-50 border border-rose-200 rounded-2xl p-6 text-center">
          <h2 className="text-xl font-semibold text-rose-900 mb-2">
            Modulo Costi Dipendenti — in preparazione
          </h2>
          <p className="text-rose-900/80 text-sm mb-3">
            Qui verranno mostrati:
          </p>
          <ul className="text-rose-900/90 text-sm space-y-1 text-left max-w-md mx-auto">
            <li>• Costo orario / giornaliero / mensile per dipendente</li>
            <li>• Totale costo personale per periodo selezionato</li>
            <li>• Breakdown per ruolo (sala, cucina, bar, ecc.)</li>
            <li>• Integrazione futura con turni e stipendio teorico</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
