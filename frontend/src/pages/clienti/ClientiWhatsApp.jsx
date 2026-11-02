// @version: v1.0 (2026-11-02) — WhatsApp del locale in sola lettura (coexistence Meta)
// Modulo: clienti
// Impostazioni CRM › WhatsApp: stato del collegamento, «Collega WhatsApp» (Embedded Signup
// di Meta con l'app WhatsApp Business già in uso), archivio e chat recenti.
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
  const sessione = useRef({});

  const carica = () => {
    apiFetch(`${API_BASE}/clienti/whatsapp/stato`).then((r) => r.json()).then((s) => {
      setStato(s);
      setConservazione(String(s?.archivio?.conservazione_giorni ?? ""));
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

  if (!stato) return <p className="text-sm text-neutral-400">{errore || "Carico…"}</p>;
  const a = stato.aggiornamento, c = stato.collegamento, cfg = stato.config, arch = stato.archivio;
  const pronto = cfg.app_id && cfg.config_id && cfg.app_secret_presente && cfg.verify_token_presente;

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
          <h2 className="text-sm font-semibold text-neutral-700 mr-2">Collegamento</h2>
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

      <div className="bg-white rounded-xl border border-neutral-200 p-5 shadow-sm">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-neutral-700">
            Chat recenti {conv ? `· ${conv.da_rispondere} da rispondere` : ""}
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
