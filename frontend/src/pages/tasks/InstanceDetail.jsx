// Dettaglio istanza checklist — refactor UX sessione 44 (P1)
// Mockup: docs/mockups/cucina_instance_mockup.html
//
// Novita':
// - Modali brand-style (testo, salta, conferma mancanti, assegna) al posto di window.prompt/confirm
// - Progress ring SVG 84px nell'header
// - State-bar segmentata OK+FAIL
// - Item cards con bordo sinistro colorato per stato, Playfair sul nome, chip tipo differenziata
// - Numpad aggiornato: display Playfair, range atteso amber, live warning fuori range, tasto virgola IT
// - Footer fisso safe-area aware con primary red shadowed
// - Breadcrumb top + gobbette decorative SVG
// - Toast brand (hook) su tutte le azioni

import React, { useEffect, useMemo, useState, useCallback } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { API_BASE, apiFetch } from "../../config/api";
import useToast from "../../hooks/useToast";
import Nav from "./Nav";

// ───────────────────────────────────────────────────────────────────
// Utilities
// ───────────────────────────────────────────────────────────────────

function fmtNum(n, unit) {
  if (n == null) return "—";
  const s = String(n).replace(".", ",");
  return unit ? `${s} ${unit}` : s;
}

function rangeLabel(item) {
  if (item.item_min == null && item.item_max == null) return null;
  const u = item.item_unita || "";
  const sep = item.item_tipo === "TEMPERATURA" ? "°" : "";
  return `${item.item_min ?? "-"}${sep} — ${item.item_max ?? "-"}${sep} ${u}`.trim();
}

function initialOf(name) {
  if (!name) return "?";
  return name.trim().charAt(0).toUpperCase();
}

// Avatar tondo colorato per who: rosso admin/chef, blu sala, grigio viewer/sconosciuto
function avatarColorByUser(_u) {
  // In MVP non sappiamo il ruolo dall'username: uso rosso come default brand.
  // Upgrade futuro: lookup da /dipendenti/.
  return "bg-brand-red text-white";
}

// ───────────────────────────────────────────────────────────────────
// Component principale
// ───────────────────────────────────────────────────────────────────

