// ============================================================
// ZonaPanel.jsx — pannello CRUD generico per una zona di Selezioni
// Guidato da ZONA_CONFIG (endpoint + campi extra + modello stato)
// ============================================================

import { useState, useEffect, useCallback, useMemo } from "react";
import { API_BASE, apiFetch } from "../../config/api";
import { Btn } from "../../components/ui";
import { ZONA_CONFIG } from "./zonaConfig";

function buildEmptyForm(cfg) {
  const base = { nome: "", categoria: "", grammatura_g: "", prezzo_euro: "", note: "" };
  for (const c of cfg.campiExtra || []) base[c.name] = "";
  return base;
}

export default function ZonaPanel({ zona }) {
  const cfg = ZONA_CONFIG[zona];
  if (!cfg) return <div className="p-6 text-sm text-neutral-500">Zona sconosciuta: {zona}</div>;

  // Per salumi/formaggi: niente grammatura/prezzo in UI
  const showPesoPrezzo = cfg.stato === "venduto";
  // Stato "attivo" → filtro "attivi/archiviati/tutti"
  // Stato "venduto" → filtro "disponibili/venduti/tutti"
  const filtroOptions = cfg.stato === "attivo"
    ? [{ key: "attivi", label: "In carta" }, { key: "archiviati", label: "Archivio" }, { key: "tutti", label: "Tutti" }]
    : [{ key: "disponibili", label: "Disponibili" }, { key: "venduti", label: "Venduti" }, { key: "tutti", label: "Tutti" }];
  const filtroDefault = filtroOptions[0].key;

  const EMPTY_FORM = useMemo(() => buildEmptyForm(cfg), [cfg.key]);

  const [tagli, setTagli] = useState([]);
  const [categorie, setCategorie] = useState([]);
  const [filtro, setFiltro] = useState(filtroDefault);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(EMPTY_FORM);
  const [editId, setEditId] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState(null);

  // ── Toast helper ──
  const flash = useCallback((msg, type = "ok") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 2500);
  }, []);

  // ── Reset form quando cambia zona ──
  useEffect(() => {
    setForm(EMPTY_FORM);
    setEditId(null);
    setShowForm(false);
    setFiltro(filtroDefault);
  }, [cfg.key]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Fetch tagli ──
  const fetchTagli = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch(`${API_BASE}${cfg.endpoint}/?stato=${filtro}`);
      if (!res.ok) throw new Error("Errore caricamento");
      setTagli(await res.json());
    } catch (e) {
      flash(e.message, "err");
    } finally {
      setLoading(false);
    }
  }, [cfg.endpoint, filtro, flash]);

  // ── Fetch categorie ──
  const fetchCategorie = useCallback(async () => {
    try {
      const res = await apiFetch(`${API_BASE}${cfg.endpoint}/categorie/`);
      if (res.ok) setCategorie(await res.json());
    } catch { /* silent */ }
  }, [cfg.endpoint]);

  useEffect(() => { fetchTagli(); }, [fetchTagli]);
  useEffect(() => { fetchCategorie(); }, [fetchCategorie]);

  // Preseleziona prima categoria in creazione
  useEffect(() => {
    if (!form.categoria && categorie.length > 0 && !editId) {
      setForm(f => ({ ...f, categoria: categorie[0].nome }));
    }
  }, [categorie, editId]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Save ──
  const handleSave = async (e) => {
    e.preventDefault();
    if (!form.nome.trim()) return flash("Nome obbligatorio", "err");
    setSaving(true);
    try {
      const payload = {
        nome: form.nome.trim(),
        categoria: form.categoria || null,
        grammatura_g: form.grammatura_g ? parseInt(form.grammatura_g) : null,
        prezzo_euro: form.prezzo_euro ? parseFloat(form.prezzo_euro) : null,
        note: form.note || null,
      };
      for (const c of cfg.campiExtra || []) {
        const v = form[c.name];
        payload[c.name] = v && v.toString().trim() !== "" ? v : null;
      }
      const url = editId ? `${API_BASE}${cfg.endpoint}/${editId}` : `${API_BASE}${cfg.endpoint}/`;
      const method = editId ? "PUT" : "POST";
      const res = await apiFetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      flash(editId ? "Aggiornato" : "Creato");
      setForm(EMPTY_FORM);
      setEditId(null);
      setShowForm(false);
      fetchTagli();
    } catch (e) {
      flash(e.message, "err");
    } finally {
      setSaving(false);
    }
  };

  // ── Edit ──
  const handleEdit = (t) => {
    const next = { ...EMPTY_FORM };
    for (const k of Object.keys(EMPTY_FORM)) {
      if (t[k] !== undefined && t[k] !== null) next[k] = String(t[k]);
      else next[k] = "";
    }
    setForm(next);
    setEditId(t.id);
    setShowForm(true);
  };

  // ── Delete ──
  const handleDelete = async (id) => {
    if (!window.confirm("Eliminare?")) return;
    try {
      const res = await apiFetch(`${API_BASE}${cfg.endpoint}/${id}`, { method: "DELETE" });
      if (!res.ok && res.status !== 204) throw new Error(`HTTP ${res.status}`);
      flash("Eliminato");
      fetchTagli();
    } catch (e) {
      flash(e.message, "err");
    }
  };

  // ── Toggle stato (attivo o venduto) ──
  const handleToggleStato = async (t) => {
    try {
      if (cfg.stato === "attivo") {
        const next = !t.attivo;
        const res = await apiFetch(`${API_BASE}${cfg.endpoint}/${t.id}/attivo`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ attivo: next }),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        flash(next ? "Rimesso in carta" : "Archiviato");
      } else {
        const next = !t.venduto;
        const res = await apiFetch(`${API_BASE}${cfg.endpoint}/${t.id}/venduto`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ venduto: next }),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        flash(next ? "Segnato venduto" : "Ripristinato");
      }
      fetchTagli();
    } catch (e) {
      flash(e.message, "err");
    }
  };

  // ── Derivati ──
  const isArchiviato = (t) => (cfg.stato === "attivo" ? !t.attivo : !!t.venduto);

  // ── Render ──
  return (
    <div className="space-y-4">
      {/* HEADER PANNELLO */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-xl font-bold text-neutral-800 flex items-center gap-2">
            <span className="text-2xl">{cfg.icon}</span>
            {cfg.label}
          </h2>
          <p className="text-sm text-neutral-500 mt-0.5">{cfg.desc}</p>
        </div>
        <Btn
          variant="primary"
          size="md"
          onClick={() => {
            if (showForm && !editId) {
              setShowForm(false);
            } else {
              setForm(EMPTY_FORM);
              setEditId(null);
              setShowForm(true);
            }
          }}
        >
          {showForm && !editId ? "Chiudi" : "+ Nuovo"}
        </Btn>
      </div>

      {/* FILTRI */}
      <div className="flex gap-1 bg-neutral-100 rounded-xl p-1 w-fit">
        {filtroOptions.map(opt => (
          <button
            key={opt.key}
            onClick={() => setFiltro(opt.key)}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium transition ${
              filtro === opt.key ? "bg-white shadow text-neutral-900" : "text-neutral-500 hover:text-neutral-700"
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {/* FORM */}
      {showForm && (
        <form onSubmit={handleSave} className={`border rounded-xl p-4 space-y-3 ${cfg.accent.tint} ${cfg.accent.ring}`}>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <label className="block">
              <span className="text-xs font-semibold text-neutral-600 uppercase tracking-wider">Nome *</span>
              <input
                type="text"
                value={form.nome}
                onChange={e => setForm(f => ({ ...f, nome: e.target.value }))}
                required
                className="mt-1 w-full border border-neutral-300 rounded-lg px-3 py-2 text-sm focus:ring-brand-blue focus:border-brand-blue"
              />
            </label>

            <label className="block">
              <span className="text-xs font-semibold text-neutral-600 uppercase tracking-wider">Categoria</span>
              <select
                value={form.categoria || ""}
                onChange={e => setForm(f => ({ ...f, categoria: e.target.value }))}
                className="mt-1 w-full border border-neutral-300 rounded-lg px-3 py-2 text-sm bg-white focus:ring-brand-blue focus:border-brand-blue"
              >
                <option value="">—</option>
                {categorie.map(c => (
                  <option key={c.id} value={c.nome}>{c.emoji ? `${c.emoji} ` : ""}{c.nome}</option>
                ))}
              </select>
            </label>

            {showPesoPrezzo && (
              <>
                <label className="block">
                  <span className="text-xs font-semibold text-neutral-600 uppercase tracking-wider">Grammatura (g)</span>
                  <input
                    type="number" min="1"
                    value={form.grammatura_g}
                    onChange={e => setForm(f => ({ ...f, grammatura_g: e.target.value }))}
                    className="mt-1 w-full border border-neutral-300 rounded-lg px-3 py-2 text-sm focus:ring-brand-blue focus:border-brand-blue"
                  />
                </label>
                <label className="block">
                  <span className="text-xs font-semibold text-neutral-600 uppercase tracking-wider">Prezzo (€)</span>
                  <input
                    type="number" min="0" step="0.01"
                    value={form.prezzo_euro}
                    onChange={e => setForm(f => ({ ...f, prezzo_euro: e.target.value }))}
                    className="mt-1 w-full border border-neutral-300 rounded-lg px-3 py-2 text-sm focus:ring-brand-blue focus:border-brand-blue"
                  />
                </label>
              </>
            )}

            {(cfg.campiExtra || []).map(c => (
              <label key={c.name} className={`block ${c.textarea ? "md:col-span-2" : ""}`}>
                <span className="text-xs font-semibold text-neutral-600 uppercase tracking-wider">{c.label}</span>
                {c.textarea ? (
                  <textarea
                    rows={3}
                    value={form[c.name] || ""}
                    placeholder={c.placeholder}
                    onChange={e => setForm(f => ({ ...f, [c.name]: e.target.value }))}
                    className="mt-1 w-full border border-neutral-300 rounded-lg px-3 py-2 text-sm focus:ring-brand-blue focus:border-brand-blue"
                  />
                ) : (
                  <input
                    type="text"
                    value={form[c.name] || ""}
                    placeholder={c.placeholder}
                    onChange={e => setForm(f => ({ ...f, [c.name]: e.target.value }))}
                    className="mt-1 w-full border border-neutral-300 rounded-lg px-3 py-2 text-sm focus:ring-brand-blue focus:border-brand-blue"
                  />
                )}
              </label>
            ))}

            <label className="block md:col-span-2">
              <span className="text-xs font-semibold text-neutral-600 uppercase tracking-wider">Note</span>
              <input
                type="text"
                value={form.note}
                onChange={e => setForm(f => ({ ...f, note: e.target.value }))}
                className="mt-1 w-full border border-neutral-300 rounded-lg px-3 py-2 text-sm focus:ring-brand-blue focus:border-brand-blue"
              />
            </label>
          </div>

          <div className="flex items-center justify-end gap-2 pt-1">
            <Btn variant="secondary" size="md" type="button" onClick={() => { setForm(EMPTY_FORM); setEditId(null); setShowForm(false); }}>
              Annulla
            </Btn>
            <Btn variant="primary" size="md" type="submit" loading={saving}>
              {editId ? "Aggiorna" : "Salva"}
            </Btn>
          </div>
        </form>
      )}

      {/* LISTA */}
      {loading ? (
        <div className="text-sm text-neutral-500">Caricamento…</div>
      ) : tagli.length === 0 ? (
        <div className="text-sm text-neutral-400 italic border border-dashed border-neutral-200 rounded-xl p-6 text-center">
          Nessun elemento per questo filtro.
        </div>
      ) : (
        <div className="overflow-x-auto border border-neutral-200 rounded-xl bg-white">
          <table className="w-full text-sm">
            <thead className="bg-neutral-50 text-neutral-500 text-xs uppercase tracking-wider">
              <tr>
                <th className="px-3 py-2 text-left">Nome</th>
                <th className="px-3 py-2 text-left">Categoria</th>
                {showPesoPrezzo && <th className="px-3 py-2 text-right">Peso</th>}
                {showPesoPrezzo && <th className="px-3 py-2 text-right">€</th>}
                {(cfg.campiExtra || [])
                  .filter(c => !c.textarea)
                  .slice(0, 2)
                  .map(c => <th key={c.name} className="px-3 py-2 text-left">{c.label}</th>)}
                <th className="px-3 py-2 text-center">Stato</th>
                <th className="px-3 py-2 text-right">Azioni</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {tagli.map(t => {
                const archiv = isArchiviato(t);
                return (
                  <tr key={t.id} className={archiv ? "bg-neutral-50 opacity-70" : ""}>
                    <td className="px-3 py-2 font-medium text-neutral-800">
                      {t.nome}
                      {t.descrizione && (
                        <div className="text-[11px] text-neutral-500 mt-0.5 line-clamp-2">{t.descrizione}</div>
                      )}
                    </td>
                    <td className="px-3 py-2 text-neutral-600">{t.categoria || "—"}</td>
                    {showPesoPrezzo && <td className="px-3 py-2 text-right font-mono text-xs">{t.grammatura_g ? `${t.grammatura_g} g` : "—"}</td>}
                    {showPesoPrezzo && <td className="px-3 py-2 text-right font-mono text-xs">{t.prezzo_euro != null ? `€ ${Number(t.prezzo_euro).toFixed(2)}` : "—"}</td>}
                    {(cfg.campiExtra || [])
                      .filter(c => !c.textarea)
                      .slice(0, 2)
                      .map(c => <td key={c.name} className="px-3 py-2 text-neutral-600">{t[c.name] || "—"}</td>)}
                    <td className="px-3 py-2 text-center">
                      {cfg.stato === "attivo" ? (
                        <span className={`text-[11px] font-semibold rounded-full px-2 py-0.5 border ${
                          archiv ? "bg-neutral-100 text-neutral-500 border-neutral-200" : cfg.accent.badge
                        }`}>
                          {archiv ? "ARCHIVIO" : "IN CARTA"}
                        </span>
                      ) : (
                        <span className={`text-[11px] font-semibold rounded-full px-2 py-0.5 border ${
                          archiv ? "bg-neutral-100 text-neutral-500 border-neutral-200" : cfg.accent.badge
                        }`}>
                          {archiv ? "VENDUTO" : "DISPONIBILE"}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex items-center justify-end gap-1">
                        <Btn variant="secondary" size="sm" onClick={() => handleToggleStato(t)}>
                          {cfg.stato === "attivo"
                            ? (archiv ? "↻ Riattiva" : "📦 Archivia")
                            : (archiv ? "↻ Ripristina" : "✓ Venduto")
                          }
                        </Btn>
                        <Btn variant="secondary" size="sm" onClick={() => handleEdit(t)}>Modifica</Btn>
                        <Btn variant="secondary" size="sm" tone="danger" onClick={() => handleDelete(t.id)}>Elimina</Btn>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* TOAST */}
      {toast && (
        <div className={`fixed bottom-4 right-4 px-4 py-2 rounded-xl shadow-lg text-sm text-white ${
          toast.type === "err" ? "bg-brand-red" : "bg-brand-green"
        }`}>
          {toast.msg}
        </div>
      )}
    </div>
  );
}
