# Audit TRGB 2026-06-12 — 04 FRONTEND

> **Data:** 2026-06-12 · **Commit:** `1f5f9c17` (main) · **Versione:** 5.24
> **Fonti:** `raw_A4.md` (analisi statica `frontend/src/`, ~107k LOC React 18 + Vite + Tailwind) + verdetti `99_VERIFICA_AVVERSARIA.md` (A4-03 confermato; A3-12 smentito a favore di A4-04).
>
> ## **VOTO AREA FRONTEND: 78/100**

---

## 1. Metodologia e copertura

| Area | Metodo | Copertura |
|---|---|---|
| API fuori da API_BASE | grep `http://`, `https://`, `localhost`, `:8000` su tutto `frontend/src/` | Completa |
| Trailing slash | 17 router backend con endpoint root estratti, grep FE per chiamate senza `/` finale | Completa sui prefissi con endpoint root |
| Duplicazioni vs M.I | grep definizioni locali `Btn`/`StatusBadge`/`EmptyState`/`SortTh`/`sortRows`; pagine post 2026-04-18 vs import `components/ui` | Completa |
| Palette | grep `bg-neutral-100`/`bg-gray-50`/`min-h-screen`; ispezione Home.jsx + DashboardSala.jsx | Completa |
| StatoPagamentoBadge / 3 dimensioni | Lettura integrale dei due badge + grep consumer Fatture/CG | Completa sui consumer |
| Touch target / a11y | **Campione**: Home, ChiusuraTurno, prenotazioni, vini | Parziale, dichiarata |
| Vite dev vs build | push.sh, docs deploy, package.json | Completa |

Limiti dichiarati: il punto touch target/a11y è a campione; gli endpoint non-root con slash finale non sono stati verificati uno a uno.

---

## 2. Sintesi

Il frontend è in buona salute strutturale: **zero URL API hardcoded**, palette brand quasi totalmente migrata, le 3 dimensioni dello stato pagamento (regola granitica §15) **pienamente conformi**, Home v3.3 conforme alle regole design, adozione ampia dei primitives M.I (120 file). I problemi reali sono pochi e concentrati: il macigno noto del **Vite dev server in produzione** (A4-01, già in roadmap T.2b), la **gestione 401 duplicata a mano** in ~45 fetch raw (A4-02), un trailing slash mancante su pagina viva (A4-03) e touch target sotto soglia sulle azioni più frequenti della sala (A4-05).

---

## 3. Finding

```
[A4-01] SEVERITÀ: HIGH (noto — roadmap T.2b, priorità ALTA, pianificato)
Titolo: Frontend in produzione gira sul dev server di Vite, non su build statico
Evidenza: docs/analisi_hardening_vps.md:15,60 ("trgb-frontend.service lancia npm run dev -- --host
  127.0.0.1 --port 5173 --mode vps", severità ALTA); docs/deploy.md:22,44,231 (proxy_pass
  127.0.0.1:5173); push.sh:544 (restart trgb-frontend, nessun `npm run build` nello script);
  roadmap.md:659 (T.2b non fatto al 2026-06-12). CONFERMATO LIVE (raw_A6_live.md §2):
  processo node attivo su 127.0.0.1:5173 sul VPS.
Impatto: sourcemap e struttura sorgente esposti in DevTools (anche su pagine pubbliche /carta),
  endpoint HMR raggiungibili, performance degradate su 4G, single point of failure (Vite crash =
  frontend giù; nginx statico no).
Fix proposto: eseguire T.2b: `npm run build` in push.sh, nginx serve `dist/`, fallback Vite 24h.
  Già stimato ~3-4h in roadmap. — Effort: M
Modulo: platform
```

