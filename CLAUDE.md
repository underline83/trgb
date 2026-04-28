# TRGB Gestionale — Istruzioni per Claude

## Git & Deploy — DIVIETI ASSOLUTI
- **NON fare `git commit`**. Il commit lo gestisce `push.sh` lanciato da Marco.
- **NON fare `git push`**. L'ambiente non ha accesso SSH/rete. Fallira' sempre.
- **NON fare `git add -A`**. Rischi di includere file sensibili (.env, DB).
- **Workflow**: modifica i file → suggerisci il testo del commit → Marco lancia `./push.sh "testo"`.
- Suggerisci SEMPRE il testo del commit a fine blocco di modifiche, come comando pronto da copiare: `./push.sh "testo"`.

## Ambiente
- Niente accesso alla rete: no curl, wget, npm install remoto, pip install remoto, push, fetch.
- DB SQLite in `app/data/`. Leggibili con sqlite3 per debug, ma i dati locali sono aggiornati solo dopo un push (push.sh scarica i DB dal VPS).
- Documentazione progetto in `docs/`. Leggi `docs/sessione.md` a inizio sessione.

## Comunicazione
- Marco parla in italiano. Rispondi in italiano.
- CAPS LOCK = enfasi, non rabbia.
- "caricato" = push fatto, VPS aggiornato.
- Se qualcosa non funziona dopo il push: chiedi di refreshare con Ctrl+Shift+R.

## Refactor monorepo — gestione operativa (in corso, da sessione 60)

> **Documento completo:** `docs/refactor_monorepo.md` — leggere PRIMA di iniziare qualsiasi sessione di sviluppo.
>
> **Razionale:** TRGB serve sia all'osteria di Marco (cliente zero, su `trgb.tregobbi.it`) sia a diventare prodotto vendibile (su `trgb.it`). Il refactor separa `core/` (prodotto generico) da `locali/tregobbi/` (personalizzazioni Tre Gobbi) e introduce `locali/trgb/` (istanza pulita prodotto). 8 sessioni "R" (R1-R7 architettura locale + R8 architettura modulare), ognuna deployabile indipendentemente.

### Stato corrente del refactor
Vedi tabella in `docs/refactor_monorepo.md` §6. Aggiornare lo stato di ogni R a chiusura sessione.

### Disciplina obbligatoria su nuove feature

Da R1 in poi (anche se R1 non è ancora pushato), per OGNI feature/fix nuovo Claude DEVE classificare il lavoro in una di queste 3 categorie e scriverlo nel commit message:

1. **`[core]`** — Logica di prodotto generica, riusabile per qualsiasi ristorante. Esempi: nuovo endpoint API, nuovo componente UI, mattone condiviso, fix di logica business standard.
2. **`[locale:tregobbi]`** — Personalizzazione specifica dell'osteria di Marco. Esempi: brand assets, palette colori, dati seed Tre Gobbi, dominio, deploy VPS, testi italiani specifici.
3. **`[mixed]`** — Tocca entrambi (es. una feature core + un suo seed in tenant). Va dichiarato e in commit dedicato per ciascuna parte se possibile.

Se Claude non sa rispondere alla domanda "questa feature dove va?", DEVE chiedere a Marco prima di scrivere codice. Vietato decidere da soli.

### Regole inderogabili durante R1-R8

- **Una sessione = una direzione.** O sessione "R" (refactor), o sessione "feature/bug". Mai mischiare nello stesso commit.
- **Bug fix urgenti hanno SEMPRE precedenza.** Si ferma R, si fixa nel codice corrente, si pusha, si riprende R.
- **Mai rimuovere file in modo distruttivo durante R.** Si copia con alias temporaneo, si verifica, in R7 si ripulisce.
- **Migrazioni DB durante R: solo idempotenti, solo ADD COLUMN.** Niente DROP, niente RENAME su DB live.
- **Nuovi moduli durante R3-R5: meglio rinviare se grossi.** Bug fix e ritocchi piccoli OK.
- **`/guardiano push` per ogni sessione R.** Pre-audit + push.sh + post-audit + update di `docs/refactor_monorepo.md` §6 (stato sessione + commit hash + data).
- **Path locale futuro:** `locali/tregobbi/{branding.json, strings.json, seeds/, deploy/, data/, assets/, moduli_attivi.json}`. Niente file TRGB-specific in `core/` da R1 in poi.
- **Strategia work:** una sola cartella `/Users/underline83/trgb/`, lavoro incrementale su `main`. Niente branch refactor lunghi, niente cartelle parallele. Ogni R è un commit deployabile, rollback con `git revert` se rompe.