export default function InstanceDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const role = (typeof localStorage !== "undefined" && localStorage.getItem("role")) || "";
  const isViewer = role === "viewer";
  const isAdminOrChef = ["admin", "superadmin", "chef"].includes(role);

  const [inst, setInst] = useState(null);
  const [loading, setLoading] = useState(true);
  const [errorBanner, setErrorBanner] = useState("");
  const [saving, setSaving] = useState(false);

  // Modali
  const [numModal, setNumModal] = useState(null);     // { item }
  const [txtModal, setTxtModal] = useState(null);     // { item, initial }
  const [skipModal, setSkipModal] = useState(false);
  const [confirmModal, setConfirmModal] = useState(null); // { missing: [...] }
  const [assignModal, setAssignModal] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    apiFetch(`${API_BASE}/tasks/instances/${id}`)
      .then(r => {
        if (r.status === 404) throw new Error("Istanza non trovata");
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then(setInst)
      .catch(e => setErrorBanner(e.message))
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => { load(); }, [load]);

  const editable = inst && !["COMPLETATA", "SALTATA", "SCADUTA"].includes(inst.stato);

  // ── API wrappers ──────────────────────────────────────────────

  const doCheck = async (itemId, stato, valore_numerico, valore_testo, note) => {
    setSaving(true);
    try {
      const res = await apiFetch(`${API_BASE}/tasks/execution/item/${itemId}/check`, {
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
      return updated;
    } catch (e) {
      toast(e.message, { kind: "error", duration: 2800 });
      throw e;
    } finally {
      setSaving(false);
    }
  };

  const doCompleta = async (autoSkipPending = false) => {
    if (!editable) return;
    setSaving(true);
    try {
      // Marca PENDING come SKIPPED prima di completare (se richiesto dal modal)
      if (autoSkipPending) {
        const pendings = inst.items.filter(i => i.stato === "PENDING");
        for (const it of pendings) {
          await doCheck(it.item_id, "SKIPPED", null, null, null);
        }
      }
      const res = await apiFetch(`${API_BASE}/tasks/instances/${id}/completa`, { method: "POST" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.detail || `HTTP ${res.status}`);
      }
      const updated = await res.json();
      setInst(updated);
      toast(`✓ Checklist completata — score ${updated.score_compliance ?? "?"}%`, { kind: "success", duration: 2400 });
    } catch (e) {
      toast(e.message, { kind: "error", duration: 2800 });
    } finally {
      setSaving(false);
    }
  };

  const doSalta = async (motivo) => {
    setSaving(true);
    try {
      const res = await apiFetch(`${API_BASE}/tasks/instances/${id}/salta`, {
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
      toast("Checklist saltata", { kind: "warn" });
    } catch (e) {
      toast(e.message, { kind: "error", duration: 2800 });
    } finally {
      setSaving(false);
    }
  };

  const doAssegna = async (username) => {
    setSaving(true);
    try {
      const res = await apiFetch(`${API_BASE}/tasks/instances/${id}/assegna`, {
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
      setAssignModal(false);
      toast(`Assegnata a @${username}`, { kind: "success" });
    } catch (e) {
      toast(e.message, { kind: "error", duration: 2800 });
    } finally {
      setSaving(false);
    }
  };

  // ── Handler item tap ─────────────────────────────────────────

  const handleItemAction = async (item, targetStato) => {
    if (isViewer) { toast("Sola lettura", { kind: "info" }); return; }
    if (!editable || saving) return;

    // TESTO con OK → apri modal testo
    if (targetStato === "OK" && item.item_tipo === "TESTO") {
      setTxtModal({ item, initial: item.valore_testo || "" });
      return;
    }
    // TEMPERATURA / NUMERICO con OK → apri numpad
    if (targetStato === "OK" && (item.item_tipo === "TEMPERATURA" || item.item_tipo === "NUMERICO")) {
      setNumModal({ item });
      return;
    }
    // CHECKBOX / FAIL / SKIPPED: immediato
    try {
      await doCheck(item.item_id, targetStato);
      const msg = targetStato === "OK" ? "✓ Segnato OK"
               : targetStato === "FAIL" ? "✗ Segnato FAIL"
               : "N.A. registrato";
      toast(msg, { kind: targetStato === "FAIL" ? "error" : "success" });
    } catch { /* already toasted */ }
  };

  // Submit numpad
  const handleNumSubmit = async (valore) => {
    if (!numModal) return;
    const it = numModal.item;
    const v = parseFloat(String(valore).replace(",", "."));
    if (Number.isNaN(v)) {
      toast("Inserisci un valore", { kind: "warn" });
      return;
    }
    const hasMin = it.item_min != null;
    const hasMax = it.item_max != null;
    const fuoriRange = (hasMin && v < it.item_min) || (hasMax && v > it.item_max);
    const stato = fuoriRange ? "FAIL" : "OK";
    const note = fuoriRange && (hasMin || hasMax)
      ? `Fuori range (${it.item_min ?? "-"}..${it.item_max ?? "-"} ${it.item_unita ?? ""})`
      : null;
    try {
      await doCheck(it.item_id, stato, v, null, note);
      setNumModal(null);
      toast(stato === "OK" ? "✓ Registrato" : "⚠ FAIL — fuori range", {
        kind: stato === "OK" ? "success" : "error",
      });
    } catch { /* already toasted */ }
  };

  // Submit testo
  const handleTxtSubmit = async (valore) => {
    if (!txtModal) return;
    const it = txtModal.item;
    const v = (valore || "").trim();
    try {
      if (v === "") {
        await doCheck(it.item_id, "SKIPPED", null, null, null);
        setTxtModal(null);
        toast("N.A. registrato (testo vuoto)", { kind: "info" });
      } else {
        await doCheck(it.item_id, "OK", null, v, null);
        setTxtModal(null);
        toast("✓ Nota salvata", { kind: "success" });
      }
    } catch { /* toasted */ }
  };

  // Completa checklist: se ci sono PENDING apri modale mancanti
  const handleCompletaClick = () => {
    if (!editable || saving) return;
    const missing = (inst.items || []).filter(i => i.stato === "PENDING");
    if (missing.length === 0) {
      doCompleta(false);
      return;
    }
    setConfirmModal({ missing });
  };

  // ── Render guard ─────────────────────────────────────────────

  if (loading && !inst) {
    return (
      <div className="min-h-screen bg-brand-cream font-sans">
        <Nav current="agenda" />
        <div className="max-w-3xl mx-auto p-6 text-center text-neutral-500">Caricamento...</div>
      </div>
    );
  }

  if (errorBanner && !inst) {
    return (
      <div className="min-h-screen bg-brand-cream font-sans">
        <Nav current="agenda" />
        <div className="max-w-3xl mx-auto p-6">
          <div className="bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded-lg">
            {errorBanner}
          </div>
          <button onClick={() => navigate("/tasks/agenda")} className="mt-4 text-red-700 hover:underline">
            ← Torna all'agenda
          </button>
        </div>
      </div>
    );
  }

  // ── Derived counts ───────────────────────────────────────────

  const okCount   = inst.items.filter(i => i.stato === "OK").length;
  const failCount = inst.items.filter(i => i.stato === "FAIL").length;
  const skipCount = inst.items.filter(i => i.stato === "SKIPPED").length;
  const pendCount = inst.items.filter(i => i.stato === "PENDING").length;
  const total     = inst.items.length;
  const missingObb = inst.items.filter(i => i.item_obbligatorio && i.stato === "PENDING").length;

  return (
    <div className="min-h-screen bg-brand-cream font-sans">
      <Nav current="agenda" />

      {/* wrapper con padding-bottom per compensare la footbar */}
      <div className="max-w-3xl mx-auto px-4 sm:px-6 pt-4 pb-32">

        {/* Breadcrumb */}
        <nav className="flex items-center gap-2 text-sm text-neutral-500 mb-3">
          <Link to="/tasks" className="hover:text-brand-ink">Task Manager</Link>
          <span className="opacity-40">›</span>
          <Link to="/tasks/agenda" className="hover:text-brand-ink">Agenda oggi</Link>
          <span className="opacity-40">›</span>
          <span className="text-brand-ink font-semibold truncate">{inst.template_nome}</span>
        </nav>

        {/* Head card */}
        <HeadCard
          inst={inst}
          okCount={okCount}
          failCount={failCount}
          skipCount={skipCount}
          total={total}
          onAssegnaClick={() => isViewer ? toast("Sola lettura", { kind: "info" }) : setAssignModal(true)}
        />

        {errorBanner && inst && (
          <div className="mt-3 bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded-lg text-sm">
            {errorBanner}
          </div>
        )}

        {/* Section title */}
        <div className="mt-6 mb-3 flex items-baseline gap-3">
          <h2 className="text-lg font-playfair font-bold text-brand-ink">Checklist</h2>
          <span className="text-xs text-neutral-500">
            {total} voci · {okCount} completate{failCount ? ` · ${failCount} fail` : ""}{skipCount ? ` · ${skipCount} N.A.` : ""}
          </span>
        </div>

        {/* Lista items */}
        <div className="flex flex-col gap-2.5">
          {inst.items.map(item => (
            <ItemCard
              key={item.item_id}
              item={item}
              editable={editable}
              saving={saving}
              isViewer={isViewer}
              onAction={handleItemAction}
            />
          ))}
        </div>
      </div>

      {/* Footbar */}
      <Footbar
        inst={inst}
        editable={editable}
        saving={saving}
        isViewer={isViewer}
        isAdminOrChef={isAdminOrChef}
        missingObb={missingObb}
        onAssegna={() => isViewer ? toast("Sola lettura", { kind: "info" }) : setAssignModal(true)}
        onSalta={() => setSkipModal(true)}
        onCompleta={handleCompletaClick}
      />

      {/* Modali */}
      {numModal && (
        <NumpadModal
          item={numModal.item}
          onConfirm={handleNumSubmit}
          onCancel={() => setNumModal(null)}
        />
      )}
      {txtModal && (
        <ModalTesto
          item={txtModal.item}
          initial={txtModal.initial}
          onConfirm={handleTxtSubmit}
          onCancel={() => setTxtModal(null)}
        />
      )}
      {skipModal && (
        <ModalSalta
          onConfirm={async (motivo) => { await doSalta(motivo); setSkipModal(false); }}
          onCancel={() => setSkipModal(false)}
        />
      )}
      {confirmModal && (
        <ModalMancanti
          missing={confirmModal.missing}
          onConfirm={async () => { setConfirmModal(null); await doCompleta(true); }}
          onCancel={() => setConfirmModal(null)}
        />
      )}
      {assignModal && (
        <ModalAssegna
          currentUser={inst.assegnato_user}
          onAssegna={doAssegna}
          onCancel={() => setAssignModal(false)}
        />
      )}
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────
// Head card con progress ring + state bar
// ───────────────────────────────────────────────────────────────────

function HeadCard({ inst, okCount, failCount, skipCount, total, onAssegnaClick }) {
  const done = okCount + failCount + skipCount;
  const scadChip = useMemo(() => {
    if (!inst.scadenza_at) return null;
    const hhmm = inst.scadenza_at.slice(11, 16);
    const now = new Date();
    const scad = new Date(inst.scadenza_at.replace(" ", "T"));
    const late = !isNaN(scad.getTime()) && scad < now && ["APERTA","IN_CORSO"].includes(inst.stato);
    return { hhmm, late };
  }, [inst.scadenza_at, inst.stato]);

  return (
    <div className="relative bg-white rounded-2xl border border-[#e6e1d8] shadow-sm overflow-hidden p-5 sm:p-6">
      {/* Gobbette decorative */}
      <svg
        className="absolute top-0 right-0"
        width="180" height="46" viewBox="15 28 155 28"
        xmlns="http://www.w3.org/2000/svg"
        style={{ opacity: 0.9 }}
        aria-hidden="true"
      >
        <g fill="none" strokeLinecap="round" strokeLinejoin="round" strokeWidth="5">
          <path d="M 20 50 Q 37 18 55 42"   stroke="#E8402B" />
          <path d="M 75 50 Q 92 18 110 42"  stroke="#2EB872" />
          <path d="M 130 50 Q 147 18 165 42" stroke="#2E7BE8" />
        </g>
      </svg>

      <div className="relative flex items-start justify-between gap-4">
        {/* Titolo + chips */}
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl sm:text-[28px] font-playfair font-bold text-brand-ink leading-tight">
            {inst.template_nome}
          </h1>
          <div className="mt-2 flex flex-wrap gap-x-3 gap-y-2 items-center text-sm">
            {inst.reparto && (
              <Chip variant="reparto">🍳 {capitalize(inst.reparto.toLowerCase())}</Chip>
            )}
            {inst.turno && <Chip variant="turno">{capitalize(inst.turno.toLowerCase())}</Chip>}
            {scadChip && (
              <Chip variant={scadChip.late ? "scad-late" : "scad"}>
                ⏱ entro {scadChip.hhmm}{scadChip.late ? " · in ritardo" : ""}
              </Chip>
            )}
            <Chip variant="stato">{inst.stato}</Chip>
          </div>

          {/* Meta bottom: assegna + completato */}
          <div className="mt-3 flex flex-wrap items-center gap-3 text-sm">
            <button
              onClick={onAssegnaClick}
              className="px-3 py-1.5 border rounded-lg hover:bg-red-50 disabled:opacity-50 min-h-[40px]"
            >
              {inst.assegnato_user ? `@${inst.assegnato_user}` : "Assegna a..."}
            </button>
            {inst.completato_da && (
              <span className="text-neutral-600">
                Completata da <b>@{inst.completato_da}</b>
                {inst.completato_at && ` · ${inst.completato_at.slice(11, 16)}`}
              </span>
            )}
            {inst.score_compliance != null && (
              <span className={
                "font-semibold " +
                (inst.score_compliance >= 80 ? "text-brand-green"
                  : inst.score_compliance >= 50 ? "text-amber-700"
                  : "text-brand-red")
              }>
                Score: {inst.score_compliance}%
              </span>
            )}
          </div>
        </div>

        {/* Progress ring */}
        <div className="flex flex-col items-center gap-1 flex-shrink-0">
          <ProgressRing done={done} total={total} />
          <div className="text-[11px] uppercase tracking-wide text-neutral-500">completati</div>
        </div>
      </div>

      {/* State bar segmentata */}
      <StateBar
        okCount={okCount}
        failCount={failCount}
        skipCount={skipCount}
        pendCount={total - (okCount + failCount + skipCount)}
        total={total}
      />
    </div>
  );
}

function capitalize(s) {
  if (!s) return s;
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// ───────────────────────────────────────────────────────────────────
// Chips / Badge
// ───────────────────────────────────────────────────────────────────

function Chip({ variant = "default", children }) {
  const map = {
    default:   "bg-[#EFEBE3] text-neutral-700 border-[#e6e1d8]",
    reparto:   "bg-[#fff1ec] text-[#9c1f10] border-[#f6d6cc]",
    turno:     "bg-[#eef1f5] text-[#334] border-[#dde3ec]",
    scad:      "bg-[#fdf3dc] text-[#8a5a00] border-[#f3e2b8]",
    "scad-late":"bg-[#fbe6e2] text-[#9c1f10] border-[#f2c9c1]",
    stato:     "bg-[#eef1f5] text-[#334] border-[#dde3ec]",
  };
  const cls = map[variant] || map.default;
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border ${cls}`}>
      {children}
    </span>
  );
}

// ───────────────────────────────────────────────────────────────────
// Progress ring SVG 84px
// ───────────────────────────────────────────────────────────────────

function ProgressRing({ done, total }) {
  const radius = 36;
  const circ = 2 * Math.PI * radius; // 226.194…
  const pct = total > 0 ? done / total : 0;
  const offset = circ * (1 - pct);
  return (
    <div className="relative" style={{ width: 84, height: 84 }}>
      <svg width="84" height="84" viewBox="0 0 84 84" style={{ transform: "rotate(-90deg)" }}>
        <circle cx="42" cy="42" r={radius} fill="none" stroke="#EFEBE3" strokeWidth="8" />
        <circle
          cx="42" cy="42" r={radius}
          fill="none" stroke="#2EB872" strokeWidth="8" strokeLinecap="round"
          strokeDasharray={circ.toFixed(2)}
          strokeDashoffset={offset.toFixed(2)}
          style={{ transition: "stroke-dashoffset 350ms ease" }}
        />
      </svg>
      <div
        className="absolute inset-0 flex items-center justify-center font-playfair font-bold text-brand-ink"
        style={{ fontSize: 22, letterSpacing: "-0.5px" }}
      >
        {done}<small className="ml-0.5 text-xs opacity-55 font-playfair">/{total}</small>
      </div>
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────
// State bar segmentata OK + FAIL + label
// ───────────────────────────────────────────────────────────────────

function StateBar({ okCount, failCount, skipCount, pendCount, total }) {
  if (total === 0) return null;
  const okPct = (okCount / total) * 100;
  const failPct = (failCount / total) * 100;
  return (
    <div className="mt-4 flex items-center gap-3">
      <div className="flex-1 relative h-2.5 rounded-full bg-[#EFEBE3] border border-[#e6e1d8] overflow-hidden">
        <div
          className="absolute top-0 bottom-0 left-0 rounded-full"
          style={{
            width: `${okPct}%`,
            background: "linear-gradient(90deg, #2EB872 0%, #5ec99a 100%)",
            transition: "width 350ms ease",
          }}
        />
        <div
          className="absolute top-0 bottom-0 bg-brand-red opacity-90"
          style={{
            width: `${failPct}%`,
            left: `${okPct}%`,
            transition: "width 350ms ease, left 350ms ease",
          }}
        />
      </div>
      <div className="text-xs text-neutral-500 whitespace-nowrap">
        {okCount} OK · {failCount} FAIL{skipCount ? ` · ${skipCount} N.A.` : ""} · {pendCount} da fare
      </div>
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────
// Item card
// ───────────────────────────────────────────────────────────────────

const ITEM_BG = {
  OK:      "bg-gradient-to-r from-green-50/70 to-white",
  FAIL:    "bg-gradient-to-r from-red-50 to-white",
  SKIPPED: "bg-[#faf8f4]",
  PENDING: "bg-white",
};
const ITEM_LEFT = {
  OK:      "border-l-brand-green",
  FAIL:    "border-l-brand-red",
  SKIPPED: "border-l-[#b9b4aa]",
  PENDING: "border-l-[#e6e1d8]",
};

function ItemCard({ item, editable, saving, isViewer, onAction }) {
  const s = item.stato || "PENDING";
  const canTap = editable && !saving && !isViewer;
  const strike = s === "SKIPPED";

  const range = rangeLabel(item);

  return (
    <div
      className={[
        "grid grid-cols-[1fr_auto] gap-3 items-center",
        "rounded-2xl p-3.5 pr-3 border border-[#e6e1d8] border-l-4",
        "shadow-sm transition-colors duration-200",
        ITEM_BG[s] || ITEM_BG.PENDING,
        ITEM_LEFT[s] || ITEM_LEFT.PENDING,
      ].join(" ")}
    >
      {/* Main */}
      <div className="min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-playfair text-neutral-500 text-sm w-6 text-right">{item.item_ordine + 1}.</span>
          <span className={
            "font-playfair font-semibold text-brand-ink tracking-tight " +
            "text-base sm:text-[17px] " +
            (strike ? "line-through decoration-2 decoration-[#b9b4aa]" : "")
          }>
            {item.item_titolo}
          </span>
          <TipoChip tipo={item.item_tipo} />
          {item.item_obbligatorio && (
            <span className="text-[10px] uppercase font-bold tracking-wide px-2 py-0.5 rounded-full border bg-[#fbe6e2] text-[#9c1f10] border-[#f2c9c1]">
              obbligatoria
            </span>
          )}
        </div>

        <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 items-center text-sm text-neutral-500">
          {range && (
            <span className="font-mono text-xs bg-[#EFEBE3] text-neutral-700 px-2 py-0.5 rounded border border-[#e6e1d8]">
              {range}
            </span>
          )}
          {item.completato_da && (
            <span className="inline-flex items-center gap-1.5 text-xs">
              <span
                className={
                  "w-[18px] h-[18px] rounded-full inline-flex items-center justify-center font-playfair font-bold text-[10px] " +
                  avatarColorByUser(item.completato_da)
                }
              >
                {initialOf(item.completato_da)}
              </span>
              @{item.completato_da}
              {item.completato_at && ` · ${item.completato_at.slice(11, 16)}`}
            </span>
          )}
        </div>

        {/* Valore compilato (NUMERICO / TEMPERATURA) */}
        {(item.item_tipo === "NUMERICO" || item.item_tipo === "TEMPERATURA") && item.valore_numerico != null && (
          <div className={
            "mt-1 font-playfair font-bold leading-tight " +
            (s === "FAIL" ? "text-brand-red" : "text-brand-ink")
          } style={{ fontSize: 22, letterSpacing: "-0.5px" }}>
            {fmtNum(item.valore_numerico)}
            <span className="ml-1 text-neutral-500 text-[13px] font-normal">{item.item_unita || ""}</span>
          </div>
        )}

        {/* Valore testo */}
        {item.item_tipo === "TESTO" && item.valore_testo && (
          <div className="mt-1.5 text-sm italic text-neutral-700 bg-[#EFEBE3] border-l-2 border-[#d7d1c2] px-3 py-1.5 rounded">
            "{item.valore_testo}"
          </div>
        )}

        {/* Nota automatica / manuale */}
        {item.note && (
          <div className="mt-1.5 text-sm italic text-neutral-600 bg-[#EFEBE3] border-l-2 border-[#d7d1c2] px-3 py-1.5 rounded">
            {item.note}
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="flex gap-2 items-center">
        {item.item_tipo === "CHECKBOX" && (
          <>
            <ActionCircle
              variant="ok"
              active={s === "OK"}
              disabled={!canTap}
              onClick={() => onAction(item, "OK")}
              aria-label="OK"
            >
              ✓
            </ActionCircle>
            <ActionCircle
              variant="fail"
              active={s === "FAIL"}
              disabled={!canTap}
              onClick={() => onAction(item, "FAIL")}
              aria-label="FAIL"
            >
              ✗
            </ActionCircle>
            <ActionCircle
              variant="skip"
              active={s === "SKIPPED"}
              disabled={!canTap || item.item_obbligatorio}
              onClick={() => onAction(item, "SKIPPED")}
              aria-label="N.A."
              title={item.item_obbligatorio ? "Item obbligatorio — non skippabile" : "N.A."}
            >
              N.A.
            </ActionCircle>
          </>
        )}

        {(item.item_tipo === "TEMPERATURA" || item.item_tipo === "NUMERICO") && (
          <>
            <button
              onClick={() => onAction(item, "OK")}
              disabled={!canTap}
              className={[
                "min-h-[56px] px-4 rounded-2xl border-2 border-dashed border-brand-red",
                "bg-white text-[#9c1f10] font-playfair font-bold text-base",
                "inline-flex items-center gap-2 hover:bg-[#fbe6e2]",
                "disabled:opacity-40 disabled:cursor-not-allowed",
              ].join(" ")}
            >
              🔢 {item.valore_numerico != null ? fmtNum(item.valore_numerico, item.item_unita) : "Inserisci…"}
            </button>
            <ActionCircle
              variant="skip"
              active={s === "SKIPPED"}
              disabled={!canTap || item.item_obbligatorio}
              onClick={() => onAction(item, "SKIPPED")}
              aria-label="N.A."
              title={item.item_obbligatorio ? "Item obbligatorio — non skippabile" : "N.A."}
            >
              N.A.
            </ActionCircle>
          </>
        )}

        {item.item_tipo === "TESTO" && (
          <>
            <button
              onClick={() => onAction(item, "OK")}
              disabled={!canTap}
              className={[
                "min-h-[56px] px-4 rounded-2xl border-2 border-dashed border-brand-red",
                "bg-white text-[#9c1f10] font-playfair font-bold text-base",
                "inline-flex items-center gap-2 hover:bg-[#fbe6e2]",
                "disabled:opacity-40 disabled:cursor-not-allowed",
              ].join(" ")}
            >
              ✎ {item.valore_testo ? "Modifica" : "Scrivi…"}
            </button>
            <ActionCircle
              variant="skip"
              active={s === "SKIPPED"}
              disabled={!canTap || item.item_obbligatorio}
              onClick={() => onAction(item, "SKIPPED")}
              aria-label="N.A."
              title={item.item_obbligatorio ? "Item obbligatorio — non skippabile" : "N.A."}
            >
              N.A.
            </ActionCircle>
          </>
        )}
      </div>
    </div>
  );
}

function ActionCircle({ variant, active, disabled, onClick, children, ...rest }) {
  const base = "min-w-[56px] min-h-[56px] rounded-2xl border font-bold text-sm inline-flex items-center justify-center transition-colors select-none disabled:opacity-40 disabled:cursor-not-allowed";
  const map = {
    ok:   active ? "bg-brand-green text-white border-brand-green"
                 : "bg-white text-green-700 border-[#e6e1d8] hover:border-brand-green hover:bg-green-50",
    fail: active ? "bg-brand-red text-white border-brand-red"
                 : "bg-white text-[#9c1f10] border-[#e6e1d8] hover:border-brand-red hover:bg-[#fdeae5]",
    skip: active ? "bg-[#b9b4aa] text-white border-[#b9b4aa]"
                 : "bg-white text-neutral-600 border-[#e6e1d8] hover:border-[#b9b4aa] hover:bg-[#f5f2ec]",
  };
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`${base} ${map[variant] || map.skip}`}
      {...rest}
    >
      {children}
    </button>
  );
}

function TipoChip({ tipo }) {
  const map = {
    TEMPERATURA: "bg-[#eaf4ff] text-[#1a4fa0] border-[#cfe0f8]",
    NUMERICO:    "bg-[#f1eefa] text-[#4b32a0] border-[#dccfe8]",
    TESTO:       "bg-[#eef4ef] text-[#2a6a3a] border-[#cfe1d3]",
    CHECKBOX:    "bg-[#EFEBE3] text-neutral-700 border-[#e6e1d8]",
  };
  return (
    <span className={`text-[11px] uppercase font-semibold tracking-wide px-2 py-0.5 rounded-full border ${map[tipo] || map.CHECKBOX}`}>
      {tipo}
    </span>
  );
}

// ───────────────────────────────────────────────────────────────────
// Footbar
// ───────────────────────────────────────────────────────────────────

function Footbar({ inst, editable, saving, isViewer, isAdminOrChef, missingObb, onAssegna, onSalta, onCompleta }) {
  if (!editable) return null;
  const disabled = saving;

  return (
    <div
      className="fixed left-0 right-0 bottom-0 z-20 border-t border-[#e6e1d8]"
      style={{
        background: "rgba(244,241,236,.94)",
        backdropFilter: "saturate(1.2) blur(8px)",
        WebkitBackdropFilter: "saturate(1.2) blur(8px)",
        paddingBottom: "calc(14px + env(safe-area-inset-bottom))",
        paddingTop: 14,
      }}
    >
      <div className="max-w-3xl mx-auto px-4 sm:px-6 flex items-center gap-2.5">
        {!isViewer && (
          <button
            onClick={onAssegna}
            disabled={disabled}
            className="min-h-[44px] px-3.5 rounded-xl text-sm font-semibold text-neutral-500 hover:text-brand-ink disabled:opacity-40"
            type="button"
          >
            👤 Assegna
          </button>
        )}

        {isAdminOrChef && (
          <button
            onClick={onSalta}
            disabled={disabled}
            className="min-h-[56px] px-4 rounded-2xl bg-white border border-[#e6e1d8] text-brand-ink font-semibold hover:bg-[#EFEBE3] disabled:opacity-40"
            type="button"
          >
            Salta…
          </button>
        )}

        <button
          onClick={onCompleta}
          disabled={disabled || isViewer}
          className={[
            "flex-1 min-h-[56px] px-4 rounded-2xl",
            "bg-brand-red text-white font-bold text-base",
            "inline-flex items-center justify-center gap-2",
            "hover:brightness-95 disabled:opacity-50 disabled:cursor-not-allowed",
          ].join(" ")}
          style={{ boxShadow: "0 10px 22px rgba(232,64,43,.25)" }}
          type="button"
        >
          ✓ {missingObb > 0 ? `Completa — ${missingObb} obbligatorie da confermare` : "Completa checklist"}
        </button>
      </div>
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────
// Modal base + modali specifiche
// ───────────────────────────────────────────────────────────────────

function ModalBack({ onBackdropClick, children }) {
  return (
    <div
      className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center"
      style={{ background: "rgba(17,17,17,.42)" }}
      onClick={onBackdropClick}
    >
      <div
        className="bg-brand-cream w-full sm:max-w-md sm:rounded-[22px] rounded-t-[22px] border border-[#e6e1d8] p-5 sm:p-6 shadow-2xl"
        style={{
          paddingBottom: "calc(24px + env(safe-area-inset-bottom))",
          animation: "trgb-modal-up .25s ease",
        }}
        onClick={e => e.stopPropagation()}
      >
        {children}
      </div>
      {/* keyframes inline una volta sola */}
      <style>{`@keyframes trgb-modal-up { from { transform: translateY(20px); opacity: 0 } to { transform: translateY(0); opacity: 1 } }`}</style>
    </div>
  );
}

function ModalTitle({ children }) {
  return <h3 className="m-0 font-playfair font-bold text-[22px] text-brand-ink">{children}</h3>;
}
function ModalLead({ children }) {
  return <p className="mt-1.5 mb-3 text-sm text-neutral-600">{children}</p>;
}

// ── Modal testo ──────────────────────────────────────────────

function ModalTesto({ item, initial, onConfirm, onCancel }) {
  const [val, setVal] = useState(initial || "");
  const taRef = React.useRef(null);
  useEffect(() => { taRef.current?.focus(); }, []);
  return (
    <ModalBack onBackdropClick={onCancel}>
      <ModalTitle>{item.item_titolo}</ModalTitle>
      <ModalLead>Descrivi brevemente ciò che hai osservato o eseguito. Se lasci vuoto diventa N.A.</ModalLead>
      <textarea
        ref={taRef}
        value={val}
        onChange={e => setVal(e.target.value)}
        className="w-full min-h-[100px] border border-[#e6e1d8] rounded-xl px-3 py-2 bg-white focus:outline-2 focus:outline focus:outline-brand-red"
        placeholder="Scrivi qui…"
      />
      <div className="mt-4 flex gap-2.5">
        <button
          onClick={onCancel}
          className="min-h-[52px] px-4 rounded-2xl bg-white border border-[#e6e1d8] font-semibold text-brand-ink hover:bg-[#EFEBE3]"
        >
          Annulla
        </button>
        <button
          onClick={() => onConfirm(val)}
          className="flex-1 min-h-[52px] px-4 rounded-2xl bg-brand-red text-white font-bold"
          style={{ boxShadow: "0 10px 22px rgba(232,64,43,.25)" }}
        >
          Salva
        </button>
      </div>
    </ModalBack>
  );
}

// ── Modal salta ──────────────────────────────────────────────

function ModalSalta({ onConfirm, onCancel }) {
  const [val, setVal] = useState("");
  const taRef = React.useRef(null);
  useEffect(() => { taRef.current?.focus(); }, []);
  const canSubmit = val.trim().length > 0;
  return (
    <ModalBack onBackdropClick={onCancel}>
      <ModalTitle>Salta la checklist</ModalTitle>
      <ModalLead>L'operazione è tracciata. Inserisci il motivo (obbligatorio).</ModalLead>
      <textarea
        ref={taRef}
        value={val}
        onChange={e => setVal(e.target.value)}
        className="w-full min-h-[100px] border border-[#e6e1d8] rounded-xl px-3 py-2 bg-white focus:outline-2 focus:outline focus:outline-brand-red"
        placeholder="Es. locale chiuso per manutenzione…"
      />
      <div className="mt-4 flex gap-2.5">
        <button
          onClick={onCancel}
          className="min-h-[52px] px-4 rounded-2xl bg-white border border-[#e6e1d8] font-semibold text-brand-ink hover:bg-[#EFEBE3]"
        >
          Annulla
        </button>
        <button
          onClick={() => canSubmit && onConfirm(val.trim())}
          disabled={!canSubmit}
          className="flex-1 min-h-[52px] px-4 rounded-2xl bg-brand-red text-white font-bold disabled:opacity-50"
          style={{ boxShadow: "0 10px 22px rgba(232,64,43,.25)" }}
        >
          Conferma salto
        </button>
      </div>
    </ModalBack>
  );
}

// ── Modal mancanti ───────────────────────────────────────────

function ModalMancanti({ missing, onConfirm, onCancel }) {
  const obb = missing.filter(i => i.item_obbligatorio).length;
  return (
    <ModalBack onBackdropClick={onCancel}>
      <ModalTitle>Completare con voci mancanti?</ModalTitle>
      <ModalLead>
        Ci sono <b>{missing.length}</b> voci non compilate
        {obb > 0 && <> (di cui <b className="text-brand-red">{obb} obbligatorie</b>)</>}.
        Saranno marcate come <b>SKIPPED</b> e lo score di compliance ne terrà conto.
      </ModalLead>
      <ul className="list-disc pl-5 text-sm text-neutral-700 space-y-1 max-h-[40vh] overflow-auto">
        {missing.map(i => (
          <li key={i.item_id}>
            {i.item_titolo}
            {i.item_obbligatorio && (
              <span className="text-[#9c1f10] font-semibold"> (obbligatoria)</span>
            )}
          </li>
        ))}
      </ul>
      <div className="mt-4 flex gap-2.5">
        <button
          onClick={onCancel}
          className="min-h-[52px] px-4 rounded-2xl bg-white border border-[#e6e1d8] font-semibold text-brand-ink hover:bg-[#EFEBE3]"
        >
          Torna alla lista
        </button>
        <button
          onClick={onConfirm}
          className="flex-1 min-h-[52px] px-4 rounded-2xl bg-brand-red text-white font-bold"
          style={{ boxShadow: "0 10px 22px rgba(232,64,43,.25)" }}
        >
          Completa comunque
        </button>
      </div>
    </ModalBack>
  );
}

// ── Modal assegna ────────────────────────────────────────────

function ModalAssegna({ currentUser, onAssegna, onCancel }) {
  // MVP: lista statica + campo testo libero come fallback
  const demo = [
    { u: "giulia", n: "Giulia", label: "Giulia (chef)", color: "bg-brand-red text-white" },
    { u: "marco",  n: "Marco",  label: "Marco (admin)", color: "bg-brand-green text-white" },
    { u: "ivan",   n: "Ivan",   label: "Ivan (sala)",   color: "bg-brand-blue text-white" },
  ];
  const [custom, setCustom] = useState(currentUser || "");

  return (
    <ModalBack onBackdropClick={onCancel}>
      <ModalTitle>Assegna la checklist</ModalTitle>
      <ModalLead>Chi è responsabile oggi?</ModalLead>

      <div className="flex flex-col gap-2">
        {demo.map(p => (
          <button
            key={p.u}
            onClick={() => onAssegna(p.u)}
            className="min-h-[52px] px-3 rounded-2xl bg-white border border-[#e6e1d8] flex items-center gap-3 hover:bg-[#EFEBE3] text-left"
          >
            <span className={`w-7 h-7 rounded-full inline-flex items-center justify-center font-playfair font-bold text-sm ${p.color}`}>
              {initialOf(p.n)}
            </span>
            <span className="font-semibold">{p.label}</span>
          </button>
        ))}
      </div>

      <div className="mt-4 pt-4 border-t border-[#e6e1d8]">
        <label className="block text-xs uppercase tracking-wide text-neutral-500 mb-1.5">Altro username</label>
        <div className="flex gap-2">
          <input
            type="text"
            value={custom}
            onChange={e => setCustom(e.target.value)}
            placeholder="es. luigi"
            className="flex-1 min-w-0 border border-[#e6e1d8] rounded-xl px-3 py-2 min-h-[44px] bg-white focus:outline-2 focus:outline focus:outline-brand-red"
          />
          <button
            onClick={() => custom.trim() && onAssegna(custom.trim())}
            disabled={!custom.trim()}
            className="min-h-[44px] px-3 rounded-xl bg-brand-red text-white font-semibold disabled:opacity-50"
          >
            Assegna
          </button>
        </div>
      </div>

      <div className="mt-4 flex">
        <button
          onClick={onCancel}
          className="flex-1 min-h-[52px] px-4 rounded-2xl bg-white border border-[#e6e1d8] font-semibold text-brand-ink hover:bg-[#EFEBE3]"
        >
          Annulla
        </button>
      </div>
    </ModalBack>
  );
}

// ───────────────────────────────────────────────────────────────────
// Numpad modal — display Playfair, range amber, warning fuori range
// ───────────────────────────────────────────────────────────────────

function NumpadModal({ item, onConfirm, onCancel }) {
  const [buf, setBuf] = useState("");
  const [neg, setNeg] = useState(false);

  const hasMin = item.item_min != null;
  const hasMax = item.item_max != null;
  const hasRange = hasMin || hasMax;

  const currentVal = useMemo(() => {
    if (buf === "" || buf === ".") return NaN;
    return parseFloat((neg ? "-" : "") + buf);
  }, [buf, neg]);

  const inRange = useMemo(() => {
    if (Number.isNaN(currentVal)) return true;
    if (hasMin && currentVal < item.item_min) return false;
    if (hasMax && currentVal > item.item_max) return false;
    return true;
  }, [currentVal, hasMin, hasMax, item.item_min, item.item_max]);

  const showFailWarn = !Number.isNaN(currentVal) && !inRange && hasRange;

  const append = (ch) => {
    setBuf(v => {
      if (ch === "." && v.includes(".")) return v;
      if (v === "0" && ch !== ".") return ch;
      if (v.length >= 6) return v;
      return v + ch;
    });
  };
  const back = () => setBuf(v => v.slice(0, -1));
  const clear = () => { setBuf(""); setNeg(false); };
  const toggleSign = () => setNeg(n => !n);

  const submit = () => {
    if (buf === "" || buf === ".") return;
    onConfirm((neg ? "-" : "") + buf);
  };

  const rangeTxt = hasRange
    ? `Range atteso: ${item.item_min ?? "-"}${item.item_tipo === "TEMPERATURA" ? "°" : ""} — ${item.item_max ?? "-"}${item.item_tipo === "TEMPERATURA" ? "°" : ""} ${item.item_unita || ""}`.trim()
    : null;

  const displayTxt = buf === ""
    ? "—"
    : `${neg ? "-" : ""}${buf.replace(".", ",")}`;

  return (
    <ModalBack onBackdropClick={onCancel}>
      <ModalTitle>{item.item_titolo}</ModalTitle>
      <ModalLead>
        {item.item_tipo === "TEMPERATURA"
          ? "Inserisci la temperatura misurata. Fuori range → FAIL automatico."
          : "Inserisci il valore numerico."}
      </ModalLead>

      {rangeTxt && (
        <div className="inline-block bg-[#fdf3dc] text-[#8a5a00] border border-[#f3e2b8] px-2.5 py-1 rounded-full text-xs font-semibold mb-3">
          {rangeTxt}
        </div>
      )}

      {/* Display */}
      <div
        className={
          "bg-white border border-[#e6e1d8] rounded-xl px-3.5 py-3 mb-3 text-right min-h-[64px] flex items-center justify-end gap-1.5 font-playfair font-bold " +
          (showFailWarn ? "text-brand-red" : "text-brand-ink")
        }
        style={{ fontSize: 36, letterSpacing: "-1px" }}
      >
        <span>{displayTxt}</span>
        <span className="text-[16px] font-normal text-neutral-500">{item.item_unita || ""}</span>
      </div>

      {/* Warning fuori range */}
      {showFailWarn && (
        <div className="mb-3 px-3 py-2 rounded-xl bg-[#fbe6e2] text-[#9c1f10] border border-[#f2c9c1] text-sm">
          ⚠ Fuori range — sarà registrato come FAIL con nota automatica.
        </div>
      )}

      {/* Numpad 3x5 */}
      <div className="grid grid-cols-3 gap-2">
        <NpKey onClick={() => append("7")}>7</NpKey>
        <NpKey onClick={() => append("8")}>8</NpKey>
        <NpKey onClick={() => append("9")}>9</NpKey>
        <NpKey onClick={() => append("4")}>4</NpKey>
        <NpKey onClick={() => append("5")}>5</NpKey>
        <NpKey onClick={() => append("6")}>6</NpKey>
        <NpKey onClick={() => append("1")}>1</NpKey>
        <NpKey onClick={() => append("2")}>2</NpKey>
        <NpKey onClick={() => append("3")}>3</NpKey>
        <NpKey onClick={toggleSign}>±</NpKey>
        <NpKey onClick={() => append("0")}>0</NpKey>
        <NpKey onClick={() => append(".")}>,</NpKey>
        <NpKey onClick={clear} kind="clear">C</NpKey>
        <NpKey onClick={back} kind="back">⌫</NpKey>
        <NpKey onClick={submit} kind="submit" disabled={buf === "" || buf === "."}>✓</NpKey>
      </div>

      {/* Annulla */}
      <div className="mt-4 flex">
        <button
          onClick={onCancel}
          className="flex-1 min-h-[48px] px-4 rounded-2xl bg-white border border-[#e6e1d8] font-semibold text-brand-ink hover:bg-[#EFEBE3]"
        >
          Annulla
        </button>
      </div>
    </ModalBack>
  );
}

function NpKey({ onClick, children, kind = "num", disabled }) {
  const base = "min-h-[60px] rounded-2xl border border-[#e6e1d8] transition-transform active:scale-[0.97]";
  const map = {
    num:    "bg-white text-brand-ink font-playfair font-bold hover:bg-[#EFEBE3]",
    clear:  "bg-white text-brand-red font-semibold text-sm tracking-wide uppercase hover:bg-[#fdeae5]",
    back:   "bg-white text-neutral-600 text-xl hover:bg-[#EFEBE3]",
    submit: "bg-brand-green text-white border-brand-green font-bold text-xl disabled:opacity-50",
  };
  const styleNum = kind === "num" ? { fontSize: 24 } : undefined;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`${base} ${map[kind] || map.num}`}
      style={styleNum}
    >
      {children}
    </button>
  );
}
