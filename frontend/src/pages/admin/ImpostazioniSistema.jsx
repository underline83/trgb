import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { API_BASE, apiFetch } from "../../config/api";

// ---------------------------------------------------------------------------
// COSTANTI
// ---------------------------------------------------------------------------
const ROLES = ["chef", "sommelier", "sala", "viewer"];
const ROLE_LABELS = {
  admin:     { label: "Admin",     icon: "👑" },
  chef:      { label: "Chef",      icon: "👨‍🍳" },
  sommelier: { label: "Sommelier", icon: "🍷" },
  sala:      { label: "Sala",      icon: "🍽️" },
  viewer:    { label: "Viewer",    icon: "👁" },
};
const ALL_ROLES = ["admin", "chef", "sommelier", "sala", "viewer"];

// ---------------------------------------------------------------------------
// COMPONENTE PRINCIPALE
// ---------------------------------------------------------------------------
export default function ImpostazioniSistema() {
  const navigate = useNavigate();
  const currentUsername = localStorage.getItem("username") || "";
  const role = localStorage.getItem("role");
  const [tab, setTab] = useState("utenti");

  useEffect(() => {
    if (role !== "admin") navigate("/admin");
  }, []);

  return (
    <div className="min-h-screen bg-neutral-100 p-6 font-sans">
      <div className="max-w-4xl mx-auto bg-white shadow-2xl rounded-3xl p-10 border border-neutral-200">

        {/* HEADER */}
        <div className="flex flex-col sm:flex-row justify-between gap-4 mb-8">
          <div>
            <h1 className="text-3xl font-bold text-neutral-800 mb-1">⚙️ Impostazioni Sistema</h1>
            <p className="text-neutral-500 text-sm">Gestione utenti e permessi moduli.</p>
          </div>
          <button onClick={() => navigate("/admin")}
            className="self-start px-4 py-2 rounded-xl text-sm font-medium border border-neutral-300 bg-neutral-50 hover:bg-neutral-100 shadow-sm transition">
            ← Torna
          </button>
        </div>

        {/* TAB BAR */}
        <div className="flex gap-1 bg-neutral-100 rounded-xl p-1 mb-8 w-fit">
          {[
            { key: "utenti",  label: "👤 Utenti" },
            { key: "moduli",  label: "🔐 Moduli & Permessi" },
            { key: "backup",  label: "💾 Backup" },
          ].map((t) => (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={`px-5 py-2 rounded-lg text-sm font-medium transition
                ${tab === t.key ? "bg-white shadow text-neutral-900" : "text-neutral-500 hover:text-neutral-700"}`}>
              {t.label}
            </button>
          ))}
        </div>

        {/* CONTENUTO */}
        {tab === "utenti" && <TabUtenti currentUsername={currentUsername} />}
        {tab === "moduli" && <TabModuli />}
        {tab === "backup" && <TabBackup />}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// TAB UTENTI
// ---------------------------------------------------------------------------
function TabUtenti({ currentUsername }) {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [modal, setModal] = useState(null);
  const [selectedUser, setSelectedUser] = useState(null);
  const [newUser, setNewUser] = useState({ username: "", password: "", role: "viewer" });
  const [pwForm, setPwForm] = useState({ current_password: "", new_password: "", confirm: "" });
  const [formError, setFormError] = useState("");
  const [formOk, setFormOk] = useState("");
  const [saving, setSaving] = useState(false);

  async function loadUsers() {
    setLoading(true);
    setError("");
    try {
      const res = await apiFetch(`${API_BASE}/auth/users/`);
      if (!res.ok) throw new Error("Errore nel caricamento");
      setUsers(await res.json());
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }

  useEffect(() => { loadUsers(); }, []);

  function openModal(type, user = null) {
    setFormError(""); setFormOk("");
    setPwForm({ current_password: "", new_password: "", confirm: "" });
    setSelectedUser(user);
    setModal(type);
  }

  async function handleAddUser(e) {
    e.preventDefault(); setFormError("");
    if (!newUser.username || !newUser.password) { setFormError("Username e password obbligatori"); return; }
    setSaving(true);
    try {
      const res = await apiFetch(`${API_BASE}/auth/users/`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newUser),
      });
      if (!res.ok) { const e = await res.json(); throw new Error(e.detail); }
      setModal(null); setNewUser({ username: "", password: "", role: "viewer" }); loadUsers();
    } catch (e) { setFormError(e.message); }
    finally { setSaving(false); }
  }

  async function handleChangePassword(e) {
    e.preventDefault(); setFormError(""); setFormOk("");
    if (pwForm.new_password !== pwForm.confirm) { setFormError("Le password non coincidono"); return; }
    if (pwForm.new_password.length < 4) { setFormError("Minimo 4 caratteri"); return; }
    setSaving(true);
    try {
      const body = { new_password: pwForm.new_password };
      if (selectedUser.username === currentUsername) body.current_password = pwForm.current_password;
      const res = await apiFetch(`${API_BASE}/auth/users/${selectedUser.username}/password`, {
        method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      });
      if (!res.ok) { const e = await res.json(); throw new Error(e.detail); }
      setFormOk("Password aggiornata");
      setTimeout(() => setModal(null), 1200);
    } catch (e) { setFormError(e.message); }
    finally { setSaving(false); }
  }

  async function handleChangeRole(username, newRole) {
    const res = await apiFetch(`${API_BASE}/auth/users/${username}/role`, {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ new_role: newRole }),
    });
    if (!res.ok) { const e = await res.json(); alert(e.detail); return; }
    loadUsers();
  }

  async function handleDelete() {
    setSaving(true);
    try {
      const res = await apiFetch(`${API_BASE}/auth/users/${selectedUser.username}`, { method: "DELETE" });
      if (!res.ok && res.status !== 204) { const e = await res.json(); throw new Error(e.detail); }
      setModal(null); loadUsers();
    } catch (e) { setFormError(e.message); }
    finally { setSaving(false); }
  }

  if (loading) return <p className="text-center text-neutral-400 py-12">Caricamento...</p>;
  if (error) return <div className="bg-red-50 text-red-700 border border-red-200 rounded-xl p-4">{error}</div>;

  return (
    <>
      <div className="flex justify-end mb-4">
        <button onClick={() => openModal("add")}
          className="px-4 py-2 rounded-xl text-sm font-medium bg-neutral-600 text-white hover:bg-neutral-700 shadow transition">
          + Nuovo utente
        </button>
      </div>

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
                  <select value={u.role} onChange={(e) => handleChangeRole(u.username, e.target.value)}
                    disabled={u.username === currentUsername}
                    className="text-sm border border-neutral-200 rounded-lg px-2 py-1 bg-white disabled:opacity-50">
                    {ALL_ROLES.map((r) => (
                      <option key={r} value={r}>{ROLE_LABELS[r].icon} {ROLE_LABELS[r].label}</option>
                    ))}
                  </select>
                </td>
                <td className="px-5 py-4 text-right">
                  <div className="flex justify-end gap-2">
                    <button onClick={() => openModal("password", u)}
                      className="px-3 py-1.5 text-xs rounded-lg border border-blue-200 text-blue-700 bg-blue-50 hover:bg-blue-100 transition">
                      🔑 Password
                    </button>
                    {u.username !== currentUsername && (
                      <button onClick={() => openModal("delete", u)}
                        className="px-3 py-1.5 text-xs rounded-lg border border-red-200 text-red-700 bg-red-50 hover:bg-red-100 transition">
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

      {/* MODAL */}
      {modal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-8">

            {modal === "add" && (
              <>
                <h2 className="text-xl font-bold mb-6">➕ Nuovo utente</h2>
                <form onSubmit={handleAddUser} className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-neutral-600 mb-1">Username</label>
                    <input type="text" value={newUser.username}
                      onChange={(e) => setNewUser({ ...newUser, username: e.target.value })}
                      className="w-full border border-neutral-300 rounded-xl px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-neutral-400" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-neutral-600 mb-1">Password</label>
                    <input type="password" value={newUser.password}
                      onChange={(e) => setNewUser({ ...newUser, password: e.target.value })}
                      className="w-full border border-neutral-300 rounded-xl px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-neutral-400" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-neutral-600 mb-1">Ruolo</label>
                    <select value={newUser.role} onChange={(e) => setNewUser({ ...newUser, role: e.target.value })}
                      className="w-full border border-neutral-300 rounded-xl px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-neutral-400">
                      {ALL_ROLES.map((r) => <option key={r} value={r}>{ROLE_LABELS[r].icon} {ROLE_LABELS[r].label}</option>)}
                    </select>
                  </div>
                  {formError && <p className="text-red-600 text-sm">{formError}</p>}
                  <div className="flex gap-3 pt-2">
                    <button type="submit" disabled={saving}
                      className="flex-1 bg-neutral-600 text-white rounded-xl py-2 text-sm font-medium hover:bg-neutral-700 disabled:opacity-50 transition">
                      {saving ? "..." : "Crea utente"}
                    </button>
                    <button type="button" onClick={() => setModal(null)}
                      className="flex-1 border border-neutral-300 rounded-xl py-2 text-sm hover:bg-neutral-50 transition">
                      Annulla
                    </button>
                  </div>
                </form>
              </>
            )}

            {modal === "password" && selectedUser && (
              <>
                <h2 className="text-xl font-bold mb-2">🔑 Cambia password</h2>
                <p className="text-sm text-neutral-500 mb-6">Utente: <strong>{selectedUser.username}</strong></p>
                <form onSubmit={handleChangePassword} className="space-y-4">
                  {selectedUser.username === currentUsername && (
                    <div>
                      <label className="block text-sm font-medium text-neutral-600 mb-1">Password attuale</label>
                      <input type="password" value={pwForm.current_password}
                        onChange={(e) => setPwForm({ ...pwForm, current_password: e.target.value })}
                        className="w-full border border-neutral-300 rounded-xl px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
                    </div>
                  )}
                  <div>
                    <label className="block text-sm font-medium text-neutral-600 mb-1">Nuova password</label>
                    <input type="password" value={pwForm.new_password}
                      onChange={(e) => setPwForm({ ...pwForm, new_password: e.target.value })}
                      className="w-full border border-neutral-300 rounded-xl px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-neutral-600 mb-1">Conferma</label>
                    <input type="password" value={pwForm.confirm}
                      onChange={(e) => setPwForm({ ...pwForm, confirm: e.target.value })}
                      className="w-full border border-neutral-300 rounded-xl px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
                  </div>
                  {formError && <p className="text-red-600 text-sm">{formError}</p>}
                  {formOk && <p className="text-green-600 text-sm font-medium">{formOk}</p>}
                  <div className="flex gap-3 pt-2">
                    <button type="submit" disabled={saving}
                      className="flex-1 bg-blue-600 text-white rounded-xl py-2 text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition">
                      {saving ? "..." : "Aggiorna"}
                    </button>
                    <button type="button" onClick={() => setModal(null)}
                      className="flex-1 border border-neutral-300 rounded-xl py-2 text-sm hover:bg-neutral-50 transition">
                      Annulla
                    </button>
                  </div>
                </form>
              </>
            )}

            {modal === "delete" && selectedUser && (
              <>
                <h2 className="text-xl font-bold mb-4">🗑 Elimina utente</h2>
                <p className="text-sm text-neutral-600 mb-6">
                  Sicuro di voler eliminare <strong>{selectedUser.username}</strong>? L'operazione non è reversibile.
                </p>
                {formError && <p className="text-red-600 text-sm mb-4">{formError}</p>}
                <div className="flex gap-3">
                  <button onClick={handleDelete} disabled={saving}
                    className="flex-1 bg-red-600 text-white rounded-xl py-2 text-sm font-medium hover:bg-red-700 disabled:opacity-50 transition">
                    {saving ? "..." : "Elimina"}
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
    </>
  );
}

// ---------------------------------------------------------------------------
// TAB MODULI
// ---------------------------------------------------------------------------
function TabModuli() {
  const [modules, setModules] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    apiFetch(`${API_BASE}/settings/modules/`)
      .then((r) => r.json())
      .then(setModules)
      .catch(() => setError("Errore nel caricamento"))
      .finally(() => setLoading(false));
  }, []);

  function hasRole(moduleKey, checkRole) {
    return modules.find((x) => x.key === moduleKey)?.roles?.includes(checkRole) ?? false;
  }

  function toggleRole(moduleKey, checkRole) {
    if (moduleKey === "admin" || checkRole === "admin") return;
    setModules((prev) =>
      prev.map((m) => {
        if (m.key !== moduleKey) return m;
        const has = m.roles.includes(checkRole);
        return { ...m, roles: has ? m.roles.filter((r) => r !== checkRole) : [...m.roles, checkRole] };
      })
    );
    setSaved(false);
  }

  async function handleSave() {
    setSaving(true); setError(""); setSaved(false);
    try {
      const res = await apiFetch(`${API_BASE}/settings/modules/`, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(modules.map(({ key, roles }) => ({ key, roles }))),
      });
      if (!res.ok) { const e = await res.json(); throw new Error(e.detail); }
      setModules(await res.json());
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (e) { setError(e.message); }
    finally { setSaving(false); }
  }

  if (loading) return <p className="text-center text-neutral-400 py-12">Caricamento...</p>;
  if (error) return <div className="bg-red-50 text-red-700 border border-red-200 rounded-xl p-4">{error}</div>;

  return (
    <>
      <div className="overflow-x-auto rounded-2xl border border-neutral-200 mb-6">
        <table className="w-full text-sm">
          <thead className="bg-neutral-50 border-b border-neutral-200">
            <tr>
              <th className="text-left px-5 py-4 font-semibold text-neutral-600">Modulo</th>
              <th className="text-center px-4 py-4 font-semibold text-neutral-400">
                <div>{ROLE_LABELS.admin.icon}</div>
                <div className="text-xs">{ROLE_LABELS.admin.label}</div>
              </th>
              {ROLES.map((r) => (
                <th key={r} className="text-center px-4 py-4 font-semibold text-neutral-600">
                  <div>{ROLE_LABELS[r].icon}</div>
                  <div className="text-xs">{ROLE_LABELS[r].label}</div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {modules.map((m, i) => (
              <tr key={m.key} className={`border-b border-neutral-100 ${i % 2 === 0 ? "" : "bg-neutral-50/50"}`}>
                <td className="px-5 py-4">
                  <div className="flex items-center gap-2">
                    <span className="text-xl">{m.icon}</span>
                    <div>
                      <div className="font-medium text-neutral-800">{m.label}</div>
                      <div className="text-xs text-neutral-400">{m.description}</div>
                    </div>
                  </div>
                </td>
                {/* Admin — sempre spuntato */}
                <td className="text-center px-4 py-4">
                  <div className="flex justify-center">
                    <div className="w-5 h-5 rounded bg-neutral-200 flex items-center justify-center">
                      <svg className="w-3 h-3 text-neutral-700" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd"/>
                      </svg>
                    </div>
                  </div>
                </td>
                {ROLES.map((r) => {
                  const locked = m.key === "admin";
                  const checked = hasRole(m.key, r);
                  return (
                    <td key={r} className="text-center px-4 py-4">
                      <div className="flex justify-center">
                        <button onClick={() => toggleRole(m.key, r)} disabled={locked}
                          className={`w-5 h-5 rounded border-2 transition flex items-center justify-center
                            ${locked ? "cursor-not-allowed opacity-30 border-neutral-200 bg-neutral-100" : "cursor-pointer"}
                            ${!locked && checked ? "bg-neutral-500 border-neutral-500" : ""}
                            ${!locked && !checked ? "bg-white border-neutral-300 hover:border-neutral-400" : ""}
                          `}>
                          {checked && (
                            <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                              <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd"/>
                            </svg>
                          )}
                        </button>
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-neutral-400 mb-6">
        Admin ha sempre accesso a tutto. I moduli non selezionati non vengono mostrati agli utenti con quel ruolo.
      </p>

      <div className="flex items-center gap-4">
        <button onClick={handleSave} disabled={saving}
          className="px-6 py-2.5 bg-neutral-600 text-white rounded-xl text-sm font-medium hover:bg-neutral-700 disabled:opacity-50 shadow transition">
          {saving ? "Salvataggio..." : "Salva impostazioni"}
        </button>
        {saved && <span className="text-green-600 text-sm font-medium">✓ Salvato</span>}
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// TAB BACKUP
// ---------------------------------------------------------------------------
function TabBackup() {
  const [info, setInfo] = useState(null);
  const [backups, setBackups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);
  const [downloadingFile, setDownloadingFile] = useState(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  async function loadData() {
    setLoading(true);
    setError("");
    try {
      const [infoRes, listRes] = await Promise.all([
        apiFetch(`${API_BASE}/backup/info`),
        apiFetch(`${API_BASE}/backup/list`),
      ]);
      if (!infoRes.ok || !listRes.ok) throw new Error("Errore nel caricamento");
      setInfo(await infoRes.json());
      const listData = await listRes.json();
      setBackups(listData.backups || []);
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }

  useEffect(() => { loadData(); }, []);

  async function handleDownloadNow() {
    setDownloading(true);
    setError("");
    setSuccess("");
    try {
      const res = await apiFetch(`${API_BASE}/backup/download`);
      if (!res.ok) throw new Error("Errore durante il backup");
      const blob = await res.blob();
      const filename = res.headers.get("Content-Disposition")?.match(/filename="(.+)"/)?.[1]
        || `trgb-backup-${new Date().toISOString().slice(0,16).replace(/[T:]/g, "-")}.tar.gz`;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      setSuccess("Backup scaricato!");
      setTimeout(() => setSuccess(""), 4000);
    } catch (e) { setError(e.message); }
    finally { setDownloading(false); }
  }

  async function handleDownloadDaily(filename) {
    setDownloadingFile(filename);
    setError("");
    try {
      const res = await apiFetch(`${API_BASE}/backup/download/${filename}`);
      if (!res.ok) throw new Error("Errore nel download");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) { setError(e.message); }
    finally { setDownloadingFile(null); }
  }

  if (loading) return <p className="text-center text-neutral-400 py-12">Caricamento...</p>;
  if (error && !info) return <div className="bg-red-50 text-red-700 border border-red-200 rounded-xl p-4">{error}</div>;

  return (
    <div className="space-y-8">

      {/* STATO DATABASE */}
      {info && (
        <div>
          <h3 className="text-lg font-semibold text-neutral-800 mb-3">Database attivi</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {info.databases.filter(d => d.exists).map((db) => (
              <div key={db.name} className="flex items-center justify-between bg-neutral-50 rounded-xl px-4 py-3 border border-neutral-200">
                <span className="text-sm font-medium text-neutral-700">{db.name}</span>
                <span className="text-xs text-neutral-500">{db.size_mb} MB</span>
              </div>
            ))}
          </div>
          {info.last_backup && (
            <p className="text-xs text-neutral-400 mt-3">
              Ultimo backup automatico: <strong>{info.last_backup.date}</strong> ({info.last_backup.size_mb} MB)
            </p>
          )}
        </div>
      )}

      {/* DOWNLOAD ISTANTANEO */}
      <div className="bg-neutral-50 border border-neutral-200 rounded-2xl p-6">
        <h3 className="text-lg font-semibold text-neutral-800 mb-2">Scarica backup adesso</h3>
        <p className="text-sm text-neutral-600 mb-4">
          Crea un backup fresco di tutti i database e scaricalo sul tuo computer.
        </p>
        <button onClick={handleDownloadNow} disabled={downloading}
          className="px-6 py-2.5 bg-neutral-600 text-white rounded-xl text-sm font-medium hover:bg-neutral-700 disabled:opacity-50 shadow transition">
          {downloading ? "Preparazione backup..." : "💾 Scarica backup completo"}
        </button>
        {success && <p className="text-green-600 text-sm font-medium mt-3">{success}</p>}
        {error && <p className="text-red-600 text-sm mt-3">{error}</p>}
      </div>

      {/* LISTA BACKUP GIORNALIERI */}
      {backups.length > 0 && (
        <div>
          <h3 className="text-lg font-semibold text-neutral-800 mb-3">Backup giornalieri sul server</h3>
          <div className="overflow-x-auto rounded-xl border border-neutral-200">
            <table className="w-full text-sm">
              <thead className="bg-neutral-50 border-b border-neutral-200">
                <tr>
                  <th className="text-left px-5 py-3 font-semibold text-neutral-600">Data</th>
                  <th className="text-right px-5 py-3 font-semibold text-neutral-600">Dimensione</th>
                  <th className="text-right px-5 py-3 font-semibold text-neutral-600"></th>
                </tr>
              </thead>
              <tbody>
                {backups.slice(0, 10).map((b) => (
                  <tr key={b.filename} className="border-b border-neutral-100 hover:bg-neutral-50">
                    <td className="px-5 py-3 text-neutral-800">{b.date}</td>
                    <td className="px-5 py-3 text-right text-neutral-500">{b.size_mb} MB</td>
                    <td className="px-5 py-3 text-right">
                      <button onClick={() => handleDownloadDaily(b.filename)}
                        disabled={downloadingFile === b.filename}
                        className="px-3 py-1.5 text-xs rounded-lg border border-blue-200 text-blue-700 bg-blue-50 hover:bg-blue-100 transition disabled:opacity-50">
                        {downloadingFile === b.filename ? "..." : "Scarica"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {backups.length > 10 && (
            <p className="text-xs text-neutral-400 mt-2">Mostrati i 10 backup più recenti su {backups.length} totali.</p>
          )}
        </div>
      )}
    </div>
  );
}
