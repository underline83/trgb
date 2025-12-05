// FILE: frontend/src/pages/admin/DipendentiAnagrafica.jsx
// @version: v1.0-dipendenti-anagrafica
import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { API_BASE } from "../../config/api";

const RUOLI = [
  "Sala - Cameriere",
  "Sala - Chef de Rang",
  "Sala - Sommelier",
  "Cucina - Chef",
  "Cucina - Sous Chef",
  "Cucina - Commis",
  "Bar - Barista",
  "Altro",
];

const DOC_CATEGORIE = ["CONTRATTO", "CORSO", "CERTIFICATO", "ALTRO"];

const EMPTY_FORM = {
  id: null,
  codice: "",
  nome: "",
  cognome: "",
  ruolo: "",
  telefono: "",
  email: "",
  iban: "",
  indirizzo_via: "",
  indirizzo_cap: "",
  indirizzo_citta: "",
  indirizzo_provincia: "",
  note: "",
  attivo: true,
};

export default function DipendentiAnagrafica() {
  const navigate = useNavigate();
  const [dipendenti, setDipendenti] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  const [docs, setDocs] = useState([]);
  const [docsLoading, setDocsLoading] = useState(false);
  const [docsError, setDocsError] = useState(null);
  const [docCategoria, setDocCategoria] = useState("CONTRATTO");
  const [docDescrizione, setDocDescrizione] = useState("");
  const [docFile, setDocFile] = useState(null);
  const [docUploading, setDocUploading] = useState(false);

  const token = localStorage.getItem("token");

  const authHeaders = token
    ? {
        Authorization: `Bearer ${token}`,
      }
    : {};

  const jsonHeaders = {
    "Content-Type": "application/json",
    ...authHeaders,
  };

  // ---------------------------------
  // FETCH DIPENDENTI
  // ---------------------------------
  const loadDipendenti = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/dipendenti`, {
        headers: authHeaders,
      });
      if (!res.ok) {
        if (res.status === 401) {
          throw new Error("Token non valido o scaduto. Effettua di nuovo il login.");
        }
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || "Errore nel caricamento dei dipendenti.");
      }
      const data = await res.json();
      setDipendenti(Array.isArray(data) ? data : []);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDipendenti();
  }, []);

  // ---------------------------------
  // SELEZIONE / RESET FORM
  // ---------------------------------
  const handleSelectDipendente = (d) => {
    setForm({
      id: d.id,
      codice: d.codice || "",
      nome: d.nome || "",
      cognome: d.cognome || "",
      ruolo: d.ruolo || "",
      telefono: d.telefono || "",
      email: d.email || "",
      iban: d.iban || "",
      indirizzo_via: d.indirizzo_via || "",
      indirizzo_cap: d.indirizzo_cap || "",
      indirizzo_citta: d.indirizzo_citta || "",
      indirizzo_provincia: d.indirizzo_provincia || "",
      note: d.note || "",
      attivo: d.attivo ?? true,
    });
    loadDocumenti(d.id);
  };

  const handleNewDipendente = () => {
    setForm(EMPTY_FORM);
    setDocs([]);
    setDocsError(null);
  };

  const handleChange = (field, value) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  // ---------------------------------
  // SALVA / UPDATE DIPENDENTE
  // ---------------------------------
  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError(null);

    const payload = {
      codice: form.codice,
      nome: form.nome,
      cognome: form.cognome,
      ruolo: form.ruolo,
      telefono: form.telefono || null,
      email: form.email || null,
      iban: form.iban || null,
      indirizzo_via: form.indirizzo_via || null,
      indirizzo_cap: form.indirizzo_cap || null,
      indirizzo_citta: form.indirizzo_citta || null,
      indirizzo_provincia: form.indirizzo_provincia || null,
      note: form.note || null,
      attivo: !!form.attivo,
    };

    const isEdit = !!form.id;
    const url = isEdit
      ? `${API_BASE}/dipendenti/${form.id}`
      : `${API_BASE}/dipendenti`;
    const method = isEdit ? "PUT" : "POST";

    try {
      const res = await fetch(url, {
        method,
        headers: jsonHeaders,
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || "Errore nel salvataggio del dipendente.");
      }
      const saved = await res.json();

      // aggiorno lista
      if (isEdit) {
        setDipendenti((prev) =>
          prev.map((d) => (d.id === saved.id ? saved : d))
        );
      } else {
        setDipendenti((prev) => [...prev, saved]);
        setForm({
          ...form,
          id: saved.id,
        });
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  // ---------------------------------
  // SOFT DELETE (disattiva)
  // ---------------------------------
  const handleDisattiva = async (dipendenteId) => {
    if (!window.confirm("Vuoi davvero disattivare questo dipendente?")) return;
    try {
      const res = await fetch(`${API_BASE}/dipendenti/${dipendenteId}`, {
        method: "DELETE",
        headers: authHeaders,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || "Errore nella disattivazione.");
      }
      setDipendenti((prev) =>
        prev.map((d) =>
          d.id === dipendenteId ? { ...d, attivo: false } : d
        )
      );
      if (form.id === dipendenteId) {
        setForm((prev) => ({ ...prev, attivo: false }));
      }
    } catch (e) {
      setError(e.message);
    }
  };

  // ---------------------------------
  // DOCUMENTI — FETCH
  // ---------------------------------
  const loadDocumenti = async (dipendenteId) => {
    if (!dipendenteId) return;
    setDocsLoading(true);
    setDocsError(null);
    try {
      const res = await fetch(
        `${API_BASE}/dipendenti/${dipendenteId}/documenti`,
        {
          headers: authHeaders,
        }
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(
          err.detail || "Errore nel caricamento dei documenti."
        );
      }
      const data = await res.json();
      setDocs(Array.isArray(data) ? data : []);
    } catch (e) {
      setDocsError(e.message);
    } finally {
      setDocsLoading(false);
    }
  };

  // ---------------------------------
  // DOCUMENTI — UPLOAD
  // ---------------------------------
  const handleUploadDoc = async (e) => {
    e.preventDefault();
    if (!form.id) {
      setDocsError("Salva prima il dipendente, poi allega i documenti.");
      return;
    }
    if (!docFile) {
      setDocsError("Seleziona un file da allegare.");
      return;
    }

    setDocUploading(true);
    setDocsError(null);
    try {
      const fd = new FormData();
      fd.append("categoria", docCategoria);
      if (docDescrizione) fd.append("descrizione", docDescrizione);
      fd.append("file", docFile);

      const res = await fetch(
        `${API_BASE}/dipendenti/${form.id}/documenti`,
        {
          method: "POST",
          headers: authHeaders, // niente Content-Type manuale
          body: fd,
        }
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || "Errore nell'upload del documento.");
      }
      const nuovo = await res.json();
      setDocs((prev) => [nuovo, ...prev]);
      setDocFile(null);
      setDocDescrizione("");
    } catch (e) {
      setDocsError(e.message);
    } finally {
      setDocUploading(false);
    }
  };

  // ---------------------------------
  // DOCUMENTI — DELETE
  // ---------------------------------
  const handleDeleteDoc = async (docId) => {
    if (!window.confirm("Vuoi eliminare questo documento?")) return;
    try {
      const res = await fetch(
        `${API_BASE}/dipendenti/documenti/${docId}`,
        {
          method: "DELETE",
          headers: authHeaders,
        }
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || "Errore nell'eliminazione del documento.");
      }
      setDocs((prev) => prev.filter((d) => d.id !== docId));
    } catch (e) {
      setDocsError(e.message);
    }
  };

  // ---------------------------------
  // RENDER
  // ---------------------------------
  return (
    <div className="min-h-screen bg-neutral-100 p-6 font-sans">
      <div className="max-w-6xl mx-auto bg-white shadow-2xl rounded-3xl p-8 border border-neutral-200">
        {/* HEADER */}
        <div className="flex flex-col sm:flex-row justify-between gap-4 mb-6">
          <div>
            <h1 className="text-3xl sm:text-4xl font-bold text-amber-900 tracking-wide font-playfair">
              👥 Anagrafica Dipendenti
            </h1>
            <p className="text-neutral-600 mt-1">
              Gestisci anagrafiche, ruoli, IBAN, indirizzi e documenti per
              ogni dipendente.
            </p>
          </div>
          <div className="flex flex-col items-end gap-2">
            <button
              onClick={() => navigate("/admin")}
              className="px-4 py-2 rounded-full border border-neutral-300 text-sm text-neutral-700 hover:bg-neutral-100 transition"
            >
              ← Torna al menu Amministrazione
            </button>
            <button
              onClick={handleNewDipendente}
              className="px-4 py-2 rounded-full bg-amber-900 text-amber-50 text-sm font-semibold shadow hover:bg-amber-800 transition"
            >
              + Nuovo dipendente
            </button>
          </div>
        </div>

        {error && (
          <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            {error}
          </div>
        )}

        {/* CONTENUTO PRINCIPALE: LISTA + FORM */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* LISTA DIPENDENTI */}
          <div>
            <h2 className="text-xl font-semibold mb-3 font-playfair text-neutral-800">
              Elenco dipendenti
            </h2>

            <div className="mb-3 text-sm text-neutral-600">
              Clicca su un dipendente per modificarne i dati e gestire gli
              allegati.
            </div>

            <div className="border border-neutral-200 rounded-2xl overflow-hidden bg-neutral-50">
              {loading ? (
                <div className="p-4 text-sm text-neutral-600">
                  Caricamento in corso...
                </div>
              ) : dipendenti.length === 0 ? (
                <div className="p-4 text-sm text-neutral-600">
                  Nessun dipendente inserito.
                </div>
              ) : (
                <table className="w-full text-sm">
                  <thead className="bg-neutral-100 text-neutral-700">
                    <tr>
                      <th className="px-3 py-2 text-left">Nome</th>
                      <th className="px-3 py-2 text-left">Ruolo</th>
                      <th className="px-3 py-2 text-left">Telefono</th>
                      <th className="px-3 py-2 text-left">Email</th>
                      <th className="px-3 py-2 text-center">Stato</th>
                      <th className="px-3 py-2 text-right">Azioni</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dipendenti.map((d) => (
                      <tr
                        key={d.id}
                        className={`border-t border-neutral-200 hover:bg-amber-50 cursor-pointer ${
                          !d.attivo ? "opacity-60" : ""
                        }`}
                        onClick={() => handleSelectDipendente(d)}
                      >
                        <td className="px-3 py-2">
                          {d.cognome} {d.nome}
                        </td>
                        <td className="px-3 py-2">{d.ruolo}</td>
                        <td className="px-3 py-2">{d.telefono}</td>
                        <td className="px-3 py-2">{d.email}</td>
                        <td className="px-3 py-2 text-center">
                          <span
                            className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                              d.attivo
                                ? "bg-emerald-100 text-emerald-800"
                                : "bg-neutral-200 text-neutral-700"
                            }`}
                          >
                            {d.attivo ? "Attivo" : "Disattivo"}
                          </span>
                        </td>
                        <td
                          className="px-3 py-2 text-right"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {d.attivo && (
                            <button
                              onClick={() => handleDisattiva(d.id)}
                              className="text-xs text-red-600 hover:text-red-800"
                            >
                              Disattiva
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>

          {/* FORM DETTAGLIO + DOCUMENTI */}
          <div>
            <h2 className="text-xl font-semibold mb-3 font-playfair text-neutral-800">
              {form.id ? "Modifica dipendente" : "Nuovo dipendente"}
            </h2>

            <form
              onSubmit={handleSave}
              className="space-y-4 border border-neutral-200 rounded-2xl p-4 bg-neutral-50"
            >
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-neutral-700 mb-1">
                    Codice interno
                  </label>
                  <input
                    type="text"
                    value={form.codice}
                    onChange={(e) =>
                      handleChange("codice", e.target.value)
                    }
                    className="w-full rounded-xl border border-neutral-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
                    placeholder="DIP001"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-neutral-700 mb-1">
                    Ruolo
                  </label>
                  <select
                    value={form.ruolo}
                    onChange={(e) =>
                      handleChange("ruolo", e.target.value)
                    }
                    className="w-full rounded-xl border border-neutral-300 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-amber-500"
                    required
                  >
                    <option value="">Seleziona un ruolo…</option>
                    {RUOLI.map((r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-neutral-700 mb-1">
                    Nome
                  </label>
                  <input
                    type="text"
                    value={form.nome}
                    onChange={(e) =>
                      handleChange("nome", e.target.value)
                    }
                    className="w-full rounded-xl border border-neutral-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-neutral-700 mb-1">
                    Cognome
                  </label>
                  <input
                    type="text"
                    value={form.cognome}
                    onChange={(e) =>
                      handleChange("cognome", e.target.value)
                    }
                    className="w-full rounded-xl border border-neutral-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-neutral-700 mb-1">
                    Telefono
                  </label>
                  <input
                    type="tel"
                    value={form.telefono}
                    onChange={(e) =>
                      handleChange("telefono", e.target.value)
                    }
                    className="w-full rounded-xl border border-neutral-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
                    placeholder="+39 …"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-neutral-700 mb-1">
                    Email
                  </label>
                  <input
                    type="email"
                    value={form.email}
                    onChange={(e) =>
                      handleChange("email", e.target.value)
                    }
                    className="w-full rounded-xl border border-neutral-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
                    placeholder="nome@esempio.it"
                  />
                </div>
              </div>

              {/* IBAN */}
              <div>
                <label className="block text-xs font-medium text-neutral-700 mb-1">
                  IBAN
                </label>
                <input
                  type="text"
                  value={form.iban}
                  onChange={(e) => handleChange("iban", e.target.value)}
                  className="w-full rounded-xl border border-neutral-300 px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-amber-500"
                  placeholder="IT00 X000 0000 0000 0000 0000 000"
                />
                <p className="text-[11px] text-neutral-500 mt-1">
                  Solo memoria interna, nessun controllo automatico di
                  validità lato server.
                </p>
              </div>

              {/* INDIRIZZO */}
              <div className="grid grid-cols-1 gap-3">
                <div>
                  <label className="block text-xs font-medium text-neutral-700 mb-1">
                    Indirizzo (via e numero)
                  </label>
                  <input
                    type="text"
                    value={form.indirizzo_via}
                    onChange={(e) =>
                      handleChange("indirizzo_via", e.target.value)
                    }
                    className="w-full rounded-xl border border-neutral-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
                    placeholder="Via Roma 10"
                  />
                </div>

                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-neutral-700 mb-1">
                      CAP
                    </label>
                    <input
                      type="text"
                      value={form.indirizzo_cap}
                      onChange={(e) =>
                        handleChange("indirizzo_cap", e.target.value)
                      }
                      className="w-full rounded-xl border border-neutral-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
                      placeholder="24121"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-neutral-700 mb-1">
                      Città
                    </label>
                    <input
                      type="text"
                      value={form.indirizzo_citta}
                      onChange={(e) =>
                        handleChange("indirizzo_citta", e.target.value)
                      }
                      className="w-full rounded-xl border border-neutral-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
                      placeholder="Bergamo"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-neutral-700 mb-1">
                      Provincia
                    </label>
                    <input
                      type="text"
                      value={form.indirizzo_provincia}
                      onChange={(e) =>
                        handleChange(
                          "indirizzo_provincia",
                          e.target.value
                        )
                      }
                      className="w-full rounded-xl border border-neutral-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
                      placeholder="BG"
                    />
                  </div>
                </div>
              </div>

              {/* NOTE + STATO */}
              <div className="space-y-2">
                <div>
                  <label className="block text-xs font-medium text-neutral-700 mb-1">
                    Note interne
                  </label>
                  <textarea
                    rows={3}
                    value={form.note}
                    onChange={(e) =>
                      handleChange("note", e.target.value)
                    }
                    className="w-full rounded-xl border border-neutral-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
                    placeholder="Es. mansioni specifiche, allergie, note su contratto…"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <input
                    id="attivo"
                    type="checkbox"
                    checked={form.attivo}
                    onChange={(e) =>
                      handleChange("attivo", e.target.checked)
                    }
                    className="h-4 w-4 rounded border-neutral-300 text-amber-900 focus:ring-amber-500"
                  />
                  <label
                    htmlFor="attivo"
                    className="text-xs font-medium text-neutral-700"
                  >
                    Dipendente attivo
                  </label>
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={handleNewDipendente}
                  className="px-4 py-2 rounded-full border border-neutral-300 text-sm text-neutral-700 hover:bg-neutral-100 transition"
                >
                  Annulla / Nuovo
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-5 py-2 rounded-full bg-amber-900 text-amber-50 text-sm font-semibold shadow hover:bg-amber-800 disabled:opacity-60 disabled:cursor-not-allowed transition"
                >
                  {saving
                    ? "Salvataggio..."
                    : form.id
                    ? "Salva modifiche"
                    : "Crea dipendente"}
                </button>
              </div>
            </form>

            {/* DOCUMENTI */}
            <div className="mt-6 border border-neutral-200 rounded-2xl p-4 bg-white">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-base font-semibold text-neutral-800 font-playfair">
                  📎 Documenti dipendente
                </h3>
                {!form.id && (
                  <span className="text-[11px] text-neutral-500">
                    Salva il dipendente per abilitare gli allegati.
                  </span>
                )}
              </div>

              {docsError && (
                <div className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">
                  {docsError}
                </div>
              )}

              {/* Form upload */}
              <form
                onSubmit={handleUploadDoc}
                className="grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] gap-3 items-end mb-4"
              >
                <div>
                  <label className="block text-xs font-medium text-neutral-700 mb-1">
                    Categoria
                  </label>
                  <select
                    value={docCategoria}
                    onChange={(e) => setDocCategoria(e.target.value)}
                    className="w-full rounded-xl border border-neutral-300 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-amber-500"
                    disabled={!form.id}
                  >
                    {DOC_CATEGORIE.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-neutral-700 mb-1">
                    Descrizione
                  </label>
                  <input
                    type="text"
                    value={docDescrizione}
                    onChange={(e) =>
                      setDocDescrizione(e.target.value)
                    }
                    className="w-full rounded-xl border border-neutral-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
                    placeholder="Es. Contratto a tempo indeterminato 2025"
                    disabled={!form.id}
                  />
                </div>
                <div className="flex flex-col md:flex-row gap-2">
                  <input
                    type="file"
                    onChange={(e) => setDocFile(e.target.files[0])}
                    className="text-xs"
                    disabled={!form.id}
                  />
                  <button
                    type="submit"
                    disabled={!form.id || docUploading}
                    className="px-4 py-2 rounded-full bg-neutral-900 text-neutral-50 text-xs font-semibold shadow hover:bg-neutral-800 disabled:opacity-60 disabled:cursor-not-allowed transition"
                  >
                    {docUploading ? "Caricamento..." : "Allega"}
                  </button>
                </div>
              </form>

              {/* Lista documenti */}
              <div className="border border-neutral-200 rounded-xl bg-neutral-50 max-h-60 overflow-auto">
                {docsLoading ? (
                  <div className="p-3 text-xs text-neutral-600">
                    Caricamento documenti...
                  </div>
                ) : docs.length === 0 ? (
                  <div className="p-3 text-xs text-neutral-600">
                    Nessun documento allegato.
                  </div>
                ) : (
                  <ul className="divide-y divide-neutral-200 text-xs">
                    {docs.map((doc) => (
                      <li
                        key={doc.id}
                        className="px-3 py-2 flex items-center justify-between gap-2"
                      >
                        <div>
                          <div className="font-medium text-neutral-800">
                            [{doc.categoria}] {doc.filename_originale}
                          </div>
                          {doc.descrizione && (
                            <div className="text-neutral-600">
                              {doc.descrizione}
                            </div>
                          )}
                          <div className="text-[10px] text-neutral-500">
                            Caricato il{" "}
                            {doc.uploaded_at?.replace("T", " ") || ""}
                          </div>
                        </div>
                        <button
                          onClick={() => handleDeleteDoc(doc.id)}
                          className="text-[11px] text-red-600 hover:text-red-800"
                        >
                          Elimina
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
