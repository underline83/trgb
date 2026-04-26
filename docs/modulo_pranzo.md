# Modulo Pranzo del Giorno — design + uso

**Versione:** 1.0 (sessione 58 cont., 2026-04-26)
**Stato:** alpha — in test cucina/sala
**Ruoli destinatari:** chef/admin/superadmin (gestione completa), sous_chef/commis (gestione), sala/sommelier (sola lettura via dropdown)
**Posizione UI:** sub-voce di Gestione Cucina (tab `RicetteNav`, dropdown header, route `/pranzo`)

Sostituisce il workflow Word (`2025-new-tregobbi-pranzo.docx`) per il menu del pranzo di lavoro: catalogo piatti riusabili + composizione menu giornaliero + archivio storico + PDF brand cliente Osteria Tre Gobbi.

---

## Scopo

L'osteria pubblica ogni giorno (lun-ven) un menu pranzo "del mercato" con piatti che ruotano in funzione degli acquisti del giorno + un box "Menù Business" a tre prezzi (1/2/3 portate). Prima di questo modulo:

- Marco aggiornava un `.docx` a mano, lo stampava o esportava in PDF.
- Niente storico: i menu passati erano file persi nella cartella Word.
- Nessuna riusabilita': i piatti ricorrenti venivano riscritti ogni volta.

Il modulo digitalizza il flusso e tiene traccia.

### Cosa fa

1. **Catalogo piatti riusabili** con categoria semantica (antipasto/primo/secondo/contorno/dolce/altro). Pre-seedato con i 6 piatti del Word storico.
2. **Editor menu del giorno** (data picker), composizione drag-free con righe ordinabili. Si possono pescare piatti dal catalogo (chip cliccabili) o aggiungere righe ad-hoc per piatti che girano una volta sola.
3. **Override per giorno**: titolo, sottotitolo, prezzi, footer possono essere riscritti per il singolo giorno; senza override valgono i default (configurati in Impostazioni Cucina).
4. **Archivio cronologico** con filtro data-da / data-a, ristampa PDF di un giorno passato, riapertura editor.
5. **PDF brand cliente Osteria Tre Gobbi** (NON brand TRGB-02 software): font Cormorant Garamond, sfondo bianco, logo Tre Gobbi, A4 verticale. Coerente con la carta vini cliente.

### Cosa NON fa (rimandato)

- Ricalcolo food cost / margine del menu: oggi `pranzo_piatti.recipe_id` esiste ma non e' agganciato. Per legare i piatti alle ricette del food cost servira' una linguetta nella scheda piatto (V1).
- Pubblicazione automatica al cliente (sito / QR menu / email): solo PDF stampabile, no diffusione.
- Multi-edizione (es. menu pranzo speciale per evento): un solo menu per data (UNIQUE su `pranzo_menu.data`).
- Note allergeni stampate: il PDF non li mostra, l'osteria li comunica a voce.

---

## Schema DB (foodcost.db, mig 102)

```
pranzo_piatti
├── id INTEGER PK
├── nome TEXT
├── categoria TEXT  CHECK in (antipasto, primo, secondo, contorno, dolce, altro)
├── attivo INTEGER 0/1   (soft delete)
├── note TEXT            (interne, non stampate)
├── recipe_id INTEGER    FK recipes.id ON DELETE SET NULL  -- non agganciato in v1.0
├── created_at, updated_at
└── INDEX(attivo), INDEX(categoria)

pranzo_menu
├── id INTEGER PK
├── data TEXT UNIQUE     YYYY-MM-DD — un solo menu per giorno
├── titolo TEXT          override del titolo default
├── sottotitolo TEXT     override
├── prezzo_1, prezzo_2, prezzo_3 REAL    Menù Business
├── footer_note TEXT     override footer
├── stato TEXT           CHECK in (bozza, pubblicato, archiviato)
├── created_by TEXT
├── created_at, updated_at
└── INDEX(data DESC), INDEX(stato)

pranzo_menu_righe
├── id INTEGER PK
├── menu_id INTEGER      FK pranzo_menu(id) ON DELETE CASCADE
├── piatto_id INTEGER    FK pranzo_piatti(id) ON DELETE SET NULL — NULL se ad-hoc
├── nome TEXT            snapshot — sopravvive alla cancellazione del piatto
├── categoria TEXT       snapshot
├── ordine INTEGER       0..N
├── note TEXT
└── INDEX(menu_id, ordine)

pranzo_settings  (riga unica id=1, default globali)
├── id INTEGER PK CHECK (id = 1)
├── titolo_default TEXT
├── sottotitolo_default TEXT
├── titolo_business TEXT
├── prezzo_1_default, prezzo_2_default, prezzo_3_default REAL
├── footer_default TEXT
└── updated_at
```

