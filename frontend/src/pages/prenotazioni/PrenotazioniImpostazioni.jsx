// @version: v1.0-prenotazioni-impostazioni
// Impostazioni modulo Prenotazioni — slot, capienza, template
import React, { useState, useEffect } from "react";
import { API_BASE, apiFetch } from "../../config/api";
import PrenotazioniNav from "./PrenotazioniNav";

export default function PrenotazioniImpostazioni() {
  const [config, setConfig] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState(null);

  useEffect(() => {
    apiFetch(`${API_BASE}/prenotazioni/config`)
      .then((r) => r.json())
      .then((d) => {
        const cfg = {};
        d.config.forEach((c) => { cfg[c.chiave] = c.valore; });
        setConfig(cfg);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const update = (chiave, valore) => {
    setConfig({ ...config, [chiave]: valore });
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

  const GIORNI_CHIUSURA = [
    { v: "0", l: "Nessuno" },
    { v: "1", l: "Domenica" },
    { v: "2", l: "Lunedì" },
    { v: "3", l: "Martedì" },
    { v: "4", l: "Mercoledì" },
    { v: "5", l: "Giovedì" },
    { v: "6", l: "Venerdì" },
    { v: "7", l: "Sabato" },
  ];

  return (
    <div className="min-h-screen bg-neutral-100">
      <PrenotazioniNav current="impostazioni" />

      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6 space-y-6">
        {toast && (
          <div className={`px-4 py-2 rounded-lg text-sm font-medium ${
            toast.type === "ok" ? "bg-emerald-100 text-emerald-800" : "bg-red-100 text-red-800"
          }`}>
            {toast.text}
          </div>
        )}

        {/* Capienza */}
        <div className="bg-white rounded-xl border border-neutral-200 p-5">
          <h3 className="font-semibold text-neutral-800 mb-3">Capienza</h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-neutral-600 mb-1">Max coperti pranzo</label>
              <input
                type="number"
                value={config.capienza_pranzo || ""}
                onChange={(e) => update("capienza_pranzo", e.target.value)}
                className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-neutral-600 mb-1">Max coperti cena</label>
              <input
                type="number"
                value={config.capienza_cena || ""}
                onChange={(e) => update("capienza_cena", e.target.value)}
                className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-sm"
              />
            </div>
          </div>
        </div>

        {/* Slot orari */}
        <div className="bg-white rounded-xl border border-neutral-200 p-5">
          <h3 className="font-semibold text-neutral-800 mb-3">Slot orari</h3>
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-neutral-600 mb-1">Slot pranzo (JSON array)</label>
              <input
                type="text"
                value={config.slot_pranzo || ""}
                onChange={(e) => update("slot_pranzo", e.target.value)}
                className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-sm font-mono"
                placeholder='["12:00","12:30","13:00","13:30"]'
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-neutral-600 mb-1">Slot cena (JSON array)</label>
              <input
                type="text"
                value={config.slot_cena || ""}
                onChange={(e) => update("slot_cena", e.target.value)}
                className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-sm font-mono"
                placeholder='["19:30","20:00","20:30","21:00"]'
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-neutral-600 mb-1">Soglia pranzo/cena</label>
                <input
                  type="time"
                  value={config.soglia_pranzo_cena || "15:00"}
                  onChange={(e) => update("soglia_pranzo_cena", e.target.value)}
                  className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-neutral-600 mb-1">Giorno di chiusura</label>
                <select
                  value={config.giorno_chiusura || "3"}
                  onChange={(e) => update("giorno_chiusura", e.target.value)}
                  className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-sm"
                >
                  {GIORNI_CHIUSURA.map((g) => (
                    <option key={g.v} value={g.v}>{g.l}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>
        </div>

        {/* Template messaggi */}
        <div className="bg-white rounded-xl border border-neutral-200 p-5">
          <h3 className="font-semibold text-neutral-800 mb-3">Template messaggi WhatsApp</h3>
          <p className="text-xs text-neutral-500 mb-3">
            Variabili: {"{nome}"}, {"{cognome}"}, {"{pax}"}, {"{data}"}, {"{ora}"}
          </p>
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-neutral-600 mb-1">Conferma</label>
              <textarea
                value={config.template_wa_conferma || ""}
                onChange={(e) => update("template_wa_conferma", e.target.value)}
                className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-sm"
                rows={3}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-neutral-600 mb-1">Reminder</label>
              <textarea
                value={config.template_wa_reminder || ""}
                onChange={(e) => update("template_wa_reminder", e.target.value)}
                className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-sm"
                rows={3}
              />
            </div>
          </div>
        </div>

        {/* Widget (futuro) */}
        <div className="bg-white rounded-xl border border-neutral-200 p-5 opacity-60">
          <h3 className="font-semibold text-neutral-800 mb-2">Widget pubblico</h3>
          <p className="text-sm text-neutral-500">Configurazione widget disponibile dalla Fase 3</p>
          <div className="mt-2">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={config.widget_attivo === "1"} disabled className="rounded" />
              Widget attivo
            </label>
          </div>
        </div>

        {/* Salva */}
        <div className="flex justify-end">
          <button
            onClick={save}
            disabled={saving}
            className="px-6 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 font-medium text-sm disabled:opacity-50"
          >
            {saving ? "Salvataggio..." : "Salva configurazione"}
          </button>
        </div>
      </div>
    </div>
  );
}
