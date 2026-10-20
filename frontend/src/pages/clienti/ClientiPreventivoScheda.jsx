// @version: v1.8 — «Confermato» aggiorna la prenotazione col menù, avvisa sala e cucina e prepara il messaggio per i gruppi WhatsApp (2026-10-20)
// v1.7 — nuovo preventivo da una prenotazione (tasto «📋 Preventivo» nel Planning), collegato con prenotazione_id (2026-10-20)
// v1.6 — «📨 Invia al cliente»: WhatsApp testo completo + PDF, email col PDF, storico invii (mig 200)
// Modulo: clienti (sub-modulo preventivi)
// Scheda singolo preventivo: testata + componi menu (snapshot da Cucina) + menu testuale + extra + totale
// v1.1 (sessione 32): sezione Menu Proposto, cliente cerca/crea inline, luoghi configurabili
// v1.2 (sessione 36): wizard "Componi menu" che pesca piatti dal Ricettario con snapshot immutabile
// v1.3 (sessione 36, Opzione A): auto-save silenzioso (is_bozza_auto) quando si usa il
// composer su URL /nuovo, cosi' il pannello funziona anche prima del salvataggio esplicito.
// v1.5 (2026-10-16): con >= 2 menu e nessuna scelta il totale e' una forbice min–max;
// col menu scelto dal cliente usa quello. «📋 Copia testo» e «💬 WhatsApp» (M.C) col
// messaggio di GET /preventivi/{id}/testo (mai i prezzi dei singoli piatti).
// v1.6 (2026-10-19): «📨 Invia al cliente» salva e apre PreventivoInvioModal
// (WhatsApp con PDF vero via condivisione, email col PDF allegato, registro invii).
import React, { useState, useEffect, useCallback, useRef } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import { API_BASE, apiFetch } from "../../config/api";
import ClientiNav from "./ClientiNav";
import PreventivoMenuComposer from "./PreventivoMenuComposer";
import { Btn } from "../../components/ui";
import PreventivoInvioModal from "./PreventivoInvioModal";
import PreventivoAvvisoStaff from "./PreventivoAvvisoStaff";

const fmtEuro = (v) => (parseFloat(v) || 0).toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const STATI_COLORI = {
  bozza:      "bg-neutral-100 text-neutral-600",
  inviato:    "bg-blue-100 text-blue-700",
  in_attesa:  "bg-amber-100 text-amber-700",
  confermato: "bg-emerald-100 text-emerald-700",
  prenotato:  "bg-indigo-100 text-indigo-700",
  completato: "bg-emerald-50 text-emerald-600",
  fatturato:  "bg-neutral-100 text-neutral-500",
  rifiutato:  "bg-red-100 text-red-600",
  scaduto:    "bg-orange-100 text-orange-700",
};

const STATI_LABEL = {
  bozza: "Bozza", inviato: "Inviato", in_attesa: "In attesa",
  confermato: "Confermato", prenotato: "Prenotato", completato: "Completato",
  fatturato: "Fatturato", rifiutato: "Rifiutato", scaduto: "Scaduto",
};

const TRANSIZIONI = {
  bozza:      ["inviato"],
  inviato:    ["in_attesa", "confermato", "rifiutato"],
  in_attesa:  ["confermato", "rifiutato", "scaduto"],
  confermato: ["prenotato"],
  prenotato:  ["completato"],
  completato: ["fatturato"],
  rifiutato:  [],
  scaduto:    ["bozza"],
  fatturato:  [],
};

const RIGA_VUOTA = { descrizione: "", qta: 1, prezzo_unitario: 0, tipo_riga: "voce", ordine: 0 };

// Placeholder esempio per aiutare Marco a strutturare il menu proposto
const MENU_PLACEHOLDER = `ANTIPASTI
• Tagliere di salumi e formaggi bergamaschi
• Polenta taragna con Branzi DOP

PRIMI
• Casoncelli alla bergamasca
• Risotto al tastasal

SECONDI
• Coniglio alla cacciatora con polenta
• Brasato al Valcalepio

DOLCE
• Sbrisolona con crema mascarpone

Acqua, caffè e coperto inclusi.
Vino: 1 bottiglia ogni 4 persone (Valcalepio rosso o bianco).`;

