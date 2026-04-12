# TRGB — Piano responsive Mac+iPad

**Sessione di analisi:** 2026-04-11 (sessione 26 — Marco + Claude)
**Stato aggiornato fine sessione 27 (2026-04-12 notte):**
- **Punto 1 (`useAppHeight`)** — ROLLBACKATO in sessione 26. Da rifare con C.3 bisezione.
- **Punto 2 (B.1 Header touch)** — ✅ FATTO sessione 27. `Header.jsx` v4.3, tap-toggle + click-outside touchstart.
- **Punto 3 (B.2 Tooltip popover)** — ✅ COMPLETATA sessione 27+28. Componente `Tooltip.jsx` v1.1 (detection iPad Desktop-mode, no long-press callout). Tutti i blocchi migrati: Block 1 CG (14), Block 2 Acquisti (17), Block 3 Cantina (16), Block 4-5 Dip/Clienti/Pren/Ricette (28), Block 6 Banca/Stat/Admin (13). **88 wrapping in 38 file, zero title= migrabili rimasti.**
- **Punto 4 (B.3 input font-size 16px)** — ✅ FATTO sessione 27. `index.css` media query `@media (pointer: coarse)`.
- **Punto 5 (B.4 tap target sidebar)** — ancora da fare.
- **Punto 6 (B.5 sidebar width variabile)** — ancora da fare (opzionale).
- **Punto 7 (B.6 tabelle critiche `hidden xl:table-cell`)** — condizionale, solo se serve dopo gli altri.

**Prossima sessione operativa:** **B.4 tap target sidebar** (indipendente da `useAppHeight`), poi B.5 (opzionale), B.6 (condizionale). B.2 è completata.

**Protocollo cap. 10 confermato empiricamente:** sessione 27 ha eseguito **sette commit isolati consecutivi** (B.1 + B.3 + 5 commit del Block 1 B.2) con zero rollback e zero regressioni. Il pattern "un file per commit + Marco testa tra un push e l'altro" funziona. Rule of thumb: mai più worktree `.claude/worktrees/*` — sempre direttamente in main (vedi postmortem worktree in `sessione.md` sessione 27 e memory `feedback_worktree_no_trust.md`).

> **Nota al Claude che legger questo file in una sessione futura:** questo  il piano condiviso con Marco alla fine della sessione 26. Leggi TUTTO prima di proporre modifiche. I punti 1-7 sono dettagliati e pronti da eseguire.

> **iPhone lite: FUORI SCOPE.** Marco (sessione 26) ha esplicitamente detto: "la voglio vedere a progetto quasi finito, cos vediamo solo cosa vedere su iphone. Pensarci ora e poi cambiare architettura non ha senso per me." **Non pianificare, non abbozzare, non creare hook `useDevice`, non scaffoldare `pages/mobile/`, non aggiungere detection viewport per tree alternativi.** Le ottimizzazioni dei punti 1-7 vanno scritte pensando SOLO a Mac+iPad. L'iPhone verr rivalutato quando Mac+iPad sar stabile e maturo.

---

## 1. Decisioni architetturali fissate

**1.1 Due target attivi oggi: Mac e iPad.** TRGB deve funzionare bene su:
- **Mac** (riferimento 1280x800) — desktop completo, tutti gli 11 moduli.
- **iPad landscape** (denominatore comune 1180x820, iPad mini escluso, solo landscape) — stessa UI di Mac con ottimizzazioni touch.

iPhone rimandato a fine progetto (vedi nota sopra).

**1.2 Mac+iPad condividono TUTTO.** Un solo albero `src/pages/`. Le ottimizzazioni dei punti 1-7 servono entrambi. Niente `useDevice()` sparso nei componenti, niente override puntuali Mac-vs-iPad, niente tree separati. La divergenza Mac/iPad viene gestita solo via:
- media query CSS (`@media (pointer: coarse)`, `@media (hover: none)`)
- tap target generosi che vanno bene su entrambi
- helper altezza unico

