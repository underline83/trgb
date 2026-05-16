// src/hooks/useCantinaFilters.js
// Modulo: vini
//
// Hook condiviso per la logica filtri della Cantina (modulo classico e v2).
// Replica 1:1 la logica di MagazzinoVini.jsx riga 757+ (viniFiltrati).
//
// Uso:
//   const f = useCantinaFilters({ locConfig });
//   const filteredItems = f.applyFilters(items);
//   ...
//   <CantinaFiltri filters={f} opts={...} />
//
// Espone: state singoli (search, searchId, ecc.), setter, clearAll(), applyFilters(items),
// + allLocNomi e locSpaziOpts derivati da locConfig.

import { useState, useMemo, useCallback } from "react";

export default function useCantinaFilters({ locConfig } = {}) {
  // ── STATE ──────────────────────────────────────────────────
  const [search, setSearch] = useState("");
  const [searchId, setSearchId] = useState("");
  const [tipologia, setTipologia] = useState("");
  const [nazione, setNazione] = useState("");
  const [regione, setRegione] = useState("");
  const [produttore, setProduttore] = useState("");
  const [distributore, setDistributore] = useState("");
  const [rappresentante, setRappresentante] = useState("");

  const [statoVendita, setStatoVendita] = useState("");
  const [statoRiordino, setStatoRiordino] = useState("");
  const [statoConservazione, setStatoConservazione] = useState("");

  const [carta, setCarta] = useState("");
  const [ipratico, setIpratico] = useState("");
  const [biologico, setBiologico] = useState("");
  const [calice, setCalice] = useState("");

  const [locNome, setLocNome] = useState("");
  const [locSpazio, setLocSpazio] = useState("");

  const [giacenzaMode, setGiacenzaMode] = useState("any"); // any | gt | lt | between
  const [giacenzaVal1, setGiacenzaVal1] = useState("");
  const [giacenzaVal2, setGiacenzaVal2] = useState("");
  const [onlyPositiveStock, setOnlyPositiveStock] = useState(false);

  const [prezzoMode, setPrezzoMode] = useState("any");
  const [prezzoVal1, setPrezzoVal1] = useState("");
  const [prezzoVal2, setPrezzoVal2] = useState("");
  const [onlyMissingListino, setOnlyMissingListino] = useState(false);

  // ── DERIVED da locConfig ───────────────────────────────────
  const allLocNomi = useMemo(() => {
    if (!locConfig) return [];
    const nomi = new Set();
    for (const items of [locConfig.frigorifero, locConfig.locazione_1, locConfig.locazione_2, locConfig.locazione_3]) {
      (items || []).forEach(i => { if (i.nome) nomi.add(i.nome); });
    }
    return [...nomi].sort((a, b) => a.localeCompare(b, "it"));
  }, [locConfig]);

  const locSpaziOpts = useMemo(() => {
    if (!locConfig || !locNome) return [];
    const spazi = new Set();
    for (const items of [locConfig.frigorifero, locConfig.locazione_1, locConfig.locazione_2, locConfig.locazione_3]) {
      const found = (items || []).find(i => i.nome === locNome);
      if (found && found.spazi) found.spazi.forEach(s => spazi.add(s));
      if (found && found.tipo === "matrice" && found.righe && found.colonne) {
        for (let r = 1; r <= found.righe; r++)
          for (let c = 1; c <= found.colonne; c++)
            spazi.add(`(${c},${r})`);
      }
    }
    return [...spazi].sort((a, b) => a.localeCompare(b, "it"));
  }, [locConfig, locNome]);

  // ── CLEAR ALL ──────────────────────────────────────────────
  const clearAll = useCallback(() => {
    setSearch(""); setSearchId("");
    setTipologia(""); setNazione(""); setRegione("");
    setProduttore(""); setDistributore(""); setRappresentante("");
    setStatoVendita(""); setStatoRiordino(""); setStatoConservazione("");
    setCarta(""); setIpratico(""); setBiologico(""); setCalice("");
    setLocNome(""); setLocSpazio("");
    setGiacenzaMode("any"); setGiacenzaVal1(""); setGiacenzaVal2("");
    setOnlyPositiveStock(false);
    setPrezzoMode("any"); setPrezzoVal1(""); setPrezzoVal2("");
    setOnlyMissingListino(false);
  }, []);

  // ── APPLY FILTERS — replica 1:1 di viniFiltrati di MagazzinoVini.jsx ──
  const applyFilters = useCallback((items) => {
    let out = [...(items || [])];

    // 1) Ricerca per ID (match esatto se numero)
    if (searchId.trim()) {
      const idTrim = searchId.trim();
      const idNum = parseInt(idTrim, 10);
      out = out.filter(v => {
        if (!Number.isNaN(idNum) && v.id != null) return v.id === idNum;
        return String(v.id ?? "").toLowerCase().includes(idTrim.toLowerCase());
      });
    }

    // 2) Ricerca libera
    if (search.trim()) {
      const needle = search.trim().toLowerCase();
      out = out.filter(v => {
        const campi = [v.DESCRIZIONE, v.DENOMINAZIONE, v.PRODUTTORE, v.REGIONE, v.NAZIONE, v.DISTRIBUTORE, v.RAPPRESENTANTE];
        return campi.some(c => c && String(c).toLowerCase().includes(needle));
      });
    }

    // 3) Select anagrafica
    if (tipologia) out = out.filter(v => v.TIPOLOGIA === tipologia);
    if (nazione) out = out.filter(v => v.NAZIONE === nazione);
    if (regione) out = out.filter(v => v.REGIONE === regione);
    if (produttore) out = out.filter(v => v.PRODUTTORE === produttore);
    if (distributore) out = out.filter(v => v.DISTRIBUTORE === distributore);
    if (rappresentante) out = out.filter(v => v.RAPPRESENTANTE === rappresentante);

    // 4) Giacenza (con fallback)
    const parseIntSafe = (val) => { const n = parseInt(val, 10); return Number.isNaN(n) ? null : n; };
    const totQta = (v) => (v.QTA_TOTALE ?? ((v.QTA_FRIGO ?? 0) + (v.QTA_LOC1 ?? 0) + (v.QTA_LOC2 ?? 0) + (v.QTA_LOC3 ?? 0))) || 0;
    const g1 = parseIntSafe(giacenzaVal1);
    const g2 = parseIntSafe(giacenzaVal2);
    if (giacenzaMode !== "any") {
      out = out.filter(v => {
        const tot = totQta(v);
        if (giacenzaMode === "gt" && g1 != null) return tot > g1;
        if (giacenzaMode === "lt" && g1 != null) return tot < g1;
        if (giacenzaMode === "between" && g1 != null && g2 != null) {
          return tot >= Math.min(g1, g2) && tot <= Math.max(g1, g2);
        }
        return true;
      });
    }
    if (onlyPositiveStock) out = out.filter(v => totQta(v) > 0);

    // 5) Prezzo carta (skip se null/"")
    const parseFloatSafe = (val) => { const n = parseFloat(String(val).replace(",", ".")); return Number.isNaN(n) ? null : n; };
    const p1 = parseFloatSafe(prezzoVal1);
    const p2 = parseFloatSafe(prezzoVal2);
    if (prezzoMode !== "any") {
      out = out.filter(v => {
        if (v.PREZZO_CARTA == null || v.PREZZO_CARTA === "") return false;
        const prezzo = parseFloatSafe(v.PREZZO_CARTA);
        if (prezzo == null) return false;
        if (prezzoMode === "gt" && p1 != null) return prezzo > p1;
        if (prezzoMode === "lt" && p1 != null) return prezzo < p1;
        if (prezzoMode === "between" && p1 != null && p2 != null) {
          return prezzo >= Math.min(p1, p2) && prezzo <= Math.max(p1, p2);
        }
        return true;
      });
    }

    // 6) Senza listino
    if (onlyMissingListino) {
      out = out.filter(v => v.EURO_LISTINO == null || v.EURO_LISTINO === "");
    }

    // 7) Stati
    if (statoVendita !== "") out = out.filter(v => String(v.STATO_VENDITA) === String(statoVendita));
    if (statoRiordino) out = out.filter(v => v.STATO_RIORDINO === statoRiordino);
    if (statoConservazione) out = out.filter(v => v.STATO_CONSERVAZIONE === statoConservazione);

    // 7b) Flag
    if (carta !== "") out = out.filter(v => String(v.CARTA ?? "") === String(carta));
    if (ipratico !== "") out = out.filter(v => String(v.IPRATICO ?? "") === String(ipratico));
    if (biologico !== "") out = out.filter(v => String(v.BIOLOGICO ?? "") === String(biologico));
    if (calice !== "") out = out.filter(v => String(v.VENDITA_CALICE ?? "") === String(calice));

    // 8) Locazione (format "Nome - Spazio" o startsWith)
    if (locNome) {
      const locCols = ["FRIGORIFERO", "LOCAZIONE_1", "LOCAZIONE_2", "LOCAZIONE_3"];
      if (locSpazio) {
        const full = `${locNome} - ${locSpazio}`;
        out = out.filter(v => locCols.some(col => v[col] === full));
      } else {
        const prefix = `${locNome} - `;
        out = out.filter(v => locCols.some(col => v[col] && (v[col] === locNome || String(v[col]).startsWith(prefix))));
      }
    }

    return out;
  }, [
    search, searchId, tipologia, nazione, regione, produttore, distributore, rappresentante,
    statoVendita, statoRiordino, statoConservazione,
    carta, ipratico, biologico, calice,
    locNome, locSpazio,
    giacenzaMode, giacenzaVal1, giacenzaVal2, onlyPositiveStock,
    prezzoMode, prezzoVal1, prezzoVal2, onlyMissingListino,
  ]);

  // Conteggio filtri attivi (per indicatore "Pulisci (N)")
  const activeCount = useMemo(() => {
    let n = 0;
    if (search) n++;
    if (searchId) n++;
    if (tipologia) n++;
    if (nazione) n++;
    if (regione) n++;
    if (produttore) n++;
    if (distributore) n++;
    if (rappresentante) n++;
    if (statoVendita !== "") n++;
    if (statoRiordino) n++;
    if (statoConservazione) n++;
    if (carta !== "") n++;
    if (ipratico !== "") n++;
    if (biologico !== "") n++;
    if (calice !== "") n++;
    if (locNome) n++;
    if (locSpazio) n++;
    if (giacenzaMode !== "any") n++;
    if (onlyPositiveStock) n++;
    if (prezzoMode !== "any") n++;
    if (onlyMissingListino) n++;
    return n;
  }, [search, searchId, tipologia, nazione, regione, produttore, distributore, rappresentante,
      statoVendita, statoRiordino, statoConservazione,
      carta, ipratico, biologico, calice, locNome, locSpazio,
      giacenzaMode, onlyPositiveStock, prezzoMode, onlyMissingListino]);

  return {
    // state
    search, setSearch,
    searchId, setSearchId,
    tipologia, setTipologia,
    nazione, setNazione,
    regione, setRegione,
    produttore, setProduttore,
    distributore, setDistributore,
    rappresentante, setRappresentante,
    statoVendita, setStatoVendita,
    statoRiordino, setStatoRiordino,
    statoConservazione, setStatoConservazione,
    carta, setCarta,
    ipratico, setIpratico,
    biologico, setBiologico,
    calice, setCalice,
    locNome, setLocNome,
    locSpazio, setLocSpazio,
    giacenzaMode, setGiacenzaMode,
    giacenzaVal1, setGiacenzaVal1,
    giacenzaVal2, setGiacenzaVal2,
    onlyPositiveStock, setOnlyPositiveStock,
    prezzoMode, setPrezzoMode,
    prezzoVal1, setPrezzoVal1,
    prezzoVal2, setPrezzoVal2,
    onlyMissingListino, setOnlyMissingListino,
    // derived
    allLocNomi,
    locSpaziOpts,
    activeCount,
    // actions
    clearAll,
    applyFilters,
  };
}
