// @version: v2.0-mattoni — refactor con M.I UI primitives (Btn, PageLayout, StatusBadge, EmptyState)
// Pagina Bacheca Comunicazioni Staff — TRGB Gestionale (9.2)
//
// Admin/superadmin: crea, modifica, archivia comunicazioni
// Staff: vede comunicazioni attive per il proprio ruolo

import React, { useState, useEffect, useCallback } from "react";
import { apiFetch, API_BASE } from "../config/api";
import { Btn, PageLayout, StatusBadge, EmptyState } from "../components/ui";

const RUOLI_DEST = [
  { value: "tutti", label: "Tutti" },
  { value: "sala", label: "Sala" },
  { value: "cucina", label: "Cucina" },
  { value: "sommelier", label: "Sommelier" },
  { value: "admin", label: "Admin" },
];

function tempoFa(dateStr) {
  if (!dateStr) return "";
  const now = new Date();
  const d = new Date(dateStr);
  const diffMs = now - d;
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "adesso";
  if (mins < 60) return `${mins} min fa`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h fa`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "ieri";
  if (days < 7) return `${days} giorni fa`;
  return d.toLocaleDateString("it-IT", { day: "numeric", month: "short", year: "numeric" });
}

export default function Comunicazioni() {
  const role = localStorage.getItem("role") || "";
  const isAdmin = role === "admin" || role === "superadmin";

  const [comunicazioni, setComunicazioni] = useState([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState(null);

  // Form nuova comunicazione
  const [showForm, setShowForm] = useState(false);
  const [formTitolo, setFormTitolo] = useState("");
  const [formMessaggio, setFormMessaggio] = useState("");
  const [formUrgenza, setFormUrgenza] = useState("normale");
  const [formDest, setFormDest] = useState("tutti");
  const [formScadenza, setFormScadenza] = useState("");
  const [editId, setEditId] = useState(null);
  const [saving, setSaving] = useState(false);

  const mostraToast = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2500);
  };

  // ── Carica comunicazioni ──
  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const url = isAdmin ? `${API_BASE}/comunicazioni/tutte` : `${API_BASE}/comunicazioni`;
      const res = await apiFetch(url);
      if (res.ok) setComunicazioni(await res.json());
    } catch { /* silenzioso */ }
    setLoading(false);
  }, [isAdmin]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // ── Reset form ──
  const resetForm = () => {
    setFormTitolo("");
    setFormMessaggio("");
    setFormUrgenza("normale");
    setFormDest("tutti");
    setFormScadenza("");
    setEditId(null);
    setShowForm(false);
  };

  // ── Salva (crea o modifica) ──
  const handleSalva = async () => {
    if (!formTitolo.trim() || !formMessaggio.trim()) return;
    setSaving(true);
    try {
      const body = {
        titolo: formTitolo.trim(),
        messaggio: formMessaggio.trim(),
        urgenza: formUrgenza,
        dest_ruolo: formDest,
        scadenza: formScadenza || null,
      };

      let res;
      if (editId) {
        res = await apiFetch(`${API_BASE}/comunicazioni/${editId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
      } else {
        res = await apiFetch(`${API_BASE}/comunicazioni`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
      }

      if (res.ok) {
        mostraToast(editId ? "Comunicazione aggiornata" : "Comunicazione pubblicata");
        resetForm();
        fetchData();
      } else {
        mostraToast("Errore salvataggio");
      }
    } catch {
      mostraToast("Errore di rete");
    }
    setSaving(false);
  };

  // ── Modifica ──
  const handleModifica = (c) => {
    setEditId(c.id);
    setFormTitolo(c.titolo);
    setFormMessaggio(c.messaggio);
    setFormUrgenza(c.urgenza);
    setFormDest(c.dest_ruolo);
    setFormScadenza(c.scadenza || "");
    setShowForm(true);
  };

  // ── Archivia / Riattiva ──
  const handleToggleAttiva = async (c) => {
    try {
      const res = await apiFetch(`${API_BASE}/comunicazioni/${c.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ attiva: c.attiva ? 0 : 1 }),
      });
      if (res.ok) {
        mostraToast(c.attiva ? "Archiviata" : "Riattivata");
        fetchData();
      }
    } catch { mostraToast("Errore"); }
  };

  // ── Elimina ──
  const handleElimina = async (id) => {
    if (!confirm("Eliminare questa comunicazione?")) return;
    try {
      const res = await apiFetch(`${API_BASE}/comunicazioni/${id}`, { method: "DELETE" });
      if (res.ok) { mostraToast("Eliminata"); fetchData(); }
    } catch { mostraToast("Errore"); }
  };

  // ── Segna come letta (staff) ──
  const handleSegnaLetta = async (id) => {
    try {
      await apiFetch(`${API_BASE}/comunicazioni/${id}/letta`, { method: "POST" });
      setComunicazioni(prev => prev.map(c => c.id === id ? { ...c, letta: 1 } : c));
    } catch { /* silenzioso */ }
  };

  const attive = comunicazioni.filter(c => c.attiva !== 0);
  const archiviate = comunicazioni.filter(c => c.attiva === 0);

  const pageTitle = (
    <span style={{ fontFamily: "'Playfair Display', serif" }}>📌 Bacheca Staff</span>
  );

  return (
    <PageLayout
      title={pageTitle}
      actions={
        isAdmin && !showForm ? (
          <Btn variant="primary" onClick={() => setShowForm(true)}>
            + Nuova comunicazione
          </Btn>
        ) : null
      }
      wide={false}
      className="max-w-3xl"
    >
      {/* ── Form crea/modifica (solo admin) ── */}
      {isAdmin && showForm && (
        <div className="bg-white rounded-2xl shadow-sm border border-neutral-200 p-5 mb-6">
          <h2 className="text-sm font-semibold text-brand-ink mb-4">
            {editId ? "Modifica comunicazione" : "Nuova comunicazione"}
          </h2>

          <input
            type="text"
            placeholder="Titolo (es. Vino da spingere stasera)"
            value={formTitolo}
            onChange={e => setFormTitolo(e.target.value)}
            className="w-full px-3 py-2 rounded-lg border border-neutral-300 text-sm mb-3 focus:outline-none focus:ring-2 focus:ring-brand-blue/30 focus:border-brand-blue"
            style={{ fontSize: "16px" }}
          />

          <textarea
            placeholder="Messaggio per lo staff…"
            value={formMessaggio}
            onChange={e => setFormMessaggio(e.target.value)}
            rows={3}
            className="w-full px-3 py-2 rounded-lg border border-neutral-300 text-sm mb-3 focus:outline-none focus:ring-2 focus:ring-brand-blue/30 focus:border-brand-blue resize-none"
            style={{ fontSize: "16px" }}
          />

          <div className="flex flex-wrap gap-3 mb-4">
            {/* Destinatari */}
            <div className="flex-1 min-w-[140px]">
              <label className="text-[11px] text-neutral-500 uppercase tracking-wider mb-1 block">Destinatari</label>
              <select
                value={formDest}
                onChange={e => setFormDest(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-neutral-300 text-sm"
                style={{ fontSize: "16px" }}
              >
                {RUOLI_DEST.map(r => (
                  <option key={r.value} value={r.value}>{r.label}</option>
                ))}
              </select>
            </div>

            {/* Urgenza */}
            <div className="flex-1 min-w-[140px]">
              <label className="text-[11px] text-neutral-500 uppercase tracking-wider mb-1 block">Urgenza</label>
              <select
                value={formUrgenza}
                onChange={e => setFormUrgenza(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-neutral-300 text-sm"
                style={{ fontSize: "16px" }}
              >
                <option value="normale">Normale</option>
                <option value="urgente">Urgente</option>
              </select>
            </div>

            {/* Scadenza */}
            <div className="flex-1 min-w-[140px]">
              <label className="text-[11px] text-neutral-500 uppercase tracking-wider mb-1 block">Scade il (opzionale)</label>
              <input
                type="date"
                value={formScadenza}
                onChange={e => setFormScadenza(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-neutral-300 text-sm"
                style={{ fontSize: "16px" }}
              />
            </div>
          </div>

          <div className="flex gap-2 justify-end">
            <Btn variant="ghost" onClick={resetForm}>Annulla</Btn>
            <Btn
              variant="primary"
              onClick={handleSalva}
              loading={saving}
              disabled={saving || !formTitolo.trim() || !formMessaggio.trim()}
            >
              {saving ? "Salvataggio…" : editId ? "Aggiorna" : "Pubblica"}
            </Btn>
          </div>
        </div>
      )}

      {/* ── Loading ── */}
      {loading && (
        <div className="text-center py-12 text-sm text-neutral-400">Caricamento…</div>
      )}

      {/* ── Lista comunicazioni attive ── */}
      {!loading && attive.length === 0 && (
        <EmptyState
          icon="📌"
          title="Nessuna comunicazione attiva"
          description={isAdmin ? "Pubblicane una per avvisare lo staff di novità, cambi menù o alert di servizio." : "Non ci sono comunicazioni per il tuo ruolo in questo momento."}
          action={isAdmin ? (
            <Btn variant="primary" onClick={() => setShowForm(true)}>+ Nuova comunicazione</Btn>
          ) : null}
        />
      )}

      {!loading && attive.map(c => (
        <div
          key={c.id}
          className={`bg-white rounded-2xl shadow-sm border mb-3 overflow-hidden transition ${
            c.urgenza === "urgente"
              ? "border-l-4 border-l-brand-red border-neutral-200"
              : "border-neutral-200"
          } ${c.letta === 0 ? "ring-1 ring-brand-blue/20" : "opacity-80"}`}
        >
          <div className="px-5 py-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  {c.urgenza === "urgente" && (
                    <StatusBadge tone="danger" size="sm">Urgente</StatusBadge>
                  )}
                  {c.letta === 0 && (
                    <span className="w-2 h-2 rounded-full bg-brand-blue flex-shrink-0" />
                  )}
                </div>
                <h3 className="text-base font-semibold text-brand-ink">{c.titolo}</h3>
                <p className="text-sm text-neutral-600 mt-1 whitespace-pre-line">{c.messaggio}</p>
                <div className="flex items-center gap-2 mt-2 text-[11px] text-neutral-400 flex-wrap">
                  <span>{c.autore}</span>
                  <span>·</span>
                  <span>{tempoFa(c.created_at)}</span>
                  {c.dest_ruolo !== "tutti" && (
                    <>
                      <span>·</span>
                      <StatusBadge tone="neutral" size="sm">→ {c.dest_ruolo}</StatusBadge>
                    </>
                  )}
                  {c.scadenza && (
                    <>
                      <span>·</span>
                      <span>scade {c.scadenza}</span>
                    </>
                  )}
                </div>
              </div>
            </div>

            {/* Azioni */}
            <div className="flex gap-2 mt-3 pt-2 border-t border-neutral-100">
              {c.letta === 0 && !isAdmin && (
                <button
                  onClick={() => handleSegnaLetta(c.id)}
                  className="text-xs text-brand-blue hover:underline"
                >
                  Segna come letta
                </button>
              )}
              {isAdmin && (
                <>
                  <button onClick={() => handleModifica(c)} className="text-xs text-brand-blue hover:underline">
                    Modifica
                  </button>
                  <button onClick={() => handleToggleAttiva(c)} className="text-xs text-neutral-500 hover:underline">
                    Archivia
                  </button>
                  <button onClick={() => handleElimina(c.id)} className="text-xs text-brand-red hover:underline">
                    Elimina
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      ))}

      {/* ── Archiviate (solo admin) ── */}
      {isAdmin && archiviate.length > 0 && (
        <div className="mt-8">
          <h2 className="text-sm font-semibold text-neutral-400 uppercase tracking-wider mb-3">
            Archiviate ({archiviate.length})
          </h2>
          {archiviate.map(c => (
            <div key={c.id} className="bg-white/60 rounded-xl border border-neutral-200 px-5 py-3 mb-2 opacity-60">
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-sm text-neutral-600">{c.titolo}</span>
                  <span className="text-[11px] text-neutral-400 ml-2">{tempoFa(c.created_at)}</span>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => handleToggleAttiva(c)} className="text-xs text-brand-blue hover:underline">
                    Riattiva
                  </button>
                  <button onClick={() => handleElimina(c.id)} className="text-xs text-brand-red hover:underline">
                    Elimina
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div
          className="fixed bottom-4 right-4 px-4 py-2 rounded-lg shadow-lg text-sm font-medium z-50 bg-emerald-600 text-white cursor-pointer"
          onClick={() => setToast(null)}
        >
          {toast}
        </div>
      )}
    </PageLayout>
  );
}
