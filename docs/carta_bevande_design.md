# Modulo Carta Bevande — TRGB Gestionale
**Versione target:** 1.0
**Stato:** In progettazione
**Data creazione:** 2026-04-19
**Data ultimo aggiornamento:** 2026-04-19
**Dominio funzionale:** Gestione editoriale della carta beverage (extra-vini)
**Autore analisi:** Claude + Marco

---

# 0. Contesto e obiettivo

## Situazione attuale
- La **Carta dei Vini** è gestita in TRGB nel modulo `vini` (tab "Carta"), con preview live + export HTML/PDF/DOCX a partire dai dati di `fe_magazzino_vini` → ben consolidata (v3.4).
- Le **altre pagine** della carta storica ("Carta delle Bevande" v17.23, PDF allegato da Marco) — Aperitivi, Birre, Amari fatti in casa, Amari & Liquori, Distillati, Tisane, Tè — sono oggi gestite **fuori TRGB** (Word). Aggiornamenti sono manuali e scollegati dal resto del sistema.
- Le sezioni "Proposte al Calice" e "Abbinamenti al calice" sono già coperte dal sistema calici del modulo vini → **NON ricadono in questo modulo**.

## Obiettivo
Portare in TRGB tutte le sezioni non-vini della carta bevande in un editor unico, **statico rispetto alla logica di magazzino** (solo CRUD editoriale), riusando il render della carta vini per produrre una "Carta delle Bevande" completa esportabile (HTML/PDF/DOCX).

## Scope MVP (Fase 1 — tutte le sezioni)
Decisione di Marco: partire subito con tutte le 7 sezioni, "tanto sono simili e agili da gestire":
1. Aperitivi
2. Birre
3. Amari fatti in casa
4. Amari & Liquori (commerciali)
5. Distillati (Grappe, Rum, Whisky; struttura pronta per altri)
6. Tisane
7. Tè

## Non-obiettivi
- Magazzino bevande → NO (no movimenti, no matrice, no pricing dinamico).
- Integrazione vendite/iPratico → NO (per ora solo editoriale).
- Calice/Abbinamenti → NO (già nel modulo vini).
- Nuovo PDF brand (M.B) → NO, estendiamo la pipeline PDF esistente (decisione Marco).

---

# 1. Posizionamento UI

## Tab navigazione (ViniNav)
Il tab **"Carta"** resta dov'è e mantiene il nome "Carta" (decisione Marco). La pagina `ViniCarta.jsx` viene **trasformata in hub**: `CartaBevande.jsx` (rinomina o nuovo file con alias rotta).

## Hub "Carta delle Bevande"
Pagina con:
- **Header**: titolo "📜 Carta delle Bevande", sottotitolo con ultimo aggiornamento, bottone "← Menu Vini".
- **Azioni globali (4 bottoni)**: Anteprima completa, Esporta HTML, Esporta PDF, Esporta Word.
- **Griglia 8 card** (stile Home v3.3 — emoji + colori modulesMenu, touch 44pt, 2 col portrait / 3 col landscape):

| Ordine | Sezione | Emoji | Key | Note |
|--------|---------|-------|-----|------|
| 1 | Vini | 🍷 | `vini` | Hero card (span 2). Porta all'anteprima/export attuale — nessun cambio funzionale. |
| 2 | Aperitivi | 🍸 | `aperitivi` | |
| 3 | Birre | 🍺 | `birre` | |
| 4 | Amari fatti in casa | 🌿 | `amari_casa` | |
| 5 | Amari & Liquori | 🥃 | `amari_liquori` | |
| 6 | Distillati | 🥂 | `distillati` | Sottotipi Grappa/Rum/Whisky/Altro gestiti via tag. |
| 7 | Tisane | 🍵 | `tisane` | |
| 8 | Tè | 🫖 | `te` | |

## Rotte
```
/vini/carta                           → Hub (CartaBevande.jsx)
/vini/carta/vini                      → preview+export Carta Vini (attuale ViniCarta spostata)
/vini/carta/sezione/:key              → Editor sezione (aperitivi, birre, …)
/vini/carta/anteprima                 → Preview completa master (vini+altre)
```

