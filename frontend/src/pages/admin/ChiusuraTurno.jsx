// src/pages/admin/ChiusuraTurno.jsx
// @version: v2.0-cena-cumulativa
// Form fine turno pranzo/cena — per responsabili sala/sommelier
// A cena i valori sono giornalieri (cumulativi pranzo+cena), i parziali vengono calcolati automaticamente

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

// Campi che a cena sono cumulativi (totali giornalieri)
const CAMPI_CUMULATIVI = [
  "preconto", "contanti", "pos_bpm", "pos_sella",
  "theforkpay", "other_e_payments", "bonifici", "mance", "fatture",
];

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

  // Dati pranzo (per calcolo parziali cena)
  const [pranzoData, setPranzoData] = useState(null);
  const [pranzoLoading, setPranzoLoading] = useState(false);

  // Fondo cassa
  const [fondoCassaInizio, setFondoCassaInizio] = useState("");
  const [fondoCassaFine, setFondoCassaFine] = useState("");

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

  // Pre-conti (tavoli aperti non battuti)
  const [preconti, setPreconti] = useState([]);

  // Spese (scontrini, fatture, spese personale)
  const [spese, setSpese] = useState([]);

  // Checklist
  const [checklistConfig, setChecklistConfig] = useState([]);
  const [checklistState, setChecklistState] = useState({});

  const isCena = turno === "cena";

  // ── Helper: valore pranzo per un campo ──
  const pranzoVal = useCallback((field) => {
    if (!pranzoData || !isCena) return 0;
    return pranzoData[field] || 0;
  }, [pranzoData, isCena]);

  // ── Helper: parziale cena = valore inserito - pranzo ──
  const parzialeCena = useCallback((inputVal, field) => {
    if (!isCena) return toNumber(inputVal);
    return toNumber(inputVal) - pranzoVal(field);
  }, [isCena, pranzoVal]);

  // Mapping nome campo → state value
  const fieldValues = useMemo(() => ({
    preconto, contanti, pos_bpm: posBpm, pos_sella: posSella,
    theforkpay, other_e_payments: otherEpay, bonifici, mance, fatture,
  }), [preconto, contanti, posBpm, posSella, theforkpay, otherEpay, bonifici, mance, fatture]);

  // Totale incassi (parziali cena se turno=cena)
  const totaleIncassi = useMemo(() => {
    const campiIncassi = ["contanti", "pos_bpm", "pos_sella", "theforkpay", "other_e_payments", "bonifici"];
    return campiIncassi.reduce((sum, f) =>
      sum + parzialeCena(fieldValues[f], f)
    , 0);
  }, [fieldValues, parzialeCena]);

  const totalePreconti = useMemo(() =>
    preconti.reduce((sum, p) => sum + toNumber(p.importo), 0)
  , [preconti]);

  const totaleSpese = useMemo(() =>
    spese.reduce((sum, s) => sum + toNumber(s.importo), 0)
  , [spese]);

  // Parziale cena del preconto (chiusura)
  const precontoParziale = useMemo(() =>
    parzialeCena(preconto, "preconto")
  , [preconto, parzialeCena]);

  // Totale pre-conti pranzo (tavoli aperti dal pranzo già incassati a cena)
  const pranzoPrecontiTotale = useMemo(() => {
    if (!pranzoData || !pranzoData.preconti) return 0;
    return pranzoData.preconti.reduce((sum, p) => sum + (p.importo || 0), 0);
  }, [pranzoData]);

  const diff = useMemo(() =>
    (totaleIncassi + totalePreconti + pranzoPrecontiTotale) - precontoParziale
  , [totaleIncassi, totalePreconti, pranzoPrecontiTotale, precontoParziale]);

  const diffStatus = Math.abs(diff) < 0.5 ? "ok" : diff > 0 ? "over" : "short";

  // ── Reset form ──
  const resetForm = () => {
    setFondoCassaInizio(""); setFondoCassaFine("");
    setPreconto(""); setFatture(""); setCoperti("");
    setContanti(""); setPosBpm(""); setPosSella("");
    setTheforkpay(""); setOtherEpay(""); setBonifici(""); setMance("");
    setNote(""); setExistingId(null);
    setChecklistState({}); setPreconti([]); setSpese([]);
  };

  // ── Fetch pranzo data (per cena) ──
  const fetchPranzoData = useCallback(async () => {
    if (!isCena) { setPranzoData(null); return; }
    setPranzoLoading(true);
    try {
      const res = await fetch(`${API}/admin/finance/shift-closures/${date}/pranzo`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        setPranzoData(await res.json());
      } else {
        setPranzoData(null);
      }
    } catch {
      setPranzoData(null);
    } finally {
      setPranzoLoading(false);
    }
  }, [date, isCena, token]);

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
      setFondoCassaInizio(data.fondo_cassa_inizio?.toString() ?? "");
      setFondoCassaFine(data.fondo_cassa_fine?.toString() ?? "");
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

      // Populate preconti
      if (data.preconti && data.preconti.length > 0) {
        setPreconti(data.preconti.map(p => ({ tavolo: p.tavolo, importo: p.importo?.toString() ?? "" })));
      } else {
        setPreconti([]);
      }

      // Populate spese
      if (data.spese && data.spese.length > 0) {
        setSpese(data.spese.map(s => ({ tipo: s.tipo, descrizione: s.descrizione, importo: s.importo?.toString() ?? "" })));
      } else {
        setSpese([]);
      }

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
  useEffect(() => { fetchPranzoData(); }, [fetchPranzoData]);

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
          fondo_cassa_inizio: toNumber(fondoCassaInizio),
          fondo_cassa_fine: toNumber(fondoCassaFine),
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
          preconti: preconti.filter(p => p.tavolo.trim()).map(p => ({
            tavolo: p.tavolo.trim(),
            importo: toNumber(p.importo),
          })),
          spese: spese.filter(s => s.descrizione.trim()).map(s => ({
            tipo: s.tipo,
            descrizione: s.descrizione.trim(),
            importo: toNumber(s.importo),
          })),
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

  // Helper: hint text per campo cumulativo a cena
  const cenaHint = (field, inputVal) => {
    if (!isCena || !pranzoData) return null;
    const pv = pranzoVal(field);
    const parz = toNumber(inputVal) - pv;
    if (pv === 0) return null;
    return { pranzo: pv, parziale: parz };
  };

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

        {/* BANNER CENA CUMULATIVA */}
        {isCena && !loading && (
          <div className={`rounded-2xl p-4 border text-sm ${
            pranzoData
              ? "bg-indigo-50 border-indigo-200 text-indigo-800"
              : "bg-amber-50 border-amber-200 text-amber-800"
          }`}>
            {pranzoData ? (
              <>
                <span className="font-semibold">🌙 Modalità cena:</span> inserisci i <strong>totali giornalieri</strong> (chiusura RT, POS, contanti...).
                I parziali della sola cena verranno calcolati sottraendo i valori del pranzo.
                <div className="mt-2 text-xs opacity-80">
                  Pranzo del {date}: chiusura parz. € {fmt(pranzoData.preconto || 0)}, incassi € {fmt(pranzoData.totale_incassi || 0)}
                </div>
              </>
            ) : pranzoLoading ? (
              <span className="animate-pulse">Caricamento dati pranzo...</span>
            ) : (
              <>
                <span className="font-semibold">⚠️ Pranzo non trovato:</span> nessuna chiusura pranzo per il {date}.
                I valori inseriti verranno considerati come totali della sola cena.
              </>
            )}
          </div>
        )}

        {loading ? (
          <div className="bg-white rounded-2xl p-8 text-center text-neutral-400 animate-pulse">Caricamento...</div>
        ) : (
          <>
            {/* FONDO CASSA */}
            <div className="bg-white rounded-2xl shadow p-5 border border-neutral-200">
              <h2 className="text-sm font-semibold text-neutral-700 uppercase tracking-wide mb-4">💰 Fondo cassa</h2>
              <div className="grid grid-cols-2 gap-4">
                <NumberField label="Inizio servizio" value={fondoCassaInizio} onChange={setFondoCassaInizio} icon="🟢" />
                <NumberField label="Fine servizio" value={fondoCassaFine} onChange={setFondoCassaFine} icon="🔴" />
              </div>
            </div>

            {/* DATI PRINCIPALI */}
            <div className="bg-white rounded-2xl shadow p-5 border border-neutral-200">
              <h2 className="text-sm font-semibold text-neutral-700 uppercase tracking-wide mb-4">
                Dati servizio
                {isCena && pranzoData && <span className="text-indigo-500 font-normal normal-case ml-2 text-xs">valori giornalieri</span>}
              </h2>
              <div className="grid grid-cols-3 gap-4">
                <NumberField
                  label={isCena ? "Chiusura (giorno)" : "Chiusura Parziale"}
                  value={preconto} onChange={setPreconto} icon="🧾"
                  hint={cenaHint("preconto", preconto)} />
                <NumberField
                  label={isCena && pranzoData ? "Fatture (giorno)" : "Totale fatture"}
                  value={fatture} onChange={setFatture} icon="📄"
                  hint={cenaHint("fatture", fatture)} />
                <div>
                  <label className="block text-xs font-semibold text-neutral-500 mb-1 uppercase tracking-wide">🪑 Coperti</label>
                  <input type="number" min={0} value={coperti} onChange={e => setCoperti(e.target.value)}
                    className="w-full border border-neutral-300 rounded-xl px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-amber-200" />
                </div>
              </div>
            </div>

            {/* PAGAMENTI */}
            <div className="bg-white rounded-2xl shadow p-5 border border-neutral-200">
              <h2 className="text-sm font-semibold text-neutral-700 uppercase tracking-wide mb-4">
                Incassi
                {isCena && pranzoData && <span className="text-indigo-500 font-normal normal-case ml-2 text-xs">valori giornalieri — i parziali cena sono calcolati</span>}
              </h2>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                <NumberField label="Contanti" value={contanti} onChange={setContanti} icon="💵"
                  hint={cenaHint("contanti", contanti)} />
                <NumberField label="POS BPM" value={posBpm} onChange={setPosBpm} icon="💳"
                  hint={cenaHint("pos_bpm", posBpm)} />
                <NumberField label="POS Sella" value={posSella} onChange={setPosSella} icon="💳"
                  hint={cenaHint("pos_sella", posSella)} />
                <NumberField label="TheFork Pay" value={theforkpay} onChange={setTheforkpay} icon="🍴"
                  hint={cenaHint("theforkpay", theforkpay)} />
                <NumberField label="Stripe / PayPal" value={otherEpay} onChange={setOtherEpay} icon="📱"
                  hint={cenaHint("other_e_payments", otherEpay)} />
                <NumberField label="Bonifici" value={bonifici} onChange={setBonifici} icon="🏦"
                  hint={cenaHint("bonifici", bonifici)} />
              </div>
              <div className="mt-4 pt-4 border-t border-neutral-200">
                <NumberField label="Mance" value={mance} onChange={setMance} icon="🤝"
                  hint={cenaHint("mance", mance)} />
              </div>
            </div>

            {/* PRE-CONTI (tavoli aperti) */}
            <div className="bg-white rounded-2xl shadow p-5 border border-neutral-200">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-sm font-semibold text-neutral-700 uppercase tracking-wide">
                  🍽️ Pre-conti
                  <span className="text-neutral-400 font-normal normal-case ml-2 text-xs">tavoli aperti non battuti</span>
                </h2>
                <button type="button"
                  onClick={() => setPreconti(prev => [...prev, { tavolo: "", importo: "" }])}
                  className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-amber-50 text-amber-700 border border-amber-200 hover:bg-amber-100 transition">
                  + Aggiungi tavolo
                </button>
              </div>

              {/* Pre-conti dal pranzo (se cena e pranzo aveva tavoli aperti) */}
              {isCena && pranzoData && pranzoData.preconti && pranzoData.preconti.length > 0 && (
                <div className="mb-4 p-3 rounded-xl bg-amber-50 border border-amber-200">
                  <div className="text-xs font-semibold text-amber-700 uppercase mb-2">
                    Tavoli aperti dal pranzo (da incassare a cena)
                  </div>
                  {pranzoData.preconti.map((p, i) => (
                    <div key={i} className="flex justify-between text-sm text-amber-800 py-0.5">
                      <span>{p.tavolo}</span>
                      <span className="font-medium">€ {fmt(p.importo)}</span>
                    </div>
                  ))}
                  <div className="flex justify-between text-sm font-bold text-amber-900 pt-1 mt-1 border-t border-amber-200">
                    <span>Totale pre-conti pranzo</span>
                    <span>€ {fmt(pranzoPrecontiTotale)}</span>
                  </div>
                </div>
              )}

              {preconti.length === 0 ? (
                <div className="text-sm text-neutral-400 italic text-center py-3">
                  Nessun pre-conto — tutti i tavoli sono stati battuti
                </div>
              ) : (
                <div className="space-y-2">
                  {preconti.map((p, idx) => (
                    <div key={idx} className="flex items-center gap-3">
                      <div className="flex-1">
                        <input type="text" value={p.tavolo}
                          onChange={e => {
                            const updated = [...preconti];
                            updated[idx] = { ...updated[idx], tavolo: e.target.value };
                            setPreconti(updated);
                          }}
                          placeholder="Tavolo (es. T4, Sala2...)"
                          className="w-full border border-neutral-300 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-amber-200" />
                      </div>
                      <div className="w-32">
                        <input type="text" inputMode="decimal" value={p.importo}
                          onChange={e => {
                            const updated = [...preconti];
                            updated[idx] = { ...updated[idx], importo: e.target.value };
                            setPreconti(updated);
                          }}
                          placeholder="0,00"
                          className="w-full border border-neutral-300 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-amber-200 text-right" />
                      </div>
                      <button type="button"
                        onClick={() => setPreconti(prev => prev.filter((_, i) => i !== idx))}
                        className="w-8 h-8 flex items-center justify-center rounded-lg text-red-400 hover:bg-red-50 hover:text-red-600 transition text-lg">
                        ×
                      </button>
                    </div>
                  ))}
                  {preconti.length > 0 && (
                    <div className="flex justify-end pt-2 border-t border-neutral-100 mt-2">
                      <span className="text-xs font-semibold text-neutral-500 uppercase mr-3">Totale pre-conti:</span>
                      <span className="text-sm font-bold text-neutral-800">€ {fmt(totalePreconti)}</span>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* SPESE */}
            <div className="bg-white rounded-2xl shadow p-5 border border-neutral-200">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-sm font-semibold text-neutral-700 uppercase tracking-wide">
                  🧾 Spese
                  <span className="text-neutral-400 font-normal normal-case ml-2 text-xs">scontrini, fatture, spese personale</span>
                </h2>
                <button type="button"
                  onClick={() => setSpese(prev => [...prev, { tipo: "scontrino", descrizione: "", importo: "" }])}
                  className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-red-50 text-red-700 border border-red-200 hover:bg-red-100 transition">
                  + Aggiungi spesa
                </button>
              </div>
              {spese.length === 0 ? (
                <div className="text-sm text-neutral-400 italic text-center py-3">
                  Nessuna spesa registrata
                </div>
              ) : (
                <div className="space-y-2">
                  {spese.map((s, idx) => (
                    <div key={idx} className="flex items-center gap-2">
                      <select value={s.tipo}
                        onChange={e => {
                          const updated = [...spese];
                          updated[idx] = { ...updated[idx], tipo: e.target.value };
                          setSpese(updated);
                        }}
                        className="w-28 border border-neutral-300 rounded-xl px-2 py-2 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-amber-200">
                        <option value="scontrino">Scontrino</option>
                        <option value="fattura">Fattura</option>
                        <option value="personale">Personale</option>
                        <option value="altro">Altro</option>
                      </select>
                      <div className="flex-1">
                        <input type="text" value={s.descrizione}
                          onChange={e => {
                            const updated = [...spese];
                            updated[idx] = { ...updated[idx], descrizione: e.target.value };
                            setSpese(updated);
                          }}
                          placeholder="Descrizione..."
                          className="w-full border border-neutral-300 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-amber-200" />
                      </div>
                      <div className="w-28">
                        <input type="text" inputMode="decimal" value={s.importo}
                          onChange={e => {
                            const updated = [...spese];
                            updated[idx] = { ...updated[idx], importo: e.target.value };
                            setSpese(updated);
                          }}
                          placeholder="0,00"
                          className="w-full border border-neutral-300 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-amber-200 text-right" />
                      </div>
                      <button type="button"
                        onClick={() => setSpese(prev => prev.filter((_, i) => i !== idx))}
                        className="w-8 h-8 flex items-center justify-center rounded-lg text-red-400 hover:bg-red-50 hover:text-red-600 transition text-lg">
                        ×
                      </button>
                    </div>
                  ))}
                  {spese.length > 0 && (
                    <div className="flex justify-end pt-2 border-t border-neutral-100 mt-2">
                      <span className="text-xs font-semibold text-neutral-500 uppercase mr-3">Totale spese:</span>
                      <span className="text-sm font-bold text-red-700">€ {fmt(totaleSpese)}</span>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* RIEPILOGO */}
            <div className="bg-white rounded-2xl shadow p-5 border border-neutral-200">
              {isCena && pranzoData ? (
                <>
                  {/* Riepilogo cena: mostra breakdown giorno → pranzo → cena */}
                  <h2 className="text-sm font-semibold text-neutral-700 uppercase tracking-wide mb-4">Riepilogo cena</h2>
                  <div className="grid grid-cols-3 gap-3 text-center mb-4">
                    <div className="bg-neutral-50 rounded-xl p-3 border border-neutral-200">
                      <div className="text-[10px] font-semibold text-neutral-400 uppercase mb-1">Chiusura giorno</div>
                      <div className="text-lg font-bold text-neutral-800">€ {fmt(toNumber(preconto))}</div>
                    </div>
                    <div className="bg-amber-50 rounded-xl p-3 border border-amber-200">
                      <div className="text-[10px] font-semibold text-amber-500 uppercase mb-1">Pranzo</div>
                      <div className="text-lg font-bold text-amber-800">€ {fmt(pranzoVal("preconto"))}</div>
                    </div>
                    <div className="bg-indigo-50 rounded-xl p-3 border border-indigo-200">
                      <div className="text-[10px] font-semibold text-indigo-500 uppercase mb-1">Parziale cena</div>
                      <div className="text-lg font-bold text-indigo-800">€ {fmt(precontoParziale)}</div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-center">
                    <div className="bg-indigo-50 rounded-xl p-3 border border-indigo-200">
                      <div className="text-[10px] font-semibold text-indigo-500 uppercase mb-1">Incassi cena</div>
                      <div className="text-lg font-bold text-indigo-800">€ {fmt(totaleIncassi)}</div>
                    </div>
                    {(totalePreconti > 0 || pranzoPrecontiTotale > 0) && (
                      <div className="bg-orange-50 rounded-xl p-3 border border-orange-200">
                        <div className="text-[10px] font-semibold text-orange-500 uppercase mb-1">Pre-conti</div>
                        <div className="text-lg font-bold text-orange-800">€ {fmt(totalePreconti + pranzoPrecontiTotale)}</div>
                        {pranzoPrecontiTotale > 0 && totalePreconti > 0 && (
                          <div className="text-[9px] text-orange-500 mt-0.5">pranzo {fmt(pranzoPrecontiTotale)} + cena {fmt(totalePreconti)}</div>
                        )}
                      </div>
                    )}
                    <div className="bg-indigo-50 rounded-xl p-3 border border-indigo-200">
                      <div className="text-[10px] font-semibold text-indigo-500 uppercase mb-1">Parz. chiusura</div>
                      <div className="text-lg font-bold text-indigo-800">€ {fmt(precontoParziale)}</div>
                    </div>
                    <div className={`rounded-xl p-3 border ${
                      diffStatus === "ok" ? "bg-emerald-50 border-emerald-200" :
                      diffStatus === "over" ? "bg-amber-50 border-amber-200" :
                      "bg-red-50 border-red-200"
                    }`}>
                      <div className="text-[10px] font-semibold uppercase mb-1 opacity-70">Differenza</div>
                      <div className={`text-lg font-bold ${
                        diffStatus === "ok" ? "text-emerald-700" :
                        diffStatus === "over" ? "text-amber-700" : "text-red-700"
                      }`}>
                        {diff >= 0 ? "+" : ""}{fmt(diff)} €
                      </div>
                    </div>
                  </div>
                </>
              ) : (
                /* Riepilogo pranzo: come prima */
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
                  <div className="bg-neutral-50 rounded-xl p-4 border border-neutral-200">
                    <div className="text-xs font-semibold text-neutral-500 uppercase mb-1">Incassi</div>
                    <div className="text-xl font-bold text-neutral-800">€ {fmt(totaleIncassi)}</div>
                  </div>
                  {totalePreconti > 0 && (
                    <div className="bg-orange-50 rounded-xl p-4 border border-orange-200">
                      <div className="text-xs font-semibold text-orange-500 uppercase mb-1">Pre-conti</div>
                      <div className="text-xl font-bold text-orange-800">€ {fmt(totalePreconti)}</div>
                    </div>
                  )}
                  <div className="bg-neutral-50 rounded-xl p-4 border border-neutral-200">
                    <div className="text-xs font-semibold text-neutral-500 uppercase mb-1">Ch. Parziale</div>
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
              )}
              {diffStatus !== "ok" && (
                <div className={`mt-4 p-3 rounded-xl text-sm font-medium ${
                  diffStatus === "over" ? "bg-amber-50 text-amber-800 border border-amber-200" : "bg-red-50 text-red-800 border border-red-200"
                }`}>
                  ⚠️ {isCena && pranzoData ? "Incassi cena + pre-conti non quadrano con il parziale cena" : "Incassi + pre-conti non quadrano con la chiusura parziale"}.
                  Differenza di <strong>{diff >= 0 ? "+" : ""}{fmt(diff)} €</strong> — verifica i dati o segnala il motivo nelle note.
                </div>
              )}
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
// NumberField — input numerico con label, icona e hint parziale cena
// ─────────────────────────────────────────────────────────────
function NumberField({ label, value, onChange, icon, hint }) {
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
      {hint && (
        <div className="mt-1 text-[10px] text-indigo-500 leading-tight">
          pranzo € {fmt(hint.pranzo)} → <span className={`font-semibold ${hint.parziale < 0 ? "text-red-500" : ""}`}>parz. cena € {fmt(hint.parziale)}</span>
        </div>
      )}
    </div>
  );
}
