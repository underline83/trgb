// CucinaTaskNuovo — full-screen mobile / modale centrata sm+ (P2-BIS, sessione 44)
// Mockup: docs/mockups/cucina_tasks_iphone_mockup.html (schermata 2)
//
// Create o edit in base a `task` prop. Campi:
// - titolo*
// - priorita (pills ALTA/MEDIA/BASSA)
// - data_scadenza (<input type=date>)
// - ora_scadenza (HH:MM)
// - assegnato_user (input libero — MVP senza lookup dipendenti)
// - descrizione
//
// Footer sticky con Annulla + primary "Crea / Salva" — safe-area-inset-bottom.

import React, { useEffect, useRef, useState } from "react";
import { API_BASE, apiFetch } from "../../config/api";
import { REPARTI, LIVELLI_CUCINA } from "../../config/reparti";
import useToast from "../../hooks/useToast";

const PRIORITA = ["ALTA", "MEDIA", "BASSA"];
const PRIO_ON = {
  ALTA:  "bg-brand-red text-white border-brand-red",
  MEDIA: "bg-amber-500 text-white border-amber-500",
  BASSA: "bg-[#8a857c] text-white border-[#8a857c]",
};

export default function TaskNuovo({ task, onClose, onSaved }) {
  const { toast } = useToast();
  const isEdit = !!task;
  const role = (typeof localStorage !== "undefined" && localStorage.getItem("role")) || "";
  // Phase A.3 — anti-escalation FE: sous_chef/commis possono scegliere solo
  // "tutta la brigata" o il proprio livello. Backend e' fonte di verita'.
  const livelliOptions = role === "sous_chef"
    ? LIVELLI_CUCINA.filter(l => l.key === "sous_chef")
    : role === "commis"
      ? LIVELLI_CUCINA.filter(l => l.key === "commis")
      : LIVELLI_CUCINA;

  const [titolo, setTitolo] = useState(task?.titolo || "");
  const [descrizione, setDescrizione] = useState(task?.descrizione || "");
  const [dataScadenza, setDataScadenza] = useState(task?.data_scadenza || "");
  const [oraScadenza, setOraScadenza] = useState(task?.ora_scadenza || "");
  const [assegnato, setAssegnato] = useState(task?.assegnato_user || "");
  const [priorita, setPriorita] = useState(task?.priorita || "MEDIA");
  const [reparto, setReparto] = useState(task?.reparto || "cucina");
  const [livelloCucina, setLivelloCucina] = useState(task?.livello_cucina || "");

  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const titoloRef = useRef(null);
  useEffect(() => { if (!isEdit) titoloRef.current?.focus(); }, [isEdit]);

  // Phase A.2: reset livello cucina se reparto cambia a non-cucina
  useEffect(() => {
    if (reparto !== "cucina") setLivelloCucina("");
  }, [reparto]);

  // Trap body scroll mobile
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, []);

  async function save() {
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
      reparto: (reparto || "cucina").toLowerCase(),
      livello_cucina: reparto === "cucina" ? (livelloCucina || null) : null,
    };

    try {
      const url = isEdit
        ? `${API_BASE}/tasks/tasks/${task.id}`
        : `${API_BASE}/tasks/tasks/`;
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
      toast(isEdit ? "✓ Task aggiornato" : "✓ Task creato", { kind: "success" });
      onSaved?.();
    } catch (e) {
      setError(e.message);
      toast(e.message, { kind: "error", duration: 2800 });
    } finally {
      setSaving(false);
    }
  }

  // Click backdrop (solo su sm+)
  const handleBackdropClick = (e) => {
    if (window.innerWidth >= 640) onClose();
  };

  return (
    <>
      {/* ========== MOBILE: full-screen (<sm) ========== */}
      <div
        className="sm:hidden fixed inset-0 z-[95] bg-brand-cream flex flex-col"
        role="dialog"
        aria-modal="true"
        aria-label={isEdit ? "Modifica task" : "Nuovo task"}
      >
        {/* Header mobile con back */}
        <div
          className="flex items-center gap-3 px-4 py-2 border-b border-[#e6e1d8] bg-brand-cream"
          style={{ paddingTop: "calc(8px + env(safe-area-inset-top))" }}
        >
          <button
            type="button"
            onClick={onClose}
            aria-label="Indietro"
            className="w-10 h-10 rounded-full bg-[#EFEBE3] border-0 text-xl flex items-center justify-center active:scale-95"
          >
            ←
          </button>
          <div className="min-w-0">
            <div className="font-playfair font-bold text-[20px] text-brand-ink leading-tight">
              {isEdit ? "Modifica task" : "Nuovo task"}
            </div>
            <div className="text-[12px] text-neutral-500">Compilazione rapida</div>
          </div>
        </div>

        {/* Body scrollabile */}
        <div className="flex-1 overflow-y-auto px-4 pt-3.5 pb-[160px]">
          <FormFields
            titolo={titolo} setTitolo={setTitolo}
            titoloRef={titoloRef}
            descrizione={descrizione} setDescrizione={setDescrizione}
            dataScadenza={dataScadenza} setDataScadenza={setDataScadenza}
            oraScadenza={oraScadenza} setOraScadenza={setOraScadenza}
            assegnato={assegnato} setAssegnato={setAssegnato}
            priorita={priorita} setPriorita={setPriorita}
            reparto={reparto} setReparto={setReparto}
            livelloCucina={livelloCucina} setLivelloCucina={setLivelloCucina}
            livelliOptions={livelliOptions}
            error={error}
          />
        </div>

        {/* Footer fisso mobile */}
        <div
          className="fixed bottom-0 left-0 right-0 z-10 border-t border-[#e6e1d8]"
          style={{
            background: "rgba(244,241,236,.96)",
            backdropFilter: "saturate(1.2) blur(12px)",
            WebkitBackdropFilter: "saturate(1.2) blur(12px)",
            paddingBottom: "calc(14px + env(safe-area-inset-bottom))",
            paddingTop: 14,
          }}
        >
          <div className="max-w-lg mx-auto flex gap-2.5 px-4">
            <button
              onClick={onClose}
              disabled={saving}
              type="button"
              className="min-h-[52px] px-5 rounded-2xl bg-white border border-[#e6e1d8] font-semibold text-brand-ink hover:bg-[#EFEBE3] disabled:opacity-50"
            >
              Annulla
            </button>
            <button
              onClick={save}
              disabled={saving}
              type="button"
              className="flex-1 min-h-[56px] px-4 rounded-2xl bg-brand-red text-white font-bold text-base disabled:opacity-50"
              style={{ boxShadow: "0 8px 18px rgba(232,64,43,.25)" }}
            >
              {saving ? "Salvataggio…" : (isEdit ? "Salva" : "Crea task")}
            </button>
          </div>
        </div>
      </div>

      {/* ========== DESKTOP/iPad: modale centrata (sm+) ========== */}
      <div
        className="hidden sm:flex fixed inset-0 z-[95] items-center justify-center p-4"
        style={{ background: "rgba(17,17,17,.42)" }}
        onClick={handleBackdropClick}
        role="dialog"
        aria-modal="true"
      >
        <div
          className="bg-brand-cream w-full max-w-lg rounded-[22px] border border-[#e6e1d8] shadow-2xl max-h-[90vh] overflow-hidden flex flex-col"
          onClick={e => e.stopPropagation()}
          style={{ animation: "trgb-task-modal .22s ease" }}
        >
          <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-[#e6e1d8]">
            <h2 className="m-0 font-playfair font-bold text-[22px] text-brand-ink">
              {isEdit ? "Modifica task" : "Nuovo task"}
            </h2>
            <button
              onClick={onClose}
              type="button"
              aria-label="Chiudi"
              className="text-neutral-500 hover:text-brand-ink text-2xl leading-none min-w-[36px] min-h-[36px]"
            >
              ×
            </button>
          </div>

          <div className="flex-1 overflow-y-auto px-5 py-4">
            <FormFields
              titolo={titolo} setTitolo={setTitolo}
              titoloRef={titoloRef}
              descrizione={descrizione} setDescrizione={setDescrizione}
              dataScadenza={dataScadenza} setDataScadenza={setDataScadenza}
              oraScadenza={oraScadenza} setOraScadenza={setOraScadenza}
              assegnato={assegnato} setAssegnato={setAssegnato}
              priorita={priorita} setPriorita={setPriorita}
              reparto={reparto} setReparto={setReparto}
              livelloCucina={livelloCucina} setLivelloCucina={setLivelloCucina}
              livelliOptions={livelliOptions}
              error={error}
            />
          </div>

          <div className="px-5 py-4 border-t border-[#e6e1d8] flex gap-2.5">
            <button
              onClick={onClose}
              disabled={saving}
              type="button"
              className="min-h-[48px] px-5 rounded-2xl bg-white border border-[#e6e1d8] font-semibold text-brand-ink hover:bg-[#EFEBE3] disabled:opacity-50"
            >
              Annulla
            </button>
            <button
              onClick={save}
              disabled={saving}
              type="button"
              className="flex-1 min-h-[52px] px-4 rounded-2xl bg-brand-red text-white font-bold disabled:opacity-50"
              style={{ boxShadow: "0 8px 18px rgba(232,64,43,.25)" }}
            >
              {saving ? "Salvataggio…" : (isEdit ? "Salva" : "Crea task")}
            </button>
          </div>
        </div>
        <style>{`@keyframes trgb-task-modal { from { transform: translateY(14px); opacity: 0 } to { transform: translateY(0); opacity: 1 } }`}</style>
      </div>
    </>
  );
}

