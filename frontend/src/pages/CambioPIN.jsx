// src/pages/CambioPIN.jsx
// @version: v1.0
// Cambio PIN self-service per tutti gli utenti
// Admin: può anche resettare il PIN di qualsiasi utente a 0000

import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { isAdminRole } from "../utils/authHelpers";

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

  return (
    <div className="min-h-screen bg-brand-cream p-4 sm:p-6">
      <div className="max-w-xl mx-auto space-y-5">

        {/* Back */}
        <button onClick={() => navigate(-1)}
          className="text-sm text-neutral-500 hover:text-neutral-700 transition">
          ← Indietro
        </button>

        {/* CAMBIO PIN PROPRIO */}
        <div className="bg-white rounded-2xl shadow-lg p-6 border border-neutral-200">
          <h1 className="text-xl font-bold text-neutral-900 font-playfair mb-1">
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

            <button onClick={handleChangePin} disabled={saving}
              className={`w-full py-3 rounded-xl text-white font-bold text-sm shadow transition ${
                saving ? "bg-neutral-400 cursor-not-allowed" : "bg-neutral-700 hover:bg-neutral-800"
              }`}>
              {saving ? "Salvataggio..." : "Cambia PIN"}
            </button>

            {message && (
              <div className={`rounded-xl px-4 py-3 text-sm font-semibold ${
                message.type === "ok" ? "bg-emerald-50 text-emerald-700 border border-emerald-200" :
                "bg-red-50 text-red-700 border border-red-200"
              }`}>
                {message.text}
              </div>
            )}
          </div>
        </div>

        {/* RESET PIN ADMIN */}
        {isAdmin && (
          <div className="bg-white rounded-2xl shadow p-6 border border-neutral-200">
            <h2 className="text-lg font-bold text-neutral-800 mb-1">
              🔧 Reset PIN utenti
            </h2>
            <p className="text-neutral-500 text-sm mb-4">
              Resetta il PIN di un utente a <strong>0000</strong>. L'utente dovrà poi cambiarlo.
            </p>

            {resetMessage && (
              <div className={`rounded-xl px-4 py-3 text-sm font-semibold mb-4 ${
                resetMessage.type === "ok" ? "bg-emerald-50 text-emerald-700 border border-emerald-200" :
                "bg-red-50 text-red-700 border border-red-200"
              }`}>
                {resetMessage.text}
              </div>
            )}

            <div className="space-y-2">
              {users.filter(u => u.username !== username).map(u => (
                <div key={u.username} className="flex items-center justify-between p-3 rounded-xl border border-neutral-200 bg-neutral-50">
                  <div>
                    <span className="font-medium text-neutral-800">{u.username}</span>
                    <span className="ml-2 text-xs text-neutral-400 uppercase">{u.role}</span>
                  </div>
                  <button
                    onClick={() => handleResetPin(u.username)}
                    disabled={resetting === u.username}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition ${
                      resetting === u.username
                        ? "bg-neutral-100 text-neutral-400 border-neutral-200 cursor-not-allowed"
                        : "bg-red-50 text-red-700 border-red-200 hover:bg-red-100"
                    }`}>
                    {resetting === u.username ? "..." : "Reset → 0000"}
                  </button>
                </div>
              ))}
              {users.filter(u => u.username !== username).length === 0 && (
                <div className="text-sm text-neutral-400 italic text-center py-3">
                  Nessun altro utente trovato.
                </div>
              )}
            </div>
          </div>
        )}
      </div>
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
        className="w-full border border-neutral-300 rounded-xl px-4 py-3 text-lg tracking-widest text-center bg-white focus:outline-none focus:ring-2 focus:ring-neutral-200"
      />
    </div>
  );
}
