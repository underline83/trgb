// FILE: frontend/src/pages/dipendenti/GestioneReparti.jsx
// @version: v1.3-mattoni — M.I primitives (Btn) su CTA header e form
// CRUD reparti: lista + form dettaglio con orari, pause staff, colore e icona
import React, { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { API_BASE, apiFetch } from "../../config/api";
import DipendentiNav from "./DipendentiNav";
import { Btn } from "../../components/ui";

const EMPTY = {
  id: null,
  codice: "",
  nome: "",
  icona: "",
  colore: "#2E7BE8",
  ordine: 0,
  attivo: true,
  pranzo_inizio: "12:00",
  pranzo_fine: "15:00",
  cena_inizio: "19:00",
  cena_fine: "23:30",
  pausa_pranzo_min: 30,
  pausa_cena_min: 30,
};

const PALETTE_REPARTO = [
  "#2E7BE8", "#E8402B", "#2EB872", "#F59E0B",
  "#A855F7", "#EC4899", "#14B8A6", "#6366F1",
  "#0EA5E9", "#DC2626", "#DB2777", "#0891B2",
];

const EMOJI_REPARTO = [
  "\uD83C\uDF7D\uFE0F", // 🍽️
  "\uD83D\uDC68\u200D\uD83C\uDF73", // 👨‍🍳
  "\uD83C\uDF77", // 🍷
  "\uD83C\uDF7A", // 🍺
  "\uD83C\uDF70", // 🍰
  "\uD83E\uDDF9", // 🧹
  "\uD83D\uDCBC", // 💼
  "\uD83D\uDEBF", // 🚿
];

export default function GestioneReparti({ embedded = false }) {
  const navigate = useNavigate();
  const [reparti, setReparti] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  // true quando l'utente ha cliccato "+ Nuovo reparto" ma non ha ancora salvato.
  // Senza questo flag il form vuoto non viene mostrato perché EMPTY.codice === ""
  // soddisfa la condizione `!form.id && !form.codice` che mostra il placeholder.
  const [isCreating, setIsCreating] = useState(false);

  const jsonHeaders = { "Content-Type": "application/json" };

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch(`${API_BASE}/reparti/?include_inactive=true`);
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).detail || "Errore");
      const data = await res.json();
      setReparti(Array.isArray(data) ? data : []);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleSelect = (r) => {
    setIsCreating(false);
    setForm({
      id: r.id,
      codice: r.codice || "",
      nome: r.nome || "",
      icona: r.icona || "",
      colore: r.colore || "#2E7BE8",
      ordine: r.ordine ?? 0,
      attivo: r.attivo ?? true,
      pranzo_inizio: r.pranzo_inizio || "12:00",
      pranzo_fine: r.pranzo_fine || "15:00",
      cena_inizio: r.cena_inizio || "19:00",
      cena_fine: r.cena_fine || "23:30",
      pausa_pranzo_min: r.pausa_pranzo_min ?? 30,
      pausa_cena_min: r.pausa_cena_min ?? 30,
    });
  };

  const handleNew = () => {
    setForm(EMPTY);
    setIsCreating(true);
  };
  const handleChange = (f, v) => setForm((p) => ({ ...p, [f]: v }));

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    const payload = {
      codice: form.codice.trim().toUpperCase(),
      nome: form.nome.trim(),
      icona: form.icona || null,
      colore: form.colore || null,
      ordine: Number(form.ordine) || 0,
      attivo: !!form.attivo,
      pranzo_inizio: form.pranzo_inizio || null,
      pranzo_fine: form.pranzo_fine || null,
      cena_inizio: form.cena_inizio || null,
      cena_fine: form.cena_fine || null,
      pausa_pranzo_min: Math.max(0, Number(form.pausa_pranzo_min) || 0),
      pausa_cena_min: Math.max(0, Number(form.pausa_cena_min) || 0),
    };
    const isEdit = !!form.id;
    try {
      const res = await apiFetch(
        isEdit ? `${API_BASE}/reparti/${form.id}` : `${API_BASE}/reparti/`,
        { method: isEdit ? "PUT" : "POST", headers: jsonHeaders, body: JSON.stringify(payload) }
      );
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).detail || "Errore");
      const saved = await res.json();
      if (isEdit) setReparti((p) => p.map((r) => (r.id === saved.id ? saved : r)));
      else {
        setReparti((p) => [...p, saved]);
        setForm((f) => ({ ...f, id: saved.id }));
        setIsCreating(false); // il record ora esiste: esci dalla modalità "nuovo"
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDisattiva = async (id) => {
    if (!confirm("Disattivare questo reparto? (I dipendenti associati devono essere prima riassegnati)")) return;
    try {
      const res = await apiFetch(`${API_BASE}/reparti/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.detail || "Errore disattivazione");
      }
      setReparti((p) => p.map((r) => (r.id === id ? { ...r, attivo: false } : r)));
      if (form.id === id) setForm((p) => ({ ...p, attivo: false }));
    } catch (e) {
      setError(e.message);
    }
  };

  const attivi = reparti.filter((r) => r.attivo).length;

  const content = (
    <>
      {/* HEADER interno */}
      <div className="bg-white border-b border-neutral-200 px-4 py-2.5 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-bold text-purple-900 font-playfair">
            {"\uD83C\uDFE2"} Reparti
          </h2>
          <span className="text-[10px] text-neutral-400">
            {attivi} attiv{attivi === 1 ? "o" : "i"}
          </span>
        </div>
        <Btn variant="chip" tone="violet" size="sm" onClick={handleNew}>
          + Nuovo reparto
        </Btn>
      </div>

      {error && (
        <div className="mx-4 mt-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800 flex-shrink-0">
          {error}
          <button onClick={() => setError(null)} className="ml-2 text-red-500">{"\u00D7"}</button>
        </div>
      )}

      <div className="flex flex-1 min-h-0">
        {/* SIDEBAR LISTA */}
        <div className="w-72 bg-white border-r border-neutral-200 flex flex-col">
          <div className="flex-1 overflow-y-auto">
            {loading ? (
              <div className="p-3 text-xs text-neutral-400">Caricamento...</div>
            ) : reparti.length === 0 ? (
              <div className="p-3 text-xs text-neutral-400">Nessun reparto.</div>
            ) : (
              reparti.map((r) => (
                <div
                  key={r.id}
                  onClick={() => handleSelect(r)}
                  className={`px-3 py-3 border-b border-neutral-50 cursor-pointer transition text-xs
                    ${form.id === r.id ? "bg-purple-50 border-l-2 border-l-purple-500" : "hover:bg-neutral-50"}
                    ${!r.attivo ? "opacity-50" : ""}`}
                  style={{ minHeight: 48 }}>
                  <div className="flex items-center gap-2">
                    <span
                      className="inline-block rounded-full flex-shrink-0"
                      style={{ width: 12, height: 12, backgroundColor: r.colore || "#ccc" }}
                    />
                    <span className="text-base">{r.icona || "\uD83C\uDFE2"}</span>
                    <div className="font-semibold text-neutral-800">{r.nome}</div>
                  </div>
                  <div className="flex items-center gap-2 mt-1 ml-[22px] text-neutral-500">
                    <span className="font-mono">{r.codice}</span>
                    {!r.attivo && (
                      <span className="text-[9px] bg-neutral-200 text-neutral-600 px-1 rounded">inattivo</span>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* FORM DETTAGLIO */}
        <div className="flex-1 overflow-y-auto">
          {!form.id && !isCreating ? (
            <div className="flex items-center justify-center h-full text-neutral-400 text-sm text-center px-6">
              <div>
                <div className="text-5xl mb-3">{"\uD83C\uDFE2"}</div>
                <p>Seleziona un reparto dalla lista o creane uno nuovo.</p>
                <p className="text-xs mt-2 text-neutral-400">
                  I reparti definiscono orari standard, pause staff e colore del foglio turni.
                </p>
              </div>
            </div>
          ) : (
            <div className="p-5 max-w-3xl">
              <div className="flex items-center gap-3 mb-4">
                <span className="text-3xl">{form.icona || "\uD83C\uDFE2"}</span>
                <h2 className="text-xl font-bold text-neutral-800 font-playfair">
                  {form.id ? form.nome : "Nuovo reparto"}
                </h2>
                {form.id && (
                  <span
                    className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                      form.attivo ? "bg-emerald-100 text-emerald-700" : "bg-neutral-200 text-neutral-600"
                    }`}>
                    {form.attivo ? "Attivo" : "Disattivo"}
                  </span>
                )}
              </div>

              <form onSubmit={handleSave} className="space-y-4">
                {/* Identificativi */}
                <div className="grid grid-cols-[120px_1fr_100px] gap-3">
                  <Field
                    label="Codice"
                    value={form.codice}
                    onChange={(v) => handleChange("codice", v.toUpperCase())}
                    placeholder="SALA"
                    mono
                    required
                  />
                  <Field
                    label="Nome"
                    value={form.nome}
                    onChange={(v) => handleChange("nome", v)}
                    placeholder="Sala"
                    required
                  />
                  <Field
                    label="Ordine"
                    type="number"
                    value={form.ordine}
                    onChange={(v) => handleChange("ordine", v)}
                  />
                </div>

                {/* Icona + Colore */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[10px] text-neutral-500 font-medium mb-1">Icona (emoji)</label>
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={form.icona || ""}
                        onChange={(e) => handleChange("icona", e.target.value)}
                        className="w-20 px-3 py-2 border border-neutral-200 rounded-lg text-lg text-center"
                        maxLength={4}
                      />
                      <div className="flex flex-wrap gap-1">
                        {EMOJI_REPARTO.map((em) => (
                          <button
                            key={em}
                            type="button"
                            onClick={() => handleChange("icona", em)}
                            className={`text-xl p-1 rounded hover:bg-neutral-100 ${
                              form.icona === em ? "bg-purple-100 ring-1 ring-purple-400" : ""
                            }`}
                            style={{ minWidth: 32, minHeight: 32 }}>
                            {em}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div>
                    <label className="block text-[10px] text-neutral-500 font-medium mb-1">Colore reparto</label>
                    <div className="flex items-center gap-2">
                      <input
                        type="color"
                        value={form.colore || "#2E7BE8"}
                        onChange={(e) => handleChange("colore", e.target.value.toUpperCase())}
                        className="h-9 w-12 border border-neutral-200 rounded-lg cursor-pointer"
                      />
                      <input
                        type="text"
                        value={form.colore || ""}
                        onChange={(e) => handleChange("colore", e.target.value.toUpperCase())}
                        className="flex-1 px-3 py-2 border border-neutral-200 rounded-lg text-xs font-mono"
                        maxLength={7}
                      />
                    </div>
                    <div className="flex flex-wrap gap-1.5 mt-1.5">
                      {PALETTE_REPARTO.map((hex) => (
                        <button
                          key={hex}
                          type="button"
                          onClick={() => handleChange("colore", hex)}
                          className={`rounded-md transition ${
                            form.colore?.toUpperCase() === hex ? "ring-2 ring-offset-1 ring-neutral-800" : ""
                          }`}
                          style={{ backgroundColor: hex, width: 24, height: 24 }}
                          title={hex}
                        />
                      ))}
                    </div>
                  </div>
                </div>

                {/* Orari standard */}
                <div className="border-t border-neutral-100 pt-3">
                  <p className="text-[10px] text-neutral-400 font-medium mb-2 uppercase">
                    Orari standard
                  </p>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="bg-amber-50 border border-amber-100 rounded-lg p-3">
                      <p className="text-xs font-semibold text-amber-800 mb-2">
                        {"\u2600\uFE0F"} Pranzo
                      </p>
                      <div className="grid grid-cols-2 gap-2">
                        <Field
                          label="Inizio"
                          type="time"
                          value={form.pranzo_inizio || ""}
                          onChange={(v) => handleChange("pranzo_inizio", v)}
                        />
                        <Field
                          label="Fine"
                          type="time"
                          value={form.pranzo_fine || ""}
                          onChange={(v) => handleChange("pranzo_fine", v)}
                        />
                      </div>
                    </div>
                    <div className="bg-indigo-50 border border-indigo-100 rounded-lg p-3">
                      <p className="text-xs font-semibold text-indigo-800 mb-2">
                        {"\uD83C\uDF19"} Cena
                      </p>
                      <div className="grid grid-cols-2 gap-2">
                        <Field
                          label="Inizio"
                          type="time"
                          value={form.cena_inizio || ""}
                          onChange={(v) => handleChange("cena_inizio", v)}
                        />
                        <Field
                          label="Fine"
                          type="time"
                          value={form.cena_fine || ""}
                          onChange={(v) => handleChange("cena_fine", v)}
                        />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Pause staff */}
                <div className="border-t border-neutral-100 pt-3">
                  <p className="text-[10px] text-neutral-400 font-medium mb-2 uppercase">
                    Pause staff (minuti scalati dalle ore nette)
                  </p>
                  <div className="grid grid-cols-2 gap-3">
                    <Field
                      label="Pausa pranzo (min)"
                      type="number"
                      value={form.pausa_pranzo_min}
                      onChange={(v) => handleChange("pausa_pranzo_min", v)}
                    />
                    <Field
                      label="Pausa cena (min)"
                      type="number"
                      value={form.pausa_cena_min}
                      onChange={(v) => handleChange("pausa_cena_min", v)}
                    />
                  </div>
                  <p className="text-[10px] text-neutral-400 mt-1">
                    Detratti una sola volta per servizio, solo per turni CONFERMATO.
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <input
                    id="attivo"
                    type="checkbox"
                    checked={form.attivo}
                    onChange={(e) => handleChange("attivo", e.target.checked)}
                    className="rounded border-neutral-300 text-purple-600"
                  />
                  <label htmlFor="attivo" className="text-xs text-neutral-700">
                    Reparto attivo
                  </label>
                </div>

                <div className="flex gap-2 pt-2">
                  <Btn variant="chip" tone="violet" size="md" type="submit" disabled={saving} loading={saving}>
                    {saving ? "Salvataggio..." : form.id ? "Salva modifiche" : "Crea reparto"}
                  </Btn>
                  {form.id && form.attivo && (
                    <Btn variant="chip" tone="red" size="md" type="button" onClick={() => handleDisattiva(form.id)}>
                      Disattiva
                    </Btn>
                  )}
                </div>
              </form>
            </div>
          )}
        </div>
      </div>
    </>
  );

  if (embedded) {
    return (
      <div className="flex flex-col h-full min-h-0">
        {content}
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-brand-cream flex flex-col">
      <DipendentiNav current="impostazioni" />
      {content}
    </div>
  );
}

// Componente Field riusabile
function Field({ label, value, onChange, placeholder, type = "text", required, mono }) {
  return (
    <div>
      <label className="block text-[10px] text-neutral-500 font-medium mb-1">{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`w-full px-3 py-2 border border-neutral-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-purple-300 ${
          mono ? "font-mono uppercase" : ""
        }`}
        placeholder={placeholder}
        required={required}
      />
    </div>
  );
}
