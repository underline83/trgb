// =========================================================
// FILE: frontend/src/pages/vini/MagazzinoViniNuovo.jsx
// @version: v1.1-magazzino-nuovo-no-idexcel-formati
// Nuovo vino: tolto ID EXCEL, FORMATO come select descrittiva
// =========================================================

import React, { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { API_BASE } from "../../config/api";
import MagazzinoSubMenu from "../../components/vini/MagazzinoSubMenu";

const FORMAT_OPTIONS = [
  { value: "BT", label: "BT — Bottiglia 0,75 L" },
  { value: "MG", label: "MG — Magnum 1,5 L" },
  { value: "DM", label: "DM — Double Magnum 3,0 L" },
  { value: "JR", label: "JR — Jeroboam 3,0 L" },
  { value: "IG", label: "IG — Imperiale 6,0 L" },
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

  const token = localStorage.getItem("token");

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

  // Suggerimenti “formato”
  const formatoLabel = useMemo(() => {
    const f = FORMAT_OPTIONS.find((x) => x.value === form.FORMATO);
    return f ? f.label : form.FORMATO;
  }, [form.FORMATO]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitError("");
    setSubmitSuccess("");

    if (!token) {
      handleLogout();
      return;
    }

    if (!form.DESCRIZIONE.trim()) return setSubmitError("La descrizione del vino è obbligatoria.");
    if (!form.TIPOLOGIA.trim()) return setSubmitError("La tipologia è obbligatoria.");
    if (!form.NAZIONE.trim()) return setSubmitError("La nazione è obbligatoria.");

    const haLocazione =
      (form.FRIGORIFERO && form.FRIGORIFERO.trim() !== "") ||
      (form.LOCAZIONE_1 && form.LOCAZIONE_1.trim() !== "") ||
      (form.LOCAZIONE_2 && form.LOCAZIONE_2.trim() !== "") ||
      (form.LOCAZIONE_3 && form.LOCAZIONE_3.trim() !== "");

    if (!haLocazione) {
      setSubmitError("Devi indicare almeno una locazione (frigorifero o locazione 1/2/3).");
      return;
    }

    const payload = {
      TIPOLOGIA: form.TIPOLOGIA.trim(),
      NAZIONE: form.NAZIONE.trim() || "ITALIA",
      REGIONE: nullIfEmpty(form.REGIONE),
      CODICE: nullIfEmpty(form.CODICE),

      DESCRIZIONE: form.DESCRIZIONE.trim(),
      DENOMINAZIONE: nullIfEmpty(form.DENOMINAZIONE),
      ANNATA: nullIfEmpty(form.ANNATA),
      VITIGNI: nullIfEmpty(form.VITIGNI),
      GRADO_ALCOLICO: numberOrNull(form.GRADO_ALCOLICO),
      FORMATO: form.FORMATO?.trim() || "BT",

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

    setSubmitting(true);
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

      const data = await resp.json().catch(() => ({}));

      if (!resp.ok) {
        const detail =
          data && data.detail
            ? Array.isArray(data.detail)
              ? data.detail.map((d) => d.msg || JSON.stringify(d)).join(" | ")
              : String(data.detail)
            : `Errore server: ${resp.status}`;
        throw new Error(detail);
      }

      setSubmitSuccess(`Vino creato (formato: ${formatoLabel}).`);
      if (data.id) navigate(`/vini/magazzino/${data.id}`);
      else navigate("/vini/magazzino");
    } catch (err) {
      setSubmitError(err.message || "Errore durante il salvataggio.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-neutral-100 p-6 font-sans">
      <div className="max-w-5xl mx-auto bg-white shadow-2xl rounded-3xl p-8 lg:p-10 border border-neutral-200">
        <MagazzinoSubMenu />

        <div className="flex flex-col lg:flex-row justify-between gap-4 mb-6">
          <div>
            <h1 className="text-3xl lg:text-4xl font-bold text-amber-900 tracking-wide font-playfair mb-2">
              ➕ Nuovo vino — Magazzino
            </h1>
            <p className="text-neutral-600 text-sm">
              Campi obbligatori: <strong>Tipologia</strong>, <strong>Nazione</strong>,{" "}
              <strong>Descrizione</strong> e almeno una <strong>locazione</strong>.
            </p>
          </div>
        </div>

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

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* ANAGRAFICA */}
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
                  {FORMAT_OPTIONS.map((f) => (
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

          {/* MAGAZZINO */}
          <section className="border border-neutral-200 rounded-2xl p-4 lg:p-5 bg-neutral-50">
            <h2 className="text-sm font-semibold text-neutral-800 mb-3 uppercase tracking-wide">
              Magazzino — locazioni e giacenze iniziali
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="border border-neutral-200 rounded-xl bg-white p-3 space-y-2">
                <div className="text-[11px] font-semibold text-neutral-600 uppercase">
                  Frigorifero
                </div>
                <input
                  type="text"
                  value={form.FRIGORIFERO}
                  onChange={handleChange("FRIGORIFERO")}
                  className="w-full border border-neutral-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-amber-300"
                />
                <input
                  type="number"
                  value={form.QTA_FRIGO}
                  onChange={handleChange("QTA_FRIGO")}
                  className="w-24 border border-neutral-300 rounded-lg px-3 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-amber-300"
                  placeholder="0"
                />
              </div>

              <div className="border border-neutral-200 rounded-xl bg-white p-3 space-y-2">
                <div className="text-[11px] font-semibold text-neutral-600 uppercase">
                  Locazione 1
                </div>
                <input
                  type="text"
                  value={form.LOCAZIONE_1}
                  onChange={handleChange("LOCAZIONE_1")}
                  className="w-full border border-neutral-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-amber-300"
                />
                <input
                  type="number"
                  value={form.QTA_LOC1}
                  onChange={handleChange("QTA_LOC1")}
                  className="w-24 border border-neutral-300 rounded-lg px-3 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-amber-300"
                  placeholder="0"
                />
              </div>
            </div>
          </section>

          {/* FOOTER */}
          <div className="flex justify-end gap-3">
            <button
              type="button"
              onClick={() => navigate("/vini/magazzino")}
              className="px-4 py-2 rounded-xl text-sm font-medium border border-neutral-300 bg-neutral-50 hover:bg-neutral-100 shadow-sm transition"
            >
              Annulla
            </button>
            <button
              type="submit"
              disabled={submitting}
              className={`px-5 py-2 rounded-xl text-sm font-semibold shadow transition ${
                submitting
                  ? "bg-gray-400 text-white cursor-not-allowed"
                  : "bg-amber-700 text-white hover:bg-amber-800"
              }`}
            >
              {submitting ? "Salvataggio…" : "💾 Salva nuovo vino"}
            </button>
          </div>

          <div className="text-xs text-neutral-500">
            {loadingOptions
              ? "Caricamento suggerimenti…"
              : "Suggerimenti caricati da vini_magazzino (tipologie, nazioni, regioni, produttori)."}
          </div>
        </form>
      </div>
    </div>
  );
}
