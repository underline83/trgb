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
