// @version: v2.11 — posti di una prolunga; v2.10 — online automatico (modalità, soglia tavolo, giorni); v2.9 — prolunghe disponibili; v2.8 — sale aperte di default e regole di durata del tavolo (pranzo lungo nel weekend, gruppi tutto il turno); v2.7 — indirizzo dedicato prenota.<dominio>; v2.6 — sezione «Prenotazioni dal sito» (regole, testi, email, codice per il sito); v2.5 — soglia avviso recensioni TheFork; v2.4 — giorno di chiusura con la codifica del backend (0=dom…6=sab, -1=nessuno); v2.3 — soglia «cliente frequente»; sezione TheFork (webhook B2B API: stato, registro eventi, sincronizza)
// Modulo: prenotazioni
// Impostazioni Prenotazioni — sidebar sinistra + sezioni (capienza, slot, template, widget, TheFork)
import React, { useState, useEffect } from "react";
import { API_BASE, apiFetch } from "../../config/api";
import PrenotazioniNav from "./PrenotazioniNav";
import Tooltip from "../../components/Tooltip";
import { Btn, EmptyState, StatusBadge } from "../../components/ui";

// ── Sidebar items ──
const SECTIONS = [
  { key: "capienza", label: "Capienza & Turni", icon: "🪑", desc: "Coperti max, soglia turni, chiusura" },
  { key: "slot",     label: "Slot Orari",       icon: "🕐", desc: "Orari prenotabili pranzo e cena" },
  { key: "template", label: "Template Messaggi", icon: "💬", desc: "WhatsApp conferma e reminder" },
  { key: "widget",   label: "Dal sito",          icon: "🌐", desc: "Prenotazioni dal sito: regole, email, codice da incollare" },
  { key: "thefork",  label: "TheFork",           icon: "🍴", desc: "Prenotazioni in tempo reale da TheFork Manager" },
];

// Stessa codifica del backend (prenotazioni_router.get_settimana): 0=domenica … 6=sabato, -1=nessuno.
// Prima la select usava 0=nessuno, 1=domenica…: con il valore 3 (mercoledì) mostrava «Martedì».
const GIORNI_CHIUSURA = [
  { v: "-1", l: "Nessuno (aperto tutti i giorni)" },
  { v: "1", l: "Lunedì" },
  { v: "2", l: "Martedì" },
  { v: "3", l: "Mercoledì" },
  { v: "4", l: "Giovedì" },
  { v: "5", l: "Venerdì" },
  { v: "6", l: "Sabato" },
  { v: "0", l: "Domenica" },
];

// ── Componente SlotManager ──
function SlotManager({ label, slots, onChange }) {
  const [newSlot, setNewSlot] = useState("");

  const addSlot = () => {
    const v = newSlot.trim();
    if (!v || slots.includes(v)) return;
    const updated = [...slots, v].sort();
    onChange(updated);
    setNewSlot("");
  };

  const removeSlot = (idx) => {
    const updated = slots.filter((_, i) => i !== idx);
    onChange(updated);
  };

  return (
    <div>
      <label className="block text-xs font-semibold text-neutral-700 mb-2">{label}</label>
      <div className="flex flex-wrap gap-1.5 mb-2 min-h-[36px] p-2 bg-neutral-50 border border-neutral-200 rounded-lg">
        {slots.length === 0 && (
          <span className="text-xs text-neutral-400 italic">Nessuno slot configurato</span>
        )}
        {slots.map((s, idx) => (
          <span
            key={s}
            className="inline-flex items-center gap-1 px-2.5 py-1 bg-indigo-100 text-indigo-800 rounded-full text-sm font-medium"
          >
            {s}
            <Tooltip label="Rimuovi">
              <button
                type="button"
                onClick={() => removeSlot(idx)}
                className="ml-0.5 text-indigo-400 hover:text-red-500 transition text-xs leading-none"
              >
                ✕
              </button>
            </Tooltip>
          </span>
        ))}
      </div>
      <div className="flex items-center gap-2">
        <input
          type="time"
          value={newSlot}
          onChange={(e) => setNewSlot(e.target.value)}
          className="px-3 py-1.5 border border-neutral-300 rounded-lg text-sm w-28"
        />
        <Btn variant="primary" size="sm" onClick={addSlot} disabled={!newSlot.trim()}>
          + Aggiungi
        </Btn>
      </div>
    </div>
  );
}

