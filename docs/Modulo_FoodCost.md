# 🥘 Modulo FoodCost — TRGB Gestionale  
**Ultimo aggiornamento:** 2025-12-05  
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

# 3. Database FoodCost

Documentazione completa:  
👉 `DATABASE_FoodCost.md`

Contiene tabelle:
- `ingredients`  
- `ingredient_prices`  
- `suppliers`  
- `recipes`  
- `recipe_items`  

---

# 4. Roadmap modulo FoodCost

- collegamento automatico righe FE → ingredienti  
- aggiornamento prezzi automatico  
- valorizzazione magazzino integrata  
- dashboard foodcost giornaliero e settimanale  
- esport PDF ricette + costi  

