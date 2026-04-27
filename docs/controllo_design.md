# TRGB — Controllo Design

> **Scopo**: registro vivo delle scelte estetiche/UX pendenti, dei ritocchi grafici da fare, e delle parti dell'app che richiedono un passaggio di "design parity" per essere uniformi al resto.
>
> **Quando lavorare qui**: ogni volta che si tocca grafica/estetica/UI, controllare se ci sono voci risolvibili in questa sessione.
>
> **Mantenuto da**: il "modulo guardiano" — Claude rivede questo file a inizio sessione design, Marco approva i passaggi.
>
> **Creato**: 2026-04-25 (sessione 57 cont.)

---

## 1. Pattern testa+tab — schede non ancora refactorate

**Stato**: 5 schede già passate al pattern testa fissa colorata + linguette tab + footer sticky:
- `SchedaVino.jsx` (S55)
- `FattureDettaglio.jsx` (S56)
- `FornitoreDetailView` dentro `FattureFornitoriElenco.jsx` (S56)
- `MenuCartaDettaglio.jsx` (S57)
- `RicetteDettaglio.jsx` (Modulo E, 2026-04-27) — testa orange + 4 KPI (Costo totale / Costo per unità / Prezzo / Food Cost) + tab (Composizione / Servizi / Note / Storico)

**Da fare** (quando si toccano per altro motivo, opportunisticamente):
- `ClientiScheda.jsx` — oggi pattern sidebar scura, simile al vecchio SchedaVino. Marco ha esplicitamente detto in S55 che vuole rivederla in futuro.
- `ControlloGestioneUscite.jsx` (vista uscita lato sinistro split) — stesso pattern vecchio. Quando si refactora, verificare che la vista fattura a destra (già aggiornata in S56) e la vista uscita a sinistra restino coerenti.

**Specifiche pattern**:
- Testa colorata sticky con badge identità + 4 KPI in `grid-cols-2 md:grid-cols-4` (2×2 portrait iPad, 1×4 landscape).
- Tab bar `overflow-x-auto whitespace-nowrap` su portrait stretto.
- Footer sticky con azioni primarie (`Btn size="md"` per touch 44pt).
- Anti-matrioska: lo state di apertura sub-scheda vive nel CONTAINER, mai nidificato. Se serve navigazione 3-livelli, usare la prop `breadcrumb`.

---

## 2. Dark mode

**Stato**: roadmap 8.4 "FUTURO". Asset già pronti: `brand-night #0E0E10` in tailwind, `TRGB-pattern-gobbette-A-dark.svg`, palette ruoli teoricamente compatibile.

**Da decidere**:
- Switch utente in profilo o automatico via media query `prefers-color-scheme`?
- Toggle persistente in localStorage?
- Quali pagine restano sempre light (PDF preview, stampe)?
- Coerenza con palette TRGB-02 anche su brand-cream → brand-night swap?

**Effort stimato**: L (sessione lunga, tocca tutta la app).

---

## 3. Tool configurazione stampe (M.B estensione)

**Stato**: roadmap 8.14 "DA FARE". Marco vuole poter cambiare logo/footer/copy dei PDF generati da M.B senza toccare codice (es. logo natalizio, promo stagionale, cambio indirizzo).

**Specifica**:
- UI dedicata in Impostazioni con: scelta logo (wordmark / icon only / nascosto), testo organizzazione (nome+sub), testo footer `@page`, colori accent, toggle strip gobbette, toggle "Generato il ...", campo note libero.
- Persistenza in tabella `pdf_settings` (org-wide, in foodcost.db o settings.sqlite3 da decidere).
- Endpoint `GET/PUT /pdf-settings`.
- `pdf_brand._context_base()` legge da DB invece che hardcoded.
- Selettore per-tipo-documento (preventivo / ricetta / menu carta / inventario) per override per tipo.
- Preview live nella pagina settings.

**Effort**: M (1 sessione).

