// @version: v1.0 — campi del debito, sezioni, tipi d'atto (2026-11-02)
// Modulo: pratiche
// Pezzi condivisi da PraticheElenco e PraticaScheda: i campi del debito, la
// spunta «in attesa di mezzi», il caricamento di sezioni/tipi d'atto/config e
// il modale «Sezioni e atti» dove Marco decide le sezioni (niente valori fissi
// nel codice). Doc: docs/modulo_pratiche.md §4.
import React, { useCallback, useEffect, useState } from "react";
import { API_BASE, apiFetch } from "../../config/api";
import { Btn, Modal, FieldLabel, TextInput, Select } from "../../components/ui";
import { leggiErrore } from "./praticheUtils";

// Sezioni e tipi d'atto attivi + giorni di revisione. `ricarica` dopo una modifica.
export function useAnagrafichePratiche() {
  const [sezioni, setSezioni] = useState([]);
  const [tipi, setTipi] = useState([]);
  const [giorni, setGiorni] = useState(30);
  const ricarica = useCallback(async () => {
    try {
      const [rs, rt, rc] = await Promise.all([
        apiFetch(`${API_BASE}/pratiche/sezioni`),
        apiFetch(`${API_BASE}/pratiche/tipi-atto`),
        apiFetch(`${API_BASE}/pratiche/config`),
      ]);
      if (rs.ok) setSezioni(await rs.json());
      if (rt.ok) setTipi(await rt.json());
      if (rc.ok) setGiorni((await rc.json()).giorni_revisione || 30);
    } catch { /* la pagina funziona anche senza */ }
  }, []);
  useEffect(() => { ricarica(); }, [ricarica]);
  return { sezioni, tipi, giorni, ricarica };
}

// Campi del debito (v1.1), condivisi con la scheda.
export function CampiDebito({ f, set, sezioni, tipi }) {
  const optSez = [{ value: "", label: "— nessuna —" }, ...sezioni.map((s) => ({ value: String(s.id), label: s.nome }))];
  const optTipi = [{ value: "", label: "— nessuno —" }, ...tipi.map((t) => ({
    value: String(t.id), label: t.gradino != null ? `${t.gradino}. ${t.nome}` : t.nome,
  }))];
  return (
    <>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <FieldLabel label="Sezione">
          <Select size="lg" value={f.sezione_id} onChange={set("sezione_id")} options={optSez} />
        </FieldLabel>
        <FieldLabel label="Tipo d'atto">
          <Select size="lg" value={f.tipo_atto_id} onChange={set("tipo_atto_id")} options={optTipi} />
        </FieldLabel>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <FieldLabel label="Riferimento dell'atto" hint="ID comunicazione, n. cartella o avviso">
          <TextInput size="lg" value={f.rif_atto} onChange={set("rif_atto")} placeholder="CO275462467" />
        </FieldLabel>
        <FieldLabel label="Periodo d'imposta">
          <TextInput size="lg" value={f.periodo} onChange={set("periodo")} placeholder="2026 II trim." />
        </FieldLabel>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <FieldLabel label="Dovuto €">
          <TextInput size="lg" inputMode="decimal" value={f.importo_dovuto} onChange={set("importo_dovuto")} placeholder="5.008,07" />
        </FieldLabel>
        <FieldLabel label="Residuo €" hint="Vuoto = dovuto">
          <TextInput size="lg" inputMode="decimal" value={f.importo_residuo} onChange={set("importo_residuo")} />
        </FieldLabel>
      </div>
    </>
  );
}

export function SpuntaAttesa({ value, onChange, giorni }) {
  return (
    <label className="flex items-start gap-3 min-h-[48px] bg-violet-50 border border-violet-200 rounded-xl px-3 py-2 cursor-pointer">
      <input type="checkbox" checked={!!value} onChange={(e) => onChange(e.target.checked)} className="mt-1 w-5 h-5" />
      <span className="text-sm text-neutral-800">
        <strong>In attesa di mezzi</strong> — nota, ma oggi non si può pagare. Non finisce tra le
        scadute; torna «da rivedere» ogni {giorni || 30} giorni.
      </span>
    </label>
  );
}

