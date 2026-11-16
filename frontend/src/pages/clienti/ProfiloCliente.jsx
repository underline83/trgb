// Modulo: clienti — [core]
// Stelle e segmento del cliente (rank TRGB, 2026-11-16 — decisione di Marco).
//  ★ nere  (0-3) quanto viene · ★ argento (0-2) quanto spende · ★ oro (0-1) la mette solo Marco
//  (i VIP di TheFork ce l'hanno in automatico finché non la toglie, mig 237).
//  Segmento = a che punto è il rapporto: solo colore, niente icone (le stelle sono già simboli).
// Usato da lista e scheda clienti e dal Planning delle prenotazioni.
import React, { useState } from "react";
import { API_BASE, apiFetch } from "../../config/api";

export const SEGMENTI = {
  di_casa:     { label: "Di casa",     pill: "bg-emerald-50 text-emerald-800 border-emerald-300", dot: "bg-emerald-600" },
  affezionato: { label: "Affezionato", pill: "bg-lime-50 text-lime-800 border-lime-300",          dot: "bg-lime-600" },
  nuovo:       { label: "Nuovo",       pill: "bg-violet-50 text-violet-800 border-violet-300",    dot: "bg-violet-500" },
  una_volta:   { label: "Una volta",   pill: "bg-sky-50 text-sky-800 border-sky-300",             dot: "bg-sky-500" },
  in_calo:     { label: "In calo",     pill: "bg-amber-50 text-amber-800 border-amber-400",       dot: "bg-amber-500" },
  dormiente:   { label: "Dormiente",   pill: "bg-stone-100 text-stone-700 border-stone-300",      dot: "bg-stone-500" },
  perso:       { label: "Perso",       pill: "bg-stone-50 text-stone-500 border-stone-200",       dot: "bg-stone-300" },
  mai_venuto:  { label: "Mai venuto",  pill: "bg-white text-stone-500 border-stone-300 border-dashed", dot: "bg-stone-200" },
};
export const ORDINE_SEGMENTI = Object.keys(SEGMENTI);

const plurale = (n, uno, tanti) => `${n} ${n === 1 ? uno : tanti}`;

export function descriviStelle({ nere = 0, argento = 0, oro = 0 }) {
  return [
    nere ? plurale(nere, "stella nera", "stelle nere") : null,
    argento ? plurale(argento, "stella argento", "stelle argento") : null,
    oro ? "stella oro" : null,
  ].filter(Boolean).join(", ") || "nessuna stella";
}

// Stelle in fila: nere, argento, oro. `vuoto` = cosa mostrare senza stelle (default niente).
export function Stelle({ nere = 0, argento = 0, oro = 0, className = "text-sm", vuoto = null }) {
  if (!nere && !argento && !oro) return vuoto;
  const testo = descriviStelle({ nere, argento, oro });
  return (
    <span className={`inline-flex items-center leading-none whitespace-nowrap ${className}`} title={testo} aria-label={testo} role="img">
      {nere > 0 && <span className="text-neutral-900">{"★".repeat(nere)}</span>}
      {argento > 0 && <span className="text-slate-400">{"★".repeat(argento)}</span>}
      {oro ? <span className="text-amber-400">★</span> : null}
    </span>
  );
}

// Pillola colorata del segmento; `compatto` = solo il pallino (liste strette, Planning)
export function SegmentoPill({ segmento, compatto = false, className = "" }) {
  const s = SEGMENTI[segmento];
  if (!s) return null;
  if (compatto) {
    return <span className={`inline-block w-2 h-2 rounded-full ${s.dot} ${className}`} title={s.label} aria-label={s.label} role="img" />;
  }
  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-px rounded-full border text-[11px] font-semibold whitespace-nowrap ${s.pill} ${className}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} aria-hidden="true" />{s.label}
    </span>
  );
}

// Etichetta rossa per chi ha più no-show (soglia in Impostazioni › Stelle)
export function Attenzione({ className = "" }) {
  return (
    <span className={`inline-flex items-center px-2 py-px rounded-full border text-[11px] font-semibold bg-red-50 text-red-700 border-red-300 whitespace-nowrap ${className}`}
      title="Più no-show del solito">Attenzione</span>
  );
}

const euro = (n) => (n == null ? "—" : `${Math.round(n)} €`);
const quando = (iso) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;