**Eccezioni**: Carta Vini ha motore separato, NON deve essere personalizzabile da qui.

---

## 4. Home per ruolo — widget grafici personalizzati

**Stato**: Home v3.6 ha emoji + colori da `modulesMenu.js`, e `home_actions` (azioni rapide configurabili per ruolo) sono già in DB. Roadmap 8.10 chiede di estendere alla **personalizzazione widget**.

**Da fare** (futuro):
- Widget configurabili per ruolo: prenotazioni (già hero per admin/sala), incassi (admin/contabile), alert vini sottoscorta (sommelier), task cucina (chef/sous_chef/commis), comunicazioni bacheca.
- Pinning per utente: utente fissa i widget che gli interessano.
- Hero card config: oggi Prenotazioni è hero per tutti, vorremmo per ruolo (sommelier hero = Cantina, chef hero = Cucina).
- Template copia da ruolo a ruolo (es. "applica config admin a contabile").

**Effort**: M-L. **Pre-requisito**: nessuno, l'infrastruttura `home_actions` è già pronta da estendere.

---

## 5. PWA → app ufficiale (alzata di priorità su richiesta Marco S57 cont.)

**Stato**: roadmap 1.1 era "DA FARE". Marco ha esplicitamente detto di alzare priorità.

**Phase 0 — PWA installabile** (effort S):
- Riscrivere `frontend/public/sw.js` come network-first (asset e icone PWA già pronte).
- Verificare manifest, splash screens iOS, theme-color.
- Test su iPad reale (1.2).
- Beneficio: utenti possono "installare" il gestionale come app via Safari → Aggiungi a Home.

**Phase 1 — Capacitor wrapper nativo** (effort L, bloccato da Apple Developer $99/anno):
- Wrapper Capacitor attorno alla PWA per pubblicarla su TestFlight/App Store.
- Decisione: vale i $99/anno per ufficializzare? Marco confermare.

**Phase 2 — decisione SwiftUI nativo** (8-14 mesi, scenari D/E del doc `analisi_app_apple.md`): da valutare a fine 2026 dopo un anno di uso reale della PWA.

---

## 6. WAL mode esteso a tutti i DB (segnalato S57 cont. 2026-04-25)

**Stato**: WAL già attivo su `vini_magazzino`, `notifiche`, `foodcost`, `vini`, `vini_settings`. Mancano: `bevande`, `clienti`, `tasks`, `settings`, `dipendenti`, `admin_finance` (roadmap 1.11.2).

**Da fare**: applicare uniformemente i 3 PRAGMA standard (`journal_mode=WAL`, `synchronous=NORMAL`, `busy_timeout=30000`) in ogni `get_xxx_connection()`. Pattern in `docs/architettura_pattern.md` §2.

**Why**: protegge da SIGTERM mid-write durante restart `push.sh` (causa delle 5 corruzioni S51-S53).

**Effort**: S. Low-risk perché identico al fix già in produzione. Da fare in batch in una sessione tecnica dedicata oppure opportunisticamente quando si tocca un singolo DB.

**Tracciato anche in**: `docs/inventario_pulizia.md` (sezione "TODO Wave WAL mode 1.11.2") con tabella di coverage.

---

## Note metodologiche

- **Quando si tocca grafica**: prima leggere questo file. Se la modifica risolve un punto, spuntarlo + commit nello stesso push.
- **Quando emerge una scelta estetica nuova**: aggiungerla qui prima di lavorarci, allineare con Marco, poi scrivere codice.
- **Mockup HTML statici**: per scelte visive non banali (es. variante D.3 della TOC carta vini), preferire mockup in `docs/mockups/` prima di toccare React.
- **Palette**: SEMPRE TRGB-02 (`brand-red`, `brand-green`, `brand-blue`, `brand-ink`, `brand-cream`, `brand-night`). I 6 colori ruolo (amber/cyan/purple/rose/emerald/slate) restano invariati come affordance funzionale.
