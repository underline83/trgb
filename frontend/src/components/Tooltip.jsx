// FILE: frontend/src/components/Tooltip.jsx
// @version: v1.0 — B.2 piano responsive Mac+iPad
//
// Wrapper sostitutivo per `title=` nativo HTML.
// Su desktop: hover con delay → popup. Comportamento storico.
// Su touch (iPad/iPhone): primo tap mostra il tooltip MA blocca il click del
// child (via onClickCapture in fase capture con preventDefault+stopPropagation).
// Secondo tap sullo stesso child esegue l'azione normalmente (firstTouch reset).
// Tap fuori o timeout 2.5s → chiude.
//
// Uso tipico:
//   <Tooltip label="Cambia PIN">
//     <button onClick={...}>🔑</button>
//   </Tooltip>
//
// Se `label` è falsy, il componente non fa nulla e ritorna direttamente children.

import React, { useState, useEffect, useRef, useCallback } from "react";

export default function Tooltip({
  label,
  children,
  placement = "top",
  delay = 400,
  className = "",
}) {
  const [open, setOpen] = useState(false);
  const [isTouch, setIsTouch] = useState(false);
  const wrapperRef = useRef(null);
  const hoverTimer = useRef(null);
  const autoCloseTimer = useRef(null);
  const firstTouchShown = useRef(false);

  // Detect touch device (matchMedia)
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia("(hover: none) and (pointer: coarse)");
    const update = () => setIsTouch(mq.matches);
    update();
    if (mq.addEventListener) mq.addEventListener("change", update);
    else if (mq.addListener) mq.addListener(update);
    return () => {
      if (mq.removeEventListener) mq.removeEventListener("change", update);
      else if (mq.removeListener) mq.removeListener(update);
    };
  }, []);

  // Click/touch outside → chiude e resetta firstTouchShown
  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target)) {
        setOpen(false);
        firstTouchShown.current = false;
      }
    };
    document.addEventListener("mousedown", handler);
    document.addEventListener("touchstart", handler);
    return () => {
      document.removeEventListener("mousedown", handler);
      document.removeEventListener("touchstart", handler);
    };
  }, [open]);

  // Auto-close dopo 2.5s su touch (su desktop è l'hover a gestire)
  useEffect(() => {
    clearTimeout(autoCloseTimer.current);
    if (!open || !isTouch) return;
    autoCloseTimer.current = setTimeout(() => {
      setOpen(false);
      firstTouchShown.current = false;
    }, 2500);
    return () => clearTimeout(autoCloseTimer.current);
  }, [open, isTouch]);

  // Cleanup timer al unmount
  useEffect(() => {
    return () => {
      clearTimeout(hoverTimer.current);
      clearTimeout(autoCloseTimer.current);
    };
  }, []);

  const handleMouseEnter = useCallback(() => {
    if (isTouch) return;
    clearTimeout(hoverTimer.current);
    hoverTimer.current = setTimeout(() => setOpen(true), delay);
  }, [isTouch, delay]);

  const handleMouseLeave = useCallback(() => {
    if (isTouch) return;
    clearTimeout(hoverTimer.current);
    setOpen(false);
  }, [isTouch]);

  // Su touch: primo click sul wrapper viene intercettato in fase capture,
  // il popup si apre, il click NON raggiunge il child (bottone non esegue action).
  // Al secondo click (firstTouchShown = true) lasciamo passare normalmente.
  const handleClickCapture = useCallback(
    (e) => {
      if (!isTouch) return;
      if (!firstTouchShown.current) {
        e.preventDefault();
        e.stopPropagation();
        setOpen(true);
        firstTouchShown.current = true;
      }
      // Se firstTouchShown è già true: lasciamo passare. Il click arriva al child
      // e l'action si esegue. Resettiamo lo stato per il prossimo ciclo.
      else {
        setOpen(false);
        firstTouchShown.current = false;
      }
    },
    [isTouch]
  );

  if (!label) return children;

  const placementClass =
    placement === "bottom"
      ? "top-full mt-1.5 left-1/2 -translate-x-1/2"
      : placement === "left"
      ? "right-full mr-1.5 top-1/2 -translate-y-1/2"
      : placement === "right"
      ? "left-full ml-1.5 top-1/2 -translate-y-1/2"
      : "bottom-full mb-1.5 left-1/2 -translate-x-1/2"; // default top

  return (
    <span
      ref={wrapperRef}
      className={`relative inline-flex ${className}`}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onClickCapture={handleClickCapture}
    >
      {children}
      {open && (
        <span
          role="tooltip"
          className={`absolute z-[200] px-2 py-1 rounded-md bg-neutral-800 text-white text-xs font-medium whitespace-nowrap pointer-events-none shadow-lg ${placementClass}`}
        >
          {label}
        </span>
      )}
    </span>
  );
}
