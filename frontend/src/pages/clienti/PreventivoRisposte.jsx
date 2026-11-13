// @version: v1.0 (2026-11-13) — «Invii di questo preventivo» + «Risposte ricevute» nella scheda
// Modulo: clienti (sub-modulo preventivi)
// Le risposte arrivano dalla posta in arrivo della casella del gestionale (mattone M.D,
// lettura IMAP in sola lettura): GET /preventivi/{id}/risposte. Il testo è già testo
// semplice ripulito lato server e qui si mostra SOLO come testo (whitespace-pre-wrap):
// niente HTML, niente immagini remote, niente link cliccabili. È un dato di terzi.
import React, { useState, useEffect, useCallback } from "react";
import { API_BASE, apiFetch } from "../../config/api";
import { Btn } from "../../components/ui";

const ABBINAMENTO_LABEL = {
  in_reply_to: "risposta a un invio",
  numero: "numero nell'oggetto",
  mittente: "indirizzo del cliente",
};

function fmtData(s) {
  if (!s) return "";
  return `${s.slice(8, 10)}/${s.slice(5, 7)} ${s.slice(11, 16)}`;
}

function kb(n) {
  if (!n && n !== 0) return "";
  return n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`;
}

export default function PreventivoRisposte({ prevId, aggiorna, onCambio, onToast }) {
  const [invii, setInvii] = useState([]);
  const [risposte, setRisposte] = useState([]);
  const [agg, setAgg] = useState(null);
  const [aperte, setAperte] = useState({});
  const [salvando, setSalvando] = useState(null);
  const ruolo = localStorage.getItem("role");
  const isAdmin = ruolo === "admin" || ruolo === "superadmin";

  const carica = useCallback(() => {
    if (!prevId) return;
    apiFetch(`${API_BASE}/preventivi/${prevId}/invii`)
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => setInvii(Array.isArray(d) ? d : []))
      .catch(() => {});
    apiFetch(`${API_BASE}/preventivi/${prevId}/risposte`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!d) return;
        setRisposte(d.risposte || []);
        setAgg(d.aggiornamento || null);
      })
      .catch(() => {});
  }, [prevId]);

  useEffect(() => { carica(); }, [carica, aggiorna]);

  const cambiaStato = async (m, stato) => {
    setSalvando(m.id);
    try {
      const res = await apiFetch(`${API_BASE}/email/in/${m.id}/stato`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stato }),
      });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error(e.detail || `Errore ${res.status}`);
      }
      onToast?.(stato === "gestita" ? "Risposta segnata come gestita" : "Risposta riaperta");
      carica();
      onCambio?.();
    } catch (err) {
      onToast?.(err.message, true);
    } finally {
      setSalvando(null);
    }
  };

  if (!prevId) return null;

  return (
    <div className="bg-white rounded-xl border border-neutral-200 shadow-sm p-5 space-y-4">
      <div>
        <h3 className="text-sm font-semibold text-neutral-700 mb-2">📨 Invii di questo preventivo</h3>
        {invii.length === 0 ? (
          <p className="text-xs text-neutral-400">Ancora nessun invio.</p>
        ) : (
          <ul className="space-y-1">
            {invii.map((i) => (
              <li key={i.id} className="text-xs text-neutral-600 flex flex-wrap gap-x-2">
                <span>{i.canale === "email" ? "✉️" : "💬"}</span>
                <span className="text-neutral-400 whitespace-nowrap">{fmtData(i.created_at)}</span>
                <span>{i.destinatario || "—"}</span>
                {i.inviato_da && <span className="text-neutral-400">da {i.inviato_da}</span>}
                {i.esito !== "ok" && <span className="text-red-600">non partita: {i.errore}</span>}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="border-t border-neutral-100 pt-3">
        <div className="flex items-baseline justify-between gap-2 mb-2">
          <h3 className="text-sm font-semibold text-neutral-700">
            📥 Risposte ricevute
            {risposte.filter((m) => m.stato === "nuova").length > 0 && (
              <span className="ml-2 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-red-100 text-red-700">
                {risposte.filter((m) => m.stato === "nuova").length} da gestire
              </span>
            )}
          </h3>
          {agg && agg.errori_di_fila > 0 && (
            <span className="text-[11px] text-amber-700" title={agg.ultimo_errore || ""}>
              ⚠️ casella non letta dal {fmtData(agg.ultimo_ok) || "primo avvio"}
            </span>
          )}
        </div>
        {risposte.length === 0 ? (
          <p className="text-xs text-neutral-400">
            Nessuna risposta via email{agg && !agg.primo_import_fatto ? " (la casella non è ancora stata letta)" : ""}.
          </p>
        ) : (
          <ul className="space-y-2">
            {risposte.map((m) => {
              const aperta = !!aperte[m.id];
              const nuovi = m.cc_nuovi || [];
              return (
                <li key={m.id} className={`rounded-lg border p-3 ${m.stato === "nuova" ? "border-red-200 bg-red-50/40" : "border-neutral-200"}`}>
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
                    <span className="text-neutral-400 whitespace-nowrap">{fmtData(m.data)}</span>
                    <span className="font-medium text-neutral-800">{m.mittente_nome || m.mittente}</span>
                    {m.mittente_nome && <span className="text-neutral-400">{m.mittente}</span>}
                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${m.stato === "nuova" ? "bg-red-100 text-red-700" : "bg-emerald-100 text-emerald-700"}`}>
                      {m.stato === "nuova" ? "nuova" : "gestita"}
                    </span>
                    {ABBINAMENTO_LABEL[m.abbinamento] && (
                      <span className="text-[10px] text-neutral-400">collegata per {ABBINAMENTO_LABEL[m.abbinamento]}</span>
                    )}
                  </div>
                  <button type="button" onClick={() => setAperte((a) => ({ ...a, [m.id]: !aperta }))}
                    className="mt-1 text-left text-sm text-neutral-800 font-medium hover:text-indigo-700 min-h-[32px]">
                    {aperta ? "▾" : "▸"} {m.oggetto || "(senza oggetto)"}
                  </button>
                  {!aperta && m.parte_nuova && (
                    <p className="text-xs text-neutral-600 line-clamp-2 whitespace-pre-wrap">{m.parte_nuova}</p>
                  )}
                  {aperta && (
                    <div className="mt-2 space-y-2">
                      {m.cc && <p className="text-[11px] text-neutral-500">Cc: {m.cc}</p>}
                      <pre className="whitespace-pre-wrap break-words font-sans text-xs text-neutral-700 bg-neutral-50 border border-neutral-100 rounded p-2 max-h-96 overflow-auto">
                        {m.testo || "(nessun testo)"}
                      </pre>
                      {m.testo_troncato && <p className="text-[11px] text-neutral-400">Testo tagliato: il resto è nella webmail.</p>}
                      {(m.allegati || []).length > 0 && (
                        <p className="text-[11px] text-neutral-500">
                          📎 {m.allegati.map((a) => `${a.nome}${a.dimensione ? ` (${kb(a.dimensione)})` : ""}`).join(", ")}
                          <span className="text-neutral-400"> — i file restano nella casella</span>
                        </p>
                      )}
                    </div>
                  )}
                  {nuovi.length > 0 && (
                    <p className="mt-1 text-[11px] text-amber-700">
                      👤 Indirizzi nuovi nel thread: {nuovi.join(", ")} — il cliente non è stato modificato
                    </p>
                  )}
                  {m.abbinamento_nota && <p className="mt-1 text-[11px] text-neutral-400">{m.abbinamento_nota}</p>}
                  {isAdmin && (
                    <div className="mt-2 flex justify-end">
                      {m.stato === "nuova" ? (
                        <Btn variant="chip" tone="emerald" size="sm" onClick={() => cambiaStato(m, "gestita")}
                          loading={salvando === m.id} disabled={salvando === m.id}>
                          ✓ Segna gestita
                        </Btn>
                      ) : (
                        <span className="text-[11px] text-neutral-400 flex items-center gap-2">
                          gestita da {m.gestita_da} il {fmtData(m.gestita_at)}
                          <button type="button" onClick={() => cambiaStato(m, "nuova")}
                            className="underline hover:text-neutral-600">riapri</button>
                        </span>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
