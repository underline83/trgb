# 📚 TRGB Gestionale — Documentazione Tecnica (Index)
**Versione documento:** 2025-12-05  
**Repository:** TRGB Gestionale – Osteria Tre Gobbi

Benvenuto nell’indice ufficiale della documentazione del progetto **TRGB Gestionale**.  
Qui trovi tutti i documenti tecnici, organizzati per area e modulo.

---

# 🧭 1. Architettura & Infrastruttura

### 🔹 Architettura del Progetto  
📄 `ARCHITETTURA.md`

### 🔹 Deploy (Locale + VPS)  
📄 `DEPLOY.md`

### 🔹 Troubleshooting / Errori comuni  
📄 `TROUBLESHOOTING.md`

### 🔹 Prompt Canvas (istruzioni operative AI)  
📄 `PROMPT_CANVAS.md`

---

# 🍷 2. Moduli Fondamentali

## 2.1 Modulo Vini (Carta Vini)
Gestione completa carta vini: import Excel, normalizzazione, filtri, PDF, DOCX.  
📄 `Modulo_Vini.md`  
📄 `DATABASE_Vini.md`  
📄 `SISTEMA_VINI.md` *(se presente nel repo)*

---

## 2.2 Modulo Magazzino Vini
Gestione giacenze vini, prezzi carta/listino, id Excel, import SAFE/FORCE, filtri avanzati.  
📄 `Modulo_MagazzinoVini.md`

---

## 2.3 Modulo Fatture Elettroniche (XML)
Import FatturaPA XML, parsing intestazione + righe, dashboard acquisti, anti-duplicazione.  
📄 `Modulo_FattureXML.md`  

---

# 🥘 3. Moduli FoodCost & Ingredienti

## 3.1 Modulo FoodCost
Ingredienti, fornitori, ricette, storico prezzi, integrazione futura con fatture e magazzino.  
📄 `Modulo_FoodCost.md`  
📄 `DATABASE_FoodCost.md`

---

# 📈 4. Pianificazione & Versionamento

## Roadmap tecnica completa  
📄 `ROADMAP.md`

## Changelog del progetto  
📄 `CHANGELOG.md`

## Version Map (versioni moduli + backend + DB + frontend)  
📄 `VERSION_MAP.md`

---

# 🗂️ 5. Gerarchia moduli nel README principale

Per coerenza con il README master:

10. Modulo Vini  
11. Modulo Fatture Elettroniche (XML)  
12. Roadmap Tecnica  
13. Stato Produzione  

---

# 🏁 Note finali
- Ogni modulo ha il proprio file in `/docs/Modulo_X.md`.  
- Ogni modifica deve essere riportata in:
  - `CHANGELOG.md`
  - `VERSION_MAP.md`
  - README (se rilevante)
- La documentazione viene mantenuta aggiornata automaticamente tramite questa chat.

