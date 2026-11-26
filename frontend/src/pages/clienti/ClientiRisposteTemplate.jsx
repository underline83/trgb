// @version: v1.0 (2026-11-26) — template di risposta ai clienti coi blocchi vivi: elenco, editor (mail + WhatsApp corta), anteprima di oggi
// Modulo: clienti — [core]
// Impostazioni › Template di risposta (mig 246, /clienti/risposte-template). Un template è un testo con dei
// blocchi fra graffe che TRGB riempie quando lo si usa: menù e prezzo dalla libreria menù, «c'è posto» o
// «siamo pieni» guardando i tavoli dell'occasione, link di prenotazione. Si usano da Clienti › Posta.
import React, { useState, useEffect, useRef, useCallback } from "react";
import { API_BASE, apiFetch } from "../../config/api";
import { Btn, EmptyState } from "../../components/ui";

const VUOTO = {
  id: null, nome: "", attivo: true, occasione_data: "", occasione_turno: "pranzo", pax_prova: "",
  menu_template_id: "", oggetto: "", testo_mail: "", testo_wa: "", disp_posto: "", disp_pieno: "",
};
const CAMPO = "w-full border border-neutral-300 rounded-lg px-3 py-2 text-sm bg-white min-h-[40px]";
const ETICHETTA = "block text-xs font-semibold text-neutral-600 mb-1";
const giornoCorto = (s) => (s ? `${s.slice(8, 10)}/${s.slice(5, 7)}/${s.slice(0, 4)}` : "");

// dal form (stringhe) a quello che vuole l'API
function daMandare(f) {
  return {
    nome: f.nome, attivo: !!f.attivo,
    occasione_data: f.occasione_data || null,
    occasione_turno: f.occasione_data ? f.occasione_turno : null,
    pax_prova: f.occasione_data && f.pax_prova !== "" ? Number(f.pax_prova) : null,
    menu_template_id: f.menu_template_id ? Number(f.menu_template_id) : null,
    oggetto: f.oggetto || null, testo_mail: f.testo_mail || null, testo_wa: f.testo_wa || null,
    disp_posto: f.disp_posto || null, disp_pieno: f.disp_pieno || null,
  };
}

function daServer(t) {
  const f = { ...VUOTO };
  Object.keys(VUOTO).forEach((k) => { if (t[k] !== null && t[k] !== undefined) f[k] = t[k]; });
  f.pax_prova = t.occasione_data ? String(t.pax_prova ?? "") : "";
  f.menu_template_id = t.menu_template_id ? String(t.menu_template_id) : "";
  f.occasione_turno = t.occasione_turno || "pranzo";
  return f;
}

