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
- **API calls**: sempre tramite `API_BASE` da `config/api.js`. Mai URL hardcoded.
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

## Home v3 — Regole design (sessione 29)
La Home è in fase di redesign: due pagine con swipe (widget + moduli). Regole per tutti gli agenti:
- **NO emoji nei moduli**: le tile usano icone SVG da `icons.jsx` (stroke 1.5, monocromatiche). Emoji ammesse solo in testi/note
- **Colori moduli SMORZATI**: NON usare i colori Tailwind saturi (es. amber-50, teal-50). Usare la palette muted definita in Home.jsx v5 (es. Vini #B8860B, Acquisti #2D8F7B)
- **Card/Widget**: bg bianco, border-radius 14px, shadow minima `0 1px 3px rgba(0,0,0,.04)`, niente bordi pesanti
- **Gobbetta brand sulle tile**: linea 2px in alto, cicla R/G/B, opacity .5
- **Titoli pagina**: Playfair Display 700 (già caricato). Tutto il resto: font di sistema
- **Label sezioni widget**: 10px uppercase, letter-spacing 1.2px, warm gray `#a8a49e`
- **Touch target**: minimo 44pt, bottoni 48pt, righe lista ≥ 44pt
- **Piano completo**: vedi `docs/sessione.md` sezione "HOME v3 REDESIGN"

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
