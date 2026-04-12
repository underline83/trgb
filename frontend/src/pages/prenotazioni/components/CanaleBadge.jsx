// @version: v1.0
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
  widget:    { icon: "🌐", tip: "Widget TRGB" },
};

export default function CanaleBadge({ canale, fonte }) {
  // Priorita': se fonte=thefork mostra icona TheFork
  const key = fonte === "thefork" ? "TheFork" : fonte === "widget" ? "widget" : canale;
  const c = CANALI[key] || { icon: "📋", tip: canale || "—" };
  return (
    <Tooltip label={c.tip}>
      <span className="text-sm">{c.icon}</span>
    </Tooltip>
  );
}
