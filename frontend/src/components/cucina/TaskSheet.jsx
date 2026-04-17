// TaskSheet — bottom-sheet dettaglio + completamento task (P2-BIS, sessione 44)
// Due mode interni: "detail" (default) e "complete" (sub-sheet note_completamento).
//
// Props:
//   task      : oggetto task backend (richiesto)
//   onClose   : () => void
//   onRefresh : () => void         — invocato dopo mutazioni
//   canDelete : bool               — admin/chef
//   onEdit    : (task) => void     — apre il modale nuovo in modalita' edit
//
// Usa apiFetch direttamente per le mutazioni (PUT/POST /cucina/tasks/*).

import React, { useEffect, useMemo, useRef, useState } from "react";
import { API_BASE, apiFetch } from "../../config/api";
import useToast from "../../hooks/useToast";

// ── costanti visive ────────────────────────────────────────────

const STATO_CHIP = {
  APERTO:     "bg-[#fdf3dc] text-[#8a5a00]",
  IN_CORSO:   "bg-[#e1ecfc] text-[#1a4fa0]",
  COMPLETATO: "bg-[#e1f2e8] text-[#1a7549]",
  SCADUTO:    "bg-[#fbe6e2] text-[#9c1f10]",
  ANNULLATO:  "bg-[#EFEBE3] text-neutral-500",
};
const STATO_LABEL = {
  APERTO: "Aperto", IN_CORSO: "In corso", COMPLETATO: "Completato",
  SCADUTO: "Scaduto", ANNULLATO: "Annullato",
};
const PRIO_CHIP = {
  ALTA:  "bg-[#fbe6e2] text-[#9c1f10]",
  MEDIA: "bg-[#fdf3dc] text-[#8a5a00]",
  BASSA: "bg-[#f0ede6] text-neutral-600",
};

// Avatar iniziale — palette rosso/verde/blu semplice (fallback rosso).
function avatarColor(name) {
  if (!name) return "bg-[#8a857c]";
  const n = name.toLowerCase();
  const hash = [...n].reduce((a, c) => a + c.charCodeAt(0), 0);
  const palette = ["bg-brand-red", "bg-brand-green", "bg-brand-blue"];
  return palette[hash % palette.length];
}
function initialOf(name) {
  if (!name) return "?";
  return name.trim().charAt(0).toUpperCase();
}

// ── componente principale ──────────────────────────────────────

