// frontend/src/pages/public/CartaClienti.jsx
// @version: v2.0 — sessione 58 fase 2 iter 4 (2026-04-25)
//
// Pagina pubblica della Carta Vini & Bevande per il cliente al tavolo (QR).
// Identita' Osteria Tre Gobbi (Cormorant Garamond, palette beige/marrone).
//
// Nuova struttura (v2): indice iniziale + drill-down per sezione.
// L'indice raggruppa le sezioni in due macro: VINI e BEVANDE.
// Tap su una sezione → drill-down dedicato con back e prev/next.
//
// Sezioni VINI:
//   - "calici"            → vini al calice (incluse bottiglie in mescita)
//   - "vini-tip-<nome>"   → una per tipologia (Rossi, Bianchi, Bollicine, …)
//
// Sezioni BEVANDE:
//   - "bev-<key>"         → una per sezione bevande (aperitivi, birre, …)
//   - Render per layout: tabella_4col, scheda_estesa, nome_badge_desc.
//
// Endpoint dati: GET /vini/carta-cliente/data (pubblico, ritorna anche bevande).

import React, { useState, useEffect, useMemo } from "react";
import { API_BASE } from "../../config/api";

// ─────────────────────────────────────────────────────────────
// CSS (token osteria — Cormorant Garamond + palette beige/terracotta)
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
@media (min-width: 1024px) { .cc-shell { max-width: 680px; } }

/* ── Header con logo ── */
.cc-header {
  text-align: center;
  padding: 28px 18px 22px;
  border-bottom: 1px solid #c5a97a;
  margin: 0 -18px 18px;
  background: #fdf8f0;
}
.cc-header-logo {
  display: block;
  margin: 0 auto 14px;
  width: 200px;
  max-width: 70%;
  height: auto;
}
.cc-header-subtitle {
  font-size: 13px;
  color: #5a4634;
  letter-spacing: 0.22em;
  text-transform: uppercase;
}
.cc-header-date {
  font-size: 12px;
  color: #8a7a65;
  font-style: italic;
  margin-top: 6px;
}

