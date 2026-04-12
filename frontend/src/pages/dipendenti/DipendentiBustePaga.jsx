// @version: v2.2-buste-paga
// Buste Paga: lista cedolini, inserimento manuale, upload PDF LUL 2-step (anteprima + conferma)
// v2.2: bottone WA accanto a PDF per condividere cedolino via WhatsApp (problemi.md C1)
import React, { useState, useEffect, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { API_BASE, apiFetch } from "../../config/api";
import Tooltip from "../../components/Tooltip";

const fmt = (n) => n != null ? Number(n).toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "\u2014";
const MESI = ["","Gennaio","Febbraio","Marzo","Aprile","Maggio","Giugno","Luglio","Agosto","Settembre","Ottobre","Novembre","Dicembre"];

export default function DipendentiBustePaga() {
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [dipendenti, setDipendenti] = useState([]);
  const [filtroAnno, setFiltroAnno] = useState(new Date().getFullYear());
  const [filtroDip, setFiltroDip] = useState("");

  // Upload PDF — flusso 2-step
  const [uploading, setUploading] = useState(false);
  const [pdfFile, setPdfFile] = useState(null);        // file selezionato (per re-invio conferma)
  const [anteprima, setAnteprima] = useState(null);     // risultato anteprima
  const [importResult, setImportResult] = useState(null); // risultato conferma finale
  const [selAbbinati, setSelAbbinati] = useState({});   // idx -> {selezionato, aggiorna_conflitti}
  const [selNuovi, setSelNuovi] = useState({});          // idx -> {selezionato}
  const fileInputRef = React.useRef(null);

  // Debug test
  const [testResult, setTestResult] = useState(null);
  const testInputRef = React.useRef(null);

  // Form manuale
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    dipendente_id: "", mese: new Date().getMonth() + 1, anno: new Date().getFullYear(),
    netto: "", lordo: "", contributi_inps: "", irpef: "",
    addizionali: "", tfr_maturato: "", ore_lavorate: "", ore_straordinario: "",
    note: "", genera_scadenza: true,
  });

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filtroAnno) params.set("anno", filtroAnno);
      if (filtroDip) params.set("dipendente_id", filtroDip);
      const [bpRes, dipRes] = await Promise.all([
        apiFetch(`${API_BASE}/dipendenti/buste-paga?${params}`),
        apiFetch(`${API_BASE}/dipendenti/?include_inactive=false`),
      ]);
      if (bpRes.ok) setData(await bpRes.json());
      if (dipRes.ok) {
        const d = await dipRes.json();
        setDipendenti(Array.isArray(d) ? d : d.dipendenti || []);
      }
    } catch (e) {
      console.error("Errore:", e);
    } finally {
      setLoading(false);
    }
  }, [filtroAnno, filtroDip]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const buste = data?.buste_paga || [];
  const rig = data?.riepilogo || {};

  const resetForm = () => {
    setForm({
      dipendente_id: "", mese: new Date().getMonth() + 1, anno: new Date().getFullYear(),
      netto: "", lordo: "", contributi_inps: "", irpef: "",
      addizionali: "", tfr_maturato: "", ore_lavorate: "", ore_straordinario: "",
      note: "", genera_scadenza: true,
    });
  };

  const handleSave = async () => {
    if (!form.dipendente_id || !form.netto) return;
    setSaving(true);
    try {
      const body = {
        dipendente_id: Number(form.dipendente_id),
        mese: Number(form.mese),
        anno: Number(form.anno),
        netto: Number(form.netto),
        genera_scadenza: form.genera_scadenza,
      };
      ["lordo", "contributi_inps", "irpef", "addizionali", "tfr_maturato", "ore_lavorate", "ore_straordinario"].forEach(k => {
        if (form[k] !== "" && form[k] != null) body[k] = Number(form[k]);
      });
      if (form.note) body.note = form.note;

      const res = await apiFetch(`${API_BASE}/dipendenti/buste-paga`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        const json = await res.json();
        if (json.ok) {
          setShowForm(false);
          resetForm();
          fetchData();
        } else {
          alert(json.error || "Errore");
        }
      }
    } catch (e) {
      console.error(e);
      alert("Errore di rete");
    } finally {
      setSaving(false);
    }
  };

  // ── WA: normalizza telefono e apre wa.me con messaggio precompilato ──
  // Il file PDF non puo' essere allegato via URL: viene scaricato in locale e
  // l'utente deve poi trascinarlo/allegarlo nel thread WA che si e' aperto.
  const normalizePhoneForWA = (raw) => {
    if (!raw) return null;
    // Rimuovi tutto eccetto cifre e +
    let s = String(raw).replace(/[^\d+]/g, "");
    if (!s) return null;
    if (s.startsWith("+")) s = s.slice(1);
    // Se non ha prefisso internazionale e comincia con 3 (cellulare IT) o 0 (fisso), aggiungi 39
    if (s.length <= 10 && /^[03]/.test(s)) s = "39" + s.replace(/^0/, "");
    return s;
  };

  const handleShareWA = async (b) => {
    const phone = normalizePhoneForWA(b.telefono);
    if (!phone) {
      alert(`Nessun numero di telefono in anagrafica per ${b.cognome} ${b.nome}. Inseriscilo in Dipendenti → Anagrafica.`);
      return;
    }
    const periodo = `${MESI[b.mese] || b.mese}/${b.anno}`;
    const testo =
      `Ciao ${b.nome || ""}, ecco la tua busta paga di ${periodo}.\n` +
      `Netto: € ${fmt(b.netto)}.\n` +
      `(Il PDF e' stato scaricato sul mio PC, te lo allego qui.)`;
    // Se c'e' il PDF, lo scarica in locale cosi' Marco puo' allegarlo al thread WA
    if (b.pdf_path) {
      try {
        const token = localStorage.getItem("token");
        const res = await fetch(`${API_BASE}/dipendenti/buste-paga/${b.id}/pdf`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        if (res.ok) {
          const blob = await res.blob();
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = `bustapaga_${(b.cognome || "").toLowerCase()}_${(b.nome || "").toLowerCase()}_${b.anno}-${String(b.mese).padStart(2, "0")}.pdf`;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          setTimeout(() => URL.revokeObjectURL(url), 5000);
        }
      } catch (err) {
        console.error("Errore download PDF per WA:", err);
      }
    }
    // Apre WhatsApp Web / app con testo precompilato
    const waUrl = `https://wa.me/${phone}?text=${encodeURIComponent(testo)}`;
    window.open(waUrl, "_blank", "noopener,noreferrer");
  };

  // ── STEP 1: Upload → Anteprima ──
  const handleUploadPDF = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".pdf")) {
      alert("Seleziona un file PDF");
      return;
    }
    setUploading(true);
    setAnteprima(null);
    setImportResult(null);
    setPdfFile(file);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const token = localStorage.getItem("token");
      const res = await fetch(`${API_BASE}/dipendenti/buste-paga/anteprima-pdf`, {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: formData,
      });
      const json = await res.json();
      if (res.ok && json.ok) {
        setAnteprima(json);
        // Inizializza selezione: tutti selezionati
        const selA = {};
        (json.abbinati || []).forEach(c => { selA[c.idx] = { selezionato: true, aggiorna_conflitti: true }; });
        setSelAbbinati(selA);
        const selN = {};
        (json.nuovi || []).forEach(c => { selN[c.idx] = { selezionato: true }; });
        setSelNuovi(selN);
      } else {
        alert(json.detail || json.error || "Errore analisi PDF");
      }
    } catch (err) {
      console.error(err);
      alert("Errore di rete durante l'upload");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  // ── STEP 2: Conferma Import ──
  const handleConfermaImport = async () => {
    if (!pdfFile) return;
    setUploading(true);
    try {
      const selezione = {
        abbinati: Object.entries(selAbbinati).map(([idx, s]) => ({
          idx: Number(idx), selezionato: s.selezionato, aggiorna_conflitti: s.aggiorna_conflitti,
        })),
        nuovi: Object.entries(selNuovi).map(([idx, s]) => ({
          idx: Number(idx), selezionato: s.selezionato,
        })),
      };

      const formData = new FormData();
      formData.append("file", pdfFile);
      const token = localStorage.getItem("token");
      const url = new URL(`${API_BASE}/dipendenti/buste-paga/conferma-import`);
      url.searchParams.set("selezione", JSON.stringify(selezione));
      url.searchParams.set("genera_scadenze", "true");

      const res = await fetch(url.toString(), {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: formData,
      });
      const json = await res.json();
      if (res.ok && json.ok) {
        setImportResult(json);
        setAnteprima(null);
        setPdfFile(null);
        fetchData();
      } else {
        alert(json.detail || json.error || "Errore import");
      }
    } catch (err) {
      console.error(err);
      alert("Errore di rete durante la conferma");
    } finally {
      setUploading(false);
    }
  };

  const handleTestPDF = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setTestResult(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const token = localStorage.getItem("token");
      const res = await fetch(`${API_BASE}/dipendenti/buste-paga/test-pdf`, {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: formData,
      });
      const json = await res.json();
      setTestResult(json);
    } catch (err) {
      console.error(err);
      alert("Errore test PDF");
    } finally {
      setUploading(false);
      if (testInputRef.current) testInputRef.current.value = "";
    }
  };

  const handleDelete = async (id) => {
    if (!confirm("Eliminare questo cedolino?")) return;
    await apiFetch(`${API_BASE}/dipendenti/buste-paga/${id}`, { method: "DELETE" });
    fetchData();
  };

  // Helpers selezione
  const toggleAbbinato = (idx) => {
    setSelAbbinati(prev => ({
      ...prev, [idx]: { ...prev[idx], selezionato: !prev[idx]?.selezionato },
    }));
  };
  const toggleNuovo = (idx) => {
    setSelNuovi(prev => ({
      ...prev, [idx]: { ...prev[idx], selezionato: !prev[idx]?.selezionato },
    }));
  };
  const toggleConflitti = (idx) => {
    setSelAbbinati(prev => ({
      ...prev, [idx]: { ...prev[idx], aggiorna_conflitti: !prev[idx]?.aggiorna_conflitti },
    }));
  };

  // Conteggi per il bottone conferma
  const countSelAbbinati = Object.values(selAbbinati).filter(s => s.selezionato).length;
  const countSelNuovi = Object.values(selNuovi).filter(s => s.selezionato).length;
  const countTotale = countSelAbbinati + countSelNuovi;

  // Anni disponibili
  const currentYear = new Date().getFullYear();
  const anni = [currentYear, currentYear - 1, currentYear - 2];

  // Raggruppa per mese
  const perMese = useMemo(() => {
    const map = {};
    buste.forEach(b => {
      const key = `${b.anno}-${String(b.mese).padStart(2, "0")}`;
      if (!map[key]) map[key] = { mese: b.mese, anno: b.anno, label: b.mese_label, buste: [], totNetto: 0, totLordo: 0 };
      map[key].buste.push(b);
      map[key].totNetto += b.netto || 0;
      map[key].totLordo += b.lordo || 0;
    });
    return Object.values(map).sort((a, b) => b.anno - a.anno || b.mese - a.mese);
  }, [buste]);

  return (
    <div className="min-h-screen bg-brand-cream">
      {/* HEADER */}
      <div className="bg-white border-b border-neutral-200 px-4 py-2.5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate("/dipendenti")}
            className="text-neutral-400 hover:text-neutral-600 text-sm">{"\u2190"}</button>
          <h1 className="text-lg font-bold text-purple-900 font-playfair">{"\uD83D\uDCCB"} Buste Paga</h1>
          <span className="text-[10px] text-neutral-400">{buste.length} cedolini</span>
        </div>
        <div className="flex items-center gap-2">
          <input ref={fileInputRef} type="file" accept=".pdf" onChange={handleUploadPDF}
            className="hidden" />
          <button onClick={() => fileInputRef.current?.click()} disabled={uploading}
            className="px-3 py-1.5 rounded-lg bg-purple-600 text-white text-xs font-semibold hover:bg-purple-700 disabled:opacity-50 flex items-center gap-1.5">
            {uploading ? (
              <><span className="animate-spin inline-block w-3 h-3 border-2 border-white border-t-transparent rounded-full"></span> Analizzando...</>
            ) : (
              <>{"\uD83D\uDCC4"} Import PDF LUL</>
            )}
          </button>
          <button onClick={() => { resetForm(); setShowForm(true); }}
            className="px-3 py-1.5 rounded-lg border border-purple-300 text-purple-700 text-xs font-semibold hover:bg-purple-50">
            + Inserisci Manuale
          </button>
          <input ref={testInputRef} type="file" accept=".pdf" onChange={handleTestPDF} className="hidden" />
          <Tooltip label="Debug: testa cosa estrae il parser dal PDF senza importare">
            <button onClick={() => testInputRef.current?.click()} disabled={uploading}
              className="px-2 py-1 rounded border border-neutral-300 text-neutral-500 text-[10px] hover:bg-neutral-100 disabled:opacity-50">
              {"\uD83D\uDD0D"} Test PDF
            </button>
          </Tooltip>
        </div>
      </div>

      {/* KPI + FILTRI */}
      <div className="px-4 py-3 flex items-center gap-4 bg-white border-b border-neutral-100 flex-wrap">
        <div className="flex items-center gap-2">
          <label className="text-[10px] text-neutral-500 font-semibold">Anno:</label>
          <select value={filtroAnno} onChange={e => setFiltroAnno(e.target.value)}
            className="border border-neutral-300 rounded-lg px-2 py-1 text-xs">
            {anni.map(a => <option key={a} value={a}>{a}</option>)}
          </select>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-[10px] text-neutral-500 font-semibold">Dipendente:</label>
          <select value={filtroDip} onChange={e => setFiltroDip(e.target.value)}
            className="border border-neutral-300 rounded-lg px-2 py-1 text-xs">
            <option value="">Tutti</option>
            {dipendenti.map(d => <option key={d.id} value={d.id}>{d.cognome} {d.nome}</option>)}
          </select>
        </div>
        <div className="ml-auto flex items-center gap-4 text-xs">
          <span className="text-neutral-500">Netto tot: <span className="font-bold text-purple-800">{"\u20AC"} {fmt(rig.totale_netto)}</span></span>
          <span className="text-neutral-500">Lordo tot: <span className="font-bold text-neutral-800">{"\u20AC"} {fmt(rig.totale_lordo)}</span></span>
        </div>
      </div>

      {/* ════════════════════════════════════════════════════════════
          ANTEPRIMA PDF — Step 1: mostra cosa verra' importato
          ════════════════════════════════════════════════════════════ */}
      {anteprima && (
        <div className="mx-4 mt-3 bg-white rounded-xl border border-purple-200 shadow-lg p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-bold text-purple-900">{"\uD83D\uDCC4"} Anteprima Import PDF</h3>
            <button onClick={() => { setAnteprima(null); setPdfFile(null); }}
              className="text-neutral-400 hover:text-neutral-600 text-lg">{"\u00D7"}</button>
          </div>

          <div className="flex gap-4 text-xs mb-4">
            <span className="text-neutral-500">Cedolini nel PDF: <strong>{anteprima.totale_cedolini}</strong></span>
            <span className="text-emerald-700 font-medium">{"\u2713"} Abbinati: {anteprima.abbinati?.length || 0}</span>
            <span className="text-purple-700 font-medium">{"\u2795"} Nuovi dipendenti: {anteprima.nuovi?.length || 0}</span>
          </div>

          {/* ABBINATI — dipendenti gia' in anagrafica */}
          {anteprima.abbinati?.length > 0 && (
            <div className="mb-4">
              <p className="text-[10px] text-emerald-700 font-semibold uppercase mb-2">
                {"\u2705"} Dipendenti trovati in anagrafica
              </p>
              <div className="space-y-1.5">
                {anteprima.abbinati.map(c => {
                  const sel = selAbbinati[c.idx];
                  const hasConflitti = c.conflitti?.length > 0;
                  return (
                    <div key={c.idx} className={`rounded-lg border p-3 text-xs transition ${
                      sel?.selezionato ? "bg-emerald-50 border-emerald-200" : "bg-neutral-50 border-neutral-200 opacity-60"
                    }`}>
                      <div className="flex items-center gap-3">
                        <input type="checkbox" checked={!!sel?.selezionato}
                          onChange={() => toggleAbbinato(c.idx)}
                          className="rounded border-neutral-300 text-purple-600" />
                        <span className="font-medium text-neutral-800">{c.cognome_nome}</span>
                        <span className="text-neutral-400">{MESI[c.mese]} {c.anno}</span>
                        <span className="font-mono text-purple-700 font-semibold">{"\u20AC"} {fmt(c.netto)}</span>
                        {c.lordo && <span className="text-neutral-500">lordo {"\u20AC"} {fmt(c.lordo)}</span>}
                        <span className={`ml-auto text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
                          c.azione === "aggiorna"
                            ? "bg-amber-100 text-amber-700 border border-amber-200"
                            : "bg-emerald-100 text-emerald-700 border border-emerald-200"
                        }`}>
                          {c.azione === "aggiorna" ? "aggiorna esistente" : "nuovo cedolino"}
                        </span>
                      </div>

                      {/* CONFLITTI */}
                      {hasConflitti && sel?.selezionato && (
                        <div className="mt-2 ml-6 bg-amber-50 rounded-lg border border-amber-200 p-2.5">
                          <div className="flex items-center gap-2 mb-1.5">
                            <span className="text-[10px] text-amber-800 font-semibold uppercase">{"\u26A0\uFE0F"} Dati diversi tra anagrafica e PDF</span>
                            <label className="flex items-center gap-1 text-[10px] text-amber-700 ml-auto">
                              <input type="checkbox" checked={!!sel?.aggiorna_conflitti}
                                onChange={() => toggleConflitti(c.idx)}
                                className="rounded border-amber-300 text-amber-600 w-3 h-3" />
                              Aggiorna anagrafica
                            </label>
                          </div>
                          <table className="w-full text-[11px]">
                            <thead>
                              <tr className="text-[9px] text-amber-600 uppercase">
                                <th className="text-left py-0.5 pr-3">Campo</th>
                                <th className="text-left py-0.5 pr-3">Anagrafica attuale</th>
                                <th className="text-left py-0.5">{"\u2192"} PDF</th>
                              </tr>
                            </thead>
                            <tbody>
                              {c.conflitti.map((cf, ci) => (
                                <tr key={ci} className="border-t border-amber-100">
                                  <td className="py-1 pr-3 font-medium text-amber-800">{cf.campo}</td>
                                  <td className="py-1 pr-3 text-neutral-600 line-through">{cf.valore_attuale}</td>
                                  <td className="py-1 font-medium text-amber-900">{cf.valore_pdf}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* NUOVI — dipendenti da creare */}
          {anteprima.nuovi?.length > 0 && (
            <div className="mb-4">
              <p className="text-[10px] text-purple-700 font-semibold uppercase mb-2">
                {"\u2795"} Nuovi dipendenti (verranno creati in Anagrafica)
              </p>
              <div className="space-y-1.5">
                {anteprima.nuovi.map(c => {
                  const sel = selNuovi[c.idx];
                  return (
                    <div key={c.idx} className={`rounded-lg border p-3 text-xs transition ${
                      sel?.selezionato ? "bg-purple-50 border-purple-200" : "bg-neutral-50 border-neutral-200 opacity-60"
                    }`}>
                      <div className="flex items-center gap-3">
                        <input type="checkbox" checked={!!sel?.selezionato}
                          onChange={() => toggleNuovo(c.idx)}
                          className="rounded border-neutral-300 text-purple-600" />
                        <span className="font-medium text-neutral-800">{c.cognome_nome}</span>
                        <span className="text-neutral-400">{MESI[c.mese]} {c.anno}</span>
                        <span className="font-mono text-purple-700 font-semibold">{"\u20AC"} {fmt(c.netto)}</span>
                        {c.codice_fiscale && <span className="text-neutral-400 font-mono text-[10px]">{c.codice_fiscale}</span>}
                        <span className="ml-auto text-[10px] px-1.5 py-0.5 rounded-full font-medium bg-purple-100 text-purple-700 border border-purple-200">
                          nuovo dipendente
                        </span>
                      </div>
                      {sel?.selezionato && (
                        <div className="mt-1.5 ml-6 text-[10px] text-neutral-500">
                          Verrà creato: <strong>{c.nuovo_cognome} {c.nuovo_nome}</strong>
                          {c.qualifica && <> — {c.qualifica}</>}
                          {c.livello && <> — Liv. {c.livello}</>}
                          {c.iban && <> — IBAN: ...{c.iban.slice(-4)}</>}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* BOTTONI CONFERMA / ANNULLA */}
          <div className="flex items-center gap-3 pt-3 border-t border-purple-100">
            <button onClick={handleConfermaImport} disabled={uploading || countTotale === 0}
              className="px-4 py-2 rounded-xl bg-purple-700 text-white text-sm font-semibold hover:bg-purple-800 disabled:opacity-50 flex items-center gap-2">
              {uploading ? (
                <><span className="animate-spin inline-block w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full"></span> Importando...</>
              ) : (
                <>{"\u2705"} Conferma Import ({countTotale} cedolini)</>
              )}
            </button>
            <button onClick={() => { setAnteprima(null); setPdfFile(null); }}
              className="px-4 py-2 rounded-xl border border-neutral-300 text-sm text-neutral-700 hover:bg-neutral-100">
              Annulla
            </button>
            <span className="text-[10px] text-neutral-400 ml-auto">
              {countSelAbbinati} abbinati + {countSelNuovi} nuovi selezionati
            </span>
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════
          RISULTATO IMPORT — dopo conferma
          ════════════════════════════════════════════════════════════ */}
      {importResult && (
        <div className="mx-4 mt-3 bg-white rounded-xl border border-emerald-200 shadow-lg p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-bold text-emerald-900">{"\u2705"} Import Completato</h3>
            <button onClick={() => setImportResult(null)} className="text-neutral-400 hover:text-neutral-600 text-lg">{"\u00D7"}</button>
          </div>
          <div className="flex gap-4 text-xs mb-3">
            <span className="text-emerald-700 font-medium">{"\u2713"} Importati: {importResult.importati?.length || 0}</span>
            {importResult.dipendenti_creati?.length > 0 && (
              <span className="text-purple-700 font-medium">{"\u2795"} Dipendenti creati: {importResult.dipendenti_creati.length}</span>
            )}
            {importResult.errori?.length > 0 && (
              <span className="text-red-700 font-medium">{"\u2717"} Errori: {importResult.errori.length}</span>
            )}
          </div>

          {importResult.importati?.length > 0 && (
            <div className="mb-2">
              <div className="grid grid-cols-2 md:grid-cols-3 gap-1">
                {importResult.importati.map((r, i) => (
                  <div key={i} className="text-xs bg-emerald-50 rounded px-2 py-1 flex justify-between items-center">
                    <span className="text-emerald-800">{r.cognome_nome}</span>
                    <div className="flex items-center gap-1.5">
                      <span className="font-mono text-emerald-700">{"\u20AC"} {fmt(r.netto)}</span>
                      {r.azione && (
                        <span className={`text-[9px] px-1 rounded ${
                          r.azione.includes("nuovo") ? "bg-purple-100 text-purple-600" : "bg-emerald-100 text-emerald-600"
                        }`}>{r.azione}</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {importResult.errori?.length > 0 && (
            <div>
              <p className="text-[10px] text-red-700 font-semibold uppercase mb-1">Errori</p>
              {importResult.errori.map((r, i) => (
                <div key={i} className="text-xs text-red-700 bg-red-50 rounded px-2 py-1 mb-1">
                  {r.cognome_nome}: {r.errore}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* DEBUG TEST PDF */}
      {testResult && (
        <div className="mx-4 mt-3 bg-white rounded-xl border border-neutral-300 shadow-lg p-4 text-xs">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-bold text-neutral-800">{"\uD83D\uDD0D"} Debug Parser PDF</h3>
            <button onClick={() => setTestResult(null)} className="text-neutral-400 hover:text-neutral-600 text-lg">{"\u00D7"}</button>
          </div>
          <div className="flex gap-4 mb-3 text-xs">
            <span>pdfplumber: <strong>{testResult.pdfplumber_version}</strong></span>
            <span>Pagine: <strong>{testResult.totale_pagine}</strong></span>
            <span>Cedolini trovati: <strong className={testResult.cedolini_trovati > 1 ? "text-emerald-700" : "text-red-700"}>{testResult.cedolini_trovati}</strong></span>
          </div>
          <div className="mb-3">
            <p className="font-bold text-neutral-600 uppercase text-[10px] mb-1">Analisi pagine</p>
            <div className="max-h-48 overflow-y-auto border border-neutral-200 rounded">
              <table className="w-full text-[11px]">
                <thead><tr className="bg-neutral-50 border-b">
                  <th className="px-2 py-1 text-left">Pag</th>
                  <th className="px-2 py-1 text-center">Chars</th>
                  <th className="px-2 py-1 text-center">Mensilita</th>
                  <th className="px-2 py-1 text-center">Cognome</th>
                  <th className="px-2 py-1 text-center">Netto</th>
                  <th className="px-2 py-1 text-center">Totali</th>
                  <th className="px-2 py-1 text-left">Inizio testo</th>
                </tr></thead>
                <tbody>
                  {testResult.pagine?.map(p => (
                    <tr key={p.pagina} className="border-b border-neutral-100">
                      <td className="px-2 py-1 font-mono">{p.pagina}</td>
                      <td className="px-2 py-1 text-center font-mono">{p.chars}</td>
                      <td className="px-2 py-1 text-center">{p.has_mensilita ? "\u2705" : "\u274C"}</td>
                      <td className="px-2 py-1 text-center">{p.has_cognome_nome ? "\u2705" : "\u274C"}</td>
                      <td className="px-2 py-1 text-center">{p.has_netto_busta ? "\u2705" : "\u274C"}</td>
                      <td className="px-2 py-1 text-center">{p.has_totali ? "\u2705" : "\u274C"}</td>
                      <td className="px-2 py-1 text-neutral-500 truncate max-w-[200px]">{p.first_100_chars}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          {testResult.cedolini?.length > 0 && (
            <div>
              <p className="font-bold text-neutral-600 uppercase text-[10px] mb-1">Cedolini estratti</p>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-1">
                {testResult.cedolini.map((c, i) => (
                  <div key={i} className="bg-neutral-50 rounded px-2 py-1 border border-neutral-200">
                    <span className="font-medium">{c.cognome_nome}</span>
                    <span className="ml-1 text-neutral-500">{c.mese}/{c.anno}</span>
                    <span className="ml-1 font-mono">{c.netto != null ? `\u20AC${c.netto}` : "\u2014"}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* FORM INSERIMENTO MANUALE */}
      {showForm && (
        <div className="mx-4 mt-3 bg-white rounded-xl border border-purple-200 shadow-lg p-5">
          <h3 className="text-sm font-bold text-purple-900 mb-3">Inserisci Cedolino</h3>
          <p className="text-[10px] text-neutral-500 mb-3">
            Inserisci i dati manualmente oppure usa il pulsante "Import PDF LUL" per importare dal file del consulente.
          </p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="md:col-span-2">
              <label className="text-[10px] text-neutral-500 block mb-0.5">Dipendente *</label>
              <select value={form.dipendente_id} onChange={e => setForm({ ...form, dipendente_id: e.target.value })}
                className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-sm">
                <option value="">Seleziona...</option>
                {dipendenti.map(d => <option key={d.id} value={d.id}>{d.cognome} {d.nome}</option>)}
              </select>
            </div>
            <div>
              <label className="text-[10px] text-neutral-500 block mb-0.5">Mese *</label>
              <select value={form.mese} onChange={e => setForm({ ...form, mese: e.target.value })}
                className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-sm">
                {MESI.slice(1).map((m, i) => <option key={i + 1} value={i + 1}>{m}</option>)}
              </select>
            </div>
            <div>
              <label className="text-[10px] text-neutral-500 block mb-0.5">Anno *</label>
              <input type="number" value={form.anno} onChange={e => setForm({ ...form, anno: e.target.value })}
                className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-sm" />
            </div>
            <div>
              <label className="text-[10px] text-neutral-500 block mb-0.5">Netto * ({"\u20AC"})</label>
              <input type="number" step="0.01" value={form.netto} onChange={e => setForm({ ...form, netto: e.target.value })}
                placeholder="1200.00" className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-sm" />
            </div>
            <div>
              <label className="text-[10px] text-neutral-500 block mb-0.5">Lordo ({"\u20AC"})</label>
              <input type="number" step="0.01" value={form.lordo} onChange={e => setForm({ ...form, lordo: e.target.value })}
                className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-sm" />
            </div>
            <div>
              <label className="text-[10px] text-neutral-500 block mb-0.5">INPS ({"\u20AC"})</label>
              <input type="number" step="0.01" value={form.contributi_inps} onChange={e => setForm({ ...form, contributi_inps: e.target.value })}
                className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-sm" />
            </div>
            <div>
              <label className="text-[10px] text-neutral-500 block mb-0.5">IRPEF ({"\u20AC"})</label>
              <input type="number" step="0.01" value={form.irpef} onChange={e => setForm({ ...form, irpef: e.target.value })}
                className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-sm" />
            </div>
            <div>
              <label className="text-[10px] text-neutral-500 block mb-0.5">Addizionali ({"\u20AC"})</label>
              <input type="number" step="0.01" value={form.addizionali} onChange={e => setForm({ ...form, addizionali: e.target.value })}
                className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-sm" />
            </div>
            <div>
              <label className="text-[10px] text-neutral-500 block mb-0.5">TFR maturato ({"\u20AC"})</label>
              <input type="number" step="0.01" value={form.tfr_maturato} onChange={e => setForm({ ...form, tfr_maturato: e.target.value })}
                className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-sm" />
            </div>
            <div>
              <label className="text-[10px] text-neutral-500 block mb-0.5">Ore lavorate</label>
              <input type="number" step="0.5" value={form.ore_lavorate} onChange={e => setForm({ ...form, ore_lavorate: e.target.value })}
                className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-sm" />
            </div>
            <div>
              <label className="text-[10px] text-neutral-500 block mb-0.5">Ore straordinario</label>
              <input type="number" step="0.5" value={form.ore_straordinario} onChange={e => setForm({ ...form, ore_straordinario: e.target.value })}
                className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-sm" />
            </div>
          </div>
          <div className="mt-3 flex items-center gap-4">
            <label className="flex items-center gap-2 text-xs text-neutral-700">
              <input type="checkbox" checked={form.genera_scadenza}
                onChange={e => setForm({ ...form, genera_scadenza: e.target.checked })}
                className="rounded border-neutral-300 text-purple-600" />
              Genera scadenza nello Scadenzario (netto da pagare al dipendente)
            </label>
          </div>
          <div className="flex gap-2 mt-3">
            <button onClick={handleSave} disabled={saving || !form.dipendente_id || !form.netto}
              className="px-4 py-2 rounded-lg bg-purple-600 text-white text-sm font-medium hover:bg-purple-700 disabled:opacity-50">
              {saving ? "Salvataggio..." : "Salva cedolino"}
            </button>
            <button onClick={() => { setShowForm(false); resetForm(); }}
              className="px-4 py-2 rounded-lg border border-neutral-300 text-neutral-600 text-sm hover:bg-neutral-50">
              Annulla
            </button>
          </div>
        </div>
      )}

      {/* LISTA PER MESE */}
      <div className="px-4 py-3">
        {loading ? (
          <div className="text-center py-12 text-neutral-400">Caricamento...</div>
        ) : perMese.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-neutral-400 text-sm">Nessun cedolino per {filtroAnno}.</p>
            <button onClick={() => { resetForm(); setShowForm(true); }}
              className="mt-3 px-4 py-2 rounded-lg bg-purple-100 text-purple-700 text-sm font-medium hover:bg-purple-200">
              + Inserisci il primo cedolino
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            {perMese.map(gruppo => (
              <div key={`${gruppo.anno}-${gruppo.mese}`}
                className="bg-white rounded-xl border border-neutral-200 shadow-sm overflow-hidden">
                <div className="px-4 py-2.5 bg-purple-50 border-b border-purple-100 flex items-center justify-between">
                  <h3 className="text-sm font-bold text-purple-900">{gruppo.label} {gruppo.anno}</h3>
                  <div className="flex items-center gap-4 text-xs">
                    <span className="text-neutral-500">Netto: <span className="font-bold text-purple-700">{"\u20AC"} {fmt(gruppo.totNetto)}</span></span>
                    {gruppo.totLordo > 0 && (
                      <span className="text-neutral-500">Lordo: <span className="font-semibold">{"\u20AC"} {fmt(gruppo.totLordo)}</span></span>
                    )}
                    <span className="text-neutral-400">{gruppo.buste.length} cedolin{gruppo.buste.length === 1 ? "o" : "i"}</span>
                  </div>
                </div>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-[9px] text-neutral-500 uppercase border-b border-neutral-100">
                      <th className="px-4 py-1.5 text-left">Dipendente</th>
                      <th className="px-4 py-1.5 text-right">Netto</th>
                      <th className="px-4 py-1.5 text-right">Lordo</th>
                      <th className="px-4 py-1.5 text-right">INPS</th>
                      <th className="px-4 py-1.5 text-right">IRPEF</th>
                      <th className="px-4 py-1.5 text-right">TFR</th>
                      <th className="px-4 py-1.5 text-center">Ore</th>
                      <th className="px-4 py-1.5 text-center">Stato</th>
                      <th className="px-4 py-1.5 text-center w-28">Azioni</th>
                    </tr>
                  </thead>
                  <tbody>
                    {gruppo.buste.map(b => (
                      <tr key={b.id} className="border-b border-neutral-50 hover:bg-neutral-50">
                        <td className="px-4 py-2">
                          <span className="font-medium text-neutral-800">{b.cognome} {b.nome}</span>
                          <span className="ml-1 text-[10px] text-neutral-400">{b.ruolo}</span>
                          {b.fonte === "PDF" && (
                            b.pdf_path ? (
                              <Tooltip label="Apri PDF cedolino">
                                <a href={`${API_BASE}/dipendenti/buste-paga/${b.id}/pdf`}
                                  target="_blank" rel="noopener noreferrer"
                                  onClick={e => {
                                    e.preventDefault();
                                    const token = localStorage.getItem("token");
                                    fetch(`${API_BASE}/dipendenti/buste-paga/${b.id}/pdf`, {
                                      headers: token ? { Authorization: `Bearer ${token}` } : {},
                                    }).then(r => r.blob()).then(blob => {
                                      const url = URL.createObjectURL(blob);
                                      window.open(url, "_blank");
                                    });
                                  }}
                                  className="ml-1 text-[9px] bg-violet-100 text-violet-600 px-1 rounded font-mono hover:bg-violet-200 cursor-pointer">
                                  {"\uD83D\uDCC4"} PDF
                                </a>
                              </Tooltip>
                            ) : (
                              <span className="ml-1 text-[9px] bg-violet-100 text-violet-600 px-1 rounded font-mono">PDF</span>
                            )
                          )}
                        </td>
                        <td className="px-4 py-2 text-right font-semibold text-purple-800">{"\u20AC"} {fmt(b.netto)}</td>
                        <td className="px-4 py-2 text-right text-neutral-600">{b.lordo ? `\u20AC ${fmt(b.lordo)}` : "\u2014"}</td>
                        <td className="px-4 py-2 text-right text-neutral-500 text-xs">{b.contributi_inps ? fmt(b.contributi_inps) : "\u2014"}</td>
                        <td className="px-4 py-2 text-right text-neutral-500 text-xs">{b.irpef ? fmt(b.irpef) : "\u2014"}</td>
                        <td className="px-4 py-2 text-right text-neutral-500 text-xs">{b.tfr_maturato ? fmt(b.tfr_maturato) : "\u2014"}</td>
                        <td className="px-4 py-2 text-center text-xs text-neutral-500">
                          {b.ore_lavorate ? `${b.ore_lavorate}h` : "\u2014"}
                          {b.ore_straordinario ? ` +${b.ore_straordinario}` : ""}
                        </td>
                        <td className="px-4 py-2 text-center">
                          <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
                            b.stato === "PAGATO" ? "bg-emerald-100 text-emerald-700" :
                            b.stato === "VERIFICATO" ? "bg-purple-100 text-purple-700" :
                            "bg-neutral-100 text-neutral-600"
                          }`}>
                            {b.stato}
                          </span>
                          {b.uscita_netto_id && (
                            <Tooltip label="Scadenza generata">
                              <span className="ml-1 text-[9px] text-violet-500">{"\u2192"} CG</span>
                            </Tooltip>
                          )}
                        </td>
                        <td className="px-4 py-2 text-center">
                          <div className="inline-flex items-center gap-1">
                            <Tooltip label={b.telefono
                                ? `Condividi busta paga via WhatsApp (${b.telefono})`
                                : "Numero di telefono non presente in anagrafica"}>
                              <button
                                onClick={() => handleShareWA(b)}
                                disabled={!b.telefono}
                                className={`text-[10px] px-1.5 py-0.5 rounded font-semibold ${
                                  b.telefono
                                    ? "bg-emerald-100 text-emerald-700 hover:bg-emerald-200"
                                    : "bg-neutral-100 text-neutral-400 cursor-not-allowed"
                                }`}>
                                WA
                              </button>
                            </Tooltip>
                            <Tooltip label="Elimina cedolino">
                              <button onClick={() => handleDelete(b.id)}
                                className="text-[10px] px-1.5 py-0.5 rounded bg-red-100 text-red-700 hover:bg-red-200">
                                {"\u2715"}
                              </button>
                            </Tooltip>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
