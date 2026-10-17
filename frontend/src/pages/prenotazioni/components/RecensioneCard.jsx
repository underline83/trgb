// @version: v1.0 — recensione TheFork con voti, collegamenti e risposta (2026-10-17)
// Modulo: prenotazioni — usata in Prenotazioni › Recensioni e nella scheda cliente
import React, { useState } from "react";
import { API_BASE, apiFetch } from "../../../config/api";

const PREZZO = { VERY_CHEAP: "molto economico", CHEAP: "economico", AVERAGE: "nella media", EXPENSIVE: "caro", VERY_EXPENSIVE: "molto caro" };
const ATTESA = { VERY_FAST: "molto rapida", FAST: "rapida", AVERAGE: "nella media", SLOW: "lenta", VERY_SLOW: "molto lenta" };
const RUMORE = { VERY_QUIET: "molto tranquillo", QUIET: "tranquillo", MODERATE: "moderato", LOUD: "rumoroso", VERY_LOUD: "molto rumoroso" };
const OCCASIONE = { BUSINESS: "lavoro", FRIENDS: "amici", ROMANTIC: "coppia", FAMILY: "famiglia", ALONE: "da solo" };
const STATO_RISPOSTA = {
  NOT_REVIEWED: ["in moderazione", "bg-amber-50 text-amber-700 border-amber-200"],
  UNDER_TRANSLATION: ["in moderazione", "bg-amber-50 text-amber-700 border-amber-200"],
  PUBLISHED: ["pubblicata", "bg-emerald-50 text-emerald-700 border-emerald-200"],
  WAITING_REFORMULATE: ["da riformulare", "bg-red-50 text-red-700 border-red-200"],
  REJECTED: ["rifiutata", "bg-red-50 text-red-700 border-red-200"],
  ARCHIVED: ["archiviata", "bg-neutral-50 text-neutral-500 border-neutral-200"],
  DELETED: ["cancellata", "bg-neutral-50 text-neutral-500 border-neutral-200"],
};

export function coloreVoto(v) {
  if (v == null) return "bg-neutral-100 text-neutral-500";
  if (v >= 9) return "bg-emerald-600 text-white";
  if (v >= 8) return "bg-emerald-100 text-emerald-800";
  if (v >= 6.5) return "bg-amber-100 text-amber-800";
  return "bg-red-600 text-white";
}

const dataIt = (d) => (d ? d.slice(0, 10).split("-").reverse().join("/") : "");

