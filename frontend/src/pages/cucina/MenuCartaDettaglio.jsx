// frontend/src/pages/cucina/MenuCartaDettaglio.jsx
// Modulo: menu_carta
// @version: v1.5-traduzioni — tab Traduzioni multilingua [core] (2026-08-07)
// @version: v1.4-sezione-dolci — nuova sezione 'dolci' in SEZIONI_ORDER [core] (2026-07-19)
// @version: v1.3-foto-fix — img key + link diretto fallback per cache-bust difettoso (Modulo D, 2026-04-27)
//
// Dettaglio di un'edizione: testa fissa colorata + tab.
// Tab: Sezioni (lista piatti raggruppata) | Degustazioni | Traduzioni | Anteprima | Anagrafica
//
// Endpoint: GET /menu-carta/editions/{id}
//           GET/PUT /menu-carta/translations/ + GET /menu-carta/translations/coverage/

import React, { useState, useEffect, useCallback, useMemo } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { API_BASE, apiFetch } from "../../config/api";
import RicetteNav from "../ricette/RicetteNav";
import { Btn, StatusBadge, EmptyState, Textarea } from "../../components/ui";
import useToast from "../../hooks/useToast";
import { LINGUE_TRADOTTE, LINGUE_NOME, LINGUE_LABEL, LINGUE_BANDIERA, labelSezione } from "../../config/menuI18n";

const SEZIONI_ORDER = [
  { key: "antipasti",          label: "Antipasti" },
  { key: "paste_risi_zuppe",   label: "Paste, risi e zuppe" },
  { key: "piatti_del_giorno",  label: "Piatti del giorno" },
  { key: "secondi",            label: "Secondi" },
  { key: "contorni",           label: "Contorni" },
  { key: "dolci",              label: "Dolci" },
  { key: "bambini",            label: "Bambini" },
  { key: "servizio",           label: "Servizio" },
];

