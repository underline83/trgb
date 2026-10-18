// @version: v1.1 — + conti da abbinare, tavoli della cassa, tolleranza (2026-10-18)
// Modulo: cassa — scarico dei conti chiusi da iPratico Cloud (riga per riga).
// Backend: app/routers/cassa_ipratico_router.py · Doc: docs/analisi_ipratico_cloud.md
import React, { useCallback, useEffect, useState } from "react";
import { API_BASE, apiFetch } from "../../config/api";
import { Btn, StatusBadge } from "../../components/ui";
import ContiServizio from "../../components/cassa/ContiServizio";

const BASE = `${API_BASE}/cassa/ipratico`;
const INIZIO_STORICO = "2024-09-01"; // primo conto presente in iPratico Cloud (analisi 2026-10-18)

const iso = (d) => d.toISOString().slice(0, 10);
const ieri = () => { const d = new Date(); d.setDate(d.getDate() - 1); return iso(d); };
const euro = (n) => (n ?? 0).toLocaleString("it-IT", { style: "currency", currency: "EUR" });
const ora = (s) => (s ? s.slice(11, 16) : "—");
const METODI = { "credit-card": "carta", cash: "contanti" };

async function leggi(res) {
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(j.detail || `Errore ${res.status}`);
  return j;
}

// ── Giorni con conti da abbinare ─────────────────────────────────────────
function DaSistemare() {
  const [turni, setTurni] = useState(null);
  const [aperto, setAperto] = useState(null);
  const carica = useCallback(async () => {
    try { setTurni((await leggi(await apiFetch(`${BASE}/da-sistemare/`))).turni); } catch { setTurni([]); }
  }, []);
  useEffect(() => { carica(); }, [carica]);
  if (!turni) return null;
  return (
    <section className="rounded-xl border border-neutral-200 p-4 space-y-3">
      <h3 className="font-semibold text-neutral-800">Conti da abbinare ai clienti</h3>
      {turni.length === 0
        ? <p className="text-sm text-neutral-500">Niente da sistemare negli ultimi 60 giorni.</p>
        : <div className="space-y-2">
            {turni.map((t) => {
              const key = `${t.data}-${t.turno}`;
              return (
                <div key={key} className="rounded-lg border border-neutral-100">
                  <button type="button" onClick={() => setAperto(aperto === key ? null : key)}
                    className="w-full text-left px-3 py-2 min-h-[44px] flex flex-wrap gap-3 items-center hover:bg-neutral-50">
                    <span className="font-medium w-40">{t.data} · {t.turno}</span>
                    {t.proposti > 0 && <StatusBadge tone="info">{t.proposti} da confermare</StatusBadge>}
                    {t.da_fare > 0 && <StatusBadge tone="warning">{t.da_fare} senza prenotazione</StatusBadge>}
                    <span className="text-neutral-400 text-sm">{t.conti} conti</span>
                  </button>
                  {aperto === key && <div className="px-3 pb-3"><ContiServizio data={t.data} turno={t.turno} compatto /></div>}
                </div>
              );
            })}
          </div>}
    </section>
  );
}

