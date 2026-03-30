// @version: v1.0-scadenze-documenti
// Scadenze documenti dipendenti: HACCP, corsi sicurezza, visite mediche, ecc.
// Semaforo verde/giallo/rosso + CRUD + filtri
import React, { useState, useEffect, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { API_BASE, apiFetch } from "../../config/api";

const fmt = (n) => n != null ? Number(n).toLocaleString("it-IT", { minimumFractionDigits: 0 }) : "\u2014";
const fmtDate = (d) => d ? new Date(d + "T00:00:00").toLocaleDateString("it-IT", { day: "2-digit", month: "short", year: "2-digit" }) : null;
const giorniA = (d) => d ? Math.ceil((new Date(d) - new Date()) / 86400000) : null;

const STATO_STYLE = {
  VALIDO:      { bg: "bg-emerald-100", text: "text-emerald-800", border: "border-emerald-300", label: "Valido",      dot: "bg-emerald-500" },
  IN_SCADENZA: { bg: "bg-amber-100",   text: "text-amber-800",   border: "border-amber-300",   label: "In scadenza", dot: "bg-amber-500" },
  SCADUTO:     { bg: "bg-red-100",     text: "text-red-800",     border: "border-red-300",     label: "Scaduto",     dot: "bg-red-500" },
};

export default function DipendentiScadenze() {
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [filtroStato, setFiltroStato] = useState("");
  const [filtroTipo, setFiltroTipo] = useState("");
  const [filtroDip, setFiltroDip] = useState("");
  const [search, setSearch] = useState("");

  // Form nuova scadenza
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dipendenti, setDipendenti] = useState([]);
  const [form, setForm] = useState({
    dipendente_id: "", tipo: "HACCP", descrizione: "",
    data_rilascio: "", data_scadenza: "", ente_rilascio: "",
    alert_giorni: 30, note: "",
  });
  const [editId, setEditId] = useState(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [scadRes, dipRes] = await Promise.all([
        apiFetch(`${API_BASE}/dipendenti/scadenze`),
        apiFetch(`${API_BASE}/dipendenti/?include_inactive=false`),
      ]);
      if (scadRes.ok) setData(await scadRes.json());
      if (dipRes.ok) {
        const d = await dipRes.json();
        setDipendenti(Array.isArray(d) ? d : d.dipendenti || []);
      }
    } catch (e) {
      console.error("Errore:", e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const scadenze = data?.scadenze || [];
  const rig = data?.riepilogo || {};
  const tipiLabels = data?.tipi_labels || {};

  const filtered = useMemo(() => {
    let rows = scadenze;
    if (filtroStato) rows = rows.filter(s => s.stato_calc === filtroStato);
    if (filtroTipo) rows = rows.filter(s => s.tipo === filtroTipo);
    if (filtroDip) rows = rows.filter(s => String(s.dipendente_id) === filtroDip);
    if (search) {
      const q = search.toLowerCase();
      rows = rows.filter(s =>
        (s.nome + " " + s.cognome).toLowerCase().includes(q) ||
        (s.descrizione || "").toLowerCase().includes(q) ||
        (s.tipo_label || "").toLowerCase().includes(q)
      );
    }
    return rows;
  }, [scadenze, filtroStato, filtroTipo, filtroDip, search]);

  const resetForm = () => {
    setForm({ dipendente_id: "", tipo: "HACCP", descrizione: "", data_rilascio: "",
              data_scadenza: "", ente_rilascio: "", alert_giorni: 30, note: "" });
    setEditId(null);
  };

  const openEdit = (s) => {
    setForm({
      dipendente_id: s.dipendente_id, tipo: s.tipo, descrizione: s.descrizione || "",
      data_rilascio: s.data_rilascio || "", data_scadenza: s.data_scadenza,
      ente_rilascio: s.ente_rilascio || "", alert_giorni: s.alert_giorni || 30,
      note: s.note || "",
    });
    setEditId(s.id);
    setShowForm(true);
  };

  const handleSave = async () => {
    if (!form.dipendente_id || !form.data_scadenza) return;
    setSaving(true);
    try {
      const url = editId
        ? `${API_BASE}/dipendenti/scadenze/${editId}`
        : `${API_BASE}/dipendenti/scadenze`;
      const res = await apiFetch(url, {
        method: editId ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, dipendente_id: Number(form.dipendente_id), alert_giorni: Number(form.alert_giorni) }),
      });
      if (res.ok) {
        setShowForm(false);
        resetForm();
        fetchData();
      }
    } catch (e) {
      console.error(e);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id) => {
    if (!confirm("Eliminare questa scadenza?")) return;
    await apiFetch(`${API_BASE}/dipendenti/scadenze/${id}`, { method: "DELETE" });
    fetchData();
  };

  // Dipendenti unici dalle scadenze
  const dipUnici = useMemo(() => {
    const map = new Map();
    scadenze.forEach(s => map.set(s.dipendente_id, `${s.cognome} ${s.nome}`));
    return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [scadenze]);

  return (
    <div className="min-h-screen bg-neutral-100">
      {/* HEADER — pattern standard sotto-modulo */}
      <div className="bg-white border-b border-neutral-200 px-4 py-2.5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate("/dipendenti")}
            className="text-neutral-400 hover:text-neutral-600 text-sm">{"\u2190"}</button>
          <h1 className="text-lg font-bold text-purple-900 font-playfair">{"\uD83D\uDEA8"} Scadenze Documenti</h1>
        </div>
        <button onClick={() => { resetForm(); setShowForm(true); }}
          className="px-3 py-1.5 rounded-lg bg-purple-600 text-white text-xs font-semibold hover:bg-purple-700">
          + Nuova Scadenza
        </button>
      </div>

      {/* SEMAFORO KPI */}
      <div className="px-4 py-3 flex items-center gap-3 flex-wrap bg-white border-b border-neutral-100">
        {[
          { stato: "SCADUTO", label: "Scaduti", n: rig.scaduti, color: "red" },
          { stato: "IN_SCADENZA", label: "In scadenza", n: rig.in_scadenza, color: "amber" },
          { stato: "VALIDO", label: "Validi", n: rig.validi, color: "emerald" },
        ].map(k => {
          const colors = {
            red: "border-red-200 bg-red-50 text-red-800",
            amber: "border-amber-200 bg-amber-50 text-amber-800",
            emerald: "border-emerald-200 bg-emerald-50 text-emerald-800",
          };
          const active = filtroStato === k.stato;
          return (
            <button key={k.stato}
              onClick={() => setFiltroStato(filtroStato === k.stato ? "" : k.stato)}
              className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs font-semibold transition ${colors[k.color]} ${active ? "ring-2 ring-sky-400 shadow" : "hover:shadow-sm"}`}>
              <span className={`w-2.5 h-2.5 rounded-full ${STATO_STYLE[k.stato]?.dot}`} />
              <span>{k.label}</span>
              <span className="font-bold">{k.n || 0}</span>
            </button>
          );
        })}
        <div className="ml-auto flex items-center gap-2">
          <input type="text" value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Cerca..." className="border border-neutral-300 rounded-lg px-2 py-1 text-xs w-40" />
          <select value={filtroTipo} onChange={e => setFiltroTipo(e.target.value)}
            className="border border-neutral-300 rounded-lg px-2 py-1 text-xs">
            <option value="">Tutti i tipi</option>
            {Object.entries(tipiLabels).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <select value={filtroDip} onChange={e => setFiltroDip(e.target.value)}
            className="border border-neutral-300 rounded-lg px-2 py-1 text-xs">
            <option value="">Tutti i dipendenti</option>
            {dipUnici.map(([id, nome]) => <option key={id} value={id}>{nome}</option>)}
          </select>
        </div>
      </div>

      {/* FORM */}
      {showForm && (
        <div className="mx-4 mt-3 bg-white rounded-xl border border-purple-200 shadow-lg p-5">
          <h3 className="text-sm font-bold text-purple-900 mb-3">
            {editId ? "Modifica Scadenza" : "Nuova Scadenza"}
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className="text-[10px] text-neutral-500 block mb-0.5">Dipendente *</label>
              <select value={form.dipendente_id} onChange={e => setForm({ ...form, dipendente_id: e.target.value })}
                className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-sm">
                <option value="">Seleziona...</option>
                {dipendenti.map(d => <option key={d.id} value={d.id}>{d.cognome} {d.nome}</option>)}
              </select>
            </div>
            <div>
              <label className="text-[10px] text-neutral-500 block mb-0.5">Tipo *</label>
              <select value={form.tipo} onChange={e => setForm({ ...form, tipo: e.target.value })}
                className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-sm">
                {Object.entries(tipiLabels).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
            <div>
              <label className="text-[10px] text-neutral-500 block mb-0.5">Descrizione</label>
              <input type="text" value={form.descrizione} onChange={e => setForm({ ...form, descrizione: e.target.value })}
                placeholder="Es. Corso base 8h" className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-sm" />
            </div>
            <div>
              <label className="text-[10px] text-neutral-500 block mb-0.5">Data rilascio</label>
              <input type="date" value={form.data_rilascio} onChange={e => setForm({ ...form, data_rilascio: e.target.value })}
                className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-sm" />
            </div>
            <div>
              <label className="text-[10px] text-neutral-500 block mb-0.5">Data scadenza *</label>
              <input type="date" value={form.data_scadenza} onChange={e => setForm({ ...form, data_scadenza: e.target.value })}
                className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-sm" />
            </div>
            <div>
              <label className="text-[10px] text-neutral-500 block mb-0.5">Ente rilascio</label>
              <input type="text" value={form.ente_rilascio} onChange={e => setForm({ ...form, ente_rilascio: e.target.value })}
                placeholder="Es. ASL Bergamo" className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-sm" />
            </div>
            <div>
              <label className="text-[10px] text-neutral-500 block mb-0.5">Alert (giorni prima)</label>
              <input type="number" value={form.alert_giorni} onChange={e => setForm({ ...form, alert_giorni: e.target.value })}
                className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-sm" />
            </div>
            <div className="md:col-span-2">
              <label className="text-[10px] text-neutral-500 block mb-0.5">Note</label>
              <input type="text" value={form.note} onChange={e => setForm({ ...form, note: e.target.value })}
                className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-sm" />
            </div>
          </div>
          <div className="flex gap-2 mt-3">
            <button onClick={handleSave} disabled={saving || !form.dipendente_id || !form.data_scadenza}
              className="px-4 py-2 rounded-lg bg-purple-600 text-white text-sm font-medium hover:bg-purple-700 disabled:opacity-50">
              {saving ? "Salvataggio..." : editId ? "Salva modifiche" : "Crea"}
            </button>
            <button onClick={() => { setShowForm(false); resetForm(); }}
              className="px-4 py-2 rounded-lg border border-neutral-300 text-neutral-600 text-sm hover:bg-neutral-50">
              Annulla
            </button>
          </div>
        </div>
      )}

      {/* TABELLA */}
      <div className="px-4 py-3">
        {loading ? (
          <div className="text-center py-12 text-neutral-400">Caricamento...</div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-12 text-neutral-400 text-sm">
            {scadenze.length === 0 ? "Nessuna scadenza registrata." : "Nessun risultato per i filtri."}
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-neutral-200 overflow-hidden shadow-sm">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-neutral-50 border-b border-neutral-200 text-[10px] text-neutral-600 uppercase">
                  <th className="px-3 py-2 text-center w-10">Stato</th>
                  <th className="px-3 py-2 text-left">Dipendente</th>
                  <th className="px-3 py-2 text-left">Tipo</th>
                  <th className="px-3 py-2 text-left">Descrizione</th>
                  <th className="px-3 py-2 text-center">Scadenza</th>
                  <th className="px-3 py-2 text-center">Giorni</th>
                  <th className="px-3 py-2 text-left">Ente</th>
                  <th className="px-3 py-2 text-center w-20">Azioni</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(s => {
                  const st = STATO_STYLE[s.stato_calc] || STATO_STYLE.VALIDO;
                  const gg = giorniA(s.data_scadenza);
                  return (
                    <tr key={s.id} className={`border-b border-neutral-100 hover:bg-neutral-50 ${
                      s.stato_calc === "SCADUTO" ? "bg-red-50/30" :
                      s.stato_calc === "IN_SCADENZA" ? "bg-amber-50/30" : ""
                    }`}>
                      <td className="px-3 py-2 text-center">
                        <span className={`inline-block w-3 h-3 rounded-full ${st.dot}`}
                          title={st.label} />
                      </td>
                      <td className="px-3 py-2 font-medium text-neutral-800">
                        {s.cognome} {s.nome}
                        <span className="ml-1 text-[10px] text-neutral-400">{s.ruolo}</span>
                      </td>
                      <td className="px-3 py-2">
                        <span className="text-xs px-1.5 py-0.5 rounded-full bg-neutral-100 border border-neutral-200 font-medium">
                          {s.tipo_label}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-neutral-600 text-xs">{s.descrizione || "\u2014"}</td>
                      <td className="px-3 py-2 text-center">
                        <span className={`font-semibold ${s.stato_calc === "SCADUTO" ? "text-red-700" : "text-neutral-700"}`}>
                          {fmtDate(s.data_scadenza)}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-center">
                        {gg !== null && (
                          <span className={`text-xs font-semibold ${
                            gg < 0 ? "text-red-600" : gg <= 30 ? "text-amber-600" : "text-emerald-600"
                          }`}>
                            {gg < 0 ? `${Math.abs(gg)}gg fa` : gg === 0 ? "Oggi" : `${gg}gg`}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-xs text-neutral-500">{s.ente_rilascio || "\u2014"}</td>
                      <td className="px-3 py-2 text-center">
                        <div className="flex items-center justify-center gap-1">
                          <button onClick={() => openEdit(s)}
                            className="text-[10px] px-1.5 py-0.5 rounded bg-sky-100 text-sky-700 hover:bg-sky-200">
                            Modifica
                          </button>
                          <button onClick={() => handleDelete(s.id)}
                            className="text-[10px] px-1.5 py-0.5 rounded bg-red-100 text-red-700 hover:bg-red-200">
                            {"\u2715"}
                          </button>
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
    </div>
  );
}
