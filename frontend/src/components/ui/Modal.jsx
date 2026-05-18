// FILE: frontend/src/components/ui/Modal.jsx
// @version: v1.0 — M.I primitive: modale standard TRGB-02
//
// Modale con backdrop semitrasparente, click-fuori per chiudere, header standard
// con titolo+sottotitolo+chiudi, slot per body + footer azioni.
// Gestisce ESC per chiudere e blocca lo scroll del body sottostante.
//
// Layout standard:
//   ┌───────────────────────────────────────────┐
//   │ {title}                              ✕    │  ← header tone-colored (sticky)
//   │ {subtitle}                                │
//   ├───────────────────────────────────────────┤
//   │                                           │
//   │ {children}                                │  ← body scrollabile
//   │                                           │
//   ├───────────────────────────────────────────┤
//   │                       [Annulla] [Salva]   │  ← footer (opzionale)
//   └───────────────────────────────────────────┘
//
// Coerente con §9-bis pt 6: rounded-3xl + shadow-2xl + brand-cream-safe.
//
// Esempio:
//   <Modal open={isOpen} onClose={close} title="Nuovo cliente" size="md"
//          footer={
//            <>
//              <Btn variant="secondary" onClick={close}>Annulla</Btn>
//              <Btn onClick={save}>Salva</Btn>
//            </>
//          }>
//     <FieldLabel label="Nome">...</FieldLabel>
//   </Modal>

import React, { useEffect } from "react";

const SIZE = {
  sm: "max-w-md",
  md: "max-w-lg",
  lg: "max-w-2xl",
  xl: "max-w-4xl",
  "2xl": "max-w-6xl",
  full: "max-w-[95vw]",
};

const HEADER_TONE = {
  neutral: "bg-white border-neutral-200",
  amber:   "bg-gradient-to-r from-amber-50 to-white border-amber-200",
  blue:    "bg-gradient-to-r from-blue-50 to-white border-blue-200",
  rose:    "bg-gradient-to-r from-rose-50 to-white border-rose-200",
  violet:  "bg-gradient-to-r from-violet-50 to-white border-violet-200",
  emerald: "bg-gradient-to-r from-emerald-50 to-white border-emerald-200",
};

const TITLE_TONE = {
  neutral: "text-neutral-900",
  amber:   "text-amber-900",
  blue:    "text-blue-900",
  rose:    "text-rose-900",
  violet:  "text-violet-900",
  emerald: "text-emerald-900",
};

export default function Modal({
  open,
  onClose,
  title,
  subtitle,
  tone = "neutral",
  size = "md",
  closeOnBackdrop = true,
  closeOnEsc = true,
  showCloseButton = true,
  footer,                  // ReactNode: bottoni in footer (allineati a destra di default)
  footerAlign = "right",   // "left" | "right" | "between"
  className = "",
  children,
}) {
  // ESC per chiudere
  useEffect(() => {
    if (!open || !closeOnEsc) return;
    const onKey = (e) => { if (e.key === "Escape") onClose?.(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, closeOnEsc, onClose]);

  // Lock scroll body
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [open]);

  if (!open) return null;

  const sizeCls = SIZE[size] || SIZE.md;
  const headerCls = HEADER_TONE[tone] || HEADER_TONE.neutral;
  const titleCls = TITLE_TONE[tone] || TITLE_TONE.neutral;
  const footerJustify =
    footerAlign === "left"    ? "justify-start" :
    footerAlign === "between" ? "justify-between" :
                                 "justify-end";

  return (
    <div
      className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4"
      onClick={() => closeOnBackdrop && onClose?.()}
    >
      <div
        onClick={e => e.stopPropagation()}
        className={`bg-white rounded-3xl shadow-2xl ${sizeCls} w-full max-h-[92vh] overflow-hidden flex flex-col ${className}`.trim()}
        role="dialog"
        aria-modal="true"
      >
        {/* Header */}
        {(title || subtitle || showCloseButton) && (
          <div className={`px-5 py-3 border-b flex items-start justify-between gap-3 flex-shrink-0 ${headerCls}`}>
            <div className="min-w-0 flex-1">
              {title && (
                <h3 className={`text-base font-bold ${titleCls}`}>{title}</h3>
              )}
              {subtitle && (
                <p className="text-xs text-neutral-700 mt-0.5">{subtitle}</p>
              )}
            </div>
            {showCloseButton && (
              <button
                type="button"
                onClick={() => onClose?.()}
                aria-label="Chiudi"
                className="flex-shrink-0 w-8 h-8 rounded-lg border border-neutral-300 bg-white text-neutral-700 hover:bg-neutral-50 transition text-sm font-semibold"
              >
                ✕
              </button>
            )}
          </div>
        )}

        {/* Body (scrollabile) */}
        <div className="flex-1 overflow-auto p-5">
          {children}
        </div>

        {/* Footer azioni (opzionale) */}
        {footer && (
          <div className={`px-5 py-3 border-t border-neutral-200 bg-neutral-50 flex items-center gap-2 flex-shrink-0 ${footerJustify}`}>
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
