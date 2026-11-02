// @version: v1.1 — sezioni, campi del debito, in attesa di mezzi (2026-11-02)
// Modulo: pratiche
// Elenco in gruppi: Scadute / Da rivedere / Tocca a me / Tocca a loro / In
// attesa di mezzi. Sopra, le SEZIONI come chip con i conteggi (filtro). Chiuse
// in una scheda a parte con ricerca. Pensata prima per l'iPhone: righe ≥ 56px,
// bottoni da 48px. Doc: docs/modulo_pratiche.md §4.
import React, { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { API_BASE, apiFetch } from "../../config/api";
import {
  Btn, PageLayout, StatusBadge, EmptyState, Modal,
  FieldLabel, TextInput, Textarea,
} from "../../components/ui";
import TrgbLoader from "../../components/TrgbLoader";
import useToast from "../../hooks/useToast";
import {
  STATI, oggiISO, fmtData, descriviTermine, leggiErrore,
  ALLEGATO_ACCEPT, ALLEGATO_MAX_MB, fmtEuro, leggiImporto, descriviRevisione, rigaDebito,
} from "./praticheUtils";
import { CampiDebito, SpuntaAttesa, GestioneSezioni, useAnagrafichePratiche } from "./PraticheCampi";

function RigaPratica({ p, onOpen, rossa = false, conSezione = false }) {
  const debito = rigaDebito(p);
  return (
    <button
      type="button"
      onClick={() => onOpen(p.id)}
      className={`w-full text-left bg-white border rounded-xl px-4 py-3 min-h-[56px] flex items-start gap-3 active:bg-neutral-50 transition ${
        rossa ? "border-red-200" : "border-neutral-200"
      }`}
    >
      <div className="flex-1 min-w-0">
        <div className="font-semibold text-brand-ink leading-snug">{p.titolo}</div>
        <div className="text-sm text-neutral-600 truncate">
          {conSezione && p.sezione ? <span className="text-neutral-400">{p.sezione} · </span> : null}
          {p.controparte}
        </div>
        {debito && <div className="text-xs text-neutral-600 mt-0.5 truncate">{debito}</div>}
        {p.in_attesa && (
          <div className={`text-xs mt-0.5 ${p.da_rivedere ? "text-violet-700 font-semibold" : "text-neutral-500"}`}>
            ⏸ In attesa di mezzi · {descriviRevisione(p)}
          </div>
        )}
        {p.stato === "chiusa" ? (
          <div className="text-xs text-neutral-500 mt-0.5">
            Chiusa il {fmtData(p.chiusa_il)} · {p.esito}
          </div>
        ) : (
          (p.termine || !p.in_attesa) && (
            <div className={`text-xs mt-0.5 ${p.scaduta || p.termine_passato ? "text-brand-red font-semibold" : "text-neutral-500"}`}>
              {descriviTermine(p)}
            </div>
          )
        )}
      </div>
      <div className="flex flex-col items-end gap-1 flex-shrink-0">
        {rossa && <StatusBadge tone={STATI[p.stato].tone} size="sm">{STATI[p.stato].label}</StatusBadge>}
        {p.ferma && <StatusBadge tone="violet" size="sm">ferma</StatusBadge>}
      </div>
    </button>
  );
}

function Gruppo({ titolo, colore, pratiche, onOpen, rossa, conSezione }) {
  if (!pratiche.length) return null;
  return (
    <section className="mb-5">
      <h2 className={`text-xs font-bold uppercase tracking-wider mb-2 ${colore}`}>
        {titolo} · {pratiche.length}
      </h2>
      <div className="space-y-2">
        {pratiche.map((p) => <RigaPratica key={p.id} p={p} onOpen={onOpen} rossa={rossa} conSezione={conSezione} />)}
      </div>
    </section>
  );
}

function SceltaStato({ value, onChange, opzioni }) {
  return (
    <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${opzioni.length}, minmax(0, 1fr))` }}>
      {opzioni.map(([v, label]) => (
        <button
          key={v}
          type="button"
          onClick={() => onChange(v)}
          className={`min-h-[48px] rounded-xl border text-sm font-semibold transition ${
            value === v
              ? "bg-brand-blue text-white border-brand-blue"
              : "bg-white text-neutral-700 border-neutral-300"
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

function NuovaPratica({ open, onClose, onCreata, sezioni, tipi, sezioneIniziale, giorni }) {
  const vuoto = {
    titolo: "", controparte: "", controparte_contatto: "", stato: "tocca_a_loro",
    termine: "", aperta_il: oggiISO(), testo: "",
    sezione_id: "", tipo_atto_id: "", rif_atto: "", periodo: "", importo_dovuto: "", importo_residuo: "",
    in_attesa_mezzi: false,
  };
  const [f, setF] = useState(vuoto);
  const [file, setFile] = useState(null);
  const [saving, setSaving] = useState(false);
  const [errore, setErrore] = useState("");
  const set = (k) => (v) => setF((x) => ({ ...x, [k]: v }));

  useEffect(() => {
    if (open) {
      setF({ ...vuoto, aperta_il: oggiISO(), sezione_id: sezioneIniziale ? String(sezioneIniziale) : "" });
      setFile(null); setErrore("");
    }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const salva = async () => {
    if (!f.titolo.trim() || !f.controparte.trim() || !f.testo.trim()) {
      setErrore("Servono titolo, controparte e il testo del primo passo.");
      return;
    }
    if (file && file.size > ALLEGATO_MAX_MB * 1024 * 1024) {
      setErrore(`L'allegato supera ${ALLEGATO_MAX_MB} MB.`);
      return;
    }
    for (const k of ["importo_dovuto", "importo_residuo"]) {
      if (Number.isNaN(leggiImporto(f[k]))) { setErrore("Importo non valido: scrivi ad es. 5.008,07"); return; }
    }
    setSaving(true);
    setErrore("");
    const fd = new FormData();
    Object.entries(f).forEach(([k, v]) => {
      if (k === "in_attesa_mezzi") { if (v) fd.append(k, "true"); return; }
      if (k === "importo_dovuto" || k === "importo_residuo") {
        const n = leggiImporto(v);
        if (n != null) fd.append(k, String(n));
        return;
      }
      if (v !== "") fd.append(k, v);
    });
    if (file) fd.append("allegato", file);
    try {
      const res = await apiFetch(`${API_BASE}/pratiche/`, { method: "POST", body: fd });
      if (!res.ok) { setErrore(await leggiErrore(res)); return; }
      const p = await res.json();
      onCreata(p);
    } catch (e) {
      setErrore(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Nuova pratica"
      subtitle="Uno scambio con un ente, un fornitore, uno studio o un creditore"
      footer={
        <>
          <Btn variant="secondary" size="lg" onClick={onClose}>Annulla</Btn>
          <Btn size="lg" onClick={salva} loading={saving}>Crea</Btn>
        </>
      }
    >
      <div className="space-y-3">
        <FieldLabel label="Titolo" required>
          <TextInput size="lg" value={f.titolo} onChange={set("titolo")} placeholder="Identificazione incaricato recupero crediti" />
        </FieldLabel>
        <FieldLabel label="Controparte" required>
          <TextInput size="lg" value={f.controparte} onChange={set("controparte")} placeholder="Ente, fornitore, studio…" />
        </FieldLabel>
        <FieldLabel label="Contatto" hint="Email, PEC o telefono">
          <TextInput size="lg" value={f.controparte_contatto} onChange={set("controparte_contatto")} />
        </FieldLabel>
        <CampiDebito f={f} set={set} sezioni={sezioni} tipi={tipi} />
        <SpuntaAttesa value={f.in_attesa_mezzi} onChange={set("in_attesa_mezzi")} giorni={giorni} />
        <FieldLabel label="Chi deve muovere">
          <SceltaStato
            value={f.stato}
            onChange={set("stato")}
            opzioni={[["tocca_a_me", "Tocca a me"], ["tocca_a_loro", "Tocca a loro"]]}
          />
        </FieldLabel>
        <div className="grid grid-cols-2 gap-3">
          <FieldLabel label="Aperta il">
            <TextInput size="lg" type="date" value={f.aperta_il} onChange={set("aperta_il")} max={oggiISO()} />
          </FieldLabel>
          <FieldLabel label="Termine" hint={f.stato === "tocca_a_me" ? "Entro quando agire" : "Fino a quando aspetto"}>
            <TextInput size="lg" type="date" value={f.termine} onChange={set("termine")} />
          </FieldLabel>
        </div>
        <FieldLabel label="Primo passo" required>
          <Textarea size="lg" value={f.testo} onChange={set("testo")} rows={2} placeholder="PEC inviata, telefonata, lettera ricevuta…" />
        </FieldLabel>
        <FieldLabel label="Allegato" hint={`PDF o immagine, max ${ALLEGATO_MAX_MB} MB`}>
          <input
            type="file"
            accept={ALLEGATO_ACCEPT}
            onChange={(e) => setFile(e.target.files?.[0] || null)}
            className="block w-full text-sm min-h-[44px]"
          />
        </FieldLabel>
        {errore && <div className="text-sm text-brand-red">{errore}</div>}
      </div>
    </Modal>
  );
}

function ChipSezione({ attivo, onClick, nome, n, rosse, viola }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`min-h-[44px] px-3 rounded-full border text-sm font-semibold whitespace-nowrap transition ${
        attivo ? "bg-brand-ink text-white border-brand-ink" : "bg-white text-neutral-700 border-neutral-300"
      }`}
    >
      {nome} <span className={attivo ? "text-white/70" : "text-neutral-400"}>· {n}</span>
      {rosse > 0 && <span className="ml-1.5 inline-block min-w-[20px] px-1 rounded-full bg-brand-red text-white text-xs">{rosse}</span>}
      {viola > 0 && <span className="ml-1 inline-block min-w-[20px] px-1 rounded-full bg-violet-600 text-white text-xs">{viola}</span>}
    </button>
  );
}

export default function PraticheElenco() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [vista, setVista] = useState("aperte");
  const [pratiche, setPratiche] = useState([]);
  const [riepilogo, setRiepilogo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [errore, setErrore] = useState("");
  const [q, setQ] = useState("");
  const [nuova, setNuova] = useState(false);
  const [gestione, setGestione] = useState(false);
  // null = tutte, "nessuna" = senza sezione, altrimenti id della sezione
  const [sezione, setSezione] = useState(null);
  const { sezioni, tipi, giorni, ricarica: ricaricaAnagrafiche } = useAnagrafichePratiche();

  const carica = useCallback(async () => {
    setLoading(true);
    setErrore("");
    const params = new URLSearchParams();
    if (vista === "chiuse") {
      params.set("stato", "chiusa");
      if (q.trim()) params.set("q", q.trim());
    }
    try {
      const qs = params.toString();
      const [res, rr] = await Promise.all([
        apiFetch(`${API_BASE}/pratiche/${qs ? `?${qs}` : ""}`),
        apiFetch(`${API_BASE}/pratiche/riepilogo`),
      ]);
      if (!res.ok) { setErrore(await leggiErrore(res)); setPratiche([]); return; }
      setPratiche(await res.json());
      if (rr.ok) setRiepilogo(await rr.json());
    } catch (e) {
      setErrore(e.message);
    } finally {
      setLoading(false);
    }
  }, [vista, q]);

  useEffect(() => {
    const t = setTimeout(carica, vista === "chiuse" ? 250 : 0);
    return () => clearTimeout(t);
  }, [carica, vista]);

  const apri = (id) => navigate(`/pratiche/${id}`);

  const idsAttivi = new Set(sezioni.map((s) => s.id));
  const nellaSezione = (p) => {
    if (sezione == null) return true;
    if (sezione === "nessuna") return p.sezione_id == null || !idsAttivi.has(p.sezione_id);
    return p.sezione_id === sezione;
  };
  const visibili = pratiche.filter(nellaSezione);
  const conSezione = sezione == null;

  const scadute = visibili.filter((p) => p.scaduta);
  const daRivedere = visibili.filter((p) => p.da_rivedere);
  const libere = visibili.filter((p) => !p.scaduta && !p.in_attesa);
  const toccaMe = libere.filter((p) => p.stato === "tocca_a_me");
  const toccaLoro = libere.filter((p) => p.stato === "tocca_a_loro");
  const inAttesa = visibili.filter((p) => p.in_attesa && !p.da_rivedere);

  const chiuseView = vista === "chiuse";
  const chip = (r) => (chiuseView ? r.chiuse : r.aperte);
  const sezioneCorrente = sezione != null && sezione !== "nessuna" ? sezioni.find((s) => s.id === sezione) : null;

  return (
    <PageLayout
      title="📂 Pratiche"
      subtitle="Enti, fornitori, studi e creditori: chi deve muovere e fino a quando"
      actions={
        <div className="flex gap-2">
          <Btn variant="secondary" size="lg" onClick={() => setGestione(true)}>Sezioni</Btn>
          <Btn size="lg" onClick={() => setNuova(true)}>+ Nuova</Btn>
        </div>
      }
    >
      <div className="grid grid-cols-2 gap-2 mb-3 max-w-sm">
        {[["aperte", "Aperte"], ["chiuse", "Chiuse"]].map(([v, label]) => (
          <button
            key={v}
            type="button"
            onClick={() => setVista(v)}
            className={`min-h-[44px] rounded-xl border text-sm font-semibold transition ${
              vista === v ? "bg-brand-ink text-white border-brand-ink" : "bg-white text-neutral-700 border-neutral-300"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {riepilogo && (
        <div className="flex gap-2 overflow-x-auto pb-2 mb-3 -mx-1 px-1">
          <ChipSezione
            attivo={sezione == null}
            onClick={() => setSezione(null)}
            nome="Tutte"
            n={chip(riepilogo.totale)}
            rosse={chiuseView ? 0 : riepilogo.totale.scadute}
            viola={chiuseView ? 0 : riepilogo.totale.da_rivedere}
          />
          {riepilogo.sezioni.map((r) => (
            <ChipSezione
              key={r.id ?? "nessuna"}
              attivo={r.id == null ? sezione === "nessuna" : sezione === r.id}
              onClick={() => setSezione(r.id == null ? "nessuna" : r.id)}
              nome={r.nome}
              n={chip(r)}
              rosse={chiuseView ? 0 : r.scadute}
              viola={chiuseView ? 0 : r.da_rivedere}
            />
          ))}
        </div>
      )}

      {!chiuseView && riepilogo && sezione != null && (() => {
        const r = riepilogo.sezioni.find((x) => (sezione === "nessuna" ? x.id == null : x.id === sezione));
        return r && r.residuo != null ? (
          <div className="text-sm text-neutral-600 mb-3">Residuo dovuto nella sezione: <strong>{fmtEuro(r.residuo)}</strong></div>
        ) : null;
      })()}

      {chiuseView && (
        <div className="mb-4 max-w-md">
          <TextInput size="lg" value={q} onChange={setQ} placeholder="Cerca per titolo, controparte o riferimento" />
        </div>
      )}

      {errore && <div className="text-sm text-brand-red mb-3">{errore}</div>}

      {loading ? (
        <TrgbLoader />
      ) : visibili.length === 0 ? (
        <EmptyState
          icon="📂"
          title={chiuseView ? "Nessuna pratica chiusa" : "Nessuna pratica aperta"}
          description={!chiuseView ? "Quando scrivi a un ente o aspetti una risposta, aprila qui: TRGB ti avvisa sui termini." : ""}
          action={!chiuseView ? <Btn size="lg" onClick={() => setNuova(true)}>+ Nuova pratica</Btn> : null}
        />
      ) : !chiuseView ? (
        <div className="max-w-3xl">
          <Gruppo titolo="Scadute" colore="text-brand-red" pratiche={scadute} onOpen={apri} rossa conSezione={conSezione} />
          <Gruppo titolo="Da rivedere" colore="text-violet-700" pratiche={daRivedere} onOpen={apri} rossa conSezione={conSezione} />
          <Gruppo titolo="Tocca a me" colore="text-amber-700" pratiche={toccaMe} onOpen={apri} conSezione={conSezione} />
          <Gruppo titolo="Tocca a loro" colore="text-sky-700" pratiche={toccaLoro} onOpen={apri} conSezione={conSezione} />
          <Gruppo titolo="In attesa di mezzi" colore="text-violet-700" pratiche={inAttesa} onOpen={apri} conSezione={conSezione} />
        </div>
      ) : (
        <div className="max-w-3xl space-y-2">
          {visibili.map((p) => <RigaPratica key={p.id} p={p} onOpen={apri} conSezione={conSezione} />)}
        </div>
      )}

      <NuovaPratica
        open={nuova}
        onClose={() => setNuova(false)}
        onCreata={(p) => { setNuova(false); toast("Pratica creata", { kind: "success" }); apri(p.id); }}
        sezioni={sezioni}
        tipi={tipi}
        giorni={giorni}
        sezioneIniziale={sezioneCorrente?.id}
      />
      <GestioneSezioni
        open={gestione}
        onClose={() => setGestione(false)}
        onCambiato={() => { ricaricaAnagrafiche(); carica(); }}
      />
    </PageLayout>
  );
}
