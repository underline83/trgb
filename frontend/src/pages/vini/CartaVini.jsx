// @version: v4.0-info-pane — sessione 58 fase 2 iter 6 (2026-04-25)
// Pannello informativo per la sezione "Vini" della carta.
//
// Le esport (PDF, Word, anteprima) e l'iframe live sono ora gestiti dalla
// shell `CartaBevande` a livello globale (carta intera = vini + bevande).
// Qui resta solo l'informazione che la sezione vini e' dinamica e si edita
// in Cantina, con un link rapido per andarci.

import React from "react";
import { useNavigate } from "react-router-dom";
import { Btn } from "../../components/ui";

export default function CartaVini() {
  const navigate = useNavigate();

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-2xl font-bold text-amber-900 tracking-wide font-playfair mb-1">
          🍷 Sezione Vini
        </h2>
        <p className="text-neutral-600 text-sm">
          Le voci vini della carta sono <strong>dinamiche</strong>: arrivano direttamente dal magazzino Cantina.
          Per modificare prezzi, annate, descrizioni, vai alla Cantina e aggiorna la scheda del vino —
          l'anteprima a destra si rinfresca automaticamente.
        </p>
      </div>

      <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
        <div className="font-semibold mb-1">Cosa entra in carta</div>
        <ul className="list-disc list-inside space-y-1 text-amber-800">
          <li>Tutti i vini con flag <code className="px-1 rounded bg-amber-100">CARTA = SI</code></li>
          <li>Sezione "Al calice" automatica per i vini con <code className="px-1 rounded bg-amber-100">VENDITA_CALICE = SI</code> o <em>bottiglia in mescita</em></li>
          <li>Ordinati per Tipologia → Nazione → Regione → Produttore (configurabile in Impostazioni Vini)</li>
        </ul>
      </div>

      <div className="flex flex-wrap gap-2">
        <Btn variant="primary" size="md" type="button" onClick={() => navigate("/vini/magazzino")}>
          🍷 Vai alla Cantina
        </Btn>
        <Btn variant="secondary" size="md" type="button" onClick={() => navigate("/vini/carta-staff")}>
          🥂 Vista sommelier
        </Btn>
        <Btn variant="secondary" size="md" type="button" onClick={() => navigate("/vini/settings")}>
          ⚙️ Ordinamento
        </Btn>
      </div>
    </div>
  );
}
