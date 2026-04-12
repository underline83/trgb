import { useState } from "react";

/*  ─── PROPOSTA C — "Tab Bar + Sezioni"  ────────────────────
    Ispirazione: app native iOS (HotSchedules, Toast, Lightspeed)
    - Tab bar fissa in basso con 5 moduli principali
    - Home = dashboard con sezioni "widget" pieghevoli
    - Navigazione primaria = tab bar (sempre visibile)
    - Navigazione secondaria = menu hamburger per moduli extra
    - Pattern standard app nativa, zero curva di apprendimento
    ──────────────────────────────────────────────────────── */

const BRAND = { red: "#E8402B", green: "#2EB872", blue: "#2E7BE8", ink: "#111111", cream: "#F4F1EC" };

const TABS = [
  { icon: "🏠", label: "Home", active: true },
  { icon: "📅", label: "Prenota" },
  { icon: "🍷", label: "Cantina" },
  { icon: "💵", label: "Vendite" },
  { icon: "☰", label: "Altro" },
];

const TODAY_ITEMS = [
  { time: "12:30", name: "Fam. Rossi", pax: 4, note: "Allergia glutine", status: "conf" },
  { time: "12:30", name: "Bianchi", pax: 2, note: "", status: "conf" },
  { time: "13:00", name: "Tavolo aziendale", pax: 8, note: "Menu degustazione", status: "conf" },
  { time: "20:00", name: "De Luca", pax: 6, note: "Compleanno", status: "conf" },
  { time: "20:30", name: "Colombo", pax: 2, note: "", status: "pend" },
  { time: "21:00", name: "Ferrari", pax: 4, note: "Seconda volta", status: "conf" },
];

const ALERTS = [
  { icon: "📦", text: "3 fatture da registrare", accent: BRAND.red },
  { icon: "📋", text: "Buste paga aprile scadenza martedì", accent: "#F59E0B" },
  { icon: "🍷", text: "2 vini sotto scorta minima", accent: BRAND.blue },
];

