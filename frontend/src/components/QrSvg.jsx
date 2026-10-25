// frontend/src/components/QrSvg.jsx
// Platform (M.I UI) — QR come SVG vettoriale, nitido a qualsiasi risoluzione di stampa.
// Nato in pages/vini/EtichetteVini.jsx (2026-10-06), spostato qui il 2026-10-25
// per riusarlo nelle etichette delle gift card. QR generato in locale
// (utils/vendor/qrcode.js, qrcode-generator MIT): nessun servizio esterno.
import React, { useMemo } from "react";
import qrcode from "../utils/vendor/qrcode";

export default function QrSvg({ text, sizeMm, livello = "M" }) {
  const { n, d } = useMemo(() => {
    const qr = qrcode(0, livello);
    qr.addData(text);
    qr.make();
    const count = qr.getModuleCount();
    let path = "";
    for (let r = 0; r < count; r++)
      for (let c = 0; c < count; c++)
        if (qr.isDark(r, c)) path += `M${c + 2} ${r + 2}h1v1h-1z`;
    return { n: count + 4, d: path };
  }, [text, livello]);
  return (
    <svg viewBox={`0 0 ${n} ${n}`} width={`${sizeMm}mm`} height={`${sizeMm}mm`}
      shapeRendering="crispEdges" style={{ display: "block", flex: "none" }}>
      <rect width={n} height={n} fill="#fff" />
      <path d={d} fill="#000" />
    </svg>
  );
}
