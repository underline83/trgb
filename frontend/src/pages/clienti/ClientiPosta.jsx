// @version: v1.5 (2026-11-20) — bozze preparate da Q: chip «📝 bozza di Q» nell'elenco; trgb@ → «Rispondi» già compilato;
//   altre caselle → riquadro con la bozza (è nelle Bozze di Mail), «Invia da qui» con conferma, «Annulla bozza»
// v1.4 (2026-11-20) — mail «messe da parte» da Marco (cancellate/archiviate da Mail, o lette nel cestino): chip grigio, niente pallino, fuori da «Da rispondere»
// v1.3 (2026-11-20) — la mail aperta resta in vista: su schermo largo il riquadro di lettura scorre con la pagina
//   (sticky, con scroll suo), su telefono aprendo una mail si torna in cima
// v1.2 (2026-11-19) — tutte le caselle del locale insieme, selettore per casella (Tutte · trgb · info · …):
//   le altre caselle da GET /email/posta (sola lettura: letta/risposto dal server, spam e cestino, PEC), la casella
//   del gestionale com'era (Da gestire/Gestite, preventivi, Rispondi)
// v1.1 (2026-11-16) — «↩️ Rispondi»: risposta dalla casella del gestionale, nella stessa conversazione
// v1.0 (2026-11-13) — «📥 Posta»: tutta la posta in arrivo della casella del gestionale
// Modulo: clienti (pagina) — dati dal mattone M.D lettura (GET /email/in, solo admin)
// Elenco a sinistra (filtri nuove/gestite, collegate/non collegate, ricerca), mail aperta a
// destra. Il testo è già testo semplice ripulito lato server e qui si mostra SOLO come testo
// (whitespace-pre-wrap): niente HTML, niente immagini remote, niente link cliccabili.
// Da v1.1 si risponde: la mail parte solo col clic su «Invia» (POST /email/in/{id}/rispondi).
import React, { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { API_BASE, apiFetch } from "../../config/api";
import ClientiNav from "./ClientiNav";
import { Btn, StatusBadge, EmptyState } from "../../components/ui";

const ABBINAMENTO_LABEL = {
  in_reply_to: "risposta a un invio",
  numero: "numero nell'oggetto",
  mittente: "indirizzo del cliente",
  nessuno: "non collegata",
};

const PERIODI = [
  { v: "7", l: "7 giorni" },
  { v: "30", l: "30 giorni" },
  { v: "90", l: "90 giorni" },
  { v: "", l: "Tutto" },
];

function fmtData(s) {
  if (!s) return "";
  const oggi = new Date().toISOString().slice(0, 10);
  return s.slice(0, 10) === oggi ? s.slice(11, 16) : `${s.slice(8, 10)}/${s.slice(5, 7)} ${s.slice(11, 16)}`;
}

function fmtDataLunga(s) {
  return s ? `${s.slice(8, 10)}/${s.slice(5, 7)}/${s.slice(0, 4)} ${s.slice(11, 16)}` : "";
}

const CARTELLE = [
  { v: "in_arrivo,spam,cestino", l: "Tutte le cartelle" },
  { v: "in_arrivo", l: "In arrivo" },
  { v: "spam", l: "Spam" },
  { v: "cestino", l: "Cestino" },
];

// Nome corto della casella per i chip: il nome dato in Impostazioni, se no la parte prima della @
function nomeCasella(c) {
  if (!c) return "";
  if (c.nome) return c.nome;
  return c.indirizzo.includes("pec") ? `PEC ${c.indirizzo.split("@")[0]}@` : `${c.indirizzo.split("@")[0]}@`;
}

function kb(n) {
  if (!n && n !== 0) return "";
  return n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`;
}

export default function ClientiPosta() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  // casella: "tutte" | "trgb" (quella del gestionale, coi preventivi) | id di un'altra casella
  const [casella, setCasella] = useState(params.get("id") ? "trgb" : "tutte");
  const [caselle, setCaselle] = useState([]);
  const [daRispondere, setDaRispondere] = useState(true);
  const [cartella, setCartella] = useState(CARTELLE[0].v);
  const [vediMassive, setVediMassive] = useState(false);
  const modoTrgb = casella === "trgb";
  const [stato, setStato] = useState("nuova");
  const [collegate, setCollegate] = useState("");   // "" | "si" | "no"
  const [periodo, setPeriodo] = useState("30");
  const [q, setQ] = useState("");
  const [qDeb, setQDeb] = useState("");
  const [dati, setDati] = useState(null);
  const [loading, setLoading] = useState(true);
  const [errore, setErrore] = useState("");
  const [aperta, setAperta] = useState(null);
  const [caricaMail, setCaricaMail] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [leggendo, setLeggendo] = useState(false);
  const [toast, setToast] = useState(null);
  const [risp, setRisp] = useState(null);        // composer aperto: {a, cc, oggetto, testo, cita, gestita, citazione}
  const [inviando, setInviando] = useState(false);
  const idAperta = params.get("id");       // mail della casella del gestionale
  const pidAperta = params.get("pid");     // mail di un'altra casella
  const pannello = useRef(null);           // riquadro della mail aperta: a ogni mail nuova si riparte dall'alto
  useEffect(() => { if (pannello.current) pannello.current.scrollTop = 0; }, [idAperta, pidAperta]);

  useEffect(() => {
    apiFetch(`${API_BASE}/email/caselle/`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d && setCaselle((d.caselle || []).filter((c) => c.attiva)))
      .catch(() => {});
  }, []);

  const showToast = (msg, isError = false) => {
    setToast({ msg, isError });
    setTimeout(() => setToast(null), isError ? 6000 : 2500);
  };

  useEffect(() => {
    const t = setTimeout(() => setQDeb(q.trim()), 300);
    return () => clearTimeout(t);
  }, [q]);

  const carica = useCallback(async () => {
    setLoading(true);
    setErrore("");
    try {
      if (!modoTrgb) {
        const p = new URLSearchParams();
        if (periodo) p.set("giorni", periodo);
        if (casella !== "tutte") p.set("casella", casella);
        p.set("anche_trgb", casella === "tutte" ? "true" : "false");
        p.set("dove", cartella);
        if (daRispondere) p.set("solo_da_rispondere", "true");
        if (qDeb) p.set("q", qDeb);
        p.set("limite", "300");
        const res = await apiFetch(`${API_BASE}/email/posta?${p}`);
        const d = await res.json();
        if (!res.ok) throw new Error(d.detail || `Errore ${res.status}`);
        setDati({ ...d, modo: "posta" });
        return;
      }
      const p = new URLSearchParams();
      if (stato) p.set("stato", stato);
      if (periodo) p.set("giorni", periodo);
      if (collegate === "no") p.set("abbinamento", "nessuno");
      if (qDeb) p.set("q", qDeb);
      p.set("limite", "300");
      const res = await apiFetch(`${API_BASE}/email/in?${p}`);
      const d = await res.json();
      if (!res.ok) throw new Error(d.detail || `Errore ${res.status}`);
      if (collegate === "si") d.mail = (d.mail || []).filter((m) => m.preventivo_id);
      setDati(d);
    } catch (e) {
      setErrore(e.message);
    } finally {
      setLoading(false);
    }
  }, [stato, periodo, collegate, qDeb, modoTrgb, casella, cartella, daRispondere]);

  useEffect(() => { carica(); }, [carica]);

  // Mail aperta: dall'URL (?id=), così si può tornare indietro e ricaricare
  useEffect(() => {
    if (!idAperta) { if (!pidAperta) setAperta(null); return; }
    let vivo = true;
    setCaricaMail(true);
    apiFetch(`${API_BASE}/email/in/${idAperta}`)
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw new Error(d.detail || `Errore ${r.status}`);
        return d;
      })
      .then((d) => { if (vivo) setAperta(d); })
      .catch((e) => { if (vivo) { setAperta(null); showToast(e.message, true); } })
      .finally(() => { if (vivo) setCaricaMail(false); });
    return () => { vivo = false; };
  }, [idAperta]);

  // Mail di un'altra casella: sola lettura (GET /email/posta/{id})
  useEffect(() => {
    if (!pidAperta) { if (!idAperta) setAperta(null); return; }
    let vivo = true;
    setCaricaMail(true);
    apiFetch(`${API_BASE}/email/posta/${pidAperta}`)
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw new Error(d.detail || `Errore ${r.status}`);
        return d;
      })
      .then((d) => { if (vivo) setAperta({ ...d, _casella: true }); })
      .catch((e) => { if (vivo) { setAperta(null); showToast(e.message, true); } })
      .finally(() => { if (vivo) setCaricaMail(false); });
    return () => { vivo = false; };
  }, [pidAperta]); // eslint-disable-line react-hooks/exhaustive-deps

  // fonte "casella" = altra casella (?pid=), altrimenti casella del gestionale (?id=)
  const apri = (id, fonte) => {
    setRisp(null);
    setParams(!id ? {} : fonte === "casella" ? { pid: String(id) } : { id: String(id) });
    // su telefono l'elenco sparisce e la mail prende il suo posto: si riparte dall'alto
    if (id && typeof window !== "undefined" && window.innerWidth < 1024) window.scrollTo({ top: 0, behavior: "smooth" });
  };
  const scegliCasella = (c) => { setCasella(c); apri(null); };

  const apriRisposta = async () => {
    try {
      const r = await apiFetch(`${API_BASE}/email/in/${aperta.id}/bozza-risposta`);
      const b = await r.json();
      if (!r.ok) throw new Error(b.detail || `Errore ${r.status}`);
      // bozza preparata da Q per questa mail? il «Rispondi» parte già compilato
      let bz = null;
      try {
        const rb = await apiFetch(`${API_BASE}/email/bozze?rif_fonte=trgb&rif_id=${aperta.id}`);
        if (rb.ok) bz = ((await rb.json()).bozze || [])[0] || null;
      } catch { /* senza bozza si scrive da zero */ }
      setRisp({ a: bz?.a || (b.a || []).join(", "), cc: bz ? (bz.cc || "") : (b.cc || []).join(", "),
        oggetto: bz?.oggetto || b.oggetto || "", testo: bz?.testo || "", cita: bz ? !!bz.cita : true, gestita: true,
        citazione: b.citazione || "", configurata: b.email_configurata, bozzaId: bz?.id || null, bozzaDa: bz?.creata_da || null });
    } catch (e) {
      showToast(e.message, true);
    }
  };

  const inviaRisposta = async () => {
    setInviando(true);
    try {
      const res = await apiFetch(`${API_BASE}/email/in/${aperta.id}/rispondi`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ testo: risp.testo, a: risp.a, cc: risp.cc, oggetto: risp.oggetto,
          cita: risp.cita, segna_gestita: risp.gestita }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.detail || `Errore ${res.status}`);
      if (d.mail) setAperta(d.mail);
      if (d.ok) {
        // la bozza di Q l'ha sostituita questa risposta: non resta in giro come «da mandare»
        if (risp.bozzaId) apiFetch(`${API_BASE}/email/bozze/${risp.bozzaId}/annulla`, { method: "POST" }).catch(() => {});
        setRisp(null);
        showToast(`Risposta inviata a ${risp.a}`);
        carica();
      } else {
        showToast(`Non partita: ${d.errore}`, true);
      }
    } catch (e) {
      showToast(e.message, true);
    } finally {
      setInviando(false);
    }
  };

  const cambiaStato = async (m, nuovo) => {
    setSalvando(true);
    try {
      const res = await apiFetch(`${API_BASE}/email/in/${m.id}/stato`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stato: nuovo }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.detail || `Errore ${res.status}`);
      setAperta(d);
      showToast(nuovo === "gestita" ? "Segnata come gestita" : "Riaperta");
      carica();
    } catch (e) {
      showToast(e.message, true);
    } finally {
      setSalvando(false);
    }
  };

  const leggiOra = async () => {
    setLeggendo(true);
    try {
      // casella del gestionale e/o altre caselle, secondo il selettore
      const giri = [];
      if (casella === "tutte" || modoTrgb) giri.push(apiFetch(`${API_BASE}/email/lettura/giro`, { method: "POST" }).then((r) => r.json()));
      if (!modoTrgb && caselle.length) {
        const q = casella === "tutte" ? "" : `?casella=${encodeURIComponent(casella)}`;
        giri.push(apiFetch(`${API_BASE}/email/caselle/giro${q}`, { method: "POST" }).then((r) => r.json()));
      }
      const esiti = await Promise.all(giri);
      const nuove = esiti.reduce((t, d) => t + (d.nuove || 0), 0);
      const errori = esiti.flatMap((d) => [
        ...(d.esito === "errore" && d.errore ? [d.errore] : []),
        ...((d.caselle || []).filter((c) => c.esito === "errore").map((c) => `${c.casella}: ${c.errore}`)),
        ...(d.esito === "saltato" ? [d.nota] : []),
      ]);
      if (errori.length) showToast(`Non tutto letto — ${errori.join(" · ")}`, true);
      else showToast(nuove ? `${nuove} ${nuove === 1 ? "mail nuova" : "mail nuove"}` : "Nessuna mail nuova");
      carica();
    } catch (e) {
      showToast(e.message, true);
    } finally {
      setLeggendo(false);
    }
  };

  const mail = dati?.mail || [];
  const agg = modoTrgb ? dati?.aggiornamento : dati?.trgb_aggiornamento;
  const massive = (!modoTrgb && dati?.massive) || [];
  const caselleKo = (!modoTrgb && dati?.caselle ? dati.caselle : []).filter((c) => c.attiva && c.errori_di_fila > 0);
  const daRispondereN = !modoTrgb ? mail.filter((m) => !m.risposto && !m.scartata && m.stato_trgb !== "gestita").length : 0;
  const etichetta = (indirizzo) => nomeCasella(caselle.find((c) => c.indirizzo === indirizzo)) || indirizzo;
  const apertaTrgb = aperta && !aperta._casella;

  const chip = (attivo, onClick, label) => (
    <button type="button" onClick={onClick}
      className={`px-3 py-1.5 min-h-[36px] rounded-lg text-xs font-medium border transition ${attivo ? "bg-teal-600 text-white border-teal-600" : "bg-white text-neutral-600 border-neutral-200 hover:bg-neutral-50"}`}>
      {label}
    </button>
  );

  return (
    <>
      <ClientiNav current="posta" />
      <div className="min-h-screen bg-brand-cream">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
          <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
            <div>
              <h1 className="text-2xl font-bold text-neutral-900" style={{ fontFamily: "'Playfair Display', serif" }}>📥 Posta</h1>
              <p className="text-sm text-neutral-500 mt-1">
                {modoTrgb
                  ? <>La casella del gestionale, letta in sola lettura ogni pochi minuti
                      {agg?.ultimo_ok ? ` · ultima lettura ${fmtData(agg.ultimo_ok)}` : ""}
                      {dati && dati.nuove_in_casella !== undefined ? ` · ${dati.nuove_in_casella} da gestire` : ""}</>
                  : <>{casella === "tutte" ? "Tutte le caselle del locale" : etichetta(caselle.find((c) => c.id === casella)?.indirizzo)},
                      lette in sola lettura ogni pochi minuti{dati && daRispondere ? ` · ${daRispondereN} da rispondere` : ""}</>}
              </p>
              {caselleKo.map((c) => (
                <p key={c.casella} className="text-xs text-amber-700 mt-1" title={c.ultimo_errore || ""}>
                  ⚠️ {c.casella}: le ultime {c.errori_di_fila} letture non sono andate — {c.ultimo_errore}
                </p>
              ))}
              {agg && agg.errori_di_fila > 0 && (
                <p className="text-xs text-amber-700 mt-1" title={agg.ultimo_errore || ""}>
                  ⚠️ Le ultime {agg.errori_di_fila} letture non sono andate: {agg.ultimo_errore}
                </p>
              )}
            </div>
            <Btn variant="secondary" size="md" onClick={leggiOra} loading={leggendo} disabled={leggendo}>
              ↻ Leggi adesso
            </Btn>
          </div>

          {/* Selettore casella */}
          <div className="flex flex-wrap gap-1 mb-2">
            {chip(casella === "tutte", () => scegliCasella("tutte"), "📬 Tutte")}
            {chip(modoTrgb, () => scegliCasella("trgb"), "📋 trgb@ (preventivi)")}
            {caselle.map((c) => (
              <span key={c.id}>{chip(casella === c.id, () => scegliCasella(c.id), nomeCasella(c))}</span>
            ))}
          </div>

          {/* Filtri */}
          <div className="bg-white rounded-xl border border-neutral-200 shadow-sm p-3 mb-4 flex flex-wrap items-center gap-2">
            {modoTrgb ? (
              <>
                <div className="flex gap-1">
                  {chip(stato === "nuova", () => setStato("nuova"), "Da gestire")}
                  {chip(stato === "gestita", () => setStato("gestita"), "Gestite")}
                  {chip(stato === "", () => setStato(""), "Tutte")}
                </div>
                <span className="hidden sm:inline text-neutral-200">|</span>
                <div className="flex gap-1">
                  {chip(collegate === "", () => setCollegate(""), "Tutte")}
                  {chip(collegate === "si", () => setCollegate("si"), "📋 Con preventivo")}
                  {chip(collegate === "no", () => setCollegate("no"), "Non collegate")}
                </div>
              </>
            ) : (
              <>
                <div className="flex gap-1">
                  {chip(daRispondere, () => setDaRispondere(true), "Da rispondere")}
                  {chip(!daRispondere, () => setDaRispondere(false), "Tutte")}
                </div>
                <span className="hidden sm:inline text-neutral-200">|</span>
                <div className="flex flex-wrap gap-1">
                  {CARTELLE.map((c) => <span key={c.v}>{chip(cartella === c.v, () => setCartella(c.v), c.l)}</span>)}
                </div>
              </>
            )}
            <select value={periodo} onChange={(e) => setPeriodo(e.target.value)}
              className="border border-neutral-200 rounded-lg px-2 py-1.5 text-xs bg-white min-h-[36px]">
              {PERIODI.map((p) => <option key={p.v} value={p.v}>{p.l}</option>)}
            </select>
            <input type="search" value={q} onChange={(e) => setQ(e.target.value)}
              placeholder="Cerca mittente, oggetto, testo…"
              className="flex-1 min-w-[180px] border border-neutral-200 rounded-lg px-3 py-1.5 text-sm min-h-[36px]" />
          </div>

          {errore && <div className="mb-4 px-4 py-3 rounded-lg text-sm bg-red-50 border border-red-200 text-red-800">{errore}</div>}

          <div className="flex flex-col lg:flex-row gap-4">
            {/* ELENCO */}
            <div className={`${aperta || caricaMail ? "hidden lg:block" : ""} lg:w-[42%] flex-shrink-0`}>
              <div className="bg-white rounded-xl border border-neutral-200 shadow-sm overflow-hidden">
                {loading && !dati ? (
                  <p className="p-6 text-sm text-neutral-400">Caricamento…</p>
                ) : mail.length === 0 ? (
                  <EmptyState icon="📭" title="Nessuna mail"
                    description={stato === "nuova" ? "Niente da gestire con questi filtri." : "Nessuna mail con questi filtri."} />
                ) : (
                  <ul className="divide-y divide-neutral-100">
                    {mail.map((m) => {
                      if (!modoTrgb && m.fonte === "casella") {
                        const sel = String(m.id) === String(pidAperta);
                        return <RigaCasella key={`c${m.id}`} m={m} sel={sel} onClick={() => apri(m.id, "casella")}
                          etichetta={casella === "tutte" ? etichetta(m.casella) : null} />;
                      }
                      const sel = String(m.id) === String(idAperta);
                      return (
                        <li key={`t${m.id}`}>
                          <button type="button" onClick={() => apri(m.id, "trgb")}
                            className={`w-full text-left px-4 py-3 min-h-[44px] transition ${sel ? "bg-teal-50" : "hover:bg-neutral-50"}`}>
                            <div className="flex items-baseline gap-2">
                              {(m.stato || m.stato_trgb) === "nuova" && <span className="w-2 h-2 rounded-full bg-red-500 flex-shrink-0 translate-y-[-1px]" title="Da gestire" />}
                              <span className={`truncate text-sm ${(m.stato || m.stato_trgb) === "nuova" ? "font-semibold text-neutral-900" : "text-neutral-700"}`}>
                                {m.mittente_nome || m.mittente || "(mittente sconosciuto)"}
                              </span>
                              <span className="ml-auto text-[11px] text-neutral-400 whitespace-nowrap">{fmtData(m.data)}</span>
                            </div>
                            <div className="text-sm text-neutral-800 truncate mt-0.5">
                              {m.n_allegati > 0 && <span className="mr-1">📎</span>}
                              {m.oggetto || "(senza oggetto)"}
                            </div>
                            <div className="text-xs text-neutral-500 truncate mt-0.5">{(m.estratto || "").replace(/\s+/g, " ")}</div>
                            <div className="flex flex-wrap gap-1 mt-1">
                              {!modoTrgb && casella === "tutte" && (
                                <span className="text-[10px] px-1.5 py-0.5 rounded bg-teal-100 text-teal-800 font-medium">trgb@</span>
                              )}
                              {m.preventivo ? (
                                <span className="text-[10px] px-1.5 py-0.5 rounded bg-indigo-100 text-indigo-700 font-medium">
                                  📋 {m.preventivo.numero}{(m.preventivo.cliente || m.preventivo.titolo) ? ` · ${m.preventivo.cliente || m.preventivo.titolo}` : ""}
                                </span>
                              ) : (
                                <span className="text-[10px] px-1.5 py-0.5 rounded bg-neutral-100 text-neutral-500">non collegata</span>
                              )}
                              {m.bozza && (
                                <span className="text-[10px] px-1.5 py-0.5 rounded bg-violet-100 text-violet-800">📝 bozza di {m.bozza.creata_da || "Q"}</span>
                              )}
                              {(m.cc_nuovi || []).length > 0 && (
                                <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-800">👤 cc nuovi</span>
                              )}
                            </div>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
                {massive.length > 0 && (
                  <div className="border-t border-neutral-200">
                    <button type="button" onClick={() => setVediMassive((v) => !v)}
                      className="w-full text-left px-4 py-3 min-h-[44px] text-xs text-neutral-500 hover:bg-neutral-50">
                      📰 Newsletter e notifiche automatiche: {dati.n_massive || massive.length} {vediMassive ? "▲" : "▼"}
                    </button>
                    {vediMassive && (
                      <ul className="divide-y divide-neutral-100">
                        {massive.map((m) => (
                          <li key={`m${m.id}`}>
                            <button type="button" onClick={() => apri(m.id, "casella")}
                              className={`w-full text-left px-4 py-2 min-h-[44px] text-xs transition ${String(m.id) === String(pidAperta) ? "bg-teal-50" : "hover:bg-neutral-50"}`}>
                              <div className="flex gap-2">
                                <span className="truncate text-neutral-600">{m.mittente_nome || m.mittente}</span>
                                <span className="ml-auto text-neutral-400 whitespace-nowrap">{fmtData(m.data)}</span>
                              </div>
                              <div className="truncate text-neutral-700">{m.oggetto || "(senza oggetto)"}</div>
                              <div className="text-[10px] text-neutral-400">
                                {casella === "tutte" ? `${etichetta(m.casella)} · ` : ""}{m.dove !== "posta in arrivo" ? `${m.dove} · ` : ""}{m.perche}
                              </div>
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* MAIL APERTA */}
            <div ref={pannello} className={`${aperta || caricaMail ? "" : "hidden lg:block"} flex-1 min-w-0 lg:sticky lg:top-20 lg:self-start lg:max-h-[calc(100vh-6rem)] lg:overflow-y-auto`}>
              {caricaMail && !aperta ? (
                <div className="bg-white rounded-xl border border-neutral-200 shadow-sm p-6 text-sm text-neutral-400">Caricamento…</div>
              ) : !aperta ? (
                <div className="bg-white rounded-xl border border-dashed border-neutral-200 p-10 text-center text-sm text-neutral-400">
                  Scegli una mail dall'elenco
                </div>
              ) : aperta._casella ? (
                <MailCasella m={aperta} etichetta={etichetta} onChiudi={() => apri(null)}
                  onAggiorna={() => { carica(); const id = pidAperta; setParams({}); setTimeout(() => setParams({ pid: id }), 0); }}
                  toast={showToast} />
              ) : (
                <div className="bg-white rounded-xl border border-neutral-200 shadow-sm p-5 space-y-4">
                  <button type="button" onClick={() => apri(null)}
                    className="lg:hidden text-sm text-teal-700 font-medium min-h-[44px]">← Elenco</button>

                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <h2 className="text-lg font-semibold text-neutral-900 break-words">{aperta.oggetto || "(senza oggetto)"}</h2>
                    <StatusBadge tone={aperta.stato === "nuova" ? "danger" : "success"} dot>
                      {aperta.stato === "nuova" ? "Da gestire" : "Gestita"}
                    </StatusBadge>
                  </div>

                  <dl className="text-xs text-neutral-600 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
                    <dt className="text-neutral-400">Da</dt>
                    <dd className="break-all">{aperta.mittente_nome ? `${aperta.mittente_nome} <${aperta.mittente}>` : aperta.mittente}</dd>
                    <dt className="text-neutral-400">A</dt>
                    <dd className="break-all">{aperta.a || "—"}</dd>
                    {aperta.cc && (<><dt className="text-neutral-400">Cc</dt><dd className="break-all">{aperta.cc}</dd></>)}
                    <dt className="text-neutral-400">Data</dt>
                    <dd>{fmtDataLunga(aperta.data)}</dd>
                  </dl>

                  {/* Preventivo collegato */}
                  {aperta.preventivo ? (
                    <div className="rounded-lg border border-indigo-200 bg-indigo-50/50 px-3 py-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                      <span className="font-semibold text-indigo-800">📋 {aperta.preventivo.numero}</span>
                      <span className="text-neutral-700">{aperta.preventivo.cliente || aperta.preventivo.titolo}</span>
                      {aperta.preventivo.data_evento && (
                        <span className="text-neutral-500">
                          evento {aperta.preventivo.data_evento.split("-").reverse().join("/")}
                          {aperta.preventivo.ora_evento ? ` ${aperta.preventivo.ora_evento}` : ""}
                          {aperta.preventivo.n_persone ? ` · ${aperta.preventivo.n_persone} pers.` : ""}
                        </span>
                      )}
                      {aperta.preventivo.scadenza_conferma && (
                        <span className="text-amber-700">conferma entro {aperta.preventivo.scadenza_conferma.split("-").reverse().join("/")}</span>
                      )}
                      <span className="text-neutral-400">collegata per {ABBINAMENTO_LABEL[aperta.abbinamento] || aperta.abbinamento}</span>
                      <Btn variant="chip" tone="violet" size="sm" className="ml-auto"
                        onClick={() => navigate(`/clienti/preventivi/${aperta.preventivo.id}`)}>
                        Apri il preventivo →
                      </Btn>
                    </div>
                  ) : (
                    <div className="rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2 text-xs text-neutral-500">
                      Non collegata a nessun preventivo.
                    </div>
                  )}
                  {aperta.abbinamento_nota && <p className="text-[11px] text-neutral-400 -mt-2">{aperta.abbinamento_nota}</p>}

                  {(aperta.cc_nuovi || []).length > 0 && (
                    <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                      👤 Indirizzi nuovi nel thread: {aperta.cc_nuovi.join(", ")} — il cliente non è stato modificato
                    </p>
                  )}

                  <pre className="whitespace-pre-wrap break-words font-sans text-sm text-neutral-800 bg-neutral-50 border border-neutral-100 rounded-lg p-3 max-h-[60vh] overflow-auto">
                    {aperta.testo || "(nessun testo)"}
                  </pre>
                  {aperta.testo_troncato && <p className="text-[11px] text-neutral-400">Testo tagliato: il resto è nella webmail.</p>}

                  {(aperta.allegati || []).length > 0 && (
                    <div className="text-xs text-neutral-600">
                      <div className="text-neutral-400 mb-1">📎 Allegati (i file restano nella casella, si aprono dalla webmail)</div>
                      <ul className="space-y-0.5">
                        {aperta.allegati.map((a, i) => (
                          <li key={i}>{a.nome}{a.dimensione ? ` · ${kb(a.dimensione)}` : ""}{a.tipo ? <span className="text-neutral-400"> · {a.tipo}</span> : null}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {(aperta.altre_mail_del_preventivo || []).length > 0 && (
                    <div className="text-xs">
                      <div className="text-neutral-400 mb-1">Altre mail di questo preventivo</div>
                      <ul className="space-y-0.5">
                        {aperta.altre_mail_del_preventivo.map((o) => (
                          <li key={o.id}>
                            <button type="button" onClick={() => apri(o.id)} className="text-left hover:text-teal-700">
                              <span className="text-neutral-400">{fmtData(o.data)}</span> {o.mittente} — {o.oggetto}
                              {o.stato === "nuova" && <span className="ml-1 text-red-600">●</span>}
                            </button>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {(aperta.risposte_mandate || []).length > 0 && (
                    <div className="text-xs space-y-1">
                      <div className="text-neutral-400">↩️ Risposte mandate da qui</div>
                      {aperta.risposte_mandate.map((r) => (
                        <details key={r.id} className={`rounded border px-2 py-1 ${r.esito === "ok" ? "border-neutral-200" : "border-red-200 bg-red-50"}`}>
                          <summary className="cursor-pointer text-neutral-600">
                            {fmtDataLunga(r.inviato_at)} · a {r.a}{r.cc ? ` (cc ${r.cc})` : ""} · {r.inviato_da}
                            {r.esito !== "ok" && <span className="text-red-600"> — non partita: {r.errore}</span>}
                          </summary>
                          <pre className="whitespace-pre-wrap font-sans text-neutral-700 mt-1">{r.testo}</pre>
                        </details>
                      ))}
                    </div>
                  )}

                  {risp && (
                    <div className="rounded-xl border border-teal-200 bg-teal-50/40 p-3 space-y-2">
                      <div className="text-xs font-semibold text-teal-800">↩️ Rispondi dalla casella del gestionale</div>
                      {risp.bozzaId && (
                        <p className="text-xs text-violet-800">📝 Testo preparato da {risp.bozzaDa || "Q"}: rileggilo, correggilo se serve e premi Invia.</p>
                      )}
                      {risp.configurata === false && (
                        <p className="text-xs text-red-700">Il canale email non è configurato: Impostazioni Sistema › Email.</p>
                      )}
                      {[["a", "A"], ["cc", "Cc"], ["oggetto", "Oggetto"]].map(([k, l]) => (
                        <label key={k} className="flex items-center gap-2 text-xs">
                          <span className="w-14 text-neutral-500">{l}</span>
                          <input value={risp[k]} onChange={(e) => setRisp((x) => ({ ...x, [k]: e.target.value }))}
                            className="flex-1 border border-neutral-200 rounded-lg px-2 py-1.5 text-sm bg-white min-h-[36px]" />
                        </label>
                      ))}
                      <textarea value={risp.testo} onChange={(e) => setRisp((x) => ({ ...x, testo: e.target.value }))}
                        rows={8} autoFocus placeholder="Scrivi la risposta…"
                        className="w-full border border-neutral-200 rounded-lg px-3 py-2 text-sm bg-white" />
                      <div className="flex flex-wrap items-center gap-4 text-xs text-neutral-600">
                        <label className="flex items-center gap-1.5">
                          <input type="checkbox" checked={risp.cita} onChange={(e) => setRisp((x) => ({ ...x, cita: e.target.checked }))} />
                          includi sotto la mail a cui rispondi
                        </label>
                        <label className="flex items-center gap-1.5">
                          <input type="checkbox" checked={risp.gestita} onChange={(e) => setRisp((x) => ({ ...x, gestita: e.target.checked }))} />
                          segna la mail come gestita
                        </label>
                      </div>
                      {risp.cita && risp.citazione && (
                        <details className="text-[11px] text-neutral-500">
                          <summary className="cursor-pointer">Cosa viene citato sotto</summary>
                          <pre className="whitespace-pre-wrap font-sans mt-1 max-h-40 overflow-auto">{risp.citazione}</pre>
                        </details>
                      )}
                      <div className="flex justify-end gap-2">
                        <Btn variant="ghost" size="md" onClick={() => setRisp(null)} disabled={inviando}>Annulla</Btn>
                        <Btn variant="primary" size="md" onClick={inviaRisposta} loading={inviando}
                          disabled={inviando || !risp.testo.trim() || !risp.a.trim()}>
                          Invia
                        </Btn>
                      </div>
                      <p className="text-[11px] text-neutral-400">
                        Parte dalla casella del gestionale come risposta nella stessa conversazione; resta registrata qui
                        {aperta.preventivo ? " e negli invii del preventivo" : ""}.
                      </p>
                    </div>
                  )}

                  <div className="flex flex-wrap items-center justify-end gap-3 pt-2 border-t border-neutral-100">
                    {!risp && (
                      <Btn variant="chip" tone="blue" size="md" onClick={apriRisposta} className="mr-auto">↩️ Rispondi</Btn>
                    )}
                    {aperta.stato === "gestita" && (
                      <span className="text-[11px] text-neutral-400">gestita da {aperta.gestita_da} il {fmtDataLunga(aperta.gestita_at)}</span>
                    )}
                    {aperta.stato === "nuova" ? (
                      <Btn variant="chip" tone="emerald" size="md" onClick={() => cambiaStato(aperta, "gestita")}
                        loading={salvando} disabled={salvando}>✓ Segna gestita</Btn>
                    ) : (
                      <Btn variant="ghost" size="md" onClick={() => cambiaStato(aperta, "nuova")}
                        loading={salvando} disabled={salvando}>Riapri</Btn>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {toast && (
        <div className={`fixed bottom-6 right-6 z-50 px-4 py-2.5 rounded-lg shadow-lg text-sm font-medium ${toast.isError ? "bg-red-600 text-white" : "bg-neutral-900 text-white"}`}>
          {toast.msg}
        </div>
      )}
    </>
  );
}



// Una riga dell'elenco per le mail delle altre caselle (sola lettura)
function RigaCasella({ m, sel, onClick, etichetta }) {
  const nonLetta = m.letta === false;
  const fuori = m.dove && m.dove !== "posta in arrivo";
  return (
    <li>
      <button type="button" onClick={onClick}
        className={`w-full text-left px-4 py-3 min-h-[44px] transition ${sel ? "bg-teal-50" : "hover:bg-neutral-50"}`}>
        <div className="flex items-baseline gap-2">
          {!m.risposto && !m.scartata && <span className="w-2 h-2 rounded-full bg-red-500 flex-shrink-0 translate-y-[-1px]" title="Senza risposta" />}
          <span className={`truncate text-sm ${nonLetta ? "font-semibold text-neutral-900" : "text-neutral-700"}`}>
            {m.mittente_nome || m.mittente || "(mittente sconosciuto)"}
          </span>
          <span className="ml-auto text-[11px] text-neutral-400 whitespace-nowrap">{fmtData(m.data)}</span>
        </div>
        <div className={`text-sm truncate mt-0.5 ${nonLetta ? "font-semibold text-neutral-900" : "text-neutral-800"}`}>
          {(m.allegati || []).length > 0 && <span className="mr-1">📎</span>}
          {m.oggetto || "(senza oggetto)"}
        </div>
        <div className="text-xs text-neutral-500 truncate mt-0.5">{(m.estratto || "").replace(/\s+/g, " ")}</div>
        <div className="flex flex-wrap gap-1 mt-1">
          {etichetta && <span className="text-[10px] px-1.5 py-0.5 rounded bg-sky-100 text-sky-800 font-medium">{etichetta}</span>}
          {fuori && <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 font-medium">{m.dove}</span>}
          {m.pec && <span className="text-[10px] px-1.5 py-0.5 rounded bg-violet-100 text-violet-800">PEC{m.pec.tipo !== "messaggio" ? ` · ${m.pec.tipo}` : ""}</span>}
          {m.spam_marcato && <span className="text-[10px] px-1.5 py-0.5 rounded bg-neutral-200 text-neutral-600">segnata spam</span>}
          {m.in_ritardo && <span className="text-[10px] px-1.5 py-0.5 rounded bg-neutral-100 text-neutral-600">arrivata in ritardo</span>}
          {m.risposto && <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800">↩️ risposto</span>}
          {m.scartata && <span className="text-[10px] px-1.5 py-0.5 rounded bg-neutral-200 text-neutral-600">🗑 {m.scartata}</span>}
          {m.bozza && <span className="text-[10px] px-1.5 py-0.5 rounded bg-violet-100 text-violet-800">📝 bozza di {m.bozza.creata_da || "Q"}</span>}
          {(m.anche_in || []).length > 0 && <span className="text-[10px] px-1.5 py-0.5 rounded bg-neutral-100 text-neutral-500">anche in {m.anche_in.join(", ")}</span>}
        </div>
      </button>
    </li>
  );
}

// Una mail di un'altra casella, aperta: sola lettura. Si risponde dal proprio programma di posta.
function MailCasella({ m, etichetta, onChiudi, onAggiorna, toast }) {
  const [conferma, setConferma] = useState(false);
  const [lavoro, setLavoro] = useState(false);
  useEffect(() => { setConferma(false); }, [m.id]);
  const azione = async (cosa) => {
    setLavoro(true);
    try {
      const r = await apiFetch(`${API_BASE}/email/bozze/${m.bozza.id}/${cosa}`, { method: "POST" });
      const d = await r.json();
      if (!r.ok) throw new Error(d.detail || `Errore ${r.status}`);
      if (cosa === "invia") {
        if (d.ok) toast(`Mandata da ${d.da}${d.nota ? ` — ${d.nota}` : ""}`);
        else toast(`Non partita: ${d.errore}`, true);
      } else toast("Bozza annullata");
      onAggiorna && onAggiorna();
    } catch (e) {
      toast(e.message, true);
    } finally {
      setLavoro(false);
      setConferma(false);
    }
  };
  return (
    <div className="bg-white rounded-xl border border-neutral-200 shadow-sm p-5 space-y-4">
      <button type="button" onClick={onChiudi} className="lg:hidden text-sm text-teal-700 font-medium min-h-[44px]">← Elenco</button>

      <div className="flex flex-wrap items-start justify-between gap-2">
        <h2 className="text-lg font-semibold text-neutral-900 break-words">{m.oggetto || "(senza oggetto)"}</h2>
        <StatusBadge tone={m.risposto ? "success" : m.scartata ? "neutral" : "danger"} dot>
          {m.risposto ? "Risposto" : m.scartata ? "Messa da parte" : "Senza risposta"}
        </StatusBadge>
      </div>

      <dl className="text-xs text-neutral-600 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
        <dt className="text-neutral-400">Casella</dt>
        <dd>{etichetta(m.casella)} <span className="text-neutral-400">· {m.dove}{m.letta === false ? " · non letta" : ""}</span></dd>
        <dt className="text-neutral-400">Da</dt>
        <dd className="break-all">{m.mittente_nome ? `${m.mittente_nome} <${m.mittente}>` : m.mittente}</dd>
        <dt className="text-neutral-400">A</dt>
        <dd className="break-all">{m.a || "—"}</dd>
        {m.cc && (<><dt className="text-neutral-400">Cc</dt><dd className="break-all">{m.cc}</dd></>)}
        <dt className="text-neutral-400">Data</dt>
        <dd>{fmtDataLunga(m.data)}</dd>
      </dl>

      {m.pec && (
        <div className="rounded-lg border border-violet-200 bg-violet-50/50 px-3 py-2 text-xs text-violet-900">
          PEC · {m.pec.tipo === "messaggio" ? "messaggio (mittente e testo sono quelli veri, dentro la busta)" : m.pec.tipo}
          {m.pec.busta && <div className="text-violet-700/70 mt-0.5">Busta: {m.pec.busta}</div>}
        </div>
      )}
      {m.risposto_come && <p className="text-xs text-emerald-800">↩️ {m.risposto_come}</p>}
      {m.scartata && <p className="text-xs text-neutral-500">🗑 {m.scartata}: non è tra quelle da rispondere</p>}

      {m.bozza && (
        <div className="rounded-xl border border-violet-200 bg-violet-50/50 p-3 space-y-2">
          <div className="text-xs font-semibold text-violet-900">
            📝 Bozza di risposta preparata da {m.bozza.creata_da || "Q"} · {fmtDataLunga(m.bozza.creata_at)}
          </div>
          <div className="text-xs text-neutral-600">
            A {m.bozza.a}{m.bozza.cc ? ` · Cc ${m.bozza.cc}` : ""} · {m.bozza.oggetto}
          </div>
          <pre className="whitespace-pre-wrap font-sans text-sm text-neutral-800 bg-white border border-violet-100 rounded-lg p-2">{m.bozza.testo}</pre>
          <p className="text-[11px] text-neutral-500">
            È nelle Bozze della casella{m.bozza.cartella_bozze ? ` (${m.bozza.cartella_bozze})` : ""}: puoi aprirla in Mail, correggerla e mandarla da lì.
          </p>
          {m.bozza.errore && <p className="text-[11px] text-red-700">Ultimo tentativo: {m.bozza.errore}</p>}
          <div className="flex flex-wrap items-center gap-2">
            {m.pec ? (
              <span className="text-[11px] text-neutral-500">PEC: si manda solo dalla casella (valore legale).</span>
            ) : !conferma ? (
              <Btn variant="chip" tone="violet" size="md" onClick={() => setConferma(true)} disabled={lavoro}>Invia da qui</Btn>
            ) : (
              <>
                <Btn variant="primary" size="md" onClick={() => azione("invia")} loading={lavoro} disabled={lavoro}>
                  Conferma: manda a {m.bozza.a}
                </Btn>
                <Btn variant="ghost" size="md" onClick={() => setConferma(false)} disabled={lavoro}>No</Btn>
              </>
            )}
            <Btn variant="ghost" size="md" onClick={() => azione("annulla")} disabled={lavoro} className="ml-auto">Annulla bozza</Btn>
          </div>
        </div>
      )}
      {m.massiva && <p className="text-xs text-neutral-500">📰 Newsletter o notifica automatica ({m.massiva_perche})</p>}

      <pre className="whitespace-pre-wrap break-words font-sans text-sm text-neutral-800 bg-neutral-50 border border-neutral-100 rounded-lg p-3 max-h-[60vh] overflow-auto">
        {m.testo || "(nessun testo)"}
      </pre>
      {m.testo_troncato && <p className="text-[11px] text-neutral-400">Testo tagliato: il resto è nella webmail.</p>}

      {(m.allegati_dettaglio || []).filter((a) => a.nome !== "(inline)").length > 0 && (
        <div className="text-xs text-neutral-600">
          <div className="text-neutral-400 mb-1">📎 Allegati (i file restano nella casella, si aprono dal programma di posta)</div>
          <ul className="space-y-0.5">
            {m.allegati_dettaglio.filter((a) => a.nome !== "(inline)").map((a, i) => (
              <li key={i}>{a.nome}{a.dimensione ? ` · ${kb(a.dimensione)}` : ""}{a.tipo ? <span className="text-neutral-400"> · {a.tipo}</span> : null}</li>
            ))}
          </ul>
        </div>
      )}

      {(m.risposte_mandate || []).length > 0 && (
        <div className="text-xs">
          <div className="text-neutral-400 mb-1">↩️ Risposte mandate</div>
          <ul className="space-y-0.5">
            {m.risposte_mandate.map((r, i) => (
              <li key={i}><span className="text-neutral-400">{fmtDataLunga(r.data)}</span> da {r.casella} a {r.a} — {r.oggetto}</li>
            ))}
          </ul>
        </div>
      )}

      {(m.altre_copie || []).length > 0 && (
        <p className="text-[11px] text-neutral-400">Stessa mail anche in: {m.altre_copie.map((c) => `${c.casella} (${c.dove})`).join(", ")}</p>
      )}

      <p className="text-[11px] text-neutral-400 pt-2 border-t border-neutral-100">
        Il gestionale legge questa casella senza toccarla: per spostare o cancellare usa il tuo programma di posta. Le risposte le
        prepara Q come bozza (le trovi in Mail, nelle Bozze).
      </p>
    </div>
  );
}
