// @version: v3.3 — linguette subito sotto i bottoni: Anagrafica (con «Da sapere in sala»), Visite, Acquisti, Preventivi, Note · v3.2 — linguetta Altro uniformata: card come «Da sapere in sala», campi con la stessa etichetta, indirizzo su una riga, etichette a pillola · v3.1 — scontrino delle visite diviso in Mangiato/Bevuto per tipo, «Prende di solito» per tipo (2026-10-19) · v3.0 — redesign bozzetto A (2026-10-19): fascia verde petrolio, azioni Chiama/WhatsApp/Prenota, «Da sapere in sala», linea del tempo delle visite con i conti, linguette Visite/Note/Preventivi/Altro · v2.4 — tab «Cosa ha mangiato» (conti di cassa, 2026-10-18); v2.3-recensioni — tab Recensioni TheFork; v2.2-mattoni — M.I primitives (Btn) su CTA scheda (Salva/Modifica/Merge/Aggiungi/Nuovo preventivo)
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

const LINGUE = { it_IT: "Italiano", en_GB: "Inglese", en_US: "Inglese", de_DE: "Tedesco", fr_FR: "Francese", es_ES: "Spagnolo", nl_NL: "Olandese", pt_PT: "Portoghese" };
const PAESI = { Italy: "Italia", Germany: "Germania", France: "Francia", Spain: "Spagna", Switzerland: "Svizzera", "United Kingdom": "Regno Unito", "United States": "Stati Uniti", Netherlands: "Paesi Bassi", Austria: "Austria", Belgium: "Belgio", Norway: "Norvegia" };

// Campi della scheda: stessa etichetta delle card «Da sapere in sala» (piccola, in grassetto, non maiuscola)
const ETICHETTA = "block text-xs font-bold text-neutral-500 mb-1";
const CAMPO = "w-full min-h-[44px] border border-neutral-300 rounded-xl px-3 py-2 text-base bg-white focus:outline-none focus:ring-2 focus:ring-teal-300";

function Field({ label, value, className = "" }) {
  const vuoto = value == null || String(value).trim() === "";
  return (
    <div className={`min-w-0 ${className}`}>
      <div className={ETICHETTA}>{label}</div>
      <div className={`text-[15px] break-words ${vuoto ? "text-neutral-300" : "text-neutral-900"}`}>{vuoto ? "—" : value}</div>
    </div>
  );
}

function Input({ label, name, value, onChange, type = "text", className = "" }) {
  return (
    <div className={`min-w-0 ${className}`}>
      <label className={ETICHETTA}>{label}</label>
      <input type={type} name={name} value={value ?? ""} onChange={onChange} className={CAMPO} />
    </div>
  );
}

function TextArea({ label, name, value, onChange, rows = 2, className = "" }) {
  return (
    <div className={`min-w-0 ${className}`}>
      <label className={ETICHETTA}>{label}</label>
      <textarea name={name} value={value ?? ""} onChange={onChange} rows={rows} className={CAMPO} />
    </div>
  );
}

// Una sezione della linguetta Altro: card bianca con titolo come «Da sapere in sala»
function Sezione({ titolo, azione, children }) {
  return (
    <section className="rounded-2xl bg-white border border-neutral-200 p-4">
      <div className="flex items-center justify-between gap-2 mb-3">
        <div className="text-xs font-bold tracking-wider uppercase text-neutral-500">{titolo}</div>
        {azione}
      </div>
      {children}
    </section>
  );
}

