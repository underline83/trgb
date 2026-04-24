// frontend/src/pages/cucina/MenuCartaElenco.jsx
// @version: v1.0-menu-carta-elenco (sessione 57 — 2026-04-25)
//
// Lista delle edizioni del menu carta. Una sola "in carta" alla volta,
// le altre in "bozza" o "archiviata". Da qui si pubblica, si clona, si
// elimina (solo bozze) e si entra in dettaglio.
//
// Endpoint: GET /menu-carta/editions/  (con filtri opzionali ?stato=)

import React, { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { API_BASE, apiFetch } from "../../config/api";

const STATO_BADGE = {
  in_carta:    { label: "IN CARTA",   classes: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  bozza:       { label: "BOZZA",      classes: "bg-amber-50 text-amber-700 border-amber-200" },
  archiviata:  { label: "ARCHIVIATA", classes: "bg-neutral-100 text-neutral-600 border-neutral-300" },
};

export default function MenuCartaElenco() {
  const nav = useNavigate();
  const [editions, setEditions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showNew, setShowNew] = useState(false);
  const [showClone, setShowClone] = useState(null); // edition obj
  const [error, setError] = useState(null);

  const loadEditions = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await apiFetch(`${API_BASE}/menu-carta/editions/`);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const data = await r.json();
      setEditions(data || []);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadEditions(); }, [loadEditions]);

  const inCarta = editions.filter(e => e.stato === "in_carta");
  const bozze = editions.filter(e => e.stato === "bozza");
  const archiviate = editions.filter(e => e.stato === "archiviata");

  return (
    <div className="min-h-screen bg-brand-cream">
      <div className="max-w-6xl mx-auto px-4 py-6">
        {/* Header pagina */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-brand-ink" style={{ fontFamily: "'Playfair Display', serif" }}>
              Menu Carta
            </h1>
            <p className="text-sm text-neutral-600 mt-1">
              Edizioni stagionali della carta dell'osteria
            </p>
          </div>
          <button
            onClick={() => setShowNew(true)}
            className="px-4 py-2 rounded-lg bg-brand-blue text-white font-medium hover:opacity-90 transition shadow-sm"
          >
            + Nuova edizione
          </button>
        </div>

        {error && (
          <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
            Errore caricamento: {error}
          </div>
        )}

        {loading && <p className="text-sm text-neutral-500">Caricamento…</p>}

        {!loading && editions.length === 0 && (
          <div className="bg-white rounded-2xl border border-neutral-200 p-8 text-center">
            <div className="text-4xl mb-2">📋</div>
            <p className="text-neutral-700 font-medium">Nessuna edizione ancora.</p>
            <p className="text-sm text-neutral-500 mt-1">
              Crea la prima edizione del menu carta per iniziare.
            </p>
          </div>
        )}

        {/* IN CARTA */}
        {inCarta.length > 0 && (
          <Section title="In carta" icon="●" iconColor="text-brand-green">
            {inCarta.map(e => (
              <EditionCard key={e.id} edition={e} onOpen={() => nav(`/menu-carta/${e.id}`)}
                onClone={() => setShowClone(e)} onReload={loadEditions} />
            ))}
          </Section>
        )}

        {/* BOZZE */}
        {bozze.length > 0 && (
          <Section title="Bozze" icon="◐" iconColor="text-amber-600">
            {bozze.map(e => (
              <EditionCard key={e.id} edition={e} onOpen={() => nav(`/menu-carta/${e.id}`)}
                onClone={() => setShowClone(e)} onReload={loadEditions} />
            ))}
          </Section>
        )}

        {/* ARCHIVIATE */}
        {archiviate.length > 0 && (
          <Section title="Archiviate" icon="▼" iconColor="text-neutral-400">
            {archiviate.map(e => (
              <EditionCard key={e.id} edition={e} onOpen={() => nav(`/menu-carta/${e.id}`)}
                onClone={() => setShowClone(e)} onReload={loadEditions} />
            ))}
          </Section>
        )}
      </div>

      {showNew && <NewEditionModal onClose={() => setShowNew(false)} onCreated={() => { setShowNew(false); loadEditions(); }} />}
      {showClone && <CloneEditionModal source={showClone} onClose={() => setShowClone(null)}
                       onCloned={(newId) => { setShowClone(null); loadEditions(); nav(`/menu-carta/${newId}`); }} />}
    </div>
  );
}

// ──────────────────────────────────────────────────────
// Sezione (in carta / bozze / archiviate)
// ──────────────────────────────────────────────────────
function Section({ title, icon, iconColor, children }) {
  return (
    <div className="mb-8">
      <div className="flex items-center gap-2 mb-3">
        <span className={`text-lg font-bold ${iconColor}`}>{icon}</span>
        <h2 className="text-sm font-semibold uppercase tracking-wider text-neutral-600">{title}</h2>
      </div>
      <div className="space-y-3">{children}</div>
    </div>
  );
}

// ──────────────────────────────────────────────────────
// Card singola edizione
// ──────────────────────────────────────────────────────
function EditionCard({ edition, onOpen, onClone, onReload }) {
  const badge = STATO_BADGE[edition.stato] || STATO_BADGE.bozza;
  const dateRange = (edition.data_inizio || edition.data_fine)
    ? `${edition.data_inizio || "?"} → ${edition.data_fine || "?"}`
    : "Senza date";

  const handlePublish = async () => {
    if (!confirm(`Pubblicare "${edition.nome}" come carta corrente? L'edizione attualmente in carta sarà archiviata.`)) return;
    const r = await apiFetch(`${API_BASE}/menu-carta/editions/${edition.id}/publish`, { method: "POST" });
    if (r.ok) onReload();
    else alert("Errore pubblicazione: " + r.status);
  };

  const handleArchive = async () => {
    if (!confirm(`Archiviare "${edition.nome}"?`)) return;
    const r = await apiFetch(`${API_BASE}/menu-carta/editions/${edition.id}/archive`, { method: "POST" });
    if (r.ok) onReload();
    else alert("Errore archiviazione: " + r.status);
  };

  const handleDelete = async () => {
    if (!confirm(`Eliminare definitivamente "${edition.nome}"? L'azione non è reversibile.`)) return;
    const r = await apiFetch(`${API_BASE}/menu-carta/editions/${edition.id}`, { method: "DELETE" });
    if (r.ok) onReload();
    else {
      const t = await r.text();
      alert("Errore eliminazione: " + t);
    }
  };

  return (
    <div className="bg-white rounded-2xl border border-neutral-200 shadow-sm hover:shadow-md transition overflow-hidden">
      <div className="p-4 md:p-5">
        <div className="flex items-start justify-between gap-3 mb-2">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 mb-1">
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded border ${badge.classes}`}>
                {badge.label}
              </span>
              {edition.stagione && (
                <span className="text-[10px] text-neutral-500 uppercase tracking-wider">
                  {edition.stagione} {edition.anno || ""}
                </span>
              )}
            </div>
            <h3 className="text-lg md:text-xl font-bold text-brand-ink truncate" style={{ fontFamily: "'Playfair Display', serif" }}>
              {edition.nome}
            </h3>
            <p className="text-xs text-neutral-500 mt-0.5">{dateRange}</p>
            {edition.note && (
              <p className="text-xs text-neutral-600 mt-2 line-clamp-2">{edition.note}</p>
            )}
          </div>
        </div>

        <div className="flex flex-wrap gap-2 mt-3">
          <button onClick={onOpen}
            className="px-3 py-1.5 rounded-lg bg-brand-blue text-white text-sm font-medium hover:opacity-90">
            Apri
          </button>
          <button onClick={onClone}
            className="px-3 py-1.5 rounded-lg bg-neutral-100 text-neutral-800 text-sm font-medium border border-neutral-200 hover:bg-neutral-200">
            Clona →
          </button>
          {edition.stato === "bozza" && (
            <>
              <button onClick={handlePublish}
                className="px-3 py-1.5 rounded-lg bg-brand-green text-white text-sm font-medium hover:opacity-90">
                Pubblica
              </button>
              <button onClick={handleDelete}
                className="px-3 py-1.5 rounded-lg bg-red-50 text-brand-red text-sm font-medium border border-red-200 hover:bg-red-100">
                Elimina
              </button>
            </>
          )}
          {edition.stato === "in_carta" && (
            <button onClick={handleArchive}
              className="px-3 py-1.5 rounded-lg bg-neutral-100 text-neutral-700 text-sm font-medium border border-neutral-200 hover:bg-neutral-200">
              Archivia
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────
// Modal: nuova edizione (vuota, da popolare poi)
// ──────────────────────────────────────────────────────
function NewEditionModal({ onClose, onCreated }) {
  const [form, setForm] = useState({ nome: "", slug: "", stagione: "", anno: new Date().getFullYear(), data_inizio: "", data_fine: "" });
  const [busy, setBusy] = useState(false);

  const slugify = (s) => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

  const handleNomeChange = (v) => setForm(p => ({ ...p, nome: v, slug: p.slug || slugify(v) }));

  const handleSubmit = async () => {
    if (!form.nome || !form.slug) { alert("Nome e slug obbligatori"); return; }
    setBusy(true);
    try {
      const r = await apiFetch(`${API_BASE}/menu-carta/editions/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!r.ok) throw new Error(await r.text());
      onCreated();
    } catch (e) { alert("Errore: " + e.message); }
    finally { setBusy(false); }
  };

  return (
    <ModalShell title="Nuova edizione" onClose={onClose}>
      <div className="space-y-3">
        <Field label="Nome *" value={form.nome} onChange={handleNomeChange} placeholder="es. Estate 2026" />
        <Field label="Slug *" value={form.slug} onChange={v => setForm(p => ({ ...p, slug: slugify(v) }))} placeholder="es. estate-2026" hint="URL-friendly, no spazi" />
        <div className="grid grid-cols-2 gap-3">
          <Field label="Stagione" value={form.stagione} onChange={v => setForm(p => ({ ...p, stagione: v }))} placeholder="primavera/estate/..." />
          <Field label="Anno" type="number" value={form.anno} onChange={v => setForm(p => ({ ...p, anno: parseInt(v) || "" }))} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Data inizio" type="date" value={form.data_inizio} onChange={v => setForm(p => ({ ...p, data_inizio: v }))} />
          <Field label="Data fine" type="date" value={form.data_fine} onChange={v => setForm(p => ({ ...p, data_fine: v }))} />
        </div>
      </div>
      <div className="flex justify-end gap-2 pt-4 border-t border-neutral-200 mt-4">
        <button onClick={onClose} className="px-3 py-1.5 rounded-lg bg-neutral-100 text-neutral-700 text-sm">Annulla</button>
        <button onClick={handleSubmit} disabled={busy}
          className="px-3 py-1.5 rounded-lg bg-brand-blue text-white text-sm font-medium disabled:opacity-50">
          {busy ? "Creazione…" : "Crea bozza"}
        </button>
      </div>
    </ModalShell>
  );
}

