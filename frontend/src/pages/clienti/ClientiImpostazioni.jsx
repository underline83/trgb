// @version: v2.1-mattoni — M.I primitives (Btn, EmptyState), bg brand-cream, focus ring brand
// Layout Impostazioni CRM: sidebar sinistra + sezioni (segmenti, import, duplicati, mailchimp)
import React, { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { API_BASE, apiFetch } from "../../config/api";
import ClientiNav from "./ClientiNav";
import ClientiImport from "./ClientiImport";
import ClientiDuplicati from "./ClientiDuplicati";
import ClientiMailchimp from "./ClientiMailchimp";
import ClientiMenuTemplates from "./ClientiMenuTemplates";
import { Btn, EmptyState } from "../../components/ui";

// ── Sidebar items ──
const SECTIONS = [
  { key: "segmenti", label: "Segmenti", icon: "📊", desc: "Soglie segmentazione clienti" },
  { key: "template_preventivi", label: "Template Preventivi", icon: "📋", desc: "Menu e condizioni riutilizzabili" },
  { key: "menu_templates", label: "Menu Template", icon: "🍽️", desc: "Libreria menu riutilizzabili sui preventivi" },
  { key: "luoghi_preventivi", label: "Luoghi Preventivi", icon: "📍", desc: "Sale e spazi per eventi (Sala, Giardino, Dehor…)" },
  { key: "import", label: "Import / Export", icon: "📥", desc: "TheFork, CSV, revisione diff" },
  { key: "duplicati", label: "Duplicati", icon: "🔄", desc: "Trova e unisci duplicati" },
  { key: "mailchimp", label: "Mailchimp", icon: "📬", desc: "Sync contatti e campagne" },
];

// ── Configurazione soglie segmenti ──
const SEGMENTI_CONFIG = [
  { chiave: "seg_abituale_min", label: "Abituale — visite minime", desc: "Quante visite nella finestra per essere considerato abituale", type: "number", min: 1, max: 50 },
  { chiave: "seg_occasionale_min", label: "Occasionale — visite minime", desc: "Quante visite nella finestra per essere considerato occasionale (sotto la soglia abituale)", type: "number", min: 1, max: 50 },
  { chiave: "seg_finestra_mesi", label: "Finestra di osservazione (mesi)", desc: "Quanti mesi guardare indietro per contare le visite (abituale/occasionale)", type: "number", min: 1, max: 36 },
  { chiave: "seg_nuovo_giorni", label: "Nuovo — entro quanti giorni", desc: "Giorni dalla prima visita per considerare un cliente come nuovo", type: "number", min: 7, max: 365 },
  { chiave: "seg_nuovo_max_visite", label: "Nuovo — max visite", desc: "Numero massimo di visite per restare nel segmento nuovo", type: "number", min: 1, max: 20 },
  { chiave: "seg_perso_giorni", label: "Perso — dopo quanti giorni", desc: "Giorni senza visite per considerare un cliente come perso", type: "number", min: 30, max: 730 },
];

export default function ClientiImpostazioni() {
  const { section: urlSection } = useParams();
  const navigate = useNavigate();
  const [section, setSection] = useState(urlSection || "segmenti");

  // Sync con URL
  useEffect(() => {
    if (urlSection && urlSection !== section) setSection(urlSection);
  }, [urlSection]);

  const goTo = (key) => {
    setSection(key);
    navigate(`/clienti/impostazioni/${key}`, { replace: true });
  };

  return (
    <>
      <ClientiNav current="impostazioni" />
      <div className="min-h-screen bg-brand-cream">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
          <div className="flex gap-6">
            {/* ── Sidebar ── */}
            <div className="w-56 flex-shrink-0">
              <h2 className="text-xs font-bold text-neutral-400 uppercase tracking-wider mb-3 px-3">
                Impostazioni
              </h2>
              <nav className="space-y-0.5">
                {SECTIONS.map((s) => {
                  const active = section === s.key;
                  return (
                    <button
                      key={s.key}
                      onClick={() => goTo(s.key)}
                      className={`w-full text-left px-3 py-2.5 rounded-lg transition flex items-start gap-2.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue/40 focus-visible:ring-offset-1 ${
                        active
                          ? "bg-teal-50 text-teal-900 shadow-sm border border-teal-200"
                          : "text-neutral-600 hover:bg-neutral-100 hover:text-neutral-800"
                      }`}
                    >
                      <span className="text-sm mt-0.5">{s.icon}</span>
                      <div>
                        <div className={`text-sm font-medium ${active ? "text-teal-900" : ""}`}>{s.label}</div>
                        <div className="text-[11px] text-neutral-400 mt-0.5 leading-tight">{s.desc}</div>
                      </div>
                    </button>
                  );
                })}
              </nav>
            </div>

            {/* ── Content ── */}
            <div className="flex-1 min-w-0">
              {section === "segmenti" && <SegmentiSection />}
              {section === "template_preventivi" && <TemplateSection />}
              {section === "menu_templates" && <ClientiMenuTemplates embedded />}
              {section === "luoghi_preventivi" && <LuoghiSection />}
              {section === "import" && <ClientiImport embedded />}
              {section === "duplicati" && <ClientiDuplicati embedded />}
              {section === "mailchimp" && <ClientiMailchimp embedded />}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}


// ── Sezione Segmenti (ex contenuto ClientiImpostazioni v1) ──
function SegmentiSection() {
  const [impostazioni, setImpostazioni] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState(null);
  const [dirty, setDirty] = useState(false);

  const showToast = (message, type = "success") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  useEffect(() => { fetchImpostazioni(); }, []);

  const fetchImpostazioni = async () => {
    setLoading(true);
    try {
      const res = await apiFetch(`${API_BASE}/clienti/impostazioni`);
      if (!res.ok) throw new Error("Errore caricamento");
      const data = await res.json();
      const map = {};
      (data.impostazioni || []).forEach((i) => { map[i.chiave] = i.valore; });
      setImpostazioni(map);
      setDirty(false);
    } catch (err) {
      showToast(err.message, "error");
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (chiave, valore) => {
    setImpostazioni((prev) => ({ ...prev, [chiave]: valore }));
    setDirty(true);
  };

  const handleSave = async () => {
    const abMin = parseInt(impostazioni.seg_abituale_min || "5");
    const ocMin = parseInt(impostazioni.seg_occasionale_min || "1");
    if (ocMin >= abMin) {
      showToast(`La soglia occasionale (${ocMin}) deve essere inferiore a quella abituale (${abMin})`, "error");
      return;
    }
    setSaving(true);
    try {
      const body = {};
      SEGMENTI_CONFIG.forEach((c) => {
        if (impostazioni[c.chiave] !== undefined) body[c.chiave] = impostazioni[c.chiave];
      });
      const res = await apiFetch(`${API_BASE}/clienti/impostazioni`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error("Errore salvataggio");
      showToast("Impostazioni salvate — i segmenti verranno ricalcolati al prossimo caricamento");
      setDirty(false);
    } catch (err) {
      showToast(err.message, "error");
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    if (!window.confirm("Ripristinare i valori di default?")) return;
    setImpostazioni({
      seg_abituale_min: "5", seg_occasionale_min: "1", seg_nuovo_giorni: "90",
      seg_nuovo_max_visite: "2", seg_perso_giorni: "365", seg_finestra_mesi: "12",
    });
    setDirty(true);
  };

  const esempio = () => {
    const fm = impostazioni.seg_finestra_mesi || "12";
    const ab = impostazioni.seg_abituale_min || "5";
    const oc = impostazioni.seg_occasionale_min || "1";
    const ng = impostazioni.seg_nuovo_giorni || "90";
    const nv = impostazioni.seg_nuovo_max_visite || "2";
    const pg = impostazioni.seg_perso_giorni || "365";
    return [
      { segmento: "Abituale", regola: `${ab}+ visite negli ultimi ${fm} mesi`, color: "text-teal-700 bg-teal-50" },
      { segmento: "Occasionale", regola: `${oc}-${parseInt(ab) - 1} visite negli ultimi ${fm} mesi`, color: "text-sky-700 bg-sky-50" },
      { segmento: "Nuovo", regola: `Prima visita entro ${ng} giorni, max ${nv} visite`, color: "text-emerald-700 bg-emerald-50" },
      { segmento: "Perso", regola: `Nessuna visita da ${pg}+ giorni`, color: "text-red-700 bg-red-50" },
      { segmento: "Mai venuto", regola: "Nessuna prenotazione completata", color: "text-neutral-500 bg-neutral-50" },
    ];
  };

  if (loading) return <div className="text-center py-12 text-neutral-400">Caricamento...</div>;

  return (
    <>
      <h1 className="text-2xl font-bold text-neutral-900 mb-2">Segmenti Marketing</h1>
      <p className="text-sm text-neutral-500 mb-6">
        Configura le soglie per la segmentazione automatica dei clienti. I segmenti vengono ricalcolati in tempo reale.
      </p>

      {/* Soglie */}
      <div className="bg-white rounded-xl border border-neutral-200 shadow-sm overflow-hidden mb-6">
        <div className="p-5 space-y-5">
          {SEGMENTI_CONFIG.map((cfg) => (
            <div key={cfg.chiave} className="flex items-start gap-4">
              <div className="flex-1">
                <label className="block text-sm font-medium text-neutral-800">{cfg.label}</label>
                <p className="text-xs text-neutral-500 mt-0.5">{cfg.desc}</p>
              </div>
              <input
                type={cfg.type}
                min={cfg.min}
                max={cfg.max}
                value={impostazioni[cfg.chiave] || ""}
                onChange={(e) => handleChange(cfg.chiave, e.target.value)}
                className="w-20 px-3 py-1.5 border border-neutral-300 rounded-lg text-sm text-center
                  focus:outline-none focus:ring-2 focus:ring-teal-300 focus:border-teal-400"
              />
            </div>
          ))}
        </div>
        <div className="px-5 py-3 bg-neutral-50 border-t border-neutral-100 flex items-center justify-between">
          <Btn variant="ghost" size="sm" onClick={handleReset}>
            Ripristina default
          </Btn>
          <div className="flex items-center gap-3">
            {dirty && <span className="text-xs text-amber-600 font-medium">Modifiche non salvate</span>}
            <Btn variant="success" size="md" onClick={handleSave} disabled={!dirty || saving} loading={saving}>
              Salva
            </Btn>
          </div>
        </div>
      </div>

      {/* Preview */}
      <div className="bg-white rounded-xl border border-neutral-200 shadow-sm overflow-hidden">
        <div className="px-5 py-3 bg-neutral-50 border-b border-neutral-100">
          <h2 className="text-sm font-semibold text-neutral-800">Preview regole attuali</h2>
        </div>
        <div className="p-5 space-y-2">
          {esempio().map((e) => (
            <div key={e.segmento} className={`flex items-center justify-between px-4 py-2.5 rounded-lg ${e.color}`}>
              <span className="text-sm font-semibold">{e.segmento}</span>
              <span className="text-xs">{e.regola}</span>
            </div>
          ))}
        </div>
      </div>

      {toast && (
        <div className={`fixed bottom-4 right-4 px-4 py-2 rounded-lg shadow-lg text-sm font-medium z-50 ${
          toast.type === "error" ? "bg-red-600 text-white" : "bg-emerald-600 text-white"
        }`} onClick={() => setToast(null)}>
          {toast.message}
        </div>
      )}
    </>
  );
}


// ── Sezione Template Preventivi ──
function TemplateSection() {
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null); // null | "new" | template obj
  const [toast, setToast] = useState(null);

  // Form template
  const [nome, setNome] = useState("");
  const [tipo, setTipo] = useState("cena_privata");
  const [condizioni, setCondizioni] = useState("");
  const [righe, setRighe] = useState([{ descrizione: "", qta: 1, prezzo_unitario: 0, tipo_riga: "voce" }]);

  const showToast = (msg, isError = false) => {
    setToast({ msg, isError });
    setTimeout(() => setToast(null), 3000);
  };

  const fetchTemplates = async () => {
    setLoading(true);
    try {
      const res = await apiFetch(`${API_BASE}/preventivi/template/lista`);
      const data = await res.json();
      setTemplates(Array.isArray(data) ? data : []);
    } catch { /* ignore */ }
    setLoading(false);
  };

  useEffect(() => { fetchTemplates(); }, []);

  const resetForm = () => {
    setNome(""); setTipo("cena_privata"); setCondizioni("");
    setRighe([{ descrizione: "", qta: 1, prezzo_unitario: 0, tipo_riga: "voce" }]);
    setEditing(null);
  };

  const startEdit = (tpl) => {
    setEditing(tpl);
    setNome(tpl.nome || "");
    setTipo(tpl.tipo || "cena_privata");
    setCondizioni(tpl.condizioni_default || "");
    try {
      const r = JSON.parse(tpl.righe_json || "[]");
      setRighe(r.length ? r : [{ descrizione: "", qta: 1, prezzo_unitario: 0, tipo_riga: "voce" }]);
    } catch {
      setRighe([{ descrizione: "", qta: 1, prezzo_unitario: 0, tipo_riga: "voce" }]);
    }
  };

  const handleSave = async () => {
    if (!nome.trim()) { showToast("Nome obbligatorio", true); return; }
    const body = { nome, tipo, condizioni_default: condizioni, righe };
    try {
      let res;
      if (editing === "new") {
        res = await apiFetch(`${API_BASE}/preventivi/template`, {
          method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
        });
      } else {
        res = await apiFetch(`${API_BASE}/preventivi/template/${editing.id}`, {
          method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
        });
      }
      if (!res.ok) throw new Error();
      showToast("Template salvato");
      resetForm();
      fetchTemplates();
    } catch {
      showToast("Errore salvataggio", true);
    }
  };

  const handleDelete = async (tpl) => {
    if (!window.confirm(`Disattivare "${tpl.nome}"?`)) return;
    try {
      await apiFetch(`${API_BASE}/preventivi/template/${tpl.id}`, { method: "DELETE" });
      showToast("Template disattivato");
      fetchTemplates();
    } catch {
      showToast("Errore", true);
    }
  };

  const updateRiga = (idx, field, value) => {
    setRighe((prev) => prev.map((r, i) => i === idx ? { ...r, [field]: value } : r));
  };

  if (loading) return <div className="py-12 text-center text-neutral-400">Caricamento...</div>;

  return (
    <>
      <h1 className="text-2xl font-bold text-neutral-900 mb-2">Template Preventivi</h1>
      <p className="text-sm text-neutral-500 mb-6">
        Crea menu e condizioni riutilizzabili da applicare ai nuovi preventivi.
      </p>

      {/* Lista template esistenti */}
      <div className="bg-white rounded-xl border border-neutral-200 shadow-sm overflow-hidden mb-6">
        <div className="px-5 py-3 bg-neutral-50 border-b border-neutral-100 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-neutral-800">Template attivi</h2>
          <Btn variant="chip" tone="blue" size="sm" onClick={() => { resetForm(); setEditing("new"); }}>
            + Nuovo template
          </Btn>
        </div>
        {templates.length === 0 ? (
          <EmptyState icon="📋" title="Nessun template" description="Crea un template per riutilizzare menu e condizioni sui preventivi." compact />
        ) : (
          <div className="divide-y divide-neutral-100">
            {templates.map((tpl) => {
              let righeCount = 0;
              try { righeCount = JSON.parse(tpl.righe_json || "[]").length; } catch {}
              return (
                <div key={tpl.id} className="px-5 py-3 flex items-center justify-between hover:bg-neutral-50 transition">
                  <div>
                    <span className="font-medium text-sm text-neutral-900">{tpl.nome}</span>
                    <span className="ml-2 text-xs text-neutral-400">{tpl.tipo} — {righeCount} voci</span>
                  </div>
                  <div className="flex gap-2">
                    <Btn variant="chip" tone="blue" size="sm" onClick={() => startEdit(tpl)}>Modifica</Btn>
                    <Btn variant="chip" tone="red" size="sm" onClick={() => handleDelete(tpl)}>Disattiva</Btn>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Form editing */}
      {editing && (
        <div className="bg-white rounded-xl border border-indigo-200 shadow-sm overflow-hidden">
          <div className="px-5 py-3 bg-indigo-50 border-b border-indigo-100">
            <h2 className="text-sm font-semibold text-indigo-900">
              {editing === "new" ? "Nuovo template" : `Modifica: ${editing.nome}`}
            </h2>
          </div>
          <div className="p-5 space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-neutral-600 font-medium">Nome template *</label>
                <input type="text" value={nome} onChange={(e) => setNome(e.target.value)}
                  placeholder="es. Degustazione 5 portate"
                  className="w-full mt-1 border border-neutral-300 rounded-lg px-3 py-1.5 text-sm" />
              </div>
              <div>
                <label className="text-xs text-neutral-600 font-medium">Tipo</label>
                <select value={tipo} onChange={(e) => setTipo(e.target.value)}
                  className="w-full mt-1 border border-neutral-300 rounded-lg px-3 py-1.5 text-sm">
                  <option value="cena_privata">Cena privata</option>
                  <option value="aperitivo">Aperitivo</option>
                  <option value="degustazione">Degustazione</option>
                  <option value="catering">Catering</option>
                  <option value="altro">Altro</option>
                </select>
              </div>
            </div>

            <div>
              <label className="text-xs text-neutral-600 font-medium">Condizioni default</label>
              <textarea value={condizioni} onChange={(e) => setCondizioni(e.target.value)}
                placeholder="Acconto 30%, conferma entro 7 giorni..."
                rows={2} className="w-full mt-1 border border-neutral-300 rounded-lg px-3 py-2 text-sm resize-none" />
            </div>

            {/* Righe template */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs text-neutral-600 font-medium">Voci menu</label>
                <button onClick={() => setRighe((prev) => [...prev, { descrizione: "", qta: 1, prezzo_unitario: 0, tipo_riga: "voce" }])}
                  className="text-[10px] px-2 py-0.5 bg-indigo-50 text-indigo-700 rounded hover:bg-indigo-100">+ Riga</button>
              </div>
              <div className="space-y-1.5">
                {righe.map((r, i) => (
                  <div key={i} className="grid grid-cols-[1fr_60px_80px_70px_30px] gap-1.5 items-center">
                    <input type="text" value={r.descrizione} onChange={(e) => updateRiga(i, "descrizione", e.target.value)}
                      placeholder="Descrizione" className="border border-neutral-200 rounded px-2 py-1 text-sm" />
                    <input type="number" min="0" step="0.5" value={r.qta} onChange={(e) => updateRiga(i, "qta", parseFloat(e.target.value) || 0)}
                      className="border border-neutral-200 rounded px-2 py-1 text-sm text-center" />
                    <input type="number" min="0" step="0.01" value={r.prezzo_unitario} onChange={(e) => updateRiga(i, "prezzo_unitario", parseFloat(e.target.value) || 0)}
                      className="border border-neutral-200 rounded px-2 py-1 text-sm text-right" />
                    <select value={r.tipo_riga || "voce"} onChange={(e) => updateRiga(i, "tipo_riga", e.target.value)}
                      className="border border-neutral-200 rounded px-1 py-1 text-[10px]">
                      <option value="voce">Voce</option>
                      <option value="sconto">Sconto</option>
                      <option value="supplemento">Suppl.</option>
                    </select>
                    <button onClick={() => setRighe((prev) => prev.filter((_, j) => j !== i))}
                      className="text-red-300 hover:text-red-500 text-xs text-center">✕</button>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-neutral-100">
              <Btn variant="ghost" size="sm" onClick={resetForm}>Annulla</Btn>
              <Btn variant="primary" size="md" onClick={handleSave}>Salva template</Btn>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div className={`fixed bottom-4 right-4 px-4 py-2 rounded-lg shadow-lg text-sm font-medium z-50 ${
          toast.isError ? "bg-red-600 text-white" : "bg-emerald-600 text-white"
        }`} onClick={() => setToast(null)}>
          {toast.msg}
        </div>
      )}
    </>
  );
}


// ── Sezione Luoghi Preventivi ──
function LuoghiSection() {
  const [luoghi, setLuoghi] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [nuovo, setNuovo] = useState("");
  const [toast, setToast] = useState(null);

  const showToast = (msg, isError = false) => {
    setToast({ msg, isError });
    setTimeout(() => setToast(null), 3000);
  };

  const fetchLuoghi = async () => {
    setLoading(true);
    try {
      const res = await apiFetch(`${API_BASE}/preventivi/config/luoghi`);
      if (!res.ok) throw new Error("Errore caricamento");
      const data = await res.json();
      setLuoghi(Array.isArray(data.luoghi) ? data.luoghi : []);
      setDirty(false);
    } catch (err) {
      showToast(err.message || "Errore", true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchLuoghi(); }, []);

  const aggiungi = () => {
    const v = (nuovo || "").trim();
    if (!v) return;
    if (luoghi.some((l) => l.toLowerCase() === v.toLowerCase())) {
      showToast("Luogo già presente", true);
      return;
    }
    setLuoghi((prev) => [...prev, v]);
    setNuovo("");
    setDirty(true);
  };

  const rimuovi = (idx) => {
    setLuoghi((prev) => prev.filter((_, i) => i !== idx));
    setDirty(true);
  };

  const muovi = (idx, delta) => {
    const j = idx + delta;
    if (j < 0 || j >= luoghi.length) return;
    const copy = [...luoghi];
    [copy[idx], copy[j]] = [copy[j], copy[idx]];
    setLuoghi(copy);
    setDirty(true);
  };

  const rinomina = (idx, nuovoNome) => {
    setLuoghi((prev) => prev.map((l, i) => i === idx ? nuovoNome : l));
    setDirty(true);
  };

  const salva = async () => {
    const puliti = luoghi.map((l) => (l || "").trim()).filter(Boolean);
    if (!puliti.length) {
      showToast("Deve esserci almeno un luogo", true);
      return;
    }
    setSaving(true);
    try {
      const res = await apiFetch(`${API_BASE}/preventivi/config/luoghi`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ luoghi: puliti }),
      });
      if (!res.ok) throw new Error("Errore salvataggio");
      const data = await res.json();
      setLuoghi(Array.isArray(data.luoghi) ? data.luoghi : puliti);
      setDirty(false);
      showToast("Luoghi salvati");
    } catch (err) {
      showToast(err.message || "Errore", true);
    } finally {
      setSaving(false);
    }
  };

  const reset = () => {
    if (!window.confirm("Ripristinare Sala, Giardino, Dehor?")) return;
    setLuoghi(["Sala", "Giardino", "Dehor"]);
    setDirty(true);
  };

  if (loading) return <div className="py-12 text-center text-neutral-400">Caricamento...</div>;

  return (
    <>
      <h1 className="text-2xl font-bold text-neutral-900 mb-2">Luoghi Preventivi</h1>
      <p className="text-sm text-neutral-500 mb-6">
        Sale e spazi proposti nei preventivi eventi. Ordine e nomi qui configurati appaiono nel form scheda preventivo.
      </p>

      <div className="bg-white rounded-xl border border-neutral-200 shadow-sm overflow-hidden mb-6">
        <div className="px-5 py-3 bg-neutral-50 border-b border-neutral-100">
          <h2 className="text-sm font-semibold text-neutral-800">Elenco luoghi</h2>
        </div>

        {luoghi.length === 0 ? (
          <EmptyState icon="📍" title="Nessun luogo configurato" description="Aggiungi le sale e gli spazi per gli eventi." compact />
        ) : (
          <div className="divide-y divide-neutral-100">
            {luoghi.map((l, i) => (
              <div key={i} className="px-5 py-2.5 flex items-center gap-3 hover:bg-neutral-50 transition">
                <span className="text-xs text-neutral-400 w-6 text-center">{i + 1}</span>
                <input
                  type="text"
                  value={l}
                  onChange={(e) => rinomina(i, e.target.value)}
                  className="flex-1 border border-neutral-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 focus:border-indigo-400"
                />
                <button
                  onClick={() => muovi(i, -1)}
                  disabled={i === 0}
                  title="Sposta su"
                  className="px-2 py-1 text-neutral-400 hover:text-neutral-700 disabled:opacity-30"
                >▲</button>
                <button
                  onClick={() => muovi(i, +1)}
                  disabled={i === luoghi.length - 1}
                  title="Sposta giù"
                  className="px-2 py-1 text-neutral-400 hover:text-neutral-700 disabled:opacity-30"
                >▼</button>
                <button
                  onClick={() => rimuovi(i)}
                  title="Rimuovi"
                  className="px-2 py-1 text-red-300 hover:text-red-600"
                >✕</button>
              </div>
            ))}
          </div>
        )}

        {/* Aggiungi nuovo */}
        <div className="px-5 py-3 bg-neutral-50 border-t border-neutral-100 flex items-center gap-2">
          <input
            type="text"
            value={nuovo}
            onChange={(e) => setNuovo(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); aggiungi(); } }}
            placeholder="Nuovo luogo (es. Privé, Cantina…)"
            className="flex-1 border border-neutral-300 rounded-lg px-3 py-1.5 text-sm"
          />
          <Btn variant="primary" size="sm" onClick={aggiungi} disabled={!nuovo.trim()}>+ Aggiungi</Btn>
        </div>
      </div>

      {/* Azioni */}
      <div className="flex items-center justify-between">
        <Btn variant="ghost" size="sm" onClick={reset}>
          Ripristina default (Sala, Giardino, Dehor)
        </Btn>
        <div className="flex items-center gap-3">
          {dirty && <span className="text-xs text-amber-600 font-medium">Modifiche non salvate</span>}
          <Btn variant="success" size="md" onClick={salva} disabled={!dirty || saving} loading={saving}>
            Salva
          </Btn>
        </div>
      </div>

      {toast && (
        <div className={`fixed bottom-4 right-4 px-4 py-2 rounded-lg shadow-lg text-sm font-medium z-50 ${
          toast.isError ? "bg-red-600 text-white" : "bg-emerald-600 text-white"
        }`} onClick={() => setToast(null)}>
          {toast.msg}
        </div>
      )}
    </>
  );
}