// Riquadro della scheda cliente: stelle, segmento e il perché; stella oro (solo superadmin)
export function SchedaStelle({ clienteId, profilo, rankTheFork, onCambiato, onMessaggio }) {
  const [lavoro, setLavoro] = useState(false);
  if (!profilo || !profilo.segmento) return null;
  const puoOro = localStorage.getItem("role") === "superadmin";
  const d = profilo.dettaglio_punti || {};
  const sg = profilo.soglie || {};
  const vecchie = (profilo.visite || 0) - (profilo.visite_recenti || 0);

  const cambiaOro = async () => {
    setLavoro(true);
    try {
      const res = await apiFetch(`${API_BASE}/clienti/${clienteId}/stella-oro`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ oro: !profilo.stella_oro }),
      });
      if (!res.ok) throw new Error(res.status === 403 ? "La stella oro la mette solo il superadmin" : "Non salvata");
      if (onMessaggio) onMessaggio(profilo.stella_oro ? "Stella oro tolta" : "Stella oro messa");
      if (onCambiato) onCambiato();
    } catch (e) {
      if (onMessaggio) onMessaggio(e.message, "error");
    } finally {
      setLavoro(false);
    }
  };

  return (
    <section className="rounded-2xl bg-white border border-neutral-200 p-4">
      <div className="flex items-center justify-between gap-2 mb-3">
        <div className="text-xs font-bold tracking-wider uppercase text-neutral-500">Stelle e segmento</div>
        {puoOro && (
          <button type="button" onClick={cambiaOro} disabled={lavoro}
            className={`min-h-[36px] px-3 rounded-full border text-sm font-semibold ${profilo.stella_oro ? "bg-amber-50 border-amber-300 text-amber-800" : "bg-white border-neutral-300 text-neutral-700 hover:border-amber-400"}`}>
            {profilo.stella_oro ? "Togli la stella oro" : "Metti la stella oro"}
          </button>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <Stelle nere={profilo.stelle_nere} argento={profilo.stelle_argento} oro={profilo.stella_oro} className="text-2xl"
          vuoto={<span className="text-sm text-neutral-500">Nessuna stella</span>} />
        <SegmentoPill segmento={profilo.segmento} />
        {profilo.attenzione ? <Attenzione /> : null}
      </div>
      <ul className="text-sm text-neutral-700 space-y-1.5">
        <li>
          <span className="text-neutral-900">★</span> <b>{profilo.punti} punti</b>: {profilo.visite_recenti} visite negli ultimi {sg.stelle_mesi_recenti} mesi (+{d.visite_recenti})
          {vecchie > 0 ? `, ${vecchie} più vecchie (+${d.visite_vecchie})` : ""}
          {profilo.eventi ? `, ${profilo.eventi} eventi (+${d.eventi})` : ""}
          {profilo.no_show ? `, ${profilo.no_show} no-show (${d.no_show})` : ""}.
          <span className="text-neutral-500"> Stelle nere da {sg.stelle_soglia_1}, {sg.stelle_soglia_2} e {sg.stelle_soglia_3} punti.</span>
        </li>
        <li>
          <span className="text-slate-400">★</span>{" "}
          {profilo.scontrino_medio != null
            ? <>Scontrino medio <b>{euro(profilo.scontrino_medio)} a coperto</b> su {profilo.conti_cassa} cont{profilo.conti_cassa === 1 ? "o" : "i"} di cassa.</>
            : <>Nessun conto di cassa abbinato: la spesa non si conosce.</>}
          <span className="text-neutral-500"> Argento da {euro(sg.argento_soglia_1)} e {euro(sg.argento_soglia_2)}.</span>
        </li>
        <li>
          <span className="text-amber-400">★</span>{" "}
          {profilo.stella_oro && profilo.stella_oro_origine === "vip"
            ? <>Stella oro automatica: è VIP su TheFork.</>
            : profilo.stella_oro
              ? <>Stella oro{profilo.stella_oro_da ? ` messa da ${profilo.stella_oro_da}` : ""}{profilo.stella_oro_il ? ` il ${quando(profilo.stella_oro_il)}` : ""}.</>
              : profilo.stella_oro_tolta
                ? <span className="text-neutral-500">Stella oro tolta{profilo.stella_oro_da ? ` da ${profilo.stella_oro_da}` : ""}{profilo.stella_oro_il ? ` il ${quando(profilo.stella_oro_il)}` : ""} (su TheFork è VIP).</span>
                : <span className="text-neutral-500">La stella oro la mette solo Marco; i VIP di TheFork ce l'hanno in automatico.</span>}
        </li>
        {rankTheFork && <li className="text-xs text-neutral-500">Rank TheFork: {rankTheFork} (solo informazione, non conta)</li>}
      </ul>
    </section>
  );
}
