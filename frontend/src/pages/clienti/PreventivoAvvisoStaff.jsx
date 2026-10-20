// @version: v1.0 — evento confermato: esito (prenotazione, campanello) + messaggio per i gruppi WhatsApp di sala e cucina (2026-10-20)
// Modulo: clienti (sub-modulo preventivi)
//
// Arriva dopo POST /preventivi/{id}/conferma. WhatsApp non lascia scrivere in un
// gruppo da un link: «Condividi su WhatsApp» apre la condivisione col solo testo
// e in WhatsApp si spuntano i due gruppi (sala e cucina) insieme. Dove la
// condivisione non c'è (Mac) si apre WhatsApp col testo e si sceglie la chat.
import React, { useState } from "react";
import { Btn } from "../../components/ui";

export default function PreventivoAvvisoStaff({ esito, onClose, showToast }) {
  const [testo, setTesto] = useState(esito?.messaggio_staff || "");
  const pren = esito?.prenotazione || {};
  const puoCondividere = typeof navigator !== "undefined" && !!navigator.share;

  const condividi = () => {
    if (puoCondividere) {
      navigator.share({ text: testo })
        .then(() => showToast("📣 Messaggio condiviso"))
        .catch((e) => { if (e?.name !== "AbortError") showToast("Condivisione non riuscita: copia il testo", true); });
    } else {
      window.open(`https://wa.me/?text=${encodeURIComponent(testo)}`, "_blank", "noopener");
    }
  };

  const copia = async () => {
    try { await navigator.clipboard.writeText(testo); showToast("📋 Testo copiato"); }
    catch { showToast("Copia non riuscita", true); }
  };

  const esitoPren = pren.azione === "creata"
    ? "📅 Prenotazione creata col menù scelto"
    : pren.azione === "aggiornata"
      ? "📅 Menù scritto sulla prenotazione (lo vede la sala nel Planning)"
      : "📅 Nessuna prenotazione aggiornata";

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg p-5 space-y-4 max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-base font-semibold text-neutral-900">✅ Evento confermato</h3>
            <p className="text-xs text-neutral-500">Ora avvisa i gruppi WhatsApp di sala e cucina</p>
          </div>
          <button onClick={onClose} className="text-neutral-400 hover:text-neutral-700 text-xl leading-none px-2 min-h-[44px]">✕</button>
        </div>

        <ul className="text-xs space-y-1">
          <li className={pren.azione === "nessuna" ? "text-amber-700" : "text-emerald-700"}>{esitoPren}</li>
          {esito?.notifiche > 0 && <li className="text-emerald-700">🔔 Avviso nel campanello di sala e cucina</li>}
          {(pren.avvisi || []).map((a, i) => <li key={i} className="text-amber-700">⚠️ {a}</li>)}
        </ul>

        <label className="block flex-1 overflow-y-auto">
          <span className="text-xs text-neutral-500">Messaggio per i gruppi (modificabile)</span>
          <textarea rows={11} value={testo} onChange={(e) => setTesto(e.target.value)}
            className="mt-1 w-full border border-neutral-300 rounded-lg px-3 py-2 text-sm font-sans" />
        </label>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <Btn variant="chip" tone="emerald" size="lg" onClick={condividi} className="w-full">
            📣 {puoCondividere ? "Condividi su WhatsApp" : "Apri WhatsApp"}
          </Btn>
          <Btn variant="ghost" size="lg" onClick={copia} className="w-full">📋 Copia testo</Btn>
        </div>
        <p className="text-xs text-neutral-500">
          {puoCondividere
            ? "Scegli WhatsApp, poi spunta il gruppo di sala e quello di cucina e invia una volta sola."
            : "WhatsApp si apre col testo: scegli il gruppo di sala, poi ripeti per quello di cucina."}
        </p>
      </div>
    </div>
  );
}
