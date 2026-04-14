import React from "react";
import { useNavigate } from "react-router-dom";
import DipendentiNav from "./DipendentiNav";

export default function DipendentiCosti() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-brand-cream">
      <DipendentiNav current="costi" />
      <div className="p-6">
      <div className="max-w-5xl mx-auto bg-white shadow-2xl rounded-3xl p-12 border border-neutral-200">
        {/* HEADER */}
        <div className="flex flex-col sm:flex-row justify-between gap-4 mb-8">
          <div>
            <h1 className="text-3xl sm:text-4xl font-bold text-purple-900 tracking-wide font-playfair">
              {"\uD83D\uDCB0"} Costi Dipendenti
            </h1>
            <p className="text-neutral-600 mt-1">
              Modulo per analizzare il costo del personale per mese, ruolo e dipendente.
            </p>
          </div>
        </div>

        {/* CONTENUTO PRINCIPALE (placeholder) */}
        <div className="bg-purple-50 border border-purple-200 rounded-2xl p-6 text-center">
          <h2 className="text-xl font-semibold text-purple-900 mb-2">
            Modulo Costi Dipendenti — in preparazione
          </h2>
          <p className="text-purple-900/80 text-sm mb-3">
            Qui verranno mostrati:
          </p>
          <ul className="text-purple-900/90 text-sm space-y-1 text-left max-w-md mx-auto">
            <li>{"\u2022"} Costo orario / giornaliero / mensile per dipendente</li>
            <li>{"\u2022"} Totale costo personale per periodo selezionato</li>
            <li>{"\u2022"} Breakdown per ruolo (sala, cucina, bar, ecc.)</li>
            <li>{"\u2022"} Integrazione futura con turni e stipendio teorico</li>
          </ul>
        </div>
      </div>
      </div>
    </div>
  );
}
