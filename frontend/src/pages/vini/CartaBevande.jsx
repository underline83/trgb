// @version: v3.0-split-pane — Sessione 58 fase 2 iter 6 (2026-04-25).
// Centro carta unificato: sidebar sezioni a sinistra + editor + iframe live
// della carta INTERA (vini + bevande) sempre visibile a destra.
//
// L'iframe si auto-aggiorna dopo ogni salvataggio nell'editor (no piu'
// pulsante "Aggiorna anteprima" manuale). Header con 5 azioni globali:
// Espandi anteprima · PDF cliente · PDF staff · Word · Vedi come cliente
// (link alla pagina pubblica /carta).
//
// Layout:
//   - Desktop / iPad landscape: 3 colonne [sidebar 200px][editor][iframe]
//   - iPad portrait / mobile: stack verticale (sidebar in cima, poi editor,
//     poi iframe)
//
// Route: /vini/carta/:sezione (default → /vini/carta/vini).

import React, { useEffect, useState, useCallback } from "react";
import { useNavigate, useParams, Navigate } from "react-router-dom";
import { API_BASE } from "../../config/api";
import { openAuthedInNewTab } from "../../utils/authFetch";
import ViniNav from "./ViniNav";
import { Btn } from "../../components/ui";
import TrgbLoader from "../../components/TrgbLoader";
import useToast from "../../hooks/useToast";
import CartaVini from "./CartaVini";
import CartaSezioneEditor from "./CartaSezioneEditor";

// Mapping key → icona + classi attive sidebar
const SEZIONE_STYLE = {
  vini:           { icon: "🍷", active: "bg-amber-100 text-amber-900" },
  aperitivi:      { icon: "🍸", active: "bg-rose-100 text-rose-900" },
  birre:          { icon: "🍺", active: "bg-yellow-100 text-yellow-900" },
  amari_casa:     { icon: "🌿", active: "bg-emerald-100 text-emerald-900" },
  amari_liquori:  { icon: "🍷", active: "bg-red-100 text-red-900" },
  distillati:     { icon: "🥃", active: "bg-orange-100 text-orange-900" },
  tisane:         { icon: "🌼", active: "bg-lime-100 text-lime-900" },
  te:             { icon: "🍵", active: "bg-teal-100 text-teal-900" },
};
const DEFAULT_STYLE = { icon: "📜", active: "bg-neutral-200 text-neutral-800" };

