// FILE: frontend/src/pages/clienti/ClientiGiftCard.jsx
// Modulo: clienti — Gift Card
// @version: v1.0-giftcard
//
// Due usi in una pagina sola:
//  1) BANCO: campo grande "digita il codice" → verdetto immediato → Scarica.
//     E' l'uso urgente (cliente davanti), quindi sta in cima e ha il focus.
//  2) UFFICIO: elenco filtrabile, emissione, PDF, annullo.
//
// Nota semantica: `stato` (attiva/usata/annullata) e scadenza sono due cose
// diverse. Una card scaduta e' ancora `attiva` ma non spendibile: il backend
// espone `spendibile` gia' calcolato, la UI mostra due chip separati.

import React, { useState, useEffect, useCallback, useRef } from "react";
import { API_BASE, apiFetch } from "../../config/api";
import ClientiNav from "./ClientiNav";
import {
  Btn, PageLayout, StatusBadge, EmptyState,
  FieldLabel, TextInput, Select, Textarea, Modal,
} from "../../components/ui";

const FILTRI = [
  { key: "spendibili", label: "Spendibili" },
  { key: "in_scadenza", label: "In scadenza" },
  { key: "usata", label: "Usate" },
  { key: "annullata", label: "Annullate" },
  { key: "tutte", label: "Tutte" },
];

function fmtEuro(v) {
  if (v == null) return "—";
  return new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" }).format(v);
}

function fmtData(iso) {
  if (!iso) return "—";
  const [a, m, g] = iso.split("-");
  return `${g}/${m}/${a}`;
}

function nomeIntestatario(gc) {
  if (gc.intestatario_nome) return gc.intestatario_nome;
  const n = [gc.cliente_nome, gc.cliente_cognome].filter(Boolean).join(" ").trim();
  return n || "—";
}

function descrizioneValore(gc) {
  return gc.tipo === "valore" ? fmtEuro(gc.importo) : (gc.descrizione || "Esperienza");
}

// Chip ciclo di vita — NON include la scadenza (dimensione separata)
function ChipStato({ gc }) {
  if (gc.stato === "usata") return <StatusBadge tone="neutral">Usata</StatusBadge>;
  if (gc.stato === "annullata") return <StatusBadge tone="danger">Annullata</StatusBadge>;
  return <StatusBadge tone="success">Attiva</StatusBadge>;
}

// Chip scadenza — mostrato solo quando dice qualcosa di utile
function ChipScadenza({ gc, alertGiorni = 30 }) {
  if (gc.stato !== "attiva" || !gc.data_scadenza) return null;
  if (gc.scaduta) return <StatusBadge tone="danger" dot>Scaduta {fmtData(gc.data_scadenza)}</StatusBadge>;
  if (gc.giorni_alla_scadenza != null && gc.giorni_alla_scadenza <= alertGiorni) {
    return <StatusBadge tone="warning" dot>Scade tra {gc.giorni_alla_scadenza}g</StatusBadge>;
  }
  return null;
}

