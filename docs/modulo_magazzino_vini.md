# 🍾 Modulo Magazzino Vini — TRGB Gestionale
**Ultimo aggiornamento:** 2026-03-09
**Stato:** operativo — gestione completa con movimenti, dashboard analytics, scheda dettaglio

---

# 1. Obiettivo del modulo

- gestione completa giacenze vini per locazione (frigo, loc1, loc2, loc3)
- storico movimenti cantina (CARICO, SCARICO, VENDITA, RETTIFICA)
- prezzi carta + listino
- note operative per vino
- ID DB protetti (non sovrascrivibili)
- dashboard operativa con KPI, alert, analytics vendite
- sincronizzazione con Carta Vini
- predisposizione per carichi da Fatture XML

---

# 2. Struttura frontend

### Pagine principali

| Pagina | Route | Descrizione |
|--------|-------|-------------|
| `ViniMenu.jsx` | `/vini` | Hub modulo, link a tutte le sezioni |
| `MagazzinoVini.jsx` | `/vini/magazzino` | Lista vini + pannello dettaglio rapido |
| `MagazzinoViniDettaglio.jsx` | `/vini/magazzino/:id` | Scheda completa: anagrafica, giacenze, movimenti, note |
| `MagazzinoViniNuovo.jsx` | `/vini/magazzino/nuovo` | Form creazione nuovo vino |
| `DashboardVini.jsx` | `/vini/dashboard` | Dashboard operativa con KPI e analytics |

### Navigazione
- `MagazzinoSubMenu.jsx`: sub-menu con link a Magazzino, Dashboard, Import, Impostazioni
- `MagazzinoVini.jsx` pannello destro: bottone unico "🍷 Apri scheda completa" → `/vini/magazzino/:id`

---

# 3. Filtri avanzati (MagazzinoVini.jsx)

### Ricerca testuale:
- ID DB
- ID Excel (`id_excel`)
- descrizione
- denominazione
- produttore
- codice
- regione / nazione

### Filtri numerici:
- giacenza totale (>, <, tra)
- **solo con giacenza positiva**
- filtro prezzo carta

### Filtri combinati:
- tipologia
- nazione
- regione
- produttore

### Logica filtri dipendenti:
Le liste dinamiche si riducono automaticamente in base alle selezioni correnti (clientside con `useMemo`).

---

# 4. Scheda dettaglio vino (MagazzinoViniDettaglio.jsx v3.0)

Pagina unificata con tre sezioni:

### 4.1 Anagrafica
- visualizzazione + edit inline (PATCH `/vini/magazzino/{id}`)
- campi: descrizione, produttore, tipologia, annata, denominazione, regione, nazione, formato, gradi, prezzo listino, prezzo carta, flag CARTA e IPRATICO, note

### 4.2 Giacenze per locazione
- view + edit separato per frigo, loc1, loc2, loc3
- salvataggio automaticamente registra un movimento RETTIFICA nello storico se `QTA_TOTALE` cambia

### 4.3 Movimenti cantina
- storico completo movimenti del singolo vino
- form aggiunta movimento: tipo (CARICO/SCARICO/VENDITA/RETTIFICA), quantità, note
- eliminazione movimento (solo admin/sommelier)
- badge tipo colorato per ogni movimento

### 4.4 Note operative
- lista note con data e autore
- aggiunta nota
- eliminazione nota (con conferma)

### Badge ID
Ogni vino è identificato da un badge `#id` in stile:
```jsx
<span className="inline-flex items-center bg-slate-700 text-white text-[11px] font-bold px-2 py-0.5 rounded font-mono tracking-tight">
  #{vino.id}
</span>
```
Presente in: lista MagazzinoVini, pannello rapido, header scheda dettaglio, dashboard (alert e drill-down).

---

# 5. Movimenti cantina

### Tipi di movimento

| Tipo | Emoji | Colore | Significato |
|------|-------|--------|-------------|
| CARICO | ⬆️ | emerald | Ricezione merce (acquisto/fornitore) |
| SCARICO | ⬇️ | red | Uscita non commerciale (rottura, consumo interno, degustazione) |
| VENDITA | 🛒 | violet | Vendita commerciale (inserimento manuale — iPratico non esporta dati) |
| RETTIFICA | ✏️ | amber | Correzione giacenza (inventario, errori) |

### Note modello dati
- Le VENDITE sono inserite manualmente (iPratico non esporta dati in nessun formato)
- SCARICO ≠ VENDITA: scarico = uscita senza corrispettivo commerciale
- Ogni modifica alle giacenze da UI genera automaticamente una RETTIFICA

### Tabella DB: `movimenti_cantina`
- `id`, `vino_id` (FK), `tipo`, `qta`, `note`, `utente`, `data_mov`

---

# 6. Dashboard Vini (DashboardVini.jsx v2.1)

### KPI Riga Stock (4 tile)

