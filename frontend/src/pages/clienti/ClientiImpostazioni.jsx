// @version: v2.7 — sezione «Template di risposta» (risposte ai clienti coi blocchi vivi, mig 246) (2026-11-26); v2.6 — sezione «Rubrica telefono» (CardDAV, accessi per telefono) (2026-11-16); v2.5 — «Segmenti e stelle»: soglie dei segmenti nuovi e delle stelle (nere, argento), conteggi, Ricalcola adesso (2026-11-16); v2.4 — Preventivi: indirizzo staff (CC), Rispondi a, giorni di scadenza/avviso/proroga, ruoli avvisati (2026-11-03); v2.3 — sezione WhatsApp (sola lettura, coexistence Meta); v2.2 — copia per email dei preventivi inviati (in «Luoghi preventivi»); v2.1-mattoni — M.I primitives (Btn, EmptyState), bg brand-cream, focus ring brand
// Layout Impostazioni CRM: sidebar sinistra + sezioni (segmenti, import, duplicati, mailchimp)
import React, { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { API_BASE, apiFetch } from "../../config/api";
import ClientiNav from "./ClientiNav";
import ClientiImport from "./ClientiImport";
import ClientiDuplicati from "./ClientiDuplicati";
import ClientiMailchimp from "./ClientiMailchimp";
import ClientiMenuTemplates from "./ClientiMenuTemplates";
import ClientiWhatsApp from "./ClientiWhatsApp";
import ClientiRubrica from "./ClientiRubrica";
import ClientiRisposteTemplate from "./ClientiRisposteTemplate";
import { Btn, EmptyState } from "../../components/ui";
import { ORDINE_SEGMENTI, SegmentoPill, Stelle } from "./ProfiloCliente";

// ── Sidebar items ──
const SECTIONS = [
  { key: "segmenti", label: "Segmenti e stelle", icon: "⭐", desc: "Segmenti, stelle nere e argento" },
  { key: "template_preventivi", label: "Template Preventivi", icon: "📋", desc: "Menu e condizioni riutilizzabili" },
  { key: "menu_templates", label: "Menu Template", icon: "🍽️", desc: "Libreria menu riutilizzabili sui preventivi" },
  { key: "risposte_template", label: "Template di risposta", icon: "✉️", desc: "Risposte pronte per mail e WhatsApp, con menù e disponibilità" },
  { key: "luoghi_preventivi", label: "Luoghi Preventivi", icon: "📍", desc: "Sale e spazi per eventi (Sala, Giardino, Dehor…)" },
  { key: "import", label: "Import / Export", icon: "📥", desc: "TheFork, CSV, revisione diff" },
  { key: "duplicati", label: "Duplicati", icon: "🔄", desc: "Trova e unisci duplicati" },
  { key: "mailchimp", label: "Mailchimp", icon: "📬", desc: "Sync contatti e campagne" },
  { key: "whatsapp", label: "WhatsApp", icon: "💬", desc: "Chat del locale in sola lettura per il giro" },
  { key: "rubrica", label: "Rubrica telefono", icon: "📱", desc: "I clienti con stelle nei contatti del telefono" },
];

// ── Soglie di segmenti e stelle (clienti_impostazioni, mig 236 — 2026-11-16) ──
const SOGLIE_SEGMENTI = [
  { chiave: "seg_dicasa_visite", label: "Di casa — visite almeno", desc: "nella finestra qui sotto", min: 1, max: 50 },
  { chiave: "seg_dicasa_mesi", label: "Di casa — finestra (mesi)", min: 1, max: 60 },
  { chiave: "seg_affezionato_visite", label: "Affezionato — visite almeno", desc: "nella finestra qui sotto", min: 1, max: 50 },
  { chiave: "seg_affezionato_mesi", label: "Affezionato — finestra (mesi)", min: 1, max: 60 },
  { chiave: "seg_attivo_mesi", label: "Affezionato — ultima visita entro (mesi)", desc: "oltre, chi tornava diventa «In calo»", min: 1, max: 60 },
  { chiave: "seg_recente_mesi", label: "Una volta / In calo — ultima visita entro (mesi)", desc: "oltre diventa «Dormiente»", min: 1, max: 120 },
  { chiave: "seg_perso_anni", label: "Perso — ultima visita oltre (anni)", min: 1, max: 20 },
  { chiave: "seg_nuovo_giorni", label: "Nuovo — prima e unica visita entro (giorni)", min: 7, max: 365 },
];
const SOGLIE_STELLE = [
  { chiave: "stelle_mesi_recenti", label: "Visite recenti = ultimi (mesi)", min: 1, max: 120 },
  { chiave: "stelle_punti_recente", label: "Punti per visita recente", min: 0, max: 100 },
  { chiave: "stelle_max_recenti", label: "Tetto punti visite recenti", min: 0, max: 1000 },
  { chiave: "stelle_punti_vecchia", label: "Punti per visita più vecchia", min: 0, max: 100 },
  { chiave: "stelle_max_vecchie", label: "Tetto punti visite vecchie", min: 0, max: 1000 },
  { chiave: "stelle_punti_evento", label: "Punti per evento confermato (preventivo)", min: 0, max: 200 },
  { chiave: "stelle_malus_noshow", label: "Punti tolti per ogni no-show", min: 0, max: 200 },
  { chiave: "stelle_soglia_1", label: "★ dai punti", min: 1, max: 1000 },
  { chiave: "stelle_soglia_2", label: "★★ dai punti", min: 1, max: 1000 },
  { chiave: "stelle_soglia_3", label: "★★★ dai punti", min: 1, max: 1000 },
  { chiave: "argento_soglia_1", label: "Argento ★ — scontrino medio a coperto (€)", min: 1, max: 1000 },
  { chiave: "argento_soglia_2", label: "Argento ★★ — scontrino medio a coperto (€)", min: 1, max: 1000 },
  { chiave: "attenzione_noshow", label: "«Attenzione» dai no-show", min: 1, max: 50 },
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
              {section === "whatsapp" && <ClientiWhatsApp />}
              {section === "rubrica" && <ClientiRubrica />}
              {section === "risposte_template" && <ClientiRisposteTemplate />}
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
  const [conteggi, setConteggi] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState(null);
  const [dirty, setDirty] = useState(false);

  const showToast = (message, type = "success") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  const fetchConteggi = () =>
    apiFetch(`${API_BASE}/clienti/segmenti/conteggi`).then((r) => (r.ok ? r.json() : null)).then(setConteggi).catch(() => {});

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

  useEffect(() => { fetchImpostazioni(); fetchConteggi(); }, []);

  const handleChange = (chiave, valore) => {
    setImpostazioni((prev) => ({ ...prev, [chiave]: valore }));
    setDirty(true);
  };

  const ricalcola = async () => {
    const res = await apiFetch(`${API_BASE}/clienti/profilo/ricalcola`, { method: "POST" });
    if (!res.ok) throw new Error(res.status === 403 ? "Il ricalcolo lo fa l'amministratore" : "Ricalcolo non riuscito");
    await fetchConteggi();
  };

  const handleSave = async () => {
    const n = (k) => parseFloat(impostazioni[k]);
    if (!(n("stelle_soglia_1") < n("stelle_soglia_2") && n("stelle_soglia_2") < n("stelle_soglia_3"))) {
      showToast("Le soglie delle stelle nere devono crescere: ★ < ★★ < ★★★", "error");
      return;
    }
    if (!(n("argento_soglia_1") < n("argento_soglia_2"))) {
      showToast("La seconda stella argento deve avere una soglia più alta della prima", "error");
      return;
    }
    setSaving(true);
    try {
      const body = {};
      [...SOGLIE_SEGMENTI, ...SOGLIE_STELLE].forEach((c) => {
        if (impostazioni[c.chiave] !== undefined) body[c.chiave] = impostazioni[c.chiave];
      });
      const res = await apiFetch(`${API_BASE}/clienti/impostazioni`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error("Errore salvataggio");
      await ricalcola();
      showToast("Salvate: stelle e segmenti ricalcolati");
      setDirty(false);
    } catch (err) {
      showToast(err.message, "error");
    } finally {
      setSaving(false);
    }
  };

  const ricalcolaAdesso = async () => {
    setSaving(true);
    try { await ricalcola(); showToast("Stelle e segmenti ricalcolati"); }
    catch (err) { showToast(err.message, "error"); }
    finally { setSaving(false); }
  };

  if (loading) return <div className="text-center py-12 text-neutral-400">Caricamento...</div>;

  const campo = (cfg) => (
    <div key={cfg.chiave} className="flex items-center gap-4">
      <div className="flex-1">
        <label htmlFor={`s-${cfg.chiave}`} className="block text-sm font-medium text-neutral-800">{cfg.label}</label>
        {cfg.desc && <p className="text-xs text-neutral-500 mt-0.5">{cfg.desc}</p>}
      </div>
      <input id={`s-${cfg.chiave}`} type="number" min={cfg.min} max={cfg.max}
        value={impostazioni[cfg.chiave] ?? ""}
        onChange={(e) => handleChange(cfg.chiave, e.target.value)}
        className="w-20 px-3 py-1.5 border border-neutral-300 rounded-lg text-sm text-center focus:outline-none focus:ring-2 focus:ring-teal-300 focus:border-teal-400" />
    </div>
  );
  const nf = (v) => (v || 0).toLocaleString("it-IT");

  return (
    <>
      <h1 className="text-2xl font-bold text-neutral-900 mb-2">Segmenti e stelle</h1>
      <p className="text-sm text-neutral-500 mb-6">
        Il <b>segmento</b> dice a che punto è il rapporto col cliente; le <b>stelle</b> quanto vale per noi:
        nere per quanto viene, argento per quanto spende, oro la mette solo il superadmin dalla scheda (i VIP di TheFork ce l'hanno in automatico, finché non gliela togli).
        Si ricalcolano ogni notte e quando salvi qui. Il rank di TheFork resta in scheda solo come informazione.
      </p>

      {conteggi && (
        <div className="bg-white rounded-xl border border-neutral-200 shadow-sm p-5 mb-6">
          <div className="flex items-center justify-between gap-3 mb-3">
            <h2 className="text-sm font-semibold text-neutral-800">Oggi</h2>
            <span className="text-xs text-neutral-500">{conteggi.aggiornato ? `calcolati il ${conteggi.aggiornato.slice(8, 10)}/${conteggi.aggiornato.slice(5, 7)} alle ${conteggi.aggiornato.slice(11, 16)}` : "mai calcolati"}</span>
          </div>
          <div className="flex flex-wrap gap-2 mb-3">
            {ORDINE_SEGMENTI.map((k) => (
              <span key={k} className="inline-flex items-center gap-1.5"><SegmentoPill segmento={k} /><span className="text-sm text-neutral-600 tabular-nums">{nf(conteggi[k])}</span></span>
            ))}
          </div>
          <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm text-neutral-700">
            {[1, 2, 3].map((n) => (
              <span key={`n${n}`} className="inline-flex items-center gap-1.5"><Stelle nere={n} /> {nf(conteggi.stelle_nere?.[String(n)])}</span>
            ))}
            {[1, 2].map((n) => (
              <span key={`a${n}`} className="inline-flex items-center gap-1.5"><Stelle argento={n} /> {nf(conteggi.stelle_argento?.[String(n)])}</span>
            ))}
            <span className="inline-flex items-center gap-1.5"><Stelle oro={1} /> {nf(conteggi.oro)}</span>
            <span className="text-red-700">Attenzione {nf(conteggi.attenzione)}</span>
          </div>
        </div>
      )}

      <div className="bg-white rounded-xl border border-neutral-200 shadow-sm overflow-hidden mb-6">
        <div className="px-5 py-3 bg-neutral-50 border-b border-neutral-100"><h2 className="text-sm font-semibold text-neutral-800">Segmenti</h2></div>
        <div className="p-5 space-y-4">{SOGLIE_SEGMENTI.map(campo)}</div>
        <div className="px-5 pb-5 text-xs text-neutral-500 space-y-0.5">
          <div>Ordine: Nuovo → Di casa → Affezionato → In calo / Una volta → Dormiente → Perso. «Mai venuto» = nessuna visita registrata.</div>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-neutral-200 shadow-sm overflow-hidden mb-6">
        <div className="px-5 py-3 bg-neutral-50 border-b border-neutral-100"><h2 className="text-sm font-semibold text-neutral-800">Stelle</h2></div>
        <div className="p-5 space-y-4">{SOGLIE_STELLE.map(campo)}</div>
        <div className="px-5 pb-5 text-xs text-neutral-500">
          La spesa viene dai conti di cassa abbinati al cliente (da settembre 2024): chi non ne ha non prende stelle argento, non perché spenda poco.
        </div>
      </div>

      <div className="flex items-center justify-between gap-3">
        <Btn variant="ghost" size="md" onClick={ricalcolaAdesso} disabled={saving}>Ricalcola adesso</Btn>
        <div className="flex items-center gap-3">
          {dirty && <span className="text-xs text-amber-600 font-medium">Modifiche non salvate</span>}
          <Btn variant="success" size="md" onClick={handleSave} disabled={!dirty || saving} loading={saving}>Salva e ricalcola</Btn>
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

  // Impostazioni dei preventivi (2026-11-03): staff in CC, Rispondi a, scadenza, avvisi
  const CAMPI_PREV = ["preventivi_email_copia", "preventivi_reply_to", "preventivi_scadenza_giorni",
    "preventivi_avviso_giorni", "preventivi_proroga_giorni", "preventivi_avviso_ruoli"];
  const [cfgPrev, setCfgPrev] = useState(null);
  const [cfgPrevSalvata, setCfgPrevSalvata] = useState(null);
  useEffect(() => {
    apiFetch(`${API_BASE}/preventivi/config/impostazioni`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d) { const v = Object.fromEntries(CAMPI_PREV.map((k) => [k, d[k] ?? ""])); setCfgPrev(v); setCfgPrevSalvata(v); } })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const cfgPrevDirty = cfgPrev && JSON.stringify(cfgPrev) !== JSON.stringify(cfgPrevSalvata);
  const salvaCfgPrev = async () => {
    try {
      const res = await apiFetch(`${API_BASE}/preventivi/config/impostazioni`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(cfgPrev),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.detail || "Errore salvataggio");
      const v = Object.fromEntries(CAMPI_PREV.map((k) => [k, d[k] ?? ""]));
      setCfgPrev(v); setCfgPrevSalvata(v);
      showToast("Impostazioni preventivi salvate");
    } catch (err) {
      showToast(err.message || "Errore", true);
    }
  };

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

      <div className="bg-white rounded-xl border border-neutral-200 shadow-sm overflow-hidden mb-6">
        <div className="px-5 py-3 bg-neutral-50 border-b border-neutral-100 flex items-center justify-between gap-3">
          <h2 className="text-sm font-semibold text-neutral-800">Email, scadenze e avvisi dei preventivi</h2>
          {cfgPrev && <Btn variant="primary" size="sm" onClick={salvaCfgPrev} disabled={!cfgPrevDirty}>Salva</Btn>}
        </div>
        {cfgPrev && (
          <div className="px-5 py-4 grid grid-cols-1 md:grid-cols-2 gap-4">
              <label className="block">
                <span className="text-xs font-semibold text-neutral-700">Indirizzo staff (CC)</span>
                <input type="text" value={cfgPrev.preventivi_email_copia} placeholder="prenotazioni@…"
                  onChange={(e) => setCfgPrev({ ...cfgPrev, preventivi_email_copia: e.target.value })}
                  className="mt-1 w-full border border-neutral-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 focus:border-indigo-400" />
                <span className="text-[11px] text-neutral-500">In CC visibile nelle email al cliente; copia col PDF dei preventivi mandati su WhatsApp; email degli avvisi di scadenza. Più indirizzi separati da virgola.</span>
              </label>
              <label className="block">
                <span className="text-xs font-semibold text-neutral-700">Rispondi a</span>
                <input type="text" value={cfgPrev.preventivi_reply_to} placeholder="vuoto = la casella che manda"
                  onChange={(e) => setCfgPrev({ ...cfgPrev, preventivi_reply_to: e.target.value })}
                  className="mt-1 w-full border border-neutral-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 focus:border-indigo-400" />
                <span className="text-[11px] text-neutral-500">Dove vanno le risposte del cliente. Vuoto = la casella che manda.</span>
              </label>
              <label className="block">
                <span className="text-xs font-semibold text-neutral-700">Giorni per confermare</span>
                <input type="number" value={cfgPrev.preventivi_scadenza_giorni} placeholder=""
                  onChange={(e) => setCfgPrev({ ...cfgPrev, preventivi_scadenza_giorni: e.target.value })}
                  className="mt-1 w-full border border-neutral-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 focus:border-indigo-400" />
                <span className="text-[11px] text-neutral-500">Scadenza proposta su un preventivo nuovo: oggi + questi giorni (si cambia a mano nel preventivo).</span>
              </label>
              <label className="block">
                <span className="text-xs font-semibold text-neutral-700">Avviso prima della scadenza (giorni)</span>
                <input type="number" value={cfgPrev.preventivi_avviso_giorni} placeholder=""
                  onChange={(e) => setCfgPrev({ ...cfgPrev, preventivi_avviso_giorni: e.target.value })}
                  className="mt-1 w-full border border-neutral-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 focus:border-indigo-400" />
                <span className="text-[11px] text-neutral-500">Avviso allo staff questi giorni prima, e poi il giorno della scadenza. 0 = solo il giorno stesso.</span>
              </label>
              <label className="block">
                <span className="text-xs font-semibold text-neutral-700">Giorni di proroga</span>
                <input type="number" value={cfgPrev.preventivi_proroga_giorni} placeholder=""
                  onChange={(e) => setCfgPrev({ ...cfgPrev, preventivi_proroga_giorni: e.target.value })}
                  className="mt-1 w-full border border-neutral-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 focus:border-indigo-400" />
                <span className="text-[11px] text-neutral-500">Proposti dal tasto «Proroga» nel preventivo.</span>
              </label>
              <label className="block">
                <span className="text-xs font-semibold text-neutral-700">Chi riceve gli avvisi nel campanello</span>
                <input type="text" value={cfgPrev.preventivi_avviso_ruoli} placeholder=""
                  onChange={(e) => setCfgPrev({ ...cfgPrev, preventivi_avviso_ruoli: e.target.value })}
                  className="mt-1 w-full border border-neutral-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 focus:border-indigo-400" />
                <span className="text-[11px] text-neutral-500">Ruoli separati da virgola (es. admin, capo_sala, sala).</span>
              </label>
          </div>
        )}
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
