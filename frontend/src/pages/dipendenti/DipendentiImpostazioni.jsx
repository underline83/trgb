// @version: v2.1-mattoni — refactor leggero con StatusBadge + EmptyState (M.I)
// Layout impostazioni modulo Dipendenti: sidebar a sinistra con sezioni, contenuto a destra.
// Modello: ClientiImpostazioni.jsx. Le sezioni "reparti" embeddano GestioneReparti.
// Nota: il wrapper full-height custom (flex flex-col) NON usa PageLayout perché
//   gestisce la sidebar che riempie tutta l'altezza. Solo i micro-componenti M.I.
import React, { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import DipendentiNav from "./DipendentiNav";
import GestioneReparti from "./GestioneReparti";
import { StatusBadge, EmptyState, Btn } from "../../components/ui";
import { API_BASE, apiFetch } from "../../config/api";

// ── Sidebar items ──
const SECTIONS = [
  { key: "reparti",          label: "Reparti",           icon: "🏢", desc: "SALA, CUCINA, ... orari standard, pause staff, colore e icona", ready: true  },
  { key: "stipendi",         label: "Stipendi",          icon: "💶", desc: "Default giorno scadenza buste paga (è il giorno del mese successivo all'incasso)", ready: true  },
  { key: "stato_import",     label: "Stato import paghe", icon: "📊", desc: "Quali mesi hanno LUL/ELAB/F24 importati (G.3 Fase E)",         ready: true  },
  { key: "soglie_ccnl",      label: "Soglie CCNL",       icon: "⚡", desc: "Personalizza soglie 40h/48h per semaforo ore",                   ready: false },
  { key: "template_wa",      label: "Template WhatsApp", icon: "📨", desc: "Modifica il testo di default per l'invio turni via WA",         ready: false },
];

export default function DipendentiImpostazioni() {
  const { section: urlSection } = useParams();
  const navigate = useNavigate();
  const [section, setSection] = useState(urlSection || "reparti");

  useEffect(() => {
    if (urlSection && urlSection !== section) setSection(urlSection);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlSection]);

  const goTo = (key) => {
    setSection(key);
    // URL statico: non abbiamo route parametrico, quindi manteniamo solo lo state
    // (se in futuro si vuole deep-link, cambiare la route in App.jsx con /:section?)
  };

  const currentSection = SECTIONS.find((s) => s.key === section) || SECTIONS[0];

  return (
    <div className="min-h-screen bg-brand-cream flex flex-col">
      <DipendentiNav current="impostazioni" />
      <div className="flex-1 min-h-0">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 h-full">
          <div className="flex gap-6 h-full">
            {/* ── Sidebar ── */}
            <div className="w-60 flex-shrink-0">
              <h2 className="text-xs font-bold text-neutral-400 uppercase tracking-wider mb-3 px-3">
                Impostazioni Dipendenti
              </h2>
              <nav className="space-y-0.5">
                {SECTIONS.map((s) => {
                  const active = section === s.key;
                  const disabled = !s.ready;
                  return (
                    <button
                      key={s.key}
                      onClick={() => !disabled && goTo(s.key)}
                      disabled={disabled}
                      className={`w-full text-left px-3 py-2.5 rounded-lg transition flex items-start gap-2.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue/40 focus-visible:ring-offset-1 ${
                        active
                          ? "bg-purple-50 text-purple-900 shadow-sm border border-purple-200"
                          : disabled
                            ? "text-neutral-300 cursor-not-allowed"
                            : "text-neutral-600 hover:bg-neutral-100 hover:text-neutral-800"
                      }`}
                    >
                      <span className="text-sm mt-0.5">{s.icon}</span>
                      <div className="flex-1 min-w-0">
                        <div className={`text-sm font-medium flex items-center gap-1.5 ${active ? "text-purple-900" : ""}`}>
                          {s.label}
                          {disabled && (
                            <StatusBadge tone="neutral" size="sm">Prossimamente</StatusBadge>
                          )}
                        </div>
                        <div className="text-[11px] text-neutral-400 mt-0.5 leading-tight">{s.desc}</div>
                      </div>
                    </button>
                  );
                })}
              </nav>
            </div>

            {/* ── Content ── */}
            <div className="flex-1 min-w-0 bg-white shadow-sm rounded-xl border border-neutral-200 overflow-hidden flex flex-col">
              {section === "reparti" && <GestioneReparti embedded />}
              {section === "stipendi" && <StipendiSection />}
              {section === "stato_import" && <StatoImportSection />}
              {section === "soglie_ccnl" && <PlaceholderSection s={currentSection} />}
              {section === "template_wa" && <PlaceholderSection s={currentSection} />}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function PlaceholderSection({ s }) {
  return (
    <div className="flex-1 flex items-center justify-center p-12">
      <EmptyState
        icon={s.icon}
        title={s.label}
        description={`${s.desc} — Sezione in preparazione.`}
        watermark
      />
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────
// Sezione Stipendi — configurazione default giorno pagamento (mig 118).
// Sessione 2026-05-11. Il valore qui impostato è il giorno del mese SUCCESSIVO
// in cui scadono gli stipendi (es. 15 = stipendio di marzo paga il 15 aprile).
// Vale come default; l'anagrafica del singolo dipendente può sovrascriverlo
// con un proprio `giorno_paga`.
// ──────────────────────────────────────────────────────────────────────
function StipendiSection() {
  const [giorno, setGiorno] = useState("");
  const [originale, setOriginale] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [okMsg, setOkMsg] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await apiFetch(`${API_BASE}/dipendenti/settings/`);
        const data = await res.json();
        if (cancelled) return;
        const val = data["giorno_pagamento_stipendi_default"] || "15";
        setGiorno(val);
        setOriginale(val);
      } catch (e) {
        if (!cancelled) setError("Errore caricamento settings: " + e.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const dirty = originale != null && giorno !== originale;
  const isValid = (() => {
    const n = parseInt(giorno, 10);
    return !Number.isNaN(n) && n >= 1 && n <= 28;
  })();

  const save = async () => {
    if (!isValid) {
      setError("Il giorno deve essere un numero tra 1 e 28");
      return;
    }
    setSaving(true);
    setError(null);
    setOkMsg(null);
    try {
      const res = await apiFetch(
        `${API_BASE}/dipendenti/settings/giorno_pagamento_stipendi_default`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ value: giorno }),
        }
      );
      const d = await res.json();
      if (!res.ok || d.ok === false) throw new Error(d.detail || d.error || "Errore");
      setOriginale(giorno);
      setOkMsg("Salvato. Verrà usato per le prossime buste paga importate.");
      setTimeout(() => setOkMsg(null), 4000);
    } catch (e) {
      setError("Errore salvataggio: " + (e.message || e));
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="p-8 text-sm text-neutral-500">Caricamento…</div>;
  }

  return (
    <div className="p-6 md:p-8 max-w-2xl">
      <h2 className="text-lg font-bold text-neutral-900 flex items-center gap-2 mb-1">
        <span>💶</span> Stipendi — Default giorno scadenza
      </h2>
      <p className="text-sm text-neutral-500 mb-6">
        Giorno del mese <strong>successivo</strong> in cui scadono le buste paga.
        Esempio: 15 = stipendio di marzo scade il 15 aprile. L'anagrafica
        del singolo dipendente può sovrascrivere questo default con un proprio
        <code className="mx-1 px-1.5 py-0.5 bg-neutral-100 rounded text-[11px]">giorno_paga</code>.
      </p>

      <div className="bg-neutral-50 border border-neutral-200 rounded-lg p-5">
        <label className="block text-xs font-semibold text-neutral-600 uppercase tracking-wide mb-2">
          Giorno scadenza default
        </label>
        <div className="flex items-center gap-3">
          <input
            type="number"
            min={1}
            max={28}
            step={1}
            value={giorno}
            onChange={(e) => setGiorno(e.target.value)}
            className="w-24 px-3 py-2 border border-neutral-300 rounded-lg text-center text-lg font-semibold tabular-nums focus:outline-none focus:ring-2 focus:ring-brand-blue/40"
          />
          <span className="text-sm text-neutral-500">del mese successivo</span>
        </div>
        <p className="text-[11px] text-neutral-400 mt-2">
          Valori ammessi: 1 — 28 (per evitare problemi con febbraio)
        </p>

        <div className="mt-4 flex items-center gap-3">
          <Btn
            variant="primary"
            size="md"
            onClick={save}
            disabled={!dirty || !isValid || saving}
            loading={saving}
          >
            Salva
          </Btn>
          {dirty && (
            <Btn
              variant="secondary"
              size="md"
              onClick={() => { setGiorno(originale); setError(null); }}
              disabled={saving}
            >
              Annulla
            </Btn>
          )}
          {okMsg && <span className="text-xs text-emerald-700">{okMsg}</span>}
          {error && <span className="text-xs text-red-700">{error}</span>}
        </div>
      </div>

      <div className="mt-6 p-4 bg-blue-50 border border-blue-200 rounded-lg text-xs text-blue-900">
        <strong>Nota:</strong> il valore impostato qui è il <em>default globale</em>.
        Se un dipendente ha un giorno specifico (es. apprendisti con accordo diverso),
        modifica il campo <code className="px-1 bg-white rounded">giorno_paga</code> nella
        sua anagrafica per sovrascrivere il default.
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────
// Sezione Stato Import Paghe (G.3 Fase E, 2026-05-16)
// Mostra, per ogni mese dell'anno selezionato, lo stato di importazione
// dei 3 PDF paghe: LUL (cedolini), ELAB (costo aziendale), F24 (versamenti).
// ──────────────────────────────────────────────────────────────────────
const MESI_ABBR = ["", "gen", "feb", "mar", "apr", "mag", "giu",
                   "lug", "ago", "set", "ott", "nov", "dic"];

function StatoImportSection() {
  const [anno, setAnno] = useState(new Date().getFullYear());
  const [stato, setStato] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchStato = async (a) => {
    setLoading(true);
    try {
      const res = await apiFetch(`${API_BASE}/dipendenti/buste-paga/stato-import-mensile?anno=${a}`);
      if (res.ok) setStato(await res.json());
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchStato(anno); }, [anno]);

  const anni = [];
  const annoCorrente = new Date().getFullYear();
  for (let y = annoCorrente; y >= annoCorrente - 5; y--) anni.push(y);

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <div>
          <h2 className="text-lg font-bold text-purple-900 mb-1">📊 Stato import paghe</h2>
          <p className="text-xs text-neutral-500">
            Quali mesi dell'anno hanno i PDF già caricati. Verde ✓ = caricato, — = mancante.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs text-neutral-500 font-semibold">Anno:</label>
          <select value={anno} onChange={(e) => setAnno(parseInt(e.target.value, 10))}
            className="border border-neutral-300 rounded-lg px-2 py-1 text-sm">
            {anni.map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
      </div>

      {loading && !stato && <div className="text-sm text-neutral-500">Caricamento...</div>}

      {stato?.mesi && (
        <>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-neutral-500 border-b border-neutral-200">
                  <th className="text-left py-2 pr-3 font-semibold w-20">Fonte</th>
                  {stato.mesi.map((m) => (
                    <th key={m.mese} className="px-2 py-2 text-center font-medium">
                      {MESI_ABBR[m.mese]}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr className="border-b border-neutral-100">
                  <td className="py-2 pr-3 text-neutral-700 font-semibold">LUL</td>
                  {stato.mesi.map((m) => (
                    <td key={m.mese}
                      className={`px-2 py-2 text-center font-mono ${
                        m.lul > 0 ? "text-violet-700 font-bold" : "text-neutral-300"
                      }`}
                      title={m.lul > 0 ? `${m.lul} cedolini importati` : "Nessun cedolino"}>
                      {m.lul > 0 ? m.lul : "—"}
                    </td>
                  ))}
                </tr>
                <tr className="border-b border-neutral-100">
                  <td className="py-2 pr-3 text-neutral-700 font-semibold">ELAB</td>
                  {stato.mesi.map((m) => {
                    const elabOk = m.elab > 0;
                    const inailOk = m.elab_inail > 0;
                    return (
                      <td key={m.mese} className="px-2 py-2 text-center"
                        title={elabOk
                          ? `${m.elab} dipendenti${inailOk ? " + INAIL ✓" : " (INAIL mancante)"}`
                          : "ELAB non importato"}>
                        {elabOk
                          ? <span className={inailOk ? "text-green-700 font-bold" : "text-amber-600 font-bold"}>
                              ✓{inailOk ? "" : "*"}
                            </span>
                          : <span className="text-neutral-300">—</span>}
                      </td>
                    );
                  })}
                </tr>
                <tr>
                  <td className="py-2 pr-3 text-neutral-700 font-semibold">F24</td>
                  {stato.mesi.map((m) => (
                    <td key={m.mese}
                      className={`px-2 py-2 text-center ${
                        m.f24 > 0 ? "text-blue-700 font-bold" : "text-neutral-300"
                      }`}
                      title={m.f24 > 0 ? `${m.f24} righe tributo importate` : "F24 non importato"}>
                      {m.f24 > 0 ? "✓" : "—"}
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>

          {stato.mesi.some((m) => m.elab > 0 && !m.elab_inail) && (
            <div className="mt-4 p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-900">
              <strong>Nota:</strong> <code className="px-1 bg-white rounded">✓*</code> indica ELAB con dipendenti importati ma senza riga sintetica INAIL azienda. Il CE del mese funziona ma manca il costo INAIL (~€90/mese). Re-importa l'ELAB o verifica il PDF originale.
            </div>
          )}

          <div className="mt-6 p-4 bg-blue-50 border border-blue-200 rounded-lg text-xs text-blue-900">
            <strong>Legenda:</strong>
            <ul className="mt-2 space-y-1 list-disc list-inside">
              <li><strong>LUL</strong> (Libro Unico Lavoro): numero di cedolini importati nel mese. Si carica dalla pagina Buste Paga (Import PDF LUL).</li>
              <li><strong>ELAB</strong> (Riepilogo paghe): ✓ se il costo aziendale completo del mese è stato importato. Si carica dalla pagina Buste Paga (Import ELAB / F24).</li>
              <li><strong>F24</strong> (Versamenti): ✓ se i versamenti tributi del mese sono stati caricati. Stessa dropzone dell'ELAB.</li>
            </ul>
          </div>
        </>
      )}
    </div>
  );
}
