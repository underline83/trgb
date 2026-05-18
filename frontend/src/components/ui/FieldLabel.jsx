// FILE: frontend/src/components/ui/FieldLabel.jsx
// @version: v1.0 — M.I primitive: label per campi form TRGB-02
//
// Wrapper standard per un campo: label sopra + input/select sotto, con
// supporto a required, hint contestuale e messaggio di errore.
//
// Esempi:
//   <FieldLabel label="Nome" required>
//     <TextInput value={nome} onChange={setNome} />
//   </FieldLabel>
//
//   <FieldLabel label="Telefono" hint="Solo cifre, senza prefisso internazionale">
//     <TextInput type="tel" value={tel} onChange={setTel} />
//   </FieldLabel>
//
//   <FieldLabel label="Email" error="Email non valida">
//     <TextInput type="email" value={email} onChange={setEmail} />
//   </FieldLabel>

import React from "react";

export default function FieldLabel({
  label,
  required = false,
  hint,
  error,
  className = "",
  children,
}) {
  return (
    <div className={className}>
      {label && (
        <label className="block text-[10px] font-semibold text-neutral-700 uppercase tracking-wider mb-1">
          {label}
          {required && <span className="text-brand-red ml-0.5">*</span>}
        </label>
      )}
      {children}
      {hint && !error && (
        <p className="mt-1 text-[10px] text-neutral-500 italic">{hint}</p>
      )}
      {error && (
        <p className="mt-1 text-[10px] text-brand-red font-medium">{error}</p>
      )}
    </div>
  );
}