const MORE_MODULES = [
  { icon: "📦", label: "Acquisti", color: "#14B8A6" },
  { icon: "📘", label: "Ricette", color: "#F97316" },
  { icon: "🏦", label: "Flussi Cassa", color: "#10B981" },
  { icon: "🎯", label: "Controllo Gestione", color: "#0EA5E9" },
  { icon: "📈", label: "Statistiche", color: "#F43F5E" },
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

export default function PropostaC() {
  const [device, setDevice] = useState("ipad");
  const [activeTab, setActiveTab] = useState(0);
  const [showMore, setShowMore] = useState(false);
  const isPhone = device === "iphone";
  const frameW = isPhone ? 390 : 820;
  const frameH = isPhone ? 844 : 1100;

  return (
    <div style={{ fontFamily: "'Helvetica Neue', Arial, sans-serif", background: "#1a1a1a", minHeight: "100vh", padding: 32, color: "#fff" }}>
      <h1 style={{ fontSize: 28, fontWeight: 800, marginBottom: 4 }}>Proposta C — Tab Bar Nativa</h1>
      <p style={{ color: "#999", fontSize: 14, marginBottom: 24 }}>Pattern app nativa con tab bar fissa + home dashboard con widget sezioni.</p>

      <div style={{ display: "flex", gap: 8, marginBottom: 24 }}>
        {["ipad", "iphone"].map(d => (
          <button key={d} onClick={() => { setDevice(d); setShowMore(false); setActiveTab(0); }}
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
        border: "3px solid #333", display: "flex", flexDirection: "column", position: "relative"
      }}>
        {/* Status bar */}
        <div style={{ height: 48, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 24px" }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: BRAND.ink }}>9:41</span>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Gobbette size={18} />
            <span style={{ fontSize: 15, fontWeight: 800, color: BRAND.ink }}>TRGB</span>
          </div>
          <span style={{ fontSize: 12, color: "#999" }}>⚡ 87%</span>
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflowY: "auto", padding: isPhone ? "0 16px 16px" : "0 28px 16px" }}>

          {activeTab === 0 && !showMore && (
            <>
              {/* Saluto */}
              <div style={{ marginBottom: 20, padding: "0 4px" }}>
                <h1 style={{ fontSize: isPhone ? 22 : 28, fontWeight: 800, color: BRAND.ink, margin: 0 }}>
                  Buongiorno, Marco
                </h1>
                <p style={{ fontSize: 13, color: "#999", margin: "2px 0 0" }}>Sabato 12 aprile · Pranzo + Cena</p>
              </div>

              {/* ── Alert / Notifiche ── */}
              <div style={{ marginBottom: 20 }}>
                {ALERTS.map((a, i) => (
                  <div key={i} style={{
                    display: "flex", alignItems: "center", gap: 10, padding: "10px 14px",
                    background: "#fff", borderRadius: i === 0 ? "14px 14px 2px 2px" : i === ALERTS.length - 1 ? "2px 2px 14px 14px" : "2px",
                    marginBottom: 1, border: "1px solid #e5e5e5", cursor: "pointer"
                  }}>
                    <span style={{ fontSize: 16 }}>{a.icon}</span>
                    <span style={{ fontSize: 13, fontWeight: 500, color: BRAND.ink, flex: 1 }}>{a.text}</span>
                    <div style={{ width: 8, height: 8, borderRadius: 4, background: a.accent }} />
                  </div>
                ))}
              </div>

              {/* ── Prenotazioni Oggi ── */}
              <div style={{ marginBottom: 20 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10, padding: "0 4px" }}>
                  <h3 style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1.5, color: "#999", margin: 0 }}>
                    Prenotazioni oggi
                  </h3>
                  <span style={{ fontSize: 20, fontWeight: 800, color: BRAND.blue }}>
                    {TODAY_ITEMS.reduce((s, t) => s + t.pax, 0)} pax
                  </span>
                </div>
                <div style={{ background: "#fff", borderRadius: 16, overflow: "hidden", border: "1px solid #e5e5e5" }}>
                  {TODAY_ITEMS.map((r, i) => (
                    <div key={i} style={{
                      display: "flex", alignItems: "center", padding: isPhone ? "10px 12px" : "12px 16px",
                      borderBottom: i < TODAY_ITEMS.length - 1 ? "1px solid #f0f0f0" : "none", gap: 12
                    }}>
                      <span style={{ fontSize: 12, fontWeight: 700, color: BRAND.ink, width: 42, flexShrink: 0 }}>{r.time}</span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: BRAND.ink }}>{r.name}</div>
                        {r.note && <div style={{ fontSize: 11, color: "#999", marginTop: 1 }}>{r.note}</div>}
                      </div>
                      <div style={{
                        fontSize: 13, fontWeight: 700, color: BRAND.ink, width: 32, textAlign: "center"
                      }}>{r.pax}</div>
                      <div style={{
                        width: 8, height: 8, borderRadius: 4,
                        background: r.status === "conf" ? BRAND.green : "#F59E0B"
                      }} />
                    </div>
                  ))}
                </div>
              </div>

              {/* ── Quick Stats ── */}
              <div style={{
                display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 20
              }}>
                <div style={{ background: "#fff", borderRadius: 14, padding: "16px", border: "1px solid #e5e5e5" }}>
                  <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", color: "#999", letterSpacing: 0.5, marginBottom: 6 }}>Incasso ieri</div>
                  <div style={{ fontSize: 22, fontWeight: 800, color: BRAND.ink }}>€ 3.420</div>
                  <div style={{ fontSize: 11, color: BRAND.green, fontWeight: 600, marginTop: 2 }}>+12% vs media</div>
                </div>
                <div style={{ background: "#fff", borderRadius: 14, padding: "16px", border: "1px solid #e5e5e5" }}>
                  <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", color: "#999", letterSpacing: 0.5, marginBottom: 6 }}>Coperti MTD</div>
                  <div style={{ fontSize: 22, fontWeight: 800, color: BRAND.ink }}>342</div>
                  <div style={{ fontSize: 11, color: BRAND.blue, fontWeight: 600, marginTop: 2 }}>vs 310 anno scorso</div>
                </div>
              </div>
            </>
          )}

          {/* ── "Altro" Tab — griglia moduli extra ── */}
          {showMore && (
            <>
              <div style={{ marginBottom: 16, padding: "0 4px" }}>
                <h2 style={{ fontSize: 22, fontWeight: 800, color: BRAND.ink, margin: 0 }}>Tutti i moduli</h2>
              </div>
              <div style={{
                display: "grid", gridTemplateColumns: isPhone ? "repeat(2, 1fr)" : "repeat(4, 1fr)", gap: 10
              }}>
                {MORE_MODULES.map((m, i) => (
                  <div key={i} style={{
                    background: "#fff", borderRadius: 16, padding: "20px 12px", textAlign: "center",
                    border: "1px solid #e5e5e5", cursor: "pointer"
                  }}>
                    <div style={{
                      width: 48, height: 48, borderRadius: 14, background: m.color + "18",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: 24, margin: "0 auto 10px"
                    }}>{m.icon}</div>
                    <div style={{ fontSize: 12, fontWeight: 600, color: BRAND.ink }}>{m.label}</div>
                  </div>
                ))}
              </div>
            </>
          )}

        </div>

        {/* ── Tab Bar ── */}
        <div style={{
          background: "#fff", borderTop: "1px solid #e0e0e0",
          display: "flex", justifyContent: "space-around", alignItems: "flex-start",
          padding: "8px 0 0", paddingBottom: 28
        }}>
          {TABS.map((t, i) => {
            const isActive = (i === 0 && !showMore) || (i === 4 && showMore);
            return (
              <button key={i}
                onClick={() => {
                  if (i === 4) { setShowMore(true); setActiveTab(4); }
                  else { setShowMore(false); setActiveTab(i); }
                }}
                style={{
                  background: "none", border: "none", cursor: "pointer",
                  display: "flex", flexDirection: "column", alignItems: "center", gap: 2,
                  padding: "4px 12px", minWidth: 56
                }}>
                <span style={{ fontSize: 22 }}>{t.icon}</span>
                <span style={{
                  fontSize: 10, fontWeight: 600,
                  color: isActive ? BRAND.blue : "#999"
                }}>{t.label}</span>
                {isActive && <div style={{ width: 4, height: 4, borderRadius: 2, background: BRAND.blue, marginTop: 2 }} />}
              </button>
            );
          })}
        </div>
      </div>

      {/* Caratteristiche */}
      <div style={{ marginTop: 32, maxWidth: frameW, color: "#bbb", fontSize: 13, lineHeight: 1.8 }}>
        <h3 style={{ color: "#fff", fontSize: 16, fontWeight: 700, marginBottom: 8 }}>Caratteristiche Proposta C</h3>
        <div>• <strong>Tab bar fissa</strong> — 4 moduli principali + "Altro", sempre raggiungibili con un tap</div>
        <div>• <strong>Dashboard operativa</strong> — alert, prenotazioni del giorno, stats, tutto senza navigare</div>
        <div>• <strong>Pattern nativo</strong> — identico alle app iOS che il personale già conosce</div>
        <div>• <strong>Prenotazioni in primo piano</strong> — lista del giorno sempre visibile, con pax totali</div>
        <div>• <strong>"Altro" organizzato</strong> — griglia per i moduli meno frequenti</div>
        <div style={{ marginTop: 8, color: "#777" }}>Ideale per la transizione a Capacitor/app nativa: tab bar = navigazione primaria dell'app.</div>
      </div>
    </div>
  );
}
