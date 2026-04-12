// FILE: frontend/src/components/icons.jsx
// @version: v1.0 — Home v3 icon set
// Icone SVG monocromatiche per i moduli TRGB.
// Stroke 1.5, 24x24 viewBox, niente fill (solo stroke).
// Usate nelle tile Home v3 al posto delle emoji.

import React from "react";

const defaults = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.5,
  strokeLinecap: "round",
  strokeLinejoin: "round",
};

function Icon({ children, size = 22, className = "", ...props }) {
  return (
    <svg
      {...defaults}
      width={size}
      height={size}
      className={className}
      {...props}
    >
      {children}
    </svg>
  );
}

export function IconVini(props) {
  return (
    <Icon {...props}>
      <path d="M8 2l1.5 7h5L16 2" />
      <path d="M7.5 9a4.5 4.5 0 009 0" />
      <path d="M12 13.5V19" />
      <path d="M8 22h8" />
      <path d="M12 19v3" />
    </Icon>
  );
}

export function IconAcquisti(props) {
  return (
    <Icon {...props}>
      <rect x="3" y="7" width="18" height="13" rx="2" />
      <path d="M3 11h18" />
      <path d="M7 2v5" />
      <path d="M17 2v5" />
      <path d="M8 15h3" />
      <path d="M8 18h5" />
    </Icon>
  );
}

export function IconVendite(props) {
  return (
    <Icon {...props}>
      <rect x="2" y="5" width="20" height="15" rx="2" />
      <path d="M2 10h20" />
      <path d="M6 15h3" />
      <path d="M6 18h5" />
    </Icon>
  );
}

export function IconRicette(props) {
  return (
    <Icon {...props}>
      <path d="M4 19V5a2 2 0 012-2h12a2 2 0 012 2v14l-8-3.5L4 19z" />
      <path d="M8 7h8" />
      <path d="M8 11h5" />
    </Icon>
  );
}

export function IconFlussiCassa(props) {
  return (
    <Icon {...props}>
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <path d="M3 9h18" />
      <path d="M9 3v18" />
      <path d="M13 13h4" />
      <path d="M13 17h2" />
    </Icon>
  );
}

export function IconControlloGestione(props) {
  return (
    <Icon {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3.5 2" />
    </Icon>
  );
}

export function IconStatistiche(props) {
  return (
    <Icon {...props}>
      <path d="M4 20h16" />
      <path d="M7 16V11" />
      <path d="M11 16V7" />
      <path d="M15 16V13" />
      <path d="M19 16V9" />
    </Icon>
  );
}

export function IconPrenotazioni(props) {
  return (
    <Icon {...props}>
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <path d="M3 10h18" />
      <path d="M8 2v4" />
      <path d="M16 2v4" />
      <circle cx="12" cy="15.5" r="1.5" fill="currentColor" stroke="none" />
    </Icon>
  );
}

export function IconClienti(props) {
  return (
    <Icon {...props}>
      <circle cx="9" cy="7" r="3.5" />
      <path d="M3 21v-2a4 4 0 014-4h4a4 4 0 014 4v2" />
      <path d="M16 3.5a3.5 3.5 0 010 7" />
      <path d="M21 21v-2a4 4 0 00-3-3.85" />
    </Icon>
  );
}

export function IconDipendenti(props) {
  return (
    <Icon {...props}>
      <circle cx="12" cy="7" r="4" />
      <path d="M5.5 21v-2a6.5 6.5 0 0113 0v2" />
    </Icon>
  );
}

export function IconImpostazioni(props) {
  return (
    <Icon {...props}>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
    </Icon>
  );
}

// Mappa key modulo → componente icona (usata da ModuleTile e alert widget)
const MODULE_ICONS = {
  vini: IconVini,
  acquisti: IconAcquisti,
  vendite: IconVendite,
  ricette: IconRicette,
  "flussi-cassa": IconFlussiCassa,
  "controllo-gestione": IconControlloGestione,
  statistiche: IconStatistiche,
  prenotazioni: IconPrenotazioni,
  clienti: IconClienti,
  dipendenti: IconDipendenti,
  impostazioni: IconImpostazioni,
};

export default MODULE_ICONS;
