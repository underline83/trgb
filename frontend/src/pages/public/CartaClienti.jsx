// frontend/src/pages/public/CartaClienti.jsx
// @version: v1.0 — sessione 58 fase 2 (2026-04-25)
//
// Pagina pubblica della Carta Vini per il cliente al tavolo (QR code).
// Identità tipografica osteria Tre Gobbi: Cormorant Garamond + palette
// beige/avorio/marrone/terracotta. Mobile-first, ottimizzata iPhone +
// iPad portrait/landscape.
//
// Funzionalità v1:
// - Search live (filtra in tempo reale per descrizione, vitigno, regione,
//   produttore, annata)
// - Filtri tipologia rapidi a chip (incluso 🥂 Calici)
// - Sezione Calici evidenziata in cima (con badge "in mescita" se
//   BOTTIGLIA_APERTA=1)
// - Bottiglie raggruppate per tipologia → nazione → regione → produttore
// - Niente login, niente JS pesante, niente note degustative (Fase 3 futura)
//
// Endpoint dati: GET /vini/carta-cliente/data (pubblico, no auth)
//
// CSS: token osteria definiti inline qui per non dipendere dal CSS preview
// del PDF/HTML (che vive in static/css). Useremo CSS-in-JS minimale via
// <style> in testa al body.

import React, { useState, useEffect, useMemo } from "react";
import { API_BASE } from "../../config/api";