```
[A4-02] SEVERITÀ: MED
Titolo: 57 fetch() raw (non apiFetch) in ~21 file — gestione 401 e token duplicata a mano
Evidenza: grep fetch( non-apiFetch su frontend/src → 57 occorrenze. File più colpiti:
  pages/vini/CartaSezioneEditor.jsx (9), pages/dipendenti/DipendentiTurni.jsx (5),
  DipendentiBustePaga.jsx (5), pages/admin/ChiusuraTurno.jsx (5), ChiusureTurnoLista.jsx (3),
  pages/CambioPIN.jsx (3), components/LoginForm.jsx (2), CorrispettiviGestione.jsx (2), ecc.
  Ognuna replica `Authorization: Bearer ${token}` a mano e NON beneficia del redirect-su-401
  centralizzato di apiFetch (config/api.js:26-35). Esclusi i casi legittimi (wrapper stesso,
  authFetch blob, pagine public, useUpdateChecker, boot pre-auth): restano ~45 chiamate in
  pagine autenticate.
Impatto: su token scaduto l'utente vede errori silenti o crash invece del redirect a /login;
  pattern auth duplicato = manutenzione fragile.
Fix proposto: sostituzione meccanica fetch→apiFetch nelle pagine autenticate, opportunisticamente
  al tocco di ciascun file. — Effort: M (tanti file, modifica banale)
Modulo: platform (trasversale: cassa, dipendenti, vini, prenotazioni)
```

```
[A4-03] SEVERITÀ: MED — CONFERMATO da verifica avversaria
Titolo: Trailing slash mancante su endpoint root in pagina viva: CambioPIN chiama /auth/users senza slash
Evidenza: frontend/src/pages/CambioPIN.jsx:34 → fetch(`${API}/auth/users`, ...) senza slash.
  Backend: app/routers/users_router.py:50 `@router.get("/")` su prefix `/auth/users` → 307 redirect
  con rischio perdita header Auth (regola CLAUDE.md). CambioPIN è vivo (App.jsx:514 route /cambio-pin).
  Verifica avversaria (99 §2): confermato; le altre 2 chiamate del file (:60,:85) hanno segmenti
  extra e non sono affette. Gli altri 16 router con endpoint root: nessuna violazione in pagine vive.
Impatto: rischio 401/sessione-scaduta apparente per l'admin che apre Cambio PIN (lista utenti non
  si carica); il `.catch(() => {})` alla riga 37 maschera il fallimento in silenzio.
Fix proposto: aggiungere lo slash: `${API}/auth/users/`. Una riga. — Effort: S
Modulo: platform (auth/utenti)
```

```
[A4-04] SEVERITÀ: LOW — rafforzato dalla verifica avversaria
Titolo: 3 pagine duplicate morte in pages/admin/ (Dipendenti*) — mai importate, con codice non conforme
Evidenza: frontend/src/pages/admin/{DipendentiTurni.jsx, DipendentiAnagrafica.jsx, DipendentiCosti.jsx}.
  App.jsx importa SOLO le versioni in pages/dipendenti/ (App.jsx:78-79,86); grep import su tutto src
  → zero call site. Dettaglio confondente: pages/dipendenti/DipendentiTurni.jsx:2 ha ancora il
  commento header con path sbagliato "pages/admin/" (residuo della copia). I file morti contengono
  pattern vietati (fetch raw + `/dipendenti` senza slash).
  NOTA POST-VERIFICA: il rischio "file morti come falsa pista" si è già materializzato DENTRO questo
  stesso audit — il finding A3-12 (presunta regressione trailing slash S40-1) è stato SMENTITO in
  verifica avversaria (99 §2) proprio perché citava questi file morti come vivi; il codice vivo in
  pages/dipendenti/ è conforme (slash presenti, fix S40-1 applicato). Il cleanup elimina la trappola.
Impatto: nessun impatto runtime; rumore in audit/grep, rischio concreto di editare/citare il file
  sbagliato (nomi identici ai vivi).
Fix proposto: rimuoverli nel cleanup R7 (niente rimozioni distruttive durante R); intanto aggiungerli
  a docs/inventario_pulizia.md + correggere il commento header del file vivo. — Effort: S
Modulo: dipendenti
```

```
[A4-05] SEVERITÀ: MED
Titolo: Touch target sotto i 44pt sulle azioni primarie di PrenotazioniPlanning (uso sala su tablet)
Evidenza: frontend/src/pages/prenotazioni/PrenotazioniPlanning.jsx:171,177,186,194,202 — i bottoni
  cambio stato prenotazione (SEATED "Arrivato", CANCELED, NO_SHOW, RECORDED, LEFT) hanno
  `px-3 py-1 text-xs` → altezza ~26px, sotto la regola 44pt di CLAUDE.md/styleguide regola 8.
  Sono le azioni più frequenti del servizio. Campione su altre pagine operative: ChiusuraTurno OK,
  Home OK; ~11 altre occorrenze `py-1 text-xs` ma in contesti desktop/secondari.
Impatto: tap mancati / bottone sbagliato nel momento di punta (Arrivato vs No-show adiacenti).
Fix proposto: portare i 5 bottoni a `Btn size="md"` (M.I, touch 44pt) o almeno py-2.5 px-4. — Effort: S
Modulo: prenotazioni
```