**1.3 Detection device: NESSUNA adesso.** Non introduciamo hook `useDevice`, non aggiungiamo routing condizionale, non creiamo cartelle `pages/mobile/`. Un solo `App.jsx`, un solo tree, una sola esperienza responsive. Quando sar il momento di iPhone valuteremo se fare detection viewport o altro — per ora sarebbe architettura inutile.

**1.4 Backend zero modifiche.** FastAPI, DB, migrazioni, rotte API, auth JWT, modules.json, ruoli: tutto invariato. Il lavoro  100% frontend.

---

## 2. Viewport target di riferimento

### 2.1 Risoluzioni iPad landscape (esclusi mini)

| Modello | Viewport CSS (landscape) |
|---|---|
| iPad Pro 13" (M4) | 1376x1032 |
| iPad Air 13" (M2/M3) | 1366x1024 |
| iPad Pro 11" (M4) | 1210x834 |
| iPad Pro 11" (2018-2022) | 1194x834 |
| iPad Air 11" (M2/M3) | 1180x820 |
| iPad 10/11 generazione | 1180x820 |

**Denominatore minimo:** 1180x820. Qualunque layout entri in 1180x820 entra in tutti gli iPad non-mini.

### 2.2 Rettangolo "sicuro" su entrambi (Mac 1280x800 + iPad)

- **Larghezza:** bottleneck iPad → **1180 px**
- **Altezza:** bottleneck Mac → **800 px** (lordi), **~730 px** effettivi su iPad Safari con tab/URL bar estese

**Target di lavoro:** 1180x730 senza scroll, 1180x800 con scroll accettato.

### 2.3 Breakpoint Tailwind rilevanti

Tailwind default: `sm` 640, `md` 768, `lg` 1024, `xl` 1280, `2xl` 1536.

Corrispondenza al piano:
- `lg` (1024) → tutti gli iPad landscape + Mac (si attiva sempre nel nostro target)
- `xl` (1280) → solo Mac e iPad Pro 13"/Air 13" (utile per decidere cosa mostrare in pi sui grandi)

Non serve aggiungere breakpoint custom. Non serve un breakpoint "iPhone" finch non iniziamo quel lavoro.

---

## 3. Piano 7 punti — DA ESEGUIRE NELLA SESSIONE 27

Ogni punto  self-contained: file da toccare, approccio, rischio, test.

### Punto 1 — Helper altezza viewport unico

**Problema oggi.** 6+ pagine usano `calc(100vh - Npx)` con magic number inconsistenti (48, 49, 88, 180). Tre bug in uno: (a) 100vh su iOS Safari include l'area coperta dalla URL bar dinamica, (b) i 48/49 presuppongono header fisso ignorando il banner "viewer read-only" (~24px in pi), (c) se domani cambia l'altezza dell'header, 5 file diventano sbagliati senza errore.

**Approccio.** Nuovo hook `src/hooks/useAppHeight.js`:
- misura `window.innerHeight - headerEl.offsetHeight` al mount
- `window.addEventListener('resize')` + `orientationchange`
- opzionale: `ResizeObserver` sul `<main>` per gestire cambio altezza header (banner viewer)
- mette `document.documentElement.style.setProperty('--app-h', value + 'px')`
- fallback iniziale: `100dvh` (meglio di 100vh su iOS)

**File da toccare** (sostituire `calc(100vh - Npx)` con `var(--app-h)` o `100dvh`):
- `frontend/src/pages/acquisti/FattureElenco.jsx:221` — calc(100vh - 48px)
- `frontend/src/pages/acquisti/FattureFornitoriElenco.jsx:309` — calc(100vh - 48px)
- `frontend/src/pages/controllo-gestione/ControlloGestioneUscite.jsx:703` — calc(100vh - 49px)
- `frontend/src/pages/dipendenti/DipendentiAnagrafica.jsx:210` — calc(100vh - 49px)
- `frontend/src/pages/vini/MagazzinoVini.jsx:1053` — calc(100vh - 88px)
- `frontend/src/pages/controllo-gestione/ControlloGestioneRiconciliazione.jsx:126` — minHeight: calc(100vh - 180px)
- `frontend/src/components/riconciliazione/FattureDettaglio.jsx` — style height: "88vh"

