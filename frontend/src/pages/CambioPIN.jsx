// src/pages/CambioPIN.jsx
// @version: v2.0-mattoni — refactor con M.I UI primitives (Btn, PageLayout, StatusBadge, EmptyState)
// Cambio PIN self-service per tutti gli utenti
// Admin: può anche resettare il PIN di qualsiasi utente a 0000

import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { isAdminRole } from "../utils/authHelpers";
import { Btn, PageLayout, StatusBadge, EmptyState } from "../components/ui";

const API = import.meta.env.VITE_API_BASE_URL;

export default function CambioPIN() {
  const navigate = useNavigate();
  const token = localStorage.getItem("token");
  const username = localStorage.getItem("username");
  const role = localStorage.getItem("role");
  const isAdmin = isAdminRole(role);

  // ── Cambio PIN proprio ──
  const [currentPin, setCurrentPin] = useState("");
  const [newPin, setNewPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [message, setMessage] = useState(null);
  const [saving, setSaving] = useState(false);

  // ── Reset PIN admin ──
  const [users, setUsers] = useState([]);
  const [resetMessage, setResetMessage] = useState(null);
  const [resetting, setResetting] = useState(null); // username being reset

  useEffect(() => {
    if (!isAdmin) return;
    fetch(`${API}/auth/users`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.ok ? r.json() : [])
      .then(setUsers)
      .catch(() => {});
  }, [isAdmin, token]);

  const handleChangePin = async () => {
    setMessage(null);
    if (newPin.length < 4) {
      setMessage({ type: "error", text: "Il nuovo PIN deve essere di almeno 4 cifre." });
      return;
    }
    if (newPin !== confirmPin) {
      setMessage({ type: "error", text: "I due PIN non coincidono." });
      return;
    }
    if (!isAdmin && !currentPin) {
      setMessage({ type: "error", text: "Inserisci il PIN attuale." });
      return;
    }

    setSaving(true);
    try {
      const body = { new_password: newPin };
      if (!isAdmin) body.current_password = currentPin;

      const res = await fetch(`${API}/auth/users/${username}/password`, {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || `Errore ${res.status}`);
      }
      setMessage({ type: "ok", text: "PIN cambiato con successo!" });
      setCurrentPin(""); setNewPin(""); setConfirmPin("");
    } catch (err) {
      setMessage({ type: "error", text: err.message });
    } finally {
      setSaving(false);
    }
  };

  const handleResetPin = async (targetUsername) => {
    setResetMessage(null);
    setResetting(targetUsername);
    try {
      const res = await fetch(`${API}/auth/users/${targetUsername}/password`, {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ new_password: "0000" }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || `Errore ${res.status}`);
      }
      setResetMessage({ type: "ok", text: `PIN di ${targetUsername} resettato a 0000.` });
    } catch (err) {
      setResetMessage({ type: "error", text: err.message });
    } finally {
      setResetting(null);
    }
  };

  const altriUtenti = users.filter(u => u.username !== username);

  return (
    <PageLayout>
      <div className="max-w-xl mx-auto space-y-5">
        {/* Back */}
        <Btn variant="ghost" size="sm" onClick={() => navigate(-1)} className="!shadow-none">
          ← Indietro
        </Btn>

        {/* CAMBIO PIN PROPRIO */}
        <div className="bg-white rounded-2xl shadow-lg p-6 border border-neutral-200">
          <h1 className="text-xl font-bold text-brand-ink font-playfair mb-1">
            🔑 Cambia PIN
          </h1>
          <p className="text-neutral-500 text-sm mb-5">
            Scegli un nuovo PIN di accesso (minimo 4 cifre)
          </p>

          <div className="space-y-4">
            {!isAdmin && (
              <PinInput label="PIN attuale" value={currentPin} onChange={setCurrentPin} />
            )}
            <PinInput label="Nuovo PIN" value={newPin} onChange={setNewPin} />
            <PinInput label="Conferma nuovo PIN" value={confirmPin} onChange={setConfirmPin} />

            <Btn
              variant="primary"
              size="lg"
              onClick={handleChangePin}
              loading={saving}
              disabled={saving}
              className="w-full"
            >
              {saving ? "Salvataggio…" : "Cambia PIN"}
            </Btn>

            {message && (
              <MessageBox type={message.type === "ok" ? "success" : "danger"}>
                {message.text}
              </MessageBox>
            )}
          </div>
        </div>

        {/* RESET PIN ADMIN */}
        {isAdmin && (
          <div className="bg-white rounded-2xl shadow p-6 border border-neutral-200">
            <h2 className="text-lg font-bold text-brand-ink mb-1">
              🔧 Reset PIN utenti
            </h2>
            <p className="text-neutral-500 text-sm mb-4">
              Resetta il PIN di un utente a <strong>0000</strong>. L'utente dovrà poi cambiarlo.
            </p>

            {resetMessage && (
              <div className="mb-4">
                <MessageBox type={resetMessage.type === "ok" ? "success" : "danger"}>
                  {resetMessage.text}
                </MessageBox>
              </div>
            )}

            {altriUtenti.length === 0 ? (
              <EmptyState
                icon="👥"
                title="Nessun altro utente"
                description="Non ci sono altri utenti registrati oltre a te."
                compact
              />
            ) : (
              <div className="space-y-2">
                {altriUtenti.map(u => (
                  <div
                    key={u.username}
                    className="flex items-center justify-between p-3 rounded-xl border border-neutral-200 bg-neutral-50"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="font-medium text-brand-ink truncate">{u.username}</span>
                      <StatusBadge tone="neutral" size="sm">{u.role}</StatusBadge>
                    </div>
                    <Btn
                      variant="chip"
                      tone="red"
                      size="sm"
                      loading={resetting === u.username}
                      onClick={() => handleResetPin(u.username)}
                    >
                      {resetting === u.username ? "…" : "Reset → 0000"}
                    </Btn>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </PageLayout>
  );
}


// ─────────────────────────────────────────────────────────────
// MessageBox — riquadro feedback in linea con StatusBadge tones
// ─────────────────────────────────────────────────────────────
function MessageBox({ type = "neutral", children }) {
  const STYLE = {
    success: "bg-emerald-50 text-emerald-700 border-emerald-200",
    danger:  "bg-red-50     text-red-700     border-red-200",
    warning: "bg-amber-50   text-amber-800   border-amber-200",
    info:    "bg-sky-50     text-sky-700     border-sky-200",
  };
  return (
    <div className={`rounded-xl px-4 py-3 text-sm font-semibold border ${STYLE[type] || STYLE.info}`}>
      {children}
    </div>
  );
}


// ─────────────────────────────────────────────────────────────
// PinInput — campo PIN con input type=password e inputMode=numeric
// ─────────────────────────────────────────────────────────────
function PinInput({ label, value, onChange }) {
  return (
    <div>
      <label className="block text-xs font-semibold text-neutral-500 mb-1 uppercase tracking-wide">{label}</label>
      <input
        type="password"
        inputMode="numeric"
        pattern="[0-9]*"
        maxLength={6}
        value={value}
        onChange={e => {
          const v = e.target.value.replace(/\D/g, "");
          onChange(v);
        }}
        placeholder="••••"
        className="w-full border border-neutral-300 rounded-xl px-4 py-3 text-lg tracking-widest text-center bg-white focus:outline-none focus:ring-2 focus:ring-brand-blue/30 focus:border-brand-blue"
      />
    </div>
  );
}
