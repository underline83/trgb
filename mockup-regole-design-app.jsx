import { useState } from "react";

/*  ─── REGOLE DESIGN — Pagine Interne App  ─────────────────
    Riferimento visivo per come strutturare le pagine interne
    quando TRGB diventa app iPad/iPhone via Capacitor.
    ──────────────────────────────────────────────────────── */

const BRAND = { red: "#E8402B", green: "#2EB872", blue: "#2E7BE8", ink: "#111111", cream: "#F4F1EC" };

function Section({ title, children }) {
  return (
    <div style={{ marginBottom: 40 }}>
      <h2 style={{ fontSize: 20, fontWeight: 800, color: "#fff", marginBottom: 16, borderBottom: "2px solid #333", paddingBottom: 8 }}>{title}</h2>
      {children}
    </div>
  );
}

function DeviceFrame({ width, height, label, children }) {
  return (
    <div style={{ display: "inline-block", marginRight: 24, marginBottom: 16, verticalAlign: "top" }}>
      <div style={{ fontSize: 11, fontWeight: 600, color: "#666", marginBottom: 8, textAlign: "center" }}>{label}</div>
      <div style={{
        width, height, borderRadius: 24, background: BRAND.cream, overflow: "hidden",
        boxShadow: "0 15px 40px rgba(0,0,0,.4)", border: "2px solid #444",
        display: "flex", flexDirection: "column"
      }}>
        {children}
      </div>
    </div>
  );
}

