// @version: v1.1 — sezioni, campi del debito, in attesa di mezzi, rate (2026-11-02)
// Modulo: pratiche
// Scheda: testata (contatto tappabile, sezione, atto e importi), riquadro
// «Nuovo passo» in alto, collegamenti come chip, rate della rateizzazione
// collegata, storia dei passi dal più recente. Il termine e lo stato cambiano
// SOLO con un passo, così restano nella storia; i campi del debito: il primo
// valore si scrive, ogni cambio lascia un passo «da → a».
// Doc: docs/modulo_pratiche.md §4.
import React, { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { API_BASE, apiFetch } from "../../config/api";
import {
  Btn, PageLayout, StatusBadge, EmptyState, Modal,
  FieldLabel, TextInput, Textarea, Select,
} from "../../components/ui";
import TrgbLoader from "../../components/TrgbLoader";
import useToast from "../../hooks/useToast";
import {
  STATI, oggiISO, fmtData, descriviTermine, hrefContatto, leggiErrore,
  ALLEGATO_ACCEPT, ALLEGATO_MAX_MB, fmtEuro, leggiImporto, descriviRevisione, classificaRate,
} from "./praticheUtils";
import { CampiDebito, SpuntaAttesa, useAnagrafichePratiche } from "./PraticheCampi";

// Campi del debito: valori del form ⇄ pratica (v1.1).
const CAMPI = ["sezione_id", "tipo_atto_id", "rif_atto", "periodo", "importo_dovuto", "importo_residuo"];
const fmtImportoForm = (v) => (v == null ? "" : String(v).replace(".", ","));
function formDaPratica(p) {
  return {
    sezione_id: p.sezione_id == null ? "" : String(p.sezione_id),
    tipo_atto_id: p.tipo_atto_id == null ? "" : String(p.tipo_atto_id),
    rif_atto: p.rif_atto || "",
    periodo: p.periodo || "",
    importo_dovuto: fmtImportoForm(p.importo_dovuto),
    importo_residuo: fmtImportoForm(p.importo_residuo),
  };
}
// Solo i campi cambiati: {campo: valore} (null = svuota). Errore se un importo non si legge.
function campiCambiati(f, p) {
  const out = {};
  for (const k of CAMPI) {
    let v = f[k];
    if (k === "importo_dovuto" || k === "importo_residuo") {
      v = leggiImporto(v);
      if (Number.isNaN(v)) throw new Error("Importo non valido: scrivi ad es. 5.008,07");
    } else if (k === "sezione_id" || k === "tipo_atto_id") {
      v = v === "" ? null : Number(v);
    } else {
      v = v.trim() === "" ? null : v.trim();
    }
    const prima = p[k] == null || p[k] === "" ? null : p[k];
    if (v !== prima) out[k] = v;
  }
  return out;
}

const MODULI_COLLEGABILI = [
  { value: "controllo_gestione", label: "Controllo di gestione" },
  { value: "acquisti", label: "Acquisti" },
  { value: "dipendenti", label: "Dipendenti" },
  { value: "clienti", label: "Clienti" },
  { value: "prenotazioni", label: "Prenotazioni" },
];
const TIPI_COLLEGAMENTO = [
  { value: "spesa_fissa", label: "Rateizzazione (spesa fissa)" },
  { value: "uscita", label: "Uscita" },
  { value: "fattura", label: "Fattura" },
  { value: "fornitore", label: "Fornitore" },
  { value: "dipendente", label: "Dipendente" },
  { value: "cliente", label: "Cliente" },
  { value: "preventivo", label: "Preventivo" },
];

function Segmenti({ value, onChange, opzioni }) {
  return (
    <div className="grid grid-cols-2 sm:flex gap-2">
      {opzioni.map(([v, label]) => (
        <button
          key={v}
          type="button"
          onClick={() => onChange(v)}
          className={`min-h-[48px] px-3 rounded-xl border text-sm font-semibold transition sm:flex-1 ${
            value === v
              ? v === "chiusa" ? "bg-brand-ink text-white border-brand-ink" : "bg-brand-blue text-white border-brand-blue"
              : "bg-white text-neutral-700 border-neutral-300"
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

function NuovoPasso({ pratica, onSalvato, sezioni, tipi, giorni }) {
  const chiusa = pratica.stato === "chiusa";
  const [altro, setAltro] = useState(false);          // «Cambia anche atto, sezione, importi…»
  const [fd2, setFd2] = useState(formDaPratica(pratica));
  const [attesa, setAttesa] = useState(!!pratica.in_attesa_mezzi);
  useEffect(() => { setFd2(formDaPratica(pratica)); setAttesa(!!pratica.in_attesa_mezzi); }, [pratica]);
  const set2 = (k) => (v) => setFd2((x) => ({ ...x, [k]: v }));
  const [testo, setTesto] = useState("");
  const [data, setData] = useState(oggiISO());
  const [stato, setStato] = useState("");            // "" = non cambia
  const [esito, setEsito] = useState("");
  const [termineModo, setTermineModo] = useState("resta"); // resta | nuovo | nessuno
  const [termine, setTermine] = useState("");
  const [file, setFile] = useState(null);
  const [fileKey, setFileKey] = useState(0);
  const [saving, setSaving] = useState(false);
  const [errore, setErrore] = useState("");

  const opzioniStato = chiusa
    ? [["", "Resta chiusa"], ["tocca_a_me", "Riapri: tocca a me"], ["tocca_a_loro", "Riapri: tocca a loro"]]
    : [["", "Nessun cambio"], ["tocca_a_me", "Tocca a me"], ["tocca_a_loro", "Tocca a loro"], ["chiusa", "Chiudi"]]
        .filter(([v]) => v !== pratica.stato);

  const salva = async () => {
    if (!testo.trim()) { setErrore("Scrivi una riga: cosa è successo."); return; }
    if (stato === "chiusa" && !esito.trim()) { setErrore("Per chiudere serve l'esito."); return; }
    if (termineModo === "nuovo" && !termine) { setErrore("Scegli la data del nuovo termine."); return; }
    if (file && file.size > ALLEGATO_MAX_MB * 1024 * 1024) { setErrore(`L'allegato supera ${ALLEGATO_MAX_MB} MB.`); return; }
    let cambi = {};
    try { cambi = altro ? campiCambiati(fd2, pratica) : {}; } catch (e) { setErrore(e.message); return; }
    setSaving(true);
    setErrore("");
    const fd = new FormData();
    const svuota = [];
    Object.entries(cambi).forEach(([k, v]) => { if (v == null) svuota.push(k); else fd.append(k, String(v)); });
    if (svuota.length) fd.append("svuota", svuota.join(","));
    if (attesa !== !!pratica.in_attesa_mezzi) fd.append("in_attesa_mezzi", attesa ? "true" : "false");
    fd.append("testo", testo.trim());
    fd.append("data", data);
    if (stato) fd.append("stato_a", stato);
    if (stato === "chiusa") fd.append("esito", esito.trim());
    if (termineModo === "nuovo") fd.append("termine_a", termine);
    if (termineModo === "nessuno") fd.append("togli_termine", "true");
    if (file) fd.append("allegato", file);
    try {
      const res = await apiFetch(`${API_BASE}/pratiche/${pratica.id}/passi`, { method: "POST", body: fd });
      if (!res.ok) { setErrore(await leggiErrore(res)); return; }
      const p = await res.json();
      setTesto(""); setData(oggiISO()); setStato(""); setEsito("");
      setTermineModo("resta"); setTermine(""); setFile(null); setFileKey((k) => k + 1);
      setAltro(false);
      onSalvato(p);
    } catch (e) {
      setErrore(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="bg-white border-2 border-brand-blue/30 rounded-2xl p-4 space-y-3">
      <h2 className="font-bold text-brand-ink">Nuovo passo</h2>
      <Textarea
        size="lg"
        rows={2}
        value={testo}
        onChange={setTesto}
        placeholder="PEC inviata, risposta arrivata, telefonata…"
      />
      <FieldLabel label="Quando">
        <TextInput size="lg" type="date" value={data} onChange={setData} max={oggiISO()} />
      </FieldLabel>
      <FieldLabel label="Cambia stato">
        <Segmenti value={stato} onChange={setStato} opzioni={opzioniStato} />
      </FieldLabel>
      {stato === "chiusa" && (
        <FieldLabel label="Esito" required>
          <TextInput size="lg" value={esito} onChange={setEsito} placeholder="Come è finita" />
        </FieldLabel>
      )}
      {stato !== "chiusa" && !(chiusa && !stato) && (
        <FieldLabel label="Termine" hint={pratica.termine ? `Oggi: ${fmtData(pratica.termine)}` : "Oggi: nessun termine"}>
          <Segmenti
            value={termineModo}
            onChange={setTermineModo}
            opzioni={[
              ["resta", "Resta com'è"],
              ["nuovo", "Nuovo termine"],
              ...(pratica.termine ? [["nessuno", "Nessun termine"]] : []),
            ]}
          />
          {termineModo === "nuovo" && (
            <TextInput size="lg" type="date" value={termine} onChange={setTermine} className="mt-2" />
          )}
        </FieldLabel>
      )}
      {!chiusa && stato !== "chiusa" && (
        <SpuntaAttesa value={attesa} onChange={setAttesa} giorni={giorni} />
      )}
      {!chiusa && (
        altro ? (
          <div className="space-y-3 border-t border-neutral-200 pt-3">
            <div className="text-xs text-neutral-500">
              Cambia solo quello che cambia: ogni modifica resta nel passo come «da → a».
            </div>
            <CampiDebito f={fd2} set={set2} sezioni={sezioni} tipi={tipi} />
          </div>
        ) : (
          <button type="button" onClick={() => setAltro(true)} className="min-h-[44px] text-sm text-brand-blue font-medium">
            + Cambia anche atto, sezione, importi…
          </button>
        )
      )}
      <FieldLabel label="Allegato" hint={`PDF o immagine, max ${ALLEGATO_MAX_MB} MB`}>
        <input
          key={fileKey}
          type="file"
          accept={ALLEGATO_ACCEPT}
          onChange={(e) => setFile(e.target.files?.[0] || null)}
          className="block w-full text-sm min-h-[44px]"
        />
      </FieldLabel>
      {errore && <div className="text-sm text-brand-red">{errore}</div>}
      <Btn size="lg" className="w-full" onClick={salva} loading={saving}>
        {stato === "chiusa" ? "Chiudi la pratica" : "Aggiungi passo"}
      </Btn>
    </section>
  );
}

function Passo({ passo, praticaId, onScarica }) {
  const stato = passo.stato_a ? (
    <span>
      {passo.stato_da ? `${STATI[passo.stato_da]?.label || passo.stato_da} → ` : ""}
      <strong>{STATI[passo.stato_a]?.label || passo.stato_a}</strong>
    </span>
  ) : null;
  const termine = passo.termine_a || passo.termine_da ? (
    <span>
      Termine: {passo.termine_da ? fmtData(passo.termine_da) : "nessuno"} → <strong>{passo.termine_a ? fmtData(passo.termine_a) : "nessuno"}</strong>
    </span>
  ) : null;
  return (
    <li className="relative pl-5 pb-4">
      <span className={`absolute -left-[7px] top-1.5 w-3 h-3 rounded-full ${passo.automatico ? "bg-neutral-300" : "bg-brand-blue"}`} />
      <div className="text-xs text-neutral-500">
        {fmtData(passo.data)}{passo.autore ? ` · ${passo.autore}` : ""}
      </div>
      <div className={passo.automatico ? "text-sm text-neutral-500 italic" : "text-[15px] text-brand-ink"}>
        {passo.testo}
      </div>
      {(stato || termine) && (
        <div className="text-xs text-neutral-600 mt-0.5 flex flex-wrap gap-x-3">
          {stato}{termine}
        </div>
      )}
      {!passo.automatico && passo.modifiche?.length > 0 && (
        <div className="text-xs text-neutral-600 mt-0.5 flex flex-wrap gap-x-3">
          {passo.modifiche.map((m, i) => (
            <span key={i}>{m.campo}: {m.da} → <strong>{m.a}</strong></span>
          ))}
        </div>
      )}
      {passo.ha_allegato && (
        <button
          type="button"
          onClick={() => onScarica(praticaId, passo)}
          className="mt-1 inline-flex items-center gap-1 min-h-[44px] text-sm text-brand-blue font-medium"
        >
          📎 {passo.allegato_nome || "Allegato"}
        </button>
      )}
    </li>
  );
}

function ModificaTestata({ open, onClose, pratica, onSalvata, sezioni, tipi }) {
  const [f, setF] = useState({});
  const [fd2, setFd2] = useState(formDaPratica(pratica));
  const set2 = (k) => (v) => setFd2((x) => ({ ...x, [k]: v }));
  const [saving, setSaving] = useState(false);
  const [errore, setErrore] = useState("");
  useEffect(() => {
    if (open) {
      setF({ titolo: pratica.titolo, controparte: pratica.controparte, controparte_contatto: pratica.controparte_contatto || "" });
      setFd2(formDaPratica(pratica));
      setErrore("");
    }
  }, [open, pratica]);
  const set = (k) => (v) => setF((x) => ({ ...x, [k]: v }));
  const salva = async () => {
    let cambi;
    try { cambi = campiCambiati(fd2, pratica); } catch (e) { setErrore(e.message); return; }
    setSaving(true);
    try {
      const res = await apiFetch(`${API_BASE}/pratiche/${pratica.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...f, ...cambi }),
      });
      if (!res.ok) { setErrore(await leggiErrore(res)); return; }
      onSalvata(await res.json());
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
      title="Correggi la testata"
      subtitle="Stato e termine si cambiano con un passo. Un campo vuoto si riempie e basta; se cambi un valore già scritto resta un passo nella storia."
      footer={
        <>
          <Btn variant="secondary" size="lg" onClick={onClose}>Annulla</Btn>
          <Btn size="lg" onClick={salva} loading={saving}>Salva</Btn>
        </>
      }
    >
      <div className="space-y-3">
        <FieldLabel label="Titolo" required>
          <TextInput size="lg" value={f.titolo || ""} onChange={set("titolo")} />
        </FieldLabel>
        <FieldLabel label="Controparte" required>
          <TextInput size="lg" value={f.controparte || ""} onChange={set("controparte")} />
        </FieldLabel>
        <FieldLabel label="Contatto" hint="Email, PEC o telefono">
          <TextInput size="lg" value={f.controparte_contatto || ""} onChange={set("controparte_contatto")} />
        </FieldLabel>
        <CampiDebito f={fd2} set={set2} sezioni={sezioni} tipi={tipi} />
        {errore && <div className="text-sm text-brand-red">{errore}</div>}
      </div>
    </Modal>
  );
}

// Rate della rateizzazione collegata (collegamento controllo_gestione/spesa_fissa):
// legge il piano rate dello scadenziario, sola lettura.
function RateCollegate({ collegamento, navigate }) {
  const [piano, setPiano] = useState(null);
  const [errore, setErrore] = useState("");
  useEffect(() => {
    let vivo = true;
    (async () => {
      try {
        const res = await apiFetch(`${API_BASE}/controllo-gestione/spese-fisse/${collegamento.ref_id}/piano-rate`);
        const j = res.ok ? await res.json() : null;
        if (!vivo) return;
        if (!j || !j.ok) setErrore(j?.error || (res.ok ? "Piano non leggibile" : await leggiErrore(res)));
        else setPiano(j);
      } catch (e) { if (vivo) setErrore(e.message); }
    })();
    return () => { vivo = false; };
  }, [collegamento.ref_id]);

  const titolo = (
    <div className="flex items-center justify-between gap-2 mb-2">
      <h3 className="font-semibold text-brand-ink">💶 {collegamento.etichetta}</h3>
      {collegamento.link && (
        <Btn variant="ghost" size="md" onClick={() => navigate(collegamento.link)}>Apri</Btn>
      )}
    </div>
  );
  if (errore) return <div className="bg-white border border-neutral-200 rounded-2xl p-4">{titolo}<div className="text-sm text-brand-red">{errore}</div></div>;
  if (!piano) return <div className="bg-white border border-neutral-200 rounded-2xl p-4">{titolo}<div className="text-sm text-neutral-500">Carico le rate…</div></div>;

  const g = classificaRate(piano.rate);
  const riga = (r) => (
    <li key={r.id} className="text-sm flex justify-between gap-2 py-1">
      <span>
        Rata {r.numero_rata} · {fmtData(r.uscita_scadenza || "")}
        {r.uscita_scadenza_originale ? <span className="text-neutral-500"> (era {fmtData(r.uscita_scadenza_originale)})</span> : null}
        {r.batch_titolo ? <span className="text-neutral-500"> · in distinta «{r.batch_titolo}»</span> : null}
      </span>
      <strong>{fmtEuro(r.importo)}</strong>
    </li>
  );
  return (
    <div className="bg-white border border-neutral-200 rounded-2xl p-4">
      {titolo}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-sm mb-2">
        <div className="rounded-xl bg-emerald-50 border border-emerald-200 px-3 py-2">
          <div className="text-xs text-emerald-800">Pagate</div>
          <div className="font-bold">{g.pagate.voci.length} · {fmtEuro(g.pagate.importo)}</div>
        </div>
        <div className={`rounded-xl px-3 py-2 border ${g.in_distinta.voci.length ? "bg-amber-50 border-amber-300" : "bg-neutral-50 border-neutral-200"}`}>
          <div className="text-xs text-amber-800">In distinta, non in banca</div>
          <div className="font-bold">{g.in_distinta.voci.length} · {fmtEuro(g.in_distinta.importo)}</div>
        </div>
        <div className={`rounded-xl px-3 py-2 border ${g.scadute.voci.length ? "bg-red-50 border-red-300" : "bg-neutral-50 border-neutral-200"}`}>
          <div className="text-xs text-red-800">Scadute</div>
          <div className="font-bold">{g.scadute.voci.length} · {fmtEuro(g.scadute.importo)}</div>
        </div>
        <div className="rounded-xl bg-neutral-50 border border-neutral-200 px-3 py-2">
          <div className="text-xs text-neutral-600">Da pagare</div>
          <div className="font-bold">{g.da_pagare.voci.length} · {fmtEuro(g.da_pagare.importo)}</div>
        </div>
      </div>
      {(g.in_distinta.voci.length > 0 || g.scadute.voci.length > 0) && (
        <ul className="divide-y divide-neutral-100">
          {[...g.in_distinta.voci, ...g.scadute.voci].map(riga)}
        </ul>
      )}
    </div>
  );
}

function NuovoCollegamento({ open, onClose, praticaId, onSalvato }) {
  const vuoto = { modulo: "controllo_gestione", tipo: "uscita", ref_id: "", etichetta: "", link: "" };
  const [f, setF] = useState(vuoto);
  const [saving, setSaving] = useState(false);
  const [errore, setErrore] = useState("");
  useEffect(() => { if (open) { setF(vuoto); setErrore(""); } }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  const set = (k) => (v) => setF((x) => ({ ...x, [k]: v }));
  const salva = async () => {
    if (!f.ref_id.trim() || !f.etichetta.trim()) { setErrore("Servono id ed etichetta."); return; }
    setSaving(true);
    try {
      const res = await apiFetch(`${API_BASE}/pratiche/${praticaId}/collegamenti`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...f, link: f.link.trim() || null }),
      });
      if (!res.ok) { setErrore(await leggiErrore(res)); return; }
      onSalvato(await res.json());
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
      title="Collega"
      subtitle="Un'uscita, una fattura, un dipendente… L'etichetta resta quella che scrivi ora."
      footer={
        <>
          <Btn variant="secondary" size="lg" onClick={onClose}>Annulla</Btn>
          <Btn size="lg" onClick={salva} loading={saving}>Collega</Btn>
        </>
      }
    >
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <FieldLabel label="Modulo">
            <Select size="lg" value={f.modulo} onChange={set("modulo")} options={MODULI_COLLEGABILI} />
          </FieldLabel>
          <FieldLabel label="Tipo">
            <Select size="lg" value={f.tipo} onChange={set("tipo")} options={TIPI_COLLEGAMENTO} />
          </FieldLabel>
        </div>
        <FieldLabel label="Id" required>
          <TextInput size="lg" value={f.ref_id} onChange={set("ref_id")} placeholder="2654" />
        </FieldLabel>
        <FieldLabel label="Etichetta" required>
          <TextInput size="lg" value={f.etichetta} onChange={set("etichetta")} placeholder="Fattura Heres 0000916A — € 695,40" />
        </FieldLabel>
        <FieldLabel label="Link" hint="Percorso nel gestionale, es. /controllo-gestione/uscite?id=2654">
          <TextInput size="lg" value={f.link} onChange={set("link")} placeholder="/…" />
        </FieldLabel>
        {errore && <div className="text-sm text-brand-red">{errore}</div>}
      </div>
    </Modal>
  );
}

export default function PraticaScheda() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [p, setP] = useState(null);
  const [loading, setLoading] = useState(true);
  const [errore, setErrore] = useState("");
  const [modifica, setModifica] = useState(false);
  const [collega, setCollega] = useState(false);
  const [rivedendo, setRivedendo] = useState(false);
  const { sezioni, tipi, giorni } = useAnagrafichePratiche();

  const carica = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch(`${API_BASE}/pratiche/${id}`);
      if (!res.ok) { setErrore(await leggiErrore(res)); return; }
      setP(await res.json());
      setErrore("");
    } catch (e) {
      setErrore(e.message);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { carica(); }, [carica]);

  const scarica = async (praticaId, passo) => {
    try {
      const res = await apiFetch(`${API_BASE}/pratiche/${praticaId}/passi/${passo.id}/allegato`);
      if (!res.ok) { toast(await leggiErrore(res), { kind: "error" }); return; }
      const url = URL.createObjectURL(await res.blob());
      const a = document.createElement("a");
      a.href = url;
      a.download = passo.allegato_nome || "allegato";
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (e) {
      toast(e.message, { kind: "error" });
    }
  };

  const scollega = async (c) => {
    if (!window.confirm(`Scollegare «${c.etichetta}»? Resta un passo nella storia.`)) return;
    try {
      const res = await apiFetch(`${API_BASE}/pratiche/${p.id}/collegamenti/${c.id}`, { method: "DELETE" });
      if (!res.ok) { toast(await leggiErrore(res), { kind: "error" }); return; }
      setP(await res.json());
    } catch (e) {
      toast(e.message, { kind: "error" });
    }
  };

  const rivista = async () => {
    setRivedendo(true);
    try {
      const res = await apiFetch(`${API_BASE}/pratiche/${p.id}/rivedi`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (!res.ok) { toast(await leggiErrore(res), { kind: "error" }); return; }
      setP(await res.json());
      toast(`Rivista: la rivedi tra ${giorni} giorni`, { kind: "success" });
    } catch (e) {
      toast(e.message, { kind: "error" });
    } finally {
      setRivedendo(false);
    }
  };

  const indietro = (
    <Btn variant="ghost" size="lg" onClick={() => navigate("/pratiche")}>← Pratiche</Btn>
  );

  if (loading && !p) return <PageLayout><TrgbLoader /></PageLayout>;
  if (!p) {
    return (
      <PageLayout actions={indietro}>
        <EmptyState icon="📂" title="Pratica non trovata" description={errore} />
      </PageLayout>
    );
  }

  const href = hrefContatto(p.controparte_contatto);
  const stato = STATI[p.stato];

  return (
    <PageLayout title={p.titolo} subtitle={p.controparte} actions={indietro}>
      <div className="max-w-3xl space-y-4">
        {/* Testata */}
        <section className={`bg-white border rounded-2xl p-4 ${p.scaduta ? "border-red-300" : "border-neutral-200"}`}>
          <div className="flex flex-wrap items-center gap-2 mb-2">
            {p.sezione && <StatusBadge tone="neutral" size="lg">{p.sezione}</StatusBadge>}
            <StatusBadge tone={stato.tone} size="lg">{stato.label}</StatusBadge>
            {p.scaduta && <StatusBadge tone="danger" size="lg" dot>Scaduta</StatusBadge>}
            {p.ferma && <StatusBadge tone="violet" size="lg">Ferma da più di 30 giorni</StatusBadge>}
            {p.in_attesa && <StatusBadge tone="violet" size="lg" dot={p.da_rivedere}>In attesa di mezzi</StatusBadge>}
          </div>
          {p.in_attesa && (
            <div className={`flex flex-wrap items-center gap-2 mb-2 text-sm ${p.da_rivedere ? "text-violet-700 font-semibold" : "text-neutral-700"}`}>
              ⏸ {descriviRevisione(p)}
              <Btn variant="secondary" size="md" onClick={rivista} loading={rivedendo}>Rivista, ancora senza mezzi</Btn>
            </div>
          )}
          {(p.tipo_atto || p.rif_atto || p.periodo || p.importo_dovuto != null || p.importo_residuo != null) && (
            <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm mb-2">
              {p.tipo_atto && (<><dt className="text-neutral-500">Atto</dt><dd className="text-brand-ink">{p.gradino != null ? `${p.gradino}. ` : ""}{p.tipo_atto}</dd></>)}
              {p.rif_atto && (<><dt className="text-neutral-500">Riferimento</dt><dd className="text-brand-ink break-all">{p.rif_atto}</dd></>)}
              {p.periodo && (<><dt className="text-neutral-500">Periodo</dt><dd className="text-brand-ink">{p.periodo}</dd></>)}
              {p.importo_dovuto != null && (<><dt className="text-neutral-500">Dovuto</dt><dd className="text-brand-ink">{fmtEuro(p.importo_dovuto)}</dd></>)}
              {p.importo_residuo != null && (<><dt className="text-neutral-500">Residuo</dt><dd className="text-brand-ink font-semibold">{fmtEuro(p.importo_residuo)}</dd></>)}
            </dl>
          )}
          {p.stato === "chiusa" ? (
            <div className="text-sm text-neutral-700">
              Chiusa il {fmtData(p.chiusa_il)} — <strong>{p.esito}</strong>
            </div>
          ) : (
            <div className={`text-sm ${p.scaduta || p.termine_passato ? "text-brand-red font-semibold" : "text-neutral-700"}`}>
              {p.stato === "tocca_a_me" ? "Entro: " : "Aspetto fino a: "}{descriviTermine(p)}
            </div>
          )}
          <div className="text-sm text-neutral-600 mt-1">
            Aperta il {fmtData(p.aperta_il)}
          </div>
          {p.controparte_contatto && (
            href ? (
              <a href={href} className="mt-2 inline-flex items-center min-h-[44px] text-brand-blue font-medium break-all">
                {href.startsWith("tel:") ? "📞" : "✉️"} {p.controparte_contatto}
              </a>
            ) : (
              <div className="mt-2 text-sm text-neutral-700 break-all">{p.controparte_contatto}</div>
            )
          )}
          <div className="mt-2">
            <Btn variant="secondary" size="md" onClick={() => setModifica(true)}>Correggi la testata</Btn>
          </div>
        </section>

        <NuovoPasso
          pratica={p}
          sezioni={sezioni}
          tipi={tipi}
          giorni={giorni}
          onSalvato={(nuova) => { setP(nuova); toast("Passo aggiunto", { kind: "success" }); }}
        />

        {p.collegamenti
          .filter((c) => c.modulo === "controllo_gestione" && c.tipo === "spesa_fissa")
          .map((c) => <RateCollegate key={c.id} collegamento={c} navigate={navigate} />)}

        {/* Collegamenti */}
        <section>
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-xs font-bold uppercase tracking-wider text-neutral-600">Collegamenti</h2>
            <Btn variant="ghost" size="md" onClick={() => setCollega(true)}>+ Collega</Btn>
          </div>
          {p.collegamenti.length === 0 ? (
            <div className="text-sm text-neutral-500">Nessun collegamento.</div>
          ) : (
            <div className="flex flex-wrap gap-2">
              {p.collegamenti.map((c) => (
                <span key={c.id} className="inline-flex items-center bg-white border border-neutral-300 rounded-full overflow-hidden">
                  <button
                    type="button"
                    disabled={!c.link}
                    onClick={() => c.link && navigate(c.link)}
                    className={`min-h-[44px] pl-4 pr-2 text-sm ${c.link ? "text-brand-blue font-medium" : "text-neutral-700"}`}
                  >
                    🔗 {c.etichetta}
                  </button>
                  <button
                    type="button"
                    onClick={() => scollega(c)}
                    aria-label={`Scollega ${c.etichetta}`}
                    className="min-h-[44px] min-w-[44px] text-neutral-400 hover:text-brand-red"
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          )}
        </section>

        {/* Storia */}
        <section>
          <h2 className="text-xs font-bold uppercase tracking-wider text-neutral-600 mb-3">Storia</h2>
          <ol className="border-l-2 border-neutral-200 ml-1.5">
            {p.passi.map((passo) => (
              <Passo key={passo.id} passo={passo} praticaId={p.id} onScarica={scarica} />
            ))}
          </ol>
        </section>
      </div>

      <ModificaTestata
        open={modifica}
        onClose={() => setModifica(false)}
        pratica={p}
        sezioni={sezioni}
        tipi={tipi}
        onSalvata={(nuova) => { setP(nuova); setModifica(false); toast("Salvato", { kind: "success" }); }}
      />
      <NuovoCollegamento
        open={collega}
        onClose={() => setCollega(false)}
        praticaId={p.id}
        onSalvato={(nuova) => { setP(nuova); setCollega(false); }}
      />
    </PageLayout>
  );
}
