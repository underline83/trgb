// @version: v1.0 — Hub Carta delle Bevande (sessione 2026-04-19)
// Mostra 8 card: Vini (hero, span 2) + 7 sezioni statiche (Aperitivi, Birre,
// Amari casa, Amari & Liquori, Distillati, Tisane, Te).
//
// Route: /vini/carta (era ViniCarta, ora è l'hub del sub-modulo Carta Bevande)
// Sostituisce ViniCarta.jsx storico → quello è diventato CartaVini.jsx (/vini/carta/vini).

import React, { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { API_BASE } from "../../config/api";
import ViniNav from "./ViniNav";
import { Btn } from "../../components/ui";
import TrgbLoader from "../../components/TrgbLoader";
import useToast from "../../hooks/useToast";

// Mapping key → icona + colore card (Tailwind pastello, coerente con modulesMenu)
const CARD_STYLE = {
  vini:           { icon: "🍷", color: "bg-amber-50 border-amber-200 text-amber-900",   ring: "hover:shadow-amber-200" },
  aperitivi:      { icon: "🍸", color: "bg-rose-50 border-rose-200 text-rose-900",       ring: "hover:shadow-rose-200" },
  birre:          { icon: "🍺", color: "bg-yellow-50 border-yellow-200 text-yellow-900", ring: "hover:shadow-yellow-200" },
  amari_casa:     { icon: "🌿", color: "bg-emerald-50 border-emerald-200 text-emerald-900", ring: "hover:shadow-emerald-200" },
  amari_liquori:  { icon: "🍷", color: "bg-red-50 border-red-200 text-red-900",          ring: "hover:shadow-red-200" },
  distillati:     { icon: "🥃", color: "bg-orange-50 border-orange-200 text-orange-900", ring: "hover:shadow-orange-200" },
  tisane:         { icon: "🌼", color: "bg-lime-50 border-lime-200 text-lime-900",       ring: "hover:shadow-lime-200" },
  te:             { icon: "🍵", color: "bg-teal-50 border-teal-200 text-teal-900",       ring: "hover:shadow-teal-200" },
};

function formatDate(iso) {
  if (!iso) return "—";
  try {
    const d = new Date(iso.replace(" ", "T"));
    if (isNaN(d.getTime())) return iso;
    return d.toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit", year: "numeric" });
  } catch {
    return iso;
  }
}

export default function CartaBevande() {
  const navigate = useNavigate();
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
      // Backend ritorna array diretto di sezioni
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

  const openSezione = (s) => {
    if (s.key === "vini") {
      navigate("/vini/carta/vini");
    } else {
      navigate(`/vini/carta/sezione/${s.key}`);
    }
  };

  const openAnteprima = () => navigate("/vini/carta/anteprima");

  const downloadPdf = () => {
    window.open(`${API_BASE}/bevande/carta/pdf`, "_blank");
  };
  const downloadPdfStaff = () => {
    window.open(`${API_BASE}/bevande/carta/pdf-staff`, "_blank");
  };
  const downloadWord = () => {
    window.open(`${API_BASE}/bevande/carta/docx`, "_blank");
  };

  // --------------------------------------------------
  // RENDER
  // --------------------------------------------------
  return (
    <div className="min-h-screen bg-brand-cream font-sans">
      <ViniNav current="carta" />
      <div className="max-w-7xl mx-auto p-4 sm:p-6">
        {/* HEADER */}
        <div className="flex flex-col lg:flex-row justify-between gap-4 mb-6">
          <div>
            <h1 className="text-3xl lg:text-4xl font-bold text-amber-900 tracking-wide font-playfair mb-1">
              📜 Carta delle Bevande
            </h1>
            <p className="text-neutral-600 text-sm">
              Gestione delle sezioni della carta: vini, aperitivi, birre, distillati, liquori, tisane.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Btn variant="secondary" size="md" type="button" onClick={() => navigate("/vini")}>
              ← Menu Vini
            </Btn>
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

        {/* CONTENT */}
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <TrgbLoader size={48} label="Caricamento sezioni…" />
          </div>
        ) : sezioni.length === 0 ? (
          <div className="bg-white rounded-2xl p-12 text-center border border-neutral-200">
            <div className="text-5xl mb-3">📭</div>
            <div className="text-neutral-700 font-semibold mb-1">Nessuna sezione configurata</div>
            <div className="text-neutral-500 text-sm">Contatta l'amministratore per inizializzare il DB bevande.</div>
          </div>
        ) : (
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
            {sezioni.map((s) => {
              const style = CARD_STYLE[s.key] || { icon: "📜", color: "bg-neutral-50 border-neutral-200 text-neutral-900", ring: "" };
              const isHero = s.key === "vini";
              const voci = s.voci_totale ?? 0;
              const attive = s.voci_attive ?? 0;

              return (
                <button
                  key={s.key}
                  onClick={() => openSezione(s)}
                  className={`group text-left rounded-2xl border-2 p-4 sm:p-5 transition shadow-sm hover:shadow-xl ${style.color} ${style.ring} ${
                    isHero ? "col-span-2 lg:col-span-2 min-h-[180px]" : "min-h-[150px]"
                  }`}
                  style={{ borderRadius: "14px" }}
                >
                  <div className="flex items-start justify-between mb-2">
                    <div className="text-4xl sm:text-5xl">{style.icon}</div>
                    {!s.attivo && (
                      <span className="text-[10px] uppercase font-bold bg-neutral-200 text-neutral-600 rounded-full px-2 py-0.5">
                        nascosto
                      </span>
                    )}
                  </div>
                  <div className={`font-bold font-playfair tracking-tight mb-1 ${isHero ? "text-2xl sm:text-3xl" : "text-lg sm:text-xl"}`}>
                    {s.nome}
                  </div>
                  <div className="text-xs opacity-80 mb-3 line-clamp-2">
                    {s.key === "vini"
                      ? "Dinamica — si popola dal magazzino. Clicca per anteprima e export dedicato."
                      : `${voci} voci totali · ${attive} attive in carta`}
                  </div>
                  <div className="flex items-center justify-between text-[11px] opacity-70">
                    <span>Ultimo aggiornamento: {formatDate(s.updated_at)}</span>
                    <span className="group-hover:translate-x-0.5 transition">→</span>
                  </div>
                </button>
              );
            })}
          </div>
        )}

        {/* FOOTER INFO */}
        <div className="mt-6 text-xs text-neutral-500 text-center">
          I vini sono gestiti dal modulo Cantina. Le altre sezioni sono editabili qui.
        </div>
      </div>
    </div>
  );
}