// ── Tavoli della cassa → tavoli TRGB ─────────────────────────────────────
function TavoliCassa() {
  const [dati, setDati] = useState(null);
  const [modifica, setModifica] = useState({});
  const [finestra, setFinestra] = useState("");
  const [msg, setMsg] = useState(null);
  const carica = useCallback(async () => {
    try {
      const d = await leggi(await apiFetch(`${BASE}/tavoli/`));
      setDati(d); setFinestra(String(d.finestra_minuti));
    } catch (e) { setMsg(e.message); }
  }, []);
  useEffect(() => { carica(); }, [carica]);

  const salvaAlias = async (nome_cassa, nome_trgb, togli = false) => {
    try {
      const d = await leggi(await apiFetch(`${BASE}/tavoli/`, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nome_cassa, nome_trgb: nome_trgb || null, togli }),
      }));
      setDati({ ...dati, tavoli: d.tavoli }); setModifica({ ...modifica, [nome_cassa]: undefined });
    } catch (e) { setMsg(e.message); }
  };
  const salvaFinestra = async () => {
    try {
      const d = await leggi(await apiFetch(`${BASE}/finestra/`, {
        method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ minuti: Number(finestra) }),
      }));
      setFinestra(String(d.finestra_minuti)); setMsg("Salvato");
    } catch (e) { setMsg(e.message); }
  };
  if (!dati) return null;
  return (
    <section className="rounded-xl border border-neutral-200 p-4 space-y-3">
      <h3 className="font-semibold text-neutral-800">Tavoli della cassa</h3>
      <p className="text-sm text-neutral-500">
        «Tavolo 04C» in cassa è il tavolo «4C» in TRGB: lo capisce da solo. Correggi solo quelli che escono sbagliati;
        lascia vuoto per i tavoli da non abbinare mai (banco, conti a nome).
      </p>
      <div className="flex flex-wrap items-end gap-3">
        <label className="text-sm text-neutral-600">Tolleranza sull'ora (minuti)
          <input type="number" min="15" max="600" value={finestra} onChange={(e) => setFinestra(e.target.value)}
            className="block mt-1 w-28 border border-neutral-300 rounded-lg px-3 py-2 min-h-[44px]" />
        </label>
        <Btn variant="secondary" size="md" onClick={salvaFinestra}>Salva</Btn>
        {msg && <span className="text-sm text-neutral-600">{msg}</span>}
      </div>
      {dati.tavoli.length === 0
        ? <p className="text-sm text-neutral-500">I tavoli compaiono qui dopo il primo scarico.</p>
        : <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6">
            {dati.tavoli.map((t) => (
              <div key={t.nome_cassa} className="flex items-center gap-2 py-1.5 border-b border-neutral-100 text-sm">
                <span className="w-28">{t.nome_cassa}</span>
                <span className="text-neutral-400">→</span>
                {modifica[t.nome_cassa] !== undefined ? (
                  <>
                    <input value={modifica[t.nome_cassa]} onChange={(e) => setModifica({ ...modifica, [t.nome_cassa]: e.target.value })}
                      className="w-20 border border-neutral-300 rounded px-2 py-1" placeholder="vuoto" />
                    <Btn size="sm" onClick={() => salvaAlias(t.nome_cassa, modifica[t.nome_cassa])}>OK</Btn>
                  </>
                ) : (
                  <>
                    <span className={`w-20 font-medium ${t.nome_trgb ? "" : "text-neutral-400"}`}>{t.nome_trgb || "ignorato"}</span>
                    <button type="button" className="text-indigo-700 text-xs" onClick={() => setModifica({ ...modifica, [t.nome_cassa]: t.nome_trgb || "" })}>cambia</button>
                    {t.alias && <button type="button" className="text-neutral-500 text-xs" onClick={() => salvaAlias(t.nome_cassa, null, true)}>automatico</button>}
                  </>
                )}
              </div>
            ))}
          </div>}
    </section>
  );
}

