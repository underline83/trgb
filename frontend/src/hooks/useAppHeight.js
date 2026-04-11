// Hook per altezza viewport "utile" (sotto l'header sticky).
//
// Sostituisce i vari `calc(100vh - Npx)` sparsi nelle pagine con un
// valore unico esposto come CSS variable `--app-h` su <html>.
//
// Funziona così:
//   1. al mount cerca <header> nel DOM e ne misura l'altezza reale
//      (offsetHeight, include eventuale banner viewer/read-only)
//   2. setta --app-h = (innerHeight - headerHeight) px
//   3. ricalcola su resize, orientationchange e quando l'header cambia
//      altezza (ResizeObserver, p.es. apparizione banner)
//
// Su iOS Safari il fallback iniziale è `100dvh` (più affidabile di
// 100vh perché esclude la URL bar dinamica). Quando l'hook misura
// effettivamente, --app-h passa al valore in pixel preciso.
//
// USO:
//   - in App.jsx (componente root): `useAppHeight()` una sola volta
//   - nei componenti pagina: style={{ height: "var(--app-h)" }}
//
// NB: l'hook va inizializzato UNA volta sola sopra il router, non
// dentro ogni pagina. Il valore vive su document.documentElement.

import { useEffect } from "react";

export default function useAppHeight() {
  useEffect(() => {
    const root = document.documentElement;

    // Fallback immediato (prima che misuriamo l'header reale)
    if (!root.style.getPropertyValue("--app-h")) {
      root.style.setProperty("--app-h", "100dvh");
    }

    let headerEl = null;
    let resizeObserver = null;

    const measure = () => {
      const headerHeight = headerEl ? headerEl.offsetHeight : 0;
      const winH = window.innerHeight;
      const usable = Math.max(0, winH - headerHeight);
      // Se per qualche motivo l'header non è ancora montato (winH = 0),
      // restiamo sul fallback dvh.
      if (winH > 0) {
        root.style.setProperty("--app-h", usable + "px");
      }
    };

    // Cerca l'header. Header.jsx usa <header className="sticky top-0 ...">.
    const findHeader = () => {
      headerEl = document.querySelector("header");
      if (headerEl && "ResizeObserver" in window) {
        resizeObserver = new ResizeObserver(() => measure());
        resizeObserver.observe(headerEl);
      }
      measure();
    };

    // L'header potrebbe non essere ancora nel DOM al primo render.
    // Riproviamo al prossimo tick.
    if (document.querySelector("header")) {
      findHeader();
    } else {
      // requestAnimationFrame ci dà il primo paint
      const raf = requestAnimationFrame(findHeader);
      // cleanup difensivo se l'effetto si smonta prima del raf
      return () => {
        cancelAnimationFrame(raf);
        if (resizeObserver) resizeObserver.disconnect();
      };
    }

    const onResize = () => measure();
    window.addEventListener("resize", onResize);
    window.addEventListener("orientationchange", onResize);

    return () => {
      window.removeEventListener("resize", onResize);
      window.removeEventListener("orientationchange", onResize);
      if (resizeObserver) resizeObserver.disconnect();
    };
  }, []);
}
