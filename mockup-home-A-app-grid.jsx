import { useState } from "react";

/*  ─── PROPOSTA A — "App Grid"  ─────────────────────────────
    Ispirazione: home screen iOS / iPadOS
    - Griglia icone compatta (4 col iPad, 2 col iPhone)
    - Sezione "Accesso rapido" in alto per azioni frequenti
    - Brand header leggero con gobbette
    - Ogni modulo = icona colorata + label sotto
    - Touch target ≥ 48px, nessun hover-only
    ──────────────────────────────────────────────────────── */

const BRAND = { red: "#E8402B", green: "#2EB872", blue: "#2E7BE8", ink: "#111111", cream: "#F4F1EC" };

const QUICK_ACTIONS = [
  { icon: "🧾", label: "Chiusura Turno", color: BRAND.red },
  { icon: "📅", label: "Prenotazioni Oggi", color: BRAND.blue },
  { icon: "🍷", label: "Cantina", color: BRAND.green },
];

const MODULES = [
  { icon: "🍷", label: "Vini",       bg: "#FEF3C7", border: "#F59E0B" },
  { icon: "📦", label: "Acquisti",    bg: "#CCFBF1", border: "#14B8A6" },
  { icon: "💵", label: "Vendite",     bg: "#E0E7FF", border: "#6366F1" },
  { icon: "📘", label: "Ricette",     bg: "#FFEDD5", border: "#F97316" },
  { icon: "🏦", label: "Flussi Cassa",bg: "#D1FAE5", border: "#10B981" },
  { icon: "🎯", label: "Controllo",   bg: "#E0F2FE", border: "#0EA5E9" },
  { icon: "📈", label: "Statistiche", bg: "#FCE7F3", border: "#F43F5E" },
  { icon: "📅", label: "Prenotazioni",bg: "#E0E7FF", border: "#6366F1" },
  { icon: "🤝", label: "Clienti",     bg: "#CCFBF1", border: "#14B8A6" },
  { icon: "👥", label: "Dipendenti",  bg: "#F3E8FF", border: "#A855F7" },
  { icon: "⚙️", label: "Impostazioni",bg: "#F5F5F5", border: "#737373" },
];

// Gobbette SVG inline (3 curve brand)
function Gobbette({ size = 32 }) {
  return (
    <svg viewBox="15 28 155 28" style={{ height: size, width: "auto" }} aria-hidden="true">
      <g fill="none" strokeLinecap="round" strokeLinejoin="round" strokeWidth="5">
        <path d="M 20 50 Q 37 30 55 42" stroke={BRAND.red} />
        <path d="M 75 50 Q 92 30 110 42" stroke={BRAND.green} />
        <path d="M 130 50 Q 147 30 165 42" stroke={BRAND.blue} />
      </g>
    </svg>
  );
}

