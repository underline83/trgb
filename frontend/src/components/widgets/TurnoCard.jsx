// FILE: frontend/src/components/widgets/TurnoCard.jsx
// @version: v1.0 — card «Il turno» della Home v10 (2026-11-04)
// Modulo: platform (Home) — legge prenotazioni (clienti) via /dashboard/home e
// il briefing via /dashboard/lavagna; nessuna chiamata diretta ad altri moduli.
//
// PERCHÉ
// Prenotazioni, La Lavagna e Selezioni del giorno parlavano dello stesso turno
// in tre card diverse (le selezioni si leggevano due volte). Qui diventano una
// card sola: in testa il turno e i coperti, poi la nota, la frase del turno, a
// sinistra la lista prenotazioni e a destra tavoli notevoli, selezioni, chi è
// in turno e task; in fondo gli eventi. Il tab si apre sul turno in corso (lo
// decide il backend, lavagna.turno), non più sempre su «Pranzo».
//
// Pezzi della Lavagna riusati da Lavagna.jsx (niente copie).

import React, { useState } from "react";
import {
  CopiaBriefing, LavagnaNota, LavagnaServizio, LavagnaEventi, BachecaLink, LavagnaVuota,
} from "./Lavagna";

function dotColor(stato) {
  if (["RECORDED", "ARRIVED", "SEATED"].includes(stato)) return "#2EB872";
  if (["BILL", "LEFT"].includes(stato)) return "#a8a49e";
  return "#D4A017";
}

// Ripiego se la Lavagna non risponde: stessa soglia del backend (15:00).
function turnoDaOrologio() {
  return new Date().getHours() < 15 ? "pranzo" : "cena";
}

const TURNI = {
  pranzo: { emoji: "☀️", label: "Pranzo" },
  cena: { emoji: "🌙", label: "Cena" },
};

export default function TurnoCard({
  prenotazioni, lavagna, lavagnaLoading, saving, scriviNota, rimuoviNota, isAdmin,
}) {
  const [scelto, setScelto] = useState(null); // null = segui il turno in corso
  const turnoOra = lavagna?.turno === "pranzo" || lavagna?.turno === "cena" ? lavagna.turno : turnoDaOrologio();
  const tab = scelto || turnoOra;

  const lista = (prenotazioni?.lista || []).filter((r) => r.turno === tab);
  const pax = { pranzo: prenotazioni?.pranzo_pax || 0, cena: prenotazioni?.cena_pax || 0 };
  const t = TURNI[tab];

  if (lavagnaLoading && !lavagna) return <LavagnaVuota testo="Caricamento…" />;

  return (
    <div className="bg-white rounded-[14px] shadow-[0_2px_10px_rgba(0,0,0,.06)] border border-[#e7e2d9] flex flex-col overflow-hidden lg:min-h-0 lg:h-full">

      {/* ═══ Testa: turno + coperti + copia ═══ */}
      <div className="flex items-center justify-between gap-3 px-4 pt-3.5 pb-2.5">
        <div className="min-w-0">
          <div className="text-[18px] font-bold text-brand-ink tracking-tight leading-tight truncate"
               style={{ fontFamily: "'Playfair Display', serif" }}>
            {t.emoji} Il turno
          </div>
          {lavagna?.data_label && (
            <div className="text-[11px] font-semibold text-[#a8a49e] mt-0.5 truncate">{lavagna.data_label}</div>
          )}
        </div>
        <div className="flex items-center gap-3 flex-shrink-0">
          <div className="flex items-baseline gap-1">
            <span className="text-[22px] font-extrabold text-brand-ink leading-none tabular-nums">{pax[tab]}</span>
            <span className="text-[10px] text-[#a8a49e] font-medium">pax</span>
          </div>
          {lavagna?.whatsapp && <CopiaBriefing testo={lavagna.whatsapp} />}
        </div>
      </div>

      {/* Tab pranzo/cena — si apre sul turno in corso */}
      <div className="flex border-b border-[#f0ede8] flex-shrink-0">
        {["pranzo", "cena"].map((k) => (
          <button
            key={k}
            onClick={() => setScelto(k === turnoOra ? null : k)}
            className={`flex-1 text-center py-2.5 text-[12px] font-semibold transition ${
              tab === k ? "text-brand-ink border-b-2 border-brand-ink font-bold" : "text-[#a8a49e]"
            }`}
          >
            {TURNI[k].emoji} {TURNI[k].label} · {pax[k]} pax
          </button>
        ))}
      </div>

      <div className="flex-1 lg:min-h-0 lg:overflow-y-auto">
        {lavagna && (
          <LavagnaNota lavagna={lavagna} saving={saving} scriviNota={scriviNota}
                       rimuoviNota={rimuoviNota} isAdmin={isAdmin} />
        )}

        {/* La frase del turno vale per il turno in corso: si mostra solo lì */}
        {lavagna?.lede && tab === turnoOra && (
          <p className="px-4 pt-3 text-[15px] leading-relaxed text-brand-ink">{lavagna.lede}</p>
        )}

        <div className="grid grid-cols-1 md:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)] md:divide-x divide-[#f0ede8]">
          {/* Sinistra: le prenotazioni del tab */}
          <div className="pt-2 pb-2">
            <div className="px-4 pb-1 text-[10px] font-bold uppercase tracking-[.9px] text-[#a8a49e]">
              📅 Prenotazioni · {t.label.toLowerCase()}
            </div>
            {lista.length > 0 ? (
              lista.map((r, i) => (
                <div key={i} className={`flex items-center gap-2.5 px-4 py-2.5 ${i < lista.length - 1 ? "border-b border-[#f8f6f2]" : ""}`}>
                  <span className="text-[11px] font-semibold text-[#a8a49e] w-10 flex-shrink-0 tabular-nums">{r.ora?.slice(0, 5)}</span>
                  <div className="flex-1 min-w-0">
                    <div className="text-[13px] font-semibold text-brand-ink leading-tight truncate">{r.nome}</div>
                    {r.nota && <div className="text-[11px] text-[#a8a49e] mt-0.5 truncate">{r.nota}</div>}
                  </div>
                  <span className="text-[13px] font-bold text-brand-ink w-6 text-right">{r.pax}</span>
                  <div className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: dotColor(r.stato) }} />
                </div>
              ))
            ) : (
              <div className="px-4 py-6 text-center text-[13px] text-[#a8a49e]">
                Nessuna prenotazione per {tab}
              </div>
            )}
          </div>

          {/* Destra: il servizio (tavoli notevoli, selezioni, staff, task) */}
          {lavagna ? (
            <div className="border-t md:border-t-0 border-[#f0ede8]">
              <LavagnaServizio lavagna={lavagna} showLede={false} />
            </div>
          ) : (
            <div className="px-4 py-6 text-center text-[13px] text-[#a8a49e]">Lavagna non disponibile</div>
          )}
        </div>

        {lavagna && <LavagnaEventi lavagna={lavagna} className="mt-1" />}
      </div>

      <BachecaLink />
    </div>
  );
}
