import React, { useState, useEffect, useCallback } from "react";

const API_BASE = import.meta.env.VITE_API_BASE_URL;

/* ── Colori ruolo per bordo tile ── */
const ROLE_COLORS = {
  superadmin: "border-amber-500",
  admin:      "border-amber-500",
  contabile:  "border-cyan-500",
  sommelier:  "border-purple-500",
  sala:       "border-rose-500",
  chef:       "border-emerald-500",
  viewer:     "border-slate-400",
};
const ROLE_BG = {
  superadmin: "bg-amber-50",
  admin:      "bg-amber-50",
  contabile:  "bg-cyan-50",
  sommelier:  "bg-purple-50",
  sala:       "bg-rose-50",
  chef:       "bg-emerald-50",
  viewer:     "bg-slate-50",
};
const ROLE_LABELS = {
  superadmin: "Admin",
  admin:      "Admin",
  contabile:  "Contabile",
  sommelier:  "Sommelier",
  sala:       "Sala",
  chef:       "Chef",
  viewer:     "Viewer",
};

/* ── Iniziali per avatar ── */
function getInitials(name) {
  return name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

/* ────────────────────────────────────────────── */
export default function LoginForm({ setToken, setRole }) {
  const [users, setUsers]             = useState([]);
  const [selectedUser, setSelectedUser] = useState(null);
  const [pin, setPin]                 = useState("");
  const [error, setError]             = useState("");
  const [loading, setLoading]         = useState(false);
  const [shake, setShake]             = useState(false);

  /* Carica tile utenti */
  useEffect(() => {
    fetch(`${API_BASE}/auth/tiles`)
      .then((r) => r.json())
      .then(setUsers)
      .catch(() => {});
  }, []);

  /* ── Invio PIN ── */
  const submitPin = useCallback(
    async (currentPin) => {
      if (!selectedUser || currentPin.length < 4) return;
      setLoading(true);
      setError("");
      try {
        const res = await fetch(`${API_BASE}/auth/login`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username: selectedUser.username, password: currentPin }),
        });
        if (!res.ok) throw new Error("PIN errato");
        const data = await res.json();
        localStorage.setItem("token", data.access_token);
        localStorage.setItem("role", data.role);
        localStorage.setItem("username", selectedUser.username);
        localStorage.setItem("display_name", data.display_name || selectedUser.display_name);
        setToken(data.access_token);
        setRole(data.role);
      } catch {
        setError("PIN errato");
        setPin("");
        setShake(true);
        setTimeout(() => setShake(false), 500);
      } finally {
        setLoading(false);
      }
    },
    [selectedUser, setToken, setRole]
  );

  /* ── Gestione tastiera fisica ── */
  useEffect(() => {
    if (!selectedUser) return;
    const handler = (e) => {
      if (e.key >= "0" && e.key <= "9") {
        setPin((prev) => {
          const next = prev + e.key;
          if (next.length >= 4) {
            setTimeout(() => submitPin(next), 100);
          }
          return next.length <= 6 ? next : prev;
        });
      } else if (e.key === "Backspace") {
        setPin((prev) => prev.slice(0, -1));
      } else if (e.key === "Escape") {
        setSelectedUser(null);
        setPin("");
        setError("");
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [selectedUser, submitPin]);

  /* ── Tap su numero del PIN pad ── */
  const handleDigit = (digit) => {
    setError("");
    setPin((prev) => {
      const next = prev + digit;
      if (next.length >= 4) {
        setTimeout(() => submitPin(next), 100);
      }
      return next.length <= 6 ? next : prev;
    });
  };

  const handleBackspace = () => {
    setPin((prev) => prev.slice(0, -1));
    setError("");
  };

  /* ══════════════════════════════════════════════
     RENDER: SELEZIONE UTENTE (tile)
     ══════════════════════════════════════════════ */
  if (!selectedUser) {
    return (
      <div className="flex flex-col items-center gap-8 w-full max-w-md">
        {/* Logo / Titolo */}
        <div className="text-center">
          <h1 className="text-2xl font-bold text-slate-800">Tre Gobbi</h1>
          <p className="text-slate-500 text-sm mt-1">Seleziona il tuo profilo</p>
        </div>

        {/* Tile utenti */}
        <div className="flex gap-4 justify-center flex-wrap">
          {users.map((u) => (
            <button
              key={u.username}
              onClick={() => { setSelectedUser(u); setPin(""); setError(""); }}
              className={`
                flex flex-col items-center gap-3 p-6 rounded-2xl border-2
                ${ROLE_COLORS[u.role] || "border-slate-300"}
                ${ROLE_BG[u.role] || "bg-white"}
                hover:shadow-lg hover:scale-105
                transition-all duration-200 cursor-pointer
                w-32
              `}
            >
              {/* Avatar cerchio con iniziali */}
              <div className={`
                w-16 h-16 rounded-full flex items-center justify-center
                text-white text-xl font-bold
                ${u.role === "admin" || u.role === "superadmin" ? "bg-amber-500" :
                  u.role === "contabile" ? "bg-cyan-500" :
                  u.role === "sommelier" ? "bg-purple-500" :
                  u.role === "sala" ? "bg-rose-500" :
                  u.role === "chef" ? "bg-emerald-500" : "bg-slate-400"}
              `}>
                {getInitials(u.display_name)}
              </div>
              <span className="font-semibold text-slate-800">{u.display_name}</span>
              <span className="text-xs text-slate-500">{ROLE_LABELS[u.role] || u.role}</span>
            </button>
          ))}
        </div>
      </div>
    );
  }

  /* ══════════════════════════════════════════════
     RENDER: PIN PAD
     ══════════════════════════════════════════════ */
  const dots = Array.from({ length: 4 }, (_, i) => (
    <div
      key={i}
      className={`
        w-4 h-4 rounded-full transition-all duration-150
        ${i < pin.length ? "bg-slate-800 scale-110" : "bg-slate-300"}
      `}
    />
  ));

  const padButtons = [
    ["1", "2", "3"],
    ["4", "5", "6"],
    ["7", "8", "9"],
    ["", "0", "del"],
  ];

  return (
    <div className={`flex flex-col items-center gap-6 w-full max-w-xs ${shake ? "animate-shake" : ""}`}>
      {/* Header utente selezionato */}
      <button
        onClick={() => { setSelectedUser(null); setPin(""); setError(""); }}
        className="flex items-center gap-2 text-slate-500 hover:text-slate-700 text-sm self-start"
      >
        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
        Indietro
      </button>

      <div className="flex flex-col items-center gap-2">
        <div className={`
          w-20 h-20 rounded-full flex items-center justify-center
          text-white text-2xl font-bold
          ${selectedUser.role === "admin" || selectedUser.role === "superadmin" ? "bg-amber-500" :
            selectedUser.role === "contabile" ? "bg-cyan-500" :
            selectedUser.role === "sommelier" ? "bg-purple-500" :
            selectedUser.role === "sala" ? "bg-rose-500" :
            selectedUser.role === "chef" ? "bg-emerald-500" : "bg-slate-400"}
        `}>
          {getInitials(selectedUser.display_name)}
        </div>
        <h2 className="text-xl font-bold text-slate-800">{selectedUser.display_name}</h2>
        <p className="text-slate-500 text-sm">Inserisci il PIN</p>
      </div>

      {/* Dot indicators */}
      <div className="flex gap-3">{dots}</div>

      {/* Errore */}
      {error && <p className="text-red-500 text-sm">{error}</p>}

      {/* PIN Pad */}
      <div className="grid grid-cols-3 gap-3 w-full">
        {padButtons.flat().map((btn, idx) => {
          if (btn === "") return <div key={idx} />;
          if (btn === "del") {
            return (
              <button
                key={idx}
                onClick={handleBackspace}
                disabled={loading}
                className="h-14 rounded-xl bg-slate-100 hover:bg-slate-200 active:bg-slate-300
                           flex items-center justify-center transition-colors"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M12 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2M3 12l6.414-6.414a2 2 0 011.414-.586H19a2 2 0 012 2v10a2 2 0 01-2 2h-8.172a2 2 0 01-1.414-.586L3 12z" />
                </svg>
              </button>
            );
          }
          return (
            <button
              key={idx}
              onClick={() => handleDigit(btn)}
              disabled={loading}
              className="h-14 rounded-xl bg-white border border-slate-200
                         hover:bg-slate-50 active:bg-slate-100
                         text-xl font-semibold text-slate-800
                         transition-colors shadow-sm"
            >
              {btn}
            </button>
          );
        })}
      </div>
    </div>
  );
}
