// src/pages/vini/v2/GestioneVino2.jsx
// Modulo: vini (V.6+V.7+V.8 — Modulo "Cantina 2", test parallelo read-only)
//
// Entry point della nuova "Cantina 2" che legge dalle tabelle _v2.
// Strategia: parallelo al modulo Vini classico, read-only durante la fase
// di test (1-3 settimane). Al cutover (Fase 10) il classico sparisce e
// questo prende il suo posto.
//
// Rinomina M2.5-arch (2026-05-16): label "Gestione 2" → "Cantina 2".
// La parola "Gestione" viene liberata per il nuovo tab "Anagrafiche" dedicato
// a produttori/distributori/denominazioni/vitigni/madre. Il file resta come
// GestioneVino2.jsx (path /vini/v2) per non rompere link/routing esistenti.
//
// Sub-nav: Cantina · Per Produttore · Nuovo (3-step preview) · Scheda
// (la scheda si apre cliccando una bottiglia dalla Cantina)

import React, { useEffect, useRef, useState } from "react";
import { Routes, Route, useNavigate, useLocation, useSearchParams, Navigate } from "react-router-dom";
import { API_BASE } from "../../../config/api";
import { Btn } from "../../../components/ui";
import ViniNav from "../ViniNav";
import CantinaV2 from "./CantinaV2";
import PerProduttoreV2 from "./PerProduttoreV2";
import NuovoVinoV2 from "./NuovoVinoV2";
import SchedaVinoV2 from "./SchedaVinoV2";

/**
 * Header globale di Cantina 2 — M2.7-bis (2026-05-16).
 *
 * Riorganizzato come la Cantina classica:
 *   [Brand]  [Bottiglie | Madri | Per Produttore]  | [+ Nuovo] [Carta PDF] [Stampe ▾]  [🔒 RO]
 *
 * - Bottiglie / Madri / Per Produttore = i 3 "modi di vedere" la cantina.
 *   I primi 2 vivono nella stessa pagina (/vini/v2/cantina) e differiscono
 *   solo nello state `vista` che viene passato via URL search param `?vista=`.
 *   "Per Produttore" è un'altra pagina (/vini/v2/produttore).
 * - "+ Nuovo" è un'azione: porta al wizard preview (/vini/v2/nuovo).
 * - Carta PDF / Stampe sono azioni pure (apertura PDF in nuova tab).
 * - Badge READ-ONLY a destra con link a Cantina classica per modifiche.
 */