export default function TaskSheet({ task, onClose, onRefresh, canDelete, onEdit }) {
  const { toast } = useToast();
  const [mode, setMode] = useState("detail");     // detail | complete
  const [noteCompl, setNoteCompl] = useState("");
  const [saving, setSaving] = useState(false);

  const role = typeof localStorage !== "undefined" ? localStorage.getItem("role") || "" : "";
  const isAdminOrChef = ["admin", "superadmin", "chef"].includes(role);

  const sheetRef = useRef(null);

  // Trap scroll del body quando sheet aperto
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, []);

  // Swipe-down per chiudere (semplice: pull su grabber)
  const startYRef = useRef(null);
  const handleGrabberStart = (e) => {
    const y = e.touches ? e.touches[0].clientY : e.clientY;
    startYRef.current = y;
  };
  const handleGrabberMove = (e) => {
    if (startYRef.current == null) return;
    const y = e.touches ? e.touches[0].clientY : e.clientY;
    const dy = y - startYRef.current;
    if (dy > 80) {
      startYRef.current = null;
      onClose();
    }
  };
  const handleGrabberEnd = () => { startYRef.current = null; };

  const chiuso = task.stato === "COMPLETATO" || task.stato === "ANNULLATO";

  // Origine & meta formattate
  const originText = useMemo(() => {
    const by = task.created_by ? `da @${task.created_by}` : "";
    const when = task.created_at
      ? ` il ${task.created_at.slice(8, 10)}/${task.created_at.slice(5, 7)}${task.created_at.length >= 16 ? ` ore ${task.created_at.slice(11, 16)}` : ""}`
      : "";
    const org = task.origine ? task.origine.charAt(0) + task.origine.slice(1).toLowerCase() : "";
    return [org, by + when].filter(Boolean).join(" — ");
  }, [task.created_by, task.created_at, task.origine]);

  // ── mutazioni ────────────────────────────────────────────────

  async function mutateStato(stato) {
    setSaving(true);
    try {
      const res = await apiFetch(`${API_BASE}/cucina/tasks/${task.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stato }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.detail || `HTTP ${res.status}`);
      }
      toast(stato === "IN_CORSO" ? "▶ Task avviato" :
            stato === "APERTO"   ? "↻ Task riaperto" :
            stato === "ANNULLATO" ? "✕ Task annullato" :
            "Stato aggiornato",
        { kind: stato === "ANNULLATO" ? "warn" : "success" });
      onRefresh?.();
      onClose();
    } catch (e) {
      toast(e.message, { kind: "error", duration: 2800 });
    } finally {
      setSaving(false);
    }
  }

  async function completaConNote(note) {
    setSaving(true);
    try {
      const res = await apiFetch(`${API_BASE}/cucina/tasks/${task.id}/completa`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ note_completamento: (note || "").trim() || null }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.detail || `HTTP ${res.status}`);
      }
      toast("✓ Task completato", { kind: "success" });
      onRefresh?.();
      onClose();
    } catch (e) {
      toast(e.message, { kind: "error", duration: 2800 });
    } finally {
      setSaving(false);
    }
  }

  async function elimina() {
    // conferma via sub-mode (non window.confirm)
    setMode("delete-confirm");
  }
  async function eliminaConfirmed() {
    setSaving(true);
    try {
      const res = await apiFetch(`${API_BASE}/cucina/tasks/${task.id}`, { method: "DELETE" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.detail || `HTTP ${res.status}`);
      }
      toast("Task eliminato", { kind: "warn" });
      onRefresh?.();
      onClose();
    } catch (e) {
      toast(e.message, { kind: "error", duration: 2800 });
      setMode("detail");
    } finally {
      setSaving(false);
    }
  }

  // ── render ───────────────────────────────────────────────────

  return (
    <div
      className="fixed inset-0 z-[90] flex items-end sm:items-center sm:justify-center"
      style={{ background: "rgba(17,17,17,.42)" }}
      onClick={onClose}
    >
      <div
        ref={sheetRef}
        className="w-full sm:max-w-md bg-brand-cream rounded-t-[22px] sm:rounded-[22px] border border-[#e6e1d8] shadow-2xl max-h-[90vh] overflow-hidden flex flex-col"
        style={{
          animation: "trgb-sheet-up .25s ease",
        }}
        onClick={e => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="ts-title"
      >
        {/* Grabber */}
        <div
          className="flex justify-center pt-2 pb-2 touch-none select-none"
          onTouchStart={handleGrabberStart}
          onTouchMove={handleGrabberMove}
          onTouchEnd={handleGrabberEnd}
          onMouseDown={handleGrabberStart}
          onMouseUp={handleGrabberEnd}
        >
          <div className="w-11 h-1.5 rounded-full bg-[#c8c3b8]" />
        </div>

        {/* ========== DETAIL ========== */}
        {mode === "detail" && (
          <DetailBody
            task={task}
            originText={originText}
            chiuso={chiuso}
            saving={saving}
            isAdminOrChef={isAdminOrChef}
            canDelete={canDelete}
            onInizia={() => mutateStato("IN_CORSO")}
            onGoComplete={() => { setNoteCompl(""); setMode("complete"); }}
            onRiapri={() => mutateStato("APERTO")}
            onAnnulla={() => mutateStato("ANNULLATO")}
            onEdit={() => { onClose(); onEdit?.(task); }}
            onElimina={elimina}
            onClose={onClose}
          />
        )}

        {/* ========== COMPLETE ========== */}
        {mode === "complete" && (
          <CompleteBody
            task={task}
            note={noteCompl}
            setNote={setNoteCompl}
            saving={saving}
            onBack={() => setMode("detail")}
            onSkipNote={() => completaConNote("")}
            onConfirm={() => completaConNote(noteCompl)}
          />
        )}

        {/* ========== DELETE CONFIRM ========== */}
        {mode === "delete-confirm" && (
          <DeleteConfirmBody
            task={task}
            saving={saving}
            onBack={() => setMode("detail")}
            onConfirm={eliminaConfirmed}
          />
        )}
      </div>

      <style>{`@keyframes trgb-sheet-up { from { transform: translateY(30px); opacity: .6 } to { transform: translateY(0); opacity: 1 } }`}</style>
    </div>
  );
}

// ── DETAIL body ────────────────────────────────────────────────

function DetailBody({
  task, originText, chiuso, saving, isAdminOrChef, canDelete,
  onInizia, onGoComplete, onRiapri, onAnnulla, onEdit, onElimina, onClose,
}) {
  const prioLabel = task.priorita ? task.priorita.charAt(0) + task.priorita.slice(1).toLowerCase() : "—";

  return (
    <div className="flex-1 overflow-y-auto px-5 pb-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <h2 id="ts-title" className="m-0 font-playfair font-bold text-[22px] text-brand-ink leading-tight">
            {task.titolo}
          </h2>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-neutral-500">
            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold uppercase tracking-wide ${STATO_CHIP[task.stato] || ""}`}>
              {STATO_LABEL[task.stato] || task.stato}
            </span>
            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold uppercase tracking-wide ${PRIO_CHIP[task.priorita] || ""}`}>
              {prioLabel}
            </span>
            {task.data_scadenza && (
              <span>⏱ {formatDueDate(task.data_scadenza, task.ora_scadenza)}</span>
            )}
          </div>
        </div>
      </div>

      {/* Descrizione */}
      {task.descrizione && (
        <>
          <FieldLabel>Descrizione</FieldLabel>
          <div className="text-sm text-neutral-700 whitespace-pre-wrap">{task.descrizione}</div>
        </>
      )}

      {/* Assegnato */}
      <FieldLabel>Assegnato a</FieldLabel>
      {task.assegnato_user ? (
        <div className="flex items-center gap-2 text-[15px]">
          <AvatarInitial name={task.assegnato_user} size={28} />
          <b>@{task.assegnato_user}</b>
        </div>
      ) : (
        <div className="text-neutral-500 text-sm italic">Non assegnato</div>
      )}

      {/* Origine */}
      {originText && (
        <>
          <FieldLabel>Origine</FieldLabel>
          <div className="text-sm text-neutral-700">{originText}</div>
        </>
      )}

      {/* Note completamento (se presente) */}
      {task.note_completamento && (
        <>
          <FieldLabel>Note completamento</FieldLabel>
          <div className="text-sm text-neutral-700 italic bg-[#EFEBE3] border-l-2 border-[#d7d1c2] px-3 py-2 rounded">
            "{task.note_completamento}"
            {task.completato_da && (
              <div className="mt-1 not-italic text-xs text-neutral-500">
                @{task.completato_da}
                {task.completato_at && ` · ${task.completato_at.slice(11, 16)}`}
              </div>
            )}
          </div>
        </>
      )}

      {/* Azioni */}
      <div className="mt-5 flex flex-wrap gap-2.5">
        {!chiuso && task.stato === "APERTO" && (
          <button
            onClick={onInizia}
            disabled={saving}
            className="flex-1 min-h-[48px] px-4 rounded-2xl bg-brand-blue text-white font-bold disabled:opacity-50"
            type="button"
          >
            ▶ Inizia
          </button>
        )}
        {!chiuso && (
          <button
            onClick={onGoComplete}
            disabled={saving}
            className="flex-[2] min-h-[52px] px-4 rounded-2xl bg-brand-red text-white font-bold disabled:opacity-50"
            style={{ boxShadow: "0 8px 18px rgba(232,64,43,.25)" }}
            type="button"
          >
            ✓ Completa
          </button>
        )}
        {task.stato === "COMPLETATO" && isAdminOrChef && (
          <button
            onClick={onRiapri}
            disabled={saving}
            className="flex-1 min-h-[48px] px-4 rounded-2xl bg-white border border-[#e6e1d8] font-semibold text-brand-ink hover:bg-[#EFEBE3] disabled:opacity-50"
            type="button"
          >
            ↻ Riapri
          </button>
        )}
      </div>

      {/* Secondary */}
      <div className="mt-3 flex flex-wrap gap-2 justify-between">
        <button
          onClick={onEdit}
          disabled={saving}
          className="min-h-[44px] px-3 rounded-xl text-sm font-semibold text-neutral-600 hover:text-brand-ink disabled:opacity-50"
          type="button"
        >
          ✎ Modifica
        </button>
        {!chiuso && (
          <button
            onClick={onAnnulla}
            disabled={saving}
            className="min-h-[44px] px-3 rounded-xl text-sm font-semibold text-neutral-600 hover:text-brand-ink disabled:opacity-50"
            type="button"
          >
            ✕ Annulla
          </button>
        )}
        {canDelete && (
          <button
            onClick={onElimina}
            disabled={saving}
            className="min-h-[44px] px-3 rounded-xl text-sm font-semibold text-[#9c1f10] hover:bg-[#fdeae5] disabled:opacity-50"
            type="button"
          >
            🗑 Elimina
          </button>
        )}
      </div>

      {/* Chiudi (su mobile il gesture sul grabber basta, ma teniamo il bottone per accessibilita') */}
      <div className="mt-3 flex">
        <button
          onClick={onClose}
          className="flex-1 min-h-[48px] px-4 rounded-2xl bg-white border border-[#e6e1d8] font-semibold text-brand-ink hover:bg-[#EFEBE3]"
          type="button"
        >
          Chiudi
        </button>
      </div>
    </div>
  );
}

// ── COMPLETE sub-sheet ─────────────────────────────────────────

function CompleteBody({ task, note, setNote, saving, onBack, onSkipNote, onConfirm }) {
  const taRef = useRef(null);
  useEffect(() => { taRef.current?.focus(); }, []);
  return (
    <div className="flex-1 overflow-y-auto px-5 pb-5">
      <h2 className="m-0 font-playfair font-bold text-[22px] text-brand-ink leading-tight">Completa task</h2>
      <div className="mt-1 text-[13px] text-neutral-500 mb-1">
        Aggiungi una nota (opzionale) per tracciare come è andata.
      </div>
      <div className="text-[14px] text-brand-ink mt-2 mb-2">
        <b>{task.titolo}</b>
      </div>

      <FieldLabel>Note</FieldLabel>
      <textarea
        ref={taRef}
        value={note}
        onChange={e => setNote(e.target.value)}
        placeholder="Es. chiamato, consegnano domattina…"
        className="w-full min-h-[90px] border border-[#e6e1d8] rounded-xl px-3 py-2.5 bg-white focus:outline-2 focus:outline focus:outline-brand-red text-[16px]"
      />

      <div className="mt-5 flex gap-2.5">
        <button
          onClick={onBack}
          disabled={saving}
          className="min-h-[48px] px-3 rounded-2xl bg-transparent font-semibold text-neutral-600 hover:text-brand-ink disabled:opacity-50"
          type="button"
        >
          ← Indietro
        </button>
        <button
          onClick={onSkipNote}
          disabled={saving}
          className="min-h-[52px] px-4 rounded-2xl bg-white border border-[#e6e1d8] font-semibold text-brand-ink hover:bg-[#EFEBE3] disabled:opacity-50"
          type="button"
        >
          Senza note
        </button>
        <button
          onClick={onConfirm}
          disabled={saving}
          className="flex-1 min-h-[52px] px-4 rounded-2xl bg-brand-red text-white font-bold disabled:opacity-50"
          style={{ boxShadow: "0 8px 18px rgba(232,64,43,.25)" }}
          type="button"
        >
          ✓ Conferma
        </button>
      </div>
    </div>
  );
}

// ── DELETE CONFIRM sub-sheet ───────────────────────────────────

function DeleteConfirmBody({ task, saving, onBack, onConfirm }) {
  return (
    <div className="flex-1 overflow-y-auto px-5 pb-5">
      <h2 className="m-0 font-playfair font-bold text-[22px] text-brand-ink leading-tight">Eliminare questo task?</h2>
      <div className="mt-1 text-[13px] text-neutral-500 mb-3">
        Azione non reversibile.
      </div>
      <div className="text-[14px] text-brand-ink bg-white border border-[#e6e1d8] rounded-xl p-3">
        {task.titolo}
      </div>

      <div className="mt-5 flex gap-2.5">
        <button
          onClick={onBack}
          disabled={saving}
          className="min-h-[48px] px-4 rounded-2xl bg-white border border-[#e6e1d8] font-semibold text-brand-ink hover:bg-[#EFEBE3] disabled:opacity-50"
          type="button"
        >
          Indietro
        </button>
        <button
          onClick={onConfirm}
          disabled={saving}
          className="flex-1 min-h-[52px] px-4 rounded-2xl bg-brand-red text-white font-bold disabled:opacity-50"
          style={{ boxShadow: "0 8px 18px rgba(232,64,43,.25)" }}
          type="button"
        >
          🗑 Elimina
        </button>
      </div>
    </div>
  );
}

// ── helpers ui ─────────────────────────────────────────────────

function FieldLabel({ children }) {
  return (
    <div className="text-[11px] uppercase tracking-wide font-bold text-neutral-500 mt-3.5 mb-1.5">
      {children}
    </div>
  );
}

function AvatarInitial({ name, size = 18 }) {
  const color = avatarColor(name);
  return (
    <span
      className={`rounded-full inline-flex items-center justify-center text-white font-playfair font-bold ${color}`}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.45) }}
      aria-hidden="true"
    >
      {initialOf(name)}
    </span>
  );
}

function formatDueDate(data, ora) {
  if (!data) return "";
  // YYYY-MM-DD → confronta con oggi per "oggi / ieri / domani / DD/MM"
  try {
    const d = new Date(data + "T00:00:00");
    const today = new Date(); today.setHours(0,0,0,0);
    const diff = Math.round((d - today) / 86400000);
    const base = diff === 0 ? "oggi"
              : diff === -1 ? "ieri"
              : diff === 1 ? "domani"
              : diff < 0 ? `${-diff} giorni fa`
              : diff <= 6 ? `tra ${diff} giorni`
              : `${String(d.getDate()).padStart(2,"0")}/${String(d.getMonth()+1).padStart(2,"0")}`;
    return ora ? `${base} ${ora}` : base;
  } catch {
    return ora ? `${data} ${ora}` : data;
  }
}
