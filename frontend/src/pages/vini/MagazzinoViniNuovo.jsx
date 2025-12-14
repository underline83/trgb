// FILE: frontend/src/pages/vini/MagazzinoViniNuovo.jsx
// @version: v1.1-magazzino-nuovo-noidexcel-formato-lista
// Pagina Magazzino Vini — Inserimento nuovo vino (NO ID EXCEL) + Formato a lista + check duplicati (C)

import React, { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { API_BASE } from "../../config/api";
import MagazzinoSubMenu from "../../components/vini/MagazzinoSubMenu";

// ✅ Lista formati (completa/estendibile: se hai già la lista ufficiale, incollala qui)
const FORMATI = [
  { code: "BT", label: "Bottiglia 0,75L" },
  { code: "MG", label: "Magnum 1,5L" },
  { code: "DM", label: "Doppio Magnum 3L" },
  { code: "JM", label: "Jeroboam 4,5L" },
  { code: "IMP", label: "Imperiale 6L" },
];

const uniq = (arr) =>
  Array.from(
    new Set(
      arr
        .filter((x) => x != null)
        .map((x) => String(x).trim())
        .filter((x) => x !== "")
    )
  ).sort((a, b) => a.localeCompare(b, "it", { sensitivity: "base" }));

const norm = (s) =>
  String(s ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");

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

  // Duplicati (C)
  const [dupChecking, setDupChecking] = useState(false);
  const [dupCandidates, setDupCandidates] = useState([]);
  const [showDupConfirm, setShowDupConfirm] = useState(false);

  const token = localStorage.getItem("token");

  const handleLogout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("role");
    window.location.reload();
  };

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
    const value = e.target.value;
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleCheckboxSiNo = (field) => (e) => {
    const checked = e.target.checked;
    setForm((prev) => ({ ...prev, [field]: checked ? "SI" : "NO" }));
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

  // ------------------------------------------------
  // SUGGERIMENTI: ricavo liste da /vini/magazzino
  // ------------------------------------------------
  useEffect(() => {
    if (!token) {
      handleLogout();
      return;
    }

    const fetchOptions = async () => {
      setLoadingOptions(true);
      setOptionsError("");

      try {
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

  // ------------------------------------------------
  // Duplicate check (C): cerca candidati e chiede conferma
  // Regola: match su DESCRIZIONE + PRODUTTORE + ANNATA + FORMATO (tutti normalizzati)
  // ------------------------------------------------
  const findDuplicates = async () => {
    setDupChecking(true);
    setDupCandidates([]);
    try {
      const q = encodeURIComponent(form.DESCRIZIONE.trim());
      // usiamo q per ridurre il set lato backend (router supporta ?q=...)
      const resp = await fetch(`${API_BASE}/vini/magazzino?q=${q}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (resp.status === 401) {
        alert("Sessione scaduta. Effettua nuovamente il login.");
        handleLogout();
        return [];
      }
      if (!resp.ok) throw new Error(`Errore server: ${resp.status}`);

      const data = await resp.json();

      const keyNew =
        `${norm(form.DESCRIZIONE)}|${norm(form.PRODUTTORE)}|${norm(form.ANNATA)}|${norm(form.FORMATO)}`;

      const dups = (data || []).filter((v) => {
        const keyOld =
          `${norm(v.DESCRIZIONE)}|${norm(v.PRODUTTORE)}|${norm(v.ANNATA)}|${norm(v.FORMATO)}`;
        return keyOld === keyNew;
      });

      setDupCandidates(dups);
      return dups;
    } finally {
      setDupChecking(false);
    }
  };

  const payloadFinal = useMemo(() => {
    return {
      TIPOLOGIA: form.TIPOLOGIA.trim(),
      NAZIONE: form.NAZIONE.trim() || "ITALIA",
      REGIONE: nullIfEmpty(form.REGIONE),
      CODICE: nullIfEmpty(form.CODICE),

      DESCRIZIONE: form.DESCRIZIONE.trim(),
      DENOMINAZIONE: nullIfEmpty(form.DENOMINAZIONE),
      ANNATA: nullIfEmpty(form.ANNATA),
      VITIGNI: nullIfEmpty(form.VITIGNI),
      GRADO_ALCOLICO: numberOrNull(form.GRADO_ALCOLICO),
      FORMATO: form.FORMATO.trim() || "BT",

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
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form]);

  const doCreate = async () => {
    // regola locazione
    const haLocazione =
      (form.FRIGORIFERO && form.FRIGORIFERO.trim() !== "") ||
      (form.LOCAZIONE_1 && form.LOCAZIONE_1.trim() !== "") ||
      (form.LOCAZIONE_2 && form.LOCAZIONE_2.trim() !== "") ||
      (form.LOCAZIONE_3 && form.LOCAZIONE_3.trim() !== "");

    if (!haLocazione) {
      setSubmitError(
        "Devi indicare almeno una locazione (frigorifero o locazione 1/2/3)."
      );
      return;
    }

    setSubmitting(true);
    try {
      const resp = await fetch(`${API_BASE}/vini/magazzino`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payloadFinal),
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

      // ✅ Naviga al dettaglio (param allineato a /vini/magazzino/:id)
      if (data.id) {
        navigate(`/vini/magazzino/${data.id}`, { state: { vino: data } });
      } else {
        navigate("/vini/magazzino");
      }
    } catch (err) {
      console.error(err);
      setSubmitError(err.message || "Errore durante il salvataggio.");
    } finally {
      setSubmitting(false);
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

    // validazione minima
    if (!form.DESCRIZIONE.trim()) return setSubmitError("La descrizione del vino è obbligatoria.");
    if (!form.TIPOLOGIA.trim()) return setSubmitError("La tipologia è obbligatoria.");
    if (!form.NAZIONE.trim()) return setSubmitError("La nazione è obbligatoria.");

    // ✅ DUP CHECK (C)
    try {
      setDupCandidates([]);
      const dups = await findDuplicates();
      if (dups.length > 0) {
        setShowDupConfirm(true);
        return;
      }
    } catch (err) {
      // se fallisce il check non blocchiamo: segnaliamo ma facciamo salvare
      console.warn("Duplicate check failed:", err);
    }

    await doCreate();
  };

  return (
    <div className="min-h-screen bg-neutral-100 p-6 font-sans">
      <div className="max-w-5xl mx-auto bg-white shadow-2xl rounded-3xl p-8 lg:p-10 border border-neutral-200">
        {/* HEADER */}
        <div className="flex flex-col lg:flex-row justify-between gap-4 mb-6">
          <div>
            <h1 className="text-3xl lg:text-4xl font-bold text-amber-900 tracking-wide font-playfair mb-2">
              ➕ Nuovo vino — Magazzino
            </h1>
            <p className="text-neutral-600 text-sm">
              Campi obbligatori: <strong>Tipologia</strong>,{" "}
              <strong>Nazione</strong>, <strong>Descrizione</strong> e almeno una{" "}
              <strong>locazione</strong>.
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

        <MagazzinoSubMenu />

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

        {/* MODALE DUPLICATI */}
        {showDupConfirm && (
          <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
            <div className="max-w-2xl w-full bg-white rounded-3xl shadow-2xl border border-neutral-200 p-6">
              <h3 className="text-xl font-bold text-amber-900 font-playfair">
                Possibile duplicato trovato
              </h3>
              <p className="text-sm text-neutral-600 mt-2">
                Ho trovato {dupCandidates.length} vino/i già presenti con gli stessi parametri
                (Descrizione + Produttore + Annata + Formato).
                Vuoi procedere comunque?
              </p>

              <div className="mt-4 border border-neutral-200 rounded-2xl overflow-hidden">
                <div className="max-h-56 overflow-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-neutral-100">
                      <tr className="text-xs text-neutral-600 uppercase tracking-wide">
                        <th className="px-3 py-2 text-left">ID</th>
                        <th className="px-3 py-2 text-left">Vino</th>
                        <th className="px-3 py-2 text-left">Produttore</th>
                        <th className="px-3 py-2 text-left">Annata</th>
                        <th className="px-3 py-2 text-left">Formato</th>
                      </tr>
                    </thead>
                    <tbody>
                      {dupCandidates.map((v) => (
                        <tr key={v.id} className="border-t border-neutral-200">
                          <td className="px-3 py-2 font-mono text-xs text-neutral-600">
                            {v.id}
                          </td>
                          <td className="px-3 py-2">{v.DESCRIZIONE}</td>
                          <td className="px-3 py-2">{v.PRODUTTORE || "—"}</td>
                          <td className="px-3 py-2">{v.ANNATA || "—"}</td>
                          <td className="px-3 py-2">{v.FORMATO || "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="mt-5 flex flex-col sm:flex-row gap-3 justify-end">
                <button
                  type="button"
                  onClick={() => {
                    setShowDupConfirm(false);
                    setDupCandidates([]);
                  }}
                  className="px-4 py-2 rounded-xl text-sm font-medium border border-neutral-300 bg-neutral-50 hover:bg-neutral-100 shadow-sm transition"
                >
                  No, annulla
                </button>
                <button
                  type="button"
                  disabled={submitting}
                  onClick={async () => {
                    setShowDupConfirm(false);
                    await doCreate();
                  }}
                  className={`px-5 py-2 rounded-xl text-sm font-semibold shadow transition ${
                    submitting
                      ? "bg-gray-400 text-white cursor-not-allowed"
                      : "bg-amber-700 text-white hover:bg-amber-800"
                  }`}
                >
                  Sì, procedi comunque
                </button>
              </div>
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* BLOCCO 1 — Anagrafica */}
          <section className="border border-neutral-200 rounded-2xl p-4 lg:p-5 bg-neutral-50">
            <h2 className="text-sm font-semibold text-neutral-800 mb-3 uppercase tracking-wide">
              Anagrafica vino
            </h2>

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
                <label className="block text-xs font-semibold text-neutral-600 mb-1 uppercase tracking-wide">
                  Regione
                </label>
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
                  {FORMATiOptions(FORMATI)}
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
                <label className="block text-xs font-semibold text-neutral-600 mb-1 uppercase tracking-wide">
                  Annata
                </label>
                <input
                  type="text"
                  value={form.ANNATA}
                  onChange={handleChange("ANNATA")}
                  className="w-full border border-neutral-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-amber-300"
                  placeholder="es. 2019"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-neutral-600 mb-1 uppercase tracking-wide">
                  Codice interno
                </label>
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
                <label className="block text-xs font-semibold text-neutral-600 mb-1 uppercase tracking-wide">
                  Produttore
                </label>
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
                <label className="block text-xs font-semibold text-neutral-600 mb-1 uppercase tracking-wide">
                  Distributore
                </label>
                <input
                  type="text"
                  value={form.DISTRIBUTORE}
                  onChange={handleChange("DISTRIBUTORE")}
                  className="w-full border border-neutral-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-amber-300"
                />
              </div>

              <div className="flex items-center gap-4">
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
            <p className="text-xs text-neutral-500 mb-3">
              È obbligatorio indicare almeno una locazione (frigorifero o locazione 1/2/3).
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {locCard("Frigorifero", "FRIGORIFERO", "QTA_FRIGO", form, handleChange)}
              {locCard("Locazione 1", "LOCAZIONE_1", "QTA_LOC1", form, handleChange)}
              {locCard("Locazione 2", "LOCAZIONE_2", "QTA_LOC2", form, handleChange)}
              {locCard("Locazione 3", "LOCAZIONE_3", "QTA_LOC3", form, handleChange)}
            </div>
          </section>

          {/* BLOCCO 3 — Prezzi & stato */}
          <section className="border border-neutral-200 rounded-2xl p-4 lg:p-5 bg-neutral-50">
            <h2 className="text-sm font-semibold text-neutral-800 mb-3 uppercase tracking-wide">
              Prezzi, stato vendita e note
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              {numField("Prezzo carta (€)", "PREZZO_CARTA", form, handleChange)}
              {numField("Listino acquisto (€)", "EURO_LISTINO", form, handleChange)}
              {numField("Sconto (%)", "SCONTO", form, handleChange)}
              {textField("Stato vendita", "STATO_VENDITA", form, handleChange)}
            </div>

            <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
              {textareaField("Note prezzo / condizioni acquisto", "NOTE_PREZZO", form, handleChange, 2)}
              {textareaField("Note stato / vendita", "NOTE_STATO", form, handleChange, 2)}
            </div>

            <div className="mt-4">
              {textareaField("Note interne magazzino", "NOTE", form, handleChange, 3)}
            </div>
          </section>

          {/* FOOTER */}
          <div className="flex flex-col sm:flex-row justify-between items-center gap-3 mt-4">
            <div className="text-xs text-neutral-500">
              {loadingOptions
                ? "Caricamento suggerimenti da vini_magazzino…"
                : "Suggerimenti caricati da vini_magazzino (tipologie, nazioni, regioni, produttori)."}
              {dupChecking ? " • Check duplicati…" : ""}
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
                disabled={submitting}
                className={`px-5 py-2 rounded-xl text-sm font-semibold shadow transition ${
                  submitting
                    ? "bg-gray-400 text-white cursor-not-allowed"
                    : "bg-amber-700 text-white hover:bg-amber-800 hover:-translate-y-0.5"
                }`}
              >
                {submitting ? "Salvataggio in corso…" : "💾 Salva nuovo vino"}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ----------------- piccoli helper UI ----------------- */

function FORMATiOptions(list) {
  return list.map((f) => (
    <option key={f.code} value={f.code}>
      {f.code} — {f.label}
    </option>
  ));
}

function locCard(title, locKey, qtaKey, form, handleChange) {
  return (
    <div className="border border-neutral-200 rounded-xl bg-white p-3 space-y-2">
      <div className="text-[11px] font-semibold text-neutral-600 uppercase">
        {title}
      </div>
      <input
        type="text"
        value={form[locKey]}
        onChange={handleChange(locKey)}
        className="w-full border border-neutral-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-amber-300"
      />
      <div className="flex items-center gap-2">
        <span className="text-xs text-neutral-600">Quantità</span>
        <input
          type="number"
          value={form[qtaKey]}
          onChange={handleChange(qtaKey)}
          className="w-24 border border-neutral-300 rounded-lg px-3 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-amber-300"
          placeholder="0"
        />
        <span className="text-xs text-neutral-500">bt</span>
      </div>
    </div>
  );
}

function numField(label, key, form, handleChange) {
  return (
    <div>
      <label className="block text-xs font-semibold text-neutral-600 mb-1 uppercase tracking-wide">
        {label}
      </label>
      <input
        type="number"
        step="0.01"
        value={form[key]}
        onChange={handleChange(key)}
        className="w-full border border-neutral-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-amber-300"
      />
    </div>
  );
}

function textField(label, key, form, handleChange) {
  return (
    <div>
      <label className="block text-xs font-semibold text-neutral-600 mb-1 uppercase tracking-wide">
        {label}
      </label>
      <input
        type="text"
        value={form[key]}
        onChange={handleChange(key)}
        className="w-full border border-neutral-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-amber-300"
      />
    </div>
  );
}

function textareaField(label, key, form, handleChange, rows) {
  return (
    <div>
      <label className="block text-xs font-semibold text-neutral-600 mb-1 uppercase tracking-wide">
        {label}
      </label>
      <textarea
        value={form[key]}
        onChange={handleChange(key)}
        rows={rows}
        className="w-full border border-neutral-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-amber-300"
      />
    </div>
  );
}