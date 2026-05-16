// src/hooks/useBulkSelection.js
//
// Hook generico per multi-selezione di righe in una tabella.
// Riusabile in qualsiasi modulo (Cantina, Acquisti, Dipendenti, ecc.).
//
// Uso:
//   const sel = useBulkSelection();
//   sel.toggleId(123);
//   sel.toggleAll(viniVisibili.map(v => v.id));
//   sel.isSelected(42);
//   sel.allSelected(viniVisibili.map(v => v.id));
//   sel.count;
//   sel.ids;
//   sel.clear();

import { useState, useCallback } from "react";

export default function useBulkSelection(initial = []) {
  const [ids, setIds] = useState(initial);

  const toggleId = useCallback((id) => {
    setIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  }, []);

  // toggleAll(currentVisibleIds): se tutti i visibili sono già selezionati → deselezionali,
  // altrimenti seleziona tutti i visibili
  const toggleAll = useCallback((visibleIds) => {
    setIds(prev => {
      const allSelected = visibleIds.length > 0 && visibleIds.every(id => prev.includes(id));
      return allSelected ? [] : [...visibleIds];
    });
  }, []);

  const isSelected = useCallback((id) => ids.includes(id), [ids]);

  const allSelected = useCallback(
    (visibleIds) => visibleIds.length > 0 && visibleIds.every(id => ids.includes(id)),
    [ids]
  );

  const clear = useCallback(() => setIds([]), []);

  return {
    ids,
    count: ids.length,
    toggleId,
    toggleAll,
    isSelected,
    allSelected,
    clear,
  };
}