```
[A4-06] SEVERITÀ: LOW
Titolo: 6 pagine nuove (post 2026-04-18, data M.I) non importano i primitives components/ui
Evidenza: git log --since=2026-04-18 --diff-filter=A → 36 pagine nuove; 6 senza import M.I:
  pages/cucina/DashboardCucina.jsx, pages/cucina/ListaSpesa.jsx, pages/vini/v2/CantinaV2.jsx,
  pages/vini/v2/SchedaVinoV2.jsx, pages/vini/AnagraficheVini.jsx, pages/tasks/ReportHACCP.jsx.
  Adozione generale buona: 120 file importano da components/ui. Caveat: alcune pagine potrebbero
  essere nate poche ore prima dei primitives (stesso giorno).
Impatto: drift estetico e touch target non garantiti su pagine usate da chef/sommelier su tablet.
Fix proposto: adozione opportunistica al prossimo tocco (regola opt-in M.I). — Effort: S per file
Modulo: cucina, vini, task_manager
```

```
[A4-07] SEVERITÀ: LOW
Titolo: SortTh/sortRows reimplementati localmente in 4-5 pagine nonostante gli helper condivisi
Evidenza: helper esistenti: utils/vini/sortableTable.jsx + hooks/useSortableTable.jsx. Copie locali:
  pages/banca/BancaCrossRef.jsx, pages/admin/FattureFornitoriElenco.jsx, pages/admin/FattureCategorie.jsx,
  pages/ricette/RicetteArchivio.jsx, pages/controllo-gestione/ControlloGestioneUscite.jsx (solo sortRows).
Impatto: 5 copie dello stesso pattern da mantenere allineate; bugfix sul sorting da replicare a mano.
Fix proposto: al prossimo tocco, sostituire con import da hooks/useSortableTable.jsx. — Effort: S per file
Modulo: banca, acquisti, ricette, controllo_gestione
```

```
[A4-08] SEVERITÀ: LOW
Titolo: Palette sfondi quasi totalmente migrata a bg-brand-cream; residui marginali bg-neutral-50
Evidenza: 135 container `min-h-screen bg-brand-cream`, ZERO bg-neutral-100/bg-gray-50 (la regola
  CLAUDE.md è rispettata sui valori vietati). Residui fuori palette: 7 pagine con bg-neutral-50
  (ClientiDuplicati, TavoliEditor, TavoliMappa, RicetteSettings, ViniImpostazioni, Login ×2) + 1
  gradient slate. Le 339 occorrenze residue di bg-neutral-100 sono hover/pannelli/bottoni neutri,
  usi sanzionati dalla styleguide — NON violazioni.
Impatto: incoerenza visiva minima, nessun impatto funzionale.
Fix proposto: swap bg-neutral-50 → bg-brand-cream al prossimo tocco (Login da valutare con Marco:
  potrebbe essere scelta voluta). — Effort: S
Modulo: platform (trasversale)
```

```
[A4-09] SEVERITÀ: LOW
Titolo: Accessibilità base: 631 <input> contro 71 aria-label/htmlFor in tutto il frontend
Evidenza: grep -c '<input' → 631; 'aria-label|htmlFor' → 71. Le label sono quasi sempre testo
  visivo non associato programmaticamente all'input. Campione, non audit a11y completo.
Impatto: form non navigabili da screen reader; tap su label non focalizza l'input. Priorità bassa
  per gestionale interno, rilevante se TRGB diventa prodotto vendibile.
Fix proposto: i primitives M.I TextInput/Select/FieldLabel generino id+htmlFor; l'adozione
  progressiva di M.I risolve gradualmente. — Effort: M (graduale)
Modulo: platform
```

```
[A4-10] SEVERITÀ: LOW
Titolo: Dipendenza axios dichiarata in package.json ma mai importata nel codice
Evidenza: frontend/package.json: `"axios": "^1.6.2"`; grep import/require su frontend/src → zero.
Impatto: peso inutile in node_modules e nel npm install del deploy FULL; nessun impatto bundle.
Fix proposto: rimuovere da package.json al prossimo giro di manutenzione FE. — Effort: S
Modulo: platform
```