export default function IpraticoCloudSezione() {
  const [stato, setStato] = useState(null);
  const [errore, setErrore] = useState(null);
  const [prova, setProva] = useState(null);
  const [provando, setProvando] = useState(false);
  const [dal, setDal] = useState(ieri());
  const [al, setAl] = useState(ieri());
  const [avvio, setAvvio] = useState(false);
  const [giorno, setGiorno] = useState(ieri());
  const [conti, setConti] = useState(null);
  const [aperto, setAperto] = useState(null);

  const carica = useCallback(async () => {
    try { setStato(await leggi(await apiFetch(`${BASE}/stato/`))); }
    catch (e) { setErrore(e.message); }
  }, []);

  useEffect(() => { carica(); }, [carica]);

  // Mentre uno scarico lungo è in corso, aggiorna ogni 3 secondi
  const inCorso = !!stato?.periodo?.in_corso;
  useEffect(() => {
    if (!inCorso) return undefined;
    const t = setInterval(carica, 3000);
    return () => clearInterval(t);
  }, [inCorso, carica]);

  const provaAccesso = async () => {
    setProvando(true); setProva(null); setErrore(null);
    try { setProva(await leggi(await apiFetch(`${BASE}/prova/`, { method: "POST" }))); }
    catch (e) { setProva({ ok: false, errore: e.message }); }
    finally { setProvando(false); }
  };

  const scarica = async () => {
    setAvvio(true); setErrore(null);
    try {
      await leggi(await apiFetch(`${BASE}/scarica/`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ dal, al }),
      }));
      await carica();
    } catch (e) { setErrore(e.message); }
    finally { setAvvio(false); }
  };

  const vediConti = async () => {
    setErrore(null); setAperto(null);
    try { setConti((await leggi(await apiFetch(`${BASE}/conti/?data=${giorno}`))).conti); }
    catch (e) { setErrore(e.message); }
  };

  const p = stato?.periodo;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-indigo-900 font-playfair mb-1">iPratico Cloud</h2>
        <p className="text-neutral-500 text-sm">
          Ogni notte TRGB scarica dalla cassa i conti chiusi, con tavolo, coperti, orari e ogni riga battuta.
          Servono per sapere cosa ha mangiato e speso ogni cliente.
        </p>
      </div>

      {errore && <div className="rounded-lg border border-red-200 bg-red-50 text-red-700 text-sm px-3 py-2">{errore}</div>}

      {/* STATO */}
      <section className="rounded-xl border border-neutral-200 p-4 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          {stato?.configurato
            ? <StatusBadge tone="success">Credenziali presenti</StatusBadge>
            : <StatusBadge tone="warning">Credenziali mancanti</StatusBadge>}
          {stato?.notte?.attivo && stato?.notte?.prossimo &&
            <StatusBadge tone="info">Prossimo scarico: {stato.notte.prossimo}</StatusBadge>}
          <span className="text-sm text-neutral-600">
            {stato ? <>{stato.conti} conti salvati{stato.primo_giorno && <> · dal {stato.primo_giorno} al {stato.ultimo_giorno}</>}</> : "…"}
          </span>
        </div>
        {stato && !stato.configurato && (
          <p className="text-sm text-neutral-600">
            Sul server vanno aggiunte nel file <code>.env</code> le righe <code>IPRATICO_CLOUD_EMAIL</code> e{" "}
            <code>IPRATICO_CLOUD_PASSWORD</code> (meglio un utente iPratico dedicato a TRGB), poi riavviare il backend.
          </p>
        )}
        <div className="flex flex-wrap items-center gap-3">
          <Btn variant="secondary" size="md" onClick={provaAccesso} loading={provando} disabled={!stato?.configurato}>
            Prova l'accesso
          </Btn>
          {prova && (prova.ok
            ? <span className="text-sm text-emerald-700">Accesso riuscito · locale {prova.locale} · sale: {prova.sale.join(", ")} · {prova.tavoli} tavoli</span>
            : <span className="text-sm text-red-700">{prova.errore}</span>)}
        </div>
      </section>

      {/* SCARICO */}
      <section className="rounded-xl border border-neutral-200 p-4 space-y-3">
        <h3 className="font-semibold text-neutral-800">Scarica un periodo</h3>
        <p className="text-sm text-neutral-500">
          Rifarlo non crea doppioni: i conti già presenti si aggiornano. Lo storico in iPratico parte da settembre 2024.
        </p>
        <div className="flex flex-wrap items-end gap-3">
          <label className="text-sm text-neutral-600">Dal
            <input type="date" value={dal} onChange={(e) => setDal(e.target.value)}
              className="block mt-1 border border-neutral-300 rounded-lg px-3 py-2 min-h-[44px]" />
          </label>
          <label className="text-sm text-neutral-600">Al
            <input type="date" value={al} onChange={(e) => setAl(e.target.value)}
              className="block mt-1 border border-neutral-300 rounded-lg px-3 py-2 min-h-[44px]" />
          </label>
          <Btn variant="ghost" size="md" onClick={() => { setDal(INIZIO_STORICO); setAl(ieri()); }}>Tutto lo storico</Btn>
          <Btn size="md" onClick={scarica} loading={avvio} disabled={!stato?.configurato || inCorso}>Scarica</Btn>
        </div>
        {p && (
          <div className="text-sm text-neutral-700">
            {p.in_corso ? "In corso" : "Finito"}: {p.fatti}/{p.giorni} giorni ({p.dal} → {p.al}) · {p.conti} conti
            {p.errori > 0 && <span className="text-red-700"> · {p.errori} giorni con errore{p.ultimo_errore && `: ${p.ultimo_errore}`}</span>}
          </div>
        )}
      </section>

      {/* ULTIMI SCARICHI */}
      {stato?.ultimi_scarichi?.length > 0 && (
        <section className="space-y-2">
          <h3 className="font-semibold text-neutral-800">Ultimi scarichi</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-neutral-500">
                <tr><th className="py-1 pr-3">Giorno</th><th className="pr-3">Esito</th><th className="pr-3">Conti</th>
                  <th className="pr-3">Totale</th><th className="pr-3">Da</th><th>Quando</th></tr>
              </thead>
              <tbody>
                {stato.ultimi_scarichi.map((s, i) => (
                  <tr key={i} className="border-t border-neutral-100">
                    <td className="py-1.5 pr-3">{s.giorno}</td>
                    <td className="pr-3">{s.esito === "ok"
                      ? <StatusBadge tone="success">ok</StatusBadge>
                      : <span title={s.errore}><StatusBadge tone="danger">errore</StatusBadge> <span className="text-red-700">{s.errore}</span></span>}</td>
                    <td className="pr-3">{s.conti}</td>
                    <td className="pr-3">{euro(s.totale)}</td>
                    <td className="pr-3">{s.avviato_da}</td>
                    <td className="text-neutral-500">{s.fatto_at}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <DaSistemare />

      <TavoliCassa />

      {/* CONTROLLO: CONTI DI UN GIORNO */}
      <section className="rounded-xl border border-neutral-200 p-4 space-y-3">
        <h3 className="font-semibold text-neutral-800">Controlla i conti di un giorno</h3>
        <div className="flex flex-wrap items-end gap-3">
          <input type="date" value={giorno} onChange={(e) => setGiorno(e.target.value)}
            className="border border-neutral-300 rounded-lg px-3 py-2 min-h-[44px]" />
          <Btn variant="secondary" size="md" onClick={vediConti}>Mostra</Btn>
          {conti && <span className="text-sm text-neutral-600">
            {conti.length} conti · {conti.reduce((a, c) => a + (c.coperti || 0), 0)} coperti · {euro(conti.reduce((a, c) => a + c.totale, 0))}
          </span>}
        </div>
        {conti && conti.length === 0 && <p className="text-sm text-neutral-500">Nessun conto salvato per questo giorno.</p>}
        {conti && conti.length > 0 && (
          <div className="divide-y divide-neutral-100">
            {conti.map((c) => (
              <div key={c.id}>
                <button type="button" onClick={() => setAperto(aperto === c.id ? null : c.id)}
                  className="w-full text-left py-2.5 min-h-[44px] flex flex-wrap items-center gap-x-4 gap-y-1 hover:bg-neutral-50 rounded-lg px-2">
                  <span className="w-24 text-neutral-500">{ora(c.aperto_at)}–{ora(c.chiuso_at)}</span>
                  <span className="w-36 font-medium">{c.tavolo || "banco"}{c.sala && <span className="text-neutral-400 font-normal"> · {c.sala}</span>}</span>
                  <span className="w-20">{c.coperti ? `${c.coperti} cop.` : ""}</span>
                  <span className="w-24 font-semibold">{euro(c.totale)}</span>
                  <span className="text-neutral-500 text-xs">
                    {c.romana ? "alla romana · " : ""}n. {c.documenti} · {c.pagamenti.map((x) => `${METODI[x.metodo] || x.metodo} ${euro(x.importo)}`).join(", ")}
                  </span>
                </button>
                {aperto === c.id && (
                  <ul className="pl-28 pb-3 text-sm text-neutral-700 space-y-0.5">
                    {c.righe.filter((r) => !r.servizio).map((r, i) => (
                      <li key={i} className="flex gap-3">
                        <span className="w-10 text-right">{r.quantita}×</span>
                        <span className="flex-1">{r.nome}<span className="text-neutral-400"> · {r.categoria || "—"}</span></span>
                        <span className="w-20 text-right">{euro(r.totale)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
