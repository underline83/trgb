// @version: v1.0 — Editor sezione Carta Bevande (sessione 2026-04-19)
// Route: /vini/carta/sezione/:key
// CRUD voci + riordino + import testo tabellare + toggle attivo/duplica/elimina.

import React, { useEffect, useState, useCallback, useMemo } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { API_BASE } from "../../config/api";
import ViniNav from "./ViniNav";
import { Btn } from "../../components/ui";
import TrgbLoader from "../../components/TrgbLoader";
import useToast from "../../hooks/useToast";
import FormDinamico from "../../components/vini/carta/FormDinamico";
import ImportTestoModal from "../../components/vini/carta/ImportTestoModal";

// Campi numerici da normalizzare prima di POST/PUT
const NUMERIC_FIELDS = new Set(["gradazione", "ibu", "prezzo_eur"]);

function normalizeValues(values) {
  const out = {};
  for (const [k, v] of Object.entries(values)) {
    if (v === "" || v === undefined || v === null) {
      out[k] = null;
      continue;
    }
    if (NUMERIC_FIELDS.has(k)) {
      const n = parseFloat(String(v).replace(",", "."));
      out[k] = isNaN(n) ? null : n;
    } else {
      out[k] = v;
    }
  }
  return out;
}

function validate(schema, values) {
  const errors = {};
  if (!schema || !Array.isArray(schema.fields)) return errors;
  for (const f of schema.fields) {
    if (f.required) {
      const v = values[f.name];
      if (v === undefined || v === null || String(v).trim() === "") {
        errors[f.name] = "Campo obbligatorio";
      }
    }
  }
  return errors;
}

function emptyFromSchema(schema) {
  const v = {};
  if (schema && Array.isArray(schema.fields)) {
    for (const f of schema.fields) v[f.name] = "";
  }
  return v;
}

