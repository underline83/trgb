// @version: v2.2-mattoni — M.I primitives (Btn) su CTA scheda (Salva/Modifica/Merge/Aggiungi/Nuovo preventivo)
// Scheda dettaglio cliente — embedded mode + merge manuale con ricerca
import React, { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { API_BASE, apiFetch } from "../../config/api";
import ClientiNav from "./ClientiNav";
import Tooltip from "../../components/Tooltip";
import { Btn } from "../../components/ui";

// ── Colori sidebar per rank ──────────────────────────────
const RANK_SIDEBAR = {
  Gold:    { bg: "bg-gradient-to-b from-yellow-600 to-yellow-800", text: "text-yellow-100" },
  Silver:  { bg: "bg-gradient-to-b from-neutral-500 to-neutral-700", text: "text-neutral-100" },
  Bronze:  { bg: "bg-gradient-to-b from-orange-600 to-orange-800", text: "text-orange-100" },
  Caution: { bg: "bg-gradient-to-b from-red-600 to-red-800", text: "text-red-100" },
};

function getSidebarColors(rank) {
  return RANK_SIDEBAR[rank] || { bg: "bg-gradient-to-b from-teal-700 to-teal-900", text: "text-teal-100" };
}

function SectionHeader({ title, children }) {
  return (
    <div className="flex items-center justify-between px-5 py-3 bg-neutral-50 border-b border-neutral-200">
      <h2 className="text-sm font-semibold text-neutral-800 uppercase tracking-wide">{title}</h2>
      <div className="flex gap-2 items-center">{children}</div>
    </div>
  );
}

function Field({ label, value }) {
  return (
    <div>
      <div className="text-[11px] font-semibold text-neutral-500 uppercase tracking-wide mb-0.5">{label}</div>
      <div className="text-sm text-neutral-800">{value || "—"}</div>
    </div>
  );
}

function Input({ label, name, value, onChange, type = "text" }) {
  return (
    <div>
      <label className="block text-[11px] font-semibold text-neutral-500 uppercase tracking-wide mb-0.5">{label}</label>
      <input type={type} name={name} value={value ?? ""} onChange={onChange}
        className="w-full border border-neutral-300 rounded-lg px-2 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-teal-300" />
    </div>
  );
}

function TextArea({ label, name, value, onChange, rows = 2 }) {
  return (
    <div>
      <label className="block text-[11px] font-semibold text-neutral-500 uppercase tracking-wide mb-0.5">{label}</label>
      <textarea name={name} value={value ?? ""} onChange={onChange} rows={rows}
        className="w-full border border-neutral-300 rounded-lg px-2 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-teal-300" />
    </div>
  );
}

const TIPI_NOTA = [
  { value: "nota", label: "Nota", icon: "📝" },
  { value: "telefonata", label: "Telefonata", icon: "📞" },
  { value: "evento", label: "Evento", icon: "🎉" },
  { value: "reclamo", label: "Reclamo", icon: "⚠️" },
  { value: "preferenza", label: "Preferenza", icon: "🍽️" },
];

const STATUS_COLORS = {
  SEATED: "bg-emerald-100 text-emerald-700", ARRIVED: "bg-emerald-100 text-emerald-700",
  BILL: "bg-emerald-100 text-emerald-700", LEFT: "bg-neutral-100 text-neutral-600",
  RECORDED: "bg-sky-100 text-sky-700", CANCELED: "bg-red-100 text-red-600",
  NO_SHOW: "bg-amber-100 text-amber-700", REFUSED: "bg-red-100 text-red-600",
};

export default function ClientiScheda({ clienteId: propId, onClose, embedded = false }) {
  const params = useParams();
  const navigate = useNavigate();
  const id = propId || params.id;
  const handleBack = onClose || (() => navigate("/clienti/lista"));

  const [cliente, setCliente] = useState(null);
  const [loading, setLoading] = useState(true);
  const [allTags, setAllTags] = useState([]);
  const [editMode, setEditMode] = useState(false);
  const [form, setForm] = useState({});
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState(null);
  const [tab, setTab] = useState("anagrafica"); // anagrafica | preferenze | note | prenotazioni

  const [nuovaNota, setNuovaNota] = useState({ tipo: "nota", testo: "" });

  // ── Merge manuale ──
  const [showMerge, setShowMerge] = useState(false);
  const [mergeQuery, setMergeQuery] = useState("");
  const [mergeResults, setMergeResults] = useState([]);
  const [mergeSearching, setMergeSearching] = useState(false);
  const [mergeTarget, setMergeTarget] = useState(null); // dati completi del target
  const [merging, setMerging] = useState(false);
  const [mergeAsCoppia, setMergeAsCoppia] = useState(false);

  // Campi da confrontare nel side-by-side
  const MERGE_FIELDS = [
    { key: "telefono", label: "Telefono" }, { key: "telefono2", label: "Telefono 2" },
    { key: "email", label: "Email" }, { key: "data_nascita", label: "Data nascita" },
    { key: "indirizzo", label: "Indirizzo" }, { key: "cap", label: "CAP" },
    { key: "citta", label: "Città" }, { key: "paese", label: "Paese" },
    { key: "pref_cibo", label: "Pref. cibo" }, { key: "pref_bevande", label: "Pref. bevande" },
    { key: "pref_posto", label: "Posto pref." }, { key: "allergie", label: "Allergie" },
    { key: "restrizioni_dietetiche", label: "Restrizioni" }, { key: "note_thefork", label: "Note TF" },
  ];

  const showToast = (message, type = "ok") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  const fetchCliente = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch(`${API_BASE}/clienti/${id}`);
      if (!res.ok) throw new Error("Cliente non trovato");
      const data = await res.json();
      setCliente(data);
      setForm(data);
    } catch (err) {
      showToast("Errore caricamento", "error");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchCliente();
    apiFetch(`${API_BASE}/clienti/tag/lista`)
      .then((r) => r.json())
      .then((data) => setAllTags(Array.isArray(data) ? data : []))
      .catch(() => {});
  }, [fetchCliente]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await apiFetch(`${API_BASE}/clienti/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!res.ok) throw new Error("Errore salvataggio");
      showToast("Salvato");
      setEditMode(false);
      fetchCliente();
    } catch (err) {
      showToast(err.message, "error");
    } finally {
      setSaving(false);
    }
  };

  const toggleTag = async (tagId) => {
    const hasTag = cliente.tags?.some((t) => t.id === tagId);
    try {
      await apiFetch(`${API_BASE}/clienti/${id}/tag/${tagId}`, { method: hasTag ? "DELETE" : "POST" });
      fetchCliente();
    } catch (err) {
      showToast("Errore tag", "error");
    }
  };

  const aggiungiNota = async () => {
    if (!nuovaNota.testo.trim()) return;
    try {
      await apiFetch(`${API_BASE}/clienti/${id}/note`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(nuovaNota),
      });
      setNuovaNota({ tipo: "nota", testo: "" });
      showToast("Nota aggiunta");
      fetchCliente();
    } catch (err) {
      showToast("Errore nota", "error");
    }
  };

  const eliminaNota = async (notaId) => {
    if (!confirm("Eliminare questa nota?")) return;
    try {
      await apiFetch(`${API_BASE}/clienti/${id}/note/${notaId}`, { method: "DELETE" });
      fetchCliente();
    } catch (err) {
      showToast("Errore eliminazione", "error");
    }
  };

  const onChange = (e) => setForm(prev => ({ ...prev, [e.target.name]: e.target.value }));

  // Reset stati quando cambia id (per embedded mode)
  useEffect(() => {
    setEditMode(false);
    setTab("anagrafica");
    setShowMerge(false);
    setMergeTarget(null);
    setMergeQuery("");
    setMergeResults([]);
  }, [id]);

  // ── Merge manuale: ricerca ──
  const searchMergeTarget = async (query) => {
    setMergeQuery(query);
    if (query.length < 2) { setMergeResults([]); return; }
    setMergeSearching(true);
    try {
      const res = await apiFetch(`${API_BASE}/clienti/?q=${encodeURIComponent(query)}&limit=10`);
      const data = await res.json();
      // Escludi il cliente corrente dalla lista
      setMergeResults((data.clienti || []).filter(c => c.id !== Number(id)));
    } catch { setMergeResults([]); }
    finally { setMergeSearching(false); }
  };

  const executeMerge = async () => {
    if (!mergeTarget) return;
    const coppiaNote = mergeAsCoppia ? `\n\nIl nome "${mergeTarget.nome} ${mergeTarget.cognome}" verrà salvato come secondo intestatario.` : "";
    const msg = `Unire "${mergeTarget.cognome} ${mergeTarget.nome}" dentro "${cliente.cognome} ${cliente.nome}"?\n\nPrenotazioni e note verranno trasferite. L'operazione NON è reversibile.${coppiaNote}`;
    if (!window.confirm(msg)) return;
    setMerging(true);
    try {
      const res = await apiFetch(`${API_BASE}/clienti/merge`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ principale_id: Number(id), secondario_id: mergeTarget.id }),
      });
      if (!res.ok) { const err = await res.json(); throw new Error(err.detail || "Errore merge"); }
      // Se merge come coppia, salva nome2/cognome2 del secondario sul principale
      if (mergeAsCoppia && mergeTarget.nome) {
        await apiFetch(`${API_BASE}/clienti/${id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...cliente, nome2: mergeTarget.nome, cognome2: mergeTarget.cognome || cliente.cognome }),
        }).catch(() => {});
      }
      showToast(mergeAsCoppia ? "Merge completato — coppia salvata!" : "Merge completato!");
      setShowMerge(false);
      setMergeTarget(null);
      setMergeQuery("");
      setMergeResults([]);
      fetchCliente();
    } catch (err) {
      showToast(err.message, "error");
    } finally { setMerging(false); }
  };

  if (loading) return (
    <>
      {!embedded && <ClientiNav current="lista" />}
      <div className={`${embedded ? "py-12" : "min-h-screen bg-brand-cream"} flex items-center justify-center`}>
        <div className="text-sm text-neutral-400">Caricamento...</div>
      </div>
    </>
  );

  if (!cliente) return (
    <>
      {!embedded && <ClientiNav current="lista" />}
      <div className={`${embedded ? "py-12" : "min-h-screen bg-brand-cream"} flex items-center justify-center`}>
        <div className="text-sm text-neutral-400">Cliente non trovato</div>
      </div>
    </>
  );

  const sidebar = getSidebarColors(cliente.rank);
  const stats = cliente.prenotazioni_stats || {};

  const TABS = [
    { key: "anagrafica", label: "Anagrafica" },
    { key: "preferenze", label: "Preferenze" },
    { key: "note", label: `Note (${cliente.note?.length || 0})` },
    { key: "prenotazioni", label: `Prenotazioni (${stats.totale || 0})` },
    { key: "preventivi", label: "Preventivi" },
  ];

  return (
    <>
      {!embedded && <ClientiNav current="lista" />}
      <div className={`${embedded ? "" : "min-h-screen bg-brand-cream"} font-sans`}>
        <div className={embedded ? "" : "max-w-4xl mx-auto p-4 sm:p-6"}>

          {/* ── CARD PRINCIPALE con sidebar colorata ── */}
          <div className="bg-white rounded-2xl border border-neutral-200 shadow-sm overflow-hidden">

            {/* ── HEADER: sidebar + info + azioni ── */}
            <div className="flex">
              {/* Sidebar colorata */}
              <div className={`w-2 sm:w-3 flex-shrink-0 ${sidebar.bg}`} />

              <div className="flex-1 px-5 py-4">
                <div className="flex items-start justify-between">
                  <div>
                    {/* Torna alla lista */}
                    <button onClick={handleBack}
                      className="text-xs text-neutral-400 hover:text-neutral-600 transition mb-1 inline-block">
                      ← Anagrafica
                    </button>
                    <h1 className="text-xl font-bold text-neutral-900 flex items-center gap-2">
                      {cliente.vip ? "⭐ " : ""}{cliente.nome}{cliente.nome2 ? ` & ${cliente.nome2}` : ""} {cliente.cognome2 && cliente.cognome2 !== cliente.cognome ? `${cliente.cognome} / ${cliente.cognome2}` : cliente.cognome}
                      {cliente.protetto === 1 && (
                        <Tooltip label="Protetto da import TheFork">
                          <span className="text-xs text-teal-500">🛡</span>
                        </Tooltip>
                      )}
                    </h1>
                    <div className="flex items-center gap-2 mt-1">
                      {cliente.rank && (
                        <span className={`text-[11px] px-2 py-0.5 rounded-full border font-medium ${
                          RANK_SIDEBAR[cliente.rank] ? {
                            Gold: "bg-yellow-100 text-yellow-700 border-yellow-300",
                            Silver: "bg-neutral-200 text-neutral-600 border-neutral-300",
                            Bronze: "bg-orange-100 text-orange-700 border-orange-300",
                            Caution: "bg-red-100 text-red-600 border-red-300",
                          }[cliente.rank] : "bg-neutral-100 text-neutral-600 border-neutral-200"
                        }`}>
                          {cliente.rank}
                        </span>
                      )}
                      {cliente.origine && (
                        <span className="text-[11px] text-neutral-400">{cliente.origine}</span>
                      )}
                      {cliente.lingua && cliente.lingua !== "it_IT" && (
                        <span className="text-[11px] bg-neutral-100 text-neutral-500 px-1.5 py-0.5 rounded">{cliente.lingua}</span>
                      )}
                    </div>
                  </div>

                  {/* Pulsanti azione */}
                  <div className="flex gap-2">
                    {editMode ? (
                      <>
                        <Btn variant="ghost" size="sm" onClick={() => { setEditMode(false); setForm(cliente); }}>
                          Annulla
                        </Btn>
                        <Btn variant="chip" tone="emerald" size="sm" onClick={handleSave} disabled={saving} loading={saving}>
                          {saving ? "Salvo..." : "Salva"}
                        </Btn>
                      </>
                    ) : (
                      <>
                        {showMerge ? (
                          <Btn variant="chip" tone="amber" size="sm" onClick={() => setShowMerge(!showMerge)}>
                            Chiudi merge
                          </Btn>
                        ) : (
                          <Btn variant="ghost" size="sm" onClick={() => setShowMerge(!showMerge)}>
                            Unisci con...
                          </Btn>
                        )}
                        <Btn variant="chip" tone="emerald" size="sm" onClick={() => setEditMode(true)}>
                          Modifica
                        </Btn>
                      </>
                    )}
                  </div>
                </div>

                {/* ── PANNELLO MERGE MANUALE ── */}
                {showMerge && (
                  <div className="mt-3 p-3 bg-amber-50 border border-amber-200 rounded-xl">
                    <div className="text-xs font-semibold text-amber-800 mb-2">
                      Cerca il cliente da assorbire in questo:
                    </div>
                    <input
                      type="text"
                      value={mergeQuery}
                      onChange={(e) => searchMergeTarget(e.target.value)}
                      placeholder="Nome, cognome, telefono, email..."
                      className="w-full border border-amber-300 rounded-lg px-3 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-amber-300 mb-2"
                      autoFocus
                    />
                    {mergeSearching && <div className="text-xs text-neutral-400 py-1">Cerco...</div>}
                    {mergeResults.length > 0 && !mergeTarget && (
                      <div className="max-h-40 overflow-y-auto border border-amber-200 rounded-lg bg-white divide-y divide-amber-100">
                        {mergeResults.map((c) => (
                          <button key={c.id} onClick={async () => {
                            // Carica dati completi del target per il side-by-side
                            try {
                              const res = await apiFetch(`${API_BASE}/clienti/${c.id}`);
                              if (res.ok) { const full = await res.json(); setMergeTarget(full); }
                              else setMergeTarget(c);
                            } catch { setMergeTarget(c); }
                          }}
                            className="w-full text-left px-3 py-2 hover:bg-amber-50 transition text-sm flex items-center justify-between">
                            <span>
                              <span className="font-medium text-neutral-800">{c.cognome} {c.nome}</span>
                              <span className="text-neutral-400 ml-2 text-xs">{c.telefono || c.email || ""}</span>
                            </span>
                            <span className="text-xs text-neutral-400">{c.n_prenotazioni || 0} pren.</span>
                          </button>
                        ))}
                      </div>
                    )}
                    {mergeTarget && (
                      <div className="border border-amber-300 rounded-lg bg-white p-3">
                        <div className="flex items-center justify-between mb-3">
                          <div className="text-sm">
                            <span className="font-semibold text-teal-700">{cliente.cognome} {cliente.nome}</span>
                            <span className="mx-2 text-neutral-400">←</span>
                            <span className="font-semibold text-red-600">{mergeTarget.cognome} {mergeTarget.nome}</span>
                          </div>
                          <button onClick={() => setMergeTarget(null)}
                            className="text-xs text-neutral-400 hover:text-neutral-600">Cambia</button>
                        </div>

                        {/* ── CONFRONTO SIDE-BY-SIDE ── */}
                        <div className="border border-neutral-200 rounded-lg overflow-hidden mb-3">
                          <table className="w-full text-xs">
                            <thead className="bg-neutral-50">
                              <tr>
                                <th className="px-2 py-1.5 text-left text-neutral-500 font-medium w-28">Campo</th>
                                <th className="px-2 py-1.5 text-left text-teal-700 font-medium">Principale (mantiene)</th>
                                <th className="px-2 py-1.5 text-left text-red-600 font-medium">Secondario (elimina)</th>
                                <th className="px-2 py-1.5 text-center text-neutral-500 font-medium w-20">Risultato</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-neutral-100">
                              {MERGE_FIELDS.map(({ key, label }) => {
                                const pVal = cliente[key] || "";
                                const sVal = mergeTarget[key] || "";
                                const isDiff = pVal !== sVal && sVal;
                                const willFill = !pVal && sVal;
                                return (
                                  <tr key={key} className={isDiff ? "bg-amber-50/50" : ""}>
                                    <td className="px-2 py-1 text-neutral-500 font-medium">{label}</td>
                                    <td className="px-2 py-1 text-neutral-800">{pVal || <span className="text-neutral-300">—</span>}</td>
                                    <td className={`px-2 py-1 ${isDiff ? "text-red-600 font-medium" : "text-neutral-400"}`}>{sVal || "—"}</td>
                                    <td className="px-2 py-1 text-center">
                                      {willFill ? (
                                        <span className="text-[10px] bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded-full">auto-fill</span>
                                      ) : isDiff ? (
                                        <span className="text-[10px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full">ignora</span>
                                      ) : (
                                        <span className="text-neutral-300">—</span>
                                      )}
                                    </td>
                                  </tr>
                                );
                              })}
                              <tr className="bg-neutral-50">
                                <td className="px-2 py-1 font-medium text-neutral-500">Prenotazioni</td>
                                <td className="px-2 py-1 font-bold text-teal-700">{cliente.prenotazioni_stats?.totale || 0}</td>
                                <td className="px-2 py-1 font-bold text-red-600">{mergeTarget.prenotazioni_stats?.totale || mergeTarget.n_prenotazioni || 0}</td>
                                <td className="px-2 py-1 text-center">
                                  <span className="text-[10px] bg-teal-100 text-teal-700 px-1.5 py-0.5 rounded-full">trasferisce</span>
                                </td>
                              </tr>
                            </tbody>
                          </table>
                        </div>

                        <div className="text-xs text-amber-700 mb-2">
                          I campi vuoti del principale vengono riempiti dal secondario. Le prenotazioni, note e tag vengono trasferiti.
                          Il record di <strong>{mergeTarget.cognome}</strong> verrà eliminato.
                        </div>
                        <label className="flex items-center gap-2 mb-3 cursor-pointer">
                          <input type="checkbox" checked={mergeAsCoppia}
                            onChange={(e) => setMergeAsCoppia(e.target.checked)}
                            className="rounded border-neutral-300 text-teal-600 focus:ring-teal-500" />
                          <span className="text-xs text-neutral-700 font-medium">
                            Salva come coppia (moglie/marito) — "{mergeTarget.nome} {mergeTarget.cognome}" diventa secondo intestatario
                          </span>
                        </label>
                        <div className="flex gap-2">
                          <Btn variant="danger" size="sm" onClick={executeMerge} disabled={merging} loading={merging}>
                            {merging ? "Merge in corso..." : "Conferma Merge"}
                          </Btn>
                          <Btn variant="ghost" size="sm" onClick={() => { setMergeTarget(null); setShowMerge(false); }}>
                            Annulla
                          </Btn>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* ── KPI rapidi (come stats in SchedaVino) ── */}
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mt-4">
                  <div className="bg-neutral-50 rounded-lg px-3 py-2 text-center">
                    <div className="text-lg font-bold text-neutral-800">{stats.totale || 0}</div>
                    <div className="text-[10px] text-neutral-500 uppercase">Prenotazioni</div>
                  </div>
                  <div className="bg-neutral-50 rounded-lg px-3 py-2 text-center">
                    <div className="text-lg font-bold text-teal-700">{stats.completate || 0}</div>
                    <div className="text-[10px] text-neutral-500 uppercase">Completate</div>
                  </div>
                  <div className="bg-neutral-50 rounded-lg px-3 py-2 text-center">
                    <div className="text-lg font-bold text-neutral-600">{stats.pax_medio || "—"}</div>
                    <div className="text-[10px] text-neutral-500 uppercase">Pax medio</div>
                  </div>
                  <div className="bg-neutral-50 rounded-lg px-3 py-2 text-center">
                    <div className="text-xs font-medium text-neutral-700 mt-0.5">{stats.prima_visita || "—"}</div>
                    <div className="text-[10px] text-neutral-500 uppercase">Prima visita</div>
                  </div>
                  <div className="bg-neutral-50 rounded-lg px-3 py-2 text-center">
                    <div className="text-xs font-medium text-neutral-700 mt-0.5">{stats.ultima_visita || "—"}</div>
                    <div className="text-[10px] text-neutral-500 uppercase">Ultima visita</div>
                  </div>
                </div>

                {/* ── Tag (toggle rapido) ── */}
                <div className="flex flex-wrap gap-1.5 mt-3">
                  {allTags.map((tag) => {
                    const active = cliente.tags?.some((t) => t.id === tag.id);
                    return (
                      <button key={tag.id} onClick={() => toggleTag(tag.id)}
                        className={`text-[11px] px-2 py-0.5 rounded-full border transition font-medium ${
                          active
                            ? "border-teal-400 bg-teal-100 text-teal-800"
                            : "border-neutral-300 bg-white text-neutral-400 hover:border-teal-300 hover:text-neutral-600"
                        }`}>
                        {active ? "✓ " : ""}{tag.nome}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* ── TABS ── */}
            <div className="flex border-t border-neutral-200 bg-neutral-50">
              {TABS.map((t) => (
                <button key={t.key} onClick={() => setTab(t.key)}
                  className={`flex-1 text-center py-2.5 text-xs font-semibold uppercase tracking-wide transition border-b-2 ${
                    tab === t.key
                      ? "border-teal-600 text-teal-700 bg-white"
                      : "border-transparent text-neutral-500 hover:text-neutral-700 hover:bg-white/60"
                  }`}>
                  {t.label}
                </button>
              ))}
            </div>

            {/* ── TAB CONTENT ── */}
            <div className="px-5 py-5">

              {/* ANAGRAFICA */}
              {tab === "anagrafica" && (
                <div className="space-y-5">
                  {editMode ? (
                    <>
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                        <Input label="Nome" name="nome" value={form.nome} onChange={onChange} />
                        <Input label="Cognome" name="cognome" value={form.cognome} onChange={onChange} />
                        <Input label="Titolo" name="titolo" value={form.titolo} onChange={onChange} />
                        <Input label="Nome 2 (coppia)" name="nome2" value={form.nome2} onChange={onChange} />
                        <Input label="Cognome 2 (coppia)" name="cognome2" value={form.cognome2} onChange={onChange} />
                        <Input label="Telefono" name="telefono" value={form.telefono} onChange={onChange} />
                        <Input label="Telefono 2" name="telefono2" value={form.telefono2} onChange={onChange} />
                        <Input label="Email" name="email" value={form.email} onChange={onChange} type="email" />
                        <Input label="Data di nascita" name="data_nascita" value={form.data_nascita} onChange={onChange} />
                        <Input label="Lingua" name="lingua" value={form.lingua} onChange={onChange} />
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                        <Input label="Indirizzo" name="indirizzo" value={form.indirizzo} onChange={onChange} />
                        <Input label="CAP" name="cap" value={form.cap} onChange={onChange} />
                        <Input label="Città" name="citta" value={form.citta} onChange={onChange} />
                        <Input label="Paese" name="paese" value={form.paese} onChange={onChange} />
                      </div>
                      <div className="flex items-center gap-4 pt-2">
                        <label className="inline-flex items-center gap-1.5 text-sm cursor-pointer">
                          <input type="checkbox" checked={!!form.vip}
                            onChange={(e) => setForm(prev => ({ ...prev, vip: e.target.checked }))}
                            className="rounded border-neutral-300 text-teal-600" />
                          VIP
                        </label>
                        <label className="inline-flex items-center gap-1.5 text-sm cursor-pointer">
                          <input type="checkbox" checked={!!form.newsletter}
                            onChange={(e) => setForm(prev => ({ ...prev, newsletter: e.target.checked }))}
                            className="rounded border-neutral-300 text-teal-600" />
                          Newsletter
                        </label>
                        <label className="inline-flex items-center gap-1.5 text-sm cursor-pointer">
                          <input type="checkbox" checked={!!form.attivo}
                            onChange={(e) => setForm(prev => ({ ...prev, attivo: e.target.checked }))}
                            className="rounded border-neutral-300 text-teal-600" />
                          Attivo
                        </label>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                        <Field label="Nome" value={cliente.nome} />
                        <Field label="Cognome" value={cliente.cognome} />
                        <Field label="Titolo" value={cliente.titolo} />
                        {(cliente.nome2 || cliente.cognome2) && <Field label="Nome 2 (coppia)" value={cliente.nome2} />}
                        {(cliente.nome2 || cliente.cognome2) && <Field label="Cognome 2 (coppia)" value={cliente.cognome2} />}
                        <Field label="Telefono" value={cliente.telefono} />
                        <Field label="Telefono 2" value={cliente.telefono2} />
                        <Field label="Email" value={cliente.email} />
                        <Field label="Data di nascita" value={cliente.data_nascita} />
                        <Field label="Lingua" value={cliente.lingua} />
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                        <Field label="Indirizzo" value={cliente.indirizzo} />
                        <Field label="CAP" value={cliente.cap} />
                        <Field label="Città" value={cliente.citta} />
                        <Field label="Paese" value={cliente.paese} />
                      </div>
                      <div className="flex gap-4 text-sm text-neutral-600 pt-2">
                        <span>{cliente.vip ? "⭐ VIP" : ""}</span>
                        <span>{cliente.newsletter ? "📧 Newsletter" : ""}</span>
                        <span>{cliente.attivo ? "🟢 Attivo" : "🔴 Inattivo"}</span>
                      </div>
                    </>
                  )}

                  {/* Info sistema */}
                  <div className="border-t border-neutral-100 pt-3 grid grid-cols-2 sm:grid-cols-4 gap-3 text-[11px] text-neutral-400">
                    <div>Origine: <span className="text-neutral-600">{cliente.origine}</span></div>
                    <div>Risk: <span className="text-neutral-600">{cliente.risk_level || "—"}</span></div>
                    <div>Creato TF: <span className="text-neutral-600">{cliente.thefork_created || "—"}</span></div>
                    <div>Aggiornato: <span className="text-neutral-600">{cliente.updated_at || "—"}</span></div>
                  </div>
                </div>
              )}

              {/* PREFERENZE */}
              {tab === "preferenze" && (
                <div className="space-y-4">
                  {editMode ? (
                    <>
                      <TextArea label="Preferenze cibo" name="pref_cibo" value={form.pref_cibo} onChange={onChange} />
                      <TextArea label="Preferenze bevande" name="pref_bevande" value={form.pref_bevande} onChange={onChange} />
                      <Input label="Posto preferito" name="pref_posto" value={form.pref_posto} onChange={onChange} />
                      <Input label="Restrizioni dietetiche" name="restrizioni_dietetiche" value={form.restrizioni_dietetiche} onChange={onChange} />
                      <Input label="Allergie e intolleranze" name="allergie" value={form.allergie} onChange={onChange} />
                      <TextArea label="Note TheFork" name="note_thefork" value={form.note_thefork} onChange={onChange} rows={3} />
                    </>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <Field label="Preferenze cibo" value={cliente.pref_cibo} />
                      <Field label="Preferenze bevande" value={cliente.pref_bevande} />
                      <Field label="Posto preferito" value={cliente.pref_posto} />
                      <Field label="Restrizioni dietetiche" value={cliente.restrizioni_dietetiche} />
                      <Field label="Allergie e intolleranze" value={cliente.allergie} />
                      <Field label="Note TheFork" value={cliente.note_thefork} />
                    </div>
                  )}
                </div>
              )}

              {/* NOTE / DIARIO */}
              {tab === "note" && (
                <div>
                  {/* Form nuova nota */}
                  <div className="bg-neutral-50 rounded-lg p-3 mb-4 border border-neutral-200">
                    <div className="flex gap-2 mb-2">
                      <select value={nuovaNota.tipo}
                        onChange={(e) => setNuovaNota(prev => ({ ...prev, tipo: e.target.value }))}
                        className="border border-neutral-300 rounded-lg px-2 py-1 text-sm bg-white">
                        {TIPI_NOTA.map((t) => <option key={t.value} value={t.value}>{t.icon} {t.label}</option>)}
                      </select>
                    </div>
                    <div className="flex gap-2">
                      <input type="text" value={nuovaNota.testo}
                        onChange={(e) => setNuovaNota(prev => ({ ...prev, testo: e.target.value }))}
                        placeholder="Scrivi una nota..."
                        className="flex-1 border border-neutral-300 rounded-lg px-3 py-1.5 text-sm focus:ring-2 focus:ring-teal-300 outline-none"
                        onKeyDown={(e) => e.key === "Enter" && aggiungiNota()} />
                      <Btn variant="chip" tone="emerald" size="sm" onClick={aggiungiNota}>
                        Aggiungi
                      </Btn>
                    </div>
                  </div>

                  {cliente.note?.length === 0 && (
                    <p className="text-sm text-neutral-400 text-center py-8">Nessuna nota</p>
                  )}
                  <div className="space-y-1">
                    {cliente.note?.map((n) => (
                      <div key={n.id} className="flex items-start gap-3 px-3 py-2.5 rounded-lg hover:bg-neutral-50 transition">
                        <span className="text-base mt-0.5">
                          {TIPI_NOTA.find((t) => t.value === n.tipo)?.icon || "📝"}
                        </span>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-neutral-800">{n.testo}</p>
                          <p className="text-[11px] text-neutral-400 mt-0.5">{n.data} · {n.autore || "sistema"}</p>
                        </div>
                        <button onClick={() => eliminaNota(n.id)}
                          className="text-xs text-neutral-300 hover:text-red-500 transition">✕</button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* PRENOTAZIONI */}
              {tab === "prenotazioni" && (
                <div>
                  {stats.totale > 0 && (
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
                      {stats.no_show > 0 && (
                        <div className="bg-amber-50 rounded-lg px-3 py-2 text-center border border-amber-200">
                          <div className="text-lg font-bold text-amber-700">{stats.no_show}</div>
                          <div className="text-[10px] text-amber-600 uppercase">No-show</div>
                        </div>
                      )}
                      {stats.cancellate > 0 && (
                        <div className="bg-red-50 rounded-lg px-3 py-2 text-center border border-red-200">
                          <div className="text-lg font-bold text-red-600">{stats.cancellate}</div>
                          <div className="text-[10px] text-red-500 uppercase">Cancellate</div>
                        </div>
                      )}
                    </div>
                  )}

                  {!cliente.prenotazioni?.length ? (
                    <p className="text-sm text-neutral-400 text-center py-8">Nessuna prenotazione</p>
                  ) : (
                    <div className="overflow-x-auto max-h-[500px] overflow-y-auto">
                      <table className="w-full text-xs">
                        <thead className="bg-neutral-50 sticky top-0 text-[10px] font-semibold text-neutral-500 uppercase">
                          <tr>
                            <th className="px-2 py-2 text-left">Data</th>
                            <th className="px-2 py-2 text-left">Ora</th>
                            <th className="px-2 py-2 text-center">Pax</th>
                            <th className="px-2 py-2 text-left">Stato</th>
                            <th className="px-2 py-2 text-left">Canale</th>
                            <th className="px-2 py-2 text-left">Note</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-neutral-100">
                          {cliente.prenotazioni.map((p) => (
                            <tr key={p.id} className="hover:bg-neutral-50">
                              <td className="px-2 py-1.5 font-medium text-neutral-800">{p.data_pasto}</td>
                              <td className="px-2 py-1.5 text-neutral-600">{p.ora_pasto ? p.ora_pasto.substring(0, 5) : "—"}</td>
                              <td className="px-2 py-1.5 text-center font-medium">{p.pax}</td>
                              <td className="px-2 py-1.5">
                                <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${STATUS_COLORS[p.stato] || "bg-neutral-100 text-neutral-600"}`}>
                                  {p.stato}
                                </span>
                              </td>
                              <td className="px-2 py-1.5 text-neutral-500">{p.canale || "—"}</td>
                              <td className="px-2 py-1.5 text-neutral-500 max-w-[200px] truncate">
                                {p.nota_ristorante || p.nota_cliente || ""}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}

              {/* PREVENTIVI */}
              {tab === "preventivi" && (
                <PreventiviTab clienteId={cliente.id} navigate={navigate} />
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Toast */}
      {toast && (
        <div className={`fixed bottom-4 right-4 px-4 py-2 rounded-lg shadow-lg text-sm font-medium z-50 ${
          toast.type === "error" ? "bg-red-600 text-white" : "bg-emerald-600 text-white"
        }`} onClick={() => setToast(null)}>
          {toast.message}
        </div>
      )}
    </>
  );
}