**Registrazione hook:** in `App.jsx` o in un componente wrapper sopra il router. Va inizializzato una sola volta.

**Rischio.** Basso. Fallback sempre `100dvh`. Se l'hook fallisce, peggio caso torna al comportamento di oggi.

**Test.** Mac 1280x800, iPad Air 11" landscape (simulato o reale), Mac con utente `viewer` attivo (per verificare gestione banner extra).

**Perch parte per primo.** Tutti gli altri punti dipendono dall'avere un'altezza affidabile. I tap target comodi non servono a niente se il contenuto finisce dietro la URL bar.

---

### Punto 2 — Header menu touch-compatibile

**Problema oggi.** `Header.jsx`  un mega-menu con dropdown su `onMouseEnter` e flyout sotto-menu con "intent detection". Su iPad (nessun hover): il primo tap naviga direttamente alla dashboard modulo, il flyout con i sotto-menu non appare mai. Risultato: **su iPad non raggiungi mai le sotto-pagine dei moduli dall'header.**

**Approccio.** In `Header.jsx` al mount:
```js
const isTouch = matchMedia("(hover: none) and (pointer: coarse)").matches;
```
Se `isTouch`:
- `onMouseEnter` → no-op
- Il primo click sulla riga modulo apre/chiude il flyout (toggle state)
- Il click sul bottone "Vai alla dashboard" (esplicito, dentro il flyout) naviga
- Click fuori chiude il flyout

Se non touch: comportamento attuale invariato (hover nativo).

**File:** `frontend/src/components/Header.jsx`

**Rischio.** Medio. Regressioni sul desktop se `matchMedia` sbaglia. Mitigazione: `(hover: none) and (pointer: coarse)`  pi preciso, esclude Mac con trackpad (pointer fine).

**Test.** Mac normale (hover deve funzionare come oggi), iPad reale (tap deve aprire flyout senza navigare).

**Impatto percepito.** Questo  il cambiamento pi visibile per chi usa iPad. Sblocca met dell'app.

---

### Punto 3 — Tooltip hover → popover componente

**Problema oggi.** 98 occorrenze di `title="..."` in 38 file. Su iPad il tooltip nativo HTML non appare al tap: tutte le icone senza label testuale sono mute.

**Approccio.** Nuovo componente `frontend/src/components/Tooltip.jsx`:
- Wrapper che su Mac usa `title` nativo (nessuna modifica percepita)
- Su touch mostra un piccolo popover al tap prolungato, o aggiunge un'icona info esplicita
- Detection interna via `matchMedia`

**Priorit:** NON tutti i 98 punti, solo quelli critici (icone senza label testuale adiacente). Da identificare durante la sessione operativa. Stima: 15-20 occorrenze.

**File candidati primari:**
- Header (icona cambio PIN in alto a destra)
- Tabelle con icone azione (modifica, elimina, dettaglio)
- Badge di stato colorati senza label

**Rischio.** Basso. I `title` rimanenti restano innocui su Mac, muti su iPad ma non rotti.

---

### Punto 4 — Input font-size 16px su touch (no zoom iOS)

**Problema oggi.** iOS Safari zooma automaticamente se un input ha `font-size < 16px`. Gli input delle sidebar filtri sono `text-[11px]` → tap su "Anno" o "Mese"  un saltello zoom fastidioso.

**Approccio.** Regola CSS globale in `frontend/src/index.css`:
```css
@media (pointer: coarse) {
  input,
  select,
  textarea {
    font-size: 16px;
  }
}
```
Su Mac (pointer fine) invariato.

**File:** `frontend/src/index.css`

**Rischio.** Basso.

**Effetto collaterale noto.** Gli input touch diventano pi alti (~28 → ~34px). Nelle sidebar filtri significa 1-2 campi in meno above-the-fold. Con il helper del punto 1 scrollano correttamente, quindi non  un problema.

**Test.** Tap su un qualsiasi `<input>` in sidebar Acquisti da iPad → non deve zoomare.

---

### Punto 5 — Tap target minimi 40-44px su controlli sidebar

