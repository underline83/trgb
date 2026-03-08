# 🥘 Modulo FoodCost — TRGB Gestionale  
**Ultimo aggiornamento:** 2026-03-08
**Stato:** in sviluppo — integrazione moduli

---

# 1. Obiettivo del modulo

Il modulo **FoodCost** gestisce:

- anagrafica ingredienti  
- categorie ingredienti  
- fornitori  
- prezzi storici  
- ricette (composizione, quantità, costo porzione)  
- collegamento futuro con:
  - fatture XML (carichi + prezzi automatici)  
  - magazzino (scarichi ricette)  

---

# 2. Componenti principali

### 2.1 Ingredienti
- ID ingrediente  
- nome  
- categoria  
- unità di misura  
- costo attuale  
- storico prezzi  

### 2.2 Fornitori
- nome  
- condizioni commerciali  
- collegamento a fatture XML  

### 2.3 Ricette
- lista ingredienti  
- quantità utilizzate  
- costo ricetta  
- costo per porzione  

---

# 3. Database FoodCost (`foodcost.db`)

Schema completo in `docs/database.md` §3.

| Tabella | Contenuto |
|---------|-----------|
| `suppliers` | Anagrafica fornitori |
| `ingredient_categories` | Categorie ingredienti |
| `ingredients` | Anagrafica ingredienti (SKU, unità, allergeni) |
| `ingredient_prices` | Storico prezzi multi-fornitore (mai sovrascritti) |
| `fe_fatture` | Fatture XML importate (create a runtime da `fe_import.py`) |
| `fe_righe` | Righe fatture XML |
| `recipes` | Anagrafica ricette |
| `recipe_items` | Ingredienti per ricetta con quantità |

> Il collegamento `fe_righe` → `ingredients` non è ancora implementato (task #16 Roadmap).

---

# 4. Roadmap modulo FoodCost

- collegamento automatico righe FE → ingredienti  
- aggiornamento prezzi automatico  
- valorizzazione magazzino integrata  
- dashboard foodcost giornaliero e settimanale  
- esport PDF ricette + costi  