// ── Tab Preventivi dentro scheda cliente ──
function PreventiviTab({ clienteId, navigate }) {
  const [preventivi, setPreventivi] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch(`${API_BASE}/preventivi?cliente_id=${clienteId}&limit=50`)
      .then((r) => r.json())
      .then((data) => setPreventivi(data.items || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [clienteId]);

  const STATI_COLORI = {
    bozza: "bg-neutral-100 text-neutral-600", inviato: "bg-blue-100 text-blue-700",
    in_attesa: "bg-amber-100 text-amber-700", confermato: "bg-emerald-100 text-emerald-700",
    prenotato: "bg-indigo-100 text-indigo-700", rifiutato: "bg-red-100 text-red-600",
    scaduto: "bg-orange-100 text-orange-700",
  };
  const STATI_LABEL = {
    bozza: "Bozza", inviato: "Inviato", in_attesa: "In attesa", confermato: "Confermato",
    prenotato: "Prenotato", completato: "Completato", fatturato: "Fatturato",
    rifiutato: "Rifiutato", scaduto: "Scaduto",
  };

  if (loading) return <div className="py-8 text-center text-neutral-400 text-sm">Caricamento...</div>;

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm text-neutral-500">{preventivi.length} preventiv{preventivi.length === 1 ? "o" : "i"}</span>
        <Btn variant="chip" tone="violet" size="sm" onClick={() => navigate("/clienti/preventivi/nuovo")}>
          + Nuovo preventivo
        </Btn>
      </div>
      {!preventivi.length ? (
        <p className="text-sm text-neutral-400 text-center py-8">Nessun preventivo per questo cliente</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-neutral-50 text-[10px] font-semibold text-neutral-500 uppercase">
              <tr>
                <th className="px-2 py-2 text-left">Numero</th>
                <th className="px-2 py-2 text-left">Titolo</th>
                <th className="px-2 py-2 text-left">Data</th>
                <th className="px-2 py-2 text-center">Pax</th>
                <th className="px-2 py-2 text-right">Totale</th>
                <th className="px-2 py-2 text-left">Stato</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {preventivi.map((p) => (
                <tr key={p.id} className="hover:bg-indigo-50 cursor-pointer transition"
                  onClick={() => navigate(`/clienti/preventivi/${p.id}`)}>
                  <td className="px-2 py-1.5 font-mono text-neutral-500">{p.numero}</td>
                  <td className="px-2 py-1.5 font-medium text-neutral-800 max-w-[180px] truncate">{p.titolo}</td>
                  <td className="px-2 py-1.5 text-neutral-600">{p.data_evento || "—"}</td>
                  <td className="px-2 py-1.5 text-center">{p.n_persone || "—"}</td>
                  <td className="px-2 py-1.5 text-right font-medium">
                    {p.totale_calcolato ? `€${p.totale_calcolato.toFixed(2)}` : "—"}
                  </td>
                  <td className="px-2 py-1.5">
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${STATI_COLORI[p.stato] || "bg-neutral-100"}`}>
                      {STATI_LABEL[p.stato] || p.stato}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
