// @version: v1.2 (2026-11-24) — riga «Scrivere dalla pagina WhatsApp» (YCLOUD_API_KEY presente/manca)
// v1.1 (2026-11-23) — collegamento via YCloud (indirizzo webhook, segreto, eventi) e
//   chat «chiuse dal cliente» con parole/lunghezza modificabili; il «Collega» Meta resta solo se YCloud non c'è
// v1.0 (2026-11-02) — WhatsApp del locale in sola lettura (coexistence Meta)
// Modulo: clienti
// Impostazioni CRM › WhatsApp: stato del collegamento (YCloud, o in alternativa «Collega WhatsApp»
// con l'Embedded Signup di Meta), archivio, chat «chiuse dal cliente» e chat recenti.
// TRGB LEGGE soltanto: da qui non parte nessun messaggio ai clienti.
import React, { useEffect, useRef, useState } from "react";
import { API_BASE, apiFetch } from "../../config/api";
import { Btn, StatusBadge } from "../../components/ui";

const SDK_URL = "https://connect.facebook.net/en_US/sdk.js";

function caricaSdk(appId, version) {
  return new Promise((resolve, reject) => {
    if (window.FB) { resolve(window.FB); return; }
    window.fbAsyncInit = () => {
      window.FB.init({ appId, autoLogAppEvents: true, xfbml: false, version });
      resolve(window.FB);
    };
    const s = document.createElement("script");
    s.src = SDK_URL; s.async = true; s.defer = true; s.crossOrigin = "anonymous";
    s.onerror = () => reject(new Error("SDK di Meta non caricato (blocco del browser?)"));
    document.body.appendChild(s);
  });
}

