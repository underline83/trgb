// @version: v1.0 — le quattro caselle dello stato (Prenotato · Confermato · Seduto · Libero), le stesse in Servizio e in Elenco (2026-11-26)
// Modulo: prenotazioni
// Il giro di una prenotazione in sala, come lo dice Marco: prenota, conferma, si siede, va via.
// La casella accesa dice dov'è; si tocca quella dove deve andare, avanti o indietro (anche di più passi).
// «Confermato» non è uno stato: è il segno riconfermata_at sulla prenotata (mig 250).
import React, { useState } from "react";
import { API_BASE, apiFetch } from "../../../config/api";

// I colori accesi sono quelli degli stati (regola colori del modulo: i colori di stato si usano solo per gli stati)
export const PASSI = [
  { nome: "Prenotato", acceso: "bg-indigo-700" },
  { nome: "Confermato", acceso: "bg-teal-700" },
  { nome: "Seduto", acceso: "bg-emerald-700" },
  { nome: "Libero", acceso: "bg-neutral-700" },
];
export const PASSI_STATI = ["RECORDED", "ARRIVED", "SEATED", "BILL", "PARTIALLY_ARRIVED", "LEFT"];
// I cambi che le caselle fanno già: negli elenchi «altre azioni» non si ripetono
export const DEL_GIRO = ["RECORDED", "SEATED", "LEFT"];
export const fuoriGiro = (stato, transizioni) => (transizioni || []).filter((a) => !DEL_GIRO.includes(a) || !PASSI_STATI.includes(stato));

// In che casella si trova (−1 = fuori dal giro: richiesta, opzione, lista d'attesa, cancellata…)
export const passoDi = (p) => {
  if (p.stato === "RECORDED") return p.riconfermata_at ? 1 : 0;
  if (p.stato === "ARRIVED") return 1;
  if (["SEATED", "PARTIALLY_ARRIVED"].includes(p.stato)) return 2;
  if (["LEFT", "BILL"].includes(p.stato)) return 3;   // «Al conto» non si usa: se arriva, vale come libero
  return -1;
};

// Porta la prenotazione alla casella k facendo in fila i cambi che servono (es. da «Libero» a «Prenotato»:
// prima seduto, poi prenotato). Lancia un errore col messaggio del server se un passo non riesce.
export async function vaiAlPasso(p, k) {
  const chiama = async (percorso, corpo) => {
    const r = await apiFetch(`${API_BASE}/prenotazioni/${p.id}/${percorso}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(corpo) });
    if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.detail || "Non riuscito"); }
  };
  const cambia = (stato) => chiama("stato", { stato });
  let st = p.stato;
  if (k <= 1) {                                   // Prenotato o Confermato: lo stato è «prenotata»
    if (["LEFT", "BILL"].includes(st)) { await cambia("SEATED"); st = "SEATED"; }
    if (st !== "RECORDED") await cambia("RECORDED");
    await chiama("riconfermata", { valore: k === 1 });
  } else if (k === 2) {                           // Seduto
    if (st !== "SEATED") await cambia("SEATED");
  } else {                                        // Libero
    if (!["SEATED", "BILL"].includes(st)) await cambia("SEATED");
    await cambia("LEFT");
  }
}

// onFatto(nomeDelPasso) dopo un cambio riuscito, onErrore(messaggio) se no: in tutti e due i casi chi lo usa ricarica.
export default function GiroStato({ p, onFatto, onErrore, className = "" }) {
  const [lavoro, setLavoro] = useState(false);
  const a = passoDi(p);
  if (a < 0) return null;
  const tocca = async (e, k) => {
    e.stopPropagation();
    setLavoro(true);
    try { await vaiAlPasso(p, k); onFatto && onFatto(PASSI[k].nome); }
    catch (err) { onErrore && onErrore(err.message || "Errore di connessione"); }
    setLavoro(false);
  };
  return (
    <div className={`grid grid-cols-4 rounded-lg border border-neutral-300 overflow-hidden bg-white ${className}`} role="group" aria-label="Stato della prenotazione">
      {PASSI.map((s, k) => (
        <button key={s.nome} type="button" disabled={lavoro || k === a} onClick={(e) => tocca(e, k)} aria-pressed={k === a}
          title={k === a ? `Adesso: ${s.nome}` : k < a ? `Torna a «${s.nome}»` : `Passa a «${s.nome}»`}
          className={`min-h-[44px] px-1 text-[13px] leading-tight border-l first:border-l-0 border-neutral-300 transition ${
            k === a ? `${s.acceso} text-white font-bold` : k < a ? "bg-neutral-100 text-neutral-500" : "bg-white text-neutral-800 hover:bg-neutral-50"}`}>
          {k < a ? "✓ " : ""}{s.nome}
        </button>
      ))}
    </div>
  );
}
