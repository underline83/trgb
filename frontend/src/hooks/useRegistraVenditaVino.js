// FILE: frontend/src/hooks/useRegistraVenditaVino.js
// @version: v1.1 — registrazione vendita vino (bottiglia / apertura calici) estratta da
//   ViniVendite.jsx per riusarla nella Home del sommelier (2026-11-05)
// Modulo: vini
//
// UNA sola logica di registrazione per Vini › Vendite e per il riquadro
// «Vendi o apri» della Home sommelier: ricerca, scansione QR, locazione, celle
// della Matrice, movimento VENDITA con tag [BOTTIGLIA]/[CALICI], modale
// «Decidi prezzo calice» quando si apre per calici un vino non al calice.
// Il codice è quello della pagina (vini 3.93), spostato qui senza cambiare le
// regole. Unica differenza: gli avvisi di validazione arrivano nel messaggio
// del form invece che in una finestrella del browser.
//
// Parametri:
//   onRegistrata({ vino, modalita, qta }) — dopo una registrazione riuscita
//   onScanSelezionato()                   — dopo una scansione andata a buon fine
//   onCaliceAttivato()                    — dopo l'apertura in mescita dal modale prezzo

import { useState, useEffect, useCallback, useRef } from "react";
import { API_BASE, apiFetch } from "../config/api";
import { roundToHalf } from "../components/vini/DecidiPrezzoCalice";

export const MODALITA = {
  BOTTIGLIA:   { label: "Bottiglia",   icon: "🍾",  desc: "Vendita bottiglia intera",  color: "bg-violet-100 text-violet-800 border-violet-300" },
  CALICI:      { label: "Calici",      icon: "🥂",  desc: "Aperta per vendita al calice", color: "bg-rose-100 text-rose-800 border-rose-300" },
};

export function defaultPrezzoCalice(vino) {
  const carta = Number(vino?.PREZZO_CARTA || 0);
  return carta > 0 ? roundToHalf(carta / 5) : 0;
}

// Valore precompilato nel campo: se il vino ha già un PREZZO_CALICE deciso in
// un'apertura precedente si riparte da lì. 2026-09-01: serve perché
// l'apertura estemporanea non accende più VENDITA_CALICE, quindi il modale
// ricompare alla bottiglia successiva e senza questo ripartirebbe da capo.
export function prezzoCaliceSalvato(vino) {
  const salvato = Number(vino?.PREZZO_CALICE || 0);
  return salvato > 0 ? salvato : undefined;
}

export function buildLocOptions(vino) {
  if (!vino) return [];
  // vini 3.89: loc3 è sempre la Matrice (LOCAZIONE_3 è solo il riassunto celle)
  const loc3Label = "Matrice";
  return [
    { value: "frigo", label: vino.FRIGORIFERO || "Frigo",  qta: vino.QTA_FRIGO ?? 0 },
    { value: "loc1",  label: vino.LOCAZIONE_1 || "Loc 1",  qta: vino.QTA_LOC1 ?? 0 },
    { value: "loc2",  label: vino.LOCAZIONE_2 || "Loc 2",  qta: vino.QTA_LOC2 ?? 0 },
    { value: "loc3",  label: loc3Label,                     qta: vino.QTA_LOC3 ?? 0 },
  ];
}


