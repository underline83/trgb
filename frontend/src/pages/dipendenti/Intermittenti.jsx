// @version: v1.0 — Comunicazione UNI-Intermittenti (sessione 2026-07-30)
// Modulo: dipendenti — [core]
//
// Le chiamate degli intermittenti vanno comunicate all'Ispettorato PRIMA che il
// turno inizi (art. 15 D.Lgs 81/2015): ogni giornata non comunicata è una
// sanzione da 400 a 2.400 €, e non è sanabile dopo. Questa pagina prende i turni
// già decisi nel Foglio Settimana, li trasforma nel modulo ministeriale e lo
// manda via email, conservando la prova (il Ministero non risponde mai).
//
// M.I primitives (PageLayout, Btn, StatusBadge, EmptyState, TextInput, Card):
// pagina nuova → li usa.
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { API_BASE, apiFetch } from "../../config/api";
import {
  Btn, StatusBadge, EmptyState, TextInput, FieldLabel, Card, SectionTitle,
} from "../../components/ui";
import PageLayout from "../../components/ui/PageLayout";
import DipendentiNav from "./DipendentiNav";

const U = `${API_BASE}/intermittenti`;

const oggiISO = () => new Date().toISOString().slice(0, 10);
const piuGiorni = (n) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
};
const fmtData = (iso) =>
  iso ? new Date(iso + "T00:00:00").toLocaleDateString("it-IT", { day: "2-digit", month: "short" }) : "—";
const fmtDataOra = (s) => (s ? new Date(s).toLocaleString("it-IT", { dateStyle: "short", timeStyle: "short" }) : "—");