## Permessi
- **admin, superadmin, sommelier** → scrittura/lettura tutto.
- **sala, chef** → lettura anteprima e export.
- **viewer** → nessun accesso.
Pattern identico a quello attuale del modulo Vini.

---

# 2. Modello dati

## Nuovo DB: `app/data/bevande.sqlite3`
Isolato dagli altri (coerente con `notifiche.sqlite3`, `cg.sqlite3`): facilita backup/restore e non inquina `foodcost.db`.

## Tabella `bevande_sezioni`
Configurazione delle 7 sezioni (seed iniziale, ma editabile da admin).

```sql
CREATE TABLE bevande_sezioni (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    key         TEXT NOT NULL UNIQUE,        -- 'aperitivi','birre','amari_casa','amari_liquori','distillati','tisane','te'
    nome        TEXT NOT NULL,               -- 'Aperitivi','Birre',...
    intro_html  TEXT,                         -- testo introduttivo stampato sopra la sezione (es. "La grappa è una bevanda alcolica…")
    ordine      INTEGER NOT NULL DEFAULT 100, -- ordine di render
    attivo      INTEGER NOT NULL DEFAULT 1,
    layout      TEXT NOT NULL DEFAULT 'nome_desc_prezzo', -- vedi §3 pattern render
    schema_form TEXT,                         -- JSON: elenco campi form e loro tipo (per SezioneEditor dinamico)
    created_at  TEXT DEFAULT (datetime('now','localtime')),
    updated_at  TEXT DEFAULT (datetime('now','localtime'))
);
```

## Tabella `bevande_voci`
Tutte le voci di tutte le sezioni in un'unica tabella piatta (i campi non pertinenti restano NULL, i dettagli specifici vanno in `extra` JSON).

```sql
CREATE TABLE bevande_voci (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    sezione_key  TEXT NOT NULL,        -- FK logica a bevande_sezioni.key
    nome         TEXT NOT NULL,        -- 'Asia Blanche', 'Storica Bianca', 'English Breakfast Finest'
    sottotitolo  TEXT,                 -- 'IPA', 'TE NERO', 'TISANA ANTI-STRESS', 'Blanche'
    descrizione  TEXT,                 -- blocco testo principale
    produttore   TEXT,                 -- 'DOMENIS', 'NONINO', 'CAPOVILLA', 'KOVAL'
    regione      TEXT,                 -- 'FRIULI-VENEZIA-GIULIA', 'VENETO', 'SCOZIA - ISLAY', 'CINA'
    formato      TEXT,                 -- '33ml', 'a partire da 8 euro'
    gradazione   REAL,                 -- 5.0, 7.5 (% alc)
    ibu          INTEGER,              -- solo birre
    tipologia    TEXT,                 -- 'nero','verde','oolong','rosso','puer' per tè; 'digestiva','dopo_pasto' per tisane; 'Grappa','Rum','Whisky' per distillati
    paese_origine TEXT,                -- 'CINA','INDIA','GIAPPONE' (tè); 'SCOZIA','GIAPPONE' (whisky)
    prezzo_eur   REAL,                 -- 8.00, 10.00, NULL se "a voce"
    prezzo_label TEXT,                 -- override testuale quando prezzo_eur non basta ('a partire da 8 euro', 'da concordare')
    tags         TEXT,                 -- JSON array: ['bio','limited_edition','vegan'…]
    extra        TEXT,                 -- JSON catch-all per campi inusuali/futuri
    ordine       INTEGER NOT NULL DEFAULT 100,
    attivo       INTEGER NOT NULL DEFAULT 1,
    note_interne TEXT,                 -- visibili solo nel PDF-staff
    created_at   TEXT DEFAULT (datetime('now','localtime')),
    updated_at   TEXT DEFAULT (datetime('now','localtime'))
);

CREATE INDEX idx_bevande_voci_sezione ON bevande_voci(sezione_key, ordine);
```