export default function ClientiRisposteTemplate() {
  const [lista, setLista] = useState(null);
  const [blocchi, setBlocchi] = useState([]);
  const [link, setLink] = useState("");
  const [linkSalvato, setLinkSalvato] = useState("");
  const [menu, setMenu] = useState([]);
  const [form, setForm] = useState(null);          // template aperto (nuovo o esistente)
  const [canale, setCanale] = useState("mail");
  const [anteprima, setAnteprima] = useState(null);
  const [errAnteprima, setErrAnteprima] = useState("");
  const [lavoro, setLavoro] = useState(false);
  const [msg, setMsg] = useState(null);             // {testo, errore}
  const [confElimina, setConfElimina] = useState(false);
  const ultimoCampo = useRef(null);                 // {nome, el} del campo di testo dov'era il cursore

  const carica = useCallback(async () => {
    try {
      const r = await apiFetch(`${API_BASE}/clienti/risposte-template/`);
      const d = await r.json();
      if (!r.ok) throw new Error(d.detail || `Errore ${r.status}`);
      setLista(d.template || []);
      setBlocchi(d.blocchi || []);
      setLink(d.impostazioni?.link_prenotazione || "");
      setLinkSalvato(d.impostazioni?.link_prenotazione || "");
      return d.template || [];
    } catch (e) {
      setLista([]);
      setMsg({ testo: e.message, errore: true });
      return [];
    }
  }, []);

  useEffect(() => {
    carica();
    apiFetch(`${API_BASE}/menu-templates/`).then((r) => (r.ok ? r.json() : null))
      .then((d) => setMenu(d?.items || [])).catch(() => {});
  }, [carica]);

  // anteprima: come esce ADESSO il template che si sta scrivendo (non salva niente)
  useEffect(() => {
    if (!form || !form.nome.trim()) { setAnteprima(null); setErrAnteprima(""); return undefined; }
    const t = setTimeout(async () => {
      try {
        const r = await apiFetch(`${API_BASE}/clienti/risposte-template/anteprima`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...daMandare(form), canale, nome_cliente: "Mario" }),
        });
        const d = await r.json();
        if (!r.ok) throw new Error(d.detail || `Errore ${r.status}`);
        setAnteprima(d);
        setErrAnteprima("");
      } catch (e) {
        setAnteprima(null);
        setErrAnteprima(e.message);
      }
    }, 600);
    return () => clearTimeout(t);
  }, [form, canale, linkSalvato]);

  const apri = (t) => { setForm(t ? daServer(t) : { ...VUOTO }); setCanale("mail"); setConfElimina(false); setMsg(null); };
  const cambia = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const salva = async () => {
    setLavoro(true);
    try {
      const nuovo = !form.id;
      const r = await apiFetch(`${API_BASE}/clienti/risposte-template/${nuovo ? "" : form.id}`, {
        method: nuovo ? "POST" : "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(daMandare(form)),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.detail || `Errore ${r.status}`);
      await carica();
      setForm(daServer(d));
      setMsg({ testo: nuovo ? "Template creato" : "Template salvato" });
    } catch (e) {
      setMsg({ testo: e.message, errore: true });
    } finally {
      setLavoro(false);
    }
  };

  const elimina = async () => {
    setLavoro(true);
    try {
      const r = await apiFetch(`${API_BASE}/clienti/risposte-template/${form.id}`, { method: "DELETE" });
      if (!r.ok) throw new Error((await r.json()).detail || `Errore ${r.status}`);
      await carica();
      setForm(null);
      setMsg({ testo: "Template eliminato" });
    } catch (e) {
      setMsg({ testo: e.message, errore: true });
    } finally {
      setLavoro(false);
      setConfElimina(false);
    }
  };

  const salvaLink = async () => {
    setLavoro(true);
    try {
      const r = await apiFetch(`${API_BASE}/clienti/risposte-template/impostazioni`, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ link_prenotazione: link }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.detail || `Errore ${r.status}`);
      setLink(d.link_prenotazione || "");
      setLinkSalvato(d.link_prenotazione || "");
      setMsg({ testo: "Link salvato" });
    } catch (e) {
      setMsg({ testo: e.message, errore: true });
    } finally {
      setLavoro(false);
    }
  };

  // «Inserisci blocco»: nel campo di testo dov'era il cursore, altrimenti in fondo al testo del canale
  const inserisci = (chiave) => {
    const gettone = `{${chiave}}`;
    const u = ultimoCampo.current;
    const campo = u?.nome || (canale === "mail" ? "testo_mail" : "testo_wa");
    const el = u?.el;
    const testo = form[campo] || "";
    const da = el && typeof el.selectionStart === "number" ? el.selectionStart : testo.length;
    const a = el && typeof el.selectionEnd === "number" ? el.selectionEnd : testo.length;
    cambia(campo, testo.slice(0, da) + gettone + testo.slice(a));
    if (el) requestAnimationFrame(() => { el.focus(); el.setSelectionRange(da + gettone.length, da + gettone.length); });
  };
  const ricorda = (nome) => (e) => { ultimoCampo.current = { nome, el: e.target }; };

  const haOccasione = !!form?.occasione_data;
  const haMenu = !!form?.menu_template_id;
  const serveOk = (b) => !b.serve || (b.serve === "occasione" && haOccasione) || (b.serve === "menu" && haMenu);
  const campoTesto = canale === "mail" ? "testo_mail" : "testo_wa";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-neutral-900">Template di risposta</h1>
          <p className="text-sm text-neutral-500 mt-1 max-w-2xl">
            Risposte pronte per le richieste che si ripetono. I blocchi fra graffe li riempie TRGB nel momento in cui
            rispondi: menù e prezzo dalla libreria, «c'è posto» o «siamo pieni» guardando i tavoli, link di prenotazione.
            Si usano da Clienti › Posta.
          </p>
        </div>
        <Btn variant="primary" size="md" onClick={() => apri(null)}>Nuovo template</Btn>
      </div>

      {msg && (
        <div className={`px-4 py-2.5 rounded-lg text-sm border ${msg.errore ? "bg-red-50 border-red-200 text-red-800" : "bg-emerald-50 border-emerald-200 text-emerald-800"}`}>
          {msg.testo}
        </div>
      )}

      <div className="bg-white rounded-xl border border-neutral-200 p-4 shadow-sm">
        <label className={ETICHETTA} htmlFor="rt-link">Link di prenotazione (blocco {"{link_prenotazione}"})</label>
        <div className="flex flex-wrap gap-2">
          <input id="rt-link" value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://…"
            className={`${CAMPO} flex-1 min-w-[240px]`} />
          <Btn variant="secondary" size="md" onClick={salvaLink} disabled={lavoro || link.trim() === linkSalvato}>Salva link</Btn>
        </div>
        {!linkSalvato && <p className="text-xs text-amber-700 mt-1.5">Senza link il blocco resta vuoto e TRGB te lo segnala quando compili.</p>}
      </div>

      <div className="flex flex-col lg:flex-row gap-4 items-start">
        {/* elenco */}
        <div className="w-full lg:w-60 flex-shrink-0 bg-white rounded-xl border border-neutral-200 shadow-sm overflow-hidden">
          {lista === null ? (
            <div className="p-4 text-sm text-neutral-400">Caricamento…</div>
          ) : lista.length === 0 ? (
            <div className="p-4 text-sm text-neutral-500">Ancora nessun template.</div>
          ) : (
            <ul className="divide-y divide-neutral-100">
              {lista.map((t) => (
                <li key={t.id}>
                  <button type="button" onClick={() => apri(t)}
                    className={`w-full text-left px-4 py-3 min-h-[44px] hover:bg-neutral-50 ${form?.id === t.id ? "bg-teal-50" : ""}`}>
                    <div className={`text-sm font-medium ${t.attivo ? "text-neutral-900" : "text-neutral-400"}`}>{t.nome}</div>
                    <div className="text-[11px] text-neutral-500 mt-0.5">
                      {t.occasione_data ? `${giornoCorto(t.occasione_data)} ${t.occasione_turno}` : "senza occasione"}
                      {t.testo_wa ? " · mail e WhatsApp" : " · solo mail"}{t.attivo ? "" : " · spento"}
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* editor */}
        {!form ? (
          <div className="flex-1 min-w-0 w-full">
            <EmptyState icon="✉️" title="Scegli un template o creane uno"
              description="Scrivi il testo una volta sola: menù, prezzo e disponibilità si aggiornano da soli." />
          </div>
        ) : (
          <>
            <div className="flex-1 min-w-0 w-full bg-white rounded-xl border border-neutral-200 p-5 shadow-sm space-y-4">
              <div className="flex flex-wrap gap-3 items-end">
                <div className="flex-1 min-w-[220px]">
                  <label className={ETICHETTA} htmlFor="rt-nome">Nome del template</label>
                  <input id="rt-nome" value={form.nome} onChange={(e) => cambia("nome", e.target.value)}
                    placeholder="Pranzo di Natale 2026" className={CAMPO} />
                </div>
                <label className="flex items-center gap-2 text-sm text-neutral-700 min-h-[40px]">
                  <input type="checkbox" checked={!!form.attivo} onChange={(e) => cambia("attivo", e.target.checked)} />
                  attivo (si può scegliere in Posta)
                </label>
              </div>

              <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-4 space-y-3">
                <div className="text-sm font-semibold text-neutral-800">Occasione: da dove TRGB prende i dati vivi</div>
                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
                  <div>
                    <label className={ETICHETTA} htmlFor="rt-giorno">Giorno</label>
                    <input id="rt-giorno" type="date" value={form.occasione_data || ""}
                      onChange={(e) => cambia("occasione_data", e.target.value)} className={CAMPO} />
                  </div>
                  <div>
                    <label className={ETICHETTA} htmlFor="rt-turno">Turno</label>
                    <select id="rt-turno" value={form.occasione_turno} disabled={!haOccasione}
                      onChange={(e) => cambia("occasione_turno", e.target.value)} className={CAMPO}>
                      <option value="pranzo">Pranzo</option>
                      <option value="cena">Cena</option>
                    </select>
                  </div>
                  <div>
                    <label className={ETICHETTA} htmlFor="rt-pax">C'è posto se entra un tavolo da</label>
                    <input id="rt-pax" type="number" min="1" inputMode="numeric" value={form.pax_prova} disabled={!haOccasione}
                      onChange={(e) => cambia("pax_prova", e.target.value)} placeholder="persone" className={CAMPO} />
                  </div>
                  <div>
                    <label className={ETICHETTA} htmlFor="rt-menu">Menù dalla libreria</label>
                    <select id="rt-menu" value={form.menu_template_id} onChange={(e) => cambia("menu_template_id", e.target.value)} className={CAMPO}>
                      <option value="">nessuno</option>
                      {menu.map((m) => <option key={m.id} value={m.id}>{m.nome}</option>)}
                    </select>
                  </div>
                </div>
                <p className="text-xs text-neutral-500">
                  Senza giorno il template non ha occasione (es. «Gruppi: serve un menù»): i blocchi Giorno e Disponibilità restano vuoti.
                  Il menù si scrive in Impostazioni › Menu Template.
                </p>
              </div>

              <div className="flex gap-1 border-b border-neutral-200">
                {[["mail", "Mail"], ["wa", "WhatsApp (versione corta)"]].map(([k, l]) => (
                  <button key={k} type="button" onClick={() => { setCanale(k); ultimoCampo.current = null; }}
                    className={`px-4 min-h-[44px] text-sm border-b-2 -mb-px ${canale === k ? "border-teal-600 text-teal-800 font-semibold" : "border-transparent text-neutral-500 hover:text-neutral-800"}`}>
                    {l}
                  </button>
                ))}
              </div>

              {canale === "mail" && (
                <div>
                  <label className={ETICHETTA} htmlFor="rt-oggetto">Oggetto (per una mail nuova: una risposta tiene «RE: …»)</label>
                  <input id="rt-oggetto" value={form.oggetto} onChange={(e) => cambia("oggetto", e.target.value)} className={CAMPO} />
                </div>
              )}

              <div>
                <label className={ETICHETTA} htmlFor="rt-testo">{canale === "mail" ? "Testo della mail" : "Testo per WhatsApp"}</label>
                <textarea id="rt-testo" value={form[campoTesto]} rows={canale === "mail" ? 14 : 6}
                  onChange={(e) => cambia(campoTesto, e.target.value)}
                  onFocus={ricorda(campoTesto)} onSelect={ricorda(campoTesto)}
                  placeholder={"Buongiorno {nome},\n\ngrazie per averci scritto…\n\n{menu}\n\n{prezzo}, bevande escluse.\n\n{disponibilita}\n\nUn cordiale saluto,\n…"}
                  className="w-full border border-neutral-300 rounded-lg px-3 py-2 text-sm bg-white font-mono leading-relaxed" />
                <div className="flex flex-wrap items-center gap-1.5 mt-2">
                  <span className="text-xs text-neutral-500 mr-1">Inserisci blocco:</span>
                  {blocchi.map((b) => (
                    <button key={b.chiave} type="button" onClick={() => inserisci(b.chiave)} title={b.cosa}
                      className={`px-2.5 min-h-[32px] rounded-full border text-xs ${serveOk(b) ? "border-teal-300 bg-teal-50 text-teal-900 hover:bg-teal-100" : "border-neutral-200 bg-neutral-50 text-neutral-400"}`}>
                      {b.etichetta}
                    </button>
                  ))}
                </div>
                <p className="text-[11px] text-neutral-400 mt-1">In grigio i blocchi che oggi uscirebbero vuoti: manca l'occasione o il menù.</p>
              </div>

              <div className="rounded-xl border border-amber-300 border-dashed bg-amber-50/60 p-4 space-y-3">
                <div className="text-sm font-semibold text-amber-900">Blocco Disponibilità: TRGB sceglie uno dei due (vale per mail e WhatsApp)</div>
                <div>
                  <label className={ETICHETTA} htmlFor="rt-posto">Se c'è posto</label>
                  <textarea id="rt-posto" rows={3} value={form.disp_posto} onChange={(e) => cambia("disp_posto", e.target.value)}
                    onFocus={ricorda("disp_posto")} onSelect={ricorda("disp_posto")}
                    placeholder={"Al momento abbiamo ancora disponibilità: può prenotare direttamente da qui\n{link_prenotazione}"}
                    className="w-full border border-neutral-300 rounded-lg px-3 py-2 text-sm bg-white font-mono" />
                </div>
                <div>
                  <label className={ETICHETTA} htmlFor="rt-pieno">Se siamo pieni</label>
                  <textarea id="rt-pieno" rows={3} value={form.disp_pieno} onChange={(e) => cambia("disp_pieno", e.target.value)}
                    onFocus={ricorda("disp_pieno")} onSelect={ricorda("disp_pieno")}
                    placeholder="Purtroppo siamo al completo. Se vuole, la inseriamo in lista d'attesa."
                    className="w-full border border-neutral-300 rounded-lg px-3 py-2 text-sm bg-white font-mono" />
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2 pt-3 border-t border-neutral-100">
                <Btn variant="primary" size="md" onClick={salva} loading={lavoro} disabled={lavoro || !form.nome.trim()}>
                  {form.id ? "Salva" : "Crea template"}
                </Btn>
                <Btn variant="ghost" size="md" onClick={() => setForm(null)} disabled={lavoro}>Chiudi</Btn>
                {form.id && (!confElimina ? (
                  <Btn variant="chip" tone="red" size="md" onClick={() => setConfElimina(true)} disabled={lavoro} className="ml-auto">Elimina</Btn>
                ) : (
                  <span className="ml-auto flex items-center gap-2">
                    <span className="text-xs text-neutral-600">Eliminare «{form.nome}»?</span>
                    <Btn variant="danger" size="md" onClick={elimina} disabled={lavoro}>Sì, elimina</Btn>
                    <Btn variant="ghost" size="md" onClick={() => setConfElimina(false)} disabled={lavoro}>No</Btn>
                  </span>
                ))}
              </div>
            </div>

            {/* anteprima */}
            <div className="w-full lg:w-80 flex-shrink-0 bg-white rounded-xl border border-neutral-200 p-4 shadow-sm space-y-3 lg:sticky lg:top-4">
              <div className="text-xs font-semibold text-neutral-500 uppercase tracking-wide">Anteprima: come esce adesso</div>
              {errAnteprima && <p className="text-xs text-red-700">{errAnteprima}</p>}
              {!anteprima && !errAnteprima && <p className="text-xs text-neutral-400">Dai un nome al template per vedere l'anteprima.</p>}
              {anteprima && (
                <>
                  {anteprima.disponibilita && (
                    <div className={`text-xs font-medium rounded-lg border px-2 py-1.5 ${anteprima.disponibilita.posto === true ? "bg-emerald-50 border-emerald-200 text-emerald-900" : anteprima.disponibilita.posto === false ? "bg-red-50 border-red-200 text-red-800" : "bg-neutral-50 border-neutral-200 text-neutral-700"}`}>
                      {anteprima.disponibilita.frase}
                    </div>
                  )}
                  {(anteprima.avvisi || []).map((a, i) => (
                    <p key={i} className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-2 py-1.5">{a}</p>
                  ))}
                  {anteprima.oggetto && <div className="text-xs text-neutral-600"><span className="text-neutral-400">Oggetto:</span> {anteprima.oggetto}</div>}
                  <pre className="whitespace-pre-wrap break-words font-sans text-sm text-neutral-800 bg-neutral-50 border border-neutral-100 rounded-lg p-3 max-h-[70vh] overflow-auto">
                    {anteprima.testo || "(nessun testo)"}
                  </pre>
                  <p className="text-[11px] text-neutral-400">Nome di prova: «Mario». Se cambi un piatto in libreria o il turno si riempie, il testo cambia da solo.</p>
                </>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
