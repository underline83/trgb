// @version: v1.1 — messaggio WhatsApp asciutto e modificabile (2026-10-19)
// v1.0 — invio preventivo al cliente: WhatsApp (testo + PDF), email col PDF, storico invii (mig 200)
// Modulo: clienti (sub-modulo preventivi)
//
// WhatsApp da link (wa.me) non può allegare file. Quindi:
//  - «📤 Condividi PDF + testo»: Web Share API col PDF vero e il testo completo
//    (iPhone/iPad, e i browser desktop che la supportano). In WhatsApp si sceglie
//    la chat del cliente. Il testo viene anche copiato: se WA tiene solo il PDF,
//    si incolla.
//  - «💬 Apri chat col testo» + «📥 Scarica PDF»: chat del cliente già aperta col
//    testo; il PDF si trascina nella chat (Mac).
// Email: casella del locale (M.D), PDF allegato, oggetto e testo modificabili.
// Ogni invio va nel registro (GET/POST /preventivi/{id}/invii); il primo invio
// riuscito porta «bozza» → «inviato» (lo fa il backend).
import React, { useState, useEffect, useCallback, useRef } from "react";
import { API_BASE, apiFetch } from "../../config/api";
import { Btn } from "../../components/ui";
import { buildWaLink, normalizePhone } from "../../utils/whatsapp";