## `schema_form` esempio (JSON)
Usato dall'editor per generare il form dinamico. Esempio per `birre`:
```json
{
  "fields": [
    {"key":"nome",        "label":"Nome",           "type":"text",   "required":true},
    {"key":"sottotitolo", "label":"Stile (IPA, Stout…)", "type":"text"},
    {"key":"produttore",  "label":"Birrificio",     "type":"text"},
    {"key":"formato",     "label":"Formato",        "type":"text",   "placeholder":"33ml"},
    {"key":"gradazione",  "label":"Gradazione % alc","type":"number","step":0.1},
    {"key":"ibu",         "label":"IBU",            "type":"number"},
    {"key":"descrizione", "label":"Descrizione",    "type":"textarea","rows":3},
    {"key":"prezzo_eur",  "label":"Prezzo €",       "type":"number","step":0.01}
  ]
}
```

## Mapping campi per sezione (MVP)

| Sezione | nome | sottotitolo | produttore | regione/paese | formato | gradazione | ibu | tipologia | prezzo | descrizione | Note specifiche |
|---------|:----:|:-----------:|:----------:|:-------------:|:-------:|:----------:|:---:|:---------:|:------:|:-----------:|-----------------|
| aperitivi | ✅ | | | | | | | | ✅ | ✅ | 3 campi core |
| birre | ✅ | stile | birrificio | | ml | ✅ | ✅ | | ✅ | ✅ | |
| amari_casa | ✅ | | | | | ✅ opz | | | ✅ | ✅ | |
| amari_liquori | ✅ | | ✅ | | | | | | ✅ | ✅ opz | |
| distillati | ✅ | annata | ✅ | ✅ | | | | tipo (Grappa/Rum/Whisky) | ✅ | ✅ opz | sottogruppi via `tipologia` |
| tisane | ✅ | categoria (anti-stress, digestiva, calmante) | | | | | | | ✅ opz | ingredienti in `descrizione` | |
| te | ✅ | | | paese_origine | | | | nero/verde/oolong/rosso/puer | ✅ opz | ✅ | |

---

# 3. Pattern di render

Tre layout HTML/CSS ricorrenti coprono tutte le sezioni:

## Pattern A — "produttore/nome/prezzo" (tabella 4 colonne)
Usato per: **Distillati, Amari & Liquori**.
Layout:
```
[REGIONE/PAESE]  [PRODUTTORE]  [NOME + annata]              [€ prezzo]
```
Compatto, alto contenuto di righe per pagina. Già usato nel PDF vecchio per le Grappe (pag. 34) e Whisky (pag. 35-36).

## Pattern B — "scheda estesa"
Usato per: **Birre, Aperitivi, Amari fatti in casa**.
Layout:
```
**Nome** sottotitolo/stile                        Alc. X% Y IBU   € N,NN
Descrizione su più righe.
```
Come nel PDF vecchio pag. 5.

## Pattern C — "nome + badge tipologia + descrizione"
Usato per: **Tisane, Tè**.
Layout:
```
NOME                                  [BADGE TIPOLOGIA in rosso]
Descrizione / ingredienti.
Prodotto in: ORIGINE   (solo tè)
```
Come nel PDF vecchio pag. 37-39.

## Scelta renderer
Il campo `bevande_sezioni.layout` dichiara quale pattern applicare:
- `tabella_4col` → Pattern A
- `scheda_estesa` → Pattern B
- `nome_badge_desc` → Pattern C

Aggiungere un nuovo pattern in futuro = aggiungere una funzione Python + un valore enum. Zero migration.

---

# 4. Backend

## Nuovo router `app/routers/bevande_router.py`
Prefix: `/bevande`. JWT obbligatorio su tutti gli endpoint (tranne quelli pubblici di preview se decideremo di esporli).

### CRUD sezioni
```
GET    /bevande/sezioni/                    → lista sezioni ordinate (admin, sommelier)
GET    /bevande/sezioni/{key}               → dettaglio + schema_form
PUT    /bevande/sezioni/{key}               → aggiorna (nome, intro_html, ordine, attivo, layout, schema_form)
POST   /bevande/sezioni/reorder             → body: [{key, ordine}, …]
```
La creazione/cancellazione di sezioni NON è esposta in MVP (le 7 sono seed fisso). Solo superadmin via DB.

