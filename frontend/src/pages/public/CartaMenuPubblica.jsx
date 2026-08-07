// frontend/src/pages/public/CartaMenuPubblica.jsx
// Modulo: menu_carta
// @version: v1.1-multilingua (2026-08-07) — selettore lingua IT/EN/FR/ES/DE/UK [core]
// @version: v1.0 — Carta Menu pubblica per cliente al tavolo (Modulo G.1, 2026-04-27)
//
// Pagina pubblica della Carta del Menu (cucina) per cliente al tavolo via QR.
// Identità Osteria Tre Gobbi: Cormorant Garamond + palette beige/terracotta,
// coerente con CartaClienti (vini & bevande).
//
// Endpoint dati: GET /menu-carta/public/today?lang=xx (no auth, edizione "in_carta").
//
// Mostra:
//   - Header con nome edizione + breve sottotitolo + selettore lingua
//   - Sezioni nel loro ordine canonico (antipasti → paste → piatti del giorno →
//     secondi → contorni → dolci → bambini → servizio)
//   - Per ogni piatto: titolo, descrizione, prezzo, badge "firma/classico", foto se presente, allergeni
//   - Sezione Degustazioni in fondo
//   - Footer con osteria info
//
// Multilingua (2026-08-07):
//   - UN SOLO QR in sala, non sei. La scelta della lingua è dell'ospite.
//   - Il CONTENUTO arriva già tradotto dal backend dentro i campi di sempre
//     (titolo_override, descrizione_override...): qui non si sceglie niente.
//   - Le ETICHETTE (sezioni, micro-copy) vengono da config/menuI18n.js.
//   - Nessun badge "tradotto automaticamente", nessuna indicazione di quali
//     piatti siano tradotti e quali no: l'ospite legge un menu, non un
//     rapporto sullo stato del database. Dove manca la traduzione compare
//     l'italiano, ed è il comportamento previsto.
//
// Niente login. Niente dati sensibili. Solo il menu così come Marco lo pubblica.

import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { API_BASE } from "../../config/api";
import {
  LINGUE, LINGUE_LABEL, LINGUE_NOME, SEZIONI_ORDINE,
  labelSezione, labelUi, langIniziale, salvaLang, normalizzaLang,
} from "../../config/menuI18n";

