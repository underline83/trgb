// @version: v1.1-preventivo-scheda
// Scheda singolo preventivo: testata + menu proposto (ristorante) + extra liberi + totale live
// v1.1 (sessione 32): sezione Menu Proposto, cliente cerca/crea inline, luoghi configurabili
import React, { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { API_BASE, apiFetch } from "../../config/api";
import ClientiNav from "./ClientiNav";

const STATI_COLORI = {
  bozza:      "bg-neutral-100 text-neutral-600",
  inviato:    "bg-blue-100 text-blue-700",
  in_attesa:  "bg-amber-100 text-amber-700",
  confermato: "bg-emerald-100 text-emerald-700",
  prenotato:  "bg-indigo-100 text-indigo-700",
  completato: "bg-emerald-50 text-emerald-600",
  fatturato:  "bg-neutral-100 text-neutral-500",
  rifiutato:  "bg-red-100 text-red-600",
  scaduto:    "bg-orange-100 text-orange-700",
};

const STATI_LABEL = {
  bozza: "Bozza", inviato: "Inviato", in_attesa: "In attesa",
  confermato: "Confermato", prenotato: "Prenotato", completato: "Completato",
  fatturato: "Fatturato", rifiutato: "Rifiutato", scaduto: "Scaduto",
};

const TRANSIZIONI = {
  bozza:      ["inviato"],
  inviato:    ["in_attesa", "confermato", "rifiutato"],
  in_attesa:  ["confermato", "rifiutato", "scaduto"],
  confermato: ["prenotato"],
  prenotato:  ["completato"],
  completato: ["fatturato"],
  rifiutato:  [],
  scaduto:    ["bozza"],
  fatturato:  [],
};

const RIGA_VUOTA = { descrizione: "", qta: 1, prezzo_unitario: 0, tipo_riga: "voce", ordine: 0 };

// Placeholder esempio per aiutare Marco a strutturare il menu proposto
const MENU_PLACEHOLDER = `ANTIPASTI
• Tagliere di salumi e formaggi bergamaschi
• Polenta taragna con Branzi DOP

PRIMI
• Casoncelli alla bergamasca
• Risotto al tastasal

SECONDI
• Coniglio alla cacciatora con polenta
• Brasato al Valcalepio

DOLCE
• Sbrisolona con crema mascarpone

Acqua, caffè e coperto inclusi.
Vino: 1 bottiglia ogni 4 persone (Valcalepio rosso o bianco).`;

export default function ClientiPreventivoScheda() {
  const { id } = useParams();
  const isNew = id === "nuovo";
  const navigate = useNavigate();

  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState(null);

  // Testata
  const [form, setForm] = useState({
    cliente_id: null,
    titolo: "",
    tipo: "cena_privata",
    data_evento: "",
    ora_evento: "",
    n_persone: "",
    luogo: "Sala",
    note_interne: "",
    note_cliente: "",
    condizioni: "",
    scadenza_conferma: "",
    canale: "telefono",
    template_id: null,
    menu_nome: "",
    menu_prezzo_persona: 0,
    menu_descrizione: "",
  });
  const [stato, setStato] = useState("bozza");
  const [numero, setNumero] = useState("");
  const [prevId, setPrevId] = useState(null);

  // Righe extra (non menu)
  const [righe, setRighe] = useState([]);

  // Cliente: toggle cerca / crea nuovo
  const [clienteMode, setClienteMode] = useState("cerca"); // "cerca" | "nuovo"
  const [clienteSearch, setClienteSearch] = useState("");
  const [clienteResults, setClienteResults] = useState([]);
  const [clienteNome, setClienteNome] = useState("");
  const [showClienteDD, setShowClienteDD] = useState(false);
  const [nuovoCliente, setNuovoCliente] = useState({ nome: "", cognome: "", telefono: "", email: "" });

  // Template
  const [templates, setTemplates] = useState([]);

  // Luoghi configurabili
  const [luoghi, setLuoghi] = useState(["Sala", "Giardino", "Dehor"]);

  // Tab note
  const [noteTab, setNoteTab] = useState("interne");

  // ── Caricamento ──
  useEffect(() => {
    if (!isNew) {
      apiFetch(`${API_BASE}/preventivi/${id}`)
        .then((r) => r.json())
        .then((data) => {
          setForm({
            cliente_id: data.cliente_id,
            titolo: data.titolo || "",
            tipo: data.tipo || "cena_privata",
            data_evento: data.data_evento || "",
            ora_evento: data.ora_evento || "",
            n_persone: data.n_persone || "",
            luogo: data.luogo || "Sala",
            note_interne: data.note_interne || "",
            note_cliente: data.note_cliente || "",
            condizioni: data.condizioni || "",
            scadenza_conferma: data.scadenza_conferma || "",
            canale: data.canale || "telefono",
            template_id: data.template_id,
            menu_nome: data.menu_nome || "",
            menu_prezzo_persona: data.menu_prezzo_persona || 0,
            menu_descrizione: data.menu_descrizione || "",
          });
          setStato(data.stato);
          setNumero(data.numero);
          setPrevId(data.id);
          setRighe(Array.isArray(data.righe) ? data.righe : []);
          if (data.cliente_nome || data.cliente_cognome) {
            setClienteNome(`${data.cliente_cognome || ""} ${data.cliente_nome || ""}`.trim());
          }
        })
        .catch(() => showToast("Errore caricamento preventivo", true))
        .finally(() => setLoading(false));
    }
    // Template
    apiFetch(`${API_BASE}/preventivi/template/lista`)
      .then((r) => r.json())
      .then((data) => setTemplates(Array.isArray(data) ? data : []))
      .catch(() => {});
    // Luoghi
    apiFetch(`${API_BASE}/preventivi/config/luoghi`)
      .then((r) => r.json())
      .then((data) => { if (Array.isArray(data?.luoghi) && data.luoghi.length) setLuoghi(data.luoghi); })
      .catch(() => {});
  }, [id, isNew]);

  // ── Autocomplete cliente (solo in modalita "cerca") ──
  useEffect(() => {
    if (clienteMode !== "cerca" || clienteSearch.length < 2) { setClienteResults([]); return; }
    const t = setTimeout(() => {
      apiFetch(`${API_BASE}/prenotazioni/clienti/search?q=${encodeURIComponent(clienteSearch)}`)
        .then((r) => r.json())
        .then((data) => { setClienteResults(data); setShowClienteDD(true); })
        .catch(() => {});
    }, 300);
    return () => clearTimeout(t);
  }, [clienteSearch, clienteMode]);

  const selezionaCliente = (c) => {
    setForm((f) => ({ ...f, cliente_id: c.id }));
    setClienteNome(`${c.cognome || ""} ${c.nome || ""}`.trim());
    setClienteSearch("");
    setShowClienteDD(false);
  };

  const resetCliente = () => {
    setForm((f) => ({ ...f, cliente_id: null }));
    setClienteNome("");
    setClienteSearch("");
    setClienteResults([]);
    setNuovoCliente({ nome: "", cognome: "", telefono: "", email: "" });
  };

  // ── Template ──
  const applicaTemplate = (tplId) => {
    const tpl = templates.find((t) => t.id === parseInt(tplId));
    if (!tpl) return;
    setForm((f) => ({ ...f, template_id: tpl.id, condizioni: tpl.condizioni_default || f.condizioni }));
    try {
      const r = JSON.parse(tpl.righe_json || "[]");
      if (r.length) setRighe(r.map((x, i) => ({ ...RIGA_VUOTA, ...x, ordine: i })));
    } catch { /* ignora JSON invalido */ }
  };

  // ── Righe extra ──
  const updateRiga = (idx, field, value) => {
    setRighe((prev) => prev.map((r, i) => i === idx ? { ...r, [field]: value } : r));
  };
  const aggiungiRiga = () => setRighe((prev) => [...prev, { ...RIGA_VUOTA, ordine: prev.length }]);
  const rimuoviRiga = (idx) => setRighe((prev) => prev.filter((_, i) => i !== idx));
  const spostaRiga = (idx, dir) => {
    setRighe((prev) => {
      const arr = [...prev];
      const newIdx = idx + dir;
      if (newIdx < 0 || newIdx >= arr.length) return arr;
      [arr[idx], arr[newIdx]] = [arr[newIdx], arr[idx]];
      return arr.map((r, i) => ({ ...r, ordine: i }));
    });
  };

  // Totale live: menu × pax + somma righe extra
  const menuTot = (parseFloat(form.menu_prezzo_persona) || 0) * (parseFloat(form.n_persone) || 0);
  const extraTot = righe.reduce((sum, r) => {
    const sub = (parseFloat(r.qta) || 0) * (parseFloat(r.prezzo_unitario) || 0);
    return r.tipo_riga === "sconto" ? sum - Math.abs(sub) : sum + sub;
  }, 0);
  const totaleLive = menuTot + extraTot;

  // ── Salva ──
  const handleSalva = async () => {
    if (!form.titolo.trim()) { showToast("Il titolo è obbligatorio", true); return; }

    // Validazione cliente "nuovo"
    let nuovoClientePayload = null;
    if (clienteMode === "nuovo" && !form.cliente_id) {
      const n = (nuovoCliente.nome || "").trim();
      const c = (nuovoCliente.cognome || "").trim();
      if (!n && !c) { showToast("Indicare almeno nome o cognome del nuovo cliente", true); return; }
      nuovoClientePayload = { ...nuovoCliente };
    }

    setSaving(true);
    try {
      const body = {
        ...form,
        n_persone: form.n_persone ? parseInt(form.n_persone) : null,
        menu_prezzo_persona: parseFloat(form.menu_prezzo_persona) || 0,
        righe: righe.map((r, i) => ({
          descrizione: r.descrizione,
          qta: parseFloat(r.qta) || 1,
          prezzo_unitario: parseFloat(r.prezzo_unitario) || 0,
          tipo_riga: r.tipo_riga || "voce",
          ordine: i,
        })),
        ...(nuovoClientePayload ? { nuovo_cliente: nuovoClientePayload } : {}),
      };

      let res;
      if (isNew) {
        res = await apiFetch(`${API_BASE}/preventivi`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      } else {
        res = await apiFetch(`${API_BASE}/preventivi/${prevId}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      }

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || "Errore salvataggio");
      }

      const data = await res.json();
      showToast("Preventivo salvato");

      if (isNew) {
        navigate(`/clienti/preventivi/${data.id}`, { replace: true });
      } else {
        setStato(data.stato);
        setNumero(data.numero);
        setRighe(Array.isArray(data.righe) ? data.righe : []);
        if (data.cliente_nome || data.cliente_cognome) {
          setClienteNome(`${data.cliente_cognome || ""} ${data.cliente_nome || ""}`.trim());
          setClienteMode("cerca");
          setNuovoCliente({ nome: "", cognome: "", telefono: "", email: "" });
        }
      }
    } catch (err) {
      showToast(err.message || "Errore salvataggio", true);
    } finally {
      setSaving(false);
    }
  };

  // ── Cambia stato ──
  const handleCambiaStato = async (nuovoStato) => {
    try {
      const res = await apiFetch(`${API_BASE}/preventivi/${prevId}/stato`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stato: nuovoStato }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || "Errore cambio stato");
      }
      const data = await res.json();
      setStato(data.stato);
      showToast(`Stato → ${STATI_LABEL[data.stato]}`);
    } catch (err) {
      showToast(err.message, true);
    }
  };

  // ── Scarica PDF (mattone M.B) ──
  const handlePDF = async () => {
    try {
      const res = await apiFetch(`${API_BASE}/preventivi/${prevId}/pdf`);
      if (!res.ok) throw new Error("Errore generazione PDF");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `preventivo_${(numero || prevId).toString().toLowerCase()}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      showToast("PDF scaricato");
    } catch (err) {
      showToast(err.message || "Errore PDF", true);
    }
  };

  // ── Duplica ──
  const handleDuplica = async () => {
    try {
      const res = await apiFetch(`${API_BASE}/preventivi/${prevId}/duplica`, { method: "POST" });
      if (!res.ok) throw new Error("Errore duplicazione");
      const data = await res.json();
      showToast("Preventivo duplicato");
      navigate(`/clienti/preventivi/${data.id}`);
    } catch (err) {
      showToast(err.message, true);
    }
  };

  // ── Elimina ──
  const handleElimina = async () => {
    if (!window.confirm("Eliminare questo preventivo?")) return;
    try {
      await apiFetch(`${API_BASE}/preventivi/${prevId}`, { method: "DELETE" });
      showToast("Preventivo eliminato");
      navigate("/clienti/preventivi");
    } catch {
      showToast("Errore eliminazione", true);
    }
  };

  const showToast = (msg, isError = false) => {
    setToast({ msg, isError });
    setTimeout(() => setToast(null), 3000);
  };

  if (loading) return (
    <>
      <ClientiNav current="preventivi" />
      <div className="min-h-screen bg-brand-cream flex items-center justify-center">
        <div className="text-neutral-400">Caricamento...</div>
      </div>
    </>
  );

  const transizioniDisp = TRANSIZIONI[stato] || [];

  return (
    <>
      <ClientiNav current="preventivi" />
      <div className="min-h-screen bg-brand-cream">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6">

          {/* ── HEADER ── */}
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <button onClick={() => navigate("/clienti/preventivi")}
                className="text-neutral-400 hover:text-neutral-600 transition text-lg">←</button>
              <div>
                <h1 className="text-xl font-bold text-neutral-900">
                  {isNew ? "Nuovo Preventivo" : `${numero}`}
                </h1>
                {!isNew && (
                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${STATI_COLORI[stato]}`}>
                    {STATI_LABEL[stato]}
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="flex gap-6">
            {/* ── FORM PRINCIPALE ── */}
            <div className="flex-1 space-y-4">

              {/* Testata */}
              <div className="bg-white rounded-xl border border-neutral-200 shadow-sm p-5 space-y-4">
                <h3 className="text-sm font-semibold text-neutral-700">Dettagli evento</h3>

                {/* Template select */}
                {templates.length > 0 && (
                  <div>
                    <label className="text-xs text-neutral-600 font-medium">Carica da template</label>
                    <select onChange={(e) => applicaTemplate(e.target.value)} value=""
                      className="w-full mt-1 border border-neutral-300 rounded-lg px-3 py-1.5 text-sm">
                      <option value="">— Seleziona template —</option>
                      {templates.map((t) => <option key={t.id} value={t.id}>{t.nome}</option>)}
                    </select>
                  </div>
                )}

                <div>
                  <label className="text-xs text-neutral-600 font-medium">Titolo *</label>
                  <input type="text" value={form.titolo}
                    onChange={(e) => setForm({ ...form, titolo: e.target.value })}
                    placeholder="es. Cena aziendale Natale Rossi"
                    className="w-full mt-1 border border-neutral-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-300 outline-none" />
                </div>

                {/* ── CLIENTE: toggle cerca / nuovo ── */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-xs text-neutral-600 font-medium">Cliente</label>
                    {!form.cliente_id && (
                      <div className="inline-flex rounded-lg border border-neutral-200 overflow-hidden text-[11px]">
                        <button type="button" onClick={() => { setClienteMode("cerca"); setNuovoCliente({ nome: "", cognome: "", telefono: "", email: "" }); }}
                          className={`px-2.5 py-1 ${clienteMode === "cerca" ? "bg-indigo-600 text-white" : "bg-white text-neutral-600 hover:bg-neutral-50"}`}>
                          🔍 Esistente
                        </button>
                        <button type="button" onClick={() => { setClienteMode("nuovo"); setClienteSearch(""); }}
                          className={`px-2.5 py-1 border-l border-neutral-200 ${clienteMode === "nuovo" ? "bg-indigo-600 text-white" : "bg-white text-neutral-600 hover:bg-neutral-50"}`}>
                          ＋ Nuovo
                        </button>
                      </div>
                    )}
                  </div>

                  {form.cliente_id ? (
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-indigo-700">{clienteNome || `Cliente #${form.cliente_id}`}</span>
                      <button onClick={resetCliente} className="text-xs text-red-500 hover:text-red-700">✕ rimuovi</button>
                    </div>
                  ) : clienteMode === "cerca" ? (
                    <div className="relative">
                      <input type="text" value={clienteSearch}
                        onChange={(e) => setClienteSearch(e.target.value)}
                        placeholder="Cerca per nome, cognome o telefono..."
                        className="w-full border border-neutral-300 rounded-lg px-3 py-1.5 text-sm focus:ring-2 focus:ring-indigo-300 outline-none" />
                      {showClienteDD && clienteResults.length > 0 && (
                        <div className="absolute z-20 mt-1 w-full bg-white border border-neutral-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                          {clienteResults.map((c) => (
                            <button key={c.id} onClick={() => selezionaCliente(c)}
                              className="w-full text-left px-3 py-2 hover:bg-indigo-50 text-sm border-b border-neutral-100 last:border-0">
                              <span className="font-medium">{c.cognome} {c.nome}</span>
                              {c.telefono && <span className="text-neutral-400 ml-2 text-xs">{c.telefono}</span>}
                            </button>
                          ))}
                        </div>
                      )}
                      <p className="text-[11px] text-neutral-400 mt-1">Nessun risultato? Passa a <button type="button" onClick={() => setClienteMode("nuovo")} className="text-indigo-600 hover:underline">＋ Nuovo</button> per crearlo al volo.</p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 gap-2 bg-indigo-50/40 border border-indigo-200 rounded-lg p-3">
                      <input type="text" value={nuovoCliente.nome}
                        onChange={(e) => setNuovoCliente({ ...nuovoCliente, nome: e.target.value })}
                        placeholder="Nome *"
                        className="border border-neutral-300 rounded-lg px-3 py-1.5 text-sm bg-white" />
                      <input type="text" value={nuovoCliente.cognome}
                        onChange={(e) => setNuovoCliente({ ...nuovoCliente, cognome: e.target.value })}
                        placeholder="Cognome *"
                        className="border border-neutral-300 rounded-lg px-3 py-1.5 text-sm bg-white" />
                      <input type="tel" value={nuovoCliente.telefono}
                        onChange={(e) => setNuovoCliente({ ...nuovoCliente, telefono: e.target.value })}
                        placeholder="Telefono"
                        className="border border-neutral-300 rounded-lg px-3 py-1.5 text-sm bg-white" />
                      <input type="email" value={nuovoCliente.email}
                        onChange={(e) => setNuovoCliente({ ...nuovoCliente, email: e.target.value })}
                        placeholder="Email"
                        className="border border-neutral-300 rounded-lg px-3 py-1.5 text-sm bg-white" />
                      <p className="col-span-2 text-[11px] text-indigo-700/80">
                        Il cliente verra' creato nell'anagrafica CRM al salvataggio (origine: preventivo).
                      </p>
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-neutral-600 font-medium">Tipo</label>
                    <select value={form.tipo} onChange={(e) => setForm({ ...form, tipo: e.target.value })}
                      className="w-full mt-1 border border-neutral-300 rounded-lg px-3 py-1.5 text-sm">
                      <option value="cena_privata">Cena privata</option>
                      <option value="aperitivo">Aperitivo</option>
                      <option value="degustazione">Degustazione</option>
                      <option value="catering">Catering</option>
                      <option value="altro">Altro</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-neutral-600 font-medium">Canale</label>
                    <select value={form.canale} onChange={(e) => setForm({ ...form, canale: e.target.value })}
                      className="w-full mt-1 border border-neutral-300 rounded-lg px-3 py-1.5 text-sm">
                      <option value="whatsapp">WhatsApp</option>
                      <option value="email">Email</option>
                      <option value="telefono">Telefono</option>
                      <option value="di_persona">Di persona</option>
                      <option value="sito">Sito web</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="text-xs text-neutral-600 font-medium">Data evento</label>
                    <input type="date" value={form.data_evento}
                      onChange={(e) => setForm({ ...form, data_evento: e.target.value })}
                      className="w-full mt-1 border border-neutral-300 rounded-lg px-3 py-1.5 text-sm" />
                  </div>
                  <div>
                    <label className="text-xs text-neutral-600 font-medium">Ora</label>
                    <input type="time" value={form.ora_evento}
                      onChange={(e) => setForm({ ...form, ora_evento: e.target.value })}
                      className="w-full mt-1 border border-neutral-300 rounded-lg px-3 py-1.5 text-sm" />
                  </div>
                  <div>
                    <label className="text-xs text-neutral-600 font-medium">N. persone</label>
                    <input type="number" min="1" value={form.n_persone}
                      onChange={(e) => setForm({ ...form, n_persone: e.target.value })}
                      className="w-full mt-1 border border-neutral-300 rounded-lg px-3 py-1.5 text-sm" />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-neutral-600 font-medium">Luogo</label>
                    <select value={form.luogo} onChange={(e) => setForm({ ...form, luogo: e.target.value })}
                      className="w-full mt-1 border border-neutral-300 rounded-lg px-3 py-1.5 text-sm">
                      {luoghi.map((l) => <option key={l} value={l}>{l}</option>)}
                      {/* Preserva un valore legacy che non sia piu' in config */}
                      {form.luogo && !luoghi.includes(form.luogo) && (
                        <option value={form.luogo}>{form.luogo} (non configurato)</option>
                      )}
                    </select>
                    <p className="text-[11px] text-neutral-400 mt-1">Gestisci i luoghi in Impostazioni → Luoghi.</p>
                  </div>
                  <div>
                    <label className="text-xs text-neutral-600 font-medium">Scadenza conferma</label>
                    <input type="date" value={form.scadenza_conferma}
                      onChange={(e) => setForm({ ...form, scadenza_conferma: e.target.value })}
                      className="w-full mt-1 border border-neutral-300 rounded-lg px-3 py-1.5 text-sm" />
                  </div>
                </div>
              </div>

              {/* ── MENU PROPOSTO (ristorante) ── */}
              <div className="bg-white rounded-xl border border-neutral-200 shadow-sm p-5 space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-neutral-700">🍽 Menu proposto</h3>
                  <span className="text-[11px] text-neutral-400">Prezzo a persona × coperti</span>
                </div>

                <div className="grid grid-cols-[1fr_140px] gap-3">
                  <div>
                    <label className="text-xs text-neutral-600 font-medium">Nome menu</label>
                    <input type="text" value={form.menu_nome}
                      onChange={(e) => setForm({ ...form, menu_nome: e.target.value })}
                      placeholder="es. Menu Degustazione 5 portate"
                      className="w-full mt-1 border border-neutral-300 rounded-lg px-3 py-1.5 text-sm" />
                  </div>
                  <div>
                    <label className="text-xs text-neutral-600 font-medium">Prezzo a persona (€)</label>
                    <input type="number" min="0" step="0.5" value={form.menu_prezzo_persona}
                      onChange={(e) => setForm({ ...form, menu_prezzo_persona: e.target.value })}
                      placeholder="0.00"
                      className="w-full mt-1 border border-neutral-300 rounded-lg px-3 py-1.5 text-sm text-right" />
                  </div>
                </div>

                <div>
                  <label className="text-xs text-neutral-600 font-medium">Composizione menu</label>
                  <textarea value={form.menu_descrizione}
                    onChange={(e) => setForm({ ...form, menu_descrizione: e.target.value })}
                    placeholder={MENU_PLACEHOLDER}
                    rows={10}
                    className="w-full mt-1 border border-neutral-300 rounded-lg px-3 py-2 text-sm font-mono leading-relaxed resize-y" />
                  <p className="text-[11px] text-neutral-400 mt-1">
                    Struttura libera per portata (Antipasti, Primi, Secondi, Dolce, Vino). Andrà così com'è nel PDF e nel messaggio al cliente.
                  </p>
                </div>

                <div className="flex items-baseline justify-between pt-2 border-t border-neutral-100">
                  <span className="text-xs text-neutral-500">
                    {form.n_persone ? `${form.n_persone} coperti × €${(parseFloat(form.menu_prezzo_persona) || 0).toFixed(2)}` : "Imposta N. persone per calcolare"}
                  </span>
                  <span className="text-sm font-semibold text-neutral-900">
                    Subtotale menu: €{menuTot.toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                </div>
              </div>

              {/* ── EXTRA LIBERI (righe) ── */}
              <div className="bg-white rounded-xl border border-neutral-200 shadow-sm p-5">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <h3 className="text-sm font-semibold text-neutral-700">➕ Extra</h3>
                    <p className="text-[11px] text-neutral-400">Voci aggiuntive libere: noleggio attrezzatura, tovagliato, supplementi, sconti…</p>
                  </div>
                  <button onClick={aggiungiRiga}
                    className="text-xs px-3 py-1 bg-indigo-50 text-indigo-700 rounded-lg hover:bg-indigo-100 transition font-medium">
                    + Aggiungi riga
                  </button>
                </div>

                {righe.length === 0 ? (
                  <div className="text-center py-4 text-xs text-neutral-400 border border-dashed border-neutral-200 rounded-lg">
                    Nessun extra. Il totale sarà calcolato solo dal menu × coperti.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {/* Header */}
                    <div className="grid grid-cols-[1fr_70px_90px_90px_80px_60px] gap-2 text-[10px] text-neutral-500 uppercase font-medium px-1">
                      <span>Descrizione</span>
                      <span className="text-center">Qtà</span>
                      <span className="text-right">Prezzo un.</span>
                      <span className="text-right">Totale</span>
                      <span className="text-center">Tipo</span>
                      <span></span>
                    </div>

                    {righe.map((r, idx) => {
                      const tot = (parseFloat(r.qta) || 0) * (parseFloat(r.prezzo_unitario) || 0);
                      return (
                        <div key={idx} className="grid grid-cols-[1fr_70px_90px_90px_80px_60px] gap-2 items-center">
                          <input type="text" value={r.descrizione}
                            onChange={(e) => updateRiga(idx, "descrizione", e.target.value)}
                            placeholder="es. Noleggio tovagliato, mise en place..."
                            className="border border-neutral-200 rounded px-2 py-1.5 text-sm" />
                          <input type="number" min="0" step="0.5" value={r.qta}
                            onChange={(e) => updateRiga(idx, "qta", e.target.value)}
                            className="border border-neutral-200 rounded px-2 py-1.5 text-sm text-center" />
                          <input type="number" min="0" step="0.01" value={r.prezzo_unitario}
                            onChange={(e) => updateRiga(idx, "prezzo_unitario", e.target.value)}
                            className="border border-neutral-200 rounded px-2 py-1.5 text-sm text-right" />
                          <div className={`text-sm text-right font-medium px-2 ${r.tipo_riga === "sconto" ? "text-red-600" : "text-neutral-900"}`}>
                            {r.tipo_riga === "sconto" ? "-" : ""}€{Math.abs(tot).toFixed(2)}
                          </div>
                          <select value={r.tipo_riga || "voce"}
                            onChange={(e) => updateRiga(idx, "tipo_riga", e.target.value)}
                            className="border border-neutral-200 rounded px-1 py-1.5 text-[11px]">
                            <option value="voce">Voce</option>
                            <option value="sconto">Sconto</option>
                            <option value="supplemento">Suppl.</option>
                            <option value="nota">Nota</option>
                          </select>
                          <div className="flex items-center gap-0.5 justify-center">
                            <button onClick={() => spostaRiga(idx, -1)} disabled={idx === 0}
                              className="text-neutral-300 hover:text-neutral-500 disabled:opacity-30 text-xs">▲</button>
                            <button onClick={() => spostaRiga(idx, 1)} disabled={idx === righe.length - 1}
                              className="text-neutral-300 hover:text-neutral-500 disabled:opacity-30 text-xs">▼</button>
                            <button onClick={() => rimuoviRiga(idx)}
                              className="text-red-300 hover:text-red-500 text-xs ml-1">✕</button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Totale live */}
                <div className="mt-4 pt-3 border-t border-neutral-200 space-y-1">
                  {righe.length > 0 && (
                    <div className="flex justify-end text-xs text-neutral-500">
                      Subtotale extra: €{extraTot.toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </div>
                  )}
                  <div className="flex justify-end items-baseline">
                    <span className="text-xs text-neutral-500 mr-3">TOTALE</span>
                    <span className="text-xl font-bold text-indigo-700">
                      €{totaleLive.toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                  </div>
                </div>
              </div>

              {/* ── NOTE ── */}
              <div className="bg-white rounded-xl border border-neutral-200 shadow-sm p-5">
                <div className="flex gap-2 mb-3">
                  <button onClick={() => setNoteTab("interne")}
                    className={`text-xs px-3 py-1 rounded-lg font-medium transition ${noteTab === "interne" ? "bg-neutral-900 text-white" : "bg-neutral-100 text-neutral-600 hover:bg-neutral-200"}`}>
                    Note interne (staff)
                  </button>
                  <button onClick={() => setNoteTab("cliente")}
                    className={`text-xs px-3 py-1 rounded-lg font-medium transition ${noteTab === "cliente" ? "bg-neutral-900 text-white" : "bg-neutral-100 text-neutral-600 hover:bg-neutral-200"}`}>
                    Note per il cliente
                  </button>
                  <button onClick={() => setNoteTab("condizioni")}
                    className={`text-xs px-3 py-1 rounded-lg font-medium transition ${noteTab === "condizioni" ? "bg-neutral-900 text-white" : "bg-neutral-100 text-neutral-600 hover:bg-neutral-200"}`}>
                    Condizioni
                  </button>
                </div>
                {noteTab === "interne" && (
                  <textarea value={form.note_interne} onChange={(e) => setForm({ ...form, note_interne: e.target.value })}
                    placeholder="Note visibili solo allo staff..."
                    rows={3} className="w-full border border-neutral-200 rounded-lg px-3 py-2 text-sm resize-none" />
                )}
                {noteTab === "cliente" && (
                  <textarea value={form.note_cliente} onChange={(e) => setForm({ ...form, note_cliente: e.target.value })}
                    placeholder="Note che andranno nel messaggio/PDF al cliente..."
                    rows={3} className="w-full border border-neutral-200 rounded-lg px-3 py-2 text-sm resize-none" />
                )}
                {noteTab === "condizioni" && (
                  <textarea value={form.condizioni} onChange={(e) => setForm({ ...form, condizioni: e.target.value })}
                    placeholder="Acconto richiesto, conferma entro..., politica cancellazione..."
                    rows={3} className="w-full border border-neutral-200 rounded-lg px-3 py-2 text-sm resize-none" />
                )}
              </div>
            </div>

            {/* ── SIDEBAR AZIONI ── */}
            <div className="w-52 flex-shrink-0 hidden lg:block">
              <div className="bg-white rounded-xl border border-neutral-200 shadow-sm p-4 space-y-3 sticky top-6">
                <h3 className="text-xs font-semibold text-neutral-500 uppercase tracking-wider">Azioni</h3>

                <button onClick={handleSalva} disabled={saving}
                  className="w-full px-4 py-2.5 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 transition disabled:opacity-50">
                  {saving ? "Salvataggio..." : isNew ? "Crea preventivo" : "Salva modifiche"}
                </button>

                {!isNew && (
                  <>
                    {transizioniDisp.length > 0 && (
                      <div className="space-y-1.5">
                        <span className="text-[10px] text-neutral-400 uppercase">Cambia stato</span>
                        {transizioniDisp.map((s) => (
                          <button key={s} onClick={() => handleCambiaStato(s)}
                            className="w-full text-left px-3 py-1.5 text-xs rounded-lg border border-neutral-200 hover:bg-neutral-50 transition">
                            → {STATI_LABEL[s]}
                          </button>
                        ))}
                      </div>
                    )}

                    <hr className="border-neutral-200" />

                    <button onClick={handlePDF}
                      className="w-full text-left px-3 py-1.5 text-xs text-brand-blue hover:text-blue-800 rounded-lg border border-blue-200 hover:bg-blue-50 transition font-medium">
                      📥 Scarica PDF
                    </button>

                    <button onClick={handleDuplica}
                      className="w-full text-left px-3 py-1.5 text-xs text-neutral-600 hover:text-neutral-900 rounded-lg border border-neutral-200 hover:bg-neutral-50 transition">
                      📄 Duplica
                    </button>

                    <button onClick={handleElimina}
                      className="w-full text-left px-3 py-1.5 text-xs text-red-500 hover:text-red-700 rounded-lg border border-red-200 hover:bg-red-50 transition">
                      🗑 Elimina
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* ── BARRA MOBILE AZIONI ── */}
          <div className="lg:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-neutral-200 px-4 py-3 flex gap-2 z-30">
            <button onClick={handleSalva} disabled={saving}
              className="flex-1 px-4 py-2.5 bg-indigo-600 text-white rounded-lg text-sm font-medium">
              {saving ? "..." : isNew ? "Crea" : "Salva"}
            </button>
            {!isNew && transizioniDisp.length > 0 && (
              <button onClick={() => handleCambiaStato(transizioniDisp[0])}
                className="px-4 py-2.5 border border-neutral-300 rounded-lg text-sm">
                → {STATI_LABEL[transizioniDisp[0]]}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* TOAST */}
      {toast && (
        <div className={`fixed bottom-20 lg:bottom-6 right-6 z-50 px-4 py-2.5 rounded-lg shadow-lg text-sm font-medium transition-all ${toast.isError ? "bg-red-600 text-white" : "bg-neutral-900 text-white"}`}>
          {toast.msg}
        </div>
      )}
    </>
  );
}
