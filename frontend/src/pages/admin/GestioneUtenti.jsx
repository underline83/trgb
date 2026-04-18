// src/pages/admin/GestioneUtenti.jsx
// @version: v2.0-mattoni — refactor con M.I UI primitives (Btn, PageLayout, StatusBadge, EmptyState)
// Gestione utenti admin: CRUD username/password/role + modali

import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { API_BASE, apiFetch } from "../../config/api";
import { Btn, PageLayout, StatusBadge, EmptyState } from "../../components/ui";

const ROLES = ["admin", "chef", "sous_chef", "commis", "sommelier", "sala", "viewer"];

const ROLE_LABELS = {
  admin: "👑 Admin",
  chef: "👨‍🍳 Chef",
  sous_chef: "🥘 Sous Chef",
  commis: "🔪 Commis",
  sommelier: "🍷 Sommelier",
  sala: "🍽️ Sala",
  viewer: "👁 Viewer",
};

export default function GestioneUtenti() {
  const navigate = useNavigate();
  const currentUsername = localStorage.getItem("username") || "";
  const currentRole = localStorage.getItem("role") || "";

  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // --- Modal stato ---
  const [modal, setModal] = useState(null); // null | "add" | "password" | "delete"
  const [selectedUser, setSelectedUser] = useState(null);

  // --- Form stati ---
  const [newUser, setNewUser] = useState({ username: "", password: "", role: "viewer" });
  const [pwForm, setPwForm] = useState({ current_password: "", new_password: "", confirm: "" });
  const [formError, setFormError] = useState("");
  const [formOk, setFormOk] = useState("");
  const [saving, setSaving] = useState(false);

  // ---------------------------------------------------------------------------
  // Carica utenti
  // ---------------------------------------------------------------------------
  async function loadUsers() {
    setLoading(true);
    setError("");
    try {
      const res = await apiFetch(`${API_BASE}/auth/users/`);
      if (!res.ok) throw new Error("Errore nel caricamento utenti");
      const data = await res.json();
      setUsers(data);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (currentRole !== "admin") {
      navigate("/admin");
      return;
    }
    loadUsers();
  }, []);

  // ---------------------------------------------------------------------------
  // Aggiungi utente
  // ---------------------------------------------------------------------------
  async function handleAddUser(e) {
    e.preventDefault();
    setFormError("");
    if (!newUser.username || !newUser.password) {
      setFormError("Username e password sono obbligatori");
      return;
    }
    setSaving(true);
    try {
      const res = await apiFetch(`${API_BASE}/auth/users/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newUser),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || "Errore nella creazione");
      }
      setModal(null);
      setNewUser({ username: "", password: "", role: "viewer" });
      loadUsers();
    } catch (e) {
      setFormError(e.message);
    } finally {
      setSaving(false);
    }
  }

  // ---------------------------------------------------------------------------
  // Cambia password
  // ---------------------------------------------------------------------------
  async function handleChangePassword(e) {
    e.preventDefault();
    setFormError("");
    setFormOk("");
    if (pwForm.new_password !== pwForm.confirm) {
      setFormError("Le password non coincidono");
      return;
    }
    if (pwForm.new_password.length < 4) {
      setFormError("Password troppo corta (minimo 4 caratteri)");
      return;
    }
    setSaving(true);
    try {
      const body = { new_password: pwForm.new_password };
      if (selectedUser.username === currentUsername) {
        body.current_password = pwForm.current_password;
      }
      const res = await apiFetch(`${API_BASE}/auth/users/${selectedUser.username}/password`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || "Errore nel cambio password");
      }
      setFormOk("Password aggiornata con successo");
      setPwForm({ current_password: "", new_password: "", confirm: "" });
      setTimeout(() => setModal(null), 1200);
    } catch (e) {
      setFormError(e.message);
    } finally {
      setSaving(false);
    }
  }

  // ---------------------------------------------------------------------------
  // Cambia ruolo
  // ---------------------------------------------------------------------------
  async function handleChangeRole(username, newRole) {
    try {
      const res = await apiFetch(`${API_BASE}/auth/users/${username}/role`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ new_role: newRole }),
      });
      if (!res.ok) {
        const err = await res.json();
        alert(err.detail || "Errore nel cambio ruolo");
        return;
      }
      loadUsers();
    } catch (e) {
      alert(e.message);
    }
  }

  // ---------------------------------------------------------------------------
  // Elimina utente
  // ---------------------------------------------------------------------------
  async function handleDelete() {
    setSaving(true);
    try {
      const res = await apiFetch(`${API_BASE}/auth/users/${selectedUser.username}`, {
        method: "DELETE",
      });
      if (!res.ok && res.status !== 204) {
        const err = await res.json();
        throw new Error(err.detail || "Errore nell'eliminazione");
      }
      setModal(null);
      loadUsers();
    } catch (e) {
      setFormError(e.message);
    } finally {
      setSaving(false);
    }
  }

  function openModal(type, user = null) {
    setFormError("");
    setFormOk("");
    setPwForm({ current_password: "", new_password: "", confirm: "" });
    setSelectedUser(user);
    setModal(type);
  }

  // ---------------------------------------------------------------------------
  // RENDER
  // ---------------------------------------------------------------------------
  return (
    <PageLayout
      title="👤 Gestione Utenti"
      subtitle="Aggiungi, modifica o rimuovi gli utenti del gestionale."
      actions={
        <>
          <Btn variant="primary" onClick={() => openModal("add")}>
            + Nuovo utente
          </Btn>
          <Btn variant="secondary" onClick={() => navigate("/admin")}>
            ← Torna
          </Btn>
        </>
      }
      className="max-w-4xl"
    >
      <div className="bg-white shadow-2xl rounded-3xl p-8 sm:p-10 border border-neutral-200">
        {/* ERRORE CARICAMENTO */}
        {error && (
          <div className="bg-red-50 text-red-700 border border-red-200 rounded-xl p-4 mb-6 text-sm font-semibold">
            {error}
          </div>
        )}

        {/* TABELLA UTENTI */}
        {loading ? (
          <p className="text-center text-neutral-400 py-12">Caricamento...</p>
        ) : users.length === 0 ? (
          <EmptyState
            icon="👤"
            title="Nessun utente"
            description="Crea il primo utente del gestionale."
            action={
              <Btn variant="primary" onClick={() => openModal("add")}>
                + Nuovo utente
              </Btn>
            }
            watermark
          />
        ) : (
          <div className="overflow-x-auto rounded-xl border border-neutral-200">
            <table className="w-full text-sm">
              <thead className="bg-neutral-50 border-b border-neutral-200">
                <tr>
                  <th className="text-left px-5 py-3 font-semibold text-neutral-600">Username</th>
                  <th className="text-left px-5 py-3 font-semibold text-neutral-600">Ruolo</th>
                  <th className="text-right px-5 py-3 font-semibold text-neutral-600">Azioni</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.username} className="border-b border-neutral-100 hover:bg-neutral-50">
                    <td className="px-5 py-4 font-medium text-brand-ink">
                      <span className="inline-flex items-center gap-2">
                        {u.username}
                        {u.username === currentUsername && (
                          <StatusBadge tone="neutral" size="sm">Tu</StatusBadge>
                        )}
                      </span>
                    </td>
                    <td className="px-5 py-4">
                      <select
                        value={u.role}
                        onChange={(e) => handleChangeRole(u.username, e.target.value)}
                        disabled={u.username === currentUsername}
                        className="text-sm border border-neutral-300 rounded-lg px-2 py-1 bg-white focus:outline-none focus:ring-2 focus:ring-brand-blue/30 focus:border-brand-blue disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {ROLES.map((r) => (
                          <option key={r} value={r}>{ROLE_LABELS[r]}</option>
                        ))}
                      </select>
                    </td>
                    <td className="px-5 py-4 text-right">
                      <div className="flex justify-end gap-2">
                        <Btn variant="chip" tone="blue" size="sm" onClick={() => openModal("password", u)}>
                          🔑 Password
                        </Btn>
                        {u.username !== currentUsername && (
                          <Btn variant="chip" tone="red" size="sm" onClick={() => openModal("delete", u)}>
                            🗑 Elimina
                          </Btn>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ===================== MODAL ===================== */}
      {modal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-8">

            {/* --- MODAL: NUOVO UTENTE --- */}
            {modal === "add" && (
              <>
                <h2 className="text-xl font-bold mb-6 text-brand-ink">➕ Nuovo utente</h2>
                <form onSubmit={handleAddUser} className="space-y-4">
                  <FormField label="Username">
                    <input
                      type="text"
                      value={newUser.username}
                      onChange={(e) => setNewUser({ ...newUser, username: e.target.value })}
                      className={inputCls}
                      placeholder="es. mario"
                    />
                  </FormField>
                  <FormField label="Password">
                    <input
                      type="password"
                      value={newUser.password}
                      onChange={(e) => setNewUser({ ...newUser, password: e.target.value })}
                      className={inputCls}
                    />
                  </FormField>
                  <FormField label="Ruolo">
                    <select
                      value={newUser.role}
                      onChange={(e) => setNewUser({ ...newUser, role: e.target.value })}
                      className={inputCls}
                    >
                      {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
                    </select>
                  </FormField>
                  {formError && <p className="text-brand-red text-sm font-semibold">{formError}</p>}
                  <div className="flex gap-3 pt-2">
                    <Btn type="submit" variant="primary" loading={saving} disabled={saving} className="flex-1">
                      {saving ? "Salvataggio…" : "Crea utente"}
                    </Btn>
                    <Btn type="button" variant="secondary" onClick={() => setModal(null)} className="flex-1">
                      Annulla
                    </Btn>
                  </div>
                </form>
              </>
            )}

            {/* --- MODAL: CAMBIA PASSWORD --- */}
            {modal === "password" && selectedUser && (
              <>
                <h2 className="text-xl font-bold mb-2 text-brand-ink">🔑 Cambia password</h2>
                <p className="text-sm text-neutral-500 mb-6">Utente: <strong>{selectedUser.username}</strong></p>
                <form onSubmit={handleChangePassword} className="space-y-4">
                  {selectedUser.username === currentUsername && (
                    <FormField label="Password attuale">
                      <input
                        type="password"
                        value={pwForm.current_password}
                        onChange={(e) => setPwForm({ ...pwForm, current_password: e.target.value })}
                        className={inputCls}
                      />
                    </FormField>
                  )}
                  <FormField label="Nuova password">
                    <input
                      type="password"
                      value={pwForm.new_password}
                      onChange={(e) => setPwForm({ ...pwForm, new_password: e.target.value })}
                      className={inputCls}
                    />
                  </FormField>
                  <FormField label="Conferma password">
                    <input
                      type="password"
                      value={pwForm.confirm}
                      onChange={(e) => setPwForm({ ...pwForm, confirm: e.target.value })}
                      className={inputCls}
                    />
                  </FormField>
                  {formError && <p className="text-brand-red text-sm font-semibold">{formError}</p>}
                  {formOk && <p className="text-brand-green text-sm font-semibold">{formOk}</p>}
                  <div className="flex gap-3 pt-2">
                    <Btn type="submit" variant="primary" loading={saving} disabled={saving} className="flex-1">
                      {saving ? "Salvataggio…" : "Aggiorna"}
                    </Btn>
                    <Btn type="button" variant="secondary" onClick={() => setModal(null)} className="flex-1">
                      Annulla
                    </Btn>
                  </div>
                </form>
              </>
            )}

            {/* --- MODAL: ELIMINA --- */}
            {modal === "delete" && selectedUser && (
              <>
                <h2 className="text-xl font-bold mb-4 text-brand-ink">🗑 Elimina utente</h2>
                <p className="text-sm text-neutral-600 mb-6">
                  Sei sicuro di voler eliminare l'utente <strong>{selectedUser.username}</strong>?
                  L'operazione non è reversibile.
                </p>
                {formError && <p className="text-brand-red text-sm mb-4 font-semibold">{formError}</p>}
                <div className="flex gap-3">
                  <Btn variant="danger" onClick={handleDelete} loading={saving} disabled={saving} className="flex-1">
                    {saving ? "Eliminazione…" : "Elimina"}
                  </Btn>
                  <Btn variant="secondary" onClick={() => setModal(null)} className="flex-1">
                    Annulla
                  </Btn>
                </div>
              </>
            )}

          </div>
        </div>
      )}
    </PageLayout>
  );
}


// ─────────────────────────────────────────────────────────────
// FormField + inputCls — micro-helper locali per uniformare i form
// ─────────────────────────────────────────────────────────────
const inputCls =
  "w-full border border-neutral-300 rounded-xl px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue/30 focus:border-brand-blue";

function FormField({ label, children }) {
  return (
    <div>
      <label className="block text-sm font-medium text-neutral-600 mb-1">{label}</label>
      {children}
    </div>
  );
}