| Tile | Dato | Drill-down |
|------|------|------------|
| 🍾 Bottiglie in cantina | `total_bottiglie` su `n` referenze | — |
| 📋 Vini in carta | `vini_in_carta` con % su catalogo | — |
| ⚠️ Senza prezzo listino | `vini_senza_listino` | ✅ tabella inline con link a scheda |
| 💤 Vini fermi (30gg) | vini con giacenza > 0 e nessun movimento in 30gg | ✅ lista inline con ultimo movimento |

### KPI Riga Vendite (2 tile)
- 🛒 Bottiglie vendute ultimi 7gg
- 📈 Bottiglie vendute ultimi 30gg

### Alert automatico
- 🚨 **Vini in carta con giacenza zero** — lista espandibile, clickable verso la scheda vino

### Sezione centrale (2 colonne)
- **Vendite recenti**: ultimi 8 movimenti VENDITA (viola)
- **Movimenti operativi**: ultimi 6 CARICO/SCARICO/RETTIFICA con badge tipo

### Top venduti 30gg (larghezza piena)
- Ranking a barre dei vini più venduti nell'ultimo mese (SUM qta tipo=VENDITA)
- Clickable → scheda vino

### Distribuzione tipologie
- Barre proporzionali per tipologia con contatore bottiglie e referenze

---

# 7. Struttura backend

### File principali

| File | Ruolo |
|------|-------|
| `app/models/vini_magazzino_db.py` | Tutte le query SQLite (CRUD vini, movimenti, note, dashboard) |
| `app/routers/vini_magazzino_router.py` | Endpoint FastAPI del modulo |

### Endpoint principali

| Metodo | Path | Descrizione |
|--------|------|-------------|
| GET | `/vini/magazzino` | Lista vini con filtri |
| GET | `/vini/magazzino/dashboard` | Statistiche aggregate per la dashboard |
| GET | `/vini/magazzino/{id}` | Dettaglio vino |
| POST | `/vini/magazzino` | Crea vino |
| PATCH | `/vini/magazzino/{id}` | Aggiorna anagrafica |
| POST | `/vini/magazzino/{id}/movimenti` | Registra movimento |
| DELETE | `/vini/magazzino/movimenti/{id}` | Elimina movimento (admin/sommelier) |
| GET | `/vini/magazzino/{id}/note` | Lista note vino |
| POST | `/vini/magazzino/{id}/note` | Aggiunge nota |
| DELETE | `/vini/magazzino/{id}/note/{nota_id}` | Elimina nota |
| POST | `/vini/magazzino/import` | Import Excel (SAFE / FORCE) |
| POST | `/vini/magazzino/check-duplicati` | Verifica duplicati pre-import |

> ⚠️ **Nota:** `GET /dashboard` deve essere dichiarato PRIMA di `GET /{vino_id}` nel router per evitare che FastAPI interpreti "dashboard" come vino_id intero (genera 422).

### Campi principali tabella `vini_magazzino`

- `id` — ID interno (immutabile)
- `id_excel` — origine Excel
- `DESCRIZIONE`, `PRODUTTORE`, `REGIONE`, `NAZIONE`, `TIPOLOGIA`
- `ANNATA`, `DENOMINAZIONE`, `FORMATO`, `GRADI`
- `QTA_FRIGO`, `QTA_LOC1`, `QTA_LOC2`, `QTA_LOC3`
- `QTA_TOTALE` (calcolata automaticamente)
- `EURO_LISTINO`, `EURO_CARTA`
- `CARTA` (SI/NO), `IPRATICO` (SI/NO)
- `NOTE`

---

# 8. Import Excel — modalità SAFE / FORCE

### SAFE (default)
- gli ID del DB non vengono toccati
- aggiorna solo i campi consentiti
- preserva il magazzino esistente

### FORCE (solo ruolo "admin")
- riallineamento completo database
- modifiche massicce e ricostruzione tabella

> ⚠️ **Task #12 Roadmap — CHIUSO:** controllo ruolo su DELETE movimento aggiunto (solo admin/sommelier).
> ⚠️ **Task aperto:** controllo ruolo per FORCE import non ancora implementato nel codice (`vini_magazzino_router.py`). Chiunque può eseguire FORCE anche senza ruolo admin.

---

# 9. Bugfix storico

- **Dicembre 2025:** eliminati duplicati importazioni precedenti, ripristinati **1186 record** reali, consolidata protezione ID
- **Marzo 2026:** fix smart quotes (U+201C/U+201D) nel router che causavano `SyntaxError` al boot; fix mode bit `deploy.sh`; deploy senza password configurato via sudoers

---

# 10. Roadmap modulo Magazzino

- [x] Pagina Movimenti Cantina con storico e delete (admin/sommelier) — 2026-03-09
- [x] Edit vino da UI (anagrafica + prezzi + flag) — 2026-03-09
- [x] Note operative per vino (add + delete) — 2026-03-09
- [x] Giacenze per locazione editabili da UI — 2026-03-09
- [x] Dashboard Vini operativa con KPI, alert, analytics — 2026-03-09
- [ ] Filtri lato server per dataset molto grandi
- [ ] Sincronizzazione storico prezzi
- [ ] Import Excel con diff interattivo
- [ ] Integrazione carichi automatici da Fatture XML
- [ ] Integrazione con modulo FoodCost → consumo ricette
