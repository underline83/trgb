// @version: v1.1-clienti-scheda
// Scheda dettaglio cliente con tag, note/diario, preferenze, storico prenotazioni
import React, { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { API_BASE, apiFetch } from "../../config/api";
import ClientiNav from "./ClientiNav";

export default function ClientiScheda() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [cliente, setCliente] = useState(null);
  const [loading, setLoading] = useState(true);
  const [allTags, setAllTags] = useState([]);
  const [editMode, setEditMode] = useState(false);
  const [form, setForm] = useState({});
  const [toast, setToast] = useState({ show: false, message: "", type: "success" });

  // Nuova nota
  const [nuovaNota, setNuovaNota] = useState({ tipo: "nota", testo: "" });

  const showToast = (message, type = "success") => {
    setToast({ show: true, message, type });
    setTimeout(() => setToast({ show: false, message: "", type: "success" }), 3000);
  };

  const fetchCliente = async () => {
    setLoading(true);
    try {
      const res = await apiFetch(`${API_BASE}/clienti/${id}`);
      if (!res.ok) throw new Error("Cliente non trovato");
      const data = await res.json();
      setCliente(data);
      setForm(data);
    } catch (err) {
      showToast("Errore caricamento cliente", "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCliente();
    apiFetch(`${API_BASE}/clienti/tag/lista`)
      .then((r) => r.json())
      .then((data) => setAllTags(Array.isArray(data) ? data : []))
      .catch(() => {});
  }, [id]);

  const handleSave = async () => {
    try {
      const res = await apiFetch(`${API_BASE}/clienti/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!res.ok) throw new Error("Errore salvataggio");
      showToast("Cliente aggiornato");
      setEditMode(false);
      fetchCliente();
    } catch (err) {
      showToast(err.message, "error");
    }
  };

  const toggleTag = async (tagId) => {
    const hasTag = cliente.tags?.some((t) => t.id === tagId);
    try {
      await apiFetch(`${API_BASE}/clienti/${id}/tag/${tagId}`, {
        method: hasTag ? "DELETE" : "POST",
      });
      fetchCliente();
    } catch (err) {
      showToast("Errore tag", "error");
    }
  };

  const aggiungiNota = async () => {
    if (!nuovaNota.testo.trim()) return;
    try {
      await apiFetch(`${API_BASE}/clienti/${id}/note`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(nuovaNota),
      });
      setNuovaNota({ tipo: "nota", testo: "" });
      showToast("Nota aggiunta");
      fetchCliente();
    } catch (err) {
      showToast("Errore nota", "error");
    }
  };

  const eliminaNota = async (notaId) => {
    if (!confirm("Eliminare questa nota?")) return;
    try {
      await apiFetch(`${API_BASE}/clienti/${id}/note/${notaId}`, { method: "DELETE" });
      fetchCliente();
    } catch (err) {
      showToast("Errore eliminazione", "error");
    }
  };

  if (loading) return (
    <>
      <ClientiNav current="lista" />
      <div className="p-12 text-center text-neutral-400">Caricamento...</div>
    </>
  );

  if (!cliente) return (
    <>
      <ClientiNav current="lista" />
      <div className="p-12 text-center text-neutral-400">Cliente non trovato</div>
    </>
  );

  const fmt = (v) => (v != null && v !== "" && v !== "None" ? v : "—");

  const Field = ({ label, field, type = "text", textarea = false }) => (
    <div>
      <label className="text-xs text-neutral-500 font-medium">{label}</label>
      {editMode ? (
        textarea ? (
          <textarea
            value={form[field] || ""}
            onChange={(e) => setForm({ ...form, [field]: e.target.value })}
            className="w-full mt-0.5 border border-neutral-300 rounded-lg px-3 py-1.5 text-sm focus:ring-2 focus:ring-teal-300 outline-none"
            rows={3}
          />
        ) : (
          <input
            type={type}
            value={form[field] || ""}
            onChange={(e) => setForm({ ...form, [field]: e.target.value })}
            className="w-full mt-0.5 border border-neutral-300 rounded-lg px-3 py-1.5 text-sm focus:ring-2 focus:ring-teal-300 outline-none"
          />
        )
      ) : (
        <p className="text-sm text-neutral-800 mt-0.5">{fmt(cliente[field])}</p>
      )}
    </div>
  );

  const TIPI_NOTA = [
    { value: "nota", label: "📝 Nota" },
    { value: "telefonata", label: "📞 Telefonata" },
    { value: "evento", label: "🎉 Evento" },
    { value: "reclamo", label: "⚠️ Reclamo" },
    { value: "preferenza", label: "🍽️ Preferenza" },
  ];

  return (
    <>
      <ClientiNav current="lista" />
      <div className="min-h-screen bg-neutral-50">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6">
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <button
                onClick={() => navigate("/clienti/lista")}
                className="text-sm text-neutral-500 hover:text-neutral-700"
              >
                ← Lista
              </button>
              <h1 className="text-2xl font-bold text-neutral-900">
                {cliente.vip ? "⭐ " : ""}{cliente.nome} {cliente.cognome}
                {cliente.rank && (
                  <span className={`ml-2 text-sm px-2 py-0.5 rounded-full ${
                    cliente.rank === "Gold" ? "bg-yellow-100 text-yellow-700" :
                    cliente.rank === "Silver" ? "bg-neutral-200 text-neutral-600" :
                    cliente.rank === "Bronze" ? "bg-orange-100 text-orange-700" :
                    "bg-red-100 text-red-600"
                  }`}>
                    {cliente.rank}
                  </span>
                )}
              </h1>
            </div>
            <div className="flex gap-2">
              {editMode ? (
                <>
                  <button onClick={() => { setEditMode(false); setForm(cliente); }}
                    className="px-3 py-1.5 text-sm border border-neutral-300 rounded-lg hover:bg-neutral-100 transition">
                    Annulla
                  </button>
                  <button onClick={handleSave}
                    className="px-3 py-1.5 text-sm bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition">
                    Salva
                  </button>
                </>
              ) : (
                <button onClick={() => setEditMode(true)}
                  className="px-3 py-1.5 text-sm bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition">
                  Modifica
                </button>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* COLONNA SINISTRA: Anagrafica + Contatti */}
            <div className="lg:col-span-2 space-y-6">
              {/* Anagrafica */}
              <div className="bg-white rounded-xl border border-neutral-200 p-5 shadow-sm">
                <h2 className="text-sm font-semibold text-neutral-700 mb-4">📋 Anagrafica</h2>
                <div className="grid grid-cols-2 gap-4">
                  <Field label="Nome" field="nome" />
                  <Field label="Cognome" field="cognome" />
                  <Field label="Telefono" field="telefono" />
                  <Field label="Telefono 2" field="telefono2" />
                  <Field label="Email" field="email" type="email" />
                  <Field label="Data di nascita" field="data_nascita" />
                  <Field label="Città" field="citta" />
                  <Field label="Paese" field="paese" />
                </div>
              </div>

              {/* Preferenze ristorante */}
              <div className="bg-white rounded-xl border border-neutral-200 p-5 shadow-sm">
                <h2 className="text-sm font-semibold text-neutral-700 mb-4">🍽️ Preferenze & Allergie</h2>
                <div className="grid grid-cols-1 gap-4">
                  <Field label="Preferenze cibo" field="pref_cibo" textarea />
                  <Field label="Preferenze bevande" field="pref_bevande" textarea />
                  <Field label="Restrizioni dietetiche" field="restrizioni_dietetiche" />
                  <Field label="Allergie e intolleranze" field="allergie" />
                  <Field label="Note TheFork" field="note_thefork" textarea />
                </div>
              </div>

              {/* DIARIO NOTE */}
              <div className="bg-white rounded-xl border border-neutral-200 p-5 shadow-sm">
                <h2 className="text-sm font-semibold text-neutral-700 mb-4">📖 Diario & Note</h2>

                {/* Form nuova nota */}
                <div className="bg-neutral-50 rounded-lg p-3 mb-4 border border-neutral-200">
                  <div className="flex gap-2 mb-2">
                    <select
                      value={nuovaNota.tipo}
                      onChange={(e) => setNuovaNota({ ...nuovaNota, tipo: e.target.value })}
                      className="border border-neutral-300 rounded-lg px-2 py-1 text-sm"
                    >
                      {TIPI_NOTA.map((t) => (
                        <option key={t.value} value={t.value}>{t.label}</option>
                      ))}
                    </select>
                  </div>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={nuovaNota.testo}
                      onChange={(e) => setNuovaNota({ ...nuovaNota, testo: e.target.value })}
                      placeholder="Scrivi una nota..."
                      className="flex-1 border border-neutral-300 rounded-lg px-3 py-1.5 text-sm focus:ring-2 focus:ring-teal-300 outline-none"
                      onKeyDown={(e) => e.key === "Enter" && aggiungiNota()}
                    />
                    <button
                      onClick={aggiungiNota}
                      className="px-3 py-1.5 bg-teal-600 text-white rounded-lg text-sm hover:bg-teal-700 transition"
                    >
                      Aggiungi
                    </button>
                  </div>
                </div>

                {/* Lista note */}
                {cliente.note?.length === 0 && (
                  <p className="text-sm text-neutral-400 text-center py-4">Nessuna nota</p>
                )}
                <div className="space-y-2">
                  {cliente.note?.map((n) => (
                    <div key={n.id} className="flex items-start gap-3 py-2 border-b border-neutral-100 last:border-0">
                      <span className="text-lg">
                        {TIPI_NOTA.find((t) => t.value === n.tipo)?.label?.split(" ")[0] || "📝"}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-neutral-800">{n.testo}</p>
                        <p className="text-[11px] text-neutral-400 mt-0.5">
                          {n.data} · {n.autore || "sistema"}
                        </p>
                      </div>
                      <button
                        onClick={() => eliminaNota(n.id)}
                        className="text-xs text-neutral-400 hover:text-red-500 transition"
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* STORICO PRENOTAZIONI */}
              {cliente.prenotazioni_stats?.totale > 0 && (
                <div className="bg-white rounded-xl border border-neutral-200 p-5 shadow-sm">
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="text-sm font-semibold text-neutral-700">📅 Storico Prenotazioni</h2>
                    <div className="flex gap-3 text-xs">
                      <span className="text-emerald-600 font-medium">
                        {cliente.prenotazioni_stats.completate} completate
                      </span>
                      {cliente.prenotazioni_stats.no_show > 0 && (
                        <span className="text-amber-600 font-medium">
                          {cliente.prenotazioni_stats.no_show} no-show
                        </span>
                      )}
                      {cliente.prenotazioni_stats.cancellate > 0 && (
                        <span className="text-red-500 font-medium">
                          {cliente.prenotazioni_stats.cancellate} cancellate
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Stats rapide */}
                  <div className="grid grid-cols-4 gap-3 mb-4 text-center">
                    <div className="bg-neutral-50 rounded-lg p-2">
                      <div className="text-lg font-bold text-neutral-800">{cliente.prenotazioni_stats.totale}</div>
                      <div className="text-[10px] text-neutral-500">Totale</div>
                    </div>
                    <div className="bg-neutral-50 rounded-lg p-2">
                      <div className="text-lg font-bold text-teal-700">{cliente.prenotazioni_stats.pax_medio || "—"}</div>
                      <div className="text-[10px] text-neutral-500">Pax medio</div>
                    </div>
                    <div className="bg-neutral-50 rounded-lg p-2">
                      <div className="text-xs font-medium text-neutral-800 mt-1">{cliente.prenotazioni_stats.prima_visita || "—"}</div>
                      <div className="text-[10px] text-neutral-500">Prima visita</div>
                    </div>
                    <div className="bg-neutral-50 rounded-lg p-2">
                      <div className="text-xs font-medium text-neutral-800 mt-1">{cliente.prenotazioni_stats.ultima_visita || "—"}</div>
                      <div className="text-[10px] text-neutral-500">Ultima visita</div>
                    </div>
                  </div>

                  {/* Lista ultime prenotazioni */}
                  <div className="max-h-80 overflow-y-auto">
                    <table className="w-full text-xs">
                      <thead className="bg-neutral-50 sticky top-0">
                        <tr>
                          <th className="px-2 py-1.5 text-left font-medium text-neutral-500">Data</th>
                          <th className="px-2 py-1.5 text-left font-medium text-neutral-500">Ora</th>
                          <th className="px-2 py-1.5 text-center font-medium text-neutral-500">Pax</th>
                          <th className="px-2 py-1.5 text-left font-medium text-neutral-500">Stato</th>
                          <th className="px-2 py-1.5 text-left font-medium text-neutral-500">Canale</th>
                          <th className="px-2 py-1.5 text-left font-medium text-neutral-500">Note</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-neutral-100">
                        {cliente.prenotazioni?.map((p) => {
                          const statusColor = {
                            SEATED: "text-emerald-600", ARRIVED: "text-emerald-600", BILL: "text-emerald-600",
                            LEFT: "text-neutral-500", RECORDED: "text-sky-600",
                            CANCELED: "text-red-500", NO_SHOW: "text-amber-600", REFUSED: "text-red-500",
                          };
                          return (
                            <tr key={p.id} className="hover:bg-neutral-50">
                              <td className="px-2 py-1.5 font-medium">{p.data_pasto}</td>
                              <td className="px-2 py-1.5 text-neutral-600">{p.ora_pasto ? p.ora_pasto.substring(0, 5) : "—"}</td>
                              <td className="px-2 py-1.5 text-center font-medium">{p.pax}</td>
                              <td className={`px-2 py-1.5 font-medium ${statusColor[p.stato] || "text-neutral-600"}`}>
                                {p.stato}
                              </td>
                              <td className="px-2 py-1.5 text-neutral-500">{p.canale || "—"}</td>
                              <td className="px-2 py-1.5 text-neutral-500 max-w-[150px] truncate">
                                {p.nota_ristorante || p.nota_cliente || ""}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

            {/* COLONNA DESTRA: Tag + Info rapide */}
            <div className="space-y-6">
              {/* Tag */}
              <div className="bg-white rounded-xl border border-neutral-200 p-5 shadow-sm">
                <h2 className="text-sm font-semibold text-neutral-700 mb-3">🏷️ Tag</h2>
                <div className="flex flex-wrap gap-2">
                  {allTags.map((tag) => {
                    const active = cliente.tags?.some((t) => t.id === tag.id);
                    return (
                      <button
                        key={tag.id}
                        onClick={() => toggleTag(tag.id)}
                        className={`text-xs px-2.5 py-1 rounded-full border transition font-medium ${
                          active
                            ? "border-teal-400 bg-teal-100 text-teal-800"
                            : "border-neutral-300 bg-white text-neutral-500 hover:border-teal-300"
                        }`}
                      >
                        {active ? "✓ " : ""}{tag.nome}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Info rapide */}
              <div className="bg-white rounded-xl border border-neutral-200 p-5 shadow-sm">
                <h2 className="text-sm font-semibold text-neutral-700 mb-3">📌 Info Rapide</h2>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-neutral-500">Origine</span>
                    <span className="text-neutral-800 font-medium">{cliente.origine || "thefork"}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-neutral-500">Lingua</span>
                    <span className="text-neutral-800">{fmt(cliente.lingua)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-neutral-500">Newsletter</span>
                    <span className="text-neutral-800">{cliente.newsletter ? "Sì" : "No"}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-neutral-500">Promoter</span>
                    <span className="text-neutral-800">{cliente.promoter ? "Sì" : "No"}</span>
                  </div>
                  {cliente.thefork_created && (
                    <div className="flex justify-between">
                      <span className="text-neutral-500">Creato TF</span>
                      <span className="text-neutral-800 text-xs">{cliente.thefork_created}</span>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <span className="text-neutral-500">Aggiornato</span>
                    <span className="text-neutral-800 text-xs">{cliente.updated_at}</span>
                  </div>
                </div>
              </div>

              {/* Stato */}
              <div className="bg-white rounded-xl border border-neutral-200 p-5 shadow-sm">
                <h2 className="text-sm font-semibold text-neutral-700 mb-3">⚙️ Stato</h2>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-neutral-600">
                    {cliente.attivo ? "🟢 Attivo" : "🔴 Inattivo"}
                  </span>
                  {editMode && (
                    <label className="flex items-center gap-2 text-sm cursor-pointer">
                      <input
                        type="checkbox"
                        checked={!!form.attivo}
                        onChange={(e) => setForm({ ...form, attivo: e.target.checked })}
                        className="rounded border-neutral-300 text-teal-600"
                      />
                      Attivo
                    </label>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Toast */}
      {toast.show && (
        <div
          className={`fixed bottom-4 right-4 px-4 py-2 rounded-lg shadow-lg text-sm font-medium z-50 ${
            toast.type === "error" ? "bg-red-600 text-white" : "bg-emerald-600 text-white"
          }`}
          onClick={() => setToast({ ...toast, show: false })}
        >
          {toast.message}
        </div>
      )}
    </>
  );
}
