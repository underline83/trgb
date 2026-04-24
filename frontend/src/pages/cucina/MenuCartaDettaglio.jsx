// frontend/src/pages/cucina/MenuCartaDettaglio.jsx
// @version: v1.0-menu-carta-dettaglio (sessione 57 — 2026-04-25)
//
// Dettaglio di un'edizione: testa fissa colorata + tab.
// Tab: Sezioni (lista piatti raggruppata) | Degustazioni | Anteprima | Anagrafica
//
// Endpoint: GET /menu-carta/editions/{id}

import React, { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { API_BASE, apiFetch } from "../../config/api";

const SEZIONI_ORDER = [
  { key: "antipasti",          label: "Antipasti" },
  { key: "paste_risi_zuppe",   label: "Paste, risi e zuppe" },
  { key: "piatti_del_giorno",  label: "Piatti del giorno" },
  { key: "secondi",            label: "Secondi" },
  { key: "contorni",           label: "Contorni" },
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
      <div className="max-w-6xl mx-auto">

        {/* ═══ TESTA FISSA ═══ */}
        <div className="bg-gradient-to-b from-white to-brand-cream border-b-2 border-brand-blue/20 px-4 md:px-6 py-4 md:py-5 sticky top-0 z-10">
          <div className="flex items-center gap-2 mb-2 text-xs">
            <Link to="/menu-carta" className="text-brand-blue hover:underline">← Tutte le edizioni</Link>
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
              <h1 className="text-xl md:text-3xl font-bold text-brand-ink leading-tight" style={{ fontFamily: "'Playfair Display', serif" }}>
                {edition.nome}
              </h1>
              {(edition.data_inizio || edition.data_fine) && (
                <p className="text-xs text-neutral-600 mt-1">
                  {edition.data_inizio || "?"} → {edition.data_fine || "?"}
                </p>
              )}
            </div>
            <div className="flex flex-col gap-1.5 flex-shrink-0">
              <a href={`${API_BASE}/menu-carta/editions/${edition.id}/pdf`} target="_blank" rel="noopener noreferrer"
                 className="px-3 py-1.5 rounded-lg bg-brand-ink text-white text-xs font-medium hover:opacity-90 whitespace-nowrap">
                ⬇ PDF stampabile
              </a>
              <button
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
                className="px-3 py-1.5 rounded-lg bg-brand-blue text-white text-xs font-medium hover:opacity-90 whitespace-nowrap">
                ⚙ Genera MEP cucina
              </button>
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
                      ? "text-brand-ink border-b-2 border-brand-blue -mb-px"
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
            <h2 className="text-sm font-bold uppercase tracking-wider text-brand-blue mb-2">
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
    <div className="px-4 py-3 hover:bg-neutral-50 cursor-pointer flex items-start justify-between gap-3"
         onClick={onEdit}>
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
        <button onClick={handleSave} disabled={busy}
          className="px-4 py-2 rounded-lg bg-brand-blue text-white text-sm font-medium disabled:opacity-50">
          {busy ? "Salvo…" : "Salva modifiche"}
        </button>
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

  const titolo = pub.titolo_override || pub.recipe_menu_name || "(senza titolo)";

  const numOrNull = (v) => (v === "" || v == null ? null : Number(v));

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

          <Field2 label="Allergeni dichiarati (CSV)" value={form.allergeni_dichiarati}
            onChange={v => setForm(p => ({ ...p, allergeni_dichiarati: v }))}
            placeholder="glutine,latte,uova,pesce" />

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
          <button onClick={handleDelete} disabled={busy}
            className="px-3 py-1.5 rounded-lg bg-red-50 text-brand-red text-sm border border-red-200">
            Rimuovi dal menu
          </button>
          <div className="flex gap-2">
            <button onClick={onClose} className="px-3 py-1.5 rounded-lg bg-neutral-100 text-neutral-700 text-sm">Annulla</button>
            <button onClick={handleSave} disabled={busy}
              className="px-3 py-1.5 rounded-lg bg-brand-blue text-white text-sm font-medium disabled:opacity-50">
              {busy ? "Salvo…" : "Salva"}
            </button>
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