// Pillola uguale a quelle della lista clienti
function Pillola({ children, tono = "neutro" }) {
  const t = {
    neutro: "bg-neutral-100 text-neutral-700 border-neutral-200",
    teal: "bg-teal-50 text-teal-800 border-teal-200",
    oro: "bg-yellow-100 text-yellow-900 border-yellow-300",
    rosso: "bg-red-100 text-red-700 border-red-300",
  }[tono];
  return <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full border text-xs font-semibold ${t}`}>{children}</span>;
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
  const [tab, setTab] = useState("anagrafica"); // anagrafica | visite | acquisti | preventivi | note (redesign 2026-10-19)
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
    setTab("anagrafica");
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
  const GRIGLIA = `grid gap-x-4 gap-y-4 ${embedded ? "grid-cols-2" : "grid-cols-2 md:grid-cols-3"}`;
  const nomeCompleto = `${cliente.nome || ""}${cliente.nome2 ? ` & ${cliente.nome2}` : ""} ${cliente.cognome2 && cliente.cognome2 !== cliente.cognome ? `${cliente.cognome} / ${cliente.cognome2}` : (cliente.cognome || "")}`.trim();
  const iniziali = ((cliente.nome || "").trim()[0] || "") + ((cliente.cognome || "").trim()[0] || "") || "?";
  const annoDal = (stats.prima_visita || cliente.thefork_created || "").slice(0, 4);
  const allergie = [cliente.allergie, cliente.restrizioni_dietetiche].filter((x) => x && String(x).trim()).join(" · ");
  const preferenze = [cliente.pref_cibo, cliente.pref_bevande, cliente.pref_posto].filter((x) => x && String(x).trim()).join(" · ");
  const ultimaNota = cliente.note?.[0];

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
    { key: "anagrafica", label: "Anagrafica" },
    { key: "visite", label: "Visite" },
    { key: "acquisti", label: "Acquisti" },
    { key: "preventivi", label: "Preventivi" },
    { key: "note", label: `Note${cliente.note?.length ? ` (${cliente.note.length})` : ""}` },
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
                  <button type="button" onClick={() => { setEditMode(true); setTab("anagrafica"); }}
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

          {/* ── LINGUETTE ── */}
          <div role="tablist" aria-label="Sezioni della scheda" className="mx-4 mt-4 flex gap-6 border-b border-neutral-200 overflow-x-auto">
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
                        {v.conto?.righe?.length > 0 && <Scontrino conto={v.conto} dueColonne={!embedded} />}
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
                  <div className="mt-6">
                    <Sezione titolo="Recensioni TheFork">
                      <RecensioniTab clienteId={cliente.id} />
                    </Sezione>
                  </div>
                </div>
              )}

            {/* ACQUISTI: cosa prende e quanto spende (conti di cassa iPratico) */}
            {tab === "acquisti" && (
              <div className="space-y-3">
                <PrendeDiSolito consumi={consumi} dueColonne={!embedded} />
                <Sezione titolo="Spesa e piatti">
                  <ConsumiTab clienteId={cliente.id} />
                </Sezione>
              </div>
            )}

            {/* PREVENTIVI */}
            {tab === "preventivi" && <PreventiviTab clienteId={cliente.id} navigate={navigate} />}

            {/* ANAGRAFICA: da sapere in sala, dati, preferenze, etichette, unione doppioni */}
            {tab === "anagrafica" && (
              <div className="space-y-3">
              {/* ── DA SAPERE IN SALA ── */}
              <div className="space-y-2.5">
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
                {(preferenze || ultimaNota) && (
                  <div className="rounded-xl p-3 bg-white border border-neutral-200 space-y-1 text-[15px]">
                    {preferenze && <div><span className="text-xs font-bold text-neutral-500 mr-2">Preferenze</span>{preferenze}</div>}
                    {ultimaNota && <div><span className="text-xs font-bold text-neutral-500 mr-2">Ultima nota</span>{ultimaNota.testo} <span className="text-neutral-400 text-xs">· {ultimaNota.data}</span></div>}
                  </div>
                )}
              </div>
                <Sezione titolo="Anagrafica">
                  {editMode ? (
                    <div className="space-y-4">
                      <div className={GRIGLIA}>
                        <Input label="Nome" name="nome" value={form.nome} onChange={onChange} />
                        <Input label="Cognome" name="cognome" value={form.cognome} onChange={onChange} />
                        <Input label="Titolo" name="titolo" value={form.titolo} onChange={onChange} />
                        <Input label="Nome 2 (coppia)" name="nome2" value={form.nome2} onChange={onChange} />
                        <Input label="Cognome 2 (coppia)" name="cognome2" value={form.cognome2} onChange={onChange} />
                        <Input label="Data di nascita" name="data_nascita" value={form.data_nascita} onChange={onChange} />
                      </div>
                      <div className={GRIGLIA}>
                        <Input label="Telefono" name="telefono" value={form.telefono} onChange={onChange} type="tel" />
                        <Input label="Telefono 2" name="telefono2" value={form.telefono2} onChange={onChange} type="tel" />
                        <Input label="Email" name="email" value={form.email} onChange={onChange} type="email" />
                        <Input label="Lingua" name="lingua" value={form.lingua} onChange={onChange} />
                      </div>
                      <div className={GRIGLIA}>
                        <Input label="Indirizzo" name="indirizzo" value={form.indirizzo} onChange={onChange} className="col-span-2" />
                        <Input label="CAP" name="cap" value={form.cap} onChange={onChange} />
                        <Input label="Città" name="citta" value={form.citta} onChange={onChange} />
                        <Input label="Paese" name="paese" value={form.paese} onChange={onChange} />
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {[["vip", "VIP"], ["newsletter", "Newsletter"], ["attivo", "Attivo"]].map(([k, label]) => (
                          <label key={k} className={`inline-flex items-center gap-2 min-h-[40px] px-3 rounded-full border text-sm font-semibold cursor-pointer ${form[k] ? "bg-teal-700 border-teal-700 text-white" : "bg-white border-neutral-300 text-neutral-600"}`}>
                            <input type="checkbox" checked={!!form[k]} className="sr-only"
                              onChange={(e) => setForm((prev) => ({ ...prev, [k]: e.target.checked }))} />
                            {form[k] ? "✓ " : ""}{label}
                          </label>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <div className={GRIGLIA}>
                        <Field label="Nome" value={cliente.nome} />
                        <Field label="Cognome" value={cliente.cognome} />
                        <Field label="Titolo" value={cliente.titolo} />
                        {(cliente.nome2 || cliente.cognome2) && <Field label="Nome 2 (coppia)" value={cliente.nome2} />}
                        {(cliente.nome2 || cliente.cognome2) && <Field label="Cognome 2 (coppia)" value={cliente.cognome2} />}
                        <Field label="Data di nascita" value={cliente.data_nascita ? dataLunga(cliente.data_nascita) : ""} />
                      </div>
                      <div className={`${GRIGLIA} border-t border-neutral-100 pt-4`}>
                        <Field label="Telefono" value={cliente.telefono} />
                        <Field label="Telefono 2" value={cliente.telefono2} />
                        <Field label="Email" value={cliente.email} />
                        <Field label="Lingua" value={LINGUE[cliente.lingua] || cliente.lingua} />
                      </div>
                      <div className={`${GRIGLIA} border-t border-neutral-100 pt-4`}>
                        <Field label="Indirizzo" className="col-span-2"
                          value={[cliente.indirizzo, [cliente.cap, cliente.citta].filter(Boolean).join(" ")].filter((x) => x && x.trim()).join(", ")} />
                        <Field label="Paese" value={PAESI[cliente.paese] || cliente.paese} />
                      </div>
                      <div className="flex flex-wrap gap-1.5 border-t border-neutral-100 pt-4">
                        {cliente.vip ? <Pillola tono="oro">VIP</Pillola> : null}
                        {cliente.newsletter ? <Pillola tono="teal">Newsletter</Pillola> : null}
                        {cliente.attivo ? <Pillola tono="teal">Attivo</Pillola> : <Pillola tono="rosso">Inattivo</Pillola>}
                      </div>
                    </div>
                  )}
                  <div className="mt-4 text-xs text-neutral-400">
                    {[cliente.origine === "thefork" ? "Da TheFork" : cliente.origine ? `Origine: ${cliente.origine}` : null,
                      cliente.thefork_created ? `creato ${dataLunga(cliente.thefork_created)}` : null,
                      cliente.updated_at ? `aggiornato ${dataLunga(cliente.updated_at)}` : null,
                      cliente.risk_level ? `rischio: ${cliente.risk_level}` : null].filter(Boolean).join(" · ")}
                  </div>
                </Sezione>

                <Sezione titolo="Preferenze e allergie">
                  {editMode ? (
                    <div className={`grid gap-4 ${embedded ? "" : "md:grid-cols-2"}`}>
                      <Input label="Allergie e intolleranze" name="allergie" value={form.allergie} onChange={onChange} />
                      <Input label="Restrizioni dietetiche" name="restrizioni_dietetiche" value={form.restrizioni_dietetiche} onChange={onChange} />
                      <TextArea label="Preferenze cibo" name="pref_cibo" value={form.pref_cibo} onChange={onChange} />
                      <TextArea label="Preferenze bevande" name="pref_bevande" value={form.pref_bevande} onChange={onChange} />
                      <Input label="Posto preferito" name="pref_posto" value={form.pref_posto} onChange={onChange} />
                      <TextArea label="Note TheFork" name="note_thefork" value={form.note_thefork} onChange={onChange} rows={3} />
                    </div>
                  ) : (
                    <div className={`grid gap-4 ${embedded ? "grid-cols-2" : "grid-cols-2 md:grid-cols-3"}`}>
                      <Field label="Allergie e intolleranze" value={cliente.allergie} />
                      <Field label="Restrizioni dietetiche" value={cliente.restrizioni_dietetiche} />
                      <Field label="Posto preferito" value={cliente.pref_posto} />
                      <Field label="Preferenze cibo" value={cliente.pref_cibo} />
                      <Field label="Preferenze bevande" value={cliente.pref_bevande} />
                      <Field label="Note TheFork" value={cliente.note_thefork} />
                    </div>
                  )}
                </Sezione>

                <Sezione titolo="Etichette">
                  <div className="flex flex-wrap gap-2">
                    {allTags.map((tag) => {
                      const active = cliente.tags?.some((t) => t.id === tag.id);
                      return (
                        <button key={tag.id} type="button" onClick={() => toggleTag(tag.id)} aria-pressed={active}
                          className={`min-h-[40px] px-3.5 rounded-full border text-sm font-semibold transition ${active ? "bg-teal-700 border-teal-700 text-white" : "bg-white border-neutral-300 text-neutral-600 hover:border-teal-500"}`}>
                          {active ? "✓ " : "+ "}{tag.nome}
                        </button>
                      );
                    })}
                  </div>
                  <div className="mt-2 text-xs text-neutral-400">Tocca per mettere o togliere un'etichetta.</div>
                </Sezione>
                <Sezione titolo="Doppioni">
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
                </Sezione>
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
// Accetta anche «29/05/2019 02:00:00» (date TheFork) oltre ad AAAA-MM-GG
function _iso(x) {
  const m = String(x || "").match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : String(x || "");
}
function dataLunga(iso) {
  iso = _iso(iso);
  if (!/^\d{4}-\d{2}-\d{2}/.test(iso)) return iso || "—";
  const d = new Date(iso.slice(0, 10) + "T12:00:00");
  const s = d.toLocaleDateString("it-IT", { weekday: "short", day: "numeric", month: "long", year: d.getFullYear() !== new Date().getFullYear() ? "numeric" : undefined });
  return s.charAt(0).toUpperCase() + s.slice(1);
}
function euro(n) {
  return n == null ? "—" : `${Math.round(n * 100) / 100 % 1 ? n.toFixed(2).replace(".", ",") : Math.round(n)} €`;
}

// ── Piatti e bere per tipo (scontrino nelle visite, «Prende di solito») ──
// Le categorie sono quelle della cassa iPratico (cassa_conti_righe.categoria).
const TIPI_CIBO = [
  ["Degustazioni", "Degustazione"], ["Pranzo", "Pranzo"], ["Antipasti", "Antipasti"], ["Primi", "Primi"],
  ["Secondi", "Secondi"], ["Contorni", "Contorni"], ["Dolci", "Dolci"], ["Speciali", "Fuori carta"],
];
const TIPI_BERE = [["vini", "Vini"], ["birre", "Birre"], ["alcolici", "Amari e distillati"], ["analcolici", "Acqua, bibite e caffè"]];
const eBere = (r) => r.famiglia === "beverage" || /^vino\b/i.test((r.nome || "").trim());
function tipoCibo(r) {
  return TIPI_CIBO.some(([c]) => c === r.categoria) ? r.categoria : "altro";
}
function tipoBere(r) {
  const c = r.categoria || "";
  if (c === "Bottiglie" || c === "Calici" || /^vino\b/i.test((r.nome || "").trim())) return "vini";
  if (c === "Birre") return "birre";
  if (["Alcolici", "Bev Alcoliche", "Grappe"].includes(c)) return "alcolici";
  return "analcolici";
}
// «0999 Champagne …» → «Champagne …» (il numero è il codice di cantina)
const nomeVoce = (n) => (n || "").replace(/^\d{3,4}\s+/, "").trim();
const vocePiatto = (r) => r.nome && r.nome.trim().toLowerCase() !== "no_name";

// Raggruppa voci per tipo, nell'ordine dei tipi. ordine: [[chiave, etichetta]], tipo: voce → chiave
function perTipo(voci, ordine, tipo) {
  const g = {};
  voci.forEach((v) => { (g[tipo(v)] = g[tipo(v)] || []).push(v); });
  const out = ordine.filter(([k]) => g[k]).map(([k, label]) => ({ k, label, voci: g[k] }));
  if (g.altro) out.push({ k: "altro", label: "Altro", voci: g.altro });
  return out;
}

// Le righe dello stesso piatto battute in momenti diversi diventano una riga sola
function unisciRighe(righe) {
  const m = new Map();
  righe.filter(vocePiatto).forEach((r) => {
    const k = r.nome.trim();
    const v = m.get(k) || { ...r, quantita: 0, totale: 0 };
    v.quantita += r.quantita || 0;
    v.totale = Math.round((v.totale + (r.totale || 0)) * 100) / 100;
    m.set(k, v);
  });
  return [...m.values()];
}

function Scontrino({ conto, dueColonne }) {
  const righe = unisciRighe(conto.righe || []);
  const cibo = perTipo(righe.filter((r) => !eBere(r)), TIPI_CIBO, tipoCibo);
  const bere = perTipo(righe.filter(eBere), TIPI_BERE, tipoBere);
  const somma = (gr) => gr.reduce((t, g) => t + g.voci.reduce((a, v) => a + (v.totale || 0), 0), 0);
  const Colonna = ({ titolo, gruppi }) => (
    <div className="min-w-0">
      <div className="flex justify-between text-[11px] font-bold uppercase tracking-wide text-neutral-500 border-b border-neutral-200 pb-1 mb-1">
        <span>{titolo}</span><span className="tabular-nums">{euro(somma(gruppi))}</span>
      </div>
      {gruppi.map((g) => (
        <div key={g.k} className="mt-1.5">
          <div className="text-[11px] font-semibold text-teal-800">{g.label}</div>
          {g.voci.map((v) => (
            <div key={v.nome} className="flex gap-2 text-sm leading-snug py-0.5">
              <span className="w-7 shrink-0 text-right tabular-nums text-neutral-500">{v.quantita > 1 ? `${v.quantita}×` : ""}</span>
              <span className="flex-1 min-w-0">{nomeVoce(v.nome)}</span>
              <span className="shrink-0 tabular-nums text-neutral-600">{euro(v.totale)}</span>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
  if (!cibo.length && !bere.length) return null;
  return (
    <div className={`mt-2 rounded-xl bg-white border border-neutral-200 p-3 grid gap-4 ${dueColonne ? "md:grid-cols-2" : ""}`}>
      {cibo.length > 0 && <Colonna titolo="Mangiato" gruppi={cibo} />}
      {bere.length > 0 && <Colonna titolo="Bevuto" gruppi={bere} />}
    </div>
  );
}

// «Prende di solito»: i piatti per tipo (3 per tipo) e il bere (vini prima)
function PrendeDiSolito({ consumi, dueColonne }) {
  const piatti = perTipo((consumi?.piatti_preferiti || []).filter(vocePiatto), TIPI_CIBO, tipoCibo);
  const bere = perTipo((consumi?.da_bere || []).filter(vocePiatto), TIPI_BERE, tipoBere);
  // tra i vini prima le bottiglie (dicono che vino), poi i calici, poi «Vino» a prezzo libero
  const pesoVino = (v) => (v.categoria === "Bottiglie" ? 0 : v.categoria === "Calici" ? 1 : 2);
  bere.forEach((g) => { if (g.k === "vini") g.voci = [...g.voci].sort((a, b) => pesoVino(a) - pesoVino(b) || b.volte - a.volte); });
  if (!piatti.length && !bere.length) return null;
  const Blocco = ({ titolo, gruppi, quanti }) => (
    <div className="min-w-0">
      <div className="text-xs font-bold text-neutral-500 mb-1">{titolo}</div>
      {gruppi.map((g) => (
        <div key={g.k} className="flex gap-3 py-1.5 border-t border-neutral-100 first:border-0">
          <span className="w-24 shrink-0 text-[12px] font-semibold text-teal-800 pt-1">{g.label}</span>
          <div className="flex flex-wrap gap-1.5 min-w-0">
            {g.voci.slice(0, quanti(g.k)).map((v) => (
              <span key={v.nome} className="px-2.5 py-1 rounded-full bg-neutral-100 text-sm">
                {nomeVoce(v.nome)} <b className="tabular-nums">{v.volte}</b>
              </span>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
  return (
    <div className="rounded-xl p-3 bg-white border border-neutral-200">
      <div className="text-xs font-bold text-neutral-500 mb-2">Prende di solito <span className="font-normal text-neutral-400">· il numero è quante volte</span></div>
      <div className={`grid gap-4 ${dueColonne ? "md:grid-cols-2" : ""}`}>
        {piatti.length > 0 && <Blocco titolo="Piatti" gruppi={piatti} quanti={() => 3} />}
        {bere.length > 0 && <Blocco titolo="Da bere" gruppi={bere} quanti={(k) => (k === "vini" ? 4 : 2)} />}
      </div>
    </div>
  );
}

// ── Tab Recensioni TheFork dentro scheda cliente (mig 197) ──
// ── Tab «Cosa ha mangiato»: conti di cassa abbinati al cliente (2026-10-18) ──
// Dati: GET /clienti/{id}/consumi (servizio platform abbinamento_conti_service).

function ConsumiTab({ clienteId }) {
  const [d, setD] = useState(null);
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
  const Numero = ({ label, v, sotto }) => (
    <div className="rounded-xl bg-neutral-50 border border-neutral-200 px-3 py-2.5">
      <div className="text-xs font-bold text-neutral-500">{label}</div>
      <div className="text-xl font-bold text-neutral-900 tabular-nums">{v}</div>
      {sotto && <div className="text-xs text-neutral-500">{sotto}</div>}
    </div>
  );
  const Lista = ({ titolo, voci, destra }) => (
    <div className="min-w-0">
      <div className="text-xs font-bold text-neutral-500 mb-1">{titolo}</div>
      <ul className="divide-y divide-neutral-100">
        {voci.map((p) => (
          <li key={p.nome} className="flex gap-3 py-1.5 text-[15px]">
            <span className="flex-1 min-w-0">{nomeVoce(p.nome)}<span className="text-neutral-400 text-xs"> · {p.categoria || "—"}</span></span>
            <span className="shrink-0 tabular-nums text-neutral-600">{destra(p)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <Numero label="Visite con conto" v={d.visite} sotto={`dal ${dataBreve(d.prima)}`} />
        <Numero label="Spesa totale" v={euro(d.spesa_totale)} />
        <Numero label="A visita" v={euro(d.spesa_media_visita)} />
        <Numero label="A coperto" v={euro(d.spesa_media_coperto)} />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Lista titolo="Piatti, quante volte" voci={d.piatti_preferiti.filter(vocePiatto).slice(0, 12)} destra={(p) => `${p.volte}×`} />
        <Lista titolo="Da bere, quanto ha speso" voci={d.da_bere.filter(vocePiatto).slice(0, 10)} destra={(p) => euro(p.spesa)} />
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
