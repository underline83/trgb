// Dettaglio istanza checklist — tap-to-complete (MVP, sessione 41)
// Ogni item diventa un bottone grande. Click → POST /cucina/execution/item/{id}/check
// Per TEMPERATURA/NUMERICO: modal con numpad tap-friendly prima di marcare OK/FAIL.
// Bottone "Completa checklist" → POST /cucina/instances/{id}/completa, calcola score.

import React, { useEffect, useState, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { API_BASE, apiFetch } from "../../config/api";
import CucinaNav from "./CucinaNav";

const STATO_INST_CLS = {
  APERTA:     "bg-brand-cream text-neutral-800 border-neutral-300",
  IN_CORSO:   "bg-blue-50 text-blue-800 border-blue-300",
  COMPLETATA: "bg-green-50 text-green-800 border-green-300",
  SCADUTA:    "bg-red-100 text-red-900 border-red-400",
  SALTATA:    "bg-neutral-100 text-neutral-500 border-neutral-300 line-through",
};

const EXEC_CLS = {
  OK:      "bg-green-50 border-green-300 text-green-900",
  FAIL:    "bg-red-50 border-red-300 text-red-900",
  SKIPPED: "bg-neutral-100 border-neutral-300 text-neutral-700",
  PENDING: "bg-white border-neutral-300 text-neutral-800",
};

function nowTime() {
  const d = new Date();
  return d.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });
}

