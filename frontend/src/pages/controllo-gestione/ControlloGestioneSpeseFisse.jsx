// @version: v2.0-wizard-spese-fisse
// Spese Fisse — wizard guidati per Affitti, Prestiti, Assicurazioni + template Tasse + Rateizzazione fatture
import React, { useState, useEffect, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { API_BASE, apiFetch } from "../../config/api";

const CG = `${API_BASE}/controllo-gestione`;

const fmt = (n) => n != null ? Number(n).toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "—";
const fmtDateShort = (d) => d ? new Date(d + "T00:00:00").toLocaleDateString("it-IT", { month: "short", year: "2-digit" }) : null;

const TIPI = [
  { value: "AFFITTO", label: "Affitto", icon: "🏠", color: "bg-blue-100 text-blue-800 border-blue-200" },
  { value: "TASSA", label: "Tassa", icon: "🏛️", color: "bg-red-100 text-red-800 border-red-200" },
  { value: "STIPENDIO", label: "Stipendio", icon: "👤", color: "bg-green-100 text-green-800 border-green-200" },
  { value: "PRESTITO", label: "Prestito", icon: "🏦", color: "bg-amber-100 text-amber-800 border-amber-200" },
  { value: "RATEIZZAZIONE", label: "Rateizzazione", icon: "📅", color: "bg-violet-100 text-violet-800 border-violet-200" },
  { value: "ASSICURAZIONE", label: "Assicurazione", icon: "🛡️", color: "bg-cyan-100 text-cyan-800 border-cyan-200" },
  { value: "ALTRO", label: "Altro", icon: "📋", color: "bg-neutral-100 text-neutral-700 border-neutral-200" },
];

const FREQ = [
  { value: "MENSILE", label: "Mensile" },
  { value: "BIMESTRALE", label: "Bimestrale" },
  { value: "TRIMESTRALE", label: "Trimestrale" },
  { value: "SEMESTRALE", label: "Semestrale" },
  { value: "ANNUALE", label: "Annuale" },
  { value: "UNA_TANTUM", label: "Una tantum" },
];

// Template tasse comuni
const TASSE_TEMPLATES = [
  { titolo: "F24 — IVA trimestrale", frequenza: "TRIMESTRALE", giorno_scadenza: 16, note: "Liquidazione IVA" },
  { titolo: "F24 — Ritenute dipendenti", frequenza: "MENSILE", giorno_scadenza: 16, note: "Ritenute IRPEF dipendenti" },
  { titolo: "F24 — INPS dipendenti", frequenza: "MENSILE", giorno_scadenza: 16, note: "Contributi INPS" },
  { titolo: "F24 — INPS gestione separata", frequenza: "TRIMESTRALE", giorno_scadenza: 16, note: "" },
  { titolo: "TARI", frequenza: "TRIMESTRALE", giorno_scadenza: null, note: "Tassa rifiuti" },
  { titolo: "IMU", frequenza: "SEMESTRALE", giorno_scadenza: 16, note: "Acconto giu / saldo dic" },
  { titolo: "Diritto camerale CCIAA", frequenza: "ANNUALE", giorno_scadenza: 30, note: "" },
  { titolo: "Canone RAI", frequenza: "ANNUALE", giorno_scadenza: 31, note: "" },
];

const tipoInfo = (t) => TIPI.find(x => x.value === t) || TIPI[TIPI.length - 1];
const freqLabel = (f) => FREQ.find(x => x.value === f)?.label || f;

export default function ControlloGestioneSpeseFisse() {
  const navigate = useNavigate();
  const [spese, setSpese] = useState([]);
  const [riepilogo, setRiepilogo] = useState([]);
  const [totaleMensile, setTotaleMensile] = useState(0);
  const [loading, setLoading] = useState(true);
  const [filtroTipo, setFiltroTipo] = useState("");
  const [mostraInattive, setMostraInattive] = useState(false);

  // Form generico (edit + manuale)
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState(null);
  const [form, setForm] = useState({
    tipo: "AFFITTO", titolo: "", descrizione: "", importo: "",
    frequenza: "MENSILE", giorno_scadenza: "", data_inizio: "", data_fine: "", note: "",
  });
  const [saving, setSaving] = useState(false);

  // Wizard attivo
  const [wizard, setWizard] = useState(null); // "AFFITTO" | "PRESTITO" | "ASSICURAZIONE" | "TASSE" | "RATEIZZAZIONE" | null
  const [wizStep, setWizStep] = useState(0);
  const [wizData, setWizData] = useState({});

  // Scelta creazione
  const [showCreazione, setShowCreazione] = useState(false);

  // Per rateizzazione: fatture disponibili
  const [fattureDisponibili, setFattureDisponibili] = useState([]);
  const [loadingFatture, setLoadingFatture] = useState(false);

  // Adeguamento ISTAT
  const [adeguamento, setAdeguamento] = useState(null); // { id, titolo, importo }
  const [adeguForm, setAdeguForm] = useState({ nuovo_importo: "", data_decorrenza: "", motivo: "" });
  const [savingAdegu, setSavingAdegu] = useState(false);
  const [storico, setStorico] = useState([]);

  // Piano rate (prestiti / rateizzazioni alla francese)
  const [pianoModal, setPianoModal] = useState(null);   // { id, titolo, tipo, importo }
  const [pianoRate, setPianoRate] = useState([]);       // array di rate dal backend
  const [pianoRiepilogo, setPianoRiepilogo] = useState(null);
  const [pianoLoading, setPianoLoading] = useState(false);
  const [pianoEdits, setPianoEdits] = useState({});     // { periodo: nuovoImporto }
  const [pianoSaving, setPianoSaving] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.append("solo_attive", mostraInattive ? "false" : "true");
      if (filtroTipo) params.append("tipo", filtroTipo);
      const res = await apiFetch(`${CG}/spese-fisse?${params}`);
      if (!res.ok) throw new Error("Errore API");
      const d = await res.json();
      setSpese(d.spese || []);
      setRiepilogo(d.riepilogo_tipo || []);
      setTotaleMensile(d.totale_mensile_stimato || 0);
    } catch (e) {
      console.error("Errore caricamento spese fisse:", e);
    } finally {
      setLoading(false);
    }
  }, [filtroTipo, mostraInattive]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const resetForm = () => {
    setForm({ tipo: "AFFITTO", titolo: "", descrizione: "", importo: "",
              frequenza: "MENSILE", giorno_scadenza: "", data_inizio: "", data_fine: "", note: "", iban: "" });
    setEditId(null);
  };

  const openEdit = (s) => {
    setForm({
      tipo: s.tipo, titolo: s.titolo, descrizione: s.descrizione || "",
      importo: String(s.importo), frequenza: s.frequenza,
      giorno_scadenza: s.giorno_scadenza ? String(s.giorno_scadenza) : "",
      data_inizio: s.data_inizio || "", data_fine: s.data_fine || "",
      note: s.note || "", iban: s.iban || "",
    });
    setEditId(s.id);
    setShowForm(true);
  };

  // ── Salva (form generico) ──
  const handleSave = async () => {
    if (!form.titolo.trim() || !form.importo) return;
    setSaving(true);
    try {
      const body = {
        ...form,
        importo: parseFloat(form.importo) || 0,
        giorno_scadenza: form.giorno_scadenza ? parseInt(form.giorno_scadenza) : null,
        data_inizio: form.data_inizio || null,
        data_fine: form.data_fine || null,
      };
      const url = editId ? `${CG}/spese-fisse/${editId}` : `${CG}/spese-fisse`;
      const method = editId ? "PUT" : "POST";
      await apiFetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      setShowForm(false);
      resetForm();
      fetchData();
    } catch (e) {
      console.error("Errore salvataggio:", e);
    } finally {
      setSaving(false);
    }
  };

  // ── Salva da wizard ──
  const saveFromWizard = async (data) => {
    setSaving(true);
    try {
      const body = {
        tipo: data.tipo,
        titolo: data.titolo,
        descrizione: data.descrizione || null,
        importo: parseFloat(data.importo) || 0,
        frequenza: data.frequenza || "MENSILE",
        giorno_scadenza: data.giorno_scadenza ? parseInt(data.giorno_scadenza) : null,
        data_inizio: data.data_inizio || null,
        data_fine: data.data_fine || null,
        note: data.note || null,
        iban: data.iban || null,
      };
      // Campi extra per rateizzazione con spese legali e rate variabili
      if (data.importo_originale != null) body.importo_originale = parseFloat(data.importo_originale) || 0;
      if (data.spese_legali != null) body.spese_legali = parseFloat(data.spese_legali) || 0;
      if (data.piano_rate && data.piano_rate.length > 0) body.piano_rate = data.piano_rate;
      await apiFetch(`${CG}/spese-fisse`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      setWizard(null);
      setWizStep(0);
      setWizData({});
      fetchData();
    } catch (e) {
      console.error("Errore wizard:", e);
    } finally {
      setSaving(false);
    }
  };

  // ── Salva multiple da template tasse ──
  const saveMultiple = async (items) => {
    setSaving(true);
    try {
      for (const item of items) {
        await apiFetch(`${CG}/spese-fisse`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(item),
        });
      }
      setWizard(null);
      setWizData({});
      fetchData();
    } catch (e) {
      console.error("Errore salvataggio multiplo:", e);
    } finally {
      setSaving(false);
    }
  };

  const handleToggleAttiva = async (s) => {
    await apiFetch(`${CG}/spese-fisse/${s.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ attiva: s.attiva ? 0 : 1 }),
    });
    fetchData();
  };

  const handleDelete = async (s) => {
    if (!window.confirm(`Eliminare "${s.titolo}"?`)) return;
    await apiFetch(`${CG}/spese-fisse/${s.id}`, { method: "DELETE" });
    fetchData();
  };

  // ── Adeguamento ISTAT ──
  const openAdeguamento = async (s) => {
    setAdeguamento({ id: s.id, titolo: s.titolo, importo: s.importo, tipo: s.tipo });
    setAdeguForm({ nuovo_importo: "", data_decorrenza: "", motivo: "" });
    // Carica storico
    try {
      const res = await apiFetch(`${CG}/spese-fisse/${s.id}/adeguamenti`);
      if (res.ok) setStorico(await res.json());
      else setStorico([]);
    } catch { setStorico([]); }
  };

  const handleAdeguamento = async () => {
    if (!adeguamento || !adeguForm.nuovo_importo || !adeguForm.data_decorrenza) return;
    setSavingAdegu(true);
    try {
      const res = await apiFetch(`${CG}/spese-fisse/${adeguamento.id}/adeguamento`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nuovo_importo: parseFloat(adeguForm.nuovo_importo),
          data_decorrenza: adeguForm.data_decorrenza,
          motivo: adeguForm.motivo || `Adeguamento ${adeguamento.tipo === "AFFITTO" ? "ISTAT" : "importo"}`,
        }),
      });
      const json = await res.json();
      if (json.ok) {
        setAdeguamento(null);
        fetchData();
      } else {
        alert(json.error || "Errore");
      }
    } catch (e) {
      alert("Errore di rete");
    } finally {
      setSavingAdegu(false);
    }
  };

  // Calcolo variazione % in tempo reale
  const adeguVariazione = adeguamento && adeguForm.nuovo_importo
    ? ((parseFloat(adeguForm.nuovo_importo) - adeguamento.importo) / adeguamento.importo * 100).toFixed(1)
    : null;

  // ── Piano rate: apri modale e carica dati ──
  const openPianoRate = async (s) => {
    setPianoModal({ id: s.id, titolo: s.titolo, tipo: s.tipo, importo: s.importo });
    setPianoEdits({});
    setPianoRate([]);
    setPianoRiepilogo(null);
    setPianoLoading(true);
    try {
      const res = await apiFetch(`${CG}/spese-fisse/${s.id}/piano-rate`);
      const d = await res.json();
      if (d.ok) {
        setPianoRate(d.rate || []);
        setPianoRiepilogo(d.riepilogo || null);
      }
    } catch (e) {
      console.error("Errore caricamento piano rate:", e);
    } finally {
      setPianoLoading(false);
    }
  };

  const closePianoRate = () => {
    setPianoModal(null);
    setPianoRate([]);
    setPianoRiepilogo(null);
    setPianoEdits({});
  };

  // Modifica importo rata (local only, da salvare)
  const updatePianoRata = (periodo, valore) => {
    setPianoEdits(prev => ({ ...prev, [periodo]: valore }));
  };

  // Salva tutte le modifiche pendenti
  const savePianoRate = async () => {
    if (!pianoModal) return;
    const modifiche = Object.entries(pianoEdits)
      .map(([periodo, val]) => {
        const rata = pianoRate.find(r => r.periodo === periodo);
        if (!rata) return null;
        const nuovo = parseFloat(val);
        if (isNaN(nuovo) || nuovo < 0) return null;
        if (Math.abs(nuovo - Number(rata.importo)) < 0.005) return null;
        return {
          periodo,
          importo: nuovo,
          numero_rata: rata.numero_rata,
          note: rata.note,
        };
      })
      .filter(Boolean);
    if (modifiche.length === 0) {
      closePianoRate();
      return;
    }
    setPianoSaving(true);
    try {
      const res = await apiFetch(`${CG}/spese-fisse/${pianoModal.id}/piano-rate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rate: modifiche, sync_uscite: true }),
      });
      const d = await res.json();
      if (d.ok) {
        closePianoRate();
        fetchData();
      } else {
        alert(d.error || "Errore salvataggio");
      }
    } catch (e) {
      alert("Errore di rete");
    } finally {
      setPianoSaving(false);
    }
  };

  const statoBadge = (stato) => {
    const map = {
      PAGATA: { label: "Pagata", cls: "bg-emerald-100 text-emerald-700 border-emerald-200" },
      PAGATA_MANUALE: { label: "Pagata", cls: "bg-emerald-100 text-emerald-700 border-emerald-200" },
      PARZIALE: { label: "Parziale", cls: "bg-amber-100 text-amber-700 border-amber-200" },
      SCADUTA: { label: "Scaduta", cls: "bg-red-100 text-red-700 border-red-200" },
      DA_PAGARE: { label: "Da pagare", cls: "bg-sky-100 text-sky-700 border-sky-200" },
    };
    if (!stato) return { label: "—", cls: "bg-neutral-100 text-neutral-500 border-neutral-200" };
    return map[stato] || { label: stato, cls: "bg-neutral-100 text-neutral-500 border-neutral-200" };
  };

  // ── Carica fatture per rateizzazione ──
  const loadFatture = async () => {
    setLoadingFatture(true);
    try {
      const res = await apiFetch(`${CG}/uscite`);
      if (!res.ok) throw new Error("Errore");
      const d = await res.json();
      // Solo fatture DA_PAGARE o SCADUTE con importo > 0
      const fatt = (d.uscite || []).filter(u =>
        (u.tipo_uscita || "FATTURA") === "FATTURA" &&
        ["DA_PAGARE", "SCADUTA"].includes(u.stato) &&
        u.totale > 0
      );
      setFattureDisponibili(fatt);
    } catch (e) {
      console.error("Errore caricamento fatture:", e);
    } finally {
      setLoadingFatture(false);
    }
  };

  // ═══════ SCELTA CREAZIONE ═══════
  const creazionePanel = showCreazione && !wizard && !showForm && (
    <div className="mb-6 bg-white rounded-2xl border border-sky-200 shadow-lg p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-bold text-sky-900">Aggiungi Spesa Fissa</h3>
        <button onClick={() => setShowCreazione(false)} className="text-neutral-400 hover:text-neutral-600">&times;</button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        {/* Wizard Affitto */}
        <button onClick={() => { setWizard("AFFITTO"); setWizStep(0); setWizData({ tipo: "AFFITTO", frequenza: "MENSILE" }); setShowCreazione(false); }}
          className="flex items-center gap-3 p-4 rounded-xl border-2 border-blue-200 bg-blue-50 hover:bg-blue-100 hover:border-blue-300 transition text-left">
          <span className="text-2xl">🏠</span>
          <div>
            <div className="text-sm font-bold text-blue-900">Affitto</div>
            <div className="text-[10px] text-blue-600">Guidato: locale, proprietario, importo</div>
          </div>
        </button>

        {/* Wizard Prestito */}
        <button onClick={() => { setWizard("PRESTITO"); setWizStep(0); setWizData({ tipo: "PRESTITO", frequenza: "MENSILE" }); setShowCreazione(false); }}
          className="flex items-center gap-3 p-4 rounded-xl border-2 border-amber-200 bg-amber-50 hover:bg-amber-100 hover:border-amber-300 transition text-left">
          <span className="text-2xl">🏦</span>
          <div>
            <div className="text-sm font-bold text-amber-900">Prestito / Mutuo</div>
            <div className="text-[10px] text-amber-600">Guidato: banca, rata, durata</div>
          </div>
        </button>

        {/* Wizard Assicurazione */}
        <button onClick={() => { setWizard("ASSICURAZIONE"); setWizStep(0); setWizData({ tipo: "ASSICURAZIONE", frequenza: "ANNUALE" }); setShowCreazione(false); }}
          className="flex items-center gap-3 p-4 rounded-xl border-2 border-cyan-200 bg-cyan-50 hover:bg-cyan-100 hover:border-cyan-300 transition text-left">
          <span className="text-2xl">🛡️</span>
          <div>
            <div className="text-sm font-bold text-cyan-900">Assicurazione</div>
            <div className="text-[10px] text-cyan-600">Guidato: compagnia, polizza, scadenza</div>
          </div>
        </button>

        {/* Template Tasse */}
        <button onClick={() => { setWizard("TASSE"); setWizStep(0); setWizData({ selected: [] }); setShowCreazione(false); }}
          className="flex items-center gap-3 p-4 rounded-xl border-2 border-red-200 bg-red-50 hover:bg-red-100 hover:border-red-300 transition text-left">
          <span className="text-2xl">🏛️</span>
          <div>
            <div className="text-sm font-bold text-red-900">Tasse / F24</div>
            <div className="text-[10px] text-red-600">Template: scegli e personalizza importi</div>
          </div>
        </button>

        {/* Rateizzazione */}
        <button onClick={() => { setWizard("RATEIZZAZIONE"); setWizStep(0); setWizData({ tipo: "RATEIZZAZIONE" }); loadFatture(); setShowCreazione(false); }}
          className="flex items-center gap-3 p-4 rounded-xl border-2 border-violet-200 bg-violet-50 hover:bg-violet-100 hover:border-violet-300 transition text-left">
          <span className="text-2xl">📅</span>
          <div>
            <div className="text-sm font-bold text-violet-900">Rateizzazione</div>
            <div className="text-[10px] text-violet-600">Da fattura o importo: dividi in rate</div>
          </div>
        </button>

        {/* Manuale generico */}
        <button onClick={() => { resetForm(); setShowForm(true); setShowCreazione(false); }}
          className="flex items-center gap-3 p-4 rounded-xl border-2 border-neutral-200 bg-neutral-50 hover:bg-neutral-100 hover:border-neutral-300 transition text-left">
          <span className="text-2xl">✏️</span>
          <div>
            <div className="text-sm font-bold text-neutral-800">Inserimento manuale</div>
            <div className="text-[10px] text-neutral-500">Form libero per qualsiasi spesa</div>
          </div>
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-neutral-100 p-4 md:p-6">
      <div className="max-w-6xl mx-auto">

        {/* HEADER */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-6 gap-3">
          <div>
            <h1 className="text-2xl font-bold text-sky-900 font-playfair">Spese Fisse</h1>
            <p className="text-sm text-neutral-500 mt-0.5">Affitti, tasse, stipendi, prestiti, assicurazioni, rateizzazioni</p>
          </div>
          <div className="flex gap-2">
            <button onClick={() => navigate("/controllo-gestione")}
              className="px-3 py-1.5 text-sm rounded-lg border border-neutral-300 text-neutral-600 hover:bg-neutral-50">
              &larr; Menu
            </button>
            <button onClick={() => setShowCreazione(!showCreazione)}
              className="px-4 py-1.5 text-sm rounded-lg bg-sky-600 text-white hover:bg-sky-700 font-medium">
              + Nuova Spesa
            </button>
          </div>
        </div>

        {/* KPI CARDS */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          <div className="rounded-xl border border-sky-200 bg-sky-50 p-4">
            <div className="text-xs font-semibold text-sky-700">Costo Mensile Stimato</div>
            <div className="text-lg font-bold text-sky-900 mt-1">&euro; {fmt(totaleMensile)}</div>
            <div className="text-xs text-neutral-400 mt-0.5">{spese.filter(s => s.attiva).length} voci attive</div>
          </div>
          {riepilogo.slice(0, 3).map(r => {
            const t = tipoInfo(r.tipo);
            return (
              <div key={r.tipo}
                onClick={() => setFiltroTipo(filtroTipo === r.tipo ? "" : r.tipo)}
                className={`rounded-xl border p-4 cursor-pointer transition ${t.color} ${filtroTipo === r.tipo ? "ring-2 ring-sky-400 shadow-md" : "hover:shadow-sm"}`}>
                <div className="text-xs font-semibold">{t.icon} {t.label}</div>
                <div className="text-lg font-bold mt-1">&euro; {fmt(r.totale)}</div>
                <div className="text-xs opacity-60 mt-0.5">{r.n} {r.n === 1 ? "voce" : "voci"}</div>
              </div>
            );
          })}
        </div>

        {/* FILTRI */}
        <div className="flex flex-wrap gap-3 mb-4 items-center">
          <select value={filtroTipo} onChange={e => setFiltroTipo(e.target.value)}
            className="px-3 py-1.5 border border-neutral-300 rounded-lg text-sm bg-white">
            <option value="">Tutti i tipi</option>
            {TIPI.map(t => <option key={t.value} value={t.value}>{t.icon} {t.label}</option>)}
          </select>
          <label className="flex items-center gap-1.5 text-xs text-neutral-500 cursor-pointer">
            <input type="checkbox" checked={mostraInattive} onChange={e => setMostraInattive(e.target.checked)}
              className="rounded border-neutral-300" />
            Mostra anche inattive
          </label>
          <span className="text-xs text-neutral-400 ml-auto">{spese.length} righe</span>
        </div>

        {/* PANNELLO SCELTA CREAZIONE */}
        {creazionePanel}

        {/* ═══════ WIZARD AFFITTO ═══════ */}
        {wizard === "AFFITTO" && (
          <WizardPanel title="Nuovo Affitto" icon="🏠" color="blue" onClose={() => setWizard(null)}>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <WizField label="Nome locale / indirizzo" required
                value={wizData.titolo || ""} onChange={v => setWizData({ ...wizData, titolo: v })}
                placeholder="Es. Locale Via Roma 15" />
              <WizField label="Proprietario / agenzia"
                value={wizData.descrizione || ""} onChange={v => setWizData({ ...wizData, descrizione: v })}
                placeholder="Es. Immobiliare Rossi Srl" />
              <WizField label="Canone mensile" required type="number"
                value={wizData.importo || ""} onChange={v => setWizData({ ...wizData, importo: v })}
                placeholder="1500.00" prefix="&euro;" />
              <WizField label="Giorno pagamento" type="number" min="1" max="31"
                value={wizData.giorno_scadenza || ""} onChange={v => setWizData({ ...wizData, giorno_scadenza: v })}
                placeholder="Es. 5 (del mese)" />
              <WizField label="Inizio contratto" type="date"
                value={wizData.data_inizio || ""} onChange={v => setWizData({ ...wizData, data_inizio: v })} />
              <WizField label="Fine contratto (opzionale)" type="date"
                value={wizData.data_fine || ""} onChange={v => setWizData({ ...wizData, data_fine: v })} />
              <WizField label="IBAN beneficiario"
                value={wizData.iban || ""} onChange={v => setWizData({ ...wizData, iban: v })}
                placeholder="IT60 X054 2811 1010 0000 0123 456" />
              <div className="md:col-span-2">
                <WizField label="Note" value={wizData.note || ""} onChange={v => setWizData({ ...wizData, note: v })}
                  placeholder="Deposito cauzionale, clausole particolari..." />
              </div>
            </div>
            <div className="flex gap-2 mt-5">
              <button disabled={saving || !wizData.titolo || !wizData.importo}
                onClick={() => saveFromWizard({ ...wizData, tipo: "AFFITTO", frequenza: "MENSILE" })}
                className="px-5 py-2 rounded-lg bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 disabled:opacity-50">
                {saving ? "Salvataggio..." : "Crea Affitto"}
              </button>
            </div>
          </WizardPanel>
        )}

        {/* ═══════ WIZARD PRESTITO ═══════ */}
        {wizard === "PRESTITO" && (
          <WizardPanel title="Nuovo Prestito / Mutuo" icon="🏦" color="amber" onClose={() => setWizard(null)}>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <WizField label="Descrizione prestito" required
                value={wizData.titolo || ""} onChange={v => setWizData({ ...wizData, titolo: v })}
                placeholder="Es. Mutuo Banco BPM - ristrutturazione" />
              <WizField label="Banca / finanziaria"
                value={wizData.descrizione || ""} onChange={v => setWizData({ ...wizData, descrizione: v })}
                placeholder="Es. Banco BPM, Findomestic" />
              <WizField label="Rata mensile" required type="number"
                value={wizData.importo || ""} onChange={v => setWizData({ ...wizData, importo: v })}
                placeholder="850.00" prefix="&euro;" />
              <WizField label="Giorno addebito" type="number" min="1" max="31"
                value={wizData.giorno_scadenza || ""} onChange={v => setWizData({ ...wizData, giorno_scadenza: v })}
                placeholder="Es. 1 (del mese)" />
              <WizField label="Data prima rata" type="date"
                value={wizData.data_inizio || ""} onChange={v => setWizData({ ...wizData, data_inizio: v })} />
              <WizField label="Data ultima rata" type="date"
                value={wizData.data_fine || ""} onChange={v => setWizData({ ...wizData, data_fine: v })} />
              <WizField label="IBAN per addebito"
                value={wizData.iban || ""} onChange={v => setWizData({ ...wizData, iban: v })}
                placeholder="IT60 X054 2811 1010 0000 0123 456" />
              <div className="md:col-span-2">
                <WizField label="Note" value={wizData.note || ""} onChange={v => setWizData({ ...wizData, note: v })}
                  placeholder="Tasso, importo totale finanziato, garanzie..." />
              </div>
            </div>
            <div className="flex gap-2 mt-5">
              <button disabled={saving || !wizData.titolo || !wizData.importo}
                onClick={() => saveFromWizard({ ...wizData, tipo: "PRESTITO", frequenza: "MENSILE" })}
                className="px-5 py-2 rounded-lg bg-amber-600 text-white text-sm font-semibold hover:bg-amber-700 disabled:opacity-50">
                {saving ? "Salvataggio..." : "Crea Prestito"}
              </button>
            </div>
          </WizardPanel>
        )}

        {/* ═══════ WIZARD ASSICURAZIONE ═══════ */}
        {wizard === "ASSICURAZIONE" && (
          <WizardPanel title="Nuova Assicurazione" icon="🛡️" color="cyan" onClose={() => setWizard(null)}>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <WizField label="Tipo polizza" required
                value={wizData.titolo || ""} onChange={v => setWizData({ ...wizData, titolo: v })}
                placeholder="Es. RC professionale, Incendio locale, Furto" />
              <WizField label="Compagnia assicurativa"
                value={wizData.descrizione || ""} onChange={v => setWizData({ ...wizData, descrizione: v })}
                placeholder="Es. Unipol, Generali, Allianz" />
              <WizField label="Premio" required type="number"
                value={wizData.importo || ""} onChange={v => setWizData({ ...wizData, importo: v })}
                placeholder="1200.00" prefix="&euro;" />
              <div>
                <label className="text-xs text-neutral-500 mb-1 block">Frequenza pagamento</label>
                <select value={wizData.frequenza || "ANNUALE"}
                  onChange={e => setWizData({ ...wizData, frequenza: e.target.value })}
                  className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-sm">
                  <option value="MENSILE">Mensile</option>
                  <option value="TRIMESTRALE">Trimestrale</option>
                  <option value="SEMESTRALE">Semestrale</option>
                  <option value="ANNUALE">Annuale</option>
                </select>
              </div>
              <WizField label="Data scadenza polizza" type="date"
                value={wizData.data_inizio || ""} onChange={v => setWizData({ ...wizData, data_inizio: v })} />
              <WizField label="Giorno pagamento" type="number" min="1" max="31"
                value={wizData.giorno_scadenza || ""} onChange={v => setWizData({ ...wizData, giorno_scadenza: v })}
                placeholder="Giorno del mese" />
              <div className="md:col-span-2">
                <WizField label="Note" value={wizData.note || ""} onChange={v => setWizData({ ...wizData, note: v })}
                  placeholder="N. polizza, massimale, copertura..." />
              </div>
            </div>
            <div className="flex gap-2 mt-5">
              <button disabled={saving || !wizData.titolo || !wizData.importo}
                onClick={() => saveFromWizard({ ...wizData, tipo: "ASSICURAZIONE" })}
                className="px-5 py-2 rounded-lg bg-cyan-600 text-white text-sm font-semibold hover:bg-cyan-700 disabled:opacity-50">
                {saving ? "Salvataggio..." : "Crea Assicurazione"}
              </button>
            </div>
          </WizardPanel>
        )}

        {/* ═══════ TEMPLATE TASSE ═══════ */}
        {wizard === "TASSE" && (
          <WizardPanel title="Tasse e F24 — Scegli template" icon="🏛️" color="red" onClose={() => setWizard(null)}>
            {wizStep === 0 && (
              <>
                <p className="text-xs text-neutral-500 mb-3">Seleziona le tasse da aggiungere. Potrai personalizzare gli importi dopo.</p>
                <div className="space-y-2">
                  {TASSE_TEMPLATES.map((t, i) => {
                    const sel = (wizData.selected || []).includes(i);
                    return (
                      <button key={i} onClick={() => {
                        const curr = wizData.selected || [];
                        setWizData({ ...wizData, selected: sel ? curr.filter(x => x !== i) : [...curr, i] });
                      }}
                        className={`w-full flex items-center gap-3 p-3 rounded-lg border-2 transition text-left ${
                          sel ? "border-red-400 bg-red-50" : "border-neutral-200 bg-white hover:border-red-200"
                        }`}>
                        <span className={`w-5 h-5 rounded border-2 flex items-center justify-center text-xs ${
                          sel ? "border-red-500 bg-red-500 text-white" : "border-neutral-300"
                        }`}>{sel ? "✓" : ""}</span>
                        <div className="flex-1">
                          <div className="text-sm font-medium text-neutral-800">{t.titolo}</div>
                          <div className="text-[10px] text-neutral-400">{freqLabel(t.frequenza)}{t.giorno_scadenza ? ` — giorno ${t.giorno_scadenza}` : ""}</div>
                        </div>
                      </button>
                    );
                  })}
                </div>
                <div className="flex gap-2 mt-4">
                  <button disabled={(wizData.selected || []).length === 0}
                    onClick={() => {
                      const importi = {};
                      (wizData.selected || []).forEach(i => { importi[i] = ""; });
                      setWizData({ ...wizData, importi });
                      setWizStep(1);
                    }}
                    className="px-5 py-2 rounded-lg bg-red-600 text-white text-sm font-semibold hover:bg-red-700 disabled:opacity-50">
                    Avanti — Imposta importi ({(wizData.selected || []).length})
                  </button>
                </div>
              </>
            )}
            {wizStep === 1 && (
              <>
                <p className="text-xs text-neutral-500 mb-3">Inserisci l'importo per ogni tassa selezionata.</p>
                <div className="space-y-3">
                  {(wizData.selected || []).map(i => {
                    const t = TASSE_TEMPLATES[i];
                    return (
                      <div key={i} className="flex items-center gap-3">
                        <div className="flex-1 text-sm text-neutral-700">{t.titolo}</div>
                        <div className="w-40">
                          <WizField type="number" placeholder="Importo"
                            value={(wizData.importi || {})[i] || ""}
                            onChange={v => setWizData({ ...wizData, importi: { ...wizData.importi, [i]: v } })}
                            prefix="&euro;" />
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div className="flex gap-2 mt-4">
                  <button onClick={() => setWizStep(0)}
                    className="px-4 py-2 rounded-lg border border-neutral-300 text-neutral-600 text-sm hover:bg-neutral-50">
                    &larr; Indietro
                  </button>
                  <button disabled={saving}
                    onClick={() => {
                      const items = (wizData.selected || [])
                        .filter(i => parseFloat((wizData.importi || {})[i]) > 0)
                        .map(i => {
                          const t = TASSE_TEMPLATES[i];
                          return {
                            tipo: "TASSA",
                            titolo: t.titolo,
                            importo: parseFloat(wizData.importi[i]),
                            frequenza: t.frequenza,
                            giorno_scadenza: t.giorno_scadenza,
                            note: t.note || null,
                            data_inizio: new Date().toISOString().slice(0, 10),
                          };
                        });
                      if (items.length > 0) saveMultiple(items);
                    }}
                    className="px-5 py-2 rounded-lg bg-red-600 text-white text-sm font-semibold hover:bg-red-700 disabled:opacity-50">
                    {saving ? "Salvataggio..." : `Crea ${(wizData.selected || []).filter(i => parseFloat((wizData.importi || {})[i]) > 0).length} tasse`}
                  </button>
                </div>
              </>
            )}
          </WizardPanel>
        )}

        {/* ═══════ RATEIZZAZIONE ═══════ */}
        {wizard === "RATEIZZAZIONE" && (
          <WizardPanel title="Nuova Rateizzazione" icon="📅" color="violet" onClose={() => setWizard(null)}>
            {wizStep === 0 && (
              <>
                <p className="text-xs text-neutral-500 mb-3">Scegli la fonte da rateizzare:</p>
                <div className="grid grid-cols-2 gap-3 mb-4">
                  <button onClick={() => { setWizData({ ...wizData, fonte: "fattura" }); setWizStep(1); }}
                    className="p-4 rounded-xl border-2 border-violet-200 hover:border-violet-400 bg-violet-50 text-left transition">
                    <div className="text-sm font-bold text-violet-900">Da fattura esistente</div>
                    <div className="text-[10px] text-violet-600 mt-0.5">Seleziona una fattura da pagare e dividila in rate</div>
                  </button>
                  <button onClick={() => { setWizData({ ...wizData, fonte: "importo" }); setWizStep(2); }}
                    className="p-4 rounded-xl border-2 border-violet-200 hover:border-violet-400 bg-violet-50 text-left transition">
                    <div className="text-sm font-bold text-violet-900">Da importo libero</div>
                    <div className="text-[10px] text-violet-600 mt-0.5">Inserisci titolo e importo da rateizzare</div>
                  </button>
                </div>
              </>
            )}
            {wizStep === 1 && (
              <>
                <p className="text-xs text-neutral-500 mb-3">Seleziona la fattura da rateizzare:</p>
                {loadingFatture ? (
                  <div className="text-center py-6 text-neutral-400">Caricamento fatture...</div>
                ) : fattureDisponibili.length === 0 ? (
                  <div className="text-center py-6 text-neutral-400 text-sm">Nessuna fattura da pagare trovata</div>
                ) : (
                  <div className="space-y-1.5 max-h-[300px] overflow-y-auto">
                    {fattureDisponibili.map(f => (
                      <button key={f.id} onClick={() => {
                        setWizData({
                          ...wizData,
                          fonte: "fattura",
                          titolo: `Rateizzazione ${f.fornitore_nome} — ${f.numero_fattura || ""}`.trim(),
                          importo_totale: String(f.totale),
                          fattura_rif: `${f.fornitore_nome} n.${f.numero_fattura || "?"} del ${f.data_fattura || "?"}`,
                        });
                        setWizStep(2);
                      }}
                        className="w-full flex items-center justify-between p-2.5 rounded-lg border border-neutral-200 hover:border-violet-300 hover:bg-violet-50 transition text-left">
                        <div>
                          <div className="text-xs font-medium text-neutral-800">{f.fornitore_nome}</div>
                          <div className="text-[10px] text-neutral-400">{f.numero_fattura || "—"} — {f.data_fattura || ""}</div>
                        </div>
                        <div className="text-sm font-bold text-neutral-700">&euro; {fmt(f.totale)}</div>
                      </button>
                    ))}
                  </div>
                )}
                <div className="flex gap-2 mt-3">
                  <button onClick={() => setWizStep(0)}
                    className="px-4 py-2 rounded-lg border border-neutral-300 text-neutral-600 text-sm hover:bg-neutral-50">
                    &larr; Indietro
                  </button>
                </div>
              </>
            )}
            {wizStep === 2 && (
              <>
                {wizData.fattura_rif && (
                  <div className="text-xs text-violet-600 bg-violet-50 rounded-lg p-2 mb-3">
                    Rateizzazione di: {wizData.fattura_rif}
                  </div>
                )}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="md:col-span-2">
                    <WizField label="Descrizione" required
                      value={wizData.titolo || ""} onChange={v => setWizData({ ...wizData, titolo: v })}
                      placeholder="Es. Rateizzazione Fornitore XYZ" />
                  </div>
                  <WizField label="Importo fattura" required type="number"
                    value={wizData.importo_totale || ""} onChange={v => setWizData({ ...wizData, importo_totale: v })}
                    placeholder="3000.00" prefix="&euro;" />
                  <WizField label="Spese legali" type="number"
                    value={wizData.spese_legali || ""} onChange={v => setWizData({ ...wizData, spese_legali: v })}
                    placeholder="0.00" prefix="&euro;" />
                  <WizField label="Numero rate" required type="number"
                    value={wizData.num_rate || ""} onChange={v => setWizData({ ...wizData, num_rate: v })}
                    placeholder="Es. 6" min="2" max="120" />
                  <WizField label="Giorno pagamento" type="number" min="1" max="31"
                    value={wizData.giorno_scadenza || ""} onChange={v => setWizData({ ...wizData, giorno_scadenza: v })}
                    placeholder="Es. 15" />
                  <WizField label="Data prima rata" type="date" required
                    value={wizData.data_inizio || ""} onChange={v => setWizData({ ...wizData, data_inizio: v })} />
                  <div className="md:col-span-2">
                    <WizField label="Note" value={wizData.note || ""} onChange={v => setWizData({ ...wizData, note: v })}
                      placeholder="Accordi, riferimento pratica..." />
                  </div>
                </div>

                {/* Preview totale */}
                {wizData.importo_totale && wizData.num_rate && parseInt(wizData.num_rate) >= 2 && (() => {
                  const imp = parseFloat(wizData.importo_totale) || 0;
                  const spese = parseFloat(wizData.spese_legali) || 0;
                  const tot = imp + spese;
                  const nRate = parseInt(wizData.num_rate);
                  return (
                    <div className="mt-4 p-3 bg-violet-50 rounded-lg border border-violet-200">
                      <div className="text-xs font-semibold text-violet-700">
                        Totale da rateizzare: &euro; {fmt(tot)}
                        {spese > 0 && <span className="text-violet-500 font-normal"> (fattura {fmt(imp)} + spese legali {fmt(spese)})</span>}
                      </div>
                      <div className="text-[10px] text-violet-500 mt-0.5">
                        {nRate} rate da &euro; {fmt(tot / nRate)} / mese (media)
                      </div>
                    </div>
                  );
                })()}

                {/* Campi mancanti */}
                {(() => {
                  const mancanti = [];
                  if (!wizData.titolo) mancanti.push("Descrizione");
                  if (!wizData.importo_totale) mancanti.push("Importo fattura");
                  if (!wizData.num_rate || parseInt(wizData.num_rate) < 2) mancanti.push("Numero rate (min 2)");
                  if (!wizData.data_inizio) mancanti.push("Data prima rata");
                  return mancanti.length > 0 ? (
                    <div className="mt-3 text-[10px] text-amber-600 bg-amber-50 rounded-lg px-3 py-1.5 border border-amber-200">
                      Compila: {mancanti.join(", ")}
                    </div>
                  ) : null;
                })()}

                <div className="flex gap-2 mt-3">
                  <button onClick={() => setWizStep(wizData.fonte === "fattura" ? 1 : 0)}
                    className="px-4 py-2 rounded-lg border border-neutral-300 text-neutral-600 text-sm hover:bg-neutral-50">
                    &larr; Indietro
                  </button>
                  <button disabled={!wizData.titolo || !wizData.importo_totale || !wizData.num_rate || parseInt(wizData.num_rate) < 2 || !wizData.data_inizio}
                    onClick={() => {
                      // Genera tabella rate con importi uguali
                      const imp = parseFloat(wizData.importo_totale) || 0;
                      const spese = parseFloat(wizData.spese_legali) || 0;
                      const totale = imp + spese;
                      const nRate = parseInt(wizData.num_rate);
                      const rataBase = Math.round((totale / nRate) * 100) / 100;
                      // L'ultima rata assorbe gli arrotondamenti
                      const rateArr = [];
                      const d = new Date(wizData.data_inizio + "T00:00:00");
                      let sommaParziale = 0;
                      for (let i = 0; i < nRate; i++) {
                        const isLast = i === nRate - 1;
                        const importoRata = isLast ? Math.round((totale - sommaParziale) * 100) / 100 : rataBase;
                        sommaParziale += importoRata;
                        const dd = new Date(d);
                        dd.setMonth(d.getMonth() + i);
                        const yyyy = dd.getFullYear();
                        const mm = String(dd.getMonth() + 1).padStart(2, "0");
                        const gg = String(dd.getDate()).padStart(2, "0");
                        rateArr.push({
                          numero: i + 1,
                          periodo: `${yyyy}-${mm}`,
                          data: `${yyyy}-${mm}-${gg}`,
                          importo: importoRata,
                        });
                      }
                      setWizData({ ...wizData, rate_tabella: rateArr, totale_rateizzazione: totale });
                      setWizStep(3);
                    }}
                    className="px-5 py-2 rounded-lg bg-violet-600 text-white text-sm font-semibold hover:bg-violet-700 disabled:opacity-50">
                    Configura rate &rarr;
                  </button>
                </div>
              </>
            )}

            {/* ═══ STEP 3: Tabella rate editabili ═══ */}
            {wizStep === 3 && (() => {
              const rate = wizData.rate_tabella || [];
              const totaleRate = rate.reduce((s, r) => s + (parseFloat(r.importo) || 0), 0);
              const totaleAtteso = wizData.totale_rateizzazione || 0;
              const diff = Math.round((totaleRate - totaleAtteso) * 100) / 100;
              const isValid = Math.abs(diff) < 0.02;

              const updateRata = (idx, val) => {
                const nuove = [...rate];
                nuove[idx] = { ...nuove[idx], importo: val === "" ? "" : parseFloat(val) || 0 };
                setWizData({ ...wizData, rate_tabella: nuove });
              };

              // Ricalcola: distribuisce equamente il residuo
              const ricalcola = () => {
                const n = rate.length;
                const rataBase = Math.round((totaleAtteso / n) * 100) / 100;
                const nuove = rate.map((r, i) => ({
                  ...r,
                  importo: i === n - 1 ? Math.round((totaleAtteso - rataBase * (n - 1)) * 100) / 100 : rataBase,
                }));
                setWizData({ ...wizData, rate_tabella: nuove });
              };

              return (
                <>
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <p className="text-xs text-neutral-500">Modifica gli importi delle singole rate. Il totale deve corrispondere.</p>
                    </div>
                    <button onClick={ricalcola}
                      className="px-3 py-1.5 rounded-lg text-[10px] font-semibold bg-neutral-100 text-neutral-600 hover:bg-neutral-200 border border-neutral-200">
                      Ricalcola uguali
                    </button>
                  </div>

                  {/* Riepilogo totali */}
                  <div className={`p-3 rounded-lg border mb-3 ${isValid ? "bg-emerald-50 border-emerald-200" : "bg-red-50 border-red-200"}`}>
                    <div className="flex justify-between text-xs">
                      <span className="font-medium text-neutral-700">Totale rate: &euro; {fmt(totaleRate)}</span>
                      <span className="font-medium text-neutral-700">Atteso: &euro; {fmt(totaleAtteso)}</span>
                    </div>
                    {!isValid && (
                      <div className="text-[10px] text-red-600 mt-1 font-semibold">
                        Differenza: &euro; {diff > 0 ? "+" : ""}{fmt(diff)} — correggi gli importi
                      </div>
                    )}
                    {isValid && (
                      <div className="text-[10px] text-emerald-600 mt-1 font-semibold">Totale corretto</div>
                    )}
                  </div>

                  {/* Tabella rate */}
                  <div className="border border-neutral-200 rounded-xl overflow-hidden max-h-[350px] overflow-y-auto">
                    <table className="w-full text-xs">
                      <thead className="bg-neutral-50 sticky top-0">
                        <tr>
                          <th className="px-3 py-2 text-left text-neutral-500 font-medium">#</th>
                          <th className="px-3 py-2 text-left text-neutral-500 font-medium">Scadenza</th>
                          <th className="px-3 py-2 text-right text-neutral-500 font-medium">Importo &euro;</th>
                        </tr>
                      </thead>
                      <tbody>
                        {rate.map((r, i) => (
                          <tr key={i} className="border-t border-neutral-100 hover:bg-violet-50/30">
                            <td className="px-3 py-1.5 text-neutral-400 font-mono">{r.numero}</td>
                            <td className="px-3 py-1.5 text-neutral-700">{r.data}</td>
                            <td className="px-3 py-1.5 text-right">
                              <input type="number" step="0.01"
                                value={r.importo} onChange={e => updateRata(i, e.target.value)}
                                className="w-28 text-right px-2 py-1 rounded border border-neutral-200 focus:border-violet-400 focus:ring-1 focus:ring-violet-200 text-xs tabular-nums"
                              />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <div className="flex gap-2 mt-5">
                    <button onClick={() => setWizStep(2)}
                      className="px-4 py-2 rounded-lg border border-neutral-300 text-neutral-600 text-sm hover:bg-neutral-50">
                      &larr; Indietro
                    </button>
                    <button disabled={saving || !isValid}
                      onClick={() => {
                        const nRate = rate.length;
                        const imp = parseFloat(wizData.importo_totale) || 0;
                        const spese = parseFloat(wizData.spese_legali) || 0;
                        const totale = imp + spese;

                        let dataFine = null;
                        if (rate.length > 0) {
                          dataFine = rate[rate.length - 1].data;
                        }

                        // Prepara piano rate per il backend
                        const pianoRate = rate.map(r => ({
                          numero_rata: r.numero,
                          periodo: r.periodo,
                          importo: parseFloat(r.importo) || 0,
                          note: `Rata ${r.numero}/${nRate}`,
                        }));

                        // Importo medio per la spesa fissa (riferimento)
                        const rataMedia = Math.round((totale / nRate) * 100) / 100;

                        saveFromWizard({
                          tipo: "RATEIZZAZIONE",
                          titolo: wizData.titolo,
                          descrizione: wizData.fattura_rif || null,
                          importo: rataMedia,
                          importo_originale: imp,
                          spese_legali: spese,
                          frequenza: "MENSILE",
                          giorno_scadenza: wizData.giorno_scadenza || null,
                          data_inizio: wizData.data_inizio || null,
                          data_fine: dataFine,
                          note: wizData.note
                            ? `${wizData.note} | Totale: ${fmt(totale)}, ${nRate} rate`
                            : `Totale: ${fmt(totale)}, ${nRate} rate${spese > 0 ? ` (di cui spese legali ${fmt(spese)})` : ""}`,
                          piano_rate: pianoRate,
                        });
                      }}
                      className="px-5 py-2 rounded-lg bg-violet-600 text-white text-sm font-semibold hover:bg-violet-700 disabled:opacity-50">
                      {saving ? "Salvataggio..." : "Crea Rateizzazione"}
                    </button>
                  </div>
                </>
              );
            })()}
          </WizardPanel>
        )}

        {/* ═══════ FORM GENERICO (edit + manuale) ═══════ */}
        {showForm && (
          <div className="mb-6 bg-white rounded-2xl border border-sky-200 shadow-lg p-6">
            <h3 className="text-sm font-bold text-sky-900 mb-4">
              {editId ? "Modifica Spesa Fissa" : "Nuova Spesa Fissa (Manuale)"}
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="text-xs text-neutral-500 mb-1 block">Tipo *</label>
                <select value={form.tipo} onChange={e => setForm({ ...form, tipo: e.target.value })}
                  className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-sm">
                  {TIPI.map(t => <option key={t.value} value={t.value}>{t.icon} {t.label}</option>)}
                </select>
              </div>
              <div className="md:col-span-2">
                <label className="text-xs text-neutral-500 mb-1 block">Titolo *</label>
                <input type="text" value={form.titolo} onChange={e => setForm({ ...form, titolo: e.target.value })}
                  placeholder="Es. Affitto locale Via Roma" className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-sm" />
              </div>
              <div>
                <label className="text-xs text-neutral-500 mb-1 block">Importo (&euro;) *</label>
                <input type="number" step="0.01" value={form.importo} onChange={e => setForm({ ...form, importo: e.target.value })}
                  placeholder="1500.00" className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-sm" />
              </div>
              <div>
                <label className="text-xs text-neutral-500 mb-1 block">Frequenza</label>
                <select value={form.frequenza} onChange={e => setForm({ ...form, frequenza: e.target.value })}
                  className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-sm">
                  {FREQ.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs text-neutral-500 mb-1 block">Giorno scadenza</label>
                <input type="number" min="1" max="31" value={form.giorno_scadenza}
                  onChange={e => setForm({ ...form, giorno_scadenza: e.target.value })}
                  placeholder="Es. 5 (del mese)" className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-sm" />
              </div>
              <div>
                <label className="text-xs text-neutral-500 mb-1 block">Data inizio</label>
                <input type="date" value={form.data_inizio} onChange={e => setForm({ ...form, data_inizio: e.target.value })}
                  className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-sm" />
              </div>
              <div>
                <label className="text-xs text-neutral-500 mb-1 block">Data fine</label>
                <input type="date" value={form.data_fine} onChange={e => setForm({ ...form, data_fine: e.target.value })}
                  className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-sm" />
              </div>
              <div>
                <label className="text-xs text-neutral-500 mb-1 block">Descrizione</label>
                <input type="text" value={form.descrizione} onChange={e => setForm({ ...form, descrizione: e.target.value })}
                  placeholder="Opzionale" className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-sm" />
              </div>
              <div>
                <label className="text-xs text-neutral-500 mb-1 block">IBAN</label>
                <input type="text" value={form.iban} onChange={e => setForm({ ...form, iban: e.target.value })}
                  placeholder="IT60X0542811101000000123456" className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-sm font-mono" />
              </div>
              <div className="md:col-span-2">
                <label className="text-xs text-neutral-500 mb-1 block">Note</label>
                <input type="text" value={form.note} onChange={e => setForm({ ...form, note: e.target.value })}
                  placeholder="Note libere" className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-sm" />
              </div>
            </div>
            <div className="flex gap-2 mt-4">
              <button onClick={handleSave} disabled={saving || !form.titolo.trim() || !form.importo}
                className="px-4 py-2 rounded-lg bg-sky-600 text-white text-sm font-medium hover:bg-sky-700 disabled:opacity-50">
                {saving ? "Salvataggio..." : editId ? "Salva modifiche" : "Crea spesa"}
              </button>
              <button onClick={() => { setShowForm(false); resetForm(); }}
                className="px-4 py-2 rounded-lg border border-neutral-300 text-neutral-600 text-sm hover:bg-neutral-50">
                Annulla
              </button>
            </div>
          </div>
        )}

        {/* TABELLA */}
        {loading ? (
          <div className="text-center py-12 text-neutral-400">Caricamento...</div>
        ) : spese.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-neutral-400 text-sm">Nessuna spesa fissa trovata.</p>
            <button onClick={() => setShowCreazione(true)}
              className="mt-3 px-4 py-2 rounded-lg bg-sky-100 text-sky-700 text-sm font-medium hover:bg-sky-200">
              + Aggiungi la prima spesa fissa
            </button>
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-neutral-200 overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-sky-50 border-b border-sky-100">
                    <th className="px-4 py-3 text-left text-xs font-bold text-sky-800">Tipo</th>
                    <th className="px-4 py-3 text-left text-xs font-bold text-sky-800">Titolo</th>
                    <th className="px-4 py-3 text-right text-xs font-bold text-sky-800">Importo</th>
                    <th className="px-4 py-3 text-left text-xs font-bold text-sky-800">Frequenza</th>
                    <th className="px-4 py-3 text-center text-xs font-bold text-sky-800">Giorno</th>
                    <th className="px-4 py-3 text-left text-xs font-bold text-sky-800">Periodo</th>
                    <th className="px-4 py-3 text-center text-xs font-bold text-sky-800">Stato</th>
                    <th className="px-4 py-3 text-center text-xs font-bold text-sky-800">Azioni</th>
                  </tr>
                </thead>
                <tbody>
                  {spese.map(s => {
                    const t = tipoInfo(s.tipo);
                    return (
                      <tr key={s.id} className={`border-b border-neutral-100 hover:bg-neutral-50 ${!s.attiva ? "opacity-50" : ""}`}>
                        <td className="px-4 py-2.5">
                          <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-semibold border ${t.color}`}>
                            {t.icon} {t.label}
                          </span>
                        </td>
                        <td className="px-4 py-2.5">
                          <div className="font-medium text-neutral-800">{s.titolo}</div>
                          {s.descrizione && <div className="text-[10px] text-neutral-400 truncate max-w-[200px]">{s.descrizione}</div>}
                        </td>
                        <td className="px-4 py-2.5 text-right font-semibold text-neutral-800">
                          &euro; {fmt(s.importo)}
                        </td>
                        <td className="px-4 py-2.5 text-neutral-600 text-xs">{freqLabel(s.frequenza)}</td>
                        <td className="px-4 py-2.5 text-center text-neutral-500 text-xs">
                          {s.giorno_scadenza || "—"}
                        </td>
                        <td className="px-4 py-2.5 text-xs text-neutral-500">
                          {s.data_inizio ? (
                            <span>
                              {fmtDateShort(s.data_inizio)}
                              {s.data_fine ? ` \u2192 ${fmtDateShort(s.data_fine)}` : " \u2192 \u221E"}
                            </span>
                          ) : "\u2014"}
                        </td>
                        <td className="px-4 py-2.5 text-center">
                          <button onClick={() => handleToggleAttiva(s)}
                            className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border transition ${
                              s.attiva
                                ? "bg-emerald-100 text-emerald-700 border-emerald-200 hover:bg-emerald-200"
                                : "bg-neutral-100 text-neutral-500 border-neutral-200 hover:bg-neutral-200"
                            }`}>
                            {s.attiva ? "Attiva" : "Inattiva"}
                          </button>
                        </td>
                        <td className="px-4 py-2.5 text-center">
                          <div className="flex gap-1 justify-center flex-wrap">
                            {s.attiva && ["PRESTITO", "RATEIZZAZIONE"].includes(s.tipo) && (
                              <button onClick={() => openPianoRate(s)}
                                className="px-2 py-0.5 rounded text-[10px] bg-indigo-50 text-indigo-700 hover:bg-indigo-100 border border-indigo-200"
                                title="Piano di ammortamento / rate">
                                Piano
                              </button>
                            )}
                            {s.attiva && ["AFFITTO", "ASSICURAZIONE"].includes(s.tipo) && (
                              <button onClick={() => openAdeguamento(s)}
                                className="px-2 py-0.5 rounded text-[10px] bg-amber-50 text-amber-700 hover:bg-amber-100 border border-amber-200"
                                title="Adeguamento importo (ISTAT, variazione canone)">
                                Adegua
                              </button>
                            )}
                            <button onClick={() => openEdit(s)}
                              className="px-2 py-0.5 rounded text-[10px] bg-sky-100 text-sky-700 hover:bg-sky-200">
                              Modifica
                            </button>
                            <button onClick={() => handleDelete(s)}
                              className="px-2 py-0.5 rounded text-[10px] bg-red-50 text-red-500 hover:bg-red-100">
                              Elimina
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* FOOTER NOTE */}
        {!loading && spese.length > 0 && (
          <div className="mt-4 text-[10px] text-neutral-400 text-center">
            Il costo mensile stimato converte tutte le frequenze in equivalente mensile (bimestrale / 2, trimestrale / 3, ecc.)
          </div>
        )}
      </div>

      {/* ═══════ MODALE ADEGUAMENTO ISTAT ═══════ */}
      {adeguamento && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4"
          onClick={() => setAdeguamento(null)}>
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md max-h-[85vh] overflow-hidden"
            onClick={e => e.stopPropagation()}>

            <div className="px-5 py-3 border-b border-neutral-200 bg-amber-50">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-amber-900">
                    {adeguamento.tipo === "AFFITTO" ? "Adeguamento ISTAT" : "Adeguamento Importo"}
                  </h3>
                  <p className="text-[11px] text-amber-600 mt-0.5">{adeguamento.titolo}</p>
                </div>
                <button onClick={() => setAdeguamento(null)}
                  className="text-neutral-400 hover:text-neutral-600 text-lg">&times;</button>
              </div>
            </div>

            <div className="p-5 space-y-4 overflow-y-auto max-h-[65vh]">
              {/* Importo attuale */}
              <div className="p-3 bg-neutral-50 rounded-lg border border-neutral-200">
                <div className="text-[10px] text-neutral-500 uppercase tracking-wide">Importo attuale</div>
                <div className="text-lg font-bold text-neutral-800">&euro; {fmt(adeguamento.importo)}</div>
              </div>

              {/* Form */}
              <div className="space-y-3">
                <div>
                  <label className="text-xs text-neutral-500 mb-1 block">Nuovo importo *</label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-neutral-400">&euro;</span>
                    <input type="number" step="0.01"
                      value={adeguForm.nuovo_importo}
                      onChange={e => setAdeguForm({ ...adeguForm, nuovo_importo: e.target.value })}
                      placeholder={String(adeguamento.importo)}
                      className="w-full pl-7 pr-3 py-2 border border-neutral-300 rounded-lg text-sm" />
                  </div>
                  {adeguVariazione && (
                    <div className={`text-xs mt-1 font-medium ${parseFloat(adeguVariazione) > 0 ? "text-red-600" : "text-emerald-600"}`}>
                      {parseFloat(adeguVariazione) > 0 ? "+" : ""}{adeguVariazione}%
                      {" "}({parseFloat(adeguVariazione) > 0 ? "+" : ""}&euro; {fmt(parseFloat(adeguForm.nuovo_importo) - adeguamento.importo)})
                    </div>
                  )}
                </div>

                <div>
                  <label className="text-xs text-neutral-500 mb-1 block">Decorrenza da *</label>
                  <input type="date"
                    value={adeguForm.data_decorrenza}
                    onChange={e => setAdeguForm({ ...adeguForm, data_decorrenza: e.target.value })}
                    className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-sm" />
                  <div className="text-[10px] text-neutral-400 mt-0.5">
                    Le uscite non pagate da questa data in poi verranno aggiornate
                  </div>
                </div>

                <div>
                  <label className="text-xs text-neutral-500 mb-1 block">Motivo</label>
                  <input type="text"
                    value={adeguForm.motivo}
                    onChange={e => setAdeguForm({ ...adeguForm, motivo: e.target.value })}
                    placeholder={adeguamento.tipo === "AFFITTO" ? "Es. Adeguamento ISTAT 2026 +5.4%" : "Es. Variazione rata"}
                    className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-sm" />
                </div>
              </div>

              {/* Storico adeguamenti */}
              {storico.length > 0 && (
                <div>
                  <div className="text-[10px] font-bold text-neutral-500 uppercase tracking-wide mb-2">Storico adeguamenti</div>
                  <div className="space-y-1.5">
                    {storico.map(a => (
                      <div key={a.id} className="flex items-center justify-between text-[10px] p-2 bg-neutral-50 rounded border border-neutral-100">
                        <div>
                          <span className="text-neutral-400">{new Date(a.data_decorrenza + "T00:00:00").toLocaleDateString("it-IT")}</span>
                          {a.motivo && <span className="ml-2 text-neutral-600">{a.motivo}</span>}
                        </div>
                        <div className="text-right">
                          <span className="text-neutral-400">&euro; {fmt(a.importo_vecchio)}</span>
                          <span className="mx-1">&rarr;</span>
                          <span className="font-semibold text-neutral-700">&euro; {fmt(a.importo_nuovo)}</span>
                          <span className={`ml-1 ${a.variazione_pct > 0 ? "text-red-500" : "text-emerald-500"}`}>
                            ({a.variazione_pct > 0 ? "+" : ""}{a.variazione_pct}%)
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Bottone */}
              <button onClick={handleAdeguamento}
                disabled={savingAdegu || !adeguForm.nuovo_importo || !adeguForm.data_decorrenza}
                className="w-full px-4 py-2.5 rounded-lg bg-amber-600 text-white text-sm font-semibold hover:bg-amber-700 disabled:opacity-50">
                {savingAdegu ? "Applicazione..." : "Applica adeguamento"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══════ MODALE PIANO RATE ═══════ */}
      {pianoModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
          onClick={closePianoRate}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col"
            onClick={e => e.stopPropagation()}>

            {/* Header */}
            <div className="px-6 py-4 border-b border-neutral-200 bg-indigo-50 flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-indigo-900">📅 Piano rate — {pianoModal.titolo}</h3>
                <p className="text-[11px] text-indigo-600 mt-0.5">
                  {pianoModal.tipo === "PRESTITO" ? "Piano di ammortamento prestito" : "Piano rateizzazione"} — modifica gli importi dei singoli periodi
                </p>
              </div>
              <button onClick={closePianoRate}
                className="text-neutral-400 hover:text-neutral-600 text-xl leading-none">&times;</button>
            </div>

            {/* Riepilogo KPI */}
            {pianoRiepilogo && !pianoLoading && (
              <div className="px-6 py-3 border-b border-neutral-100 bg-neutral-50 grid grid-cols-2 md:grid-cols-5 gap-3">
                <div>
                  <div className="text-[10px] text-neutral-500 uppercase tracking-wide">Rate totali</div>
                  <div className="text-sm font-bold text-neutral-800">{pianoRiepilogo.n_rate}</div>
                </div>
                <div>
                  <div className="text-[10px] text-neutral-500 uppercase tracking-wide">Pagate</div>
                  <div className="text-sm font-bold text-emerald-700">{pianoRiepilogo.n_pagate}</div>
                </div>
                <div>
                  <div className="text-[10px] text-neutral-500 uppercase tracking-wide">Da pagare</div>
                  <div className="text-sm font-bold text-sky-700">
                    {pianoRiepilogo.n_da_pagare}
                    {pianoRiepilogo.n_scadute > 0 && (
                      <span className="text-red-600 ml-1">(+{pianoRiepilogo.n_scadute} scad.)</span>
                    )}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] text-neutral-500 uppercase tracking-wide">Pagato</div>
                  <div className="text-sm font-bold text-emerald-700">&euro; {fmt(pianoRiepilogo.totale_pagato)}</div>
                </div>
                <div>
                  <div className="text-[10px] text-neutral-500 uppercase tracking-wide">Residuo</div>
                  <div className="text-sm font-bold text-indigo-700">&euro; {fmt(pianoRiepilogo.totale_residuo)}</div>
                </div>
              </div>
            )}

            {/* Tabella rate */}
            <div className="flex-1 overflow-y-auto">
              {pianoLoading ? (
                <div className="text-center py-12 text-neutral-400 text-sm">Caricamento piano rate...</div>
              ) : pianoRate.length === 0 ? (
                <div className="text-center py-12">
                  <p className="text-neutral-400 text-sm">Nessuna rata nel piano.</p>
                  <p className="text-neutral-400 text-[11px] mt-1">Le rate vengono create automaticamente dai wizard di Rateizzazione o dai prestiti importati.</p>
                </div>
              ) : (
                <table className="w-full text-xs">
                  <thead className="bg-neutral-50 sticky top-0 z-10">
                    <tr className="border-b border-neutral-200">
                      <th className="px-4 py-2 text-left text-neutral-600 font-semibold">#</th>
                      <th className="px-4 py-2 text-left text-neutral-600 font-semibold">Periodo</th>
                      <th className="px-4 py-2 text-left text-neutral-600 font-semibold">Scadenza</th>
                      <th className="px-4 py-2 text-right text-neutral-600 font-semibold">Importo piano</th>
                      <th className="px-4 py-2 text-right text-neutral-600 font-semibold">Pagato</th>
                      <th className="px-4 py-2 text-center text-neutral-600 font-semibold">Stato</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pianoRate.map((r, idx) => {
                      const badge = statoBadge(r.uscita_stato);
                      const isPagata = ["PAGATA", "PAGATA_MANUALE"].includes(r.uscita_stato);
                      const isParziale = r.uscita_stato === "PARZIALE";
                      const editValue = pianoEdits[r.periodo];
                      const displayValue = editValue !== undefined ? editValue : String(r.importo);
                      const isEdited = editValue !== undefined && Math.abs(parseFloat(editValue || 0) - Number(r.importo)) >= 0.005;
                      const scad = r.uscita_scadenza || `${r.periodo}-??`;
                      return (
                        <tr key={r.id || idx}
                          className={`border-b border-neutral-100 hover:bg-indigo-50/30 ${isPagata ? "bg-emerald-50/20" : ""}`}>
                          <td className="px-4 py-1.5 text-neutral-400 font-mono tabular-nums">{r.numero_rata || idx + 1}</td>
                          <td className="px-4 py-1.5 text-neutral-700 font-mono tabular-nums">{r.periodo}</td>
                          <td className="px-4 py-1.5 text-neutral-600 tabular-nums">
                            {r.uscita_scadenza ? new Date(r.uscita_scadenza + "T00:00:00").toLocaleDateString("it-IT") : "—"}
                          </td>
                          <td className="px-4 py-1 text-right">
                            <input
                              type="number"
                              step="0.01"
                              disabled={isPagata || isParziale}
                              value={displayValue}
                              onChange={e => updatePianoRata(r.periodo, e.target.value)}
                              className={`w-28 text-right px-2 py-1 rounded border tabular-nums text-xs
                                ${isEdited ? "border-indigo-400 bg-indigo-50 ring-1 ring-indigo-200" : "border-neutral-200"}
                                ${isPagata || isParziale ? "bg-neutral-100 text-neutral-500 cursor-not-allowed" : "focus:border-indigo-400 focus:ring-1 focus:ring-indigo-200"}`}
                              title={isPagata ? "Rata già pagata — non modificabile" : ""}
                            />
                          </td>
                          <td className="px-4 py-1.5 text-right text-neutral-600 tabular-nums">
                            {r.uscita_pagato != null && Number(r.uscita_pagato) > 0
                              ? `€ ${fmt(r.uscita_pagato)}`
                              : "—"}
                          </td>
                          <td className="px-4 py-1.5 text-center">
                            <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold border ${badge.cls}`}>
                              {badge.label}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>

            {/* Footer con azioni */}
            <div className="px-6 py-3 border-t border-neutral-200 bg-neutral-50 flex items-center justify-between">
              <div className="text-[11px] text-neutral-500">
                {(() => {
                  const n = Object.entries(pianoEdits).filter(([periodo, val]) => {
                    const rata = pianoRate.find(r => r.periodo === periodo);
                    if (!rata) return false;
                    const nuovo = parseFloat(val);
                    return !isNaN(nuovo) && Math.abs(nuovo - Number(rata.importo)) >= 0.005;
                  }).length;
                  if (n === 0) return "Nessuna modifica pendente.";
                  return `${n} ${n === 1 ? "rata modificata" : "rate modificate"} — le uscite non ancora pagate verranno aggiornate.`;
                })()}
              </div>
              <div className="flex gap-2">
                <button onClick={closePianoRate}
                  className="px-4 py-2 rounded-lg border border-neutral-300 text-neutral-600 text-sm hover:bg-neutral-50">
                  Chiudi
                </button>
                <button onClick={savePianoRate}
                  disabled={pianoSaving || pianoLoading}
                  className="px-5 py-2 rounded-lg bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50">
                  {pianoSaving ? "Salvataggio..." : "Salva modifiche"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}


// ═══════ COMPONENTI RIUTILIZZABILI ═══════

function WizardPanel({ title, icon, color, onClose, children }) {
  const borderColor = {
    blue: "border-blue-200", amber: "border-amber-200", cyan: "border-cyan-200",
    red: "border-red-200", violet: "border-violet-200",
  }[color] || "border-sky-200";
  const bgColor = {
    blue: "bg-blue-50", amber: "bg-amber-50", cyan: "bg-cyan-50",
    red: "bg-red-50", violet: "bg-violet-50",
  }[color] || "bg-sky-50";

  return (
    <div className={`mb-6 bg-white rounded-2xl border-2 ${borderColor} shadow-lg overflow-hidden`}>
      <div className={`px-5 py-3 ${bgColor} flex items-center justify-between`}>
        <h3 className="text-sm font-bold text-neutral-800">{icon} {title}</h3>
        <button onClick={onClose} className="text-neutral-400 hover:text-neutral-600 text-lg">&times;</button>
      </div>
      <div className="p-5">
        {children}
      </div>
    </div>
  );
}

function WizField({ label, value, onChange, type = "text", placeholder = "", required = false, prefix, min, max }) {
  return (
    <div>
      {label && <label className="text-xs text-neutral-500 mb-1 block">{label}{required && " *"}</label>}
      <div className={prefix ? "relative" : ""}>
        {prefix && (
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-neutral-400"
            dangerouslySetInnerHTML={{ __html: prefix }} />
        )}
        <input type={type} value={value} onChange={e => onChange(e.target.value)}
          placeholder={placeholder} min={min} max={max}
          className={`w-full px-3 py-2 border border-neutral-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-sky-300 ${prefix ? "pl-7" : ""}`} />
      </div>
    </div>
  );
}
