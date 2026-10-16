// @version: v1.0 — nascita della sezione Candidati (2026-10-16)
// Modulo: dipendenti (sotto-modulo candidati) — solo admin/superadmin.
// CV ricevuti e selezione del personale: riquadri per stato (filtro), tabella +
// scheda a destra su computer, card con «📞 Chiama» e «→ stato successivo» su
// telefono. «Assumi → Anagrafica» crea il dipendente e copia il CV negli allegati.
// Backend: app/routers/candidati_router.py · doc: docs/modulo_dipendenti.md §5.9
import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { API_BASE, apiFetch } from "../../config/api";
import DipendentiNav from "./DipendentiNav";
import { Btn, EmptyState, StatusBadge, Modal } from "../../components/ui";
import useToast from "../../hooks/useToast";

const BASE = `${API_BASE}/dipendenti/candidati`;
const CV_ACCEPT = "application/pdf,image/*,.heic,.heif";
const CV_MAX_MB = 20;

const STATI = {
  NUOVO:      { label: "Nuovo",      plurale: "Nuovi",      tone: "info",    box: "border-sky-200 bg-sky-50 text-sky-800",             dot: "bg-sky-500" },
  DA_SENTIRE: { label: "Da sentire", plurale: "Da sentire", tone: "warning", box: "border-amber-200 bg-amber-50 text-amber-800",       dot: "bg-amber-500" },
  COLLOQUIO:  { label: "Colloquio",  plurale: "Colloquio",  tone: "violet",  box: "border-violet-200 bg-violet-50 text-violet-800",    dot: "bg-violet-500" },
  IN_PROVA:   { label: "In prova",   plurale: "In prova",   tone: "success", box: "border-emerald-200 bg-emerald-50 text-emerald-800", dot: "bg-emerald-500" },
  ASSUNTO:    { label: "Assunto",    plurale: "Assunti",    tone: "brand" },
  SCARTATO:   { label: "Scartato",   plurale: "Scartati",   tone: "neutral" },
};
const RIQUADRI = ["NUOVO", "DA_SENTIRE", "COLLOQUIO", "IN_PROVA"];

