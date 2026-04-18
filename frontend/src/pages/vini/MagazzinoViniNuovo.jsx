// FILE: frontend/src/pages/vini/MagazzinoViniNuovo.jsx
// @version: v2.1-mattoni — M.I primitives (Btn) su footer salva e modale duplicati
// Pagina Magazzino Vini — Inserimento nuovo vino (NO ID EXCEL) + Formato a lista + check duplicati (C)

import React, { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { API_BASE, apiFetch } from "../../config/api";
import ViniNav from "./ViniNav";
import LocationPicker from "./LocationPicker";
import { STATO_VENDITA_OPTIONS, STATO_RIORDINO_OPTIONS, STATO_CONSERVAZIONE_OPTIONS } from "../../config/viniConstants";
import { Btn } from "../../components/ui";

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
  const [allRegioni, setAllRegioni] = useState([]); // [{codice, nome, nazione}]
  const [regioni, setRegioni] = useState([]); // filtrate per nazione selezionata
  const [produttori, setProduttori] = useState([]);
  const [formati, setFormati] = useState([]);
  const [opzioniFrigo, setOpzioniFrigo] = useState([]);
  const [opzioniLoc1, setOpzioniLoc1] = useState([]);
  const [opzioniLoc2, setOpzioniLoc2] = useState([]);
  const [opzioniLoc3, setOpzioniLoc3] = useState([]);

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [submitSuccess, setSubmitSuccess] = useState("");

  // Duplicati (C)
  const [dupChecking, setDupChecking] = useState(false);
  const [dupCandidates, setDupCandidates] = useState([]);
  const [showDupConfirm, setShowDupConfirm] = useState(false);

  const [form, setForm] = useState({
    TIPOLOGIA: "",
    NAZIONE: "Italia",
    REGIONE: "",
    DESCRIZIONE: "",
    DENOMINAZIONE: "",
    ANNATA: "",
    VITIGNI: "",
    GRADO_ALCOLICO: "",
    FORMATO: "BT",
    PRODUTTORE: "",
    DISTRIBUTORE: "",
    RAPPRESENTANTE: "",

    PREZZO_CARTA: "",
    PREZZO_CALICE: "",
    PREZZO_CALICE_MANUALE: 0,
    EURO_LISTINO: "",
    SCONTO: "",
    NOTE_PREZZO: "",

    CARTA: "SI",
    IPRATICO: "NO",
    VENDITA_CALICE: "NO",
    BIOLOGICO: "NO",
    FORZA_PREZZO: 0,

    STATO_VENDITA: "",
    STATO_RIORDINO: "",
    STATO_CONSERVAZIONE: "",
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

  // Auto-calcolo PREZZO_CARTA quando EURO_LISTINO cambia
  const [prezzoAutoCalc, setPrezzoAutoCalc] = useState(false);
  const autoCalcPrezzo = async (e) => {
    const val = parseFloat(e.target.value);
    if (!val || val <= 0) return;
    try {
      const r = await apiFetch(`${API_BASE}/vini/pricing/calcola`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ euro_listino: val }),
      });
      if (r.ok) {
        const data = await r.json();
        setForm(p => ({ ...p, PREZZO_CARTA: data.prezzo_carta }));
        setPrezzoAutoCalc(true);
        setTimeout(() => setPrezzoAutoCalc(false), 2000);
      }
    } catch {}
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
  // VALORI TABELLATI: carica da filtri-options
  // ------------------------------------------------
  useEffect(() => {
    const fetchOptions = async () => {
      setLoadingOptions(true);
      setOptionsError("");

      try {
        // Carica valori tabellati (fonte unica) per dropdown strict
        const [tabResp, optResp] = await Promise.all([
          apiFetch(`${API_BASE}/settings/vini/valori-tabellati`),
          apiFetch(`${API_BASE}/vini/cantina-tools/inventario/filtri-options`),
        ]);

        if (tabResp.ok) {
          const tab = await tabResp.json();
          setTipologie(tab.tipologie || []);
          setNazioni(tab.nazioni || []);
          setAllRegioni(tab.regioni || []); // [{codice, nome, nazione}]
          setFormati(tab.formati || []);
        }

        // Produttori restano da filtri-options (non tabellati)
        if (optResp.ok) {
          const opt = await optResp.json();
          setProduttori(opt.produttori || []);
        }
      } catch (err) {
        console.error(err);
        setOptionsError(err.message || "Errore nel caricamento suggerimenti.");
      } finally {
        setLoadingOptions(false);
      }
    };

    fetchOptions();

    // Opzioni locazioni
    apiFetch(`${API_BASE}/vini/cantina-tools/locazioni-config`)
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data) {
          setOpzioniFrigo(data.opzioni_frigo || []);
          setOpzioniLoc1(data.opzioni_locazione_1 || []);
          setOpzioniLoc2(data.opzioni_locazione_2 || []);
          setOpzioniLoc3(data.opzioni_locazione_3 || []);
        }
      })
      .catch(() => {});

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Cascading: filtra regioni in base a NAZIONE selezionata
  useEffect(() => {
    if (!form.NAZIONE) {
      setRegioni([]);
      return;
    }
    const filtered = allRegioni
      .filter(r => r.nazione === form.NAZIONE)
      .map(r => r.nome);
    setRegioni(filtered);
    // Se la regione selezionata non è fra quelle della nuova nazione, resettala
    if (form.REGIONE && !filtered.includes(form.REGIONE)) {
      setForm(prev => ({ ...prev, REGIONE: "" }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.NAZIONE, allRegioni]);

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
      const resp = await apiFetch(`${API_BASE}/vini/magazzino/?q=${q}`);

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
      NAZIONE: form.NAZIONE.trim() || "Italia",
      REGIONE: nullIfEmpty(form.REGIONE),
      DESCRIZIONE: form.DESCRIZIONE.trim(),
      DENOMINAZIONE: nullIfEmpty(form.DENOMINAZIONE),
      ANNATA: nullIfEmpty(form.ANNATA),
      VITIGNI: nullIfEmpty(form.VITIGNI),
      GRADO_ALCOLICO: numberOrNull(form.GRADO_ALCOLICO),
      FORMATO: form.FORMATO.trim() || "BT",

      PRODUTTORE: nullIfEmpty(form.PRODUTTORE),
      DISTRIBUTORE: nullIfEmpty(form.DISTRIBUTORE),
      RAPPRESENTANTE: nullIfEmpty(form.RAPPRESENTANTE),

      PREZZO_CARTA: numberOrNull(form.PREZZO_CARTA),
      PREZZO_CALICE: numberOrNull(form.PREZZO_CALICE),
      PREZZO_CALICE_MANUALE: form.PREZZO_CALICE_MANUALE ? 1 : 0,
      EURO_LISTINO: numberOrNull(form.EURO_LISTINO),
      SCONTO: numberOrNull(form.SCONTO),
      NOTE_PREZZO: nullIfEmpty(form.NOTE_PREZZO),

      CARTA: form.CARTA === "SI" ? "SI" : "NO",
      IPRATICO: form.IPRATICO === "SI" ? "SI" : "NO",
      VENDITA_CALICE: form.VENDITA_CALICE === "SI" ? "SI" : "NO",
      BIOLOGICO: form.BIOLOGICO === "SI" ? "SI" : "NO",
      FORZA_PREZZO: form.FORZA_PREZZO ? 1 : 0,

      STATO_VENDITA: nullIfEmpty(form.STATO_VENDITA),
      STATO_RIORDINO: nullIfEmpty(form.STATO_RIORDINO),
      STATO_CONSERVAZIONE: nullIfEmpty(form.STATO_CONSERVAZIONE),
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
      const resp = await apiFetch(`${API_BASE}/vini/magazzino/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payloadFinal),
      });

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
    <div className="min-h-screen bg-brand-cream font-sans">
      <ViniNav current="cantina" />
      <div className="max-w-5xl mx-auto p-4 sm:p-6">
      <div className="bg-white shadow-xl rounded-2xl p-6 sm:p-8 border border-neutral-200">
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
                <Btn
                  variant="secondary"
                  size="md"
                  type="button"
                  onClick={() => {
                    setShowDupConfirm(false);
                    setDupCandidates([]);
                  }}
                >
                  No, annulla
                </Btn>
                <Btn
                  variant="primary"
                  size="md"
                  type="button"
                  disabled={submitting}
                  loading={submitting}
                  onClick={async () => {
                    setShowDupConfirm(false);
                    await doCreate();
                  }}
                >
                  Sì, procedi comunque
                </Btn>
              </div>
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-0">

          {/* ── ANAGRAFICA ── */}
          <div className="border-b border-neutral-200">
            <div className="flex items-center px-5 py-3 bg-neutral-50 border-b border-neutral-200">
              <h2 className="text-sm font-semibold text-neutral-800 uppercase tracking-wide">Anagrafica</h2>
            </div>
            <div className="p-5 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {inputField("Descrizione *", form.DESCRIZIONE, handleChange("DESCRIZIONE"))}
                {inputField("Denominazione", form.DENOMINAZIONE, handleChange("DENOMINAZIONE"), { placeholder: "es. Barolo DOCG" })}
              </div>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                {selectField("Tipologia *", form.TIPOLOGIA, handleChange("TIPOLOGIA"), tipologie.map(t => ({ value: t, label: t })), "— seleziona —")}
                {selectField("Nazione *", form.NAZIONE, handleChange("NAZIONE"), nazioni.map(n => ({ value: n, label: n })), "— seleziona —")}
                {selectField("Regione", form.REGIONE, handleChange("REGIONE"), regioni.map(r => ({ value: r, label: r })), "— nessuna —")}
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {inputField("Annata", form.ANNATA, handleChange("ANNATA"), { placeholder: "es. 2019" })}
                {selectField("Formato", form.FORMATO, handleChange("FORMATO"), formati.map(f => {
                  const fmt = typeof f === "string" ? f : f.formato;
                  const desc = typeof f === "string" ? "" : f.descrizione;
                  const litri = typeof f === "string" ? "" : f.litri;
                  return { value: fmt, label: desc ? `${fmt} — ${desc}${litri ? ` (${litri}L)` : ""}` : fmt };
                }), "— seleziona —")}
                {inputField("Vitigni", form.VITIGNI, handleChange("VITIGNI"))}
                {inputField("Grado alcolico", form.GRADO_ALCOLICO, handleChange("GRADO_ALCOLICO"), { type: "number", step: "0.1" })}
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-[11px] font-semibold text-neutral-600 uppercase tracking-wide mb-0.5">Produttore</label>
                  <input list="produttori-list" value={form.PRODUTTORE} onChange={handleChange("PRODUTTORE")} placeholder="es. Gaja"
                    className="w-full border border-neutral-300 rounded-lg px-2 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-amber-300" />
                  <datalist id="produttori-list">{produttori.map(p => <option key={p} value={p} />)}</datalist>
                </div>
                {inputField("Distributore", form.DISTRIBUTORE, handleChange("DISTRIBUTORE"))}
                {inputField("Rappresentante", form.RAPPRESENTANTE, handleChange("RAPPRESENTANTE"))}
              </div>

              {/* Prezzi */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pt-3 border-t border-neutral-100">
                {inputField(`Prezzo carta €${prezzoAutoCalc ? " ✓ auto" : ""}`, form.PREZZO_CARTA, (e) => {
                  const val = e.target.value;
                  setForm(p => {
                    const upd = { ...p, PREZZO_CARTA: val };
                    if (!p.PREZZO_CALICE_MANUALE) {
                      const pf = parseFloat(val);
                      upd.PREZZO_CALICE = pf > 0 ? (Math.round((pf / 5) * 2) / 2).toFixed(1) : "";
                    }
                    return upd;
                  });
                }, { type: "number", step: "0.50" })}
                {inputField(`Calice €${form.PREZZO_CALICE_MANUALE ? " ✎" : " (auto)"}`, form.PREZZO_CALICE, (e) => {
                  setForm(p => ({ ...p, PREZZO_CALICE: e.target.value, PREZZO_CALICE_MANUALE: 1 }));
                }, { type: "number", step: "0.50" })}
                {inputField("Listino €", form.EURO_LISTINO, handleChange("EURO_LISTINO"), { type: "number", step: "0.01", onBlur: autoCalcPrezzo })}
                {inputField("Sconto %", form.SCONTO, handleChange("SCONTO"), { type: "number", step: "0.01" })}
              </div>

              {/* Flag toggle */}
              <div className="grid grid-cols-3 md:grid-cols-5 gap-4">
                {flagToggle("Carta Vini", form.CARTA, v => setForm(p => ({ ...p, CARTA: v })))}
                {flagToggle("iPratico", form.IPRATICO, v => setForm(p => ({ ...p, IPRATICO: v })))}
                {flagToggle("Calice", form.VENDITA_CALICE, v => setForm(p => ({ ...p, VENDITA_CALICE: v })))}
                {flagToggle("Biologico", form.BIOLOGICO, v => setForm(p => ({ ...p, BIOLOGICO: v })))}
                {flagToggle("Forza Prezzo", form.FORZA_PREZZO ? "SI" : "NO", v => setForm(p => ({ ...p, FORZA_PREZZO: v === "SI" ? 1 : 0 })))}
              </div>

              {/* Stato */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-3 border-t border-neutral-100">
                {selectField("Stato vendita", form.STATO_VENDITA, handleChange("STATO_VENDITA"), STATO_VENDITA_OPTIONS)}
                {selectField("Stato riordino", form.STATO_RIORDINO, handleChange("STATO_RIORDINO"), STATO_RIORDINO_OPTIONS)}
                {selectField("Stato conservazione", form.STATO_CONSERVAZIONE, handleChange("STATO_CONSERVAZIONE"), STATO_CONSERVAZIONE_OPTIONS)}
              </div>

              {/* Note */}
              {inputField("Note stato", form.NOTE_STATO, handleChange("NOTE_STATO"))}
              {inputField("Note prezzo", form.NOTE_PREZZO, handleChange("NOTE_PREZZO"))}
              <div>
                <label className="block text-[11px] font-semibold text-neutral-600 uppercase tracking-wide mb-0.5">Note interne</label>
                <textarea value={form.NOTE} onChange={handleChange("NOTE")} rows={2}
                  className="w-full border border-neutral-300 rounded-lg px-2 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-amber-300" />
              </div>
            </div>
          </div>

          {/* ── GIACENZE ── */}
          <div className="border-b border-neutral-200">
            <div className="flex items-center px-5 py-3 bg-neutral-50 border-b border-neutral-200">
              <h2 className="text-sm font-semibold text-neutral-800 uppercase tracking-wide">Giacenze per locazione</h2>
            </div>
            <div className="p-5">
              <p className="text-xs text-neutral-500 mb-3">
                Obbligatorio almeno una locazione. La matrice si assegna dopo la creazione.
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {locCard("Frigorifero", opzioniFrigo, form.FRIGORIFERO, v => setForm(p => ({...p, FRIGORIFERO: v})), form.QTA_FRIGO, handleChange("QTA_FRIGO"), "Cerca frigorifero…")}
                {locCard("Locazione 1", opzioniLoc1, form.LOCAZIONE_1, v => setForm(p => ({...p, LOCAZIONE_1: v})), form.QTA_LOC1, handleChange("QTA_LOC1"), "Cerca locazione 1…")}
                {locCard("Locazione 2", opzioniLoc2, form.LOCAZIONE_2, v => setForm(p => ({...p, LOCAZIONE_2: v})), form.QTA_LOC2, handleChange("QTA_LOC2"), "Cerca locazione 2…")}
                <div className="border border-neutral-200 rounded-xl bg-white p-3 flex items-center justify-center">
                  <p className="text-xs text-neutral-400">Matrice: si assegna dalla scheda dettaglio dopo la creazione.</p>
                </div>
              </div>
            </div>
          </div>

          {/* FOOTER */}
          <div className="flex flex-col sm:flex-row justify-between items-center gap-3 p-5">
            <div className="text-xs text-neutral-500">
              {loadingOptions ? "Caricamento…" : ""}
              {dupChecking ? " • Check duplicati…" : ""}
            </div>
            <div className="flex gap-3">
              <Btn variant="secondary" size="md" type="button" onClick={() => navigate("/vini/magazzino")}>
                Annulla
              </Btn>
              <Btn variant="primary" size="md" type="submit" disabled={submitting} loading={submitting}>
                {submitting ? "Salvataggio…" : "💾 Salva nuovo vino"}
              </Btn>
            </div>
          </div>
        </form>
      </div>
      </div>
    </div>
  );
}

/* ----------------- Helper UI (stile SchedaVino) ----------------- */

function inputField(label, value, onChange, opts = {}) {
  const { type = "text", step, placeholder, onBlur, readOnly } = opts;
  return (
    <div>
      <label className="block text-[11px] font-semibold text-neutral-600 uppercase tracking-wide mb-0.5">{label}</label>
      <input
        type={type} step={step} placeholder={placeholder} readOnly={readOnly}
        value={value ?? ""} onChange={onChange} onBlur={onBlur}
        className={`w-full border border-neutral-300 rounded-lg px-2 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-amber-300 ${readOnly ? "bg-neutral-50 text-neutral-500" : ""}`}
      />
    </div>
  );
}

function selectField(label, value, onChange, options, placeholder) {
  return (
    <div>
      <label className="block text-[11px] font-semibold text-neutral-600 uppercase tracking-wide mb-0.5">{label}</label>
      <select value={value ?? ""} onChange={onChange}
        className="w-full border border-neutral-300 rounded-lg px-2 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-amber-300">
        {placeholder && <option value="">{placeholder}</option>}
        {options.map(o => {
          const val = typeof o === "string" ? o : o.value;
          const lab = typeof o === "string" ? o : o.label;
          return <option key={val} value={val}>{lab}</option>;
        })}
      </select>
    </div>
  );
}

function flagToggle(label, value, onChange) {
  const on = value === "SI" || value === 1 || value === true;
  return (
    <div className="flex flex-col items-center gap-1">
      <span className="text-[10px] font-semibold text-neutral-600 uppercase tracking-wide">{label}</span>
      <button type="button" onClick={() => onChange(on ? "NO" : "SI")}
        className={`w-12 h-6 rounded-full relative transition-colors ${on ? "bg-amber-500" : "bg-neutral-300"}`}>
        <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${on ? "left-6" : "left-0.5"}`} />
      </button>
      <span className={`text-[10px] font-medium ${on ? "text-amber-700" : "text-neutral-400"}`}>{on ? "Sì" : "No"}</span>
    </div>
  );
}

function locCard(title, options, locValue, onLocChange, qtaValue, onQtaChange, placeholder) {
  return (
    <div className="border border-neutral-200 rounded-xl bg-white p-3 space-y-2">
      <div className="text-[11px] font-semibold text-neutral-600 uppercase tracking-wide">{title}</div>
      <select value={locValue ?? ""} onChange={e => onLocChange(e.target.value)}
        className="w-full border border-neutral-300 rounded-lg px-2 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-amber-300">
        <option value="">{placeholder || "— nessuna —"}</option>
        {options.map(o => <option key={o} value={o}>{o}</option>)}
      </select>
      <div className="flex items-center gap-2">
        <span className="text-xs text-neutral-600">Quantità</span>
        <input type="number" value={qtaValue ?? ""} onChange={onQtaChange} placeholder="0"
          className="w-24 border border-neutral-300 rounded-lg px-2 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-amber-300" />
        <span className="text-xs text-neutral-500">bt</span>
      </div>
    </div>
  );
}