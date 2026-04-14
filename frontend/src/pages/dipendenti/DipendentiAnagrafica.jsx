// FILE: frontend/src/pages/dipendenti/DipendentiAnagrafica.jsx
// @version: v2.1-dipendenti-anagrafica (reparto + colore per Turni v2)
// Layout: header bar + sidebar lista + dettaglio con tabs (Dati / Documenti)
import React, { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { API_BASE, apiFetch } from "../../config/api";

const RUOLI = [
  "Sala - Cameriere", "Sala - Chef de Rang", "Sala - Sommelier",
  "Cucina - Chef", "Cucina - Sous Chef", "Cucina - Commis",
  "Bar - Barista", "Altro",
];

const DOC_CATEGORIE = [
  { value: "CONTRATTO", label: "Contratto", icon: "\uD83D\uDCDD" },
  { value: "CORSO", label: "Corso/Formazione", icon: "\uD83C\uDF93" },
  { value: "CERTIFICATO", label: "Certificato", icon: "\uD83D\uDCC3" },
  { value: "CEDOLINO", label: "Cedolino", icon: "\uD83D\uDCCB" },
  { value: "ALTRO", label: "Altro", icon: "\uD83D\uDCCE" },
];

const EMPTY_FORM = {
  id: null, codice: "", nome: "", cognome: "", ruolo: "",
  telefono: "", email: "", iban: "",
  indirizzo_via: "", indirizzo_cap: "", indirizzo_citta: "", indirizzo_provincia: "",
  note: "", attivo: true,
  reparto_id: null, colore: "",
};

// Palette suggerita per assegnazione colore univoco dipendente (Turni v2)
const PALETTE_DIPENDENTI = [
  "#E8402B", "#2EB872", "#2E7BE8", "#F59E0B", "#A855F7",
  "#EC4899", "#14B8A6", "#6366F1", "#84CC16", "#F97316",
  "#0EA5E9", "#DC2626", "#059669", "#7C3AED", "#DB2777",
  "#0891B2", "#CA8A04", "#4F46E5", "#16A34A", "#BE185D",
];

export default function DipendentiAnagrafica() {
  const navigate = useNavigate();
  const [dipendenti, setDipendenti] = useState([]);
  const [reparti, setReparti] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState("");

  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [tab, setTab] = useState("dati"); // "dati" | "documenti"

  // Documenti
  const [docs, setDocs] = useState([]);
  const [docsLoading, setDocsLoading] = useState(false);
  const [docCategoria, setDocCategoria] = useState("CONTRATTO");
  const [docDescrizione, setDocDescrizione] = useState("");
  const [docFile, setDocFile] = useState(null);
  const [docUploading, setDocUploading] = useState(false);

  const jsonHeaders = { "Content-Type": "application/json" };

  // ── FETCH ──
  const loadDipendenti = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const res = await apiFetch(`${API_BASE}/dipendenti/?include_inactive=true`);
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).detail || "Errore");
      const data = await res.json();
      setDipendenti(Array.isArray(data) ? data : []);
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { loadDipendenti(); }, [loadDipendenti]);

  // Carica reparti attivi per la select
  useEffect(() => {
    apiFetch(`${API_BASE}/reparti/?include_inactive=false`)
      .then(r => r.ok ? r.json() : [])
      .then(data => setReparti(Array.isArray(data) ? data : []))
      .catch(() => setReparti([]));
  }, []);

  // Colori già in uso (per segnalare conflitti)
  const coloriUsati = React.useMemo(() => {
    const map = new Map();
    dipendenti.forEach(d => {
      if (d.colore && d.id !== form.id) map.set(d.colore.toUpperCase(), d);
    });
    return map;
  }, [dipendenti, form.id]);

  const loadDocumenti = async (dipId) => {
    if (!dipId) return;
    setDocsLoading(true);
    try {
      const res = await apiFetch(`${API_BASE}/dipendenti/${dipId}/documenti`);
      if (res.ok) setDocs(await res.json());
      else setDocs([]);
    } catch { setDocs([]); }
    finally { setDocsLoading(false); }
  };

  // ── SELECT / NEW ──
  const handleSelect = (d) => {
    setForm({
      id: d.id, codice: d.codice || "", nome: d.nome || "", cognome: d.cognome || "",
      ruolo: d.ruolo || "", telefono: d.telefono || "", email: d.email || "",
      iban: d.iban || "", indirizzo_via: d.indirizzo_via || "",
      indirizzo_cap: d.indirizzo_cap || "", indirizzo_citta: d.indirizzo_citta || "",
      indirizzo_provincia: d.indirizzo_provincia || "",
      note: d.note || "", attivo: d.attivo ?? true,
      reparto_id: d.reparto_id ?? null, colore: d.colore || "",
    });
    loadDocumenti(d.id);
    setTab("dati");
  };

  const handleNew = () => {
    setForm(EMPTY_FORM);
    setDocs([]);
    setTab("dati");
  };

  const handleChange = (f, v) => setForm(p => ({ ...p, [f]: v }));

  // ── SAVE ──
  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true); setError(null);
    const payload = {
      codice: form.codice, nome: form.nome, cognome: form.cognome,
      ruolo: form.ruolo, telefono: form.telefono || null,
      email: form.email || null, iban: form.iban || null,
      indirizzo_via: form.indirizzo_via || null,
      indirizzo_cap: form.indirizzo_cap || null,
      indirizzo_citta: form.indirizzo_citta || null,
      indirizzo_provincia: form.indirizzo_provincia || null,
      note: form.note || null, attivo: !!form.attivo,
      reparto_id: form.reparto_id || null,
      colore: form.colore || null,
    };
    const isEdit = !!form.id;
    try {
      const res = await apiFetch(
        isEdit ? `${API_BASE}/dipendenti/${form.id}` : `${API_BASE}/dipendenti`,
        { method: isEdit ? "PUT" : "POST", headers: jsonHeaders, body: JSON.stringify(payload) }
      );
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).detail || "Errore");
      const saved = await res.json();
      if (isEdit) setDipendenti(p => p.map(d => d.id === saved.id ? saved : d));
      else { setDipendenti(p => [...p, saved]); setForm(f => ({ ...f, id: saved.id })); }
    } catch (e) { setError(e.message); }
    finally { setSaving(false); }
  };

  // ── DISATTIVA ──
  const handleDisattiva = async (id) => {
    if (!confirm("Disattivare questo dipendente?")) return;
    try {
      await apiFetch(`${API_BASE}/dipendenti/${id}`, { method: "DELETE" });
      setDipendenti(p => p.map(d => d.id === id ? { ...d, attivo: false } : d));
      if (form.id === id) setForm(p => ({ ...p, attivo: false }));
    } catch (e) { setError(e.message); }
  };

  // ── DOCUMENTI: Upload ──
  const handleUploadDoc = async (e) => {
    e.preventDefault();
    if (!form.id || !docFile) return;
    setDocUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", docFile);
      const params = new URLSearchParams({ categoria: docCategoria });
      if (docDescrizione) params.set("descrizione", docDescrizione);
      const res = await apiFetch(
        `${API_BASE}/dipendenti/${form.id}/documenti?${params}`,
        { method: "POST", body: fd }
      );
      if (res.ok) {
        const nuovo = await res.json();
        setDocs(p => [nuovo, ...p]);
        setDocFile(null); setDocDescrizione("");
      }
    } catch (e) { console.error(e); }
    finally { setDocUploading(false); }
  };

  // ── DOCUMENTI: Delete ──
  const handleDeleteDoc = async (docId) => {
    if (!confirm("Eliminare questo documento?")) return;
    try {
      await apiFetch(`${API_BASE}/dipendenti/documenti/${docId}`, { method: "DELETE" });
      setDocs(p => p.filter(d => d.id !== docId));
    } catch (e) { console.error(e); }
  };

  // ── DOCUMENTI: Download cedolino PDF ──
  const handleDownloadCedolino = (bpId) => {
    const token = localStorage.getItem("token");
    fetch(`${API_BASE}/dipendenti/buste-paga/${bpId}/pdf`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    }).then(r => r.blob()).then(blob => {
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank");
    });
  };

  // ── FILTRO LISTA ──
  const filtered = dipendenti.filter(d => {
    if (!search) return true;
    const s = search.toLowerCase();
    return `${d.cognome} ${d.nome} ${d.ruolo} ${d.codice}`.toLowerCase().includes(s);
  });

  const docCategIcon = (cat) => DOC_CATEGORIE.find(c => c.value === cat)?.icon || "\uD83D\uDCCE";

  return (
    <div className="min-h-screen bg-brand-cream">
      {/* ── HEADER ── */}
      <div className="bg-white border-b border-neutral-200 px-4 py-2.5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate("/dipendenti")}
            className="text-neutral-400 hover:text-neutral-600 text-sm">{"\u2190"}</button>
          <h1 className="text-lg font-bold text-purple-900 font-playfair">{"\uD83D\uDC65"} Anagrafica Dipendenti</h1>
          <span className="text-[10px] text-neutral-400">{dipendenti.filter(d => d.attivo).length} attivi</span>
        </div>
        <button onClick={handleNew}
          className="px-3 py-1.5 rounded-lg bg-purple-600 text-white text-xs font-semibold hover:bg-purple-700">
          + Nuovo dipendente
        </button>
      </div>

      {error && (
        <div className="mx-4 mt-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">
          {error}
          <button onClick={() => setError(null)} className="ml-2 text-red-500">{"\u00D7"}</button>
        </div>
      )}

      <div className="flex" style={{ height: "calc(100dvh - 49px)" }}>
        {/* ── SIDEBAR LISTA ── */}
        <div className="w-72 bg-white border-r border-neutral-200 flex flex-col">
          <div className="p-3 border-b border-neutral-100">
            <input type="text" placeholder="Cerca dipendente..." value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full px-3 py-1.5 border border-neutral-200 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-purple-300" />
          </div>
          <div className="flex-1 overflow-y-auto">
            {loading ? (
              <div className="p-3 text-xs text-neutral-400">Caricamento...</div>
            ) : filtered.length === 0 ? (
              <div className="p-3 text-xs text-neutral-400">Nessun dipendente.</div>
            ) : filtered.map(d => {
              const rep = reparti.find(r => r.id === d.reparto_id);
              return (
                <div key={d.id}
                  onClick={() => handleSelect(d)}
                  className={`px-3 py-2.5 border-b border-neutral-50 cursor-pointer transition text-xs
                    ${form.id === d.id ? "bg-purple-50 border-l-2 border-l-purple-500" : "hover:bg-neutral-50"}
                    ${!d.attivo ? "opacity-50" : ""}`}>
                  <div className="flex items-center gap-2">
                    <span
                      className="inline-block rounded-full flex-shrink-0"
                      style={{
                        width: 10, height: 10,
                        backgroundColor: d.colore || "#e5e5e5",
                        border: d.colore ? "none" : "1px dashed #bbb",
                      }}
                      title={d.colore || "Nessun colore"}
                    />
                    <div className="font-medium text-neutral-800 truncate">{d.cognome} {d.nome}</div>
                  </div>
                  <div className="flex items-center gap-2 mt-0.5 ml-[18px]">
                    {rep && <span className="text-[9px] px-1 rounded bg-neutral-100 text-neutral-600">{rep.icona}{rep.codice}</span>}
                    <span className="text-neutral-500 truncate">{d.ruolo}</span>
                    <span className="text-neutral-300">{"\u00B7"}</span>
                    <span className="text-neutral-400 font-mono">{d.codice}</span>
                    {!d.attivo && (
                      <span className="text-[9px] bg-neutral-200 text-neutral-600 px-1 rounded">inattivo</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* ── AREA DETTAGLIO ── */}
        <div className="flex-1 overflow-y-auto">
          {!form.id && !form.codice ? (
            <div className="flex items-center justify-center h-full text-neutral-400 text-sm">
              Seleziona un dipendente dalla lista o creane uno nuovo
            </div>
          ) : (
            <div className="p-5 max-w-3xl">
              {/* Nome dipendente + badge */}
              <div className="flex items-center gap-3 mb-4">
                <h2 className="text-xl font-bold text-neutral-800 font-playfair">
                  {form.id ? `${form.cognome} ${form.nome}` : "Nuovo dipendente"}
                </h2>
                {form.id && (
                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                    form.attivo ? "bg-emerald-100 text-emerald-700" : "bg-neutral-200 text-neutral-600"
                  }`}>
                    {form.attivo ? "Attivo" : "Disattivo"}
                  </span>
                )}
              </div>

              {/* TABS */}
              <div className="flex gap-1 mb-4 border-b border-neutral-200">
                {[
                  { key: "dati", label: "Dati anagrafici" },
                  { key: "documenti", label: `Documenti (${docs.length})` },
                ].map(t => (
                  <button key={t.key} onClick={() => setTab(t.key)}
                    className={`px-4 py-2 text-xs font-medium border-b-2 transition ${
                      tab === t.key
                        ? "border-purple-600 text-purple-700"
                        : "border-transparent text-neutral-500 hover:text-neutral-700"
                    }`}>
                    {t.label}
                  </button>
                ))}
              </div>

              {/* ════════════════════════════════════════
                  TAB: DATI ANAGRAFICI
                  ════════════════════════════════════════ */}
              {tab === "dati" && (
                <form onSubmit={handleSave} className="space-y-4">
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Codice" value={form.codice}
                      onChange={v => handleChange("codice", v)} placeholder="DIP001" required />
                    <div>
                      <label className="block text-[10px] text-neutral-500 font-medium mb-1">Ruolo</label>
                      <select value={form.ruolo} onChange={e => handleChange("ruolo", e.target.value)}
                        className="w-full px-3 py-2 border border-neutral-200 rounded-lg text-sm bg-white" required>
                        <option value="">Seleziona...</option>
                        {RUOLI.map(r => <option key={r} value={r}>{r}</option>)}
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Nome" value={form.nome} onChange={v => handleChange("nome", v)} required />
                    <Field label="Cognome" value={form.cognome} onChange={v => handleChange("cognome", v)} required />
                  </div>

                  {/* ── Turni v2: Reparto + Colore ── */}
                  <div className="border-t border-neutral-100 pt-3">
                    <p className="text-[10px] text-neutral-400 font-medium mb-2 uppercase">
                      Turni — Reparto e colore
                    </p>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-[10px] text-neutral-500 font-medium mb-1">Reparto</label>
                        <select
                          value={form.reparto_id || ""}
                          onChange={e => handleChange("reparto_id", e.target.value ? Number(e.target.value) : null)}
                          className="w-full px-3 py-2 border border-neutral-200 rounded-lg text-sm bg-white">
                          <option value="">— non assegnato —</option>
                          {reparti.map(r => (
                            <option key={r.id} value={r.id}>
                              {r.icona ? `${r.icona} ` : ""}{r.nome}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-[10px] text-neutral-500 font-medium mb-1">Colore univoco (turni)</label>
                        <div className="flex items-center gap-2">
                          <input
                            type="color"
                            value={form.colore || "#999999"}
                            onChange={e => handleChange("colore", e.target.value.toUpperCase())}
                            className="h-9 w-12 border border-neutral-200 rounded-lg cursor-pointer"
                          />
                          <input
                            type="text"
                            value={form.colore || ""}
                            onChange={e => handleChange("colore", e.target.value.toUpperCase())}
                            className="flex-1 px-3 py-2 border border-neutral-200 rounded-lg text-xs font-mono"
                            placeholder="#E8402B"
                            maxLength={7}
                          />
                          {form.colore && (
                            <button type="button"
                              onClick={() => handleChange("colore", "")}
                              className="text-neutral-400 hover:text-red-600 text-xs"
                              title="Rimuovi">{"\u00D7"}</button>
                          )}
                        </div>
                        {form.colore && coloriUsati.has(form.colore.toUpperCase()) && (
                          <p className="text-[10px] text-amber-600 mt-1">
                            {"\u26A0\uFE0F"} Già usato da {coloriUsati.get(form.colore.toUpperCase()).nome} {coloriUsati.get(form.colore.toUpperCase()).cognome}
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Palette rapida */}
                    <div className="mt-2">
                      <p className="text-[10px] text-neutral-400 mb-1">Palette suggerita:</p>
                      <div className="flex flex-wrap gap-1.5">
                        {PALETTE_DIPENDENTI.map(hex => {
                          const used = coloriUsati.has(hex);
                          const selected = form.colore?.toUpperCase() === hex;
                          return (
                            <button
                              key={hex}
                              type="button"
                              onClick={() => handleChange("colore", hex)}
                              className={`relative rounded-md transition ${
                                selected ? "ring-2 ring-offset-1 ring-neutral-800" : ""
                              }`}
                              style={{
                                backgroundColor: hex,
                                width: 28,
                                height: 28,
                                opacity: used && !selected ? 0.35 : 1,
                              }}
                              title={used ? `${hex} (già usato)` : hex}
                            >
                              {selected && (
                                <span className="absolute inset-0 flex items-center justify-center text-white text-xs font-bold">{"\u2713"}</span>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Telefono" value={form.telefono} onChange={v => handleChange("telefono", v)}
                      placeholder="+39..." type="tel" />
                    <Field label="Email" value={form.email} onChange={v => handleChange("email", v)}
                      placeholder="nome@mail.it" type="email" />
                  </div>

                  <Field label="IBAN" value={form.iban} onChange={v => handleChange("iban", v)}
                    placeholder="IT00 X000 0000 0000 0000 0000 000" mono />

                  <div className="border-t border-neutral-100 pt-3">
                    <p className="text-[10px] text-neutral-400 font-medium mb-2 uppercase">Indirizzo</p>
                    <Field label="Via e numero" value={form.indirizzo_via}
                      onChange={v => handleChange("indirizzo_via", v)} placeholder="Via Roma 10" />
                    <div className="grid grid-cols-3 gap-3 mt-2">
                      <Field label="CAP" value={form.indirizzo_cap} onChange={v => handleChange("indirizzo_cap", v)} placeholder="24121" />
                      <Field label="Città" value={form.indirizzo_citta} onChange={v => handleChange("indirizzo_citta", v)} placeholder="Bergamo" />
                      <Field label="Provincia" value={form.indirizzo_provincia} onChange={v => handleChange("indirizzo_provincia", v)} placeholder="BG" />
                    </div>
                  </div>

                  <div>
                    <label className="block text-[10px] text-neutral-500 font-medium mb-1">Note interne</label>
                    <textarea rows={2} value={form.note} onChange={e => handleChange("note", e.target.value)}
                      className="w-full px-3 py-2 border border-neutral-200 rounded-lg text-sm resize-none"
                      placeholder="Mansioni, allergie, note contratto..." />
                  </div>

                  <div className="flex items-center gap-2">
                    <input id="attivo" type="checkbox" checked={form.attivo}
                      onChange={e => handleChange("attivo", e.target.checked)}
                      className="rounded border-neutral-300 text-purple-600" />
                    <label htmlFor="attivo" className="text-xs text-neutral-700">Dipendente attivo</label>
                  </div>

                  <div className="flex gap-2 pt-2">
                    <button type="submit" disabled={saving}
                      className="px-4 py-2 rounded-lg bg-purple-600 text-white text-sm font-medium hover:bg-purple-700 disabled:opacity-50">
                      {saving ? "Salvataggio..." : form.id ? "Salva modifiche" : "Crea dipendente"}
                    </button>
                    {form.id && form.attivo && (
                      <button type="button" onClick={() => handleDisattiva(form.id)}
                        className="px-4 py-2 rounded-lg border border-red-200 text-red-600 text-sm hover:bg-red-50">
                        Disattiva
                      </button>
                    )}
                  </div>
                </form>
              )}

              {/* ════════════════════════════════════════
                  TAB: DOCUMENTI
                  ════════════════════════════════════════ */}
              {tab === "documenti" && (
                <div>
                  {!form.id ? (
                    <p className="text-xs text-neutral-500">Salva prima il dipendente per gestire i documenti.</p>
                  ) : (
                    <>
                      {/* Upload form */}
                      <form onSubmit={handleUploadDoc}
                        className="bg-purple-50 rounded-xl border border-purple-100 p-4 mb-4">
                        <p className="text-[10px] text-purple-700 font-semibold uppercase mb-2">Carica documento</p>
                        <div className="grid grid-cols-[1fr_1fr_auto] gap-3 items-end">
                          <div>
                            <label className="block text-[10px] text-neutral-500 mb-1">Categoria</label>
                            <select value={docCategoria} onChange={e => setDocCategoria(e.target.value)}
                              className="w-full px-3 py-2 border border-neutral-200 rounded-lg text-xs bg-white">
                              {DOC_CATEGORIE.filter(c => c.value !== "CEDOLINO").map(c => (
                                <option key={c.value} value={c.value}>{c.icon} {c.label}</option>
                              ))}
                            </select>
                          </div>
                          <div>
                            <label className="block text-[10px] text-neutral-500 mb-1">Descrizione</label>
                            <input type="text" value={docDescrizione}
                              onChange={e => setDocDescrizione(e.target.value)}
                              className="w-full px-3 py-2 border border-neutral-200 rounded-lg text-xs"
                              placeholder="Es. Contratto 2025" />
                          </div>
                          <div className="flex items-center gap-2">
                            <input type="file" onChange={e => setDocFile(e.target.files[0])}
                              className="text-[10px] w-40" />
                            <button type="submit" disabled={docUploading || !docFile}
                              className="px-3 py-2 rounded-lg bg-purple-600 text-white text-xs font-semibold hover:bg-purple-700 disabled:opacity-50 whitespace-nowrap">
                              {docUploading ? "..." : "Carica"}
                            </button>
                          </div>
                        </div>
                      </form>

                      {/* Lista documenti */}
                      {docsLoading ? (
                        <div className="text-xs text-neutral-400 py-4">Caricamento...</div>
                      ) : docs.length === 0 ? (
                        <div className="text-center py-8">
                          <p className="text-neutral-400 text-sm">Nessun documento allegato.</p>
                          <p className="text-neutral-400 text-xs mt-1">I cedolini PDF verranno mostrati qui dopo l'import dal LUL.</p>
                        </div>
                      ) : (
                        <div className="space-y-1.5">
                          {docs.map(doc => (
                            <div key={doc.id}
                              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg border text-xs transition ${
                                doc.origine === "PDF_LUL"
                                  ? "bg-violet-50 border-violet-200"
                                  : "bg-white border-neutral-200 hover:bg-neutral-50"
                              }`}>
                              <span className="text-base">{docCategIcon(doc.categoria)}</span>
                              <div className="flex-1 min-w-0">
                                <div className="font-medium text-neutral-800 truncate">
                                  {doc.descrizione || doc.filename_originale}
                                </div>
                                <div className="text-[10px] text-neutral-500 flex items-center gap-2 mt-0.5">
                                  {doc.categoria && (
                                    <span className={`px-1.5 py-0.5 rounded font-medium ${
                                      doc.origine === "PDF_LUL"
                                        ? "bg-violet-100 text-violet-600"
                                        : "bg-neutral-100 text-neutral-600"
                                    }`}>
                                      {doc.categoria}
                                    </span>
                                  )}
                                  {doc.uploaded_at && (
                                    <span>{doc.uploaded_at.split("T")[0]}</span>
                                  )}
                                </div>
                              </div>
                              <div className="flex items-center gap-1.5">
                                {doc.origine === "PDF_LUL" && doc.bp_id ? (
                                  <button onClick={() => handleDownloadCedolino(doc.bp_id)}
                                    className="px-2 py-1 rounded bg-violet-100 text-violet-700 text-[10px] font-medium hover:bg-violet-200">
                                    {"\uD83D\uDCC4"} Apri PDF
                                  </button>
                                ) : (
                                  <button onClick={() => {
                                    const token = localStorage.getItem("token");
                                    fetch(`${API_BASE}/dipendenti/documenti/${doc.id}/download`, {
                                      headers: token ? { Authorization: `Bearer ${token}` } : {},
                                    }).then(r => r.blob()).then(blob => {
                                      const url = URL.createObjectURL(blob);
                                      window.open(url, "_blank");
                                    });
                                  }}
                                    className="px-2 py-1 rounded bg-neutral-100 text-neutral-600 text-[10px] font-medium hover:bg-neutral-200">
                                    Scarica
                                  </button>
                                )}
                                {doc.origine !== "PDF_LUL" && (
                                  <button onClick={() => handleDeleteDoc(doc.id)}
                                    className="px-1.5 py-1 rounded bg-red-50 text-red-600 text-[10px] hover:bg-red-100">
                                    {"\u2715"}
                                  </button>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Componente Field riusabile ──
function Field({ label, value, onChange, placeholder, type = "text", required, mono }) {
  return (
    <div>
      <label className="block text-[10px] text-neutral-500 font-medium mb-1">{label}</label>
      <input type={type} value={value} onChange={e => onChange(e.target.value)}
        className={`w-full px-3 py-2 border border-neutral-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-purple-300 ${mono ? "font-mono" : ""}`}
        placeholder={placeholder} required={required} />
    </div>
  );
}
