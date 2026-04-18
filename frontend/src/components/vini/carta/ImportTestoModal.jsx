// @version: v1.0 — Carta Bevande: import testo tabellare (sessione 2026-04-19)
// Modale con textarea per incollare righe separate da TAB o 2+ spazi.
// Preview editabile → conferma → POST /bevande/voci/bulk-import.

import React, { useState } from "react";
import { Btn } from "../../ui";

// Parser: separa sulle tab, o su 2+ spazi consecutivi come fallback
function parseLine(line) {
  if (line.includes("\t")) {
    return line.split("\t").map((c) => c.trim());
  }
  // Fallback: spezza su 2+ spazi
  return line.split(/\s{2,}/).map((c) => c.trim());
}

export default function ImportTestoModal({ open, onClose, onConfirm, columns }) {
  const [raw, setRaw] = useState("");
  const [rows, setRows] = useState([]);
  const [submitting, setSubmitting] = useState(false);

  if (!open) return null;

  // columns = [{key, label}] — definiti dal chiamante in base alla sezione
  const cols = columns && columns.length > 0 ? columns : [{ key: "nome", label: "Nome" }];

  const parse = () => {
    const lines = raw.split("\n").map((l) => l.trim()).filter(Boolean);
    const parsed = lines.map((line) => {
      const parts = parseLine(line);
      const row = {};
      cols.forEach((c, i) => {
        row[c.key] = parts[i] || "";
      });
      return row;
    });
    setRows(parsed);
  };

  const updateCell = (rowIdx, colKey, value) => {
    setRows((prev) => {
      const next = [...prev];
      next[rowIdx] = { ...next[rowIdx], [colKey]: value };
      return next;
    });
  };

  const removeRow = (idx) => {
    setRows((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleConfirm = async () => {
    const valid = rows.filter((r) => (r.nome || "").trim() !== "");
    if (valid.length === 0) {
      alert("Nessuna riga con nome valido.");
      return;
    }
    setSubmitting(true);
    try {
      await onConfirm(valid);
      setRaw("");
      setRows([]);
      onClose();
    } catch (e) {
      console.error("[ImportTestoModal] confirm:", e);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-0 sm:p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-none sm:rounded-2xl shadow-2xl w-full sm:max-w-5xl max-h-[100dvh] sm:max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-4 border-b border-neutral-200 flex items-center justify-between">
          <div>
            <h3 className="text-lg font-bold text-brand-ink">📋 Importa da testo</h3>
            <p className="text-xs text-neutral-500 mt-0.5">
              Incolla dati separati da TAB (es. copia/incolla da Word/Excel). Colonne attese:{" "}
              {cols.map((c) => c.label).join(" · ")}
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-neutral-400 hover:text-neutral-600 p-1 rounded transition"
            aria-label="Chiudi"
          >
            <span className="text-xl leading-none">×</span>
          </button>
        </div>

        <div className="flex-1 overflow-auto px-5 py-4 space-y-4">
          {rows.length === 0 ? (
            <>
              <textarea
                className="w-full min-h-[240px] px-3 py-2 border border-neutral-300 rounded-lg text-sm font-mono bg-neutral-50 focus:outline-none focus:ring-2 focus:ring-brand-blue/40 focus:border-brand-blue"
                placeholder="Incolla qui le righe — una per riga, colonne separate da TAB…"
                value={raw}
                onChange={(e) => setRaw(e.target.value)}
              />
              <div className="flex justify-end">
                <Btn variant="primary" size="md" onClick={parse} disabled={!raw.trim()}>
                  ▶ Parsa
                </Btn>
              </div>
            </>
          ) : (
            <div className="overflow-auto">
              <table className="w-full text-sm border border-neutral-200 rounded-lg">
                <thead className="bg-neutral-100">
                  <tr>
                    {cols.map((c) => (
                      <th key={c.key} className="px-2 py-1.5 text-left font-semibold text-neutral-700 text-xs border-b border-neutral-200">
                        {c.label}
                      </th>
                    ))}
                    <th className="px-2 py-1.5 text-xs border-b border-neutral-200 w-10" />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, idx) => (
                    <tr key={idx} className="hover:bg-neutral-50">
                      {cols.map((c) => (
                        <td key={c.key} className="px-1 py-1 border-b border-neutral-100">
                          <input
                            className="w-full px-2 py-1 text-sm rounded border border-transparent focus:border-brand-blue focus:outline-none focus:ring-1 focus:ring-brand-blue/40"
                            value={row[c.key] || ""}
                            onChange={(e) => updateCell(idx, c.key, e.target.value)}
                          />
                        </td>
                      ))}
                      <td className="px-1 py-1 border-b border-neutral-100 text-center">
                        <button
                          onClick={() => removeRow(idx)}
                          className="text-neutral-400 hover:text-red-600 transition p-1"
                          aria-label="Rimuovi riga"
                        >
                          ×
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="text-xs text-neutral-500 mt-2">
                {rows.length} righe pronte all'import
              </div>
            </div>
          )}
        </div>

        <div className="px-5 py-3 border-t border-neutral-200 flex items-center justify-between gap-2">
          {rows.length > 0 && (
            <Btn variant="ghost" size="md" onClick={() => { setRows([]); }}>
              ← Torna al testo
            </Btn>
          )}
          <div className="ml-auto flex gap-2">
            <Btn variant="secondary" size="md" onClick={onClose}>
              Annulla
            </Btn>
            {rows.length > 0 && (
              <Btn variant="primary" size="md" onClick={handleConfirm} loading={submitting}>
                Importa {rows.length} voci
              </Btn>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