### Cosa significa "core" e "locale" oggi
Pre-R1, la struttura `core/` non esiste ancora. Tutto è in `app/` e `frontend/src/`. Ma la domanda "core o locale?" si applica già: se aggiungi una stringa "Osteria Tre Gobbi" hardcoded oggi, sai che dovrai spostarla in R5 — quindi meglio usarla via futuro helper `t()` quando arriva R5, o almeno isolarla in un punto.

## Architettura modulare — disciplina codice DA OGGI

> **Documento completo:** `docs/refactor_monorepo.md` §3 R8 + §5.

TRGB è strutturato come **monolite modulare con feature flags per locale**. Cliente compra "solo Vini" → vede solo Vini, il resto inesistente per lui. Il sistema di feature flags (`module_loader`) si implementa in R8, ma la **disciplina di codice si applica DA OGGI** per ogni feature nuova.

### I moduli vendibili (mappa attuale)

13 moduli + platform. Vedi tabella in `docs/refactor_monorepo.md` §3 R8 per dettagli (id, nome utente, tabelle DB, endpoint prefix):

`vini`, `ricette`, `acquisti`, `controllo_gestione`, `banca`, `dipendenti`, `prenotazioni`, `clienti`, `cassa`, `menu_carta`, `cucina`, `task_manager`, `statistiche`.

**Platform** (sempre inclusa, non vendibile da sola): auth + utenti + M.A notifiche + M.B PDF + M.C WA + M.D email + M.E calendar + M.F alert + M.G permessi + M.H import + M.I UI primitives.

### Le 5 regole di disciplina codice

Da rispettare per OGNI feature nuova, anche prima di R8:

1. **Ogni feature appartiene a UN modulo dichiarato.** All'inizio del file backend o del componente frontend, dichiarare in commento: `# Modulo: vini` o `// Modulo: cucina`. Se non sai a quale modulo appartiene, CHIEDI a Marco prima di scrivere.
2. **Niente import diretti tra router di moduli diversi.** `app/routers/vini_router.py` non importa da `app/routers/foodcost_router.py`. Se serve dato cross-modulo, passare via servizio platform (`app/services/`) o via evento.
3. **Tabelle DB iniziano col prefisso del modulo.** `vini_*`, `dipendenti_*`, `cg_*` (Controllo Gestione), `pranzo_*`, `menu_carta_*`, `cucina_*`, `lista_spesa_*`, `tasks_*`. Tabelle generiche cross-modulo (es. `audit_log`, `notifiche`, `users`) vivono in platform.
4. **Comunicazione cross-modulo via servizi platform o eventi.** Se modulo A ha bisogno di dato del modulo B, NON chiamare direttamente l'altro modulo: o si passa via un servizio platform condiviso, o via evento (`crea_notifica`, `import_engine`, ecc.). Eccezione: il modulo cross-aggregatore `statistiche` può leggere dati di altri moduli read-only.
5. **Ogni modulo ha (o avrà a R8) un `module.json` di manifesto** con: id, nome, versione, dipendenze platform, dipendenze opzionali, tabelle DB, endpoint prefix, frontend route. Pre-R8: scrivere queste informazioni in commento all'inizio del router principale del modulo, così a R8 si raccolgono in un sol colpo.

### Cosa significa "modulo" oggi

Pre-R8, non c'è ancora `core/moduli/<id>/` come cartella. Ma le 5 regole sopra sono attive da subito. Se aggiungi una feature al modulo Vini oggi, scrivila come se domani il `module_loader` la dovesse trovare nel suo modulo: nessun import casuale, prefisso DB rispettato, classificazione esplicita.

