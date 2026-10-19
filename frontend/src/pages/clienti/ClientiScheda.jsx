// @version: v3.0 — redesign bozzetto A (2026-10-19): fascia verde petrolio, azioni Chiama/WhatsApp/Prenota, «Da sapere in sala», linea del tempo delle visite con i conti, linguette Visite/Note/Preventivi/Altro · v2.4 — tab «Cosa ha mangiato» (conti di cassa, 2026-10-18); v2.3-recensioni — tab Recensioni TheFork; v2.2-mattoni — M.I primitives (Btn) su CTA scheda (Salva/Modifica/Merge/Aggiungi/Nuovo preventivo)
// Scheda dettaglio cliente — embedded mode + merge manuale con ricerca
import React, { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { API_BASE, apiFetch } from "../../config/api";
import RecensioneCard from "../prenotazioni/components/RecensioneCard";
import ClientiNav from "./ClientiNav";
import Tooltip from "../../components/Tooltip";
import { Btn } from "../../components/ui";
import PrenotazioniForm from "../prenotazioni/PrenotazioniForm";
import { openWhatsApp } from "../../utils/whatsapp";

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
  const [tab, setTab] = useState("visite"); // visite | note | preventivi | altro (redesign 2026-10-19)
  const [consumi, setConsumi] = useState(null);   // conti di cassa (GET /clienti/{id}/consumi)
  const [showPrenota, setShowPrenota] = useState(false);

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
    setTab("visite");
    setConsumi(null);
    apiFetch(`${API_BASE}/clienti/${id}/consumi`)
      .then((r) => (r.ok ? r.json() : null))
      .then(setConsumi)
      .catch(() => setConsumi(null));
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

  // ── Dati derivati (redesign 2026-10-19, bozzetto A) ──
  const stats = cliente.prenotazioni_stats || {};
  const oggi = (() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; })();
  const STATI_FATTI = ["SEATED", "ARRIVED", "BILL", "LEFT", "PARTIALLY_ARRIVED"];
  const prenotazioni = cliente.prenotazioni || [];
  const prossime = prenotazioni
    .filter((p) => p.data_pasto >= oggi && ["RECORDED", "REQUESTED", "ARRIVED", "SEATED"].includes(p.stato))
    .sort((a, b) => `${a.data_pasto}${a.ora_pasto || ""}`.localeCompare(`${b.data_pasto}${b.ora_pasto || ""}`));
  const nomeCompleto = `${cliente.nome || ""}${cliente.nome2 ? ` & ${cliente.nome2}` : ""} ${cliente.cognome2 && cliente.cognome2 !== cliente.cognome ? `${cliente.cognome} / ${cliente.cognome2}` : (cliente.cognome || "")}`.trim();
  const iniziali = ((cliente.nome || "").trim()[0] || "") + ((cliente.cognome || "").trim()[0] || "") || "?";
  const annoDal = (stats.prima_visita || cliente.thefork_created || "").slice(0, 4);
  const allergie = [cliente.allergie, cliente.restrizioni_dietetiche].filter((x) => x && String(x).trim()).join(" · ");
  const preferenze = [cliente.pref_cibo, cliente.pref_bevande, cliente.pref_posto].filter((x) => x && String(x).trim()).join(" · ");
  const ultimaNota = cliente.note?.[0];
  const piatti = (consumi?.piatti_preferiti || []).slice(0, 3);
  const bere = (consumi?.da_bere || [])[0];

  // Storia: prenotazioni passate + conti di cassa (collegati per prenotazione_id)
  const contiPerPren = {};
  const contiSoli = [];
  (consumi?.conti || []).forEach((c) => { if (c.prenotazione_id) contiPerPren[c.prenotazione_id] = c; else contiSoli.push(c); });
  const storia = [
    ...prenotazioni.filter((p) => !prossime.includes(p)).map((p) => ({
      key: `p${p.id}`, data: p.data_pasto, ora: (p.ora_pasto || "").slice(0, 5), turno: p.turno,
      tavolo: p.tavolo, pax: p.pax, stato: p.stato, nota: p.nota_ristorante || p.nota_cliente, conto: contiPerPren[p.id],
    })),
    ...contiSoli.map((c) => ({
      key: `c${c.id}`, data: c.data_rif, ora: (c.aperto_at || "").slice(11, 16), turno: c.turno,
      tavolo: c.tavolo, pax: c.coperti, stato: "SEATED", conto: c,
    })),
  ].sort((a, b) => `${b.data}${b.ora}`.localeCompare(`${a.data}${a.ora}`));

  const TABS = [
    { key: "visite", label: "Visite" },
    { key: "note", label: `Note${cliente.note?.length ? ` (${cliente.note.length})` : ""}` },
    { key: "preventivi", label: "Preventivi" },
    { key: "altro", label: "Altro" },
  ];
  const RANK_CHIP = {
    Gold: "bg-yellow-200 text-yellow-900", Silver: "bg-neutral-200 text-neutral-700",
    Bronze: "bg-orange-200 text-orange-900", Caution: "bg-red-200 text-red-900",
  };

  return (
    <>
      {!embedded && <ClientiNav current="lista" />}
      <div className={`${embedded ? "" : "min-h-screen bg-brand-cream"} font-sans`}>
        <div className={embedded ? "" : "max-w-3xl mx-auto sm:p-6"}>

          {/* ── TESTATA: fascia verde petrolio ── */}
          <div className={`bg-teal-800 text-white px-4 pt-2 pb-8 ${embedded ? "rounded-2xl" : "sm:rounded-2xl"}`}>
            <div className="flex items-center justify-between">
              <button type="button" onClick={handleBack}
                className="min-h-[44px] flex items-center gap-1 text-[15px] font-semibold text-white/95 hover:text-white">
                <span aria-hidden="true" className="text-xl leading-none">‹</span> Clienti
              </button>
              <div className="flex gap-2">
                {editMode ? (
                  <>
                    <button type="button" onClick={() => { setEditMode(false); setForm(cliente); }}
                      className="min-h-[44px] px-3 text-[15px] font-semibold text-white/90">Annulla</button>
                    <button type="button" onClick={handleSave} disabled={saving}
                      className="min-h-[44px] px-4 rounded-xl bg-white text-teal-800 text-[15px] font-bold disabled:opacity-60">
                      {saving ? "Salvo…" : "Salva"}
                    </button>
                  </>
                ) : (
                  <button type="button" onClick={() => { setEditMode(true); setTab("altro"); }}
                    className="min-h-[44px] px-3 text-[15px] font-semibold text-white/95 hover:text-white">Modifica</button>
                )}
              </div>
            </div>

            <div className="flex items-center gap-4 mt-2">
              <div aria-hidden="true"
                className={`w-16 h-16 rounded-full flex-shrink-0 flex items-center justify-center font-playfair text-2xl font-bold ${cliente.rank === "Gold" ? "bg-yellow-200 text-yellow-900" : "bg-white/15 text-white"}`}>
                {iniziali.toUpperCase()}
              </div>
              <div className="min-w-0">
                <h1 className="font-playfair text-[28px] leading-tight font-bold break-words">
                  {cliente.vip ? "★ " : ""}{nomeCompleto || "Senza nome"}
                </h1>
                <div className="flex flex-wrap items-center gap-1.5 mt-1.5 text-[13px]">
                  {cliente.rank && <span className={`px-2 py-0.5 rounded-full font-bold ${RANK_CHIP[cliente.rank] || "bg-white/15"}`}>{cliente.rank}</span>}
                  {(cliente.tags || []).slice(0, 2).map((t) => (
                    <span key={t.id} className="px-2 py-0.5 rounded-full bg-white/15">{t.nome}</span>
                  ))}
                  {annoDal && <span className="text-teal-100">dal {annoDal}</span>}
                  {cliente.protetto === 1 && (
                    <Tooltip label="Protetto da import TheFork"><span className="text-teal-100" aria-label="Protetto da import TheFork">🛡</span></Tooltip>
                  )}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2 mt-4">
              <div>
                <div className="text-2xl font-bold">{stats.completate || 0}</div>
                <div className="text-xs text-teal-100">visite</div>
              </div>
              <div>
                <div className="text-2xl font-bold">{consumi?.spesa_media_visita != null ? `${Math.round(consumi.spesa_media_visita)} €` : "—"}</div>
                <div className="text-xs text-teal-100">a visita{consumi?.spesa_media_coperto ? ` · ${Math.round(consumi.spesa_media_coperto)} € a cop.` : ""}</div>
              </div>
              <div>
                <div className="text-2xl font-bold">{stats.ultima_visita ? dataBreve(stats.ultima_visita) : "—"}</div>
                <div className="text-xs text-teal-100">ultima volta</div>
              </div>
            </div>
          </div>

          {/* ── AZIONI: sospese sul bordo della fascia ── */}
          <div className="grid grid-cols-3 gap-2 -mt-5 px-4 relative">
            {cliente.telefono ? (
              <a href={`tel:${cliente.telefono}`}
                className="min-h-[52px] rounded-2xl bg-white shadow-md text-teal-800 font-bold text-[15px] flex items-center justify-center">Chiama</a>
            ) : (
              <span className="min-h-[52px] rounded-2xl bg-white/80 shadow text-neutral-400 font-bold text-[15px] flex items-center justify-center">Chiama</span>
            )}
            <button type="button" disabled={!cliente.telefono} onClick={() => openWhatsApp(cliente.telefono)}
              className="min-h-[52px] rounded-2xl bg-white shadow-md text-teal-800 font-bold text-[15px] disabled:text-neutral-400">WhatsApp</button>
            <button type="button" onClick={() => setShowPrenota(true)}
              className="min-h-[52px] rounded-2xl bg-white shadow-md text-teal-800 font-bold text-[15px]">Prenota</button>
          </div>

          {/* ── DA SAPERE IN SALA ── */}
          <div className="px-4 pt-5 space-y-2.5">
            <div className="text-xs font-bold tracking-wider uppercase text-neutral-500">Da sapere in sala</div>
            <div className="grid grid-cols-2 gap-2">
              <div className={`rounded-xl px-3 py-2.5 ${allergie ? "bg-red-50 border border-red-200" : "bg-emerald-50"}`}>
                <div className={`text-xs font-bold ${allergie ? "text-red-800" : "text-emerald-800"}`}>Allergie</div>
                <div className={`text-[15px] mt-0.5 ${allergie ? "text-red-900 font-semibold" : "text-neutral-800"}`}>{allergie || "Nessuna segnalata"}</div>
              </div>
              <div className="rounded-xl px-3 py-2.5 bg-white border border-neutral-200">
                <div className="text-xs font-bold text-neutral-500">In arrivo</div>
                <div className="text-[15px] mt-0.5 text-neutral-800">
                  {prossime[0]
                    ? `${dataBreve(prossime[0].data_pasto, true)} · ${(prossime[0].ora_pasto || "").slice(0, 5)} · ${prossime[0].pax}p`
                    : "Nessuna prenotazione"}
                </div>
              </div>
            </div>
            {(piatti.length > 0 || bere) && (
              <div className="rounded-xl p-3 bg-white border border-neutral-200">
                <div className="text-xs font-bold text-neutral-500 mb-2">Prende di solito</div>
                <div className="flex flex-wrap gap-1.5">
                  {piatti.map((p) => (
                    <span key={p.nome} className="px-2.5 py-1 rounded-full bg-neutral-100 text-sm">{p.nome} <b>{p.volte}</b></span>
                  ))}
                  {bere && <span className="px-2.5 py-1 rounded-full bg-neutral-100 text-sm">{bere.nome}</span>}
                </div>
              </div>
            )}
            {(preferenze || ultimaNota) && (
              <div className="rounded-xl p-3 bg-white border border-neutral-200 space-y-1 text-[15px]">
                {preferenze && <div><span className="text-xs font-bold text-neutral-500 mr-2">Preferenze</span>{preferenze}</div>}
                {ultimaNota && <div><span className="text-xs font-bold text-neutral-500 mr-2">Ultima nota</span>{ultimaNota.testo} <span className="text-neutral-400 text-xs">· {ultimaNota.data}</span></div>}
              </div>
            )}
          </div>

          {/* ── LINGUETTE ── */}
          <div role="tablist" aria-label="Sezioni della scheda" className="mx-4 mt-5 flex gap-6 border-b border-neutral-200 overflow-x-auto">
            {TABS.map((t) => (
              <button key={t.key} type="button" role="tab" aria-selected={tab === t.key} onClick={() => setTab(t.key)}
                className={`min-h-[44px] whitespace-nowrap text-[15px] border-b-[3px] -mb-px ${tab === t.key ? "border-teal-700 font-bold text-neutral-900" : "border-transparent font-semibold text-neutral-500 hover:text-neutral-800"}`}>
                {t.label}
              </button>
            ))}
          </div>

          <div className="px-4 py-4">

            {/* VISITE: linea del tempo (prenotazione + conto insieme) */}
            {tab === "visite" && (
              <div>
                {prossime.length > 1 && (
                  <div className="mb-4 text-sm text-neutral-600">
                    Altre prenotazioni in arrivo: {prossime.slice(1).map((p) => `${dataBreve(p.data_pasto, true)} ${(p.ora_pasto || "").slice(0, 5)}`).join(" · ")}
                  </div>
                )}
                {storia.length === 0 && <p className="text-sm text-neutral-400 py-6 text-center">Nessuna visita registrata.</p>}
                {storia.map((v) => {
                  const fatta = STATI_FATTI.includes(v.stato);
                  const etichetta = v.stato === "NO_SHOW" ? "no-show" : v.stato === "CANCELED" ? "annullata" : v.stato === "REFUSED" ? "rifiutata" : null;
                  return (
                    <div key={v.key} className="flex gap-3">
                      <div className="w-3.5 flex flex-col items-center">
                        <div className={`w-3 h-3 rounded-full mt-1.5 ${fatta ? "bg-teal-700" : v.stato === "NO_SHOW" ? "bg-amber-500" : "bg-neutral-300"}`} />
                        <div className="flex-1 w-0.5 bg-neutral-200" />
                      </div>
                      <div className={`flex-1 min-w-0 pb-4 ${fatta ? "" : "opacity-70"}`}>
                        <div className="flex justify-between items-baseline gap-2">
                          <span className="text-[15px] font-bold">{dataLunga(v.data)}{v.turno ? ` · ${v.turno}` : ""}</span>
                          {v.conto && <span className="text-base font-bold">{euro(v.conto.totale)}</span>}
                        </div>
                        <div className="text-[13px] text-neutral-500">
                          {[v.ora, v.tavolo ? `tavolo ${v.tavolo}` : null, v.pax ? `${v.pax} persone` : null, v.conto?.durata_min ? `${v.conto.durata_min} min` : null].filter(Boolean).join(" · ")}
                          {etichetta && <span className="ml-1 font-semibold text-amber-700">· {etichetta}</span>}
                        </div>
                        {v.conto?.righe?.length > 0 && (
                          <div className="text-sm leading-snug text-neutral-800 mt-1">
                            {v.conto.righe.filter((r) => r.nome && r.nome !== "no_name").map((r) => (r.quantita > 1 ? `${r.nome} ×${r.quantita}` : r.nome)).join(" · ")}
                          </div>
                        )}
                        {v.nota && <div className="text-sm text-neutral-500 mt-0.5 italic">{v.nota}</div>}
                        {v.conto?.abbinamento === "proposto" && (
                          <span className="inline-block mt-1 px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 text-xs font-semibold">conto da confermare</span>
                        )}
                      </div>
                    </div>
                  );
                })}
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

            {/* PREVENTIVI */}
            {tab === "preventivi" && <PreventiviTab clienteId={cliente.id} navigate={navigate} />}

            {/* ALTRO: anagrafica, preferenze, etichette, recensioni, unione doppioni */}
            {tab === "altro" && (
              <div className="space-y-6">
                <section>
                  <h2 className="text-xs font-bold tracking-wider uppercase text-neutral-500 mb-3">Anagrafica</h2>
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
                </section>
                <section>
                  <h2 className="text-xs font-bold tracking-wider uppercase text-neutral-500 mb-3">Preferenze e allergie</h2>
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
                </section>
                <section>
                  <h2 className="text-xs font-bold tracking-wider uppercase text-neutral-500 mb-3">Etichette</h2>
                  <div className="flex flex-wrap gap-2">
                    {allTags.map((tag) => {
                      const active = cliente.tags?.some((t) => t.id === tag.id);
                      return (
                        <button key={tag.id} type="button" onClick={() => toggleTag(tag.id)} aria-pressed={active}
                          className={`min-h-[40px] px-3 rounded-full border text-sm font-medium transition ${active ? "border-teal-600 bg-teal-50 text-teal-800" : "border-neutral-300 bg-white text-neutral-500 hover:border-teal-400"}`}>
                          {active ? "✓ " : ""}{tag.nome}
                        </button>
                      );
                    })}
                  </div>
                </section>
                <section>
                  <h2 className="text-xs font-bold tracking-wider uppercase text-neutral-500 mb-3">Spesa e piatti</h2>
                  <ConsumiTab clienteId={cliente.id} />
                </section>
                <section>
                  <h2 className="text-xs font-bold tracking-wider uppercase text-neutral-500 mb-3">Recensioni TheFork</h2>
                  <RecensioniTab clienteId={cliente.id} />
                </section>
                <section>
                  <h2 className="text-xs font-bold tracking-wider uppercase text-neutral-500 mb-3">Doppioni</h2>
                  {!showMerge && (
                    <Btn variant="secondary" size="md" onClick={() => setShowMerge(true)}>Unisci con un altro cliente…</Btn>
                  )}
                  {showMerge && (
                    <button type="button" onClick={() => { setShowMerge(false); setMergeTarget(null); setMergeQuery(""); setMergeResults([]); }}
                      className="min-h-[40px] text-sm font-semibold text-neutral-500 hover:text-neutral-800">Chiudi</button>
                  )}
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
                </section>
              </div>
            )}
          </div>
        </div>
      </div>

      {showPrenota && (
        <PrenotazioniForm
          defaultCliente={cliente}
          onClose={() => setShowPrenota(false)}
          onSuccess={() => { setShowPrenota(false); showToast("Prenotazione creata"); fetchCliente(); }}
        />
      )}

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

// ── Formati data/euro della scheda ──
const _MESI = ["gen", "feb", "mar", "apr", "mag", "giu", "lug", "ago", "set", "ott", "nov", "dic"];
const _GIORNI = ["dom", "lun", "mar", "mer", "gio", "ven", "sab"];
function dataBreve(iso, conGiorno = false) {
  if (!iso) return "—";
  const d = new Date(iso.slice(0, 10) + "T12:00:00");
  const base = `${d.getDate()} ${_MESI[d.getMonth()]}`;
  const anno = d.getFullYear() !== new Date().getFullYear() ? ` ${d.getFullYear()}` : "";
  return `${conGiorno ? _GIORNI[d.getDay()] + " " : ""}${base}${anno}`;
}
function dataLunga(iso) {
  if (!iso) return "—";
  const d = new Date(iso.slice(0, 10) + "T12:00:00");
  const s = d.toLocaleDateString("it-IT", { weekday: "short", day: "numeric", month: "long", year: d.getFullYear() !== new Date().getFullYear() ? "numeric" : undefined });
  return s.charAt(0).toUpperCase() + s.slice(1);
}
function euro(n) {
  return n == null ? "—" : `${Math.round(n * 100) / 100 % 1 ? n.toFixed(2).replace(".", ",") : Math.round(n)} €`;
}

// ── Tab Recensioni TheFork dentro scheda cliente (mig 197) ──
// ── Tab «Cosa ha mangiato»: conti di cassa abbinati al cliente (2026-10-18) ──
// Dati: GET /clienti/{id}/consumi (servizio platform abbinamento_conti_service).
const _euro = (n) => (n == null ? "—" : n.toLocaleString("it-IT", { style: "currency", currency: "EUR" }));
const _data = (d) => (d ? new Date(d + "T12:00:00").toLocaleDateString("it-IT", { day: "numeric", month: "short", year: "numeric" }) : "—");

function ConsumiTab({ clienteId }) {
  const [d, setD] = useState(null);
  const [aperto, setAperto] = useState(null);
  useEffect(() => {
    apiFetch(`${API_BASE}/clienti/${clienteId}/consumi`)
      .then((r) => (r.ok ? r.json() : null))
      .then(setD)
      .catch(() => setD({ visite: 0, conti: [] }));
  }, [clienteId]);
  if (d === null) return <div className="text-sm text-neutral-400 py-4">Caricamento…</div>;
  if (!d.visite) {
    return (
      <div className="text-sm text-neutral-400 py-4">
        Nessun conto di cassa collegato a questo cliente. I conti si collegano alla Chiusura turno
        (card «🧾 Conti del servizio») o da Vendite › Impostazioni › iPratico Cloud.
      </div>
    );
  }
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          ["Visite con conto", d.visite],
          ["Spesa totale", _euro(d.spesa_totale)],
          ["Media a visita", _euro(d.spesa_media_visita)],
          ["Media a coperto", _euro(d.spesa_media_coperto)],
        ].map(([l, v]) => (
          <div key={l} className="rounded-xl border border-neutral-200 bg-white p-3">
            <div className="text-[11px] uppercase text-neutral-400 font-semibold">{l}</div>
            <div className="text-lg font-bold text-neutral-800">{v}</div>
          </div>
        ))}
      </div>
      <div className="text-xs text-neutral-500">Dal {_data(d.prima)} al {_data(d.ultima)}</div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <div className="text-xs font-semibold text-neutral-500 uppercase mb-1">🍽️ Piatti che prende</div>
          <ul className="text-sm space-y-0.5">
            {d.piatti_preferiti.map((p) => (
              <li key={p.nome} className="flex gap-2">
                <span className="flex-1">{p.nome}<span className="text-neutral-400"> · {p.categoria || "—"}</span></span>
                <span className="text-neutral-600">{p.volte}×</span>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <div className="text-xs font-semibold text-neutral-500 uppercase mb-1">🍷 Da bere</div>
          <ul className="text-sm space-y-0.5">
            {d.da_bere.map((p) => (
              <li key={p.nome} className="flex gap-2">
                <span className="flex-1">{p.nome}<span className="text-neutral-400"> · {p.volte}×</span></span>
                <span className="text-neutral-600">{_euro(p.spesa)}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div>
        <div className="text-xs font-semibold text-neutral-500 uppercase mb-1">Visite</div>
        <div className="divide-y divide-neutral-100 border border-neutral-200 rounded-xl bg-white">
          {d.conti.map((c) => (
            <div key={c.id}>
              <button type="button" onClick={() => setAperto(aperto === c.id ? null : c.id)}
                className="w-full text-left px-3 py-2.5 min-h-[44px] flex flex-wrap items-center gap-x-4 gap-y-1 hover:bg-neutral-50">
                <span className="w-28 font-medium">{_data(c.data_rif)}</span>
                <span className="w-16 text-neutral-500">{c.turno || ""}</span>
                <span className="w-24">{c.tavolo || "—"}</span>
                <span className="w-16 text-neutral-600">{c.coperti ? `${c.coperti} cop.` : ""}</span>
                <span className="w-20 font-semibold">{_euro(c.totale)}</span>
                {c.abbinamento === "proposto" && <span className="text-xs text-amber-700">da confermare</span>}
              </button>
              {aperto === c.id && (
                <ul className="px-3 pb-3 pl-8 text-sm text-neutral-700 space-y-0.5">
                  {c.righe.map((r, i) => (
                    <li key={i} className="flex gap-3">
                      <span className="w-10 text-right">{r.quantita}×</span>
                      <span className="flex-1">{r.nome === "no_name" ? <span className="text-neutral-400">voce senza nome</span> : r.nome}</span>
                      <span className="w-20 text-right text-neutral-500">{_euro(r.totale)}</span>
                    </li>
                  ))}
                  {c.romana ? <li className="text-neutral-400 text-xs">pagato alla romana</li> : null}
                </ul>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function RecensioniTab({ clienteId }) {
  const [lista, setLista] = useState(null);
  const role = localStorage.getItem("role");
  const admin = role === "admin" || role === "superadmin";
  useEffect(() => {
    apiFetch(`${API_BASE}/prenotazioni/recensioni/?cliente_id=${clienteId}&limite=50`)
      .then((r) => (r.ok ? r.json() : { recensioni: [] }))
      .then((d) => setLista(d.recensioni || []))
      .catch(() => setLista([]));
  }, [clienteId]);
  if (lista === null) return <div className="text-sm text-neutral-400 py-4">Caricamento…</div>;
  if (!lista.length) return <div className="text-sm text-neutral-400 py-4">Nessuna recensione TheFork di questo cliente.</div>;
  return (
    <div className="space-y-3">
      {lista.map((r) => (
        <RecensioneCard key={r.review_uuid} r={r} compatta puoRispondere={admin}
          onAggiornata={(n) => setLista((l) => l.map((x) => (x.review_uuid === n.review_uuid ? { ...x, ...n } : x)))} />
      ))}
    </div>
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
