// @version: v1.0-banca-categorie
// Gestione categorie banca con mapping personalizzato
import React, { useEffect, useState } from "react";
import { API_BASE, apiFetch } from "../../config/api";
import BancaNav from "./BancaNav";

const FC = `${API_BASE}/banca`;

const fmt = (n) =>
  n != null
    ? Number(n).toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : "—";

const COLORI_PRESET = [
  "#059669", "#dc2626", "#2563eb", "#d97706", "#7c3aed",
  "#db2777", "#0891b2", "#65a30d", "#ea580c", "#6b7280",
];

export default function BancaCategorie() {
  const [categorie, setCategorie] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editingId, setEditingId] = useState(null); // "cat|subcat"
  const [editForm, setEditForm] = useState({
    categoria_custom: "",
    colore: "#6b7280",
    icona: "📁",
    tipo: "uscita",
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadCategorie();
  }, []);

  const loadCategorie = async () => {
    setLoading(true);
    try {
      const resp = await apiFetch(`${FC}/categorie`);
      if (!resp.ok) throw new Error("Errore");
      setCategorie(await resp.json());
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const startEdit = (c) => {
    const key = `${c.categoria_banca}|${c.sottocategoria_banca || ""}`;
    setEditingId(key);
    setEditForm({
      categoria_custom: c.categoria_custom || "",
      colore: c.colore || "#6b7280",
      icona: c.icona || "📁",
      tipo: c.tipo || (c.totale >= 0 ? "entrata" : "uscita"),
    });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditForm({ categoria_custom: "", colore: "#6b7280", icona: "📁", tipo: "uscita" });
  };

  const saveMap = async (c) => {
    setSaving(true);
    setError("");
    try {
      const resp = await apiFetch(`${FC}/categorie/map`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          categoria_banca: c.categoria_banca,
          sottocategoria_banca: c.sottocategoria_banca || "",
          ...editForm,
        }),
      });
      if (!resp.ok) throw new Error("Errore salvataggio");
      cancelEdit();
      await loadCategorie();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const deleteMap = async (mapId) => {
    try {
      await apiFetch(`${FC}/categorie/map/${mapId}`, { method: "DELETE" });
      await loadCategorie();
    } catch (_) {}
  };

  return (
    <div className="min-h-screen bg-neutral-100 p-6 font-sans">
      <BancaNav current="categorie" />
      <div className="max-w-5xl mx-auto bg-white shadow-2xl rounded-3xl p-6 sm:p-10 border border-neutral-200 mt-4">
        <h1 className="text-3xl font-bold text-emerald-900 tracking-wide font-playfair mb-1">
          Categorie
        </h1>
        <p className="text-neutral-600 text-sm mb-6">
          Mappa le categorie della banca alle tue categorie personalizzate per una migliore organizzazione.
        </p>

        {error && (
          <div className="mb-4 rounded-xl border border-red-300 bg-red-50 text-red-800 px-4 py-3 text-sm">
            {error}
          </div>
        )}

        {loading ? (
          <div className="text-center py-12 text-neutral-500">Caricamento...</div>
        ) : categorie.length === 0 ? (
          <div className="text-center py-12 text-neutral-500">
            Nessuna categoria trovata. Importa prima i movimenti bancari.
          </div>
        ) : (
          <div className="space-y-3">
            {categorie.map((c) => {
              const key = `${c.categoria_banca}|${c.sottocategoria_banca || ""}`;
              const isEditing = editingId === key;

              return (
                <div
                  key={key}
                  className={`rounded-xl border p-4 transition ${
                    isEditing
                      ? "bg-blue-50 border-blue-300"
                      : c.categoria_custom
                      ? "bg-emerald-50/50 border-emerald-200"
                      : "bg-white border-neutral-200"
                  }`}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-sm font-semibold text-neutral-800">
                          {c.categoria_banca}
                        </span>
                        {c.sottocategoria_banca && (
                          <span className="text-xs text-neutral-500">
                            — {c.sottocategoria_banca}
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-neutral-500">
                        {c.num_movimenti} movimenti · Totale: <span className={`font-mono font-semibold ${c.totale >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                          {c.totale >= 0 ? "+" : ""}{fmt(c.totale)}
                        </span>
                      </div>
                      {c.categoria_custom && !isEditing && (
                        <div className="mt-2 flex items-center gap-2">
                          <span
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium"
                            style={{ backgroundColor: (c.colore || "#6b7280") + "20", color: c.colore }}
                          >
                            {c.icona} {c.categoria_custom}
                          </span>
                          <span className="text-[10px] text-neutral-400 uppercase">{c.tipo}</span>
                        </div>
                      )}
                    </div>
                    <div className="flex gap-2 flex-shrink-0">
                      {!isEditing ? (
                        <>
                          <button
                            onClick={() => startEdit(c)}
                            className="px-3 py-1.5 rounded-lg text-xs font-medium border border-neutral-300 bg-neutral-50 hover:bg-neutral-100 transition"
                          >
                            {c.categoria_custom ? "Modifica" : "Mappa"}
                          </button>
                          {c.map_id && (
                            <button
                              onClick={() => deleteMap(c.map_id)}
                              className="px-3 py-1.5 rounded-lg text-xs font-medium border border-red-200 text-red-600 hover:bg-red-50 transition"
                            >
                              Rimuovi
                            </button>
                          )}
                        </>
                      ) : (
                        <>
                          <button
                            onClick={() => saveMap(c)}
                            disabled={saving || !editForm.categoria_custom.trim()}
                            className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-600 text-white hover:bg-emerald-700 transition disabled:opacity-40"
                          >
                            {saving ? "..." : "Salva"}
                          </button>
                          <button
                            onClick={cancelEdit}
                            className="px-3 py-1.5 rounded-lg text-xs font-medium border border-neutral-300 hover:bg-neutral-100 transition"
                          >
                            Annulla
                          </button>
                        </>
                      )}
                    </div>
                  </div>

                  {isEditing && (
                    <div className="mt-3 pt-3 border-t border-blue-200 grid grid-cols-1 sm:grid-cols-4 gap-3">
                      <div className="sm:col-span-2">
                        <label className="text-xs text-neutral-500 mb-1 block">Nome categoria custom</label>
                        <input
                          value={editForm.categoria_custom}
                          onChange={(e) => setEditForm({ ...editForm, categoria_custom: e.target.value })}
                          placeholder="Es. Spese fornitore"
                          className="w-full border rounded-lg px-3 py-1.5 text-sm"
                        />
                      </div>
                      <div>
                        <label className="text-xs text-neutral-500 mb-1 block">Tipo</label>
                        <select
                          value={editForm.tipo}
                          onChange={(e) => setEditForm({ ...editForm, tipo: e.target.value })}
                          className="w-full border rounded-lg px-2 py-1.5 text-sm"
                        >
                          <option value="uscita">Uscita</option>
                          <option value="entrata">Entrata</option>
                          <option value="altro">Altro</option>
                        </select>
                      </div>
                      <div>
                        <label className="text-xs text-neutral-500 mb-1 block">Colore</label>
                        <div className="flex gap-1 flex-wrap">
                          {COLORI_PRESET.map((col) => (
                            <button
                              key={col}
                              onClick={() => setEditForm({ ...editForm, colore: col })}
                              className={`w-6 h-6 rounded-full border-2 transition ${
                                editForm.colore === col ? "border-neutral-800 scale-110" : "border-transparent"
                              }`}
                              style={{ backgroundColor: col }}
                            />
                          ))}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