// ──────────────────────────────────────────────────────
// Modal: clona edizione
// ──────────────────────────────────────────────────────
function CloneEditionModal({ source, onClose, onCloned }) {
  const slugify = (s) => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const [form, setForm] = useState({ nome: source.nome + " (copia)", slug: source.slug + "-copia" });
  const [busy, setBusy] = useState(false);

  const handleSubmit = async () => {
    if (!form.nome || !form.slug) return;
    setBusy(true);
    try {
      const r = await apiFetch(`${API_BASE}/menu-carta/editions/${source.id}/clone`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!r.ok) throw new Error(await r.text());
      const data = await r.json();
      onCloned(data.id);
    } catch (e) { alert("Errore clone: " + e.message); }
    finally { setBusy(false); }
  };

  return (
    <ModalShell title={`Clona "${source.nome}"`} onClose={onClose}>
      <p className="text-sm text-neutral-600 mb-3">
        Verrà creata una nuova edizione in <strong>bozza</strong> con tutti i piatti e le degustazioni di "{source.nome}".
        Da lì potrai modificare/aggiungere/togliere e poi pubblicare quando pronto.
      </p>
      <div className="space-y-3">
        <Field label="Nome nuova edizione *" value={form.nome} onChange={v => setForm(p => ({ ...p, nome: v }))} />
        <Field label="Slug *" value={form.slug} onChange={v => setForm(p => ({ ...p, slug: slugify(v) }))} />
      </div>
      <div className="flex justify-end gap-2 pt-4 border-t border-neutral-200 mt-4">
        <button onClick={onClose} className="px-3 py-1.5 rounded-lg bg-neutral-100 text-neutral-700 text-sm">Annulla</button>
        <button onClick={handleSubmit} disabled={busy}
          className="px-3 py-1.5 rounded-lg bg-brand-blue text-white text-sm font-medium disabled:opacity-50">
          {busy ? "Clonazione…" : "Clona"}
        </button>
      </div>
    </ModalShell>
  );
}

// ──────────────────────────────────────────────────────
// Helpers UI
// ──────────────────────────────────────────────────────
function ModalShell({ title, onClose, children }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-3 border-b border-neutral-200">
          <h3 className="text-base font-bold text-brand-ink">{title}</h3>
          <button onClick={onClose} className="text-neutral-400 hover:text-neutral-700 text-xl">×</button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

function Field({ label, value, onChange, type = "text", placeholder, hint }) {
  return (
    <div>
      <label className="block text-[11px] font-semibold text-neutral-600 uppercase tracking-wide mb-1">{label}</label>
      <input
        type={type}
        value={value || ""}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full border border-neutral-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-brand-blue focus:border-brand-blue"
      />
      {hint && <p className="text-[10px] text-neutral-500 mt-0.5">{hint}</p>}
    </div>
  );
}
