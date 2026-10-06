// frontend/src/pages/vini/EtichetteVini.jsx
// Modulo: vini
// @version: v1.0 — etichette QR bottiglie per Brother QL-820NWB (2026-10-06)
//
// Stampa etichette con QR da attaccare a bottiglie o scaffali. Il QR punta
// alla scheda mobile /vini/cantina-mobile/{id}: lo inquadri con la fotocamera
// dell'iPhone e sei sulla bottiglia, pronto a registrare vendita/scarico/conta
// (base dell'inventario con QR, roadmap V.13).
//
// Formati (rotoli Brother DK):
//   · 29x62  → DK-11209, etichetta fustellata 62×29 mm
//   · 62x40  → DK-22205, rotolo continuo 62 mm tagliato a 40 mm
// La pagina stampa dal browser (window.print) con @page della misura
// dell'etichetta: nel dialogo di stampa scegliere la QL-820NWB, carta della
// stessa misura, margini nessuno, scala 100%.
//
// QR generato in locale (utils/vendor/qrcode.js), niente servizi esterni.
// Nessuna modifica backend: GET /vini/v2/bottiglie/{id} e /vini/v2/bottiglie/?search=
//
// Ingressi: ?ids=12,34 (dalla scheda mobile e dalla scheda gestionale) oppure
// ricerca nella pagina per comporre un lotto.

import React, { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useSearchParams } from "react-router-dom";
import { API_BASE, apiFetch } from "../../config/api";
import { Btn, PageLayout, EmptyState } from "../../components/ui";
import ViniNav from "./ViniNav";
import qrcode from "../../utils/vendor/qrcode";

const FORMATI = {
  "29x62": { label: "29×62 fustellata (DK-11209)", w: 62, h: 29, qr: 25 },
  "62x40": { label: "62 continuo × 40 mm (DK-22205)", w: 62, h: 40, qr: 34 },
};
const MAX_COPIE = 99;

function urlScheda(id) {
  return `${window.location.origin}/vini/cantina-mobile/${id}`;
}

/** QR come SVG vettoriale: nitido a qualsiasi risoluzione di stampa. */
function QrSvg({ text, sizeMm }) {
  const { n, d } = useMemo(() => {
    const qr = qrcode(0, "M");
    qr.addData(text);
    qr.make();
    const count = qr.getModuleCount();
    let path = "";
    for (let r = 0; r < count; r++)
      for (let c = 0; c < count; c++)
        if (qr.isDark(r, c)) path += `M${c + 2} ${r + 2}h1v1h-1z`;
    return { n: count + 4, d: path };
  }, [text]);
  return (
    <svg viewBox={`0 0 ${n} ${n}`} width={`${sizeMm}mm`} height={`${sizeMm}mm`}
      shapeRendering="crispEdges" style={{ display: "block", flex: "none" }}>
      <rect width={n} height={n} fill="#fff" />
      <path d={d} fill="#000" />
    </svg>
  );
}

function den(v) { return v.DENOMINAZIONE || v.d_display || ""; }
function prod(v) { return v.PRODUTTORE || v.p_nome || ""; }

export function Etichetta({ v, formato }) {
  const f = FORMATI[formato];
  const big = formato === "62x40";
  return (
    <div className="etv-lbl" style={{ width: `${f.w}mm`, height: `${f.h}mm` }}>
      <QrSvg text={urlScheda(v.id)} sizeMm={f.qr} />
      <div className="etv-txt">
        {den(v) && <div className="etv-den">{den(v)}</div>}
        <div className="etv-nome" style={{ WebkitLineClamp: big ? 3 : 2 }}>{v.DESCRIZIONE}</div>
        {prod(v) && <div className="etv-prod">{prod(v)}</div>}
        {big && v.FORMATO && <div className="etv-prod">{v.FORMATO}</div>}
        <div className="etv-foot">
          <span className="etv-ann">{v.ANNATA || "s.a."}</span>
          <span className="etv-id">#{v.id}</span>
        </div>
      </div>
    </div>
  );
}