export default function CartaSezioneEditor() {
  const navigate = useNavigate();
  const { key } = useParams();
  const { toast } = useToast();
  const token = localStorage.getItem("token");

  const [sezione, setSezione] = useState(null);
  const [voci, setVoci] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("");
  const [showOnlyActive, setShowOnlyActive] = useState(false);

  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [formValues, setFormValues] = useState({});
  const [formErrors, setFormErrors] = useState({});
  const [saving, setSaving] = useState(false);

  const [importOpen, setImportOpen] = useState(false);

  const authHeader = useMemo(
    () => ({ Authorization: `Bearer ${token}` }),
    [token]
  );

  // --------------------------------------------------
  // Load data
  // --------------------------------------------------
  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [sezRes, vociRes] = await Promise.all([
        fetch(`${API_BASE}/bevande/sezioni/${key}`, { headers: authHeader }),
        fetch(`${API_BASE}/bevande/voci/?sezione=${encodeURIComponent(key)}`, { headers: authHeader }),
      ]);
      if (!sezRes.ok) throw new Error(`sezione HTTP ${sezRes.status}`);
      if (!vociRes.ok) throw new Error(`voci HTTP ${vociRes.status}`);
      const sez = await sezRes.json();
      const list = await vociRes.json();
      setSezione(sez);
      setVoci(Array.isArray(list) ? list : []);
    } catch (e) {
      console.error("[CartaSezioneEditor] load:", e);
      toast("Errore nel caricamento", { kind: "error" });
    } finally {
      setLoading(false);
    }
  }, [key, authHeader, toast]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  // --------------------------------------------------
  // Derived
  // --------------------------------------------------
  const vociFiltrate = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return voci.filter((v) => {
      if (showOnlyActive && !v.attivo) return false;
      if (!q) return true;
      const hay = `${v.nome || ""} ${v.produttore || ""} ${v.descrizione || ""} ${v.tipologia || ""}`.toLowerCase();
      return hay.includes(q);
    });
  }, [voci, filter, showOnlyActive]);

  // --------------------------------------------------
  // Modal nuovo/edit
  // --------------------------------------------------
  const openNew = () => {
    setEditingId(null);
    setFormValues(emptyFromSchema(sezione?.schema_form));
    setFormErrors({});
    setModalOpen(true);
  };

  const openEdit = (voce) => {
    setEditingId(voce.id);
    // Riempi i campi noti dallo schema; i valori null diventano stringhe vuote
    const values = emptyFromSchema(sezione?.schema_form);
    for (const k of Object.keys(values)) {
      values[k] = voce[k] != null ? String(voce[k]) : "";
    }
    setFormValues(values);
    setFormErrors({});
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    setEditingId(null);
    setFormValues({});
    setFormErrors({});
  };

  const submitForm = async () => {
    const errs = validate(sezione?.schema_form, formValues);
    if (Object.keys(errs).length > 0) {
      setFormErrors(errs);
      toast("Compila i campi obbligatori", { kind: "warn" });
      return;
    }
    setSaving(true);
    try {
      const payload = { sezione_key: key, ...normalizeValues(formValues) };
      const url = editingId
        ? `${API_BASE}/bevande/voci/${editingId}`
        : `${API_BASE}/bevande/voci/`;
      const method = editingId ? "PUT" : "POST";
      const r = await fetch(url, {
        method,
        headers: { ...authHeader, "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!r.ok) {
        const txt = await r.text();
        throw new Error(txt || `HTTP ${r.status}`);
      }
      toast(editingId ? "Voce aggiornata" : "Voce creata", { kind: "success" });
      closeModal();
      loadAll();
    } catch (e) {
      console.error("[CartaSezioneEditor] submit:", e);
      toast("Errore nel salvataggio", { kind: "error" });
    } finally {
      setSaving(false);
    }
  };

  // --------------------------------------------------
  // Azioni riga
  // --------------------------------------------------
  const toggleAttivo = async (voce) => {
    try {
      const r = await fetch(`${API_BASE}/bevande/voci/${voce.id}`, {
        method: "PUT",
        headers: { ...authHeader, "Content-Type": "application/json" },
        body: JSON.stringify({ attivo: voce.attivo ? 0 : 1 }),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      loadAll();
    } catch (e) {
      console.error(e);
      toast("Errore toggle attivo", { kind: "error" });
    }
  };

  const duplicaVoce = async (voce) => {
    try {
      const payload = {
        sezione_key: key,
        nome: `${voce.nome} (copia)`,
        sottotitolo: voce.sottotitolo,
        descrizione: voce.descrizione,
        produttore: voce.produttore,
        regione: voce.regione,
        formato: voce.formato,
        gradazione: voce.gradazione,
        ibu: voce.ibu,
        tipologia: voce.tipologia,
        paese_origine: voce.paese_origine,
        prezzo_eur: voce.prezzo_eur,
        prezzo_label: voce.prezzo_label,
      };
      const r = await fetch(`${API_BASE}/bevande/voci/`, {
        method: "POST",
        headers: { ...authHeader, "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      toast("Voce duplicata", { kind: "success" });
      loadAll();
    } catch (e) {
      console.error(e);
      toast("Errore duplicazione", { kind: "error" });
    }
  };

  const eliminaVoce = async (voce) => {
    if (!window.confirm(`Eliminare "${voce.nome}"?`)) return;
    try {
      const r = await fetch(`${API_BASE}/bevande/voci/${voce.id}`, {
        method: "DELETE",
        headers: authHeader,
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      toast("Voce eliminata", { kind: "success" });
      loadAll();
    } catch (e) {
      console.error(e);
      toast("Errore eliminazione", { kind: "error" });
    }
  };

  // Spostamento su/giù via bottoni (mobile-friendly; drag&drop lo aggiungiamo dopo)
  const moveRow = async (idx, direction) => {
    const target = idx + direction;
    if (target < 0 || target >= voci.length) return;
    const next = [...voci];
    [next[idx], next[target]] = [next[target], next[idx]];
    setVoci(next);
    try {
      const r = await fetch(`${API_BASE}/bevande/voci/reorder`, {
        method: "POST",
        headers: { ...authHeader, "Content-Type": "application/json" },
        body: JSON.stringify({ sezione_key: key, order: next.map((v) => v.id) }),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
    } catch (e) {
      console.error(e);
      toast("Errore nel riordino", { kind: "error" });
      loadAll();
    }
  };

  // --------------------------------------------------
  // Import testo
  // --------------------------------------------------
  const importColumns = useMemo(() => {
    // Costruisci le colonne dall'ordine dei campi dello schema (textarea escluse: noiose)
    const fields = sezione?.schema_form?.fields || [];
    return fields
      .filter((f) => f.type !== "textarea" && f.type !== "select")
      .slice(0, 6) // massimo 6 colonne
      .map((f) => ({ key: f.name, label: f.label || f.name }));
  }, [sezione]);

  const handleBulkImport = async (rows) => {
    try {
      const payload = {
        sezione_key: key,
        rows: rows.map((r) => normalizeValues(r)),
      };
      const res = await fetch(`${API_BASE}/bevande/voci/bulk-import`, {
        method: "POST",
        headers: { ...authHeader, "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      toast(`${rows.length} voci importate`, { kind: "success" });
      loadAll();
    } catch (e) {
      console.error(e);
      toast("Errore nell'import", { kind: "error" });
      throw e;
    }
  };

  const openAnteprimaSezione = () => {
    const url = `${API_BASE}/bevande/sezioni/${key}/preview`;
    window.open(url, "_blank");
  };

  // --------------------------------------------------
  // RENDER
  // --------------------------------------------------
  if (loading) {
    return (
      <div className="min-h-screen bg-brand-cream font-sans">
        <ViniNav current="carta" />
        <div className="flex items-center justify-center py-16">
          <TrgbLoader size={48} label="Caricamento…" />
        </div>
      </div>
    );
  }

  if (!sezione) {
    return (
      <div className="min-h-screen bg-brand-cream font-sans">
        <ViniNav current="carta" />
        <div className="max-w-2xl mx-auto p-8 text-center">
          <div className="text-5xl mb-3">❌</div>
          <div className="font-semibold text-neutral-700 mb-4">Sezione non trovata: {key}</div>
          <Btn variant="secondary" onClick={() => navigate("/vini/carta")}>
            ← Torna alla Carta
          </Btn>
        </div>
      </div>
    );
  }

  const isViniSection = key === "vini";

  return (
    <div className="min-h-screen bg-brand-cream font-sans">
      <ViniNav current="carta" />
      <div className="max-w-7xl mx-auto p-4 sm:p-6">

        {/* HEADER */}
        <div className="flex flex-col lg:flex-row justify-between gap-4 mb-5">
          <div>
            <h1 className="text-2xl lg:text-3xl font-bold text-brand-ink tracking-tight font-playfair mb-1">
              📜 {sezione.nome}
            </h1>
            <p className="text-neutral-600 text-sm">
              {voci.length} voci totali · {voci.filter((v) => v.attivo).length} attive in carta
              {sezione.layout && (
                <span className="ml-2 text-neutral-400 font-mono text-xs">
                  layout: {sezione.layout}
                </span>
              )}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Btn variant="secondary" size="md" onClick={() => navigate("/vini/carta")}>
              ← Carta
            </Btn>
            <Btn variant="secondary" size="md" onClick={openAnteprimaSezione}>
              👁 Anteprima sezione
            </Btn>
            {!isViniSection && (
              <>
                <Btn variant="secondary" size="md" onClick={() => setImportOpen(true)}>
                  📋 Import testo
                </Btn>
                <Btn variant="primary" size="md" onClick={openNew}>
                  + Nuova voce
                </Btn>
              </>
            )}
          </div>
        </div>

        {isViniSection && (
          <div className="mb-4 p-4 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-900">
            ℹ️ La sezione Vini è <strong>dinamica</strong>: i dati vengono dal modulo Cantina
            (fe_magazzino_vini). Per modificare le voci vai in{" "}
            <button
              className="underline font-semibold hover:text-amber-700"
              onClick={() => navigate("/vini/magazzino")}
            >
              Cantina
            </button>
            . Qui puoi solo gestire nome/ordine/attivo della sezione.
          </div>
        )}

        {/* FILTRI */}
        {!isViniSection && (
          <div className="bg-white rounded-xl border border-neutral-200 p-3 mb-4 flex flex-col sm:flex-row gap-3 items-start sm:items-center">
            <input
              type="text"
              placeholder="🔍 Cerca per nome, produttore, tipologia…"
              className="flex-1 w-full px-3 py-2 border border-neutral-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue/40 focus:border-brand-blue"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            />
            <label className="flex items-center gap-2 text-sm text-neutral-700 whitespace-nowrap">
              <input
                type="checkbox"
                checked={showOnlyActive}
                onChange={(e) => setShowOnlyActive(e.target.checked)}
                className="w-4 h-4 accent-brand-blue"
              />
              Solo attive
            </label>
          </div>
        )}

        {/* TABELLA */}
        {!isViniSection && (
          vociFiltrate.length === 0 ? (
            <div className="bg-white rounded-2xl p-10 text-center border border-neutral-200">
              <div className="text-4xl mb-2">📭</div>
              <div className="text-neutral-700 font-semibold mb-1">
                {voci.length === 0 ? "Nessuna voce ancora" : "Nessun risultato per il filtro"}
              </div>
              <div className="text-neutral-500 text-sm">
                {voci.length === 0 && "Usa \"+ Nuova voce\" oppure \"📋 Import testo\" per popolare."}
              </div>
            </div>
          ) : (
            <div className="bg-white rounded-2xl border border-neutral-200 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-neutral-50 border-b border-neutral-200">
                    <tr>
                      <th className="px-3 py-2 text-left font-semibold text-neutral-600 text-xs uppercase w-16">#</th>
                      <th className="px-3 py-2 text-left font-semibold text-neutral-600 text-xs uppercase">Nome</th>
                      <th className="px-3 py-2 text-left font-semibold text-neutral-600 text-xs uppercase hidden md:table-cell">Meta</th>
                      <th className="px-3 py-2 text-right font-semibold text-neutral-600 text-xs uppercase">Prezzo</th>
                      <th className="px-3 py-2 text-center font-semibold text-neutral-600 text-xs uppercase">Attivo</th>
                      <th className="px-3 py-2 text-right font-semibold text-neutral-600 text-xs uppercase">Azioni</th>
                    </tr>
                  </thead>
                  <tbody>
                    {vociFiltrate.map((v, idx) => {
                      const realIdx = voci.findIndex((x) => x.id === v.id);
                      const meta = [v.produttore, v.regione || v.paese_origine, v.tipologia, v.formato]
                        .filter(Boolean)
                        .join(" · ");
                      return (
                        <tr key={v.id} className="border-b border-neutral-100 hover:bg-neutral-50">
                          <td className="px-3 py-2 text-neutral-500 text-xs">
                            <div className="flex items-center gap-1">
                              <button
                                className="w-6 h-6 rounded hover:bg-neutral-200 text-neutral-500 disabled:opacity-30"
                                onClick={() => moveRow(realIdx, -1)}
                                disabled={realIdx <= 0 || filter || showOnlyActive}
                                title="Sposta su"
                              >
                                ↑
                              </button>
                              <button
                                className="w-6 h-6 rounded hover:bg-neutral-200 text-neutral-500 disabled:opacity-30"
                                onClick={() => moveRow(realIdx, +1)}
                                disabled={realIdx >= voci.length - 1 || filter || showOnlyActive}
                                title="Sposta giù"
                              >
                                ↓
                              </button>
                            </div>
                          </td>
                          <td className="px-3 py-2">
                            <div className="font-semibold text-brand-ink">{v.nome}</div>
                            {v.sottotitolo && (
                              <div className="text-xs text-neutral-500">{v.sottotitolo}</div>
                            )}
                          </td>
                          <td className="px-3 py-2 text-xs text-neutral-600 hidden md:table-cell">
                            {meta || <span className="text-neutral-400 italic">—</span>}
                          </td>
                          <td className="px-3 py-2 text-right font-mono text-sm">
                            {v.prezzo_eur != null
                              ? `€ ${Number(v.prezzo_eur).toFixed(2)}`
                              : v.prezzo_label || <span className="text-neutral-400">—</span>}
                          </td>
                          <td className="px-3 py-2 text-center">
                            <button
                              onClick={() => toggleAttivo(v)}
                              className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-[11px] font-semibold transition ${
                                v.attivo
                                  ? "bg-emerald-100 text-emerald-700 hover:bg-emerald-200"
                                  : "bg-neutral-200 text-neutral-600 hover:bg-neutral-300"
                              }`}
                            >
                              <span className={`w-1.5 h-1.5 rounded-full ${v.attivo ? "bg-emerald-500" : "bg-neutral-400"}`} />
                              {v.attivo ? "ON" : "OFF"}
                            </button>
                          </td>
                          <td className="px-3 py-2 text-right">
                            <div className="inline-flex gap-1">
                              <button
                                onClick={() => openEdit(v)}
                                className="px-2 py-1 rounded text-xs text-neutral-700 hover:bg-neutral-200 font-medium"
                                title="Modifica"
                              >
                                ✎
                              </button>
                              <button
                                onClick={() => duplicaVoce(v)}
                                className="px-2 py-1 rounded text-xs text-neutral-700 hover:bg-neutral-200 font-medium"
                                title="Duplica"
                              >
                                ⎘
                              </button>
                              <button
                                onClick={() => eliminaVoce(v)}
                                className="px-2 py-1 rounded text-xs text-red-600 hover:bg-red-50 font-medium"
                                title="Elimina"
                              >
                                🗑
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
          )
        )}

      </div>

      {/* MODAL FORM */}
      {modalOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center justify-center p-0 sm:p-4"
          onClick={closeModal}
        >
          <div
            className="bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl w-full sm:max-w-3xl max-h-[95dvh] sm:max-h-[90vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-5 py-4 border-b border-neutral-200 flex items-center justify-between">
              <h3 className="text-lg font-bold text-brand-ink">
                {editingId ? "✎ Modifica voce" : "+ Nuova voce"}
              </h3>
              <button
                onClick={closeModal}
                className="text-neutral-400 hover:text-neutral-600 p-1 rounded transition"
              >
                <span className="text-xl leading-none">×</span>
              </button>
            </div>
            <div className="flex-1 overflow-auto px-5 py-4">
              <FormDinamico
                schema={sezione.schema_form}
                values={formValues}
                onChange={setFormValues}
                errors={formErrors}
              />
            </div>
            <div className="px-5 py-3 border-t border-neutral-200 flex justify-end gap-2">
              <Btn variant="secondary" size="md" onClick={closeModal}>
                Annulla
              </Btn>
              <Btn variant="primary" size="md" onClick={submitForm} loading={saving}>
                {editingId ? "Salva" : "Crea"}
              </Btn>
            </div>
          </div>
        </div>
      )}

      {/* MODAL IMPORT TESTO */}
      <ImportTestoModal
        open={importOpen}
        onClose={() => setImportOpen(false)}
        onConfirm={handleBulkImport}
        columns={importColumns}
      />
    </div>
  );
}
