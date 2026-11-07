// frontend/src/pages/vini/EtichetteVini.jsx
// Modulo: vini
// @version: v1.3 — «Etichetta collo bottiglia» 29×47 senza QR, predefinita (2026-11-07)
//           v1.2 — DK-22211 a 47 mm, QR 14 mm (ECC L), testi grandi (2026-11-07)
//           v1.1 — rotolo DK-22211 (29 mm continuo) predefinito + stampa in PDF della misura esatta (2026-11-07)
//           v1.0 — etichette QR bottiglie per Brother QL-820NWB (2026-10-06)
//
// Stampa etichette con QR da attaccare a bottiglie o scaffali. Il QR punta
// alla scheda mobile /vini/cantina-mobile/{id}: lo inquadri con la fotocamera
// dell'iPhone e sei sulla bottiglia, pronto a registrare vendita/scarico/conta
// (base dell'inventario con QR, roadmap V.13).
//
// Formati (rotoli Brother DK):
//   · collo  → «Etichetta collo bottiglia»: DK-22211 29×47, SENZA QR, solo testo
//              (denominazione, descrizione, produttore, #id). Richiesta Marco 2026-11-07.
//   · 29c    → DK-22211, pellicola continua 29 mm tagliata a 47 mm (montato da Marco il 2026-11-07).
//              QR al minimo leggibile (14 mm, correzione L, modulo ~0,42 mm = 5 punti a 300 dpi)
//              e testo più grande. Sul Mac: carta personalizzata 29×47 + preset «Vini QR 29x47».
//   · 29x62  → DK-11209, etichetta fustellata 62×29 mm
//   · 62x40  → DK-22205, rotolo continuo 62 mm tagliato a 40 mm
// Stampa: PDF vettoriale della misura esatta (utils/pdfEtichetta.js, come le
// gift card), non window.print(): Safari ignora @page e manda un A4. Sui rotoli
// da 29 mm il disegno è largo×29 ma la pagina esce in piedi (`ruota`), nel verso in
// cui scorre la carta. Il QR sta dentro l'area stampabile del 29 mm (~25,9 mm).
//
// QR generato in locale (utils/vendor/qrcode.js), niente servizi esterni.
// Nessuna modifica backend: GET /vini/v2/bottiglie/{id} e /vini/v2/bottiglie/?search=
//
// Ingressi: ?ids=12,34 (dalla scheda mobile e dalla scheda gestionale) oppure
// ricerca nella pagina per comporre un lotto.