export const LABEL_CSS = `
.etv-lbl{box-sizing:border-box;display:flex;align-items:center;gap:1.5mm;padding:1.5mm 2mm;background:#fff;color:#000;overflow:hidden;font-family:"Helvetica Neue",Helvetica,Arial,sans-serif}
.etv-txt{flex:1;min-width:0;display:flex;flex-direction:column;justify-content:center;height:100%}
.etv-den{font-size:6.5pt;font-weight:700;text-transform:uppercase;letter-spacing:.02em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.etv-nome{font-size:9pt;font-weight:800;line-height:1.1;display:-webkit-box;-webkit-box-orient:vertical;overflow:hidden;margin:.4mm 0}
.etv-prod{font-size:7pt;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.etv-foot{display:flex;align-items:baseline;justify-content:space-between;margin-top:.6mm}
.etv-ann{font-size:12pt;font-weight:800}
.etv-id{font-size:6.5pt;font-weight:700}
#etv-print-root{display:none}
`;

export function printCss(formato) {
  const f = FORMATI[formato];
  return `
@media print{
  @page{size:${f.w}mm ${f.h}mm;margin:0}
  html,body{margin:0!important;padding:0!important;background:#fff!important}
  body>*:not(#etv-print-root){display:none!important}
  #etv-print-root{display:block!important}
  #etv-print-root .etv-lbl{page-break-after:always;break-after:page}
  #etv-print-root .etv-lbl:last-child{page-break-after:auto;break-after:auto}
}`;
}

