# Audit 2026-06-12 — A4 Qualità frontend (statico)

> Subagente A4. Analisi **statica** di `frontend/src/` (~107k LOC, React 18 + Vite + Tailwind).
> Nessuna esecuzione, nessuna modifica al codice. Tutte le evidenze sono grep/letture verificabili.

---

## Metodologia e copertura

| Area | Metodo | Copertura |
|---|---|---|
| 1. API fuori da API_BASE | grep `http://`, `https://`, `localhost`, `:8000` su tutto `frontend/src/` | Completa |
| 2. Trailing slash | Estratti i 17 router backend con endpoint root (`@router.get("/")` + prefix), poi grep FE per chiamate al prefix senza `/` finale | Completa sui prefissi con endpoint root |
| 3. Duplicazioni vs M.I | grep definizioni locali `Btn`/`StatusBadge`/`EmptyState`/`SortTh`/`sortRows`; confronto pagine create post 2026-04-18 (`git log --diff-filter=A --since`) vs import `components/ui` | Completa per definizioni; date di creazione da git |
| 4. Palette | grep `bg-neutral-100`/`bg-gray-50`/`min-h-screen`; ispezione Home.jsx + DashboardSala.jsx | Completa |
| 5. StatoPagamentoBadge / 3D | Lettura integrale `StatoPagamentoBadge.jsx`, `StatoScadenzaBadge.jsx`; grep usi in FattureDettaglio/FattureElenco/FattureFornitoriElenco/FattureInCloud/CG | Completa sui consumer |
| 6. Touch target / a11y | Campione: Home, ChiusuraTurno, pages/prenotazioni/*, vini. Conteggio `aria-label`/`htmlFor` vs `<input` su tutto src | **Campione** — non esaustiva |
| 7. Vite dev vs build | Lettura push.sh, docs/deploy.md, docs/analisi_hardening_vps.md, package.json, locali/tregobbi/deploy/ | Completa |

**Onestà sul campionamento**: il punto 6 (touch target/accessibilità) è a campione sulle pagine operative indicate; altre pagine potrebbero avere problemi analoghi. Il punto 2 copre solo i router con endpoint root identificati via grep su `app/routers/` (17 file); endpoint non-root con slash finale obbligatorio (es. `@router.get("/qualcosa/")`) non sono stati verificati uno a uno.

---

## Finding

```
[A4-01] SEVERITÀ: HIGH (noto, stato: pianificato — roadmap T.2b, priorità ALTA)
Titolo: Frontend in produzione gira ancora sul dev server di Vite, non su build statico
Evidenza: docs/analisi_hardening_vps.md:15 e :60 ("trgb-frontend.service lancia npm run dev -- --host 127.0.0.1 --port 5173 --mode vps", "Severita': ALTA");
  docs/deploy.md:22,44,231 (porta interna 5173, proxy_pass 127.0.0.1:5173);
  push.sh:544 (restart trgb-frontend, nessun `npm run build` da nessuna parte nello script);
  frontend/package.json scripts: solo dev/build/preview — `build` mai invocato dal deploy;
  docs/roadmap.md:659 (T.2b "Frontend statico (Vite dev → build) in produzione", effort M, priorità ALTA, NON fatto al 2026-06-12).
Impatto: sourcemap e struttura sorgente esposti a chiunque apra DevTools (anche su pagine pubbliche
  /carta), endpoint HMR Vite raggiungibili, performance degradate su 4G, single point of failure
  (Vite crash = frontend giù; nginx statico non crasherebbe).
Fix proposto: eseguire T.2b come pianificato: `npm run build` in push.sh, nginx serve `dist/`,
  fallback Vite 24h. Già stimato ~3-4h in roadmap. — Effort: M
Modulo: platform
```

```
[A4-02] SEVERITÀ: MED
Titolo: 57 chiamate `fetch()` raw (non apiFetch) in ~21 file — gestione 401 e token duplicata a mano
Evidenza: comando `grep -rn '[^a-zA-Z]fetch(' --include='*.jsx' --include='*.js' frontend/src | grep -v apiFetch | wc -l` → 57.
  File più colpiti: pages/vini/CartaSezioneEditor.jsx (9), pages/dipendenti/DipendentiTurni.jsx (5),
  pages/dipendenti/DipendentiBustePaga.jsx (5), pages/admin/ChiusuraTurno.jsx (5, es. riga 85, 279, 400),
  pages/admin/ChiusureTurnoLista.jsx (3), pages/CambioPIN.jsx (3), components/LoginForm.jsx (2),
  pages/admin/CorrispettiviGestione.jsx (2), pages/dipendenti/DipendentiAnagrafica.jsx (2), ecc.
  Ognuna replica `headers: { Authorization: Bearer ${token} }` a mano e NON beneficia del
  redirect-su-401 centralizzato di apiFetch (config/api.js:26-35).
  Esclusi dal conteggio i casi legittimi: config/api.js (wrapper stesso), utils/authFetch.js
  (download blob in nuovo tab, motivato in commento), pagine public senza auth
  (CartaMenuPubblica, CartaClienti), hooks/useUpdateChecker.js (/version.json statico),
  utils/activeModules.js + localeStrings.js + brandConfig.js (boot pre-auth).
  Tolti questi, restano ~45 chiamate in pagine autenticate che dovrebbero usare apiFetch.
Impatto: su token scaduto l'utente vede errori silenti o crash invece del redirect a /login;
  pattern auth duplicato = manutenzione fragile (es. se cambia lo schema token).
Fix proposto: sostituzione meccanica fetch→apiFetch nelle pagine autenticate (stessa firma),
  opportunisticamente quando si tocca ciascun file. — Effort: M (tanti file, modifica banale)
Modulo: platform (trasversale: cassa, dipendenti, vini, prenotazioni)
```

```
[A4-03] SEVERITÀ: MED
Titolo: Trailing slash mancante su endpoint root in pagina viva: CambioPIN chiama /auth/users senza slash
Evidenza: frontend/src/pages/CambioPIN.jsx:34 → fetch(`${API}/auth/users`, ...) — senza slash finale.
  Backend: app/routers/users_router.py:50 `@router.get("/")` su `APIRouter(prefix="/auth/users")`.
  Per la regola CLAUDE.md ("TRAILING SLASH OBBLIGATORIO su endpoint root dei router": FastAPI fa
  307 redirect e il browser può perdere l'header Auth → 401).
  CambioPIN è routato e vivo: App.jsx:514 `<Route path="/cambio-pin" ...>`.
  Verifica sugli altri 16 router con endpoint root (clienti, prenotazioni, dipendenti, reparti,
  menu-templates, vini/magazzino, scelta_*, settings/*, shift-closures, ingredients): nessuna
  altra violazione in pagine vive (es. RicetteIngredienti.jsx:113 usa correttamente `${ING}/`;
  pages/dipendenti/DipendentiTurni.jsx:109 usa `/dipendenti/`).
  Le altre 2 occorrenze senza slash (pages/admin/DipendentiTurni.jsx:107 e
  pages/admin/DipendentiAnagrafica.jsx:141) stanno in file MORTI — vedi A4-04.
  Nota: roadmap V-H.C ha già uniformato i trailing slash sulle route Vini (FATTO 2026-05-12) —
  confermato conforme dal grep.
Impatto: rischio 401/sessione-scaduta apparente per l'admin che apre Cambio PIN (lista utenti
  non si carica); oggi il `.catch(() => {})` alla riga 37 maschera il fallimento in silenzio.
Fix proposto: aggiungere lo slash: `${API}/auth/users/`. Una riga. — Effort: S
Modulo: platform (auth/utenti)
```

```
[A4-04] SEVERITÀ: LOW
Titolo: 3 pagine duplicate morte in pages/admin/ (Dipendenti*) — mai importate, con codice non conforme
Evidenza: frontend/src/pages/admin/{DipendentiTurni.jsx, DipendentiAnagrafica.jsx, DipendentiCosti.jsx}.
  App.jsx importa SOLO le versioni in pages/dipendenti/ (App.jsx:78-79,86:
  `import("./pages/dipendenti/DipendentiAnagrafica")` ecc.).
  grep import "admin/DipendentiTurni|admin/DipendentiAnagrafica|admin/DipendentiCosti" su tutto
  src → zero call site (solo auto-riferimenti nei commenti header).
  Dettaglio confondente: pages/dipendenti/DipendentiTurni.jsx:2 ha ancora il commento header
  "// FILE: frontend/src/pages/admin/DipendentiTurni.jsx" (path sbagliato, residuo della copia).
  I file morti contengono pattern vietati (fetch raw + `${API_BASE}/dipendenti` senza slash) che
  rischiano di essere copiati come riferimento.
Impatto: nessun impatto runtime; rumore in audit/grep, rischio di editare il file sbagliato
  (i nomi sono identici a quelli vivi), peso bundle nullo (lazy mai importati).
Fix proposto: rimuoverli nel cleanup R7 (regola CLAUDE.md: niente rimozioni distruttive durante R);
  intanto aggiungerli a docs/inventario_pulizia.md + correggere il commento header del file vivo. — Effort: S
Modulo: dipendenti
```

```
[A4-05] SEVERITÀ: MED
Titolo: Touch target sotto i 44pt sulle azioni primarie di PrenotazioniPlanning (uso sala su tablet)
Evidenza: frontend/src/pages/prenotazioni/PrenotazioniPlanning.jsx:171,177,186,194,202 — i bottoni
  cambio stato prenotazione (SEATED "Arrivato", CANCELED, NO_SHOW, RECORDED, LEFT) hanno
  `className="px-3 py-1 text-xs ..."` → altezza effettiva ~26px, ben sotto la regola 44pt di
  CLAUDE.md/styleguide.md regola 8. Sono le azioni più frequenti del servizio, usate dalla sala
  su tablet durante il turno.
  Controllo a campione sulle altre pagine operative: ChiusuraTurno.jsx OK (bottoni py-2.5,
  riga 494); Home.jsx OK (card 110px min-height, nessun bottone tiny); nelle pages/ ci sono
  altre ~11 occorrenze del pattern `py-1 text-xs` su bottoni ma in contesti desktop/secondari.
Impatto: tap mancati / tap sul bottone sbagliato nel momento di punta del servizio
  (Arrivato vs No-show sono adiacenti).
Fix proposto: portare i 5 bottoni stato a `Btn size="md"` (M.I, touch 44pt) o almeno py-2.5
  px-4; il file è da toccare comunque per l'adozione M.I. — Effort: S
Modulo: prenotazioni
```

```
[A4-06] SEVERITÀ: LOW
Titolo: 6 pagine nuove (post 2026-04-18, data M.I) non importano i primitives components/ui
Evidenza: `git log --since=2026-04-18 --diff-filter=A` su frontend/src/pages → 36 pagine nuove;
  di queste, grep -L 'components/ui' individua 6 senza alcun import M.I:
  pages/cucina/DashboardCucina.jsx, pages/cucina/ListaSpesa.jsx, pages/vini/v2/CantinaV2.jsx,
  pages/vini/v2/SchedaVinoV2.jsx, pages/vini/AnagraficheVini.jsx, pages/tasks/ReportHACCP.jsx.
  Adozione generale comunque buona: 120 file importano da components/ui.
  Caveat onesto: M.I è del 2026-04-18 stesso — le pagine create in quei primissimi giorni
  potrebbero essere nate poche ore prima dei primitives.
Impatto: drift estetico (bottoni/badge/empty state ridisegnati a mano) e touch target non
  garantiti su pagine usate da chef/sommelier su tablet (DashboardCucina, ListaSpesa, CantinaV2).
Fix proposto: adozione opportunistica al prossimo tocco di ciascun file (regola opt-in M.I);
  nessuna sessione dedicata necessaria. — Effort: S per file
Modulo: cucina, vini, task_manager
```

```
[A4-07] SEVERITÀ: LOW
Titolo: SortTh/sortRows reimplementati localmente in 4-5 pagine nonostante gli helper condivisi
Evidenza: helper condivisi esistenti: utils/vini/sortableTable.jsx + hooks/useSortableTable.jsx.
  Definizioni locali duplicate (grep 'function SortTh|const SortTh' / 'sortRows'):
  pages/banca/BancaCrossRef.jsx, pages/admin/FattureFornitoriElenco.jsx,
  pages/admin/FattureCategorie.jsx, pages/ricette/RicetteArchivio.jsx,
  pages/controllo-gestione/ControlloGestioneUscite.jsx (solo sortRows).
Impatto: 5 copie dello stesso pattern da mantenere allineate (ordinamento numerico/null/locale);
  bugfix futuri sul sorting andrebbero replicati a mano.
Fix proposto: al prossimo tocco di ciascun file, sostituire la copia locale con import da
  hooks/useSortableTable.jsx. Non urgente. — Effort: S per file
Modulo: banca, acquisti, ricette, controllo_gestione
```

```
[A4-08] SEVERITÀ: LOW
Titolo: Palette sfondi pagina quasi totalmente migrata a bg-brand-cream; residui marginali bg-neutral-50
Evidenza: grep 'min-h-screen bg-' → 135 container con bg-brand-cream, ZERO con bg-neutral-100 o
  bg-gray-50 (la regola CLAUDE.md è rispettata sui valori vietati esplicitamente).
  Residui fuori palette: 7 pagine con `min-h-screen bg-neutral-50` (variante non citata dalla
  regola ma comunque non brand-cream): pages/clienti/ClientiDuplicati.jsx,
  pages/prenotazioni/TavoliEditor.jsx, pages/prenotazioni/TavoliMappa.jsx,
  pages/ricette/RicetteSettings.jsx, pages/vini/ViniImpostazioni.jsx, pages/Login.jsx (2 occorrenze);
  più 1 gradient slate (schermata centrata, probabile splash).
  Le 339 occorrenze residue di `bg-neutral-100` sono hover state / pannelli interni / bottoni
  neutri, usi sanzionati dalla styleguide (§ Pulsante neutro, § Tabella) — NON violazioni.
  Home v3.3: CONFORME — Home.jsx usa menu.icon (emoji) e menu.color da modulesMenu.js
  (Home.jsx:6,454,464,489,499,558,569,622,631), nessuna icona SVG nelle card moduli.
  DashboardSala.jsx: CONFORME — bg-brand-cream (righe 97,104), emoji nei widget e azioni (276).
Impatto: incoerenza visiva minima (neutral-50 vs cream è quasi impercettibile); nessun impatto funzionale.
Fix proposto: swap bg-neutral-50 → bg-brand-cream nelle 7 pagine al prossimo tocco
  (Login.jsx da valutare con Marco: potrebbe essere scelta voluta). — Effort: S
Modulo: platform (trasversale)
```

```
[A4-09] SEVERITÀ: LOW
Titolo: Accessibilità base: 631 <input> contro 71 aria-label/htmlFor in tutto il frontend
Evidenza: grep -c '<input' → 631; grep -c 'aria-label|htmlFor' → 71 (tutto frontend/src).
  Le label sono quasi sempre testo visivo `text-[10px] text-neutral-500 block` non associato
  programmaticamente all'input (pattern da styleguide.md § Label).
  Campione, non audit a11y completo: niente verifica screen reader, contrasto non misurato
  (nessun caso di contrasto evidentemente rotto trovato nelle pagine campionate).
Impatto: form non navigabili da screen reader / il tap sulla label non focalizza l'input
  (su touch è una piccola perdita di usabilità). Per un gestionale interno la priorità è bassa,
  ma diventa rilevante se TRGB diventa prodotto vendibile.
Fix proposto: i primitives M.I TextInput/Select/FieldLabel già esistono — basta che accettino/
  generino id+htmlFor; l'adozione progressiva di M.I risolve gradualmente. — Effort: M (graduale)
Modulo: platform
```

```
[A4-10] SEVERITÀ: LOW
Titolo: Dipendenza axios dichiarata in package.json ma mai importata nel codice
Evidenza: frontend/package.json: `"axios": "^1.6.2"` fra le dependencies;
  grep 'from "axios"' / require su tutto frontend/src → zero occorrenze.
Impatto: peso inutile in node_modules e nel npm install del deploy FULL (push.sh -f);
  nessun impatto sul bundle finché non viene importato.
Fix proposto: rimuovere da package.json al prossimo giro di manutenzione FE. — Effort: S
Modulo: platform
```

```
[A4-11] SEVERITÀ: LOW
Titolo: Generazione QR della carta dipende da servizio esterno api.qrserver.com a runtime
Evidenza: frontend/src/pages/ricette/RicetteSettings.jsx:1022 →
  `https://api.qrserver.com/v1/create-qr-code/?...&data=${encodeURIComponent(cartaUrl)}`
  (+ fetch dello stesso URL alla riga 1026 per il download). Unico URL esterno "funzionale"
  trovato nel grep punto 1 — gli altri hit sono link informativi (developers.fattureincloud.it,
  underlinestudio.it), Google Fonts nelle carte pubbliche e wa.me nel mattone M.C (legittimi).
Impatto: se il servizio terzo è giù o cambia API, il QR non si genera; l'URL della carta del
  ristorante transita per un servizio terzo (privacy marginale, l'URL è pubblico per natura).
Fix proposto: generare il QR client-side con una lib locale (es. qrcode) o endpoint backend
  in M.B PDF quando arriverà. Non urgente. — Effort: S-M
Modulo: ricette
```

### Verifiche con esito POSITIVO (nessun finding)

- **API hardcoded**: nessuna chiamata API con `http://`, `localhost` o `:8000` hardcoded fuori da
  config/api.js. `API_BASE` letto da `VITE_API_BASE_URL` (.env.production = https://trgb.tregobbi.it). ✅
- **Stato pagamento 3 dimensioni (§15)**: CONFORME.
  - `StatoPagamentoBadge.jsx` gestisce SOLO D1+D2 (header commento v1.3 + mappa CG_TO_STANDARD
    righe 79-88 che proietta i D3 su "da_pagare" demandando a StatoScadenzaBadge).
  - `StatoScadenzaBadge.jsx` esiste (v1.0 2026-05-18) e gestisce SOLO D3 (in_scadenza/scaduta/
    rateizzata/spostata), con `deriveStatoScadenza()` che ritorna null se D1 chiuso (D3 irrilevante). ✅
  - `FattureDettaglio.jsx`: due chip separati nell'header come da regola (righe 621+627-632,
    814-820, 856); il vecchio STATO_BADGE locale è stato rimosso (commento riga 53). ✅
  - `FattureElenco.jsx:715` / `FattureFornitoriElenco.jsx:1417` / `FattureInCloud.jsx:479`:
    mostrano solo D1 nelle righe (lecito), nessun mix D3-dentro-D1. ✅
  - `ControlloGestioneUscite.jsx`: STATO_STYLE locale con chip unico D1+D2+D3 — PERMESSO nel modulo CG. ✅
  - Residuo tollerato: la prop `scaduta` di StatoPagamentoBadge (override label "Scaduto") esiste
    ancora per compatibilità ma NON risulta usata da nessun consumer (grep 'scaduta={' → solo il
    commento d'uso nel componente stesso). Candidata a rimozione futura.
- **Home v3.3 / DashboardSala**: conformi (emoji+colori da modulesMenu.js, no SVG nelle card, bg-brand-cream). ✅
- **Trailing slash Vini**: conforme (già verificato da roadmap V-H.C, 2026-05-12, riconfermato dal grep). ✅
- **M.I adozione**: 120 file importano components/ui — adozione ampia. ✅

---

## Tabella riassuntiva

| ID | Sev | Titolo | Modulo | Noto? | Effort |
|---|---|---|---|---|---|
| A4-01 | HIGH | FE produzione su Vite dev server (no build statico) | platform | ✅ noto (roadmap T.2b, ALTA, pianificato) | M |
| A4-02 | MED | 57 fetch() raw senza apiFetch (no gestione 401) | platform | nuovo | M |
| A4-03 | MED | Trailing slash mancante: CambioPIN → /auth/users | platform | nuovo | S |
| A4-04 | LOW | 3 pagine morte pages/admin/Dipendenti* + header path sbagliato | dipendenti | nuovo | S |
| A4-05 | MED | Touch target ~26px su azioni stato PrenotazioniPlanning | prenotazioni | nuovo | S |
| A4-06 | LOW | 6 pagine nuove post-M.I senza primitives ui | cucina/vini/task_manager | nuovo | S/file |
| A4-07 | LOW | SortTh/sortRows duplicati in 5 pagine | banca/acquisti/ricette/cg | nuovo | S/file |
| A4-08 | LOW | Residui bg-neutral-50 su 7 sfondi pagina (palette quasi ok) | platform | parz. noto (controllo_design) | S |
| A4-09 | LOW | A11y: label non associate agli input (631 input / 71 aria-label-htmlFor) | platform | nuovo | M graduale |
| A4-10 | LOW | axios in package.json mai usato | platform | nuovo | S |
| A4-11 | LOW | QR carta via servizio esterno api.qrserver.com | ricette | nuovo | S-M |

**Totali**: 0 CRIT · 1 HIGH (noto) · 3 MED · 7 LOW.
