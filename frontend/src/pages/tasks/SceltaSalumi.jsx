// ============================================================
// Scelta dei Salumi — v1.0
// Cucina gestisce salumi disponibili, sala li segna venduti
// Campi extra: produttore, stagionatura, origine_animale, territorio, descrizione
// ============================================================

import { useState, useEffect, useCallback } from "react";
import { API_BASE, apiFetch } from "../../config/api";
import { VersionBadge } from "../../config/versions";
import { Btn } from "../../components/ui";

// ── Form vuoto ──
const EMPTY_FORM = {
  nome: "", categoria: "", grammatura_g: "", prezzo_euro: "",
  produttore: "", stagionatura: "", origine_animale: "",
  territorio: "", descrizione: "", note: "",
};

// Suggerimenti origine animale (datalist)
const ORIGINI_SUGGEST = ["Maiale", "Cinghiale", "Oca", "Anatra", "Manzo", "Misto"];

export default function SceltaSalumi() {
  const [tagli, setTagli] = useState([]);
  const [filtro, setFiltro] = useState("disponibili");
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(EMPTY_FORM);
  const [editId, setEditId] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState(null);
  const [categorie, setCategorie] = useState([]);
  const [expandedId, setExpandedId] = useState(null); // tap card → mostra descrizione

  const flash = useCallback((msg, type = "ok") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 2500);
  }, []);

  const fetchTagli = useCallback(async () => {
    try {
      const res = await apiFetch(`${API_BASE}/salumi/?stato=${filtro}`);
      if (!res.ok) throw new Error("Errore caricamento");
      setTagli(await res.json());
    } catch (e) {
      flash(e.message, "err");
    } finally {
      setLoading(false);
    }
  }, [filtro, flash]);

  const fetchCategorie = useCallback(async () => {
    try {
      const res = await apiFetch(`${API_BASE}/salumi/categorie/`);
      if (res.ok) setCategorie(await res.json());
    } catch { /* silent */ }
  }, []);

  useEffect(() => { fetchTagli(); }, [fetchTagli]);
  useEffect(() => { fetchCategorie(); }, [fetchCategorie]);

  useEffect(() => {
    if (!form.categoria && categorie.length > 0 && !editId) {
      setForm(f => ({ ...f, categoria: categorie[0].nome }));
    }
  }, [categorie, editId]); // eslint-disable-line react-hooks/exhaustive-deps

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
        produttore: form.produttore || null,
        stagionatura: form.stagionatura || null,
        origine_animale: form.origine_animale || null,
        territorio: form.territorio || null,
        descrizione: form.descrizione || null,
        note: form.note || null,
      };
      const url = editId
        ? `${API_BASE}/salumi/${editId}`
        : `${API_BASE}/salumi/`;
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
      flash(editId ? "Salume aggiornato" : "Salume aggiunto");
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

  const toggleVenduto = async (taglio) => {
    try {
      const res = await apiFetch(`${API_BASE}/salumi/${taglio.id}/venduto`, {
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

  const handleDelete = async (id) => {
    if (!confirm("Eliminare questo salume?")) return;
    try {
      const res = await apiFetch(`${API_BASE}/salumi/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Errore eliminazione");
      flash("Salume eliminato");
      fetchTagli();
    } catch (e) {
      flash(e.message, "err");
    }
  };

  const startEdit = (t) => {
    setForm({
      nome: t.nome,
      categoria: t.categoria || "",
      grammatura_g: t.grammatura_g ?? "",
      prezzo_euro: t.prezzo_euro ?? "",
      produttore: t.produttore ?? "",
      stagionatura: t.stagionatura ?? "",
      origine_animale: t.origine_animale ?? "",
      territorio: t.territorio ?? "",
      descrizione: t.descrizione ?? "",
      note: t.note ?? "",
    });
    setEditId(t.id);
    setShowForm(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const disponibili = tagli.filter(t => !t.venduto).length;
  const venduti = tagli.filter(t => t.venduto).length;

  const fmtPrezzo = (v) => v != null ? `€ ${v.toFixed(2)}` : "—";
  const fmtGrammi = (v) => v != null ? `${v}g` : "—";

  const emojiFor = (nome) => {
    if (!nome) return "";
    const c = categorie.find(x => x.nome === nome);
    return c?.emoji || "";
  };

  return (
    <div className="min-h-screen bg-brand-cream">
      <div className="max-w-3xl mx-auto px-4 py-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-brand-ink flex items-center gap-2">
              🥓 Scelta dei Salumi
            </h1>
            <p className="text-sm text-neutral-500 mt-1">
              Salumi disponibili al tagliere
            </p>
          </div>
          <VersionBadge modulo="salumi" />
        </div>

        {/* Riepilogo */}
        <div className="flex gap-3 mb-4">
          <div className="flex-1 bg-white rounded-xl border border-amber-200 px-4 py-3 text-center">
            <div className="text-2xl font-bold text-amber-700">{disponibili}</div>
            <div className="text-xs text-amber-600 font-medium">Disponibili</div>
          </div>
          <div className="flex-1 bg-white rounded-xl border border-neutral-200 px-4 py-3 text-center">
            <div className="text-2xl font-bold text-neutral-500">{venduti}</div>
            <div className="text-xs text-neutral-400 font-medium">Venduti</div>
          </div>
        </div>

        {/* Azioni */}
        <div className="flex items-center justify-between mb-4 gap-2">
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

          <Btn
            variant="chip"
            tone="blue"
            size="md"
            onClick={() => {
              setForm({ ...EMPTY_FORM, categoria: categorie[0]?.nome || "" });
              setEditId(null);
              setShowForm(!showForm);
            }}
          >
            {showForm ? "✕ Chiudi" : "+ Nuovo salume"}
          </Btn>
        </div>

        {/* Form nuovo / modifica */}
        {showForm && (
          <form onSubmit={handleSave} className="bg-white rounded-2xl border border-neutral-200 p-5 mb-5 shadow-sm">
            <h3 className="font-semibold text-brand-ink mb-3">
              {editId ? "Modifica salume" : "Nuovo salume"}
            </h3>

            <datalist id="origini-salumi">
              {ORIGINI_SUGGEST.map(o => <option key={o} value={o} />)}
            </datalist>

            <div className="grid grid-cols-2 gap-3">
              {/* Nome */}
              <div className="col-span-2">
                <label className="block text-xs font-medium text-neutral-500 mb-1">Nome *</label>
                <input
                  type="text"
                  value={form.nome}
                  onChange={e => setForm({ ...form, nome: e.target.value })}
                  placeholder="Es. Culatello di Zibello 24 mesi"
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
              </div>

              {/* Origine animale */}
              <div>
                <label className="block text-xs font-medium text-neutral-500 mb-1">Origine</label>
                <input
                  type="text"
                  list="origini-salumi"
                  value={form.origine_animale}
                  onChange={e => setForm({ ...form, origine_animale: e.target.value })}
                  placeholder="Es. Maiale"
                  className="w-full border border-neutral-300 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-brand-blue focus:border-brand-blue outline-none"
                />
              </div>

              {/* Produttore */}
              <div className="col-span-2">
                <label className="block text-xs font-medium text-neutral-500 mb-1">Produttore</label>
                <input
                  type="text"
                  value={form.produttore}
                  onChange={e => setForm({ ...form, produttore: e.target.value })}
                  placeholder="Es. Salumificio Brugnoli"
                  className="w-full border border-neutral-300 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-brand-blue focus:border-brand-blue outline-none"
                />
              </div>

              {/* Stagionatura */}
              <div>
                <label className="block text-xs font-medium text-neutral-500 mb-1">Stagionatura</label>
                <input
                  type="text"
                  value={form.stagionatura}
                  onChange={e => setForm({ ...form, stagionatura: e.target.value })}
                  placeholder="Es. 24 mesi / in grotta"
                  className="w-full border border-neutral-300 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-brand-blue focus:border-brand-blue outline-none"
                />
              </div>

              {/* Territorio */}
              <div>
                <label className="block text-xs font-medium text-neutral-500 mb-1">Territorio / DOP</label>
                <input
                  type="text"
                  value={form.territorio}
                  onChange={e => setForm({ ...form, territorio: e.target.value })}
                  placeholder="Es. Valtellina IGP"
                  className="w-full border border-neutral-300 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-brand-blue focus:border-brand-blue outline-none"
                />
              </div>

              {/* Grammatura */}
              <div>
                <label className="block text-xs font-medium text-neutral-500 mb-1">Grammatura (g)</label>
                <input
                  type="number"
                  min="1"
                  value={form.grammatura_g}
                  onChange={e => setForm({ ...form, grammatura_g: e.target.value })}
                  placeholder="Es. 250"
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
                  placeholder="Es. 18.00"
                  className="w-full border border-neutral-300 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-brand-blue focus:border-brand-blue outline-none"
                />
              </div>

              {/* Descrizione lunga */}
              <div className="col-span-2">
                <label className="block text-xs font-medium text-neutral-500 mb-1">
                  Descrizione per la sala
                  <span className="text-neutral-400 font-normal"> (verrà letta dai ragazzi)</span>
                </label>
                <textarea
                  rows={3}
                  value={form.descrizione}
                  onChange={e => setForm({ ...form, descrizione: e.target.value })}
                  placeholder="Es. Salume crudo dolce, stagionato 24 mesi nelle cantine di Zibello. Profumo intenso, dolcezza che ricorda il fieno..."
                  className="w-full border border-neutral-300 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-brand-blue focus:border-brand-blue outline-none resize-none"
                />
              </div>

              {/* Note interne */}
              <div className="col-span-2">
                <label className="block text-xs font-medium text-neutral-500 mb-1">Note interne</label>
                <input
                  type="text"
                  value={form.note}
                  onChange={e => setForm({ ...form, note: e.target.value })}
                  placeholder="Note operative (non per la sala)"
                  className="w-full border border-neutral-300 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-brand-blue focus:border-brand-blue outline-none"
                />
              </div>
            </div>

            {/* Bottoni */}
            <div className="flex gap-2 mt-4">
              <Btn variant="success" size="md" type="submit" disabled={saving} loading={saving} className="flex-1">
                {saving ? "Salvataggio..." : editId ? "Salva modifiche" : "Aggiungi salume"}
              </Btn>
              {editId && (
                <Btn variant="ghost" size="md" type="button" onClick={() => { setForm(EMPTY_FORM); setEditId(null); setShowForm(false); }}>
                  Annulla
                </Btn>
              )}
            </div>
          </form>
        )}

        {/* Lista */}
        {loading ? (
          <div className="text-center py-12 text-neutral-400">Caricamento...</div>
        ) : tagli.length === 0 ? (
          <div className="text-center py-12">
            <div className="text-4xl mb-2">🥓</div>
            <div className="text-neutral-500">
              {filtro === "disponibili" ? "Nessun salume disponibile" :
               filtro === "venduti" ? "Nessun salume venduto" :
               "Nessun salume inserito"}
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            {tagli.map(t => {
              const isExpanded = expandedId === t.id;
              const hasDettagli = t.descrizione || t.produttore || t.stagionatura || t.territorio || t.origine_animale || t.note;
              return (
                <div
                  key={t.id}
                  className={`bg-white rounded-2xl border p-4 shadow-sm transition-all ${
                    t.venduto ? "border-neutral-200 opacity-60" : "border-amber-200"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
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
                      <div className="flex items-center gap-3 mt-1.5 text-sm text-neutral-500 flex-wrap">
                        {t.produttore && <span className="font-medium text-neutral-700 truncate">{t.produttore}</span>}
                        {t.stagionatura && <span>· {t.stagionatura}</span>}
                        {t.origine_animale && <span>· {t.origine_animale}</span>}
                        {t.territorio && <span className="italic">· {t.territorio}</span>}
                      </div>
                      <div className="flex items-center gap-3 mt-1 text-sm text-neutral-500">
                        <span>{fmtGrammi(t.grammatura_g)}</span>
                        <span className="font-semibold text-brand-ink">{fmtPrezzo(t.prezzo_euro)}</span>
                      </div>

                      {/* Toggle dettagli */}
                      {hasDettagli && (
                        <button
                          onClick={() => setExpandedId(isExpanded ? null : t.id)}
                          className="mt-2 text-xs text-brand-blue hover:underline font-medium"
                        >
                          {isExpanded ? "▲ Nascondi dettagli" : "▼ Mostra dettagli"}
                        </button>
                      )}

                      {isExpanded && (
                        <div className="mt-3 p-3 rounded-lg bg-amber-50/50 border border-amber-100 space-y-2 text-sm">
                          {t.descrizione && (
                            <div>
                              <div className="text-[11px] font-bold uppercase tracking-wider text-amber-700 mb-1">Per la sala</div>
                              <div className="text-brand-ink whitespace-pre-wrap leading-relaxed">{t.descrizione}</div>
                            </div>
                          )}
                          {t.note && (
                            <div>
                              <div className="text-[11px] font-bold uppercase tracking-wider text-neutral-500 mb-1">Note interne</div>
                              <div className="text-neutral-600 italic">{t.note}</div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Azioni */}
                    <div className="flex items-center gap-1.5 shrink-0">
                      <Btn
                        variant={t.venduto ? "secondary" : "danger"}
                        size="md"
                        onClick={() => toggleVenduto(t)}
                        title={t.venduto ? "Ripristina disponibile" : "Segna venduto"}
                      >
                        {t.venduto ? "↩ Ripristina" : "Venduto"}
                      </Btn>
                      <button
                        onClick={() => startEdit(t)}
                        className="p-2 rounded-lg text-neutral-400 hover:text-brand-blue hover:bg-blue-50 transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center"
                        title="Modifica"
                      >
                        ✏️
                      </button>
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
              );
            })}
          </div>
        )}
      </div>

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
