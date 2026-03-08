# 🍾 Modulo Magazzino Vini — TRGB Gestionale
**Ultimo aggiornamento:** 2026-03-08
**Stato:** operativo — filtri avanzati + import SAFE

---

# 1. Obiettivo del modulo

- gestione completa giacenze vini  
- tracciamento locazioni (frigo, loc1, loc2, loc3)  
- prezzi carta + listino  
- note operative  
- ID DB protetti (non sovrascrivibili)  
- sincronizzazione con Carta Vini  
- predisposizione per carichi da Fatture XML  

---

# 2. Filtri avanzati (frontend)

### Ricerca:
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
- **regione**  
- produttore  

### Logica filtri dipendenti:
Le liste dinamiche si riducono automaticamente in base alle selezioni correnti.

---

# 3. Struttura backend

Campi principali tabella magazzino:

- `id` — ID interno (immutabile)  
- `id_excel` — origine Excel  
- `descrizione`, `produttore`, `regione`, `nazione`  
- `qta_frigo`, `qta_loc1`, `qta_loc2`, `qta_loc3`  
- `qta_totale` (calcolata automaticamente)  
- `prezzo_listino`, `prezzo_carta`  
- flag carta e ipratico  

---

# 4. Funzioni backend

### `create_vino()`
- crea record  
- ricalcola quantità totale  

### `update_vino()`
- aggiorna campi  
- mantiene coerenza totale  

### Movimenti futuri
- previsto modulo “Movimenti Cantina” (carichi/scarichi con storico)

---

# 5. Import Excel — modalità SAFE / FORCE

### SAFE (default)
- gli ID del DB non vengono toccati  
- aggiorna solo i campi consentiti  
- preserva il magazzino esistente  

### FORCE (solo ruolo "admin")
- riallineamento completo database
- modifiche massicce e ricostruzione tabella

> ⚠️ **Task #12 Roadmap — APERTO:** il controllo ruolo per FORCE non è ancora implementato nel codice (`vini_magazzino_router.py` riga 403: `# per ora nessun controllo di ruolo`). Chiunque può eseguire FORCE anche senza ruolo admin.  

---

# 6. Admin Panel `/admin`

Funzioni presenti e future:
- reimport protetto  
- gestione duplicati  
- sincronizzazione iPratico  
- backup DB  
- operazioni batch  

---

# 7. Bugfix storico (dicembre 2025)

- eliminati duplicati importazioni precedenti  
- ripristinati **1186 record** reali  
- consolidata protezione ID  

---

# 8. Roadmap modulo Magazzino

- pagina **Movimenti Cantina**  
- filtri lato server per dataset molto grandi  
- sincronizzazione listino storico  
- integrazione con modulo Fatture XML → carichi automatici  
- integrazione con modulo FoodCost → consumo ricette  

