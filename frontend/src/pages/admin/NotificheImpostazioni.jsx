// src/pages/admin/NotificheImpostazioni.jsx
// @version: v2.0-mattoni — refactor con M.I UI primitives (Btn, StatusBadge, EmptyState)
// Tab "Notifiche" dentro ImpostazioniSistema — NON usa PageLayout, vive nel container padre.

import React, { useState, useEffect } from "react";
import { API_BASE, apiFetch } from "../../config/api";
import { Btn, StatusBadge, EmptyState } from "../../components/ui";

// ---------------------------------------------------------------------------
// COSTANTI
// ---------------------------------------------------------------------------
const RUOLI = [
  { value: "admin", label: "Admin" },
  { value: "contabile", label: "Contabile" },
  { value: "chef", label: "Chef" },
  { value: "sommelier", label: "Sommelier" },
  { value: "sala", label: "Sala" },
];

const CANALI = [
  { key: "canale_app", label: "In-app", icon: "🔔", desc: "Notifica nel pannello notifiche" },
  { key: "canale_wa", label: "WhatsApp", icon: "💬", desc: "Messaggio WhatsApp (M.C)" },
  { key: "canale_email", label: "Email", icon: "📧", desc: "Email (prossimamente)" },
];

// ---------------------------------------------------------------------------
// COMPONENTE PRINCIPALE
// ---------------------------------------------------------------------------
export default function NotificheImpostazioni() {
  const [configs, setConfigs] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(null);
  const [toast, setToast] = useState("");

  async function loadConfig() {
    setLoading(true);
    setError("");
    try {
      const [cfgRes, usersRes] = await Promise.all([
        apiFetch(`${API_BASE}/alerts/config/`),
        apiFetch(`${API_BASE}/auth/users/`),
      ]);
      if (!cfgRes.ok) throw new Error("Errore caricamento config");
      const cfgData = await cfgRes.json();
      setConfigs(cfgData.configs || []);

      if (usersRes.ok) {
        const usersData = await usersRes.json();
        setUsers(Array.isArray(usersData) ? usersData : []);
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadConfig(); }, []);

  function showToast(msg) {
    setToast(msg);
    setTimeout(() => setToast(""), 2500);
  }

  function updateLocal(checker, field, value) {
    setConfigs((prev) =>
      prev.map((c) => (c.checker === checker ? { ...c, [field]: value } : c))
    );
  }

  async function saveChecker(checker) {
    const cfg = configs.find((c) => c.checker === checker);
    if (!cfg) return;

    setSaving(checker);
    try {
      const res = await apiFetch(`${API_BASE}/alerts/config/${checker}/`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          attivo: cfg.attivo,
          soglia_giorni: cfg.soglia_giorni,
          antidup_ore: cfg.antidup_ore,
          dest_ruolo: cfg.dest_ruolo || "admin",
          dest_username: cfg.dest_username || [],
          canale_app: cfg.canale_app,
          canale_wa: cfg.canale_wa,
          canale_email: cfg.canale_email,
        }),
      });
      if (!res.ok) throw new Error("Errore nel salvataggio");
      showToast(`✅ ${cfg.label} salvato`);
    } catch (e) {
      showToast(`❌ ${e.message}`);
    } finally {
      setSaving(null);
    }
  }

  async function runChecker(checker) {
    setSaving(checker);
    try {
      const res = await apiFetch(`${API_BASE}/alerts/run/${checker}/`, { method: "POST" });
      if (!res.ok) throw new Error("Errore nell'esecuzione");
      const data = await res.json();
      if (data.notified > 0) {
        showToast(`🔔 ${data.found} trovati, ${data.notified} notifica creata`);
      } else if (data.found > 0) {
        showToast(`ℹ️ ${data.found} trovati, notifica già inviata di recente`);
      } else {
        showToast(`✅ Nessun alert attivo`);
      }
    } catch (e) {
      showToast(`❌ ${e.message}`);
    } finally {
      setSaving(null);
    }
  }

  // ── RENDER ──
  if (loading) {
    return (
      <div className="text-center py-12 text-neutral-400">
        <span className="animate-pulse text-lg">Caricamento configurazione alert...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-12 space-y-3">
        <p className="text-brand-red font-semibold">{error}</p>
        <Btn variant="secondary" onClick={loadConfig}>Riprova</Btn>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <p className="text-neutral-500 text-sm">
        Configura soglie, destinatari e canali per ogni tipo di alert automatico.
      </p>

      {/* Toast */}
      {toast && (
        <div className="fixed top-4 right-4 z-50 bg-white border border-neutral-200 shadow-lg rounded-xl px-4 py-3 text-sm font-medium animate-fade-in">
          {toast}
        </div>
      )}

      {/* Card per ogni checker */}
      {configs.map((cfg) => (
        <CheckerCard
          key={cfg.checker}
          cfg={cfg}
          users={users}
          saving={saving === cfg.checker}
          onUpdate={(field, value) => updateLocal(cfg.checker, field, value)}
          onSave={() => saveChecker(cfg.checker)}
          onRun={() => runChecker(cfg.checker)}
        />
      ))}

      {configs.length === 0 && (
        <EmptyState
          icon="🔔"
          title="Nessun checker configurato"
          description="Verifica che l'Alert Engine sia attivo sul backend (M.F)."
          compact
        />
      )}
    </div>
  );
}


