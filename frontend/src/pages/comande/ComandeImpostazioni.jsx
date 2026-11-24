// @version: v1.0 — uscite, reparti, dove va ogni gruppo del catalogo (2026-11-24)
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

export default function ComandeImpostazioni() {
  const [imp, setImp] = useState(null);
  const [gruppi, setGruppi] = useState([]);
  const [config, setConfig] = useState({});
  const [reparti, setReparti] = useState([]);
  const [mappa, setMappa] = useState({});
  const [msg, setMsg] = useState(null);
  const [salvo, setSalvo] = useState(false);

  const riempi = (d) => {
    setImp(d);
    setConfig({ ...d.config });
    setReparti(d.reparti.map((r) => ({ ...r })));
    setMappa({ ...d.gruppi_reparto });
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
        "reparto_food", "reparto_beverage", "reparto_servizio"];
      const cfg = {};
      chiavi.forEach((k) => { cfg[k] = config[k] ?? ""; });
      riempi(await api("/comande/impostazioni/", {
        method: "PUT",
        body: { config: cfg, reparti, gruppi_reparto: gruppiReparto },
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