export default function CucinaInstanceDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [inst, setInst] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [modal, setModal] = useState(null);   // { item, stato } per NUMERICO/TEMPERATURA
  const [assignOpen, setAssignOpen] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    apiFetch(`${API_BASE}/cucina/instances/${id}`)
      .then(r => {
        if (r.status === 404) throw new Error("Istanza non trovata");
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then(setInst)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => { load(); }, [load]);

  const editable = inst && !["COMPLETATA", "SALTATA", "SCADUTA"].includes(inst.stato);

  const doCheck = async (itemId, stato, valore_numerico, valore_testo, note) => {
    setSaving(true);
    setError("");
    try {
      const res = await apiFetch(`${API_BASE}/cucina/execution/item/${itemId}/check`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          instance_id: Number(id),
          stato,
          valore_numerico: valore_numerico ?? null,
          valore_testo: valore_testo ?? null,
          note: note ?? null,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.detail || `HTTP ${res.status}`);
      }
      const updated = await res.json();
      setInst(updated);
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const handleItemClick = (item, targetStato) => {
    if (!editable || saving) return;
    // Per TEMPERATURA / NUMERICO con stato OK apri il modal numpad
    if (targetStato === "OK" && (item.item_tipo === "TEMPERATURA" || item.item_tipo === "NUMERICO")) {
      setModal({ item, stato: "OK" });
      return;
    }
    // Per TESTO con OK chiedi input rapido
    if (targetStato === "OK" && item.item_tipo === "TESTO") {
      const txt = window.prompt("Inserisci nota/valore testuale:");
      if (txt === null) return;
      doCheck(item.item_id, "OK", null, txt, null);
      return;
    }
    // CHECKBOX / FAIL / SKIPPED: immediato
    doCheck(item.item_id, targetStato);
  };

  const submitNumeric = (valore) => {
    if (!modal) return;
    const it = modal.item;
    const v = parseFloat(valore);
    if (Number.isNaN(v)) {
      setError("Valore numerico non valido");
      return;
    }
    const fuoriRange = (it.item_min != null && v < it.item_min) || (it.item_max != null && v > it.item_max);
    const stato = fuoriRange ? "FAIL" : modal.stato;
    const note = fuoriRange ? `Fuori range (${it.item_min ?? "-"}..${it.item_max ?? "-"} ${it.item_unita ?? ""})` : null;
    doCheck(it.item_id, stato, v, null, note);
    setModal(null);
  };

  const completaChecklist = async () => {
    if (!editable) return;
    // Sanity: almeno un item eseguito
    const eseguiti = inst.items.filter(i => i.stato !== "PENDING");
    if (eseguiti.length === 0) {
      if (!window.confirm("Nessun item e' stato eseguito. Completare comunque?")) return;
    }
    const itemsObblig = inst.items.filter(i => i.item_obbligatorio);
    const obbligMancanti = itemsObblig.filter(i => i.stato === "PENDING");
    if (obbligMancanti.length > 0) {
      if (!window.confirm(`${obbligMancanti.length} item obbligatori non eseguiti. Completare comunque?`)) return;
    }
    setSaving(true);
    setError("");
    try {
      const res = await apiFetch(`${API_BASE}/cucina/instances/${id}/completa`, { method: "POST" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.detail || `HTTP ${res.status}`);
      }
      const updated = await res.json();
      setInst(updated);
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const saltaChecklist = async () => {
    const motivo = window.prompt("Motivo per saltare questa checklist?");
    if (motivo === null) return;
    setSaving(true);
    setError("");
    try {
      const res = await apiFetch(`${API_BASE}/cucina/instances/${id}/salta`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ motivo }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.detail || `HTTP ${res.status}`);
      }
      const updated = await res.json();
      setInst(updated);
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const assegna = async (username) => {
    setSaving(true);
    setError("");
    try {
      const res = await apiFetch(`${API_BASE}/cucina/instances/${id}/assegna`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user: username }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.detail || `HTTP ${res.status}`);
      }
      const updated = await res.json();
      setInst(updated);
      setAssignOpen(false);
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  if (loading && !inst) {
    return (
      <div className="min-h-screen bg-brand-cream font-sans">
        <CucinaNav current="agenda" />
        <div className="max-w-3xl mx-auto p-6 text-center text-neutral-500">Caricamento...</div>
      </div>
    );
  }

  if (error && !inst) {
    return (
      <div className="min-h-screen bg-brand-cream font-sans">
        <CucinaNav current="agenda" />
        <div className="max-w-3xl mx-auto p-6">
          <div className="bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded-lg">
            {error}
          </div>
          <button onClick={() => navigate("/cucina/agenda")} className="mt-4 text-red-700 hover:underline">
            ← Torna all'agenda
          </button>
        </div>
      </div>
    );
  }

  const done = inst.items.filter(i => i.stato === "OK").length;
  const fail = inst.items.filter(i => i.stato === "FAIL").length;
  const skip = inst.items.filter(i => i.stato === "SKIPPED").length;
  const pending = inst.items.filter(i => i.stato === "PENDING").length;
  const totale = inst.items.length;
  const progress = totale > 0 ? Math.round(100 * (done + fail + skip) / totale) : 0;

  return (
    <div className="min-h-screen bg-brand-cream font-sans">
      <CucinaNav current="agenda" />

      <div className="max-w-3xl mx-auto p-4 sm:p-6 space-y-4">
        {/* Header */}
        <div className="bg-white rounded-2xl shadow-sm border border-red-100 p-4">
          <button
            onClick={() => navigate("/cucina/agenda")}
            className="text-sm text-neutral-500 hover:text-neutral-900"
          >
            ← Agenda
          </button>
          <div className="flex items-start justify-between gap-3 mt-2 flex-wrap">
            <div className="flex-1 min-w-0">
              <h1 className="text-xl font-playfair font-bold text-red-900">
                {inst.template_nome}
              </h1>
              <div className="text-sm text-neutral-600 mt-1">
                {inst.reparto}
                {inst.turno && ` · ${inst.turno}`}
                {inst.data_riferimento && ` · ${inst.data_riferimento}`}
                {inst.scadenza_at && ` · entro ${inst.scadenza_at.slice(11, 16)}`}
              </div>
            </div>
            <span className={"text-xs font-semibold px-2 py-1 rounded-full border " + (STATO_INST_CLS[inst.stato] || "")}>
              {inst.stato}
            </span>
          </div>

          {/* Meta */}
          <div className="mt-3 flex items-center gap-4 flex-wrap text-sm">
            <button
              onClick={() => setAssignOpen(o => !o)}
              disabled={!editable || saving}
              className="border rounded-lg px-3 py-1.5 hover:bg-red-50 disabled:opacity-50 disabled:cursor-not-allowed min-h-[40px]"
            >
              {inst.assegnato_user ? `@${inst.assegnato_user}` : "Assegna a..."}
            </button>
            {inst.completato_da && (
              <span className="text-neutral-600">
                Completata da <b>@{inst.completato_da}</b>
                {inst.completato_at && ` alle ${inst.completato_at.slice(11, 16)}`}
              </span>
            )}
            {inst.score_compliance != null && (
              <span className={"font-semibold " + (inst.score_compliance >= 80 ? "text-green-700" : inst.score_compliance >= 50 ? "text-amber-700" : "text-red-700")}>
                Score: {inst.score_compliance}%
              </span>
            )}
          </div>

          {/* Popover assegna */}
          {assignOpen && (
            <div className="mt-3 p-3 border rounded-lg bg-brand-cream">
              <AssegnaForm
                currentUser={inst.assegnato_user}
                onAssegna={assegna}
                onCancel={() => setAssignOpen(false)}
              />
            </div>
          )}

          {/* Progress bar */}
          <div className="mt-4">
            <div className="flex items-center justify-between text-xs text-neutral-600 mb-1">
              <span>Progresso</span>
              <span>{done} OK · {fail} FAIL · {skip} salt. · {pending} da fare</span>
            </div>
            <div className="w-full h-2 bg-neutral-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-green-500 transition-all"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded-lg text-sm">
            {error}
          </div>
        )}

        {/* Items tap-to-complete */}
        <div className="space-y-3">
          {inst.items.map(item => (
            <ItemCard
              key={item.item_id}
              item={item}
              editable={editable}
              saving={saving}
              onClick={handleItemClick}
            />
          ))}
        </div>

        {/* Azioni fondo pagina */}
        {editable && (
          <div className="sticky bottom-0 bg-brand-cream pt-3 pb-4 -mx-4 px-4 sm:-mx-6 sm:px-6 border-t border-red-200 flex gap-2 flex-wrap">
            <button
              onClick={completaChecklist}
              disabled={saving}
              className="flex-1 min-w-[200px] bg-green-600 text-white px-4 py-3 rounded-lg font-semibold hover:bg-green-700 disabled:opacity-50 min-h-[52px]"
            >
              ✓ Completa checklist
            </button>
            <button
              onClick={saltaChecklist}
              disabled={saving}
              className="bg-neutral-500 text-white px-4 py-3 rounded-lg font-medium hover:bg-neutral-600 disabled:opacity-50 min-h-[52px]"
            >
              Salta
            </button>
          </div>
        )}
      </div>

      {/* Modal numpad per NUMERICO / TEMPERATURA */}
      {modal && (
        <NumpadModal
          item={modal.item}
          onConfirm={submitNumeric}
          onCancel={() => setModal(null)}
        />
      )}
    </div>
  );
}

// ─── Item card ─────────────────────────────────────────────────────────

function ItemCard({ item, editable, saving, onClick }) {
  const s = item.stato || "PENDING";
  const baseCls = "rounded-xl border-2 p-3 transition " + (EXEC_CLS[s] || EXEC_CLS.PENDING);
  const canTap = editable && !saving;

  return (
    <div className={baseCls}>
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium text-neutral-900">{item.item_titolo}</span>
            {item.item_obbligatorio && (
              <span className="text-[10px] uppercase font-bold text-red-700">Obbligatorio</span>
            )}
            <TipoBadge tipo={item.item_tipo} min={item.item_min} max={item.item_max} unita={item.item_unita} />
          </div>
          {(item.valore_numerico != null || item.valore_testo) && (
            <div className="text-sm text-neutral-700 mt-1">
              Valore: <b>{item.valore_numerico ?? item.valore_testo}</b>
              {item.item_unita && item.valore_numerico != null && ` ${item.item_unita}`}
            </div>
          )}
          {item.note && (
            <div className="text-xs text-neutral-600 italic mt-1">Nota: {item.note}</div>
          )}
          {item.completato_da && (
            <div className="text-xs text-neutral-500 mt-1">
              @{item.completato_da}
              {item.completato_at && ` · ${item.completato_at.slice(11, 16)}`}
            </div>
          )}
        </div>
      </div>

      {/* Bottoni azione */}
      <div className="grid grid-cols-3 gap-2 mt-3">
        <ActionBtn
          label="OK"
          active={s === "OK"}
          disabled={!canTap}
          color="green"
          onClick={() => onClick(item, "OK")}
        />
        <ActionBtn
          label="FAIL"
          active={s === "FAIL"}
          disabled={!canTap}
          color="red"
          onClick={() => onClick(item, "FAIL")}
        />
        <ActionBtn
          label="N/A"
          active={s === "SKIPPED"}
          disabled={!canTap || item.item_obbligatorio}
          color="neutral"
          onClick={() => onClick(item, "SKIPPED")}
          title={item.item_obbligatorio ? "Item obbligatorio — non skippabile" : ""}
        />
      </div>
    </div>
  );
}

function ActionBtn({ label, active, disabled, color, onClick, title }) {
  const map = {
    green:   active ? "bg-green-600 text-white border-green-700" : "bg-white text-green-700 border-green-300 hover:bg-green-50",
    red:     active ? "bg-red-600 text-white border-red-700"     : "bg-white text-red-700 border-red-300 hover:bg-red-50",
    neutral: active ? "bg-neutral-500 text-white border-neutral-600" : "bg-white text-neutral-700 border-neutral-300 hover:bg-neutral-50",
  };
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={
        "border-2 rounded-lg py-3 font-semibold text-sm min-h-[48px] transition disabled:opacity-40 disabled:cursor-not-allowed " +
        map[color]
      }
    >
      {label}
    </button>
  );
}

