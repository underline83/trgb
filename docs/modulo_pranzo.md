# Modulo Pranzo settimanale — design + uso

**Versione:** 3.0 (sessione 2026-06-07)
**Stato:** beta — restyle PDF sistema menu A5 + flusso piatti "Entrambi"
**Modulo:** `cucina` (sub-modulo pranzo) — vedi CLAUDE.md disciplina modulare

> **Storia:** v1.0 (sessione 58) era GIORNALIERA con catalogo separato
> `pranzo_piatti`. v2.0 (sessione 58 cont.) è SETTIMANALE: piatti pescati
> dalle `recipes` con service_type "Pranzo di lavoro" (mig 074), pagina
> `/pranzo` come compositore puro. v3.0 (2026-06-07): PDF allineato al
> MENU A5 stagionale dell'osteria + promozione righe ad-hoc a ricetta.

---

**Ruoli destinatari:** superadmin/admin/chef (scrittura), sous_chef/commis (gestione), sala/sommelier (lettura)
**Posizione UI:** sub-voce di Gestione Cucina (sezione "Menu" con toggle, route `/pranzo`)

---

## Modello di dominio

- **Menu SETTIMANALE**: un menu per settimana, chiave `settimana_inizio` = lunedì `YYYY-MM-DD` (qualsiasi data in input viene normalizzata al lunedì ISO).
- **Piatti dal pool ricette**: le `recipes` attive (`is_active=1`, `is_base=0`) collegate al service_type **"Pranzo di lavoro"**. Niente catalogo separato.
- **Righe ad-hoc**: testo libero per i piatti del mercato; promuovibili a ricetta col bottone "+ pool" (v3.0).
- **Snapshot**: `pranzo_menu_righe.nome/categoria` sono snapshot — l'archivio storico sopravvive a rinomine/cancellazioni delle ricette.
- **Testata/prezzi/footer**: SOLO in `pranzo_settings` (UI: Impostazioni Cucina · Menu Pranzo). Nessun override per settimana.

## Schema DB (foodcost.db, cluster cucina)

```
pranzo_menu
├── id INTEGER PK
├── settimana_inizio TEXT UNIQUE   lunedì YYYY-MM-DD
├── created_by, created_at, updated_at
└── ⚠ colonne legacy v1.0 ancora presenti sul VPS: data (NOT NULL UNIQUE),
    titolo, sottotitolo, prezzo_1/2/3, footer_note, stato.
    Gestite a runtime con INSERT dinamico (iter 12, D2). La mig 103
    recreate-table per droppare è DEFERITA (vedi inventario_pulizia.md).

pranzo_menu_righe
├── id, menu_id FK CASCADE, recipe_id FK recipes SET NULL
├── nome TEXT (snapshot), categoria TEXT (snapshot), ordine, note
└── ⚠ legacy: piatto_id orfana. Tabella pranzo_piatti v1.0 ancora viva, inutilizzata.

pranzo_settings (riga unica id=1)
├── titolo_default        ('PRANZO' da mig 144)
├── sottotitolo_default   ('la cucina del mercato' da mig 144)
├── titolo_business, prezzo_1/2/3_default (15/25/35)
├── footer_default        ('acqua, coperto e servizio inclusi\nda lunedì a venerdì')
└── updated_at
```

Categorie valide: `antipasto, primo, secondo, contorno, dolce, altro`.
Mappa recipes→pranzo: `recipe_categories.name` (Antipasto/i, Primo/i, …) → categoria pranzo; non riconosciute → `altro`.

## Endpoint API (prefix `/pranzo`, auth `get_current_user`)

Scritture: ruolo `superadmin | admin | chef` (`_check_admin`).

| Endpoint | Cosa fa |
|---|---|
| `GET /pranzo/piatti-disponibili/` | pool ricette "Pranzo di lavoro" |
| `POST /pranzo/promuovi-ricetta/` | v3.0 — `{nome, categoria}` → crea ricetta scheletro + tag pool. Dedup per nome (name/menu_name case-insensitive): se esiste, tagga e basta. Ritorna `{recipe_id, creata}` |
| `DELETE /pranzo/pool/{recipe_id}/` | v3.0 — eliminazione "intelligente": untag sempre; se placeholder vuoto (0 items, 0 altri service_types, mai sub-ricetta, mai su menu carta) disattiva anche la ricetta. Ritorna `{rimossa_dal_pool, disattivata}` |
| `GET /pranzo/menu/` | archivio testate (filtri `data_da`/`data_a`) |
| `GET /pranzo/menu/corrente/` | settimana corrente |
| `GET /pranzo/menu/oggi/` | menu di oggi + settings (rich payload) |
| `GET /pranzo/menu/by-week/?settimana=` | menu per settimana (query string, workaround Safari) |
| `GET /pranzo/menu/{settimana}/` | menu per lunedì (con righe) |
| `POST /pranzo/menu/` | upsert (sostituisce righe) |
| `DELETE /pranzo/menu/{settimana}/` | elimina |
| `GET /pranzo/menu/{settimana}/pdf/` | PDF brand cliente |
| `GET /pranzo/menu/{settimana}/margine` | F.1 — margine Menù Business per livello |
| `GET /pranzo/programmazione/?n=8` | ultime N settimane con righe (vista comparativa) |
| `GET /pranzo/settings/` · `PUT` | default testata/prezzi/footer (PUT admin) |
| `GET /pranzo/health` · `GET /pranzo/smoke/{s}/` | diagnostica (no auth) |

