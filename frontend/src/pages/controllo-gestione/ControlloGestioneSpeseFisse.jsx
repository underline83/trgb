// @version: v1.0-spese-fisse
// Spese Fisse — spese ricorrenti senza fattura: affitti, tasse, stipendi, prestiti, ecc.
import React, { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { API_BASE, apiFetch } from "../../config/api";

const CG = `${API_BASE}/controllo-gestione`;

const fmt = (n) => n != null ? Number(n).toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "—";

const TIPI = [
  { value: "AFFITTO", label: "Affitto", icon: "🏠", color: "bg-blue-100 text-blue-800 border-blue-200" },
  { value: "TASSA", label: "Tassa", icon: "🏛️", color: "bg-red-100 text-red-800 border-red-200" },
  { value: "STIPENDIO", label: "Stipendio", icon: "👤", color: "bg-green-100 text-green-800 border-green-200" },
  { value: "PRESTITO", label: "Prestito", icon: "🏦", color: "bg-amber-100 text-amber-800 border-amber-200" },
  { value: "RATEIZZAZIONE", label: "Rateizzazione", icon: "📅", color: "bg-violet-100 text-violet-800 border-violet-200" },
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

  // Form per nuova/edit spesa
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState(null);
  const [form, setForm] = useState({
    tipo: "AFFITTO", titolo: "", descrizione: "", importo: "",
    frequenza: "MENSILE", giorno_scadenza: "", data_inizio: "", data_fine: "", note: "",
  });
  const [saving, setSaving] = useState(false);

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
              frequenza: "MENSILE", giorno_scadenza: "", data_inizio: "", data_fine: "", note: "" });
    setEditId(null);
  };

  const openNew = () => { resetForm(); setShowForm(true); };
  const openEdit = (s) => {
    setForm({
      tipo: s.tipo, titolo: s.titolo, descrizione: s.descrizione || "",
      importo: String(s.importo), frequenza: s.frequenza,
      giorno_scadenza: s.giorno_scadenza ? String(s.giorno_scadenza) : "",
      data_inizio: s.data_inizio || "", data_fine: s.data_fine || "",
      note: s.note || "",
    });
    setEditId(s.id);
    setShowForm(true);
  };

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

  return (
    <div className="min-h-screen bg-neutral-100 p-4 md:p-6">
      <div className="max-w-6xl mx-auto">

        {/* HEADER */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-6 gap-3">
          <div>
            <h1 className="text-2xl font-bold text-sky-900 font-playfair">Spese Fisse</h1>
            <p className="text-sm text-neutral-500 mt-0.5">Affitti, tasse, stipendi, prestiti, rateizzazioni — spese senza fattura</p>
          </div>
          <div className="flex gap-2">
            <button onClick={() => navigate("/controllo-gestione")}
              className="px-3 py-1.5 text-sm rounded-lg border border-neutral-300 text-neutral-600 hover:bg-neutral-50">
              &larr; Menu
            </button>
            <button onClick={openNew}
              className="px-4 py-1.5 text-sm rounded-lg bg-sky-600 text-white hover:bg-sky-700 font-medium">
              + Nuova Spesa
            </button>
          </div>
        </div>

        {/* KPI CARDS */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          <div className="rounded-xl border border-sky-200 bg-sky-50 p-4">
            <div className="text-xs font-semibold text-sky-700">Costo Mensile Stimato</div>
            <div className="text-lg font-bold text-sky-900 mt-1">€ {fmt(totaleMensile)}</div>
            <div className="text-xs text-neutral-400 mt-0.5">{spese.filter(s => s.attiva).length} voci attive</div>
          </div>
          {riepilogo.slice(0, 3).map(r => {
            const t = tipoInfo(r.tipo);
            return (
              <div key={r.tipo}
                onClick={() => setFiltroTipo(filtroTipo === r.tipo ? "" : r.tipo)}
                className={`rounded-xl border p-4 cursor-pointer transition ${t.color} ${filtroTipo === r.tipo ? "ring-2 ring-sky-400 shadow-md" : "hover:shadow-sm"}`}>
                <div className="text-xs font-semibold">{t.icon} {t.label}</div>
                <div className="text-lg font-bold mt-1">€ {fmt(r.totale)}</div>
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

        {/* FORM MODALE */}
        {showForm && (
          <div className="mb-6 bg-white rounded-2xl border border-sky-200 shadow-lg p-6">
            <h3 className="text-sm font-bold text-sky-900 mb-4">
              {editId ? "Modifica Spesa Fissa" : "Nuova Spesa Fissa"}
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
                <label className="text-xs text-neutral-500 mb-1 block">Importo (€) *</label>
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
              <div className="md:col-span-3">
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
            <button onClick={openNew}
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
                          € {fmt(s.importo)}
                        </td>
                        <td className="px-4 py-2.5 text-neutral-600 text-xs">{freqLabel(s.frequenza)}</td>
                        <td className="px-4 py-2.5 text-center text-neutral-500 text-xs">
                          {s.giorno_scadenza || "—"}
                        </td>
                        <td className="px-4 py-2.5 text-xs text-neutral-500">
                          {s.data_inizio ? (
                            <span>
                              {new Date(s.data_inizio + "T00:00:00").toLocaleDateString("it-IT", { month: "short", year: "2-digit" })}
                              {s.data_fine ? ` → ${new Date(s.data_fine + "T00:00:00").toLocaleDateString("it-IT", { month: "short", year: "2-digit" })}` : " → ∞"}
                            </span>
                          ) : "—"}
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
                          <div className="flex gap-1 justify-center">
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
            Il costo mensile stimato converte tutte le frequenze in equivalente mensile (bimestrale ÷ 2, trimestrale ÷ 3, ecc.)
          </div>
        )}
      </div>
    </div>
  );
}
