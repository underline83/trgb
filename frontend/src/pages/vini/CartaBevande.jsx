// @version: v2.0-shell — Shell unica con sidebar per le 8 sezioni della Carta delle Bevande
// Layout sidebar a sinistra + pannello a destra (stesso pattern di SelezioniDelGiorno
// e ViniImpostazioni). La sezione attiva e' presa da useParams(":sezione").
//
// Route: /vini/carta/:sezione (default redirect a /vini/carta/vini)
// Pannelli: CartaVini per "vini", CartaSezioneEditor per le altre 7 (aperitivi,
// birre, amari_casa, amari_liquori, distillati, tisane, te).
//
// La sezione "Anteprima globale" resta una pagina a sé (/vini/carta/anteprima),
// raggiungibile dal Btn in header.

import React, { useEffect, useState, useCallback } from "react";
import { useNavigate, useParams, Navigate } from "react-router-dom";
import { API_BASE } from "../../config/api";
import ViniNav from "./ViniNav";
import { Btn } from "../../components/ui";
import TrgbLoader from "../../components/TrgbLoader";
import useToast from "../../hooks/useToast";
import CartaVini from "./CartaVini";
import CartaSezioneEditor from "./CartaSezioneEditor";

// Mapping key → icona + classi attive sidebar (Tailwind, coerente con CARD_STYLE storico)
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

  // --- Routing: niente sezione → vai a "vini" (prima sezione di default)
  if (!sezione) {
    return <Navigate to="/vini/carta/vini" replace />;
  }

  // --- Una volta caricate, se la sezione URL non esiste tra quelle DB → fallback a vini
  if (!loading && sezioni.length > 0 && !sezioni.find(s => s.key === sezione)) {
    return <Navigate to="/vini/carta/vini" replace />;
  }

  const openAnteprima = () => navigate("/vini/carta/anteprima");
  const downloadPdf = () => window.open(`${API_BASE}/bevande/carta/pdf`, "_blank");
  const downloadPdfStaff = () => window.open(`${API_BASE}/bevande/carta/pdf-staff`, "_blank");
  const downloadWord = () => window.open(`${API_BASE}/bevande/carta/docx`, "_blank");

  return (
    <div className="min-h-screen bg-brand-cream font-sans">
      <ViniNav current="carta" />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6">

        {/* HEADER PAGINA */}
        <div className="flex flex-col lg:flex-row justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl lg:text-3xl font-bold text-amber-900 tracking-wide font-playfair flex items-center gap-2">
              <span>📜</span>
              <span>Carta delle Bevande</span>
            </h1>
            <p className="text-neutral-600 text-sm mt-1">
              Gestione delle sezioni della carta: vini, aperitivi, birre, distillati, liquori, tisane.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Btn variant="primary" size="md" type="button" onClick={openAnteprima}>
              👁 Anteprima
            </Btn>
            <Btn variant="secondary" size="md" type="button" onClick={downloadPdf}>
              📄 PDF
            </Btn>
            <Btn variant="secondary" size="md" type="button" onClick={downloadPdfStaff}>
              📄 PDF Staff
            </Btn>
            <Btn variant="secondary" size="md" type="button" onClick={downloadWord}>
              📝 Word
            </Btn>
          </div>
        </div>

        {/* LAYOUT SIDEBAR + CONTENT */}
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <TrgbLoader size={48} label="Caricamento sezioni…" />
          </div>
        ) : sezioni.length === 0 ? (
          <div className="bg-white rounded-2xl p-12 text-center border border-neutral-200">
            <div className="text-5xl mb-3">📭</div>
            <div className="text-neutral-700 font-semibold mb-1">Nessuna sezione configurata</div>
            <div className="text-neutral-500 text-sm">
              Contatta l'amministratore per inizializzare il DB bevande.
            </div>
          </div>
        ) : (
          <div className="flex gap-6">

            {/* SIDEBAR */}
            <div className="w-56 flex-shrink-0">
              <h2 className="text-xs font-bold text-neutral-400 uppercase tracking-wider mb-3 px-3">
                Sezioni
              </h2>
              <nav className="space-y-0.5">
                {sezioni.map(s => {
                  const style = SEZIONE_STYLE[s.key] || DEFAULT_STYLE;
                  const active = s.key === sezione;
                  const voci = s.voci_totale ?? 0;
                  const attive = s.voci_attive ?? 0;
                  return (
                    <button
                      key={s.key}
                      onClick={() => navigate(`/vini/carta/${s.key}`)}
                      className={`w-full text-left px-3 py-2.5 rounded-lg transition flex items-start gap-2.5 min-h-[44px] ${
                        active
                          ? `${style.active} shadow-sm`
                          : "text-neutral-600 hover:bg-neutral-100 hover:text-neutral-800"
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

            {/* CONTENT */}
            <div className="flex-1 min-w-0">
              <main className="bg-white border border-neutral-200 rounded-2xl p-6 shadow-sm min-h-[500px]">
                {sezione === "vini"
                  ? <CartaVini key="vini" />
                  : <CartaSezioneEditor key={sezione} sezioneKey={sezione} />
                }
              </main>
            </div>

          </div>
        )}
      </div>
    </div>
  );
}