Snapshot del nome+categoria nelle righe e' deliberato: se un piatto del catalogo viene rinominato o eliminato in futuro, l'archivio storico continua a mostrare cosa c'era effettivamente quel giorno.

---

## Endpoint API (FastAPI, prefix `/pranzo`)

Tutti richiedono `get_current_user`. Le scritture richiedono ruolo `superadmin | admin | chef`.

### Catalogo piatti
- `GET    /pranzo/piatti/?solo_attivi=true` — lista catalogo
- `POST   /pranzo/piatti/` — crea piatto `{nome, categoria, note?, recipe_id?}`
- `PUT    /pranzo/piatti/{id}` — modifica
- `DELETE /pranzo/piatti/{id}?hard=false` — soft delete (attivo=0). `?hard=true` elimina davvero.

### Menu del giorno
- `GET    /pranzo/menu/?data_da=&data_a=&limit=200` — archivio cronologico (testate, no righe)
- `GET    /pranzo/menu/oggi/` — shortcut alla data odierna
- `GET    /pranzo/menu/{YYYY-MM-DD}/` — menu della data, righe incluse
- `POST   /pranzo/menu/` — upsert (crea se nuova data, sostituisce se esiste)
- `DELETE /pranzo/menu/{YYYY-MM-DD}/` — elimina menu del giorno
- `GET    /pranzo/menu/{YYYY-MM-DD}/pdf/` — genera PDF brand cliente (`application/pdf`)

### Settings
- `GET    /pranzo/settings/` — default globali
- `PUT    /pranzo/settings/` — aggiorna (admin only)

---

## Frontend

### Pagina principale `/pranzo`
File: `frontend/src/pages/pranzo/PranzoMenu.jsx`

Tre tab:
- **Oggi** — date picker, editor del menu del giorno. Quick-add da catalogo (chip cliccabili filtrabili per categoria), riga ad-hoc, riordino ▲/▼, ordinamento automatico per categoria, salvataggio inline. Click "📄 PDF" apre il PDF in nuova tab.
- **Archivio** — tabella cronologica con filtri data-da/data-a, badge stato, link PDF e Apri (riapre il giorno in tab Oggi).
- **Catalogo** — CRUD piatti riusabili raggruppati per categoria, soft delete (✕ disattiva).

Wrapper: `<RicetteNav current="pranzo"/>` in cima + `bg-brand-cream` + card `bg-white shadow-2xl rounded-3xl border-neutral-200`. Niente `PageLayout`: pattern coerente con `RicetteArchivio` / `RicetteSettings`.

### Impostazioni — vivono in `/ricette/settings`
File: `frontend/src/pages/ricette/PranzoSettingsPanel.jsx` montato come voce `pranzo` nel `MENU` di `RicetteSettings`. Contiene: testata default, prezzi default Menù Business, footer default. Salva su `PUT /pranzo/settings/`.

**Decisione di Marco (sessione 58 cont.)**: le impostazioni dei sotto-moduli di Gestione Cucina vivono in un'unica pagina con sidebar (`RicetteSettings`), non in tab della pagina del sotto-modulo. Pattern da replicare per future aggiunte (es. menu carta dovrebbe portare le sue impostazioni qui).