export default function CartaBevande() {
  const navigate = useNavigate();
  const { sezione } = useParams();
  const { toast } = useToast();
  const [sezioni, setSezioni] = useState([]);
  const [loading, setLoading] = useState(true);
  // Chiave dell'iframe — incrementata dopo save → forza reload.
  const [previewKey, setPreviewKey] = useState(0);
  const triggerPreviewRefresh = useCallback(() => {
    setPreviewKey(k => k + 1);
  }, []);

  const token = localStorage.getItem("token");

  const loadSezioni = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(`${API_BASE}/bevande/sezioni/`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const data = await r.json();
      setSezioni(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error("[CartaBevande] loadSezioni:", e);
      toast("Errore nel caricamento sezioni", { kind: "error" });
    } finally {
      setLoading(false);
    }
  }, [token, toast]);

  useEffect(() => {
    loadSezioni();
  }, [loadSezioni]);

  // Default → vini
  if (!sezione) {
    return <Navigate to="/vini/carta/vini" replace />;
  }
  if (!loading && sezioni.length > 0 && !sezioni.find(s => s.key === sezione)) {
    return <Navigate to="/vini/carta/vini" replace />;
  }

  // ── Azioni header ──
  const onExportErr = (err) => toast(`Errore export: ${err.message}`, { kind: "error" });
  const expandAnteprima = () => navigate("/vini/carta/anteprima");
  const downloadPdf = () =>
    openAuthedInNewTab(`${API_BASE}/bevande/carta/pdf`, { onError: onExportErr });
  const downloadPdfStaff = () =>
    openAuthedInNewTab(`${API_BASE}/bevande/carta/pdf-staff`, { onError: onExportErr });
  const downloadWord = () =>
    openAuthedInNewTab(`${API_BASE}/bevande/carta/docx`, { onError: onExportErr });
  // "Vedi come cliente" — apre la pagina pubblica /carta in nuova tab.
  const openComeCliente = () => {
    window.open("/carta", "_blank");
  };

  return (
    <div className="min-h-screen bg-brand-cream font-sans">
      <ViniNav current="carta" />

      <div className="max-w-[1400px] mx-auto px-4 sm:px-6 py-5">

        {/* HEADER PAGINA con 5 azioni globali */}
        <div className="flex flex-col lg:flex-row justify-between gap-3 mb-4">
          <div className="min-w-0">
            <h1 className="text-2xl lg:text-3xl font-bold text-amber-900 tracking-wide font-playfair flex items-center gap-2">
              <span>📜</span>
              <span>Centro Carta</span>
            </h1>
            <p className="text-neutral-600 text-sm mt-1">
              Editor + anteprima live · l'anteprima si aggiorna automaticamente dopo ogni modifica.
            </p>
          </div>

          <div className="flex flex-wrap gap-2 items-start">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-600"></span>
              live
            </span>
            <Btn variant="secondary" size="md" type="button" onClick={expandAnteprima}>
              ⤢ Espandi anteprima
            </Btn>
            <Btn variant="secondary" size="md" type="button" onClick={downloadPdf}>
              📄 PDF cliente
            </Btn>
            <Btn variant="secondary" size="md" type="button" onClick={downloadPdfStaff}>
              📄 PDF staff
            </Btn>
            <Btn variant="secondary" size="md" type="button" onClick={downloadWord}>
              📝 Word
            </Btn>
            <Btn variant="primary" size="md" type="button" onClick={openComeCliente}>
              ↗ Vedi come cliente
            </Btn>
          </div>
        </div>

        {/* LAYOUT */}
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <TrgbLoader size={48} label="Caricamento sezioni…" />
          </div>
        ) : sezioni.length === 0 ? (
          <div className="bg-white rounded-2xl p-12 text-center border border-neutral-200">
            <div className="text-5xl mb-3">📭</div>
            <div className="text-neutral-700 font-semibold mb-1">Nessuna sezione configurata</div>
            <div className="text-neutral-500 text-sm">Contatta l'amministratore per inizializzare il DB bevande.</div>
          </div>
        ) : (
          <div className="grid grid-cols-1 xl:grid-cols-[200px_minmax(0,1fr)_minmax(0,1fr)] gap-5">

            {/* SIDEBAR */}
            <div className="xl:sticky xl:top-4 xl:self-start">
              <h2 className="text-xs font-bold text-neutral-400 uppercase tracking-wider mb-3 px-3">
                Sezioni
              </h2>
              <nav className="space-y-0.5">
                {sezioni.map((s) => {
                  const style = SEZIONE_STYLE[s.key] || DEFAULT_STYLE;
                  const active = s.key === sezione;
                  const voci = s.voci_totale ?? 0;
                  const attive = s.voci_attive ?? 0;
                  return (
                    <button
                      key={s.key}
                      type="button"
                      onClick={() => navigate(`/vini/carta/${s.key}`)}
                      className={`w-full text-left px-3 py-2.5 rounded-lg flex items-start gap-2.5 min-h-[44px] transition ${
                        active
                          ? `${style.active} shadow-sm`
                          : "text-neutral-600 hover:bg-neutral-100"
                      }`}
                    >
                      <span className="text-base mt-0.5">{style.icon}</span>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium flex items-center gap-2">
                          <span>{s.nome}</span>
                          {!s.attivo && (
                            <span className="text-[9px] uppercase font-bold bg-neutral-200 text-neutral-600 rounded-full px-1.5 py-0.5">
                              off
                            </span>
                          )}
                        </div>
                        <div className={`text-[11px] mt-0.5 leading-tight ${
                          active ? "opacity-80" : "text-neutral-400"
                        }`}>
                          {s.key === "vini"
                            ? "dinamica · da Cantina"
                            : `${voci} voci · ${attive} attive`}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </nav>
            </div>

            {/* EDITOR PANE */}
            <div className="min-w-0">
              <main className="bg-white border border-neutral-200 rounded-2xl p-5 shadow-sm min-h-[500px]">
                {sezione === "vini"
                  ? <CartaVini key="vini" />
                  : <CartaSezioneEditor key={sezione} sezioneKey={sezione} onSaved={triggerPreviewRefresh} />
                }
              </main>
            </div>

            {/* PREVIEW PANE — iframe live carta intera */}
            <div className="min-w-0">
              <div className="bg-white border border-neutral-200 rounded-2xl shadow-sm overflow-hidden xl:sticky xl:top-4">
                <div className="px-4 py-2.5 bg-neutral-50 border-b border-neutral-200 flex items-center justify-between">
                  <div>
                    <div className="text-xs font-semibold text-neutral-700">Anteprima · carta completa</div>
                    <div className="text-[10px] text-neutral-500 italic">vini + bevande, aggiornata live</div>
                  </div>
                  <code className="text-[9px] text-neutral-400 font-mono">/bevande/carta</code>
                </div>
                <iframe
                  key={previewKey}
                  src={`${API_BASE}/bevande/carta`}
                  title="Anteprima Carta delle Bevande"
                  className="w-full"
                  style={{ height: "78vh", border: "none", background: "#ffffff" }}
                />
              </div>
            </div>

          </div>
        )}
      </div>
    </div>
  );
}
