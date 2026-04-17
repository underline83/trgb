// Lista task singoli (MVP, sessione 41)
// Filtri: user, data, stato. Modal inline per creare/modificare.
// Click riga: apri modal edit. Completa: bottone inline.

import React, { useEffect, useState, useCallback } from "react";
import { API_BASE, apiFetch } from "../../config/api";
import CucinaNav from "./CucinaNav";
import CucinaTaskNuovo from "./CucinaTaskNuovo";

const STATI = ["APERTO", "IN_CORSO", "COMPLETATO", "SCADUTO", "ANNULLATO"];
const PRIORITA = ["ALTA", "MEDIA", "BASSA"];

const STATO_CLS = {
  APERTO:     "bg-brand-cream text-neutral-800 border-neutral-300",
  IN_CORSO:   "bg-blue-50 text-blue-800 border-blue-300",
  COMPLETATO: "bg-green-50 text-green-800 border-green-300",
  SCADUTO:    "bg-red-100 text-red-900 border-red-400",
  ANNULLATO:  "bg-neutral-100 text-neutral-500 border-neutral-300 line-through",
};

const PRIO_CLS = {
  ALTA:  "bg-red-100 text-red-800",
  MEDIA: "bg-amber-100 text-amber-800",
  BASSA: "bg-neutral-100 text-neutral-700",
};

