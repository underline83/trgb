import { useState } from "react";

/*  ─── PROPOSTA B — "Dashboard Hub"  ────────────────────────
    Ispirazione: app gestionali moderne (Notion, Linear, Arc)
    - Header con saluto + data
    - Widget "Oggi" con dati live (prenotazioni, scadenze, cassa)
    - Sezione azioni rapide (grandi tap target)
    - Lista moduli compatta in basso
    - Pensata per dare VALUE alla home, non solo navigazione
    ──────────────────────────────────────────────────────── */

const BRAND = { red: "#E8402B", green: "#2EB872", blue: "#2E7BE8", ink: "#111111", cream: "#F4F1EC" };

const WIDGETS = [
  { label: "Prenotazioni oggi", value: "12", sub: "4 pranzo · 8 cena", icon: "📅", accent: BRAND.blue },
  { label: "Fatture da registrare", value: "3", sub: "€ 2.840 totale", icon: "📦", accent: BRAND.red },
  { label: "Incasso ieri", value: "€ 3.420", sub: "+12% vs media", icon: "💵", accent: BRAND.green },
];

const QUICK = [
  { icon: "🧾", label: "Chiusura Turno", desc: "Compila fine servizio", accent: BRAND.red },
  { icon: "📅", label: "Nuova Prenotazione", desc: "Aggiungi coperti", accent: BRAND.blue },
  { icon: "🍷", label: "Cerca Vino", desc: "Cantina e giacenze", accent: BRAND.green },
  { icon: "📘", label: "Nuova Ricetta", desc: "Food cost", accent: "#F97316" },
];

const MODULES = [
  { icon: "🍷", label: "Vini", color: "#F59E0B" },
  { icon: "📦", label: "Acquisti", color: "#14B8A6" },
  { icon: "💵", label: "Vendite", color: "#6366F1" },
  { icon: "📘", label: "Ricette", color: "#F97316" },
  { icon: "🏦", label: "Flussi Cassa", color: "#10B981" },
  { icon: "🎯", label: "Controllo Gestione", color: "#0EA5E9" },
  { icon: "📈", label: "Statistiche", color: "#F43F5E" },
  { icon: "📅", label: "Prenotazioni", color: "#6366F1" },
  { icon: "🤝", label: "Clienti", color: "#14B8A6" },
  { icon: "👥", label: "Dipendenti", color: "#A855F7" },
  { icon: "⚙️", label: "Impostazioni", color: "#737373" },
];

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

