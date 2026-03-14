// src/pages/vini/LocationPicker.jsx
// @version: v1.0
// Selettore locazione con ricerca/autocompletamento.
// Sostituisce i <select> con centinaia di opzioni (es. Matrice con 400+ celle).

import React, { useState, useRef, useEffect, useMemo } from "react";

/**
 * LocationPicker — campo input con dropdown filtrato.
 * Props:
 *   - options: string[]  — lista completa opzioni (es. ["Matrice - (1,1)", "Frigo 1 - Fila 1", ...])
 *   - value: string      — valore corrente
 *   - onChange: (val) =>  — callback quando l'utente seleziona un'opzione
 *   - placeholder: string
 *   - disabled: boolean
 *   - className: string  — classi aggiuntive per il wrapper
 */
export default function LocationPicker({ options = [], value = "", onChange, placeholder = "Cerca locazione…", disabled = false, className = "" }) {
  const [query, setQuery] = useState(value || "");
  const [open, setOpen] = useState(false);
  const [highlightIdx, setHighlightIdx] = useState(-1);
  const wrapperRef = useRef(null);
  const listRef = useRef(null);
  const inputRef = useRef(null);

  // Sync query con value esterno
  useEffect(() => { setQuery(value || ""); }, [value]);

  // Chiudi dropdown se click fuori
  useEffect(() => {
    const handler = (e) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // Filtra opzioni
  const filtered = useMemo(() => {
    if (!query.trim()) return options.slice(0, 50); // mostra le prime 50 se vuoto
    const q = query.toLowerCase().trim();
    // Ricerca smart: ogni "parola" del query deve matchare
    const terms = q.split(/\s+/);
    return options.filter(opt => {
      const low = opt.toLowerCase();
      return terms.every(t => low.includes(t));
    }).slice(0, 50);
  }, [query, options]);

  // Scroll highlight into view
  useEffect(() => {
    if (highlightIdx >= 0 && listRef.current) {
      const el = listRef.current.children[highlightIdx];
      if (el) el.scrollIntoView({ block: "nearest" });
    }
  }, [highlightIdx]);

  const selectOption = (opt) => {
    setQuery(opt);
    setOpen(false);
    setHighlightIdx(-1);
    if (onChange) onChange(opt);
  };

  const handleClear = () => {
    setQuery("");
    setOpen(false);
    if (onChange) onChange("");
    inputRef.current?.focus();
  };

  const handleKeyDown = (e) => {
    if (!open && e.key === "ArrowDown") { setOpen(true); return; }
    if (!open) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlightIdx(prev => Math.min(prev + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightIdx(prev => Math.max(prev - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (highlightIdx >= 0 && highlightIdx < filtered.length) {
        selectOption(filtered[highlightIdx]);
      }
    } else if (e.key === "Escape") {
      setOpen(false);
      setQuery(value || "");
    }
  };

  const handleInputChange = (e) => {
    setQuery(e.target.value);
    setOpen(true);
    setHighlightIdx(-1);
  };

  const handleFocus = () => {
    setOpen(true);
  };

  // Se il valore non è nelle opzioni, mostra un badge
  const isCustom = value && !options.includes(value);

  return (
    <div ref={wrapperRef} className={`relative ${className}`}>
      <div className="relative">
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={handleInputChange}
          onFocus={handleFocus}
          onKeyDown={handleKeyDown}
          disabled={disabled}
          placeholder={placeholder}
          className={`w-full border rounded-lg px-3 py-1.5 text-sm pr-8 focus:outline-none focus:ring-2 focus:ring-amber-300 ${
            disabled ? "bg-neutral-100 text-neutral-400 border-neutral-200 cursor-not-allowed" : "bg-white border-neutral-300"
          } ${isCustom ? "border-orange-300" : ""}`}
          autoComplete="off"
        />
        {query && !disabled && (
          <button type="button" onClick={handleClear}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-600 text-xs font-bold"
            tabIndex={-1}>✕</button>
        )}
      </div>

      {isCustom && (
        <span className="text-[10px] text-orange-600 mt-0.5 block">(non configurato)</span>
      )}

      {open && !disabled && (
        <div className="absolute z-50 mt-1 w-full bg-white border border-neutral-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
          {/* Opzione vuota (nessuna locazione) */}
          <div
            className={`px-3 py-1.5 text-sm cursor-pointer text-neutral-400 italic ${highlightIdx === -1 ? "" : "hover:bg-neutral-50"}`}
            onMouseDown={(e) => { e.preventDefault(); selectOption(""); }}>
            — Nessuna —
          </div>

          {filtered.length > 0 ? (
            <div ref={listRef}>
              {filtered.map((opt, i) => (
                <div key={opt}
                  className={`px-3 py-1.5 text-sm cursor-pointer transition-colors ${
                    i === highlightIdx ? "bg-amber-100 text-amber-900" : "hover:bg-neutral-50"
                  } ${opt === value ? "font-semibold text-amber-800" : ""}`}
                  onMouseDown={(e) => { e.preventDefault(); selectOption(opt); }}
                  onMouseEnter={() => setHighlightIdx(i)}>
                  {opt}
                </div>
              ))}
              {filtered.length === 50 && options.length > 50 && (
                <div className="px-3 py-1 text-[10px] text-neutral-400 text-center border-t border-neutral-100">
                  Digita per filtrare ({options.length} opzioni totali)
                </div>
              )}
            </div>
          ) : (
            <div className="px-3 py-2 text-sm text-neutral-400 text-center">
              Nessuna corrispondenza
            </div>
          )}
        </div>
      )}
    </div>
  );
}
