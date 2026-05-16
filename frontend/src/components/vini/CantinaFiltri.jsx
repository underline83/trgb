// src/components/vini/CantinaFiltri.jsx
// Modulo: vini
//
// Sidebar filtri condivisa Cantina (modulo classico e v2).
// JSX 1:1 con MagazzinoVini.jsx righe 1082-1311.
//
// Props:
//   - f: oggetto ritornato da useCantinaFilters()
//   - opts: { tipologie, nazioni, regioni, produttori, distributori, rappresentanti }
//     (distinct dai dati correnti; ricavabili lato chiamante)
//   - statoVenditaOptions, statoRiordinoOptions, statoConservazioneOptions: array { value, label }
//   - loading: boolean (disabilita Ricarica)
//   - onReload: () => void (callback bottone ⟳ Ricarica)
//   - error: string opzionale

import React from "react";

const fLbl = "block text-[10px] font-semibold text-neutral-500 uppercase mb-0.5";
const fInp = "w-full border border-neutral-300 rounded-md px-2 py-1.5 text-[11px] bg-white";
const fSel = "w-full border border-neutral-300 rounded-md px-1.5 py-1.5 text-[11px] bg-white";

export default function CantinaFiltri({
  f,
  opts,
  statoVenditaOptions = [],
  statoRiordinoOptions = [],
  statoConservazioneOptions = [],
  loading = false,
  onReload,
  error,
}) {
  return (
    <div className="p-2.5 space-y-2">

      {/* Ricerca */}
      <div className="bg-white rounded-lg p-2.5 border border-neutral-200 shadow-sm">
        <div className="text-[9px] font-extrabold text-neutral-400 uppercase tracking-widest mb-1.5">Ricerca</div>
        <div className="space-y-1.5">
          <div>
            <label className={fLbl}>Ricerca libera</label>
            <input type="text" value={f.search} onChange={e => f.setSearch(e.target.value)}
              placeholder="Descrizione, produttore…" className={fInp} />
          </div>
          <div>
            <label className={fLbl}>Ricerca per ID</label>
            <input type="text" value={f.searchId} onChange={e => f.setSearchId(e.target.value)}
              placeholder="es. 1234" className={fInp} />
          </div>
        </div>
      </div>

      {/* Anagrafica */}
      <div className="bg-amber-50/50 rounded-lg p-2.5 border border-amber-100 shadow-sm">
        <div className="text-[9px] font-extrabold text-amber-600 uppercase tracking-widest mb-1.5">Anagrafica</div>
        <div className="grid grid-cols-2 gap-1.5">
          <div>
            <label className={fLbl}>Tipologia</label>
            <select value={f.tipologia} onChange={e => f.setTipologia(e.target.value)} className={fSel}>
              <option value="">Tutte</option>
              {(opts.tipologie || []).map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div>
            <label className={fLbl}>Nazione</label>
            <select value={f.nazione} onChange={e => f.setNazione(e.target.value)} className={fSel}>
              <option value="">Tutte</option>
              {(opts.nazioni || []).map(n => <option key={n} value={n}>{n}</option>)}
            </select>
          </div>
          <div>
            <label className={fLbl}>Regione</label>
            <select value={f.regione} onChange={e => f.setRegione(e.target.value)} className={fSel}>
              <option value="">Tutte</option>
              {(opts.regioni || []).map(r => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>
          <div>
            <label className={fLbl}>Produttore</label>
            <select value={f.produttore} onChange={e => f.setProduttore(e.target.value)} className={fSel}>
              <option value="">Tutti</option>
              {(opts.produttori || []).map(p => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-1.5 mt-1.5">
          <div>
            <label className={fLbl}>Distributore</label>
            <select value={f.distributore} onChange={e => f.setDistributore(e.target.value)} className={fSel}>
              <option value="">Tutti</option>
              {(opts.distributori || []).map(d => <option key={d} value={d}>{d}</option>)}
            </select>
          </div>
          <div>
            <label className={fLbl}>Rappresentante</label>
            <select value={f.rappresentante} onChange={e => f.setRappresentante(e.target.value)} className={fSel}>
              <option value="">Tutti</option>
              {(opts.rappresentanti || []).map(r => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>
        </div>
      </div>

      {/* Locazioni */}
      <div className="bg-emerald-50/40 rounded-lg p-2.5 border border-emerald-100 shadow-sm">
        <div className="text-[9px] font-extrabold text-emerald-600 uppercase tracking-widest mb-1.5">Locazioni</div>
        <div className="grid grid-cols-2 gap-1.5">
          <div>
            <label className={fLbl}>Locazione</label>
            <select value={f.locNome}
              onChange={e => { f.setLocNome(e.target.value); f.setLocSpazio(""); }}
              className={fSel}>
              <option value="">Tutte</option>
              {f.allLocNomi.map(nome => <option key={nome} value={nome}>{nome}</option>)}
            </select>
          </div>
          <div>
            <label className={fLbl}>Spazio</label>
            <select value={f.locSpazio} onChange={e => f.setLocSpazio(e.target.value)}
              disabled={!f.locNome || !f.locSpaziOpts.length}
              className={fSel + " disabled:opacity-50"}>
              <option value="">Tutti</option>
              {f.locSpaziOpts.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
        </div>
      </div>

      {/* Stati */}
      <div className="bg-blue-50/40 rounded-lg p-2.5 border border-blue-100 shadow-sm">
        <div className="text-[9px] font-extrabold text-blue-600 uppercase tracking-widest mb-1.5">Stati</div>
        <div className="space-y-1.5">
          <div>
            <label className={fLbl}>Stato vendita</label>
            <select value={f.statoVendita} onChange={e => f.setStatoVendita(e.target.value)} className={fSel}>
              <option value="">Tutti</option>
              {statoVenditaOptions.filter(o => o.value !== "").map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
          <div>
            <label className={fLbl}>Stato riordino</label>
            <select value={f.statoRiordino} onChange={e => f.setStatoRiordino(e.target.value)} className={fSel}>
              <option value="">Tutti</option>
              {statoRiordinoOptions.filter(o => o.value !== "").map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
          <div>
            <label className={fLbl}>Stato conservazione</label>
            <select value={f.statoConservazione} onChange={e => f.setStatoConservazione(e.target.value)} className={fSel}>
              <option value="">Tutti</option>
              {statoConservazioneOptions.filter(o => o.value !== "").map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
        </div>
      </div>

      {/* Flag */}
      <div className="bg-rose-50/40 rounded-lg p-2.5 border border-rose-100 shadow-sm">
        <div className="text-[9px] font-extrabold text-rose-600 uppercase tracking-widest mb-1.5">Flag</div>
        <div className="grid grid-cols-2 gap-1.5">
          <div>
            <label className={fLbl}>Carta Vini</label>
            <select value={f.carta} onChange={e => f.setCarta(e.target.value)} className={fSel}>
              <option value="">Tutti</option><option value="1">SI</option><option value="0">NO</option>
            </select>
          </div>
          <div>
            <label className={fLbl}>iPratico</label>
            <select value={f.ipratico} onChange={e => f.setIpratico(e.target.value)} className={fSel}>
              <option value="">Tutti</option><option value="1">SI</option><option value="0">NO</option>
            </select>
          </div>
          <div>
            <label className={fLbl}>Biologico</label>
            <select value={f.biologico} onChange={e => f.setBiologico(e.target.value)} className={fSel}>
              <option value="">Tutti</option><option value="1">SI</option><option value="0">NO</option>
            </select>
          </div>
          <div>
            <label className={fLbl}>Calice</label>
            <select value={f.calice} onChange={e => f.setCalice(e.target.value)} className={fSel}>
              <option value="">Tutti</option><option value="1">SI</option><option value="0">NO</option>
            </select>
          </div>
        </div>
      </div>

      {/* Giacenza e prezzo */}
      <div className="bg-violet-50/40 rounded-lg p-2.5 border border-violet-100 shadow-sm">
        <div className="text-[9px] font-extrabold text-violet-600 uppercase tracking-widest mb-1.5">Giacenza e prezzo</div>
        <div className="space-y-1.5">
          <div>
            <label className={fLbl}>Filtro giacenza</label>
            <div className="flex gap-1 items-center">
              <select value={f.giacenzaMode} onChange={e => f.setGiacenzaMode(e.target.value)}
                className="border border-neutral-300 rounded-md px-1.5 py-1.5 text-[11px] bg-white w-[52px]">
                <option value="any">—</option>
                <option value="gt">&gt;</option>
                <option value="lt">&lt;</option>
                <option value="between">tra</option>
              </select>
              <input type="number" value={f.giacenzaVal1} onChange={e => f.setGiacenzaVal1(e.target.value)}
                className="w-14 border border-neutral-300 rounded-md px-1.5 py-1.5 text-[11px] bg-white" placeholder="da" />
              {f.giacenzaMode === "between" && (
                <input type="number" value={f.giacenzaVal2} onChange={e => f.setGiacenzaVal2(e.target.value)}
                  className="w-14 border border-neutral-300 rounded-md px-1.5 py-1.5 text-[11px] bg-white" placeholder="a" />
              )}
            </div>
          </div>
          <label className="flex items-center gap-1.5 text-[10px] text-neutral-700 cursor-pointer">
            <input type="checkbox" checked={f.onlyPositiveStock} onChange={e => f.setOnlyPositiveStock(e.target.checked)}
              className="rounded border-neutral-400 w-3.5 h-3.5" />
            <span>Solo giacenza positiva</span>
          </label>
          <div>
            <label className={fLbl}>Filtro prezzo carta €</label>
            <div className="flex gap-1 items-center">
              <select value={f.prezzoMode} onChange={e => f.setPrezzoMode(e.target.value)}
                className="border border-neutral-300 rounded-md px-1.5 py-1.5 text-[11px] bg-white w-[52px]">
                <option value="any">—</option>
                <option value="gt">&gt;</option>
                <option value="lt">&lt;</option>
                <option value="between">tra</option>
              </select>
              <input type="number" step="0.01" value={f.prezzoVal1} onChange={e => f.setPrezzoVal1(e.target.value)}
                className="w-16 border border-neutral-300 rounded-md px-1.5 py-1.5 text-[11px] bg-white" placeholder="da" />
              {f.prezzoMode === "between" && (
                <input type="number" step="0.01" value={f.prezzoVal2} onChange={e => f.setPrezzoVal2(e.target.value)}
                  className="w-16 border border-neutral-300 rounded-md px-1.5 py-1.5 text-[11px] bg-white" placeholder="a" />
              )}
            </div>
          </div>
          <label className="flex items-center gap-1.5 text-[10px] text-neutral-700 cursor-pointer">
            <input type="checkbox" checked={f.onlyMissingListino} onChange={e => f.setOnlyMissingListino(e.target.checked)}
              className="rounded border-neutral-400 w-3.5 h-3.5" />
            <span>Solo senza listino</span>
          </label>
        </div>
      </div>

      {/* Azioni filtri */}
      <div className="flex gap-2 pt-1">
        <button type="button" onClick={f.clearAll}
          className="flex-1 px-2 py-1.5 rounded-lg text-[10px] font-semibold border border-neutral-300 bg-white text-neutral-700 hover:bg-neutral-100 transition">
          ✕ Pulisci {f.activeCount > 0 && <span className="text-amber-600">({f.activeCount})</span>}
        </button>
        {onReload && (
          <button type="button" onClick={onReload} disabled={loading}
            className={`flex-1 px-2 py-1.5 rounded-lg text-[10px] font-semibold shadow transition ${
              loading ? "bg-gray-400 text-white cursor-not-allowed" : "bg-amber-700 text-white hover:bg-amber-800"
            }`}>
            {loading ? "Ricarico…" : "⟳ Ricarica"}
          </button>
        )}
      </div>

      {error && <p className="text-[11px] text-red-600 font-medium">{error}</p>}
    </div>
  );
}
