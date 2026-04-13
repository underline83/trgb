// FILE: frontend/src/components/TrgbWordmark.jsx
// @version: v1.0 — wordmark inline TRGB (gobbette colorate + scritta)
// Composto inline (non usa file SVG wordmark — quelli hanno problemi di viewBox con <text>)
import React from "react";

/**
 * Wordmark TRGB: 3 gobbette colorate (rosso/verde/blu) + scritta "TRGB".
 *
 * Props:
 *   size: "sm" | "md" | "lg"   default "md"
 *     sm = h-6 + text-xl   (header compatto)
 *     md = h-7 + text-2xl  (header standard)
 *     lg = h-8 + text-3xl  (login / hero)
 *   className: classi extra sul wrapper
 */
export default function TrgbWordmark({ size = "md", className = "" }) {
  const sizes = {
    sm: { svg: "h-6", text: "text-xl",  gap: "gap-2" },
    md: { svg: "h-7", text: "text-2xl", gap: "gap-2" },
    lg: { svg: "h-8", text: "text-3xl", gap: "gap-2.5" },
  };
  const s = sizes[size] || sizes.md;

  return (
    <div className={`flex items-center ${s.gap} ${className}`}>
      <svg viewBox="15 28 155 28" className={`${s.svg} w-auto`} aria-hidden="true">
        <g fill="none" strokeLinecap="round" strokeLinejoin="round" strokeWidth="5">
          <path d="M 20 50 L 20.3 48.8 L 20.6 47.7 L 21.0 46.5 L 21.4 45.4 L 21.9 44.3 L 22.4 43.2 L 23.0 42.2 L 23.6 41.1 L 24.3 40.1 L 25.0 39.2 L 25.9 38.2 L 26.8 37.3 L 27.7 36.6 L 28.7 35.9 L 29.7 35.3 L 30.7 34.8 L 31.8 34.4 L 32.9 34.1 L 34.1 33.9 L 35.3 33.8 L 36.5 33.8 L 37.7 33.9 L 38.8 34.1 L 40.0 34.2 L 41.1 34.5 L 42.2 34.8 L 43.3 35.2 L 44.3 35.6 L 45.4 36.1 L 46.4 36.6 L 47.4 37.2 L 48.4 37.8 L 49.4 38.4 L 50.4 39.0 L 51.3 39.7 L 52.3 40.3 L 53.3 41.0 L 54.2 41.7 L 55.2 42.4" stroke="#E8402B"/>
          <path d="M 75 50 L 75.3 48.8 L 75.6 47.7 L 76.0 46.5 L 76.4 45.4 L 76.9 44.3 L 77.4 43.2 L 78.0 42.2 L 78.6 41.1 L 79.3 40.1 L 80.0 39.2 L 80.9 38.2 L 81.8 37.3 L 82.7 36.6 L 83.7 35.9 L 84.7 35.3 L 85.7 34.8 L 86.8 34.4 L 87.9 34.1 L 89.1 33.9 L 90.3 33.8 L 91.5 33.8 L 92.7 33.9 L 93.8 34.1 L 95.0 34.2 L 96.1 34.5 L 97.2 34.8 L 98.3 35.2 L 99.3 35.6 L 100.4 36.1 L 101.4 36.6 L 102.4 37.2 L 103.4 37.8 L 104.4 38.4 L 105.4 39.0 L 106.3 39.7 L 107.3 40.3 L 108.3 41.0 L 109.2 41.7 L 110.2 42.4" stroke="#2EB872"/>
          <path d="M 130 50 L 130.3 48.8 L 130.6 47.7 L 131.0 46.5 L 131.4 45.4 L 131.9 44.3 L 132.4 43.2 L 133.0 42.2 L 133.6 41.1 L 134.3 40.1 L 135.0 39.2 L 135.9 38.2 L 136.8 37.3 L 137.7 36.6 L 138.7 35.9 L 139.7 35.3 L 140.7 34.8 L 141.8 34.4 L 142.9 34.1 L 144.1 33.9 L 145.3 33.8 L 146.5 33.8 L 147.7 33.9 L 148.8 34.1 L 150.0 34.2 L 151.1 34.5 L 152.2 34.8 L 153.3 35.2 L 154.3 35.6 L 155.4 36.1 L 156.4 36.6 L 157.4 37.2 L 158.4 37.8 L 159.4 38.4 L 160.4 39.0 L 161.3 39.7 L 162.3 40.3 L 163.3 41.0 L 164.2 41.7 L 165.2 42.4" stroke="#2E7BE8"/>
        </g>
      </svg>
      <span
        className={`${s.text} font-extrabold text-brand-ink tracking-tight leading-none`}
        style={{ fontFamily: "'Helvetica Neue', Arial, sans-serif" }}
      >
        TRGB
      </span>
    </div>
  );
}