const STYLE = `
@import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@400;500;600;700&display=swap');

.cmp-root {
  font-family: "Cormorant Garamond", "Times New Roman", serif;
  background: #fdf8f0;
  color: #2b2118;
  min-height: 100vh;
  padding: 0;
  margin: 0;
  -webkit-font-smoothing: antialiased;
  text-rendering: optimizeLegibility;
}
.cmp-shell {
  max-width: 720px;
  margin: 0 auto;
  padding: 0 18px 80px;
  box-sizing: border-box;
}
@media (min-width: 1024px) {
  .cmp-shell { max-width: 820px; }
}

/* Header */
.cmp-header {
  text-align: center;
  padding: 32px 18px 26px;
  border-bottom: 1px solid #c5a97a;
  margin: 0 -18px 22px;
  background: #fdf8f0;
}
.cmp-header-logo {
  display: block;
  margin: 0 auto 14px;
  width: 220px;
  max-width: 75%;
  height: auto;
}
.cmp-header-title {
  font-size: 26px;
  font-weight: 600;
  letter-spacing: 0.04em;
  margin: 6px 0 4px;
  color: #2b2118;
}
.cmp-header-subtitle {
  font-size: 13px;
  color: #5a4634;
  letter-spacing: 0.22em;
  text-transform: uppercase;
}
.cmp-header-edition {
  font-size: 14px;
  font-style: italic;
  color: #8a7a65;
  margin-top: 8px;
}

/* Selettore lingua — sigle testuali, niente bandiere */
.cmp-lang {
  display: flex;
  justify-content: center;
  flex-wrap: wrap;
  gap: 4px;
  margin-top: 16px;
}
.cmp-lang-btn {
  font-family: inherit;
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.12em;
  padding: 6px 11px;
  min-width: 44px;
  min-height: 32px;
  border: 1px solid #c5a97a;
  border-radius: 14px;
  background: transparent;
  color: #5a4634;
  cursor: pointer;
  transition: background 0.15s, color 0.15s;
}
.cmp-lang-btn:hover { background: #f5ead2; }
.cmp-lang-btn[aria-current="true"] {
  background: #5a4634;
  border-color: #5a4634;
  color: #fdf8f0;
}
.cmp-lang-btn:focus-visible {
  outline: 2px solid #b1483b;
  outline-offset: 2px;
}

/* Indice navigazione (chip) */
.cmp-index {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin: 0 0 20px;
  padding: 12px 0;
  border-bottom: 1px solid #e6d8be;
  position: sticky;
  top: 0;
  background: #fdf8f0;
  z-index: 10;
}
.cmp-index-chip {
  font-size: 12px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  padding: 4px 10px;
  border: 1px solid #c5a97a;
  border-radius: 16px;
  background: transparent;
  color: #5a4634;
  cursor: pointer;
  text-decoration: none;
  transition: background 0.2s;
}
.cmp-index-chip:hover { background: #f5ead2; }

/* Sezione */
.cmp-sezione {
  margin: 28px 0;
  scroll-margin-top: 80px;
}
.cmp-sezione-titolo {
  text-align: center;
  font-size: 22px;
  font-weight: 600;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: #2b2118;
  margin: 0 0 14px;
  padding-bottom: 8px;
  border-bottom: 2px solid #c5a97a;
  /* Tedesco: "Hauptgerichte", "Kindermenü" e i composti lunghi non devono
     sfondare la colonna su un telefono in verticale. */
  overflow-wrap: break-word;
  hyphens: auto;
}

/* Piatto */
.cmp-piatto {
  display: flex;
  gap: 14px;
  padding: 14px 0;
  border-bottom: 1px dashed #e6d8be;
  align-items: flex-start;
}
.cmp-piatto:last-child { border-bottom: none; }

.cmp-piatto-foto {
  width: 84px;
  height: 84px;
  flex-shrink: 0;
  border-radius: 8px;
  overflow: hidden;
  background: #f5ead2;
}
.cmp-piatto-foto img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.cmp-piatto-body {
  flex: 1;
  min-width: 0;
}
.cmp-piatto-title-row {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: baseline;
}
/* min-width:0 su un figlio flex: senza, una parola lunghissima (tedesco)
   non si spezza e spinge fuori il prezzo invece di andare a capo. */
.cmp-piatto-title-row > div:first-child { min-width: 0; }
.cmp-piatto-titolo {
  font-size: 17px;
  font-weight: 600;
  letter-spacing: 0.03em;
  text-transform: uppercase;
  color: #2b2118;
  overflow-wrap: break-word;
  hyphens: auto;
}
.cmp-piatto-prezzo {
  font-size: 16px;
  font-weight: 600;
  white-space: nowrap;
  color: #2b2118;
}
.cmp-piatto-badge {
  display: inline-block;
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  padding: 2px 6px;
  margin-right: 6px;
  vertical-align: middle;
  background: #b1483b;
  color: #fff;
  border-radius: 3px;
}
.cmp-piatto-desc {
  font-size: 14px;
  color: #4a3826;
  line-height: 1.5;
  margin-top: 4px;
  font-style: italic;
}
.cmp-piatto-allergeni {
  font-size: 11px;
  color: #8a6e3a;
  margin-top: 6px;
  letter-spacing: 0.04em;
}
.cmp-piatto-allergeni strong {
  font-weight: 600;
  text-transform: uppercase;
  font-size: 9px;
  letter-spacing: 0.12em;
  color: #5a4634;
  margin-right: 4px;
}
.cmp-piatto-variabile {
  font-size: 11px;
  color: #8a7a65;
  font-style: italic;
  margin-top: 4px;
}

/* Degustazione */
.cmp-degu {
  margin: 36px -18px;
  padding: 26px 24px;
  background: #f5ead2;
  border-top: 1px solid #c5a97a;
  border-bottom: 1px solid #c5a97a;
  text-align: center;
}
.cmp-degu-label {
  font-size: 14px;
  letter-spacing: 0.3em;
  text-transform: uppercase;
  color: #5a4634;
  margin-bottom: 6px;
}
.cmp-degu-nome {
  font-size: 24px;
  font-weight: 600;
  color: #2b2118;
  margin: 0 0 4px;
}
.cmp-degu-sottotitolo {
  font-size: 14px;
  font-style: italic;
  color: #5a4634;
  margin-bottom: 16px;
}
.cmp-degu-step {
  font-size: 13px;
  font-weight: 500;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: #2b2118;
  padding: 4px 0;
}
.cmp-degu-prezzo {
  font-size: 22px;
  font-weight: 600;
  color: #b1483b;
  margin-top: 16px;
}
.cmp-degu-note {
  font-size: 12px;
  font-style: italic;
  color: #8a7a65;
  margin-top: 10px;
  border-top: 1px solid #e6d8be;
  padding-top: 8px;
}

/* Footer */
.cmp-footer {
  text-align: center;
  padding: 30px 0 20px;
  margin-top: 30px;
  font-size: 12px;
  color: #8a7a65;
  letter-spacing: 0.08em;
  border-top: 1px solid #c5a97a;
}
.cmp-footer-link {
  color: #5a4634;
  text-decoration: underline;
  margin-left: 6px;
}

/* Loading / error states */
.cmp-state {
  text-align: center;
  padding: 60px 20px;
  color: #5a4634;
  font-size: 16px;
}
`;

