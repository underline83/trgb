// @version: v2.0-sidebar-layout
// Impostazioni Prenotazioni — sidebar sinistra + sezioni (capienza, slot, template, widget)
import React, { useState, useEffect } from "react";
import { API_BASE, apiFetch } from "../../config/api";
import PrenotazioniNav from "./PrenotazioniNav";

// ── Sidebar items ──
const SECTIONS = [
  { key: "capienza", label: "Capienza & Turni", icon: "🪑", desc: "Coperti max, soglia turni, chiusura" },
  { key: "slot",     label: "Slot Orari",       icon: "🕐", desc: "Orari prenotabili pranzo e cena" },
  { key: "template", label: "Template Messaggi", icon: "💬", desc: "WhatsApp conferma e reminder" },
  { key: "widget",   label: "Widget Pubblico",   icon: "🌐", desc: "Prenotazioni dal sito (Fase 3)" },
];

const GIORNI_CHIUSURA = [
  { v: "0", l: "Nessuno (aperto tutti i giorni)" },
  { v: "1", l: "Domenica" },
  { v: "2", l: "Lunedì" },
  { v: "3", l: "Martedì" },
  { v: "4", l: "Mercoledì" },
  { v: "5", l: "Giovedì" },
  { v: "6", l: "Venerdì" },
  { v: "7", l: "Sabato" },
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
            <button
              type="button"
              onClick={() => removeSlot(idx)}
              className="ml-0.5 text-indigo-400 hover:text-red-500 transition text-xs leading-none"
              title="Rimuovi"
            >
              ✕
            </button>
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
        <button
          type="button"
          onClick={addSlot}
          disabled={!newSlot.trim()}
          className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-indigo-600 text-white hover:bg-indigo-700 shadow-sm transition disabled:opacity-40"
        >
          + Aggiungi
        </button>
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
    <div className="min-h-screen bg-neutral-100">
      <PrenotazioniNav current="impostazioni" />
      <div className="text-center py-12 text-neutral-400">Caricamento...</div>
    </div>
  );

  return (
    <div className="min-h-screen bg-neutral-50">
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
                    className={`w-full text-left px-3 py-2.5 rounded-lg transition flex items-start gap-2.5 ${
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
              <button
                onClick={save}
                disabled={saving || !dirty}
                className={`w-full px-4 py-2.5 rounded-lg font-medium text-sm transition shadow-sm ${
                  dirty
                    ? "bg-indigo-600 text-white hover:bg-indigo-700"
                    : "bg-neutral-200 text-neutral-400 cursor-not-allowed"
                }`}
              >
                {saving ? "Salvataggio..." : dirty ? "Salva modifiche" : "Nessuna modifica"}
              </button>
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
            <p className="text-[11px] text-neutral-400 mt-1">Usato per calcolo saturazione</p>
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
            <p className="text-[11px] text-neutral-400 mt-1">Usato per calcolo saturazione</p>
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
              value={config.giorno_chiusura || "4"}
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
        <p className="text-[11px] text-neutral-400 mt-2">Utile per Fase 2 (mappa tavoli) — stima rotazione</p>
      </div>
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
  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-bold text-neutral-800 mb-1">Widget Pubblico</h3>
        <p className="text-sm text-neutral-500 mb-4">
          Il widget di prenotazione integrabile nel sito web dell'osteria.
        </p>
      </div>

      <div className="bg-neutral-100 border border-neutral-200 rounded-xl p-8 text-center">
        <div className="text-4xl mb-3">🚧</div>
        <h4 className="font-semibold text-neutral-600 mb-2">In arrivo — Fase 3</h4>
        <p className="text-sm text-neutral-500 max-w-md mx-auto">
          Il widget pubblico permettera' ai clienti di prenotare direttamente dal sito.
          Qui potrai configurare aspetto, orari disponibili, e campi del form.
        </p>
        <div className="mt-4 inline-flex items-center gap-2 px-3 py-1.5 bg-white border border-neutral-200 rounded-lg text-xs text-neutral-500">
          <input type="checkbox" checked={config.widget_attivo === "1"} disabled className="rounded" />
          Widget attivo
        </div>
      </div>
    </div>
  );
}
