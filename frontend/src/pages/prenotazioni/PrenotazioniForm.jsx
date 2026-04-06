// @version: v1.0-prenotazioni-form
// Form modale per nuova prenotazione — modulo Prenotazioni TRGB
import React, { useState, useEffect, useRef } from "react";
import { API_BASE, apiFetch } from "../../config/api";

const CANALI = ["Telefono", "WhatsApp", "Walk-in", "Email", "Altro"];
const OCCASIONI = ["", "Compleanno", "Anniversario", "Laurea", "Cresima", "Battesimo", "Cena aziendale", "Altro"];

export default function PrenotazioniForm({ defaultData, onClose, onSuccess }) {
  const [form, setForm] = useState({
    data_pasto: defaultData || new Date().toISOString().slice(0, 10),
    ora_pasto: "20:00",
    pax: 2,
    canale: "Telefono",
    tavolo: "",
    nota_ristorante: "",
    nota_cliente: "",
    occasione: "",
    allergie_segnalate: "",
    tavolo_esterno: 0,
    seggioloni: "",
    cliente_id: null,
    nuovo_nome: "",
    nuovo_cognome: "",
    nuovo_telefono: "",
    nuovo_email: "",
  });

  const [slotPranzo, setSlotPranzo] = useState([]);
  const [slotCena, setSlotCena] = useState([]);
  const [soglia, setSoglia] = useState("15:00");
  const [searchQ, setSearchQ] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [selectedCliente, setSelectedCliente] = useState(null);
  const [showNuovo, setShowNuovo] = useState(false);
  const [tavoli, setTavoli] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const searchRef = useRef(null);
  const searchTimeout = useRef(null);

  // Carica config
  useEffect(() => {
    apiFetch(`${API_BASE}/prenotazioni/config`)
      .then((r) => r.json())
      .then((d) => {
        const cfg = {};
        d.config.forEach((c) => { cfg[c.chiave] = c.valore; });
        try { setSlotPranzo(JSON.parse(cfg.slot_pranzo || "[]")); } catch { setSlotPranzo([]); }
        try { setSlotCena(JSON.parse(cfg.slot_cena || "[]")); } catch { setSlotCena([]); }
        setSoglia(cfg.soglia_pranzo_cena || "15:00");
      })
      .catch(() => {});
  }, []);

  // Carica tavoli disponibili
  useEffect(() => {
    const turno = form.ora_pasto < soglia ? "pranzo" : "cena";
    apiFetch(`${API_BASE}/prenotazioni/tavoli/disponibili/${form.data_pasto}/${turno}`)
      .then((r) => r.json())
      .then((d) => setTavoli(d.tavoli || []))
      .catch(() => setTavoli([]));
  }, [form.data_pasto, form.ora_pasto, soglia]);

  // Autocomplete clienti
  useEffect(() => {
    if (searchQ.length < 2) { setSearchResults([]); return; }
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    searchTimeout.current = setTimeout(() => {
      apiFetch(`${API_BASE}/prenotazioni/clienti/search?q=${encodeURIComponent(searchQ)}`)
        .then((r) => r.json())
        .then((d) => setSearchResults(d.clienti || []))
        .catch(() => setSearchResults([]));
    }, 300);
  }, [searchQ]);

  const turnoCorrente = form.ora_pasto < soglia ? "pranzo" : "cena";
  const slotCorrente = turnoCorrente === "pranzo" ? slotPranzo : slotCena;

  const selezionaCliente = (c) => {
    setSelectedCliente(c);
    setForm({ ...form, cliente_id: c.id });
    setSearchQ(`${c.nome} ${c.cognome}`);
    setSearchResults([]);
    setShowNuovo(false);
  };

  const resetCliente = () => {
    setSelectedCliente(null);
    setForm({ ...form, cliente_id: null, nuovo_nome: "", nuovo_cognome: "", nuovo_telefono: "", nuovo_email: "" });
    setSearchQ("");
    setShowNuovo(false);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.cliente_id && !form.nuovo_cognome) {
      alert("Seleziona un cliente o inserisci i dati per crearne uno nuovo.");
      return;
    }
    setSubmitting(true);
    try {
      const r = await apiFetch(`${API_BASE}/prenotazioni/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (r.ok) {
        onSuccess();
      } else {
        const err = await r.json();
        alert(err.detail || "Errore nella creazione");
      }
    } catch {
      alert("Errore di connessione");
    }
    setSubmitting(false);
  };

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-start justify-center pt-8 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-4 mb-8">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-neutral-200">
          <h2 className="text-lg font-bold text-neutral-800">Nuova Prenotazione</h2>
          <button onClick={onClose} className="text-neutral-400 hover:text-neutral-600 text-xl">✕</button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {/* Data e Ora */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-neutral-600 mb-1">Data</label>
              <input
                type="date"
                value={form.data_pasto}
                onChange={(e) => setForm({ ...form, data_pasto: e.target.value })}
                className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-sm"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-neutral-600 mb-1">
                Ora <span className="text-neutral-400">({turnoCorrente})</span>
              </label>
              <div className="flex gap-1 flex-wrap">
                {slotCorrente.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setForm({ ...form, ora_pasto: s })}
                    className={`px-2 py-1 text-xs rounded border transition ${
                      form.ora_pasto === s
                        ? "bg-indigo-600 text-white border-indigo-600"
                        : "bg-white text-neutral-600 border-neutral-300 hover:bg-neutral-50"
                    }`}
                  >
                    {s}
                  </button>
                ))}
                <input
                  type="time"
                  value={form.ora_pasto}
                  onChange={(e) => setForm({ ...form, ora_pasto: e.target.value })}
                  className="px-2 py-1 text-xs border border-neutral-300 rounded ml-1 w-20"
                />
              </div>
            </div>
          </div>

          {/* Pax e Canale */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-neutral-600 mb-1">Persone</label>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setForm({ ...form, pax: Math.max(1, form.pax - 1) })}
                  className="w-8 h-8 rounded-lg border border-neutral-300 text-lg hover:bg-neutral-50"
                >
                  −
                </button>
                <span className="text-lg font-bold w-8 text-center">{form.pax}</span>
                <button
                  type="button"
                  onClick={() => setForm({ ...form, pax: Math.min(50, form.pax + 1) })}
                  className="w-8 h-8 rounded-lg border border-neutral-300 text-lg hover:bg-neutral-50"
                >
                  +
                </button>
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-neutral-600 mb-1">Canale</label>
              <select
                value={form.canale}
                onChange={(e) => setForm({ ...form, canale: e.target.value })}
                className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-sm"
              >
                {CANALI.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          </div>

          {/* Cliente autocomplete */}
          <div>
            <label className="block text-xs font-medium text-neutral-600 mb-1">Cliente</label>
            {selectedCliente ? (
              <div className="flex items-center justify-between bg-indigo-50 border border-indigo-200 rounded-lg px-3 py-2">
                <div>
                  <span className="font-medium text-indigo-900">{selectedCliente.nome} {selectedCliente.cognome}</span>
                  {selectedCliente.telefono && <span className="ml-2 text-sm text-neutral-500">{selectedCliente.telefono}</span>}
                  {selectedCliente.vip === 1 && <span className="ml-1">⭐</span>}
                  <span className="ml-2 text-xs text-neutral-400">{selectedCliente.visite_totali} visite</span>
                </div>
                <button type="button" onClick={resetCliente} className="text-neutral-400 hover:text-red-500">✕</button>
              </div>
            ) : (
              <div className="relative" ref={searchRef}>
                <input
                  type="text"
                  value={searchQ}
                  onChange={(e) => setSearchQ(e.target.value)}
                  placeholder="Cerca per nome, cognome, telefono..."
                  className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-sm"
                />
                {searchResults.length > 0 && (
                  <div className="absolute z-10 w-full mt-1 bg-white border border-neutral-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                    {searchResults.map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => selezionaCliente(c)}
                        className="w-full px-3 py-2 text-left hover:bg-indigo-50 text-sm border-b border-neutral-100 last:border-0"
                      >
                        <span className="font-medium">{c.nome} {c.cognome}</span>
                        {c.telefono && <span className="ml-2 text-neutral-400">{c.telefono}</span>}
                        {c.vip === 1 && <span className="ml-1">⭐</span>}
                        <span className="ml-2 text-xs text-neutral-400">{c.visite_totali}v</span>
                        {c.allergie && <span className="ml-1 text-xs text-red-500">⚠️</span>}
                      </button>
                    ))}
                  </div>
                )}
                {!showNuovo && searchQ.length >= 2 && (
                  <button
                    type="button"
                    onClick={() => setShowNuovo(true)}
                    className="mt-1 text-xs text-indigo-600 hover:underline"
                  >
                    + Crea nuovo cliente
                  </button>
                )}
              </div>
            )}

            {/* Avviso allergie */}
            {selectedCliente?.allergie && (
              <div className="mt-1 px-3 py-1.5 bg-amber-50 border border-amber-200 rounded text-xs text-amber-800">
                ⚠️ Allergie: {selectedCliente.allergie}
              </div>
            )}
            {selectedCliente?.restrizioni_dietetiche && (
              <div className="mt-1 px-3 py-1.5 bg-amber-50 border border-amber-200 rounded text-xs text-amber-800">
                🥗 Restrizioni: {selectedCliente.restrizioni_dietetiche}
              </div>
            )}

            {/* Form nuovo cliente */}
            {showNuovo && !selectedCliente && (
              <div className="mt-2 p-3 bg-neutral-50 border border-neutral-200 rounded-lg space-y-2">
                <div className="text-xs font-medium text-neutral-600">Nuovo cliente</div>
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="text"
                    placeholder="Nome"
                    value={form.nuovo_nome}
                    onChange={(e) => setForm({ ...form, nuovo_nome: e.target.value })}
                    className="px-2 py-1.5 border border-neutral-300 rounded text-sm"
                  />
                  <input
                    type="text"
                    placeholder="Cognome *"
                    value={form.nuovo_cognome}
                    onChange={(e) => setForm({ ...form, nuovo_cognome: e.target.value })}
                    className="px-2 py-1.5 border border-neutral-300 rounded text-sm"
                    required={showNuovo && !form.cliente_id}
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="tel"
                    placeholder="Telefono"
                    value={form.nuovo_telefono}
                    onChange={(e) => setForm({ ...form, nuovo_telefono: e.target.value })}
                    className="px-2 py-1.5 border border-neutral-300 rounded text-sm"
                  />
                  <input
                    type="email"
                    placeholder="Email"
                    value={form.nuovo_email}
                    onChange={(e) => setForm({ ...form, nuovo_email: e.target.value })}
                    className="px-2 py-1.5 border border-neutral-300 rounded text-sm"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Tavolo */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-neutral-600 mb-1">Tavolo</label>
              <select
                value={form.tavolo}
                onChange={(e) => setForm({ ...form, tavolo: e.target.value })}
                className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-sm"
              >
                <option value="">— Assegna dopo —</option>
                {tavoli.map((t) => (
                  <option key={t.id} value={t.nome} disabled={t.occupato}>
                    {t.nome} ({t.zona}, {t.posti_min}-{t.posti_max}p){t.occupato ? " — OCCUPATO" : ""}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex items-end gap-3">
              <label className="flex items-center gap-1.5 text-sm">
                <input
                  type="checkbox"
                  checked={form.tavolo_esterno === 1}
                  onChange={(e) => setForm({ ...form, tavolo_esterno: e.target.checked ? 1 : 0 })}
                />
                🌳 Esterno
              </label>
              <div>
                <label className="block text-xs font-medium text-neutral-600 mb-1">Seggioloni</label>
                <input
                  type="number"
                  min={0}
                  max={5}
                  value={form.seggioloni}
                  onChange={(e) => setForm({ ...form, seggioloni: e.target.value })}
                  className="w-16 px-2 py-2 border border-neutral-300 rounded-lg text-sm"
                />
              </div>
            </div>
          </div>

          {/* Note e occasione */}
          <div>
            <label className="block text-xs font-medium text-neutral-600 mb-1">Note staff (interne)</label>
            <textarea
              value={form.nota_ristorante}
              onChange={(e) => setForm({ ...form, nota_ristorante: e.target.value })}
              className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-sm"
              rows={2}
              placeholder="Note per cucina/sala..."
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-neutral-600 mb-1">Note / richieste cliente</label>
            <textarea
              value={form.nota_cliente}
              onChange={(e) => setForm({ ...form, nota_cliente: e.target.value })}
              className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-sm"
              rows={2}
              placeholder="Richieste speciali del cliente..."
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-neutral-600 mb-1">Occasione</label>
              <select
                value={form.occasione}
                onChange={(e) => setForm({ ...form, occasione: e.target.value })}
                className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-sm"
              >
                {OCCASIONI.map((o) => <option key={o} value={o}>{o || "— Nessuna —"}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-neutral-600 mb-1">Allergie segnalate</label>
              <input
                type="text"
                value={form.allergie_segnalate}
                onChange={(e) => setForm({ ...form, allergie_segnalate: e.target.value })}
                className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-sm"
                placeholder="Es. celiaco, lattosio..."
              />
            </div>
          </div>

          {/* Submit */}
          <div className="flex justify-end gap-2 pt-2 border-t border-neutral-100">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm text-neutral-600 border border-neutral-300 rounded-lg hover:bg-neutral-50"
            >
              Annulla
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-4 py-2 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 font-medium disabled:opacity-50"
            >
              {submitting ? "Salvataggio..." : "Salva Prenotazione"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
