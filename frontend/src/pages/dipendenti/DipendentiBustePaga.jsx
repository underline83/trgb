// @version: v2.0-buste-paga
// Buste Paga: lista cedolini, inserimento manuale, upload PDF LUL, integrazione scadenzario
import React, { useState, useEffect, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { API_BASE, apiFetch } from "../../config/api";

const fmt = (n) => n != null ? Number(n).toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "\u2014";
const MESI = ["","Gennaio","Febbraio","Marzo","Aprile","Maggio","Giugno","Luglio","Agosto","Settembre","Ottobre","Novembre","Dicembre"];

export default function DipendentiBustePaga() {
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [dipendenti, setDipendenti] = useState([]);
  const [filtroAnno, setFiltroAnno] = useState(new Date().getFullYear());
  const [filtroDip, setFiltroDip] = useState("");

  // Upload PDF
  const [uploading, setUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState(null);
  const fileInputRef = React.useRef(null);

  // Form
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
      // Campi opzionali: aggiungi solo se compilati
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

  const handleUploadPDF = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".pdf")) {
      alert("Seleziona un file PDF");
      return;
    }
    setUploading(true);
    setUploadResult(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      // Usa token JWT dall'header standard
      const token = localStorage.getItem("token");
      const res = await fetch(`${API_BASE}/dipendenti/buste-paga/upload-pdf?genera_scadenze=true`, {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: formData,
      });
      const json = await res.json();
      if (res.ok && json.ok) {
        setUploadResult(json);
        fetchData(); // Refresh lista
      } else {
        alert(json.detail || json.error || "Errore upload");
      }
    } catch (err) {
      console.error(err);
      alert("Errore di rete durante l'upload");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleDelete = async (id) => {
    if (!confirm("Eliminare questo cedolino?")) return;
    await apiFetch(`${API_BASE}/dipendenti/buste-paga/${id}`, { method: "DELETE" });
    fetchData();
  };

  // Anni disponibili
  const currentYear = new Date().getFullYear();
  const anni = [currentYear, currentYear - 1, currentYear - 2];

  // Raggruppa per mese per la vista riepilogo
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
    <div className="min-h-screen bg-neutral-100">
      {/* HEADER */}
      <div className="bg-white border-b border-neutral-200 px-4 py-2.5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate("/dipendenti")}
            className="text-neutral-400 hover:text-neutral-600 text-sm">{"\u2190"}</button>
          <h1 className="text-lg font-bold text-sky-900 font-playfair">{"\uD83D\uDCCB"} Buste Paga</h1>
          <span className="text-[10px] text-neutral-400">{buste.length} cedolini</span>
        </div>
        <div className="flex items-center gap-2">
          <input ref={fileInputRef} type="file" accept=".pdf" onChange={handleUploadPDF}
            className="hidden" />
          <button onClick={() => fileInputRef.current?.click()} disabled={uploading}
            className="px-3 py-1.5 rounded-lg bg-violet-600 text-white text-xs font-semibold hover:bg-violet-700 disabled:opacity-50 flex items-center gap-1.5">
            {uploading ? (
              <><span className="animate-spin inline-block w-3 h-3 border-2 border-white border-t-transparent rounded-full"></span> Importando...</>
            ) : (
              <>{"\uD83D\uDCC4"} Import PDF LUL</>
            )}
          </button>
          <button onClick={() => { resetForm(); setShowForm(true); }}
            className="px-3 py-1.5 rounded-lg bg-sky-600 text-white text-xs font-semibold hover:bg-sky-700">
            + Inserisci Manuale
          </button>
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
          <span className="text-neutral-500">Netto tot: <span className="font-bold text-sky-800">{"\u20AC"} {fmt(rig.totale_netto)}</span></span>
          <span className="text-neutral-500">Lordo tot: <span className="font-bold text-neutral-800">{"\u20AC"} {fmt(rig.totale_lordo)}</span></span>
        </div>
      </div>

      {/* RISULTATO UPLOAD PDF */}
      {uploadResult && (
        <div className="mx-4 mt-3 bg-white rounded-xl border border-violet-200 shadow-lg p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-bold text-violet-900">{"\uD83D\uDCC4"} Risultato Import PDF</h3>
            <button onClick={() => setUploadResult(null)} className="text-neutral-400 hover:text-neutral-600 text-lg">{"\u00D7"}</button>
          </div>
          <div className="flex gap-4 text-xs mb-3">
            <span className="text-neutral-500">Cedolini nel PDF: <strong>{uploadResult.totale_cedolini}</strong></span>
            <span className="text-emerald-700 font-medium">{"\u2713"} Importati: {uploadResult.importati?.length || 0}</span>
            {uploadResult.non_abbinati?.length > 0 && (
              <span className="text-amber-700 font-medium">{"\u26A0"} Non abbinati: {uploadResult.non_abbinati.length}</span>
            )}
            {uploadResult.errori?.length > 0 && (
              <span className="text-red-700 font-medium">{"\u2717"} Errori: {uploadResult.errori.length}</span>
            )}
          </div>

          {/* Importati */}
          {uploadResult.importati?.length > 0 && (
            <div className="mb-2">
              <p className="text-[10px] text-emerald-700 font-semibold uppercase mb-1">Importati con successo</p>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-1">
                {uploadResult.importati.map((r, i) => (
                  <div key={i} className="text-xs bg-emerald-50 rounded px-2 py-1 flex justify-between">
                    <span className="text-emerald-800">{r.cognome_nome}</span>
                    <span className="font-mono text-emerald-700">{"\u20AC"} {fmt(r.netto)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Non abbinati */}
          {uploadResult.non_abbinati?.length > 0 && (
            <div className="mb-2">
              <p className="text-[10px] text-amber-700 font-semibold uppercase mb-1">Non trovati in anagrafica</p>
              <p className="text-[10px] text-neutral-500 mb-1">Aggiungi questi dipendenti all'Anagrafica con lo stesso codice fiscale per importarli automaticamente.</p>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-1">
                {uploadResult.non_abbinati.map((r, i) => (
                  <div key={i} className="text-xs bg-amber-50 rounded px-2 py-1 flex justify-between">
                    <span className="text-amber-800">{r.cognome_nome}</span>
                    <span className="font-mono text-amber-700">{r.codice_fiscale || "—"}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Errori */}
          {uploadResult.errori?.length > 0 && (
            <div>
              <p className="text-[10px] text-red-700 font-semibold uppercase mb-1">Errori</p>
              {uploadResult.errori.map((r, i) => (
                <div key={i} className="text-xs text-red-700 bg-red-50 rounded px-2 py-1 mb-1">
                  {r.cognome_nome}: {r.errore}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* FORM INSERIMENTO */}
      {showForm && (
        <div className="mx-4 mt-3 bg-white rounded-xl border border-sky-200 shadow-lg p-5">
          <h3 className="text-sm font-bold text-sky-900 mb-3">Inserisci Cedolino</h3>
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
                className="rounded border-neutral-300 text-sky-600" />
              Genera scadenza nello Scadenzario (netto da pagare al dipendente)
            </label>
          </div>
          <div className="flex gap-2 mt-3">
            <button onClick={handleSave} disabled={saving || !form.dipendente_id || !form.netto}
              className="px-4 py-2 rounded-lg bg-sky-600 text-white text-sm font-medium hover:bg-sky-700 disabled:opacity-50">
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
              className="mt-3 px-4 py-2 rounded-lg bg-sky-100 text-sky-700 text-sm font-medium hover:bg-sky-200">
              + Inserisci il primo cedolino
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            {perMese.map(gruppo => (
              <div key={`${gruppo.anno}-${gruppo.mese}`}
                className="bg-white rounded-xl border border-neutral-200 shadow-sm overflow-hidden">
                {/* Header mese */}
                <div className="px-4 py-2.5 bg-sky-50 border-b border-sky-100 flex items-center justify-between">
                  <h3 className="text-sm font-bold text-sky-900">{gruppo.label} {gruppo.anno}</h3>
                  <div className="flex items-center gap-4 text-xs">
                    <span className="text-neutral-500">Netto: <span className="font-bold text-sky-700">{"\u20AC"} {fmt(gruppo.totNetto)}</span></span>
                    {gruppo.totLordo > 0 && (
                      <span className="text-neutral-500">Lordo: <span className="font-semibold">{"\u20AC"} {fmt(gruppo.totLordo)}</span></span>
                    )}
                    <span className="text-neutral-400">{gruppo.buste.length} cedolin{gruppo.buste.length === 1 ? "o" : "i"}</span>
                  </div>
                </div>
                {/* Righe cedolini */}
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
                      <th className="px-4 py-1.5 text-center w-16">Azioni</th>
                    </tr>
                  </thead>
                  <tbody>
                    {gruppo.buste.map(b => (
                      <tr key={b.id} className="border-b border-neutral-50 hover:bg-neutral-50">
                        <td className="px-4 py-2">
                          <span className="font-medium text-neutral-800">{b.cognome} {b.nome}</span>
                          <span className="ml-1 text-[10px] text-neutral-400">{b.ruolo}</span>
                          {b.fonte === "PDF" && (
                            <span className="ml-1 text-[9px] bg-violet-100 text-violet-600 px-1 rounded font-mono">PDF</span>
                          )}
                        </td>
                        <td className="px-4 py-2 text-right font-semibold text-sky-800">{"\u20AC"} {fmt(b.netto)}</td>
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
                            b.stato === "VERIFICATO" ? "bg-sky-100 text-sky-700" :
                            "bg-neutral-100 text-neutral-600"
                          }`}>
                            {b.stato}
                          </span>
                          {b.uscita_netto_id && (
                            <span className="ml-1 text-[9px] text-violet-500" title="Scadenza generata">{"\u2192"} CG</span>
                          )}
                        </td>
                        <td className="px-4 py-2 text-center">
                          <button onClick={() => handleDelete(b.id)}
                            className="text-[10px] px-1.5 py-0.5 rounded bg-red-100 text-red-700 hover:bg-red-200">
                            {"\u2715"}
                          </button>
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