const fmtData = (s) => {
  if (!s) return "";
  const d = new Date(s.replace(" ", "T"));
  if (isNaN(d)) return s;
  return d.toLocaleString("it-IT", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
};

export default function PreventivoInvioModal({ prevId, numero, clienteNome, onClose, onInviato, showToast }) {
  const [tab, setTab] = useState("whatsapp");
  const [loading, setLoading] = useState(true);
  const [errore, setErrore] = useState(null);

  // Materiale pronto PRIMA del tocco: Safari vuole navigator.share dentro il gesto,
  // senza attese di rete in mezzo.
  const [testo, setTesto] = useState("");
  const [testoProposto, setTestoProposto] = useState("");
  const [telefono, setTelefono] = useState("");
  const [pdfFile, setPdfFile] = useState(null);
  const [puoCondividere, setPuoCondividere] = useState(false);

  const [mail, setMail] = useState({ to: "", oggetto: "", corpo: "" });
  const [mailCfg, setMailCfg] = useState({ ok: true, mancanti: [] });
  const [inviando, setInviando] = useState(false);

  const [invii, setInvii] = useState([]);
  const waRegistrato = useRef(false);

  const caricaInvii = useCallback(async () => {
    const r = await apiFetch(`${API_BASE}/preventivi/${prevId}/invii`);
    if (r.ok) setInvii(await r.json());
  }, [prevId]);

  useEffect(() => {
    let vivo = true;
    (async () => {
      try {
        const [rt, rp, rm] = await Promise.all([
          apiFetch(`${API_BASE}/preventivi/${prevId}/testo`),
          apiFetch(`${API_BASE}/preventivi/${prevId}/pdf`),
          apiFetch(`${API_BASE}/preventivi/${prevId}/email-bozza`),
        ]);
        if (!rt.ok || !rp.ok || !rm.ok) throw new Error("Errore nella preparazione del preventivo");
        const t = await rt.json();
        const blob = await rp.blob();
        const m = await rm.json();
        if (!vivo) return;
        const nomeFile = `preventivo_${(numero || prevId).toString().toLowerCase().replace(/-/g, "_")}.pdf`;
        const file = new File([blob], nomeFile, { type: "application/pdf" });
        setTesto(t.testo || "");
        setTestoProposto(t.testo || "");
        setTelefono(t.telefono || "");
        setPdfFile(file);
        setPuoCondividere(!!(navigator.canShare && navigator.canShare({ files: [file] })));
        setMail({ to: m.to || "", oggetto: m.oggetto || "", corpo: m.corpo || "" });
        setMailCfg({ ok: !!m.email_configurata, mancanti: m.email_mancanti || [] });
        await caricaInvii();
      } catch (e) {
        if (vivo) setErrore(e.message || "Errore");
      } finally {
        if (vivo) setLoading(false);
      }
    })();
    return () => { vivo = false; };
  }, [prevId, numero, caricaInvii]);

  // Un invio WhatsApp si registra una volta per apertura del pannello
  const registraWA = async () => {
    if (waRegistrato.current) return;
    waRegistrato.current = true;
    try {
      const r = await apiFetch(`${API_BASE}/preventivi/${prevId}/invii`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ canale: "whatsapp", destinatario: telefono || null }),
      });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).detail || "Invio non registrato");
      const d = await r.json();
      onInviato?.(d.stato);
      await caricaInvii();
    } catch (e) {
      waRegistrato.current = false;
      showToast(e.message, true);
    }
  };

  const copiaTesto = () => {
    try { navigator.clipboard?.writeText(testo); } catch { /* niente */ }
  };

  const handleCondividi = () => {
    if (!pdfFile) return;
    copiaTesto();
    navigator
      .share({ files: [pdfFile], text: testo, title: `Preventivo ${numero || ""}`.trim() })
      .then(() => {
        showToast("📤 Condiviso — se WhatsApp ha mandato solo il PDF, il testo è copiato: incollalo");
        registraWA();
      })
      .catch((e) => {
        if (e?.name !== "AbortError") showToast("Condivisione non riuscita: usa «Apri chat» + «Scarica PDF»", true);
      });
  };

  const handleApriChat = () => {
    const url = buildWaLink(telefono, testo);
    if (!url) { showToast("Telefono non valido", true); return; }
    window.open(url, "_blank", "noopener");
    registraWA();
  };

  const handleScaricaPDF = () => {
    if (!pdfFile) return;
    const url = URL.createObjectURL(pdfFile);
    const a = document.createElement("a");
    a.href = url;
    a.download = pdfFile.name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const handleInviaEmail = async () => {
    setInviando(true);
    try {
      const r = await apiFetch(`${API_BASE}/preventivi/${prevId}/invia-email`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(mail),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.detail || "Errore invio");
      await caricaInvii();
      if (!d.ok) throw new Error(`Email NON partita: ${d.errore || "errore"}`);
      onInviato?.(d.stato);
      showToast(`✉️ Email inviata a ${mail.to}`);
    } catch (e) {
      showToast(e.message, true);
    } finally {
      setInviando(false);
    }
  };

  const telOk = !!normalizePhone(telefono);

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl p-5 space-y-4 max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-base font-semibold text-neutral-900">📨 Invia al cliente</h3>
            <p className="text-xs text-neutral-500">
              {numero}{clienteNome ? ` · ${clienteNome}` : ""} — dati salvati, mai i prezzi dei singoli piatti
            </p>
          </div>
          <button onClick={onClose} className="text-neutral-400 hover:text-neutral-700 text-xl leading-none px-2 min-h-[44px]">✕</button>
        </div>

        <div className="flex gap-2">
          {[["whatsapp", "💬 WhatsApp"], ["email", "✉️ Email"]].map(([k, l]) => (
            <button key={k} onClick={() => setTab(k)}
              className={`px-4 min-h-[44px] rounded-lg text-sm font-medium border transition ${tab === k ? "bg-indigo-600 text-white border-indigo-600" : "bg-white text-neutral-700 border-neutral-200 hover:bg-neutral-50"}`}>
              {l}
            </button>
          ))}
        </div>

        <div className="overflow-y-auto flex-1 space-y-4">
          {loading && <p className="text-sm text-neutral-500 py-6 text-center">Preparo testo e PDF…</p>}
          {errore && <p className="text-sm text-red-600">{errore}</p>}

          {!loading && !errore && tab === "whatsapp" && (
            <div className="space-y-3">
              <label className="block">
                <span className="text-xs text-neutral-500">Telefono</span>
                <input type="tel" value={telefono} onChange={(e) => setTelefono(e.target.value)}
                  className="mt-1 w-full border border-neutral-300 rounded-lg px-3 py-2 text-sm" placeholder="es. 340 1234567" />
              </label>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {puoCondividere && (
                  <Btn variant="chip" tone="emerald" size="md" onClick={handleCondividi} className="w-full sm:col-span-2">
                    📤 Condividi PDF + testo su WhatsApp
                  </Btn>
                )}
                <Btn variant="chip" tone="emerald" size="md" onClick={handleApriChat} disabled={!telOk} className="w-full"
                  title="Apre la chat del cliente col testo completo">
                  💬 Apri chat col testo
                </Btn>
                <Btn variant="chip" tone="blue" size="md" onClick={handleScaricaPDF} className="w-full"
                  title="Scarica il PDF da trascinare nella chat">
                  📥 Scarica PDF
                </Btn>
              </div>
              <p className="text-xs text-neutral-500">
                {puoCondividere
                  ? "«Condividi» allega il PDF vero: in WhatsApp scegli la chat del cliente. Il testo viene anche copiato, se serve incollarlo."
                  : "Da qui WhatsApp non può ricevere allegati: apri la chat col testo, poi trascina il PDF scaricato nella chat."}
              </p>

              <label className="block">
                <span className="flex items-center justify-between text-xs text-neutral-500">
                  <span>Messaggio (modificabile; *grassetto* e _corsivo_ come in WhatsApp)</span>
                  {testo !== testoProposto && (
                    <button type="button" onClick={() => setTesto(testoProposto)}
                      className="text-indigo-600 hover:underline px-1 min-h-[32px]">↺ Testo proposto</button>
                  )}
                </span>
                <textarea rows={12} value={testo} onChange={(e) => setTesto(e.target.value)}
                  className="mt-1 w-full border border-neutral-300 rounded-lg px-3 py-2 text-sm font-sans" />
              </label>
            </div>
          )}

          {!loading && !errore && tab === "email" && (
            <div className="space-y-3">
              {!mailCfg.ok && (
                <p className="text-xs bg-amber-50 border border-amber-200 text-amber-800 rounded-lg px-3 py-2">
                  Casella email del locale non configurata ({mailCfg.mancanti.join(", ")}): Impostazioni Sistema → Email.
                </p>
              )}
              <label className="block">
                <span className="text-xs text-neutral-500">A (più indirizzi separati da virgola)</span>
                <input type="email" value={mail.to} onChange={(e) => setMail({ ...mail, to: e.target.value })}
                  className="mt-1 w-full border border-neutral-300 rounded-lg px-3 py-2 text-sm" placeholder="cliente@esempio.it" />
              </label>
              <label className="block">
                <span className="text-xs text-neutral-500">Oggetto</span>
                <input value={mail.oggetto} onChange={(e) => setMail({ ...mail, oggetto: e.target.value })}
                  className="mt-1 w-full border border-neutral-300 rounded-lg px-3 py-2 text-sm" />
              </label>
              <label className="block">
                <span className="text-xs text-neutral-500">Testo</span>
                <textarea rows={12} value={mail.corpo} onChange={(e) => setMail({ ...mail, corpo: e.target.value })}
                  className="mt-1 w-full border border-neutral-300 rounded-lg px-3 py-2 text-sm font-sans" />
              </label>
              <div className="flex items-center justify-between gap-3">
                <span className="text-xs text-neutral-500">📎 {pdfFile?.name}</span>
                <Btn variant="chip" tone="violet" size="md" onClick={handleInviaEmail}
                  disabled={inviando || !mailCfg.ok || !mail.to.trim()} loading={inviando}>
                  ✉️ Invia email
                </Btn>
              </div>
            </div>
          )}

          {!loading && (
            <div className="border-t border-neutral-200 pt-3">
              <h4 className="text-[10px] uppercase tracking-wider text-neutral-400 mb-2">Invii di questo preventivo</h4>
              {invii.length === 0 ? (
                <p className="text-xs text-neutral-400">Ancora nessun invio.</p>
              ) : (
                <ul className="space-y-1">
                  {invii.map((i) => (
                    <li key={i.id} className="text-xs text-neutral-600 flex flex-wrap gap-x-2">
                      <span>{i.canale === "email" ? "✉️" : "💬"}</span>
                      <span className="text-neutral-400">{fmtData(i.created_at)}</span>
                      <span>{i.destinatario || "—"}</span>
                      {i.inviato_da && <span className="text-neutral-400">da {i.inviato_da}</span>}
                      {i.esito !== "ok" && <span className="text-red-600">non partita: {i.errore}</span>}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
