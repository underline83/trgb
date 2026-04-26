// @version: v1.0 — Pannello impostazioni Menu Pranzo (sessione 58, 2026-04-26)
//
// Vive dentro RicetteSettings (sidebar Impostazioni Cucina, sezione "Menu Pranzo").
// La pagina PranzoMenu non ha piu' una tab Impostazioni: rimanda qui.

import React, { useEffect, useState } from "react";
import { API_BASE, apiFetch } from "../../config/api";
import { Btn } from "../../components/ui";

export default function PranzoSettingsPanel() {
  const [settings, setSettings] = useState(null);
  const [form, setForm] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const res = await apiFetch(`${API_BASE}/pranzo/settings/`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const s = await res.json();
      setSettings(s);
      setForm(s);
    } catch (e) {
      setMsg({ tipo: "err", text: `Errore caricamento: ${e.message}` });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const update = (k, v) => setForm({ ...form, [k]: v });

  const salva = async () => {
    setSaving(true); setMsg(null);
    try {
      const res = await apiFetch(`${API_BASE}/pranzo/settings/`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          titolo_default: form.titolo_default,
          sottotitolo_default: form.sottotitolo_default,
          titolo_business: form.titolo_business,
          prezzo_1_default: Number(form.prezzo_1_default),
          prezzo_2_default: Number(form.prezzo_2_default),
          prezzo_3_default: Number(form.prezzo_3_default),
          footer_default: form.footer_default,
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const s = await res.json();
      setSettings(s);
      setForm(s);
      setMsg({ tipo: "ok", text: "Impostazioni salvate." });
    } catch (e) {
      setMsg({ tipo: "err", text: e.message });
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="text-neutral-500 text-sm">Caricamento…</div>;
  if (!settings) return <div className="text-red-700 text-sm">Impostazioni non disponibili.</div>;

  return (
    <section>
      <div className="mb-4">
        <h2 className="text-xl font-bold text-orange-900 font-playfair">Menu Pranzo del Giorno</h2>
        <p className="text-neutral-500 text-sm mt-1">
          Default per testata, prezzi e footer. Possono essere sovrascritti per il singolo giorno
          dalla pagina <a href="/pranzo" className="underline hover:text-orange-700">Menu Pranzo</a>.
        </p>
      </div>

      {msg && (
        <div className={"text-sm rounded-xl px-3 py-2 mb-4 border " +
          (msg.tipo === "ok"
            ? "text-green-700 bg-green-50 border-green-200"
            : "text-red-700 bg-red-50 border-red-200")}>
          {msg.text}
        </div>
      )}

      {/* Testata */}
      <div className="bg-neutral-50 border border-neutral-200 rounded-xl p-4 space-y-3 mb-4">
        <h3 className="font-semibold text-neutral-800">Testata</h3>
        <div>
          <label className="block text-xs text-neutral-500 mb-1 uppercase tracking-wide">Titolo</label>
          <input
            value={form.titolo_default || ""}
            onChange={(e) => update("titolo_default", e.target.value)}
            className="w-full border border-neutral-300 rounded-lg px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="block text-xs text-neutral-500 mb-1 uppercase tracking-wide">Sottotitolo</label>
          <textarea
            value={form.sottotitolo_default || ""}
            onChange={(e) => update("sottotitolo_default", e.target.value)}
            rows={2}
            className="w-full border border-neutral-300 rounded-lg px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="block text-xs text-neutral-500 mb-1 uppercase tracking-wide">Titolo box prezzi</label>
          <input
            value={form.titolo_business || ""}
            onChange={(e) => update("titolo_business", e.target.value)}
            className="w-full border border-neutral-300 rounded-lg px-3 py-2 text-sm"
          />
        </div>
      </div>

      {/* Prezzi */}
      <div className="bg-neutral-50 border border-neutral-200 rounded-xl p-4 space-y-3 mb-4">
        <h3 className="font-semibold text-neutral-800">Prezzi default Menù Business (€)</h3>
        {[
          ["prezzo_1_default", "1 portata"],
          ["prezzo_2_default", "2 portate"],
          ["prezzo_3_default", "3 portate"],
        ].map(([k, lbl]) => (
          <div key={k} className="flex items-center gap-3">
            <label className="w-28 text-sm text-neutral-600">{lbl}</label>
            <input
              type="number"
              step="0.5"
              value={form[k] ?? ""}
              onChange={(e) => update(k, e.target.value)}
              className="flex-1 border border-neutral-300 rounded-lg px-3 py-2 text-sm"
            />
          </div>
        ))}
      </div>

      {/* Footer */}
      <div className="bg-neutral-50 border border-neutral-200 rounded-xl p-4 space-y-2 mb-4">
        <h3 className="font-semibold text-neutral-800">Footer note (default)</h3>
        <textarea
          value={form.footer_default || ""}
          onChange={(e) => update("footer_default", e.target.value)}
          rows={3}
          className="w-full border border-neutral-300 rounded-lg px-3 py-2 text-sm font-mono"
        />
        <div className="text-xs text-neutral-500">
          Suggerimento: <code>*</code> per "acqua, coperto e servizio inclusi" e
          <code> **</code> per "da Lunedì a Venerdì". Il PDF preserva i ritorni a capo.
        </div>
      </div>

      <div className="flex justify-end gap-2">
        <Btn variant="ghost" onClick={() => setForm(settings)}>Annulla modifiche</Btn>
        <Btn onClick={salva} loading={saving}>Salva impostazioni</Btn>
      </div>
    </section>
  );
}