export default function ClientiPreventivoScheda() {
  const { id } = useParams();
  const isNew = id === "nuovo";
  const navigate = useNavigate();
  // Prenotazione da cui nasce il preventivo (Planning › «📋 Preventivo»), passata nello state
  const prenDa = useLocation().state?.prenotazione || null;

  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState(null);

  // Testata
  const [form, setForm] = useState({
    cliente_id: null,
    titolo: "",
    tipo: "cena_privata",
    data_evento: "",
    ora_evento: "",
    n_persone: "",
    luogo: "Sala",
    note_interne: "",
    note_cliente: "",
    condizioni: "",
    scadenza_conferma: "",
    canale: "telefono",
    template_id: null,
    menu_nome: "",
    menu_prezzo_persona: 0,
    menu_descrizione: "",
    prenotazione_id: null,
  });
  const [stato, setStato] = useState("bozza");
  const [numero, setNumero] = useState("");
  const [prevId, setPrevId] = useState(null);

  // Righe extra (non menu)
  const [righe, setRighe] = useState([]);

  // Menu snapshot (mig 075) — contatore per sapere se il prezzo/persona e' auto-calcolato
  const [menuSnapshot, setMenuSnapshot] = useState({ n_righe: 0, menu_subtotale: 0, menu_sconto: 0, menu_prezzo_persona: 0 });
  // Menu alternativi (mig 187): elenco prezzi a persona + menu scelto dal cliente
  const [menuAlt, setMenuAlt] = useState({ menus: [], menu_scelto_id: null });
  // Bozza automatica mai salvata aperta dalla lista (badge «non salvata»)
  const [bozzaAuto, setBozzaAuto] = useState(false);

  // Cliente: toggle cerca / crea nuovo
  const [clienteMode, setClienteMode] = useState("cerca"); // "cerca" | "nuovo"
  const [clienteSearch, setClienteSearch] = useState("");
  const [clienteResults, setClienteResults] = useState([]);
  const [clienteNome, setClienteNome] = useState("");
  const [showClienteDD, setShowClienteDD] = useState(false);
  const [nuovoCliente, setNuovoCliente] = useState({ nome: "", cognome: "", telefono: "", email: "" });

  // Template
  const [templates, setTemplates] = useState([]);

  // Luoghi configurabili
  const [luoghi, setLuoghi] = useState(["Sala", "Giardino", "Dehor"]);

  // Tab note
  const [noteTab, setNoteTab] = useState("interne");

  // Pannello invio al cliente (mig 200)
  const [invioOpen, setInvioOpen] = useState(false);
  // Conferma evento (2026-10-20): scelta del menù se ce ne sono più d'uno, poi esito + avviso gruppi
  const [sceltaMenuOpen, setSceltaMenuOpen] = useState(false);
  const [esitoConferma, setEsitoConferma] = useState(null);
  const [confermando, setConfermando] = useState(false);

  // ── Nuovo preventivo da una prenotazione (2026-10-20) ──
  // Se per quella prenotazione c'è già un preventivo, si apre quello; altrimenti
  // il form parte con cliente, data, ora, coperti e le note della prenotazione.
  useEffect(() => {
    if (!isNew || !prenDa) return;
    let vivo = true;
    (async () => {
      try {
        const r = await apiFetch(`${API_BASE}/preventivi?prenotazione_id=${prenDa.id}&includi_bozze_auto=true`);
        const d = r.ok ? await r.json() : null;
        const esistente = d?.items?.[0];
        if (esistente && vivo) {
          navigate(`/clienti/preventivi/${esistente.id}`, { replace: true });
          return;
        }
      } catch { /* si prosegue col nuovo */ }
      if (!vivo) return;
      const nomeCli = [prenDa.cognome, prenDa.nome].filter(Boolean).join(" ").trim();
      const [aa, mm, gg] = (prenDa.data_pasto || "").split("-");
      const titolo = `${prenDa.occasione || "Cena"} ${prenDa.cognome || prenDa.nome || ""}`.trim()
        + (gg ? ` — ${gg}/${mm}` : "");
      const note = [
        `Dalla prenotazione del ${gg ? `${gg}/${mm}/${aa}` : prenDa.data_pasto} ore ${(prenDa.ora_pasto || "").slice(0, 5)}, ${prenDa.pax || "?"} coperti${prenDa.canale ? ` (${prenDa.canale})` : ""}.`,
        prenDa.allergie_segnalate && `Allergie: ${prenDa.allergie_segnalate}`,
        prenDa.allergie && `Allergie in anagrafica: ${prenDa.allergie}`,
        prenDa.nota_cliente && `Nota del cliente: ${prenDa.nota_cliente}`,
        prenDa.nota_ristorante && `Nota staff: ${prenDa.nota_ristorante}`,
      ].filter(Boolean).join("\n");
      setForm((f) => ({
        ...f,
        cliente_id: prenDa.cliente_id || null,
        titolo,
        data_evento: prenDa.data_pasto || "",
        ora_evento: (prenDa.ora_pasto || "").slice(0, 5),
        n_persone: prenDa.pax || "",
        note_interne: note,
        prenotazione_id: prenDa.id,
      }));
      if (prenDa.cliente_id) {
        setClienteNome(nomeCli);
        setClienteMode("cerca");
      } else if (nomeCli || prenDa.telefono) {
        // Prenotazione senza cliente in anagrafica (es. TheFork anonimizzata): cliente nuovo
        setClienteMode("nuovo");
        setNuovoCliente({ nome: prenDa.nome || "", cognome: prenDa.cognome || "", telefono: prenDa.telefono || "", email: prenDa.email || "" });
      }
    })();
    return () => { vivo = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isNew, prenDa?.id]);

  // ── Caricamento ──
  useEffect(() => {
    if (!isNew) {
      apiFetch(`${API_BASE}/preventivi/${id}`)
        .then((r) => r.json())
        .then((data) => {
          setForm({
            cliente_id: data.cliente_id,
            titolo: data.titolo || "",
            tipo: data.tipo || "cena_privata",
            data_evento: data.data_evento || "",
            ora_evento: data.ora_evento || "",
            n_persone: data.n_persone || "",
            luogo: data.luogo || "Sala",
            note_interne: data.note_interne || "",
            note_cliente: data.note_cliente || "",
            condizioni: data.condizioni || "",
            scadenza_conferma: data.scadenza_conferma || "",
            canale: data.canale || "telefono",
            template_id: data.template_id,
            menu_nome: data.menu_nome || "",
            menu_prezzo_persona: data.menu_prezzo_persona || 0,
            menu_descrizione: data.menu_descrizione || "",
            prenotazione_id: data.prenotazione_id || null,
          });
          setStato(data.stato);
          setNumero(data.numero);
          setPrevId(data.id);
          setBozzaAuto(!!data.is_bozza_auto);
          setRighe(Array.isArray(data.righe) ? data.righe : []);
          setMenuSnapshot({
            n_righe: Array.isArray(data.menu_righe) ? data.menu_righe.length : 0,
            menu_subtotale: parseFloat(data.menu_subtotale || 0),
            menu_sconto: parseFloat(data.menu_sconto || 0),
            menu_prezzo_persona: parseFloat(data.menu_prezzo_persona || 0),
          });
          if (data.cliente_nome || data.cliente_cognome) {
            setClienteNome(`${data.cliente_cognome || ""} ${data.cliente_nome || ""}`.trim());
          }
        })
        .catch(() => showToast("Errore caricamento preventivo", true))
        .finally(() => setLoading(false));
    }
    // Template
    apiFetch(`${API_BASE}/preventivi/template/lista`)
      .then((r) => r.json())
      .then((data) => setTemplates(Array.isArray(data) ? data : []))
      .catch(() => {});
    // Luoghi
    apiFetch(`${API_BASE}/preventivi/config/luoghi`)
      .then((r) => r.json())
      .then((data) => { if (Array.isArray(data?.luoghi) && data.luoghi.length) setLuoghi(data.luoghi); })
      .catch(() => {});
  }, [id, isNew]);

  // ── Autocomplete cliente (solo in modalita "cerca") ──
  useEffect(() => {
    if (clienteMode !== "cerca" || clienteSearch.length < 2) { setClienteResults([]); setShowClienteDD(false); return; }
    const t = setTimeout(() => {
      apiFetch(`${API_BASE}/prenotazioni/clienti/search?q=${encodeURIComponent(clienteSearch)}`)
        .then((r) => r.json())
        .then((data) => {
          // L'endpoint ritorna { clienti: [...] } (non un array diretto)
          const lista = Array.isArray(data) ? data : (Array.isArray(data?.clienti) ? data.clienti : []);
          setClienteResults(lista);
          setShowClienteDD(true);
        })
        .catch(() => { setClienteResults([]); setShowClienteDD(false); });
    }, 300);
    return () => clearTimeout(t);
  }, [clienteSearch, clienteMode]);

  const selezionaCliente = (c) => {
    setForm((f) => ({ ...f, cliente_id: c.id }));
    setClienteNome(`${c.cognome || ""} ${c.nome || ""}`.trim());
    setClienteSearch("");
    setShowClienteDD(false);
  };

  const resetCliente = () => {
    setForm((f) => ({ ...f, cliente_id: null }));
    setClienteNome("");
    setClienteSearch("");
    setClienteResults([]);
    setNuovoCliente({ nome: "", cognome: "", telefono: "", email: "" });
  };

  // ── Auto-save silenzioso (Opzione A) ──
  // Chiamato dal composer quando si tenta un'azione (aggiungi piatto, ecc.)
  // su URL /nuovo: crea una bozza automatica (is_bozza_auto=1) con i campi
  // gia' compilati, senza cambiare URL. La bozza e' nascosta da lista/stats
  // finche' l'utente non clicca "Salva" (handleSalva la promuove a bozza
  // normale via PUT is_bozza_auto=0).
  const ensuringRef = useRef(null);
  const ensureSaved = useCallback(async () => {
    if (prevId) return prevId;
    // Deduplica: se piu' chiamate arrivano in parallelo (es. doppio click),
    // condividiamo la stessa Promise in modo da creare UNA sola bozza.
    if (ensuringRef.current) return ensuringRef.current;
    ensuringRef.current = (async () => {
      try {
        const body = {
          ...form,
          titolo: (form.titolo || "").trim(),  // backend mette placeholder se vuoto
          n_persone: form.n_persone ? parseInt(form.n_persone) : null,
          menu_prezzo_persona: parseFloat(form.menu_prezzo_persona) || 0,
          righe: [],  // gli extra vengono salvati solo col "Salva" esplicito
          is_bozza_auto: 1,
          // Non creiamo il cliente inline in auto-bozza: se Marco ha scritto
          // nuovoCliente con dati parziali lo posticipiamo all'esplicito.
        };
        const res = await apiFetch(`${API_BASE}/preventivi`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        if (!res.ok) throw new Error("auto-save fallito");
        const data = await res.json();
        setPrevId(data.id);
        setStato(data.stato);
        setNumero(data.numero);
        return data.id;
      } catch {
        showToast("Errore avvio bozza automatica", true);
        return null;
      } finally {
        // Libera il lock (pur se setPrevId non si e' ancora propagato)
        setTimeout(() => { ensuringRef.current = null; }, 0);
      }
    })();
    return ensuringRef.current;
  }, [prevId, form]);

  // ── Template ──
  const applicaTemplate = (tplId) => {
    const tpl = templates.find((t) => t.id === parseInt(tplId));
    if (!tpl) return;
    setForm((f) => ({ ...f, template_id: tpl.id, condizioni: tpl.condizioni_default || f.condizioni }));
    try {
      const r = JSON.parse(tpl.righe_json || "[]");
      if (r.length) setRighe(r.map((x, i) => ({ ...RIGA_VUOTA, ...x, ordine: i })));
    } catch { /* ignora JSON invalido */ }
  };

  // ── Righe extra ──
  const updateRiga = (idx, field, value) => {
    setRighe((prev) => prev.map((r, i) => i === idx ? { ...r, [field]: value } : r));
  };
  const aggiungiRiga = () => setRighe((prev) => [...prev, { ...RIGA_VUOTA, ordine: prev.length }]);
  const rimuoviRiga = (idx) => setRighe((prev) => prev.filter((_, i) => i !== idx));
  const spostaRiga = (idx, dir) => {
    setRighe((prev) => {
      const arr = [...prev];
      const newIdx = idx + dir;
      if (newIdx < 0 || newIdx >= arr.length) return arr;
      [arr[idx], arr[newIdx]] = [arr[newIdx], arr[idx]];
      return arr.map((r, i) => ({ ...r, ordine: i }));
    });
  };

  // Callback dal composer: aggiorna il prezzo/persona della testata e mantiene in sync
  // il conteggio righe per disabilitare l'input manuale quando ci sono piatti snapshot.
  const handleMenuTotaleChange = useCallback((data) => {
    setMenuSnapshot((s) => ({
      ...s,
      menu_subtotale: parseFloat(data?.menu_subtotale || 0),
      menu_sconto: parseFloat(data?.menu_sconto || 0),
      menu_prezzo_persona: parseFloat(data?.menu_prezzo_persona || 0),
    }));
    // Sincronizza il campo testata per il riepilogo "Subtotale menu"
    setForm((f) => ({ ...f, menu_prezzo_persona: parseFloat(data?.menu_prezzo_persona || 0) }));
    setMenuAlt({ menus: data?.menus || [], menu_scelto_id: data?.menu_scelto_id || null });
  }, []);

  // Ricarico count righe dopo cambi nel composer (il composer ritorna solo totali, non n_righe)
  const refreshMenuCount = useCallback(async () => {
    if (!prevId) return;
    try {
      const r = await apiFetch(`${API_BASE}/preventivi/${prevId}/menu-righe`);
      const data = await r.json();
      const n = Array.isArray(data?.items) ? data.items.length : 0;
      setMenuSnapshot((s) => ({ ...s, n_righe: n }));
    } catch { /* silente */ }
  }, [prevId]);

  useEffect(() => { refreshMenuCount(); }, [refreshMenuCount]);

  // Totale live: menu × pax + somma righe extra.
  // Con >= 2 menu: col menu scelto dal cliente usa quello, altrimenti forbice min–max (mig 187).
  const pax = parseFloat(form.n_persone) || 0;
  const menuScelto = menuAlt.menus.find((m) => m.id === menuAlt.menu_scelto_id);
  const alternative = menuAlt.menus.length >= 2 && !menuScelto;
  const prezzoMenuTot = menuScelto ? menuScelto.prezzo_persona : (parseFloat(form.menu_prezzo_persona) || 0);
  const menuTot = prezzoMenuTot * pax;
  const prezziAlt = menuAlt.menus.map((m) => m.prezzo_persona || 0);
  const menuTotMin = alternative ? Math.min(...prezziAlt) * pax : menuTot;
  const menuTotMax = alternative ? Math.max(...prezziAlt) * pax : menuTot;
  const extraTot = righe.reduce((sum, r) => {
    const sub = (parseFloat(r.qta) || 0) * (parseFloat(r.prezzo_unitario) || 0);
    return r.tipo_riga === "sconto" ? sum - Math.abs(sub) : sum + sub;
  }, 0);
  const totaleLive = menuTot + extraTot;
  const totaleTesto = alternative && menuTotMin !== menuTotMax
    ? `da €${fmtEuro(menuTotMin + extraTot)} a €${fmtEuro(menuTotMax + extraTot)}`
    : `€${fmtEuro(alternative ? menuTotMin + extraTot : totaleLive)}`;

  // ── Salva ──
  const handleSalva = async () => {
    if (!form.titolo.trim()) { showToast("Il titolo è obbligatorio", true); return false; }

    // Validazione cliente "nuovo"
    let nuovoClientePayload = null;
    if (clienteMode === "nuovo" && !form.cliente_id) {
      const n = (nuovoCliente.nome || "").trim();
      const c = (nuovoCliente.cognome || "").trim();
      if (!n && !c) { showToast("Indicare almeno nome o cognome del nuovo cliente", true); return false; }
      nuovoClientePayload = { ...nuovoCliente };
    }

    setSaving(true);
    try {
      const hasSnapshot = menuSnapshot.n_righe > 0;
      // Se ci sono righe snapshot il prezzo/persona e' autocalcolato dal backend:
      // NON lo inviamo per non sovrascriverlo con un valore stantio digitato a mano.
      const { menu_prezzo_persona: _mpp, ...formSenzaPrezzo } = form;
      const body = {
        ...(hasSnapshot ? formSenzaPrezzo : form),
        n_persone: form.n_persone ? parseInt(form.n_persone) : null,
        ...(hasSnapshot ? {} : { menu_prezzo_persona: parseFloat(form.menu_prezzo_persona) || 0 }),
        righe: righe.map((r, i) => ({
          descrizione: r.descrizione,
          qta: parseFloat(r.qta) || 1,
          prezzo_unitario: parseFloat(r.prezzo_unitario) || 0,
          tipo_riga: r.tipo_riga || "voce",
          ordine: i,
        })),
        ...(nuovoClientePayload ? { nuovo_cliente: nuovoClientePayload } : {}),
      };

      // Tre casi:
      // 1) URL /nuovo SENZA bozza auto → POST (creazione esplicita)
      // 2) URL /nuovo CON bozza auto (prevId set dal composer) → PUT con
      //    is_bozza_auto=0 per "promuoverla" a bozza utente
      // 3) URL /{id} esistente → PUT normale
      let res;
      if (isNew && !prevId) {
        res = await apiFetch(`${API_BASE}/preventivi`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
      } else {
        // Promuovi l'eventuale auto-bozza a bozza normale
        const putBody = { ...body, is_bozza_auto: 0 };
        res = await apiFetch(`${API_BASE}/preventivi/${prevId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(putBody),
        });
      }

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || "Errore salvataggio");
      }

      const data = await res.json();
      showToast("Preventivo salvato");
      setBozzaAuto(false);

      if (isNew) {
        navigate(`/clienti/preventivi/${data.id}`, { replace: true });
      } else {
        setStato(data.stato);
        setNumero(data.numero);
        setRighe(Array.isArray(data.righe) ? data.righe : []);
        setMenuSnapshot({
          n_righe: Array.isArray(data.menu_righe) ? data.menu_righe.length : 0,
          menu_subtotale: parseFloat(data.menu_subtotale || 0),
          menu_sconto: parseFloat(data.menu_sconto || 0),
          menu_prezzo_persona: parseFloat(data.menu_prezzo_persona || 0),
        });
        if (data.cliente_nome || data.cliente_cognome) {
          setClienteNome(`${data.cliente_cognome || ""} ${data.cliente_nome || ""}`.trim());
          setClienteMode("cerca");
          setNuovoCliente({ nome: "", cognome: "", telefono: "", email: "" });
        }
      }
      return true;
    } catch (err) {
      showToast(err.message || "Errore salvataggio", true);
      return false;
    } finally {
      setSaving(false);
    }
  };

  // ── Cambia stato ──
  // ── Conferma evento: POST /conferma (prenotazione col menù + campanello + messaggio gruppi) ──
  const eseguiConferma = async (menuId = null) => {
    setConfermando(true);
    try {
      const res = await apiFetch(`${API_BASE}/preventivi/${prevId}/conferma`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ menu_scelto_id: menuId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.detail || "Errore conferma");
      setStato(data.stato);
      if (data.prenotazione?.prenotazione_id) setForm((f) => ({ ...f, prenotazione_id: data.prenotazione.prenotazione_id }));
      if (menuId) setMenuAlt((a) => ({ ...a, menu_scelto_id: menuId }));
      setSceltaMenuOpen(false);
      setEsitoConferma(data);
    } catch (err) {
      showToast(err.message, true);
    } finally {
      setConfermando(false);
    }
  };

  const handleConferma = async () => {
    const ok = await handleSalva();
    if (!ok) return;
    if (menuAlt.menus.length >= 2 && !menuAlt.menu_scelto_id) { setSceltaMenuOpen(true); return; }
    eseguiConferma(null);
  };

  const handleCambiaStato = async (nuovoStato) => {
    if (nuovoStato === "confermato") return handleConferma();
    try {
      const res = await apiFetch(`${API_BASE}/preventivi/${prevId}/stato`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stato: nuovoStato }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || "Errore cambio stato");
      }
      const data = await res.json();
      setStato(data.stato);
      showToast(`Stato → ${STATI_LABEL[data.stato]}`);
    } catch (err) {
      showToast(err.message, true);
    }
  };

  // ── Scarica PDF (mattone M.B) ──
  // Testo per il cliente (mig 187): stesso contenuto del PDF, dai dati salvati
  const fetchTesto = async () => {
    const res = await apiFetch(`${API_BASE}/preventivi/${prevId}/testo`);
    if (!res.ok) throw new Error("Errore preparazione testo");
    return res.json();
  };

  const handleCopiaTesto = async () => {
    try {
      const { testo } = await fetchTesto();
      await navigator.clipboard.writeText(testo);
      showToast("📋 Testo copiato (dati salvati)");
    } catch (err) {
      showToast(err.message || "Copia non riuscita", true);
    }
  };

  // Invio al cliente: prima si salva (testo e PDF usano i dati salvati), poi il pannello
  const handleApriInvio = async () => {
    const ok = await handleSalva();
    if (ok) setInvioOpen(true);
  };

  const handlePDF = async () => {
    try {
      const res = await apiFetch(`${API_BASE}/preventivi/${prevId}/pdf`);
      if (!res.ok) throw new Error("Errore generazione PDF");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `preventivo_${(numero || prevId).toString().toLowerCase()}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      showToast("PDF scaricato");
    } catch (err) {
      showToast(err.message || "Errore PDF", true);
    }
  };

  // ── Duplica ──
  const handleDuplica = async () => {
    try {
      const res = await apiFetch(`${API_BASE}/preventivi/${prevId}/duplica`, { method: "POST" });
      if (!res.ok) throw new Error("Errore duplicazione");
      const data = await res.json();
      showToast("Preventivo duplicato");
      navigate(`/clienti/preventivi/${data.id}`);
    } catch (err) {
      showToast(err.message, true);
    }
  };

  // ── Elimina ──
  const handleElimina = async () => {
    if (!window.confirm("Eliminare questo preventivo?")) return;
    try {
      await apiFetch(`${API_BASE}/preventivi/${prevId}`, { method: "DELETE" });
      showToast("Preventivo eliminato");
      navigate("/clienti/preventivi");
    } catch {
      showToast("Errore eliminazione", true);
    }
  };

  const showToast = (msg, isError = false) => {
    setToast({ msg, isError });
    setTimeout(() => setToast(null), 3000);
  };

  if (loading) return (
    <>
      <ClientiNav current="preventivi" />
      <div className="min-h-screen bg-brand-cream flex items-center justify-center">
        <div className="text-neutral-400">Caricamento...</div>
      </div>
    </>
  );

  const transizioniDisp = TRANSIZIONI[stato] || [];

  return (
    <>
      <ClientiNav current="preventivi" />
      <div className="min-h-screen bg-brand-cream">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6">

          {/* ── HEADER ── */}
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <button onClick={() => navigate("/clienti/preventivi")}
                className="text-neutral-400 hover:text-neutral-600 transition text-lg">←</button>
              <div>
                <h1 className="text-xl font-bold text-neutral-900">
                  {isNew ? "Nuovo Preventivo" : `${numero}`}
                </h1>
                {!isNew && (
                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${STATI_COLORI[stato]}`}>
                    {STATI_LABEL[stato]}
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="flex gap-6">
            {/* ── FORM PRINCIPALE ── */}
            <div className="flex-1 space-y-4">

              {/* Testata */}
              <div className="bg-white rounded-xl border border-neutral-200 shadow-sm p-5 space-y-4">
                <h3 className="text-sm font-semibold text-neutral-700">Dettagli evento</h3>
                {form.prenotazione_id && (
                  <button type="button"
                    onClick={() => form.data_evento && navigate(`/prenotazioni/planning/${form.data_evento}`)}
                    className="w-full text-left text-xs bg-indigo-50 border border-indigo-200 text-indigo-800 rounded-lg px-3 py-2 min-h-[40px] hover:bg-indigo-100">
                    📅 Nato dalla prenotazione del {form.data_evento ? form.data_evento.split("-").reverse().join("/") : "—"}{form.ora_evento ? ` ore ${form.ora_evento}` : ""} — apri il Planning ›
                  </button>
                )}

                {/* Template select */}
                {templates.length > 0 && (
                  <div>
                    <label className="text-xs text-neutral-600 font-medium">Carica da template</label>
                    <select onChange={(e) => applicaTemplate(e.target.value)} value=""
                      className="w-full mt-1 border border-neutral-300 rounded-lg px-3 py-1.5 text-sm">
                      <option value="">— Seleziona template —</option>
                      {templates.map((t) => <option key={t.id} value={t.id}>{t.nome}</option>)}
                    </select>
                  </div>
                )}

                <div>
                  <label className="text-xs text-neutral-600 font-medium">Titolo *</label>
                  <input type="text" value={form.titolo}
                    onChange={(e) => setForm({ ...form, titolo: e.target.value })}
                    placeholder="es. Cena aziendale Natale Rossi"
                    className="w-full mt-1 border border-neutral-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-300 outline-none" />
                </div>

                {/* ── CLIENTE: toggle cerca / nuovo ── */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-xs text-neutral-600 font-medium">Cliente</label>
                    {!form.cliente_id && (
                      <div className="inline-flex rounded-lg border border-neutral-200 overflow-hidden text-[11px]">
                        <button type="button" onClick={() => { setClienteMode("cerca"); setNuovoCliente({ nome: "", cognome: "", telefono: "", email: "" }); }}
                          className={`px-2.5 py-1 ${clienteMode === "cerca" ? "bg-indigo-600 text-white" : "bg-white text-neutral-600 hover:bg-neutral-50"}`}>
                          🔍 Esistente
                        </button>
                        <button type="button" onClick={() => { setClienteMode("nuovo"); setClienteSearch(""); }}
                          className={`px-2.5 py-1 border-l border-neutral-200 ${clienteMode === "nuovo" ? "bg-indigo-600 text-white" : "bg-white text-neutral-600 hover:bg-neutral-50"}`}>
                          ＋ Nuovo
                        </button>
                      </div>
                    )}
                  </div>

                  {form.cliente_id ? (
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-indigo-700">{clienteNome || `Cliente #${form.cliente_id}`}</span>
                      <button onClick={resetCliente} className="text-xs text-red-500 hover:text-red-700">✕ rimuovi</button>
                    </div>
                  ) : clienteMode === "cerca" ? (
                    <div className="relative">
                      <input type="search" value={clienteSearch}
                        onChange={(e) => setClienteSearch(e.target.value)}
                        placeholder="Cerca per nome, cognome o telefono..."
                        name="trgb_cliente_search"
                        autoComplete="off"
                        autoCorrect="off"
                        autoCapitalize="off"
                        spellCheck={false}
                        data-lpignore="true"
                        data-form-type="other"
                        aria-autocomplete="list"
                        className="w-full border border-neutral-300 rounded-lg px-3 py-1.5 text-sm focus:ring-2 focus:ring-indigo-300 outline-none" />
                      {showClienteDD && clienteResults.length > 0 && (
                        <div className="absolute z-20 mt-1 w-full bg-white border border-neutral-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                          {clienteResults.map((c) => (
                            <button key={c.id} onClick={() => selezionaCliente(c)}
                              className="w-full text-left px-3 py-2 hover:bg-indigo-50 text-sm border-b border-neutral-100 last:border-0">
                              <span className="font-medium">{c.cognome} {c.nome}</span>
                              {c.telefono && <span className="text-neutral-400 ml-2 text-xs">{c.telefono}</span>}
                            </button>
                          ))}
                        </div>
                      )}
                      <p className="text-[11px] text-neutral-400 mt-1">Nessun risultato? Passa a <button type="button" onClick={() => setClienteMode("nuovo")} className="text-indigo-600 hover:underline">＋ Nuovo</button> per crearlo al volo.</p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 gap-2 bg-indigo-50/40 border border-indigo-200 rounded-lg p-3">
                      <input type="text" value={nuovoCliente.nome}
                        onChange={(e) => setNuovoCliente({ ...nuovoCliente, nome: e.target.value })}
                        placeholder="Nome *"
                        className="border border-neutral-300 rounded-lg px-3 py-1.5 text-sm bg-white" />
                      <input type="text" value={nuovoCliente.cognome}
                        onChange={(e) => setNuovoCliente({ ...nuovoCliente, cognome: e.target.value })}
                        placeholder="Cognome *"
                        className="border border-neutral-300 rounded-lg px-3 py-1.5 text-sm bg-white" />
                      <input type="tel" value={nuovoCliente.telefono}
                        onChange={(e) => setNuovoCliente({ ...nuovoCliente, telefono: e.target.value })}
                        placeholder="Telefono"
                        className="border border-neutral-300 rounded-lg px-3 py-1.5 text-sm bg-white" />
                      <input type="email" value={nuovoCliente.email}
                        onChange={(e) => setNuovoCliente({ ...nuovoCliente, email: e.target.value })}
                        placeholder="Email"
                        className="border border-neutral-300 rounded-lg px-3 py-1.5 text-sm bg-white" />
                      <p className="col-span-2 text-[11px] text-indigo-700/80">
                        Il cliente verra' creato nell'anagrafica CRM al salvataggio (origine: preventivo).
                      </p>
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-neutral-600 font-medium">Tipo</label>
                    <select value={form.tipo} onChange={(e) => setForm({ ...form, tipo: e.target.value })}
                      className="w-full mt-1 border border-neutral-300 rounded-lg px-3 py-1.5 text-sm">
                      <option value="cena_privata">Cena privata</option>
                      <option value="aperitivo">Aperitivo</option>
                      <option value="degustazione">Degustazione</option>
                      <option value="catering">Catering</option>
                      <option value="altro">Altro</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-neutral-600 font-medium">Canale</label>
                    <select value={form.canale} onChange={(e) => setForm({ ...form, canale: e.target.value })}
                      className="w-full mt-1 border border-neutral-300 rounded-lg px-3 py-1.5 text-sm">
                      <option value="whatsapp">WhatsApp</option>
                      <option value="email">Email</option>
                      <option value="telefono">Telefono</option>
                      <option value="di_persona">Di persona</option>
                      <option value="sito">Sito web</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="text-xs text-neutral-600 font-medium">Data evento</label>
                    <input type="date" value={form.data_evento}
                      onChange={(e) => setForm({ ...form, data_evento: e.target.value })}
                      className="w-full mt-1 border border-neutral-300 rounded-lg px-3 py-1.5 text-sm" />
                  </div>
                  <div>
                    <label className="text-xs text-neutral-600 font-medium">Ora</label>
                    <input type="time" value={form.ora_evento}
                      onChange={(e) => setForm({ ...form, ora_evento: e.target.value })}
                      className="w-full mt-1 border border-neutral-300 rounded-lg px-3 py-1.5 text-sm" />
                  </div>
                  <div>
                    <label className="text-xs text-neutral-600 font-medium">N. persone</label>
                    <input type="number" min="1" value={form.n_persone}
                      onChange={(e) => setForm({ ...form, n_persone: e.target.value })}
                      className="w-full mt-1 border border-neutral-300 rounded-lg px-3 py-1.5 text-sm" />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-neutral-600 font-medium">Luogo</label>
                    <select value={form.luogo} onChange={(e) => setForm({ ...form, luogo: e.target.value })}
                      className="w-full mt-1 border border-neutral-300 rounded-lg px-3 py-1.5 text-sm">
                      {luoghi.map((l) => <option key={l} value={l}>{l}</option>)}
                      {/* Preserva un valore legacy che non sia piu' in config */}
                      {form.luogo && !luoghi.includes(form.luogo) && (
                        <option value={form.luogo}>{form.luogo} (non configurato)</option>
                      )}
                    </select>
                    <p className="text-[11px] text-neutral-400 mt-1">Gestisci i luoghi in Impostazioni → Luoghi.</p>
                  </div>
                  <div>
                    <label className="text-xs text-neutral-600 font-medium">Scadenza conferma</label>
                    <input type="date" value={form.scadenza_conferma}
                      onChange={(e) => setForm({ ...form, scadenza_conferma: e.target.value })}
                      className="w-full mt-1 border border-neutral-300 rounded-lg px-3 py-1.5 text-sm" />
                  </div>
                </div>
              </div>

              {/* ── COMPONI MENU DAL RICETTARIO (snapshot, mig 075) ──
                  Sempre visibile. Se siamo su /nuovo senza preventivoId il
                  composer chiama onEnsureSaved che crea una bozza automatica
                  (is_bozza_auto=1) al primo tocco — URL resta /nuovo finche'
                  l'utente non clicca "Salva". */}
              <PreventivoMenuComposer
                preventivoId={prevId}
                nPersone={form.n_persone}
                onEnsureSaved={ensureSaved}
                onTotaleMenuChange={(data) => {
                  handleMenuTotaleChange(data);
                  refreshMenuCount();
                }}
                onToast={showToast}
              />
              {!isNew && bozzaAuto && (
                <div className="bg-orange-50 border border-orange-200 rounded-lg px-3 py-2 text-xs text-orange-800">
                  ⚠️ Preventivo <span className="font-semibold">non salvato</span>: è stato compilato ma non è mai stato confermato.
                  Controlla i dati e premi <span className="font-semibold">«Salva modifiche»</span> per tenerlo.
                </div>
              )}
              {isNew && prevId && (
                <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-xs text-amber-800">
                  ⏳ Bozza in compilazione — ricorda di cliccare <span className="font-semibold">"{isNew ? "Crea preventivo" : "Salva"}"</span> per finalizzarla.
                </div>
              )}

              {/* ── MENU PROPOSTO testuale (fallback / integrazione libera) ── */}
              <div className="bg-white rounded-xl border border-neutral-200 shadow-sm p-5 space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-neutral-700">🍽 Menu proposto (testo libero)</h3>
                  <span className="text-[11px] text-neutral-400">
                    {menuSnapshot.n_righe > 0 ? "Prezzo auto-calcolato dalle righe snapshot" : "Prezzo a persona × coperti"}
                  </span>
                </div>

                <div className="grid grid-cols-[1fr_140px] gap-3">
                  <div>
                    <label className="text-xs text-neutral-600 font-medium">Nome menu</label>
                    <input type="text" value={form.menu_nome}
                      onChange={(e) => setForm({ ...form, menu_nome: e.target.value })}
                      placeholder="es. Menu Degustazione 5 portate"
                      className="w-full mt-1 border border-neutral-300 rounded-lg px-3 py-1.5 text-sm" />
                  </div>
                  <div>
                    <label className="text-xs text-neutral-600 font-medium">
                      Prezzo a persona (€)
                      {menuSnapshot.n_righe > 0 && <span className="ml-1 text-[10px] text-indigo-600">🔒 auto</span>}
                    </label>
                    <input type="number" min="0" step="0.5" value={form.menu_prezzo_persona}
                      onChange={(e) => setForm({ ...form, menu_prezzo_persona: e.target.value })}
                      placeholder="0.00"
                      disabled={menuSnapshot.n_righe > 0}
                      className={`w-full mt-1 border border-neutral-300 rounded-lg px-3 py-1.5 text-sm text-right ${menuSnapshot.n_righe > 0 ? "bg-neutral-100 text-neutral-500" : ""}`} />
                  </div>
                </div>

                <div>
                  <label className="text-xs text-neutral-600 font-medium">Composizione menu</label>
                  <textarea value={form.menu_descrizione}
                    onChange={(e) => setForm({ ...form, menu_descrizione: e.target.value })}
                    placeholder={MENU_PLACEHOLDER}
                    rows={10}
                    className="w-full mt-1 border border-neutral-300 rounded-lg px-3 py-2 text-sm font-mono leading-relaxed resize-y" />
                  <p className="text-[11px] text-neutral-400 mt-1">
                    Struttura libera per portata (Antipasti, Primi, Secondi, Dolce, Vino). Andrà così com'è nel PDF e nel messaggio al cliente.
                  </p>
                </div>

                <div className="flex items-baseline justify-between pt-2 border-t border-neutral-100">
                  <span className="text-xs text-neutral-500">
                    {!form.n_persone ? "Imposta N. persone per calcolare"
                      : alternative ? `${form.n_persone} coperti × ${menuAlt.menus.length} menu alternativi`
                      : `${form.n_persone} coperti × €${prezzoMenuTot.toFixed(2)}${menuScelto ? ` (${menuScelto.nome})` : ""}`}
                  </span>
                  <span className="text-sm font-semibold text-neutral-900">
                    Subtotale menu: {alternative && menuTotMin !== menuTotMax
                      ? `da €${fmtEuro(menuTotMin)} a €${fmtEuro(menuTotMax)}`
                      : `€${fmtEuro(menuTotMin)}`}
                  </span>
                </div>
              </div>

              {/* ── EXTRA LIBERI (righe) ── */}
              <div className="bg-white rounded-xl border border-neutral-200 shadow-sm p-5">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <h3 className="text-sm font-semibold text-neutral-700">➕ Extra</h3>
                    <p className="text-[11px] text-neutral-400">Voci aggiuntive libere: noleggio attrezzatura, tovagliato, supplementi, sconti…</p>
                  </div>
                  <Btn variant="chip" tone="violet" size="sm" onClick={aggiungiRiga}>
                    + Aggiungi riga
                  </Btn>
                </div>

                {righe.length === 0 ? (
                  <div className="text-center py-4 text-xs text-neutral-400 border border-dashed border-neutral-200 rounded-lg">
                    Nessun extra. Il totale sarà calcolato solo dal menu × coperti.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {/* Header */}
                    <div className="grid grid-cols-[1fr_70px_90px_90px_80px_60px] gap-2 text-[10px] text-neutral-500 uppercase font-medium px-1">
                      <span>Descrizione</span>
                      <span className="text-center">Qtà</span>
                      <span className="text-right">Prezzo un.</span>
                      <span className="text-right">Totale</span>
                      <span className="text-center">Tipo</span>
                      <span></span>
                    </div>

                    {righe.map((r, idx) => {
                      const tot = (parseFloat(r.qta) || 0) * (parseFloat(r.prezzo_unitario) || 0);
                      return (
                        <div key={idx} className="grid grid-cols-[1fr_70px_90px_90px_80px_60px] gap-2 items-center">
                          <input type="text" value={r.descrizione}
                            onChange={(e) => updateRiga(idx, "descrizione", e.target.value)}
                            placeholder="es. Noleggio tovagliato, mise en place..."
                            className="border border-neutral-200 rounded px-2 py-1.5 text-sm" />
                          <input type="number" min="0" step="0.5" value={r.qta}
                            onChange={(e) => updateRiga(idx, "qta", e.target.value)}
                            className="border border-neutral-200 rounded px-2 py-1.5 text-sm text-center" />
                          <input type="number" min="0" step="0.01" value={r.prezzo_unitario}
                            onChange={(e) => updateRiga(idx, "prezzo_unitario", e.target.value)}
                            className="border border-neutral-200 rounded px-2 py-1.5 text-sm text-right" />
                          <div className={`text-sm text-right font-medium px-2 ${r.tipo_riga === "sconto" ? "text-red-600" : "text-neutral-900"}`}>
                            {r.tipo_riga === "sconto" ? "-" : ""}€{Math.abs(tot).toFixed(2)}
                          </div>
                          <select value={r.tipo_riga || "voce"}
                            onChange={(e) => updateRiga(idx, "tipo_riga", e.target.value)}
                            className="border border-neutral-200 rounded px-1 py-1.5 text-[11px]">
                            <option value="voce">Voce</option>
                            <option value="sconto">Sconto</option>
                            <option value="supplemento">Suppl.</option>
                            <option value="nota">Nota</option>
                          </select>
                          <div className="flex items-center gap-0.5 justify-center">
                            <button onClick={() => spostaRiga(idx, -1)} disabled={idx === 0}
                              className="text-neutral-300 hover:text-neutral-500 disabled:opacity-30 text-xs">▲</button>
                            <button onClick={() => spostaRiga(idx, 1)} disabled={idx === righe.length - 1}
                              className="text-neutral-300 hover:text-neutral-500 disabled:opacity-30 text-xs">▼</button>
                            <button onClick={() => rimuoviRiga(idx)}
                              className="text-red-300 hover:text-red-500 text-xs ml-1">✕</button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Totale live */}
                <div className="mt-4 pt-3 border-t border-neutral-200 space-y-1">
                  {righe.length > 0 && (
                    <div className="flex justify-end text-xs text-neutral-500">
                      Subtotale extra: €{extraTot.toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </div>
                  )}
                  <div className="flex justify-end items-baseline">
                    <span className="text-xs text-neutral-500 mr-3">TOTALE</span>
                    <span className="text-xl font-bold text-indigo-700">{totaleTesto}</span>
                  </div>
                </div>
              </div>

              {/* ── NOTE ── */}
              <div className="bg-white rounded-xl border border-neutral-200 shadow-sm p-5">
                <div className="flex gap-2 mb-3">
                  <button onClick={() => setNoteTab("interne")}
                    className={`text-xs px-3 py-1 rounded-lg font-medium transition ${noteTab === "interne" ? "bg-neutral-900 text-white" : "bg-neutral-100 text-neutral-600 hover:bg-neutral-200"}`}>
                    Note interne (staff)
                  </button>
                  <button onClick={() => setNoteTab("cliente")}
                    className={`text-xs px-3 py-1 rounded-lg font-medium transition ${noteTab === "cliente" ? "bg-neutral-900 text-white" : "bg-neutral-100 text-neutral-600 hover:bg-neutral-200"}`}>
                    Note per il cliente
                  </button>
                  <button onClick={() => setNoteTab("condizioni")}
                    className={`text-xs px-3 py-1 rounded-lg font-medium transition ${noteTab === "condizioni" ? "bg-neutral-900 text-white" : "bg-neutral-100 text-neutral-600 hover:bg-neutral-200"}`}>
                    Condizioni
                  </button>
                </div>
                {noteTab === "interne" && (
                  <textarea value={form.note_interne} onChange={(e) => setForm({ ...form, note_interne: e.target.value })}
                    placeholder="Note visibili solo allo staff..."
                    rows={3} className="w-full border border-neutral-200 rounded-lg px-3 py-2 text-sm resize-none" />
                )}
                {noteTab === "cliente" && (
                  <textarea value={form.note_cliente} onChange={(e) => setForm({ ...form, note_cliente: e.target.value })}
                    placeholder="Note che andranno nel messaggio/PDF al cliente..."
                    rows={3} className="w-full border border-neutral-200 rounded-lg px-3 py-2 text-sm resize-none" />
                )}
                {noteTab === "condizioni" && (
                  <textarea value={form.condizioni} onChange={(e) => setForm({ ...form, condizioni: e.target.value })}
                    placeholder="Acconto richiesto, conferma entro..., politica cancellazione..."
                    rows={3} className="w-full border border-neutral-200 rounded-lg px-3 py-2 text-sm resize-none" />
                )}
              </div>
            </div>

            {/* ── SIDEBAR AZIONI ── */}
            <div className="w-52 flex-shrink-0 hidden lg:block">
              <div className="bg-white rounded-xl border border-neutral-200 shadow-sm p-4 space-y-3 sticky top-6">
                <h3 className="text-xs font-semibold text-neutral-500 uppercase tracking-wider">Azioni</h3>

                <Btn variant="chip" tone="violet" size="md" onClick={handleSalva} disabled={saving} loading={saving} className="w-full">
                  {saving ? "Salvataggio..." : isNew ? "Crea preventivo" : "Salva modifiche"}
                </Btn>

                {!isNew && (
                  <>
                    {transizioniDisp.length > 0 && (
                      <div className="space-y-1.5">
                        <span className="text-[10px] text-neutral-400 uppercase">Cambia stato</span>
                        {transizioniDisp.map((s) => (
                          <button key={s} onClick={() => handleCambiaStato(s)}
                            className="w-full text-left px-3 py-1.5 text-xs rounded-lg border border-neutral-200 hover:bg-neutral-50 transition">
                            → {STATI_LABEL[s]}
                          </button>
                        ))}
                      </div>
                    )}

                    {["confermato", "prenotato"].includes(stato) && (
                      <Btn variant="chip" tone="emerald" size="sm" onClick={() => eseguiConferma(null)} disabled={confermando}
                        className="w-full justify-start" title="Riscrive il menù sulla prenotazione, riavvisa sala e cucina e prepara il messaggio per i gruppi">
                        📣 Avvisa sala e cucina
                      </Btn>
                    )}

                    <hr className="border-neutral-200" />

                    <Btn variant="chip" tone="blue" size="sm" onClick={handlePDF} className="w-full justify-start">
                      📥 Scarica PDF
                    </Btn>

                    <Btn variant="chip" tone="emerald" size="sm" onClick={handleApriInvio} className="w-full justify-start"
                      title="Salva e apre l'invio: WhatsApp (testo completo + PDF) o email col PDF allegato">
                      📨 Invia al cliente
                    </Btn>

                    <Btn variant="ghost" size="sm" onClick={handleCopiaTesto} className="w-full justify-start"
                      title="Copia il testo del preventivo, per email o altro (dati salvati)">
                      📋 Copia testo
                    </Btn>

                    <Btn variant="ghost" size="sm" onClick={handleDuplica} className="w-full justify-start">
                      📄 Duplica
                    </Btn>

                    <Btn variant="chip" tone="red" size="sm" onClick={handleElimina} className="w-full justify-start">
                      🗑 Elimina
                    </Btn>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* ── BARRA MOBILE AZIONI ── */}
          <div className="lg:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-neutral-200 px-4 py-3 flex gap-2 z-30">
            <button onClick={handleSalva} disabled={saving}
              className="flex-1 px-4 py-2.5 bg-indigo-600 text-white rounded-lg text-sm font-medium">
              {saving ? "..." : isNew ? "Crea" : "Salva"}
            </button>
            {!isNew && transizioniDisp.length > 0 && (
              <button onClick={() => handleCambiaStato(transizioniDisp[0])}
                className="px-4 py-2.5 border border-neutral-300 rounded-lg text-sm">
                → {STATI_LABEL[transizioniDisp[0]]}
              </button>
            )}
            {!isNew && (
              <button onClick={handleApriInvio} title="Invia al cliente (WhatsApp / email)"
                className="px-4 py-2.5 border border-emerald-200 bg-emerald-50 text-emerald-700 rounded-lg text-sm">
                📨
              </button>
            )}
          </div>
        </div>
      </div>

      {invioOpen && prevId && (
        <PreventivoInvioModal
          prevId={prevId}
          numero={numero}
          clienteNome={clienteNome}
          onClose={() => setInvioOpen(false)}
          onInviato={(s) => s && setStato(s)}
          showToast={showToast}
        />
      )}

      {sceltaMenuOpen && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setSceltaMenuOpen(false)}>
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-5 space-y-3" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-base font-semibold text-neutral-900">Quale menù ha scelto?</h3>
            <p className="text-xs text-neutral-500">Va sulla prenotazione e nel messaggio a sala e cucina.</p>
            <div className="space-y-2">
              {menuAlt.menus.map((m) => (
                <button key={m.id} onClick={() => eseguiConferma(m.id)} disabled={confermando}
                  className="w-full text-left px-4 min-h-[48px] rounded-lg border border-neutral-200 hover:bg-emerald-50 hover:border-emerald-300 text-sm flex justify-between items-center">
                  <span>{m.nome}</span><span className="text-neutral-500">€{fmtEuro(m.prezzo_persona)}</span>
                </button>
              ))}
            </div>
            <Btn variant="ghost" size="md" onClick={() => setSceltaMenuOpen(false)} className="w-full">Annulla</Btn>
          </div>
        </div>
      )}

      {esitoConferma && (
        <PreventivoAvvisoStaff esito={esitoConferma} onClose={() => setEsitoConferma(null)} showToast={showToast} />
      )}

      {/* TOAST */}
      {toast && (
        <div className={`fixed bottom-20 lg:bottom-6 right-6 z-50 px-4 py-2.5 rounded-lg shadow-lg text-sm font-medium transition-all ${toast.isError ? "bg-red-600 text-white" : "bg-neutral-900 text-white"}`}>
          {toast.msg}
        </div>
      )}
    </>
  );
}
