// @version: v2.0 — su iPad e Mac tre zone affiancate (prenotazione · altri dettagli · sala col tavolo da toccare), persone e canale a pastiglie, Pranzo/Cena accanto agli orari, stato e riepilogo in fondo; sul telefono resta in colonna (2026-11-28); v1.13 — canale «Walk-in»: il nome non si chiede, va sulla scheda «Walk-in» (2026-11-28); v1.12-thefork — numero sconosciuto a TRGB ma noto a TheFork: nome, email e prossime prenotazioni da TheFork, «Usa questi dati» (2026-11-28); v1.11 — orari a 6 per riga senza testo che esce dalla casella, seggioloni dentro il riquadro (2026-11-26); v1.10-ordine — «Crea nuovo cliente» porta nei campi quello che era scritto nella ricerca (numero, email o nome); orari in griglia a caselle uguali con «Altro orario» a parte; tavolo a caselle per sala (libero, occupato, bloccato, suggerito; due tocchi = unione) al posto della tendina (2026-11-26); v1.9-thefork — copiato dal form di TheFork Manager: carico su ogni orario (arrivi e coperti in sala), durata sulla singola prenotazione, titolo e lingua del cliente nuovo, «apri WhatsApp con la conferma» al salvataggio (2026-11-26); v1.8-fonte — il form è la fonte: prefisso per paese, scheda riconosciuta da telefono o email mentre scrivi, persone della scheda («chi sta prenotando»), esito verso TheFork (2026-11-26); v1.7-telefono — su iPhone a tutto schermo con titolo e «Salva» sempre a vista, campi a 16 px (Safari non ingrandisce la pagina), orari e ± da pollice (2026-11-24); v1.6-stati — si nasce Confermata, In opzione (con «tenuto fino al») o in Lista d'attesa; in modifica la data dell'opzione (2026-11-13); v1.5-motore — «entra / non entra» col tavolo suggerito dal motore per tavoli, «Usa» lo scrive (anche le unioni) (2026-10-29); v1.4 — stesso form per modificare una prenotazione (prop «prenotazione», PUT) (2026-10-28); v1.3 — defaultCliente: aperto dalla scheda cliente con il cliente già scelto (2026-10-19); v1.2-fasce — slot chiusi/pieni segnati e avviso sulla fascia; v1.1-tavolo-turno — apribile dalla mappa con tavolo e turno già scelti; tavoli bloccati non selezionabili
// Modulo: prenotazioni
// Form modale per nuova prenotazione — modulo Prenotazioni TRGB
import React, { useState, useEffect, useRef } from "react";
import { API_BASE, apiFetch } from "../../config/api";
import SalaForm from "./components/SalaForm";
import { SCELTO } from "./components/statiPrenotazioni";

const CANALI = ["Telefono", "WhatsApp", "Walk-in", "Email", "Altro"];
// Chi è la persona che prenota per la scheda (facoltativo)
const RELAZIONI = ["", "moglie", "marito", "compagno/a", "figlio/a", "genitore", "segreteria", "altro"];
const OCCASIONI = ["", "Compleanno", "Anniversario", "Laurea", "Cresima", "Battesimo", "Cena aziendale", "Altro"];

// Nomi delle lingue dei clienti (il codice completo, es. en_GB, resta quello dell'elenco prefissi)
const NOMI_LINGUA = { it: "Italiano", en: "Inglese", fr: "Francese", de: "Tedesco", es: "Spagnolo", nl: "Olandese", pt: "Portoghese", pl: "Polacco", ru: "Russo", sv: "Svedese", da: "Danese", ja: "Giapponese", zh: "Cinese" };