function TipoBadge({ tipo, min, max, unita }) {
  const cls = {
    CHECKBOX:    "bg-blue-100 text-blue-700",
    NUMERICO:    "bg-purple-100 text-purple-700",
    TEMPERATURA: "bg-cyan-100 text-cyan-700",
    TESTO:       "bg-amber-100 text-amber-700",
  };
  const label = tipo === "TEMPERATURA"
    ? `${min ?? "-"}°..${max ?? "-"}° ${unita || "°C"}`
    : tipo === "NUMERICO"
    ? `${min ?? ""}..${max ?? ""} ${unita || ""}`.trim()
    : tipo;
  return (
    <span className={`text-[10px] uppercase font-bold px-1.5 py-0.5 rounded ${cls[tipo] || "bg-neutral-100"}`}>
      {label}
    </span>
  );
}

// ─── Numpad modal (touch-friendly) ─────────────────────────────────────

function NumpadModal({ item, onConfirm, onCancel }) {
  const [val, setVal] = useState("");

  const append = (ch) => setVal(v => {
    if (ch === "." && v.includes(".")) return v;
    if (v === "0" && ch !== ".") return ch;
    return (v + ch).slice(0, 8);
  });
  const back = () => setVal(v => v.slice(0, -1));
  const clear = () => setVal("");
  const toggleSign = () => setVal(v => v.startsWith("-") ? v.slice(1) : v ? "-" + v : v);

  const confirm = () => { if (val !== "" && val !== "-") onConfirm(val); };

  const keys = [
    ["1", "2", "3"],
    ["4", "5", "6"],
    ["7", "8", "9"],
    ["±", "0", "."],
  ];

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="bg-white rounded-t-2xl sm:rounded-2xl w-full sm:max-w-sm shadow-2xl p-4">
        <div className="text-center mb-3">
          <div className="text-sm text-neutral-500">{item.item_titolo}</div>
          {item.item_tipo === "TEMPERATURA" && (
            <div className="text-xs text-cyan-700 mt-1">
              Range atteso: {item.item_min ?? "-"}°..{item.item_max ?? "-"}° {item.item_unita || "°C"}
            </div>
          )}
        </div>

        <div className="bg-brand-cream border-2 border-red-200 rounded-lg text-center py-4 mb-3">
          <div className="text-4xl font-bold text-red-900">
            {val || "0"}<span className="text-neutral-500 text-2xl">{item.item_unita ? ` ${item.item_unita}` : ""}</span>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2">
          {keys.flatMap(row => row).map(k => (
            <button
              key={k}
              onClick={() => k === "±" ? toggleSign() : append(k)}
              className="bg-neutral-100 hover:bg-neutral-200 active:bg-neutral-300 border rounded-lg py-4 text-2xl font-semibold min-h-[60px]"
            >
              {k}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-3 gap-2 mt-2">
          <button
            onClick={back}
            className="bg-amber-100 hover:bg-amber-200 border border-amber-300 rounded-lg py-3 font-medium min-h-[52px]"
          >
            ← Canc
          </button>
          <button
            onClick={clear}
            className="bg-neutral-200 hover:bg-neutral-300 border rounded-lg py-3 font-medium min-h-[52px]"
          >
            CE
          </button>
          <button
            onClick={onCancel}
            className="bg-white hover:bg-neutral-50 border rounded-lg py-3 font-medium min-h-[52px]"
          >
            Annulla
          </button>
        </div>

        <button
          onClick={confirm}
          disabled={val === "" || val === "-"}
          className="mt-3 w-full bg-green-600 text-white py-4 rounded-lg font-bold text-lg hover:bg-green-700 disabled:opacity-50 min-h-[56px]"
        >
          Conferma {val && `(${val}${item.item_unita || ""})`}
        </button>
      </div>
    </div>
  );
}

// ─── Form assegna (lista user disponibili) ─────────────────────────────

function AssegnaForm({ currentUser, onAssegna, onCancel }) {
  const [val, setVal] = useState(currentUser || "");
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <input
        type="text"
        value={val}
        onChange={e => setVal(e.target.value)}
        placeholder="Username (es: luigi)"
        className="flex-1 min-w-[150px] border rounded-lg px-3 py-2 min-h-[40px]"
      />
      <button
        onClick={() => onAssegna(val.trim())}
        disabled={!val.trim()}
        className="bg-red-600 text-white px-3 py-2 rounded-lg font-medium hover:bg-red-700 disabled:opacity-50 min-h-[40px]"
      >
        Assegna
      </button>
      <button onClick={onCancel} className="text-sm text-neutral-500 hover:text-neutral-800 px-2">
        Annulla
      </button>
    </div>
  );
}