## Frontend

`frontend/src/pages/pranzo/PranzoMenu.jsx` (v3.5) — 2 tab:
- **Compositore**: nav settimana + card piatti (riordino ▲/▼, ordina per categoria, select categoria, input nome libero) + pool a destra (search + filtro categoria + form **"⚡ Nuova ricetta veloce"** nome+categoria → crea placeholder nel pool senza passare da Ricette, visibile anche a pool vuoto). Azioni: PDF / Copia prec. / Elimina / Salva. Righe ad-hoc con nome → bottone **"+ pool"** (promozione a ricetta, v3.0). Widget **MargineCard** (F.1) sotto la card.
- **Programmazione**: ultime N settimane affiancate, per non ripetersi.

Resilienza: `apiFetchSafe` (1 retry su network fail), banner errore con Riprova, AbortController 20s, box diagnostica (v3.2-3.4, vedi problemi.md D2).

Impostazioni: `PranzoSettingsPanel.jsx` montato in `RicetteSettings` (sidebar, voce `pranzo`).

## PDF brand cliente — v3.0 "Pagina di sezione"

File: `app/services/pranzo_pdf_service.py` + `static/css/menu_pranzo_pdf.css`

**Riferimento estetico: il MENU A5 stagionale dell'osteria** (NON la carta
vini, che ha palette terra). Sistema verificato dai BaseFont del PDF di
studio (`menù-A5-primavera-2026-definitivo.pdf`):

- **Sabon LT Pro** — titolo spaziato (30pt, letter-spacing 0.18em), etichette categoria, titolo Business, footer corsivo
- **Courier Prime Bold** — nomi piatto maiuscoli, righe Business con prezzo nudo (niente €)
- Bianco/nero essenziale, niente logo, niente divisori "* * *"

Layout A4 verticale singola pagina (flex, comprime invece di spezzare):
titolo "PRANZO" → sottotitolo corsivo "la cucina del mercato · settimana
dell'8 - 12 giugno 2026" → blocchi categoria (etichetta ANTIPASTI/PRIMI/…
+ piatti, sinistra) → MENÙ BUSINESS (3 righe, prezzi destra) → footer.

**Font**: `@font-face` con fallback a catena: `static/fonts/` →
`/usr/local/share/fonts/tre_gobbi/` → Cormorant Garamond → Times.
⚠ **I file Sabon LT Pro (Roman/Bold/Italic) e Courier Prime (Regular/Bold)
vanno caricati in `static/fonts/`** (licenza studio Underline) — finché
mancano, WeasyPrint usa il fallback.

## Capability (disciplina audit 2026-05-19)

| Codice | Cosa fa | Riferimento | Audience | Docs |
|---|---|---|---|---|
| C-P-001 | Compone menu settimanale (pool + ad-hoc) | `PranzoMenu.jsx` tab compositore | chef/admin | ✅ |
| C-P-002 | Archivio/programmazione settimane | `pranzo_router.py /programmazione/` | chef/admin/sala | ✅ |
| C-P-003 | PDF brand cliente A4 | `pranzo_pdf_service.py` | chef/admin | ✅ |
| C-P-004 | Margine Menù Business (F.1) | `pranzo_router.py /margine` | admin | ✅ |
| C-P-005 | Copia settimana precedente | `PranzoMenu.jsx copiaSettimanaPrecedente` | chef/admin | ✅ |
| C-P-006 | Promozione riga ad-hoc a ricetta pool | `pranzo_router.py /promuovi-ricetta/` | chef/admin | ✅ v3.0 |
| C-P-008 | Creazione rapida ricetta placeholder dal pool | `PranzoMenu.jsx` quickAddForm (stesso endpoint C-P-006) | chef/admin | ✅ v3.0 |
| C-P-009 | Eliminazione intelligente dal pool (✕ su chip) | `pranzo_router.py DELETE /pool/{id}/` | chef/admin | ✅ v3.0 |
| C-P-007 | Default testata/prezzi/footer | `PranzoSettingsPanel.jsx` | admin | ✅ |

## Riferimenti

- Router: `app/routers/pranzo_router.py` · Repository: `app/repositories/pranzo_repository.py`
- Service PDF: `app/services/pranzo_pdf_service.py` · CSS: `static/css/menu_pranzo_pdf.css`
- Migrazioni: 102 (init, riscritta v2), 144 (default testata restyle)
- Frontend: `frontend/src/pages/pranzo/PranzoMenu.jsx`, `frontend/src/pages/ricette/PranzoSettingsPanel.jsx`
- Debito schema: problemi.md D2 + inventario_pulizia.md (mig 103 deferita)

## Cose da fare (roadmap C.P*)

- **Mig 103**: recreate-table per droppare colonne legacy v1.0 + tabella `pranzo_piatti` + riga sporca `settimana_inizio=2026-04-26` (domenica, residuo migrazione v1→v2). Backup pre-DDL.
- C.P1: completare aggancio food cost (il margine F.1 c'è; manca food cost per piatto nel compositore).
- C.P2: allergeni sul PDF. C.P3: multi-edizione.
- C.L3: lista spesa auto da menu pranzo (cross-modulo).
- QR pubblico `GET /pranzo/oggi/pubblico` (pattern carta vini). Notifica M.A a pubblicazione. Drag&drop righe.
