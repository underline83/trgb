// Modal create/edit task singolo (MVP, sessione 41)
// Usato da CucinaTaskList. Se `task` è null → create, altrimenti edit.

import React, { useState } from "react";
import { API_BASE, apiFetch } from "../../config/api";

const PRIORITA = ["ALTA", "MEDIA", "BASSA"];

export default function CucinaTaskNuovo({ task, onClose, onSaved }) {
  const isEdit = !!task;
  const [titolo, setTitolo] = useState(task?.titolo || "");
  const [descrizione, setDescrizione] = useState(task?.descrizione || "");
  const [dataScadenza, setDataScadenza] = useState(task?.data_scadenza || "");
  const [oraScadenza, setOraScadenza] = useState(task?.ora_scadenza || "");
  const [assegnato, setAssegnato] = useState(task?.assegnato_user || "");
  const [priorita, setPriorita] = useState(task?.priorita || "MEDIA");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!titolo.trim()) {
      setError("Titolo obbligatorio");
      return;
    }
    if (oraScadenza && !/^\d{2}:\d{2}$/.test(oraScadenza)) {
      setError("Ora scadenza: formato HH:MM");
      return;
    }

    setSaving(true);
    setError("");

    const payload = {
      titolo: titolo.trim(),
      descrizione: descrizione.trim() || null,
      data_scadenza: dataScadenza || null,
      ora_scadenza: oraScadenza || null,
      assegnato_user: assegnato.trim() || null,
      priorita,
    };

    try {
      const url = isEdit
        ? `${API_BASE}/cucina/tasks/${task.id}`
        : `${API_BASE}/cucina/tasks/`;
      const method = isEdit ? "PUT" : "POST";
      const res = await apiFetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.detail || `HTTP ${res.status}`);
      }
      onSaved();
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={onClose}>
      <div
        className="bg-white rounded-t-2xl sm:rounded-2xl w-full sm:max-w-lg shadow-2xl max-h-[90vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        <div className="sticky top-0 bg-white border-b border-red-100 p-4 flex items-center justify-between">
          <h2 className="text-lg font-playfair font-bold text-red-900">
            {isEdit ? "Modifica task" : "Nuovo task"}
          </h2>
          <button
            onClick={onClose}
            className="text-neutral-500 hover:text-neutral-900 text-2xl leading-none min-w-[36px] min-h-[36px]"
          >
            ×
          </button>
        </div>

        <div className="p-4 space-y-3">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-800 px-3 py-2 rounded-lg text-sm">
              {error}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-1">Titolo *</label>
            <input
              type="text"
              value={titolo}
              onChange={e => setTitolo(e.target.value)}
              placeholder="es. Chiama fornitore pesce"
              className="w-full border rounded-lg px-3 py-2 min-h-[44px]"
              autoFocus
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-1">Descrizione</label>
            <textarea
              value={descrizione}
              onChange={e => setDescrizione(e.target.value)}
              className="w-full border rounded-lg px-3 py-2"
              rows={2}
              placeholder="Dettagli, link, numero, ..."
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-1">Scadenza</label>
              <input
                type="date"
                value={dataScadenza}
                onChange={e => setDataScadenza(e.target.value)}
                className="w-full border rounded-lg px-3 py-2 min-h-[44px]"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-1">Ora (HH:MM)</label>
              <input
                type="text"
                placeholder="18:00"
                pattern="\d{2}:\d{2}"
                value={oraScadenza}
                onChange={e => setOraScadenza(e.target.value)}
                className="w-full border rounded-lg px-3 py-2 min-h-[44px]"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-1">Assegnato a</label>
              <input
                type="text"
                value={assegnato}
                onChange={e => setAssegnato(e.target.value)}
                placeholder="username (es. luigi)"
                className="w-full border rounded-lg px-3 py-2 min-h-[44px]"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-1">Priorità</label>
              <select
                value={priorita}
                onChange={e => setPriorita(e.target.value)}
                className="w-full border rounded-lg px-3 py-2 min-h-[44px]"
              >
                {PRIORITA.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
          </div>
        </div>

        <div className="sticky bottom-0 bg-white border-t border-neutral-100 p-4 flex gap-2">
          <button
            onClick={save}
            disabled={saving}
            className="flex-1 bg-green-600 text-white px-4 py-3 rounded-lg font-semibold hover:bg-green-700 disabled:opacity-50 min-h-[48px]"
          >
            {saving ? "Salvataggio..." : (isEdit ? "Salva" : "Crea")}
          </button>
          <button
            onClick={onClose}
            className="px-4 py-3 border rounded-lg font-medium hover:bg-neutral-50 min-h-[48px]"
          >
            Annulla
          </button>
        </div>
      </div>
    </div>
  );
}