async function invia(url, method, body) {
  const res = await apiFetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await leggiErrore(res));
  return res.json();
}

// Modale «Sezioni e atti»: rinomina, riordina, disattiva (non si cancella
// niente: una sezione disattivata sparisce dalle scelte, le sue pratiche la
// tengono), aggiunge; stesso per i tipi d'atto; giorni fra due revisioni.
export function GestioneSezioni({ open, onClose, onCambiato }) {
  const [sezioni, setSezioni] = useState([]);
  const [tipi, setTipi] = useState([]);
  const [giorni, setGiorni] = useState("30");
  const [nuovaSez, setNuovaSez] = useState("");
  const [nuovoTipo, setNuovoTipo] = useState({ nome: "", gradino: "", sezione_id: "" });
  const [errore, setErrore] = useState("");
  const [saving, setSaving] = useState(false);

  const carica = useCallback(async () => {
    try {
      const [rs, rt, rc] = await Promise.all([
        apiFetch(`${API_BASE}/pratiche/sezioni?tutte=true`),
        apiFetch(`${API_BASE}/pratiche/tipi-atto?tutti=true`),
        apiFetch(`${API_BASE}/pratiche/config`),
      ]);
      if (rs.ok) setSezioni(await rs.json());
      if (rt.ok) setTipi(await rt.json());
      if (rc.ok) setGiorni(String((await rc.json()).giorni_revisione));
    } catch (e) { setErrore(e.message); }
  }, []);
  useEffect(() => { if (open) { setErrore(""); carica(); } }, [open, carica]);

  const esegui = async (fn) => {
    setSaving(true);
    setErrore("");
    try { await fn(); await carica(); onCambiato?.(); } catch (e) { setErrore(e.message); }
    finally { setSaving(false); }
  };
  const optSez = [{ value: "", label: "— qualsiasi —" }, ...sezioni.filter((s) => s.attiva).map((s) => ({ value: String(s.id), label: s.nome }))];
  const editSez = (id, k, v) => setSezioni((xs) => xs.map((x) => (x.id === id ? { ...x, [k]: v } : x)));
  const editTipo = (id, k, v) => setTipi((xs) => xs.map((x) => (x.id === id ? { ...x, [k]: v } : x)));

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Sezioni e atti"
      subtitle="Le sezioni le decidi tu. Non si cancella niente: si disattiva."
      footer={<Btn variant="secondary" size="lg" onClick={onClose}>Chiudi</Btn>}
    >
      <div className="space-y-5">
        <section>
          <h3 className="text-xs font-bold uppercase tracking-wider text-neutral-600 mb-2">Sezioni</h3>
          <div className="space-y-2">
            {sezioni.map((s) => (
              <div key={s.id} className={`flex gap-2 items-center ${s.attiva ? "" : "opacity-50"}`}>
                <TextInput size="md" value={s.nome} onChange={(v) => editSez(s.id, "nome", v)} className="flex-1" />
                <TextInput size="md" type="number" value={String(s.ordine)} onChange={(v) => editSez(s.id, "ordine", v)} className="w-20" aria-label="Ordine" />
                <Btn size="md" variant="secondary" disabled={saving}
                  onClick={() => esegui(() => invia(`${API_BASE}/pratiche/sezioni/${s.id}`, "PATCH", { nome: s.nome, ordine: Number(s.ordine) || 0 }))}>
                  Salva
                </Btn>
                <Btn size="md" variant="ghost" disabled={saving}
                  onClick={() => esegui(() => invia(`${API_BASE}/pratiche/sezioni/${s.id}`, "PATCH", { attiva: !s.attiva }))}>
                  {s.attiva ? "Disattiva" : "Riattiva"}
                </Btn>
              </div>
            ))}
            <div className="flex gap-2">
              <TextInput size="md" value={nuovaSez} onChange={setNuovaSez} placeholder="Nuova sezione" className="flex-1" />
              <Btn size="md" disabled={saving || !nuovaSez.trim()}
                onClick={() => esegui(async () => { await invia(`${API_BASE}/pratiche/sezioni`, "POST", { nome: nuovaSez.trim() }); setNuovaSez(""); })}>
                + Aggiungi
              </Btn>
            </div>
          </div>
        </section>

        <section>
          <h3 className="text-xs font-bold uppercase tracking-wider text-neutral-600 mb-1">Tipi d'atto</h3>
          <p className="text-xs text-neutral-500 mb-2">Il gradino è il posto nella scala (1 = comunicazione … 5 = pignoramento).</p>
          <div className="space-y-2">
            {tipi.map((t) => (
              <div key={t.id} className={`flex flex-wrap gap-2 items-center ${t.attivo ? "" : "opacity-50"}`}>
                <TextInput size="md" type="number" value={t.gradino == null ? "" : String(t.gradino)} onChange={(v) => editTipo(t.id, "gradino", v)} className="w-16" aria-label="Gradino" />
                <TextInput size="md" value={t.nome} onChange={(v) => editTipo(t.id, "nome", v)} className="flex-1 min-w-[160px]" />
                <Select size="md" value={t.sezione_id == null ? "" : String(t.sezione_id)} onChange={(v) => editTipo(t.id, "sezione_id", v)} options={optSez} />
                <Btn size="md" variant="secondary" disabled={saving}
                  onClick={() => esegui(() => invia(`${API_BASE}/pratiche/tipi-atto/${t.id}`, "PATCH", {
                    nome: t.nome,
                    gradino: t.gradino === "" || t.gradino == null ? null : Number(t.gradino),
                    sezione_id: t.sezione_id === "" || t.sezione_id == null ? null : Number(t.sezione_id),
                  }))}>
                  Salva
                </Btn>
                <Btn size="md" variant="ghost" disabled={saving}
                  onClick={() => esegui(() => invia(`${API_BASE}/pratiche/tipi-atto/${t.id}`, "PATCH", { attivo: !t.attivo }))}>
                  {t.attivo ? "Disattiva" : "Riattiva"}
                </Btn>
              </div>
            ))}
            <div className="flex flex-wrap gap-2">
              <TextInput size="md" type="number" value={nuovoTipo.gradino} onChange={(v) => setNuovoTipo((x) => ({ ...x, gradino: v }))} className="w-16" placeholder="n." />
              <TextInput size="md" value={nuovoTipo.nome} onChange={(v) => setNuovoTipo((x) => ({ ...x, nome: v }))} placeholder="Nuovo tipo d'atto" className="flex-1 min-w-[160px]" />
              <Select size="md" value={nuovoTipo.sezione_id} onChange={(v) => setNuovoTipo((x) => ({ ...x, sezione_id: v }))} options={optSez} />
              <Btn size="md" disabled={saving || !nuovoTipo.nome.trim()}
                onClick={() => esegui(async () => {
                  await invia(`${API_BASE}/pratiche/tipi-atto`, "POST", {
                    nome: nuovoTipo.nome.trim(),
                    gradino: nuovoTipo.gradino === "" ? null : Number(nuovoTipo.gradino),
                    sezione_id: nuovoTipo.sezione_id === "" ? null : Number(nuovoTipo.sezione_id),
                  });
                  setNuovoTipo({ nome: "", gradino: "", sezione_id: "" });
                })}>
                + Aggiungi
              </Btn>
            </div>
          </div>
        </section>

        <section>
          <h3 className="text-xs font-bold uppercase tracking-wider text-neutral-600 mb-2">In attesa di mezzi</h3>
          <div className="flex gap-2 items-end">
            <FieldLabel label="Da rivedere ogni (giorni)">
              <TextInput size="md" type="number" value={giorni} onChange={setGiorni} className="w-24" />
            </FieldLabel>
            <Btn size="md" variant="secondary" disabled={saving}
              onClick={() => esegui(() => invia(`${API_BASE}/pratiche/config`, "PUT", { giorni_revisione: Number(giorni) }))}>
              Salva
            </Btn>
          </div>
        </section>

        {errore && <div className="text-sm text-brand-red">{errore}</div>}
      </div>
    </Modal>
  );
}