export default function useRegistraVenditaVino({ onRegistrata, onScanSelezionato, onCaliceAttivato } = {}) {
  // ── Registrazione rapida ──
  const [searchText, setSearchText] = useState("");
  const [suggestions, setSuggestions] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [selectedVino, setSelectedVino] = useState(null);
  const [modalita, setModalita] = useState("BOTTIGLIA");
  const [regLoc, setRegLoc] = useState("");
  const [regQta, setRegQta] = useState("1");
  const [regNote, setRegNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitMsg, setSubmitMsg] = useState("");
  // Modale "Decidi prezzo calice" — si apre quando il sommelier apre per calici un
  // vino con VENDITA_CALICE != 'SI' e BOTTIGLIA_APERTA = 0 (prima apertura manuale).
  // Sessione 2026-05-11.
  const [decidiPrezzo, setDecidiPrezzo] = useState(null); // null o { vino, defaultPrezzo }
  const searchRef = useRef(null);
  const [scanOpen, setScanOpen] = useState(false);
  const suggestionsRef = useRef(null);

  // ── Matrice (selezione celle per vendita da loc3) ──
  const [matriceStato, setMatriceStato] = useState(null); // {righe, colonne, nome, celle}
  const [myCelleMatrice, setMyCelleMatrice] = useState([]); // [{riga, colonna}]
  const [selectedCelle, setSelectedCelle] = useState([]); // celle selezionate per la vendita
  const [matriceLoading, setMatriceLoading] = useState(false);

  const avviso = (testo, ms = 5000) => {
    setSubmitMsg(testo);
    setTimeout(() => setSubmitMsg(""), ms);
  };

  // ── Autocomplete vini ──
  useEffect(() => {
    if (searchText.length < 2 || selectedVino) { setSuggestions([]); return; }
    const timer = setTimeout(async () => {
      try {
        const res = await apiFetch(
          `${API_BASE}/vini/magazzino/autocomplete?q=${encodeURIComponent(searchText)}&limit=8&solo_disponibili=true`
        );
        if (res.ok) {
          const data = await res.json();
          setSuggestions(data);
          setShowSuggestions(true);
        }
      } catch { /* silenzioso */ }
    }, 250);
    return () => clearTimeout(timer);
  }, [searchText, selectedVino]);

  // Chiudi suggestions al click fuori
  useEffect(() => {
    const handleClick = (e) => {
      if (
        suggestionsRef.current && !suggestionsRef.current.contains(e.target) &&
        searchRef.current && !searchRef.current.contains(e.target)
      ) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  // ── Seleziona vino ──
  const selectVino = (v) => {
    setSelectedVino(v);
    setSearchText(v.DESCRIZIONE + (v.PRODUTTORE ? ` — ${v.PRODUTTORE}` : ""));
    setShowSuggestions(false);
    setSuggestions([]);
    setRegLoc("");
  };

  // ── Scansione QR etichetta (vini 3.93) ──
  // Le etichette di /vini/etichette puntano a …/vini/cantina-mobile/{id}.
  // Accetta anche un QR col solo numero. Seleziona il vino e, se è in un
  // solo posto, preimposta la locazione: resta da premere «Registra».
  const onScan = async (testo) => {
    setScanOpen(false);
    const t = String(testo || "").trim();
    const m = t.match(/\/cantina-mobile\/(\d+)/) || t.match(/^#?(\d+)$/);
    if (!m) {
      setSubmitMsg("❌ QR non riconosciuto: non è un'etichetta vino TRGB.");
      setTimeout(() => setSubmitMsg(""), 5000);
      return;
    }
    try {
      const r = await apiFetch(`${API_BASE}/vini/magazzino/${m[1]}`);
      if (!r.ok) throw new Error(`Vino #${m[1]} non trovato`);
      const vino = await r.json();
      selectVino(vino);
      const posti = buildLocOptions(vino).filter((o) => Number(o.qta) > 0);
      if (posti.length === 1) setRegLoc(posti[0].value);
      if (modalita === "BOTTIGLIA" && !Number(vino.QTA_TOTALE)) {
        setSubmitMsg(`❌ ${vino.DESCRIZIONE}: giacenza 0, niente da scaricare.`);
        setTimeout(() => setSubmitMsg(""), 5000);
      }
      onScanSelezionato?.();
    } catch (err) {
      setSubmitMsg(`❌ ${err.message}`);
      setTimeout(() => setSubmitMsg(""), 5000);
    }
  };

  // ── Deseleziona ──
  const clearVino = () => {
    setSelectedVino(null);
    setSearchText("");
    setRegLoc("");
    setSelectedCelle([]);
    setMatriceStato(null);
    setMyCelleMatrice([]);
  };

  // ── Matrice: detect se loc3 è matrice e carica griglia ──
  // vini 3.89: loc3 = Matrice sempre → le celle si caricano sempre. La griglia
  // (scelta celle obbligatoria) si usa solo se il vino ha celle VERE: prima
  // decideva il testo di LOCAZIONE_3, e un vino con "(8,3)" nel testo ma zero
  // celle (#607) restava bloccato — griglia vuota, vendita impossibile.
  const isLoc3Matrice = !!selectedVino;
  const usaGriglia = regLoc === "loc3" && myCelleMatrice.length > 0;

  const fetchMatriceData = useCallback(async () => {
    if (!selectedVino || !isLoc3Matrice) return;
    setMatriceLoading(true);
    try {
      const [rStato, rCelle] = await Promise.all([
        apiFetch(`${API_BASE}/vini/cantina-tools/matrice/stato`),
        apiFetch(`${API_BASE}/vini/cantina-tools/matrice/celle/${selectedVino.id}`),
      ]);
      if (rStato.ok) setMatriceStato(await rStato.json());
      if (rCelle.ok) {
        const data = await rCelle.json();
        setMyCelleMatrice(data.celle || []);
      }
    } catch { /* silenzioso */ }
    setMatriceLoading(false);
  }, [selectedVino, isLoc3Matrice]);

  // Quando cambia locazione a loc3-matrice, carica la griglia
  useEffect(() => {
    if (regLoc === "loc3" && isLoc3Matrice) {
      fetchMatriceData();
      setSelectedCelle([]);
    } else {
      setSelectedCelle([]);
    }
  }, [regLoc, isLoc3Matrice, fetchMatriceData]);

  // Toggle selezione cella per vendita
  const toggleCella = (riga, colonna) => {
    const key = `${riga},${colonna}`;
    setSelectedCelle(prev => {
      const exists = prev.some(c => `${c.riga},${c.colonna}` === key);
      if (exists) return prev.filter(c => `${c.riga},${c.colonna}` !== key);
      return [...prev, { riga, colonna }];
    });
  };

  // Quando le celle selezionate cambiano, aggiorna la quantità
  useEffect(() => {
    if (usaGriglia && selectedCelle.length > 0) {
      setRegQta(String(selectedCelle.length));
    }
  }, [selectedCelle, usaGriglia]);

  const eseguiVendita = async ({ extraNota = "", prezzoCustom = null, mod = null } = {}) => {
    const modo = mod || modalita;
    const qtaNum = Number(regQta);
    setSubmitting(true);
    setSubmitMsg("");
    try {
      // Se il sommelier ha scelto un prezzo custom per il calice, propaga il
      // valore nell'anagrafica del vino PRIMA della registrazione movimento.
      // Setta anche PREZZO_CALICE_MANUALE=1 per non farlo sovrascrivere dai
      // ricalcoli automatici (logica già usata in vini_pricing_router).
      if (prezzoCustom != null) {
        const resPatch = await apiFetch(`${API_BASE}/vini/magazzino/${selectedVino.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            PREZZO_CALICE: prezzoCustom,
            PREZZO_CALICE_MANUALE: 1,
          }),
        });
        if (!resPatch.ok) {
          const err = await resPatch.json().catch(() => ({}));
          throw new Error(`Errore PATCH prezzo calice: ${err.detail || resPatch.status}`);
        }
      }

      // Compone nota: tag modalità + nota utente + eventuale extraNota (motivazione)
      const modTag = `[${modo}]`;
      const notaParts = [modTag];
      if (regNote.trim()) notaParts.push(regNote.trim());
      if (extraNota && extraNota.trim()) notaParts.push(`[MOTIV: ${extraNota.trim()}]`);
      const notaFinale = notaParts.join(" ");

      const payload = {
        tipo: "VENDITA",
        qta: qtaNum,
        locazione: regLoc,
        note: notaFinale,
      };
      if (usaGriglia && selectedCelle.length > 0) {
        payload.celle_matrice = selectedCelle.map(c => [c.riga, c.colonna]);
      }

      const res = await apiFetch(`${API_BASE}/vini/magazzino/${selectedVino.id}/movimenti`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || `Errore ${res.status}`);
      }

      const modInfo = MODALITA[modo];
      setSubmitMsg(`✅ ${modInfo.icon} ${modInfo.label} — ${qtaNum} bt di ${selectedVino.DESCRIZIONE}`);
      clearVino();
      setRegQta("1");
      setRegNote("");
      setTimeout(() => setSubmitMsg(""), 5000);
      onRegistrata?.({ vino: selectedVino, modalita: modo, qta: qtaNum });
    } catch (err) {
      setSubmitMsg(`❌ ${err.message}`);
    } finally {
      setSubmitting(false);
    }
  };

  const submitVendita = async (mod = null) => {
    // v1.1 (2026-11-06): accetto solo "BOTTIGLIA"/"CALICI". Vini › Vendite
    // passava l'evento del click come `mod`: la modalità diventava un oggetto,
    // la pagina andava in errore e la vendita al calice saltava il modale prezzo.
    if (!MODALITA[mod]) mod = null;
    const modo = mod || modalita;
    if (mod) setModalita(mod);
    if (!selectedVino) { avviso("❌ Scegli un vino dalla ricerca."); return; }
    const qtaNum = Number(regQta);
    if (!regQta || qtaNum <= 0) { avviso("❌ Scrivi una quantità valida (> 0)."); return; }
    if (!regLoc) { avviso("❌ Scegli da dove prendi la bottiglia."); return; }

    if (usaGriglia && selectedCelle.length === 0) {
      avviso("❌ Tocca nella griglia le bottiglie da togliere."); return;
    }

    // Intercetto: modalità CALICI su vino con VENDITA_CALICE != 'SI' e bottiglia
    // non ancora aperta → apri modale "Decidi prezzo calice" (sessione 2026-05-11).
    // Logica: è una scelta del sommelier, deve fissare lui il prezzo.
    const isCaliceNonStd =
      modo === "CALICI" &&
      selectedVino.VENDITA_CALICE !== 1 &&
      !selectedVino.BOTTIGLIA_APERTA;
    if (isCaliceNonStd) {
      setDecidiPrezzo({
        vino: selectedVino,
        defaultPrezzo: defaultPrezzoCalice(selectedVino),
        prezzoIniziale: prezzoCaliceSalvato(selectedVino),
      });
      return; // attende conferma utente nel modale, poi chiama eseguiVendita
    }

    await eseguiVendita({ mod: modo });
  };

  // Conferma del modale «Decidi prezzo calice» per una VENDITA al calice (non
  // per l'attivazione da residuo, che resta della pagina Vendite). Stessa
  // sequenza di prima: registro la vendita, poi apro la mescita col prezzo
  // manuale (best-effort, fix 2026-06-24 #1310).
  const confermaPrezzoCalice = async ({ prezzo, nota }) => {
    const vino = decidiPrezzo?.vino || selectedVino;
    setDecidiPrezzo(null);
    await eseguiVendita({ extraNota: nota, prezzoCustom: prezzo, mod: "CALICI" });
    try {
      const r = await apiFetch(`${API_BASE}/vini/magazzino/${vino.id}/bottiglia-aperta`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ BOTTIGLIA_APERTA: 1, PREZZO_CALICE: prezzo, PREZZO_CALICE_MANUALE: 1 }),
      });
      if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        throw new Error(err.detail || `Errore ${r.status}`);
      }
      onCaliceAttivato?.();
    } catch (err) {
      setSubmitMsg(prev =>
        `${prev || `✅ Vendita registrata`} ⚠ Attivazione mescita fallita: ${err.message}`
      );
      setTimeout(() => setSubmitMsg(""), 7000);
    }
  };

  return {
    searchText, setSearchText, suggestions, showSuggestions, setShowSuggestions,
    selectedVino, setSelectedVino, modalita, setModalita,
    regLoc, setRegLoc, regQta, setRegQta, regNote, setRegNote,
    submitting, submitMsg, setSubmitMsg, avviso,
    decidiPrezzo, setDecidiPrezzo, confermaPrezzoCalice,
    searchRef, suggestionsRef, scanOpen, setScanOpen,
    matriceStato, myCelleMatrice, selectedCelle, matriceLoading, usaGriglia, toggleCella,
    selectVino, onScan, clearVino, eseguiVendita, submitVendita,
  };
}
