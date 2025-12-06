// @version: v1.1-magazzino-nuovo
// Pagina Magazzino Vini — Inserimento nuovo vino

import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { API_BASE } from "../../config/api";

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

    // Carico elenco vini-magazzino per creare le "suggestions"
    const fetchOptions = async () => {
      setLoadingOptions(true);
      setOptionsError("");

      try {
        // 🔴 PRIMA: `${API_BASE}/vini-magazzino`
        // ✅ ORA: usa il router FastAPI con prefix "/vini/magazzino"
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
    };

    fetchOptions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [form, setForm] = useState({
    id_excel: "",
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

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitError("");
    setSubmitSuccess("");

    if (!token) {
      handleLogout();
      return;
    }

    // Validazione minima lato frontend
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

    // Regole del backend: almeno una locazione o frigorifero devono essere valorizzati
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
      id_excel: form.id_excel ? intOrZero(form.id_excel) : null,

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
      // 🔴 PRIMA: `${API_BASE}/vini-magazzino`
      // ✅ ORA: POST verso il router "/vini/magazzino"
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
      if (data.id) {
        navigate(`/vini/magazzino/${data.id}`);
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
              Inserimento di un nuovo vino nel magazzino dedicato
              <span className="font-semibold"> vini_magazzino</span>.
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
          {/* ...tutto il resto del form invariato... */}
          {/* (ho lasciato uguale la parte di markup che avevi già scritto) */}
        </form>
      </div>
    </div>
  );
}