export default function Intermittenti() {
  const [dal, setDal] = useState(oggiISO());
  const [al, setAl] = useState(piuGiorni(14));
  const [preview, setPreview] = useState(null);
  const [registro, setRegistro] = useState([]);
  const [lavoratori, setLavoratori] = useState([]);
  const [settings, setSettings] = useState({});
  const [smtp, setSmtp] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useState(null);
  const [xmlAperto, setXmlAperto] = useState(null);
  const [tab, setTab] = useState("da-comunicare");

  const avviso = (tipo, msg) => {
    setFlash({ tipo, msg });
    setTimeout(() => setFlash(null), 8000);
  };

  const carica = useCallback(async () => {
    setLoading(true);
    try {
      const [rp, rr, rl, rs] = await Promise.all([
        apiFetch(`${U}/da-comunicare/?dal=${dal}&al=${al}`),
        apiFetch(`${U}/comunicazioni/`),
        apiFetch(`${U}/lavoratori/`),
        apiFetch(`${U}/settings/`),
      ]);
      if (!rp.ok || !rr.ok || !rl.ok || !rs.ok) throw new Error("Errore caricamento dati intermittenti");
      const p = await rp.json();
      setPreview(p);
      setRegistro((await rr.json()).comunicazioni || []);
      setLavoratori((await rl.json()).lavoratori || []);
      const s = await rs.json();
      setSettings(s.settings || {});
      setSmtp(s.smtp || null);
    } catch (e) {
      avviso("err", e.message);
    } finally {
      setLoading(false);
    }
  }, [dal, al]);

  useEffect(() => { carica(); }, [carica]);

  const intermittenti = useMemo(() => lavoratori.filter((l) => l.intermittente), [lavoratori]);
  const pronto = smtp?.configurato && settings.uni_cf_datore && settings.uni_email_mittente;

  // ─── Azioni ───────────────────────────────────────────────
  const anteprima = async (modulo) => {
    setBusy(true);
    try {
      const r = await apiFetch(`${U}/comunica/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dal, al, modulo, dry_run: true }),
      });
      const out = await r.json();
      const primo = (out.risultati || [])[0] || {};
      if (primo.xml) setXmlAperto({ modulo, xml: primo.xml, destinatario: primo.destinatario, oggetto: primo.oggetto });
      else avviso("err", (primo.errori || out.errori || ["Anteprima non disponibile"]).join(" · "));
    } catch (e) {
      avviso("err", e.message);
    } finally {
      setBusy(false);
    }
  };

  const invia = async (modulo) => {
    const n = modulo ? 1 : preview?.n_moduli || 0;
    if (!window.confirm(
      `Invio ${n} modulo/i a ${settings.uni_destinatario}.\n\n` +
      "Il Ministero non manda ricevute: l'invio non si può richiamare, " +
      "si può solo annullare con un secondo modulo. Procedo?"
    )) return;
    setBusy(true);
    try {
      const r = await apiFetch(`${U}/comunica/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dal, al, modulo }),
      });
      const out = await r.json();
      if (out.ok) avviso("ok", `Inviat${out.n_moduli === 1 ? "o 1 modulo" : `i ${out.n_moduli} moduli`} a ${settings.uni_destinatario}`);
      else avviso("err", (out.risultati || []).flatMap((x) => x.errori || []).join(" · ") || (out.errori || []).join(" · "));
      await carica();
    } catch (e) {
      avviso("err", e.message);
    } finally {
      setBusy(false);
    }
  };

  const annulla = async (id) => {
    if (!window.confirm(
      "Manda al Ministero un modulo di ANNULLAMENTO con gli stessi dati.\n" +
      "Le giornate torneranno da comunicare. Procedo?"
    )) return;
    setBusy(true);
    try {
      const r = await apiFetch(`${U}/comunicazioni/${id}/annulla`, { method: "POST" });
      const out = await r.json();
      out.ok ? avviso("ok", "Annullamento inviato") : avviso("err", (out.errori || []).join(" · "));
      await carica();
    } catch (e) {
      avviso("err", e.message);
    } finally {
      setBusy(false);
    }
  };




  // ─── Render ───────────────────────────────────────────────
  const TABS = [
    { key: "da-comunicare", label: `Da comunicare${preview?.righe?.length ? ` (${preview.righe.length})` : ""}` },
    { key: "registro", label: `Registro invii${registro.length ? ` (${registro.length})` : ""}` },
  ];

  return (
    <PageLayout
      nav={<DipendentiNav current="intermittenti" />}
      title="Chiamate intermittenti"
      subtitle="Comunicazione preventiva all'Ispettorato del Lavoro (art. 15 D.Lgs 81/2015)"
      actions={
        <>
          <Btn variant="ghost" size="md" onClick={carica} loading={loading}>Aggiorna</Btn>
          <Btn size="md" disabled={!pronto || busy || !preview?.n_moduli} onClick={() => invia(null)}>
            Invia {preview?.n_moduli > 1 ? `${preview.n_moduli} moduli` : "comunicazione"}
          </Btn>
        </>
      }
    >
      {flash && (
        <div className={`mb-4 px-4 py-3 rounded-xl text-sm border ${
          flash.tipo === "ok"
            ? "bg-green-50 border-green-200 text-green-800"
            : "bg-red-50 border-red-200 text-red-800"}`}>
          {flash.msg}
        </div>
      )}

      {!pronto && !loading && (
        <div className="mb-4 px-4 py-3 rounded-xl text-sm bg-amber-50 border border-amber-200 text-amber-900">
          <b>Invio non ancora possibile.</b>{" "}
          {!smtp?.configurato && <>Manca la configurazione SMTP in <code>.env</code> ({(smtp?.mancanti || []).join(", ")}). </>}
          {!settings.uni_cf_datore && <>Manca il codice fiscale del datore. </>}
          {!settings.uni_email_mittente && <>Manca l'email del datore (il modulo la esige). </>}
          {!intermittenti.length && <>Nessun dipendente è segnato come intermittente in Anagrafica. </>}
          Si sistema in <b>Impostazioni → Intermittenti</b>.
        </div>
      )}

      <div className="flex gap-1 mb-4 border-b border-neutral-200">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-3 py-2 text-sm font-medium -mb-px border-b-2 transition ${
              tab === t.key
                ? "border-purple-600 text-purple-900"
                : "border-transparent text-neutral-500 hover:text-neutral-800"}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ═══ DA COMUNICARE ═══ */}
      {tab === "da-comunicare" && (
        <>
          <div className="flex flex-wrap items-end gap-3 mb-4">
            <div>
              <FieldLabel>Dal</FieldLabel>
              <TextInput type="date" value={dal} onChange={setDal} />
            </div>
            <div>
              <FieldLabel>Al</FieldLabel>
              <TextInput type="date" value={al} onChange={setAl} />
            </div>
            <div className="text-xs text-neutral-500 pb-2">
              {intermittenti.length} lavorator{intermittenti.length === 1 ? "e" : "i"} con contratto intermittente —
              si segnano in <a href="/dipendenti/anagrafica" className="text-brand-blue hover:underline">Anagrafica</a>,
              i dati del datore in <a href="/dipendenti/impostazioni" className="text-brand-blue hover:underline">Impostazioni</a>
            </div>
          </div>

          {!!preview?.anomalie?.length && (
            <div className="mb-4 px-4 py-3 rounded-xl text-sm bg-red-50 border border-red-200 text-red-900">
              <div className="font-semibold mb-1">Da sistemare ({preview.anomalie.length})</div>
              <ul className="list-disc pl-5 space-y-0.5">
                {preview.anomalie.map((a, i) => (
                  <li key={i}>{a.nome} — {fmtData(a.data)}: {a.problema}</li>
                ))}
              </ul>
            </div>
          )}

          {loading ? (
            <div className="text-sm text-neutral-500">Caricamento…</div>
          ) : !preview?.moduli?.length ? (
            <EmptyState
              icon="✅"
              title="Niente da comunicare"
              description="Nessuna giornata di intermittenti da dichiarare nel periodo scelto. I turni OPZIONALE non entrano: vanno prima confermati."
            />
          ) : (
            preview.moduli.map((modulo, mi) => (
              <Card key={mi} className="mb-4">
                <div className="flex items-center justify-between mb-3">
                  <SectionTitle>
                    Modulo {mi + 1} di {preview.moduli.length} — {modulo.length} riga/e
                  </SectionTitle>
                  <div className="flex gap-2">
                    <Btn variant="ghost" size="sm" onClick={() => anteprima(mi + 1)} disabled={busy}>
                      Vedi XML
                    </Btn>
                    <Btn size="sm" onClick={() => invia(mi + 1)} disabled={!pronto || busy}>
                      Invia questo
                    </Btn>
                  </div>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-xs text-neutral-500 border-b border-neutral-200">
                        <th className="py-2 pr-3">#</th>
                        <th className="py-2 pr-3">Lavoratore</th>
                        <th className="py-2 pr-3">Codice fiscale</th>
                        <th className="py-2 pr-3">Cod. comunicazione</th>
                        <th className="py-2 pr-3">Data inizio</th>
                        <th className="py-2 pr-3">Data fine</th>
                        <th className="py-2">Giornate</th>
                      </tr>
                    </thead>
                    <tbody>
                      {modulo.map((r, i) => (
                        <tr key={i} className="border-b border-neutral-100 last:border-0">
                          <td className="py-2 pr-3 text-neutral-400">{i + 1}</td>
                          <td className="py-2 pr-3 font-medium">{r.nome}</td>
                          <td className="py-2 pr-3 font-mono text-xs">{r.codice_fiscale}</td>
                          <td className="py-2 pr-3 font-mono text-xs">
                            {r.codice_comunicazione || <span className="text-neutral-400">—</span>}
                          </td>
                          <td className="py-2 pr-3">{fmtData(r.data_inizio)}</td>
                          <td className="py-2 pr-3">
                            {r.data_fine ? fmtData(r.data_fine)
                              : <span className="text-neutral-400" title="Giornata singola: il modulo vuole la data fine vuota">—</span>}
                          </td>
                          <td className="py-2">{r.giorni?.length || 1}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            ))
          )}

          {preview?.moduli?.length > 1 && (
            <p className="text-xs text-neutral-500">
              Più di 10 lavoratori non stanno in un modulo solo, e nella stessa email non si possono
              mettere due allegati (l'invio sembrerebbe riuscito ma i moduli non entrerebbero a
              sistema). Quindi partono {preview.moduli.length} email separate, una per modulo.
            </p>
          )}
        </>
      )}

      {/* ═══ REGISTRO ═══ */}
      {tab === "registro" && (
        !registro.length ? (
          <EmptyState icon="📨" title="Nessun invio registrato"
            description="Qui finiscono tutte le comunicazioni inviate, con l'allegato scaricabile: è la prova dell'adempimento, dato che il Ministero non manda ricevute." />
        ) : (
          <div className="space-y-3">
            {registro.map((c) => (
              <Card key={c.id}>
                <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                  <div className="flex items-center gap-2">
                    <StatusBadge tone={c.esito === "INVIATA" ? "success" : c.esito === "ERRORE" ? "danger" : "neutral"} dot>
                      {c.esito}
                    </StatusBadge>
                    {c.tipo === "ANNULLAMENTO" && <StatusBadge tone="warning">ANNULLAMENTO</StatusBadge>}
                    <span className="text-sm text-neutral-600">
                      {c.n_righe} riga/e · {fmtData(c.periodo_dal)}
                      {c.periodo_al !== c.periodo_dal ? ` → ${fmtData(c.periodo_al)}` : ""}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-neutral-500">{fmtDataOra(c.inviata_at || c.created_at)}</span>
                    <a href={`${U}/comunicazioni/${c.id}/allegato`} target="_blank" rel="noreferrer"
                       className="text-xs text-brand-blue hover:underline">Allegato</a>
                    {c.tipo === "NUOVA" && c.esito === "INVIATA" && (
                      <Btn variant="ghost" size="sm" tone="danger" onClick={() => annulla(c.id)} disabled={busy}>
                        Annulla
                      </Btn>
                    )}
                  </div>
                </div>
                {c.errore && <div className="text-xs text-red-700 mb-2">{c.errore}</div>}
                <div className="text-xs text-neutral-600 flex flex-wrap gap-x-4 gap-y-1">
                  {(c.righe || []).map((r) => (
                    <span key={r.riga}>
                      {r.cognome ? `${r.cognome} ${r.nome}` : r.codice_fiscale}: {fmtData(r.data_inizio)}
                      {r.data_fine ? `→${fmtData(r.data_fine)}` : ""}
                    </span>
                  ))}
                </div>
              </Card>
            ))}
          </div>
        )
      )}

      {/* ═══ XML ANTEPRIMA ═══ */}
      {xmlAperto && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50"
             onClick={() => setXmlAperto(null)}>
          <div className="bg-white rounded-2xl max-w-3xl w-full max-h-[80vh] overflow-auto p-5"
               onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-bold text-brand-ink">Modulo {xmlAperto.modulo} — allegato che verrebbe inviato</h3>
              <Btn variant="ghost" size="sm" onClick={() => setXmlAperto(null)}>Chiudi</Btn>
            </div>
            <div className="text-xs text-neutral-500 mb-2">
              A: {xmlAperto.destinatario} · Oggetto: {xmlAperto.oggetto}
            </div>
            <pre className="text-[11px] bg-neutral-50 border border-neutral-200 rounded-lg p-3 whitespace-pre-wrap break-all">
              {xmlAperto.xml}
            </pre>
          </div>
        </div>
      )}
    </PageLayout>
  );
}
