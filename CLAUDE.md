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
- **Colori Tailwind**: teal primario, amber warning, emerald successo, red errore.

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