export default function GestioneVino2() {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();

  // Dropdown "Stampe ▾"
  const [showStampeMenu, setShowStampeMenu] = useState(false);
  const stampeMenuRef = useRef(null);
  useEffect(() => {
    if (!showStampeMenu) return;
    const onClick = (e) => { if (stampeMenuRef.current && !stampeMenuRef.current.contains(e.target)) setShowStampeMenu(false); };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [showStampeMenu]);

  // Quale "modo" è attivo
  const inCantina = location.pathname.startsWith("/vini/v2/cantina")
    || location.pathname.startsWith("/vini/v2/bottiglia/")
    || location.pathname === "/vini/v2"
    || location.pathname === "/vini/v2/";
  const inProduttore = location.pathname.startsWith("/vini/v2/produttore");
  // Vista corrente per il toggle Bottiglie/Madri (default bottiglie)
  const vistaCorrente = searchParams.get("vista") === "madri" ? "madri" : "bottiglie";

  // Cambia vista mantenendo la stessa pagina (e gli altri search params se mai ce ne fossero)
  const setVista = (v) => {
    if (!inCantina) {
      navigate(`/vini/v2/cantina?vista=${v}`);
    } else {
      const params = new URLSearchParams(searchParams);
      params.set("vista", v);
      setSearchParams(params);
    }
  };

  const openStampaWithToken = (path) => {
    const token = localStorage.getItem("token");
    window.open(`${API_BASE}${path}${path.includes("?") ? "&" : "?"}token=${token}`, "_blank");
    setShowStampeMenu(false);
  };

  // Stili "pill" per i 3 modi (Bottiglie/Madri/Per Produttore)
  const pill = (active) =>
    `px-2.5 py-1.5 rounded-lg text-xs font-semibold transition whitespace-nowrap ${
      active ? "bg-amber-700 text-white shadow-sm" : "bg-white text-neutral-700 border border-neutral-300 hover:bg-amber-50"
    }`;

  return (
    <div className="min-h-screen bg-brand-cream font-sans">
      <ViniNav current="v2" />

      <div className="bg-white border-b border-neutral-200 shadow-sm">
        <div className="max-w-[1100px] mx-auto px-3 py-2 flex items-center gap-2 flex-wrap">
          {/* Brand */}
          <h1 className="text-xl font-bold text-amber-900 tracking-wide whitespace-nowrap mr-2">🧪 Cantina 2</h1>

          {/* Modi di vedere la cantina: Bottiglie / Madri / Per Produttore */}
          <div className="flex items-center gap-1">
            <button onClick={() => setVista("bottiglie")} className={pill(inCantina && vistaCorrente === "bottiglie")}>
              🍾 Bottiglie
            </button>
            <button onClick={() => setVista("madri")} className={pill(inCantina && vistaCorrente === "madri")}>
              🍷 Madri
            </button>
            <button onClick={() => navigate("/vini/v2/produttore")} className={pill(inProduttore)}>
              🏛️ Per Produttore
            </button>
          </div>

          {/* Azioni a destra (allineamento "tra" e "stampa" come Cantina classica) */}
          <div className="ml-auto flex items-center gap-2">
            <Btn variant="primary" size="sm" onClick={() => navigate("/vini/v2/nuovo")}>
              + Nuovo
            </Btn>
            <Btn variant="secondary" size="sm" onClick={() => window.open(`${API_BASE}/vini/carta/pdf`, "_blank")}>
              Carta PDF
            </Btn>
            <div className="relative" ref={stampeMenuRef}>
              <button onClick={() => setShowStampeMenu((v) => !v)}
                className="px-3 py-1.5 rounded-lg text-xs font-medium border border-amber-300 bg-amber-50 hover:bg-amber-100 transition">
                Stampe ▾
              </button>
              {showStampeMenu && (
                <div className="flex flex-col absolute right-0 top-full mt-1 bg-white border border-neutral-200 rounded-lg shadow-lg z-30 min-w-[200px]">
                  <button onClick={() => openStampaWithToken("/vini/cantina-tools/inventario/pdf")}
                    className="px-3 py-2 text-xs text-left hover:bg-amber-50 rounded-t-lg transition">Tutti i vini</button>
                  <button onClick={() => openStampaWithToken("/vini/cantina-tools/inventario/giacenza/pdf")}
                    className="px-3 py-2 text-xs text-left hover:bg-amber-50 transition">Solo con giacenza</button>
                  <button onClick={() => openStampaWithToken("/vini/cantina-tools/inventario/locazioni/pdf")}
                    className="px-3 py-2 text-xs text-left hover:bg-amber-50 rounded-b-lg transition">Per locazione</button>
                </div>
              )}
            </div>
{/* S2 cutover 2026-05-18: badge READ-ONLY rimosso (Cantina classica morta, scrittura attiva via wizard). */}
          </div>
        </div>
      </div>

      {/* Contenuto */}
      <Routes>
        <Route index element={<Navigate to="cantina" replace />} />
        <Route path="cantina" element={<CantinaV2 />} />
        <Route path="produttore" element={<PerProduttoreV2 />} />
        <Route path="nuovo" element={<NuovoVinoV2 />} />
        <Route path="bottiglia/:id" element={<SchedaVinoV2 />} />
        <Route path="*" element={<Navigate to="cantina" replace />} />
      </Routes>
    </div>
  );
}