export default function ClientiGiftCard() {
  const [items, setItems] = useState([]);
  const [totale, setTotale] = useState(0);
  const [stats, setStats] = useState(null);
  const [impostazioni, setImpostazioni] = useState(null);
  const [filtro, setFiltro] = useState("spendibili");
  const [ricerca, setRicerca] = useState("");
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState(null);

  // Banco
  const [codiceBanco, setCodiceBanco] = useState("");
  const [esito, setEsito] = useState(null);
  const [verificando, setVerificando] = useState(false);
  const inputBanco = useRef(null);

  // Modali
  const [modaleNuova, setModaleNuova] = useState(false);
  const [dettaglio, setDettaglio] = useState(null);

  const mostraToast = (testo, tone = "success") => {
    setToast({ testo, tone });
    setTimeout(() => setToast(null), 3500);
  };

  const caricaStats = useCallback(async () => {
    try {
      const r = await apiFetch(`${API_BASE}/clienti/giftcard/stats`);
      if (r.ok) setStats(await r.json());
    } catch { /* la pagina resta usabile senza il riquadro numeri */ }
  }, []);

  const caricaLista = useCallback(async () => {
    setLoading(true);
    try {
      const p = new URLSearchParams();
      if (filtro === "spendibili") p.set("solo_spendibili", "true");
      else if (filtro === "in_scadenza") p.set("solo_scadute", "true");
      else if (filtro === "usata") p.set("stato", "usata");
      else if (filtro === "annullata") p.set("stato", "annullata");
      if (ricerca.trim()) p.set("q", ricerca.trim());

      const r = await apiFetch(`${API_BASE}/clienti/giftcard/?${p.toString()}`);
      if (!r.ok) throw new Error("Caricamento fallito");
      const d = await r.json();
      setItems(d.items || []);
      setTotale(d.totale || 0);
    } catch (e) {
      mostraToast(e.message || "Errore di caricamento", "danger");
    } finally {
      setLoading(false);
    }
  }, [filtro, ricerca]);

  useEffect(() => {
    apiFetch(`${API_BASE}/clienti/giftcard/impostazioni`)
      .then(r => r.ok ? r.json() : null)
      .then(d => d && setImpostazioni(d))
      .catch(() => {});
    caricaStats();
  }, [caricaStats]);

  useEffect(() => {
    const t = setTimeout(caricaLista, ricerca ? 300 : 0);
    return () => clearTimeout(t);
  }, [caricaLista, ricerca]);

  const ricarica = () => { caricaLista(); caricaStats(); };

  // ── Banco ──────────────────────────────────────────────
  const verificaCodice = async (e) => {
    e?.preventDefault();
    const codice = codiceBanco.trim();
    if (!codice) return;
    setVerificando(true);
    setEsito(null);
    try {
      const r = await apiFetch(`${API_BASE}/clienti/giftcard/lookup/${encodeURIComponent(codice)}`);
      const d = await r.json();
      setEsito(d);
    } catch {
      setEsito({ trovata: false, motivo: "Errore di collegamento" });
    } finally {
      setVerificando(false);
    }
  };

  const azione = async (gcId, verbo, note) => {
    try {
      const r = await apiFetch(`${API_BASE}/clienti/giftcard/${gcId}/${verbo}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ note: note || null }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.detail || "Operazione fallita");
      const testi = {
        scarica: "Gift card scaricata",
        annulla: "Gift card annullata",
        riattiva: "Gift card riattivata",
      };
      mostraToast(testi[verbo] || "Fatto");
      if (esito?.id === gcId) setEsito({ trovata: true, ...d });
      if (dettaglio?.id === gcId) setDettaglio(d);
      ricarica();
      return true;
    } catch (e) {
      mostraToast(e.message, "danger");
      return false;
    }
  };

  const scaricaDalBanco = async () => {
    const ok = await azione(esito.id, "scarica");
    if (ok) {
      // Chi sta al banco ha le mani occupate: puliamo e rimettiamo il focus
      // pronto per il prossimo codice senza dover cliccare.
      setTimeout(() => {
        setCodiceBanco("");
        setEsito(null);
        inputBanco.current?.focus();
      }, 1200);
    }
  };

  // Il PDF NON si apre con window.open: sarebbe una richiesta senza header
  // Authorization → 401 {"detail":"Not authenticated"}. Si scarica via
  // apiFetch (che il token ce l'ha) e si salva il blob su disco.
  // Stesso pattern del PDF preventivi, e niente JWT nell'URL.
  const apriPdf = async (gcId, codice) => {
    try {
      const r = await apiFetch(`${API_BASE}/clienti/giftcard/${gcId}/pdf`);
      if (!r.ok) throw new Error("Errore generazione PDF");
      const blob = await r.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `buono_${(codice || gcId).toString().replace(/\s/g, "_")}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) {
      mostraToast(e.message || "Errore PDF", "danger");
    }
  };

  const apriDettaglio = async (gc) => {
    try {
      const r = await apiFetch(`${API_BASE}/clienti/giftcard/${gc.id}`);
      setDettaglio(r.ok ? await r.json() : gc);
    } catch { setDettaglio(gc); }
  };

  const alertGiorni = stats?.alert_giorni ?? 30;

  return (
    <>
      <PageLayout
        nav={<ClientiNav current="giftcard" />}
        title="Gift Card"
        subtitle={stats ? `${stats.spendibili} spendibili · ${fmtEuro(stats.valore_spendibile)} ancora da onorare` : " "}
        actions={<Btn onClick={() => setModaleNuova(true)}>+ Nuova gift card</Btn>}
      >
        {/* ── BANCO: verifica codice ───────────────────────── */}
        <div className="bg-white rounded-2xl border border-neutral-200 shadow-sm p-4 mb-5">
          <form onSubmit={verificaCodice} className="flex flex-col sm:flex-row gap-2 sm:items-end">
            <FieldLabel
              label="Codice gift card"
              hint="Maiuscole, spazi e trattini non contano"
              className="flex-1"
            >
              <input
                ref={inputBanco}
                value={codiceBanco}
                onChange={(e) => setCodiceBanco(e.target.value)}
                placeholder="B126-354"
                autoFocus
                className="w-full px-4 py-3 text-lg font-mono tracking-widest uppercase rounded-xl border border-neutral-300 focus:outline-none focus:ring-2 focus:ring-brand-blue"
              />
            </FieldLabel>
            <Btn type="submit" size="lg" loading={verificando} disabled={!codiceBanco.trim()}>
              Verifica
            </Btn>
            {(esito || codiceBanco) && (
              <Btn
                type="button"
                variant="ghost"
                size="lg"
                onClick={() => { setCodiceBanco(""); setEsito(null); inputBanco.current?.focus(); }}
              >
                Pulisci
              </Btn>
            )}
          </form>

          {esito && (
            <div className={`mt-4 rounded-xl border p-4 ${
              !esito.trovata ? "bg-red-50 border-red-200"
                : esito.spendibile ? "bg-emerald-50 border-emerald-200"
                : "bg-amber-50 border-amber-200"
            }`}>
              {!esito.trovata ? (
                <div className="text-red-800 font-semibold">
                  Codice non valido — {esito.motivo}
                </div>
              ) : (
                <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono font-bold tracking-wider">{esito.codice}</span>
                      <ChipStato gc={esito} />
                      <ChipScadenza gc={esito} alertGiorni={alertGiorni} />
                    </div>
                    <div className="text-2xl font-bold mt-1">{descrizioneValore(esito)}</div>
                    <div className="text-sm text-neutral-600">
                      {nomeIntestatario(esito)}
                      {esito.data_scadenza && ` · valida fino al ${fmtData(esito.data_scadenza)}`}
                    </div>
                    {esito.motivo && (
                      <div className="text-sm font-semibold text-amber-800 mt-1">{esito.motivo}</div>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <Btn variant="secondary" size="lg" onClick={() => apriDettaglio(esito)}>Dettagli</Btn>
                    {esito.spendibile && (
                      <Btn variant="success" size="lg" onClick={scaricaDalBanco}>Scarica</Btn>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── Numeri ───────────────────────────────────────── */}
        {stats && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
            <Riquadro label="Spendibili" valore={stats.spendibili} nota={fmtEuro(stats.valore_spendibile)} colore="border-emerald-200" />
            <Riquadro label={`In scadenza (${alertGiorni}g)`} valore={stats.in_scadenza} colore="border-amber-200" />
            <Riquadro label="Scadute non usate" valore={stats.scadute} colore="border-red-200" />
            <Riquadro label="Usate" valore={stats.usate} nota={`${stats.totali} emesse in tutto`} colore="border-neutral-200" />
          </div>
        )}

        {/* ── Filtri ───────────────────────────────────────── */}
        <div className="flex flex-col sm:flex-row gap-2 sm:items-center mb-3">
          <div className="flex gap-1 flex-wrap">
            {FILTRI.map((f) => (
              <Btn
                key={f.key}
                size="sm"
                variant={filtro === f.key ? "primary" : "secondary"}
                onClick={() => setFiltro(f.key)}
              >
                {f.label}
              </Btn>
            ))}
          </div>
          <div className="sm:ml-auto sm:w-72">
            <TextInput
              value={ricerca}
              onChange={setRicerca}
              placeholder="Cerca codice, nome, descrizione…"
            />
          </div>
        </div>

        {/* ── Elenco ───────────────────────────────────────── */}
        {loading ? (
          <div className="text-center py-10 text-neutral-500">Caricamento…</div>
        ) : items.length === 0 ? (
          <EmptyState
            icon="🎁"
            title="Nessuna gift card"
            description={ricerca ? "Nessun risultato per questa ricerca." : "Qui compaiono i buoni emessi."}
            action={<Btn onClick={() => setModaleNuova(true)}>+ Nuova gift card</Btn>}
          />
        ) : (
          <div className="bg-white rounded-2xl border border-neutral-200 shadow-sm overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-neutral-50 border-b border-neutral-200">
                <tr className="text-left text-[11px] uppercase tracking-wider text-neutral-500">
                  <th className="px-4 py-2">Codice</th>
                  <th className="px-4 py-2">Valore</th>
                  <th className="px-4 py-2 hidden sm:table-cell">Intestatario</th>
                  <th className="px-4 py-2 hidden md:table-cell">Emessa</th>
                  <th className="px-4 py-2">Stato</th>
                  <th className="px-4 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {items.map((gc) => (
                  <tr key={gc.id} className="border-b border-neutral-100 last:border-0 hover:bg-neutral-50">
                    <td className="px-4 py-3 font-mono font-semibold whitespace-nowrap">{gc.codice}</td>
                    <td className="px-4 py-3">{descrizioneValore(gc)}</td>
                    <td className="px-4 py-3 hidden sm:table-cell text-neutral-600">{nomeIntestatario(gc)}</td>
                    <td className="px-4 py-3 hidden md:table-cell text-neutral-500">{fmtData(gc.data_emissione)}</td>
                    <td className="px-4 py-3">
                      <div className="flex gap-1 flex-wrap">
                        <ChipStato gc={gc} />
                        <ChipScadenza gc={gc} alertGiorni={alertGiorni} />
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      <Btn size="sm" variant="ghost" onClick={() => apriPdf(gc.id, gc.codice)}>PDF</Btn>
                      <Btn size="sm" variant="secondary" onClick={() => apriDettaglio(gc)}>Apri</Btn>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {totale > items.length && (
              <div className="px-4 py-2 text-xs text-neutral-500 border-t border-neutral-100">
                Mostrate {items.length} di {totale}
              </div>
            )}
          </div>
        )}
      </PageLayout>

      {modaleNuova && (
        <ModaleNuova
          impostazioni={impostazioni}
          onClose={() => setModaleNuova(false)}
          onCreata={(gc) => {
            setModaleNuova(false);
            mostraToast(`Gift card ${gc.codice} emessa`);
            ricarica();
            apriPdf(gc.id, gc.codice);
          }}
          onErrore={(m) => mostraToast(m, "danger")}
        />
      )}

      {dettaglio && (
        <ModaleDettaglio
          gc={dettaglio}
          alertGiorni={alertGiorni}
          onClose={() => setDettaglio(null)}
          onAzione={azione}
          onPdf={() => apriPdf(dettaglio.id, dettaglio.codice)}
        />
      )}

      {toast && (
        <div className={`fixed bottom-5 left-1/2 -translate-x-1/2 px-5 py-3 rounded-xl shadow-lg text-white text-sm font-medium z-50 ${
          toast.tone === "danger" ? "bg-brand-red" : "bg-brand-green"
        }`}>
          {toast.testo}
        </div>
      )}
    </>
  );
}

function Riquadro({ label, valore, nota, colore }) {
  return (
    <div className={`bg-white rounded-xl border ${colore} p-3`}>
      <div className="text-[10px] uppercase tracking-wider text-neutral-500">{label}</div>
      <div className="text-2xl font-bold text-brand-ink">{valore}</div>
      {nota && <div className="text-[11px] text-neutral-500">{nota}</div>}
    </div>
  );
}

// ─────────────────────────────────────────────────────────
// Emissione
// ─────────────────────────────────────────────────────────
function ModaleNuova({ impostazioni, onClose, onCreata, onErrore }) {
  const [tipo, setTipo] = useState("valore");
  const [importo, setImporto] = useState("");
  const [descrizione, setDescrizione] = useState("");
  const [intestatario, setIntestatario] = useState("");
  const [clienteId, setClienteId] = useState(null);
  const [suggerimenti, setSuggerimenti] = useState([]);
  const [mesi, setMesi] = useState(impostazioni?.validita_mesi ?? 12);
  const [codiceManuale, setCodiceManuale] = useState("");
  const [note, setNote] = useState("");
  const [salvando, setSalvando] = useState(false);

  // Ricerca cliente: se lo trovo in anagrafica lo collego, altrimenti resta
  // testo libero. Non voglio bloccare l'emissione per un cliente non censito.
  useEffect(() => {
    const q = intestatario.trim();
    if (clienteId || q.length < 3) { setSuggerimenti([]); return; }
    const t = setTimeout(async () => {
      try {
        const r = await apiFetch(`${API_BASE}/clienti/?q=${encodeURIComponent(q)}&limit=5`);
        if (!r.ok) return;
        const d = await r.json();
        setSuggerimenti(d.items || d.clienti || []);
      } catch { /* la ricerca e' un aiuto, non un requisito */ }
    }, 300);
    return () => clearTimeout(t);
  }, [intestatario, clienteId]);

  const salva = async () => {
    setSalvando(true);
    try {
      const body = {
        tipo,
        importo: tipo === "valore" ? parseFloat(String(importo).replace(",", ".")) : null,
        descrizione: tipo === "esperienza" ? descrizione.trim() : (descrizione.trim() || null),
        cliente_id: clienteId,
        intestatario_nome: clienteId ? null : (intestatario.trim() || null),
        mesi_validita: Number(mesi),
        codice: codiceManuale.trim() || null,
        note: note.trim() || null,
      };
      const r = await apiFetch(`${API_BASE}/clienti/giftcard/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.detail || "Emissione fallita");
      onCreata(d);
    } catch (e) {
      onErrore(e.message);
    } finally {
      setSalvando(false);
    }
  };

  const valido = tipo === "valore"
    ? parseFloat(String(importo).replace(",", ".")) > 0
    : descrizione.trim().length > 0;

  return (
    <Modal
      open
      onClose={onClose}
      title="Nuova gift card"
      subtitle="Il codice viene generato in automatico se non ne indichi uno"
      size="md"
      footer={
        <>
          <Btn variant="secondary" onClick={onClose}>Annulla</Btn>
          <Btn onClick={salva} loading={salvando} disabled={!valido}>Emetti e stampa</Btn>
        </>
      }
    >
      <div className="space-y-4">
        <div className="flex gap-2">
          <Btn variant={tipo === "valore" ? "primary" : "secondary"} onClick={() => setTipo("valore")}>
            A valore
          </Btn>
          <Btn variant={tipo === "esperienza" ? "primary" : "secondary"} onClick={() => setTipo("esperienza")}>
            Esperienza
          </Btn>
        </div>

        {tipo === "valore" ? (
          <>
            <FieldLabel label="Importo" required>
              <TextInput value={importo} onChange={setImporto} placeholder="100" type="text" />
            </FieldLabel>
            {impostazioni?.importi_rapidi?.length > 0 && (
              <div className="flex gap-1 flex-wrap -mt-2">
                {impostazioni.importi_rapidi.map((v) => (
                  <Btn key={v} size="sm" variant="chip" tone="blue" onClick={() => setImporto(String(v))}>
                    {v}€
                  </Btn>
                ))}
              </div>
            )}
            <FieldLabel label="Dicitura sul buono" hint="Facoltativa, compare sotto l'importo">
              <TextInput value={descrizione} onChange={setDescrizione} placeholder="" />
            </FieldLabel>
          </>
        ) : (
          <FieldLabel label="Esperienza" required hint="Compare sul buono al posto dell'importo">
            <TextInput
              value={descrizione}
              onChange={setDescrizione}
              placeholder="Cena degustazione per due persone"
            />
          </FieldLabel>
        )}

        <FieldLabel label="Intestatario" hint="Cerca in anagrafica o scrivi il nome a mano">
          <TextInput
            value={intestatario}
            onChange={(v) => { setIntestatario(v); setClienteId(null); }}
            placeholder="Nome e cognome"
          />
          {suggerimenti.length > 0 && (
            <div className="mt-1 border border-neutral-200 rounded-lg overflow-hidden">
              {suggerimenti.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => {
                    setClienteId(c.id);
                    setIntestatario([c.nome, c.cognome].filter(Boolean).join(" "));
                    setSuggerimenti([]);
                  }}
                  className="block w-full text-left px-3 py-2 text-sm hover:bg-neutral-50"
                >
                  {[c.nome, c.cognome].filter(Boolean).join(" ")}
                  {c.email && <span className="text-neutral-400 ml-2">{c.email}</span>}
                </button>
              ))}
            </div>
          )}
          {clienteId && (
            <div className="mt-1 text-[11px] text-emerald-700">Collegata alla scheda cliente</div>
          )}
        </FieldLabel>

        <div className="grid grid-cols-2 gap-3">
          <FieldLabel label="Validità">
            <Select
              value={String(mesi)}
              onChange={setMesi}
              options={[
                { value: "6", label: "6 mesi" },
                { value: "12", label: "12 mesi" },
                { value: "18", label: "18 mesi" },
                { value: "24", label: "24 mesi" },
                { value: "0", label: "Senza scadenza" },
              ]}
            />
          </FieldLabel>
          <FieldLabel
            label="Codice"
            hint={impostazioni?.prossimo_codice
              ? `Vuoto = ${impostazioni.prossimo_codice}`
              : "Vuoto = prossimo della serie"}
          >
            <TextInput
              value={codiceManuale}
              onChange={setCodiceManuale}
              placeholder={impostazioni?.prossimo_codice || "automatico"}
            />
          </FieldLabel>
        </div>

        <FieldLabel label="Note interne" hint="Non compaiono sul buono se lasciate vuote">
          <Textarea value={note} onChange={setNote} rows={2} />
        </FieldLabel>
      </div>
    </Modal>
  );
}

// ─────────────────────────────────────────────────────────
// Dettaglio + storico movimenti
// ─────────────────────────────────────────────────────────
function ModaleDettaglio({ gc, alertGiorni, onClose, onAzione, onPdf }) {
  const [nota, setNota] = useState("");
  const ruolo = localStorage.getItem("role");
  const isAdmin = ruolo === "admin" || ruolo === "superadmin";

  return (
    <Modal
      open
      onClose={onClose}
      title={gc.codice}
      subtitle={descrizioneValore(gc)}
      size="md"
      footer={
        <>
          <Btn variant="secondary" onClick={onPdf}>Stampa buono</Btn>
          {gc.stato === "attiva" && (
            <>
              <Btn variant="danger" onClick={() => onAzione(gc.id, "annulla", nota)}>Annulla</Btn>
              {gc.spendibile && (
                <Btn variant="success" onClick={() => onAzione(gc.id, "scarica", nota)}>Scarica</Btn>
              )}
            </>
          )}
          {gc.stato !== "attiva" && isAdmin && (
            <Btn variant="warning" onClick={() => onAzione(gc.id, "riattiva", nota)}>Riattiva</Btn>
          )}
        </>
      }
    >
      <div className="space-y-4">
        <div className="flex gap-2 flex-wrap">
          <ChipStato gc={gc} />
          <ChipScadenza gc={gc} alertGiorni={alertGiorni} />
        </div>

        <dl className="grid grid-cols-2 gap-y-2 text-sm">
          <dt className="text-neutral-500">Intestatario</dt>
          <dd>{nomeIntestatario(gc)}</dd>
          <dt className="text-neutral-500">Emessa il</dt>
          <dd>{fmtData(gc.data_emissione)}{gc.emessa_da ? ` da ${gc.emessa_da}` : ""}</dd>
          <dt className="text-neutral-500">Scadenza</dt>
          <dd>{gc.data_scadenza ? fmtData(gc.data_scadenza) : "senza scadenza"}</dd>
          {gc.data_utilizzo && (
            <>
              <dt className="text-neutral-500">Utilizzata il</dt>
              <dd>{fmtData(gc.data_utilizzo)}{gc.utilizzata_da ? ` da ${gc.utilizzata_da}` : ""}</dd>
            </>
          )}
          {gc.note && (
            <>
              <dt className="text-neutral-500">Note</dt>
              <dd>{gc.note}</dd>
            </>
          )}
        </dl>

        {gc.stato === "attiva" && (
          <FieldLabel label="Nota sull'operazione" hint="Facoltativa, resta nello storico">
            <TextInput value={nota} onChange={setNota} placeholder="es. tavolo 12, sconto applicato a fine cena" />
          </FieldLabel>
        )}

        {gc.movimenti?.length > 0 && (
          <div>
            <div className="text-[10px] uppercase tracking-wider text-neutral-500 mb-1">Storico</div>
            <ul className="text-xs space-y-1">
              {gc.movimenti.map((m) => (
                <li key={m.id} className="flex gap-2 text-neutral-600">
                  <span className="text-neutral-400 whitespace-nowrap">{m.created_at}</span>
                  <span className="font-medium">{m.azione}</span>
                  {m.utente && <span className="text-neutral-400">· {m.utente}</span>}
                  {m.note && <span className="italic">— {m.note}</span>}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </Modal>
  );
}
