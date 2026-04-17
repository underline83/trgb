// Hook per consumare il Toast globale (sessione 44 — P4)
// Ritorna { toast }. Uso:
//   const { toast } = useToast();
//   toast("Salvato", { kind: "success" });
// Kind: info (default) | success | error | warn
// Opts: { kind, duration } — duration default 1800ms

import { useContext } from "react";
import { ToastContext } from "../components/Toast";

export default function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    // Fallback no-op se il provider non e' montato (es. test unitari senza wrapper)
    return {
      toast: (msg) => console.warn("[useToast] senza ToastProvider:", msg),
    };
  }
  return ctx;
}