export default function CartaMenuPubblica() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [lang, setLang] = useState(() => langIniziale());

  // Cambio lingua: aggiorna l'URL PRIMA di rifare la fetch, così il link è
  // sempre condivisibile e ricaricabile (?lang=fr riapre in francese).
  // replaceState e non pushState: sei click sul selettore non devono
  // riempire la cronologia e costringere l'ospite a sei "indietro" per
  // uscire dal menu.
  function cambiaLingua(nuova) {
    const l = normalizzaLang(nuova);
    if (l === lang) return;
    setLang(l);
    salvaLang(l);
    try {
      const url = new URL(window.location.href);
      url.searchParams.set("lang", l);
      window.history.replaceState({}, "", url);
    } catch {
      /* ambiente senza history: la lingua funziona lo stesso, non si condivide */
    }
  }

  useEffect(() => {
    document.title = "Menu — Osteria Tre Gobbi";
    // Serve ai browser e agli screen reader per pronuncia e sillabazione.
    const precedente = document.documentElement.lang;
    document.documentElement.lang = lang;

    let cancelled = false;
    setLoading(true);
    setError("");
    fetch(`${API_BASE}/menu-carta/public/today?lang=${encodeURIComponent(lang)}`)
      .then((r) => {
        if (r.status === 404) throw new Error(labelUi("menu_non_disponibile", lang));
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((j) => { if (!cancelled) { setData(j); setLoading(false); } })
      .catch((e) => { if (!cancelled) { setError(e.message); setLoading(false); } });
    return () => {
      cancelled = true;
      document.documentElement.lang = precedente;
    };
  }, [lang]);

  return (
    <div className="cmp-root" lang={lang}>
      <style>{STYLE}</style>
      <div className="cmp-shell">
        <header className="cmp-header">
          <img
            src="/static/img/logo_tregobbi.png"
            alt="Osteria Tre Gobbi"
            className="cmp-header-logo"
            onError={(e) => { e.currentTarget.style.display = "none"; }}
          />
          <div className="cmp-header-subtitle">Osteria Tre Gobbi</div>
          <div className="cmp-header-title" style={{ fontFamily: "'Playfair Display', 'Cormorant Garamond', serif" }}>
            {labelUi("titolo_pagina", lang)}
          </div>
          {data?.edition && (
            <div className="cmp-header-edition">
              {data.edition.nome}
              {data.edition.stagione && data.edition.anno && (
                <span> · {data.edition.stagione} {data.edition.anno}</span>
              )}
            </div>
          )}

          {/* Selettore lingua. Un solo QR in sala: la scelta è dell'ospite. */}
          <nav className="cmp-lang" aria-label={labelUi("scegli_lingua", lang)}>
            {LINGUE.map((l) => (
              <button
                key={l}
                type="button"
                lang={l}
                onClick={() => cambiaLingua(l)}
                aria-current={l === lang ? "true" : "false"}
                title={LINGUE_NOME[l]}
                className="cmp-lang-btn"
              >
                {LINGUE_LABEL[l]}
              </button>
            ))}
          </nav>
        </header>

        {loading && <div className="cmp-state">{labelUi("caricamento", lang)}</div>}
        {error && (
          <div className="cmp-state">
            <p style={{ marginBottom: 16 }}>{error}</p>
            <Link to="/carta" style={{ color: "#5a4634", textDecoration: "underline" }}>
              {labelUi("torna_carta_vini", lang)}
            </Link>
          </div>
        )}

        {data && data.sezioni && (
          <>
            {/* Indice navigazione */}
            <nav className="cmp-index">
              {SEZIONI_ORDINE.map((key) => {
                const items = data.sezioni[key] || [];
                if (items.length === 0) return null;
                return (
                  <a key={key} href={`#sez-${key}`} className="cmp-index-chip">
                    {labelSezione(key, lang)}
                  </a>
                );
              })}
              {data.tasting_paths && data.tasting_paths.length > 0 && (
                <a href="#degustazioni" className="cmp-index-chip">
                  {labelSezione("degustazioni", lang)}
                </a>
              )}
              <Link to="/carta" className="cmp-index-chip" style={{ borderStyle: "dashed" }}>
                🍷 {labelUi("carta_vini", lang)}
              </Link>
            </nav>

            {/* Sezioni */}
            {SEZIONI_ORDINE.map((key) => {
              const items = data.sezioni[key] || [];
              if (items.length === 0) return null;
              return (
                <section key={key} id={`sez-${key}`} className="cmp-sezione">
                  <h2 className="cmp-sezione-titolo">{labelSezione(key, lang)}</h2>
                  {items.map((p) => (
                    <Piatto key={p.id} pub={p} lang={lang} />
                  ))}
                </section>
              );
            })}

            {/* Degustazioni */}
            {data.tasting_paths && data.tasting_paths.length > 0 && (
              <section id="degustazioni">
                {data.tasting_paths.map((tp, idx) => (
                  <div key={idx} className="cmp-degu">
                    <div className="cmp-degu-label">{labelUi("percorso_degustazione", lang)}</div>
                    {/* tp.nome resta sempre italiano: è la firma della casa
                        ("Fidati dell'oste"), il sottotitolo tradotto spiega. */}
                    <h3 className="cmp-degu-nome" lang="it" style={{ fontFamily: "'Playfair Display', 'Cormorant Garamond', serif" }}>
                      {tp.nome}
                    </h3>
                    {tp.sottotitolo && <div className="cmp-degu-sottotitolo">"{tp.sottotitolo}"</div>}
                    <div>
                      {tp.steps.map((s, i) => (
                        <div key={i} className="cmp-degu-step">{s.label}</div>
                      ))}
                    </div>
                    {tp.prezzo_persona && (
                      <div className="cmp-degu-prezzo">
                        {tp.prezzo_persona} € {labelUi("prezzo_per_persona", lang)}
                      </div>
                    )}
                    {tp.note && <div className="cmp-degu-note">{tp.note}</div>}
                  </div>
                ))}
              </section>
            )}

            <footer className="cmp-footer">
              <div>{labelUi("buon_appetito", lang)} · Osteria Tre Gobbi</div>
              <div style={{ marginTop: 8 }}>
                <Link to="/carta" className="cmp-footer-link">
                  {labelUi("carta_vini_full", lang)}
                </Link>
              </div>
            </footer>
          </>
        )}
      </div>
    </div>
  );
}

function Piatto({ pub, lang }) {
  // I campi *_override arrivano già tradotti dal backend quando esiste la
  // traduzione, altrimenti contengono l'italiano: la catena di fallback qui
  // sotto è la stessa di prima e non deve sapere nulla di lingue.
  const titolo = pub.titolo_override || pub.recipe_menu_name || labelUi("senza_titolo", lang);
  const descrizione = pub.descrizione_override || pub.recipe_menu_description;
  const allergeni = pub.allergeni_dichiarati || pub.recipe_allergeni_calcolati;
  const prezzoLabel = pub.prezzo_label
    || (pub.prezzo_singolo != null ? `${pub.prezzo_singolo} €` : "")
    || (pub.prezzo_min != null ? `${pub.prezzo_min}–${pub.prezzo_max} €` : "")
    || (pub.prezzo_piccolo != null ? `${pub.prezzo_piccolo} / ${pub.prezzo_grande} €` : "");

  return (
    <div className="cmp-piatto">
      {pub.foto_path && (
        <div className="cmp-piatto-foto">
          <img
            src={pub.foto_path}
            alt={titolo}
            loading="lazy"
            onError={(e) => { e.currentTarget.parentElement.style.display = "none"; }}
          />
        </div>
      )}
      <div className="cmp-piatto-body">
        <div className="cmp-piatto-title-row">
          <div>
            {pub.badge && <span className="cmp-piatto-badge">{pub.badge}</span>}
            <span className="cmp-piatto-titolo">{titolo}</span>
          </div>
          {prezzoLabel && <span className="cmp-piatto-prezzo">{prezzoLabel}</span>}
        </div>
        {descrizione && <div className="cmp-piatto-desc">{descrizione}</div>}
        {pub.descrizione_variabile && (
          <div className="cmp-piatto-variabile">{labelUi("composizione_variabile", lang)}</div>
        )}
        {pub.consigliato_per && (
          <div className="cmp-piatto-variabile">
            {labelUi("consigliato_per", lang, { n: pub.consigliato_per })}
          </div>
        )}
        {allergeni && (
          <div className="cmp-piatto-allergeni">
            <strong>{labelUi("allergeni", lang)}:</strong> {allergeni}
          </div>
        )}
      </div>
    </div>
  );
}
