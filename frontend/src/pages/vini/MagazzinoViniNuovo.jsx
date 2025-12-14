// @version: v1.1-magazzino-nuovo-noexcel-formati-dupcheck
// Pagina Magazzino Vini — Inserimento nuovo vino (+ check duplicati)

import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { API_BASE } from "../../config/api";

const FORMATI = [
  { value: "BT", label: "BT — Bottiglia 0,75L" },
  { value: "MG", label: "MG — Magnum 1,5L" },
  { value: "DM", label: "DM — Doppelmagnum 3L" },
  { value: "JM", label: "JM — Jeroboam 3L" },
  { value: "RM", label: "RM — Rehoboam 4,5L" },
  { value: "IM", label: "IM — Imperiale 6L" },
  { value: "ML", label: "ML — Mezza 0,375L" },
  { value: "CL", label: "CL — Calice (unità logica)" },
];

export default function MagazzinoViniNuovo() {
  const navigate = useNavigate();

  const [loadingOptions, setLoadingOptions] = useState(false);
  const [optionsError, setOptionsError] = useState("");
  const [tipologie, setTipologie] = useState([]);
  const [nazioni, setNazioni] = useState([]);
  const [regioni, setRegioni] = useState([]);
  const [produttori, setProduttori] = useState([]);

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [submitSuccess, setSubmitSuccess] = useState("");

  // DUP CHECK (C)
  const [dupLoading, setDupLoading] = useState(false);
  const [dupList, setDupList] = useState([]);
  const [showDupModal, setShowDupModal] = useState(false);

  const token = localStorage.getItem("token");
  const role = localStorage.getItem("role");

  const handleLogout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("role");
    window.location.reload();
  };

  useEffect(() => {
    if (!token) {
      handleLogout();
      return;
    }

    const fetchOptions = async () => {
      setLoadingOptions(true);
      setOptionsError("");

      try {
        // ✅ endpoint corretto
        const resp = await fetch(`${API_BASE}/vini/magazzino`, {
          headers: { Authorization: `Bearer ${token}` },
        });

        if (resp.status === 401) {
          alert("Sessione scaduta. Effettua nuovamente il login.");
          handleLogout();
          return;
        }

        if (!resp.ok) throw new Error(`Errore server: ${resp.status}`);

        const data = await resp.json();

        const uniq = (arr) =>
          Array.from(
            new Set(
              arr
                .filter((x) => x != null)
                .map((x) => String(x).trim())
                .filter((x) => x !== "")
            )
          ).sort((a, b) => a.localeCompare(b, "it", { sensitivity: "base" }));

        setTipologie(uniq(data.map((v) => v.TIPOLOGIA)));
        setNazioni(uniq(data.map((v) => v.NAZIONE)));
        setRegioni(uniq(data.map((v) => v.REGIONE)));
        setProduttori(uniq(data.map((v) => v.PRODUTTORE)));
      } catch (err) {
        console.error(err);
        setOptionsError(err.message || "Errore nel caricamento suggerimenti.");
      } finally {
        setLoadingOptions(false);
      }
    };

    fetchOptions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [form, setForm] = useState({
    TIPOLOGIA: "",
    NAZIONE: "ITALIA",
    REGIONE: "",
    CODICE: "",
    DESCRIZIONE: "",
    DENOMINAZIONE: "",
    ANNATA: "",
    VITIGNI: "",
    GRADO_ALCOLICO: "",
    FORMATO: "BT",
    PRODUTTORE: "",
    DISTRIBUTORE: "",

    PREZZO_CARTA: "",
    EURO_LISTINO: "",
    SCONTO: "",
    NOTE_PREZZO: "",

    CARTA: "SI",
    IPRATICO: "NO",

    STATO_VENDITA: "",
    NOTE_STATO: "",

    FRIGORIFERO: "",
    QTA_FRIGO: "",
    LOCAZIONE_1: "",
    QTA_LOC1: "",
    LOCAZIONE_2: "",
    QTA_LOC2: "",
    LOCAZIONE_3: "",
    QTA_LOC3: "",

    NOTE: "",
  });

  const handleChange = (field) => (e) => {
    setForm((prev) => ({ ...prev, [field]: e.target.value }));
  };

  const handleCheckboxSiNo = (field) => (e) => {
    setForm((prev) => ({ ...prev, [field]: e.target.checked ? "SI" : "NO" }));
  };

  const numberOrNull = (val) => {
    if (val === "" || val === null || val === undefined) return null;
    const n = Number(String(val).replace(",", "."));
    return Number.isNaN(n) ? null : n;
  };

  const intOrZero = (val) => {
    if (val === "" || val === null || val === undefined) return 0;
    const n = parseInt(val, 10);
    return Number.isNaN(n) ? 0 : n;
  };

  const nullIfEmpty = (val) => {
    if (val === "" || val === null || val === undefined) return null;
    const s = String(val).trim();
    return s === "" ? null : s;
  };

  const buildPayload = () => ({
    TIPOLOGIA: form.TIPOLOGIA.trim(),
    NAZIONE: form.NAZIONE.trim() || "ITALIA",
    REGIONE: nullIfEmpty(form.REGIONE),
    CODICE: nullIfEmpty(form.CODICE),

    DESCRIZIONE: form.DESCRIZIONE.trim(),
    DENOMINAZIONE: nullIfEmpty(form.DENOMINAZIONE),
    ANNATA: nullIfEmpty(form.ANNATA),
    VITIGNI: nullIfEmpty(form.VITIGNI),
    GRADO_ALCOLICO: numberOrNull(form.GRADO_ALCOLICO),
    FORMATO: form.FORMATO || "BT",

    PRODUTTORE: nullIfEmpty(form.PRODUTTORE),
    DISTRIBUTORE: nullIfEmpty(form.DISTRIBUTORE),

    PREZZO_CARTA: numberOrNull(form.PREZZO_CARTA),
    EURO_LISTINO: numberOrNull(form.EURO_LISTINO),
    SCONTO: numberOrNull(form.SCONTO),
    NOTE_PREZZO: nullIfEmpty(form.NOTE_PREZZO),

    CARTA: form.CARTA === "SI" ? "SI" : "NO",
    IPRATICO: form.IPRATICO === "SI" ? "SI" : "NO",

    STATO_VENDITA: nullIfEmpty(form.STATO_VENDITA),
    NOTE_STATO: nullIfEmpty(form.NOTE_STATO),

    FRIGORIFERO: nullIfEmpty(form.FRIGORIFERO),
    QTA_FRIGO: intOrZero(form.QTA_FRIGO),

    LOCAZIONE_1: nullIfEmpty(form.LOCAZIONE_1),
    QTA_LOC1: intOrZero(form.QTA_LOC1),

    LOCAZIONE_2: nullIfEmpty(form.LOCAZIONE_2),
    QTA_LOC2: intOrZero(form.QTA_LOC2),

    LOCAZIONE_3: nullIfEmpty(form.LOCAZIONE_3),
    QTA_LOC3: intOrZero(form.QTA_LOC3),

    NOTE: nullIfEmpty(form.NOTE),
  });

  const validateFront = () => {
    if (!form.DESCRIZIONE.trim()) return "La descrizione del vino è obbligatoria.";
    if (!form.TIPOLOGIA.trim()) return "La tipologia è obbligatoria.";
    if (!form.NAZIONE.trim()) return "La nazione è obbligatoria.";

    const haLocazione =
      (form.FRIGORIFERO && form.FRIGORIFERO.trim() !== "") ||
      (form.LOCAZIONE_1 && form.LOCAZIONE_1.trim() !== "") ||
      (form.LOCAZIONE_2 && form.LOCAZIONE_2.trim() !== "") ||
      (form.LOCAZIONE_3 && form.LOCAZIONE_3.trim() !== "");

    if (!haLocazione) {
      return "Devi indicare almeno una locazione (frigorifero o locazione 1/2/3).";
    }
    return null;
  };

  const doCreate = async () => {
    const payload = buildPayload();

    setSubmitting(true);
    setSubmitError("");
    setSubmitSuccess("");

    try {
      const resp = await fetch(`${API_BASE}/vini/magazzino`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });

      if (resp.status === 401) {
        alert("Sessione scaduta. Effettua nuovamente il login.");
        handleLogout();
        return;
      }

      const data = await resp.json();

      if (!resp.ok) {
        const detail =
          data && data.detail
            ? Array.isArray(data.detail)
              ? data.detail.map((d) => d.msg || JSON.stringify(d)).join(" | ")
              : String(data.detail)
            : `Errore server: ${resp.status}`;
        throw new Error(detail);
      }

      setSubmitSuccess(`Vino creato con ID ${data.id}.`);
      if (data.id) navigate(`/vini/magazzino/${data.id}`);
      else navigate("/vini/magazzino");
    } catch (err) {
      console.error(err);
      setSubmitError(err.message || "Errore durante il salvataggio.");
    } finally {
      setSubmitting(false);
    }
  };

  const checkDuplicates = async () => {
    setDupLoading(true);
    setDupList([]);
    setShowDupModal(false);

    try {
      const resp = await fetch(`${API_BASE}/vini/magazzino/duplicate-check`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          DESCRIZIONE: form.DESCRIZIONE.trim(),
          PRODUTTORE: form.PRODUTTORE ? form.PRODUTTORE.trim() : null,
          ANNATA: form.ANNATA ? String(form.ANNATA).trim() : null,
          FORMATO: form.FORMATO || null,
        }),
      });

      if (resp.status === 401) {
        alert("Sessione scaduta. Effettua nuovamente il login.");
        handleLogout();
        return { duplicates: [] };
      }

      const data = await resp.json();
      if (!resp.ok) {
        // se endpoint non esiste ancora, fallback: nessun dup check (non blocca)
        return { duplicates: [] };
      }
      return data;
    } catch (e) {
      // fallback silenzioso: non blocco l’inserimento
      return { duplicates: [] };
    } finally {
      setDupLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitError("");
    setSubmitSuccess("");

    if (!token) {
      handleLogout();
      return;
    }

    const err = validateFront();
    if (err) {
      setSubmitError(err);
      return;
    }

    // ✅ scelta C: avviso e chiedi se procedere
    const res = await checkDuplicates();
    if (res?.duplicates?.length) {
      setDupList(res.duplicates);
      setShowDupModal(true);
      return;
    }

    await doCreate();
  };

  return (
    <div className="min-h-screen bg-neutral-100 p-6 font-sans">
      <div className="max-w-5xl mx-auto bg-white shadow-2xl rounded-3xl p-8 lg:p-10 border border-neutral-200">
        {/* HEADER */}
        <div className="flex flex-col lg:flex-row justify-between gap-4 mb-8">
          <div>
            <h1 className="text-3xl lg:text-4xl font-bold text-amber-900 tracking-wide font-playfair mb-2">
              ➕ Nuovo vino — Magazzino
            </h1>
            <p className="text-neutral-600 text-sm">
              Campi obbligatori: <strong>Tipologia</strong>, <strong>Nazione</strong>,
              <strong>Descrizione</strong> e almeno una <strong>locazione</strong>.
            </p>
          </div>

          <div className="flex flex-col items-stretch gap-2 sm:flex-row sm:items-center sm:justify-end">
            <button
              type="button"
              onClick={() => navigate("/vini/magazzino")}
              className="px-4 py-2 rounded-xl text-sm font-medium border border-neutral-300 bg-neutral-50 hover:bg-neutral-100 hover:-translate-y-0.5 shadow-sm transition"
            >
              ← Torna al Magazzino
            </button>
            <button
              type="button"
              onClick={handleLogout}
              className="px-4 py-2 rounded-xl text-sm font-medium border border-red-200 bg-red-50 text-red-700 hover:bg-red-100 hover:-translate-y-0.5 shadow-sm transition"
            >
              Logout
            </button>
          </div>
        </div>

        {/* AVVISI */}
        {optionsError && (
          <div className="mb-4 text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl px-4 py-2">
            {optionsError}
          </div>
        )}
        {submitError && (
          <div className="mb-4 text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl px-4 py-2">
            {submitError}
          </div>
        )}
        {submitSuccess && (
          <div className="mb-4 text-sm text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-2">
            {submitSuccess}
          </div>
        )}

        {/* MODAL DUPLICATI */}
        {showDupModal && (
          <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
            <div className="w-full max-w-2xl bg-white rounded-2xl shadow-2xl border border-neutral-200 p-5">
              <h3 className="text-lg font-bold text-neutral-900 mb-2">
                ⚠️ Possibili duplicati trovati
              </h3>
              <p className="text-sm text-neutral-600 mb-3">
                Ho trovato vini simili per descrizione/produttore/annata/formato. Vuoi procedere comunque?
              </p>

              <div className="max-h-[320px] overflow-auto border border-neutral-200 rounded-xl">
                <table className="w-full text-sm">
                  <thead className="bg-neutral-100 sticky top-0">
                    <tr className="text-xs text-neutral-600 uppercase">
                      <th className="px-3 py-2 text-left">ID</th>
                      <th className="px-3 py-2 text-left">Vino</th>
                      <th className="px-3 py-2 text-left">Produttore</th>
                      <th className="px-3 py-2 text-left">Annata</th>
                      <th className="px-3 py-2 text-left">Formato</th>
                      <th className="px-3 py-2 text-center">Qta</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dupList.map((d) => (
                      <tr key={d.id} className="border-t border-neutral-200">
                        <td className="px-3 py-2 font-mono text-xs">{d.id}</td>
                        <td className="px-3 py-2">{d.DESCRIZIONE}</td>
                        <td className="px-3 py-2">{d.PRODUTTORE || "—"}</td>
                        <td className="px-3 py-2">{d.ANNATA || "—"}</td>
                        <td className="px-3 py-2">{d.FORMATO || "—"}</td>
                        <td className="px-3 py-2 text-center">{d.QTA_TOTALE ?? 0}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="flex justify-end gap-3 mt-4">
                <button
                  type="button"
                  onClick={() => setShowDupModal(false)}
                  className="px-4 py-2 rounded-xl text-sm font-medium border border-neutral-300 bg-neutral-50 hover:bg-neutral-100"
                >
                  Annulla
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    setShowDupModal(false);
                    await doCreate();
                  }}
                  className="px-4 py-2 rounded-xl text-sm font-semibold bg-amber-700 text-white hover:bg-amber-800"
                >
                  Procedi comunque
                </button>
              </div>
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* BLOCCO 1 — Anagrafica principale */}
          <section className="border border-neutral-200 rounded-2xl p-4 lg:p-5 bg-neutral-50">
            <h2 className="text-sm font-semibold text-neutral-800 mb-3 uppercase tracking-wide">Anagrafica vino</h2>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-semibold text-neutral-600 mb-1 uppercase tracking-wide">
                  Tipologia *
                </label>
                <input
                  list="tipologie-list"
                  value={form.TIPOLOGIA}
                  onChange={handleChange("TIPOLOGIA")}
                  className="w-full border border-neutral-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-amber-300"
                  placeholder="es. ROSSI ITALIA"
                />
                <datalist id="tipologie-list">
                  {tipologie.map((t) => (
                    <option key={t} value={t} />
                  ))}
                </datalist>
              </div>

              <div>
                <label className="block text-xs font-semibold text-neutral-600 mb-1 uppercase tracking-wide">
                  Nazione *
                </label>
                <input
                  list="nazioni-list"
                  value={form.NAZIONE}
                  onChange={handleChange("NAZIONE")}
                  className="w-full border border-neutral-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-amber-300"
                  placeholder="ITALIA, FRANCIA…"
                />
                <datalist id="nazioni-list">
                  {nazioni.map((n) => (
                    <option key={n} value={n} />
                  ))}
                </datalist>
              </div>

              <div>
                <label className="block text-xs font-semibold text-neutral-600 mb-1 uppercase tracking-wide">Regione</label>
                <input
                  list="regioni-list"
                  value={form.REGIONE}
                  onChange={handleChange("REGIONE")}
                  className="w-full border border-neutral-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-amber-300"
                  placeholder="es. PIEMONTE"
                />
                <datalist id="regioni-list">
                  {regioni.map((r) => (
                    <option key={r} value={r} />
                  ))}
                </datalist>
              </div>
            </div>

            <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="md:col-span-2">
                <label className="block text-xs font-semibold text-neutral-600 mb-1 uppercase tracking-wide">
                  Descrizione vino *
                </label>
                <input
                  type="text"
                  value={form.DESCRIZIONE}
                  onChange={handleChange("DESCRIZIONE")}
                  className="w-full border border-neutral-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-amber-300"
                  placeholder="Testo completo come appare sulla carta"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-neutral-600 mb-1 uppercase tracking-wide">
                  Formato
                </label>
                <select
                  value={form.FORMATO}
                  onChange={handleChange("FORMATO")}
                  className="w-full border border-neutral-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-amber-300"
                >
                  {FORMATI.map((f) => (
                    <option key={f.value} value={f.value}>
                      {f.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-semibold text-neutral-600 mb-1 uppercase tracking-wide">
                  Denominazione
                </label>
                <input
                  type="text"
                  value={form.DENOMINAZIONE}
                  onChange={handleChange("DENOMINAZIONE")}
                  className="w-full border border-neutral-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-amber-300"
                  placeholder="es. Barolo DOCG"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-neutral-600 mb-1 uppercase tracking-wide">Annata</label>
                <input
                  type="text"
                  value={form.ANNATA}
                  onChange={handleChange("ANNATA")}
                  className="w-full border border-neutral-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-amber-300"
                  placeholder="es. 2019"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-neutral-600 mb-1 uppercase tracking-wide">Codice interno</label>
                <input
                  type="text"
                  value={form.CODICE}
                  onChange={handleChange("CODICE")}
                  className="w-full border border-neutral-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-amber-300"
                  placeholder="Codice gestionale / iPratico"
                />
              </div>
            </div>

            <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-semibold text-neutral-600 mb-1 uppercase tracking-wide">Produttore</label>
                <input
                  list="produttori-list"
                  value={form.PRODUTTORE}
                  onChange={handleChange("PRODUTTORE")}
                  className="w-full border border-neutral-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-amber-300"
                  placeholder="es. Gaja"
                />
                <datalist id="produttori-list">
                  {produttori.map((p) => (
                    <option key={p} value={p} />
                  ))}
                </datalist>
              </div>
              <div>
                <label className="block text-xs font-semibold text-neutral-600 mb-1 uppercase tracking-wide">Distributore</label>
                <input
                  type="text"
                  value={form.DISTRIBUTORE}
                  onChange={handleChange("DISTRIBUTORE")}
                  className="w-full border border-neutral-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-amber-300"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-neutral-600 mb-1 uppercase tracking-wide">Vitigni</label>
                <input
                  type="text"
                  value={form.VITIGNI}
                  onChange={handleChange("VITIGNI")}
                  className="w-full border border-neutral-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-amber-300"
                  placeholder="es. Nebbiolo 100%"
                />
              </div>
            </div>

            <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-semibold text-neutral-600 mb-1 uppercase tracking-wide">
                  Grado alcolico (% vol)
                </label>
                <input
                  type="number"
                  step="0.1"
                  value={form.GRADO_ALCOLICO}
                  onChange={handleChange("GRADO_ALCOLICO")}
                  className="w-full border border-neutral-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-amber-300"
                  placeholder="es. 13.5"
                />
              </div>
              <div className="flex items-center gap-4 md:col-span-2">
                <label className="inline-flex items-center gap-2 text-sm text-neutral-700">
                  <input
                    type="checkbox"
                    checked={form.CARTA === "SI"}
                    onChange={handleCheckboxSiNo("CARTA")}
                    className="rounded border-neutral-400"
                  />
                  <span>In carta</span>
                </label>
                <label className="inline-flex items-center gap-2 text-sm text-neutral-700">
                  <input
                    type="checkbox"
                    checked={form.IPRATICO === "SI"}
                    onChange={handleCheckboxSiNo("IPRATICO")}
                    className="rounded border-neutral-400"
                  />
                  <span>Presente su iPratico</span>
                </label>
              </div>
            </div>
          </section>

          {/* BLOCCO 2 — Magazzino */}
          <section className="border border-neutral-200 rounded-2xl p-4 lg:p-5 bg-neutral-50">
            <h2 className="text-sm font-semibold text-neutral-800 mb-3 uppercase tracking-wide">
              Magazzino — locazioni e giacenze iniziali
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Frigo */}
              <div className="border border-neutral-200 rounded-xl bg-white p-3 space-y-2">
                <div className="text-[11px] font-semibold text-neutral-600 uppercase">Frigorifero</div>
                <input
                  type="text"
                  value={form.FRIGORIFERO}
                  onChange={handleChange("FRIGORIFERO")}
                  className="w-full border border-neutral-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-amber-300"
                />
                <div className="flex items-center gap-2">
                  <span className="text-xs text-neutral-600">Quantità</span>
                  <input
                    type="number"
                    value={form.QTA_FRIGO}
                    onChange={handleChange("QTA_FRIGO")}
                    className="w-24 border border-neutral-300 rounded-lg px-3 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-amber-300"
                    placeholder="0"
                  />
                  <span className="text-xs text-neutral-500">bt</span>
                </div>
              </div>

              {/* Loc 1 */}
              <div className="border border-neutral-200 rounded-xl bg-white p-3 space-y-2">
                <div className="text-[11px] font-semibold text-neutral-600 uppercase">Locazione 1</div>
                <input
                  type="text"
                  value={form.LOCAZIONE_1}
                  onChange={handleChange("LOCAZIONE_1")}
                  className="w-full border border-neutral-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-amber-300"
                />
                <div className="flex items-center gap-2">
                  <span className="text-xs text-neutral-600">Quantità</span>
                  <input
                    type="number"
                    value={form.QTA_LOC1}
                    onChange={handleChange("QTA_LOC1")}
                    className="w-24 border border-neutral-300 rounded-lg px-3 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-amber-300"
                    placeholder="0"
                  />
                  <span className="text-xs text-neutral-500">bt</span>
                </div>
              </div>

              {/* Loc 2 */}
              <div className="border border-neutral-200 rounded-xl bg-white p-3 space-y-2">
                <div className="text-[11px] font-semibold text-neutral-600 uppercase">Locazione 2</div>
                <input
                  type="text"
                  value={form.LOCAZIONE_2}
                  onChange={handleChange("LOCAZIONE_2")}
                  className="w-full border border-neutral-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-amber-300"
                />
                <div className="flex items-center gap-2">
                  <span className="text-xs text-neutral-600">Quantità</span>
                  <input
                    type="number"
                    value={form.QTA_LOC2}
                    onChange={handleChange("QTA_LOC2")}
                    className="w-24 border border-neutral-300 rounded-lg px-3 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-amber-300"
                    placeholder="0"
                  />
                  <span className="text-xs text-neutral-500">bt</span>
                </div>
              </div>

              {/* Loc 3 */}
              <div className="border border-neutral-200 rounded-xl bg-white p-3 space-y-2">
                <div className="text-[11px] font-semibold text-neutral-600 uppercase">Locazione 3</div>
                <input
                  type="text"
                  value={form.LOCAZIONE_3}
                  onChange={handleChange("LOCAZIONE_3")}
                  className="w-full border border-neutral-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-amber-300"
                />
                <div className="flex items-center gap-2">
                  <span className="text-xs text-neutral-600">Quantità</span>
                  <input
                    type="number"
                    value={form.QTA_LOC3}
                    onChange={handleChange("QTA_LOC3")}
                    className="w-24 border border-neutral-300 rounded-lg px-3 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-amber-300"
                    placeholder="0"
                  />
                  <span className="text-xs text-neutral-500">bt</span>
                </div>
              </div>
            </div>
          </section>

          {/* BLOCCO 3 — Prezzi & stato */}
          <section className="border border-neutral-200 rounded-2xl p-4 lg:p-5 bg-neutral-50">
            <h2 className="text-sm font-semibold text-neutral-800 mb-3 uppercase tracking-wide">
              Prezzi, stato vendita e note
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div>
                <label className="block text-xs font-semibold text-neutral-600 mb-1 uppercase tracking-wide">
                  Prezzo carta (€)
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={form.PREZZO_CARTA}
                  onChange={handleChange("PREZZO_CARTA")}
                  className="w-full border border-neutral-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-amber-300"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-neutral-600 mb-1 uppercase tracking-wide">
                  Listino acquisto (€)
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={form.EURO_LISTINO}
                  onChange={handleChange("EURO_LISTINO")}
                  className="w-full border border-neutral-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-amber-300"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-neutral-600 mb-1 uppercase tracking-wide">
                  Sconto (%)
                </label>
                <input
                  type="number"
                  step="0.1"
                  value={form.SCONTO}
                  onChange={handleChange("SCONTO")}
                  className="w-full border border-neutral-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-amber-300"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-neutral-600 mb-1 uppercase tracking-wide">
                  Stato vendita
                </label>
                <input
                  type="text"
                  value={form.STATO_VENDITA}
                  onChange={handleChange("STATO_VENDITA")}
                  className="w-full border border-neutral-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-amber-300"
                />
              </div>
            </div>

            <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-neutral-600 mb-1 uppercase tracking-wide">
                  Note prezzo / condizioni acquisto
                </label>
                <textarea
                  value={form.NOTE_PREZZO}
                  onChange={handleChange("NOTE_PREZZO")}
                  rows={2}
                  className="w-full border border-neutral-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-amber-300"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-neutral-600 mb-1 uppercase tracking-wide">
                  Note stato / vendita
                </label>
                <textarea
                  value={form.NOTE_STATO}
                  onChange={handleChange("NOTE_STATO")}
                  rows={2}
                  className="w-full border border-neutral-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-amber-300"
                />
              </div>
            </div>

            <div className="mt-4">
              <label className="block text-xs font-semibold text-neutral-600 mb-1 uppercase tracking-wide">
                Note interne magazzino
              </label>
              <textarea
                value={form.NOTE}
                onChange={handleChange("NOTE")}
                rows={3}
                className="w-full border border-neutral-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-amber-300"
              />
            </div>
          </section>

          {/* FOOTER FORM */}
          <div className="flex flex-col sm:flex-row justify-between items-center gap-3 mt-4">
            <div className="text-xs text-neutral-500">
              {loadingOptions
                ? "Caricamento suggerimenti da vini_magazzino…"
                : "Suggerimenti caricati (tipologie, nazioni, regioni, produttori)."}
            </div>

            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => navigate("/vini/magazzino")}
                className="px-4 py-2 rounded-xl text-sm font-medium border border-neutral-300 bg-neutral-50 hover:bg-neutral-100 hover:-translate-y-0.5 shadow-sm transition"
              >
                Annulla
              </button>
              <button
                type="submit"
                disabled={submitting || dupLoading}
                className={`px-5 py-2 rounded-xl text-sm font-semibold shadow transition ${
                  submitting || dupLoading
                    ? "bg-gray-400 text-white cursor-not-allowed"
                    : "bg-amber-700 text-white hover:bg-amber-800 hover:-translate-y-0.5"
                }`}
              >
                {dupLoading ? "Controllo duplicati…" : submitting ? "Salvataggio in corso…" : "💾 Salva nuovo vino"}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}