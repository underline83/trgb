// @version: v1.0 — nascita del modulo Pratiche (2026-10-08)
// Modulo: pratiche
// Elenco in tre gruppi: Scadute / Tocca a me / Tocca a loro. Chiuse in una
// scheda a parte con ricerca. Pensata prima per l'iPhone: righe ≥ 56px,
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
  ALLEGATO_ACCEPT, ALLEGATO_MAX_MB,
} from "./praticheUtils";

function RigaPratica({ p, onOpen, rossa = false }) {
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
        <div className="text-sm text-neutral-600 truncate">{p.controparte}</div>
        {p.stato === "chiusa" ? (
          <div className="text-xs text-neutral-500 mt-0.5">
            Chiusa il {fmtData(p.chiusa_il)} · {p.esito}
          </div>
        ) : (
          <div className={`text-xs mt-0.5 ${p.scaduta ? "text-brand-red font-semibold" : "text-neutral-500"}`}>
            {descriviTermine(p)}
          </div>
        )}
      </div>
      <div className="flex flex-col items-end gap-1 flex-shrink-0">
        {rossa && <StatusBadge tone={STATI[p.stato].tone} size="sm">{STATI[p.stato].label}</StatusBadge>}
        {p.ferma && <StatusBadge tone="violet" size="sm">ferma</StatusBadge>}
      </div>
    </button>
  );
}

function Gruppo({ titolo, colore, pratiche, onOpen, rossa }) {
  if (!pratiche.length) return null;
  return (
    <section className="mb-5">
      <h2 className={`text-xs font-bold uppercase tracking-wider mb-2 ${colore}`}>
        {titolo} · {pratiche.length}
      </h2>
      <div className="space-y-2">
        {pratiche.map((p) => <RigaPratica key={p.id} p={p} onOpen={onOpen} rossa={rossa} />)}
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

function NuovaPratica({ open, onClose, onCreata }) {
  const vuoto = {
    titolo: "", controparte: "", controparte_contatto: "", stato: "tocca_a_loro",
    termine: "", aperta_il: oggiISO(), testo: "",
  };
  const [f, setF] = useState(vuoto);
  const [file, setFile] = useState(null);
  const [saving, setSaving] = useState(false);
  const [errore, setErrore] = useState("");
  const set = (k) => (v) => setF((x) => ({ ...x, [k]: v }));

  useEffect(() => {
    if (open) { setF({ ...vuoto, aperta_il: oggiISO() }); setFile(null); setErrore(""); }
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
    setSaving(true);
    setErrore("");
    const fd = new FormData();
    Object.entries(f).forEach(([k, v]) => { if (v !== "") fd.append(k, v); });
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

export default function PraticheElenco() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [vista, setVista] = useState("aperte");
  const [pratiche, setPratiche] = useState([]);
  const [loading, setLoading] = useState(true);
  const [errore, setErrore] = useState("");
  const [q, setQ] = useState("");
  const [nuova, setNuova] = useState(false);

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
      const res = await apiFetch(`${API_BASE}/pratiche/${qs ? `?${qs}` : ""}`);
      if (!res.ok) { setErrore(await leggiErrore(res)); setPratiche([]); return; }
      setPratiche(await res.json());
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

  const scadute = pratiche.filter((p) => p.scaduta);
  const toccaMe = pratiche.filter((p) => !p.scaduta && p.stato === "tocca_a_me");
  const toccaLoro = pratiche.filter((p) => !p.scaduta && p.stato === "tocca_a_loro");

  return (
    <PageLayout
      title="📂 Pratiche"
      subtitle="Enti, fornitori, studi e creditori: chi deve muovere e fino a quando"
      actions={<Btn size="lg" onClick={() => setNuova(true)}>+ Nuova</Btn>}
    >
      <div className="grid grid-cols-2 gap-2 mb-4 max-w-sm">
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

      {vista === "chiuse" && (
        <div className="mb-4 max-w-md">
          <TextInput size="lg" value={q} onChange={setQ} placeholder="Cerca per titolo o controparte" />
        </div>
      )}

      {errore && <div className="text-sm text-brand-red mb-3">{errore}</div>}

      {loading ? (
        <TrgbLoader />
      ) : pratiche.length === 0 ? (
        <EmptyState
          icon="📂"
          title={vista === "aperte" ? "Nessuna pratica aperta" : "Nessuna pratica chiusa"}
          description={vista === "aperte" ? "Quando scrivi a un ente o aspetti una risposta, aprila qui: TRGB ti avvisa sui termini." : ""}
          action={vista === "aperte" ? <Btn size="lg" onClick={() => setNuova(true)}>+ Nuova pratica</Btn> : null}
        />
      ) : vista === "aperte" ? (
        <div className="max-w-3xl">
          <Gruppo titolo="Scadute" colore="text-brand-red" pratiche={scadute} onOpen={apri} rossa />
          <Gruppo titolo="Tocca a me" colore="text-amber-700" pratiche={toccaMe} onOpen={apri} />
          <Gruppo titolo="Tocca a loro" colore="text-sky-700" pratiche={toccaLoro} onOpen={apri} />
        </div>
      ) : (
        <div className="max-w-3xl space-y-2">
          {pratiche.map((p) => <RigaPratica key={p.id} p={p} onOpen={apri} />)}
        </div>
      )}

      <NuovaPratica
        open={nuova}
        onClose={() => setNuova(false)}
        onCreata={(p) => { setNuova(false); toast("Pratica creata", { kind: "success" }); apri(p.id); }}
      />
    </PageLayout>
  );
}
