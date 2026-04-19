// FILE: frontend/src/pages/admin/TabHomeActions.jsx
// @version: v1.0 — Tab "Home per ruolo" in Impostazioni Sistema (sessione 49)
//
// Admin puo':
//  - scegliere un ruolo (tendina)
//  - vedere la lista dei pulsanti rapidi per quel ruolo (in ordine)
//  - spostare su/giu' (riordino, batch POST /reorder/)
//  - attivare/disattivare singolo pulsante
//  - modificare label/sub/emoji/route/color (inline edit modal)
//  - aggiungere un nuovo pulsante
//  - eliminare un pulsante
//  - ripristinare i default per il ruolo
//
// Route input: tendina di route esistenti (estratte da modulesMenu.js) + "Altro..."
// per inserire manualmente una route interna non ancora nel menu.

import React, { useState, useEffect, useCallback, useMemo } from "react";
import { API_BASE, apiFetch } from "../../config/api";
import { Btn, StatusBadge, EmptyState } from "../../components/ui";
import MODULES_MENU from "../../config/modulesMenu";

// Ruoli supportati (deve rispecchiare VALID_ROLES in home_actions_defaults.py)
const ROLES = [
  { key: "admin",      label: "Admin",      icon: "👑" },
  { key: "superadmin", label: "Superadmin", icon: "⭐" },
  { key: "contabile",  label: "Contabile",  icon: "📊" },
  { key: "sommelier",  label: "Sommelier",  icon: "🍷" },
  { key: "chef",       label: "Chef",       icon: "👨‍🍳" },
  { key: "sous_chef",  label: "Sous Chef",  icon: "🥘" },
  { key: "commis",     label: "Commis",     icon: "🔪" },
  { key: "sala",       label: "Sala",       icon: "🍽️" },
  { key: "viewer",     label: "Viewer",     icon: "👁" },
];

// Palette colori proposte (classi Tailwind coordinate alla palette brand)
const COLOR_PRESETS = [
  { label: "Indigo (default)", value: "bg-indigo-50 border-indigo-200 text-indigo-900" },
  { label: "Ambra",            value: "bg-amber-50 border-amber-200 text-amber-900" },
  { label: "Arancio",          value: "bg-orange-50 border-orange-200 text-orange-900" },
  { label: "Smeraldo",         value: "bg-emerald-50 border-emerald-200 text-emerald-900" },
  { label: "Rosa",             value: "bg-rose-50 border-rose-200 text-rose-900" },
  { label: "Viola",            value: "bg-purple-50 border-purple-200 text-purple-900" },
  { label: "Ciano",            value: "bg-cyan-50 border-cyan-200 text-cyan-900" },
  { label: "Teal",             value: "bg-teal-50 border-teal-200 text-teal-900" },
  { label: "Cielo",            value: "bg-sky-50 border-sky-200 text-sky-900" },
  { label: "Neutro",           value: "bg-neutral-50 border-neutral-300 text-neutral-800" },
];

// Estraggo tutte le route interne da modulesMenu (root + sub)
function buildRouteOptions() {
  const opts = [];
  for (const [key, mod] of Object.entries(MODULES_MENU)) {
    if (mod.go) opts.push({ label: `${mod.icon || ""} ${mod.title}`, value: mod.go });
    for (const sub of mod.sub || []) {
      if (sub.go) opts.push({ label: `  ↳ ${mod.title} · ${sub.label}`, value: sub.go });
    }
  }
  // Dedup su value
  const seen = new Set();
  return opts.filter((o) => {
    if (seen.has(o.value)) return false;
    seen.add(o.value);
    return true;
  });
}

const EMOJI_PICKS = ["⭐","💵","📅","🍷","📘","📊","💰","📦","🧾","👥","🧑‍🍳","📋","🍽️","📈","⚙️","🔔","🗓️","🗒️","✅","🔍"];