export default function PrenotazioniForm({ defaultData, defaultTavolo, defaultTurno, defaultOra, defaultCliente, prenotazione, onClose, onSuccess }) {
  // Modifica (2026-10-28): con «prenotazione» il form parte dai suoi dati e salva con PUT
  const modifica = !!prenotazione;
  const P = prenotazione || {};
  const clienteIniziale = modifica && (P.cliente_id || P.nome || P.cognome)
    ? { id: P.cliente_id, nome: P.nome || "", cognome: P.cognome || "", telefono: P.telefono, visite_totali: P.visite_precedenti }
    : (defaultCliente || null);
  const [form, setForm] = useState({
    data_pasto: P.data_pasto || defaultData || new Date().toISOString().slice(0, 10),
    ora_pasto: (P.ora_pasto || "20:00").slice(0, 5),
    pax: P.pax || 2,
    canale: P.canale || "Telefono",
    tavolo: P.tavolo || defaultTavolo || "",
    nota_ristorante: P.nota_ristorante || "",
    nota_cliente: P.nota_cliente || "",
    occasione: P.occasione || "",
    allergie_segnalate: P.allergie_segnalate || "",
    tavolo_esterno: P.tavolo_esterno || 0,
    seggioloni: P.seggioloni || "",
    cliente_id: modifica ? (P.cliente_id ?? null) : (defaultCliente?.id ?? null),
    nuovo_nome: "",
    nuovo_cognome: "",
    nuovo_telefono: "",
    nuovo_email: "",
    nuovo_prefisso: "",
    nuovo_titolo: "",
    nuovo_lingua: "",
    persona_nome: "",
    persona_relazione: "",
    durata_min: P.durata_min || "",
    // 2026-11-13: stato di partenza e, per «In opzione», fino a quando si tiene il tavolo
    stato: "RECORDED",
    tenuto_fino_al: P.tenuto_fino_al || "",
  });
  const [giorniOpzione, setGiorniOpzione] = useState(null);

  const [slotPranzo, setSlotPranzo] = useState([]);
  const [slotCena, setSlotCena] = useState([]);
  const [soglia, setSoglia] = useState("15:00");
  const [searchQ, setSearchQ] = useState(clienteIniziale ? `${clienteIniziale.nome || ""} ${clienteIniziale.cognome || ""}`.trim() : "");
  const [searchResults, setSearchResults] = useState([]);
  const [selectedCliente, setSelectedCliente] = useState(clienteIniziale);
  const [showNuovo, setShowNuovo] = useState(false);
  const [tavoli, setTavoli] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  // 2026-11-26: prefissi per paese, schede riconosciute dal numero o dall'email, persone della scheda
  const [prefissi, setPrefissi] = useState({ locale: "+39", frequenti: [], altri: [] });
  const [riconosciuti, setRiconosciuti] = useState([]);
  // 2026-11-28 (Régis, TheFork): il numero che non è nelle nostre schede, TheFork lo conosce?
  const [suTheFork, setSuTheFork] = useState(null);
  const [persone, setPersone] = useState([]);
  const [nuovaPersona, setNuovaPersona] = useState(false);
  // Carico del turno per orario (arrivi e coperti in sala) e conferma WhatsApp al salvataggio
  const [carico, setCarico] = useState({ orari: [], capienza: 0, durata_regola: null });
  const [mandaConferma, setMandaConferma] = useState(false);
  const searchRef = useRef(null);
  const searchTimeout = useRef(null);

  // Carica config
  useEffect(() => {
    apiFetch(`${API_BASE}/prenotazioni/config`)
      .then((r) => r.json())
      .then((d) => {
        const cfg = {};
        d.config.forEach((c) => { cfg[c.chiave] = c.valore; });
        try { setSlotPranzo(JSON.parse(cfg.slot_pranzo || "[]")); } catch { setSlotPranzo([]); }
        try { setSlotCena(JSON.parse(cfg.slot_cena || "[]")); } catch { setSlotCena([]); }
        setSoglia(cfg.soglia_pranzo_cena || "15:00");
        setGiorniOpzione(cfg.opzione_giorni_default || null);
        // Aperto dalla mappa: primo orario del turno scelto
        if (defaultTurno && !modifica) {
          let slots = [];
          try { slots = JSON.parse((defaultTurno === "pranzo" ? cfg.slot_pranzo : cfg.slot_cena) || "[]"); } catch { slots = []; }
          // dalla vista Servizio arriva anche l'ora che si stava guardando
          if (defaultOra) setForm((f) => ({ ...f, ora_pasto: defaultOra }));
          else if (slots.length) setForm((f) => ({ ...f, ora_pasto: slots[0] }));
        }
      })
      .catch(() => {});
  }, []);

  // Carica tavoli disponibili
  useEffect(() => {
    const turno = form.ora_pasto < soglia ? "pranzo" : "cena";
    apiFetch(`${API_BASE}/prenotazioni/tavoli/disponibili/${form.data_pasto}/${turno}`)
      .then((r) => r.json())
      .then((d) => setTavoli(d.tavoli || []))
      .catch(() => setTavoli([]));
  }, [form.data_pasto, form.ora_pasto, soglia]);

  // Autocomplete clienti
  useEffect(() => {
    if (searchQ.length < 2) { setSearchResults([]); return; }
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    searchTimeout.current = setTimeout(() => {
      apiFetch(`${API_BASE}/prenotazioni/clienti/search?q=${encodeURIComponent(searchQ)}`)
        .then((r) => r.json())
        .then((d) => setSearchResults(d.clienti || []))
        .catch(() => setSearchResults([]));
    }, 300);
  }, [searchQ]);

  useEffect(() => {
    apiFetch(`${API_BASE}/prenotazioni/prefissi/`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d) setPrefissi(d); })
      .catch(() => {});
  }, []);

  // Riconoscimento: il numero (o l'email) che sto scrivendo è già di una scheda?
  const cifreCerca = searchQ.replace(/\D/g, "");
  const telDaCercare = showNuovo ? form.nuovo_telefono : (cifreCerca.length >= 6 ? searchQ : "");
  const emailDaCercare = showNuovo ? form.nuovo_email : (searchQ.includes("@") ? searchQ.trim() : "");
  useEffect(() => {
    if (selectedCliente || modifica) { setRiconosciuti([]); return; }
    const haTel = (telDaCercare || "").replace(/\D/g, "").length >= 6;
    const haMail = /.+@.+\..+/.test(emailDaCercare || "");
    if (!haTel && !haMail) { setRiconosciuti([]); return; }
    const q = new URLSearchParams();
    if (haTel) q.set("telefono", telDaCercare);
    if (haMail) q.set("email", emailDaCercare);
    if (form.nuovo_prefisso) q.set("prefisso", form.nuovo_prefisso);
    const t = setTimeout(() => {
      apiFetch(`${API_BASE}/prenotazioni/clienti/riconosci?${q}`)
        .then((r) => (r.ok ? r.json() : { clienti: [] }))
        .then((d) => setRiconosciuti(d.clienti || []))
        .catch(() => setRiconosciuti([]));
    }, 350);
    return () => clearTimeout(t);
  }, [telDaCercare, emailDaCercare, form.nuovo_prefisso, selectedCliente, modifica]);

  // Lo stesso numero su TheFork (nome, email, prossime prenotazioni). Priorità al nostro sistema (Marco 28/11):
  // si chiede a TheFork SOLO se il numero non è già di una scheda TRGB; i dati di TheFork riempiono solo i campi vuoti.
  const numeroGiaNostro = riconosciuti.some((c) => c.riconosciuto_da === "telefono");
  useEffect(() => {
    const cifre = (telDaCercare || "").replace(/\D/g, "");
    if (selectedCliente || modifica || numeroGiaNostro || cifre.length < 8) { setSuTheFork(null); return; }
    const q = new URLSearchParams({ telefono: telDaCercare });
    if (form.nuovo_prefisso) q.set("prefisso", form.nuovo_prefisso);
    const t = setTimeout(() => {
      apiFetch(`${API_BASE}/prenotazioni/clienti/thefork?${q}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => setSuTheFork(d && d.trovato ? d : null))
        .catch(() => setSuTheFork(null));
    }, 700);
    return () => clearTimeout(t);
  }, [telDaCercare, form.nuovo_prefisso, selectedCliente, modifica, numeroGiaNostro]);
  const mostraTheFork = suTheFork && !numeroGiaNostro;

  const usaDatiTheFork = () => {
    if (!suTheFork) return;
    if (suTheFork.scheda) { selezionaCliente(suTheFork.scheda); setSuTheFork(null); return; }
    const c = suTheFork.cliente || {};
    setForm((f) => ({
      ...f,
      nuovo_nome: f.nuovo_nome || (c.nome && c.nome !== "-" ? c.nome : ""),
      nuovo_cognome: f.nuovo_cognome || (c.cognome && c.cognome !== "-" ? c.cognome : ""),
      nuovo_email: f.nuovo_email || c.email || "",
      nuovo_telefono: f.nuovo_telefono || telDaCercare || "",
    }));
    setShowNuovo(true);
  };

  // Persone della scheda scelta (chi può prenotare con quel numero)
  useEffect(() => {
    if (!selectedCliente?.id || modifica) { setPersone([]); return; }
    if (selectedCliente.persone) { setPersone(selectedCliente.persone); return; }
    apiFetch(`${API_BASE}/prenotazioni/clienti/${selectedCliente.id}/persone`)
      .then((r) => (r.ok ? r.json() : { persone: [] }))
      .then((d) => setPersone(d.persone || []))
      .catch(() => setPersone([]));
  }, [selectedCliente?.id, modifica]); // eslint-disable-line react-hooks/exhaustive-deps

  const scegliPersona = (nome, relazione = "") => {
    setNuovaPersona(false);
    setForm((f) => ({ ...f, persona_nome: nome, persona_relazione: relazione }));
  };

  const turnoCorrente = form.ora_pasto < soglia ? "pranzo" : "cena";

  // Fasce del giorno (aperta, limiti): avvisano, non bloccano — decide chi prende la prenotazione
  const [fasce, setFasce] = useState([]);
  useEffect(() => {
    apiFetch(`${API_BASE}/prenotazioni/fasce/${form.data_pasto}/${turnoCorrente}`)
      .then((r) => (r.ok ? r.json() : { fasce: [] }))
      .then((d) => setFasce(d.fasce || []))
      .catch(() => setFasce([]));
  }, [form.data_pasto, turnoCorrente]);
  const fasciaDi = (ora) => {
    let scelta = null;
    for (const f of fasce) if (f.ora <= ora) scelta = f;
    return scelta || fasce[0] || null;
  };
  const fasciaGrezza = fasciaDi(form.ora_pasto);
  // In modifica la prenotazione stessa è già contata nella sua fascia: non va contata due volte
  const fasciaScelta = fasciaGrezza && modifica && P.data_pasto === form.data_pasto
    && fasciaDi((P.ora_pasto || "").slice(0, 5))?.ora === fasciaGrezza.ora
    ? { ...fasciaGrezza, coperti: Math.max(0, fasciaGrezza.coperti - (P.pax || 0)) }
    : fasciaGrezza;
  const avvisoFascia = !fasciaScelta ? null
    : !fasciaScelta.aperta ? `La fascia delle ${fasciaScelta.ora} è chiusa`
    : fasciaScelta.max_coperti != null && fasciaScelta.coperti + form.pax > fasciaScelta.max_coperti
      ? `Fascia delle ${fasciaScelta.ora}: ${fasciaScelta.coperti} coperti già prenotati su ${fasciaScelta.max_coperti}, con questa diventano ${fasciaScelta.coperti + form.pax}`
    : null;
  const slotCorrente = turnoCorrente === "pranzo" ? slotPranzo : slotCena;

  useEffect(() => {
    apiFetch(`${API_BASE}/prenotazioni/carico/${form.data_pasto}/${turnoCorrente}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setCarico(d || { orari: [], capienza: 0, durata_regola: null }))
      .catch(() => setCarico({ orari: [], capienza: 0, durata_regola: null }));
  }, [form.data_pasto, turnoCorrente]);
  // Passi di 30 minuti attorno alla durata di regola del turno, più «tutto il turno»
  const durateScelta = (() => {
    const base = carico.durata_regola || 0;
    if (!base) return [];
    const out = [];
    for (let m = Math.max(30, base - 60); m <= base + 90; m += 30) if (m !== base) out.push(m);
    return out;
  })();
  // Lingue proposte: quelle dei paesi dell'elenco prefissi; quella del prefisso scelto è la proposta
  const tuttiPrefissi = [...prefissi.frequenti, ...prefissi.altri];
  const linguaDalPrefisso = (tuttiPrefissi.find((p) => p.prefisso === (form.nuovo_prefisso || prefissi.locale)) || {}).lingua || "";
  const lingueScelta = (() => {
    const viste = new Set(); const out = [];
    for (const p of tuttiPrefissi) {
      const corta = (p.lingua || "").slice(0, 2);
      if (corta && NOMI_LINGUA[corta] && !viste.has(corta)) { viste.add(corta); out.push(p.lingua); }
    }
    return out;
  })();
  const oreMin = (m) => `${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60} min` : ""}`;

  // Motore per tavoli: la prenotazione entra senza lasciare fuori nessuno? Su quale tavolo?
  const [posto, setPosto] = useState(null);
  useEffect(() => {
    if (!form.data_pasto || !form.ora_pasto || !form.pax) { setPosto(null); return; }
    const q = new URLSearchParams({ data: form.data_pasto, turno: turnoCorrente, pax: form.pax, ora: form.ora_pasto });
    if (form.durata_min) q.set("durata", form.durata_min);
    if (modifica && P.id) q.set("escludi_id", P.id);
    const t = setTimeout(() => {
      apiFetch(`${API_BASE}/prenotazioni/motore/verifica?${q}`)
        .then((r) => (r.ok ? r.json() : null))
        .then(setPosto)
        .catch(() => setPosto(null));
    }, 300);
    return () => clearTimeout(t);
  }, [form.data_pasto, form.ora_pasto, form.pax, form.durata_min, turnoCorrente]); // eslint-disable-line react-hooks/exhaustive-deps
  const tavoloProposto = posto && posto.entra && posto.tavolo ? posto.tavolo.tavoli.join("+") : "";

  // «Crea nuovo cliente»: quello che era scritto nella ricerca passa nei campi giusti
  // (un numero nel telefono, un'email nell'email, un nome in nome e cognome), senza coprire ciò che c'è già
  const apriNuovoCliente = () => {
    const q = searchQ.trim();
    const nuovo = {};
    if (q.includes("@")) {
      if (!form.nuovo_email) nuovo.nuovo_email = q;
    } else if (/^[+\d][\d\s./()-]{4,}$/.test(q)) {
      if (!form.nuovo_telefono) nuovo.nuovo_telefono = q;
    } else if (q) {
      const parti = q.split(/\s+/);
      if (!form.nuovo_nome && !form.nuovo_cognome) {
        if (parti.length > 1) { nuovo.nuovo_nome = parti[0]; nuovo.nuovo_cognome = parti.slice(1).join(" "); }
        else nuovo.nuovo_cognome = parti[0];
      }
    }
    if (Object.keys(nuovo).length) setForm({ ...form, ...nuovo });
    setShowNuovo(true);
  };

  // Scelta del tavolo a caselle: form.tavolo resta la stringa di sempre («3» o «1+2»)
  const tavoliScelti = (form.tavolo || "").split("+").map((x) => x.trim()).filter(Boolean);
  const propostiSet = new Set(tavoloProposto ? tavoloProposto.split("+") : []);
  const toggleTavolo = (nome) => {
    const nuovi = tavoliScelti.includes(nome) ? tavoliScelti.filter((x) => x !== nome) : [...tavoliScelti, nome];
    setForm({ ...form, tavolo: nuovi.join("+") });
  };
  const postiScelti = tavoliScelti.reduce((tot, n) => tot + ((tavoli.find((t) => t.nome === n) || {}).posti_max || 0), 0);
  const zoneTavoli = (() => {
    const z = new Map();
    for (const t of tavoli) { const k = t.zona || "Sala"; if (!z.has(k)) z.set(k, []); z.get(k).push(t); }
    // un tavolo scritto sulla prenotazione che oggi non è in elenco resta visibile
    const fuori = tavoliScelti.filter((n) => !tavoli.some((t) => t.nome === n));
    if (fuori.length) z.set("Altro", fuori.map((n) => ({ nome: n })));
    return [...z.entries()];
  })();

  const selezionaCliente = (c) => {
    setSelectedCliente(c);
    setForm({ ...form, cliente_id: c.id });
    setSearchQ(`${c.nome} ${c.cognome}`);
    setSearchResults([]);
    setShowNuovo(false);
    setRiconosciuti([]);
    setNuovaPersona(false);
  };

  const resetCliente = () => {
    setSelectedCliente(null);
    setForm({ ...form, cliente_id: null, nuovo_nome: "", nuovo_cognome: "", nuovo_telefono: "", nuovo_email: "", persona_nome: "", persona_relazione: "" });
    setPersone([]);
    setNuovaPersona(false);
    setSearchQ("");
    setShowNuovo(false);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!modifica && !form.cliente_id && !form.nuovo_cognome && form.canale !== "Walk-in") {
      alert("Seleziona un cliente o inserisci i dati per crearne uno nuovo.");
      return;
    }
    setSubmitting(true);
    // La finestra di WhatsApp si apre subito (prima delle chiamate), altrimenti il browser la blocca
    const finestraWa = !modifica && mandaConferma ? window.open("", "_blank") : null;
    try {
      const r = modifica
        ? await apiFetch(`${API_BASE}/prenotazioni/${P.id}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              data_pasto: form.data_pasto, ora_pasto: form.ora_pasto, pax: form.pax, tavolo: form.tavolo,
              canale: form.canale, nota_ristorante: form.nota_ristorante, nota_cliente: form.nota_cliente,
              occasione: form.occasione, allergie_segnalate: form.allergie_segnalate,
              tavolo_esterno: form.tavolo_esterno, seggioloni: form.seggioloni,
              ...((form.durata_min || "") !== (P.durata_min || "") ? { durata_min: Number(form.durata_min) || 0 } : {}),
              ...(form.cliente_id && form.cliente_id !== P.cliente_id ? { cliente_id: form.cliente_id } : {}),
              ...(P.stato === "OPTION" && (form.tenuto_fino_al || "") !== (P.tenuto_fino_al || "") ? { tenuto_fino_al: form.tenuto_fino_al } : {}),
            }),
          })
        : await apiFetch(`${API_BASE}/prenotazioni/`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ...form, durata_min: Number(form.durata_min) || null, tenuto_fino_al: form.stato === "OPTION" ? (form.tenuto_fino_al || null) : null }),
          });
      if (r.ok) {
        const d = await r.json().catch(() => ({}));
        if (finestraWa) {
          try {
            const rw = await apiFetch(`${API_BASE}/prenotazioni/${d.id}/wa-link?tipo=conferma`);
            const dw = await rw.json();
            if (rw.ok && dw.link) {
              finestraWa.location.href = dw.link;
              await apiFetch(`${API_BASE}/prenotazioni/${d.id}/inviato?tipo=conferma`, { method: "POST" });
            } else {
              finestraWa.close();
              alert(`Prenotazione salvata, ma la conferma WhatsApp non si può aprire: ${dw.detail || "manca il telefono"}`);
            }
          } catch { finestraWa.close(); }
        }
        const tfk = d.thefork || {};
        if (tfk.stato === "da_mandare") alert("Prenotazione salvata. Su TheFork non è ancora partita (orario non prenotabile online): TRGB riprova da solo.");
        else if (tfk.stato === "no") alert(`Prenotazione salvata, ma resta solo in TRGB: ${tfk.nota || "non può andare su TheFork"}.`);
        else if (tfk.stato === "errore") alert(`Prenotazione salvata in TRGB, ma TheFork l'ha rifiutata: ${tfk.nota || ""}`);
        onSuccess(d);
      } else {
        if (finestraWa) finestraWa.close();
        const err = await r.json();
        alert(err.detail || (modifica ? "Errore nella modifica" : "Errore nella creazione"));
      }
    } catch {
      if (finestraWa) finestraWa.close();
      alert("Errore di connessione");
    }
    setSubmitting(false);
  };

  // Pezzi del form che compaiono in due punti secondo lo schermo (telefono: in colonna; iPad e Mac: tre zone)
  const bloccoStato = (
            <div>
              <label className="block text-xs font-medium text-neutral-600 mb-1">Stato</label>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { v: "RECORDED", l: "📅 Prenotato", on: "bg-indigo-600 text-white border-indigo-600" },
                  { v: "OPTION", l: "⏳ In opzione", on: "bg-amber-500 text-white border-amber-500" },
                  { v: "WAITLIST", l: "🕰️ Lista d'attesa", on: "bg-violet-500 text-white border-violet-500" },
                ].map((o) => (
                  <button key={o.v} type="button" onClick={() => setForm({ ...form, stato: o.v })}
                    className={`px-2 py-2 rounded-lg border text-xs font-medium min-h-[44px] ${form.stato === o.v ? o.on : "bg-white border-neutral-300 text-neutral-700 hover:bg-neutral-50"}`}>
                    {o.l}
                  </button>
                ))}
              </div>
              {form.stato === "OPTION" && (
                <div className="mt-2 flex items-center gap-2 text-xs text-amber-900">
                  <label>Tavolo tenuto fino al</label>
                  <input type="date" value={form.tenuto_fino_al} max={form.data_pasto}
                    onChange={(e) => setForm({ ...form, tenuto_fino_al: e.target.value })}
                    className="px-2 py-1 border border-amber-300 rounded-lg min-h-[36px] max-sm:min-h-[44px] max-sm:text-base" />
                  {!form.tenuto_fino_al && <span className="text-amber-700">vuoto = {giorniOpzione ? `tra ${giorniOpzione} giorni` : "proposta delle impostazioni"}</span>}
                </div>
              )}
              {form.stato === "WAITLIST" && (
                <div className="mt-2 text-xs text-violet-800">Non occupa tavoli: se nel turno si libera un posto arriva l'avviso nel campanello.</div>
              )}
            </div>
  );
  const elencoTavoli = (
            <div className="sm:col-span-2">
              <div className="flex items-baseline justify-between gap-2 mb-1">
                <label className="block text-xs font-medium text-neutral-600">
                  Tavolo{tavoliScelti.length > 0 && <span className="ml-1 text-neutral-900 font-semibold">{tavoliScelti.join(" + ")}{postiScelti ? ` · ${postiScelti} posti` : ""}</span>}
                </label>
                {tavoliScelti.length > 0
                  ? <button type="button" onClick={() => setForm({ ...form, tavolo: "" })} className="text-xs text-indigo-600 hover:underline">Assegna dopo</button>
                  : <span className="text-xs text-neutral-400">nessuno: si assegna dopo</span>}
              </div>
              {/* Un tocco sceglie, un altro tocco su un secondo tavolo li unisce */}
              <div className="space-y-2 rounded-lg border border-neutral-200 p-2">
                {zoneTavoli.map(([zona, lista]) => (
                  <div key={zona} className="flex items-start gap-2">
                    <span className="w-16 flex-shrink-0 pt-2 text-[11px] uppercase tracking-wide text-neutral-400 truncate" title={zona}>{zona}</span>
                    <div className="grid grid-cols-5 sm:grid-cols-8 gap-1.5 flex-1">
                      {lista.map((t) => {
                        const scelto = tavoliScelti.includes(t.nome);
                        const suo = modifica && (P.tavolo || "").split("+").map((x) => x.trim()).includes(t.nome);
                        const fermo = (t.occupato || t.bloccato) && !suo && !scelto;
                        const proposto = !scelto && propostiSet.has(t.nome);
                        return (
                          <button
                            key={t.nome}
                            type="button"
                            disabled={fermo}
                            onClick={() => toggleTavolo(t.nome)}
                            title={t.bloccato ? "Bloccato" : t.occupato && !suo ? "Occupato in questo turno" : proposto ? "Suggerito" : `${t.posti_min}-${t.posti_max} posti`}
                            className={`w-full px-1 py-1 rounded-lg border text-sm tabular-nums transition max-sm:min-h-[44px] ${
                              scelto ? "bg-indigo-900 text-white border-indigo-900"
                              : fermo ? "bg-neutral-100 text-neutral-400 border-neutral-200"
                              : proposto ? "bg-emerald-50 text-emerald-800 border-emerald-400"
                              : "bg-white text-neutral-700 border-neutral-300 hover:bg-neutral-50"
                            }`}
                          >
                            <span className={`block font-medium ${fermo && t.occupato ? "line-through" : ""}`}>{t.nome}</span>
                            <span className={`block text-[10px] leading-tight ${scelto ? "text-indigo-100" : fermo ? "text-neutral-400" : "text-neutral-400"}`}>
                              {t.bloccato && !suo ? "blocc." : t.occupato && !suo ? "occup." : t.posti_max ? `${t.posti_max} p` : "\u00a0"}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
                {zoneTavoli.length === 0 && <div className="text-xs text-neutral-400 px-1 py-1">Nessun tavolo per questo turno.</div>}
              </div>
            </div>
  );
  const dataBreve = (() => { try { return new Date(form.data_pasto + "T12:00").toLocaleDateString("it-IT", { weekday: "short", day: "numeric", month: "short" }); } catch { return form.data_pasto; } })();
  const testoSalva = submitting ? "Salvataggio..." : modifica ? "Salva modifiche"
    : form.stato === "OPTION" ? "Metti in opzione" : form.stato === "WAITLIST" ? "Aggiungi alla lista d'attesa" : "Crea prenotazione";

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-start justify-center sm:pt-8 lg:pt-3 overflow-y-auto overscroll-contain">
      {/* Telefono: tutto schermo, titolo e tasti fissi. Da sm in su: la finestra di sempre */}
      <div className="bg-white shadow-2xl w-full min-h-full sm:min-h-0 sm:rounded-2xl sm:max-w-lg sm:mx-4 sm:mb-8 lg:max-w-[1200px] lg:mb-3 lg:h-[calc(100vh_-_1.5rem)] lg:flex lg:flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-4 sm:px-5 py-3 border-b border-neutral-200 max-sm:sticky max-sm:top-0 max-sm:z-20 bg-white sm:rounded-t-2xl">
          <h2 className="text-lg font-bold text-neutral-800">{modifica ? "Modifica prenotazione" : "Nuova Prenotazione"}</h2>
          <button type="button" onClick={onClose} aria-label="Chiudi" className="text-neutral-400 hover:text-neutral-600 text-xl max-sm:min-w-[44px] max-sm:min-h-[44px] max-sm:-mr-2">✕</button>
        </div>

        <form onSubmit={handleSubmit} className="lg:flex lg:flex-col lg:flex-1 lg:min-h-0">
          <div className="p-4 sm:p-5 lg:p-0 flex flex-col gap-4 lg:gap-0 lg:flex-row lg:flex-1 lg:min-h-0">
          {/* 1 — la prenotazione: persone, giorno, ora, cliente, canale */}
          <div className="space-y-4 lg:w-[350px] lg:flex-shrink-0 lg:p-5 lg:border-r lg:border-neutral-200 lg:overflow-y-auto">
          {modifica && P.thefork_booking_id && (
            <div className="px-3 py-2 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-xs">
              Arriva da TheFork: giorno, ora e persone cambiali anche in TheFork Manager, altrimenti al prossimo
              aggiornamento da TheFork tornano come lì. Nota staff, occasione, tavolo, allergie e lo stato «In opzione» restano quelli di TRGB.
            </div>
          )}
          {!modifica && <div className="lg:hidden">{bloccoStato}</div>}
          {modifica && P.stato === "OPTION" && (
            <div className="flex items-center gap-2 text-xs text-amber-900 px-3 py-2 rounded-lg bg-amber-50 border border-dashed border-amber-300">
              <span>⏳ In opzione — tavolo tenuto fino al</span>
              <input type="date" value={form.tenuto_fino_al} max={form.data_pasto}
                onChange={(e) => setForm({ ...form, tenuto_fino_al: e.target.value })}
                className="px-2 py-1 border border-amber-300 rounded-lg bg-white min-h-[36px] max-sm:min-h-[44px] max-sm:text-base" />
            </div>
          )}

          {/* Persone: a pastiglie (come su TheFork Manager), oltre le 8 con più e meno */}
          <div>
            <span className="block text-xs font-medium text-neutral-600 mb-1">Persone</span>
            <div className="grid grid-cols-9 gap-1">
              {[1, 2, 3, 4, 5, 6, 7, 8].map((n) => (
                <button key={n} type="button" onClick={() => setForm({ ...form, pax: n })} aria-pressed={form.pax === n}
                  className={`min-h-[44px] rounded-lg border text-base font-medium tabular-nums ${form.pax === n ? SCELTO : "bg-white border-neutral-300 text-neutral-800 hover:bg-neutral-50"}`}>{n}</button>
              ))}
              <button type="button" aria-label="Più di otto persone" aria-pressed={form.pax > 8}
                onClick={() => setForm({ ...form, pax: Math.min(50, Math.max(9, form.pax + 1)) })}
                className={`min-h-[44px] rounded-lg border text-base font-medium tabular-nums ${form.pax > 8 ? SCELTO : "bg-white border-neutral-300 text-neutral-800 hover:bg-neutral-50"}`}>{form.pax > 8 ? form.pax : "+"}</button>
            </div>
            {form.pax > 8 && (
              <div className="mt-1 flex items-center gap-2 text-sm text-neutral-700">
                <button type="button" aria-label="Una persona in meno" onClick={() => setForm({ ...form, pax: form.pax - 1 })} className="w-11 h-11 rounded-lg border border-neutral-300 text-lg hover:bg-neutral-50">−</button>
                <span><strong>{form.pax}</strong> persone</span>
                <button type="button" aria-label="Una persona in più" onClick={() => setForm({ ...form, pax: Math.min(50, form.pax + 1) })} className="w-11 h-11 rounded-lg border border-neutral-300 text-lg hover:bg-neutral-50">+</button>
              </div>
            )}
          </div>
          {/* Data e Ora: una sotto l'altra, gli orari in griglia a caselle uguali */}
          <div className="grid grid-cols-1 gap-3">
            <div>
              <label className="block text-xs font-medium text-neutral-600 mb-1">Data</label>
              <input
                type="date"
                value={form.data_pasto}
                onChange={(e) => setForm({ ...form, data_pasto: e.target.value })}
                className="w-full sm:w-64 px-3 py-2 border border-neutral-300 rounded-lg text-base sm:text-sm max-sm:min-h-[44px]"
                required
              />
            </div>
            <div>
              <div className="flex items-center justify-between gap-2 mb-1">
                <span className="block text-xs font-medium text-neutral-600">Ora{carico.capienza ? <span className="font-normal text-neutral-500"> · coperti in sala su {carico.capienza}</span> : null}</span>
                <span className="flex gap-1">
                  {[["pranzo", "Pranzo", slotPranzo], ["cena", "Cena", slotCena]].map(([k, nome, slots]) => (
                    <button key={k} type="button" disabled={!slots.length}
                      onClick={() => { if (turnoCorrente !== k && slots.length) setForm({ ...form, ora_pasto: slots[0] }); }}
                      className={`px-3 min-h-[36px] max-sm:min-h-[44px] rounded-lg border text-xs font-medium ${turnoCorrente === k ? SCELTO : "bg-white border-neutral-300 text-neutral-700 hover:bg-neutral-50"}`}>
                      {nome}
                    </button>
                  ))}
                </span>
              </div>
              <div className="grid grid-cols-4 sm:grid-cols-6 lg:grid-cols-4 gap-1.5">
                {slotCorrente.map((s) => {
                  const f = fasce.find((x) => x.ora === s);
                  const chiusa = f && !f.aperta;
                  const piena = f && f.piena;
                  // Carico a quell'ora: quanti arrivano e quanti sono già in sala (come su TheFork Manager)
                  const c = carico.orari.find((x) => x.ora === s);
                  const descr = c ? `${c.arrivi} in arrivo a quest'ora · ${c.coperti} coperti in sala${carico.capienza ? ` su ${carico.capienza}` : ""}` : "";
                  return (
                    <button
                      key={s}
                      type="button"
                      title={[chiusa ? "Fascia chiusa" : piena ? `Fascia piena (${f.coperti}/${f.max_coperti})` : "", descr].filter(Boolean).join(" — ")}
                      onClick={() => setForm({ ...form, ora_pasto: s })}
                      className={`w-full px-1 py-1.5 text-sm rounded-lg border transition tabular-nums max-sm:min-h-[48px] ${
                        form.ora_pasto === s
                          ? "bg-indigo-900 text-white border-indigo-900"
                          : chiusa ? "bg-neutral-100 text-neutral-400 border-neutral-200 line-through"
                          : piena ? "bg-red-50 text-red-700 border-red-200"
                          : "bg-white text-neutral-600 border-neutral-300 hover:bg-neutral-50"
                      }`}
                    >
                      <span className="block font-medium">{s}</span>
                      <span className={`block text-[10px] leading-tight font-normal whitespace-nowrap ${form.ora_pasto === s ? "text-indigo-100" : "text-neutral-400"}`}>
                        {c ? `+${c.arrivi} · ${c.coperti}` : "\u00a0"}
                      </span>
                    </button>
                  );
                })}
              </div>
              <div className="mt-2 flex items-center justify-between gap-2 flex-wrap">
                <label className="flex items-center gap-2 text-xs text-neutral-600">
                  Altro orario
                  <input
                    type="time"
                    value={form.ora_pasto}
                    onChange={(e) => setForm({ ...form, ora_pasto: e.target.value })}
                    className="px-2 py-1.5 text-base sm:text-sm border border-neutral-300 rounded-lg w-28 max-sm:min-h-[44px]"
                  />
                </label>
                {carico.orari.length > 0 && (
                  <span className="text-[11px] text-neutral-500">sotto l'ora: +arrivi · coperti in sala{carico.capienza ? ` (su ${carico.capienza})` : ""}</span>
                )}
              </div>
            </div>
          </div>

          {avvisoFascia && (
            <div className="px-3 py-2 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-xs">⚠️ {avvisoFascia}. Puoi inserirla lo stesso.</div>
          )}
          {/* Cliente autocomplete */}
          <div>
            <label className="block text-xs font-medium text-neutral-600 mb-1">Cliente</label>
            {selectedCliente ? (
              <div className="flex items-center justify-between bg-indigo-50 border border-indigo-200 rounded-lg px-3 py-2">
                <div>
                  <span className="font-medium text-indigo-900">{selectedCliente.nome} {selectedCliente.cognome}</span>
                  {selectedCliente.telefono && <span className="ml-2 text-sm text-neutral-500">{selectedCliente.telefono}</span>}
                  {selectedCliente.vip === 1 && <span className="ml-1">⭐</span>}
                  <span className="ml-2 text-xs text-neutral-400">{selectedCliente.visite_totali} visite</span>
                </div>
                <button type="button" onClick={resetCliente} className="text-neutral-400 hover:text-red-500">✕</button>
              </div>
            ) : (
              <div className="relative" ref={searchRef}>
                <input
                  type="text"
                  value={searchQ}
                  onChange={(e) => setSearchQ(e.target.value)}
                  placeholder="Cerca per nome, cognome, telefono..."
                  className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-base sm:text-sm max-sm:min-h-[44px]"
                />
                {searchResults.length > 0 && (
                  <div className="absolute z-10 w-full mt-1 bg-white border border-neutral-200 rounded-lg shadow-lg max-h-48 max-sm:max-h-64 overflow-y-auto">
                    {searchResults.map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => selezionaCliente(c)}
                        className="w-full px-3 py-2 max-sm:py-3 text-left hover:bg-indigo-50 text-sm border-b border-neutral-100 last:border-0"
                      >
                        <span className="font-medium">{c.nome} {c.cognome}</span>
                        {c.telefono && <span className="ml-2 text-neutral-400">{c.telefono}</span>}
                        {c.vip === 1 && <span className="ml-1">⭐</span>}
                        <span className="ml-2 text-xs text-neutral-400">{c.visite_totali}v</span>
                        {c.allergie && <span className="ml-1 text-xs text-red-500">⚠️</span>}
                      </button>
                    ))}
                  </div>
                )}
                {!showNuovo && searchQ.length >= 2 && (
                  <button
                    type="button"
                    onClick={apriNuovoCliente}
                    className="mt-1 text-xs max-sm:text-sm max-sm:py-2 text-indigo-600 hover:underline"
                  >
                    + Crea nuovo cliente
                  </button>
                )}
              </div>
            )}

            {/* 2026-11-26 — il numero o l'email che sto scrivendo sono già di una scheda */}
            {!selectedCliente && !modifica && riconosciuti.length > 0 && (
              <div className="mt-2 p-3 bg-indigo-50 border border-indigo-200 rounded-lg space-y-2">
                {riconosciuti.map((c) => (
                  <div key={c.id} className="flex flex-wrap items-center justify-between gap-2">
                    <div className="text-sm text-indigo-900">
                      <strong>Questo {c.riconosciuto_da === "email" ? "indirizzo" : "numero"} è della scheda {c.nome} {c.cognome}</strong>
                      <span className="ml-2 text-xs text-indigo-700">{c.visite_totali} visite{c.ultima_visita ? ` · ultima ${c.ultima_visita.split("-").reverse().join("/")}` : ""}</span>
                    </div>
                    <button type="button" onClick={() => selezionaCliente(c)}
                      className="min-h-[44px] px-3 rounded-lg bg-brand-blue text-white text-sm font-medium hover:bg-blue-700">
                      Usa questa scheda
                    </button>
                  </div>
                ))}
                <div className="text-xs text-indigo-700">Se chiama un'altra persona (moglie, figlio, segreteria) scegli la scheda e poi indica chi sta prenotando.</div>
              </div>
            )}

            {/* 2026-11-28 — non è nelle nostre schede ma TheFork lo conosce: nome ed email pronti */}
            {!selectedCliente && !modifica && mostraTheFork && (
              <div className="mt-2 p-3 bg-indigo-50 border border-indigo-200 rounded-lg space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="text-sm text-indigo-900">
                    <strong>Su TheFork questo numero è di {[suTheFork.cliente?.nome, suTheFork.cliente?.cognome].filter((x) => x && x !== "-").join(" ") || "un cliente senza nome"}</strong>
                    {suTheFork.cliente?.email && <span className="ml-2 text-xs text-indigo-700">{suTheFork.cliente.email}</span>}
                    {suTheFork.scheda && <span className="ml-2 text-xs text-indigo-700">· in TRGB è la scheda {suTheFork.scheda.nome} {suTheFork.scheda.cognome}</span>}
                  </div>
                  <button type="button" onClick={usaDatiTheFork}
                    className="min-h-[44px] px-3 rounded-lg bg-brand-blue text-white text-sm font-medium hover:bg-blue-700">
                    {suTheFork.scheda ? "Usa questa scheda" : "Usa questi dati"}
                  </button>
                </div>
                {(suTheFork.prossime || []).length > 0 && (
                  <div className="px-2 py-1.5 bg-amber-50 border border-amber-200 rounded text-xs text-amber-800">
                    Ha già {suTheFork.prossime.length === 1 ? "una prenotazione" : `${suTheFork.prossime.length} prenotazioni`}:{" "}
                    {suTheFork.prossime.map((p) => `${(p.data || "").split("-").reverse().join("/")} ${p.ora || ""}${p.prenotazione_id ? "" : " (solo su TheFork)"}`).join(" · ")}
                  </div>
                )}
              </div>
            )}

            {/* Chi sta prenotando: il titolare o una persona della scheda */}
            {selectedCliente && !modifica && (
              <div className="mt-2 p-3 bg-neutral-50 border border-neutral-200 rounded-lg space-y-2">
                <div className="text-xs font-medium text-neutral-600">Chi sta prenotando?</div>
                <div className="flex flex-wrap gap-2">
                  <button type="button" onClick={() => scegliPersona("")}
                    className={`min-h-[44px] px-3 rounded-lg text-sm border ${!form.persona_nome && !nuovaPersona ? "border-indigo-600 bg-white font-semibold text-indigo-900" : "border-neutral-300 bg-white text-neutral-700"}`}>
                    {selectedCliente.nome} {selectedCliente.cognome}
                  </button>
                  {persone.map((p) => (
                    <button key={p.id} type="button" onClick={() => scegliPersona(p.nome, p.relazione || "")}
                      className={`min-h-[44px] px-3 rounded-lg text-sm border ${form.persona_nome === p.nome && !nuovaPersona ? "border-indigo-600 bg-white font-semibold text-indigo-900" : "border-neutral-300 bg-white text-neutral-700"}`}>
                      {p.nome}{p.relazione ? <span className="ml-1 font-normal text-neutral-500">· {p.relazione}</span> : null}
                    </button>
                  ))}
                  <button type="button" onClick={() => { setNuovaPersona(true); setForm((f) => ({ ...f, persona_nome: "", persona_relazione: "" })); }}
                    className={`min-h-[44px] px-3 rounded-lg text-sm border border-dashed ${nuovaPersona ? "border-indigo-600 text-indigo-900 bg-white" : "border-indigo-400 text-indigo-700"}`}>
                    + Aggiungi persona
                  </button>
                </div>
                {nuovaPersona && (
                  <div className="grid grid-cols-2 gap-2">
                    <input type="text" placeholder="Nome di chi prenota" value={form.persona_nome}
                      onChange={(e) => setForm({ ...form, persona_nome: e.target.value })}
                      className="min-w-0 px-2 py-1.5 border border-neutral-300 rounded-lg text-base sm:text-sm max-sm:min-h-[44px]" />
                    <select value={form.persona_relazione} onChange={(e) => setForm({ ...form, persona_relazione: e.target.value })}
                      className="min-w-0 px-2 py-1.5 border border-neutral-300 rounded-lg text-base sm:text-sm max-sm:min-h-[44px] bg-white">
                      {RELAZIONI.map((o) => <option key={o} value={o}>{o || "— chi è (facoltativo) —"}</option>)}
                    </select>
                  </div>
                )}
                {form.persona_nome && (
                  <div className="text-xs text-neutral-500">La prenotazione resta sulla scheda {selectedCliente.cognome || selectedCliente.nome}: in Planning si legge «{form.persona_nome} · scheda {selectedCliente.cognome || selectedCliente.nome}».</div>
                )}
              </div>
            )}

            {/* Avviso allergie */}
            {selectedCliente?.allergie && (
              <div className="mt-1 px-3 py-1.5 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800">
                ⚠️ Allergie: {selectedCliente.allergie}
              </div>
            )}
            {selectedCliente?.restrizioni_dietetiche && (
              <div className="mt-1 px-3 py-1.5 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800">
                🥗 Restrizioni: {selectedCliente.restrizioni_dietetiche}
              </div>
            )}

            {/* Form nuovo cliente */}
            {showNuovo && !selectedCliente && (
              <div className="mt-2 p-3 bg-neutral-50 border border-neutral-200 rounded-lg space-y-2">
                <div className="text-xs font-medium text-neutral-600">Nuovo cliente</div>
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="text"
                    placeholder="Nome"
                    value={form.nuovo_nome}
                    onChange={(e) => setForm({ ...form, nuovo_nome: e.target.value })}
                    className="min-w-0 px-2 py-1.5 border border-neutral-300 rounded-lg text-base sm:text-sm max-sm:min-h-[44px]"
                  />
                  <input
                    type="text"
                    placeholder={form.canale === "Walk-in" ? "Cognome (se lo dice)" : "Cognome *"}
                    value={form.nuovo_cognome}
                    onChange={(e) => setForm({ ...form, nuovo_cognome: e.target.value })}
                    className="min-w-0 px-2 py-1.5 border border-neutral-300 rounded-lg text-base sm:text-sm max-sm:min-h-[44px]"
                    required={showNuovo && !form.cliente_id && form.canale !== "Walk-in"}
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="flex gap-1 min-w-0">
                    <select
                      aria-label="Prefisso del paese"
                      value={form.nuovo_prefisso || prefissi.locale}
                      onChange={(e) => setForm({ ...form, nuovo_prefisso: e.target.value })}
                      className="w-[5.5rem] flex-shrink-0 px-1 py-1.5 border border-neutral-300 rounded-lg text-base sm:text-sm max-sm:min-h-[44px] bg-white"
                    >
                      {prefissi.frequenti.length === 0 && <option value={prefissi.locale}>{prefissi.locale}</option>}
                      {prefissi.frequenti.length > 0 && (
                        <optgroup label="I più frequenti">
                          {prefissi.frequenti.map((p) => <option key={p.prefisso} value={p.prefisso}>{p.paese} {p.prefisso}</option>)}
                        </optgroup>
                      )}
                      {prefissi.altri.length > 0 && (
                        <optgroup label="Tutti gli altri">
                          {prefissi.altri.map((p) => <option key={p.prefisso} value={p.prefisso}>{p.paese} {p.prefisso}</option>)}
                        </optgroup>
                      )}
                    </select>
                    <input
                      type="tel"
                      placeholder="Telefono"
                      value={form.nuovo_telefono}
                      onChange={(e) => setForm({ ...form, nuovo_telefono: e.target.value })}
                      className="flex-1 min-w-0 px-2 py-1.5 border border-neutral-300 rounded-lg text-base sm:text-sm max-sm:min-h-[44px]"
                    />
                  </div>
                  <input
                    type="email"
                    placeholder="Email"
                    value={form.nuovo_email}
                    onChange={(e) => setForm({ ...form, nuovo_email: e.target.value })}
                    className="min-w-0 px-2 py-1.5 border border-neutral-300 rounded-lg text-base sm:text-sm max-sm:min-h-[44px]"
                  />
                </div>
                {!form.nuovo_telefono.trim() && !form.nuovo_email.trim() && (
                  <div className="px-2 py-1.5 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-xs">
                    Senza telefono né email: il tavolo si blocca lo stesso, anche su TheFork, ma non potrai mandargli la conferma né richiamarlo.
                  </div>
                )}
                {/* Titolo e lingua: servono a TheFork e ai messaggi; la lingua, se vuota, viene dal prefisso */}
                <div className="grid grid-cols-2 gap-2">
                  <select
                    aria-label="Titolo"
                    value={form.nuovo_titolo}
                    onChange={(e) => setForm({ ...form, nuovo_titolo: e.target.value })}
                    className="min-w-0 px-2 py-1.5 border border-neutral-300 rounded-lg text-base sm:text-sm max-sm:min-h-[44px] bg-white"
                  >
                    <option value="">Titolo —</option>
                    <option value="Mr">Sig.</option>
                    <option value="Mrs">Sig.ra</option>
                  </select>
                  <select
                    aria-label="Lingua"
                    value={form.nuovo_lingua}
                    onChange={(e) => setForm({ ...form, nuovo_lingua: e.target.value })}
                    className="min-w-0 px-2 py-1.5 border border-neutral-300 rounded-lg text-base sm:text-sm max-sm:min-h-[44px] bg-white"
                  >
                    <option value="">Lingua: dal prefisso{linguaDalPrefisso ? ` (${NOMI_LINGUA[linguaDalPrefisso.slice(0, 2)] || linguaDalPrefisso})` : ""}</option>
                    {lingueScelta.map((l) => <option key={l} value={l}>{NOMI_LINGUA[l.slice(0, 2)] || l}</option>)}
                  </select>
                </div>
              </div>
            )}
          </div>

          <div>
            <span className="block text-xs font-medium text-neutral-600 mb-1">Canale</span>
            <div className="grid grid-cols-5 gap-1">
              {CANALI.map((c) => (
                <button key={c} type="button" onClick={() => setForm({ ...form, canale: c })} aria-pressed={form.canale === c}
                  className={`min-h-[44px] px-0.5 rounded-lg border text-xs font-medium ${form.canale === c ? SCELTO : "bg-white border-neutral-300 text-neutral-700 hover:bg-neutral-50"}`}>{c}</button>
              ))}
            </div>
          </div>
          </div>
          {/* 2 — altri dettagli */}
          <div className="space-y-4 max-lg:order-3 lg:w-[290px] lg:flex-shrink-0 lg:p-5 lg:border-r lg:border-neutral-200 lg:overflow-y-auto">
            <h3 className="hidden lg:block text-sm font-semibold text-neutral-800">Altri dettagli</h3>
            {carico.durata_regola ? (
            <div>
              <label className="block text-xs font-medium text-neutral-600 mb-1">Durata</label>
              <select
                value={form.durata_min}
                onChange={(e) => setForm({ ...form, durata_min: e.target.value })}
                className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-base sm:text-sm max-sm:min-h-[44px] bg-white"
              >
                <option value="">Come da regola ({oreMin(carico.durata_regola)})</option>
                {form.durata_min && !durateScelta.includes(Number(form.durata_min)) && Number(form.durata_min) !== 1440 && (
                  <option value={form.durata_min}>{oreMin(Number(form.durata_min))}</option>
                )}
                {durateScelta.map((m) => <option key={m} value={m}>{oreMin(m)}</option>)}
                <option value="1440">Tutto il turno</option>
              </select>
            </div>
            ) : null}
            <div className="flex items-end gap-x-5 gap-y-2 pb-2 flex-wrap min-w-0">
              <label className="flex items-center gap-1.5 text-sm whitespace-nowrap">
                <input
                  type="checkbox"
                  checked={form.tavolo_esterno === 1}
                  onChange={(e) => setForm({ ...form, tavolo_esterno: e.target.checked ? 1 : 0 })}
                />
                🌳 Esterno
              </label>
              <div className="flex items-center gap-2">
                <label className="text-sm text-neutral-700">Seggioloni</label>
                <input
                  type="number"
                  min={0}
                  max={5}
                  value={form.seggioloni}
                  onChange={(e) => setForm({ ...form, seggioloni: e.target.value })}
                  className="w-16 px-2 py-2 border border-neutral-300 rounded-lg text-base sm:text-sm max-sm:min-h-[44px]"
                />
              </div>
            </div>
          <div className="grid grid-cols-2 lg:grid-cols-1 gap-3">
            <div>
              <label className="block text-xs font-medium text-neutral-600 mb-1">Occasione</label>
              <select
                value={form.occasione}
                onChange={(e) => setForm({ ...form, occasione: e.target.value })}
                className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-base sm:text-sm max-sm:min-h-[44px]"
              >
                {OCCASIONI.map((o) => <option key={o} value={o}>{o || "— Nessuna —"}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-neutral-600 mb-1">Allergie segnalate</label>
              <input
                type="text"
                value={form.allergie_segnalate}
                onChange={(e) => setForm({ ...form, allergie_segnalate: e.target.value })}
                className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-base sm:text-sm max-sm:min-h-[44px]"
                placeholder="Es. celiaco, lattosio..."
              />
            </div>
          </div>
          {/* Note e occasione */}
          <div>
            <label className="block text-xs font-medium text-neutral-600 mb-1">Note staff (interne)</label>
            <textarea
              value={form.nota_ristorante}
              onChange={(e) => setForm({ ...form, nota_ristorante: e.target.value })}
              className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-base sm:text-sm max-sm:min-h-[44px]"
              rows={2}
              placeholder="Note per cucina/sala..."
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-neutral-600 mb-1">Note / richieste cliente</label>
            <textarea
              value={form.nota_cliente}
              onChange={(e) => setForm({ ...form, nota_cliente: e.target.value })}
              className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-base sm:text-sm max-sm:min-h-[44px]"
              rows={2}
              placeholder="Richieste speciali del cliente..."
            />
          </div>
          {!modifica && (
            <label className="flex items-center gap-2 text-sm text-neutral-700 max-sm:min-h-[44px]">
              <input type="checkbox" checked={mandaConferma} onChange={(e) => setMandaConferma(e.target.checked)} />
              Apri WhatsApp con la conferma, dopo il salvataggio
            </label>
          )}
          </div>
          {/* 3 — la sala: il tavolo si sceglie toccandolo (iPad e Mac); sul telefono l'elenco di sempre */}
          <div className="space-y-3 max-lg:order-2 lg:flex-1 lg:min-w-0 lg:p-5 lg:bg-brand-cream lg:overflow-y-auto">
          {posto && !posto.entra && form.stato !== "WAITLIST" && (
            <div className="px-3 py-2 rounded-lg bg-red-50 border border-red-200 text-red-800 text-xs">
              🔴 A quest'ora non c'è un tavolo o un'unione salvata libera per {form.pax} persone{posto.gia_fuori > 0 ? ` (e ${posto.gia_fuori} prenotazioni sono già senza posto)` : ""}. Prova un altro orario, apri una sala o inseriscila lo stesso.
            </div>
          )}
          {posto && posto.entra && posto.tavolo && (
            <div className="px-3 py-2 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs flex items-center gap-2">
              <span>🪑 Entra: tavolo suggerito <strong>{posto.tavolo.nome}</strong> ({posto.tavolo.posti} posti{posto.tavolo.prolunghe ? ", con prolunga" : ""})</span>
              {form.tavolo !== tavoloProposto && (
                <button type="button" onClick={() => setForm({ ...form, tavolo: tavoloProposto })}
                  className="ml-auto px-2 py-0.5 rounded-lg border border-emerald-400 bg-white hover:bg-emerald-100">Usa</button>
              )}
            </div>
          )}

            <div className="hidden lg:block">
              <SalaForm data={form.data_pasto} turno={turnoCorrente} ora={form.ora_pasto} pax={form.pax} durataMin={form.durata_min}
                carico={carico} escludiId={modifica ? P.id : null} scelti={tavoliScelti} proposti={propostiSet} onToggle={toggleTavolo} />
              <div className="mt-3 flex items-center justify-between gap-2 px-3 py-2 rounded-lg bg-white border border-neutral-200 text-sm">
                {tavoliScelti.length > 0
                  ? <span><strong>Tavolo {tavoliScelti.join(" + ")}</strong>{postiScelti ? ` · ${postiScelti} posti` : ""}</span>
                  : <span className="text-neutral-600">Nessun tavolo: si assegna dopo</span>}
                {tavoliScelti.length > 0 && <button type="button" onClick={() => setForm({ ...form, tavolo: "" })} className="min-h-[36px] px-2 text-xs font-medium text-indigo-900 hover:underline">Togli</button>}
              </div>
              <details className="mt-2">
                <summary className="text-xs text-neutral-600 cursor-pointer min-h-[32px]">Tutti i tavoli in elenco (anche le metà)</summary>
                <div className="mt-2">{elencoTavoli}</div>
              </details>
            </div>
            <div className="lg:hidden">{elencoTavoli}</div>
          </div>
          </div>

          {/* Fondo: sul telefono resta attaccato in basso; su iPad e Mac riepilogo, stato e tasti */}
          <div className="flex flex-wrap items-end justify-end gap-x-4 gap-y-2 px-4 sm:px-5 py-3 border-t border-neutral-200 bg-white sm:rounded-b-2xl lg:bg-neutral-50 max-sm:sticky max-sm:bottom-0 max-sm:z-10 max-sm:pb-[max(0.75rem,env(safe-area-inset-bottom))]">
            <div className="hidden lg:block mr-auto text-sm text-neutral-700 self-center">
              <strong className="text-neutral-900">{form.pax} persone · {dataBreve} {form.ora_pasto}{form.tavolo ? ` · tavolo ${form.tavolo}` : ""}</strong>
              {selectedCliente && <span> · {selectedCliente.nome} {selectedCliente.cognome}</span>}
            </div>
            {!modifica && <div className="hidden lg:block lg:w-[400px]">{bloccoStato}</div>}
            <div className="flex gap-2 max-sm:w-full">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-sm text-neutral-600 border border-neutral-300 rounded-lg hover:bg-neutral-50 min-h-[44px] max-sm:min-h-[48px] bg-white"
              >
                Annulla
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="px-5 py-2 text-sm bg-brand-blue text-white rounded-lg hover:bg-blue-700 font-semibold disabled:opacity-50 min-h-[44px] max-sm:flex-1 max-sm:min-h-[48px] max-sm:text-base"
              >
                {testoSalva}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