// ── Main ──
export default function PrenotazioniImpostazioni() {
  const [config, setConfig] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState(null);
  const [section, setSection] = useState("capienza");
  const [dirty, setDirty] = useState(false);

  // Slot come array (parse dal JSON salvato in config)
  const [slotPranzo, setSlotPranzo] = useState([]);
  const [slotCena, setSlotCena] = useState([]);

  useEffect(() => {
    apiFetch(`${API_BASE}/prenotazioni/config`)
      .then((r) => r.json())
      .then((d) => {
        const cfg = {};
        d.config.forEach((c) => { cfg[c.chiave] = c.valore; });
        setConfig(cfg);
        try { setSlotPranzo(JSON.parse(cfg.slot_pranzo || "[]")); } catch { setSlotPranzo([]); }
        try { setSlotCena(JSON.parse(cfg.slot_cena || "[]")); } catch { setSlotCena([]); }
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const update = (chiave, valore) => {
    setConfig({ ...config, [chiave]: valore });
    setDirty(true);
  };

  const updateSlotPranzo = (arr) => {
    setSlotPranzo(arr);
    setConfig((prev) => ({ ...prev, slot_pranzo: JSON.stringify(arr) }));
    setDirty(true);
  };

  const updateSlotCena = (arr) => {
    setSlotCena(arr);
    setConfig((prev) => ({ ...prev, slot_cena: JSON.stringify(arr) }));
    setDirty(true);
  };

  const save = async () => {
    setSaving(true);
    try {
      const r = await apiFetch(`${API_BASE}/prenotazioni/config`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config),
      });
      if (r.ok) {
        setToast({ type: "ok", text: "Configurazione salvata" });
        setDirty(false);
      } else {
        setToast({ type: "err", text: "Errore nel salvataggio" });
      }
    } catch {
      setToast({ type: "err", text: "Errore di connessione" });
    }
    setSaving(false);
    setTimeout(() => setToast(null), 3000);
  };

  if (loading) return (
    <div className="min-h-screen bg-brand-cream">
      <PrenotazioniNav current="impostazioni" />
      <div className="text-center py-12 text-neutral-400">Caricamento...</div>
    </div>
  );

  return (
    <div className="min-h-screen bg-brand-cream">
      <PrenotazioniNav current="impostazioni" />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
        {/* Toast */}
        {toast && (
          <div className={`mb-4 px-4 py-2 rounded-lg text-sm font-medium ${
            toast.type === "ok" ? "bg-emerald-100 text-emerald-800" : "bg-red-100 text-red-800"
          }`}>
            {toast.text}
          </div>
        )}

        <div className="flex flex-col md:flex-row gap-6">
          {/* ── Sidebar ── */}
          <div className="md:w-56 flex-shrink-0">
            <h2 className="text-xs font-bold text-neutral-400 uppercase tracking-wider mb-3 px-3">
              Impostazioni
            </h2>
            <nav className="space-y-0.5">
              {SECTIONS.map((s) => {
                const active = section === s.key;
                return (
                  <button
                    key={s.key}
                    onClick={() => setSection(s.key)}
                    className={`w-full text-left px-3 py-2.5 rounded-lg transition flex items-start gap-2.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue/40 focus-visible:ring-offset-1 ${
                      active
                        ? "bg-indigo-50 text-indigo-900 shadow-sm border border-indigo-200"
                        : "text-neutral-600 hover:bg-neutral-100 hover:text-neutral-800"
                    }`}
                  >
                    <span className="text-sm mt-0.5">{s.icon}</span>
                    <div>
                      <div className={`text-sm font-medium ${active ? "text-indigo-900" : ""}`}>{s.label}</div>
                      <div className="text-[11px] text-neutral-400 mt-0.5 leading-tight">{s.desc}</div>
                    </div>
                  </button>
                );
              })}
            </nav>

            {/* Salva — sempre visibile nella sidebar */}
            <div className="mt-6 px-3">
              <Btn
                variant="primary"
                size="md"
                onClick={save}
                disabled={saving || !dirty}
                loading={saving}
                className="w-full"
              >
                {dirty ? "Salva modifiche" : "Nessuna modifica"}
              </Btn>
            </div>
          </div>

          {/* ── Content ── */}
          <div className="flex-1 min-w-0">
            {section === "capienza" && (
              <CapienzaSection config={config} update={update} />
            )}
            {section === "slot" && (
              <SlotSection
                slotPranzo={slotPranzo}
                slotCena={slotCena}
                onChangePranzo={updateSlotPranzo}
                onChangeCena={updateSlotCena}
              />
            )}
            {section === "template" && (
              <TemplateSection config={config} update={update} />
            )}
            {section === "widget" && (
              <WidgetSection config={config} update={update} />
            )}
            {section === "thefork" && <TheForkSection />}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Sezione Capienza & Turni ──
function CapienzaSection({ config, update }) {
  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-bold text-neutral-800 mb-1">Capienza & Turni</h3>
        <p className="text-sm text-neutral-500 mb-4">Configurazione coperti massimi, soglia pranzo/cena e giorno di chiusura.</p>
      </div>

      {/* Coperti massimi */}
      <div className="bg-white rounded-xl border border-neutral-200 p-5">
        <h4 className="font-semibold text-neutral-700 mb-3 text-sm">Coperti massimi per turno</h4>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-neutral-600 mb-1">Pranzo</label>
            <input
              type="number"
              value={config.capienza_pranzo || ""}
              onChange={(e) => update("capienza_pranzo", e.target.value)}
              className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-sm focus:ring-indigo-500 focus:border-indigo-500"
              min={0}
              max={200}
            />
            <p className="text-[11px] text-neutral-400 mt-1">Vale solo senza tavoli in piantina: con i tavoli conta la somma dei posti delle sale aperte</p>
          </div>
          <div>
            <label className="block text-xs font-medium text-neutral-600 mb-1">Cena</label>
            <input
              type="number"
              value={config.capienza_cena || ""}
              onChange={(e) => update("capienza_cena", e.target.value)}
              className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-sm focus:ring-indigo-500 focus:border-indigo-500"
              min={0}
              max={200}
            />
            <p className="text-[11px] text-neutral-400 mt-1">Vale solo senza tavoli in piantina: con i tavoli conta la somma dei posti delle sale aperte</p>
          </div>
        </div>
      </div>

      {/* Soglia e chiusura */}
      <div className="bg-white rounded-xl border border-neutral-200 p-5">
        <h4 className="font-semibold text-neutral-700 mb-3 text-sm">Turni e chiusura</h4>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-neutral-600 mb-1">Soglia pranzo / cena</label>
            <input
              type="time"
              value={config.soglia_pranzo_cena || "15:00"}
              onChange={(e) => update("soglia_pranzo_cena", e.target.value)}
              className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-sm focus:ring-indigo-500 focus:border-indigo-500"
            />
            <p className="text-[11px] text-neutral-400 mt-1">Prenotazioni prima = pranzo, dopo = cena</p>
          </div>
          <div>
            <label className="block text-xs font-medium text-neutral-600 mb-1">Giorno di chiusura</label>
            <select
              value={config.giorno_chiusura ?? "3"}
              onChange={(e) => update("giorno_chiusura", e.target.value)}
              className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-sm focus:ring-indigo-500 focus:border-indigo-500"
            >
              {GIORNI_CHIUSURA.map((g) => (
                <option key={g.v} value={g.v}>{g.l}</option>
              ))}
            </select>
            <p className="text-[11px] text-neutral-400 mt-1">Evidenziato nel calendario e vista settimanale</p>
          </div>
        </div>
      </div>

      {/* Durata media */}
      <div className="bg-white rounded-xl border border-neutral-200 p-5">
        <h4 className="font-semibold text-neutral-700 mb-3 text-sm">Durata media prenotazione</h4>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-neutral-600 mb-1">Pranzo (minuti)</label>
            <input
              type="number"
              value={config.durata_pranzo || "90"}
              onChange={(e) => update("durata_pranzo", e.target.value)}
              className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-sm focus:ring-indigo-500 focus:border-indigo-500"
              min={30}
              max={300}
              step={15}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-neutral-600 mb-1">Cena (minuti)</label>
            <input
              type="number"
              value={config.durata_cena || "120"}
              onChange={(e) => update("durata_cena", e.target.value)}
              className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-sm focus:ring-indigo-500 focus:border-indigo-500"
              min={30}
              max={300}
              step={15}
            />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4 mt-4">
          <div>
            <label className="block text-xs font-medium text-neutral-600 mb-1">Pranzo «lungo» (minuti)</label>
            <input type="number" value={config.durata_pranzo_lungo ?? "120"} onChange={(e) => update("durata_pranzo_lungo", e.target.value)}
              className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-sm" min={30} max={300} step={15} />
          </div>
          <div>
            <label className="block text-xs font-medium text-neutral-600 mb-1">Gruppi da (coperti): tavolo occupato tutto il turno</label>
            <input type="number" value={config.gruppo_turno_intero ?? "10"} onChange={(e) => update("gruppo_turno_intero", e.target.value)}
              className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-sm" min={2} max={100} />
          </div>
          <div>
            <label className="block text-xs font-medium text-neutral-600 mb-1">Prolunghe che avete</label>
            <input type="number" value={config.prolunghe_disponibili ?? ""} onChange={(e) => update("prolunghe_disponibili", e.target.value)}
              placeholder="non contarle" className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-sm" min={0} max={20} />
          </div>
          <div>
            <label className="block text-xs font-medium text-neutral-600 mb-1">Posti che aggiunge una prolunga</label>
            <input type="number" value={config.posti_prolunga ?? "2"} onChange={(e) => update("posti_prolunga", e.target.value)}
              className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-sm" min={0} max={10} />
            <p className="text-[11px] text-neutral-400 mt-1">Il motore usa una combinazione anche senza qualche prolunga, con questi posti in meno per ognuna.</p>
          </div>
        </div>
        <div className="mt-4 p-3 rounded-lg border border-indigo-200 bg-indigo-50/50">
          <div className="text-xs font-semibold text-indigo-900 mb-1">🤖 Online automatico (TheFork e sito)</div>
          <p className="text-[11px] text-neutral-600 mb-2">
            Fascia per fascia il motore per tavoli tiene aperto l'online finché a quell'ora entra ancora un tavolo da N persone;
            quando non c'è più, lo chiude (anche su TheFork) e lo riapre se si libera. Le fasce cambiate a mano non le tocca.
          </p>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-medium text-neutral-600 mb-1">Modalità</label>
              <select value={config.online_automatico || "prova"} onChange={(e) => update("online_automatico", e.target.value)}
                className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-sm">
                <option value="spento">Spento</option>
                <option value="prova">In prova (mostra, non tocca)</option>
                <option value="attivo">Attivo</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-neutral-600 mb-1">Online aperto finché entra un tavolo da</label>
              <input type="number" value={config.soglia_online_tavolo ?? "6"} onChange={(e) => update("soglia_online_tavolo", e.target.value)}
                className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-sm" min={1} max={20} />
            </div>
            <div>
              <label className="block text-xs font-medium text-neutral-600 mb-1">Giorni controllati in avanti</label>
              <input type="number" value={config.online_automatico_giorni ?? "14"} onChange={(e) => update("online_automatico_giorni", e.target.value)}
                className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-sm" min={1} max={90} />
            </div>
          </div>
        </div>
        <div className="mt-3">
          <label className="block text-xs font-medium text-neutral-600 mb-1">Giorni col pranzo lungo (come la sera)</label>
          <div className="flex gap-2 flex-wrap">
            {["Lun", "Mar", "Mer", "Gio", "Ven", "Sab", "Dom"].map((g, i) => {
              let giorni = [];
              try { giorni = JSON.parse(config.giorni_pranzo_lungo || "[5,6]"); } catch { giorni = [5, 6]; }
              const on = giorni.includes(i);
              return (
                <button key={g} type="button"
                  onClick={() => update("giorni_pranzo_lungo", JSON.stringify(on ? giorni.filter((x) => x !== i) : [...giorni, i].sort()))}
                  className={`px-2.5 py-1 rounded-lg text-xs border ${on ? "bg-indigo-600 text-white border-indigo-600" : "bg-white text-neutral-600 border-neutral-300"}`}>
                  {g}
                </button>
              );
            })}
          </div>
        </div>
        <p className="text-[11px] text-neutral-400 mt-2">
          Quanto resta occupato un tavolo: serve alla barra «in sala» del Planning e alla disponibilità per tavoli.
          Nei giorni col pranzo lungo il pranzo dura come indicato sopra; i gruppi grandi non girano.
        </p>
      </div>

      <SaleDefault />

      {/* Limiti per fascia oraria (default del turno; il singolo giorno si cambia dal Planning) */}
      <div className="bg-white rounded-xl border border-neutral-200 p-5">
        <h4 className="font-semibold text-neutral-700 mb-3 text-sm">Limiti per fascia oraria</h4>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[
            ["fascia_max_coperti_pranzo", "Coperti per fascia, pranzo"],
            ["fascia_max_online_pranzo", "Online per fascia, pranzo"],
            ["fascia_max_coperti_cena", "Coperti per fascia, cena"],
            ["fascia_max_online_cena", "Online per fascia, cena"],
          ].map(([k, label]) => (
            <div key={k}>
              <label className="block text-xs font-medium text-neutral-600 mb-1">{label}</label>
              <input
                type="number"
                value={config[k] ?? ""}
                onChange={(e) => update(k, e.target.value)}
                placeholder="nessun limite"
                className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-sm focus:ring-indigo-500 focus:border-indigo-500"
                min={0}
              />
            </div>
          ))}
        </div>
        <p className="text-[11px] text-neutral-400 mt-2">Coperti che arrivano in ciascuna fascia (come «Andamento per fascia oraria» di TheFork). Vuoto = nessun limite. Per un giorno preciso: Planning → «🕒 Fasce». I limiti valgono in TRGB; su TheFork si può solo aprire o chiudere l'online.</p>
      </div>

      {/* Bollino cliente nel Planning */}
      <div className="bg-white rounded-xl border border-neutral-200 p-5">
        <h4 className="font-semibold text-neutral-700 mb-3 text-sm">Bollino cliente</h4>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-neutral-600 mb-1">«Frequente» da (visite)</label>
            <input
              type="number"
              value={config.cliente_frequente_visite || "5"}
              onChange={(e) => update("cliente_frequente_visite", e.target.value)}
              className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-sm focus:ring-indigo-500 focus:border-indigo-500"
              min={2}
              max={100}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-neutral-600 mb-1">Avviso recensioni sotto (voto su 10)</label>
            <input
              type="number"
              value={config.recensioni_soglia_avviso ?? "8"}
              onChange={(e) => update("recensioni_soglia_avviso", e.target.value)}
              placeholder="nessun avviso"
              className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-sm focus:ring-indigo-500 focus:border-indigo-500"
              min={0}
              max={10}
              step={0.5}
            />
          </div>
        </div>
        <p className="text-[11px] text-neutral-400 mt-2">Visite fatte prima di quel giorno: 0 = Prima visita, sotto la soglia = Occasionale, dalla soglia in su = Frequente. Durate medie sopra = timeline della sala nel Planning.</p>
      </div>
    </div>
  );
}

// ── Sale aperte di default (mig 214) ──
function SaleDefault() {
  const [sale, setSale] = useState(null);
  const carica = () => apiFetch(`${API_BASE}/prenotazioni/sale`).then((r) => r.json()).then((d) => setSale(d.sale || [])).catch(() => setSale([]));
  useEffect(() => { carica(); }, []);
  const cambia = async (zona, aperta) => {
    const r = await apiFetch(`${API_BASE}/prenotazioni/sale/${encodeURIComponent(zona)}/default`, {
      method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ aperta }),
    });
    if (r.ok) setSale((await r.json()).sale || []);
  };
  if (!sale || sale.length === 0) return null;
  return (
    <div className="bg-white rounded-xl border border-neutral-200 p-5">
      <h4 className="font-semibold text-neutral-700 mb-3 text-sm">Sale</h4>
      <div className="space-y-2">
        {sale.map((s) => (
          <label key={s.zona} className="flex items-center justify-between gap-3 text-sm">
            <span>
              <span className="font-medium text-neutral-800">{s.zona}</span>
              <span className="text-xs text-neutral-500 ml-2">{s.tavoli} tavoli · {s.posti_min}–{s.posti_max} posti</span>
            </span>
            <span className="flex items-center gap-2 text-xs text-neutral-600">
              {s.aperta_default ? "aperta di solito" : "chiusa di solito"}
              <input type="checkbox" checked={s.aperta_default} onChange={(e) => cambia(s.zona, e.target.checked)} />
            </span>
          </label>
        ))}
      </div>
      <p className="text-[11px] text-neutral-400 mt-2">
        Contano solo i tavoli delle sale aperte: la capienza del turno è la somma dei loro posti massimi.
        Per una sera sola (es. Veranda col bel tempo) apri o chiudi la sala dal Planning. I posti dei tavoli si cambiano in Editor Tavoli.
      </p>
    </div>
  );
}

