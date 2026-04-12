// @version: v4.0-import-export
// Impostazioni Vendite — Layout sidebar: Chiusure + Import/Export
import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import VenditeNav from "./VenditeNav";
import CalendarioChiusure from "./CalendarioChiusure";
import { API_BASE, apiFetch } from "../../config/api";

const MONTH_NAMES = [
  "Gennaio","Febbraio","Marzo","Aprile","Maggio","Giugno",
  "Luglio","Agosto","Settembre","Ottobre","Novembre","Dicembre",
];

// ---------------------------------------------------------------
// SIDEBAR MENU
// ---------------------------------------------------------------
const MENU = [
  { key: "chiusure",     label: "Calendario Chiusure", icon: "📅" },
  { key: "importexport", label: "Import / Export",      icon: "📤" },
];

// ---------------------------------------------------------------
// SEZIONE: Import / Export
// ---------------------------------------------------------------
function SezioneImportExport() {
  const today = new Date();

  // ── Export state ──
  const [exportYear, setExportYear] = useState(today.getFullYear());
  const [exportMonth, setExportMonth] = useState(0); // 0 = tutto l'anno
  const [exporting, setExporting] = useState(false);

  // ── Import state ──
  const [importYear, setImportYear] = useState("archivio");
  const [file, setFile] = useState(null);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState(null);
  const [importError, setImportError] = useState(null);

  // ── Template state ──
  const [downloadingTemplate, setDownloadingTemplate] = useState(false);

  // ── Handlers ──

  const handleExport = async () => {
    setExporting(true);
    try {
      let url = `${API_BASE}/admin/finance/export-corrispettivi?year=${exportYear}`;
      if (exportMonth > 0) url += `&month=${exportMonth}`;
      const res = await apiFetch(url);
      if (!res.ok) throw new Error(`Errore ${res.status}`);
      const blob = await res.blob();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      const suffix = exportMonth > 0 ? `${exportYear}-${String(exportMonth).padStart(2,"0")}` : `${exportYear}`;
      a.download = `corrispettivi_${suffix}.xlsx`;
      a.click();
      URL.revokeObjectURL(a.href);
    } catch (e) {
      alert("Errore export: " + e.message);
    } finally {
      setExporting(false);
    }
  };

  const handleTemplate = async () => {
    setDownloadingTemplate(true);
    try {
      const res = await apiFetch(`${API_BASE}/admin/finance/template-corrispettivi`);
      if (!res.ok) throw new Error(`Errore ${res.status}`);
      const blob = await res.blob();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "template_corrispettivi_TRGB.xlsx";
      a.click();
      URL.revokeObjectURL(a.href);
    } catch (e) {
      alert("Errore template: " + e.message);
    } finally {
      setDownloadingTemplate(false);
    }
  };

  const handleImport = async () => {
    if (!file) { setImportError("Seleziona un file Excel."); return; }
    setImporting(true); setImportError(null); setImportResult(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const token = localStorage.getItem("token");
      const res = await fetch(
        `${API_BASE}/admin/finance/import-corrispettivi-file?year=${encodeURIComponent(importYear)}`,
        { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: formData }
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || "Errore generico nell'import.");
      }
      setImportResult(await res.json());
      setFile(null);
    } catch (e) {
      setImportError(e.message);
    } finally {
      setImporting(false);
    }
  };

  const yearOptions = [];
  for (let y = today.getFullYear(); y >= 2021; y--) yearOptions.push(y);

  return (
    <div className="space-y-8">

      {/* ═══ EXPORT ═══ */}
      <section>
        <div className="mb-4">
          <h2 className="text-xl font-bold text-indigo-900 font-playfair">Esporta corrispettivi</h2>
          <p className="text-neutral-500 text-sm mt-1">
            Scarica i dati dal database in formato Excel con i campi standard TRGB.
          </p>
        </div>

        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="block text-xs font-semibold text-neutral-500 mb-1 uppercase tracking-wide">Anno</label>
            <select value={exportYear} onChange={e => setExportYear(Number(e.target.value))}
              className="w-28 px-3 py-2 border border-neutral-300 rounded-xl bg-white text-sm">
              {yearOptions.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-neutral-500 mb-1 uppercase tracking-wide">Mese (opzionale)</label>
            <select value={exportMonth} onChange={e => setExportMonth(Number(e.target.value))}
              className="w-36 px-3 py-2 border border-neutral-300 rounded-xl bg-white text-sm">
              <option value={0}>Tutto l'anno</option>
              {MONTH_NAMES.map((m, i) => <option key={i+1} value={i+1}>{m}</option>)}
            </select>
          </div>
          <button onClick={handleExport} disabled={exporting}
            className={`px-5 py-2 rounded-xl text-sm font-semibold shadow transition ${
              exporting ? "bg-neutral-200 text-neutral-500" : "bg-emerald-600 text-white hover:bg-emerald-700"
            }`}>
            {exporting ? "Generazione..." : "Scarica Excel"}
          </button>
        </div>
      </section>

      <hr className="border-neutral-200" />

      {/* ═══ TEMPLATE ═══ */}
      <section>
        <div className="mb-4">
          <h2 className="text-xl font-bold text-indigo-900 font-playfair">Template vuoto</h2>
          <p className="text-neutral-500 text-sm mt-1">
            Scarica un file Excel vuoto con gli header standard, istruzioni e un esempio. Ideale per iniziare da zero o per nuove installazioni.
          </p>
        </div>

        <button onClick={handleTemplate} disabled={downloadingTemplate}
          className={`px-5 py-2 rounded-xl text-sm font-semibold shadow transition ${
            downloadingTemplate ? "bg-neutral-200 text-neutral-500" : "bg-indigo-600 text-white hover:bg-indigo-700"
          }`}>
          {downloadingTemplate ? "Generazione..." : "Scarica template"}
        </button>
      </section>

      <hr className="border-neutral-200" />

      {/* ═══ IMPORT ═══ */}
      <section>
        <div className="mb-4">
          <h2 className="text-xl font-bold text-indigo-900 font-playfair">Importa corrispettivi</h2>
          <p className="text-neutral-500 text-sm mt-1">
            Carica un file Excel con i dati dei corrispettivi. Accetta sia il formato standard TRGB che i vecchi formati Excel.
          </p>
        </div>

        <div className="space-y-4">
          {/* Foglio */}
          <div>
            <label className="block text-xs font-semibold text-neutral-500 mb-1 uppercase tracking-wide">Foglio da importare</label>
            <select value={importYear} onChange={e => setImportYear(e.target.value)}
              className="w-56 px-3 py-2 border border-neutral-300 rounded-xl bg-white text-sm">
              <option value="archivio">archivio (tutte le date)</option>
              {yearOptions.map(y => <option key={y} value={String(y)}>{y}</option>)}
            </select>
            <p className="text-xs text-neutral-400 mt-1">
              <strong>archivio</strong> → importa tutte le date presenti nel foglio. <strong>anno</strong> → filtra solo quell'anno.
            </p>
          </div>

          {/* File */}
          <div>
            <label className="block text-xs font-semibold text-neutral-500 mb-1 uppercase tracking-wide">File Excel</label>
            <input type="file" accept=".xlsb,.xlsx,.xls" onChange={e => { setFile(e.target.files[0] || null); setImportResult(null); setImportError(null); }}
              className="block w-full text-sm text-neutral-700 file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-sm file:font-medium file:bg-indigo-50 file:text-indigo-900 hover:file:bg-indigo-100" />
          </div>

          {/* Colonne accettate */}
          <details className="text-xs text-neutral-500">
            <summary className="cursor-pointer hover:text-neutral-700">Colonne accettate (formato TRGB e legacy)</summary>
            <div className="mt-2 bg-neutral-50 rounded-xl p-3 border border-neutral-200">
              <p className="mb-1 font-semibold text-neutral-600">Formato TRGB (standard):</p>
              <p>Data, Giorno, Corrispettivi, IVA 10%, IVA 22%, Fatture, Corrispettivi Tot, Contanti, POS BPM, POS Sella, TheForkPay, Stripe/PayPal, Bonifici, Mance, Note, Chiuso</p>
              <p className="mt-2 mb-1 font-semibold text-neutral-600">Alias legacy accettati:</p>
              <p>CORRISPETTIVI-TOT, POS, POS RISTO, SELLA, THEFORK, PAYPAL, STRIPE, PAYPAL/STRIPE, MANCE DIG, ecc.</p>
            </div>
          </details>

          {/* Button */}
          <div className="flex items-center gap-3">
            <button type="button" disabled={importing || !file} onClick={handleImport}
              className={`px-5 py-2 rounded-xl text-sm font-semibold shadow ${
                importing || !file ? "bg-neutral-200 text-neutral-500 cursor-not-allowed" : "bg-orange-600 text-white hover:bg-orange-700 transition"
              }`}>
              {importing ? "Import in corso..." : "Importa corrispettivi"}
            </button>
            {file && !importing && <span className="text-xs text-neutral-500">File: <strong>{file.name}</strong></span>}
          </div>

          {importError && (
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
              Errore: {importError}
            </div>
          )}
          {importResult && (
            <div className="rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
              <p className="font-semibold mb-1">Import completato ({importResult.year})</p>
              <p>Inserite: <strong>{importResult.inserted}</strong> — Aggiornate: <strong>{importResult.updated}</strong></p>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

// ---------------------------------------------------------------
// SEZIONE: Calendario Chiusure
// ---------------------------------------------------------------
function SezioneChiusure() {
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-bold text-indigo-900 font-playfair mb-1">Calendario chiusure</h2>
        <p className="text-neutral-500 text-sm">Configura il giorno di chiusura settimanale e i giorni di ferie/chiusure straordinarie.</p>
      </div>
      <CalendarioChiusure />
    </div>
  );
}

// ===============================================================
// MAIN COMPONENT
// ===============================================================
export default function CorrispettiviImport() {
  const navigate = useNavigate();
  const [activeSection, setActiveSection] = useState("chiusure");

  const sectionRenderers = {
    chiusure: () => <SezioneChiusure />,
    importexport: () => <SezioneImportExport />,
  };

  return (
    <div className="min-h-screen bg-brand-cream font-sans">
      <VenditeNav current="impostazioni" />

      <div className="max-w-6xl mx-auto p-4 sm:p-6 space-y-5">

        {/* HEADER */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-indigo-900 font-playfair">
              Impostazioni Vendite
            </h1>
            <p className="text-neutral-500 text-sm mt-1">
              Chiusure, import/export dati e configurazione modulo vendite.
            </p>
          </div>
          <button onClick={() => navigate("/vendite")}
            className="px-4 py-2 rounded-xl text-sm font-medium border border-neutral-300 bg-neutral-50 hover:bg-neutral-100 shadow-sm transition">
            ← Vendite
          </button>
        </div>

        {/* SIDEBAR + CONTENT */}
        <div className="flex flex-col md:flex-row gap-6">

          {/* SIDEBAR */}
          <nav className="md:w-56 shrink-0">
            <div className="bg-white border border-neutral-200 rounded-2xl overflow-hidden shadow-sm">
              {MENU.map(item => (
                <button key={item.key} onClick={() => setActiveSection(item.key)}
                  className={`w-full flex items-center gap-3 px-4 py-3 text-sm font-medium text-left transition border-l-3 ${
                    activeSection === item.key
                      ? "bg-indigo-50 text-indigo-900 border-l-indigo-700"
                      : "text-neutral-600 hover:bg-neutral-50 border-l-transparent hover:text-neutral-800"
                  }`}>
                  <span className="text-base">{item.icon}</span>
                  <span>{item.label}</span>
                </button>
              ))}
            </div>
          </nav>

          {/* CONTENT */}
          <main className="flex-1 bg-white border border-neutral-200 rounded-2xl p-6 shadow-sm min-h-[500px]">
            {sectionRenderers[activeSection]?.()}
          </main>

        </div>
      </div>
    </div>
  );
}
