// src/hooks/useSortableTable.js
//
// Hook generico per ordinamento tabella + componente <SortIcon>.
// Replica 1:1 di MagazzinoVini.jsx righe 463-477 (sortKey/sortDir + handleSort + SortIcon).
//
// Uso:
//   const sort = useSortableTable();
//   const sorted = sort.sortRows(items, {
//     id:          v => v.id ?? 0,
//     descrizione: v => (v.DESCRIZIONE || "").toLowerCase(),
//     produttore:  v => (v.PRODUTTORE || "").toLowerCase(),
//     origine:     v => ((v.NAZIONE || "") + (v.REGIONE || "")).toLowerCase(),
//     qta:         v => totQta(v),
//     prezzo:      v => parseFloat(v.PREZZO_CARTA) || 0,
//   });
//   ...
//   <th onClick={() => sort.handleSort("id")}>ID <sort.SortIcon col="id" /></th>

import { useState, useCallback } from "react";
import React from "react";

export default function useSortableTable(initialKey = null, initialDir = "asc") {
  const [sortKey, setSortKey] = useState(initialKey);
  const [sortDir, setSortDir] = useState(initialDir);

  const handleSort = useCallback((key) => {
    setSortKey(prevKey => {
      if (prevKey === key) {
        setSortDir(prev => prev === "asc" ? "desc" : "asc");
        return prevKey;
      }
      setSortDir("asc");
      return key;
    });
  }, []);

  const SortIcon = ({ col }) => {
    if (sortKey !== col) return <span className="text-neutral-300 ml-0.5">↕</span>;
    return <span className="text-amber-600 ml-0.5">{sortDir === "asc" ? "↑" : "↓"}</span>;
  };

  // sortRows: applica l'ordinamento a una lista usando una mappa { colKey: getter }
  const sortRows = useCallback((items, getters) => {
    if (!sortKey || !getters[sortKey]) return items;
    const getter = getters[sortKey];
    const dir = sortDir === "asc" ? 1 : -1;
    const out = [...items];
    out.sort((a, b) => {
      const va = getter(a);
      const vb = getter(b);
      if (typeof va === "number" && typeof vb === "number") return (va - vb) * dir;
      if (va == null && vb == null) return 0;
      if (va == null) return 1;
      if (vb == null) return -1;
      return va < vb ? -dir : va > vb ? dir : 0;
    });
    return out;
  }, [sortKey, sortDir]);

  return {
    sortKey,
    sortDir,
    handleSort,
    SortIcon,
    sortRows,
  };
}