const STATO_BADGE = {
  in_carta:    { label: "IN CARTA",   classes: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  bozza:       { label: "BOZZA",      classes: "bg-amber-50 text-amber-700 border-amber-200" },
  archiviata:  { label: "ARCHIVIATA", classes: "bg-neutral-100 text-neutral-600 border-neutral-300" },
};

const TABS = [
  { key: "sezioni",      label: "Sezioni" },
  { key: "degustazioni", label: "Degustazioni" },
  { key: "traduzioni",   label: "Traduzioni" },
  { key: "anteprima",    label: "Anteprima" },
  { key: "anagrafica",   label: "Anagrafica" },
];

export default function MenuCartaDettaglio() {
  const { id } = useParams();
  const nav = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("sezioni");
  const [editingPub, setEditingPub] = useState(null); // publication obj
  const [error, setError] = useState(null);

  const reload = useCallback(async () => {
    setError(null);
    try {
      const r = await apiFetch(`${API_BASE}/menu-carta/editions/${id}`);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const j = await r.json();
      setData(j);
    } catch (e) { setError(String(e)); }
    finally { setLoading(false); }
  }, [id]);

  useEffect(() => { reload(); }, [reload]);

  if (loading) return <div className="p-6 text-sm text-neutral-500">Caricamento…</div>;
  if (error) return <div className="p-6 text-sm text-red-600">Errore: {error}</div>;
  if (!data) return null;

  const { edition, sezioni, tasting_paths, kpi } = data;
  const badge = STATO_BADGE[edition.stato] || STATO_BADGE.bozza;

  return (
    <div className="min-h-screen bg-brand-cream">
      <RicetteNav current="menu" />
      <div className="max-w-6xl mx-auto">

        {/* ═══ TESTA FISSA ═══ */}
        <div className="bg-gradient-to-b from-white to-brand-cream border-b-2 border-orange-200 px-4 md:px-6 py-4 md:py-5 sticky top-0 z-10">
          <div className="flex items-center gap-2 mb-2 text-xs">
            <Link to="/menu-carta" className="text-orange-700 hover:text-orange-900 hover:underline">← Tutte le edizioni</Link>
          </div>
          <div className="flex items-start justify-between gap-3 mb-3">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 mb-1">
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded border ${badge.classes}`}>{badge.label}</span>
                {edition.stagione && (
                  <span className="text-[10px] text-neutral-500 uppercase tracking-wider">
                    {edition.stagione} {edition.anno || ""}
                  </span>
                )}
              </div>
              <h1 className="text-xl md:text-3xl font-bold text-orange-900 leading-tight font-playfair">
                {edition.nome}
              </h1>
              {(edition.data_inizio || edition.data_fine) && (
                <p className="text-xs text-neutral-600 mt-1">
                  {edition.data_inizio || "?"} → {edition.data_fine || "?"}
                </p>
              )}
            </div>
            <div className="flex flex-col gap-1.5 flex-shrink-0">
              <Btn
                as="a"
                href={`${API_BASE}/menu-carta/editions/${edition.id}/pdf`}
                target="_blank"
                rel="noopener noreferrer"
                variant="dark"
                size="sm"
              >
                ⬇ PDF stampabile
              </Btn>
              <Btn
                variant="primary"
                size="sm"
                onClick={async () => {
                  if (!confirm("Genera/rigenera i template MEP per il modulo Cucina HACCP a partire da questa edizione?\n\nI template saranno creati con attivo=0. Dovrai attivarli manualmente da Impostazioni Cucina.")) return;
                  const r = await apiFetch(`${API_BASE}/menu-carta/editions/${edition.id}/generate-mep`, { method: "POST" });
                  if (r.ok) {
                    const d = await r.json();
                    alert(`OK — ${d.creati.length} template MEP Carta generati.\n${d.creati.map(c => `• ${c.nome} (${c.n_item} item)`).join("\n")}\n\nVai in Impostazioni Cucina per attivarli.`);
                  } else {
                    alert("Errore: " + r.status);
                  }
                }}
              >
                ⚙ Genera MEP cucina
              </Btn>
            </div>
          </div>

          {/* 4 KPI */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 md:gap-3">
            <Kpi label="Pubblicazioni" value={kpi.totale_pubblicazioni} />
            <Kpi label="Piatti collegati" value={kpi.piatti_collegati} />
            <Kpi label="Degustazioni" value={kpi.degustazioni} />
            <Kpi label="Prezzo medio carta" value={kpi.prezzo_medio_carta != null ? `${kpi.prezzo_medio_carta} €` : "—"} />
          </div>

          {/* Tab bar */}
          <div className="flex gap-1 mt-4 border-b border-neutral-200 overflow-x-auto -mb-1">
            {TABS.map(t => {
              const active = activeTab === t.key;
              return (
                <button key={t.key} onClick={() => setActiveTab(t.key)}
                  className={`px-3 md:px-4 py-2 text-xs md:text-sm font-medium whitespace-nowrap transition ${
                    active
                      ? "text-orange-900 border-b-2 border-orange-500 -mb-px"
                      : "text-neutral-500 hover:text-neutral-800"
                  }`}>
                  {t.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* ═══ TAB CONTENT ═══ */}
        <div className="px-4 md:px-6 py-5">
          {activeTab === "sezioni" && (
            <SezioniTab sezioni={sezioni} onEdit={setEditingPub} editionId={edition.id} onReload={reload} />
          )}
          {activeTab === "degustazioni" && (
            <DegustazioniTab paths={tasting_paths} />
          )}
          {activeTab === "traduzioni" && (
            <TraduzioniTab editionId={edition.id} />
          )}
          {activeTab === "anteprima" && (
            <AnteprimaTab edition={edition} sezioni={sezioni} tasting_paths={tasting_paths} />
          )}
          {activeTab === "anagrafica" && (
            <AnagraficaTab edition={edition} onSaved={reload} />
          )}
        </div>
      </div>

      {editingPub && (
        <PublicationModal pub={editingPub} onClose={() => setEditingPub(null)} onSaved={() => { setEditingPub(null); reload(); }} />
      )}
    </div>
  );
}

// ──────────────────────────────────────────────────────
// KPI tile
// ──────────────────────────────────────────────────────
function Kpi({ label, value }) {
  return (
    <div className="bg-white border border-neutral-200 rounded-lg px-3 py-2">
      <div className="text-[10px] text-neutral-500 uppercase tracking-wide">{label}</div>
      <div className="text-lg md:text-xl font-bold text-brand-ink">{value}</div>
    </div>
  );
}

// ──────────────────────────────────────────────────────
// TAB: Traduzioni (i18n, mig 163) — [core]
//
// Italiano a sinistra in sola lettura, lingua scelta a destra editabile.
// L'italiano NON si tocca da qui: si modifica dal tab Sezioni, dove sta il
// piatto. Due punti di scrittura sullo stesso testo divergono sempre.
// ──────────────────────────────────────────────────────
const CAMPO_LABEL = {
  titolo: "Titolo",
  descrizione: "Descrizione",
  prezzo_label: "Prezzo (testo)",
  sottotitolo: "Sottotitolo",
  note: "Note",
};

const FILTRI = [
  { key: "tutte",     label: "Tutte" },
  { key: "mancanti",  label: "Da tradurre" },
  { key: "rivedere",  label: "Da rivedere" },
  { key: "non_rivis", label: "Non approvate" },
];

const chiaveRiga = (r) => `${r.entita}:${r.entita_id}:${r.campo}`;

function TraduzioniTab({ editionId }) {
  const { toast } = useToast();
  const [lang, setLang] = useState(LINGUE_TRADOTTE[0]);
  const [righe, setRighe] = useState([]);
  const [coverage, setCoverage] = useState(null);
  const [bozza, setBozza] = useState({});     // chiave -> { valore, rivisto }
  const [loading, setLoading] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [filtro, setFiltro] = useState("tutte");

  const caricaCoverage = useCallback(async () => {
    try {
      const r = await apiFetch(`${API_BASE}/menu-carta/translations/coverage/?edition_id=${editionId}`);
      if (r.ok) setCoverage(await r.json());
    } catch { /* la copertura è un di più: se non arriva, si traduce lo stesso */ }
  }, [editionId]);

  const carica = useCallback(async () => {
    setLoading(true);
    try {
      const r = await apiFetch(`${API_BASE}/menu-carta/translations/?edition_id=${editionId}&lang=${lang}`);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const j = await r.json();
      setRighe(j.righe || []);
      setBozza({});   // cambiando lingua si riparte puliti: niente modifiche orfane
    } catch (e) {
      toast(`Errore nel caricamento: ${e.message}`, { kind: "error" });
    } finally {
      setLoading(false);
    }
  }, [editionId, lang, toast]);

  useEffect(() => { carica(); }, [carica]);
  useEffect(() => { caricaCoverage(); }, [caricaCoverage]);

  const modifica = (r, patch) => {
    const k = chiaveRiga(r);
    setBozza(prev => ({
      ...prev,
      [k]: {
        valore:  patch.valore  !== undefined ? patch.valore  : (prev[k]?.valore  ?? r.valore ?? ""),
        rivisto: patch.rivisto !== undefined ? patch.rivisto : (prev[k]?.rivisto ?? r.rivisto ?? false),
      },
    }));
  };

  const valoreDi  = (r) => bozza[chiaveRiga(r)]?.valore  ?? r.valore ?? "";
  const rivistoDi = (r) => bozza[chiaveRiga(r)]?.rivisto ?? r.rivisto ?? false;

  const nModificate = Object.keys(bozza).length;

  const salva = async () => {
    if (nModificate === 0) return;
    setSalvando(true);
    try {
      const payload = Object.entries(bozza).map(([k, v]) => {
        const [entita, entita_id, campo] = k.split(":");
        return { entita, entita_id: Number(entita_id), campo, lang, valore: v.valore, rivisto: !!v.rivisto };
      });
      const r = await apiFetch(`${API_BASE}/menu-carta/translations/`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ righe: payload }),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const j = await r.json();
      toast(
        `${LINGUE_LABEL[lang]}: ${j.scritte} salvate` + (j.cancellate ? `, ${j.cancellate} svuotate` : ""),
        { kind: "success" },
      );
      await carica();
      await caricaCoverage();
    } catch (e) {
      toast(`Salvataggio fallito: ${e.message}`, { kind: "error" });
    } finally {
      setSalvando(false);
    }
  };

  const righeFiltrate = useMemo(() => righe.filter(r => {
    if (filtro === "mancanti")  return !valoreDi(r).trim();
    if (filtro === "rivedere")  return r.stale;
    if (filtro === "non_rivis") return valoreDi(r).trim() && !rivistoDi(r);
    return true;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [righe, filtro, bozza]);

  // Raggruppa per sezione mantenendo l'ordine canonico già dato dal backend.
  const gruppi = useMemo(() => {
    const out = [];
    for (const r of righeFiltrate) {
      const ultimo = out[out.length - 1];
      if (ultimo && ultimo.sezione === r.sezione) ultimo.righe.push(r);
      else out.push({ sezione: r.sezione, righe: [r] });
    }
    return out;
  }, [righeFiltrate]);

  const cov = coverage?.lingue?.[lang];

  return (
    <div className="space-y-4">
      {/* Selettore lingua + copertura */}
      <div className="bg-white rounded-2xl border border-neutral-200 p-4">
        <div className="flex flex-wrap items-center gap-2 mb-3">
          {LINGUE_TRADOTTE.map(l => {
            const c = coverage?.lingue?.[l];
            const attiva = l === lang;
            return (
              <button
                key={l}
                type="button"
                onClick={() => setLang(l)}
                title={LINGUE_NOME[l]}
                className={`inline-flex items-center gap-1.5 px-3 py-2 min-h-[44px] rounded-lg text-sm font-semibold border transition ${
                  attiva
                    ? "bg-orange-600 border-orange-600 text-white"
                    : "bg-white border-neutral-300 text-neutral-600 hover:border-orange-400"
                }`}
              >
                <span aria-hidden="true">{LINGUE_BANDIERA[l]}</span>
                {LINGUE_LABEL[l]}
                {c && (
                  <span className={`ml-2 text-[11px] font-normal ${attiva ? "text-orange-100" : "text-neutral-400"}`}>
                    {c.tradotte}/{c.totale}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {cov && (
          <div>
            <div className="flex items-center justify-between text-xs text-neutral-600 mb-1">
              <span>
                <strong className="text-brand-ink">{LINGUE_NOME[lang]}</strong> — {cov.tradotte}/{cov.totale} campi tradotti
                {cov.tradotte > 0 && <> · {cov.riviste} approvati</>}
              </span>
              <span className="font-semibold">{cov.percentuale}%</span>
            </div>
            <div className="h-2 bg-neutral-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-emerald-500 transition-all"
                style={{ width: `${cov.percentuale}%` }}
              />
            </div>
          </div>
        )}
      </div>

      {/* Filtri + salva */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-1">
          {FILTRI.map(f => (
            <button
              key={f.key}
              type="button"
              onClick={() => setFiltro(f.key)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition ${
                filtro === f.key
                  ? "bg-neutral-800 border-neutral-800 text-white"
                  : "bg-white border-neutral-300 text-neutral-600 hover:border-neutral-400"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          {nModificate > 0 && (
            <span className="text-xs text-neutral-500">{nModificate} da salvare</span>
          )}
          <Btn variant="primary" size="md" onClick={salva} loading={salvando} disabled={nModificate === 0}>
            Salva {LINGUE_LABEL[lang]}
          </Btn>
        </div>
      </div>

      {loading && <div className="text-sm text-neutral-500 py-6">Caricamento traduzioni…</div>}

      {!loading && righeFiltrate.length === 0 && (
        <EmptyState
          icon="🌍"
          title={filtro === "tutte" ? "Niente da tradurre" : "Nessuna riga con questo filtro"}
          description={
            filtro === "tutte"
              ? "Questa edizione non ha ancora testi in italiano da tradurre."
              : "Prova a cambiare filtro: qui compaiono solo le righe che lo soddisfano."
          }
        />
      )}

      {/* Tabella */}
      {!loading && gruppi.map((g, gi) => (
        <div key={`${g.sezione}-${gi}`}>
          <h3 className="text-sm font-bold uppercase tracking-wider text-orange-700 mb-2">
            {labelSezione(g.sezione, "it")}
            <span className="text-neutral-400 font-normal"> ({g.righe.length})</span>
          </h3>
          <div className="bg-white rounded-2xl border border-neutral-200 overflow-hidden divide-y divide-neutral-100">
            {g.righe.map(r => {
              const k = chiaveRiga(r);
              const toccata = k in bozza;
              return (
                <div
                  key={k}
                  className={`p-3 md:p-4 ${r.stale ? "bg-amber-50" : ""} ${toccata ? "ring-1 ring-inset ring-orange-200" : ""}`}
                >
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-500">
                      {CAMPO_LABEL[r.campo] || r.campo}
                    </span>
                    {r.contesto && (
                      <span className="text-[10px] text-neutral-400 italic">{r.contesto}</span>
                    )}
                    {r.stale && (
                      // L'italiano è cambiato dopo l'ultima traduzione: questa
                      // riga descrive un piatto che non è più quello.
                      <StatusBadge tone="warning" size="sm">Italiano modificato — da rivedere</StatusBadge>
                    )}
                  </div>

                  <div className="grid md:grid-cols-2 gap-3">
                    {/* Italiano — sola lettura */}
                    <div>
                      <div className="text-[10px] uppercase tracking-wider text-neutral-400 mb-1">Italiano</div>
                      <div className="text-sm text-neutral-800 bg-neutral-50 border border-neutral-200 rounded-lg px-3 py-2 whitespace-pre-wrap">
                        {r.italiano}
                      </div>
                    </div>

                    {/* Traduzione — editabile */}
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-[10px] uppercase tracking-wider text-neutral-400">
                          {LINGUE_NOME[lang]}
                        </span>
                        <label className="flex items-center gap-1.5 text-[11px] text-neutral-600 cursor-pointer select-none">
                          <input
                            type="checkbox"
                            checked={rivistoDi(r)}
                            onChange={(e) => modifica(r, { rivisto: e.target.checked })}
                            className="w-4 h-4 accent-emerald-600"
                          />
                          Approvata
                        </label>
                      </div>
                      {/* M.I Textarea passa il VALORE a onChange, non l'evento. */}
                      <Textarea
                        rows={r.campo === "descrizione" || r.campo === "note" ? 3 : 2}
                        value={valoreDi(r)}
                        onChange={(v) => modifica(r, { valore: v })}
                        placeholder={`${LINGUE_NOME[lang]}… (vuoto = resta l'italiano)`}
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}

      {!loading && righe.length > 0 && (
        <p className="text-xs text-neutral-500 pt-2">
          Un campo lasciato vuoto non è un errore: in carta l'ospite vedrà l'italiano.
          Svuotare una traduzione già salvata la cancella e fa tornare l'italiano.
        </p>
      )}
    </div>
  );
}

// ──────────────────────────────────────────────────────
// TAB: Sezioni (lista piatti raggruppati)
// ──────────────────────────────────────────────────────
function SezioniTab({ sezioni, onEdit, editionId, onReload }) {
  return (
    <div className="space-y-6">
      {SEZIONI_ORDER.map(s => {
        const items = sezioni[s.key] || [];
        if (items.length === 0) return null;
        return (
          <div key={s.key}>
            <h2 className="text-sm font-bold uppercase tracking-wider text-orange-700 mb-2">
              {s.label} <span className="text-neutral-400 font-normal">({items.length})</span>
            </h2>
            <div className="bg-white rounded-2xl border border-neutral-200 overflow-hidden divide-y divide-neutral-100">
              {items.map(p => (
                <PublicationRow key={p.id} pub={p} onEdit={() => onEdit(p)} />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function PublicationRow({ pub, onEdit }) {
  const titolo = pub.titolo_override || pub.recipe_menu_name || "(senza titolo)";
  const desc = pub.descrizione_override || pub.recipe_menu_description;
  const prezzoLabel = pub.prezzo_label
    || (pub.prezzo_singolo != null ? `${pub.prezzo_singolo} €` : "")
    || (pub.prezzo_min != null ? `${pub.prezzo_min}-${pub.prezzo_max} €` : "")
    || (pub.prezzo_piccolo != null ? `${pub.prezzo_piccolo} / ${pub.prezzo_grande} €` : "")
    || "—";

  return (
    <div className="px-4 py-3 hover:bg-neutral-50 cursor-pointer flex items-start gap-3"
         onClick={onEdit}>
      {/* Modulo D: thumbnail foto se presente */}
      {pub.foto_path && (
        <img
          src={pub.foto_path}
          alt={titolo}
          className="w-14 h-14 object-cover rounded border border-neutral-200 flex-shrink-0"
          loading="lazy"
          onError={(e) => { e.currentTarget.style.display = "none"; }}
        />
      )}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <h3 className="font-medium text-brand-ink truncate">{titolo}</h3>
          {pub.badge && (
            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-brand-red/10 text-brand-red uppercase">
              {pub.badge}
            </span>
          )}
          {pub.consigliato_per && (
            <span className="text-[10px] text-neutral-500">consigliato per {pub.consigliato_per}</span>
          )}
          {pub.descrizione_variabile === true && (
            <span className="text-[10px] text-amber-600 italic">descrizione variabile</span>
          )}
          {!pub.is_visible && (
            <span className="text-[10px] text-neutral-400 italic">nascosto</span>
          )}
        </div>
        {desc && <p className="text-xs text-neutral-600 mt-0.5 line-clamp-2">{desc}</p>}
        {pub.allergeni_dichiarati && (
          <p className="text-[10px] text-neutral-500 mt-1">Allergeni: {pub.allergeni_dichiarati}</p>
        )}
      </div>
      <div className="text-right flex-shrink-0">
        <div className="text-base font-bold text-brand-blue whitespace-nowrap">{prezzoLabel}</div>
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────
// TAB: Degustazioni
// ──────────────────────────────────────────────────────
function DegustazioniTab({ paths }) {
  if (!paths || paths.length === 0) {
    return <div className="bg-white rounded-2xl border border-neutral-200 p-6 text-center text-sm text-neutral-500">
      Nessuna degustazione configurata per questa edizione.
    </div>;
  }
  return (
    <div className="grid md:grid-cols-2 gap-4">
      {paths.map(tp => (
        <div key={tp.id} className="bg-white rounded-2xl border border-neutral-200 p-5 shadow-sm">
          <h3 className="text-xl font-bold text-brand-ink" style={{ fontFamily: "'Playfair Display', serif" }}>
            {tp.nome}
          </h3>
          {tp.sottotitolo && <p className="text-xs text-neutral-600 italic mt-1">{tp.sottotitolo}</p>}
          <div className="text-2xl font-bold text-brand-blue mt-3 mb-3">{tp.prezzo_persona} € / persona</div>
          <ol className="space-y-2 mb-3">
            {tp.steps.map(s => (
              <li key={s.id} className="text-sm text-brand-ink flex items-start gap-2">
                <span className="text-brand-blue font-bold flex-shrink-0">{Math.floor(s.sort_order / 10)}.</span>
                <span>{s.publication_label || s.titolo_libero || "—"}</span>
              </li>
            ))}
          </ol>
          {tp.note && <p className="text-[11px] text-neutral-500 italic border-t border-neutral-100 pt-2">{tp.note}</p>}
        </div>
      ))}
    </div>
  );
}

// ──────────────────────────────────────────────────────
// TAB: Anteprima (rendering simil-PDF)
// ──────────────────────────────────────────────────────
function AnteprimaTab({ edition, sezioni, tasting_paths }) {
  return (
    <div className="bg-white rounded-2xl border border-neutral-200 shadow-sm p-6 md:p-10 max-w-3xl mx-auto"
         style={{ fontFamily: "'Helvetica Neue', sans-serif" }}>
      <div className="text-center mb-8 pb-4 border-b border-neutral-200">
        <h1 className="text-3xl font-bold text-brand-ink" style={{ fontFamily: "'Playfair Display', serif" }}>
          OSTERIA TRE GOBBI
        </h1>
        <p className="text-sm text-neutral-600 mt-2">{edition.nome}</p>
      </div>

      {SEZIONI_ORDER.map(s => {
        const items = (sezioni[s.key] || []).filter(p => p.is_visible);
        if (items.length === 0) return null;
        if (s.key === "servizio" || s.key === "bambini") return null; // li metto in fondo
        return (
          <div key={s.key} className="mb-8">
            <h2 className="text-2xl text-center mb-5 tracking-widest" style={{ fontFamily: "'Playfair Display', serif" }}>
              {s.label.toUpperCase()}
            </h2>
            <div className="space-y-4">
              {items.map(p => {
                const titolo = p.titolo_override || p.recipe_menu_name || "(senza titolo)";
                const desc = p.descrizione_override || p.recipe_menu_description;
                const prezzo = p.prezzo_label
                  || (p.prezzo_singolo != null ? p.prezzo_singolo : "")
                  || (p.prezzo_min != null ? `da ${p.prezzo_min} a ${p.prezzo_max}` : "")
                  || (p.prezzo_piccolo != null ? `${p.prezzo_piccolo} / ${p.prezzo_grande}` : "");
                return (
                  <div key={p.id} className="flex justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <div className="font-bold uppercase tracking-wide text-sm">{titolo}</div>
                      {desc && <div className="text-xs text-neutral-700 mt-1 leading-relaxed">{desc}</div>}
                    </div>
                    <div className="font-bold flex-shrink-0">{prezzo}</div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}

      {tasting_paths.length > 0 && (
        <div className="border-t border-neutral-200 pt-8 mt-8">
          {tasting_paths.map(tp => (
            <div key={tp.id} className="mb-6 text-center">
              <h2 className="text-2xl tracking-widest" style={{ fontFamily: "'Playfair Display', serif" }}>
                DEGUSTAZIONE
              </h2>
              <p className="italic text-sm mb-4">"{tp.nome}"</p>
              {tp.sottotitolo && <p className="text-xs text-neutral-600 mb-4 max-w-md mx-auto">{tp.sottotitolo}</p>}
              <div className="space-y-1 text-sm">
                {tp.steps.map(s => (
                  <div key={s.id} className="font-semibold uppercase tracking-wider text-xs">
                    {s.publication_label || s.titolo_libero}
                  </div>
                ))}
              </div>
              <div className="text-xl font-bold mt-4">{tp.prezzo_persona}</div>
            </div>
          ))}
        </div>
      )}

      {/* servizio + bambini in fondo */}
      <div className="border-t border-neutral-200 pt-6 mt-6 grid grid-cols-2 gap-2 text-sm">
        {(sezioni.servizio || []).map(p => (
          <div key={p.id} className="flex justify-between border-b border-neutral-100 py-1">
            <span>{p.titolo_override}</span>
            <span className="font-bold">{p.prezzo_singolo}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────
// TAB: Anagrafica edition
// ──────────────────────────────────────────────────────
function AnagraficaTab({ edition, onSaved }) {
  const [form, setForm] = useState({
    nome: edition.nome || "",
    stagione: edition.stagione || "",
    anno: edition.anno || "",
    data_inizio: edition.data_inizio || "",
    data_fine: edition.data_fine || "",
    note: edition.note || "",
  });
  const [busy, setBusy] = useState(false);

  const handleSave = async () => {
    setBusy(true);
    try {
      const r = await apiFetch(`${API_BASE}/menu-carta/editions/${edition.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, anno: form.anno ? parseInt(form.anno) : null }),
      });
      if (!r.ok) throw new Error(await r.text());
      onSaved();
      alert("Modifiche salvate");
    } catch (e) { alert("Errore: " + e.message); }
    finally { setBusy(false); }
  };

  return (
    <div className="max-w-2xl bg-white rounded-2xl border border-neutral-200 p-5 space-y-3">
      <Field2 label="Nome" value={form.nome} onChange={v => setForm(p => ({ ...p, nome: v }))} />
      <div className="grid grid-cols-2 gap-3">
        <Field2 label="Stagione" value={form.stagione} onChange={v => setForm(p => ({ ...p, stagione: v }))} />
        <Field2 label="Anno" type="number" value={form.anno} onChange={v => setForm(p => ({ ...p, anno: v }))} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field2 label="Data inizio" type="date" value={form.data_inizio} onChange={v => setForm(p => ({ ...p, data_inizio: v }))} />
        <Field2 label="Data fine" type="date" value={form.data_fine} onChange={v => setForm(p => ({ ...p, data_fine: v }))} />
      </div>
      <Field2 label="Note" textarea value={form.note} onChange={v => setForm(p => ({ ...p, note: v }))} />
      <p className="text-xs text-neutral-500">Slug: <code>{edition.slug}</code> (non modificabile)</p>
      <div className="flex justify-end pt-2">
        <Btn variant="primary" size="md" onClick={handleSave} loading={busy}>
          {busy ? "Salvo…" : "Salva modifiche"}
        </Btn>
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────
// Modal: edit publication
// ──────────────────────────────────────────────────────
function PublicationModal({ pub, onClose, onSaved }) {
  const [form, setForm] = useState({
    titolo_override: pub.titolo_override || "",
    descrizione_override: pub.descrizione_override || "",
    sezione: pub.sezione,
    sort_order: pub.sort_order,
    prezzo_singolo: pub.prezzo_singolo ?? "",
    prezzo_min: pub.prezzo_min ?? "",
    prezzo_max: pub.prezzo_max ?? "",
    prezzo_piccolo: pub.prezzo_piccolo ?? "",
    prezzo_grande: pub.prezzo_grande ?? "",
    prezzo_label: pub.prezzo_label || "",
    consigliato_per: pub.consigliato_per ?? "",
    descrizione_variabile: pub.descrizione_variabile,
    badge: pub.badge || "",
    is_visible: pub.is_visible,
    allergeni_dichiarati: pub.allergeni_dichiarati || "",
  });
  const [busy, setBusy] = useState(false);
  // Modulo D: foto piatto
  const [fotoPath, setFotoPath] = useState(pub.foto_path || null);
  const [fotoUploading, setFotoUploading] = useState(false);
  const [fotoCacheBust, setFotoCacheBust] = useState(Date.now()); // forza reload preview dopo upload

  const titolo = pub.titolo_override || pub.recipe_menu_name || "(senza titolo)";

  const numOrNull = (v) => (v === "" || v == null ? null : Number(v));

  const handleUploadFoto = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) { alert("File troppo grande (max 10MB)"); return; }
    setFotoUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const token = localStorage.getItem("token");
      const r = await fetch(`${API_BASE}/menu-carta/publications/${pub.id}/foto`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: fd,
      });
      if (!r.ok) throw new Error(await r.text());
      const data = await r.json();
      setFotoPath(data.foto_path);
      setFotoCacheBust(Date.now());
    } catch (err) {
      alert(`Upload foto fallito: ${err.message}`);
    } finally {
      setFotoUploading(false);
      e.target.value = ""; // reset input
    }
  };

  const handleDeleteFoto = async () => {
    if (!fotoPath) return;
    if (!confirm("Rimuovere la foto del piatto?")) return;
    setFotoUploading(true);
    try {
      const r = await apiFetch(`${API_BASE}/menu-carta/publications/${pub.id}/foto`, { method: "DELETE" });
      if (!r.ok) throw new Error(await r.text());
      setFotoPath(null);
    } catch (err) {
      alert(`Rimozione foto fallita: ${err.message}`);
    } finally {
      setFotoUploading(false);
    }
  };

  const handleSave = async () => {
    const payload = {
      titolo_override: form.titolo_override || null,
      descrizione_override: form.descrizione_override || null,
      sezione: form.sezione,
      sort_order: parseInt(form.sort_order) || 0,
      prezzo_singolo: numOrNull(form.prezzo_singolo),
      prezzo_min: numOrNull(form.prezzo_min),
      prezzo_max: numOrNull(form.prezzo_max),
      prezzo_piccolo: numOrNull(form.prezzo_piccolo),
      prezzo_grande: numOrNull(form.prezzo_grande),
      prezzo_label: form.prezzo_label || null,
      consigliato_per: numOrNull(form.consigliato_per),
      descrizione_variabile: !!form.descrizione_variabile,
      badge: form.badge || null,
      is_visible: !!form.is_visible,
      allergeni_dichiarati: form.allergeni_dichiarati || null,
    };
    setBusy(true);
    try {
      const r = await apiFetch(`${API_BASE}/menu-carta/publications/${pub.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!r.ok) throw new Error(await r.text());
      onSaved();
    } catch (e) { alert("Errore: " + e.message); }
    finally { setBusy(false); }
  };

  const handleDelete = async () => {
    if (!confirm(`Rimuovere "${titolo}" dal menu?`)) return;
    setBusy(true);
    try {
      const r = await apiFetch(`${API_BASE}/menu-carta/publications/${pub.id}`, { method: "DELETE" });
      if (!r.ok) throw new Error(await r.text());
      onSaved();
    } catch (e) { alert("Errore: " + e.message); }
    finally { setBusy(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-3 border-b border-neutral-200 sticky top-0 bg-white">
          <div>
            <h3 className="text-base font-bold text-brand-ink">Pubblicazione: {titolo}</h3>
            {pub.recipe_id && <p className="text-[10px] text-neutral-500">Ricetta collegata #{pub.recipe_id}</p>}
          </div>
          <button onClick={onClose} className="text-neutral-400 hover:text-neutral-700 text-xl">×</button>
        </div>
        <div className="p-5 space-y-4">

          {/* Modulo D: Foto piatto */}
          <div className="border border-neutral-200 rounded-lg p-3">
            <div className="text-[11px] font-semibold text-neutral-600 uppercase tracking-wide mb-2">Foto piatto</div>
            {fotoPath ? (
              <div className="flex items-start gap-3">
                <a
                  href={`${fotoPath}?v=${fotoCacheBust}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-shrink-0 group"
                  title="Apri foto in nuova scheda"
                >
                  <img
                    key={`${fotoPath}-${fotoCacheBust}`}
                    src={`${fotoPath}?v=${fotoCacheBust}`}
                    alt={titolo}
                    className="w-32 h-24 object-cover rounded border border-neutral-200 group-hover:border-brand-blue transition"
                    onError={(e) => {
                      // Se img tag fallisce a renderizzare, mostra placeholder broken
                      e.currentTarget.style.opacity = "0.3";
                      e.currentTarget.alt = "Anteprima non disponibile (clicca per aprire diretto)";
                    }}
                  />
                </a>
                <div className="flex-1 min-w-0">
                  <p className="text-[11px] text-neutral-500 mb-1 truncate">{fotoPath}</p>
                  <a
                    href={`${fotoPath}?v=${fotoCacheBust}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[11px] text-brand-blue hover:underline mb-2 inline-block"
                  >
                    Apri foto in nuova scheda →
                  </a>
                  <div className="flex flex-wrap gap-2 mt-1">
                    <label className={`inline-flex items-center px-3 py-1.5 rounded-lg text-xs font-medium cursor-pointer transition ${fotoUploading ? "bg-neutral-200 text-neutral-400" : "bg-brand-blue text-white hover:opacity-90"}`}>
                      {fotoUploading ? "Carico…" : "↻ Sostituisci"}
                      <input type="file" accept="image/*" onChange={handleUploadFoto} disabled={fotoUploading} className="hidden" />
                    </label>
                    <Btn variant="chip" tone="red" size="sm" onClick={handleDeleteFoto} loading={fotoUploading}>
                      Rimuovi foto
                    </Btn>
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-3">
                <div className="w-32 h-24 rounded border-2 border-dashed border-neutral-300 flex items-center justify-center text-neutral-400 text-3xl flex-shrink-0">
                  📷
                </div>
                <div className="flex-1">
                  <p className="text-xs text-neutral-600 mb-2">
                    Nessuna foto. JPG/PNG/WEBP, max 10MB. Verrà ridimensionata a 1200×800.
                  </p>
                  <label className={`inline-flex items-center px-3 py-1.5 rounded-lg text-xs font-medium cursor-pointer transition ${fotoUploading ? "bg-neutral-200 text-neutral-400" : "bg-brand-blue text-white hover:opacity-90"}`}>
                    {fotoUploading ? "Carico…" : "+ Carica foto"}
                    <input type="file" accept="image/*" onChange={handleUploadFoto} disabled={fotoUploading} className="hidden" />
                  </label>
                </div>
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field2 label="Sezione" value={form.sezione} onChange={v => setForm(p => ({ ...p, sezione: v }))}
              type="select" options={SEZIONI_ORDER.map(s => ({ value: s.key, label: s.label }))} />
            <Field2 label="Ordine" type="number" value={form.sort_order} onChange={v => setForm(p => ({ ...p, sort_order: v }))} />
          </div>

          <Field2 label="Titolo override (vuoto = nome ricetta)" value={form.titolo_override}
            onChange={v => setForm(p => ({ ...p, titolo_override: v }))} placeholder={pub.recipe_menu_name} />

          <Field2 label="Descrizione override" textarea value={form.descrizione_override}
            onChange={v => setForm(p => ({ ...p, descrizione_override: v }))}
            placeholder={pub.recipe_menu_description} />

          <div className="border border-neutral-200 rounded-lg p-3">
            <div className="text-[11px] font-semibold text-neutral-600 uppercase tracking-wide mb-2">Prezzo</div>
            <div className="grid grid-cols-3 gap-2">
              <Field2 label="Singolo" type="number" value={form.prezzo_singolo}
                onChange={v => setForm(p => ({ ...p, prezzo_singolo: v }))} placeholder="22" />
              <Field2 label="Min (range)" type="number" value={form.prezzo_min}
                onChange={v => setForm(p => ({ ...p, prezzo_min: v }))} placeholder="14" />
              <Field2 label="Max (range)" type="number" value={form.prezzo_max}
                onChange={v => setForm(p => ({ ...p, prezzo_max: v }))} placeholder="26" />
              <Field2 label="Piccolo (P/G)" type="number" value={form.prezzo_piccolo}
                onChange={v => setForm(p => ({ ...p, prezzo_piccolo: v }))} placeholder="14" />
              <Field2 label="Grande (P/G)" type="number" value={form.prezzo_grande}
                onChange={v => setForm(p => ({ ...p, prezzo_grande: v }))} placeholder="20" />
              <Field2 label="Etichetta libera" value={form.prezzo_label}
                onChange={v => setForm(p => ({ ...p, prezzo_label: v }))} placeholder="da 14 a 26" />
            </div>
            <p className="text-[10px] text-neutral-500 mt-1">
              Compila <strong>uno solo</strong> dei tre schemi: singolo / min+max / piccolo+grande.
              L'etichetta libera (es. "da 14 a 26") sovrascrive il rendering.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field2 label="Consigliato per" type="number" value={form.consigliato_per}
              onChange={v => setForm(p => ({ ...p, consigliato_per: v }))} placeholder="es. 2" />
            <Field2 label="Badge" value={form.badge} onChange={v => setForm(p => ({ ...p, badge: v }))}
              placeholder="firma / classico / novità" />
          </div>

          <div>
            <Field2 label="Allergeni dichiarati (CSV)" value={form.allergeni_dichiarati}
              onChange={v => setForm(p => ({ ...p, allergeni_dichiarati: v }))}
              placeholder={pub.recipe_allergeni_calcolati || "glutine,latte,uova,pesce"} />
            {pub.recipe_allergeni_calcolati && (
              <div className="mt-1 flex items-center gap-2 text-[11px] text-neutral-600">
                <span>Calcolati dalla ricetta: <code className="bg-amber-50 text-amber-900 px-1 rounded">{pub.recipe_allergeni_calcolati}</code></span>
                {pub.recipe_allergeni_calcolati !== form.allergeni_dichiarati && (
                  <button
                    type="button"
                    onClick={() => setForm(p => ({ ...p, allergeni_dichiarati: pub.recipe_allergeni_calcolati }))}
                    className="text-orange-700 hover:text-orange-900 underline font-medium"
                  >
                    Usa questi
                  </button>
                )}
              </div>
            )}
          </div>

          <div className="flex gap-4 pt-2">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={form.descrizione_variabile}
                onChange={e => setForm(p => ({ ...p, descrizione_variabile: e.target.checked }))} />
              Descrizione variabile (raccontato a voce)
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={form.is_visible}
                onChange={e => setForm(p => ({ ...p, is_visible: e.target.checked }))} />
              Visibile in carta
            </label>
          </div>

        </div>
        <div className="flex items-center justify-between gap-2 px-5 py-3 border-t border-neutral-200 sticky bottom-0 bg-white">
          <Btn variant="chip" tone="red" size="sm" onClick={handleDelete} loading={busy}>
            Rimuovi dal menu
          </Btn>
          <div className="flex gap-2">
            <Btn variant="secondary" size="sm" onClick={onClose}>Annulla</Btn>
            <Btn variant="primary" size="sm" onClick={handleSave} loading={busy}>
              {busy ? "Salvo…" : "Salva"}
            </Btn>
          </div>
        </div>
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────
// Form field
// ──────────────────────────────────────────────────────
function Field2({ label, value, onChange, type = "text", placeholder, options, textarea }) {
  return (
    <div>
      <label className="block text-[11px] font-semibold text-neutral-600 uppercase tracking-wide mb-1">{label}</label>
      {type === "select" ? (
        <select value={value || ""} onChange={e => onChange(e.target.value)}
          className="w-full border border-neutral-300 rounded-lg px-3 py-2 text-sm bg-white">
          {(options || []).map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      ) : textarea ? (
        <textarea value={value || ""} rows={3} onChange={e => onChange(e.target.value)} placeholder={placeholder}
          className="w-full border border-neutral-300 rounded-lg px-3 py-2 text-sm" />
      ) : (
        <input type={type} value={value || ""} onChange={e => onChange(e.target.value)} placeholder={placeholder}
          className="w-full border border-neutral-300 rounded-lg px-3 py-2 text-sm" />
      )}
    </div>
  );
}