export default function CucinaTaskList() {
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [modal, setModal] = useState(null); // null | "new" | task-object

  const [fUser, setFUser] = useState("");
  const [fData, setFData] = useState("");
  const [fStato, setFStato] = useState("");

  const role = localStorage.getItem("role") || "";
  const canDelete = ["admin", "superadmin", "chef"].includes(role);

  const load = useCallback(() => {
    setLoading(true);
    const qs = new URLSearchParams();
    if (fUser) qs.set("user", fUser);
    if (fData) qs.set("data", fData);
    if (fStato) qs.set("stato", fStato);
    const url = qs.toString()
      ? `${API_BASE}/cucina/tasks/?${qs.toString()}`
      : `${API_BASE}/cucina/tasks/`;
    apiFetch(url)
      .then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then(setList)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [fUser, fData, fStato]);

  useEffect(() => { load(); }, [load]);

  const completa = async (t) => {
    const note = window.prompt("Note di completamento (opzionali):") || null;
    try {
      const res = await apiFetch(`${API_BASE}/cucina/tasks/${t.id}/completa`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ note_completamento: note }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.detail || `HTTP ${res.status}`);
      }
      await load();
    } catch (e) {
      setError(e.message);
    }
  };

  const riapri = async (t) => {
    try {
      const res = await apiFetch(`${API_BASE}/cucina/tasks/${t.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stato: "APERTO" }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.detail || `HTTP ${res.status}`);
      }
      await load();
    } catch (e) {
      setError(e.message);
    }
  };

  const elimina = async (t) => {
    if (!window.confirm(`Eliminare task "${t.titolo}"?`)) return;
    try {
      const res = await apiFetch(`${API_BASE}/cucina/tasks/${t.id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.detail || `HTTP ${res.status}`);
      }
      await load();
    } catch (e) {
      setError(e.message);
    }
  };

  const annulla = async (t) => {
    try {
      const res = await apiFetch(`${API_BASE}/cucina/tasks/${t.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stato: "ANNULLATO" }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.detail || `HTTP ${res.status}`);
      }
      await load();
    } catch (e) {
      setError(e.message);
    }
  };

  const onSaved = async () => {
    setModal(null);
    await load();
  };

  return (
    <div className="min-h-screen bg-brand-cream font-sans">
      <CucinaNav current="tasks" />

      <div className="max-w-7xl mx-auto p-4 sm:p-6 space-y-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-2xl font-playfair font-bold text-red-900">Task operativi</h1>
            <p className="text-sm text-neutral-600 mt-1">
              Task singoli non ricorrenti — personali o assegnati.
            </p>
          </div>
          <button
            onClick={() => setModal("new")}
            className="bg-red-600 text-white px-4 py-2.5 rounded-lg font-medium hover:bg-red-700 min-h-[48px]"
          >
            + Nuovo task
          </button>
        </div>

        {/* Filtri */}
        <div className="bg-white rounded-2xl shadow-sm border border-red-100 p-4">
          <div className="flex items-center gap-3 flex-wrap">
            <label className="text-sm text-neutral-600">Utente:</label>
            <input
              type="text"
              placeholder="username"
              value={fUser}
              onChange={e => setFUser(e.target.value)}
              className="border rounded-lg px-3 py-2 min-h-[40px] w-32"
            />
            <label className="text-sm text-neutral-600">Data:</label>
            <input
              type="date"
              value={fData}
              onChange={e => setFData(e.target.value)}
              className="border rounded-lg px-3 py-2 min-h-[40px]"
            />
            <label className="text-sm text-neutral-600">Stato:</label>
            <select
              value={fStato}
              onChange={e => setFStato(e.target.value)}
              className="border rounded-lg px-3 py-2 min-h-[40px]"
            >
              <option value="">Tutti</option>
              {STATI.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
            {(fUser || fData || fStato) && (
              <button
                onClick={() => { setFUser(""); setFData(""); setFStato(""); }}
                className="text-sm text-red-700 hover:underline"
              >
                Reset
              </button>
            )}
            <div className="flex-1" />
            <div className="text-sm text-neutral-500">
              {list.length} {list.length === 1 ? "task" : "task"}
            </div>
          </div>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded-lg text-sm">
            {error}
          </div>
        )}

        {loading && <div className="text-center py-8 text-neutral-500">Caricamento...</div>}

        {!loading && list.length === 0 && (
          <div className="bg-white border border-dashed border-red-200 rounded-2xl p-8 text-center">
            <div className="text-5xl mb-2">✅</div>
            <div className="text-neutral-700 font-semibold">Nessun task</div>
            <div className="text-sm text-neutral-500 mt-1">
              Crea un task per tracciare un'attività operativa.
            </div>
          </div>
        )}

        {!loading && list.length > 0 && (
          <div className="bg-white rounded-2xl shadow-sm border border-red-100 overflow-hidden">
            <div className="hidden sm:grid grid-cols-12 gap-2 px-4 py-2 bg-red-50 text-xs font-semibold text-red-800 uppercase tracking-wide">
              <div className="col-span-4">Titolo</div>
              <div className="col-span-2">Scadenza</div>
              <div className="col-span-2">Assegnato</div>
              <div className="col-span-1">Prio</div>
              <div className="col-span-1">Stato</div>
              <div className="col-span-2 text-right">Azioni</div>
            </div>
            <div className="divide-y divide-neutral-100">
              {list.map(t => (
                <TaskRow
                  key={t.id}
                  t={t}
                  canDelete={canDelete}
                  onEdit={() => setModal(t)}
                  onCompleta={() => completa(t)}
                  onRiapri={() => riapri(t)}
                  onAnnulla={() => annulla(t)}
                  onElimina={() => elimina(t)}
                />
              ))}
            </div>
          </div>
        )}
      </div>

      {modal && (
        <CucinaTaskNuovo
          task={modal === "new" ? null : modal}
          onClose={() => setModal(null)}
          onSaved={onSaved}
        />
      )}
    </div>
  );
}

function TaskRow({ t, canDelete, onEdit, onCompleta, onRiapri, onAnnulla, onElimina }) {
  const chiuso = t.stato === "COMPLETATO" || t.stato === "ANNULLATO";

  return (
    <div className="sm:grid sm:grid-cols-12 sm:gap-2 p-3 sm:px-4 sm:py-3 hover:bg-red-50/30 transition">
      <div className="col-span-4">
        <button
          onClick={onEdit}
          className="text-left w-full"
          title="Modifica"
        >
          <div className="font-medium text-neutral-900">{t.titolo}</div>
          {t.descrizione && (
            <div className="text-xs text-neutral-500 mt-0.5 line-clamp-1">{t.descrizione}</div>
          )}
        </button>
      </div>
      <div className="col-span-2 text-sm text-neutral-700 mt-1 sm:mt-0">
        {t.data_scadenza || "—"}
        {t.ora_scadenza && <span className="text-neutral-400"> · {t.ora_scadenza}</span>}
      </div>
      <div className="col-span-2 text-sm text-neutral-700 mt-1 sm:mt-0">
        {t.assegnato_user ? `@${t.assegnato_user}` : <span className="text-neutral-400">—</span>}
      </div>
      <div className="col-span-1 mt-1 sm:mt-0">
        <span className={`text-[10px] uppercase font-bold px-1.5 py-0.5 rounded ${PRIO_CLS[t.priorita] || ""}`}>
          {t.priorita}
        </span>
      </div>
      <div className="col-span-1 mt-1 sm:mt-0">
        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border whitespace-nowrap ${STATO_CLS[t.stato] || ""}`}>
          {t.stato}
        </span>
      </div>
      <div className="col-span-2 flex flex-wrap gap-1 justify-start sm:justify-end mt-2 sm:mt-0">
        {!chiuso && (
          <button
            onClick={onCompleta}
            className="text-xs px-2 py-1.5 bg-green-600 text-white rounded hover:bg-green-700 min-h-[36px]"
            title="Completa"
          >
            ✓
          </button>
        )}
        {chiuso && t.stato === "COMPLETATO" && (
          <button
            onClick={onRiapri}
            className="text-xs px-2 py-1.5 border rounded hover:bg-neutral-50 min-h-[36px]"
            title="Riapri"
          >
            ↻
          </button>
        )}
        {!chiuso && (
          <button
            onClick={onAnnulla}
            className="text-xs px-2 py-1.5 border rounded hover:bg-neutral-50 min-h-[36px]"
            title="Annulla"
          >
            ✕
          </button>
        )}
        {canDelete && (
          <button
            onClick={onElimina}
            className="text-xs px-2 py-1.5 border border-red-300 text-red-700 rounded hover:bg-red-50 min-h-[36px]"
            title="Elimina"
          >
            🗑
          </button>
        )}
      </div>
    </div>
  );
}