export default function PropostaB() {
  const [device, setDevice] = useState("ipad");
  const isPhone = device === "iphone";
  const frameW = isPhone ? 390 : 820;
  const frameH = isPhone ? 844 : 1100;

  return (
    <div style={{ fontFamily: "'Helvetica Neue', Arial, sans-serif", background: "#1a1a1a", minHeight: "100vh", padding: 32, color: "#fff" }}>
      <h1 style={{ fontSize: 28, fontWeight: 800, marginBottom: 4 }}>Proposta B — Dashboard Hub</h1>
      <p style={{ color: "#999", fontSize: 14, marginBottom: 24 }}>La home diventa un cruscotto: dati del giorno + azioni rapide + moduli.</p>

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

      <div style={{
        width: frameW, maxWidth: "100%", height: frameH, borderRadius: 32,
        background: BRAND.cream, overflow: "hidden", boxShadow: "0 25px 60px rgba(0,0,0,.5)",
        border: "3px solid #333", display: "flex", flexDirection: "column"
      }}>
        {/* Status bar */}
        <div style={{ height: 48, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 24px" }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: BRAND.ink }}>9:41</span>
          <span style={{ fontSize: 12, color: "#999" }}>⚡ 87%</span>
        </div>

        {/* Scrollable */}
        <div style={{ flex: 1, overflowY: "auto", padding: isPhone ? "0 16px 32px" : "0 28px 32px" }}>

          {/* ── Header con saluto ── */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24, padding: "0 4px" }}>
            <div>
              <h1 style={{ fontSize: isPhone ? 24 : 30, fontWeight: 800, color: BRAND.ink, margin: 0, letterSpacing: -0.5 }}>
                Buongiorno, Marco
              </h1>
              <p style={{ fontSize: 13, color: "#999", margin: "4px 0 0" }}>Sabato 12 aprile 2026</p>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <Gobbette size={isPhone ? 20 : 26} />
            </div>
          </div>

          {/* ── Widget "Oggi" ── */}
          <div style={{
            display: "grid",
            gridTemplateColumns: isPhone ? "1fr" : "repeat(3, 1fr)",
            gap: 12, marginBottom: 28
          }}>
            {WIDGETS.map((w, i) => (
              <div key={i} style={{
                background: "#fff", borderRadius: 16, padding: isPhone ? "14px 16px" : "18px 20px",
                boxShadow: "0 2px 8px rgba(0,0,0,.05)", border: "1px solid #e5e5e5",
                display: "flex", alignItems: "flex-start", gap: 14
              }}>
                <div style={{
                  width: 44, height: 44, borderRadius: 14, background: w.accent + "14",
                  display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, flexShrink: 0
                }}>{w.icon}</div>
                <div>
                  <div style={{ fontSize: 11, fontWeight: 600, color: "#999", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4 }}>
                    {w.label}
                  </div>
                  <div style={{ fontSize: 24, fontWeight: 800, color: BRAND.ink, lineHeight: 1 }}>{w.value}</div>
                  <div style={{ fontSize: 11, color: "#999", marginTop: 4 }}>{w.sub}</div>
                </div>
              </div>
            ))}
          </div>

          {/* ── Azioni Rapide ── */}
          <h3 style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1.5, color: "#999", marginBottom: 12, paddingLeft: 4 }}>
            Azioni rapide
          </h3>
          <div style={{
            display: "grid",
            gridTemplateColumns: isPhone ? "repeat(2, 1fr)" : "repeat(4, 1fr)",
            gap: 10, marginBottom: 28
          }}>
            {QUICK.map((q, i) => (
              <div key={i} style={{
                background: "#fff", borderRadius: 16, padding: "16px",
                boxShadow: "0 2px 8px rgba(0,0,0,.05)", border: "1px solid #e5e5e5",
                cursor: "pointer", textAlign: "center"
              }}>
                <div style={{
                  width: 48, height: 48, borderRadius: 14, background: q.accent + "14",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 24, margin: "0 auto 10px"
                }}>{q.icon}</div>
                <div style={{ fontSize: 13, fontWeight: 700, color: BRAND.ink, marginBottom: 2 }}>{q.label}</div>
                <div style={{ fontSize: 10, color: "#999" }}>{q.desc}</div>
              </div>
            ))}
          </div>

          {/* ── Tutti i Moduli (lista compatta) ── */}
          <h3 style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1.5, color: "#999", marginBottom: 12, paddingLeft: 4 }}>
            Tutti i moduli
          </h3>
          <div style={{ background: "#fff", borderRadius: 16, overflow: "hidden", border: "1px solid #e5e5e5", boxShadow: "0 2px 8px rgba(0,0,0,.05)" }}>
            {MODULES.map((m, i) => (
              <div key={i} style={{
                display: "flex", alignItems: "center", padding: "14px 16px", cursor: "pointer",
                borderBottom: i < MODULES.length - 1 ? "1px solid #f0f0f0" : "none",
                gap: 14
              }}>
                <div style={{
                  width: 36, height: 36, borderRadius: 10, background: m.color + "18",
                  display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, flexShrink: 0
                }}>{m.icon}</div>
                <span style={{ fontSize: 14, fontWeight: 600, color: BRAND.ink, flex: 1 }}>{m.label}</span>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#ccc" strokeWidth="2.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                </svg>
              </div>
            ))}
          </div>

          <div style={{ height: 32 }} />
        </div>

        <div style={{ height: 34, background: BRAND.cream }} />
      </div>

      {/* Caratteristiche */}
      <div style={{ marginTop: 32, maxWidth: frameW, color: "#bbb", fontSize: 13, lineHeight: 1.8 }}>
        <h3 style={{ color: "#fff", fontSize: 16, fontWeight: 700, marginBottom: 8 }}>Caratteristiche Proposta B</h3>
        <div>• <strong>Dashboard con dati live</strong> — prenotazioni, fatture, incassi visibili appena apri l'app</div>
        <div>• <strong>Azioni rapide contestuali</strong> — le 4 azioni più usate con tap target grandi (48pt+)</div>
        <div>• <strong>Lista moduli compatta</strong> — tutti i moduli in poco spazio, stile Settings iOS</div>
        <div>• <strong>Adattamento intelligente</strong> — widget in riga su iPad, impilati su iPhone</div>
        <div>• <strong>La home dà valore</strong> — non è solo un launcher ma un cruscotto operativo</div>
        <div style={{ marginTop: 8, color: "#777" }}>Ideale per chi apre TRGB più volte al giorno e vuole un colpo d'occhio sui numeri chiave.</div>
      </div>
    </div>
  );
}