### CRUD voci
```
GET    /bevande/voci/?sezione={key}&attivo=1&q=          → lista filtrata/ricerca
GET    /bevande/voci/{id}                                 → dettaglio
POST   /bevande/voci/                                     → crea
PUT    /bevande/voci/{id}                                 → aggiorna
DELETE /bevande/voci/{id}                                 → soft-delete (attivo=0) con flag ?hard=1 per hard-delete admin
POST   /bevande/voci/reorder                              → body: {sezione_key, order:[id1,id2,…]}
POST   /bevande/voci/bulk-import                          → body: {sezione_key, rows:[{…}]} (per import da testo/CSV)
```

### Export (tutti staff, JWT obbligatorio)
```
GET    /bevande/carta                       → HTML preview master (vini + altre sezioni attive in ordine)
GET    /bevande/carta/pdf                   → PDF cliente (prezzi, senza note interne)
GET    /bevande/carta/pdf-staff             → PDF staff (include note_interne)
GET    /bevande/carta/docx                  → DOCX editabile
GET    /bevande/sezioni/{key}/preview       → HTML preview singola sezione (per l'editor)
```
**Nota**: nessun endpoint pubblico. Differenza "PDF cliente" vs "PDF staff" è solo contenuto (prezzi/note), non autenticazione.

