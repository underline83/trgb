// @version: v1.1-magazzino-form
// Pagina Magazzino Vini — Inserimento / Modifica vino

import React, { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { API_BASE } from "../../config/api";

const FORMATI = [
  { value: "BT", label: "BT — Bottiglia 0,75 L" },
  { value: "MG", label: "MG — Magnum 1,5 L" },
  { value: "DM", label: "DM — Doppio Magnum 3 L" },
  { value: "HF", label: "HF — Mezza bottiglia 0,375 L" },
  { value: "JG", label: "JG — Jeroboam / Formato speciale" },
];

export default function MagazzinoViniNuovo() {
  const navigate = useNavigate();
  const { vinoId } = useParams();
  const isEditMode = Boolean(vinoId);

  const [loadingOptions, setLoadingOptions] = useState(false);
  const [optionsError, setOptionsError] = useState("");
  const [tipologie, setTipologie] = useState([]);
  const [nazioni, setNazioni] = useState([]);
  const [regioni, setRegioni] = useState([]);
  const [produttori, setProduttori] = useState([]);

  const [loadingVino, setLoadingVino] = useState(isEditMode);
  const [vinoLoadError, setVinoLoadError] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [submitSuccess, setSubmitSuccess] = useState("");

  const token = localStorage.getItem("token");

  const handleLogout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("role");
    window.location.reload();
  };

  const [form, setForm] = useState({
    // id_excel RIMOSSO: serve solo per import da Excel
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

  // --------------------------------------------------
  // CARICAMENTO SUGGERIMENTI + (SE EDIT) DATI DEL VINO
  // --------------------------------------------------
  useEffect(() => {
    if (!token) {
      handleLogout();
      return;
    }

    const fetchAll = async () => {
      // 1) Opzioni (tipologie, nazioni, regioni, produttori)
      setLoadingOptions(true);
      setOptionsError("");

      try {
        const resp = await fetch(`${API_BASE}/vini/magazzino`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        if (resp.status === 401) {
          alert("Sessione scaduta. Effettua nuovamente il login.");
          handleLogout();
          return;
        }

        if (!resp.ok) {
          throw new Error(`Errore server: ${resp.status}`);
        }

        const data = await resp.json();

        const uniq = (arr) =>
          Array.from(
            new Set(
              arr
                .filter((x) => x != null)
                .map((x) => String(x).trim())
                .filter((x) => x !== "")
            )
          ).sort((a, b) =>
            a.localeCompare(b, "it", { sensitivity: "base" })
          );

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

      // 2) Se EDIT → carico il vino
      if (isEditMode && vinoId) {
        setLoadingVino(true);
        setVinoLoadError("");
        try {
          const respVino = await fetch(`${API_BASE}/vini/magazzino/${vinoId}`, {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          });

          if (respVino.status === 401) {
            alert("Sessione scaduta. Effettua nuovamente il login.");
            handleLogout();
            return;
          }

          if (respVino.status === 404) {
            setVinoLoadError("Vino non trovato.");
            return;
          }

          if (!respVino.ok) {
            throw new Error(`Errore server: ${respVino.status}`);
          }

          const data = await respVino.json();

          setForm({
            TIPOLOGIA: data.TIPOLOGIA || "",
            NAZIONE: data.NAZIONE || "ITALIA",
            REGIONE: data.REGIONE || "",
            CODICE: data.CODICE || "",
            DESCRIZIONE: data.DESCRIZIONE || "",
            DENOMINAZIONE: data.DENOMINAZIONE || "",
            ANNATA: data.ANNATA || "",
            VITIGNI: data.VITIGNI || "",
            GRADO_ALCOLICO:
              data.GRADO_ALCOLICO != null ? String(data.GRADO_ALCOLICO) : "",
            FORMATO: data.FORMATO || "BT",
            PRODUTTORE: data.PRODUTTORE || "",
            DISTRIBUTORE: data.DISTRIBUTORE || "",

            PREZZO_CARTA:
              data.PREZZO_CARTA != null ? String(data.PREZZO_CARTA) : "",
            EURO_LISTINO:
              data.EURO_LISTINO != null ? String(data.EURO_LISTINO) : "",
            SCONTO: data.SCONTO != null ? String(data.SCONTO) : "",
            NOTE_PREZZO: data.NOTE_PREZZO || "",

            CARTA: data.CARTA === "NO" ? "NO" : "SI",
            IPRATICO: data.IPRATICO === "SI" ? "SI" : "NO",

            STATO_VENDITA: data.STATO_VENDITA || "",
            NOTE_STATO: data.NOTE_STATO || "",

            FRIGORIFERO: data.FRIGORIFERO || "",
            QTA_FRIGO:
              data.QTA_FRIGO != null ? String(data.QTA_FRIGO) : "",

            LOCAZIONE_1: data.LOCAZIONE_1 || "",
            QTA_LOC1:
              data.QTA_LOC1 != null ? String(data.QTA_LOC1) : "",

            LOCAZIONE_2: data.LOCAZIONE_2 || "",
            QTA_LOC2:
              data.QTA_LOC2 != null ? String(data.QTA_LOC2) : "",

            LOCAZIONE_3: data.LOCAZIONE_3 || "",
            QTA_LOC3:
              data.QTA_LOC3 != null ? String(data.QTA_LOC3) : "",

            NOTE: data.NOTE || "",
          });
        } catch (err) {
          console.error(err);
          setVinoLoadError(err.message || "Errore nel caricamento del vino.");
        } finally {
          setLoadingVino(false);
        }
      }
    };

    fetchAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, vinoId, isEditMode]);

  // --------------------------------------------------
  // SUBMIT
  // --------------------------------------------------
  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitError("");
    setSubmitSuccess("");

    if (!token) {
      handleLogout();
      return;
    }

    // Validazione minima
    if (!form.DESCRIZIONE.trim()) {
      setSubmitError("La descrizione del vino è obbligatoria.");
      return;
    }
    if (!form.TIPOLOGIA.trim()) {
      setSubmitError("La tipologia è obbligatoria.");
      return;
    }
    if (!form.NAZIONE.trim()) {
      setSubmitError("La nazione è obbligatoria.");
      return;
    }

    // Almeno una locazione non vuota
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

    const payload = {
      // id_excel RIMOSSO
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

    setSubmitting(true);

    try {
      const url = isEditMode
        ? `${API_BASE}/vini/magazzino/${vinoId}`
        : `${API_BASE}/vini/magazzino`;
      const method = isEditMode ? "PATCH" : "POST";

      const resp = await fetch(url, {
        method,
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

      if (isEditMode) {
        setSubmitSuccess("Vino aggiornato correttamente.");
        if (vinoId) {
          navigate(`/vini/magazzino/${vinoId}`);
        } else {
          navigate("/vini/magazzino");
        }
      } else {
        const newId = data.id || data.ID || data.Id || null;
        setSubmitSuccess(
          newId ? `Vino creato con ID ${newId}.` : "Vino creato correttamente."
        );
        if (newId) {
          navigate(`/vini/magazzino/${newId}`);
        } else {
          navigate("/vini/magazzino");
        }
      }
    } catch (err) {
      console.error(err);
      setSubmitError(err.message || "Errore durante il salvataggio.");
    } finally {
      setSubmitting(false);
    }
  };

  const title = isEditMode ? "✏️ Modifica vino — Magazzino" : "➕ Nuovo vino — Magazzino";
  const subtitle = isEditMode
    ? "Modifica anagrafica, magazzino e prezzi di un vino esistente nel magazzino."
    : "Inserimento di un nuovo vino nel magazzino dedicato vini_magazzino.";

  return (
    <div className="min-h-screen bg-neutral-100 p-6 font-sans">
      <div className="max-w-5xl mx-auto bg-white shadow-2xl rounded-3xl p-8 lg:p-10 border border-neutral-200">
        {/* HEADER */}
        <div className="flex flex-col lg:flex-row justify-between gap-4 mb-8">
          <div>
            <h1 className="text-3xl lg:text-4xl font-bold text-amber-900 tracking-wide font-playfair mb-2">
              {title}
            </h1>
            <p className="text-neutral-600 text-sm">
              {subtitle}
              <br />
              Campi obbligatori: <strong>Tipologia</strong>,{" "}
              <strong>Nazione</strong>, <strong>Descrizione</strong> e almeno
              una <strong>locazione</strong>.
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
        {vinoLoadError && (
          <div className="mb-4 text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl px-4 py-2">
            {vinoLoadError}
          </div>
        )}
        {loadingVino && isEditMode && (
          <div className="mb-4 text-sm text-neutral-700 bg-neutral-50 border border-neutral-200 rounded-xl px-4 py-2">
            Caricamento dati del vino in corso…
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
          {/* BLOCCO 1 — Anagrafica principale */}
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
            </div>

            <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-4">
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

              <div>
                <label className="block text-xs font-semibold text-neutral-600 mb-1 uppercase tracking-wide">
                  Vitigni
                </label>
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
              Magazzino — locazioni e giacenze
            </h2>
            <p className="text-xs text-neutral-500 mb-3">
              È obbligatorio indicare almeno una locazione (frigorifero o
              locazione 1/2/3). Le quantità possono essere inizializzate a 0 se
              vuoi registrare i carichi in un secondo tempo.
            </p>

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
                  placeholder="Nome frigo / cantina (facoltativo ma consigliato)"
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

              <div className="border border-neutral-200 rounded-xl bg-white p-3 space-y-2">
                <div className="text-[11px] font-semibold text-neutral-600 uppercase">
                  Locazione 1
                </div>
                <input
                  type="text"
                  value={form.LOCAZIONE_1}
                  onChange={handleChange("LOCAZIONE_1")}
                  className="w-full border border-neutral-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-amber-300"
                  placeholder="es. Cantina murata A1"
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

              <div className="border border-neutral-200 rounded-xl bg-white p-3 space-y-2">
                <div className="text-[11px] font-semibold text-neutral-600 uppercase">
                  Locazione 2
                </div>
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

              <div className="border border-neutral-200 rounded-xl bg-white p-3 space-y-2">
                <div className="text-[11px] font-semibold text-neutral-600 uppercase">
                  Locazione 3
                </div>
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
                  placeholder="es. 48"
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
                  placeholder="es. 15.4"
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
                  placeholder="es. 10"
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
                  placeholder="es. Fine serie, Solo BT, ecc."
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
                : "Suggerimenti caricati da vini_magazzino (tipologie, nazioni, regioni, produttori)."}
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
                disabled={submitting || (isEditMode && loadingVino)}
                className={`px-5 py-2 rounded-xl text-sm font-semibold shadow transition ${
                  submitting || (isEditMode && loadingVino)
                    ? "bg-gray-400 text-white cursor-not-allowed"
                    : "bg-amber-700 text-white hover:bg-amber-800 hover:-translate-y-0.5"
                }`}
              >
                {submitting
                  ? "Salvataggio in corso…"
                  : isEditMode
                  ? "💾 Salva modifiche"
                  : "💾 Salva nuovo vino"}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}