// ── Form fields condivisi tra mobile e desktop ─────────────────

function FormFields({
  titolo, setTitolo, titoloRef,
  descrizione, setDescrizione,
  dataScadenza, setDataScadenza,
  oraScadenza, setOraScadenza,
  assegnato, setAssegnato,
  priorita, setPriorita,
  reparto, setReparto,
  livelloCucina, setLivelloCucina,
  livelliOptions,
  error,
}) {
  const showLivello = reparto === "cucina";
  const livelli = livelliOptions || LIVELLI_CUCINA;

  return (
    <>
      {error && (
        <div className="mb-3 bg-red-50 border border-red-200 text-red-800 px-3 py-2 rounded-xl text-sm">
          {error}
        </div>
      )}

      <Label>Reparto *</Label>
      <select
        value={reparto || "cucina"}
        onChange={e => setReparto(e.target.value)}
        className="w-full text-[16px] bg-white border border-[#e6e1d8] rounded-xl px-3.5 py-3 min-h-[48px] focus:outline-2 focus:outline focus:outline-brand-red"
      >
        {REPARTI.map(r => (
          <option key={r.key} value={r.key}>
            {r.icon} {r.label}
          </option>
        ))}
      </select>

      {/* Phase A.2: livello cucina con CSS transition */}
      <div
        className="overflow-hidden transition-all duration-200 ease-in-out"
        style={{
          maxHeight: showLivello ? 100 : 0,
          opacity: showLivello ? 1 : 0,
        }}
      >
        <Label>Livello (opzionale)</Label>
        <select
          value={livelloCucina || ""}
          onChange={e => setLivelloCucina(e.target.value)}
          className="w-full text-[16px] bg-white border border-[#e6e1d8] rounded-xl px-3.5 py-3 min-h-[48px] focus:outline-2 focus:outline focus:outline-brand-red"
        >
          <option value="">Tutta la brigata</option>
          {livelli.map(l => (
            <option key={l.key} value={l.key}>
              {l.icon} {l.label}
            </option>
          ))}
        </select>
      </div>

      <Label>Titolo *</Label>
      <input
        type="text"
        ref={titoloRef}
        value={titolo}
        onChange={e => setTitolo(e.target.value)}
        placeholder="Es. Ordinare pane per sabato (3 filoni)"
        className="w-full text-[16px] bg-white border border-[#e6e1d8] rounded-xl px-3.5 py-3 min-h-[48px] focus:outline-2 focus:outline focus:outline-brand-red"
        autoCapitalize="sentences"
      />

      <Label>Priorità</Label>
      <div className="flex gap-2">
        {PRIORITA.map(p => (
          <button
            key={p}
            type="button"
            onClick={() => setPriorita(p)}
            aria-pressed={priorita === p}
            className={
              "flex-1 min-h-[48px] rounded-xl border font-bold text-sm uppercase tracking-wide " +
              (priorita === p
                ? PRIO_ON[p]
                : "bg-white text-neutral-600 border-[#e6e1d8] hover:bg-[#EFEBE3]")
            }
          >
            {p.charAt(0) + p.slice(1).toLowerCase()}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label>Scadenza</Label>
          <input
            type="date"
            value={dataScadenza}
            onChange={e => setDataScadenza(e.target.value)}
            className="w-full text-[16px] bg-white border border-[#e6e1d8] rounded-xl px-3.5 py-3 min-h-[48px] focus:outline-2 focus:outline focus:outline-brand-red"
          />
        </div>
        <div>
          <Label>Ora (HH:MM)</Label>
          <input
            type="text"
            placeholder="18:00"
            pattern="\d{2}:\d{2}"
            inputMode="numeric"
            value={oraScadenza}
            onChange={e => setOraScadenza(e.target.value)}
            className="w-full text-[16px] bg-white border border-[#e6e1d8] rounded-xl px-3.5 py-3 min-h-[48px] focus:outline-2 focus:outline focus:outline-brand-red"
          />
        </div>
      </div>

      <Label>Assegna a</Label>
      <input
        type="text"
        value={assegnato}
        onChange={e => setAssegnato(e.target.value)}
        placeholder="username (es. luigi)"
        className="w-full text-[16px] bg-white border border-[#e6e1d8] rounded-xl px-3.5 py-3 min-h-[48px] focus:outline-2 focus:outline focus:outline-brand-red"
        autoCapitalize="none"
        autoCorrect="off"
      />

      <Label>Note</Label>
      <textarea
        value={descrizione}
        onChange={e => setDescrizione(e.target.value)}
        placeholder="Riferimenti, numeri, istruzioni…"
        rows={3}
        className="w-full text-[16px] bg-white border border-[#e6e1d8] rounded-xl px-3.5 py-3 min-h-[90px] focus:outline-2 focus:outline focus:outline-brand-red resize-vertical"
      />
    </>
  );
}

function Label({ children }) {
  return (
    <label className="block text-[11px] uppercase tracking-wide font-bold text-neutral-500 mt-3.5 mb-1.5">
      {children}
    </label>
  );
}
