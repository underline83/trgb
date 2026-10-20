// Platform — Q nel browser (2026-10-20)
//
// Il connettore MCP (strumento `accesso_browser`) dà a Claude un link
// https://<app>/accesso-q#<segreto>, valido due minuti e una volta sola.
// Questa pagina lo scambia (POST /auth/accesso-q) con una sessione
// dell'identità «Q», superadmin, senza PIN, e va alla Home.
// Il segreto sta nel frammento (#): non arriva a nginx né ai log.
import React, { useEffect, useRef, useState } from "react";
import { API_BASE } from "../config/api";

export default function AccessoQ({ setToken, setRole }) {
  const [errore, setErrore] = useState("");
  const fatto = useRef(false);

  useEffect(() => {
    if (fatto.current) return; // StrictMode: il link vale una volta sola
    fatto.current = true;
    const segreto = (window.location.hash || "").replace(/^#/, "");
    // Il segreto sparisce subito dalla barra e dalla cronologia
    window.history.replaceState(null, "", "/accesso-q");
    if (!segreto) {
      setErrore("Link incompleto");
      return;
    }
    fetch(`${API_BASE}/auth/accesso-q`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: segreto }),
    })
      .then(async (res) => {
        if (!res.ok) throw new Error("Link scaduto o già usato");
        const data = await res.json();
        localStorage.setItem("token", data.access_token);
        localStorage.setItem("role", data.role);
        localStorage.setItem("username", "Q");
        localStorage.setItem("display_name", data.display_name || "Q");
        localStorage.removeItem("pin_len");
        window.history.replaceState(null, "", "/");
        setToken(data.access_token);
        setRole(data.role);
      })
      .catch((e) => setErrore(e.message || "Accesso non riuscito"));
  }, [setToken, setRole]);

  return (
    <div className="min-h-screen bg-brand-cream flex items-center justify-center p-4">
      <div className="bg-white rounded-[14px] shadow-[0_2px_10px_rgba(0,0,0,.06)] p-6 w-full max-w-xs text-center">
        <div className="text-4xl mb-2">🔑</div>
        <h1 className="text-xl font-bold text-brand-ink" style={{ fontFamily: "'Playfair Display', serif" }}>
          Accesso di Q
        </h1>
        {errore ? (
          <>
            <p className="text-sm text-brand-red mt-2">{errore}</p>
            <p className="text-xs text-neutral-500 mt-1">Chiedine uno nuovo dal connettore.</p>
            <a href="/" className="inline-block mt-4 text-sm text-brand-blue underline">Vai al login</a>
          </>
        ) : (
          <p className="text-sm text-neutral-500 mt-2">Entro…</p>
        )}
      </div>
    </div>
  );
}
