// Modulo: platform (mattone M.A notifiche — push sui dispositivi) — [core]
// @version: v1.0 (2026-11-24) — fase 2: quali tipi di notifica suonano sul telefono
//
// Riquadro in cima a Impostazioni › Notifiche. Un interruttore per tipo: acceso = la
// notifica, oltre al campanello, arriva come push a chi la vede e ha attivato le
// notifiche sul proprio dispositivo (campanello › «Notifiche su questo dispositivo»).
// Specifica: docs/spec_notifiche_push.md.

import React, { useCallback, useEffect, useState } from "react";
import { API_BASE, apiFetch } from "../../config/api";

const NOME_RUOLO = {
  tutti: "tutti", superadmin: "superadmin", admin: "admin", contabile: "contabile", chef: "chef",
  sous_chef: "sous chef", commis: "commis", sommelier: "sommelier", capo_sala: "capo sala",
  sala: "sala", viewer: "viewer",
};

function Interruttore({ acceso, occupato, onCambia, etichetta }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={acceso}
      aria-label={`Push per ${etichetta}`}
      disabled={occupato}
      onClick={onCambia}
      className={`relative w-12 h-7 rounded-full transition flex-shrink-0 disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue ${
        acceso ? "bg-brand-green" : "bg-neutral-300"
      }`}
    >
      <span
        className={`absolute top-0.5 w-6 h-6 rounded-full bg-white shadow transition-all ${acceso ? "left-[22px]" : "left-0.5"}`}
      />
    </button>
  );
}

export default function NotifichePushRegole() {
  const [dati, setDati] = useState(null);
  const [errore, setErrore] = useState("");
  const [occupato, setOccupato] = useState(null);
  const [tutti, setTutti] = useState(false);

  const carica = useCallback(async () => {
    try {
      const res = await apiFetch(`${API_BASE}/notifiche/push/regole`);
      if (!res.ok) throw new Error(`Errore ${res.status}`);
      setDati(await res.json());
      setErrore("");
    } catch (e) {
      setErrore(e.message || "Non riesco a leggere le regole delle push.");
    }
  }, []);

  useEffect(() => {
    carica();
  }, [carica]);

  const cambia = async (r) => {
    setOccupato(r.tipo);
    try {
      const res = await apiFetch(`${API_BASE}/notifiche/push/regole/${encodeURIComponent(r.tipo)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ push: !r.push }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => null);
        throw new Error((d && d.detail) || `Errore ${res.status}`);
      }
      await carica();
    } catch (e) {
      setErrore(e.message || "Non salvato.");
    }
    setOccupato(null);
  };

  if (!dati && !errore) return null;

  const regole = (dati && dati.regole) || [];
  // In vista: gli accesi e quelli arrivati davvero negli ultimi 90 giorni. Gli altri dietro «Mostra tutti».
  const inVista = regole.filter((r) => r.push || r.a_chi.length > 0);
  const nascosti = regole.length - inVista.length;
  const righe = tutti ? regole : inVista;

  return (
    <div className="border border-neutral-200 bg-white rounded-2xl">
      <div className="px-5 py-4 border-b border-neutral-100">
        <div className="flex items-center gap-3">
          <span className="text-2xl" aria-hidden="true">📲</span>
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-brand-ink">Push sul telefono</h3>
            <p className="text-xs text-neutral-500">
              Acceso: oltre al campanello, la notifica suona sul telefono di chi la riceve. Spento: resta solo nel campanello.
            </p>
          </div>
        </div>
        {dati && (
          <p className="text-xs text-neutral-500 mt-2">
            {dati.dispositivi_accesi === 0
              ? "Nessun dispositivo ha ancora le notifiche attive: "
              : `${dati.dispositivi_accesi} ${dati.dispositivi_accesi === 1 ? "dispositivo con le notifiche attive" : "dispositivi con le notifiche attive"}. `}
            Ognuno le attiva dal campanello, in fondo, sul proprio dispositivo.
          </p>
        )}
        {errore && <p className="text-xs text-brand-red mt-2">{errore}</p>}
      </div>

      <div className="divide-y divide-neutral-100">
        {righe.map((r) => (
          <div key={r.tipo} className="flex items-center gap-3 px-5 py-3 min-h-[56px]">
            <div className="flex-1 min-w-0">
              <div className={`text-sm font-medium ${r.push ? "text-brand-ink" : "text-neutral-600"}`}>{r.etichetta}</div>
              <div className="text-[11px] text-neutral-400">
                {r.a_chi.length > 0 ? `a ${r.a_chi.map((c) => NOME_RUOLO[c] || c).join(", ")}` : "mai arrivata finora"}
                {r.ultimi_30_giorni > 0 ? ` · ${r.ultimi_30_giorni} negli ultimi 30 giorni` : ""}
              </div>
            </div>
            <Interruttore acceso={r.push} occupato={occupato === r.tipo} onCambia={() => cambia(r)} etichetta={r.etichetta} />
          </div>
        ))}
        {righe.length === 0 && <div className="px-5 py-6 text-sm text-neutral-400 text-center">Nessun tipo di notifica.</div>}
      </div>

      {nascosti > 0 && (
        <div className="px-5 py-3 border-t border-neutral-100">
          <button type="button" onClick={() => setTutti((v) => !v)} className="text-xs text-brand-blue hover:underline">
            {tutti ? "Mostra solo quelli in uso" : `Mostra tutti (altri ${nascosti})`}
          </button>
        </div>
      )}
    </div>
  );
}
