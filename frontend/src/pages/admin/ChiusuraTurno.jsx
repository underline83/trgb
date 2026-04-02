// src/pages/admin/ChiusuraTurno.jsx
// @version: v2.0-cena-cumulativa
// Form fine turno pranzo/cena — per responsabili sala/sommelier
// A cena i valori sono giornalieri (cumulativi pranzo+cena), i parziali vengono calcolati automaticamente

import React, { useState, useEffect, useCallback, useMemo } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { isSuperAdminRole } from "../../utils/authHelpers";
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
  const isSuperAdmin = isSuperAdminRole(localStorage.getItem("role") || "");

  // ── State ──
  const todayStr = (() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`; })();
  const [date, setDate] = useState(() =>
    searchParams.get("date") || todayStr
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

  // ── AUTOSAVE DRAFT in localStorage ──
  const draftKey = `draft_chiusura_${date}_${turno}`;

  // Salva draft ogni volta che i campi cambiano (skip durante loading/fetching)
  useEffect(() => {
    if (loading) return;
    const timer = setTimeout(() => {
      const hasData = fondoCassaInizio || fondoCassaFine || preconto || fatture || coperti ||
        contanti || posBpm || posSella || theforkpay || otherEpay || bonifici || mance || note ||
        preconti.length > 0 || spese.length > 0;
      if (!hasData) return;
      try {
        localStorage.setItem(draftKey, JSON.stringify({
          fondoCassaInizio, fondoCassaFine, preconto, fatture, coperti,
          contanti, posBpm, posSella, theforkpay, otherEpay, bonifici, mance,
          note, preconti, spese, checklistState, _ts: Date.now(),
        }));
      } catch { /* quota exceeded — ignora */ }
    }, 800);
    return () => clearTimeout(timer);
  }, [loading, draftKey, fondoCassaInizio, fondoCassaFine, preconto, fatture, coperti,
    contanti, posBpm, posSella, theforkpay, otherEpay, bonifici, mance, note, preconti, spese, checklistState]);

  // Ripristina draft (solo se il form è vuoto = nessun record salvato sul server)
  const restoreDraft = useCallback(() => {
    try {
      const raw = localStorage.getItem(draftKey);
      if (!raw) return false;
      const d = JSON.parse(raw);
      // Ignora draft più vecchi di 24h
      if (d._ts && Date.now() - d._ts > 24 * 60 * 60 * 1000) {
        localStorage.removeItem(draftKey);
        return false;
      }
      if (d.fondoCassaInizio) setFondoCassaInizio(d.fondoCassaInizio);
      if (d.fondoCassaFine) setFondoCassaFine(d.fondoCassaFine);
      if (d.preconto) setPreconto(d.preconto);
      if (d.fatture) setFatture(d.fatture);
      if (d.coperti) setCoperti(d.coperti);
      if (d.contanti) setContanti(d.contanti);
      if (d.posBpm) setPosBpm(d.posBpm);
      if (d.posSella) setPosSella(d.posSella);
      if (d.theforkpay) setTheforkpay(d.theforkpay);
      if (d.otherEpay) setOtherEpay(d.otherEpay);
      if (d.bonifici) setBonifici(d.bonifici);
      if (d.mance) setMance(d.mance);
      if (d.note) setNote(d.note);
      if (d.preconti?.length) setPreconti(d.preconti);
      if (d.spese?.length) setSpese(d.spese);
      if (d.checklistState) setChecklistState(d.checklistState);
      return true;
    } catch { return false; }
  }, [draftKey]);

  // Cancella draft dopo salvataggio riuscito
  const clearDraft = useCallback(() => {
    try { localStorage.removeItem(draftKey); } catch {}
  }, [draftKey]);

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

  // ── TOTALE ENTRATE (valori GIORNALIERI, come dal cartaceo) ──
  // POS + Contanti + TheFork + Altro + Bonifici + Fondo_in - Fondo_fine
  // Le mance NON entrano: sono battute nella chiusura RT ma poi date al personale (solo dato statistico)
  const totaleEntrate = useMemo(() => {
    const campiIncassi = ["contanti", "pos_bpm", "pos_sella", "theforkpay", "other_e_payments", "bonifici"];
    const sommaIncassi = campiIncassi.reduce((sum, f) =>
      sum + toNumber(fieldValues[f])
    , 0);
    return sommaIncassi + toNumber(fondoCassaInizio) - toNumber(fondoCassaFine);
  }, [fieldValues, fondoCassaInizio, fondoCassaFine]);

  // Pre-conti del turno corrente
  const totalePreconti = useMemo(() =>
    preconti.reduce((sum, p) => sum + toNumber(p.importo), 0)
  , [preconti]);

  // Spese del turno corrente
  const totaleSpese = useMemo(() =>
    spese.reduce((sum, s) => sum + toNumber(s.importo), 0)
  , [spese]);

  // Chiusura RT parziale cena (per breakdown visivo)
  const chiusuraRTParziale = useMemo(() =>
    parzialeCena(preconto, "preconto")
  , [preconto, parzialeCena]);

  // A cena: preconti/fatture/spese del pranzo da sommare al giustificato
  // (perché le entrate sono giornaliere, il giustificato deve coprire l'intera giornata)
  const pranzoPrecontiTotale = useMemo(() => {
    if (!isCena || !pranzoData || !pranzoData.preconti) return 0;
    return pranzoData.preconti.reduce((sum, p) => sum + (p.importo || 0), 0);
  }, [isCena, pranzoData]);

  const pranzoFatture = useMemo(() => {
    if (!isCena || !pranzoData) return 0;
    return pranzoData.fatture || 0;
  }, [isCena, pranzoData]);

  const pranzoSpese = useMemo(() => {
    if (!isCena || !pranzoData || !pranzoData.spese) return 0;
    return pranzoData.spese.reduce((sum, s) => sum + (s.importo || 0), 0);
  }, [isCena, pranzoData]);

  // ── QUADRATURA (GIORNALIERA) ──
  // GIUSTIFICATO = Chiusura RT (giornaliera) + Preconti TOTALI + Fatture TOTALI
  // Le SPESE non fanno parte del giustificato: sono la giustificazione della differenza.
  // Formula: ENTRATE - GIUSTIFICATO = differenza, poi le SPESE coprono la differenza.
  // Se differenza + spese ≈ 0 → quadra.
  const totaleGiustificato = useMemo(() =>
    toNumber(preconto)
    + (totalePreconti + pranzoPrecontiTotale)
    + (toNumber(fatture) + pranzoFatture)
  , [preconto, totalePreconti, pranzoPrecontiTotale, fatture, pranzoFatture]);

  const speseGiorno = useMemo(() =>
    totaleSpese + pranzoSpese
  , [totaleSpese, pranzoSpese]);

  // Differenza grezza (senza spese)
  const diffGrezzo = useMemo(() =>
    totaleEntrate - totaleGiustificato
  , [totaleEntrate, totaleGiustificato]);

  // Differenza reale: le spese giustificano soldi mancanti dalla cassa
  const diff = useMemo(() =>
    diffGrezzo + speseGiorno
  , [diffGrezzo, speseGiorno]);

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
        // Ripristina eventuale draft da localStorage
        const restored = restoreDraft();
        if (restored) {
          setMessage({ type: "info", text: "📝 Bozza ripristinata — dati recuperati dalla sessione precedente." });
          setTimeout(() => setMessage(null), 5000);
        }
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
  }, [date, turno, token, checklistConfig, restoreDraft]);

  useEffect(() => { fetchChecklistConfig(); }, [fetchChecklistConfig]);
  useEffect(() => { if (checklistConfig.length >= 0) fetchClosure(); }, [fetchClosure]);
  useEffect(() => { fetchPranzoData(); }, [fetchPranzoData]);

  // ── Save ──
  const handleSave = async () => {
    if (date > todayStr) {
      setMessage({ type: "error", text: "Non puoi inserire una chiusura in data futura." });
      return;
    }
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
      clearDraft();
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
          <h1 className="text-2xl font-bold text-indigo-900 font-playfair">
            🔔 Chiusura Turno
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
              <input type="date" value={date} max={todayStr} onChange={e => setDate(e.target.value)}
                className="w-full border border-neutral-300 rounded-xl px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-200" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-neutral-500 mb-1 uppercase tracking-wide">Turno</label>
              <div className="flex gap-2">
                {["pranzo", "cena"].map(t => (
                  <button key={t} type="button" onClick={() => setTurno(t)}
                    className={`flex-1 py-2.5 rounded-xl text-sm font-semibold border-2 transition ${
                      turno === t
                        ? t === "pranzo"
                          ? "bg-indigo-100 text-indigo-800 border-indigo-300"
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
            <div className="mt-3 text-xs text-indigo-600 font-medium">
              Chiusura esistente — le modifiche sovrascriveranno i dati salvati.
            </div>
          )}
        </div>

        {/* BANNER CENA CUMULATIVA */}
        {isCena && !loading && (
          <div className={`rounded-2xl p-4 border text-sm ${
            pranzoData
              ? "bg-indigo-50 border-indigo-200 text-indigo-800"
              : "bg-indigo-50 border-indigo-200 text-indigo-800"
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
              </h2>
              <div className="grid grid-cols-3 gap-4">
                <NumberField
                  label={isCena ? "Chiusura (giorno)" : "Chiusura Parziale"}
                  value={preconto} onChange={setPreconto} icon="🧾"
                  hint={cenaHint("preconto", preconto)} />
                <NumberField
                  label={isCena ? "Fatture Cena" : "Totale fatture"}
                  value={fatture} onChange={setFatture} icon="📄" />
                <div>
                  <label className="block text-xs font-semibold text-neutral-500 mb-1 uppercase tracking-wide">{isCena ? "🪑 Coperti Cena" : "🪑 Coperti"}</label>
                  <input type="number" min={0} value={coperti} onChange={e => setCoperti(e.target.value)}
                    className="w-full border border-neutral-300 rounded-xl px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-200" />
                </div>
              </div>
              {/* Riga pranzo read-only (solo a cena) */}
              {isCena && pranzoData && (
                <div className="mt-3 pt-3 border-t border-dashed border-neutral-200">
                  <div className="text-[10px] font-semibold text-indigo-500 uppercase tracking-wide mb-2">📋 Riferimento pranzo</div>
                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <label className="block text-[10px] font-semibold text-neutral-400 mb-1 uppercase tracking-wide">🧾 Chiusura pranzo</label>
                      <div className="w-full border border-neutral-200 bg-neutral-50 rounded-xl px-3 py-2.5 text-sm text-neutral-600 font-medium">
                        € {(pranzoData.preconto || 0).toLocaleString("it-IT", { minimumFractionDigits: 2 })}
                      </div>
                    </div>
                    <div>
                      <label className="block text-[10px] font-semibold text-neutral-400 mb-1 uppercase tracking-wide">📄 Fatture pranzo</label>
                      <div className="w-full border border-neutral-200 bg-neutral-50 rounded-xl px-3 py-2.5 text-sm text-neutral-600 font-medium">
                        € {(pranzoData.fatture || 0).toLocaleString("it-IT", { minimumFractionDigits: 2 })}
                      </div>
                    </div>
                    <div>
                      <label className="block text-[10px] font-semibold text-neutral-400 mb-1 uppercase tracking-wide">🪑 Coperti pranzo</label>
                      <div className="w-full border border-neutral-200 bg-neutral-50 rounded-xl px-3 py-2.5 text-sm text-neutral-600 font-medium">
                        {pranzoData.coperti || 0}
                      </div>
                    </div>
                  </div>
                </div>
              )}
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
                <NumberField label="Mance POS (statistico)" value={mance} onChange={setMance} icon="🤝"
                  hint={cenaHint("mance", mance)} />
                <p className="text-[9px] text-neutral-400 mt-0.5 ml-1">Non entra nei calcoli — solo dato statistico</p>
              </div>
            </div>

            {/* PRE-CONTI (tavoli aperti) — visibile a tutti */}
            <div className="bg-white rounded-2xl shadow p-5 border border-neutral-200">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-sm font-semibold text-neutral-700 uppercase tracking-wide">
                  🍽️ Pre-conti
                  <span className="text-neutral-400 font-normal normal-case ml-2 text-xs">contanti non battuti al registratore — devono risultare nei contanti</span>
                </h2>
                <button type="button"
                  onClick={() => setPreconti(prev => [...prev, { tavolo: "", importo: "" }])}
                  className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-indigo-50 text-indigo-700 border border-indigo-200 hover:bg-indigo-100 transition">
                  + Aggiungi tavolo
                </button>
              </div>

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
                          className="w-full border border-neutral-300 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-200" />
                      </div>
                      <div className="w-32">
                        <input type="text" inputMode="decimal" value={p.importo}
                          onChange={e => {
                            const updated = [...preconti];
                            updated[idx] = { ...updated[idx], importo: e.target.value };
                            setPreconti(updated);
                          }}
                          placeholder="0,00"
                          className="w-full border border-neutral-300 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-200 text-right" />
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
                        className="w-28 border border-neutral-300 rounded-xl px-2 py-2 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-indigo-200">
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
                          className="w-full border border-neutral-300 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-200" />
                      </div>
                      <div className="w-28">
                        <input type="text" inputMode="decimal" value={s.importo}
                          onChange={e => {
                            const updated = [...spese];
                            updated[idx] = { ...updated[idx], importo: e.target.value };
                            setSpese(updated);
                          }}
                          placeholder="0,00"
                          className="w-full border border-neutral-300 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-200 text-right" />
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

            {/* ═══════════ RIEPILOGO CALCOLATO (grigio, non modificabile) ═══════════ */}
            <div className="bg-neutral-100 rounded-2xl shadow-inner p-5 border-2 border-dashed border-neutral-300">
              <div className="flex items-center gap-2 mb-4">
                <span className="text-neutral-400 text-lg">🔒</span>
                <h2 className="text-sm font-semibold text-neutral-500 uppercase tracking-wide">
                  Riepilogo calcolato
                </h2>
                <span className="text-[10px] text-neutral-400 font-normal normal-case">
                  — valori calcolati automaticamente dai dati inseriti sopra
                </span>
              </div>

              {/* ── Breakdown cena: chiusura RT giorno → pranzo → parziale cena ── */}
              {isCena && pranzoData && (
                <div className="mb-4">
                  <div className="text-[10px] font-semibold text-neutral-400 uppercase mb-2">Chiusura RT — scomposizione</div>
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div className="bg-white/60 rounded-lg p-2.5 border border-neutral-200">
                      <div className="text-[10px] text-neutral-400 mb-0.5">RT giorno</div>
                      <div className="text-base font-bold text-neutral-600">€ {fmt(toNumber(preconto))}</div>
                    </div>
                    <div className="bg-white/60 rounded-lg p-2.5 border border-neutral-200">
                      <div className="text-[10px] text-indigo-500 mb-0.5">− Pranzo</div>
                      <div className="text-base font-bold text-indigo-700">€ {fmt(pranzoVal("preconto"))}</div>
                    </div>
                    <div className="bg-white/60 rounded-lg p-2.5 border border-neutral-200">
                      <div className="text-[10px] text-indigo-500 mb-0.5">= RT cena</div>
                      <div className="text-base font-bold text-indigo-700">€ {fmt(chiusuraRTParziale)}</div>
                    </div>
                  </div>
                </div>
              )}

              {/* ── Quadratura giornaliera ── */}
              <div className="text-[10px] font-semibold text-neutral-400 uppercase mb-2">
                Quadratura{isCena && pranzoData ? " giornaliera" : ""}
                <span className="normal-case font-normal ml-1">
                  entrate = chiusura RT + pre-conti + fatture − spese
                </span>
              </div>

              {/* Riga ENTRATE vs GIUSTIFICATO */}
              <div className="grid grid-cols-2 gap-3 mb-3">
                {/* ENTRATE */}
                <div className="bg-white/60 rounded-xl p-3 border border-neutral-200 text-center">
                  <div className="text-[10px] font-semibold text-neutral-500 uppercase mb-1">Totale Entrate</div>
                  <div className="text-xl font-bold text-neutral-700">€ {fmt(totaleEntrate)}</div>
                  <div className="text-[9px] text-neutral-400 mt-1">
                    incassi{isCena && pranzoData ? " (giornalieri)" : ""} + fondo in − fondo fine
                  </div>
                </div>
                {/* GIUSTIFICATO */}
                <div className="bg-white/60 rounded-xl p-3 border border-neutral-200 text-center">
                  <div className="text-[10px] font-semibold text-neutral-500 uppercase mb-1">Totale giustificato</div>
                  <div className="text-xl font-bold text-neutral-700">€ {fmt(totaleGiustificato)}</div>
                  <div className="text-[9px] text-neutral-400 mt-1">
                    chiusura RT
                    {(toNumber(fatture) + pranzoFatture) > 0 ? " + fatture" : ""}
                    {(totalePreconti + pranzoPrecontiTotale) > 0 ? " + pre-conti" : ""}
                    {isCena && pranzoData ? " (giorno)" : ""}
                  </div>
                </div>
              </div>

              {/* Dettaglio voci giustificato */}
              <div className="flex flex-wrap gap-2 mb-3">
                <div className="inline-flex items-center gap-1.5 bg-white/60 rounded-lg px-3 py-1.5 border border-neutral-200 text-xs">
                  <span className="text-neutral-400">🧾 Chiusura RT:</span>
                  <span className="font-semibold text-neutral-600">€ {fmt(toNumber(preconto))}</span>
                </div>
                {(toNumber(fatture) + pranzoFatture) > 0 && (
                  <div className="inline-flex items-center gap-1.5 bg-white/60 rounded-lg px-3 py-1.5 border border-blue-200 text-xs">
                    <span className="text-blue-400">📄 Fatture:</span>
                    <span className="font-semibold text-blue-600">€ {fmt(toNumber(fatture) + pranzoFatture)}</span>
                  </div>
                )}
                {isSuperAdmin && (totalePreconti + pranzoPrecontiTotale) > 0 && (
                  <div className="inline-flex items-center gap-1.5 bg-white/60 rounded-lg px-3 py-1.5 border border-orange-200 text-xs">
                    <span className="text-orange-400">🍽️ Pre-conti<span className="inline-block w-1.5 h-1.5 rounded-full bg-amber-400 ml-1 align-middle" />:</span>
                    <span className="font-semibold text-orange-600">€ {fmt(totalePreconti + pranzoPrecontiTotale)}</span>
                  </div>
                )}
              </div>

              {/* Differenza e Spese */}
              <div className="grid grid-cols-3 gap-2 mb-3">
                <div className="bg-white/60 rounded-lg p-2 border border-neutral-200 text-center">
                  <div className="text-[9px] text-neutral-400 font-semibold uppercase">Differenza</div>
                  <div className={`text-sm font-bold ${diffGrezzo < -0.5 ? "text-red-600" : diffGrezzo > 0.5 ? "text-indigo-600" : "text-neutral-600"}`}>
                    {diffGrezzo >= 0 ? "+" : ""}{fmt(diffGrezzo)} €
                  </div>
                </div>
                <div className="bg-purple-50/60 rounded-lg p-2 border border-purple-200 text-center">
                  <div className="text-[9px] text-purple-400 font-semibold uppercase">Spese</div>
                  <div className="text-sm font-bold text-purple-600">
                    {speseGiorno > 0 ? `+${fmt(speseGiorno)}` : fmt(speseGiorno)} €
                  </div>
                </div>
                <div className={`rounded-lg p-2 border text-center ${
                  diffStatus === "ok" ? "bg-emerald-50 border-emerald-200" :
                  diffStatus === "over" ? "bg-indigo-50 border-indigo-200" : "bg-red-50 border-red-200"
                }`}>
                  <div className="text-[9px] font-semibold uppercase opacity-70">Saldo</div>
                  <div className={`text-sm font-bold ${
                    diffStatus === "ok" ? "text-emerald-700" :
                    diffStatus === "over" ? "text-indigo-700" : "text-red-700"
                  }`}>
                    {diff >= 0 ? "+" : ""}{fmt(diff)} €
                  </div>
                </div>
              </div>

              {/* RISULTATO QUADRATURA */}
              <div className={`rounded-xl p-4 border-2 text-center ${
                diffStatus === "ok"
                  ? "bg-emerald-50 border-emerald-300"
                  : diffStatus === "over"
                    ? "bg-indigo-50 border-indigo-300"
                    : "bg-red-50 border-red-300"
              }`}>
                <div className="text-[10px] font-semibold uppercase mb-1 opacity-70">
                  {diffStatus === "ok" ? "✅ Quadratura OK" : "⚠️ Differenza da verificare"}
                </div>
                <div className={`text-2xl font-bold ${
                  diffStatus === "ok" ? "text-emerald-700" :
                  diffStatus === "over" ? "text-indigo-700" : "text-red-700"
                }`}>
                  {diff >= 0 ? "+" : ""}{fmt(diff)} €
                </div>
                {diffStatus !== "ok" && (
                  <div className="text-xs mt-2 opacity-70">
                    (entrate − giustificato) + spese ≠ 0
                  </div>
                )}
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
                className="w-full border border-neutral-300 rounded-xl px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-200 resize-none" />
            </div>

            {/* SALVA */}
            <button type="button" onClick={handleSave} disabled={saving}
              className={`w-full py-3.5 rounded-2xl text-white font-bold text-base shadow-lg transition ${
                saving ? "bg-neutral-400 cursor-not-allowed" :
                turno === "pranzo"
                  ? "bg-indigo-700 hover:bg-indigo-800 hover:-translate-y-0.5"
                  : "bg-indigo-700 hover:bg-indigo-800 hover:-translate-y-0.5"
              }`}>
              {saving ? "Salvataggio..." : `💾 Salva chiusura ${turno}`}
            </button>

            {message && (
              <div className={`rounded-xl px-4 py-3 text-sm font-semibold ${
                message.type === "ok" ? "bg-emerald-50 text-emerald-700 border border-emerald-200" :
                message.type === "info" ? "bg-blue-50 text-blue-700 border border-blue-200" :
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
        className="w-full border border-neutral-300 rounded-xl px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-200"
      />
      {hint && (
        <div className="mt-1 text-[10px] text-indigo-500 leading-tight">
          pranzo € {fmt(hint.pranzo)} → <span className={`font-semibold ${hint.parziale < 0 ? "text-red-500" : ""}`}>parz. cena € {fmt(hint.parziale)}</span>
        </div>
      )}
    </div>
  );
}
