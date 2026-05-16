// Modulo: vini
// src/utils/vini/sortableTable.jsx
//
// M2.5.5 (2026-05-16) — helper condivisi per le tabelle ordinabili dei pannelli
// Anagrafiche (Produttori, Distributori, Denominazioni, Vitigni). Estratti da
// ProduttoriPanel/DistributoriPanel/VitigniPanel/DenominazioniPanel dove vivevano
// duplicati (4 copie identiche). Da qui in avanti vanno importati e basta.
//
// Uso:
//   import { sortRows, SortTh } from "../../../utils/vini/sortableTable";
//   const [sort, setSort] = useState({ key: "nome", dir: "asc" });
//   const sorted = useMemo(() => sortRows(items, sort.key, sort.dir), [items, sort]);
//   <SortTh label="Nome" sortKey="nome" sort={sort} setSort={setSort} />
//
// Estensione .jsx perché esporta un componente React (Vite richiede .jsx per JSX inline).

import React from "react";

/**
 * Ordinamento stabile su array di oggetti per chiave singola.
 * - null/undefined finiscono sempre in coda (a prescindere da dir).
 * - Numeri ordinati numericamente, tutto il resto come stringhe (collation italiana).
 */
export function sortRows(rows, key, dir) {
  const m = dir === "desc" ? -1 : 1;
  return [...rows].sort((a, b) => {
    const av = a?.[key], bv = b?.[key];
    if (av == null && bv == null) return 0;
    if (av == null) return 1;
    if (bv == null) return -1;
    if (typeof av === "number" && typeof bv === "number") return (av - bv) * m;
    return String(av).localeCompare(String(bv), "it") * m;
  });
}

/**
 * Header cliccabile per la tabella. Toggle asc↔desc al click, indicatore freccia.
 * Props: label, sortKey, sort={key,dir}, setSort, align="left|right|center", className.
 */
export function SortTh({ label, sortKey, sort, setSort, className = "", align = "left" }) {
  const active = sort.key === sortKey;
  const dir = active ? sort.dir : null;
  return (
    <th
      onClick={() => setSort({ key: sortKey, dir: active && dir === "asc" ? "desc" : "asc" })}
      className={`px-3 py-2 text-${align} cursor-pointer select-none hover:bg-neutral-100 transition ${className}`}
    >
      <span className="inline-flex items-center gap-1">
        {label}
        <span className="text-[9px] text-neutral-400">{active ? (dir === "asc" ? "▲" : "▼") : "↕"}</span>
      </span>
    </th>
  );
}
