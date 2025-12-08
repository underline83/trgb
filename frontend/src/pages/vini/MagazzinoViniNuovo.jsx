// @version: v1.1-magazzino-nuovo-duplicati
// Pagina Magazzino Vini — Inserimento nuovo vino con controllo duplicati

import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { API_BASE } from "../../config/api";

const FORMATO_OPTIONS = [
  { value: "BT", label: "BT — Bottiglia 0,75 L" },
  { value: "MG", label: "MG — Magnum 1,5 L" },
  { value: "DM", label: "DM — Doppio Magnum 3 L" },
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

  // Stato per duplicati
  const [duplicates, setDuplicates] = useState([]);
  const [awaitingDuplicateConfirm, setAwaitingDuplicateConfirm] = useState(false);

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
        const resp = await fetch(`${API_BASE}/vini-magazzino`, {
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
    // id_excel rimosso: si usa solo in import, non in inserimento manuale
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
    setForm((prev) => ({
      ...prev,
      [field]: value,
    }));
    // Se sto modificando qualcosa dopo un warning duplicati, lo azzero
    setSubmitError("");
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

    // Regole: almeno una locazione
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

    // 1) PRIMO PASSAGGIO: controllo duplicati, se NON siamo ancora in fase di conferma
    if (!awaitingDuplicateConfirm) {
      try {
        const checkResp = await fetch(
          `${API_BASE}/vini-magazzino/check-duplicati`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({
              DESCRIZIONE: payload.DESCRIZIONE,
              PRODUTTORE: payload.PRODUTTORE,
              ANNATA: payload.ANNATA,
              FORMATO: payload.FORMATO,
            }),
          }
        );

        if (checkResp.status === 401) {
          alert("Sessione scaduta. Effettua nuovamente il login.");
          handleLogout();
          return;
        }

        if (!checkResp.ok) {
          throw new Error(
            `Errore controllo duplicati: ${checkResp.status}`
          );
        }

        const checkData = await checkResp.json();
        const found = checkData.duplicates || [];

        if (found.length > 0) {
          setDuplicates(found);
          setAwaitingDuplicateConfirm(true);
          setSubmitError(
            "Sono stati trovati possibili duplicati. Controlla la lista qui sotto. " +
              "Se vuoi inserire comunque questo vino, premi di nuovo «Salva nuovo vino»."
          );
          return; // NON inserisco ancora
        } else {
          setDuplicates([]);
          setAwaitingDuplicateConfirm(false);
        }
      } catch (err) {
        console.error(err);
        setSubmitError(
          err.message || "Errore durante il controllo duplicati."
        );
        return;
      }
    }

    // 2) SE ARRIVIAMO QUI:
    //    - o non ci sono duplicati
    //    - oppure l'utente ha già visto i duplicati e ha premuto di nuovo "Salva"

    setSubmitting(true);

    try {
      const resp = await fetch(`${API_BASE}/vini-magazzino`, {
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
      setSubmitError("");
      setAwaitingDuplicateConfirm(false);
      setDuplicates([]);

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

  const handleCancelAfterDuplicates = () => {
    setAwaitingDuplicateConfirm(false);
    setDuplicates([]);
    setSubmitError("");
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

        {/* DUPLICATI TROVATI */}
        {duplicates.length > 0 && (
          <div className="mb-6 border border-amber-300 bg-amber-50 rounded-2xl p-4">
            <h2 className="text-sm font-semibold text-amber-900 mb-2">
              Possibili duplicati trovati
            </h2>
            <p className="text-xs text-amber-900 mb-3">
              Il sistema ha trovato {duplicates.length} vini con la stessa
              descrizione (e produttore/annata/formato compatibili). Controlla
              se uno di questi è lo stesso vino:
            </p>
            <div className="max-h-56 overflow-auto border border-amber-200 rounded-xl bg-white">
              <table className="w-full text-xs">
                <thead className="bg-amber-50 sticky top-0 z-10">
                  <tr className="text-[11px] text-amber-900 uppercase tracking-wide">
                    <th className="px-3 py-2 text-left">ID</th>
                    <th className="px-3 py-2 text-left">Vino</th>
                    <th className="px-3 py-2 text-left">Produttore</th>
                    <th className="px-3 py-2 text-left">Origine</th>
                    <th className="px-3 py-2 text-center">Qta</th>
                    <th className="px-3 py-2 text-center">Prezzo carta</th>
                  </tr>
                </thead>
                <tbody>
                  {duplicates.map((d) => (
                    <tr
                      key={d.id}
                      className="border-b border-amber-100 hover:bg-amber-50/70"
                    >
                      <td className="px-3 py-2 align-top font-mono">
                        {d.id}
                      </td>
                      <td className="px-3 py-2 align-top">
                        <div className="font-semibold">{d.DESCRIZIONE}</div>
                        {d.ANNATA && (
                          <div className="text-[11px] text-neutral-600">
                            Annata {d.ANNATA}
                          </div>
                        )}
                        {d.FORMATO && (
                          <div className="text-[11px] text-neutral-600">
                            Formato {d.FORMATO}
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-2 align-top">
                        {d.PRODUTTORE || "—"}
                      </td>
                      <td className="px-3 py-2 align-top text-[11px] text-neutral-700">
                        {d.NAZIONE}
                        {d.REGIONE ? ` / ${d.REGIONE}` : ""}
                      </td>
                      <td className="px-3 py-2 align-top text-center">
                        {d.QTA_TOTALE ?? 0}
                      </td>
                      <td className="px-3 py-2 align-top text-center">
                        {d.PREZZO_CARTA != null
                          ? `${Number(d.PREZZO_CARTA).toFixed(2)} €`
                          : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mt-3 flex flex-wrap gap-3 justify-end">
              <button
                type="button"
                onClick={handleCancelAfterDuplicates}
                className="px-4 py-2 rounded-xl text-xs font-medium border border-neutral-300 bg-white hover:bg-neutral-100 shadow-sm transition"
              >
                Annulla inserimento
              </button>
              <span className="text-xs text-amber-900 self-center">
                Se vuoi inserire comunque questo vino, premi di nuovo{" "}
                <strong>«Salva nuovo vino»</strong> in fondo alla pagina.
              </span>
            </div>
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
                  Formato
                </label>
                <select
                  value={form.FORMATO}
                  onChange={handleChange("FORMATO")}
                  className="w-full border border-neutral-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-amber-300"
                >
                  {FORMATO_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
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
          {/* (resto identico alla tua versione precedente, solo collegato al nuovo stato) */}

          {/* BLOCCO 2 — Magazzino — locazioni e giacenze iniziali */}
          <section className="border border-neutral-200 rounded-2xl p-4 lg:p-5 bg-neutral-50">
            <h2 className="text-sm font-semibold text-neutral-800 mb-3 uppercase tracking-wide">
              Magazzino — locazioni e giacenze iniziali
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
                disabled={submitting}
                className={`px-5 py-2 rounded-xl text-sm font-semibold shadow transition ${
                  submitting
                    ? "bg-gray-400 text-white cursor-not-allowed"
                    : "bg-amber-700 text-white hover:bg-amber-800 hover:-translate-y-0.5"
                }`}
              >
                {submitting
                  ? "Salvataggio in corso…"
                  : awaitingDuplicateConfirm
                  ? "💾 Conferma inserimento comunque"
                  : "💾 Salva nuovo vino"}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}