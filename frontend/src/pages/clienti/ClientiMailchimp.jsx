// @version: v1.1-mattoni — M.I primitives (Btn) su CTA Sincronizza + bg-brand-cream
// Pagina integrazione Mailchimp — stato connessione, sync contatti, log
import React, { useState, useEffect } from "react";
import { API_BASE, apiFetch } from "../../config/api";
import ClientiNav from "./ClientiNav";
import { Btn } from "../../components/ui";

export default function ClientiMailchimp({ embedded = false }) {
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState(null);
  const [toast, setToast] = useState(null);

  const showToast = (message, type = "ok") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  // Check connessione Mailchimp
  useEffect(() => {
    apiFetch(`${API_BASE}/clienti/mailchimp/status`)
      .then((r) => r.json())
      .then(setStatus)
      .catch(() => setStatus({ connected: false, error: "Errore di connessione" }))
      .finally(() => setLoading(false));
  }, []);

  const handleSync = async () => {
    setSyncing(true);
    setSyncResult(null);
    try {
      const res = await apiFetch(`${API_BASE}/clienti/mailchimp/sync`, { method: "POST" });
      const data = await res.json();
      setSyncResult(data);
      if (data.status === "ok") {
        showToast(`Sync completato: ${data.synced} contatti sincronizzati`);
      } else {
        showToast(data.error || "Errore sync", "error");
      }
    } catch (err) {
      showToast("Errore sync Mailchimp", "error");
    } finally {
      setSyncing(false);
    }
  };

  const content = (
    <>
      <h1 className="text-2xl font-bold text-neutral-900 mb-6">Integrazione Mailchimp</h1>

          {/* Stato connessione */}
          <div className="bg-white rounded-xl border border-neutral-200 p-5 shadow-sm mb-6">
            <h2 className="text-sm font-semibold text-neutral-700 mb-4">Stato Connessione</h2>
            {loading ? (
              <p className="text-sm text-neutral-400">Verifico connessione...</p>
            ) : status?.connected ? (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <span className="w-3 h-3 bg-emerald-500 rounded-full" />
                  <span className="text-sm font-medium text-emerald-700">Connesso</span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-3">
                  <div>
                    <div className="text-[10px] font-semibold text-neutral-500 uppercase">Account</div>
                    <div className="text-sm text-neutral-800">{status.account_name}</div>
                  </div>
                  <div>
                    <div className="text-[10px] font-semibold text-neutral-500 uppercase">Email</div>
                    <div className="text-sm text-neutral-800">{status.email}</div>
                  </div>
                  <div>
                    <div className="text-[10px] font-semibold text-neutral-500 uppercase">Audience</div>
                    <div className="text-sm text-neutral-800">{status.audience_name}</div>
                  </div>
                  <div>
                    <div className="text-[10px] font-semibold text-neutral-500 uppercase">Iscritti MC</div>
                    <div className="text-sm font-bold text-teal-700">{status.member_count?.toLocaleString("it-IT")}</div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <span className="w-3 h-3 bg-red-400 rounded-full" />
                  <span className="text-sm font-medium text-red-600">Non connesso</span>
                </div>
                <p className="text-sm text-neutral-500">{status?.error}</p>
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                  <h3 className="text-xs font-semibold text-amber-800 mb-2">Come configurare:</h3>
                  <ol className="text-xs text-amber-700 space-y-1 list-decimal list-inside">
                    <li>Vai su Mailchimp → Account → Extras → API Keys</li>
                    <li>Crea una nuova API Key e copiala</li>
                    <li>Vai su Audience → Settings → Audience name and defaults → copia l'Audience ID</li>
                    <li>Sul VPS, aggiungi al file <code className="bg-amber-100 px-1 rounded">.env</code>:</li>
                  </ol>
                  <pre className="mt-2 bg-neutral-800 text-emerald-400 text-xs p-3 rounded-lg overflow-x-auto">
{`MAILCHIMP_API_KEY=la-tua-api-key-usXX
MAILCHIMP_LIST_ID=il-tuo-audience-id`}
                  </pre>
                  <p className="text-xs text-amber-600 mt-2">Poi riavvia il backend: <code className="bg-amber-100 px-1 rounded">sudo systemctl restart trgb-backend</code></p>
                </div>
              </div>
            )}
          </div>

          {/* Sync */}
          {status?.connected && (
            <div className="bg-white rounded-xl border border-neutral-200 p-5 shadow-sm mb-6">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-sm font-semibold text-neutral-700">Sincronizza Contatti</h2>
                  <p className="text-xs text-neutral-500 mt-1">
                    Invia a Mailchimp tutti i clienti con email + newsletter attiva.
                    Include: nome, cognome, telefono, compleanno, citta, rank, segmento marketing, allergie, preferenze, tags CRM.
                  </p>
                </div>
                <Btn variant="success" size="md" onClick={handleSync} disabled={syncing} loading={syncing}>
                  Sincronizza ora
                </Btn>
              </div>

              {/* Cosa viene sincronizzato */}
              <div className="bg-neutral-50 rounded-lg p-3 border border-neutral-200 mb-4">
                <h3 className="text-[10px] font-semibold text-neutral-500 uppercase mb-2">Dati sincronizzati</h3>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs text-neutral-600">
                  <div className="flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 bg-teal-500 rounded-full" />
                    Merge fields: telefono, compleanno, citta, rank, segmento, allergie, pref. cibo
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 bg-sky-500 rounded-full" />
                    Tags CRM (VIP, Habitue, etc.)
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 bg-violet-500 rounded-full" />
                    Segmenti marketing (abituale, in_calo, perso, etc.)
                  </div>
                </div>
              </div>

              {/* Risultati sync */}
              {syncResult && (
                <div className={`rounded-lg p-4 border ${
                  syncResult.status === "ok"
                    ? "bg-emerald-50 border-emerald-200"
                    : "bg-red-50 border-red-200"
                }`}>
                  {syncResult.status === "ok" ? (
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <span className="text-emerald-600 font-bold text-sm">Sync completato</span>
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                        <div className="bg-white rounded-lg px-3 py-2 text-center border border-emerald-200">
                          <div className="text-lg font-bold text-teal-700">{syncResult.totale_candidati}</div>
                          <div className="text-[10px] text-neutral-500 uppercase">Candidati</div>
                        </div>
                        <div className="bg-white rounded-lg px-3 py-2 text-center border border-emerald-200">
                          <div className="text-lg font-bold text-emerald-600">{syncResult.synced}</div>
                          <div className="text-[10px] text-neutral-500 uppercase">Sincronizzati</div>
                        </div>
                        <div className="bg-white rounded-lg px-3 py-2 text-center border border-emerald-200">
                          <div className="text-lg font-bold text-neutral-400">{syncResult.skipped}</div>
                          <div className="text-[10px] text-neutral-500 uppercase">Saltati</div>
                        </div>
                        <div className="bg-white rounded-lg px-3 py-2 text-center border border-emerald-200">
                          <div className={`text-lg font-bold ${syncResult.errors > 0 ? "text-red-600" : "text-neutral-400"}`}>
                            {syncResult.errors}
                          </div>
                          <div className="text-[10px] text-neutral-500 uppercase">Errori</div>
                        </div>
                      </div>
                      {syncResult.error_details?.length > 0 && (
                        <div className="mt-2">
                          <div className="text-xs font-medium text-red-600 mb-1">Dettagli errori:</div>
                          <div className="max-h-32 overflow-y-auto text-xs text-red-500 space-y-0.5">
                            {syncResult.error_details.map((e, i) => (
                              <div key={i}>{e.email}: {e.error}</div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="text-sm text-red-600">{syncResult.error}</div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Info segmenti */}
          {status?.connected && (
            <div className="bg-white rounded-xl border border-neutral-200 p-5 shadow-sm">
              <h2 className="text-sm font-semibold text-neutral-700 mb-3">Come usare i segmenti in Mailchimp</h2>
              <div className="text-xs text-neutral-600 space-y-2">
                <p>
                  Dopo il sync, ogni contatto su Mailchimp avra dei <strong>tags</strong> che puoi usare
                  per creare segmenti e campagne mirate:
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-2">
                  <div className="bg-emerald-50 rounded-lg p-2.5 border border-emerald-200">
                    <div className="font-semibold text-emerald-800 mb-1">Campagna riconquista</div>
                    <div className="text-emerald-700">Tag: <code className="bg-emerald-100 px-1 rounded">segmento:in_calo</code> + <code className="bg-emerald-100 px-1 rounded">segmento:perso</code></div>
                  </div>
                  <div className="bg-sky-50 rounded-lg p-2.5 border border-sky-200">
                    <div className="font-semibold text-sky-800 mb-1">Newsletter VIP</div>
                    <div className="text-sky-700">Tag: <code className="bg-sky-100 px-1 rounded">VIP</code> + <code className="bg-sky-100 px-1 rounded">segmento:abituale</code></div>
                  </div>
                  <div className="bg-violet-50 rounded-lg p-2.5 border border-violet-200">
                    <div className="font-semibold text-violet-800 mb-1">Benvenuto nuovi</div>
                    <div className="text-violet-700">Tag: <code className="bg-violet-100 px-1 rounded">segmento:nuovo</code></div>
                  </div>
                  <div className="bg-amber-50 rounded-lg p-2.5 border border-amber-200">
                    <div className="font-semibold text-amber-800 mb-1">Auguri compleanno</div>
                    <div className="text-amber-700">Merge field: <code className="bg-amber-100 px-1 rounded">BIRTHDAY</code> (automazione Mailchimp)</div>
                  </div>
                </div>
              </div>
            </div>
          )}

      {toast && (
        <div className={`fixed bottom-4 right-4 px-4 py-2 rounded-lg shadow-lg text-sm font-medium z-50 ${
          toast.type === "error" ? "bg-red-600 text-white" : "bg-emerald-600 text-white"
        }`} onClick={() => setToast(null)}>
          {toast.message}
        </div>
      )}
    </>
  );

  if (embedded) return content;

  return (
    <>
      <ClientiNav current="impostazioni" />
      <div className="min-h-screen bg-brand-cream">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6">
          {content}
        </div>
      </div>
    </>
  );
}
