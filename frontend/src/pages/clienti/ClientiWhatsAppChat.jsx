// @version: v1.0 (2026-11-24) — «💬 WhatsApp»: le chat del numero dell'osteria come la Posta
// Modulo: clienti (pagina) — dati da clienti_whatsapp_service (arrivano da YCloud, sola lettura)
// Elenco a sinistra (Da rispondere · Chiuse dal cliente · Tutte, periodo, ricerca), chat aperta a destra.
// TRGB NON manda messaggi: «Apri in WhatsApp» apre la chat nell'app di chi guarda (wa.me, mattone M.C),
// «✓ Gestita» toglie la chat da «da rispondere» finché il cliente non riscrive (mig 244).
// Chi la vede: matrice Moduli, clienti/whatsapp (dal 24/11/2026 admin + capo sala).
// Il testo dei messaggi si mostra SOLO come testo (whitespace-pre-wrap): niente link cliccabili.
import React, { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { API_BASE, apiFetch } from "../../config/api";
import { buildWaLink } from "../../utils/whatsapp";
import ClientiNav from "./ClientiNav";
import { Btn, StatusBadge, EmptyState } from "../../components/ui";

const PERIODI = [
  { v: 1, l: "Oggi e ieri" },
  { v: 7, l: "7 giorni" },
  { v: 30, l: "30 giorni" },
  { v: 90, l: "90 giorni" },
];

const FILTRI = [
  { v: "da_rispondere", l: "Da rispondere" },
  { v: "chiusa_dal_cliente", l: "Chiuse dal cliente" },
  { v: "tutte", l: "Tutte" },
];

const AGGIORNA_OGNI_MS = 60000;

function oraCorta(quando) {
  // quando: «AAAA-MM-GG HH:MM» (ora del server)
  if (!quando) return "";
  const [g, h] = quando.split(" ");
  const oggi = new Date();
  const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  if (g === iso(oggi)) return h;
  const ieri = new Date(oggi); ieri.setDate(oggi.getDate() - 1);
  if (g === iso(ieri)) return `ieri ${h}`;
  const [a, m, d] = g.split("-");
  return `${d}/${m}${a !== String(oggi.getFullYear()) ? `/${a.slice(2)}` : ""}`;
}

function giornoLungo(g) {
  try {
    return new Date(`${g}T12:00:00`).toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  } catch { return g; }
}

function attesa(ore) {
  if (ore == null) return "";
  if (ore < 1) return `${Math.max(1, Math.round(ore * 60))} min`;
  if (ore < 48) return `${Math.round(ore)} h`;
  return `${Math.round(ore / 24)} gg`;
}

function Stato({ v }) {
  if (!v) return null;
  if (v.stato === "da_rispondere") return <StatusBadge tone="danger" dot>Da rispondere · {attesa(v.attesa_ore)}</StatusBadge>;
  if (v.stato === "gestita") return <StatusBadge tone="success">✓ Gestita</StatusBadge>;
  if (v.stato === "chiusa_dal_cliente") return <StatusBadge tone="neutral">Chiusa dal cliente</StatusBadge>;
  if (v.stato === "risposto") return <StatusBadge tone="success">Risposto</StatusBadge>;
  return <StatusBadge tone="info">Aspetto loro</StatusBadge>;
}

export default function ClientiWhatsAppChat() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [filtro, setFiltro] = useState(params.get("n") ? "tutte" : "da_rispondere");
  const [periodo, setPeriodo] = useState(7);
  const [q, setQ] = useState("");
  const [qDeb, setQDeb] = useState("");
  const [dati, setDati] = useState(null);
  const [loading, setLoading] = useState(true);
  const [errore, setErrore] = useState("");
  const [aperta, setAperta] = useState(params.get("n") || null);
  const [chat, setChat] = useState(null);
  const [caricaChat, setCaricaChat] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [toast, setToast] = useState(null);
  const fondo = useRef(null);

  useEffect(() => { const t = setTimeout(() => setQDeb(q.trim()), 350); return () => clearTimeout(t); }, [q]);

  const caricaElenco = useCallback(async (silenzioso = false) => {
    if (!silenzioso) setLoading(true);
    try {
      const p = new URLSearchParams({ giorni: String(periodo), limite: "300" });
      if (qDeb) p.set("q", qDeb);
      const res = await apiFetch(`${API_BASE}/clienti/whatsapp/conversazioni?${p}`);
      if (!res.ok) throw new Error(res.status === 403 ? "Non hai accesso a WhatsApp del locale" : "Chat non disponibili");
      setDati(await res.json());
      setErrore("");
    } catch (e) { setErrore(e.message); } finally { setLoading(false); }
  }, [periodo, qDeb]);

  const caricaUna = useCallback(async (numero, silenzioso = false) => {
    if (!numero) return;
    if (!silenzioso) setCaricaChat(true);
    try {
      const res = await apiFetch(`${API_BASE}/clienti/whatsapp/chat/${encodeURIComponent(numero)}?giorni=180`);
      if (!res.ok) throw new Error(res.status === 404 ? "Nessun messaggio con questo numero" : "Chat non disponibile");
      setChat(await res.json());
    } catch (e) { setChat(null); setToast({ tipo: "err", testo: e.message }); }
    finally { setCaricaChat(false); }
  }, []);

  useEffect(() => { caricaElenco(); }, [caricaElenco]);
  useEffect(() => { if (aperta) caricaUna(aperta); else setChat(null); }, [aperta, caricaUna]);

  // si aggiorna da sola ogni minuto (i messaggi arrivano da YCloud in tempo reale)
  useEffect(() => {
    const t = setInterval(() => { caricaElenco(true); if (aperta) caricaUna(aperta, true); }, AGGIORNA_OGNI_MS);
    return () => clearInterval(t);
  }, [caricaElenco, caricaUna, aperta]);

  useEffect(() => { if (chat && fondo.current) fondo.current.scrollIntoView({ block: "end" }); }, [chat?.numero, chat?.messaggi?.length]);
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(null), 3500); return () => clearTimeout(t); }, [toast]);

  const apri = (numero) => {
    setAperta(numero);
    setParams(numero ? { n: numero } : {}, { replace: true });
    if (numero && window.innerWidth < 1024) window.scrollTo({ top: 0 });
  };

  const segnaGestita = async (gestita) => {
    if (!chat) return;
    setSalvando(true);
    try {
      const res = await apiFetch(`${API_BASE}/clienti/whatsapp/chat/${encodeURIComponent(chat.numero)}/gestita`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ gestita }),
      });
      if (!res.ok) throw new Error("Non salvato");
      setToast({ tipo: "ok", testo: gestita ? "Segnata gestita: torna da rispondere se il cliente riscrive" : "Tolto «gestita»" });
      await Promise.all([caricaUna(chat.numero, true), caricaElenco(true)]);
    } catch (e) { setToast({ tipo: "err", testo: e.message }); } finally { setSalvando(false); }
  };

  const tutte = dati?.conversazioni || [];
  const elenco = filtro === "tutte" ? tutte : tutte.filter((v) => v.stato === filtro);
  const agg = dati?.aggiornamento;
  const link = chat ? buildWaLink(chat.numero) : null;

  const chip = (attivo, onClick, label) => (
    <button type="button" onClick={onClick}
      className={`px-3 py-1.5 min-h-[36px] rounded-lg text-xs font-medium border transition ${attivo ? "bg-teal-600 text-white border-teal-600" : "bg-white text-neutral-600 border-neutral-200 hover:bg-neutral-50"}`}>
      {label}
    </button>
  );
  const conta = (v) => (v === "da_rispondere" ? dati?.da_rispondere : v === "chiusa_dal_cliente" ? dati?.chiuse_dal_cliente : dati?.totale);

  // messaggi raggruppati per giorno
  const giorni = [];
  for (const m of chat?.messaggi || []) {
    const g = (m.quando || "").split(" ")[0];
    if (!giorni.length || giorni[giorni.length - 1].g !== g) giorni.push({ g, msg: [] });
    giorni[giorni.length - 1].msg.push(m);
  }

  return (
    <>
      <ClientiNav current="whatsapp" />
      <div className="min-h-screen bg-brand-cream">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
          <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
            <div>
              <h1 className="text-2xl font-bold text-neutral-900" style={{ fontFamily: "'Playfair Display', serif" }}>💬 WhatsApp</h1>
              <p className="text-sm text-neutral-500 mt-1">
                Le chat del numero dell'osteria, in sola lettura
                {agg?.ultimo_webhook ? ` · ultimo segnale da WhatsApp ${oraCorta(agg.ultimo_webhook.slice(0, 16))}` : ""}
                {dati ? ` · ${dati.da_rispondere} da rispondere` : ""}.
                Si risponde dal telefono (o con «Apri in WhatsApp»).
              </p>
              {agg && !agg.collegato && (
                <p className="text-xs text-amber-700 mt-1">
                  ⚠️ {agg.scollegato ? `Collegamento caduto (${agg.scollegato}): apri l'app WhatsApp Business sul telefono.` : "WhatsApp non ancora collegato: vedi Impostazioni › WhatsApp."}
                </p>
              )}
            </div>
            <Btn variant="secondary" size="md" onClick={() => { caricaElenco(); if (aperta) caricaUna(aperta); }} loading={loading}>↻ Aggiorna</Btn>
          </div>

          <div className="bg-white rounded-xl border border-neutral-200 shadow-sm p-3 mb-4 flex flex-wrap items-center gap-2">
            <div className="flex flex-wrap gap-1">
              {FILTRI.map((f) => (
                <span key={f.v}>{chip(filtro === f.v, () => setFiltro(f.v), `${f.l}${dati ? ` · ${conta(f.v) ?? 0}` : ""}`)}</span>
              ))}
            </div>
            <select value={periodo} onChange={(e) => setPeriodo(Number(e.target.value))}
              className="border border-neutral-200 rounded-lg px-2 py-1.5 text-xs bg-white min-h-[36px]">
              {PERIODI.map((p) => <option key={p.v} value={p.v}>{p.l}</option>)}
            </select>
            <input type="search" value={q} onChange={(e) => setQ(e.target.value)}
              placeholder="Cerca nome, numero, parole…"
              className="flex-1 min-w-[180px] border border-neutral-200 rounded-lg px-3 py-1.5 text-sm min-h-[36px]" />
          </div>

          {errore && <div className="mb-4 px-4 py-3 rounded-lg text-sm bg-red-50 border border-red-200 text-red-800">{errore}</div>}

          <div className="flex flex-col lg:flex-row gap-4">
            {/* ELENCO */}
            <div className={`${aperta ? "hidden lg:block" : ""} lg:w-[40%] flex-shrink-0`}>
              <div className="bg-white rounded-xl border border-neutral-200 shadow-sm overflow-hidden">
                {loading && !dati ? (
                  <p className="p-6 text-sm text-neutral-400">Caricamento…</p>
                ) : elenco.length === 0 ? (
                  <EmptyState icon="💬" title="Nessuna chat"
                    description={filtro === "da_rispondere" ? "Nessuno aspetta una risposta in questo periodo." : "Nessuna chat con questi filtri."} />
                ) : (
                  <ul className="divide-y divide-neutral-100">
                    {elenco.map((v) => {
                      const cifre = v.numero.replace(/\D/g, "");
                      const sel = aperta && aperta.replace(/\D/g, "") === cifre;
                      const daRisp = v.stato === "da_rispondere";
                      return (
                        <li key={v.numero}>
                          <button type="button" onClick={() => apri(cifre)}
                            className={`w-full text-left px-4 py-3 min-h-[44px] transition ${sel ? "bg-teal-50" : "hover:bg-neutral-50"}`}>
                            <div className="flex items-baseline gap-2">
                              {daRisp && <span className="w-2 h-2 rounded-full bg-red-500 flex-shrink-0 translate-y-[-1px]" title="Da rispondere" />}
                              <span className={`truncate text-sm ${daRisp ? "font-semibold text-neutral-900" : "text-neutral-700"}`}>
                                {v.nome || v.numero}
                              </span>
                              <span className="ml-auto text-[11px] text-neutral-400 whitespace-nowrap">{oraCorta(v.ultimo?.quando)}</span>
                            </div>
                            <div className="text-xs text-neutral-500 truncate mt-0.5">
                              <span className="text-neutral-400">{v.ultimo?.chi === "locale" ? "Noi: " : ""}</span>
                              {(v.ultimo?.testo || "").replace(/\s+/g, " ")}
                            </div>
                            <div className="flex flex-wrap items-center gap-1 mt-1">
                              <Stato v={v} />
                              {v.cliente_id && <span className="text-[10px] px-1.5 py-0.5 rounded bg-teal-100 text-teal-800 font-medium">👤 cliente TRGB</span>}
                              {v.nome && <span className="text-[10px] text-neutral-400">{v.numero}</span>}
                            </div>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </div>

            {/* CHAT */}
            <div className={`${aperta ? "" : "hidden lg:block"} flex-1 min-w-0`}>
              <div className="bg-white rounded-xl border border-neutral-200 shadow-sm lg:sticky lg:top-4 flex flex-col lg:max-h-[calc(100vh-2rem)]">
                {!aperta ? (
                  <EmptyState icon="👈" title="Scegli una chat" description="I messaggi si leggono qui. Per rispondere usa il telefono o «Apri in WhatsApp»." />
                ) : caricaChat && !chat ? (
                  <p className="p-6 text-sm text-neutral-400">Caricamento…</p>
                ) : !chat ? (
                  <div className="p-6 text-sm text-neutral-500">
                    Chat non trovata. <button type="button" className="underline" onClick={() => apri(null)}>Torna all'elenco</button>
                  </div>
                ) : (
                  <>
                    <div className="px-4 py-3 border-b border-neutral-100 space-y-2">
                      <div className="flex items-start gap-2">
                        <button type="button" onClick={() => apri(null)} className="lg:hidden min-h-[44px] px-2 -ml-2 text-sm text-teal-700">← Chat</button>
                        <div className="min-w-0 flex-1">
                          <div className="text-base font-semibold text-neutral-900 truncate">{chat.nome || chat.numero}</div>
                          <div className="text-xs text-neutral-500">
                            {chat.numero}
                            {chat.nome_whatsapp && chat.nome_whatsapp !== chat.nome ? ` · su WhatsApp «${chat.nome_whatsapp}»` : ""}
                            {chat.nome_rubrica && chat.nome_rubrica !== chat.nome ? ` · in rubrica «${chat.nome_rubrica}»` : ""}
                          </div>
                        </div>
                        <Stato v={chat} />
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {chat.stato === "gestita" ? (
                          <Btn size="md" variant="secondary" onClick={() => segnaGestita(false)} loading={salvando}>↩︎ Togli «gestita»</Btn>
                        ) : (chat.stato === "da_rispondere" || chat.stato === "chiusa_dal_cliente") ? (
                          <Btn size="md" variant="success" onClick={() => segnaGestita(true)} loading={salvando}>✓ Gestita</Btn>
                        ) : null}
                        {link && <Btn size="md" variant="secondary" as="a" href={link} target="_blank" rel="noopener noreferrer">💬 Apri in WhatsApp</Btn>}
                        {chat.cliente_id && <Btn size="md" variant="secondary" onClick={() => navigate(`/clienti/${chat.cliente_id}`)}>👤 Scheda cliente</Btn>}
                      </div>
                      {chat.gestita_da && (
                        <div className="text-[11px] text-neutral-400">Segnata gestita {chat.gestita_da.da ? `da ${chat.gestita_da.da} ` : ""}il {chat.gestita_da.at}</div>
                      )}
                    </div>
                    <div className="flex-1 overflow-y-auto px-3 sm:px-4 py-3 bg-neutral-50 space-y-3">
                      {giorni.map((gg) => (
                        <div key={gg.g} className="space-y-1.5">
                          <div className="text-center"><span className="text-[11px] px-2 py-0.5 rounded-full bg-white border border-neutral-200 text-neutral-500">{giornoLungo(gg.g)}</span></div>
                          {gg.msg.map((m) => {
                            const mio = m.chi === "locale";
                            if (m.tipo === "reaction") {
                              return (
                                <div key={m.id} className={`text-[11px] text-neutral-400 ${mio ? "text-right" : ""}`}>
                                  {mio ? "Abbiamo" : "Ha"} reagito {m.testo} · {(m.quando || "").slice(11)}
                                </div>
                              );
                            }
                            return (
                              <div key={m.id} className={`flex ${mio ? "justify-end" : "justify-start"}`}>
                                <div className={`max-w-[85%] rounded-2xl px-3 py-2 shadow-sm border ${mio ? "bg-teal-50 border-teal-100 rounded-br-md" : "bg-white border-neutral-200 rounded-bl-md"}`}>
                                  <div className="text-sm text-neutral-800 whitespace-pre-wrap break-words">{m.testo || `[${m.tipo}]`}</div>
                                  <div className="text-[10px] text-neutral-400 mt-1 text-right">
                                    {m.fonte ? `${m.fonte} · ` : ""}{(m.quando || "").slice(11)}
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      ))}
                      <div ref={fondo} />
                    </div>
                    <div className="px-4 py-2 border-t border-neutral-100 text-[11px] text-neutral-400">
                      Ultimi {chat.periodo_giorni} giorni · foto e file non si vedono (solo la didascalia) · chat di gruppo escluse
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
      {toast && (
        <div className={`fixed bottom-4 right-4 z-50 px-4 py-3 rounded-lg shadow-lg text-sm ${toast.tipo === "ok" ? "bg-emerald-600 text-white" : "bg-red-600 text-white"}`}>
          {toast.testo}
        </div>
      )}
    </>
  );
}