### Retro-compatibilità
Gli endpoint `/vini/carta`, `/vini/carta/pdf`, `/vini/carta/docx`, `/vini/carta/pdf-staff` **restano** e continuano a restituire la sola carta vini (serve per link vecchi e per la card "Vini" dell'hub).

## Nuovo service `app/services/carta_bevande_service.py`

Funzioni chiave:
```python
def build_section_html(sezione: dict, voci: list[dict], *, for_pdf: bool = False) -> str:
    """Applica il pattern di render dichiarato da sezione['layout']."""

def build_toc_html(sezioni_attive: list[dict], vini_toc: str) -> str:
    """Indice completo: include la TOC vini esistente + le nuove sezioni."""

def build_carta_bevande_html(*, include_vini: bool = True, for_pdf: bool = False, staff: bool = False) -> str:
    """Orchestratore master: copertina + TOC + sezioni in ordine.
       Per i vini chiama build_carta_body_html / build_carta_body_html_htmlsafe
       da carta_vini_service (riuso, zero duplicazione)."""

def build_carta_bevande_docx() -> bytes:
    """Analoga in DOCX, estende la logica di build_carta_docx esistente."""
```

## CSS
Estendere `app/static/css/carta_html.css` e `carta_pdf.css` con classi per i 3 pattern: `.bev-4col`, `.bev-scheda`, `.bev-badge`.

---

# 5. Frontend

## Struttura file
```
frontend/src/pages/vini/
  CartaBevande.jsx            (nuovo — ex ViniCarta, diventa hub)
  CartaVini.jsx               (estratto dall'attuale ViniCarta — solo preview/export vini)
  CartaSezioneEditor.jsx      (nuovo — editor generico per le sezioni extra)
  CartaAnteprima.jsx          (nuovo — preview completa master)
  components/
    CartaCardModulo.jsx       (card sezione con emoji+colore, stile Home v3.3)
    FormDinamico.jsx          (render form da schema_form)
    ImportTestoModal.jsx      (incolla-testo → righe)
```

## Componenti chiave

### `CartaBevande.jsx` (hub)
- Header + 4 bottoni globali (preview/export × 3 formati).
- Griglia 8 card. Ogni card mostra: emoji, nome sezione, numero voci attive, ultimo aggiornamento.
- Card "Vini" è hero (span 2 col), le altre quadrate.
- Bottone "← Menu Vini" come `ViniCarta.jsx` attuale.

### `CartaSezioneEditor.jsx` (generico)
Una sola pagina, parametrizzata da `:key`. Leader pattern come `MagazzinoVini.jsx`:
- Header con nome sezione + descrizione + pulsanti "+ Nuova voce", "Import da testo", "Anteprima sezione".
- Tabella voci: drag handle + nome + riassunto campi specifici + prezzo + toggle attivo + azioni (edita, duplica, elimina).
- Drag&drop (riuso pattern già presente altrove, es. `SortableList`) per ordinamento.
- Modal con `FormDinamico` (campi da `schema_form`).
- Import da testo: textarea + bottone "Parsa" → tabella preview editabile → Conferma. Parser minimale per blocchi tipo "Regione\tProduttore\tNome\tPrezzo" (riconosce TAB o 2+ spazi come separatore).

### `FormDinamico.jsx`
Input: `schema` (da `bevande_sezioni.schema_form`) + `value` (voce). Rendera text/number/textarea/select in base a `type`. Validazione required. Nessuna dipendenza esterna oltre React.

## Aggiunte ai file esistenti
- `frontend/src/App.jsx`: route per `/vini/carta`, `/vini/carta/vini`, `/vini/carta/sezione/:key`, `/vini/carta/anteprima`.
- `frontend/src/config/versions.jsx`: voce "Carta Bevande v1.0".
- `frontend/src/pages/vini/ViniNav.jsx`: nessun cambio (tab "Carta" punta già a `/vini/carta`).

## Design
- Sfondo `bg-brand-cream`.
- Card sezione: sfondo tintato + border colorato coerente con `modulesMenu.js` (vini amber, birre giallo, tisane verde, tè rosso, distillati slate, aperitivi rosa, amari viola).
- Touch target 44pt minimo, bottoni 48pt (già standard).
- Font pagina titoli Playfair Display, resto sistema.

---

# 6. Export — pipeline unificata

## Flusso `build_carta_bevande_html`
```
1. build_copertina_html()                              → "Carta delle Bevande" + logo + version
2. sezioni_attive = SELECT * FROM bevande_sezioni WHERE attivo=1 ORDER BY ordine
3. build_toc_html(sezioni_attive, vini_toc)            → indice master
4. Per ogni sezione in ordine:
     if sezione.key == 'vini' and include_vini:
         body += build_section_wrapper('Vini') + carta_vini_service.build_carta_body_html(rows)
     else:
         voci = SELECT * FROM bevande_voci WHERE sezione_key=? AND attivo=1 ORDER BY ordine
         body += build_section_html(sezione, voci, for_pdf=for_pdf)
5. Return HTML master con CSS inline + watermark footer.
```

## PDF staff vs cliente
- Staff: `note_interne` visibili, prezzi di listino, alert se campi obbligatori mancanti (es. "⚠ senza prezzo").
- Cliente: `note_interne` nascoste, `prezzo_label` ha precedenza su `prezzo_eur`, voci con `attivo=0` escluse.

## Versioning carta
Nel footer del PDF cliente: `Carta delle Bevande — v{YYYY}.{MM}.{seq}` calcolata da `MAX(updated_at)` su voci+sezioni. Consente di riconoscere a colpo d'occhio se il PDF in sala è aggiornato.

---

# 7. Migrazioni e seed

## Migration `app/migrations/NNN_bevande_sqlite.py`
- Crea DB `bevande.sqlite3` se non esiste.
- Crea tabelle `bevande_sezioni` e `bevande_voci` (schemi §2).
- Inserisce le 7 sezioni seed con `ordine` progressivo e `layout` di default:

| key | nome | layout | ordine |
|-----|------|--------|--------|
| aperitivi | Aperitivi | scheda_estesa | 10 |
| birre | Birre | scheda_estesa | 20 |
| vini | Vini | (gestito separatamente) | 30 |
| amari_casa | Amari fatti in casa | scheda_estesa | 40 |
| amari_liquori | Amari & Liquori | tabella_4col | 50 |
| distillati | Distillati | tabella_4col | 60 |
| tisane | Tisane | nome_badge_desc | 70 |
| te | Tè | nome_badge_desc | 80 |

**Nota**: `vini` è presente come sezione logica per l'ordinamento nell'hub, ma i dati restano in `fe_magazzino_vini` (non duplichiamo). L'export legge la posizione/ordinamento da `bevande_sezioni` ma i dati dalla fonte originale.

## Popolamento iniziale dati
Opzione scelta (Fase 4): Marco compila da editor. Tempi stimati (lui stesso):
- Aperitivi: pochi item, 10 min
- Birre: ~10 voci, 15 min
- Amari casa: 5-10 voci, 10 min
- Amari & Liquori: 20-30 voci, 30 min
- Distillati: ~60 voci, 60 min
- Tisane: 7 voci, 10 min
- Tè: 10-15 voci, 20 min

Totale: ~2.5 ore (o meno se usa bulk-import da testo incollato dal Word).

---

# 8. Integrazione mattoni condivisi

- **M.A Notifiche**: non necessario in MVP. Eventuale "carta aggiornata → notifica staff" è feature premium (Fase 2).
- **M.B PDF brand**: NON aspettiamo (decisione Marco). Estendiamo pipeline attuale `carta_vini_service` → `carta_bevande_service`. Quando M.B arriverà, migreremo.
- **M.I UI primitives**: `Btn`, `PageLayout`, `StatusBadge`, `EmptyState` usati su tutte le pagine nuove.

---

# 9. Mobile / iPad

Tutto il modulo è mobile-aware fin dall'inizio (iPad + iPhone per editing in loco):
- Touch target 44pt minimo su tabelle + form.
- No hover-only: tutte le azioni hanno icona sempre visibile.
- Griglia card: 2 col portrait / 3 col landscape.
- Modali full-screen su mobile (<=640px).
- Drag&drop: supporto touch via pointer events.
- Preview PDF: apertura in tab nuovo + opzione "Salva in Files" su iOS.

---

# 10. Rischi e decisioni aperte

## Rischi
| Rischio | Impatto | Mitigazione |
|---------|---------|-------------|
| Pipeline PDF attuale difficile da estendere | Medio | `carta_vini_service` è già modulare, ha `build_*_html` separati. Estensione fattibile. |
| Ordinamento sezione "vini" dentro master | Basso | Risolto via `bevande_sezioni.vini` (seed) con ordine editabile. |
| Voci senza prezzo ("€" vuoto) nel PDF vecchio | Basso | Campo `prezzo_label` permette override ("a voce", "da concordare"). |
| Migrazione dati dal Word | Basso | Bulk-import da testo con parser tolerante. |
| M.B PDF brand potrebbe rivoluzionare l'export | Medio | Accettato: quando arriverà, rifacciamo il renderer in un pomeriggio. Il DB resta. |

## Decisioni chiuse (2026-04-19)
1. **Multi-lingua**: **NO** in MVP. Solo italiano. Nessun campo `_en` né switch locale. Si valuterà in futuro se serve.
2. **URL pubblico `/carta-bevande`**: **NO**. La Carta Bevande resta **solo staff** (JWT). Motivazione da approfondire con Marco. Gli endpoint export richiedono login come il resto del modulo Vini interno.
3. **Versioning automatico**: **SÌ**. Footer PDF mostra `v{YYYY}.{MM}.{seq}` calcolato da `MAX(updated_at)` su `bevande_sezioni` + `bevande_voci` + aggiornamento carta vini.

Conseguenze:
- Nessuna rotta pubblica su FastAPI (niente `@router.get` senza `Depends(get_current_user)`).
- Niente pagina pubblica su frontend (es. `/carta-bevande` route pubblica → non creata).
- Il tab "Carta" nel menu Vini resta l'unico punto di accesso.

---

# 11. Sessioni target

| Fase | Sessione | Deliverable |
|------|----------|-------------|
| 0 | 2026-04-19 (questa) | Design doc + checklist TODO |
| 1 | +1 | Migration + seed + router CRUD sezioni/voci |
| 2 | +1/+2 | Frontend hub + editor generico + form dinamico + import testo |
| 3 | +1 | Export unificato (HTML, PDF, PDF-staff, DOCX) + CSS esteso |
| 4 | +0.5 | Marco popola dati da editor |

Stima totale: **3–4 sessioni** di lavoro.
