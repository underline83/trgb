// @version: v1.2 — loghetto TRGB (tre gobbette) sulle prenotazioni inserite da TRGB (2026-11-26); v1.1 — fonte «sito» (prenotazioni dal nostro sito)
// Icona canale prenotazione (TheFork, telefono, WA, walk-in, widget)
import React from "react";
import Tooltip from "../../../components/Tooltip";

const CANALI = {
  TheFork:   { icon: "🍴", tip: "TheFork" },
  Offline:   { icon: "📞", tip: "Telefono/Offline" },
  Telefono:  { icon: "📞", tip: "Telefono" },
  WhatsApp:  { icon: "💬", tip: "WhatsApp" },
  "Walk-in": { icon: "🚶", tip: "Walk-in" },
  "Booking Module": { icon: "🌐", tip: "Widget TheFork" },
  Email:     { icon: "✉️", tip: "Email" },
  widget:    { icon: "🌐", tip: "Booking Module TheFork (storico)" },
  sito:      { icon: "🏠", tip: "Dal nostro sito" },
};

// Loghetto «presa in TRGB»: le tre gobbette del marchio (rosso, verde, blu) in piccolo.
// Compare accanto al canale sulle prenotazioni inserite dal nostro gestionale (fonte «manuale»).
export function LoghettoTrgb({ size = 16 }) {
  return (
    <Tooltip label="Inserita da TRGB">
      <svg width={size * 1.5} height={size} viewBox="0 0 30 20" role="img" aria-label="Inserita da TRGB" className="inline-block align-middle flex-shrink-0">
        <path d="M2 15 Q6 3 10 15" fill="none" stroke="#E8402B" strokeWidth="2.6" strokeLinecap="round" />
        <path d="M11 15 Q15 3 19 15" fill="none" stroke="#2EB872" strokeWidth="2.6" strokeLinecap="round" />
        <path d="M20 15 Q24 3 28 15" fill="none" stroke="#2E7BE8" strokeWidth="2.6" strokeLinecap="round" />
      </svg>
    </Tooltip>
  );
}

export default function CanaleBadge({ canale, fonte }) {
  // Priorita': se fonte=thefork mostra icona TheFork
  const key = fonte === "thefork" ? "TheFork" : fonte === "widget" ? "widget" : fonte === "sito" ? "sito" : canale;
  const c = CANALI[key] || { icon: "📋", tip: canale || "—" };
  return (
    <>
      {fonte === "manuale" && <LoghettoTrgb />}
      <Tooltip label={c.tip}>
        <span className="text-sm">{c.icon}</span>
      </Tooltip>
    </>
  );
}