export default function ClientiWhatsApp() {
  const [stato, setStato] = useState(null);
  const [conv, setConv] = useState(null);
  const [giorni, setGiorni] = useState(7);
  const [lavoro, setLavoro] = useState(false);
  const [esito, setEsito] = useState(null);
  const [errore, setErrore] = useState(null);
  const [conservazione, setConservazione] = useState("");
  const [chiusuraParole, setChiusuraParole] = useState("");
  const [chiusuraMax, setChiusuraMax] = useState("");
  const [copiato, setCopiato] = useState(false);
  const sessione = useRef({});

  const carica = () => {
    apiFetch(`${API_BASE}/clienti/whatsapp/stato`).then((r) => r.json()).then((s) => {
      setStato(s);
      setConservazione(String(s?.archivio?.conservazione_giorni ?? ""));
      setChiusuraParole((s?.chiusura?.parole || []).join(", "));
      setChiusuraMax(String(s?.chiusura?.max_caratteri ?? ""));
    }).catch(() => setErrore("Stato non disponibile"));
    apiFetch(`${API_BASE}/clienti/whatsapp/conversazioni?giorni=${giorni}`)
      .then((r) => r.json()).then(setConv).catch(() => setConv(null));
  };
  useEffect(carica, [giorni]);

  // Embedded Signup: Meta manda waba_id / phone_number_id con un postMessage
  useEffect(() => {
    const ascolta = (ev) => {
      if (!String(ev.origin).endsWith("facebook.com")) return;
      try {
        const d = JSON.parse(ev.data);
        if (d.type === "WA_EMBEDDED_SIGNUP") {
          sessione.current = { evento: d.event, ...(d.data || {}) };
          if (d.event === "CANCEL") setErrore(`Collegamento annullato${d.data?.current_step ? ` (passo ${d.data.current_step})` : ""}`);
          if (d.event === "ERROR") setErrore(`Meta: ${d.data?.error_message || "errore"}`);
        }
      } catch { /* messaggi non JSON del SDK */ }
    };
    window.addEventListener("message", ascolta);
    return () => window.removeEventListener("message", ascolta);
  }, []);

  const collega = async () => {
    const cfg = stato?.config;
    if (!cfg?.app_id || !cfg?.config_id) { setErrore("Mancano WA_APP_ID / WA_CONFIG_ID nel .env del VPS"); return; }
    setErrore(null); setEsito(null); sessione.current = {};
    try {
      const FB = await caricaSdk(cfg.app_id, cfg.graph_version);
      FB.login((risposta) => {
        const code = risposta?.authResponse?.code;
        if (!code) { setErrore((e) => e || "Nessun codice da Meta: collegamento non completato"); return; }
        setLavoro(true);
        // il codice vale 30 secondi: si manda subito
        setTimeout(async () => {
          try {
            const s = sessione.current;
            const r = await apiFetch(`${API_BASE}/clienti/whatsapp/collega`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ code, waba_id: s.waba_id || null, phone_number_id: s.phone_number_id || null }),
            });
            const d = await r.json();
            if (!r.ok) throw new Error(d.detail || "Collegamento non riuscito");
            setEsito({ ...d, evento: s.evento });
            carica();
          } catch (e) { setErrore(e.message); } finally { setLavoro(false); }
        }, 300);
      }, {
        config_id: cfg.config_id,
        response_type: "code",
        override_default_response_type: true,
        extras: { setup: {}, featureType: "whatsapp_business_app_onboarding", sessionInfoVersion: "3" },
      });
    } catch (e) { setErrore(e.message); }
  };

  const salvaConservazione = async () => {
    const g = parseInt(conservazione, 10);
    const r = await apiFetch(`${API_BASE}/clienti/whatsapp/conservazione`, {
      method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ giorni: g }),
    });
    if (r.ok) carica(); else setErrore("Conservazione: da 7 a 730 giorni");
  };

  const salvaChiusura = async () => {
    const parole = chiusuraParole.split(",").map((p) => p.trim()).filter(Boolean);
    const r = await apiFetch(`${API_BASE}/clienti/whatsapp/chiusura`, {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ parole, max_caratteri: parseInt(chiusuraMax, 10) }),
    });
    if (r.ok) { setErrore(null); carica(); }
    else {
      const d = await r.json().catch(() => ({}));
      setErrore(typeof d.detail === "string" ? d.detail : "Chiusura: almeno una parola, lunghezza da 5 a 200");
    }
  };

  if (!stato) return <p className="text-sm text-neutral-400">{errore || "Carico…"}</p>;
  const a = stato.aggiornamento, c = stato.collegamento, cfg = stato.config, arch = stato.archivio;
  const pronto = cfg.app_id && cfg.config_id && cfg.app_secret_presente && cfg.verify_token_presente;
  const yc = cfg.ycloud || {};
  const viaYcloud = cfg.provider === "ycloud" || a.provider === "ycloud";
  const urlYcloud = `${API_BASE}${yc.webhook_path || "/clienti/whatsapp/ycloud"}`;
  const copia = async () => {
    try { await navigator.clipboard.writeText(urlYcloud); setCopiato(true); setTimeout(() => setCopiato(false), 2000); }
    catch { setErrore("Copia non riuscita: seleziona l'indirizzo a mano"); }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-neutral-900">WhatsApp del locale</h1>
        <p className="text-sm text-neutral-500 mt-1">
          Sola lettura: TRGB vede i messaggi del numero dell'osteria per il giro del mattino.
          Si continua a scrivere dal telefono; da qui non parte niente ai clienti.
        </p>
      </div>

      <div className="bg-white rounded-xl border border-neutral-200 p-5 shadow-sm space-y-3">
        <div className="flex items-center gap-2 flex-wrap">
          <h2 className="text-sm font-semibold text-neutral-700 mr-2">Collegamento tramite YCloud</h2>
          {a.collegato && a.provider === "ycloud" ? <StatusBadge tone="success" dot>Collegato {a.numero || ""}</StatusBadge>
            : a.scollegato ? <StatusBadge tone="danger" dot>Scollegato ({a.scollegato})</StatusBadge>
            : yc.segreto_presente ? <StatusBadge tone="warning">In attesa del primo messaggio</StatusBadge>
            : <StatusBadge tone="neutral">Da configurare</StatusBadge>}
        </div>
        <p className="text-xs text-neutral-500">
          Il numero dell'osteria è collegato a YCloud con l'app WhatsApp Business che resta sul telefono.
          YCloud manda a TRGB ogni messaggio ricevuto e ogni risposta scritta dal telefono.
        </p>
        <ul className="text-xs text-neutral-500 space-y-1">
          <li className="flex items-center gap-2 flex-wrap">
            <span>Indirizzo da mettere in YCloud › Developers › Webhooks:</span>
            <code className="bg-neutral-100 rounded px-1.5 py-0.5 text-neutral-700 break-all">{urlYcloud}</code>
            <Btn size="sm" variant="secondary" onClick={copia}>{copiato ? "Copiato" : "Copia"}</Btn>
          </li>
          <li>Eventi da spuntare: {(yc.eventi || []).join(", ")}</li>
          <li>Segreto (YCLOUD_WEBHOOK_SECRET nel .env del VPS): {yc.segreto_presente ? "presente" : "manca"}</li>
          <li>
            Scrivere dalla pagina 💬 WhatsApp (chiave YCLOUD_API_KEY nel .env, da YCloud › Developers › API Keys):{" "}
            {yc.api_key_presente ? "attivo" : "manca la chiave"} — solo entro 24 ore dall'ultimo messaggio del cliente;
            chi può scrivere si decide in Impostazioni Sistema › Moduli («WhatsApp · scrivere»).
          </li>
          {c.collegato_at && <li>Primo messaggio arrivato il {c.collegato_at}</li>}
          <li>Ultimo evento: {a.ultimo_webhook || "mai"}{a.storico ? ` · storico ${a.storico}` : ""}</li>
          {c.ultimo_account_update && <li>Ultimo avviso sull'account: {c.ultimo_account_update}</li>}
          {stato.eventi?.some((e) => e.esito === "da_capire") && (
            <li className="text-amber-700">La rubrica dell'app è arrivata in una forma che TRGB non conosce ancora: va adattata.</li>
          )}
        </ul>
        <p className="text-xs text-neutral-400">
          Se il collegamento cade: apri l'app WhatsApp Business sul telefono (va aperta almeno ogni 2 settimane).
          Se non basta, ricollega il numero da YCloud entrando con il profilo che gestisce la Pagina Facebook dell'osteria.
          Le risposte scritte da TRGB (o dalla casella di YCloud) passano dall'API di WhatsApp: oltre le 1.000 al mese
          per numero si pagano, scalate dal credito di YCloud. Quelle dal telefono restano gratis.
        </p>
        {errore && viaYcloud && <p className="text-sm text-red-600">{errore}</p>}
      </div>

      {!viaYcloud && (
      <div className="bg-white rounded-xl border border-neutral-200 p-5 shadow-sm space-y-3">
        <div className="flex items-center gap-2 flex-wrap">
          <h2 className="text-sm font-semibold text-neutral-700 mr-2">Collegamento diretto Meta (alternativa)</h2>
          {a.collegato ? <StatusBadge tone="success" dot>Collegato {a.numero}</StatusBadge>
            : a.scollegato ? <StatusBadge tone="danger" dot>Scollegato ({a.scollegato})</StatusBadge>
            : <StatusBadge tone="neutral">Non collegato</StatusBadge>}
          {!pronto && <StatusBadge tone="warning">Configurazione .env incompleta</StatusBadge>}
        </div>
        <ul className="text-xs text-neutral-500 space-y-0.5">
          <li>App Meta: {cfg.app_id || "—"} · configurazione: {cfg.config_id || "—"} · Graph {cfg.graph_version}</li>
          <li>Segreto app: {cfg.app_secret_presente ? "presente" : "manca"} · parola di verifica: {cfg.verify_token_presente ? "presente" : "manca"}</li>
          <li>Webhook: <code>{cfg.webhook_path}</code> · campi: {cfg.campi_webhook.join(", ")}</li>
          {c.collegato_at && <li>Collegato il {c.collegato_at}{c.nome ? ` · ${c.nome}` : ""}</li>}
          <li>Ultimo webhook: {a.ultimo_webhook || "mai"}{a.storico ? ` · storico ${a.storico}` : ""}</li>
          {a.storico_errore && <li className="text-red-600">Storico: {a.storico_errore}</li>}
          {c.ultimo_account_update && <li>Ultimo avviso Meta: {c.ultimo_account_update}</li>}
        </ul>
        <div className="flex items-center gap-3">
          <Btn variant="primary" size="md" onClick={collega} loading={lavoro} disabled={!pronto || lavoro}>
            {a.collegato ? "Ricollega WhatsApp" : "Collega WhatsApp"}
          </Btn>
          <span className="text-xs text-neutral-400">Nella finestra di Meta scegli «collega un account WhatsApp Business esistente», poi conferma dall'app sul telefono e accetta di condividere la cronologia.</span>
        </div>
        {errore && <p className="text-sm text-red-600">{errore}</p>}
        {esito && (
          <div className="text-xs bg-neutral-50 rounded-lg p-3 space-y-1">
            <div className="font-semibold">{esito.ok ? "Collegamento fatto" : "Collegamento con errori"} · coexistence: {esito.coexistence ? "sì" : "no"} · {esito.platform_type || ""}</div>
            {esito.passi.map((p, i) => (
              <div key={i} className={p.esito === "ok" ? "text-emerald-700" : "text-red-600"}>
                {p.esito === "ok" ? "✓" : "✗"} {p.passo}{p.esito !== "ok" ? ` — ${p.dettaglio}` : ""}
              </div>
            ))}
          </div>
        )}
      </div>
      )}

      <div className="bg-white rounded-xl border border-neutral-200 p-5 shadow-sm">
        <h2 className="text-sm font-semibold text-neutral-700 mb-2">Archivio</h2>
        <p className="text-sm text-neutral-600">{arch.messaggi} messaggi in {arch.chat} chat{arch.dal ? `, dal ${arch.dal}` : ""}.</p>
        <div className="flex items-center gap-2 mt-3">
          <label className="text-sm text-neutral-600">Tengo i messaggi per</label>
          <input type="number" min={7} max={730} value={conservazione} onChange={(e) => setConservazione(e.target.value)}
            className="w-20 border border-neutral-300 rounded-lg px-2 py-1 text-sm" />
          <span className="text-sm text-neutral-600">giorni, poi si cancellano da soli.</span>
          <Btn size="sm" variant="secondary" onClick={salvaConservazione}>Salva</Btn>
        </div>
        {stato.eventi?.some((e) => e.esito === "errore") && (
          <p className="text-xs text-red-600 mt-2">Ci sono webhook non elaborati: {stato.eventi.filter((e) => e.esito === "errore")[0].errore}</p>
        )}
      </div>

      <div className="bg-white rounded-xl border border-neutral-200 p-5 shadow-sm space-y-3">
        <h2 className="text-sm font-semibold text-neutral-700">Chat chiuse dal cliente</h2>
        <p className="text-xs text-neutral-500">
          Se dopo la nostra risposta il cliente scrive solo un saluto (es. «Grazie mille! 🙏», «ok perfetto»),
          la chat non è «da rispondere»: va in un gruppo a parte. Conta se il messaggio è fatto solo di queste
          parole o emoji, è senza «?» ed è entro la lunghezza massima. Con «sticker» nell'elenco contano anche gli sticker.
        </p>
        <textarea value={chiusuraParole} onChange={(e) => setChiusuraParole(e.target.value)} rows={3}
          className="w-full border border-neutral-300 rounded-lg px-2 py-1.5 text-sm" placeholder="grazie, ok, perfetto, 👍" />
        <div className="flex items-center gap-2 flex-wrap">
          <label className="text-sm text-neutral-600">Lunghezza massima</label>
          <input type="number" min={5} max={200} value={chiusuraMax} onChange={(e) => setChiusuraMax(e.target.value)}
            className="w-20 border border-neutral-300 rounded-lg px-2 py-1 text-sm" />
          <span className="text-sm text-neutral-600">caratteri · parole separate da virgola</span>
          <Btn size="sm" variant="secondary" onClick={salvaChiusura}>Salva</Btn>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-neutral-200 p-5 shadow-sm">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-neutral-700">
            Chat recenti {conv ? `· ${conv.da_rispondere} da rispondere${conv.chiuse_dal_cliente ? ` · ${conv.chiuse_dal_cliente} chiuse dal cliente` : ""}` : ""}
          </h2>
          <select value={giorni} onChange={(e) => setGiorni(Number(e.target.value))}
            className="border border-neutral-300 rounded-lg px-2 py-1 text-sm">
            {[1, 3, 7, 14, 30].map((g) => <option key={g} value={g}>ultimi {g} giorni</option>)}
          </select>
        </div>
        {!conv?.conversazioni?.length ? (
          <p className="text-sm text-neutral-400">Nessuna chat nel periodo.</p>
        ) : (
          <div className="divide-y divide-neutral-100">
            {conv.conversazioni.map((v) => (
              <div key={v.numero} className="py-2.5 flex gap-3 items-start">
                <div className="w-44 flex-shrink-0">
                  <div className="text-sm font-medium text-neutral-800">
                    {v.cliente_id ? <a href={`/clienti/${v.cliente_id}`} className="hover:underline">{v.nome}</a> : (v.nome || "—")}
                  </div>
                  <div className="text-xs text-neutral-400">{v.numero}</div>
                </div>
                <div className="flex-1 min-w-0 text-xs space-y-0.5">
                  {v.ultimo_suo && <div className="truncate"><span className="text-neutral-400">{v.ultimo_suo.quando} cliente:</span> {v.ultimo_suo.testo}</div>}
                  {v.ultimo_mio && <div className="truncate"><span className="text-neutral-400">{v.ultimo_mio.quando} noi:</span> {v.ultimo_mio.testo}</div>}
                </div>
                <div className="flex-shrink-0">
                  {v.stato === "da_rispondere"
                    ? <StatusBadge tone="danger" dot>Da rispondere · {v.attesa_ore} h</StatusBadge>
                    : v.stato === "chiusa_dal_cliente" ? <StatusBadge tone="neutral">Chiusa dal cliente</StatusBadge>
                    : v.stato === "risposto" ? <StatusBadge tone="success">Risposto</StatusBadge>
                    : <StatusBadge tone="info">Aspetto loro</StatusBadge>}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
