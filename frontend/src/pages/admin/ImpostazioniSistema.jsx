import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { API_BASE, apiFetch } from "../../config/api";

const ROLES = ["chef", "sommelier", "viewer"];
const ROLE_LABELS = {
  admin:     { label: "Admin",     icon: "👑" },
  chef:      { label: "Chef",      icon: "👨‍🍳" },
  sommelier: { label: "Sommelier", icon: "🍷" },
  viewer:    { label: "Viewer",    icon: "👁" },
};

export default function ImpostazioniSistema() {
  const navigate = useNavigate();
  const role = localStorage.getItem("role");

  const [modules, setModules] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (role !== "admin") { navigate("/admin"); return; }
    apiFetch(`${API_BASE}/settings/modules/`)
      .then((r) => r.json())
      .then(setModules)
      .catch(() => setError("Errore nel caricamento"))
      .finally(() => setLoading(false));
  }, []);

  function hasRole(moduleKey, checkRole) {
    const m = modules.find((x) => x.key === moduleKey);
    return m?.roles?.includes(checkRole) ?? false;
  }

  function toggleRole(moduleKey, checkRole) {
    // Il modulo admin è sempre solo per admin — non modificabile
    if (moduleKey === "admin") return;
    // admin è sempre incluso — non rimuovibile
    if (checkRole === "admin") return;

    setModules((prev) =>
      prev.map((m) => {
        if (m.key !== moduleKey) return m;
        const has = m.roles.includes(checkRole);
        const newRoles = has
          ? m.roles.filter((r) => r !== checkRole)
          : [...m.roles, checkRole];
        return { ...m, roles: newRoles };
      })
    );
    setSaved(false);
  }

  async function handleSave() {
    setSaving(true);
    setError("");
    setSaved(false);
    try {
      const res = await apiFetch(`${API_BASE}/settings/modules/`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(modules.map(({ key, roles }) => ({ key, roles }))),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || "Errore nel salvataggio");
      }
      const updated = await res.json();
      setModules(updated);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="min-h-screen bg-neutral-100 p-6 font-sans">
      <div className="max-w-3xl mx-auto bg-white shadow-2xl rounded-3xl p-10 border border-neutral-200">

        {/* HEADER */}
        <div className="flex flex-col sm:flex-row justify-between gap-4 mb-8">
          <div>
            <h1 className="text-3xl font-bold text-neutral-800 mb-1">⚙️ Impostazioni Sistema</h1>
            <p className="text-neutral-500 text-sm">
              Definisci quali ruoli possono accedere a ciascun modulo.
            </p>
          </div>
          <button
            onClick={() => navigate("/admin")}
            className="self-start px-4 py-2 rounded-xl text-sm font-medium border border-neutral-300 bg-neutral-50 hover:bg-neutral-100 shadow-sm transition"
          >
            ← Torna
          </button>
        </div>

        {error && (
          <div className="bg-red-50 text-red-700 border border-red-200 rounded-xl p-4 mb-6 text-sm">{error}</div>
        )}

        {loading ? (
          <p className="text-center text-neutral-400 py-12">Caricamento...</p>
        ) : (
          <>
            {/* GRIGLIA MODULI × RUOLI */}
            <div className="overflow-x-auto rounded-2xl border border-neutral-200 mb-8">
              <table className="w-full text-sm">
                <thead className="bg-neutral-50 border-b border-neutral-200">
                  <tr>
                    <th className="text-left px-5 py-4 font-semibold text-neutral-600 w-48">Modulo</th>
                    {/* Admin fisso */}
                    <th className="text-center px-4 py-4 font-semibold text-neutral-400 w-24">
                      <div>{ROLE_LABELS.admin.icon}</div>
                      <div className="text-xs">{ROLE_LABELS.admin.label}</div>
                    </th>
                    {ROLES.map((r) => (
                      <th key={r} className="text-center px-4 py-4 font-semibold text-neutral-600 w-24">
                        <div>{ROLE_LABELS[r].icon}</div>
                        <div className="text-xs">{ROLE_LABELS[r].label}</div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {modules.map((m, i) => {
                    const locked = m.key === "admin";
                    return (
                      <tr key={m.key} className={`border-b border-neutral-100 ${i % 2 === 0 ? "" : "bg-neutral-50/50"}`}>
                        {/* Modulo */}
                        <td className="px-5 py-4">
                          <div className="flex items-center gap-2">
                            <span className="text-xl">{m.icon}</span>
                            <div>
                              <div className="font-medium text-neutral-800">{m.label}</div>
                              <div className="text-xs text-neutral-400">{m.description}</div>
                            </div>
                          </div>
                        </td>

                        {/* Admin — sempre spuntato, non modificabile */}
                        <td className="text-center px-4 py-4">
                          <div className="flex justify-center">
                            <div className="w-5 h-5 rounded bg-amber-200 flex items-center justify-center">
                              <svg className="w-3 h-3 text-amber-700" fill="currentColor" viewBox="0 0 20 20">
                                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                              </svg>
                            </div>
                          </div>
                        </td>

                        {/* Altri ruoli */}
                        {ROLES.map((r) => {
                          const checked = hasRole(m.key, r);
                          return (
                            <td key={r} className="text-center px-4 py-4">
                              <div className="flex justify-center">
                                <button
                                  onClick={() => toggleRole(m.key, r)}
                                  disabled={locked}
                                  className={`w-5 h-5 rounded border-2 transition flex items-center justify-center
                                    ${locked ? "cursor-not-allowed opacity-30 border-neutral-200 bg-neutral-100" : "cursor-pointer"}
                                    ${!locked && checked ? "bg-amber-500 border-amber-500" : ""}
                                    ${!locked && !checked ? "bg-white border-neutral-300 hover:border-amber-400" : ""}
                                  `}
                                >
                                  {checked && (
                                    <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                                    </svg>
                                  )}
                                </button>
                              </div>
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <p className="text-xs text-neutral-400 mb-6">
              L'admin ha sempre accesso a tutti i moduli. I moduli non selezionati per un ruolo non vengono mostrati agli utenti con quel ruolo.
            </p>

            <div className="flex items-center gap-4">
              <button
                onClick={handleSave}
                disabled={saving}
                className="px-6 py-2.5 bg-amber-600 text-white rounded-xl text-sm font-medium hover:bg-amber-700 disabled:opacity-50 shadow transition"
              >
                {saving ? "Salvataggio..." : "Salva impostazioni"}
              </button>
              {saved && <span className="text-green-600 text-sm font-medium">✓ Salvato</span>}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
