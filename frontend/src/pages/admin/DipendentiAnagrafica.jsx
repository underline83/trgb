import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { API_BASE } from "../../config/api";

export default function DipendentiAnagrafica() {
  const navigate = useNavigate();

  const [dipendenti, setDipendenti] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const [form, setForm] = useState({
    id: null,
    codice: "",
    nome: "",
    cognome: "",
    ruolo: "",
    telefono: "",
    email: "",
    note: "",
    attivo: true,
  });

  const token = localStorage.getItem("token");

  const fetchDipendenti = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `${API_BASE}/dipendenti?include_inactive=true`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(
          err.detail || "Errore nel caricamento dei dipendenti."
        );
      }

      const data = await res.json();
      setDipendenti(data || []);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDipendenti();
  }, []);

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setForm((prev) => ({
      ...prev,
      [name]: type === "checkbox" ? checked : value,
    }));
  };

  const resetForm = () => {
    setForm({
      id: null,
      codice: "",
      nome: "",
      cognome: "",
      ruolo: "",
      telefono: "",
      email: "",
      note: "",
      attivo: true,
    });
    setError(null);
  };

  const handleEdit = (d) => {
    setForm({
      id: d.id,
      codice: d.codice || "",
      nome: d.nome || "",
      cognome: d.cognome || "",
      ruolo: d.ruolo || "",
      telefono: d.telefono || "",
      email: d.email || "",
      note: d.note || "",
      attivo: !!d.attivo,
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);

    const payload = {
      codice: form.codice.trim(),
      nome: form.nome.trim(),
      cognome: form.cognome.trim(),
      ruolo: form.ruolo.trim(),
      telefono: form.telefono.trim() || null,
      email: form.email.trim() || null,
      note: form.note.trim() || null,
      attivo: form.attivo,
    };

    if (!payload.codice || !payload.nome || !payload.cognome || !payload.ruolo) {
      setError("Compila almeno codice, nome, cognome e ruolo.");
      return;
    }

    try {
      const url = form.id
        ? `${API_BASE}/dipendenti/${form.id}`
        : `${API_BASE}/dipendenti`;
      const method = form.id ? "PUT" : "POST";

      const res = await fetch(url, {
        method,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(
          err.detail || "Errore nel salvataggio del dipendente."
        );
      }

      await fetchDipendenti();
      resetForm();
    } catch (e) {
      setError(e.message);
    }
  };

  const handleSoftDelete = async (id) => {
    if (!window.confirm("Vuoi disattivare questo dipendente?")) return;

    setError(null);

    try {
      const res = await fetch(`${API_BASE}/dipendenti/${id}`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(
          err.detail || "Errore nella disattivazione del dipendente."
        );
      }

      await fetchDipendenti();
    } catch (e) {
      setError(e.message);
    }
  };

  return (
    <div className="min-h-screen bg-neutral-100 p-6 font-sans">
      <div className="max-w-6xl mx-auto bg-white shadow-2xl rounded-3xl p-10 border border-neutral-200">
        {/* HEADER */}
        <div className="flex flex-col sm:flex-row justify-between gap-4 mb-8">
          <div>
            <h1 className="text-3xl sm:text-4xl font-bold text-amber-900 tracking-wide font-playfair mb-2">
              👥 Dipendenti — Anagrafica
            </h1>
            <p className="text-neutral-600 text-sm sm:text-base">
              Gestisci i dati anagrafici del personale, i ruoli e lo stato
              attivo/disattivo.
            </p>
          </div>

          <div className="flex flex-col gap-2 sm:items-end">
            <button
              type="button"
              onClick={() => navigate("/admin/dipendenti/turni")}
              className="px-4 py-2 rounded-xl text-sm font-medium border border-amber-300 bg-amber-50 text-amber-900 hover:bg-amber-100 shadow-sm transition"
            >
              📅 Vai al calendario turni
            </button>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => navigate("/admin")}
                className="px-4 py-2 rounded-xl text-xs font-medium border border-neutral-300 bg-neutral-50 hover:bg-neutral-100 shadow-sm transition"
              >
                ← Amministrazione
              </button>
              <button
                type="button"
                onClick={() => navigate("/")}
                className="px-4 py-2 rounded-xl text-xs font-medium border border-neutral-200 bg-white hover:bg-neutral-50 shadow-sm transition"
              >
                ← Home
              </button>
            </div>
          </div>
        </div>

        {/* FORM ANAGRAFICA */}
        <section className="mb-10">
          <h2 className="text-xl font-semibold font-playfair text-amber-900 mb-4">
            {form.id ? "Modifica dipendente" : "Nuovo dipendente"}
          </h2>

          {error && (
            <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
              {error}
            </div>
          )}

          <form
            onSubmit={handleSubmit}
            className="grid grid-cols-1 md:grid-cols-2 gap-4"
          >
            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-1">
                Codice *
              </label>
              <input
                type="text"
                name="codice"
                value={form.codice}
                onChange={handleChange}
                placeholder="DIP001"
                className="w-full rounded-xl border border-neutral-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-1">
                Ruolo *
              </label>
              <input
                type="text"
                name="ruolo"
                value={form.ruolo}
                onChange={handleChange}
                placeholder="Sala, Cucina, Bar, Lavapiatti..."
                className="w-full rounded-xl border border-neutral-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-1">
                Nome *
              </label>
              <input
                type="text"
                name="nome"
                value={form.nome}
                onChange={handleChange}
                className="w-full rounded-xl border border-neutral-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-1">
                Cognome *
              </label>
              <input
                type="text"
                name="cognome"
                value={form.cognome}
                onChange={handleChange}
                className="w-full rounded-xl border border-neutral-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-1">
                Telefono
              </label>
              <input
                type="text"
                name="telefono"
                value={form.telefono}
                onChange={handleChange}
                className="w-full rounded-xl border border-neutral-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-1">
                Email
              </label>
              <input
                type="email"
                name="email"
                value={form.email}
                onChange={handleChange}
                className="w-full rounded-xl border border-neutral-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
              />
            </div>

            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-neutral-700 mb-1">
                Note operative
              </label>
              <textarea
                name="note"
                value={form.note}
                onChange={handleChange}
                rows={2}
                className="w-full rounded-xl border border-neutral-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
              />
            </div>

            <div className="flex items-center gap-2 mt-1">
              <input
                id="attivo"
                type="checkbox"
                name="attivo"
                checked={form.attivo}
                onChange={handleChange}
                className="h-4 w-4 rounded border-neutral-300 text-amber-600 focus:ring-amber-500"
              />
              <label htmlFor="attivo" className="text-sm text-neutral-800">
                Dipendente attivo
              </label>
            </div>

            <div className="md:col-span-2 flex justify-end gap-3 mt-4">
              {form.id && (
                <button
                  type="button"
                  onClick={resetForm}
                  className="rounded-xl border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-100"
                >
                  Annulla modifica
                </button>
              )}
              <button
                type="submit"
                className="rounded-xl bg-amber-700 px-5 py-2 text-sm font-semibold text-white shadow hover:bg-amber-800"
              >
                {form.id ? "Salva modifiche" : "Aggiungi dipendente"}
              </button>
            </div>
          </form>
        </section>

        {/* TABELLA DIPENDENTI */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-xl font-semibold font-playfair text-amber-900">
              Elenco dipendenti
            </h2>
            {loading && (
              <span className="text-xs text-neutral-500">
                Caricamento…
              </span>
            )}
          </div>

          <div className="overflow-x-auto rounded-2xl border border-neutral-200">
            <table className="min-w-full text-xs sm:text-sm">
              <thead className="bg-neutral-50 text-neutral-600">
                <tr>
                  <th className="px-3 py-2 text-left">Codice</th>
                  <th className="px-3 py-2 text-left">Nome</th>
                  <th className="px-3 py-2 text-left">Ruolo</th>
                  <th className="px-3 py-2 text-left">Telefono</th>
                  <th className="px-3 py-2 text-left">Email</th>
                  <th className="px-3 py-2 text-left">Stato</th>
                  <th className="px-3 py-2 text-right">Azioni</th>
                </tr>
              </thead>
              <tbody>
                {!loading && dipendenti.length === 0 && (
                  <tr>
                    <td
                      colSpan={7}
                      className="px-3 py-4 text-center text-neutral-500"
                    >
                      Nessun dipendente presente.
                    </td>
                  </tr>
                )}

                {dipendenti.map((d) => (
                  <tr
                    key={d.id}
                    className="border-t border-neutral-100 hover:bg-neutral-50"
                  >
                    <td className="px-3 py-2 whitespace-nowrap">
                      {d.codice}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      {d.nome} {d.cognome}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      {d.ruolo}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      {d.telefono || "—"}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      {d.email || "—"}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      {d.attivo ? (
                        <span className="inline-flex rounded-full bg-green-100 px-2 py-0.5 text-[11px] font-medium text-green-700">
                          Attivo
                        </span>
                      ) : (
                        <span className="inline-flex rounded-full bg-neutral-200 px-2 py-0.5 text-[11px] font-medium text-neutral-700">
                          Disattivato
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap text-right">
                      <button
                        type="button"
                        onClick={() => handleEdit(d)}
                        className="mr-2 text-[11px] font-medium text-amber-700 hover:underline"
                      >
                        Modifica
                      </button>
                      {d.attivo && (
                        <button
                          type="button"
                          onClick={() => handleSoftDelete(d.id)}
                          className="text-[11px] font-medium text-red-600 hover:underline"
                        >
                          Disattiva
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  );
}