export default function RecensioneCard({ r, puoRispondere, onAggiornata, onApriCliente, compatta }) {
  const [aperta, setAperta] = useState(false);
  const [testo, setTesto] = useState(r.risposta || "");
  const [invio, setInvio] = useState(false);
  const [errore, setErrore] = useState(null);

  const invia = async () => {
    setInvio(true);
    setErrore(null);
    try {
      const res = await apiFetch(`${API_BASE}/prenotazioni/recensioni/${r.review_uuid}/risposta`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ testo, lingua: r.lingua }),
      });
      const d = await res.json();
      if (!res.ok) { setErrore(d.detail || "Errore"); return; }
      setAperta(false);
      onAggiornata && onAggiornata(d);
    } catch {
      setErrore("Errore di connessione");
    } finally {
      setInvio(false);
    }
  };

  const segnaLetta = async () => {
    if (r.letta) return;
    try {
      await apiFetch(`${API_BASE}/prenotazioni/recensioni/${r.review_uuid}/letta`, { method: "POST" });
      onAggiornata && onAggiornata({ ...r, letta: 1 });
    } catch { /* non importa */ }
  };

  const nome = [r.nome, r.cognome].filter(Boolean).join(" ") || "Cliente TheFork";
  const stato = STATO_RISPOSTA[r.risposta_stato] || null;
  const dettagli = [
    r.prezzo && `prezzo ${PREZZO[r.prezzo] || r.prezzo}`,
    r.attesa && `attesa ${ATTESA[r.attesa] || r.attesa}`,
    r.rumore && `ambiente ${RUMORE[r.rumore] || r.rumore}`,
    r.occasione && `con ${OCCASIONE[r.occasione] || r.occasione}`,
  ].filter(Boolean);

  return (
    <div onMouseEnter={segnaLetta}
      className={`bg-white rounded-xl border p-4 ${r.letta ? "border-neutral-200" : "border-indigo-300 shadow-sm"}`}>
      <div className="flex items-start gap-3">
        <div className={`flex-shrink-0 w-12 h-12 rounded-lg flex items-center justify-center font-bold text-lg ${coloreVoto(r.voto)}`}>
          {r.voto != null ? String(r.voto).replace(".", ",") : "—"}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            {!compatta && (r.cliente_id && onApriCliente ? (
              <button onClick={() => onApriCliente(r.cliente_id)} className="font-semibold text-indigo-700 hover:underline">{nome}</button>
            ) : <span className="font-semibold text-neutral-800">{nome}</span>)}
            {!r.letta && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-indigo-600 text-white">nuova</span>}
            <span className="text-xs text-neutral-500">
              pasto del {dataIt(r.data_pasto)}{r.ora_pasto ? ` alle ${r.ora_pasto.slice(0, 5)}` : ""}
              {r.pax ? ` · ${r.pax} pax` : ""}{r.tavolo ? ` · tavolo ${r.tavolo}` : ""}
            </span>
          </div>
          <div className="flex gap-3 text-xs text-neutral-600 mt-1 flex-wrap">
            {r.voto_cibo != null && <span>🍽️ cibo <strong>{r.voto_cibo}</strong></span>}
            {r.voto_servizio != null && <span>🤵 servizio <strong>{r.voto_servizio}</strong></span>}
            {r.voto_ambiente != null && <span>🏛️ ambiente <strong>{r.voto_ambiente}</strong></span>}
            {dettagli.length > 0 && <span className="text-neutral-400">· {dettagli.join(" · ")}</span>}
          </div>
          {r.commento ? (
            <p className="mt-2 text-sm text-neutral-800 whitespace-pre-line">{r.commento}</p>
          ) : (
            <p className="mt-2 text-xs text-neutral-400 italic">Solo voto, senza commento</p>
          )}
          {r.lingua && r.lingua !== "it" && <span className="text-[10px] text-neutral-400 uppercase">{r.lingua}</span>}

          {r.risposta && !aperta && (
            <div className="mt-3 pl-3 border-l-2 border-indigo-200">
              <div className="flex items-center gap-2 text-[11px] text-neutral-500 mb-0.5">
                <span>La nostra risposta{r.risposta_da ? ` (${r.risposta_da})` : ""}</span>
                {stato && <span className={`px-1.5 py-0.5 rounded border ${stato[1]}`}>{stato[0]}</span>}
              </div>
              <p className="text-sm text-neutral-700 whitespace-pre-line">{r.risposta}</p>
            </div>
          )}

          {puoRispondere && r.commento && !aperta && (
            <button onClick={() => { setTesto(r.risposta || ""); setAperta(true); }}
              className="mt-2 text-xs px-2.5 py-1 rounded border border-indigo-300 text-indigo-700 hover:bg-indigo-50">
              {r.risposta ? "✏️ Modifica risposta" : "💬 Rispondi"}
            </button>
          )}
          {aperta && (
            <div className="mt-3 space-y-2">
              <textarea value={testo} onChange={(e) => setTesto(e.target.value)} rows={4}
                placeholder={`Risposta pubblica${r.lingua && r.lingua !== "it" ? ` (il cliente ha scritto in ${r.lingua.toUpperCase()})` : ""}`}
                className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-sm" />
              {errore && <div className="text-xs text-red-700">{errore}</div>}
              <div className="flex items-center gap-2">
                <button disabled={invio || !testo.trim()} onClick={invia}
                  className="px-3 py-1.5 rounded bg-indigo-600 text-white text-sm disabled:opacity-50">
                  {invio ? "Invio…" : "Pubblica su TheFork"}
                </button>
                <button onClick={() => setAperta(false)} className="px-3 py-1.5 rounded text-sm text-neutral-600">Annulla</button>
                <span className="text-[11px] text-neutral-400">La risposta passa dalla moderazione di TheFork prima di comparire.</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
