// @version: v1.0 — true sotto i 640 px, la stessa soglia «sm» di ModuleNav (2026-11-24)
// Platform (M.I UI primitives): per le pagine che sul telefono cambiano FORMA
// (una tabella che diventa un elenco di schede), non solo misure. Dove bastano
// le misure si usano le classi `sm:` di Tailwind, senza questo hook.
import { useState, useEffect } from "react";

const TELEFONO = "(max-width: 639px)";

export default function useTelefono() {
  const [si, setSi] = useState(() => typeof window !== "undefined" && !!window.matchMedia && window.matchMedia(TELEFONO).matches);
  useEffect(() => {
    if (!window.matchMedia) return undefined;
    const m = window.matchMedia(TELEFONO);
    const senti = () => setSi(m.matches);
    senti();
    if (m.addEventListener) m.addEventListener("change", senti);
    else m.addListener(senti);
    return () => {
      if (m.removeEventListener) m.removeEventListener("change", senti);
      else m.removeListener(senti);
    };
  }, []);
  return si;
}