**Problema oggi.** Pattern ricorrente in FattureElenco, FattureFornitoriElenco, ControlloGestioneUscite, BancaMovimenti:
```
px-2 py-1.5 text-[10px]  → bottoni ~24x60px
py-1.5 text-[11px]       → input ~28px alti
```
Sotto il minimo Apple HIG (44x44pt). Col dito su iPad sono un incubo.

**Approccio.** Sostituzioni Tailwind mirate sui controlli INTERATTIVI (non sulle label):
- `py-1 text-[10px]` → `py-2 text-[11px]` sui bottoni
- `text-[9px]` sulle label badge/pill → accettabile, non si tocca
- `text-[10px]` sui bottoni → bump a 11px
- `py-0.5 py-1` sugli input → `py-2`

**File target primari:**
- `frontend/src/pages/acquisti/FattureElenco.jsx`
- `frontend/src/pages/acquisti/FattureFornitoriElenco.jsx`
- `frontend/src/pages/controllo-gestione/ControlloGestioneUscite.jsx`
- `frontend/src/pages/controllo-gestione/ControlloGestioneScadenzario.jsx`
- `frontend/src/pages/banca/BancaMovimenti.jsx`

**Stima:** 30-40 sostituzioni.

**Trade-off.** Sidebar filtri leggermente pi lunghe in verticale. Con helper altezza scrollano, non  un problema.

**Rischio.** Basso. Cambia solo padding e font-size, niente semantica.

**Test visivo** (fondamentale): screenshot prima/dopo su Mac e iPad per verificare che i layout sidebar siano ancora compatti ma comodi.

---

### Punto 6 — Sidebar width → variabile

**Problema oggi.** `w-[280px] min-w-[280px]` hardcoded in ~15 file. Se in futuro decidiamo di portarla a 260 o 240 per dare pi spazio alle tabelle, refactor noioso.

**Approccio.** In `frontend/tailwind.config.js`:
```js
theme: {
  extend: {
    spacing: {
      'sidebar': '280px',
    },
  },
}
```
Poi find/replace globale: `w-[280px]` → `w-sidebar`, `min-w-[280px]` → `min-w-sidebar`.

**File:** `tailwind.config.js` + ~15 occorrenze nei componenti.

**Valore immediato:** zero.
**Valore strategico:** alto. Apre la strada al punto 7.

**Opzionale:** da fare solo se avanza tempo nella sessione 27. Altrimenti rimandabile a sessione successiva.

---

### Punto 7 — Tabelle critiche a 1180px

**Problema potenziale.** Su iPad 11" landscape (1180px), con sidebar 280px, restano 900px per la tabella. Alcune tabelle hanno 7-10 colonne. Rischio: scroll orizzontale.