```
[A4-11] SEVERITÀ: LOW
Titolo: Generazione QR della carta dipende da servizio esterno api.qrserver.com a runtime
Evidenza: frontend/src/pages/ricette/RicetteSettings.jsx:1022,1026 — URL e fetch verso
  api.qrserver.com. Unico URL esterno "funzionale" del frontend (gli altri hit: link informativi,
  Google Fonts carte pubbliche, wa.me del mattone M.C — legittimi).
Impatto: servizio terzo giù = QR non si genera; l'URL della carta transita per un terzo
  (privacy marginale, l'URL è pubblico per natura).
Fix proposto: lib locale client-side (es. qrcode) o endpoint backend quando arriverà M.B PDF. — Effort: S-M
Modulo: ricette
```

---

## 4. Positivi verificati (nessun finding)

- **Zero API hardcoded**: nessuna chiamata con `http://`, `localhost` o `:8000` fuori da config/api.js; `API_BASE` da `VITE_API_BASE_URL`. ✅
- **Stato pagamento 3 dimensioni (§15): PIENAMENTE CONFORME.** `StatoPagamentoBadge.jsx` gestisce solo D1+D2 (mappa CG_TO_STANDARD che proietta i D3 demandando); `StatoScadenzaBadge.jsx` (v1.0) gestisce solo D3 con `deriveStatoScadenza()` che ritorna null se D1 chiuso; `FattureDettaglio.jsx` mostra due chip separati come da regola; FattureElenco/FattureFornitoriElenco/FattureInCloud solo D1 nelle righe (lecito); chip unico in CG (permesso). Unico residuo tollerato: prop `scaduta` legacy mai usata da consumer, candidata a rimozione. ✅
- **Home v3.3 / DashboardSala conformi**: emoji+colori da modulesMenu.js, nessuna icona SVG nelle card, bg-brand-cream. ✅
- **Palette migrata**: zero `bg-neutral-100`/`bg-gray-50` su sfondi pagina (vedi A4-08 per i residui marginali). ✅
- **Trailing slash Vini conforme** (V-H.C 2026-05-12, riconfermato da grep). ✅
- **M.I adozione ampia**: 120 file importano components/ui. ✅
- **Verifica avversaria a favore di A4**: nell'unico conflitto tra report dell'audit (A3-12 vs A4-04), A4 era quello accurato — aveva correttamente identificato i file come morti.

---

## 5. Tabella riassuntiva

| ID | Sev | Titolo | Modulo | Noto? | Effort |
|---|---|---|---|---|---|
| A4-01 | HIGH | FE produzione su Vite dev server (no build statico) | platform | ✅ noto (T.2b ALTA) | M |
| A4-02 | MED | 57 fetch() raw senza apiFetch (no gestione 401) | platform | nuovo | M |
| A4-03 | MED | Trailing slash mancante: CambioPIN → /auth/users | platform | nuovo | S |
| A4-05 | MED | Touch target ~26px su azioni stato PrenotazioniPlanning | prenotazioni | nuovo | S |
| A4-04 | LOW | 3 pagine morte pages/admin/Dipendenti* (ha già ingannato A3-12) | dipendenti | nuovo | S |
| A4-06 | LOW | 6 pagine nuove post-M.I senza primitives ui | cucina/vini/task_manager | nuovo | S/file |
| A4-07 | LOW | SortTh/sortRows duplicati in 5 pagine | banca/acquisti/ricette/cg | nuovo | S/file |
| A4-08 | LOW | Residui bg-neutral-50 su 7 sfondi pagina | platform | parz. noto | S |
| A4-09 | LOW | A11y: 631 input / 71 aria-label-htmlFor | platform | nuovo | M graduale |
| A4-10 | LOW | axios in package.json mai usato | platform | nuovo | S |
| A4-11 | LOW | QR carta via servizio esterno api.qrserver.com | ricette | nuovo | S-M |

**Totali: 0 CRIT · 1 HIGH (noto) · 3 MED · 7 LOW.**

**Voto area Frontend: 78/100** — base solida e regole di progetto rispettate (3D pagamento, palette, API_BASE, Home v3.3); pesano il dev server in produzione (noto ma non eseguito) e il debito diffuso ma a basso rischio (fetch raw, touch target, a11y).
