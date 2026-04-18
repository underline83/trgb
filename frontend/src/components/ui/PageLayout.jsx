// FILE: frontend/src/components/ui/PageLayout.jsx
// @version: v1.0 — Mattone UI condiviso: layout pagina TRGB-02
//
// Wrapper standard per le pagine modulo. Gestisce:
//  - sfondo bg-brand-cream + min-h-screen
//  - container max-w-7xl (o 'wide' per max-w-full)
//  - header con titolo, sottotitolo, area azioni a destra
//  - slot opzionale per sub-nav (ClientiNav, CucinaNav, …) sopra l'header
//  - responsive: header si impila su mobile
//
// NON cambia il comportamento delle pagine esistenti: è opt-in.
//
// Esempio:
//   <PageLayout
//     nav={<ClientiNav current="lista" />}
//     title="Anagrafica Clienti"
//     subtitle={`${totale} clienti`}
//     actions={<Btn onClick={nuovoCliente}>+ Nuovo Cliente</Btn>}
//   >
//     {/* corpo pagina */}
//   </PageLayout>

import React from "react";

export default function PageLayout({
  nav,                // sub-nav (es. <ClientiNav/>) — render SOPRA il wrapper bg
  title,              // string | ReactNode — h1
  subtitle,           // string | ReactNode — sotto il titolo
  actions,            // ReactNode — area bottoni top-right (CTA pagina)
  toolbar,            // ReactNode — barra secondaria sotto l'header (filtri, azioni marketing)
  wide = false,       // true: max-w-full (moduli con tabelle wide). false: max-w-7xl.
  background = true,  // false: niente bg-brand-cream/min-h-screen (per dialog/wizard)
  padded = true,      // false: rimuove padding del container (contenuto full-bleed)
  className = "",     // classi extra sul container interno
  children,
}) {
  const maxW = wide ? "max-w-full" : "max-w-7xl";
  const pad = padded ? "px-4 sm:px-6 py-5" : "";

  const content = (
    <div className={`${maxW} mx-auto ${pad} ${className}`.trim()}>
      {(title || subtitle || actions) && (
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-4">
          <div className="min-w-0">
            {title && (
              <h1 className="text-xl sm:text-2xl font-bold text-brand-ink tracking-tight truncate">
                {title}
              </h1>
            )}
            {subtitle && (
              <div className="text-xs text-neutral-500 mt-0.5">{subtitle}</div>
            )}
          </div>
          {actions && (
            <div className="flex items-center gap-2 flex-shrink-0">
              {actions}
            </div>
          )}
        </div>
      )}
      {toolbar && <div className="mb-4">{toolbar}</div>}
      {children}
    </div>
  );

  if (!background) {
    return (
      <>
        {nav}
        {content}
      </>
    );
  }

  return (
    <>
      {nav}
      <div className="min-h-screen bg-brand-cream font-sans">
        {content}
      </div>
    </>
  );
}