**Approccio.** `hidden xl:table-cell` su colonne secondarie:
- Su `< 1280px` (tutti gli iPad) → colonne secondarie nascoste
- Su `≥ 1280px` (Mac, iPad Pro 13") → tutte le colonne visibili

**Definizione "secondaria"** (da confermare caso per caso):
- FattureElenco: candidate IVA, fonte XML/FIC, numero protocollo
- BancaMovimenti: candidate ID banca, riferimento esterno
- Scadenzario: candidata data emissione (conserva data scadenza)

**CONDIZIONE CRITICA:** Fare questo punto SOLO se il test su iPad reale (dopo punti 1-5) mostra davvero scroll orizzontale. Altrimenti saltare e lasciare tutto cos (rischio di nascondere colonne che Marco usa davvero, meglio non toccare).

**File target:** FattureElenco, FattureFornitoriElenco, ControlloGestioneScadenzario, ControlloGestioneUscite, BancaMovimenti.

**Rischio.** Alto se fatto senza conferma. Richiede validazione esplicita di Marco per ogni tabella e per ogni colonna candidata.

---

## 4. Stime temporali

| Fase | Sessione | Durata | Output |
|---|---|---|---|
| Punti 1-5 (core) | n27 | 2-3h | Mac+iPad gi molto pi usabili |
| Punto 6 (sidebar var) | n27 se avanza | 30 min | Tecnico, nessun effetto percepito |
| Punto 7 (tabelle) | n27 o n27.5 | 1h condizionale | Fix scroll orizzontale se emerge |

Totale stimato: **una sessione di 3-4 ore**. Eventualmente spezzabile in due sessioni pi brevi (punti 1-3 + punti 4-5/6/7).

---

## 5. Cosa NON cambia con questo piano

Per tranquillit di Marco — questi aspetti restano INTATTI:

- **Backend FastAPI** zero modifiche
- **Database, migrazioni, router API** zero modifiche
- **Auth/JWT/PIN** zero modifiche
- **Rotte URL attuali** zero modifiche (un solo dominio `trgb.tregobbi.it`)
- **modules.json / permessi utenti / ruoli** zero modifiche
- **Colori, font, palette** invariati (teal/amber/emerald/red)
- **Pattern consolidati** (`SortTh`, sidebar filtri SX, toast, `SectionHeader`, `FattureDettaglio`) invariati
- **Stack** invariato (React 18, Vite, Tailwind, FastAPI, SQLite)
- **push.sh / deploy** invariato
- **PWA Fase 0** (gi rilasciata sessione 26) invariata
- **Nessun hook `useDevice`, nessuna cartella `pages/mobile/`, nessun routing condizionale** — l'architettura attuale resta esattamente com'. iPhone fuori scope oggi.

---

## 6. Rischi principali e mitigazioni

- **useAppHeight hook sbagliato** → fallback `100dvh` sempre attivo
- **matchMedia fallace su Mac** → usare `(hover: none) and (pointer: coarse)`, esclude Mac con trackpad (pointer fine)
- **Header touch rompe regressione Mac** → mantenere hover come fallback, non sostituire. Testare su Mac dopo il cambio.
- **Tabelle punto 7 nascondono colonne critiche** → CONDIZIONE: solo se test iPad reale conferma il problema, con approvazione di Marco per ogni tabella
- **Input 16px rompe layout sidebar** → test visivo, se emerge un problema alzare scroll o ridurre numero filtri visibili simultaneamente

---

## 7. Workflow di esecuzione sessione 27 (proposto)

1. Apertura: leggere questo file, `docs/sessione.md`, `docs/problemi.md`
2. Conferma con Marco: "procedo coi punti 1-5?"
3. **Punto 1 da solo**, commit intermedio `./push.sh "ux: useAppHeight hook unico, sostituisce calc(100vh-Npx)"`
4. Test Marco su iPad reale (se disponibile)
5. **Punti 2-5 in sequenza**, commit finale `./push.sh "ux fase responsive: header touch, tooltip, input 16px, tap target sidebar"`
6. Se tempo: punto 6 con commit separato
7. Se emerge bisogno dal test: punto 7 con approvazione per singola tabella
8. Aggiornamento `docs/changelog.md` e `docs/sessione.md` a fine sessione
9. Bump versione moduli toccati in `frontend/src/config/versions.jsx` (sistema responsive v1.0)

---

## 8. File da leggere prima di eseguire

Quando apri la sessione 27, questi sono i file da leggere PRIMA di scrivere codice:

- `docs/sessione.md` — stato ultima sessione
- `docs/problemi.md` — bug aperti da Marco (prioritari)
- **Questo file** — il piano dettagliato
- `docs/analisi_app_apple.md` — contesto Fase 0 PWA e Fase 1 Capacitor (gi implementata la Fase 0 in sessione 26)
- `frontend/src/components/Header.jsx` — per capire il mega-menu attuale prima di toccarlo
- `frontend/src/pages/acquisti/FattureElenco.jsx` — esempio di pattern sidebar + tabella critica
- `frontend/src/index.css` — palette, variabili CSS, font
- `frontend/tailwind.config.js` — per aggiungere la variabile `sidebar` del punto 6

---

## 9. iPhone — nota esplicita

**Fuori scope oggi.** Marco l'ha deciso esplicitamente nella sessione 26. La versione iPhone verr affrontata quando Mac+iPad sar completato e stabile. A quel punto si valuter:
- Se serve davvero un tree mobile separato o  sufficiente una versione responsive pi spinta
- Quali moduli includere (indicazione iniziale di Marco: Prenotazioni, Clienti CRM, Cantina lite, non sala n chiusure)
- Detection viewport vs sottodominio vs altro
- Architettura (single codebase con condizioni vs tree separato vs build distinto)

Questi punti NON vanno decisi ora. Qualunque scelta fatta oggi  quasi certamente da ribaltare quando arriveremo al momento giusto.

**Quindi:** non scrivere codice iPhone, non creare cartelle mobile, non introdurre hook detection, non pensare a bottom tab bar o bottom sheet. Concentrarsi al 100% su Mac+iPad.

---

**Fine piano.** La prossima Claude che apre una sessione responsive ha qui tutto quello che serve per partire senza ricostruire la conversazione.

---

## 10. POSTMORTEM tentativo Punto 1 (sessione 26, rollbackato)

> **Importante per il prossimo Claude:** prima di rifare il Punto 1, leggi questo capitolo e segui il workflow di bisezione descritto sotto. Non rifare l'errore di committare hook + 6 file pagine in un push solo.

### Cosa abbiamo provato

Single push contenente TRE cambiamenti accoppiati:
1. Nuovo hook `frontend/src/hooks/useAppHeight.js` con `ResizeObserver` su `<header>` e setProperty `--app-h` su `document.documentElement`
2. Import + chiamata `useAppHeight()` in `App.jsx` PRIMA del return condizionale per token (per rispettare regole hook React)
3. Sostituzione di `calc(100vh - Npx)` con `var(--app-h, 100dvh)` (eventualmente meno offset locali) in 6 file: FattureElenco, FattureFornitoriElenco, ControlloGestioneUscite, DipendentiAnagrafica, MagazzinoVini, ControlloGestioneRiconciliazione

In parallelo, nello stesso push, anche la **PWA Fase 0** (manifest, icone, sw.js, meta iOS).

### Cosa è successo

- iPad: crash aprendo Cantina (MagazzinoVini)
- iPad: crash aprendo Nuova Ricetta (RicetteNuova) — pagina che NON era stata toccata dal Punto 1
- Mac: inizialmente OK, poi (dopo i tentativi di rollback parziale) crashava anche su Mac aprendo Cantina

Il fatto che RicetteNuova crashasse pur non essendo nel Punto 1 ha indicato che la causa era globale: o il SW PWA o l'hook in App.jsx, non il CSS pagina-per-pagina.

### Tentativi di isolamento (in ordine)

1. **Rollback altezza Cantina** (`MagazzinoVini.jsx` tornato a `calc(100vh - 88px)`) → non bastava
2. **Disabilita SW PWA** (`main.jsx` con blocco difensivo `unregister + caches.delete`) → non bastava
3. **Rollback completo Punto 1** (tolto `useAppHeight` da App.jsx, ripristinati tutti e 6 i file) → ✅ ha funzionato

Quindi la causa più probabile è **l'hook stesso**, non la PWA. Il SW potrebbe essere stato un problema secondario, ma il colpevole primario è in `useAppHeight.js`.

### Sospetti per `useAppHeight`

- **ResizeObserver loop**: l'hook setta `--app-h` in risposta al ResizeObserver del `<header>`. Se cambiare `--app-h` provoca un reflow che cambia l'altezza dell'header (banner viewer? layout shift?), entra in loop. iOS Safari WebKit è notoriamente intollerante.
- **Race header non ancora montato**: l'hook chiama `document.querySelector("header")` al primo effect, ma in App.jsx l'hook è chiamato PRIMA del return condizionale per token. Quando l'utente non è loggato non c'è header. Quando lo è, l'header viene montato dal router DOPO il primo effect dell'hook. Il `requestAnimationFrame` di fallback dovrebbe gestirlo ma forse no.
- **Fallback iOS Safari < 15.4**: `100dvh` è supportato da iOS 15.4+. Se l'iPad di Marco è più vecchio, il fallback CSS è ignorato e `var(--app-h, 100dvh)` diventa vuoto → height vuoto → layout rotto. NON spiegherebbe il crash di RicetteNuova però (che non usa `var(--app-h)`)
- **Interazione con `position: sticky` di MagazzinoVini**: thead sticky + altezza dinamica = trigger noto di reflow loops in WebKit
- **`React.StrictMode`** in `main.jsx`: in dev e prod monta i componenti due volte. L'effect dell'hook viene chiamato due volte → due ResizeObserver attivi sullo stesso header → loop?

### Workflow di bisezione obbligatorio per il prossimo tentativo (C.3)

**Passo 1 — Hook isolato, 0 file pagina**
- Commit con SOLO `useAppHeight.js` (anche con possibili modifiche per i sospetti sopra) + import + chiamata in `App.jsx`
- Nessun file pagina toccato. Le pagine continuano a usare `calc(100vh - Npx)` originale, quindi `--app-h` è settato ma nessuno lo legge
- Test: aprire OGNI pagina già esistente, in particolare Cantina e Nuova Ricetta. NIENTE deve crashare. Se crasha qui → la causa è dentro l'hook (ResizeObserver, race, StrictMode loop). Debug isolato dell'hook prima di andare avanti
- Test specifico console: aprire DevTools, cercare warning "ResizeObserver loop completed with undelivered notifications" o errori React simili
- Test specifico iOS: usare Safari devtools collegato (Mac → Safari → Develop → iPad di Marco) per leggere errori console reali su iPad

**Passo 2 — UNA pagina sostituita (la più semplice)**
- Sostituire `calc(100vh - 49px)` → `var(--app-h, 100dvh)` SOLO in `DipendentiAnagrafica.jsx` (la più piatta, niente sub-nav, niente sticky thead pesante)
- Commit + push. Test esclusivamente quella pagina su Mac e iPad
- Se crasha → il bug è in come `var(--app-h)` viene interpretato in produzione, non nell'hook. Stop e debug

**Passo 3-7 — Una pagina alla volta**
- Ordine di rischio crescente: FattureElenco → FattureFornitoriElenco → ControlloGestioneUscite → ControlloGestioneRiconciliazione → MagazzinoVini (la più pesante per ULTIMA)
- Un commit per pagina. Test della pagina specifica subito dopo il push, prima di passare alla successiva
- Se una crasha, sai esattamente quale e puoi rollbackare solo quella

### Possibili modifiche difensive da provare nell'hook (passo 1)

```js
// Anti-loop ResizeObserver: ignora un calcolo se troppo vicino al precedente
let lastTime = 0;
const measure = () => {
  const now = Date.now();
  if (now - lastTime < 100) return;
  lastTime = now;
  // ... resto
};

// Oppure: usa solo window resize, niente ResizeObserver sul header
//   (perdiamo la gestione del banner viewer ma evitiamo il loop)
```

```jsx
// In App.jsx, NON dentro App() ma sopra il root in main.jsx
// (così l'hook NON viene rieseguito ad ogni rerender di App)
```

```js
// Se il sospetto è StrictMode: usare una guardia globale
let hookInitialized = false;
export default function useAppHeight() {
  useEffect(() => {
    if (hookInitialized) return;
    hookInitialized = true;
    // ... resto
  }, []);
}
```

### File che esistono ancora dopo il rollback

- `frontend/src/hooks/useAppHeight.js` — orfano, sul disco, non importato
- Commenti residui in `App.jsx` (riga 12 import commentato, riga 130 chiamata commentata) — vanno rimossi prima di reimportare l'hook per evitare doppioni
- I 6 file pagina sono identici all'originale pre-Punto 1

### Nota su PWA Fase 0 (parallela ma separata)

La PWA Fase 0 è stata anch'essa rollbackata nello stesso giro (vedi `docs/sessione.md` sessione 26 e `roadmap.md` §33 D.4). Anche qui c'è un postmortem con sospetti diversi (cache stale-while-revalidate, CACHE_NAME senza versione). Il fix descritto in D.4 va fatto INDIPENDENTEMENTE da C.3 — sono due bug diversi.
