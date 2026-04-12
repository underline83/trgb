// @version: v1.0-proforme
// Pagina Pro-forme Acquisti — Lista + Creazione + Riconciliazione
import React, { useState, useEffect, useCallback, useMemo } from "react";
import { API_BASE, apiFetch } from "../../config/api";
import FattureNav from "./FattureNav";

const FE = `${API_BASE}/contabilita/fe/proforme`;
const fmt = (v) =>
  v != null
    ? v.toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : "-";
const fmtData = (d) => {
  if (!d) return "-";
  const [y, m, day] = d.split("-");
  return `${day}/${m}/${y}`;
};

// ── Stili ──
const fLbl = "block text-[10px] font-semibold text-neutral-500 uppercase tracking-wide mb-0.5";
const fInp = "w-full border border-neutral-300 rounded-md px-2.5 py-2.5 text-[11px] bg-white focus:outline-none focus:ring-2 focus:ring-teal-300";

// ═══════════════════════════════════════════════════════════════════
// MODALE CREAZIONE / MODIFICA PROFORMA
// ═══════════════════════════════════════════════════════════════════

function ProformaModal({ open, onClose, onSaved, editData }) {
  const isEdit = !!editData;
  const [form, setForm] = useState({
    fornitore_nome: "", fornitore_piva: "", fornitore_cf: "",
    importo: "", data_scadenza: "", data_emissione: "",
    numero_proforma: "", note: "", crea_fornitore: false,
  });
  const [fornitori, setFornitori] = useState([]);
  const [searchQ, setSearchQ] = useState("");
  const [showSearch, setShowSearch] = useState(false);
  const [nuovoFornitore, setNuovoFornitore] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // Pre-fill in modifica
  useEffect(() => {
    if (editData) {
      setForm({
        fornitore_nome: editData.fornitore_nome || "",
        fornitore_piva: editData.fornitore_piva || "",
        fornitore_cf: editData.fornitore_cf || "",
        importo: editData.importo || "",
        data_scadenza: editData.data_scadenza || "",
        data_emissione: editData.data_emissione || "",
        numero_proforma: editData.numero_proforma || "",
        note: editData.note || "",
        crea_fornitore: false,
      });
      setNuovoFornitore(false);
    } else {
      setForm({
        fornitore_nome: "", fornitore_piva: "", fornitore_cf: "",
        importo: "", data_scadenza: "", data_emissione: "",
        numero_proforma: "", note: "", crea_fornitore: false,
      });
      setNuovoFornitore(false);
    }
    setError("");
    setSearchQ("");
  }, [editData, open]);

  // Ricerca fornitori
  useEffect(() => {
    if (!showSearch) return;
    const t = setTimeout(async () => {
      try {
        const res = await apiFetch(`${FE}/fornitori/search?q=${encodeURIComponent(searchQ)}&limit=15`);
        if (res.ok) setFornitori(await res.json());
      } catch { setFornitori([]); }
    }, 200);
    return () => clearTimeout(t);
  }, [searchQ, showSearch]);

  const selectFornitore = (f) => {
    setForm(prev => ({
      ...prev,
      fornitore_nome: f.fornitore_nome || "",
      fornitore_piva: f.fornitore_piva || "",
      fornitore_cf: f.fornitore_cf || "",
      crea_fornitore: false,
    }));
    setNuovoFornitore(false);
    setShowSearch(false);
    setSearchQ("");
  };

  const toggleNuovo = () => {
    setNuovoFornitore(!nuovoFornitore);
    setShowSearch(false);
    if (!nuovoFornitore) {
      setForm(prev => ({ ...prev, fornitore_nome: "", fornitore_piva: "", fornitore_cf: "", crea_fornitore: true }));
    }
  };

  const save = async () => {
    if (!form.fornitore_nome.trim()) return setError("Nome fornitore obbligatorio");
    if (!form.importo || parseFloat(form.importo) <= 0) return setError("Importo obbligatorio");
    if (!form.data_scadenza) return setError("Data scadenza obbligatoria");

    setSaving(true);
    setError("");
    try {
      const body = {
        ...form,
        importo: parseFloat(form.importo),
        crea_fornitore: nuovoFornitore,
      };

      const url = isEdit ? `${FE}/${editData.id}` : FE;
      const method = isEdit ? "PUT" : "POST";

      const res = await apiFetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Errore salvataggio");

      onSaved(data);
      onClose();
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          <h2 className="text-lg font-bold text-brand-ink mb-4">
            {isEdit ? "Modifica Proforma" : "Nuova Proforma"}
          </h2>

          {/* ── Fornitore ── */}
          <div className="mb-4">
            <label className={fLbl}>Fornitore</label>

            {!nuovoFornitore && form.fornitore_nome ? (
              <div className="flex items-center gap-2 p-2.5 bg-teal-50 border border-teal-200 rounded-lg text-sm">
                <span className="font-medium text-teal-900">{form.fornitore_nome}</span>
                {form.fornitore_piva && <span className="text-[10px] text-teal-600">P.IVA {form.fornitore_piva}</span>}
                <button onClick={() => { setForm(prev => ({ ...prev, fornitore_nome: "", fornitore_piva: "", fornitore_cf: "" })); setShowSearch(true); }}
                  className="ml-auto text-[10px] text-teal-600 hover:text-teal-800">✕ Cambia</button>
              </div>
            ) : !nuovoFornitore ? (
              <div className="relative">
                <input
                  value={searchQ}
                  onChange={(e) => { setSearchQ(e.target.value); setShowSearch(true); }}
                  onFocus={() => setShowSearch(true)}
                  placeholder="Cerca fornitore..."
                  className={fInp}
                />
                {showSearch && fornitori.length > 0 && (
                  <div className="absolute z-10 mt-1 w-full bg-white border border-neutral-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                    {fornitori.map((f, i) => (
                      <button key={i} onClick={() => selectFornitore(f)}
                        className="w-full text-left px-3 py-2 text-sm hover:bg-teal-50 border-b border-neutral-100 last:border-0">
                        <span className="font-medium">{f.fornitore_nome}</span>
                        {f.fornitore_piva && <span className="text-[10px] text-neutral-400 ml-2">{f.fornitore_piva}</span>}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ) : null}

            {nuovoFornitore && (
              <div className="space-y-2 p-3 bg-amber-50 border border-amber-200 rounded-lg mt-2">
                <p className="text-[10px] font-semibold text-amber-700 uppercase">Nuovo fornitore</p>
                <div>
                  <label className={fLbl}>Nome *</label>
                  <input value={form.fornitore_nome} onChange={e => setForm(p => ({ ...p, fornitore_nome: e.target.value }))}
                    placeholder="Ragione sociale" className={fInp} />
                </div>
                <div>
                  <label className={fLbl}>P.IVA (consigliato per match FIC)</label>
                  <input value={form.fornitore_piva} onChange={e => setForm(p => ({ ...p, fornitore_piva: e.target.value }))}
                    placeholder="01234567890" className={fInp} />
                </div>
                <div>
                  <label className={fLbl}>Codice Fiscale</label>
                  <input value={form.fornitore_cf} onChange={e => setForm(p => ({ ...p, fornitore_cf: e.target.value }))}
                    placeholder="Opzionale" className={fInp} />
                </div>
              </div>
            )}

            <button onClick={toggleNuovo}
              className="mt-2 text-[11px] text-teal-600 hover:text-teal-800 font-medium">
              {nuovoFornitore ? "← Cerca fornitore esistente" : "+ Nuovo fornitore"}
            </button>
          </div>

          {/* ── Importo + Scadenza ── */}
          <div className="grid grid-cols-2 gap-3 mb-4">
            <div>
              <label className={fLbl}>Importo (€) *</label>
              <input type="number" step="0.01" value={form.importo}
                onChange={e => setForm(p => ({ ...p, importo: e.target.value }))}
                placeholder="0.00" className={fInp} />
            </div>
            <div>
              <label className={fLbl}>Data scadenza *</label>
              <input type="date" value={form.data_scadenza}
                onChange={e => setForm(p => ({ ...p, data_scadenza: e.target.value }))}
                className={fInp} />
            </div>
          </div>

          {/* ── Campi opzionali ── */}
          <div className="grid grid-cols-2 gap-3 mb-4">
            <div>
              <label className={fLbl}>N° proforma</label>
              <input value={form.numero_proforma}
                onChange={e => setForm(p => ({ ...p, numero_proforma: e.target.value }))}
                placeholder="Riferimento" className={fInp} />
            </div>
            <div>
              <label className={fLbl}>Data emissione</label>
              <input type="date" value={form.data_emissione}
                onChange={e => setForm(p => ({ ...p, data_emissione: e.target.value }))}
                className={fInp} />
            </div>
          </div>

          <div className="mb-4">
            <label className={fLbl}>Note</label>
            <textarea value={form.note}
              onChange={e => setForm(p => ({ ...p, note: e.target.value }))}
              rows={2} placeholder="Note libere..." className={fInp + " resize-none"} />
          </div>

          {error && <p className="text-sm text-brand-red mb-3">{error}</p>}

          {/* ── Actions ── */}
          <div className="flex justify-end gap-2">
            <button onClick={onClose}
              className="px-4 py-2 rounded-lg text-sm text-neutral-600 hover:bg-neutral-100 transition">
              Annulla
            </button>
            <button onClick={save} disabled={saving}
              className="px-5 py-2 rounded-lg text-sm font-medium text-white bg-brand-blue hover:opacity-90 transition disabled:opacity-50">
              {saving ? "Salvataggio..." : isEdit ? "Salva modifiche" : "Crea proforma"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// MODALE RICONCILIAZIONE
// ═══════════════════════════════════════════════════════════════════

function RiconciliaModal({ open, onClose, proforma, onDone }) {
  const [candidates, setCandidates] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open || !proforma) return;
    setError("");
    (async () => {
      setLoading(true);
      try {
        const res = await apiFetch(`${FE}/${proforma.id}/candidates`);
        if (res.ok) {
          const data = await res.json();
          setCandidates(data.candidates || []);
        }
      } catch { setCandidates([]); }
      finally { setLoading(false); }
    })();
  }, [open, proforma]);

  const doRiconcilia = async (fattura_id) => {
    setSaving(true);
    setError("");
    try {
      const res = await apiFetch(`${FE}/${proforma.id}/riconcilia`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fattura_id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Errore");
      onDone(data);
      onClose();
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[80vh] overflow-y-auto">
        <div className="p-6">
          <h2 className="text-lg font-bold text-brand-ink mb-1">Riconcilia proforma</h2>
          <p className="text-sm text-neutral-500 mb-4">
            {proforma?.fornitore_nome} — € {fmt(proforma?.importo)} — scad. {fmtData(proforma?.data_scadenza)}
          </p>

          {loading ? (
            <p className="text-sm text-neutral-400 py-8 text-center">Cerco fatture candidate...</p>
          ) : candidates.length === 0 ? (
            <p className="text-sm text-neutral-500 py-8 text-center">
              Nessuna fattura candidata trovata per questo fornitore/importo.
            </p>
          ) : (
            <div className="space-y-2">
              <p className="text-[10px] text-neutral-400 uppercase font-semibold tracking-wide">
                {candidates.length} fattur{candidates.length === 1 ? "a" : "e"} candidat{candidates.length === 1 ? "a" : "e"}
              </p>
              {candidates.map(f => (
                <div key={f.id} className="flex items-center justify-between p-3 border border-neutral-200 rounded-lg hover:border-teal-300 hover:bg-teal-50/30 transition">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-brand-ink truncate">{f.fornitore_nome}</p>
                    <p className="text-[11px] text-neutral-500">
                      {f.numero_fattura && <span>N° {f.numero_fattura} — </span>}
                      {fmtData(f.data_fattura)} — € {fmt(f.totale_fattura)}
                      <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded bg-neutral-100 text-neutral-500">{f.fonte || "xml"}</span>
                    </p>
                  </div>
                  <button onClick={() => doRiconcilia(f.id)} disabled={saving}
                    className="ml-3 px-3 py-1.5 rounded-lg text-xs font-medium text-white bg-brand-green hover:opacity-90 transition disabled:opacity-50 shrink-0">
                    Collega
                  </button>
                </div>
              ))}
            </div>
          )}

          {error && <p className="text-sm text-brand-red mt-3">{error}</p>}

          <div className="flex justify-end mt-4">
            <button onClick={onClose}
              className="px-4 py-2 rounded-lg text-sm text-neutral-600 hover:bg-neutral-100 transition">
              Chiudi
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// PAGINA PRINCIPALE
// ═══════════════════════════════════════════════════════════════════

export default function FattureProformeElenco() {
  const [data, setData] = useState({ proforme: [], totale: 0, attive: 0, importo_attive: 0 });
  const [loading, setLoading] = useState(true);
  const [filtroStato, setFiltroStato] = useState("ATTIVA");

  // Modali
  const [showCreate, setShowCreate] = useState(false);
  const [editItem, setEditItem] = useState(null);
  const [riconciliaItem, setRiconciliaItem] = useState(null);

  // Toast
  const [toast, setToast] = useState("");
  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(""), 3000); };

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = filtroStato ? `?stato=${filtroStato}` : "";
      const res = await apiFetch(`${FE}${params}`);
      if (res.ok) setData(await res.json());
    } catch { /* ok */ }
    finally { setLoading(false); }
  }, [filtroStato]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const onSaved = () => { fetchData(); showToast("Proforma salvata"); };
  const onRiconciliata = () => { fetchData(); showToast("Proforma riconciliata con fattura"); };

  const annulla = async (id) => {
    if (!confirm("Annullare questa proforma?")) return;
    try {
      const res = await apiFetch(`${FE}/${id}`, { method: "DELETE" });
      if (res.ok) { fetchData(); showToast("Proforma annullata"); }
    } catch { /* ok */ }
  };

  const dissocia = async (id) => {
    if (!confirm("Dissociare questa proforma dalla fattura?")) return;
    try {
      const res = await apiFetch(`${FE}/${id}/dissocia`, { method: "POST" });
      if (res.ok) { fetchData(); showToast("Proforma dissociata"); }
    } catch { /* ok */ }
  };

  // ── Stato badge colori ──
  const statoBadge = (stato) => {
    switch (stato) {
      case "ATTIVA": return "bg-amber-100 text-amber-800";
      case "RICONCILIATA": return "bg-green-100 text-green-800";
      case "ANNULLATA": return "bg-neutral-100 text-neutral-500 line-through";
      default: return "bg-neutral-100 text-neutral-500";
    }
  };

  return (
    <div className="min-h-screen bg-brand-cream">
      <FattureNav current="proforme" />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
        {/* ── Header ── */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-6">
          <div>
            <h1 className="text-2xl font-bold text-brand-ink font-playfair">Pro-forme</h1>
            <p className="text-sm text-neutral-500">
              {data.attive} attiv{data.attive === 1 ? "a" : "e"} — € {fmt(data.importo_attive)} in scadenziario
            </p>
          </div>
          <button onClick={() => { setEditItem(null); setShowCreate(true); }}
            className="px-4 py-2.5 rounded-xl text-sm font-medium text-white bg-brand-blue hover:opacity-90 shadow-sm transition">
            + Nuova proforma
          </button>
        </div>

        {/* ── Filtro stato ── */}
        <div className="flex gap-1 mb-4">
          {[
            { val: "ATTIVA", label: "Attive" },
            { val: "RICONCILIATA", label: "Riconciliate" },
            { val: "ANNULLATA", label: "Annullate" },
            { val: "", label: "Tutte" },
          ].map(f => (
            <button key={f.val} onClick={() => setFiltroStato(f.val)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                filtroStato === f.val
                  ? "bg-teal-100 text-teal-900 shadow-sm"
                  : "text-neutral-600 hover:bg-neutral-100"
              }`}>
              {f.label}
            </button>
          ))}
        </div>

        {/* ── Tabella ── */}
        {loading ? (
          <p className="text-sm text-neutral-400 py-12 text-center">Caricamento...</p>
        ) : data.proforme.length === 0 ? (
          <div className="text-center py-16">
            <p className="text-neutral-400 text-sm mb-3">Nessuna proforma {filtroStato ? filtroStato.toLowerCase() : ""}</p>
            <button onClick={() => { setEditItem(null); setShowCreate(true); }}
              className="text-sm text-brand-blue hover:underline">
              Crea la prima proforma
            </button>
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-neutral-200 shadow-sm overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-neutral-200 bg-neutral-50/50">
                  <th className="text-left px-4 py-3 text-[10px] font-semibold text-neutral-500 uppercase tracking-wide">Fornitore</th>
                  <th className="text-right px-4 py-3 text-[10px] font-semibold text-neutral-500 uppercase tracking-wide">Importo</th>
                  <th className="text-left px-4 py-3 text-[10px] font-semibold text-neutral-500 uppercase tracking-wide">Scadenza</th>
                  <th className="text-left px-4 py-3 text-[10px] font-semibold text-neutral-500 uppercase tracking-wide">N° Proforma</th>
                  <th className="text-center px-4 py-3 text-[10px] font-semibold text-neutral-500 uppercase tracking-wide">Stato</th>
                  <th className="text-right px-4 py-3 text-[10px] font-semibold text-neutral-500 uppercase tracking-wide">Azioni</th>
                </tr>
              </thead>
              <tbody>
                {data.proforme.map(p => {
                  const scaduta = p.stato === "ATTIVA" && p.data_scadenza < new Date().toISOString().split("T")[0];
                  return (
                    <tr key={p.id} className={`border-b border-neutral-100 hover:bg-neutral-50/50 transition ${p.stato === "ANNULLATA" ? "opacity-50" : ""}`}>
                      <td className="px-4 py-3">
                        <p className="font-medium text-brand-ink">{p.fornitore_nome}</p>
                        {p.fornitore_piva && <p className="text-[10px] text-neutral-400">{p.fornitore_piva}</p>}
                        {p.stato === "RICONCILIATA" && p.fattura_numero && (
                          <p className="text-[10px] text-green-600 mt-0.5">
                            → Fattura N° {p.fattura_numero} del {fmtData(p.fattura_data)}
                          </p>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-sm">
                        € {fmt(p.importo)}
                      </td>
                      <td className="px-4 py-3">
                        <span className={scaduta ? "text-brand-red font-medium" : ""}>
                          {fmtData(p.data_scadenza)}
                        </span>
                        {scaduta && <span className="ml-1 text-[9px] text-brand-red font-semibold">SCADUTA</span>}
                      </td>
                      <td className="px-4 py-3 text-neutral-600">
                        {p.numero_proforma || "-"}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold ${statoBadge(p.stato)}`}>
                          {p.stato}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex justify-end gap-1">
                          {p.stato === "ATTIVA" && (
                            <>
                              <button onClick={() => setRiconciliaItem(p)}
                                className="px-2 py-1 rounded text-[10px] font-medium text-brand-green hover:bg-green-50 transition"
                                title="Riconcilia con fattura">
                                Riconcilia
                              </button>
                              <button onClick={() => { setEditItem(p); setShowCreate(true); }}
                                className="px-2 py-1 rounded text-[10px] font-medium text-brand-blue hover:bg-blue-50 transition"
                                title="Modifica">
                                Modifica
                              </button>
                              <button onClick={() => annulla(p.id)}
                                className="px-2 py-1 rounded text-[10px] font-medium text-brand-red hover:bg-red-50 transition"
                                title="Annulla">
                                Annulla
                              </button>
                            </>
                          )}
                          {p.stato === "RICONCILIATA" && (
                            <button onClick={() => dissocia(p.id)}
                              className="px-2 py-1 rounded text-[10px] font-medium text-amber-600 hover:bg-amber-50 transition"
                              title="Dissocia dalla fattura">
                              Dissocia
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Modali ── */}
      <ProformaModal
        open={showCreate}
        onClose={() => { setShowCreate(false); setEditItem(null); }}
        onSaved={onSaved}
        editData={editItem}
      />
      <RiconciliaModal
        open={!!riconciliaItem}
        onClose={() => setRiconciliaItem(null)}
        proforma={riconciliaItem}
        onDone={onRiconciliata}
      />

      {/* ── Toast ── */}
      {toast && (
        <div className="fixed bottom-6 right-6 z-50 px-4 py-2.5 bg-brand-ink text-white rounded-xl shadow-lg text-sm font-medium animate-fade-in">
          {toast}
        </div>
      )}
    </div>
  );
}