// ─────────────────────────────────────────────────────────────
// COMPONENTE PRINCIPALE
// ─────────────────────────────────────────────────────────────
export default function TabHomeActions() {
  const [ruolo, setRuolo] = useState("admin");
  const [actions, setActions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(null);    // action object o null
  const [creating, setCreating] = useState(false); // true quando il modal e' in "new"
  const routeOptions = useMemo(buildRouteOptions, []);

  const flash = useCallback((t) => {
    setMsg(t);
    setTimeout(() => setMsg(""), 2500);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await apiFetch(`${API_BASE}/settings/home-actions/?ruolo=${encodeURIComponent(ruolo)}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      setActions(Array.isArray(json) ? json : []);
    } catch (e) {
      setError(e.message || "Errore caricamento");
    } finally {
      setLoading(false);
    }
  }, [ruolo]);

  useEffect(() => { load(); }, [load]);

  // Sposta su/giu' (swap, poi persist batch)
  const move = async (idx, delta) => {
    const j = idx + delta;
    if (j < 0 || j >= actions.length) return;
    const next = [...actions];
    [next[idx], next[j]] = [next[j], next[idx]];
    setActions(next);
    try {
      setSaving(true);
      const res = await apiFetch(`${API_BASE}/settings/home-actions/reorder/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ruolo, ids: next.map((a) => a.id) }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      flash("Ordine aggiornato");
    } catch (e) {
      setError(`Riordino fallito: ${e.message}`);
      load();
    } finally {
      setSaving(false);
    }
  };

  const toggleAttivo = async (a) => {
    try {
      setSaving(true);
      const res = await apiFetch(`${API_BASE}/settings/home-actions/${a.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ attivo: !a.attivo }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setActions((cur) => cur.map((x) => (x.id === a.id ? { ...x, attivo: !a.attivo } : x)));
      flash(a.attivo ? "Disattivato" : "Attivato");
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const remove = async (a) => {
    if (!confirm(`Eliminare il pulsante "${a.label}"?`)) return;
    try {
      setSaving(true);
      const res = await apiFetch(`${API_BASE}/settings/home-actions/${a.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setActions((cur) => cur.filter((x) => x.id !== a.id));
      flash("Eliminato");
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const resetDefaults = async () => {
    if (!confirm(`Ripristinare i pulsanti di default per ${ruolo}? Tutte le personalizzazioni di questo ruolo andranno perse.`)) return;
    try {
      setSaving(true);
      const res = await apiFetch(`${API_BASE}/settings/home-actions/reset/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ruolo }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      flash("Default ripristinati");
      load();
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const saveEdit = async (form) => {
    try {
      setSaving(true);
      setError("");
      let res;
      if (creating) {
        res = await apiFetch(`${API_BASE}/settings/home-actions/`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...form, ruolo }),
        });
      } else {
        res = await apiFetch(`${API_BASE}/settings/home-actions/${editing.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(form),
        });
      }
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.detail || `HTTP ${res.status}`);
      }
      setEditing(null);
      setCreating(false);
      flash(creating ? "Pulsante aggiunto" : "Pulsante aggiornato");
      load();
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header + selettore ruolo */}
      <div className="flex flex-col sm:flex-row gap-3 sm:items-end sm:justify-between">
        <div>
          <h2 className="text-xl font-bold text-neutral-800">🏠 Home per ruolo</h2>
          <p className="text-sm text-neutral-500">
            Scegli quali pulsanti rapidi mostrare nella Home per ogni ruolo.
          </p>
        </div>
        <div className="flex items-end gap-2">
          <label className="flex flex-col gap-1">
            <span className="text-xs text-neutral-500">Ruolo</span>
            <select
              value={ruolo}
              onChange={(e) => setRuolo(e.target.value)}
              className="border border-neutral-300 rounded-lg px-3 py-2 text-sm bg-white"
            >
              {ROLES.map((r) => (
                <option key={r.key} value={r.key}>{r.icon} {r.label}</option>
              ))}
            </select>
          </label>
          <Btn variant="secondary" size="md" onClick={resetDefaults} disabled={saving}>
            ↺ Ripristina default
          </Btn>
        </div>
      </div>

      {/* Messaggi */}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-800 rounded-lg px-4 py-2 text-sm">
          {error}
        </div>
      )}
      {msg && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-lg px-4 py-2 text-sm">
          {msg}
        </div>
      )}

      {/* Lista */}
      {loading ? (
        <div className="text-neutral-400 text-sm py-8 text-center">Caricamento…</div>
      ) : actions.length === 0 ? (
        <EmptyState
          icon="🏠"
          title="Nessun pulsante configurato"
          description={`Il ruolo ${ruolo} non ha azioni rapide. Aggiungine una o ripristina i default.`}
          action={<Btn variant="primary" onClick={resetDefaults}>Ripristina default</Btn>}
        />
      ) : (
        <div className="space-y-2">
          {actions.map((a, idx) => (
            <div
              key={a.id}
              className={`flex items-center gap-3 border rounded-xl px-3 py-2.5 bg-white ${
                a.attivo ? "" : "opacity-50"
              }`}
            >
              <div className="flex flex-col gap-0.5">
                <button
                  className="text-neutral-400 hover:text-neutral-800 disabled:opacity-30 leading-none"
                  disabled={idx === 0 || saving}
                  onClick={() => move(idx, -1)}
                  aria-label="Sposta su"
                >▲</button>
                <button
                  className="text-neutral-400 hover:text-neutral-800 disabled:opacity-30 leading-none"
                  disabled={idx === actions.length - 1 || saving}
                  onClick={() => move(idx, +1)}
                  aria-label="Sposta giu'"
                >▼</button>
              </div>
              <span className="text-2xl w-8 text-center">{a.emoji}</span>
              <div className="flex-1 min-w-0">
                <div className="font-medium text-neutral-900 truncate">{a.label}</div>
                <div className="text-xs text-neutral-500 truncate">
                  {a.sub ? `${a.sub} · ` : ""}
                  <code className="bg-neutral-100 px-1 rounded">{a.route}</code>
                </div>
              </div>
              <StatusBadge tone={a.attivo ? "success" : "neutral"} size="sm">
                {a.attivo ? "Attivo" : "Disatt."}
              </StatusBadge>
              <Btn variant="ghost" size="sm" onClick={() => toggleAttivo(a)} disabled={saving}>
                {a.attivo ? "Disattiva" : "Attiva"}
              </Btn>
              <Btn variant="ghost" size="sm" onClick={() => { setEditing(a); setCreating(false); }}>
                ✎
              </Btn>
              <button
                onClick={() => remove(a)}
                disabled={saving}
                className="text-red-600 hover:bg-red-50 rounded-lg px-2 py-1 text-sm disabled:opacity-50"
                aria-label="Elimina"
              >
                🗑
              </button>
            </div>
          ))}
        </div>
      )}

      {/* CTA aggiungi */}
      <div>
        <Btn
          variant="primary"
          size="md"
          onClick={() => {
            setEditing({
              key: "",
              label: "",
              sub: "",
              emoji: "⭐",
              route: "",
              color: COLOR_PRESETS[0].value,
              attivo: true,
            });
            setCreating(true);
          }}
        >
          + Aggiungi pulsante
        </Btn>
      </div>

      {/* Modal edit/new */}
      {editing && (
        <EditModal
          initial={editing}
          isNew={creating}
          saving={saving}
          routeOptions={routeOptions}
          onCancel={() => { setEditing(null); setCreating(false); }}
          onSave={saveEdit}
        />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// MODAL EDIT / NEW
// ─────────────────────────────────────────────────────────────
function EditModal({ initial, isNew, saving, routeOptions, onCancel, onSave }) {
  const [form, setForm] = useState({
    key:    initial.key || "",
    label:  initial.label || "",
    sub:    initial.sub || "",
    emoji:  initial.emoji || "⭐",
    route:  initial.route || "",
    color:  initial.color || COLOR_PRESETS[0].value,
    attivo: initial.attivo ?? true,
  });
  const [routeMode, setRouteMode] = useState(
    initial.route && !routeOptions.some((o) => o.value === initial.route) ? "custom" : "select"
  );

  const canSave = form.label.trim() && form.route.trim() && (isNew ? form.key.trim() : true);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
        <div className="px-6 py-4 border-b border-neutral-200 flex items-center justify-between">
          <h3 className="text-lg font-bold text-neutral-900">
            {isNew ? "➕ Nuovo pulsante" : "✎ Modifica pulsante"}
          </h3>
          <button onClick={onCancel} className="text-neutral-400 hover:text-neutral-700 text-xl leading-none">×</button>
        </div>

        <div className="px-6 py-5 space-y-4">
          {/* Label */}
          <Field label="Etichetta" required>
            <input
              type="text"
              className="border border-neutral-300 rounded-lg px-3 py-2 text-sm w-full"
              value={form.label}
              onChange={(e) => setForm({ ...form, label: e.target.value })}
              placeholder="Chiusura Turno"
            />
          </Field>

          {/* Sottotitolo */}
          <Field label="Sottotitolo (opzionale)">
            <input
              type="text"
              className="border border-neutral-300 rounded-lg px-3 py-2 text-sm w-full"
              value={form.sub || ""}
              onChange={(e) => setForm({ ...form, sub: e.target.value })}
              placeholder="Fine servizio"
            />
          </Field>

          {/* Emoji picker */}
          <Field label="Emoji">
            <div className="flex items-center gap-2 flex-wrap">
              <input
                type="text"
                className="border border-neutral-300 rounded-lg px-3 py-2 text-sm w-20 text-center"
                value={form.emoji}
                onChange={(e) => setForm({ ...form, emoji: e.target.value.slice(0, 4) })}
              />
              <div className="flex flex-wrap gap-1">
                {EMOJI_PICKS.map((e) => (
                  <button
                    key={e}
                    type="button"
                    onClick={() => setForm({ ...form, emoji: e })}
                    className={`w-8 h-8 flex items-center justify-center rounded border hover:bg-neutral-50 ${
                      form.emoji === e ? "border-indigo-400 bg-indigo-50" : "border-neutral-200"
                    }`}
                  >
                    {e}
                  </button>
                ))}
              </div>
            </div>
          </Field>

          {/* Route */}
          <Field label="Route" required>
            <div className="flex gap-2 items-center mb-2 text-xs">
              <label className="flex items-center gap-1">
                <input
                  type="radio"
                  checked={routeMode === "select"}
                  onChange={() => setRouteMode("select")}
                />
                Scegli da menu
              </label>
              <label className="flex items-center gap-1">
                <input
                  type="radio"
                  checked={routeMode === "custom"}
                  onChange={() => setRouteMode("custom")}
                />
                Personalizzata
              </label>
            </div>
            {routeMode === "select" ? (
              <select
                className="border border-neutral-300 rounded-lg px-3 py-2 text-sm w-full bg-white"
                value={form.route}
                onChange={(e) => setForm({ ...form, route: e.target.value })}
              >
                <option value="">— seleziona —</option>
                {routeOptions.map((o) => (
                  <option key={o.value} value={o.value}>{o.label} ({o.value})</option>
                ))}
              </select>
            ) : (
              <input
                type="text"
                className="border border-neutral-300 rounded-lg px-3 py-2 text-sm w-full font-mono"
                value={form.route}
                onChange={(e) => setForm({ ...form, route: e.target.value })}
                placeholder="/prenotazioni"
              />
            )}
            <p className="text-[11px] text-neutral-400 mt-1">Deve iniziare con "/".</p>
          </Field>

          {/* Colore */}
          <Field label="Colore">
            <select
              className="border border-neutral-300 rounded-lg px-3 py-2 text-sm w-full bg-white"
              value={form.color || ""}
              onChange={(e) => setForm({ ...form, color: e.target.value })}
            >
              {COLOR_PRESETS.map((c) => (
                <option key={c.value} value={c.value}>{c.label}</option>
              ))}
            </select>
            {/* Preview */}
            <div className={`mt-2 rounded-[14px] border px-4 py-3 flex items-center gap-3 ${form.color}`}>
              <span className="text-2xl leading-none">{form.emoji}</span>
              <div>
                <div className="text-[14px] font-bold leading-tight">{form.label || "Anteprima"}</div>
                {form.sub && <div className="text-[11px] opacity-60 mt-0.5">{form.sub}</div>}
              </div>
            </div>
          </Field>

          {/* Key (solo new) */}
          {isNew && (
            <Field label="Key (slug univoco per ruolo)" required>
              <input
                type="text"
                className="border border-neutral-300 rounded-lg px-3 py-2 text-sm w-full font-mono"
                value={form.key}
                onChange={(e) => setForm({ ...form, key: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-") })}
                placeholder="es. chiusura-turno"
              />
            </Field>
          )}

          {/* Attivo */}
          <Field label="Stato">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={form.attivo}
                onChange={(e) => setForm({ ...form, attivo: e.target.checked })}
              />
              Visibile nella Home
            </label>
          </Field>
        </div>

        <div className="px-6 py-4 border-t border-neutral-200 flex justify-end gap-2">
          <Btn variant="secondary" size="md" onClick={onCancel} disabled={saving}>
            Annulla
          </Btn>
          <Btn
            variant="primary"
            size="md"
            onClick={() => onSave(form)}
            disabled={!canSave || saving}
            loading={saving}
          >
            {isNew ? "Aggiungi" : "Salva"}
          </Btn>
        </div>
      </div>
    </div>
  );
}

function Field({ label, required, children }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-medium text-neutral-600">
        {label}{required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      {children}
    </div>
  );
}