### Integrazione UI
- `RicetteNav.jsx` — tab "Pranzo" (icona 🥙) tra Selezioni e Matching. Aggiunto in stessa sessione anche "Menu Carta" (icona 📜) che era stato dimenticato.
- `frontend/src/config/modulesMenu.js` — voce "Menu Pranzo" sotto "Gestione Cucina" nel dropdown header.
- `app/data/modules.json` — sub `pranzo` con ruoli `superadmin/admin/chef/sous_chef/commis`.
- `frontend/src/config/versions.jsx` — entry `pranzo: 1.0 alpha`.

---

## Service PDF cliente

File: `app/services/pranzo_pdf_service.py`
CSS: `static/css/menu_pranzo_pdf.css`
Logo: `static/img/logo_tregobbi.png` (riusato dalla carta vini)

Stack: WeasyPrint + Jinja2-free (string templating semplice). Font: Cormorant Garamond (woff2 in `static/fonts/`, fallback `/usr/local/share/fonts/tre_gobbi/` su Linux/VPS).

Layout A4 verticale, margini 18×22mm:
1. Logo Osteria Tre Gobbi centrato (28mm)
2. Data estesa in maiuscoletto (es. "DOMENICA 26 APRILE 2026")
3. Titolo grande maiuscolo (default "OGGI A PRANZO: LA CUCINA DEL MERCATO")
4. Sottotitolo italico (default "Piatti in base agli acquisti del giorno, soggetti a disponibilità.")
5. Divisore decorativo `* * *`
6. Lista piatti centrata, maiuscolo, ordinata per categoria (antipasto < primo < secondo < contorno < dolce < altro). **No titoli sezione**: lista flat per stampa cliente, categorie usate solo per ordinamento.
7. Divisore decorativo
8. Box Menù Business con bordo orizzontale: 3 righe `Una|Due|Tre portate a scelta` + prezzo allineato a destra
9. Footer note italico (default "*acqua, coperto e servizio inclusi\n**da Lunedì a Venerdì")

**Brand cliente, NON brand TRGB-02 software** — coerente con `static/css/carta_pdf.css` della carta vini. Il PDF non passa per il mattone M.B (`app/services/pdf_brand.py`) che e' brand interno software.

---

## Workflow tipico (osteria)

1. Mattino, chef apre `/pranzo` → tab Oggi (data odierna preselezionata).
2. Clicca i piatti del giorno dal catalogo (filtrato per categoria), eventualmente aggiunge una riga ad-hoc per il piatto del mercato non ricorrente.
3. Riordina con ▲/▼ se necessario, oppure click "↕ Ordina per categoria" per riordinamento automatico.
4. Eventuale override prezzi/titolo/footer per il giorno.
5. Click "Crea menu" → saved.
6. Click "📄 PDF" → si apre il PDF, lo stampa o lo invia per WhatsApp.
7. A fine giorno (o ex-post): apre tab Archivio per ristampa o per recuperare un menu vecchio.

---

## Riferimenti

- Schema: `app/migrations/102_pranzo_init.py`
- Repository: `app/repositories/pranzo_repository.py`
- Router: `app/routers/pranzo_router.py`
- Service PDF: `app/services/pranzo_pdf_service.py`
- CSS PDF: `static/css/menu_pranzo_pdf.css`
- Frontend: `frontend/src/pages/pranzo/PranzoMenu.jsx`, `frontend/src/pages/ricette/PranzoSettingsPanel.jsx`
- Sub-nav: `frontend/src/pages/ricette/RicetteNav.jsx` (tab `pranzo`)
- Sessione: `docs/sessione.md` (sezione SESSIONE 58 cont.)

---

## Cose da fare (V1+)

- Aggancio `pranzo_piatti.recipe_id` ↔ `recipes` per food cost del menu (UI: dropdown ricetta in scheda piatto).
- Drag&drop al posto di ▲/▼ (mobile-friendly).
- "Clona ieri" come shortcut nell'editor (parti dal menu del giorno prima e modifichi).
- Stampa multipla (3 menu su A4) come faceva il Word originale, se Marco ricomincia a stamparli a mano.
- Endpoint pubblico `GET /pranzo/oggi/pubblico` per QR code in sala (analogo al pattern carta vini cliente).
- Notifiche M.A: ping in chat sala quando il menu del giorno viene pubblicato.
