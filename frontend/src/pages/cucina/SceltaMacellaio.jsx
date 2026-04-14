// ============================================================
// Scelta del Macellaio — v2.0 (categorie configurabili)
// Cucina gestisce tagli disponibili, sala li segna venduti
// ============================================================

import { useState, useEffect, useCallback } from "react";
import { API_BASE, apiFetch } from "../../config/api";
import { VersionBadge } from "../../config/versions";

// ── Form vuoto ──
const EMPTY_FORM = {
  nome: "", categoria: "", grammatura_g: "", prezzo_euro: "", note: "",
};

export default function SceltaMacellaio() {
  const [tagli, setTagli] = useState([]);
  const [filtro, setFiltro] = useState("disponibili"); // disponibili | venduti | tutti
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(EMPTY_FORM);
  const [editId, setEditId] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState(null);
  const [categorie, setCategorie] = useState([]); // [{id, nome, emoji, ordine, attivo}]

  // ── Toast helper ──
  const flash = useCallback((msg, type = "ok") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 2500);
  }, []);

  // ── Fetch tagli ──
  const fetchTagli = useCallback(async () => {
    try {
      const res = await apiFetch(`${API_BASE}/macellaio/?stato=${filtro}`);
      if (!res.ok) throw new Error("Errore caricamento");
      setTagli(await res.json());
    } catch (e) {
      flash(e.message, "err");
    } finally {
      setLoading(false);
    }
  }, [filtro, flash]);

  // ── Fetch categorie ──
  const fetchCategorie = useCallback(async () => {
    try {
      const res = await apiFetch(`${API_BASE}/macellaio/categorie/`);
      if (res.ok) setCategorie(await res.json());
    } catch { /* silent */ }
  }, []);

  useEffect(() => { fetchTagli(); }, [fetchTagli]);
  useEffect(() => { fetchCategorie(); }, [fetchCategorie]);

  // Se al primo caricamento la categoria del form è vuota e ci sono categorie, preseleziona la prima
  useEffect(() => {
    if (!form.categoria && categorie.length > 0 && !editId) {
      setForm(f => ({ ...f, categoria: categorie[0].nome }));
    }
  }, [categorie, editId]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Save (create / update) ──
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
      const url = editId
        ? `${API_BASE}/macellaio/${editId}`
        : `${API_BASE}/macellaio/`;
      const method = editId ? "PUT" : "POST";
      const res = await apiFetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || "Errore salvataggio");
      }
      flash(editId ? "Taglio aggiornato" : "Taglio aggiunto");
      setForm({ ...EMPTY_FORM, categoria: categorie[0]?.nome || "" });
      setEditId(null);
      setShowForm(false);
      fetchTagli();
    } catch (e) {
      flash(e.message, "err");
    } finally {
      setSaving(false);
    }
  };

  // ── Toggle venduto ──
  const toggleVenduto = async (taglio) => {
    try {
      const res = await apiFetch(`${API_BASE}/macellaio/${taglio.id}/venduto`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ venduto: !taglio.venduto }),
      });
      if (!res.ok) throw new Error("Errore");
      flash(taglio.venduto ? "Ripristinato" : "Venduto!");
      fetchTagli();
    } catch (e) {
      flash(e.message, "err");
    }
  };

  // ── Delete ──
  const handleDelete = async (id) => {
    if (!confirm("Eliminare questo taglio?")) return;
    try {
      const res = await apiFetch(`${API_BASE}/macellaio/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Errore eliminazione");
      flash("Taglio eliminato");
      fetchTagli();
    } catch (e) {
      flash(e.message, "err");
    }
  };

  // ── Edit: popola il form ──
  const startEdit = (t) => {
    setForm({
      nome: t.nome,
      categoria: t.categoria || "",
      grammatura_g: t.grammatura_g ?? "",
      prezzo_euro: t.prezzo_euro ?? "",
      note: t.note ?? "",
    });
    setEditId(t.id);
    setShowForm(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  // ── Conteggi ──
  const disponibili = tagli.filter(t => !t.venduto).length;
  const venduti = tagli.filter(t => t.venduto).length;

  // ── Formatta prezzo ──
  const fmtPrezzo = (v) => v != null ? `€ ${v.toFixed(2)}` : "—";
  const fmtGrammi = (v) => v != null ? `${v}g` : "—";

  // ── Mappa categoria → emoji ──
  const emojiFor = (nome) => {
    if (!nome) return "";
    const c = categorie.find(x => x.nome === nome);
    return c?.emoji || "";
  };

  return (
    <div className="min-h-screen bg-brand-cream">
      <div className="max-w-3xl mx-auto px-4 py-6">
        {/* ── Header ── */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-brand-ink flex items-center gap-2">
              🥩 Scelta del Macellaio
            </h1>
            <p className="text-sm text-neutral-500 mt-1">
              Tagli disponibili alla vendita
            </p>
          </div>
          <VersionBadge modulo="macellaio" />
        </div>

        {/* ── Riepilogo compatto ── */}
        <div className="flex gap-3 mb-4">
          <div className="flex-1 bg-white rounded-xl border border-green-200 px-4 py-3 text-center">
            <div className="text-2xl font-bold text-green-700">{disponibili}</div>
            <div className="text-xs text-green-600 font-medium">Disponibili</div>
          </div>
          <div className="flex-1 bg-white rounded-xl border border-neutral-200 px-4 py-3 text-center">
            <div className="text-2xl font-bold text-neutral-500">{venduti}</div>
            <div className="text-xs text-neutral-400 font-medium">Venduti</div>
          </div>
        </div>

        {/* ── Azioni ── */}
        <div className="flex items-center justify-between mb-4 gap-2">
          {/* Filtro */}
          <div className="flex bg-white rounded-lg border border-neutral-200 overflow-hidden text-sm">
            {[
              { key: "disponibili", label: "Disponibili" },
              { key: "venduti", label: "Venduti" },
              { key: "tutti", label: "Tutti" },
            ].map(f => (
              <button
                key={f.key}
                onClick={() => { setFiltro(f.key); setLoading(true); }}
                className={`px-3 py-2 font-medium transition-colors ${
                  filtro === f.key
                    ? "bg-brand-blue text-white"
                    : "text-neutral-600 hover:bg-neutral-50"
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>

          {/* Bottone nuovo */}
          <button
            onClick={() => {
              setForm({ ...EMPTY_FORM, categoria: categorie[0]?.nome || "" });
              setEditId(null);
              setShowForm(!showForm);
            }}
            className="flex items-center gap-1.5 bg-brand-blue text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors min-h-[44px]"
          >
            {showForm ? "✕ Chiudi" : "+ Nuovo taglio"}
          </button>
        </div>

        {/* ── Form nuovo / modifica ── */}
        {showForm && (
          <form onSubmit={handleSave} className="bg-white rounded-2xl border border-neutral-200 p-5 mb-5 shadow-sm">
            <h3 className="font-semibold text-brand-ink mb-3">
              {editId ? "Modifica taglio" : "Nuovo taglio"}
            </h3>
            <div className="grid grid-cols-2 gap-3">
              {/* Nome */}
              <div className="col-span-2">
                <label className="block text-xs font-medium text-neutral-500 mb-1">Nome taglio *</label>
                <input
                  type="text"
                  value={form.nome}
                  onChange={e => setForm({ ...form, nome: e.target.value })}
                  placeholder="Es. Fiorentina frollata 45gg"
                  className="w-full border border-neutral-300 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-brand-blue focus:border-brand-blue outline-none"
                  autoFocus
                />
              </div>

              {/* Categoria */}
              <div>
                <label className="block text-xs font-medium text-neutral-500 mb-1">Categoria</label>
                <select
                  value={form.categoria}
                  onChange={e => setForm({ ...form, categoria: e.target.value })}
                  className="w-full border border-neutral-300 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-brand-blue focus:border-brand-blue outline-none bg-white"
                >
                  <option value="">— Nessuna —</option>
                  {categorie.map(c => (
                    <option key={c.id} value={c.nome}>
                      {c.emoji ? `${c.emoji} ` : ""}{c.nome}
                    </option>
                  ))}
                </select>
                {categorie.length === 0 && (
                  <p className="text-[11px] text-neutral-400 mt-1">
                    Aggiungi categorie da Gestione Cucina → Strumenti
                  </p>
                )}
              </div>

              {/* Grammatura */}
              <div>
                <label className="block text-xs font-medium text-neutral-500 mb-1">Grammatura (g)</label>
                <input
                  type="number"
                  min="1"
                  value={form.grammatura_g}
                  onChange={e => setForm({ ...form, grammatura_g: e.target.value })}
                  placeholder="Es. 800"
                  className="w-full border border-neutral-300 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-brand-blue focus:border-brand-blue outline-none"
                />
              </div>

              {/* Prezzo */}
              <div>
                <label className="block text-xs font-medium text-neutral-500 mb-1">Prezzo (€)</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.prezzo_euro}
                  onChange={e => setForm({ ...form, prezzo_euro: e.target.value })}
                  placeholder="Es. 45.00"
                  className="w-full border border-neutral-300 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-brand-blue focus:border-brand-blue outline-none"
                />
              </div>

              {/* Note */}
              <div>
                <label className="block text-xs font-medium text-neutral-500 mb-1">Note</label>
                <input
                  type="text"
                  value={form.note}
                  onChange={e => setForm({ ...form, note: e.target.value })}
                  placeholder="Frollatura, provenienza..."
                  className="w-full border border-neutral-300 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-brand-blue focus:border-brand-blue outline-none"
                />
              </div>
            </div>

            {/* Bottoni */}
            <div className="flex gap-2 mt-4">
              <button
                type="submit"
                disabled={saving}
                className="flex-1 bg-brand-green text-white py-2.5 rounded-lg text-sm font-medium hover:bg-green-600 transition-colors disabled:opacity-50 min-h-[44px]"
              >
                {saving ? "Salvataggio..." : editId ? "Salva modifiche" : "Aggiungi taglio"}
              </button>
              {editId && (
                <button
                  type="button"
                  onClick={() => { setForm(EMPTY_FORM); setEditId(null); setShowForm(false); }}
                  className="px-4 py-2.5 rounded-lg text-sm font-medium border border-neutral-300 text-neutral-600 hover:bg-neutral-50 transition-colors min-h-[44px]"
                >
                  Annulla
                </button>
              )}
            </div>
          </form>
        )}

        {/* ── Lista tagli ── */}
        {loading ? (
          <div className="text-center py-12 text-neutral-400">Caricamento...</div>
        ) : tagli.length === 0 ? (
          <div className="text-center py-12">
            <div className="text-4xl mb-2">🥩</div>
            <div className="text-neutral-500">
              {filtro === "disponibili" ? "Nessun taglio disponibile" :
               filtro === "venduti" ? "Nessun taglio venduto" :
               "Nessun taglio inserito"}
            </div>
            {filtro === "disponibili" && (
              <button
                onClick={() => {
                  setForm({ ...EMPTY_FORM, categoria: categorie[0]?.nome || "" });
                  setEditId(null);
                  setShowForm(true);
                }}
                className="mt-3 text-brand-blue text-sm font-medium hover:underline"
              >
                Aggiungi il primo taglio
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {tagli.map(t => (
              <div
                key={t.id}
                className={`bg-white rounded-2xl border p-4 shadow-sm transition-all ${
                  t.venduto
                    ? "border-neutral-200 opacity-60"
                    : "border-green-200"
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`font-semibold text-brand-ink ${t.venduto ? "line-through" : ""}`}>
                        {t.nome}
                      </span>
                      {t.categoria && (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-neutral-100 text-neutral-600 font-medium">
                          {emojiFor(t.categoria) && <>{emojiFor(t.categoria)} </>}{t.categoria}
                        </span>
                      )}
                      {t.venduto && (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-600 font-semibold">
                          VENDUTO
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 mt-1.5 text-sm text-neutral-500">
                      <span>{fmtGrammi(t.grammatura_g)}</span>
                      <span className="font-semibold text-brand-ink">{fmtPrezzo(t.prezzo_euro)}</span>
                      {t.note && <span className="italic truncate">· {t.note}</span>}
                    </div>
                  </div>

                  {/* Azioni */}
                  <div className="flex items-center gap-1.5 shrink-0">
                    {/* Toggle venduto — bottone grande touch-friendly */}
                    <button
                      onClick={() => toggleVenduto(t)}
                      className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors min-h-[44px] ${
                        t.venduto
                          ? "bg-neutral-100 text-neutral-600 hover:bg-neutral-200"
                          : "bg-brand-red text-white hover:bg-red-600"
                      }`}
                      title={t.venduto ? "Ripristina disponibile" : "Segna venduto"}
                    >
                      {t.venduto ? "↩ Ripristina" : "Venduto"}
                    </button>
                    {/* Edit */}
                    <button
                      onClick={() => startEdit(t)}
                      className="p-2 rounded-lg text-neutral-400 hover:text-brand-blue hover:bg-blue-50 transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center"
                      title="Modifica"
                    >
                      ✏️
                    </button>
                    {/* Delete */}
                    <button
                      onClick={() => handleDelete(t.id)}
                      className="p-2 rounded-lg text-neutral-400 hover:text-brand-red hover:bg-red-50 transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center"
                      title="Elimina"
                    >
                      🗑️
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Toast ── */}
      {toast && (
        <div className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-50 px-5 py-3 rounded-xl shadow-lg text-sm font-medium text-white transition-all ${
          toast.type === "err" ? "bg-brand-red" : "bg-brand-green"
        }`}>
          {toast.msg}
        </div>
      )}
    </div>
  );
}