Se Claude non sa rispondere a "questa feature dove va?", deve CHIEDERE a Marco. Vietato decidere da soli.

## Stack e convenzioni codice
- **Backend**: FastAPI (Python 3.12) + SQLite. Entry point: `main.py`.
- **Frontend**: React 18 + Vite + TailwindCSS. No CSS separati. Componenti funzionali con hooks.
- **API calls**: sempre tramite `API_BASE` da `config/api.js`. Mai URL hardcoded. **TRAILING SLASH OBBLIGATORIO** su endpoint root dei router (es. `/vini/magazzino/` non `/vini/magazzino`). FastAPI fa 307 redirect e il browser perde l'header Auth → 401 → crash. Regola: se l'endpoint backend è `@router.get("/")` su un router con prefix, la chiamata FE DEVE avere lo slash finale.
- **Auth**: JWT con `Depends(get_current_user)` su ogni endpoint.
- **Pattern UI consolidati**: `SortTh`/`sortRows` per colonne ordinabili, toast per feedback, sidebar filtri a sinistra.
- **Colori Tailwind — Palette TRGB-02 (sessione 28)**:
  - `brand-red` (#E8402B) → errori, alert, gobbetta 1
  - `brand-green` (#2EB872) → successo, conferme, gobbetta 2
  - `brand-blue` (#2E7BE8) → link, azioni primarie, gobbetta 3
  - `brand-ink` (#111111) → testo principale
  - `brand-cream` (#F4F1EC) → sfondo pagine (sostituisce bg-neutral-100 / bg-gray-50)
  - `brand-night` (#0E0E10) → sfondo dark mode (futuro)
  - I colori ruolo (amber admin, cyan contabile, purple sommelier, rose sala, emerald chef, slate viewer) restano invariati
- **Logo/brand nel codice**:
  - Header: `import TrgbIcon from "../assets/brand/TRGB-02-icon-transparent.svg"` — icona gobbette+T
  - Wordmark (Home, Login): composto inline con SVG gobbette + `<span>TRGB</span>` in Helvetica Neue 800 — NON usare il file wordmark SVG (ha problemi di viewBox con `<text>`)
  - Loader: `<TrgbLoader />` da `components/TrgbLoader.jsx` — gobbette animate pulse, usarlo per loading di pagina
  - Strip decorativa: `assets/brand/TRGB-gobbette-strip.svg` (viewBox corretto)
  - Sfondo pagine: SEMPRE `bg-brand-cream`, MAI `bg-neutral-100` / `bg-gray-50`
  - Grafici Recharts: serie anno corrente `#2E7BE8` (brand-blue), serie precedente `#d1d5db`. Categorie: partire da red/green/blue brand
- **Asset brand**: tutti in `frontend/src/assets/brand/` (SVG) e `frontend/public/icons/` (PNG favicon/PWA)

## Home v3.3 Originale Potenziato — Regole design (sessione 30)
La Home ha due pagine con swipe (widget + moduli). Regole per tutti gli agenti:
- **Emoji + colori da `modulesMenu.js`**: ogni card modulo usa `menu.icon` (emoji) e `menu.color` (classi Tailwind bg/border/text). Stessi colori del dropdown menu nell'header → identità visiva coordinata
- **NO icone SVG nei moduli Home**: le icone SVG `icons.jsx` restano per il resto dell'app, ma Home usa emoji
- **Hero card**: Prenotazioni è hero (span 2 col) con emoji + colore coordinato
- **Griglia responsive**: 3 colonne su landscape/desktop (md:grid-cols-3), 2 su portrait (grid-cols-2)
- **Dati dinamici**: endpoint `GET /dashboard/home` campo `moduli[]` con `key, line1, line2, badge`. Fallback statico in `MODULE_FALLBACK` quando backend non ha dati
- **Card moduli**: sfondo tintato colorato, border colorato, border-radius 14px, shadow `0 2px 10px rgba(0,0,0,.06)`, emoji 28px, titolo completo, 2 righe dati, badge rosso notifica
- **Widget pagina 1**: card bianche con bordi colorati coordinati (es. prenotazioni → border-indigo-200), emoji nei label
- **Azioni rapide**: emoji + sfondo colorato come i moduli, stesse classi Tailwind
- **Titoli pagina**: Playfair Display 700 (già caricato). Tutto il resto: font di sistema
- **Touch target**: minimo 44pt, bottoni 48pt, righe lista ≥ 44pt
- **DashboardSala**: stesso stile originale potenziato (emoji + colori modulesMenu)

## Mattoni condivisi — USARE SEMPRE, MAI RISCRIVERE
> Documento completo: `docs/architettura_mattoni.md`

Servizi riutilizzabili gia' implementati. Prima di scrivere codice che fa queste cose, USARE il mattone esistente:

- **M.A Notifiche** (sessione 31): `from app.services.notifiche_service import crea_notifica`. Frontend: `useNotifiche()` hook. DB: `notifiche.sqlite3`. Serve per avvisare lo staff di qualsiasi evento (preventivi, prenotazioni, scadenze, alert).
- **M.C WA composer** (sessione 31):
  - Frontend: `import { openWhatsApp, buildWaLink, fillTemplate, WA_TEMPLATES } from "../utils/whatsapp"`. MAI costruire `wa.me/` a mano.
  - Backend: `from app.utils.whatsapp import build_wa_link, normalize_phone, fill_template`. MAI fare `.replace(" ","").replace("-","")` sul telefono a mano.
- **M.B PDF brand**: DA FARE. Quando serve generare PDF, attendere questo mattone.
- **M.D Email service**: DA FARE. Quando serve inviare email, attendere questo mattone.
- **M.E Calendar component**: DA FARE. Quando serve vista calendario, attendere questo mattone.
- **M.F Alert engine** (sessione 40): `from app.services.alert_engine import run_all_checks, run_check`. Config da DB (`alert_config` in notifiche.sqlite3). Per aggiungere un checker: decorare con `@register_checker("nome")`, firma `(dry_run: bool, config: dict) -> CheckResult`. Router: `/alerts/config/` (CRUD), `/alerts/check/` (dry-run), `/alerts/run/` (con notifiche). UI config: tab "Notifiche" in Impostazioni Sistema.
- **M.I UI primitives** (sessione 2026-04-18): `import { Btn, PageLayout, StatusBadge, EmptyState } from "../../components/ui"`. Opt-in: pagine nuove li usano, pagine esistenti restano com'erano finche' non le si tocca. `<Btn variant size tone as loading>`, `<PageLayout title subtitle actions toolbar nav wide>`, `<StatusBadge tone size dot>`, `<EmptyState icon title description action watermark>`. Touch target 44pt su `Btn size="md|lg"`. Focus ring brand-blue. Niente duplicazioni di `bg-xxx-100 text-xxx-700 border` sparse.

**Regola:** se un modulo ha bisogno di una funzionalita' coperta da un mattone non ancora implementato, CHIEDERE a Marco se costruirlo prima o fare inline temporaneo.

## Migrazioni DB
- File: `app/migrations/NNN_nome.py`, tracciate in `schema_migrations` di `foodcost.db`.
- Una migrazione eseguita NON viene rieseguita. Per correggere, crea una nuova migrazione.
- Controlla sempre se la colonna esiste prima di ALTER TABLE (try/except).

## Campi escluso — REGOLA CRITICA
- `fe_fornitore_categoria.escluso` → SOLO per modulo Ricette/Matching.
- `fe_fornitore_categoria.escluso_acquisti` → SOLO per modulo Acquisti.
- NON mescolare mai i due campi.

## Dopo ogni modifica
- Aggiornare `docs/changelog.md` se rilascio significativo.
- Aggiornare `docs/sessione.md` a fine sessione.
- Aggiornare `frontend/src/config/versions.jsx` se cambia versione di un modulo.
