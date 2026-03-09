import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { API_BASE, apiFetch } from "../../config/api";

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

  function toggle(key) {
    if (key === "admin") return; // il modulo admin non si può disabilitare
    setModules((prev) =>
      prev.map((m) => (m.key === key ? { ...m, enabled: !m.enabled } : m))
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
        body: JSON.stringify(modules.map(({ key, enabled }) => ({ key, enabled }))),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || "Errore nel salvataggio");
      }
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
      <div className="max-w-2xl mx-auto bg-white shadow-2xl rounded-3xl p-10 border border-neutral-200">

        {/* HEADER */}
        <div className="flex flex-col sm:flex-row justify-between gap-4 mb-8">
          <div>
            <h1 className="text-3xl font-bold text-neutral-800 mb-1">⚙️ Impostazioni Sistema</h1>
            <p className="text-neutral-500 text-sm">Abilita o disabilita i macro-moduli del gestionale.</p>
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
            <div className="space-y-3 mb-8">
              {modules.map((m) => {
                const locked = m.key === "admin";
                return (
                  <div
                    key={m.key}
                    className={`flex items-center justify-between p-5 rounded-2xl border transition
                      ${m.enabled ? "bg-white border-neutral-200" : "bg-neutral-50 border-neutral-200 opacity-60"}
                    `}
                  >
                    <div className="flex items-center gap-4">
                      <span className="text-3xl">{m.icon}</span>
                      <div>
                        <div className="font-semibold text-neutral-800 text-sm">
                          {m.label}
                          {locked && (
                            <span className="ml-2 text-xs bg-neutral-100 text-neutral-500 rounded-full px-2 py-0.5">
                              sempre attivo
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-neutral-500 mt-0.5">{m.description}</div>
                      </div>
                    </div>

                    {/* TOGGLE */}
                    <button
                      onClick={() => toggle(m.key)}
                      disabled={locked}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors
                        ${locked ? "cursor-not-allowed opacity-40" : "cursor-pointer"}
                        ${m.enabled ? "bg-amber-500" : "bg-neutral-300"}
                      `}
                    >
                      <span
                        className={`inline-block h-4 w-4 rounded-full bg-white shadow transition-transform
                          ${m.enabled ? "translate-x-6" : "translate-x-1"}
                        `}
                      />
                    </button>
                  </div>
                );
              })}
            </div>

            <div className="flex items-center gap-4">
              <button
                onClick={handleSave}
                disabled={saving}
                className="px-6 py-2.5 bg-amber-600 text-white rounded-xl text-sm font-medium hover:bg-amber-700 disabled:opacity-50 shadow transition"
              >
                {saving ? "Salvataggio..." : "Salva impostazioni"}
              </button>
              {saved && (
                <span className="text-green-600 text-sm font-medium">✓ Salvato</span>
              )}
            </div>

            <p className="text-xs text-neutral-400 mt-4">
              I moduli disabilitati sono nascosti agli utenti non-admin. L'admin può sempre accedere a tutto.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
