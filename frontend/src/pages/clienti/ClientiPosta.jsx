// @version: v1.0 (2026-11-13) — «📥 Posta»: tutta la posta in arrivo della casella del gestionale
// Modulo: clienti (pagina) — dati dal mattone M.D lettura (GET /email/in, solo admin)
// Elenco a sinistra (filtri nuove/gestite, collegate/non collegate, ricerca), mail aperta a
// destra. Il testo è già testo semplice ripulito lato server e qui si mostra SOLO come testo
// (whitespace-pre-wrap): niente HTML, niente immagini remote, niente link cliccabili.
// TRGB non manda mail da qui: si legge e si segna «gestita».
import React, { useState, useEffect, useCallback } from "react";
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

function kb(n) {
  if (!n && n !== 0) return "";
  return n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`;
}

export default function ClientiPosta() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
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
  const idAperta = params.get("id");

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
  }, [stato, periodo, collegate, qDeb]);

  useEffect(() => { carica(); }, [carica]);

  // Mail aperta: dall'URL (?id=), così si può tornare indietro e ricaricare
  useEffect(() => {
    if (!idAperta) { setAperta(null); return; }
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

  const apri = (id) => setParams(id ? { id: String(id) } : {});

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
      const r = await apiFetch(`${API_BASE}/email/lettura/giro`, { method: "POST" });
      const d = await r.json();
      if (d.esito === "ok") showToast(d.nuove ? `${d.nuove} ${d.nuove === 1 ? "mail nuova" : "mail nuove"}` : "Nessuna mail nuova");
      else if (d.esito === "saltato") showToast(`Non letta: ${d.nota}`, true);
      else showToast(`Errore: ${d.errore || d.detail}`, true);
      carica();
    } catch (e) {
      showToast(e.message, true);
    } finally {
      setLeggendo(false);
    }
  };

  const mail = dati?.mail || [];
  const agg = dati?.aggiornamento;

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
                La casella del gestionale, letta in sola lettura ogni pochi minuti
                {agg?.ultimo_ok ? ` · ultima lettura ${fmtData(agg.ultimo_ok)}` : ""}
                {dati ? ` · ${dati.nuove_in_casella} da gestire` : ""}
              </p>
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

          {/* Filtri */}
          <div className="bg-white rounded-xl border border-neutral-200 shadow-sm p-3 mb-4 flex flex-wrap items-center gap-2">
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
                      const sel = String(m.id) === String(idAperta);
                      return (
                        <li key={m.id}>
                          <button type="button" onClick={() => apri(m.id)}
                            className={`w-full text-left px-4 py-3 min-h-[44px] transition ${sel ? "bg-teal-50" : "hover:bg-neutral-50"}`}>
                            <div className="flex items-baseline gap-2">
                              {m.stato === "nuova" && <span className="w-2 h-2 rounded-full bg-red-500 flex-shrink-0 translate-y-[-1px]" title="Da gestire" />}
                              <span className={`truncate text-sm ${m.stato === "nuova" ? "font-semibold text-neutral-900" : "text-neutral-700"}`}>
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
                              {m.preventivo ? (
                                <span className="text-[10px] px-1.5 py-0.5 rounded bg-indigo-100 text-indigo-700 font-medium">
                                  📋 {m.preventivo.numero} · {m.preventivo.cliente || m.preventivo.titolo}
                                </span>
                              ) : (
                                <span className="text-[10px] px-1.5 py-0.5 rounded bg-neutral-100 text-neutral-500">non collegata</span>
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
              </div>
            </div>

            {/* MAIL APERTA */}
            <div className={`${aperta || caricaMail ? "" : "hidden lg:block"} flex-1 min-w-0`}>
              {caricaMail && !aperta ? (
                <div className="bg-white rounded-xl border border-neutral-200 shadow-sm p-6 text-sm text-neutral-400">Caricamento…</div>
              ) : !aperta ? (
                <div className="bg-white rounded-xl border border-dashed border-neutral-200 p-10 text-center text-sm text-neutral-400">
                  Scegli una mail dall'elenco
                </div>
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

                  <div className="flex flex-wrap items-center justify-end gap-3 pt-2 border-t border-neutral-100">
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