// ── Sezione Slot Orari ──
function SlotSection({ slotPranzo, slotCena, onChangePranzo, onChangeCena }) {
  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-bold text-neutral-800 mb-1">Slot Orari</h3>
        <p className="text-sm text-neutral-500 mb-4">
          Gli orari selezionabili nel form prenotazione. Aggiungi o rimuovi slot per pranzo e cena.
          Il cliente potra' comunque inserire un orario libero.
        </p>
      </div>

      <div className="bg-white rounded-xl border border-neutral-200 p-5">
        <SlotManager
          label="Slot pranzo"
          slots={slotPranzo}
          onChange={onChangePranzo}
        />
      </div>

      <div className="bg-white rounded-xl border border-neutral-200 p-5">
        <SlotManager
          label="Slot cena"
          slots={slotCena}
          onChange={onChangeCena}
        />
      </div>

      {/* Anteprima */}
      <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-5">
        <h4 className="font-semibold text-indigo-800 mb-2 text-sm">Anteprima nel form</h4>
        <p className="text-xs text-indigo-600 mb-3">Ecco come appariranno gli slot nel form di prenotazione:</p>
        <div className="space-y-3">
          <div>
            <span className="text-xs font-medium text-indigo-700">Pranzo:</span>
            <div className="flex flex-wrap gap-1.5 mt-1">
              {slotPranzo.length === 0 && <span className="text-xs text-indigo-400 italic">nessuno</span>}
              {slotPranzo.map((s) => (
                <span key={s} className="px-2 py-1 text-xs rounded border bg-white text-neutral-600 border-neutral-300">{s}</span>
              ))}
            </div>
          </div>
          <div>
            <span className="text-xs font-medium text-indigo-700">Cena:</span>
            <div className="flex flex-wrap gap-1.5 mt-1">
              {slotCena.length === 0 && <span className="text-xs text-indigo-400 italic">nessuno</span>}
              {slotCena.map((s) => (
                <span key={s} className="px-2 py-1 text-xs rounded border bg-white text-neutral-600 border-neutral-300">{s}</span>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Sezione Template Messaggi ──
function TemplateSection({ config, update }) {
  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-bold text-neutral-800 mb-1">Template Messaggi WhatsApp</h3>
        <p className="text-sm text-neutral-500 mb-4">
          Personalizza i messaggi inviati via WhatsApp. Usa le variabili tra parentesi graffe.
        </p>
      </div>

      {/* Variabili disponibili */}
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
        <h4 className="font-semibold text-amber-800 mb-2 text-sm">Variabili disponibili</h4>
        <div className="flex flex-wrap gap-2">
          {["{nome}", "{cognome}", "{pax}", "{data}", "{ora}"].map((v) => (
            <code key={v} className="px-2 py-0.5 bg-white border border-amber-200 rounded text-xs font-mono text-amber-800">{v}</code>
          ))}
        </div>
      </div>

      {/* Conferma */}
      <div className="bg-white rounded-xl border border-neutral-200 p-5">
        <h4 className="font-semibold text-neutral-700 mb-2 text-sm">Messaggio di conferma</h4>
        <p className="text-[11px] text-neutral-400 mb-2">Inviato quando si conferma una prenotazione</p>
        <textarea
          value={config.template_wa_conferma || ""}
          onChange={(e) => update("template_wa_conferma", e.target.value)}
          className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-sm focus:ring-indigo-500 focus:border-indigo-500"
          rows={4}
          placeholder="Ciao {nome}, confermiamo la prenotazione per {pax} persone il {data} alle {ora}. A presto!"
        />
        {config.template_wa_conferma && (
          <div className="mt-2 p-2 bg-neutral-50 rounded border border-neutral-100 text-xs text-neutral-600">
            <span className="font-medium text-neutral-500">Anteprima: </span>
            {(config.template_wa_conferma || "")
              .replace("{nome}", "Marco")
              .replace("{cognome}", "Rossi")
              .replace("{pax}", "4")
              .replace("{data}", "2026-04-10")
              .replace("{ora}", "20:30")}
          </div>
        )}
      </div>

      {/* Reminder */}
      <div className="bg-white rounded-xl border border-neutral-200 p-5">
        <h4 className="font-semibold text-neutral-700 mb-2 text-sm">Messaggio reminder</h4>
        <p className="text-[11px] text-neutral-400 mb-2">Inviato come promemoria il giorno stesso</p>
        <textarea
          value={config.template_wa_reminder || ""}
          onChange={(e) => update("template_wa_reminder", e.target.value)}
          className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-sm focus:ring-indigo-500 focus:border-indigo-500"
          rows={4}
          placeholder="Ciao {nome}, ti ricordiamo la prenotazione di oggi alle {ora} per {pax} persone. Vi aspettiamo!"
        />
        {config.template_wa_reminder && (
          <div className="mt-2 p-2 bg-neutral-50 rounded border border-neutral-100 text-xs text-neutral-600">
            <span className="font-medium text-neutral-500">Anteprima: </span>
            {(config.template_wa_reminder || "")
              .replace("{nome}", "Marco")
              .replace("{cognome}", "Rossi")
              .replace("{pax}", "4")
              .replace("{data}", "2026-04-10")
              .replace("{ora}", "20:30")}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Sezione Widget (placeholder Fase 3) ──
function WidgetSection({ config, update }) {
  const base = (config.widget_url_pubblico || window.location.origin).replace(/\/$/, "");
  // Sull'indirizzo dedicato (prenota.<dominio>) la pagina è la radice
  const url = /\/\/prenota\./.test(base) ? base : `${base}/prenota`;
  const snippet = `<iframe id="trgb-prenota" src="${url}" style="width:100%;border:0;min-height:720px" title="Prenota"></iframe>
<script>
window.addEventListener("message", function (e) {
  if (e.data && e.data.type === "trgb-prenota-altezza")
    document.getElementById("trgb-prenota").style.height = e.data.altezza + "px";
});
</script>`;
  const [copiato, setCopiato] = useState(false);
  const campo = (k, label, props = {}) => (
    <div>
      <label className="block text-xs font-medium text-neutral-600 mb-1">{label}</label>
      <input value={config[k] ?? ""} onChange={(e) => update(k, e.target.value)}
        className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-sm focus:ring-indigo-500 focus:border-indigo-500" {...props} />
    </div>
  );
  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-bold text-neutral-800 mb-1">Prenotazioni dal sito</h3>
        <p className="text-sm text-neutral-500 mb-4">
          La pagina pubblica dove i clienti prenotano da soli: vedono solo i giorni e gli orari liberi
          (fasce aperte online, limiti per fascia, capienza del turno, chiusure del calendario).
        </p>
      </div>

      <div className="bg-white rounded-xl border border-neutral-200 p-5 space-y-3">
        <label className="flex items-center gap-2 text-sm font-medium text-neutral-800">
          <input type="checkbox" checked={config.widget_attivo === "1"} onChange={(e) => update("widget_attivo", e.target.checked ? "1" : "0")} />
          Prenotazioni dal sito attive
        </label>
        <p className="text-[11px] text-neutral-500">Finché è spento la pagina dice «non attive»; tu, entrato nel gestionale, la vedi in anteprima e puoi provarla.</p>
        <a href={url} target="_blank" rel="noreferrer" className="inline-block text-sm text-indigo-700 hover:underline">Apri la pagina ↗ {url}</a>
      </div>

      <div className="bg-white rounded-xl border border-neutral-200 p-5">
        <h4 className="font-semibold text-neutral-700 mb-3 text-sm">Regole</h4>
        <div className="grid grid-cols-2 gap-4">
          {campo("widget_max_automatica", "Confermate subito fino a (persone)", { type: "number", min: 1 })}
          {campo("widget_max_richiesta", "Richiesta da accettare fino a (persone)", { type: "number", min: 1 })}
          {campo("giorni_anticipo_max", "Prenotabili fino a (giorni avanti)", { type: "number", min: 1 })}
          {campo("giorni_anticipo_min_ore", "Almeno (ore prima)", { type: "number", min: 0 })}
        </div>
        <p className="text-[11px] text-neutral-400 mt-2">
          Oltre il primo numero la prenotazione arriva nel Planning come «NUOVA» da confermare o rifiutare (il cliente riceve l'email).
          Oltre il secondo la pagina chiede di telefonare. Gli orari sono le fasce di «Slot Orari»; chiusure e limiti per fascia valgono anche qui.
        </p>
      </div>

      <div className="bg-white rounded-xl border border-neutral-200 p-5">
        <h4 className="font-semibold text-neutral-700 mb-3 text-sm">Testi e email</h4>
        <div className="grid grid-cols-2 gap-4">
          {campo("widget_telefono", "Telefono mostrato", { placeholder: "035 …" })}
          {campo("widget_ora_promemoria", "Promemoria il giorno prima alle", { placeholder: "10:00 (vuoto = niente)" })}
        </div>
        <div className="mt-3">{campo("widget_nota", "Nota sopra il modulo", { placeholder: "Es. «Il tavolo resta a disposizione due ore»" })}</div>
        <div className="mt-3">{campo("widget_messaggio_pieno", "Messaggio quando un giorno è pieno")}</div>
        <label className="flex items-center gap-2 text-sm mt-3">
          <input type="checkbox" checked={(config.widget_email_attive ?? "1") === "1"} onChange={(e) => update("widget_email_attive", e.target.checked ? "1" : "0")} />
          Email automatiche ai clienti (conferma, richiesta, accettata/rifiutata, promemoria, annullamento) in italiano o inglese
        </label>
        <div className="mt-3">{campo("widget_url_pubblico", "Indirizzo pubblico della pagina (link nelle email e codice per il sito)", { placeholder: "https://prenota.tregobbi.it" })}</div>
        <p className="text-[11px] text-neutral-400 mt-1">Con l'indirizzo dedicato (prenota.tregobbi.it) i clienti non vedono mai l'indirizzo del gestionale. L'anteprima a prenotazioni spente funziona solo da app.tregobbi.it/prenota.</p>
      </div>

      <div className="bg-white rounded-xl border border-neutral-200 p-5 space-y-2">
        <h4 className="font-semibold text-neutral-700 text-sm">Nel sito</h4>
        <p className="text-xs text-neutral-500">Il modo più semplice è un bottone «Prenota» che apre <code>{url}</code>. Per averlo dentro la pagina del sito, incolla questo codice (l'altezza si adatta da sola):</p>
        <pre className="text-[11px] bg-neutral-50 border border-neutral-200 rounded p-2 overflow-x-auto whitespace-pre">{snippet}</pre>
        <button onClick={() => { navigator.clipboard?.writeText(snippet); setCopiato(true); setTimeout(() => setCopiato(false), 2000); }}
          className="text-xs px-2.5 py-1 rounded border border-indigo-300 text-indigo-700 hover:bg-indigo-50">{copiato ? "Copiato ✓" : "Copia il codice"}</button>
      </div>
    </div>
  );
}

// ── Sezione TheFork (webhook B2B API) ──
// Le credenziali e il token del webhook stanno nel .env del server, non qui:
// la pagina mostra lo stato, il registro eventi e i comandi di recupero.
const TF_STATI = {
  fatto:     { tone: "success", label: "Fatto" },
  ignorato:  { tone: "neutral", label: "Ignorato" },
  in_attesa: { tone: "warning", label: "In attesa" },
  errore:    { tone: "danger",  label: "Errore" },
  ricevuto:  { tone: "info",    label: "Ricevuto" },
};

function oggiIso(deltaGiorni = 0) {
  const d = new Date();
  d.setDate(d.getDate() + deltaGiorni);
  return d.toISOString().slice(0, 10);
}

function TheForkSection() {
  const [stato, setStato] = useState(null);
  const [eventi, setEventi] = useState([]);
  const [filtro, setFiltro] = useState("");
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState(null);
  const [dal, setDal] = useState(oggiIso(-7));
  const [al, setAl] = useState(oggiIso(0));
  const [filtroData, setFiltroData] = useState("updatedDate");

  const carica = async () => {
    try {
      const [rs, re] = await Promise.all([
        apiFetch(`${API_BASE}/prenotazioni/thefork/stato`),
        apiFetch(`${API_BASE}/prenotazioni/thefork/eventi?limite=100${filtro ? `&stato=${filtro}` : ""}`),
      ]);
      if (rs.ok) setStato(await rs.json());
      if (re.ok) setEventi((await re.json()).eventi || []);
    } catch {
      setMsg({ type: "err", text: "Errore di connessione" });
    }
  };

  useEffect(() => { carica(); }, [filtro]); // eslint-disable-line react-hooks/exhaustive-deps

  const azione = async (chiave, url, body) => {
    setBusy(chiave);
    setMsg(null);
    try {
      const r = await apiFetch(`${API_BASE}${url}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: body ? JSON.stringify(body) : undefined,
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) {
        setMsg({ type: "err", text: d.detail || `Errore ${r.status}` });
      } else if (chiave === "prova") {
        setMsg({ type: "ok", text: `Connessione ok — permessi: ${d.scope || "—"}` });
      } else if (chiave === "elabora") {
        setMsg({ type: "ok", text: `Rielaborati ${d.elaborati} eventi` });
      } else if (chiave === "sync") {
        setMsg({ type: "ok", text: `In coda ${d.accodate} prenotazioni su ${d.totale_su_thefork}${d.troncato ? " (troncato)" : ""} — si aggiornano in pochi minuti` });
      } else {
        setMsg({ type: "ok", text: d.esito || d.ultimo_errore || "Fatto" });
      }
    } catch {
      setMsg({ type: "err", text: "Errore di connessione" });
    }
    setBusy("");
    carica();
  };

  const conteggi = stato?.eventi_per_stato || {};
  const inSospeso = (conteggi.in_attesa || 0) + (conteggi.errore || 0) + (conteggi.ricevuto || 0);

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-bold text-neutral-800 mb-1">TheFork</h3>
        <p className="text-sm text-neutral-500 mb-4">
          TheFork Manager avvisa TRGB a ogni prenotazione o cliente nuovo o modificato: la prenotazione
          entra in agenda da sola, con gli stessi dati dell'import Excel. Credenziali e token stanno nel
          file <code className="text-xs">.env</code> del server.
        </p>
      </div>

      {msg && (
        <div className={`px-4 py-2 rounded-lg text-sm font-medium ${
          msg.type === "ok" ? "bg-emerald-100 text-emerald-800" : "bg-red-100 text-red-800"
        }`}>{msg.text}</div>
      )}

      {/* Stato collegamento */}
      <div className="bg-white rounded-xl border border-neutral-200 p-5 space-y-3">
        <h4 className="font-semibold text-neutral-700 text-sm">Collegamento</h4>
        {!stato ? (
          <div className="text-sm text-neutral-400">Caricamento…</div>
        ) : (
          <>
            <div className="flex flex-wrap gap-2">
              <StatusBadge tone={stato.token_webhook_configurato ? "success" : "danger"} dot>
                Webhook {stato.token_webhook_configurato ? "attivo" : "spento (manca il token)"}
              </StatusBadge>
              <StatusBadge tone={stato.credenziali_presenti ? "success" : "warning"} dot>
                Credenziali API {stato.credenziali_presenti ? "presenti" : "non ancora arrivate"}
              </StatusBadge>
            </div>
            <dl className="grid grid-cols-1 sm:grid-cols-[10rem_1fr] gap-x-4 gap-y-1 text-sm">
              <dt className="text-neutral-500">Indirizzo webhook</dt>
              <dd className="font-mono text-xs break-all text-neutral-800">{stato.webhook_url}</dd>
              <dt className="text-neutral-500">Ristorante TheFork</dt>
              <dd className="font-mono text-xs break-all text-neutral-800">{stato.restaurant_uuid || "—"}</dd>
              <dt className="text-neutral-500">Ultimo avviso</dt>
              <dd className="text-neutral-800">{stato.ultimo_webhook_at || "nessuno finora"}</dd>
              <dt className="text-neutral-500">Recupero automatico</dt>
              <dd className="text-neutral-800">
                {stato.recupero_automatico?.ogni_minuti
                  ? `ogni ${stato.recupero_automatico.ogni_minuti} min · ` +
                    (stato.recupero_automatico.ultimo
                      ? `ultimo ${stato.recupero_automatico.ultimo}: ${stato.recupero_automatico.controllate ?? 0} controllate, ${stato.recupero_automatico.corrette ?? 0} corrette` +
                        (stato.recupero_automatico.errore ? ` — errore: ${stato.recupero_automatico.errore}` : "")
                      : "primo giro 5 minuti dopo l'avvio")
                  : "spento"}
              </dd>
            </dl>
            <div className="flex flex-wrap gap-2 pt-1">
              <Btn variant="secondary" size="md" onClick={() => azione("prova", "/prenotazioni/thefork/prova-connessione")}
                   loading={busy === "prova"} disabled={!!busy || !stato.credenziali_presenti}>
                Prova connessione
              </Btn>
              <Btn variant="secondary" size="md" onClick={() => azione("elabora", "/prenotazioni/thefork/elabora")}
                   loading={busy === "elabora"} disabled={!!busy || !stato.credenziali_presenti || inSospeso === 0}>
                Rielabora in sospeso ({inSospeso})
              </Btn>
            </div>
          </>
        )}
      </div>

      {/* Recupero periodo */}
      <div className="bg-white rounded-xl border border-neutral-200 p-5 space-y-3">
        <h4 className="font-semibold text-neutral-700 text-sm">Recupera un periodo</h4>
        <p className="text-[11px] text-neutral-400">
          Se TRGB è rimasto spento o un avviso è andato perso (TheFork non lo rimanda), rilegge da TheFork
          le prenotazioni del periodo. Serve anche per il primo allineamento.
        </p>
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="block text-xs font-medium text-neutral-600 mb-1">Dal</label>
            <input type="date" value={dal} onChange={(e) => setDal(e.target.value)}
                   className="px-3 py-2 border border-neutral-300 rounded-lg text-sm" />
          </div>
          <div>
            <label className="block text-xs font-medium text-neutral-600 mb-1">Al</label>
            <input type="date" value={al} onChange={(e) => setAl(e.target.value)}
                   className="px-3 py-2 border border-neutral-300 rounded-lg text-sm" />
          </div>
          <div>
            <label className="block text-xs font-medium text-neutral-600 mb-1">Date di</label>
            <select value={filtroData} onChange={(e) => setFiltroData(e.target.value)}
                    className="px-3 py-2 border border-neutral-300 rounded-lg text-sm">
              <option value="updatedDate">modifica su TheFork</option>
              <option value="mealDate">pasto</option>
            </select>
          </div>
          <Btn variant="primary" size="md" loading={busy === "sync"}
               disabled={!!busy || !stato?.credenziali_presenti || !dal || !al}
               onClick={() => azione("sync", "/prenotazioni/thefork/sincronizza", { dal, al, filtro: filtroData })}>
            Recupera
          </Btn>
        </div>
      </div>

      {/* Registro eventi */}
      <div className="bg-white rounded-xl border border-neutral-200">
        <div className="flex flex-wrap items-center justify-between gap-2 p-4 border-b border-neutral-100">
          <h4 className="font-semibold text-neutral-700 text-sm">Registro avvisi</h4>
          <div className="flex items-center gap-2">
            <select value={filtro} onChange={(e) => setFiltro(e.target.value)}
                    className="px-3 py-2 border border-neutral-300 rounded-lg text-sm">
              <option value="">Tutti</option>
              {Object.entries(TF_STATI).map(([k, v]) => (
                <option key={k} value={k}>{v.label}{conteggi[k] ? ` (${conteggi[k]})` : ""}</option>
              ))}
            </select>
            <Btn variant="ghost" size="md" onClick={carica}>↻</Btn>
          </div>
        </div>
        {eventi.length === 0 ? (
          <EmptyState icon="🍴" title="Nessun avviso" description="Gli avvisi di TheFork compariranno qui appena arrivano." />
        ) : (
          <ul className="divide-y divide-neutral-100">
            {eventi.map((e) => {
              const st = TF_STATI[e.stato] || { tone: "neutral", label: e.stato };
              return (
                <li key={e.id} className="px-4 py-3 flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-3 text-sm min-h-[44px]">
                  <span className="text-xs text-neutral-400 sm:w-36 flex-shrink-0">{e.ricevuto_at}</span>
                  <span className="sm:w-44 flex-shrink-0 text-neutral-700">{e.event_type}</span>
                  <span className="flex-shrink-0"><StatusBadge tone={st.tone}>{st.label}</StatusBadge></span>
                  <span className="flex-1 min-w-0 text-neutral-600 break-words">
                    {e.esito || e.ultimo_errore || ""}
                  </span>
                  {(e.stato === "errore" || e.stato === "in_attesa") && (
                    <Btn variant="secondary" size="sm" loading={busy === `ev${e.id}`} disabled={!!busy}
                         onClick={() => azione(`ev${e.id}`, `/prenotazioni/thefork/eventi/${e.id}/riprova`)}>
                      Riprova
                    </Btn>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
