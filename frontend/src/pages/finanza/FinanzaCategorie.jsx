// @version: v2.0-finanza-categorie-gerarchiche
// Gestione regole di auto-categorizzazione: pattern → Cat.1/Cat.2 (gerarchiche)
import React, { useEffect, useState, useCallback } from "react";
import { API_BASE, apiFetch } from "../../config/api";
import FinanzaNav from "./FinanzaNav";

const FC = `${API_BASE}/finanza`;

const EMPTY_REGOLA = {
  pattern: "", fornitore_nome: "", fornitore_piva: "",
  cat1: "", cat2: "", tipo_analitico: "",
  cat1_fin: "", cat2_fin: "", tipo_finanziario: "",
  descrizione_finanziaria: "", cat_debito: "",
};

/* ── Componente select gerarchico con "aggiungi nuovo" inline ──── */
function CatSelect({ label, value, onChange, options, placeholder, onAddNew }) {
  const [adding, setAdding] = useState(false);
  const [newVal, setNewVal] = useState("");

  const handleAdd = async () => {
    const nome = newVal.trim().toUpperCase();
    if (!nome) return;
    if (onAddNew) await onAddNew(nome);
    onChange(nome);
    setAdding(false);
    setNewVal("");
  };

  if (adding) {
    return (
      <div className="flex gap-1">
        <input value={newVal} onChange={e => setNewVal(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter") handleAdd(); if (e.key === "Escape") setAdding(false); }}
          className="border border-violet-400 rounded-lg px-2 py-1.5 text-sm flex-1 focus:ring-2 focus:ring-violet-300 outline-none"
          placeholder="Nuovo nome..." autoFocus />
        <button onClick={handleAdd} className="text-xs px-2 py-1 bg-violet-100 text-violet-800 rounded-lg">OK</button>
        <button onClick={() => setAdding(false)} className="text-xs px-2 py-1 bg-neutral-200 rounded-lg">✕</button>
      </div>
    );
  }

  return (
    <div className="flex gap-1">
      <select value={value} onChange={e => onChange(e.target.value)}
        className="border border-neutral-300 rounded-lg px-2 py-1.5 text-sm flex-1 focus:ring-2 focus:ring-violet-300 focus:border-violet-400 outline-none">
        <option value="">{placeholder || "— seleziona —"}</option>
        {options.map(o => <option key={o} value={o}>{o}</option>)}
      </select>
      {onAddNew && (
        <button onClick={() => setAdding(true)} title="Aggiungi nuova"
          className="text-xs px-2 py-1 bg-violet-50 text-violet-700 border border-violet-200 rounded-lg hover:bg-violet-100 transition">
          +
        </button>
      )}
    </div>
  );
}

export default function FinanzaCategorie() {
  const [regole, setRegole] = useState([]);
  const [nonCat, setNonCat] = useState([]);
  const [fornitori, setFornitori] = useState([]);
  const [valori, setValori] = useState({});
  const [albero, setAlbero] = useState({ A: [], F: [] });
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("noncat"); // "noncat" | "regole" | "nuova"
  const [editRegola, setEditRegola] = useState(null);
  const [form, setForm] = useState({ ...EMPTY_REGOLA });
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");
  const [autoCatResult, setAutoCatResult] = useState(null);

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [regR, ncR, fR, vR, aR] = await Promise.all([
        apiFetch(`${FC}/regole`),
        apiFetch(`${FC}/movimenti-non-categorizzati?limit=50`),
        apiFetch(`${FC}/fornitori-acquisti`),
        apiFetch(`${FC}/valori-unici`),
        apiFetch(`${FC}/albero-categorie`),
      ]);
      if (regR.ok) setRegole(await regR.json());
      if (ncR.ok) setNonCat(await ncR.json());
      if (fR.ok) setFornitori(await fR.json());
      if (vR.ok) setValori(await vR.json());
      if (aR.ok) setAlbero(await aR.json());
    } catch (_) {}
    setLoading(false);
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);

  const handleSave = async () => {
    if (!form.pattern.trim()) { setMsg("Pattern obbligatorio"); return; }
    setSaving(true);
    setMsg("");
    try {
      const url = editRegola ? `${FC}/regole/${editRegola.id}` : `${FC}/regole`;
      const method = editRegola ? "PUT" : "POST";
      const resp = await apiFetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!resp.ok) throw new Error("Errore salvataggio");
      setMsg(editRegola ? "Regola aggiornata" : "Regola creata");
      setEditRegola(null);
      setForm({ ...EMPTY_REGOLA });
      setTab("regole");
      loadAll();
    } catch (err) {
      setMsg(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Eliminare questa regola?")) return;
    await apiFetch(`${FC}/regole/${id}`, { method: "DELETE" });
    loadAll();
  };

  const handleAutoCat = async () => {
    setAutoCatResult(null);
    try {
      const resp = await apiFetch(`${FC}/auto-categorizza`, { method: "POST" });
      if (resp.ok) {
        const data = await resp.json();
        setAutoCatResult(data);
        loadAll();
      }
    } catch (_) {}
  };

  const startEdit = (r) => {
    setEditRegola(r);
    setForm({
      pattern: r.pattern || "", fornitore_nome: r.fornitore_nome || "",
      fornitore_piva: r.fornitore_piva || "",
      cat1: r.cat1 || "", cat2: r.cat2 || "", tipo_analitico: r.tipo_analitico || "",
      cat1_fin: r.cat1_fin || "", cat2_fin: r.cat2_fin || "",
      tipo_finanziario: r.tipo_finanziario || "",
      descrizione_finanziaria: r.descrizione_finanziaria || "",
      cat_debito: r.cat_debito || "",
    });
    setTab("nuova");
  };

  const startFromDesc = (desc) => {
    setEditRegola(null);
    setForm({ ...EMPTY_REGOLA, pattern: desc.toUpperCase() });
    setTab("nuova");
  };

  const startFromFornitore = (f) => {
    setEditRegola(null);
    setForm({
      ...EMPTY_REGOLA,
      pattern: f.fornitore_nome.toUpperCase().split(" ").slice(0, 2).join(" "),
      fornitore_nome: f.fornitore_nome,
      fornitore_piva: f.fornitore_piva || "",
    });
    setTab("nuova");
  };

  const fmt = (n) => n != null ? Number(n).toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "—";

  const inputCls = "border border-neutral-300 rounded-lg px-2 py-1.5 text-sm w-full focus:ring-2 focus:ring-violet-300 focus:border-violet-400 outline-none";
  const labelCls = "text-[10px] font-semibold text-neutral-500 uppercase tracking-wider mb-0.5";

  return (
    <div className="min-h-screen bg-neutral-100 p-6 font-sans">
      <FinanzaNav current="categorie" />
      <div className="max-w-7xl mx-auto bg-white shadow-2xl rounded-3xl p-6 sm:p-10 border border-neutral-200 mt-4">
        <div className="flex items-center justify-between mb-1">
          <h1 className="text-3xl font-bold text-violet-900 tracking-wide font-playfair">
            Categorie & Regole
          </h1>
          <button
            onClick={handleAutoCat}
            className="px-4 py-2 rounded-xl text-sm font-semibold bg-violet-600 text-white hover:bg-violet-700 shadow transition"
          >
            Auto-categorizza tutto
          </button>
        </div>
        <p className="text-neutral-600 text-sm mb-4">
          Crea regole per assegnare automaticamente Cat.1/Cat.2 ai movimenti in base alla descrizione.
        </p>

        {autoCatResult && (
          <div className="mb-4 rounded-xl border border-emerald-300 bg-emerald-50 text-emerald-800 px-4 py-3 text-sm">
            Auto-categorizzazione completata: <strong>{autoCatResult.aggiornati}</strong> movimenti aggiornati.
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-1 mb-5 border-b border-neutral-200">
          {[
            { id: "noncat", label: `Da categorizzare (${nonCat.length})` },
            { id: "regole", label: `Regole (${regole.length})` },
            { id: "fornitori", label: `Fornitori acquisti (${fornitori.length})` },
            { id: "nuova", label: editRegola ? "Modifica regola" : "Nuova regola" },
          ].map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition -mb-px ${
                tab === t.id
                  ? "border-violet-600 text-violet-800"
                  : "border-transparent text-neutral-500 hover:text-violet-600"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="text-center py-12 text-neutral-500">Caricamento...</div>
        ) : (
          <>
            {/* TAB: Non categorizzati */}
            {tab === "noncat" && (
              <div>
                <p className="text-xs text-neutral-400 mb-3">
                  Descrizioni senza Cat.1 assegnata, ordinate per frequenza. Clicca per creare una regola.
                </p>
                {nonCat.length === 0 ? (
                  <div className="text-center py-8 text-emerald-600 font-medium">
                    Tutti i movimenti hanno una categoria assegnata!
                  </div>
                ) : (
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-left text-neutral-500 text-xs">
                        <th className="pb-2">Descrizione</th>
                        <th className="pb-2 text-right w-16">N.</th>
                        <th className="pb-2 text-right w-28">Tot. Dare</th>
                        <th className="pb-2 text-right w-28">Tot. Avere</th>
                        <th className="pb-2 w-20"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {nonCat.map((nc, i) => (
                        <tr key={i} className="border-b border-neutral-100 hover:bg-violet-50 transition">
                          <td className="py-2 text-xs font-medium">{nc.descrizione}</td>
                          <td className="py-2 text-xs text-right font-mono text-neutral-500">{nc.num}</td>
                          <td className={`py-2 text-xs text-right font-mono ${nc.tot_dare < 0 ? "text-red-600" : "text-neutral-400"}`}>
                            {nc.tot_dare !== 0 ? fmt(nc.tot_dare) : ""}
                          </td>
                          <td className={`py-2 text-xs text-right font-mono ${nc.tot_avere > 0 ? "text-emerald-700" : "text-neutral-400"}`}>
                            {nc.tot_avere !== 0 ? fmt(nc.tot_avere) : ""}
                          </td>
                          <td className="py-2 text-right">
                            <button
                              onClick={() => startFromDesc(nc.descrizione)}
                              className="text-[10px] px-2 py-1 rounded-lg bg-violet-100 text-violet-700 hover:bg-violet-200 font-medium transition"
                            >
                              + Regola
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            )}

            {/* TAB: Regole esistenti */}
            {tab === "regole" && (
              <div>
                {regole.length === 0 ? (
                  <div className="text-center py-8 text-neutral-400">Nessuna regola definita.</div>
                ) : (
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-left text-neutral-500 text-xs">
                        <th className="pb-2">Pattern</th>
                        <th className="pb-2">Cat.1</th>
                        <th className="pb-2">Cat.2</th>
                        <th className="pb-2">Cat.1 Fin</th>
                        <th className="pb-2">Cat.2 Fin</th>
                        <th className="pb-2 text-right w-16">Match</th>
                        <th className="pb-2 w-24"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {regole.map((r) => (
                        <tr key={r.id} className="border-b border-neutral-100 hover:bg-violet-50 transition">
                          <td className="py-2 text-xs font-mono font-bold text-violet-800">{r.pattern}</td>
                          <td className="py-2 text-xs">{r.cat1}</td>
                          <td className="py-2 text-xs text-neutral-400">{r.cat2}</td>
                          <td className="py-2 text-xs">{r.cat1_fin}</td>
                          <td className="py-2 text-xs text-neutral-400">{r.cat2_fin}</td>
                          <td className="py-2 text-xs text-right font-mono text-neutral-500">{r.num_match}</td>
                          <td className="py-2 text-right flex gap-1 justify-end">
                            <button
                              onClick={() => startEdit(r)}
                              className="text-[10px] px-2 py-1 rounded-lg bg-amber-100 text-amber-700 hover:bg-amber-200 font-medium"
                            >
                              Modifica
                            </button>
                            <button
                              onClick={() => handleDelete(r.id)}
                              className="text-[10px] px-2 py-1 rounded-lg bg-red-100 text-red-600 hover:bg-red-200 font-medium"
                            >
                              Elimina
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            )}

            {/* TAB: Fornitori acquisti */}
            {tab === "fornitori" && (
              <div>
                <p className="text-xs text-neutral-400 mb-3">
                  Fornitori dal modulo Acquisti. Clicca per creare una regola basata sul nome.
                </p>
                {fornitori.length === 0 ? (
                  <div className="text-center py-8 text-neutral-400">Nessun fornitore trovato nel modulo Acquisti.</div>
                ) : (
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-left text-neutral-500 text-xs">
                        <th className="pb-2">Fornitore</th>
                        <th className="pb-2">P.IVA</th>
                        <th className="pb-2 text-right w-16">Fatt.</th>
                        <th className="pb-2 text-right w-28">Totale</th>
                        <th className="pb-2 w-20"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {fornitori.map((f, i) => (
                        <tr key={i} className="border-b border-neutral-100 hover:bg-violet-50 transition">
                          <td className="py-2 text-xs font-medium">{f.fornitore_nome}</td>
                          <td className="py-2 text-[10px] font-mono text-neutral-400">{f.fornitore_piva}</td>
                          <td className="py-2 text-xs text-right font-mono">{f.num_fatture}</td>
                          <td className="py-2 text-xs text-right font-mono">{fmt(f.totale)}</td>
                          <td className="py-2 text-right">
                            <button
                              onClick={() => startFromFornitore(f)}
                              className="text-[10px] px-2 py-1 rounded-lg bg-violet-100 text-violet-700 hover:bg-violet-200 font-medium transition"
                            >
                              + Regola
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            )}

            {/* TAB: Nuova/Modifica regola */}
            {tab === "nuova" && (
              <div className="max-w-2xl">
                <h2 className="text-lg font-semibold text-neutral-800 mb-4">
                  {editRegola ? `Modifica regola #${editRegola.id}` : "Nuova regola"}
                </h2>

                {msg && (
                  <div className={`mb-4 rounded-xl border px-4 py-3 text-sm ${
                    msg.includes("Errore") ? "border-red-300 bg-red-50 text-red-800" : "border-emerald-300 bg-emerald-50 text-emerald-800"
                  }`}>{msg}</div>
                )}

                {/* Pattern */}
                <div className="mb-4">
                  <div className={labelCls}>Pattern (cercato nella descrizione)</div>
                  <input
                    className={inputCls}
                    value={form.pattern}
                    onChange={(e) => setForm({ ...form, pattern: e.target.value })}
                    placeholder="es. COOP LOMBARDIA, ENEL, SALUMIFICIO..."
                  />
                  <div className="text-[10px] text-neutral-400 mt-0.5">
                    Il pattern viene cercato con LIKE %PATTERN% nella descrizione del movimento (case-insensitive).
                  </div>
                </div>

                {/* Fornitore collegato */}
                <div className="grid grid-cols-2 gap-3 mb-4">
                  <div>
                    <div className={labelCls}>Fornitore (opzionale)</div>
                    <input className={inputCls} value={form.fornitore_nome}
                      onChange={(e) => setForm({ ...form, fornitore_nome: e.target.value })}
                      placeholder="Nome fornitore" />
                  </div>
                  <div>
                    <div className={labelCls}>P.IVA</div>
                    <input className={inputCls} value={form.fornitore_piva}
                      onChange={(e) => setForm({ ...form, fornitore_piva: e.target.value })}
                      placeholder="P.IVA" />
                  </div>
                </div>

                {/* Categorie Analitico */}
                <div className="rounded-xl border border-violet-200 bg-violet-50/30 p-4 mb-4">
                  <div className="text-xs font-bold text-violet-800 mb-2">Vista Analitica (competenza)</div>
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <div className={labelCls}>Tipo (E/U)</div>
                      <select className={inputCls} value={form.tipo_analitico}
                        onChange={(e) => setForm({ ...form, tipo_analitico: e.target.value })}>
                        <option value="">—</option>
                        <option value="E">ENTRATA</option>
                        <option value="U">USCITA</option>
                      </select>
                    </div>
                    <div>
                      <div className={labelCls}>Cat.1</div>
                      <CatSelect
                        value={form.cat1}
                        onChange={(v) => setForm(f => ({ ...f, cat1: v, cat2: "" }))}
                        options={(albero.A || []).map(c => c.nome)}
                        placeholder="— Cat.1 —"
                        onAddNew={async (nome) => {
                          await apiFetch(`${FC}/albero-categorie`, {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ nome, vista: "A" }),
                          });
                          loadAll();
                        }}
                      />
                    </div>
                    <div>
                      <div className={labelCls}>Cat.2</div>
                      <CatSelect
                        value={form.cat2}
                        onChange={(v) => setForm(f => ({ ...f, cat2: v }))}
                        options={(() => {
                          const parent = (albero.A || []).find(c => c.nome === form.cat1);
                          return parent ? parent.sottocategorie.map(s => s.nome) : [];
                        })()}
                        placeholder={form.cat1 ? "— Cat.2 —" : "Scegli prima Cat.1"}
                        onAddNew={form.cat1 ? async (nome) => {
                          const parent = (albero.A || []).find(c => c.nome === form.cat1);
                          if (parent) {
                            await apiFetch(`${FC}/albero-categorie/${parent.id}/sotto`, {
                              method: "POST",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({ nome }),
                            });
                            loadAll();
                          }
                        } : null}
                      />
                    </div>
                  </div>
                </div>

                {/* Categorie Finanziario */}
                <div className="rounded-xl border border-amber-200 bg-amber-50/30 p-4 mb-4">
                  <div className="text-xs font-bold text-amber-800 mb-2">Vista Finanziaria (cassa)</div>
                  <div className="grid grid-cols-2 gap-3 mb-2">
                    <div>
                      <div className={labelCls}>Tipo (E/U)</div>
                      <select className={inputCls} value={form.tipo_finanziario}
                        onChange={(e) => setForm({ ...form, tipo_finanziario: e.target.value })}>
                        <option value="">—</option>
                        <option value="E">ENTRATA</option>
                        <option value="U">USCITA</option>
                      </select>
                    </div>
                    <div>
                      <div className={labelCls}>Desc. Finanziaria</div>
                      <input className={inputCls} value={form.descrizione_finanziaria}
                        onChange={(e) => setForm({ ...form, descrizione_finanziaria: e.target.value })}
                        list="descfin-list" placeholder="USCITE CORRENTI..." />
                      <datalist id="descfin-list">
                        {(valori.desc_finanziarie || []).map((c) => <option key={c} value={c} />)}
                      </datalist>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <div className={labelCls}>Cat.1 Fin</div>
                      <CatSelect
                        value={form.cat1_fin}
                        onChange={(v) => setForm(f => ({ ...f, cat1_fin: v, cat2_fin: "" }))}
                        options={(albero.F || []).map(c => c.nome)}
                        placeholder="— Cat.1 Fin —"
                        onAddNew={async (nome) => {
                          await apiFetch(`${FC}/albero-categorie`, {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ nome, vista: "F" }),
                          });
                          loadAll();
                        }}
                      />
                    </div>
                    <div>
                      <div className={labelCls}>Cat.2 Fin</div>
                      <CatSelect
                        value={form.cat2_fin}
                        onChange={(v) => setForm(f => ({ ...f, cat2_fin: v }))}
                        options={(() => {
                          const parent = (albero.F || []).find(c => c.nome === form.cat1_fin);
                          return parent ? parent.sottocategorie.map(s => s.nome) : [];
                        })()}
                        placeholder={form.cat1_fin ? "— Cat.2 Fin —" : "Scegli prima Cat.1 Fin"}
                        onAddNew={form.cat1_fin ? async (nome) => {
                          const parent = (albero.F || []).find(c => c.nome === form.cat1_fin);
                          if (parent) {
                            await apiFetch(`${FC}/albero-categorie/${parent.id}/sotto`, {
                              method: "POST",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({ nome }),
                            });
                            loadAll();
                          }
                        } : null}
                      />
                    </div>
                  </div>
                </div>

                {/* Cat debito */}
                <div className="mb-6">
                  <div className={labelCls}>Cat. Debito (opzionale)</div>
                  <input className={inputCls} value={form.cat_debito}
                    onChange={(e) => setForm({ ...form, cat_debito: e.target.value })}
                    list="catdeb-list" placeholder="DEBITO BREVE, MEDIO..." />
                  <datalist id="catdeb-list">
                    {(valori.cat_debiti || []).map((c) => <option key={c} value={c} />)}
                  </datalist>
                </div>

                <div className="flex gap-3">
                  <button
                    onClick={handleSave}
                    disabled={saving}
                    className="px-6 py-2.5 rounded-xl text-sm font-semibold bg-violet-600 text-white hover:bg-violet-700 shadow transition disabled:opacity-50"
                  >
                    {saving ? "Salvataggio..." : editRegola ? "Aggiorna regola" : "Crea regola"}
                  </button>
                  <button
                    onClick={() => { setEditRegola(null); setForm({ ...EMPTY_REGOLA }); setTab("regole"); setMsg(""); }}
                    className="px-4 py-2 rounded-xl text-sm text-neutral-500 hover:text-neutral-700 border border-neutral-300 hover:bg-neutral-50 transition"
                  >
                    Annulla
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