// ─────────────────────────────────────────────────────────────
// Token visivi (palette osteria)
// ─────────────────────────────────────────────────────────────
const STYLE = `
@import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@400;500;600;700&display=swap');

.carta-clienti-root {
  font-family: "Cormorant Garamond", "Times New Roman", serif;
  background: #ffffff;
  color: #2b2118;
  min-height: 100vh;
  padding: 0;
  margin: 0;
  -webkit-font-smoothing: antialiased;
  text-rendering: optimizeLegibility;
}

.cc-shell {
  max-width: 580px;
  margin: 0 auto;
  padding: 0 18px 60px;
  box-sizing: border-box;
}

@media (min-width: 1024px) {
  .cc-shell { max-width: 680px; }
}

/* Header */
.cc-header {
  text-align: center;
  padding: 26px 0 18px;
  border-bottom: 1px solid #c5a97a;
  margin-bottom: 18px;
  background: #fdf8f0;
  margin-left: -18px;
  margin-right: -18px;
  padding-left: 18px;
  padding-right: 18px;
}
.cc-header-overline {
  font-size: 11px;
  color: #8a7a65;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  margin-bottom: 4px;
}
.cc-header-title {
  font-size: 30px;
  font-weight: 700;
  color: #2b2118;
  letter-spacing: 0.04em;
  line-height: 1.1;
}
.cc-header-subtitle {
  font-size: 12px;
  color: #5a4634;
  letter-spacing: 0.16em;
  margin-top: 6px;
  text-transform: uppercase;
}
.cc-header-date {
  font-size: 12px;
  color: #8a7a65;
  font-style: italic;
  margin-top: 6px;
}

/* Search bar */
.cc-search {
  width: 100%;
  padding: 11px 16px;
  font-size: 15px;
  border: 1px solid #c5a97a;
  border-radius: 24px;
  background: #fdf8f0;
  color: #2b2118;
  font-family: inherit;
  box-sizing: border-box;
  outline: none;
  transition: border-color 0.15s, background 0.15s;
}
.cc-search:focus {
  border-color: #5b2c1a;
  background: #ffffff;
}
.cc-search::placeholder { color: #8a7a65; font-style: italic; }

/* Chips filtri */
.cc-chips {
  display: flex;
  gap: 6px;
  overflow-x: auto;
  padding: 12px 0 4px;
  -webkit-overflow-scrolling: touch;
}
.cc-chips::-webkit-scrollbar { display: none; }
.cc-chip {
  padding: 6px 14px;
  font-size: 13px;
  border-radius: 16px;
  background: #fdf8f0;
  color: #5a4634;
  white-space: nowrap;
  border: 1px solid #c5a97a;
  cursor: pointer;
  transition: all 0.15s;
  font-family: inherit;
}
.cc-chip:hover { background: #f3e9d4; }
.cc-chip.cc-chip-active {
  background: #2b2118;
  color: #fdf8f0;
  border-color: #2b2118;
  font-weight: 600;
  letter-spacing: 0.04em;
}

/* Sezione titoli */
.cc-section-title {
  text-align: center;
  font-size: 22px;
  font-weight: 600;
  color: #5b2c1a;
  letter-spacing: 0.32em;
  text-transform: uppercase;
  padding: 22px 0 10px;
  border-bottom: 1px solid #c4a77d;
  margin-bottom: 14px;
}
.cc-tipologia {
  text-align: center;
  font-size: 19px;
  font-weight: 700;
  color: #2b2118;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  padding: 26px 0 8px;
  border-bottom: 1px solid #b89b6d;
  margin-bottom: 14px;
}
.cc-nazione {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 14px;
  margin: 22px 0 8px;
}
.cc-nazione-line {
  display: inline-block;
  width: 30px;
  height: 0;
  border-top: 1px solid #c5a97a;
}
.cc-nazione-label {
  font-size: 14px;
  font-weight: 600;
  color: #5a4634;
  letter-spacing: 0.2em;
}
.cc-regione {
  text-align: center;
  font-size: 15px;
  font-weight: 700;
  color: #3b2814;
  margin: 14px 0 8px;
}
.cc-produttore {
  font-size: 15px;
  font-weight: 700;
  color: #2b2118;
  padding-left: 12px;
  margin-top: 12px;
  margin-bottom: 4px;
}

/* Voce vino */
.cc-vino {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 12px;
  padding: 5px 8px 5px 12px;
  border-bottom: 1px dotted #d8c8a8;
  font-size: 15px;
}
.cc-vino:last-child { border-bottom: none; }
.cc-vino-nome { color: #2b2118; }
.cc-vino-nome em { font-style: italic; color: #2b2118; }
.cc-vino-annata { color: #5a4634; font-style: italic; margin-left: 4px; }
.cc-vino-prezzo {
  font-weight: 700;
  color: #2b2118;
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
}

/* Calice card */
.cc-calice-item {
  padding: 9px 8px 9px 12px;
  border-bottom: 1px dotted #d8c8a8;
}
.cc-calice-item:last-child { border-bottom: none; }
.cc-calice-row {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 12px;
}
.cc-calice-nome {
  font-size: 16px;
  font-weight: 600;
  color: #2b2118;
}
.cc-calice-meta {
  font-size: 12px;
  color: #5a4634;
  margin-top: 2px;
}
.cc-calice-prezzo {
  font-size: 15px;
  font-weight: 700;
  color: #2b2118;
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
}
.cc-calice-mescita {
  display: inline-block;
  font-size: 10px;
  font-style: italic;
  color: #a04000;
  background: #fff8ec;
  border: 1px solid #d8c8a8;
  border-radius: 8px;
  padding: 1px 7px;
  margin-left: 6px;
  letter-spacing: 0.04em;
}

/* Empty state */
.cc-empty {
  text-align: center;
  padding: 40px 20px;
  color: #8a7a65;
  font-style: italic;
  font-size: 15px;
}

/* Footer */
.cc-footer {
  text-align: center;
  font-size: 12px;
  color: #8a7a65;
  font-style: italic;
  margin-top: 50px;
  padding-top: 18px;
  border-top: 1px solid #e4d8c0;
}

/* iPad portrait+ */
@media (min-width: 768px) {
  .cc-shell { padding: 0 28px 80px; }
  .cc-header { padding: 36px 0 24px; margin-left: -28px; margin-right: -28px; padding-left: 28px; padding-right: 28px; }
  .cc-header-title { font-size: 36px; }
  .cc-header-subtitle { font-size: 13px; }
  .cc-section-title { font-size: 26px; }
  .cc-tipologia { font-size: 21px; }
  .cc-nazione-label { font-size: 15px; }
  .cc-regione { font-size: 16px; }
  .cc-produttore { font-size: 16px; }
  .cc-vino { font-size: 16px; padding: 6px 8px 6px 14px; }
  .cc-calice-nome { font-size: 17px; }
  .cc-calice-meta { font-size: 13px; }
}

/* Loading skeleton */
.cc-loading {
  text-align: center;
  padding: 80px 20px;
  color: #8a7a65;
  font-style: italic;
  font-size: 16px;
}
`;

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────
function fmtPrezzo(v) {
  if (v == null) return "—";
  const n = Number(v);
  if (!Number.isFinite(n)) return String(v);
  return n.toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function matchSearch(testo, query) {
  if (!query) return true;
  const q = query.toLowerCase().trim();
  if (!q) return true;
  return (testo || "").toLowerCase().includes(q);
}

// ─────────────────────────────────────────────────────────────
// Componente
// ─────────────────────────────────────────────────────────────
export default function CartaClienti() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState("");
  const [filtroTip, setFiltroTip] = useState("tutti");

  useEffect(() => {
    document.title = "Carta vini · Osteria Tre Gobbi";
    let alive = true;
    fetch(`${API_BASE}/vini/carta-cliente/data`)
      .then(r => {
        if (!r.ok) throw new Error(`Errore ${r.status}`);
        return r.json();
      })
      .then(json => { if (alive) { setData(json); setLoading(false); } })
      .catch(e => { if (alive) { setError(e.message); setLoading(false); } });
    return () => { alive = false; };
  }, []);

  // Tipologie disponibili (per chip)
  const tipologie = useMemo(() => {
    if (!data?.tipologie) return [];
    return data.tipologie.map(t => t.nome);
  }, [data]);

  // Filtra calici per search e per filtro tipologia (se "calici" selezionato
  // o "tutti", li mostro; se altra tipologia, li nascondo).
  const caliciFiltered = useMemo(() => {
    if (!data?.calici) return [];
    if (filtroTip !== "tutti" && filtroTip !== "calici") return [];
    return data.calici.filter(c => {
      const blob = `${c.descrizione || ""} ${c.produttore || ""} ${c.regione || ""} ${c.tipologia || ""} ${c.annata || ""}`;
      return matchSearch(blob, search);
    });
  }, [data, search, filtroTip]);

  // Filtra le tipologie/sezioni
  const tipologieFiltered = useMemo(() => {
    if (!data?.tipologie) return [];
    if (filtroTip === "calici") return []; // mostra solo calici
    return data.tipologie
      .filter(t => filtroTip === "tutti" || t.nome === filtroTip)
      .map(t => ({
        ...t,
        nazioni: t.nazioni.map(n => ({
          ...n,
          regioni: n.regioni.map(reg => ({
            ...reg,
            produttori: reg.produttori.map(p => ({
              ...p,
              vini: p.vini.filter(v => {
                const blob = `${v.descrizione || ""} ${p.nome || ""} ${reg.nome || ""} ${n.nome || ""} ${t.nome || ""} ${v.annata || ""}`;
                return matchSearch(blob, search);
              }),
            })).filter(p => p.vini.length > 0),
          })).filter(reg => reg.produttori.length > 0),
        })).filter(n => n.regioni.length > 0),
      }))
      .filter(t => t.nazioni.length > 0);
  }, [data, search, filtroTip]);

  if (loading) {
    return (
      <>
        <style>{STYLE}</style>
        <div className="carta-clienti-root">
          <div className="cc-shell">
            <div className="cc-loading">Caricamento carta vini…</div>
          </div>
        </div>
      </>
    );
  }

  if (error || !data) {
    return (
      <>
        <style>{STYLE}</style>
        <div className="carta-clienti-root">
          <div className="cc-shell">
            <div className="cc-loading" style={{ color: "#a04000" }}>
              Carta non disponibile al momento.<br />
              <span style={{ fontSize: 13 }}>{error || "Riprova tra qualche istante."}</span>
            </div>
          </div>
        </div>
      </>
    );
  }

  const totaleVisibile =
    caliciFiltered.length +
    tipologieFiltered.reduce(
      (acc, t) => acc + t.nazioni.reduce(
        (a, n) => a + n.regioni.reduce(
          (a2, r) => a2 + r.produttori.reduce((a3, p) => a3 + p.vini.length, 0),
          0
        ),
        0
      ),
      0
    );

  return (
    <>
      <style>{STYLE}</style>
      <div className="carta-clienti-root">
        <div className="cc-shell">

          {/* HEADER */}
          <header className="cc-header">
            <div className="cc-header-overline">Osteria</div>
            <div className="cc-header-title">TRE GOBBI</div>
            <div className="cc-header-subtitle">Carta dei vini</div>
            <div className="cc-header-date">Aggiornata al {data.data_aggiornamento}</div>
          </header>

          {/* SEARCH */}
          <input
            type="text"
            className="cc-search"
            placeholder="Cerca vino, vitigno, regione…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />

          {/* CHIPS FILTRO */}
          <div className="cc-chips">
            <button type="button" className={`cc-chip ${filtroTip === "tutti" ? "cc-chip-active" : ""}`}
              onClick={() => setFiltroTip("tutti")}>Tutti</button>
            <button type="button" className={`cc-chip ${filtroTip === "calici" ? "cc-chip-active" : ""}`}
              onClick={() => setFiltroTip("calici")}>🥂 Calici</button>
            {tipologie.map(t => (
              <button key={t} type="button"
                className={`cc-chip ${filtroTip === t ? "cc-chip-active" : ""}`}
                onClick={() => setFiltroTip(t)}>{t}</button>
            ))}
          </div>

          {/* EMPTY STATE */}
          {totaleVisibile === 0 && (
            <div className="cc-empty">
              {search
                ? <>Nessun vino trovato per «{search}».</>
                : <>Nessun vino disponibile in questa sezione.</>}
            </div>
          )}

          {/* SEZIONE CALICI */}
          {caliciFiltered.length > 0 && (
            <section>
              <div className="cc-section-title">Al calice</div>
              {caliciFiltered.map(c => (
                <div key={c.id} className="cc-calice-item">
                  <div className="cc-calice-row">
                    <div style={{ minWidth: 0 }}>
                      <div className="cc-calice-nome">
                        {c.descrizione}
                        {c.annata && <span className="cc-vino-annata"> {c.annata}</span>}
                        {c.in_mescita && <span className="cc-calice-mescita">in mescita</span>}
                      </div>
                      <div className="cc-calice-meta">
                        {[c.produttore, c.regione].filter(Boolean).join(" · ")}
                      </div>
                    </div>
                    <div className="cc-calice-prezzo">{fmtPrezzo(c.prezzo)} €</div>
                  </div>
                </div>
              ))}
            </section>
          )}

          {/* SEZIONI BOTTIGLIE */}
          {tipologieFiltered.map(t => (
            <section key={t.nome}>
              <div className="cc-tipologia">{t.nome}</div>
              {t.nazioni.map(n => (
                <div key={n.nome}>
                  <div className="cc-nazione">
                    <span className="cc-nazione-line"></span>
                    <span className="cc-nazione-label">{n.nome}</span>
                    <span className="cc-nazione-line"></span>
                  </div>
                  {n.regioni.map(r => (
                    <div key={r.nome}>
                      <div className="cc-regione">{r.nome}</div>
                      {r.produttori.map(p => (
                        <div key={p.nome}>
                          <div className="cc-produttore">{p.nome}</div>
                          {p.vini.map(v => (
                            <div key={v.id} className="cc-vino">
                              <div className="cc-vino-nome">
                                {v.descrizione}
                                {v.annata && <span className="cc-vino-annata">{v.annata}</span>}
                              </div>
                              <div className="cc-vino-prezzo">{fmtPrezzo(v.prezzo)} €</div>
                            </div>
                          ))}
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              ))}
            </section>
          ))}

          {/* FOOTER */}
          <div className="cc-footer">
            Osteria Tre Gobbi · Carta aggiornata in tempo reale
          </div>

        </div>
      </div>
    </>
  );
}