export default function EtichetteVini() {
  const [params] = useSearchParams();
  const [formato, setFormato] = useState(() => {
    try { return localStorage.getItem("etv-formato") || "29x62"; } catch { return "29x62"; }
  });
  const [items, setItems] = useState([]); // [{ v, copie }]
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [q, setQ] = useState("");
  const [risultati, setRisultati] = useState([]);

  useEffect(() => {
    try { localStorage.setItem("etv-formato", formato); } catch { /* niente */ }
  }, [formato]);

  // Precarico da ?ids=
  useEffect(() => {
    const ids = (params.get("ids") || "").split(",").map((x) => parseInt(x, 10)).filter((x) => x > 0);
    if (!ids.length) return;
    let vivo = true;
    setLoading(true);
    Promise.all(ids.map((id) =>
      apiFetch(`${API_BASE}/vini/v2/bottiglie/${id}`).then((r) => (r.ok ? r.json() : null)).catch(() => null)
    )).then((rows) => {
      if (!vivo) return;
      const ok = rows.filter(Boolean);
      if (ok.length < ids.length) setErr("Alcuni vini non sono stati trovati.");
      setItems(ok.map((v) => ({ v, copie: 1 })));
    }).finally(() => vivo && setLoading(false));
    return () => { vivo = false; };
  }, [params]);

  // Ricerca per aggiungere al lotto
  useEffect(() => {
    const s = q.trim();
    if (s.length < 2) { setRisultati([]); return; }
    const t = setTimeout(() => {
      apiFetch(`${API_BASE}/vini/v2/bottiglie/?search=${encodeURIComponent(s)}&limit=20`)
        .then((r) => (r.ok ? r.json() : []))
        .then((rows) => setRisultati(Array.isArray(rows) ? rows : []))
        .catch(() => setRisultati([]));
    }, 250);
    return () => clearTimeout(t);
  }, [q]);

  const aggiungi = (v) => {
    setItems((prev) => (prev.some((x) => x.v.id === v.id) ? prev : [...prev, { v, copie: 1 }]));
    setQ("");
    setRisultati([]);
  };
  const setCopie = (id, n) => setItems((prev) => prev.map((x) =>
    x.v.id === id ? { ...x, copie: Math.max(0, Math.min(MAX_COPIE, n || 0)) } : x));
  const togli = (id) => setItems((prev) => prev.filter((x) => x.v.id !== id));

  const daStampare = useMemo(
    () => items.flatMap((x) => Array.from({ length: x.copie }, () => x.v)),
    [items]
  );

  return (
    <>
      <ViniNav current="cantina" />
      <style>{LABEL_CSS + printCss(formato)}</style>
      <PageLayout
        title="🏷️ Etichette QR"
        subtitle="Il QR apre la scheda mobile della bottiglia: inquadralo con l'iPhone per registrare vendita, scarico o conta."
        actions={
          <Btn variant="primary" size="md" disabled={!daStampare.length} onClick={() => window.print()}>
            🖨️ Stampa {daStampare.length || ""} {daStampare.length === 1 ? "etichetta" : "etichette"}
          </Btn>
        }
      >
        <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <div className="space-y-4">
            <div className="bg-white rounded-xl border border-neutral-200 p-4">
              <div className="text-sm font-semibold text-brand-ink mb-2">Rotolo</div>
              <div className="flex flex-wrap gap-2">
                {Object.entries(FORMATI).map(([k, f]) => (
                  <Btn key={k} size="md" variant={formato === k ? "primary" : "secondary"} onClick={() => setFormato(k)}>
                    {f.label}
                  </Btn>
                ))}
              </div>
              <p className="text-xs text-neutral-500 mt-2">
                Nel dialogo di stampa: QL-820NWB, carta {FORMATI[formato].h === 29 ? "29 × 62 mm" : "62 mm continuo"}, margini nessuno, scala 100%.
              </p>
            </div>

            <div className="bg-white rounded-xl border border-neutral-200 p-4">
              <div className="text-sm font-semibold text-brand-ink mb-2">Aggiungi vini</div>
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Cerca per nome, produttore, denominazione…"
                className="w-full border border-neutral-300 rounded-lg px-3 py-2.5 text-sm min-h-[44px]"
              />
              {risultati.length > 0 && (
                <ul className="mt-2 divide-y divide-neutral-100 border border-neutral-200 rounded-lg max-h-72 overflow-auto">
                  {risultati.map((v) => (
                    <li key={v.id}>
                      <button type="button" onClick={() => aggiungi(v)}
                        className="w-full text-left px-3 py-2 min-h-[44px] hover:bg-brand-cream text-sm">
                        <span className="font-semibold">{v.DESCRIZIONE}</span>
                        {v.ANNATA ? <span className="ml-1">{v.ANNATA}</span> : null}
                        <span className="text-neutral-500"> · {prod(v)} · giac. {v.QTA_TOTALE ?? 0}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="bg-white rounded-xl border border-neutral-200 p-4">
              <div className="text-sm font-semibold text-brand-ink mb-2">Da stampare</div>
              {loading && <div className="text-sm text-neutral-500">Carico…</div>}
              {err && <div className="text-sm text-red-700 mb-2">{err}</div>}
              {!loading && !items.length && (
                <EmptyState icon="🏷️" title="Nessun vino" description="Cerca un vino qui sopra, oppure apri questa pagina dalla scheda di una bottiglia." />
              )}
              <ul className="divide-y divide-neutral-100">
                {items.map(({ v, copie }) => (
                  <li key={v.id} className="py-2 flex items-center gap-2">
                    <div className="flex-1 min-w-0 text-sm">
                      <div className="font-semibold truncate">{v.DESCRIZIONE} {v.ANNATA || ""}</div>
                      <div className="text-xs text-neutral-500 truncate">#{v.id} · {prod(v)} · giacenza {v.QTA_TOTALE ?? 0}</div>
                    </div>
                    <input type="number" min={0} max={MAX_COPIE} value={copie}
                      onChange={(e) => setCopie(v.id, parseInt(e.target.value, 10))}
                      className="w-16 border border-neutral-300 rounded-lg px-2 py-2 text-sm text-center min-h-[44px]"
                      aria-label="Copie" />
                    {Number(v.QTA_TOTALE) > 0 && Number(v.QTA_TOTALE) !== copie && (
                      <Btn size="sm" variant="ghost" onClick={() => setCopie(v.id, Number(v.QTA_TOTALE))}
                        title="Una etichetta per ogni bottiglia in giacenza">= {v.QTA_TOTALE}</Btn>
                    )}
                    <Btn size="sm" variant="ghost" onClick={() => togli(v.id)} title="Togli">✕</Btn>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-neutral-200 p-4">
            <div className="text-sm font-semibold text-brand-ink mb-3">Anteprima</div>
            <div className="flex flex-wrap gap-3">
              {items.map(({ v }) => (
                <div key={v.id} className="border border-dashed border-neutral-400 rounded" style={{ zoom: 1.4 }}>
                  <Etichetta v={v} formato={formato} />
                </div>
              ))}
            </div>
          </div>
        </div>
      </PageLayout>

      {createPortal(
        <div id="etv-print-root">
          {daStampare.map((v, i) => <Etichetta key={`${v.id}-${i}`} v={v} formato={formato} />)}
        </div>,
        document.body
      )}
    </>
  );
}