const fmtData = (d) => d ? new Date(d.slice(0, 10) + "T00:00:00").toLocaleDateString("it-IT", { day: "2-digit", month: "short", year: "2-digit" }) : "—";
const fmtDataOra = (d) => {
  if (!d) return null;
  const dt = new Date(d.replace(" ", "T"));
  return isNaN(dt) ? d : dt.toLocaleString("it-IT", { weekday: "short", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
};
const telHref = (t) => {
  const n = (t || "").replace(/[^\d+]/g, "");
  return n.length >= 6 ? `tel:${n}` : null;
};

async function leggiErrore(res) {
  try {
    const j = await res.json();
    if (typeof j.detail === "string") return j.detail;
    if (Array.isArray(j.detail)) return j.detail.map((d) => d.msg).join(", ");
  } catch { /* non JSON */ }
  return `Errore ${res.status}`;
}

const FORM_VUOTO = {
  nome: "", cognome: "", ruolo_cercato: "", reparto_id: "", stato: "NUOVO",
  telefono: "", email: "", disponibilita: "", lingue: "", documenti: "",
  note: "", ricevuto_il: "", colloquio_at: "",
};

function StatoBadge({ stato, size = "md" }) {
  const s = STATI[stato] || STATI.NUOVO;
  return <StatusBadge tone={s.tone} size={size} dot>{s.label}</StatusBadge>;
}

function Vecchio() {
  return <StatusBadge tone="danger" size="sm" title="Fermo da più di 12 mesi: valuta se eliminarlo (privacy)">CV di 12 mesi</StatusBadge>;
}

export default function DipendentiCandidati() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [candidati, setCandidati] = useState([]);
  const [contatori, setContatori] = useState({});
  const [reparti, setReparti] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filtroStato, setFiltroStato] = useState("");
  const [filtroReparto, setFiltroReparto] = useState("");
  const [search, setSearch] = useState("");
  const [scartati, setScartati] = useState(false);
  const [selId, setSelId] = useState(null);
  const [schedaMobile, setSchedaMobile] = useState(false);

  // form
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState(null);
  const [form, setForm] = useState(FORM_VUOTO);
  const [cvFile, setCvFile] = useState(null);
  const [saving, setSaving] = useState(false);
  const fileHeader = useRef(null);
  const fileScheda = useRef(null);

  // cambia stato
  const [statoModal, setStatoModal] = useState(null); // { c, stato, colloquio_at, nota }

  const carica = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (scartati) params.set("scartati", "true");
      const res = await apiFetch(`${BASE}/?${params}`);
      if (!res.ok) { toast(await leggiErrore(res), { kind: "error" }); return; }
      const d = await res.json();
      setCandidati(d.candidati || []);
      setContatori(d.contatori || {});
    } catch (e) {
      toast(e.message, { kind: "error" });
    } finally {
      setLoading(false);
    }
  }, [scartati, toast]);

  useEffect(() => { carica(); }, [carica]);
  useEffect(() => {
    apiFetch(`${API_BASE}/reparti/?include_inactive=false`)
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => setReparti(Array.isArray(d) ? d : []))
      .catch(() => setReparti([]));
  }, []);

  const filtrati = useMemo(() => {
    let rows = candidati;
    if (filtroStato) rows = rows.filter((c) => c.stato === filtroStato);
    if (filtroReparto) rows = rows.filter((c) => String(c.reparto_id || "") === filtroReparto);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      const cifre = q.replace(/\D/g, "");
      rows = rows.filter((c) =>
        [c.nome_completo, c.cognome && `${c.cognome} ${c.nome}`, c.ruolo_cercato, c.email, c.note]
          .some((v) => (v || "").toLowerCase().includes(q)) ||
        (cifre.length >= 4 && (c.telefono || "").replace(/\D/g, "").includes(cifre))
      );
    }
    return rows;
  }, [candidati, filtroStato, filtroReparto, search]);

  const sel = useMemo(() => candidati.find((c) => c.id === selId) || null, [candidati, selId]);
  // su computer la scheda mostra il primo della lista se non si è scelto nulla
  const selDesktop = sel || filtrati[0] || null;

  const aggiornaRiga = (c) => setCandidati((rows) => rows.map((r) => (r.id === c.id ? c : r)));

  // ── form ──────────────────────────────────────────────────────────
  const apriNuovo = (file = null) => {
    setForm(FORM_VUOTO);
    setEditId(null);
    setCvFile(file);
    setShowForm(true);
  };

  const apriModifica = (c) => {
    setForm({
      nome: c.nome || "", cognome: c.cognome || "", ruolo_cercato: c.ruolo_cercato || "",
      reparto_id: c.reparto_id ? String(c.reparto_id) : "", stato: c.stato,
      telefono: c.telefono || "", email: c.email || "", disponibilita: c.disponibilita || "",
      lingue: c.lingue || "", documenti: c.documenti || "", note: c.note || "",
      ricevuto_il: c.ricevuto_il || "", colloquio_at: c.colloquio_at ? c.colloquio_at.replace(" ", "T") : "",
    });
    setEditId(c.id);
    setCvFile(null);
    setShowForm(true);
  };

  const sceltoFileHeader = (e) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    if (f.size > CV_MAX_MB * 1024 * 1024) { toast(`Il CV supera ${CV_MAX_MB} MB`, { kind: "error" }); return; }
    apriNuovo(f);
  };

  const caricaCv = async (id, file) => {
    const fd = new FormData();
    fd.append("file", file);
    const res = await apiFetch(`${BASE}/${id}/cv`, { method: "POST", body: fd });
    if (!res.ok) throw new Error(await leggiErrore(res));
    return res.json();
  };

  const salva = async () => {
    if (!form.nome.trim()) return;
    setSaving(true);
    try {
      const body = { ...form, reparto_id: form.reparto_id ? Number(form.reparto_id) : null };
      if (editId) delete body.stato;
      const res = await apiFetch(editId ? `${BASE}/${editId}` : `${BASE}/`, {
        method: editId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) { toast(await leggiErrore(res), { kind: "error" }); return; }
      let c = await res.json();
      if (cvFile) {
        try { c = await caricaCv(c.id, cvFile); }
        catch (e) { toast(`Candidato salvato, ma il CV no: ${e.message}`, { kind: "error" }); }
      }
      if (!editId && c.doppioni?.length) {
        toast(`Attenzione: c'è già ${c.doppioni.map((d) => d.nome_completo).join(", ")} con gli stessi dati`, { kind: "warn", duration: 5000 });
      } else {
        toast(editId ? "Modifiche salvate" : "Candidato creato", { kind: "success" });
      }
      setShowForm(false);
      setSelId(c.id);
      await carica();
    } catch (e) {
      toast(e.message, { kind: "error" });
    } finally {
      setSaving(false);
    }
  };

  // ── azioni ────────────────────────────────────────────────────────
  const cambiaStato = async (c, stato, extra = {}) => {
    const res = await apiFetch(`${BASE}/${c.id}/stato`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ stato, ...extra }),
    });
    if (!res.ok) { toast(await leggiErrore(res), { kind: "error" }); return false; }
    aggiornaRiga(await res.json());
    toast(`${c.nome_completo}: ${STATI[stato].label.toLowerCase()}`, { kind: "success" });
    carica();
    return true;
  };

  const confermaStato = async () => {
    const { c, stato, colloquio_at, nota } = statoModal;
    const ok = await cambiaStato(c, stato, {
      colloquio_at: stato === "COLLOQUIO" && colloquio_at ? colloquio_at : undefined,
      nota: nota || undefined,
    });
    if (ok) setStatoModal(null);
  };

  const scarta = async (c) => {
    const nota = window.prompt(`Scartare ${c.nome_completo}? Motivo (facoltativo):`, "");
    if (nota === null) return;
    const res = await apiFetch(`${BASE}/${c.id}/scarta`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nota: nota || null }),
    });
    if (!res.ok) { toast(await leggiErrore(res), { kind: "error" }); return; }
    toast(`${c.nome_completo} scartato`, { kind: "success" });
    carica();
  };

  const assumi = async (c) => {
    if (!window.confirm(`Assumere ${c.nome_completo}?\n\nSi crea il dipendente in Anagrafica con i dati già noti${c.ha_cv ? " e il CV finisce tra i suoi documenti" : ""}. Il resto (IBAN, codice fiscale, contratto) si completa dall'anagrafica.`)) return;
    const res = await apiFetch(`${BASE}/${c.id}/assumi`, { method: "POST" });
    if (!res.ok) { toast(await leggiErrore(res), { kind: "error" }); return; }
    const d = await res.json();
    (d.avvisi || []).forEach((a) => toast(a, { kind: "warn", duration: 5000 }));
    toast(`${c.nome_completo} è in anagrafica (${d.dipendente.codice})`, { kind: "success" });
    carica();
  };

  const elimina = async (c) => {
    if (!window.confirm(`Eliminare definitivamente ${c.nome_completo} e il suo CV?\nNon si può annullare.`)) return;
    const res = await apiFetch(`${BASE}/${c.id}`, { method: "DELETE" });
    if (!res.ok) { toast(await leggiErrore(res), { kind: "error" }); return; }
    toast("Candidato eliminato", { kind: "success" });
    setSelId(null);
    setSchedaMobile(false);
    carica();
  };

  const apriCv = async (c) => {
    // la finestra si apre subito (Safari blocca window.open dopo un await)
    const w = window.open("", "_blank");
    try {
      const res = await apiFetch(`${BASE}/${c.id}/cv`);
      if (!res.ok) { w?.close(); toast(await leggiErrore(res), { kind: "error" }); return; }
      const url = URL.createObjectURL(await res.blob());
      if (w) w.location.href = url; else window.location.href = url;
      setTimeout(() => URL.revokeObjectURL(url), 120000);
    } catch (e) {
      w?.close();
      toast(e.message, { kind: "error" });
    }
  };

  const sceltoFileScheda = async (e) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f || !selScheda) return;
    if (f.size > CV_MAX_MB * 1024 * 1024) { toast(`Il CV supera ${CV_MAX_MB} MB`, { kind: "error" }); return; }
    try {
      aggiornaRiga(await caricaCv(selScheda.id, f));
      toast("CV caricato", { kind: "success" });
    } catch (err) {
      toast(err.message, { kind: "error" });
    }
  };

  const selScheda = schedaMobile ? sel : selDesktop;

  // ── scheda (destra su computer, modale su telefono) ───────────────
  const Scheda = ({ c }) => {
    if (!c) return null;
    const tel = telHref(c.telefono);
    const chiuso = c.stato === "ASSUNTO";
    const righe = [
      ["Disponibilità", c.disponibilita],
      ["Lingue", c.lingue],
      ["Documenti", c.documenti],
      ["Colloquio", fmtDataOra(c.colloquio_at)],
      ["Ricevuto", fmtData(c.ricevuto_il)],
      ["Fonte", c.fonte],
    ].filter(([, v]) => v && v !== "—");
    return (
      <div className="space-y-4">
        <div>
          <div className="flex items-start justify-between gap-2">
            <div>
              <div className="text-lg font-bold text-neutral-900">{c.nome_completo}</div>
              <div className="text-sm text-neutral-500">{c.ruolo_cercato || "—"}{c.reparto_nome ? ` · ${c.reparto_nome}` : ""}</div>
            </div>
            <Btn variant="chip" tone="sky" size="sm" onClick={() => apriModifica(c)}>Modifica</Btn>
          </div>
          <div className="flex flex-wrap items-center gap-1.5 mt-2">
            <StatoBadge stato={c.stato} />
            {c.cv_vecchio && <Vecchio />}
            {c.dipendente_id && (
              <button type="button" className="text-xs text-brand-blue underline" onClick={() => navigate("/dipendenti/anagrafica")}>
                in anagrafica →
              </button>
            )}
          </div>
        </div>

        <div className="space-y-1 text-sm">
          {c.telefono && (
            <div className="flex items-center gap-2">
              <span className="text-neutral-400 w-6">📞</span>
              {tel ? <a href={tel} className="text-brand-blue">{c.telefono}</a> : c.telefono}
            </div>
          )}
          {c.email && (
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-neutral-400 w-6">✉️</span>
              <a href={`mailto:${c.email}`} className="text-brand-blue truncate">{c.email}</a>
            </div>
          )}
        </div>

        {righe.length > 0 && (
          <dl className="grid grid-cols-[6.5rem_1fr] gap-x-2 gap-y-1 text-sm">
            {righe.map(([k, v]) => (
              <React.Fragment key={k}>
                <dt className="text-neutral-500">{k}</dt>
                <dd className="text-neutral-800">{v}</dd>
              </React.Fragment>
            ))}
          </dl>
        )}

        {c.note && (
          <div>
            <div className="text-[10px] uppercase text-neutral-500 mb-0.5">Note</div>
            <p className="text-sm text-neutral-700 whitespace-pre-line">{c.note}</p>
          </div>
        )}

        <div className="rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-2 flex items-center gap-2">
          <span>📄</span>
          <span className="text-sm text-neutral-700 truncate flex-1">{c.ha_cv ? c.cv_filename : "Nessun CV"}</span>
          {c.ha_cv && <Btn variant="secondary" size="sm" onClick={() => apriCv(c)}>Apri</Btn>}
          <Btn variant="ghost" size="sm" onClick={() => fileScheda.current?.click()}>{c.ha_cv ? "Sostituisci" : "📎 Carica"}</Btn>
        </div>

        {!chiuso && (
          <div className="flex flex-wrap gap-2">
            {c.stato !== "SCARTATO" && (
              <Btn variant="success" size="md" onClick={() => assumi(c)}>Assumi → Anagrafica</Btn>
            )}
            <Btn variant="secondary" size="md"
              onClick={() => setStatoModal({ c, stato: c.stato_successivo || c.stato, colloquio_at: (c.colloquio_at || "").replace(" ", "T"), nota: "" })}>
              Cambia stato
            </Btn>
            {c.stato !== "SCARTATO" && (
              <Btn variant="chip" tone="red" size="md" onClick={() => scarta(c)}>Scarta</Btn>
            )}
          </div>
        )}
        <div className="pt-2 border-t border-neutral-100">
          <button type="button" className="text-xs text-red-600 hover:underline" onClick={() => elimina(c)}>
            Elimina candidato e CV (privacy)
          </button>
        </div>
      </div>
    );
  };

  const campo = (k, label, props = {}) => (
    <div className={props.wide ? "md:col-span-2" : ""}>
      <label className="text-[10px] text-neutral-500 block mb-0.5">{label}</label>
      <input
        type={props.type || "text"}
        value={form[k]}
        onChange={(e) => setForm({ ...form, [k]: e.target.value })}
        placeholder={props.placeholder}
        inputMode={props.inputMode}
        className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-sm"
      />
      {props.hint && <p className="text-[10px] text-neutral-400 mt-0.5">{props.hint}</p>}
    </div>
  );

  return (
    <div className="min-h-screen bg-brand-cream">
      <DipendentiNav current="candidati" />
      <input ref={fileHeader} type="file" accept={CV_ACCEPT} className="hidden" onChange={sceltoFileHeader} />
      <input ref={fileScheda} type="file" accept={CV_ACCEPT} className="hidden" onChange={sceltoFileScheda} />

      {/* HEADER — pattern standard sotto-modulo */}
      <div className="bg-white border-b border-neutral-200 px-4 py-2.5 flex items-center justify-between gap-2">
        <h1 className="text-lg font-bold text-purple-900 font-playfair whitespace-nowrap">📝 Candidati</h1>
        <div className="flex items-center gap-2">
          <Btn variant="secondary" size="sm" className="whitespace-nowrap" onClick={() => fileHeader.current?.click()}>
            📎 <span className="sm:hidden">CV</span><span className="hidden sm:inline">Carica CV</span>
          </Btn>
          <Btn variant="primary" size="sm" className="whitespace-nowrap" onClick={() => apriNuovo()}>
            + <span className="sm:hidden">Nuovo</span><span className="hidden sm:inline">Nuovo candidato</span>
          </Btn>
        </div>
      </div>

      {/* RIQUADRI PER STATO + FILTRI */}
      <div className="px-4 py-3 bg-white border-b border-neutral-100 space-y-2 md:space-y-0 md:flex md:items-center md:gap-3 md:flex-wrap">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 md:flex md:gap-3">
          {RIQUADRI.map((s) => {
            const st = STATI[s];
            const attivo = filtroStato === s;
            return (
              <button key={s} type="button"
                onClick={() => setFiltroStato(attivo ? "" : s)}
                className={`flex items-center gap-2 px-3 py-2 md:py-1.5 rounded-lg border text-xs font-semibold transition min-h-[44px] md:min-h-0 ${st.box} ${attivo ? "ring-2 ring-sky-400 shadow" : "hover:shadow-sm"}`}>
                <span className={`w-2.5 h-2.5 rounded-full ${st.dot}`} />
                <span>{st.plurale}</span>
                <span className="font-bold ml-auto md:ml-0">{contatori[s] || 0}</span>
              </button>
            );
          })}
        </div>
        {contatori.cv_vecchi > 0 && (
          <span className="inline-block text-[11px] text-red-700">⚠ {contatori.cv_vecchi} con CV di 12 mesi</span>
        )}
        <div className="flex items-center gap-2 flex-wrap md:ml-auto">
          <input type="search" value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="Cerca nome, telefono…" className="border border-neutral-300 rounded-lg px-2 py-1.5 text-sm md:text-xs flex-1 min-w-[10rem] md:w-48 md:flex-none" />
          <select value={filtroReparto} onChange={(e) => setFiltroReparto(e.target.value)}
            className="border border-neutral-300 rounded-lg px-2 py-1.5 text-sm md:text-xs">
            <option value="">Tutti i reparti</option>
            {reparti.map((r) => <option key={r.id} value={r.id}>{r.icona ? `${r.icona} ` : ""}{r.nome}</option>)}
          </select>
          <label className="inline-flex items-center gap-1.5 text-xs text-neutral-600 select-none">
            <input type="checkbox" checked={scartati} onChange={(e) => setScartati(e.target.checked)} />
            Scartati e assunti
          </label>
        </div>
      </div>

      {/* CONTENUTO */}
      <div className="px-4 py-3">
        {loading ? (
          <div className="text-center py-12 text-neutral-400">Caricamento...</div>
        ) : filtrati.length === 0 ? (
          <EmptyState
            icon="📝"
            title={candidati.length === 0 ? "Nessun candidato" : "Nessun risultato"}
            description={candidati.length === 0
              ? "Carica il primo CV o inserisci un candidato a mano."
              : "Prova a cambiare i filtri."}
            compact
          />
        ) : (
          <>
            {/* TELEFONO: card */}
            <div className="md:hidden space-y-2">
              {filtrati.map((c) => {
                const tel = telHref(c.telefono);
                const succ = c.stato_successivo;
                return (
                  <div key={c.id} className="bg-white rounded-xl border border-neutral-200 shadow-sm p-3">
                    <button type="button" className="w-full text-left" onClick={() => { setSelId(c.id); setSchedaMobile(true); }}>
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="font-semibold text-neutral-900 truncate">{c.nome_completo}</div>
                          <div className="text-xs text-neutral-500 truncate">{c.ruolo_cercato || "—"}{c.reparto_nome ? ` · ${c.reparto_nome}` : ""}</div>
                        </div>
                        <StatoBadge stato={c.stato} size="sm" />
                      </div>
                      <div className="flex items-center gap-2 mt-1 text-[11px] text-neutral-500">
                        <span>ricevuto {fmtData(c.ricevuto_il)}</span>
                        {c.colloquio_at && <span>· 🗓 {fmtDataOra(c.colloquio_at)}</span>}
                        {c.cv_vecchio && <Vecchio />}
                      </div>
                    </button>
                    <div className="flex gap-2 mt-2">
                      {tel && <Btn as="a" href={tel} variant="secondary" size="md" className="flex-1 justify-center">📞 Chiama</Btn>}
                      {succ && (
                        <Btn variant="chip" tone="violet" size="md" className="flex-1 justify-center" onClick={() => cambiaStato(c, succ)}>
                          → {STATI[succ].label}
                        </Btn>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* COMPUTER: tabella + scheda */}
            <div className="hidden md:flex gap-4 items-start">
              <div className="flex-1 min-w-0 bg-white rounded-xl border border-neutral-200 overflow-hidden shadow-sm">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-neutral-50 border-b border-neutral-200 text-[10px] text-neutral-600 uppercase">
                      <th className="px-3 py-2 text-left">Candidato</th>
                      <th className="px-3 py-2 text-left">Reparto</th>
                      <th className="px-3 py-2 text-left">Stato</th>
                      <th className="px-3 py-2 text-left">Ricevuto</th>
                      <th className="px-3 py-2 text-left">Note</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtrati.map((c) => {
                      const attivo = selDesktop?.id === c.id;
                      return (
                        <tr key={c.id} onClick={() => setSelId(c.id)}
                          className={`border-b border-neutral-100 cursor-pointer ${attivo ? "bg-purple-50" : "hover:bg-neutral-50"} ${c.stato === "SCARTATO" ? "opacity-60" : ""}`}>
                          <td className="px-3 py-2">
                            <div className="font-medium text-neutral-900">{c.nome_completo}</div>
                            <div className="text-[11px] text-neutral-500">{c.ruolo_cercato || "—"}</div>
                          </td>
                          <td className="px-3 py-2 text-xs text-neutral-600">{c.reparto_nome ? `${c.reparto_icona || ""} ${c.reparto_nome}`.trim() : "—"}</td>
                          <td className="px-3 py-2"><StatoBadge stato={c.stato} size="sm" /></td>
                          <td className="px-3 py-2 text-xs text-neutral-600 whitespace-nowrap">
                            {fmtData(c.ricevuto_il)}
                            {c.cv_vecchio && <div className="mt-0.5"><Vecchio /></div>}
                          </td>
                          <td className="px-3 py-2 text-xs text-neutral-500 max-w-[16rem]">
                            <div className="line-clamp-2">{c.note || c.disponibilita || "—"}</div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <aside className="w-[22rem] shrink-0 bg-white rounded-xl border border-purple-200 shadow-sm p-4 sticky top-4">
                <Scheda c={selDesktop} />
              </aside>
            </div>
          </>
        )}
      </div>

      {/* SCHEDA su telefono */}
      <Modal open={schedaMobile && !!sel} onClose={() => setSchedaMobile(false)} title="Candidato" tone="violet" size="md">
        <Scheda c={sel} />
      </Modal>

      {/* FORM nuovo / modifica */}
      <Modal
        open={showForm}
        onClose={() => setShowForm(false)}
        title={editId ? "Modifica candidato" : "Nuovo candidato"}
        tone="violet"
        size="lg"
        footer={
          <>
            <Btn variant="secondary" size="md" onClick={() => setShowForm(false)}>Annulla</Btn>
            <Btn variant="primary" size="md" onClick={salva} disabled={saving || !form.nome.trim()} loading={saving}>
              {editId ? "Salva modifiche" : "Crea"}
            </Btn>
          </>
        }
      >
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {campo("nome", "Nome *")}
          {campo("cognome", "Cognome")}
          {campo("ruolo_cercato", "Ruolo cercato", { placeholder: "Barista jr · sala" })}
          <div>
            <label className="text-[10px] text-neutral-500 block mb-0.5">Reparto</label>
            <select value={form.reparto_id} onChange={(e) => setForm({ ...form, reparto_id: e.target.value })}
              className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-sm">
              <option value="">—</option>
              {reparti.map((r) => <option key={r.id} value={r.id}>{r.nome}</option>)}
            </select>
          </div>
          {campo("telefono", "Telefono", { type: "tel", inputMode: "tel" })}
          {campo("email", "Email", { type: "email" })}
          {campo("disponibilita", "Disponibilità", { placeholder: "subito, weekend ok, sere" })}
          {campo("lingue", "Lingue", { placeholder: "ita C1, inglese B2" })}
          {campo("documenti", "Documenti", { placeholder: "HACCP ok, permesso ok", hint: "Niente numeri di documento né dati sanitari: sono dati di terzi." })}
          {campo("ricevuto_il", "Ricevuto il", { type: "date", hint: editId ? null : "Oggi se vuoto" })}
          {!editId && (
            <div>
              <label className="text-[10px] text-neutral-500 block mb-0.5">Stato</label>
              <select value={form.stato} onChange={(e) => setForm({ ...form, stato: e.target.value })}
                className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-sm">
                {Object.entries(STATI).filter(([k]) => k !== "ASSUNTO").map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
            </div>
          )}
          {campo("colloquio_at", "Colloquio", { type: "datetime-local" })}
          <div className="md:col-span-2">
            <label className="text-[10px] text-neutral-500 block mb-0.5">Note</label>
            <textarea value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} rows={3}
              className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-sm" />
          </div>
          <div className="md:col-span-2">
            <label className="text-[10px] text-neutral-500 block mb-0.5">CV (PDF o foto, max {CV_MAX_MB} MB)</label>
            <input type="file" accept={CV_ACCEPT} onChange={(e) => setCvFile(e.target.files?.[0] || null)} className="text-sm" />
            {cvFile && <p className="text-xs text-neutral-600 mt-1">📄 {cvFile.name}</p>}
          </div>
        </div>
      </Modal>

      {/* CAMBIA STATO */}
      <Modal
        open={!!statoModal}
        onClose={() => setStatoModal(null)}
        title={statoModal ? `Stato di ${statoModal.c.nome_completo}` : ""}
        tone="violet"
        size="sm"
        footer={
          <>
            <Btn variant="secondary" size="md" onClick={() => setStatoModal(null)}>Annulla</Btn>
            <Btn variant="primary" size="md" onClick={confermaStato}>Salva</Btn>
          </>
        }
      >
        {statoModal && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              {["NUOVO", "DA_SENTIRE", "COLLOQUIO", "IN_PROVA", "SCARTATO"].map((s) => (
                <button key={s} type="button"
                  onClick={() => setStatoModal({ ...statoModal, stato: s })}
                  className={`px-3 py-2 rounded-lg border text-sm min-h-[44px] ${statoModal.stato === s ? "border-violet-400 bg-violet-50 font-semibold" : "border-neutral-200 hover:bg-neutral-50"}`}>
                  {STATI[s].label}
                </button>
              ))}
            </div>
            {statoModal.stato === "COLLOQUIO" && (
              <div>
                <label className="text-[10px] text-neutral-500 block mb-0.5">Data e ora del colloquio</label>
                <input type="datetime-local" value={statoModal.colloquio_at}
                  onChange={(e) => setStatoModal({ ...statoModal, colloquio_at: e.target.value })}
                  className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-sm" />
              </div>
            )}
            <div>
              <label className="text-[10px] text-neutral-500 block mb-0.5">Nota (si aggiunge alle note con la data)</label>
              <input type="text" value={statoModal.nota}
                onChange={(e) => setStatoModal({ ...statoModal, nota: e.target.value })}
                className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-sm" />
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
