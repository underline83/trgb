// Platform — Blocco PIN di sezione (2026-10-18)
//
// L'iPad del ristorante resta loggato: chi apre una sezione protetta deve
// ridigitare il PIN dell'utente con cui il dispositivo è loggato.
// Un solo componente attorno a <Routes> (App.jsx): così passare da una
// pagina all'altra DENTRO la sezione non richiede di nuovo il PIN.
//
// Si richiude:
//   - quando si esce dalla sezione (qualsiasi pagina fuori dai prefissi)
//   - dopo `pin_sezione_minuti` minuti senza toccare lo schermo
//     (dipendenti_settings, mig 199; 0 = solo uscendo)
//   - ricaricando la pagina (lo sblocco vive solo in memoria)
//
// Il PIN lo verifica il backend: POST /auth/verifica-pin (stesso blocco
// anti-tentativi del login). Il token resta quello: è un blocco d'uso sul
// dispositivo, i permessi degli endpoint restano quelli di M.G.
import React, { useCallback, useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { API_BASE, apiFetch } from "../config/api";
import PinPad from "./PinPad";

// Sezioni protette. `minutiKey` = dove sta il timeout di inattività.
const SEZIONI_PROTETTE = [
  {
    id: "dipendenti",
    label: "Dipendenti",
    prefissi: ["/dipendenti", "/mie-buste-paga"],
    settingsUrl: "/dipendenti/settings/",
    minutiKey: "pin_sezione_minuti",
  },
];

// Ripiego se il setting non si legge (la mig 199 lo crea a 5).
const MINUTI_RIPIEGO = 5;

function sezioneDi(pathname) {
  return SEZIONI_PROTETTE.find((s) =>
    s.prefissi.some((p) => pathname === p || pathname.startsWith(p + "/"))
  ) || null;
}

export default function SezionePinGate({ children }) {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const sezione = sezioneDi(pathname);

  const [sbloccata, setSbloccata] = useState(null); // id sezione sbloccata
  const [minuti, setMinuti] = useState(MINUTI_RIPIEGO);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const ultimoTocco = useRef(Date.now());

  // Uscendo dalla sezione si richiude
  useEffect(() => {
    if (!sezione || sezione.id !== sbloccata) {
      if (sbloccata) setSbloccata(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sezione?.id]);

  // Minuti di inattività dal setting della sezione
  useEffect(() => {
    if (!sezione) return;
    let vivo = true;
    apiFetch(`${API_BASE}${sezione.settingsUrl}`)
      .then((r) => (r.ok ? r.json() : {}))
      .then((d) => {
        const n = parseInt(d?.[sezione.minutiKey], 10);
        if (vivo && !Number.isNaN(n) && n >= 0) setMinuti(n);
      })
      .catch(() => {});
    return () => { vivo = false; };
  }, [sezione?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Inattività: ogni tocco/tasto rinnova, un controllo ogni 10 s richiude
  useEffect(() => {
    if (!sbloccata || !minuti) return;
    const tocca = () => { ultimoTocco.current = Date.now(); };
    const eventi = ["pointerdown", "keydown", "touchstart", "wheel"];
    eventi.forEach((e) => window.addEventListener(e, tocca, { passive: true }));
    const timer = setInterval(() => {
      if (Date.now() - ultimoTocco.current > minuti * 60000) setSbloccata(null);
    }, 10000);
    return () => {
      eventi.forEach((e) => window.removeEventListener(e, tocca));
      clearInterval(timer);
    };
  }, [sbloccata, minuti]);

  const verifica = useCallback(async (pin) => {
    setLoading(true);
    setError("");
    try {
      const res = await apiFetch(`${API_BASE}/auth/verifica-pin`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin }),
      });
      if (res.ok) {
        ultimoTocco.current = Date.now();
        setSbloccata(sezione?.id || null);
        return true;
      }
      const d = await res.json().catch(() => ({}));
      setError(res.status === 429 ? (d.detail || "Troppi tentativi, riprova più tardi") : "PIN errato");
      return false;
    } catch {
      setError("Connessione non riuscita");
      return false;
    } finally {
      setLoading(false);
    }
  }, [sezione?.id]);

  if (!sezione || sbloccata === sezione.id) return children;

  const role = localStorage.getItem("role") || "";
  const nome = localStorage.getItem("display_name") || localStorage.getItem("username") || "";
  // Lunghezza reale del PIN salvata al login; se manca (sessione aperta prima del
  // 2026-10-19) stima dal ruolo senza invio automatico.
  const pinLenNoto = parseInt(localStorage.getItem("pin_len") || "", 10) || null;
  const lunghezza = pinLenNoto || (["admin", "superadmin", "contabile"].includes(role) ? 6 : 4);

  return (
    <div className="min-h-[calc(100vh-64px)] bg-brand-cream flex items-start sm:items-center justify-center p-4 pt-10">
      <div className="bg-white rounded-[14px] shadow-[0_2px_10px_rgba(0,0,0,.06)] p-6 w-full max-w-xs flex flex-col items-center gap-5">
        <div className="text-center">
          <div className="text-4xl mb-1">🔒</div>
          <h2 className="text-xl font-bold text-brand-ink" style={{ fontFamily: "'Playfair Display', serif" }}>
            {sezione.label}
          </h2>
          <p className="text-sm text-neutral-500 mt-1">
            Sezione protetta: digita il PIN{nome ? <> di <strong>{nome}</strong></> : ""}
          </p>
        </div>
        <PinPad
          key={sezione.id}
          length={lunghezza}
          autoSubmit={!!pinLenNoto}
          onSubmit={verifica}
          loading={loading}
          error={error}
          onInput={() => setError("")}
          onEscape={() => navigate("/")}
        />
        <button onClick={() => navigate("/")} className="text-sm text-neutral-500 hover:text-neutral-700 min-h-[44px]">
          ← Torna alla Home
        </button>
      </div>
    </div>
  );
}