/* ── Top bar drill-down (back + breadcrumb) ── */
.cc-topbar {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 0;
  margin: 0 -18px 8px;
  padding-left: 18px;
  padding-right: 18px;
  background: #fdf8f0;
  border-bottom: 1px solid #c5a97a;
  position: sticky;
  top: 0;
  z-index: 10;
}
.cc-back {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  border-radius: 16px;
  font-size: 13px;
  color: #5a4634;
  background: #ffffff;
  border: 1px solid #c5a97a;
  cursor: pointer;
  font-family: inherit;
}
.cc-back:hover { background: #f3e9d4; }
.cc-topbar-title {
  flex: 1;
  text-align: center;
  font-size: 11px;
  color: #8a7a65;
  letter-spacing: 0.18em;
  text-transform: uppercase;
}

/* ── Search ── */
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
.cc-search:focus { border-color: #5b2c1a; background: #ffffff; }
.cc-search::placeholder { color: #8a7a65; font-style: italic; }

/* ── Indice ── */
.cc-indice-label {
  font-size: 10px;
  color: #8a7a65;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  text-align: center;
  margin: 18px 0 10px;
}
.cc-indice-macro {
  font-family: "Cormorant Garamond", serif;
  font-size: 18px;
  font-weight: 400;
  text-transform: uppercase;
  letter-spacing: 0.32em;
  color: #5a4634;
  text-align: center;
  margin: 22px 0 6px;
  padding-bottom: 6px;
  border-bottom: 1px solid #c5a97a;
}
.cc-indice-voce {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 12px;
  padding: 13px 4px;
  border-bottom: 1px dotted #d8c8a8;
  cursor: pointer;
  transition: background 0.15s;
}
.cc-indice-voce:hover { background: #fdf8f0; }
.cc-indice-voce-titolo {
  font-size: 17px;
  font-weight: 600;
  color: #2b2118;
  letter-spacing: 0.04em;
}
.cc-indice-voce-titolo.cc-titolo-calici { color: #5b2c1a; }
.cc-indice-voce-sottotit {
  font-size: 11px;
  color: #5a4634;
  font-style: italic;
  margin-top: 2px;
}
.cc-indice-voce-meta {
  display: flex;
  align-items: baseline;
  gap: 10px;
}
.cc-indice-count {
  font-size: 12px;
  color: #8a7a65;
  font-style: italic;
}
.cc-indice-chevron {
  font-size: 18px;
  color: #c5a97a;
}

/* ── Vino — voce semplice ── */
.cc-tipologia {
  text-align: center;
  font-size: 21px;
  font-weight: 700;
  color: #2b2118;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  padding: 24px 0 8px;
  border-bottom: 1px solid #b89b6d;
  margin-bottom: 14px;
}
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
.cc-nazione {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 14px;
  margin: 22px 0 8px;
}
.cc-nazione-line { display: inline-block; width: 30px; height: 0; border-top: 1px solid #c5a97a; }
.cc-nazione-label { font-size: 14px; font-weight: 600; color: #5a4634; letter-spacing: 0.2em; }
.cc-regione { text-align: center; font-size: 15px; font-weight: 700; color: #3b2814; margin: 14px 0 8px; }
.cc-produttore { font-size: 15px; font-weight: 700; color: #2b2118; padding-left: 12px; margin-top: 12px; margin-bottom: 4px; }

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
.cc-vino-nome { color: #2b2118; flex: 1; min-width: 0; }
.cc-vino-nome em { font-style: italic; color: #2b2118; }
.cc-vino-annata { color: #5a4634; font-style: italic; margin-left: 4px; }
.cc-vino-prezzi { display: flex; gap: 10px; align-items: baseline; white-space: nowrap; flex-shrink: 0; }
.cc-vino-prezzo { font-weight: 700; color: #2b2118; white-space: nowrap; font-variant-numeric: tabular-nums; }
.cc-vino-prezzo-calice {
  font-size: 13px;
  font-weight: 600;
  color: #5a4634;
  font-style: italic;
  font-variant-numeric: tabular-nums;
}
.cc-vino-prezzo-calice::before { content: "🥂 "; font-style: normal; }

/* ── Calice item ── */
.cc-calice-item { padding: 9px 8px 9px 12px; border-bottom: 1px dotted #d8c8a8; }
.cc-calice-item:last-child { border-bottom: none; }
.cc-calice-row { display: flex; justify-content: space-between; align-items: baseline; gap: 12px; }
.cc-calice-nome { font-size: 16px; font-weight: 600; color: #2b2118; }
.cc-calice-meta { font-size: 12px; color: #5a4634; margin-top: 2px; }
.cc-calice-prezzo {
  font-size: 15px;
  font-weight: 700;
  color: #2b2118;
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
  flex-shrink: 0;
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

/* ── Bevande — 3 pattern ── */
/* Pattern A: tabella 4 colonne (distillati, amari & liquori) */
.cc-bev-table-group {
  font-size: 17px;
  text-transform: uppercase;
  font-weight: 700;
  color: #3b2814;
  letter-spacing: 0.16em;
  margin: 16px 0 6px;
  text-align: center;
}
.cc-bev-table { width: 100%; border-collapse: collapse; margin-bottom: 10px; }
.cc-bev-table td { padding: 5px 6px; vertical-align: top; font-size: 14px; }
.cc-bev-table td.b4-ctx { width: 22%; color: #5a4634; font-style: italic; }
.cc-bev-table td.b4-prod { width: 25%; font-weight: 600; }
.cc-bev-table td.b4-nome { width: 43%; }
.cc-bev-table td.b4-prezzo { width: 10%; text-align: right; font-weight: 700; white-space: nowrap; }
.cc-bev-table tr.b4-desc-row td {
  font-size: 12px;
  color: #7a6b5a;
  padding-top: 0;
  padding-bottom: 7px;
  padding-left: 22px;
  font-style: italic;
}

/* Pattern B: scheda estesa (birre, aperitivi, amari casa) */
.cc-bev-scheda { padding: 8px 4px; border-bottom: 1px dotted #d8c8a8; }
.cc-bev-scheda:last-child { border-bottom: none; }
.cc-bev-scheda-head { display: flex; justify-content: space-between; align-items: baseline; gap: 11px; }
.cc-bev-scheda-nome { font-size: 17px; font-weight: 700; color: #2b2118; }
.cc-bev-scheda-sottotit { font-size: 13px; font-style: italic; color: #5a4634; margin-left: 4px; font-weight: 400; }
.cc-bev-scheda-prezzo { font-weight: 700; color: #2b2118; white-space: nowrap; font-variant-numeric: tabular-nums; flex-shrink: 0; }
.cc-bev-scheda-meta { font-size: 13px; color: #5a4634; margin-top: 1px; }
.cc-bev-scheda-desc { font-size: 14px; color: #2b2118; margin-top: 3px; line-height: 1.5; }

/* Pattern C: nome + badge + desc (tisane, te) */
.cc-bev-badge-item { padding: 8px 4px; border-bottom: 1px dotted #d8c8a8; }
.cc-bev-badge-item:last-child { border-bottom: none; }
.cc-bev-badge-head { display: flex; align-items: center; gap: 11px; flex-wrap: wrap; }
.cc-bev-badge-nome { font-size: 16px; font-weight: 700; color: #2b2118; }
.cc-bev-badge-prezzo { margin-left: auto; font-weight: 700; color: #2b2118; white-space: nowrap; font-variant-numeric: tabular-nums; }
.cc-bev-badge {
  display: inline-block;
  padding: 2px 11px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}
.cc-bev-badge-meta { font-size: 12px; color: #7a6b5a; margin-top: 3px; font-style: italic; }
.cc-bev-badge-desc { font-size: 14px; color: #2b2118; margin-top: 3px; line-height: 1.5; }

/* ── Footer prev/next sezione ── */
.cc-prev-next {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 28px;
  padding: 12px 0;
  border-top: 1px solid #c5a97a;
  font-size: 13px;
  color: #5a4634;
}
.cc-prev-next button {
  background: none;
  border: none;
  font-family: inherit;
  font-size: inherit;
  color: #5a4634;
  cursor: pointer;
  padding: 6px 10px;
}
.cc-prev-next button:hover { color: #5b2c1a; }
.cc-prev-next .cc-pn-current { font-style: italic; color: #8a7a65; }

/* ── Empty / loading ── */
.cc-empty { text-align: center; padding: 40px 20px; color: #8a7a65; font-style: italic; font-size: 15px; }
.cc-loading { text-align: center; padding: 80px 20px; color: #8a7a65; font-style: italic; font-size: 16px; }

/* ── Footer ── */
.cc-footer {
  text-align: center;
  font-size: 12px;
  color: #8a7a65;
  font-style: italic;
  margin-top: 50px;
  padding-top: 18px;
  border-top: 1px solid #e4d8c0;
}

/* ── iPad portrait+ ── */
@media (min-width: 768px) {
  .cc-shell { padding: 0 28px 80px; }
  .cc-header { padding: 36px 0 24px; margin: 0 -28px 22px; padding-left: 28px; padding-right: 28px; }
  .cc-header-logo { width: 260px; max-width: 60%; }
  .cc-header-subtitle { font-size: 14px; letter-spacing: 0.24em; }
  .cc-topbar { margin: 0 -28px 8px; padding-left: 28px; padding-right: 28px; }
  .cc-indice-voce-titolo { font-size: 19px; }
  .cc-indice-voce-sottotit { font-size: 12px; }
  .cc-tipologia { font-size: 24px; }
  .cc-section-title { font-size: 26px; }
  .cc-nazione-label { font-size: 15px; }
  .cc-regione { font-size: 16px; }
  .cc-produttore { font-size: 16px; }
  .cc-vino { font-size: 16px; padding: 6px 8px 6px 14px; }
  .cc-calice-nome { font-size: 17px; }
  .cc-calice-meta { font-size: 13px; }
  .cc-bev-scheda-nome { font-size: 19px; }
  .cc-bev-scheda-desc { font-size: 15px; }
  .cc-bev-badge-nome { font-size: 17px; }
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
function fmtPrezzoBev(voce) {
  if (voce.prezzo_label) return String(voce.prezzo_label);
  if (voce.prezzo_eur == null || voce.prezzo_eur === 0 || voce.prezzo_eur === "") return "";
  return `€ ${Number(voce.prezzo_eur).toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
function matchSearch(testo, query) {
  if (!query) return true;
  const q = query.toLowerCase().trim();
  if (!q) return true;
  return (testo || "").toLowerCase().includes(q);
}

// Palette badge per tè / tisane (replicata da carta_bevande_service)
const BADGE_COLORS_TE = {
  nero:   { bg: "#5b3a29", color: "#ffffff" },
  verde:  { bg: "#5a7a3a", color: "#ffffff" },
  oolong: { bg: "#b36b2a", color: "#ffffff" },
  rosso:  { bg: "#a33c2a", color: "#ffffff" },
  puer:   { bg: "#3a2e24", color: "#ffffff" },
  bianco: { bg: "#e9e3d4", color: "#2b2118" },
  tisana: { bg: "#7a6b5a", color: "#ffffff" },
};
const BADGE_FALLBACK = { bg: "#efe6d6", color: "#5a4634" };

// ─────────────────────────────────────────────────────────────
// Componente
// ─────────────────────────────────────────────────────────────
export default function CartaClienti() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState("");
  const [sezioneAperta, setSezioneAperta] = useState(null); // null = indice

  useEffect(() => {
    document.title = "Carta vini & bevande · Osteria Tre Gobbi";
    let alive = true;
    fetch(`${API_BASE}/vini/carta-cliente/data`)
      .then(r => { if (!r.ok) throw new Error(`Errore ${r.status}`); return r.json(); })
      .then(json => { if (alive) { setData(json); setLoading(false); } })
      .catch(e => { if (alive) { setError(e.message); setLoading(false); } });
    return () => { alive = false; };
  }, []);

  // Lista piatta delle sezioni (per indice + navigazione prev/next)
  const sezioni = useMemo(() => {
    if (!data) return [];
    const out = [];
    // Vini: calici + tipologie
    if ((data.calici || []).length > 0) {
      out.push({ id: "calici", titolo: "🥂 Al calice", count: data.calici.length, gruppo: "vini" });
    }
    (data.tipologie || []).forEach(t => {
      const totVini = t.nazioni.reduce(
        (a, n) => a + n.regioni.reduce((b, r) => b + r.produttori.reduce((c, p) => c + p.vini.length, 0), 0),
        0
      );
      const nazioniNomi = t.nazioni.map(n => n.nome.charAt(0) + n.nome.slice(1).toLowerCase()).slice(0, 3).join(", ");
      out.push({
        id: `vini-tip-${t.nome}`,
        titolo: t.nome.charAt(0) + t.nome.slice(1).toLowerCase(),
        sottotitolo: nazioniNomi || null,
        count: totVini,
        gruppo: "vini",
        tipologiaRef: t,
      });
    });
    // Bevande
    (data.bevande || []).forEach(b => {
      out.push({
        id: `bev-${b.key}`,
        titolo: b.nome,
        count: (b.voci || []).length,
        gruppo: "bevande",
        bevandaRef: b,
      });
    });
    return out;
  }, [data]);

  const sezioneCorrente = useMemo(() => {
    if (!sezioneAperta) return null;
    return sezioni.find(s => s.id === sezioneAperta) || null;
  }, [sezioni, sezioneAperta]);

  const sezioneIndex = useMemo(() => {
    if (!sezioneCorrente) return -1;
    return sezioni.findIndex(s => s.id === sezioneCorrente.id);
  }, [sezioni, sezioneCorrente]);

  // Reset search quando cambio sezione (UX: ricerca per sezione corrente)
  useEffect(() => { setSearch(""); }, [sezioneAperta]);

  // ─────────────────────────────────────────────────────────
  // Loading / error
  // ─────────────────────────────────────────────────────────
  if (loading) {
    return (
      <>
        <style>{STYLE}</style>
        <div className="carta-clienti-root"><div className="cc-shell">
          <div className="cc-loading">Caricamento carta…</div>
        </div></div>
      </>
    );
  }
  if (error || !data) {
    return (
      <>
        <style>{STYLE}</style>
        <div className="carta-clienti-root"><div className="cc-shell">
          <div className="cc-loading" style={{ color: "#a04000" }}>
            Carta non disponibile.<br />
            <span style={{ fontSize: 13 }}>{error || "Riprova tra qualche istante."}</span>
          </div>
        </div></div>
      </>
    );
  }

  // ─────────────────────────────────────────────────────────
  // Render INDICE (homepage)
  // ─────────────────────────────────────────────────────────
  if (!sezioneCorrente) {
    const sezioniVini = sezioni.filter(s => s.gruppo === "vini");
    const sezioniBev = sezioni.filter(s => s.gruppo === "bevande");
    return (
      <>
        <style>{STYLE}</style>
        <div className="carta-clienti-root">
          <div className="cc-shell">
            <header className="cc-header">
              <img className="cc-header-logo" src={`${API_BASE}/static/img/logo_tregobbi.png`} alt="Osteria Tre Gobbi" />
              <div className="cc-header-subtitle">Carta vini &amp; bevande</div>
              <div className="cc-header-date">Aggiornata al {data.data_aggiornamento}</div>
            </header>

            <input
              type="text"
              className="cc-search"
              placeholder="Cerca un vino, un cocktail, un amaro…"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />

            {search ? (
              <RisultatiRicerca data={data} sezioni={sezioni} search={search} onApri={setSezioneAperta} />
            ) : (
              <>
                {sezioniVini.length > 0 && (
                  <>
                    <div className="cc-indice-macro">Vini</div>
                    {sezioniVini.map(s => (
                      <VoceIndice key={s.id} voce={s} onClick={() => setSezioneAperta(s.id)} />
                    ))}
                  </>
                )}
                {sezioniBev.length > 0 && (
                  <>
                    <div className="cc-indice-macro">Bevande</div>
                    {sezioniBev.map(s => (
                      <VoceIndice key={s.id} voce={s} onClick={() => setSezioneAperta(s.id)} />
                    ))}
                  </>
                )}
              </>
            )}

            <div className="cc-footer">
              {search ? "" : "tocca una sezione per esplorare"}
            </div>
          </div>
        </div>
      </>
    );
  }

  // ─────────────────────────────────────────────────────────
  // Render SEZIONE (drill-down)
  // ─────────────────────────────────────────────────────────
  const sezPrev = sezioneIndex > 0 ? sezioni[sezioneIndex - 1] : null;
  const sezNext = sezioneIndex < sezioni.length - 1 ? sezioni[sezioneIndex + 1] : null;

  return (
    <>
      <style>{STYLE}</style>
      <div className="carta-clienti-root">
        <div className="cc-shell">
          <div className="cc-topbar">
            <button type="button" className="cc-back" onClick={() => setSezioneAperta(null)}>‹ Indice</button>
            <span className="cc-topbar-title">{sezioneCorrente.titolo} · {sezioneCorrente.count}</span>
          </div>

          <input
            type="text"
            className="cc-search"
            placeholder={`Cerca in ${sezioneCorrente.titolo}…`}
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ marginBottom: 8 }}
          />

          <SezioneRender sezione={sezioneCorrente} data={data} search={search} />

          <div className="cc-prev-next">
            {sezPrev ? (
              <button type="button" onClick={() => setSezioneAperta(sezPrev.id)}>‹ {sezPrev.titolo}</button>
            ) : <span></span>}
            <span className="cc-pn-current">{sezioneCorrente.titolo}</span>
            {sezNext ? (
              <button type="button" onClick={() => setSezioneAperta(sezNext.id)}>{sezNext.titolo} ›</button>
            ) : <span></span>}
          </div>

          <div className="cc-footer">Osteria Tre Gobbi · Carta aggiornata in tempo reale</div>
        </div>
      </div>
    </>
  );
}

// ─────────────────────────────────────────────────────────────
// Sub-componenti
// ─────────────────────────────────────────────────────────────
function VoceIndice({ voce, onClick }) {
  return (
    <div className="cc-indice-voce" onClick={onClick} role="button" tabIndex={0}
         onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") onClick(); }}>
      <div>
        <div className={`cc-indice-voce-titolo ${voce.id === "calici" ? "cc-titolo-calici" : ""}`}>{voce.titolo}</div>
        {voce.sottotitolo && <div className="cc-indice-voce-sottotit">{voce.sottotitolo}</div>}
      </div>
      <div className="cc-indice-voce-meta">
        <span className="cc-indice-count">{voce.count}</span>
        <span className="cc-indice-chevron">›</span>
      </div>
    </div>
  );
}

function RisultatiRicerca({ data, sezioni, search, onApri }) {
  // Mostra una lista compatta di tutti i match cross-sezione, raggruppati per sezione.
  const q = search.toLowerCase().trim();
  const out = [];
  // Calici
  (data.calici || []).forEach(c => {
    const blob = `${c.descrizione} ${c.produttore} ${c.regione} ${c.tipologia} ${c.annata}`;
    if (blob.toLowerCase().includes(q)) out.push({ tipo: "calice", sezId: "calici", item: c });
  });
  // Vini bottiglia
  (data.tipologie || []).forEach(t => {
    t.nazioni.forEach(n => n.regioni.forEach(r => r.produttori.forEach(p => p.vini.forEach(v => {
      const blob = `${v.descrizione} ${p.nome} ${r.nome} ${n.nome} ${t.nome} ${v.annata}`;
      if (blob.toLowerCase().includes(q)) out.push({
        tipo: "vino", sezId: `vini-tip-${t.nome}`, sezTitolo: t.nome, regione: r.nome, produttore: p.nome, item: v,
      });
    }))));
  });
  // Bevande
  (data.bevande || []).forEach(b => {
    (b.voci || []).forEach(v => {
      const blob = `${v.nome} ${v.sottotitolo || ""} ${v.descrizione || ""} ${v.produttore || ""} ${v.regione || ""} ${v.tipologia || ""}`;
      if (blob.toLowerCase().includes(q)) out.push({
        tipo: "bevanda", sezId: `bev-${b.key}`, sezTitolo: b.nome, item: v, layout: b.layout,
      });
    });
  });

  if (out.length === 0) {
    return <div className="cc-empty">Nessun risultato per «{search}».</div>;
  }

  return (
    <div style={{ marginTop: 14 }}>
      <div className="cc-indice-label">{out.length} risultat{out.length === 1 ? "o" : "i"}</div>
      {out.map((r, i) => (
        <div key={i} className="cc-indice-voce" onClick={() => onApri(r.sezId)}>
          <div>
            <div className="cc-indice-voce-titolo" style={{ fontSize: 15 }}>
              {r.tipo === "calice" || r.tipo === "vino"
                ? <>{r.item.descrizione} {r.item.annata && <span style={{ color: "#5a4634", fontStyle: "italic", fontWeight: 400 }}>{r.item.annata}</span>}</>
                : r.item.nome}
            </div>
            <div className="cc-indice-voce-sottotit">
              {r.tipo === "calice" && <>🥂 Al calice · {r.item.produttore || ""}</>}
              {r.tipo === "vino" && <>{r.sezTitolo} · {r.produttore || ""} · {r.regione || ""}</>}
              {r.tipo === "bevanda" && <>{r.sezTitolo}{r.item.produttore ? ` · ${r.item.produttore}` : ""}</>}
            </div>
          </div>
          <span className="cc-indice-chevron">›</span>
        </div>
      ))}
    </div>
  );
}

function SezioneRender({ sezione, data, search }) {
  if (sezione.id === "calici") return <SezioneCalici calici={data.calici} search={search} />;
  if (sezione.id.startsWith("vini-tip-")) return <SezioneVini tipologia={sezione.tipologiaRef} search={search} />;
  if (sezione.id.startsWith("bev-")) return <SezioneBevande sezione={sezione.bevandaRef} search={search} />;
  return null;
}

function SezioneCalici({ calici, search }) {
  const filtered = (calici || []).filter(c => {
    const blob = `${c.descrizione} ${c.produttore} ${c.regione} ${c.tipologia} ${c.annata}`;
    return matchSearch(blob, search);
  });
  if (filtered.length === 0) return <div className="cc-empty">Nessun calice corrisponde.</div>;
  return (
    <section>
      <div className="cc-section-title">Al calice</div>
      {filtered.map(c => (
        <div key={c.id} className="cc-calice-item">
          <div className="cc-calice-row">
            <div style={{ minWidth: 0, flex: 1 }}>
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
  );
}

function SezioneVini({ tipologia, search }) {
  // Filtra in profondità preservando struttura
  const t = tipologia;
  const nazioni = t.nazioni.map(n => ({
    ...n,
    regioni: n.regioni.map(r => ({
      ...r,
      produttori: r.produttori.map(p => ({
        ...p,
        vini: p.vini.filter(v => {
          const blob = `${v.descrizione} ${p.nome} ${r.nome} ${n.nome} ${t.nome} ${v.annata}`;
          return matchSearch(blob, search);
        }),
      })).filter(p => p.vini.length > 0),
    })).filter(reg => reg.produttori.length > 0),
  })).filter(n => n.regioni.length > 0);

  if (nazioni.length === 0) {
    return <div className="cc-empty">Nessun vino corrisponde.</div>;
  }

  return (
    <section>
      <div className="cc-tipologia">{t.nome}</div>
      {nazioni.map(n => (
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
                      <div className="cc-vino-prezzi">
                        {v.prezzo_calice != null && (
                          <span className="cc-vino-prezzo-calice">{fmtPrezzo(v.prezzo_calice)} €</span>
                        )}
                        <span className="cc-vino-prezzo">{fmtPrezzo(v.prezzo)} €</span>
                      </div>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          ))}
        </div>
      ))}
    </section>
  );
}

function SezioneBevande({ sezione, search }) {
  const voci = (sezione.voci || []).filter(v => {
    const blob = `${v.nome} ${v.sottotitolo || ""} ${v.descrizione || ""} ${v.produttore || ""} ${v.regione || ""} ${v.tipologia || ""}`;
    return matchSearch(blob, search);
  });
  if (voci.length === 0) return <div className="cc-empty">Nessuna voce corrisponde.</div>;

  const layout = sezione.layout || "scheda_estesa";

  return (
    <section>
      <div className="cc-section-title">{sezione.nome}</div>
      {sezione.intro_html && (
        <div style={{ fontStyle: "italic", color: "#5a4634", textAlign: "center", margin: "0 auto 14px", fontSize: 14 }}
             dangerouslySetInnerHTML={{ __html: sezione.intro_html }} />
      )}
      {layout === "tabella_4col" && <BevTabella4Col voci={voci} />}
      {layout === "scheda_estesa" && <BevSchedaEstesa voci={voci} />}
      {layout === "nome_badge_desc" && <BevNomeBadgeDesc voci={voci} />}
    </section>
  );
}

// Pattern A — tabella 4 colonne
function BevTabella4Col({ voci }) {
  // Raggruppa per regione (o tipologia se manca)
  const grupOrder = [];
  const grupMap = {};
  voci.forEach(v => {
    const key = v.regione || v.tipologia || "—";
    if (!grupMap[key]) { grupMap[key] = []; grupOrder.push(key); }
    grupMap[key].push(v);
  });
  return (
    <>
      {grupOrder.map(g => (
        <div key={g}>
          <div className="cc-bev-table-group">{g}</div>
          <table className="cc-bev-table">
            <tbody>
              {grupMap[g].map(v => (
                <React.Fragment key={v.id}>
                  <tr>
                    <td className="b4-ctx">{v.regione || ""}</td>
                    <td className="b4-prod">{v.produttore || ""}</td>
                    <td className="b4-nome">
                      {v.nome}
                      {v.sottotitolo && <span style={{ fontStyle: "italic", color: "#5a4634" }}> · {v.sottotitolo}</span>}
                    </td>
                    <td className="b4-prezzo">{fmtPrezzoBev(v)}</td>
                  </tr>
                  {v.descrizione && (
                    <tr className="b4-desc-row">
                      <td colSpan={4}>{v.descrizione}</td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </>
  );
}

// Pattern B — scheda estesa
function BevSchedaEstesa({ voci }) {
  return voci.map(v => {
    const meta = [
      v.produttore,
      v.regione,
      v.formato,
      v.gradazione != null ? `${v.gradazione}%` : null,
      v.ibu != null ? `IBU ${v.ibu}` : null,
    ].filter(Boolean).join(" · ");
    return (
      <div key={v.id} className="cc-bev-scheda">
        <div className="cc-bev-scheda-head">
          <div style={{ flex: 1, minWidth: 0 }}>
            <span className="cc-bev-scheda-nome">{v.nome}</span>
            {v.sottotitolo && <span className="cc-bev-scheda-sottotit"> · {v.sottotitolo}</span>}
          </div>
          {fmtPrezzoBev(v) && <div className="cc-bev-scheda-prezzo">{fmtPrezzoBev(v)}</div>}
        </div>
        {meta && <div className="cc-bev-scheda-meta">{meta}</div>}
        {v.descrizione && <div className="cc-bev-scheda-desc">{v.descrizione}</div>}
      </div>
    );
  });
}

// Pattern C — nome + badge + descrizione (tisane / tè)
function BevNomeBadgeDesc({ voci }) {
  return voci.map(v => {
    const tipo = (v.tipologia || "").toLowerCase().trim();
    const palette = BADGE_COLORS_TE[tipo] || BADGE_FALLBACK;
    const meta = v.paese_origine || "";
    return (
      <div key={v.id} className="cc-bev-badge-item">
        <div className="cc-bev-badge-head">
          <span className="cc-bev-badge-nome">{v.nome}</span>
          {v.tipologia && (
            <span className="cc-bev-badge" style={{ background: palette.bg, color: palette.color }}>
              {v.tipologia}
            </span>
          )}
          {!v.tipologia && v.sottotitolo && (
            <span className="cc-bev-badge" style={{ background: BADGE_FALLBACK.bg, color: BADGE_FALLBACK.color }}>
              {v.sottotitolo}
            </span>
          )}
          {fmtPrezzoBev(v) && <span className="cc-bev-badge-prezzo">{fmtPrezzoBev(v)}</span>}
        </div>
        {meta && <div className="cc-bev-badge-meta">{meta}</div>}
        {v.descrizione && <div className="cc-bev-badge-desc">{v.descrizione}</div>}
      </div>
    );
  });
}
