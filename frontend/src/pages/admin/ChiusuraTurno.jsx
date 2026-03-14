// src/pages/admin/ChiusuraTurno.jsx
// @version: v1.0-chiusura-turno
// Form semplificato fine turno pranzo/cena — per responsabili sala/sommelier

import React, { useState, useEffect, useCallback, useMemo } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import VenditeNav from "./VenditeNav";

const API = import.meta.env.VITE_API_BASE_URL;

function toNumber(v) {
  if (v === "" || v == null) return 0;
  const n = Number(String(v).replace(",", "."));
  return isNaN(n) ? 0 : n;
}

function fmt(n) {
  return n.toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// ─────────────────────────────────────────────────────────────
export default function ChiusuraTurno() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const token = localStorage.getItem("token");

  // ── State ──
  const [date, setDate] = useState(() =>
    searchParams.get("date") || new Date().toISOString().slice(0, 10)
  );
  const [turno, setTurno] = useState(() =>
    searchParams.get("turno") || (new Date().getHours() < 16 ? "pranzo" : "cena")
  );

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(null);
  const [existingId, setExistingId] = useState(null);

  // Dati numerici
  const [preconto, setPreconto] = useState("");
  const [fatture, setFatture] = useState("");
  const [coperti, setCoperti] = useState("");

  // Pagamenti
  const [contanti, setContanti] = useState("");
  const [posBpm, setPosBpm] = useState("");
  const [posSella, setPosSella] = useState("");
  const [theforkpay, setTheforkpay] = useState("");
  const [otherEpay, setOtherEpay] = useState("");
  const [bonifici, setBonifici] = useState("");
  const [mance, setMance] = useState("");

  const [note, setNote] = useState("");

  // Checklist
  const [checklistConfig, setChecklistConfig] = useState([]);
  const [checklistState, setChecklistState] = useState({});

  // Totale calcolato
  const totaleIncassi = useMemo(() =>
    toNumber(contanti) + toNumber(posBpm) + toNumber(posSella) +
    toNumber(theforkpay) + toNumber(otherEpay) + toNumber(bonifici)
  , [contanti, posBpm, posSella, theforkpay, otherEpay, bonifici]);

  const diff = useMemo(() =>
    totaleIncassi - toNumber(preconto)
  , [totaleIncassi, preconto]);

  const diffStatus = Math.abs(diff) < 0.5 ? "ok" : diff > 0 ? "over" : "short";

  // ── Reset form ──
  const resetForm = () => {
    setPreconto(""); setFatture(""); setCoperti("");
    setContanti(""); setPosBpm(""); setPosSella("");
    setTheforkpay(""); setOtherEpay(""); setBonifici(""); setMance("");
    setNote(""); setExistingId(null);
    setChecklistState({});
  };

  // ── Fetch checklist config ──
  const fetchChecklistConfig = useCallback(async () => {
    try {
      const res = await fetch(`${API}/admin/finance/shift-closures/config/all`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const items = await res.json();
        setChecklistConfig(items);
      }
    } catch { /* silenzioso */ }
  }, [token]);

  // ── Fetch closure ──
  const fetchClosure = useCallback(async () => {
    setLoading(true);
    setMessage(null);
    try {
      const res = await fetch(`${API}/admin/finance/shift-closures/${date}/${turno}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.status === 404) {
        resetForm();
        // Init checklist state from config
        const initState = {};
        checklistConfig
          .filter(c => c.turno === turno || c.turno === "entrambi")
          .forEach(c => { initState[c.id] = { checked: false, note: "" }; });
        setChecklistState(initState);
        setLoading(false);
        return;
      }
      if (!res.ok) throw new Error("Errore caricamento");
      const data = await res.json();
      setPreconto(data.preconto?.toString() ?? "");
      setFatture(data.fatture?.toString() ?? "");
      setCoperti(data.coperti?.toString() ?? "");
      setContanti(data.contanti?.toString() ?? "");
      setPosBpm(data.pos_bpm?.toString() ?? "");
      setPosSella(data.pos_sella?.toString() ?? "");
      setTheforkpay(data.theforkpay?.toString() ?? "");
      setOtherEpay(data.other_e_payments?.toString() ?? "");
      setBonifici(data.bonifici?.toString() ?? "");
      setMance(data.mance?.toString() ?? "");
      setNote(data.note ?? "");
      setExistingId(data.id);

      // Populate checklist state
      const cs = {};
      const relevantConfig = checklistConfig.filter(c => c.turno === turno || c.turno === "entrambi");
      relevantConfig.forEach(c => { cs[c.id] = { checked: false, note: "" }; });
      if (data.checklist) {
        data.checklist.forEach(r => {
          cs[r.checklist_item_id] = { checked: !!r.checked, note: r.note || "" };
        });
      }
      setChecklistState(cs);
    } catch (err) {
      setMessage({ type: "error", text: err.message });
    } finally {
      setLoading(false);
    }
  }, [date, turno, token, checklistConfig]);

  useEffect(() => { fetchChecklistConfig(); }, [fetchChecklistConfig]);
  useEffect(() => { if (checklistConfig.length >= 0) fetchClosure(); }, [fetchClosure]);

  // ── Save ──
  const handleSave = async () => {
    setSaving(true);
    setMessage(null);

    const checklist = Object.entries(checklistState).map(([id, val]) => ({
      checklist_item_id: Number(id),
      checked: val.checked,
      note: val.note || null,
    }));

    try {
      const res = await fetch(`${API}/admin/finance/shift-closures`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          date,
          turno,
          preconto: toNumber(preconto),
          fatture: toNumber(fatture),
          coperti: toNumber(coperti),
          contanti: toNumber(contanti),
          pos_bpm: toNumber(posBpm),
          pos_sella: toNumber(posSella),
          theforkpay: toNumber(theforkpay),
          other_e_payments: toNumber(otherEpay),
          bonifici: toNumber(bonifici),
          mance: toNumber(mance),
          note: note.trim() || null,
          checklist,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || `Errore ${res.status}`);
      }
      const data = await res.json();
      setExistingId(data.id);
      setMessage({ type: "ok", text: `Chiusura ${turno} salvata correttamente.` });
      setTimeout(() => setMessage(null), 4000);
    } catch (err) {
      setMessage({ type: "error", text: err.message });
    } finally {
      setSaving(false);
    }
  };

  // Checklist items for current turno
  const currentChecklist = checklistConfig.filter(
    c => (c.turno === turno || c.turno === "entrambi") && c.attivo !== 0
  );

  // ── RENDER ──
  return (
    <div className="min-h-screen bg-neutral-100">
      <VenditeNav current="fine-turno" />
      <div className="max-w-3xl mx-auto p-4 sm:p-6 space-y-5">

        {/* HEADER */}
        <div className="bg-white rounded-2xl shadow-lg p-6 border border-neutral-200">
          <h1 className="text-2xl font-bold text-amber-900 font-playfair">
            🔔 Fine turno
          </h1>
          <p className="text-neutral-500 text-sm mt-1">
            Compila i dati di chiusura del servizio
          </p>
        </div>

        {/* DATA + TURNO */}
        <div className="bg-white rounded-2xl shadow p-5 border border-neutral-200">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-neutral-500 mb-1 uppercase tracking-wide">Data</label>
              <input type="date" value={date} onChange={e => setDate(e.target.value)}
                className="w-full border border-neutral-300 rounded-xl px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-amber-200" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-neutral-500 mb-1 uppercase tracking-wide">Turno</label>
              <div className="flex gap-2">
                {["pranzo", "cena"].map(t => (
                  <button key={t} type="button" onClick={() => setTurno(t)}
                    className={`flex-1 py-2.5 rounded-xl text-sm font-semibold border-2 transition ${
                      turno === t
                        ? t === "pranzo"
                          ? "bg-amber-100 text-amber-800 border-amber-300"
                          : "bg-indigo-100 text-indigo-800 border-indigo-300"
                        : "bg-neutral-50 text-neutral-500 border-neutral-200 hover:border-neutral-300"
                    }`}>
                    {t === "pranzo" ? "☀️ Pranzo" : "🌙 Cena"}
                  </button>
                ))}
              </div>
            </div>
          </div>
          {existingId && (
            <div className="mt-3 text-xs text-amber-600 font-medium">
              Chiusura esistente — le modifiche sovrascriveranno i dati salvati.
            </div>
          )}
        </div>

        {loading ? (
          <div className="bg-white rounded-2xl p-8 text-center text-neutral-400 animate-pulse">Caricamento...</div>
        ) : (
          <>
            {/* DATI PRINCIPALI */}
            <div className="bg-white rounded-2xl shadow p-5 border border-neutral-200">
              <h2 className="text-sm font-semibold text-neutral-700 uppercase tracking-wide mb-4">Dati servizio</h2>
              <div className="grid grid-cols-3 gap-4">
                <NumberField label="Preconto (RT)" value={preconto} onChange={setPreconto} icon="🧾" />
                <NumberField label="Totale fatture" value={fatture} onChange={setFatture} icon="📄" />
                <div>
                  <label className="block text-xs font-semibold text-neutral-500 mb-1 uppercase tracking-wide">🪑 Coperti</label>
                  <input type="number" min={0} value={coperti} onChange={e => setCoperti(e.target.value)}
                    className="w-full border border-neutral-300 rounded-xl px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-amber-200" />
                </div>
              </div>
            </div>

            {/* PAGAMENTI */}
            <div className="bg-white rounded-2xl shadow p-5 border border-neutral-200">
              <h2 className="text-sm font-semibold text-neutral-700 uppercase tracking-wide mb-4">Incassi</h2>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                <NumberField label="Contanti" value={contanti} onChange={setContanti} icon="💵" />
                <NumberField label="POS BPM" value={posBpm} onChange={setPosBpm} icon="💳" />
                <NumberField label="POS Sella" value={posSella} onChange={setPosSella} icon="💳" />
                <NumberField label="TheFork Pay" value={theforkpay} onChange={setTheforkpay} icon="🍴" />
                <NumberField label="Stripe / PayPal" value={otherEpay} onChange={setOtherEpay} icon="📱" />
                <NumberField label="Bonifici" value={bonifici} onChange={setBonifici} icon="🏦" />
              </div>
              <div className="mt-4 pt-4 border-t border-neutral-200">
                <NumberField label="Mance" value={mance} onChange={setMance} icon="🤝" />
              </div>
            </div>

            {/* RIEPILOGO */}
            <div className="bg-white rounded-2xl shadow p-5 border border-neutral-200">
              <div className="grid grid-cols-3 gap-4 text-center">
                <div className="bg-neutral-50 rounded-xl p-4 border border-neutral-200">
                  <div className="text-xs font-semibold text-neutral-500 uppercase mb-1">Totale incassi</div>
                  <div className="text-xl font-bold text-neutral-800">€ {fmt(totaleIncassi)}</div>
                </div>
                <div className="bg-neutral-50 rounded-xl p-4 border border-neutral-200">
                  <div className="text-xs font-semibold text-neutral-500 uppercase mb-1">Preconto</div>
                  <div className="text-xl font-bold text-neutral-800">€ {fmt(toNumber(preconto))}</div>
                </div>
                <div className={`rounded-xl p-4 border ${
                  diffStatus === "ok" ? "bg-emerald-50 border-emerald-200" :
                  diffStatus === "over" ? "bg-amber-50 border-amber-200" :
                  "bg-red-50 border-red-200"
                }`}>
                  <div className="text-xs font-semibold uppercase mb-1 opacity-70">Differenza</div>
                  <div className={`text-xl font-bold ${
                    diffStatus === "ok" ? "text-emerald-700" :
                    diffStatus === "over" ? "text-amber-700" : "text-red-700"
                  }`}>
                    {diff >= 0 ? "+" : ""}{fmt(diff)} €
                  </div>
                </div>
              </div>
            </div>

            {/* CHECKLIST */}
            {currentChecklist.length > 0 && (
              <div className="bg-white rounded-2xl shadow p-5 border border-neutral-200">
                <h2 className="text-sm font-semibold text-neutral-700 uppercase tracking-wide mb-4">
                  Checklist {turno}
                </h2>
                <div className="space-y-3">
                  {currentChecklist.map(item => {
                    const state = checklistState[item.id] || { checked: false, note: "" };
                    return (
                      <div key={item.id} className={`flex items-center gap-3 p-3 rounded-xl border transition ${
                        state.checked ? "bg-emerald-50 border-emerald-200" : "bg-neutral-50 border-neutral-200"
                      }`}>
                        <button type="button"
                          onClick={() => setChecklistState(prev => ({
                            ...prev,
                            [item.id]: { ...prev[item.id], checked: !state.checked }
                          }))}
                          className={`w-7 h-7 rounded-lg border-2 flex items-center justify-center text-sm font-bold transition ${
                            state.checked
                              ? "bg-emerald-500 border-emerald-500 text-white"
                              : "bg-white border-neutral-300 text-transparent hover:border-emerald-300"
                          }`}>
                          ✓
                        </button>
                        <span className={`flex-1 text-sm font-medium ${state.checked ? "text-emerald-800" : "text-neutral-700"}`}>
                          {item.label}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* NOTE */}
            <div className="bg-white rounded-2xl shadow p-5 border border-neutral-200">
              <label className="block text-xs font-semibold text-neutral-500 mb-2 uppercase tracking-wide">
                📝 Note / Segnalazioni
              </label>
              <textarea value={note} onChange={e => setNote(e.target.value)} rows={3}
                placeholder="Problemi durante il servizio, segnalazioni..."
                className="w-full border border-neutral-300 rounded-xl px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-amber-200 resize-none" />
            </div>

            {/* SALVA */}
            <button type="button" onClick={handleSave} disabled={saving}
              className={`w-full py-3.5 rounded-2xl text-white font-bold text-base shadow-lg transition ${
                saving ? "bg-neutral-400 cursor-not-allowed" :
                turno === "pranzo"
                  ? "bg-amber-700 hover:bg-amber-800 hover:-translate-y-0.5"
                  : "bg-indigo-700 hover:bg-indigo-800 hover:-translate-y-0.5"
              }`}>
              {saving ? "Salvataggio..." : `💾 Salva chiusura ${turno}`}
            </button>

            {message && (
              <div className={`rounded-xl px-4 py-3 text-sm font-semibold ${
                message.type === "ok" ? "bg-emerald-50 text-emerald-700 border border-emerald-200" :
                "bg-red-50 text-red-700 border border-red-200"
              }`}>
                {message.text}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}


// ─────────────────────────────────────────────────────────────
// NumberField — input numerico con label e icona
// ─────────────────────────────────────────────────────────────
function NumberField({ label, value, onChange, icon }) {
  return (
    <div>
      <label className="block text-xs font-semibold text-neutral-500 mb-1 uppercase tracking-wide">
        {icon && <span className="mr-1">{icon}</span>}{label}
      </label>
      <input
        type="text"
        inputMode="decimal"
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder="0,00"
        className="w-full border border-neutral-300 rounded-xl px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-amber-200"
      />
    </div>
  );
}
