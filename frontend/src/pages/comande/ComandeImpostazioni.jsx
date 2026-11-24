// @version: v1.1 — coperto in conto da solo, tasti rapidi a 0 € (2026-11-24)
// Modulo: comande
import React, { useEffect, useState } from "react";
import { Btn, PageLayout, TextInput } from "../../components/ui";
import TrgbLoader from "../../components/TrgbLoader";
import ComandeNav from "./ComandeNav";
import { api } from "./comandeApi";

const FAMIGLIE = [
  { key: "food", label: "Cucina (piatti)" },
  { key: "beverage", label: "Da bere" },
  { key: "servizio", label: "Servizio (caffè, acqua, coperto)" },
];
const sel = "border border-neutral-300 rounded-lg px-3 py-2 text-sm bg-white";
// Quantità proposta da un tasto rapido: 0 = una, N = una ogni N coperti (per difetto, almeno una).
const QUANTITA_TASTO = [
  { v: 0, label: "una" },
  { v: 1, label: "una a coperto" },
  { v: 2, label: "una ogni 2 coperti" },
  { v: 3, label: "una ogni 3 coperti" },
  { v: 4, label: "una ogni 4 coperti" },
];

export default function ComandeImpostazioni() {
  const [imp, setImp] = useState(null);
  const [gruppi, setGruppi] = useState([]);
  const [config, setConfig] = useState({});
  const [reparti, setReparti] = useState([]);
  const [mappa, setMappa] = useState({});
  const [tasti, setTasti] = useState([]);
  const [msg, setMsg] = useState(null);
  const [salvo, setSalvo] = useState(false);

  const riempi = (d) => {
    setImp(d);
    setConfig({ ...d.config });
    setReparti(d.reparti.map((r) => ({ ...r })));
    setMappa({ ...d.gruppi_reparto });
    setTasti((d.tasti_rapidi || []).map((t) => ({ ...t })));
  };

  useEffect(() => {
    api("/comande/impostazioni/").then(riempi).catch((e) => setMsg(e.message));
    api("/comande/catalogo/").then((c) => setGruppi(c.gruppi || [])).catch(() => {});
  }, []);

  const salva = async () => {
    setSalvo(true);
    try {
      const gruppiReparto = {};
      gruppi.forEach((g) => {
        if (g.nome in mappa) gruppiReparto[g.nome] = mappa[g.nome];
        else if (imp.gruppi_reparto && g.nome in imp.gruppi_reparto) gruppiReparto[g.nome] = "__default__";
      });
      const chiavi = ["uscite_numero", "uscita_food", "uscita_beverage", "uscita_servizio",
        "reparto_food", "reparto_beverage", "reparto_servizio",
        "coperto_attivo", "coperto_nome", "coperto_prezzo"];
      const cfg = {};
      chiavi.forEach((k) => { cfg[k] = config[k] ?? ""; });
      // i tasti nuovi lasciati senza nome non si salvano; l'ordine è quello della lista
      const tastiRapidi = tasti
        .map((t, i) => ({ ...t, ordine: i + 1 }))
        .filter((t) => t.id || String(t.nome || "").trim());
      riempi(await api("/comande/impostazioni/", {
        method: "PUT",
        body: { config: cfg, reparti, gruppi_reparto: gruppiReparto, tasti_rapidi: tastiRapidi },
      }));
      setMsg("Salvato");
    } catch (e) {
      setMsg(e.message);
    } finally {
      setSalvo(false);
    }
  };

  if (!imp) {
    return (
      <PageLayout nav={<ComandeNav current="impostazioni" />} title="Impostazioni Comanda">
        {msg ? <div className="text-sm text-red-700">{msg}</div> : <TrgbLoader />}
      </PageLayout>
    );
  }

  const repartoSelect = (value, onChange, conDefault) => (
    <select className={sel} value={value} onChange={(e) => onChange(e.target.value)}>
      {conDefault && <option value="__default__">come la sua famiglia</option>}
      <option value="">nessun reparto</option>
      {reparti.filter((r) => r.attivo).map((r) => (
        <option key={r.key} value={r.key}>{r.nome}</option>
      ))}
    </select>
  );
  const cambiaTasto = (i, campi) => setTasti(tasti.map((t, j) => (j === i ? { ...t, ...campi } : t)));
  const nUscite = Number(config.uscite_numero) || 4;
  const usciteOpzioni = [0, ...Array.from({ length: nUscite }, (_, i) => i + 1)];

  return (
    <PageLayout
      nav={<ComandeNav current="impostazioni" />}
      title="Impostazioni Comanda"
      actions={<Btn loading={salvo} onClick={salva}>Salva</Btn>}
    >
      {msg && <div className="mb-3 rounded-xl border border-neutral-200 bg-white px-4 py-2 text-sm">{msg}</div>}

      <section className="mb-5 rounded-3xl border border-neutral-200 bg-white p-4 shadow-sm">
        <h2 className="mb-3 font-semibold text-brand-ink">Uscite</h2>
        <label className="mb-3 flex items-center gap-3 text-sm">
          Quante uscite propone la sala
          <select className={sel} value={config.uscite_numero || "4"}
            onChange={(e) => setConfig({ ...config, uscite_numero: e.target.value })}>
            {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </label>
        {FAMIGLIE.map((f) => (
          <label key={f.key} className="mb-2 flex items-center gap-3 text-sm">
            <span className="w-64">{f.label}: parte nella</span>
            <select className={sel} value={config[`uscita_${f.key}`] ?? "0"}
              onChange={(e) => setConfig({ ...config, [`uscita_${f.key}`]: e.target.value })}>
              {usciteOpzioni.map((u) => <option key={u} value={u}>{u === 0 ? "Subito" : `${u}ª uscita`}</option>)}
            </select>
          </label>
        ))}
      </section>

      <section className="mb-5 rounded-3xl border border-neutral-200 bg-white p-4 shadow-sm">
        <h2 className="mb-1 font-semibold text-brand-ink">Coperto</h2>
        <p className="mb-3 text-xs text-neutral-500">
          Entra in conto da solo quando si apre il tavolo, una volta per coperto, e segue i coperti se cambiano.
          Non va a nessun reparto. Dal conto si può mettere in omaggio.
        </p>
        <label className="mb-3 flex min-h-[44px] items-center gap-2 text-sm">
          <input type="checkbox" className="h-5 w-5" checked={config.coperto_attivo === "1"}
            onChange={(e) => setConfig({ ...config, coperto_attivo: e.target.checked ? "1" : "0" })} />
          Metti il coperto in conto all'apertura
        </label>
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <span>Come si chiama sul conto</span>
          <div className="w-72">
            <TextInput value={config.coperto_nome ?? ""} onChange={(v) => setConfig({ ...config, coperto_nome: v })} placeholder="Coperto" />
          </div>
          <span>Prezzo a coperto (€)</span>
          <div className="w-24">
            <TextInput value={config.coperto_prezzo ?? ""} onChange={(v) => setConfig({ ...config, coperto_prezzo: v })} placeholder="0" inputMode="decimal" />
          </div>
        </div>
      </section>

      <section className="mb-5 rounded-3xl border border-neutral-200 bg-white p-4 shadow-sm">
        <h2 className="mb-1 font-semibold text-brand-ink">Tasti rapidi</h2>
        <p className="mb-3 text-xs text-neutral-500">
          Tasti in cima al conto, a 0 €: dicono a un reparto di far partire qualcosa (lo stuzzico, il pane).
          Un tasto non si cancella: si spegne.
        </p>
        {tasti.length === 0 && <p className="mb-2 text-sm text-neutral-500">Nessun tasto rapido.</p>}
        {tasti.map((t, i) => (
          <div key={t.id || `nuovo-${i}`} className="mb-2 flex flex-wrap items-center gap-2">
            <div className="w-56">
              <TextInput value={t.nome ?? ""} onChange={(v) => cambiaTasto(i, { nome: v })} placeholder="Nome (es. Pane)" />
            </div>
            <span className="text-sm">va a</span>
            {repartoSelect(t.reparto_key ?? "", (v) => cambiaTasto(i, { reparto_key: v || null }), false)}
            <select className={sel} value={t.ogni_coperti ?? 0}
              onChange={(e) => cambiaTasto(i, { ogni_coperti: Number(e.target.value) })}>
              {QUANTITA_TASTO.map((q) => <option key={q.v} value={q.v}>{q.label}</option>)}
              {!QUANTITA_TASTO.some((q) => q.v === (t.ogni_coperti ?? 0)) && (
                <option value={t.ogni_coperti}>una ogni {t.ogni_coperti} coperti</option>
              )}
            </select>
            <label className="flex items-center gap-1 text-sm">
              <input type="checkbox" checked={t.attivo === undefined ? true : !!t.attivo}
                onChange={(e) => cambiaTasto(i, { attivo: e.target.checked ? 1 : 0 })} />
              attivo
            </label>
          </div>
        ))}
        <Btn variant="secondary" size="md"
          onClick={() => setTasti([...tasti, { nome: "", reparto_key: config.reparto_food || null, ogni_coperti: 0, attivo: 1 }])}>
          ＋ Aggiungi tasto
        </Btn>
      </section>

      <section className="mb-5 rounded-3xl border border-neutral-200 bg-white p-4 shadow-sm">
        <h2 className="mb-1 font-semibold text-brand-ink">Reparti</h2>
        <p className="mb-3 text-xs text-neutral-500">Uno per stampante comande. La chiave non si cambia.</p>
        {reparti.map((r, i) => (
          <div key={r.key} className="mb-2 flex items-center gap-2">
            <span className="w-20 font-mono text-xs text-neutral-500">{r.key}</span>
            <div className="w-48">
              <TextInput value={r.nome} onChange={(v) => setReparti(reparti.map((x, j) => (j === i ? { ...x, nome: v } : x)))} />
            </div>
            <label className="flex items-center gap-1 text-sm">
              <input type="checkbox" checked={!!r.attivo}
                onChange={(e) => setReparti(reparti.map((x, j) => (j === i ? { ...x, attivo: e.target.checked ? 1 : 0 } : x)))} />
              attivo
            </label>
          </div>
        ))}
        <div className="mt-4 space-y-2">
          {FAMIGLIE.map((f) => (
            <label key={f.key} className="flex items-center gap-3 text-sm">
              <span className="w-64">{f.label} va a</span>
              {repartoSelect(config[`reparto_${f.key}`] ?? "", (v) => setConfig({ ...config, [`reparto_${f.key}`]: v }), false)}
            </label>
          ))}
        </div>
      </section>

      <section className="mb-5 rounded-3xl border border-neutral-200 bg-white p-4 shadow-sm">
        <h2 className="mb-1 font-semibold text-brand-ink">Gruppi del catalogo</h2>
        <p className="mb-3 text-xs text-neutral-500">Solo dove serve un'eccezione: di solito un gruppo segue la sua famiglia.</p>
        <div className="grid gap-2 sm:grid-cols-2">
          {gruppi.map((g) => (
            <label key={g.nome} className="flex items-center justify-between gap-3 text-sm">
              <span>{g.nome} <span className="text-xs text-neutral-400">{g.n}</span></span>
              {repartoSelect(
                g.nome in mappa ? (mappa[g.nome] ?? "") : "__default__",
                (v) => {
                  const m = { ...mappa };
                  if (v === "__default__") delete m[g.nome];
                  else m[g.nome] = v || null;
                  setMappa(m);
                },
                true
              )}
            </label>
          ))}
        </div>
      </section>
    </PageLayout>
  );
}