// ---------------------------------------------------------------------------
// CARD SINGOLO CHECKER
// ---------------------------------------------------------------------------
function CheckerCard({ cfg, users, saving, onUpdate, onSave, onRun }) {
  const [expanded, setExpanded] = useState(false);

  // dest_username è un array di username
  const selectedUsers = Array.isArray(cfg.dest_username) ? cfg.dest_username : [];

  function toggleUser(username) {
    const newList = selectedUsers.includes(username)
      ? selectedUsers.filter((u) => u !== username)
      : [...selectedUsers, username];
    onUpdate("dest_username", newList);
  }

  return (
    <div className={`border rounded-2xl transition-all ${
      cfg.attivo ? "border-neutral-200 bg-white" : "border-neutral-100 bg-neutral-50/50"
    }`}>
      {/* Header card */}
      <div className="flex items-center gap-3 px-5 py-4">
        <span className="text-2xl">{cfg.icon}</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className={`font-semibold ${cfg.attivo ? "text-brand-ink" : "text-neutral-400"}`}>
              {cfg.label}
            </h3>
            {!cfg.attivo && (
              <StatusBadge tone="neutral" size="sm">disattivato</StatusBadge>
            )}
          </div>
          <p className="text-xs text-neutral-400 mt-0.5">{cfg.desc}</p>
        </div>

        {/* Toggle attivo */}
        <button
          onClick={() => onUpdate("attivo", !cfg.attivo)}
          className={`relative w-11 h-6 rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue/40 focus-visible:ring-offset-1 ${
            cfg.attivo ? "bg-brand-green" : "bg-neutral-300"
          }`}
          title={cfg.attivo ? "Disattiva" : "Attiva"}
        >
          <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${
            cfg.attivo ? "translate-x-5" : ""
          }`} />
        </button>

        {/* Espandi */}
        <button
          onClick={() => setExpanded(!expanded)}
          className="text-neutral-400 hover:text-neutral-600 transition p-1"
          title="Configura"
        >
          <span className={`inline-block transition-transform ${expanded ? "rotate-180" : ""}`}>▼</span>
        </button>
      </div>

      {/* Contenuto espandibile */}
      {expanded && (
        <div className="px-5 pb-5 border-t border-neutral-100 pt-4 space-y-5">

          {/* Riga 1: Soglia + Anti-duplicato */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-neutral-500 mb-1">
                Soglia anticipo (giorni)
              </label>
              <input
                type="number" min="0" max="365"
                value={cfg.soglia_giorni}
                onChange={(e) => onUpdate("soglia_giorni", parseInt(e.target.value) || 0)}
                className="w-full border border-neutral-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-brand-blue/30 focus:border-brand-blue outline-none"
              />
              <p className="text-[11px] text-neutral-400 mt-1">
                {cfg.checker === "fatture_scadenza" && "Giorni prima della scadenza per segnalare la fattura"}
                {cfg.checker === "dipendenti_scadenze" && "Fallback se il documento non ha alert_giorni impostato"}
                {cfg.checker === "vini_sottoscorta" && "Non usato (il confronto è qta vs scorta_minima)"}
              </p>
            </div>
            <div>
              <label className="block text-xs font-medium text-neutral-500 mb-1">
                Anti-duplicato (ore)
              </label>
              <input
                type="number" min="1" max="168"
                value={cfg.antidup_ore}
                onChange={(e) => onUpdate("antidup_ore", parseInt(e.target.value) || 24)}
                className="w-full border border-neutral-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-brand-blue/30 focus:border-brand-blue outline-none"
              />
              <p className="text-[11px] text-neutral-400 mt-1">
                Intervallo minimo tra due notifiche dello stesso tipo
              </p>
            </div>
          </div>

          {/* Riga 2: Destinatari — Ruolo */}
          <div>
            <label className="block text-xs font-medium text-neutral-500 mb-2">
              Ruolo destinatario
            </label>
            <div className="flex flex-wrap gap-2">
              {RUOLI.map((r) => (
                <button
                  key={r.value}
                  onClick={() => onUpdate("dest_ruolo", r.value)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition ${
                    cfg.dest_ruolo === r.value
                      ? "bg-brand-blue text-white border-brand-blue"
                      : "bg-white text-neutral-600 border-neutral-200 hover:border-neutral-300"
                  }`}
                >
                  {r.label}
                </button>
              ))}
            </div>
            <p className="text-[11px] text-neutral-400 mt-1">
              Tutti gli utenti con questo ruolo riceveranno la notifica
            </p>
          </div>

          {/* Riga 2b: Destinatari — Utenti specifici (multi-select) */}
          {users.length > 0 && (
            <div>
              <label className="block text-xs font-medium text-neutral-500 mb-2">
                Utenti aggiuntivi (opzionale)
              </label>
              <div className="flex flex-wrap gap-2">
                {users.map((u) => {
                  const uname = u.username || u;
                  const role = u.role || "";
                  const isSelected = selectedUsers.includes(uname);
                  return (
                    <button
                      key={uname}
                      onClick={() => toggleUser(uname)}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition ${
                        isSelected
                          ? "bg-amber-50 text-amber-800 border-amber-300"
                          : "bg-white text-neutral-500 border-neutral-200 hover:border-neutral-300"
                      }`}
                    >
                      {isSelected && <span>✓</span>}
                      <span>{uname}</span>
                      {role && <span className="text-[10px] text-neutral-400">({role})</span>}
                    </button>
                  );
                })}
              </div>
              <p className="text-[11px] text-neutral-400 mt-1">
                Questi utenti ricevono la notifica indipendentemente dal ruolo
              </p>
            </div>
          )}

          {/* Riga 3: Canali */}
          <div>
            <label className="block text-xs font-medium text-neutral-500 mb-2">
              Canali di notifica
            </label>
            <div className="flex flex-wrap gap-3">
              {CANALI.map((ch) => {
                const active = cfg[ch.key];
                const isEmail = ch.key === "canale_email";
                return (
                  <button
                    key={ch.key}
                    onClick={() => !isEmail && onUpdate(ch.key, !active)}
                    className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium border transition ${
                      isEmail
                        ? "bg-neutral-50 text-neutral-300 border-neutral-100 cursor-not-allowed"
                        : active
                          ? "bg-green-50 text-green-700 border-green-200"
                          : "bg-white text-neutral-500 border-neutral-200 hover:border-neutral-300"
                    }`}
                    title={isEmail ? "Disponibile quando M.D Email sarà implementato" : ch.desc}
                  >
                    <span>{ch.icon}</span>
                    <span>{ch.label}</span>
                    {isEmail && <span className="text-[10px] text-neutral-300">(soon)</span>}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Azioni */}
          <div className="flex items-center gap-3 pt-2 border-t border-neutral-100">
            <Btn variant="primary" size="sm" loading={saving} disabled={saving} onClick={onSave}>
              {saving ? "Salvataggio…" : "💾 Salva"}
            </Btn>
            <Btn variant="secondary" size="sm" disabled={saving} onClick={onRun}>
              ▶ Testa ora
            </Btn>
            <span className="text-[11px] text-neutral-300 ml-auto">
              Aggiornato: {cfg.updated_at ? new Date(cfg.updated_at).toLocaleString("it-IT") : "—"}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
