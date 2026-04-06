// @version: v1.0
// Mini-calendario mensile con badge prenotazioni
import React, { useState, useEffect } from "react";
import { API_BASE, apiFetch } from "../../../config/api";

const GIORNI_SETT = ["Lu", "Ma", "Me", "Gi", "Ve", "Sa", "Do"];
const MESI = ["Gennaio","Febbraio","Marzo","Aprile","Maggio","Giugno","Luglio","Agosto","Settembre","Ottobre","Novembre","Dicembre"];

export default function MiniCalendario({ selectedDate, onSelectDate }) {
  const sel = new Date(selectedDate + "T12:00:00");
  const [anno, setAnno] = useState(sel.getFullYear());
  const [mese, setMese] = useState(sel.getMonth() + 1); // 1-12
  const [dati, setDati] = useState({});

  useEffect(() => {
    apiFetch(`${API_BASE}/prenotazioni/calendario/${anno}/${mese}`)
      .then((r) => r.json())
      .then((d) => setDati(d.giorni || {}))
      .catch(() => setDati({}));
  }, [anno, mese]);

  // Griglia giorni
  const primoGiorno = new Date(anno, mese - 1, 1);
  const ultimoGiorno = new Date(anno, mese, 0);
  const offsetStart = (primoGiorno.getDay() + 6) % 7; // 0=lun
  const numGiorni = ultimoGiorno.getDate();

  const prevMese = () => {
    if (mese === 1) { setMese(12); setAnno(anno - 1); }
    else setMese(mese - 1);
  };
  const nextMese = () => {
    if (mese === 12) { setMese(1); setAnno(anno + 1); }
    else setMese(mese + 1);
  };

  const oggiStr = new Date().toISOString().slice(0, 10);

  const cells = [];
  // Celle vuote prima
  for (let i = 0; i < offsetStart; i++) cells.push(null);
  // Giorni del mese
  for (let d = 1; d <= numGiorni; d++) {
    const iso = `${anno}-${String(mese).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    const info = dati[iso];
    cells.push({ d, iso, info });
  }

  return (
    <div className="bg-white border border-neutral-200 rounded-xl p-4 shadow-sm max-w-xs">
      {/* Header mese */}
      <div className="flex items-center justify-between mb-3">
        <button onClick={prevMese} className="text-neutral-400 hover:text-neutral-700 px-1">◀</button>
        <span className="font-semibold text-sm text-neutral-800">{MESI[mese - 1]} {anno}</span>
        <button onClick={nextMese} className="text-neutral-400 hover:text-neutral-700 px-1">▶</button>
      </div>

      {/* Intestazione giorni */}
      <div className="grid grid-cols-7 gap-0.5 mb-1">
        {GIORNI_SETT.map((g) => (
          <div key={g} className="text-[10px] text-center text-neutral-400 font-medium">{g}</div>
        ))}
      </div>

      {/* Griglia giorni */}
      <div className="grid grid-cols-7 gap-0.5">
        {cells.map((cell, i) => {
          if (!cell) return <div key={`e${i}`} />;
          const isSelected = cell.iso === selectedDate;
          const isOggi = cell.iso === oggiStr;
          const hasPren = cell.info;
          const sat = cell.info?.saturazione || 0;
          const badgeColor = sat > 0.8 ? "bg-red-500" : sat > 0.5 ? "bg-amber-500" : "bg-emerald-500";

          return (
            <button
              key={cell.iso}
              onClick={() => onSelectDate(cell.iso)}
              className={`relative w-8 h-8 flex items-center justify-center text-xs rounded-lg transition
                ${isSelected ? "bg-indigo-600 text-white font-bold" : ""}
                ${isOggi && !isSelected ? "ring-2 ring-indigo-300" : ""}
                ${!isSelected ? "hover:bg-neutral-100 text-neutral-700" : ""}
              `}
            >
              {cell.d}
              {hasPren && !isSelected && (
                <span className={`absolute bottom-0.5 left-1/2 -translate-x-1/2 w-1.5 h-1.5 rounded-full ${badgeColor}`} />
              )}
              {hasPren && isSelected && (
                <span className="absolute -top-1 -right-1 text-[8px] bg-white text-indigo-700 rounded-full px-1 font-bold shadow">
                  {cell.info.count}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
