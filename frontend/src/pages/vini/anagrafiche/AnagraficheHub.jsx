// Modulo: vini
// src/pages/vini/anagrafiche/AnagraficheHub.jsx
//
// M2.5-arch (2026-05-16) — pagina dedicata alla gestione delle anagrafiche del
// modulo Vini. Promuove la sotto-pagina "🧪 Anagrafiche (beta)" che viveva
// dentro Impostazioni Vini a tab di prima fascia nella ViniNav.
//
// Razionale (concordato con Marco):
//   - Le anagrafiche (produttori, distributori, denominazioni, vitigni, vini
//     madre) NON sono impostazioni: sono entità master che meritano una loro
//     casa, con sotto-tab e flussi dedicati.
//   - Il termine "Anagrafiche" è coerente con il backend (/vini/anagrafiche/*),
//     i file modello (vini_anagrafiche_db.py) e la doc del refactor V.6+V.7+V.8.
//
// Strategia di delivery: in questa sessione monto qui il pannello esistente
// AnagraficheVini.jsx (senza più il prefisso "🧪 beta") per evitare regressioni.
// Le sessioni successive (M2.5.1 Produttori, M2.5.2 Distributori, ...)
// rilavoreranno una sotto-tab alla volta, sempre dentro questo hub.

import React from "react";
import ViniNav from "../ViniNav";
import AnagraficheVini from "../AnagraficheVini";

export default function AnagraficheHub() {
  return (
    <div className="min-h-screen bg-brand-cream font-sans">
      <ViniNav current="anagrafiche" />

      <div className="max-w-7xl mx-auto px-3 sm:px-4 py-4">
        {/* Il pannello interno fornisce il proprio header + sotto-tab. Lo lasciamo
            gestire tutto qui dentro: cambieremo i singoli sub-pannelli nelle
            sessioni successive (uno alla volta, come da piano operativo). */}
        <AnagraficheVini />
      </div>
    </div>
  );
}