export default function PropostaA() {
  const [device, setDevice] = useState("ipad");
  const isPhone = device === "iphone";
  const frameW = isPhone ? 390 : 820;
  const frameH = isPhone ? 844 : 1100;
  const gridCols = isPhone ? 3 : 4;

  return (
    <div style={{ fontFamily: "'Helvetica Neue', Arial, sans-serif", background: "#1a1a1a", minHeight: "100vh", padding: 32, color: "#fff" }}>
      <h1 style={{ fontSize: 28, fontWeight: 800, marginBottom: 4 }}>Proposta A — App Grid</h1>
      <p style={{ color: "#999", fontSize: 14, marginBottom: 24 }}>Home in stile iOS: griglia icone compatta, accesso rapido in alto, branding leggero.</p>

      {/* Device switcher */}
      <div style={{ display: "flex", gap: 8, marginBottom: 24 }}>
        {["ipad", "iphone"].map(d => (
          <button key={d} onClick={() => setDevice(d)}
            style={{
              padding: "8px 20px", borderRadius: 12, fontSize: 13, fontWeight: 600,
              background: device === d ? BRAND.blue : "#333", color: "#fff", border: "none", cursor: "pointer"
            }}>
            {d === "ipad" ? "📱 iPad" : "📱 iPhone"}
          </button>
        ))}
      </div>

      {/* Device frame */}
      <div style={{
        width: frameW, maxWidth: "100%", height: frameH, borderRadius: 32,
        background: BRAND.cream, overflow: "hidden", boxShadow: "0 25px 60px rgba(0,0,0,.5)",
        border: "3px solid #333", display: "flex", flexDirection: "column"
      }}>
        {/* Status bar simulata */}
        <div style={{ height: 48, background: BRAND.cream, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 24px" }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: BRAND.ink }}>9:41</span>
          <span style={{ fontSize: 12, color: "#999" }}>⚡ 87%</span>
        </div>

        {/* Header brand */}
        <div style={{ padding: isPhone ? "16px 20px 20px" : "24px 32px 28px", textAlign: "center" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10, marginBottom: 8 }}>
            <Gobbette size={isPhone ? 24 : 30} />
            <span style={{ fontSize: isPhone ? 28 : 36, fontWeight: 800, color: BRAND.ink, letterSpacing: -1 }}>TRGB</span>
          </div>
          <p style={{ fontSize: 13, color: "#999", margin: 0 }}>Buongiorno, Marco</p>
        </div>

        {/* Scrollable content */}
        <div style={{ flex: 1, overflowY: "auto", padding: isPhone ? "0 16px 32px" : "0 32px 32px" }}>

          {/* ── Accesso Rapido ── */}
          <div style={{ marginBottom: 28 }}>
            <h3 style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1.5, color: "#999", marginBottom: 12, paddingLeft: 4 }}>
              Accesso rapido
            </h3>
            <div style={{ display: "flex", gap: 10 }}>
              {QUICK_ACTIONS.map((a, i) => (
                <div key={i} style={{
                  flex: 1, background: "#fff", borderRadius: 16, padding: isPhone ? "14px 8px" : "16px 12px",
                  display: "flex", alignItems: "center", gap: 10, boxShadow: "0 2px 8px rgba(0,0,0,.06)",
                  border: "1px solid #e5e5e5", cursor: "pointer"
                }}>
                  <div style={{
                    width: 40, height: 40, borderRadius: 12, background: a.color + "18",
                    display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, flexShrink: 0
                  }}>{a.icon}</div>
                  <span style={{ fontSize: isPhone ? 11 : 12, fontWeight: 600, color: BRAND.ink, lineHeight: 1.3 }}>{a.label}</span>
                </div>
              ))}
            </div>
          </div>

          {/* ── Griglia Moduli ── */}
          <h3 style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1.5, color: "#999", marginBottom: 16, paddingLeft: 4 }}>
            Moduli
          </h3>
          <div style={{
            display: "grid",
            gridTemplateColumns: `repeat(${gridCols}, 1fr)`,
            gap: isPhone ? 12 : 16
          }}>
            {MODULES.map((m, i) => (
              <div key={i} style={{
                display: "flex", flexDirection: "column", alignItems: "center", cursor: "pointer",
                padding: isPhone ? "12px 4px" : "16px 8px",
              }}>
                <div style={{
                  width: isPhone ? 56 : 68, height: isPhone ? 56 : 68, borderRadius: isPhone ? 16 : 20,
                  background: m.bg, border: `2px solid ${m.border}22`,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: isPhone ? 26 : 32, marginBottom: 8,
                  boxShadow: "0 2px 8px rgba(0,0,0,.06)"
                }}>
                  {m.icon}
                </div>
                <span style={{ fontSize: isPhone ? 10 : 11, fontWeight: 600, color: BRAND.ink, textAlign: "center", lineHeight: 1.2 }}>
                  {m.label}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Bottom safe area */}
        <div style={{ height: 34, background: BRAND.cream }} />
      </div>

      {/* Caratteristiche */}
      <div style={{ marginTop: 32, maxWidth: frameW, color: "#bbb", fontSize: 13, lineHeight: 1.8 }}>
        <h3 style={{ color: "#fff", fontSize: 16, fontWeight: 700, marginBottom: 8 }}>Caratteristiche Proposta A</h3>
        <div>• <strong>Griglia icone compatta</strong> — 4 colonne iPad, 3 iPhone. Tap target ≥ 48pt</div>
        <div>• <strong>Accesso rapido</strong> — 3 azioni frequenti sempre visibili senza scroll</div>
        <div>• <strong>Saluto personalizzato</strong> — nome utente + orario contestuale (Buongiorno/sera)</div>
        <div>• <strong>Zero scroll su iPad</strong> — tutti i moduli visibili senza scorrere</div>
        <div>• <strong>Brand leggero</strong> — gobbette + wordmark, senza card bianca gigante</div>
        <div style={{ marginTop: 8, color: "#777" }}>Ideale per chi usa TRGB come launcher: apri, scegli modulo, lavora.</div>
      </div>
    </div>
  );
}
