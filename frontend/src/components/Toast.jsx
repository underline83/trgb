// Toast globale TRGB (sessione 44 — P4)
// Provider + componente visuale. Rendering top-center stack verticale max 3.
// Uso: avvolgere <App/> con <ToastProvider>; consumare con useToast() hook.

import React, { createContext, useCallback, useEffect, useRef, useState } from "react";

// Context esportato — l'hook lo importa da qui
export const ToastContext = createContext(null);

const DEFAULT_DURATION = 1800;
const MAX_STACK = 3;

// Kind → classi visive
const KIND_CLS = {
  info:    "bg-brand-ink text-white",
  success: "bg-brand-green text-white",
  error:   "bg-brand-red text-white",
  warn:    "bg-amber-500 text-white",
};

let _id = 0;
function nextId() { return ++_id; }

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const timeoutsRef = useRef(new Map());

  const remove = useCallback((id) => {
    setToasts(prev => prev.filter(t => t.id !== id));
    const tm = timeoutsRef.current.get(id);
    if (tm) { clearTimeout(tm); timeoutsRef.current.delete(id); }
  }, []);

  const toast = useCallback((msg, opts = {}) => {
    const id = nextId();
    const kind = opts.kind || "info";
    const duration = opts.duration ?? DEFAULT_DURATION;
    setToasts(prev => {
      // Coda FIFO: mantieni al massimo MAX_STACK toast — scarta i piu' vecchi
      const next = [...prev, { id, msg, kind }];
      return next.length > MAX_STACK ? next.slice(next.length - MAX_STACK) : next;
    });
    const tm = setTimeout(() => remove(id), duration);
    timeoutsRef.current.set(id, tm);
    return id;
  }, [remove]);

  // Cleanup sui timeout all'unmount
  useEffect(() => {
    const timeouts = timeoutsRef.current;
    return () => {
      timeouts.forEach(tm => clearTimeout(tm));
      timeouts.clear();
    };
  }, []);

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <ToastLayer toasts={toasts} onDismiss={remove} />
    </ToastContext.Provider>
  );
}

function ToastLayer({ toasts, onDismiss }) {
  if (toasts.length === 0) return null;
  return (
    <div
      className="fixed left-1/2 -translate-x-1/2 z-[200] flex flex-col items-center gap-2 pointer-events-none"
      style={{ top: "max(20px, env(safe-area-inset-top))" }}
      role="status"
      aria-live="polite"
    >
      {toasts.map(t => (
        <ToastItem key={t.id} toast={t} onDismiss={() => onDismiss(t.id)} />
      ))}
    </div>
  );
}

function ToastItem({ toast, onDismiss }) {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    // Trigger fade-in dopo mount
    const r = requestAnimationFrame(() => setVisible(true));
    return () => cancelAnimationFrame(r);
  }, []);
  const kindCls = KIND_CLS[toast.kind] || KIND_CLS.info;
  return (
    <button
      type="button"
      onClick={onDismiss}
      className={
        "pointer-events-auto px-4 py-2.5 rounded-xl font-semibold text-sm shadow-lg " +
        "transition-all duration-200 " +
        (visible ? "opacity-100 translate-y-0" : "opacity-0 -translate-y-2") +
        " " + kindCls
      }
      style={{ maxWidth: "92vw", boxShadow: "0 10px 24px rgba(0,0,0,.2)" }}
      aria-label="Tocca per chiudere"
    >
      {toast.msg}
    </button>
  );
}
