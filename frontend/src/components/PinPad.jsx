// Platform — PIN pad condiviso (2026-10-18)
// Estratto da LoginForm per riusarlo nel blocco PIN di sezione (SezionePinGate).
// Gestisce: pallini, tastierino 3x4 (ok / 0 / canc), tastiera fisica,
// invio automatico a `length` cifre, scossa e azzeramento se il PIN è errato.
//
// Props:
//   length    cifre attese (4 o 6) — invio automatico quando raggiunte
//   autoSubmit default true; false = lunghezza solo stimata: niente invio
//             automatico, si conferma col tasto verde (4-6 cifre)
//   onSubmit  async (pin) => boolean   true = accettato, false = errato
//   loading   disabilita i tasti
//   error     messaggio sotto i pallini
//   onEscape  facoltativo, tasto Esc
//   onInput   facoltativo, chiamato a ogni cifra (per pulire l'errore)
import React, { useCallback, useEffect, useState } from "react";

export default function PinPad({ length = 4, autoSubmit = true, onSubmit, loading = false, error = "", onEscape, onInput }) {
  const [pin, setPin] = useState("");
  const [shake, setShake] = useState(false);

  const submit = useCallback(async (p) => {
    if (p.length < 4 || loading) return;
    const ok = await onSubmit(p);
    if (!ok) {
      setPin("");
      setShake(true);
      setTimeout(() => setShake(false), 500);
    }
  }, [onSubmit, loading]);

  const addDigit = useCallback((digit) => {
    if (onInput) onInput();
    setPin((prev) => {
      if (prev.length >= 6) return prev;
      const next = prev + digit;
      if (autoSubmit && next.length === length) setTimeout(() => submit(next), 100);
      return next;
    });
  }, [length, autoSubmit, submit, onInput]);

  const backspace = useCallback(() => {
    if (onInput) onInput();
    setPin((prev) => prev.slice(0, -1));
  }, [onInput]);

  useEffect(() => {
    const handler = (e) => {
      if (e.key >= "0" && e.key <= "9") addDigit(e.key);
      else if (e.key === "Enter") submit(pin);
      else if (e.key === "Backspace") backspace();
      else if (e.key === "Escape" && onEscape) { setPin(""); onEscape(); }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [addDigit, backspace, submit, pin, onEscape]);

  // Senza invio automatico il PIN puo' superare `length` (max 6): i pallini crescono.
  const nDots = autoSubmit ? length : Math.max(length, pin.length);
  const dots = Array.from({ length: nDots }, (_, i) => (
    <div
      key={i}
      className={`
        w-4 h-4 rounded-full transition-all duration-150
        ${i < pin.length ? "bg-slate-800 scale-110" : "bg-slate-300"}
      `}
    />
  ));

  const padButtons = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "ok", "0", "del"];

  return (
    <div className={`flex flex-col items-center gap-6 w-full ${shake ? "animate-shake" : ""}`}>
      <div className="flex gap-3">{dots}</div>

      {error && <p className="text-red-500 text-sm">{error}</p>}

      <div className="grid grid-cols-3 gap-3 w-full">
        {padButtons.map((btn, idx) => {
          if (btn === "ok") {
            return (
              <button
                key={idx}
                onClick={() => submit(pin)}
                disabled={loading || pin.length < 4}
                className="h-14 rounded-xl bg-emerald-500 hover:bg-emerald-600 active:bg-emerald-700
                           disabled:opacity-40 disabled:cursor-not-allowed
                           flex items-center justify-center transition-colors"
                aria-label="Conferma PIN"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                </svg>
              </button>
            );
          }
          if (btn === "del") {
            return (
              <button
                key={idx}
                onClick={backspace}
                disabled={loading}
                className="h-14 rounded-xl bg-slate-100 hover:bg-slate-200 active:bg-slate-300
                           flex items-center justify-center transition-colors"
                aria-label="Cancella"
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
              onClick={() => addDigit(btn)}
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
