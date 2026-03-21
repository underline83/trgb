import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { API_BASE, apiFetch } from "../../config/api";

const ROLES = ["admin", "chef", "sommelier", "sala", "viewer"];

const ROLE_LABELS = {
  admin: "👑 Admin",
  chef: "👨‍🍳 Chef",
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
    <div className="min-h-screen bg-neutral-100 p-6 font-sans">
      <div className="max-w-4xl mx-auto bg-white shadow-2xl rounded-3xl p-10 border border-neutral-200">

        {/* HEADER */}
        <div className="flex flex-col sm:flex-row justify-between gap-4 mb-8">
          <div>
            <h1 className="text-3xl font-bold text-neutral-800 mb-1">👤 Gestione Utenti</h1>
            <p className="text-neutral-500 text-sm">Aggiungi, modifica o rimuovi gli utenti del gestionale.</p>
          </div>
          <div className="flex gap-3 items-start">
            <button
              onClick={() => openModal("add")}
              className="px-4 py-2 rounded-xl text-sm font-medium bg-neutral-600 text-white hover:bg-neutral-700 shadow transition"
            >
              + Nuovo utente
            </button>
            <button
              onClick={() => navigate("/admin")}
              className="px-4 py-2 rounded-xl text-sm font-medium border border-neutral-300 bg-neutral-50 hover:bg-neutral-100 shadow-sm transition"
            >
              ← Torna
            </button>
          </div>
        </div>

        {/* ERRORE CARICAMENTO */}
        {error && <div className="bg-red-50 text-red-700 border border-red-200 rounded-xl p-4 mb-6">{error}</div>}

        {/* TABELLA UTENTI */}
        {loading ? (
          <p className="text-center text-neutral-400 py-12">Caricamento...</p>
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
                    <td className="px-5 py-4 font-medium text-neutral-800">
                      {u.username}
                      {u.username === currentUsername && (
                        <span className="ml-2 text-xs bg-neutral-100 text-neutral-700 rounded-full px-2 py-0.5">Tu</span>
                      )}
                    </td>
                    <td className="px-5 py-4">
                      <select
                        value={u.role}
                        onChange={(e) => handleChangeRole(u.username, e.target.value)}
                        disabled={u.username === currentUsername}
                        className="text-sm border border-neutral-200 rounded-lg px-2 py-1 bg-white disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {ROLES.map((r) => (
                          <option key={r} value={r}>{ROLE_LABELS[r]}</option>
                        ))}
                      </select>
                    </td>
                    <td className="px-5 py-4 text-right">
                      <div className="flex justify-end gap-2">
                        <button
                          onClick={() => openModal("password", u)}
                          className="px-3 py-1.5 text-xs rounded-lg border border-blue-200 text-blue-700 bg-blue-50 hover:bg-blue-100 transition"
                        >
                          🔑 Password
                        </button>
                        {u.username !== currentUsername && (
                          <button
                            onClick={() => openModal("delete", u)}
                            className="px-3 py-1.5 text-xs rounded-lg border border-red-200 text-red-700 bg-red-50 hover:bg-red-100 transition"
                          >
                            🗑 Elimina
                          </button>
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
                <h2 className="text-xl font-bold mb-6 text-neutral-800">➕ Nuovo utente</h2>
                <form onSubmit={handleAddUser} className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-neutral-600 mb-1">Username</label>
                    <input
                      type="text"
                      value={newUser.username}
                      onChange={(e) => setNewUser({ ...newUser, username: e.target.value })}
                      className="w-full border border-neutral-300 rounded-xl px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-neutral-400"
                      placeholder="es. mario"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-neutral-600 mb-1">Password</label>
                    <input
                      type="password"
                      value={newUser.password}
                      onChange={(e) => setNewUser({ ...newUser, password: e.target.value })}
                      className="w-full border border-neutral-300 rounded-xl px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-neutral-400"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-neutral-600 mb-1">Ruolo</label>
                    <select
                      value={newUser.role}
                      onChange={(e) => setNewUser({ ...newUser, role: e.target.value })}
                      className="w-full border border-neutral-300 rounded-xl px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-neutral-400"
                    >
                      {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
                    </select>
                  </div>
                  {formError && <p className="text-red-600 text-sm">{formError}</p>}
                  <div className="flex gap-3 pt-2">
                    <button type="submit" disabled={saving}
                      className="flex-1 bg-neutral-600 text-white rounded-xl py-2 text-sm font-medium hover:bg-neutral-700 disabled:opacity-50 transition">
                      {saving ? "Salvataggio..." : "Crea utente"}
                    </button>
                    <button type="button" onClick={() => setModal(null)}
                      className="flex-1 border border-neutral-300 rounded-xl py-2 text-sm hover:bg-neutral-50 transition">
                      Annulla
                    </button>
                  </div>
                </form>
              </>
            )}

            {/* --- MODAL: CAMBIA PASSWORD --- */}
            {modal === "password" && selectedUser && (
              <>
                <h2 className="text-xl font-bold mb-2 text-neutral-800">🔑 Cambia password</h2>
                <p className="text-sm text-neutral-500 mb-6">Utente: <strong>{selectedUser.username}</strong></p>
                <form onSubmit={handleChangePassword} className="space-y-4">
                  {selectedUser.username === currentUsername && (
                    <div>
                      <label className="block text-sm font-medium text-neutral-600 mb-1">Password attuale</label>
                      <input
                        type="password"
                        value={pwForm.current_password}
                        onChange={(e) => setPwForm({ ...pwForm, current_password: e.target.value })}
                        className="w-full border border-neutral-300 rounded-xl px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                      />
                    </div>
                  )}
                  <div>
                    <label className="block text-sm font-medium text-neutral-600 mb-1">Nuova password</label>
                    <input
                      type="password"
                      value={pwForm.new_password}
                      onChange={(e) => setPwForm({ ...pwForm, new_password: e.target.value })}
                      className="w-full border border-neutral-300 rounded-xl px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-neutral-600 mb-1">Conferma password</label>
                    <input
                      type="password"
                      value={pwForm.confirm}
                      onChange={(e) => setPwForm({ ...pwForm, confirm: e.target.value })}
                      className="w-full border border-neutral-300 rounded-xl px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                    />
                  </div>
                  {formError && <p className="text-red-600 text-sm">{formError}</p>}
                  {formOk && <p className="text-green-600 text-sm font-medium">{formOk}</p>}
                  <div className="flex gap-3 pt-2">
                    <button type="submit" disabled={saving}
                      className="flex-1 bg-blue-600 text-white rounded-xl py-2 text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition">
                      {saving ? "Salvataggio..." : "Aggiorna"}
                    </button>
                    <button type="button" onClick={() => setModal(null)}
                      className="flex-1 border border-neutral-300 rounded-xl py-2 text-sm hover:bg-neutral-50 transition">
                      Annulla
                    </button>
                  </div>
                </form>
              </>
            )}

            {/* --- MODAL: ELIMINA --- */}
            {modal === "delete" && selectedUser && (
              <>
                <h2 className="text-xl font-bold mb-4 text-neutral-800">🗑 Elimina utente</h2>
                <p className="text-sm text-neutral-600 mb-6">
                  Sei sicuro di voler eliminare l'utente <strong>{selectedUser.username}</strong>?
                  L'operazione non è reversibile.
                </p>
                {formError && <p className="text-red-600 text-sm mb-4">{formError}</p>}
                <div className="flex gap-3">
                  <button onClick={handleDelete} disabled={saving}
                    className="flex-1 bg-red-600 text-white rounded-xl py-2 text-sm font-medium hover:bg-red-700 disabled:opacity-50 transition">
                    {saving ? "Eliminazione..." : "Elimina"}
                  </button>
                  <button onClick={() => setModal(null)}
                    className="flex-1 border border-neutral-300 rounded-xl py-2 text-sm hover:bg-neutral-50 transition">
                    Annulla
                  </button>
                </div>
              </>
            )}

          </div>
        </div>
      )}
    </div>
  );
}