import React, { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { API_BASE, apiFetch } from "../../config/api";
import { Btn, PageLayout, EmptyState } from "../../components/ui";
import ViniNav from "./ViniNav";
import QrSvg from "../../components/QrSvg";
import { pdfEtichetteQr, mostraPdf, apriFinestraVuota, larghezzaTesto } from "../../utils/pdfEtichetta";

// carta = cosa scegliere nel dialogo di stampa; ruota = pagina in piedi (verso del rotolo)
const FORMATI = {
  "collo": { label: "Etichetta collo bottiglia 29×47 (DK-22211, senza QR)", w: 47, h: 29, qr: 0, ruota: true, carta: "29×47 (preset «Vini QR 29x47» sul Mac)", collo: true },
  "29c":   { label: "29 continuo × 47 mm (DK-22211)", w: 47, h: 29, qr: 14, ecc: "L", ruota: true,  carta: "29×47 (preset «Vini QR 29x47» sul Mac)", compatta: true },
  "29x62": { label: "29×62 fustellata (DK-11209)",    w: 62, h: 29, qr: 25, ruota: true,  carta: "29 × 62 mm" },
  "62x40": { label: "62 continuo × 40 mm (DK-22205)", w: 62, h: 40, qr: 34, ruota: false, carta: "62 mm (continuo)" },
};
const FORMATO_DEFAULT = "collo";
const MAX_COPIE = 99;

function urlScheda(id) {
  return `${window.location.origin}/vini/cantina-mobile/${id}`;
}

function den(v) { return v.DENOMINAZIONE || v.d_display || ""; }
function prod(v) { return v.PRODUTTORE || v.p_nome || ""; }

// ── PDF ──────────────────────────────────────────────────────────────
const PT = 72 / 25.4;

// Taglia un testo alla larghezza (punti), con «...» se serve
function taglia(testo, maxPt, sizePt, bold) {
  const t = String(testo || "").trim();
  if (larghezzaTesto(t, sizePt, bold) <= maxPt) return t;
  let out = t;
  while (out.length > 1 && larghezzaTesto(out + "...", sizePt, bold) > maxPt) out = out.slice(0, -1);
  return out.trimEnd() + "...";
}

// Va a capo per parole su al massimo `maxRighe` righe; l'ultima si taglia
function aCapo(testo, maxPt, sizePt, bold, maxRighe) {
  const parole = String(testo || "").trim().split(/\s+/).filter(Boolean);
  const righe = [];
  let cur = "";
  for (let i = 0; i < parole.length; i++) {
    const prova = cur ? `${cur} ${parole[i]}` : parole[i];
    if (larghezzaTesto(prova, sizePt, bold) <= maxPt || !cur) { cur = prova; continue; }
    righe.push(cur);
    cur = parole[i];
    if (righe.length === maxRighe - 1) { cur = parole.slice(i).join(" "); break; }
  }
  if (cur) righe.push(cur);
  return righe.slice(0, maxRighe).map((r, i, a) => (i === a.length - 1 ? taglia(r, maxPt, sizePt, bold) : r));
}

function opzioniPdf(v, formato) {
  const f = FORMATI[formato];
  const big = formato === "62x40";
  const margine = f.compatta ? 1.2 : 1.5, gap = f.compatta ? 1.5 : 2;
  const maxPt = (f.w - margine * 2 - f.qr - gap) * PT;
  const righe = [];
  if (f.collo) {
    // tutta la larghezza al testo: ~44 mm
    const maxC = (f.w - 3) * PT;
    if (den(v)) righe.push({ testo: taglia(den(v).toUpperCase(), maxC, 7.5, true), sizePt: 7.5, bold: true, spaziatura: 0.4 });
    aCapo(v.DESCRIZIONE, maxC, 13, true, 2).forEach((t, i) =>
      righe.push({ testo: t, sizePt: 13, bold: true, spazioPrimaMm: i ? 1.4 : (righe.length ? 1.8 : 0) }));
    const idTxt = `#${v.id}`;
    const maxProd = maxC - larghezzaTesto(idTxt, 8, true) - 2 * PT;
    righe.push({
      testo: prod(v) ? taglia(prod(v), maxProd, 9.5, false) : " ", sizePt: 9.5, spazioPrimaMm: 2,
      destra: { testo: idTxt, sizePt: 8, bold: true },
    });
    return { wMm: f.w, hMm: f.h, ruota: f.ruota, qrText: "", qrMm: 0, margineMm: 1.5, gapMm: 0, righe };
  }
  if (f.compatta) {
    // ~29 mm di testo: denominazione, nome su 2 righe grande, produttore, annata grande con #id a destra
    if (den(v)) righe.push({ testo: taglia(den(v).toUpperCase(), maxPt, 6, true), sizePt: 6, bold: true, spaziatura: 0.3 });
    aCapo(v.DESCRIZIONE, maxPt, 10, true, 2).forEach((t, i) =>
      righe.push({ testo: t, sizePt: 10, bold: true, spazioPrimaMm: i ? 1.1 : (righe.length ? 1.4 : 0) }));
    if (prod(v)) righe.push({ testo: taglia(prod(v), maxPt, 7.5, false), sizePt: 7.5, spazioPrimaMm: 1.5 });
    righe.push({
      testo: String(v.ANNATA || "s.a."), sizePt: 15, bold: true, spazioPrimaMm: 2.2,
      destra: { testo: `#${v.id}`, sizePt: 7, bold: true },
    });
    return { wMm: f.w, hMm: f.h, ruota: f.ruota, ecc: f.ecc || "M", qrText: urlScheda(v.id), qrMm: f.qr, margineMm: margine, gapMm: gap, righe };
  }
  if (den(v)) righe.push({ testo: taglia(den(v).toUpperCase(), maxPt, 6.5, true), sizePt: 6.5, bold: true, spaziatura: 0.2 });
  aCapo(v.DESCRIZIONE, maxPt, big ? 10 : 9, true, big ? 3 : 2).forEach((t, i) =>
    righe.push({ testo: t, sizePt: big ? 10 : 9, bold: true, spazioPrimaMm: i ? 0.9 : (righe.length ? 1.3 : 0) }));
  if (prod(v)) righe.push({ testo: taglia(prod(v), maxPt, 7, false), sizePt: 7, spazioPrimaMm: 1.3 });
  if (big && v.FORMATO) righe.push({ testo: taglia(v.FORMATO, maxPt, 7, false), sizePt: 7, spazioPrimaMm: 1 });
  righe.push({ testo: `${v.ANNATA || "s.a."}   #${v.id}`, sizePt: big ? 12 : 11, bold: true, spazioPrimaMm: 1.6 });
  return {
    wMm: f.w, hMm: f.h, ruota: f.ruota,
    qrText: urlScheda(v.id), qrMm: f.qr,
    margineMm: margine, gapMm: gap, righe,
  };
}

export function Etichetta({ v, formato }) {
  const f = FORMATI[formato];
  const big = formato === "62x40";
  if (f.collo) {
    return (
      <div className="etv-lbl etv-collo" style={{ width: `${f.w}mm`, height: `${f.h}mm` }}>
        <div className="etv-txt">
          {den(v) && <div className="etv-den">{den(v)}</div>}
          <div className="etv-nome" style={{ WebkitLineClamp: 2 }}>{v.DESCRIZIONE}</div>
          <div className="etv-foot">
            <span className="etv-prod">{prod(v)}</span>
            <span className="etv-id">#{v.id}</span>
          </div>
        </div>
      </div>
    );
  }
  if (f.compatta) {
    return (
      <div className="etv-lbl etv-comp" style={{ width: `${f.w}mm`, height: `${f.h}mm` }}>
        <QrSvg text={urlScheda(v.id)} sizeMm={f.qr} />
        <div className="etv-txt">
          {den(v) && <div className="etv-den">{den(v)}</div>}
          <div className="etv-nome" style={{ WebkitLineClamp: 2 }}>{v.DESCRIZIONE}</div>
          {prod(v) && <div className="etv-prod">{prod(v)}</div>}
          <div className="etv-foot">
            <span className="etv-ann">{v.ANNATA || "s.a."}</span>
            <span className="etv-id">#{v.id}</span>
          </div>
        </div>
      </div>
    );
  }
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
.etv-collo{padding:1.5mm}
.etv-collo .etv-den{font-size:7.5pt;letter-spacing:.05em}
.etv-collo .etv-nome{font-size:13pt}
.etv-collo .etv-prod{font-size:9.5pt}
.etv-collo .etv-id{font-size:8pt}
.etv-comp{gap:1.5mm;padding:1mm 1.2mm}
.etv-comp .etv-den{font-size:6pt}
.etv-comp .etv-nome{font-size:10pt}
.etv-comp .etv-prod{font-size:7.5pt}
.etv-comp .etv-ann{font-size:15pt}
.etv-comp .etv-id{font-size:7pt}
`;

export default function EtichetteVini() {
  const [params] = useSearchParams();
  const [formato, setFormato] = useState(() => {
    try {
      const k = localStorage.getItem("etv-formato-v2");
      return FORMATI[k] ? k : FORMATO_DEFAULT;
    } catch { return FORMATO_DEFAULT; }
  });
  const [items, setItems] = useState([]); // [{ v, copie }]
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [q, setQ] = useState("");
  const [risultati, setRisultati] = useState([]);

  useEffect(() => {
    try { localStorage.setItem("etv-formato-v2", formato); } catch { /* niente */ }
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

  // Safari blocca le finestre aperte dopo un'attesa: la scheda si apre dentro il clic
  const stampa = () => {
    if (!daStampare.length) return;
    const finestra = apriFinestraVuota();
    const blob = pdfEtichetteQr(daStampare.map((v) => opzioniPdf(v, formato)));
    const nome = daStampare.length === 1 ? `etichetta_vino_${daStampare[0].id}.pdf` : `etichette_vini_${daStampare.length}.pdf`;
    mostraPdf(blob, nome, finestra);
  };

  return (
    <>
      <ViniNav current="cantina" />
      <style>{LABEL_CSS}</style>
      <PageLayout
        title="🏷️ Etichette vini"
        subtitle="Etichetta collo bottiglia (solo testo) o etichetta con QR: il QR apre la scheda mobile della bottiglia per registrare vendita, scarico o conta."
        actions={
          <Btn variant="primary" size="md" disabled={!daStampare.length} onClick={stampa}>
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
                Esce un PDF della misura esatta: Stampa → QL-820NWB, carta {FORMATI[formato].carta}, scala 100%, niente rotazione.
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
    </>
  );
}