export default function RegoleDesign() {
  const [activeRule, setActiveRule] = useState(0);

  const rules = [
    {
      title: "1. Navigazione",
      content: (
        <div style={{ display: "flex", gap: 32, flexWrap: "wrap" }}>
          {/* iPad */}
          <DeviceFrame width={600} height={420} label="iPad — Header fisso + sidebar collassabile">
            <div style={{ display: "flex", flex: 1 }}>
              {/* Sidebar */}
              <div style={{ width: 220, background: "#fff", borderRight: "1px solid #e5e5e5", padding: "16px 0", overflowY: "auto" }}>
                <div style={{ padding: "8px 16px", display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                  <div style={{ width: 32, height: 32, borderRadius: 8, background: BRAND.blue + "18", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16 }}>📅</div>
                  <span style={{ fontSize: 14, fontWeight: 700, color: BRAND.ink }}>Prenotazioni</span>
                </div>
                {["Planning", "Mappa Tavoli", "Settimana", "Editor Tavoli", "Impostazioni"].map((s, i) => (
                  <div key={i} style={{
                    padding: "10px 16px 10px 24px", fontSize: 13, color: i === 0 ? BRAND.blue : "#666",
                    fontWeight: i === 0 ? 600 : 400, background: i === 0 ? BRAND.blue + "0a" : "transparent",
                    borderLeft: i === 0 ? `3px solid ${BRAND.blue}` : "3px solid transparent",
                    cursor: "pointer"
                  }}>{s}</div>
                ))}
              </div>
              {/* Content */}
              <div style={{ flex: 1, padding: 20, background: BRAND.cream }}>
                <div style={{ fontSize: 11, color: "#999", fontWeight: 600, marginBottom: 4 }}>PRENOTAZIONI</div>
                <div style={{ fontSize: 20, fontWeight: 800, color: BRAND.ink, marginBottom: 16 }}>Planning — 12 aprile</div>
                <div style={{ background: "#fff", borderRadius: 12, height: 200, border: "1px solid #e5e5e5", display: "flex", alignItems: "center", justifyContent: "center", color: "#ccc" }}>
                  [contenuto pagina]
                </div>
              </div>
            </div>
          </DeviceFrame>

          {/* iPhone */}
          <DeviceFrame width={300} height={420} label="iPhone — Nav a stack, back button">
            <div style={{ background: "#fff", borderBottom: "1px solid #e5e5e5", padding: "12px 16px", display: "flex", alignItems: "center", gap: 8 }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={BRAND.blue} strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
              <span style={{ fontSize: 15, fontWeight: 700, color: BRAND.ink }}>Planning</span>
              <span style={{ flex: 1 }} />
              <span style={{ fontSize: 12, color: BRAND.blue, fontWeight: 600 }}>Oggi</span>
            </div>
            <div style={{ flex: 1, padding: 16, background: BRAND.cream }}>
              <div style={{ background: "#fff", borderRadius: 12, height: 280, border: "1px solid #e5e5e5", display: "flex", alignItems: "center", justifyContent: "center", color: "#ccc", fontSize: 13 }}>
                [contenuto full-width]
              </div>
            </div>
          </DeviceFrame>
        </div>
      )
    },
    {
      title: "2. Touch Target & Spacing",
      content: (
        <div>
          <div style={{ display: "flex", gap: 32, flexWrap: "wrap", marginBottom: 24 }}>
            {/* Correct */}
            <div>
              <div style={{ fontSize: 12, fontWeight: 600, color: BRAND.green, marginBottom: 8 }}>✅ CORRETTO — min 44pt</div>
              <div style={{ background: "#222", borderRadius: 12, padding: 20, display: "flex", flexDirection: "column", gap: 8 }}>
                {["Chiusura Turno", "Cantina Vini", "Cerca Cliente"].map((l, i) => (
                  <div key={i} style={{
                    height: 48, background: "#fff", borderRadius: 12, display: "flex", alignItems: "center",
                    padding: "0 16px", fontSize: 14, fontWeight: 500, color: BRAND.ink, gap: 12,
                    border: "1px solid #e5e5e5"
                  }}>
                    <span>📌</span> {l}
                  </div>
                ))}
              </div>
            </div>
            {/* Wrong */}
            <div>
              <div style={{ fontSize: 12, fontWeight: 600, color: BRAND.red, marginBottom: 8 }}>❌ SBAGLIATO — troppo piccolo</div>
              <div style={{ background: "#222", borderRadius: 12, padding: 20, display: "flex", flexDirection: "column", gap: 2 }}>
                {["Chiusura Turno", "Cantina Vini", "Cerca Cliente", "Dashboard", "Import"].map((l, i) => (
                  <div key={i} style={{
                    height: 28, background: "#fff", borderRadius: 4, display: "flex", alignItems: "center",
                    padding: "0 8px", fontSize: 11, color: BRAND.ink,
                    border: "1px solid #e5e5e5"
                  }}>
                    {l}
                  </div>
                ))}
              </div>
            </div>
          </div>
          <div style={{ color: "#bbb", fontSize: 13, lineHeight: 1.8 }}>
            <div><strong style={{color:"#fff"}}>Regole touch:</strong></div>
            <div>• Tap target minimo: <strong>44 × 44 pt</strong> (Apple HIG)</div>
            <div>• Spacing tra elementi tappabili: <strong>≥ 8pt</strong></div>
            <div>• Bottoni primari: <strong>48pt altezza</strong>, full-width su iPhone</div>
            <div>• Righe tabella: <strong>≥ 48pt altezza</strong> (non 28pt come desktop)</div>
            <div>• Label sopra input, MAI affiancate su iPhone</div>
          </div>
        </div>
      )
    },
    {
      title: "3. Componenti App-Ready",
      content: (
        <div style={{ display: "flex", gap: 24, flexWrap: "wrap" }}>
          {/* Card / Tile */}
          <div style={{ width: 300 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: "#999", marginBottom: 8 }}>CARD / TILE</div>
            <div style={{ background: "#fff", borderRadius: 16, padding: 20, border: "1px solid #e5e5e5" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
                <div style={{ width: 44, height: 44, borderRadius: 12, background: BRAND.blue + "14", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22 }}>📊</div>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: BRAND.ink }}>Statistiche</div>
                  <div style={{ fontSize: 11, color: "#999" }}>Analisi vendite e trend</div>
                </div>
              </div>
              <div style={{ fontSize: 11, color: "#777", borderTop: "1px solid #f0f0f0", paddingTop: 10 }}>
                borderRadius: 16, padding: 20, minHeight touch: 88pt
              </div>
            </div>
          </div>

          {/* List row */}
          <div style={{ width: 300 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: "#999", marginBottom: 8 }}>RIGA LISTA</div>
            <div style={{ background: "#fff", borderRadius: 16, overflow: "hidden", border: "1px solid #e5e5e5" }}>
              {["Brunello 2019 — 6 bt", "Barolo 2020 — 12 bt", "Amarone 2018 — 3 bt"].map((w, i) => (
                <div key={i} style={{
                  padding: "14px 16px", display: "flex", alignItems: "center", gap: 12,
                  borderBottom: i < 2 ? "1px solid #f0f0f0" : "none"
                }}>
                  <div style={{ width: 36, height: 36, borderRadius: 10, background: "#FEF3C7", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16 }}>🍷</div>
                  <span style={{ fontSize: 13, fontWeight: 500, color: BRAND.ink, flex: 1 }}>{w}</span>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#ccc" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
                </div>
              ))}
            </div>
            <div style={{ fontSize: 11, color: "#777", marginTop: 8 }}>
              Altezza riga: ≥ 48pt, icona 36pt, chevron a destra
            </div>
          </div>

          {/* Bottoni */}
          <div style={{ width: 300 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: "#999", marginBottom: 8 }}>BOTTONI</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <button style={{
                height: 48, borderRadius: 14, background: BRAND.blue, color: "#fff", border: "none",
                fontSize: 15, fontWeight: 700, cursor: "pointer", width: "100%"
              }}>Salva Prenotazione</button>
              <button style={{
                height: 48, borderRadius: 14, background: "#fff", color: BRAND.blue, border: `2px solid ${BRAND.blue}`,
                fontSize: 15, fontWeight: 600, cursor: "pointer", width: "100%"
              }}>Annulla</button>
              <button style={{
                height: 48, borderRadius: 14, background: "#fff", color: BRAND.red, border: `2px solid ${BRAND.red}22`,
                fontSize: 14, fontWeight: 600, cursor: "pointer", width: "100%"
              }}>Elimina</button>
            </div>
            <div style={{ fontSize: 11, color: "#777", marginTop: 8 }}>
              48pt altezza, borderRadius 14, full-width su iPhone
            </div>
          </div>

          {/* Input */}
          <div style={{ width: 300 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: "#999", marginBottom: 8 }}>INPUT FORM</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: "#666", marginBottom: 4, display: "block" }}>Nome cliente</label>
                <div style={{
                  height: 48, borderRadius: 12, border: "1.5px solid #d4d4d4", background: "#fff",
                  display: "flex", alignItems: "center", padding: "0 14px", fontSize: 15, color: "#999"
                }}>Mario Rossi</div>
              </div>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: "#666", marginBottom: 4, display: "block" }}>Coperti</label>
                <div style={{
                  height: 48, borderRadius: 12, border: "1.5px solid #d4d4d4", background: "#fff",
                  display: "flex", alignItems: "center", padding: "0 14px", fontSize: 15, color: "#999"
                }}>4</div>
              </div>
            </div>
            <div style={{ fontSize: 11, color: "#777", marginTop: 8 }}>
              48pt altezza, label SOPRA, borderRadius 12, font 15pt
            </div>
          </div>
        </div>
      )
    },
    {
      title: "4. Layout Responsivo",
      content: (
        <div style={{ color: "#bbb", fontSize: 13, lineHeight: 2 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24, marginBottom: 24 }}>
            <div style={{ background: "#222", borderRadius: 12, padding: 20 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: "#fff", marginBottom: 12 }}>📱 iPad (≥ 768px)</div>
              <div>• Sidebar navigazione modulo: 220px fissi</div>
              <div>• Griglia contenuto: 2-3 colonne</div>
              <div>• Tabelle: tutte le colonne visibili</div>
              <div>• Form: campi su 2-3 colonne</div>
              <div>• Dialog/modal: max-width 560px, centrati</div>
              <div>• Tab bar in basso OPPURE sidebar, mai entrambi</div>
            </div>
            <div style={{ background: "#222", borderRadius: 12, padding: 20 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: "#fff", marginBottom: 12 }}>📱 iPhone (< 768px)</div>
              <div>• Niente sidebar: navigazione a stack (push/pop)</div>
              <div>• Griglia: 1 colonna, full-width</div>
              <div>• Tabelle: card-list o scroll orizzontale</div>
              <div>• Form: campi impilati, 1 per riga</div>
              <div>• Dialog: full-screen sheet dal basso</div>
              <div>• Tab bar: sempre visibile, max 5 voci</div>
            </div>
          </div>

          <div style={{ background: "#222", borderRadius: 12, padding: 20 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: "#fff", marginBottom: 12 }}>📐 Breakpoint</div>
            <div style={{ display: "grid", gridTemplateColumns: "120px 1fr 1fr", gap: "4px 16px" }}>
              <div style={{ fontWeight: 700, color: "#999" }}>Token</div>
              <div style={{ fontWeight: 700, color: "#999" }}>Range</div>
              <div style={{ fontWeight: 700, color: "#999" }}>Dispositivo</div>
              <div>sm</div><div>≥ 640px</div><div>iPhone landscape</div>
              <div>md</div><div>≥ 768px</div><div>iPad portrait</div>
              <div>lg</div><div>≥ 1024px</div><div>iPad landscape</div>
              <div>xl</div><div>≥ 1280px</div><div>iPad Pro / Desktop</div>
            </div>
          </div>
        </div>
      )
    },
    {
      title: "5. Palette & Tipografia App",
      content: (
        <div>
          <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginBottom: 24 }}>
            {[
              { name: "brand-cream", hex: BRAND.cream, use: "Sfondo pagine", dark: false },
              { name: "brand-ink", hex: BRAND.ink, use: "Testo principale", dark: true },
              { name: "brand-red", hex: BRAND.red, use: "Errori, alert, gobbetta 1", dark: true },
              { name: "brand-green", hex: BRAND.green, use: "Successo, gobbetta 2", dark: true },
              { name: "brand-blue", hex: BRAND.blue, use: "Link, CTA, gobbetta 3", dark: true },
              { name: "brand-night", hex: "#0E0E10", use: "Dark mode (futuro)", dark: true },
            ].map((c, i) => (
              <div key={i} style={{ width: 140, textAlign: "center" }}>
                <div style={{
                  width: 140, height: 80, borderRadius: 14, background: c.hex,
                  border: c.dark ? "none" : "2px solid #ddd",
                  display: "flex", alignItems: "flex-end", justifyContent: "center", padding: 8,
                  marginBottom: 6
                }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: c.dark ? "#fff" : BRAND.ink }}>{c.hex}</span>
                </div>
                <div style={{ fontSize: 11, fontWeight: 700, color: "#fff" }}>{c.name}</div>
                <div style={{ fontSize: 10, color: "#999" }}>{c.use}</div>
              </div>
            ))}
          </div>

          <div style={{ color: "#bbb", fontSize: 13, lineHeight: 2 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: "#fff", marginBottom: 8 }}>Tipografia App</div>
            <div>• Font sistema: <strong>SF Pro (iOS)</strong> — NON caricare font custom per performance</div>
            <div>• Titoli pagina: <strong>22pt bold</strong> (era text-4xl, ridotto per mobile)</div>
            <div>• Titoli sezione: <strong>15pt semibold</strong></div>
            <div>• Corpo: <strong>15pt regular</strong> (standard iOS)</div>
            <div>• Label: <strong>12pt medium, uppercase, tracking wider</strong></div>
            <div>• Caption/badge: <strong>11pt</strong></div>
            <div style={{ marginTop: 12 }}>
              <strong style={{color:"#fff"}}>Nota:</strong> font-playfair (serif) resta per titoli hub nella versione web.
              Nell'app nativa si usa il font di sistema per coerenza con iOS.
            </div>
          </div>
        </div>
      )
    },
  ];

  return (
    <div style={{ fontFamily: "'Helvetica Neue', Arial, sans-serif", background: "#1a1a1a", minHeight: "100vh", padding: 32, color: "#fff" }}>
      <h1 style={{ fontSize: 28, fontWeight: 800, marginBottom: 4 }}>Regole Design — Pagine Interne App</h1>
      <p style={{ color: "#999", fontSize: 14, marginBottom: 24 }}>Linee guida per mantenere coerenza quando si costruiscono le pagine interne, iPad-first.</p>

      {/* Tab navigation */}
      <div style={{ display: "flex", gap: 4, marginBottom: 32, flexWrap: "wrap" }}>
        {rules.map((r, i) => (
          <button key={i} onClick={() => setActiveRule(i)}
            style={{
              padding: "10px 16px", borderRadius: 10, fontSize: 12, fontWeight: 600,
              background: activeRule === i ? BRAND.blue : "#2a2a2a",
              color: activeRule === i ? "#fff" : "#999",
              border: "none", cursor: "pointer", whiteSpace: "nowrap"
            }}>
            {r.title}
          </button>
        ))}
      </div>

      {/* Active rule content */}
      <div style={{ maxWidth: 1000 }}>
        {rules[activeRule].content}
      </div>

      {/* Summary box */}
      <div style={{ marginTop: 48, background: "#222", borderRadius: 16, padding: 24, maxWidth: 800 }}>
        <h3 style={{ fontSize: 16, fontWeight: 700, color: "#fff", marginBottom: 12 }}>Riepilogo Regole Chiave</h3>
        <div style={{ color: "#bbb", fontSize: 13, lineHeight: 2 }}>
          <div><strong style={{color: BRAND.red}}>1.</strong> Tap target minimo 44pt, bottoni 48pt, righe lista 48pt</div>
          <div><strong style={{color: BRAND.green}}>2.</strong> iPad: sidebar 220px per navigazione modulo. iPhone: navigazione a stack</div>
          <div><strong style={{color: BRAND.blue}}>3.</strong> Sfondo SEMPRE brand-cream, nessun bg-neutral/bg-gray</div>
          <div><strong style={{color: BRAND.red}}>4.</strong> borderRadius: 16 card, 14 bottoni, 12 input — coerenti ovunque</div>
          <div><strong style={{color: BRAND.green}}>5.</strong> Nessun hover-only: ogni interazione deve funzionare con tap</div>
          <div><strong style={{color: BRAND.blue}}>6.</strong> Form iPhone: 1 campo per riga, label sopra, full-width</div>
          <div><strong style={{color: BRAND.red}}>7.</strong> Tabelle iPhone: convertire in card-list o scroll orizzontale</div>
          <div><strong style={{color: BRAND.green}}>8.</strong> Safe area: padding-top per notch, padding-bottom per home indicator</div>
          <div><strong style={{color: BRAND.blue}}>9.</strong> Font di sistema su app nativa, font-playfair solo su web</div>
          <div><strong style={{color: BRAND.red}}>10.</strong> Colori modulo invariati, palette brand per elementi trasversali</div>
        </div>
      </div>
    </div>
  );
}
