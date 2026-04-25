// frontend/src/pages/vini/CartaStaff.jsx
// @version: v1.0 — sessione 58 fase 2 iter 5 (2026-04-25)
//
// Pagina staff sommelier: vista densa della carta vini con info live —
// codice, descrizione, prezzo bottiglia + calice, locazioni con qta,
// giacenza, badge status (in mescita / scarsa / in carta / esaurita).
//
// Stile osteria (Cormorant Garamond, palette beige/marrone/terracotta) +
// densità tabellare per consultazione veloce. Auto-refresh ogni 30s.
// Click su una riga → apre la scheda gestionale (`/vini/magazzino/:id`).
//
// Endpoint: GET /vini/magazzino/carta-staff/ (auth richiesta, di norma
// admin/sommelier/sala).

import React, { useState, useEffect, useMemo, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { API_BASE, apiFetch } from "../../config/api";
import ViniNav from "./ViniNav";
import { Btn } from "../../components/ui";

// ─────────────────────────────────────────────────────────────
// CSS (token osteria — coerente con CartaClienti.jsx)
// ─────────────────────────────────────────────────────────────
const STYLE = `
@import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@400;500;600;700&display=swap');

.cs-root {
  font-family: "Cormorant Garamond", "Times New Roman", serif;
  background: #fdf8f0;
  color: #2b2118;
  min-height: 100vh;
  -webkit-font-smoothing: antialiased;
  text-rendering: optimizeLegibility;
}
.cs-container {
  max-width: 1100px;
  margin: 0 auto;
  padding: 14px 16px 60px;
  box-sizing: border-box;
}

.cs-header {
  background: #ffffff;
  border: 1px solid #c5a97a;
  border-radius: 6px;
  padding: 14px 18px;
  margin-bottom: 14px;
}
.cs-header-title {
  font-size: 22px;
  font-weight: 700;
  color: #2b2118;
  letter-spacing: 0.04em;
  margin: 0;
}
.cs-header-sub {
  font-size: 12px;
  color: #5a4634;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  margin-top: 2px;
}
.cs-live {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 3px 10px;
  background: #5b2c1a;
  color: #fdf8f0;
  border-radius: 12px;
  font-size: 11px;
  letter-spacing: 0.04em;
}
.cs-live-dot {
  width: 6px;
  height: 6px;
  background: #f3e9d4;
  border-radius: 50%;
}

/* Toolbar */
.cs-toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  align-items: center;
  padding: 10px 14px;
  background: #ffffff;
  border: 1px solid #c5a97a;
  border-radius: 6px;
  margin-bottom: 12px;
}
.cs-search {
  flex: 1;
  min-width: 200px;
  padding: 6px 14px;
  border: 1px solid #c5a97a;
  border-radius: 16px;
  background: #fdf8f0;
  color: #2b2118;
  font-family: inherit;
  font-size: 13px;
  outline: none;
}
.cs-search:focus { border-color: #5b2c1a; background: #ffffff; }
.cs-chip {
  padding: 4px 12px;
  font-size: 12px;
  border-radius: 5px;
  background: #fdf8f0;
  color: #5a4634;
  border: 1px solid #c5a97a;
  cursor: pointer;
  font-family: inherit;
}
.cs-chip:hover { background: #f3e9d4; }
.cs-chip.cs-chip-active {
  background: #2b2118;
  color: #fdf8f0;
  border-color: #2b2118;
  font-weight: 600;
}
.cs-chip.cs-chip-mescita {
  background: #fff8ec;
  color: #a04000;
  border-color: #d8c8a8;
}
.cs-chip.cs-chip-mescita.cs-chip-active {
  background: #a04000;
  color: #fff8ec;
  border-color: #a04000;
}
.cs-chip.cs-chip-scarsa {
  background: #f5d7c8;
  color: #5b2c1a;
  border-color: #c5a97a;
}
.cs-chip.cs-chip-scarsa.cs-chip-active {
  background: #5b2c1a;
  color: #f5d7c8;
}

/* Tabella */
.cs-table-wrap {
  background: #ffffff;
  border: 1px solid #c5a97a;
  border-radius: 6px;
  overflow: hidden;
}
.cs-section-title {
  text-align: center;
  font-size: 14px;
  font-weight: 700;
  color: #2b2118;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  padding: 10px 0 4px;
  border-bottom: 1px solid #b89b6d;
  margin: 14px 14px 0;
}
.cs-table-head {
  display: grid;
  grid-template-columns: 56px 1fr 110px 160px 70px 90px;
  gap: 10px;
  padding: 7px 14px;
  background: #f3e9d4;
  font-size: 9px;
  text-transform: uppercase;
  letter-spacing: 0.16em;
  color: #5a4634;
  font-weight: 600;
  border-bottom: 1px solid #c5a97a;
  border-top: 1px solid #c5a97a;
}
.cs-row {
  display: grid;
  grid-template-columns: 56px 1fr 110px 160px 70px 90px;
  gap: 10px;
  padding: 8px 14px;
  font-size: 12.5px;
  border-bottom: 1px dotted #d8c8a8;
  align-items: start;
  cursor: pointer;
  transition: background 0.12s;
}
.cs-row:hover { background: #fdf8f0; }
.cs-row:last-child { border-bottom: none; }
.cs-row-codice {
  font-family: 'Courier New', monospace;
  font-size: 10px;
  color: #8a7a65;
  align-self: start;
  padding-top: 2px;
}
.cs-row-vino { color: #2b2118; min-width: 0; }
.cs-row-vino-nome { font-weight: 600; }
.cs-row-vino-nome em { font-style: italic; }
.cs-row-vino-annata { color: #5a4634; font-style: italic; margin-left: 4px; font-weight: 400; }
.cs-row-vino-meta { font-size: 10.5px; color: #5a4634; margin-top: 1px; }
.cs-row-prezzi { text-align: right; }
.cs-row-prezzo-bot { font-weight: 700; font-variant-numeric: tabular-nums; }
.cs-row-prezzo-cal {
  font-size: 11px;
  color: #5a4634;
  font-style: italic;
  font-variant-numeric: tabular-nums;
}
.cs-row-prezzo-cal::before { content: "🥂 "; font-style: normal; }
.cs-row-loc { font-size: 11px; line-height: 1.5; color: #2b2118; }
.cs-row-loc-qta { color: #8a7a65; }
.cs-row-loc-empty { color: #c5a97a; font-style: italic; }
.cs-row-giac {
  text-align: right;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  align-self: start;
  padding-top: 2px;
}
.cs-row-giac-scarsa { color: #5b2c1a; }
.cs-row-giac-zero { color: #8a7a65; }
.cs-row-status { text-align: right; align-self: start; padding-top: 2px; }
.cs-badge {
  display: inline-block;
  font-size: 10px;
  padding: 2px 8px;
  border: 1px solid #d8c8a8;
  border-radius: 8px;
  font-style: italic;
  letter-spacing: 0.04em;
  white-space: nowrap;
}
.cs-badge-mescita { background: #fff8ec; color: #a04000; }
.cs-badge-scarsa { background: #f5d7c8; color: #5b2c1a; border-color: #c5a97a; }
.cs-badge-in-carta { background: #efe6d6; color: #5a4634; }
.cs-badge-esaurita { background: #f3e9d4; color: #8a7a65; border-color: #d8c8a8; }

.cs-empty {
  text-align: center;
  padding: 60px 20px;
  color: #8a7a65;
  font-style: italic;
  font-size: 14px;
}
.cs-loading {
  text-align: center;
  padding: 80px 20px;
  color: #8a7a65;
  font-style: italic;
  font-size: 16px;
}
.cs-footer-note {
  text-align: center;
  padding: 10px 14px;
  background: #f3e9d4;
  border-top: 1px solid #c5a97a;
  font-size: 11px;
  color: #5a4634;
  font-style: italic;
}

/* iPad portrait — ridurre colonne dense */
@media (max-width: 820px) {
  .cs-table-head, .cs-row {
    grid-template-columns: 50px 1fr 90px 130px 60px 78px;
    gap: 8px;
    padding-left: 10px;
    padding-right: 10px;
  }
  .cs-row { font-size: 12px; }
}
@media (max-width: 600px) {
  /* Su smartphone: layout card invece di tabella, perche' troppo stretto. */
  .cs-table-head { display: none; }
  .cs-row {
    grid-template-columns: 1fr auto;
    grid-template-rows: auto auto auto;
    grid-template-areas:
      "codice status"
      "vino vino"
      "loc prezzi"
      "loc giac";
    gap: 4px 10px;
    padding: 10px 12px;
  }
  .cs-row-codice { grid-area: codice; }
  .cs-row-vino { grid-area: vino; }
  .cs-row-loc { grid-area: loc; }
  .cs-row-prezzi { grid-area: prezzi; }
  .cs-row-giac { grid-area: giac; }
  .cs-row-status { grid-area: status; }
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
  return (testo || "").toLowerCase().includes(query.toLowerCase().trim());
}
const STATUS_CFG = {
  in_mescita: { label: "in mescita", cls: "cs-badge-mescita" },
  scarsa:     { label: "scarsa",     cls: "cs-badge-scarsa" },
  in_carta:   { label: "in carta",   cls: "cs-badge-in-carta" },
  esaurita:   { label: "esaurita",   cls: "cs-badge-esaurita" },
};

// ─────────────────────────────────────────────────────────────
// Componente
// ─────────────────────────────────────────────────────────────
export default function CartaStaff() {
  const navigate = useNavigate();
  const [vini, setVini] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState("");
  const [filtro, setFiltro] = useState("tutti");

  const fetchVini = useCallback(async () => {
    try {
      const r = await apiFetch(`${API_BASE}/vini/magazzino/carta-staff/`);
      if (!r.ok) throw new Error(`Errore ${r.status}`);
      setVini(await r.json());
      setError(null);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    document.title = "Vista sommelier · Tre Gobbi";
    fetchVini();
    const tid = setInterval(fetchVini, 30_000);
    return () => clearInterval(tid);
  }, [fetchVini]);

  // Tipologie disponibili
  const tipologie = useMemo(() => {
    const set = new Set(vini.map(v => v.tipologia).filter(Boolean));
    return Array.from(set);
  }, [vini]);

  // Filtraggio
  const viniFiltered = useMemo(() => {
    return vini.filter(v => {
      // Filtro chip
      if (filtro === "in_mescita" && !v.in_mescita) return false;
      if (filtro === "calici" && !v.vendita_calice && !v.in_mescita) return false;
      if (filtro === "scarsa" && v.status !== "scarsa" && v.status !== "esaurita") return false;
      if (filtro !== "tutti" && filtro !== "in_mescita" && filtro !== "calici" && filtro !== "scarsa") {
        if (v.tipologia !== filtro) return false;
      }
      // Search
      if (search) {
        const blob = `${v.codice ?? ""} ${v.descrizione ?? ""} ${v.produttore ?? ""} ${v.regione ?? ""} ${v.tipologia ?? ""} ${v.annata ?? ""} ${v.vitigni ?? ""}`;
        if (!matchSearch(blob, search)) return false;
      }
      return true;
    });
  }, [vini, search, filtro]);

  // Raggruppamento per "Tipologia · Regione" per la stampa di sezioni
  const sezioni = useMemo(() => {
    const map = new Map();
    const order = [];
    for (const v of viniFiltered) {
      const key = `${v.tipologia || "—"}|${v.nazione || "—"}|${v.regione || "—"}`;
      if (!map.has(key)) {
        map.set(key, {
          tipologia: v.tipologia || "—",
          nazione: v.nazione || "—",
          regione: v.regione || "—",
          vini: [],
        });
        order.push(key);
      }
      map.get(key).vini.push(v);
    }
    return order.map(k => map.get(k));
  }, [viniFiltered]);

  const counts = useMemo(() => ({
    tutti: vini.length,
    in_mescita: vini.filter(v => v.in_mescita).length,
    calici: vini.filter(v => v.vendita_calice || v.in_mescita).length,
    scarsa: vini.filter(v => v.status === "scarsa" || v.status === "esaurita").length,
  }), [vini]);

  return (
    <>
      <style>{STYLE}</style>
      <div className="cs-root">
        <ViniNav current="carta-staff" />
        <div className="cs-container">

          {/* Header */}
          <div className="cs-header" style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
            <div style={{ flex: 1, minWidth: 200 }}>
              <h1 className="cs-header-title">Vista sommelier</h1>
              <div className="cs-header-sub">Carta vini · staff</div>
            </div>
            <span className="cs-live"><span className="cs-live-dot"></span>live · auto-refresh 30s</span>
            <Btn variant="secondary" size="sm" type="button" onClick={() => fetchVini()}>⟳ Aggiorna</Btn>
            <Btn variant="secondary" size="sm" type="button" onClick={() => navigate("/vini")}>← Menu Vini</Btn>
          </div>

          {/* Toolbar */}
          <div className="cs-toolbar">
            <input
              type="text"
              className="cs-search"
              placeholder="cerca vino, produttore, regione, codice…"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
            <button type="button" className={`cs-chip ${filtro === "tutti" ? "cs-chip-active" : ""}`}
              onClick={() => setFiltro("tutti")}>Tutti {counts.tutti}</button>
            <button type="button" className={`cs-chip cs-chip-mescita ${filtro === "in_mescita" ? "cs-chip-active" : ""}`}
              onClick={() => setFiltro("in_mescita")}>🥂 In mescita {counts.in_mescita}</button>
            <button type="button" className={`cs-chip ${filtro === "calici" ? "cs-chip-active" : ""}`}
              onClick={() => setFiltro("calici")}>Calici {counts.calici}</button>
            <button type="button" className={`cs-chip cs-chip-scarsa ${filtro === "scarsa" ? "cs-chip-active" : ""}`}
              onClick={() => setFiltro("scarsa")}>Scarsa giacenza {counts.scarsa}</button>
            {tipologie.map(t => (
              <button key={t} type="button"
                className={`cs-chip ${filtro === t ? "cs-chip-active" : ""}`}
                onClick={() => setFiltro(t)}>
                {t.charAt(0) + t.slice(1).toLowerCase()}
              </button>
            ))}
          </div>

          {/* Tabella */}
          <div className="cs-table-wrap">
            {loading && <div className="cs-loading">Caricamento…</div>}
            {!loading && error && <div className="cs-empty" style={{ color: "#a04000" }}>{error}</div>}
            {!loading && !error && viniFiltered.length === 0 && (
              <div className="cs-empty">Nessun vino corrisponde ai filtri.</div>
            )}
            {!loading && !error && sezioni.length > 0 && sezioni.map((sez, idx) => (
              <div key={`${sez.tipologia}-${sez.nazione}-${sez.regione}-${idx}`}>
                <div className="cs-section-title">
                  {sez.tipologia} · {sez.nazione} · {sez.regione}
                </div>
                <div className="cs-table-head">
                  <div></div>
                  <div>Vino · produttore</div>
                  <div style={{ textAlign: "right" }}>Prezzi</div>
                  <div>Locazione</div>
                  <div style={{ textAlign: "right" }}>Giac.</div>
                  <div style={{ textAlign: "right" }}>Stato</div>
                </div>
                {sez.vini.map(v => {
                  const sCfg = STATUS_CFG[v.status] || STATUS_CFG.in_carta;
                  const giacCls =
                    v.qta_totale === 0 ? "cs-row-giac-zero" :
                    v.qta_totale <= 2  ? "cs-row-giac-scarsa" : "";
                  return (
                    <div key={v.id} className="cs-row" onClick={() => navigate(`/vini/magazzino/${v.id}`)}>
                      <div className="cs-row-codice">{v.codice ? `R.${String(v.codice).padStart(3, "0")}` : ""}</div>
                      <div className="cs-row-vino">
                        <div className="cs-row-vino-nome">
                          {v.denominazione && <em>{v.denominazione}</em>}
                          {v.denominazione && v.descrizione ? " · " : ""}
                          {v.descrizione}
                          {v.annata && <span className="cs-row-vino-annata">{v.annata}</span>}
                        </div>
                        <div className="cs-row-vino-meta">
                          {[v.produttore, v.vitigni, v.grado_alcolico ? `${Number(v.grado_alcolico).toFixed(1)}%` : null]
                            .filter(Boolean).join(" · ")}
                        </div>
                      </div>
                      <div className="cs-row-prezzi">
                        <div className="cs-row-prezzo-bot">
                          {v.prezzo_carta != null ? `${fmtPrezzo(v.prezzo_carta)} €` : "—"}
                        </div>
                        {v.prezzo_calice != null && (
                          <div className="cs-row-prezzo-cal">{fmtPrezzo(v.prezzo_calice)} €</div>
                        )}
                      </div>
                      <div className="cs-row-loc">
                        {v.locazioni && v.locazioni.length > 0 ? (
                          v.locazioni.map((l, i) => (
                            <div key={i}>
                              {l.nome} <span className="cs-row-loc-qta">({l.qta})</span>
                            </div>
                          ))
                        ) : (
                          <span className="cs-row-loc-empty">—</span>
                        )}
                      </div>
                      <div className={`cs-row-giac ${giacCls}`}>
                        {v.qta_totale} bt
                      </div>
                      <div className="cs-row-status">
                        <span className={`cs-badge ${sCfg.cls}`}>{sCfg.label}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            ))}
            {!loading && !error && viniFiltered.length > 0 && (
              <div className="cs-footer-note">
                {viniFiltered.length} vin{viniFiltered.length === 1 ? "o" : "i"} · click su una riga per aprire la scheda
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
