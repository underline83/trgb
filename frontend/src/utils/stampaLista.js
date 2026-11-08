// Modulo: platform (UI) — usato da cucina (frigo, lista spesa)
// @version: v1.0 — stampa di una lista su A4 dal browser (2026-11-08)
//
// Una lista da carta: titolo, sezioni, righe con una casella da spuntare e,
// se serve, una colonna vuota per scrivere a penna (la conta del frigo).
// Si apre una finestra con l'HTML e parte la stampa del browser: non e' il
// mattone M.B (PDF brand), e' un foglio di lavoro da cucina.
//
// stampaLista({
//   titolo: "Frigorifero 2", sottotitolo: "12 articoli · 4 ripiani",
//   colonne: { qta: "C'è", penna: "Contato" },     // facoltative
//   sezioni: [{ titolo: "Ripiano 1", righe: [{ testo, dettaglio, qta, segno }] }],
// })
// `segno`: "finito" | "poco" | "urgente" | null — una sigla in grassetto a destra del nome.

const esc = (s) => String(s ?? "")
  .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const SEGNI = { finito: "FINITO", poco: "POCO", urgente: "URGENTE" };

export function stampaLista({ titolo, sottotitolo, sezioni = [], colonne = {} }) {
  const w = window.open("", "_blank");
  if (!w) { alert("Il browser ha bloccato la finestra di stampa: abilita i popup per questo sito."); return; }

  const oggi = new Date().toLocaleString("it-IT", {
    weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit",
  });
  const conQta = !!colonne.qta;
  const conPenna = !!colonne.penna;

  const corpo = sezioni.filter((s) => (s.righe || []).length > 0).map((s) => `
    <section>
      <h2>${esc(s.titolo)}</h2>
      <table>
        ${(conQta || conPenna) ? `<thead><tr><th class="ck"></th><th></th>
          ${conQta ? `<th class="q">${esc(colonne.qta)}</th>` : ""}
          ${conPenna ? `<th class="p">${esc(colonne.penna)}</th>` : ""}</tr></thead>` : ""}
        <tbody>
        ${s.righe.map((r) => `
          <tr>
            <td class="ck"><span class="box"></span></td>
            <td class="nm">${esc(r.testo)}${r.segno ? ` <b class="sg">${SEGNI[r.segno] || esc(r.segno)}</b>` : ""}
              ${r.dettaglio ? `<div class="dt">${esc(r.dettaglio)}</div>` : ""}</td>
            ${conQta ? `<td class="q">${esc(r.qta ?? "")}</td>` : ""}
            ${conPenna ? `<td class="p"></td>` : ""}
          </tr>`).join("")}
        </tbody>
      </table>
    </section>`).join("");

  w.document.write(`<!doctype html>
<html><head><meta charset="utf-8"><title>${esc(titolo)}</title>
<style>
  @page { size: A4; margin: 14mm 12mm; }
  * { box-sizing: border-box; }
  body { font-family: "Helvetica Neue", Helvetica, Arial, sans-serif; color: #111; margin: 0; font-size: 12.5px; }
  header { border-bottom: 2px solid #111; padding-bottom: 6px; margin-bottom: 10px; }
  h1 { font-size: 22px; margin: 0; }
  .sub { color: #555; font-size: 11.5px; margin-top: 2px; }
  section { break-inside: avoid; margin-bottom: 12px; }
  h2 { font-size: 13px; text-transform: uppercase; letter-spacing: .06em; margin: 0 0 4px;
       padding: 3px 0; border-bottom: 1px solid #999; }
  table { width: 100%; border-collapse: collapse; }
  th { font-size: 10px; text-transform: uppercase; color: #666; font-weight: 600; text-align: right; padding: 0 4px 2px; }
  td { padding: 5px 4px; border-bottom: 1px dotted #bbb; vertical-align: top; }
  td.ck, th.ck { width: 22px; }
  .box { display: inline-block; width: 13px; height: 13px; border: 1.5px solid #111; border-radius: 2px; margin-top: 1px; }
  td.nm { font-size: 13px; }
  .dt { color: #666; font-size: 11px; margin-top: 1px; }
  .sg { font-size: 10px; letter-spacing: .05em; margin-left: 4px; }
  td.q { width: 80px; text-align: right; white-space: nowrap; }
  td.p { width: 90px; border-bottom: 1px solid #111; }
  .vuoto { color: #666; font-style: italic; }
  @media screen { body { padding: 16px; max-width: 800px; margin: 0 auto; } }
</style></head><body>
  <header>
    <h1>${esc(titolo)}</h1>
    <div class="sub">${sottotitolo ? esc(sottotitolo) + " · " : ""}stampata ${esc(oggi)}</div>
  </header>
  ${corpo || `<p class="vuoto">Niente da stampare.</p>`}
  <script>window.onload = () => setTimeout(() => window.print(), 300);</script>
</body></html>`);
  w.document.close();
}

/** La lista spesa su carta: solo le righe da fare, per fornitore (come a video),
 *  urgenti in cima a ogni fornitore. `items` = righe di GET /lista-spesa/items/. */
export function stampaListaSpesa(items) {
  const aperti = (items || []).filter((it) => !it.fatto);
  const map = new Map();
  for (const it of aperti) {
    const k = (it.fornitore_freeform || "").trim() || "Senza fornitore";
    if (!map.has(k)) map.set(k, []);
    map.get(k).push(it);
  }
  const sezioni = [...map.entries()]
    .sort((a, b) => (a[0] === "Senza fornitore" ? 1 : b[0] === "Senza fornitore" ? -1 : a[0].localeCompare(b[0])))
    .map(([forn, righe]) => ({
      titolo: forn,
      righe: righe
        .sort((a, b) => (b.urgente ? 1 : 0) - (a.urgente ? 1 : 0))
        .map((it) => ({
          testo: it.titolo,
          dettaglio: [it.note, it.da_confermare ? "da confermare" : null].filter(Boolean).join(" · "),
          qta: it.quantita_libera || "",
          segno: it.urgente ? "urgente" : null,
        })),
    }));
  stampaLista({
    titolo: "Lista della spesa",
    sottotitolo: `${aperti.length} da comprare`,
    colonne: { qta: "Quanto" },
    sezioni,
  });
}
