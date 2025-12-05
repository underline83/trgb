# 🚀 TRGB Gestionale  
Sistema gestionale interno dell’Osteria Tre Gobbi (Bergamo)  
![Version](https://img.shields.io/badge/TRGB_Gestionale-2025.12.05-blue?style=for-the-badge)

Documentazione versione: **2025-12-05**

Per la mappa completa delle versioni dei moduli →  
👉 [`docs/VERSION_MAP.md`](docs/VERSION_MAP.md)

---

# 📚 Table of Contents  
_(clicca per saltare alle sezioni)_

- [1. Panoramica del Progetto](#1-panoramica-del-progetto)
- [2. Struttura delle Cartelle](#2-struttura-delle-cartelle-locale--vps)
- [3. File .env](#3-file-env-frontend)
- [4. Avvio Locale](#4-avvio-locale-mac)
- [5. Deploy su VPS](#5-deploy-su-vps-produzione)
- [6. Script Unico di Deploy](#6-script-unico-di-deploy--deploysh)
- [7. Servizi systemd](#7-servizi-systemd)
- [8. NGINX Reverse Proxy + HTTPS](#8-nginx--reverse-proxy--https)
- [9. Firewall UFW](#9-firewall-ufw)
- [10. Modulo Vini (Carta + Architettura)](#10-modulo-vini-carta--architettura)
- [11. Modulo Fatture Elettroniche XML](#11-modulo-fatture-elettroniche-xml)
- [12. Roadmap Tecnica](#12-roadmap-tecnica-2026)
- [13. Stato Produzione](#13-stato-produzione-dicembre-2025)

---

# 1. Panoramica del Progetto
*(identico a tuo testo – omesso per brevità)*

---

# 2. Struttura delle Cartelle  
*(identico al tuo testo – invariato)*

---

# 3. File .env  
*(invariato)*

---

# 4. Avvio Locale  
*(invariato)*

---

# 5. Deploy VPS  
*(invariato)*

---

# 6. Script Deploy  
*(invariato)*

---

# 7. Servizi systemd  
*(invariato)*

---

# 8. NGINX Reverse Proxy  
*(invariato)*

---

# 9. Firewall UFW  
*(invariato)*

---

# 10. Modulo Vini (Carta + Architettura)

> Sezione esistente già valida.  
> Nessuna modifica applicata.  
> Rimane come **primo modulo funzionale** del gestionale.

---

# 11. Modulo Fatture Elettroniche (XML)

**Stato:** Prima versione operativa (import XML + dashboard acquisti)  
**Data introduzione:** 2025-12-05  
**DB:** `foodcost.db`

## Architettura
- Tabelle: `fe_fatture`, `fe_righe`
- Parsing XML FatturaPA
- Anti-duplicazione via hash SHA-256
- Integrazione futura con ingredienti e magazzino

## API Backend
- `POST /contabilita/fe/import`
- `GET /contabilita/fe/fatture`
- `GET /contabilita/fe/fatture/{id}`
- `GET /contabilita/fe/stats/fornitori`
- `GET /contabilita/fe/stats/mensili`

## Frontend (React)
- `FattureMenu.jsx`
- `FattureImport.jsx`
- `FattureDashboard.jsx`
- Funzioni:  
  - drag&drop XML  
  - lista importati  
  - dettaglio righe  
  - dashboard acquisti  

## Evoluzioni previste
- Matching righe ↔ ingredienti  
- Carichi magazzino automatici  
- Nuova dashboard grafica  

---

# 12. Roadmap Tecnica 2026  
*(invariata, era la tua sezione “11” ma ora diventa 12)*

---

# 13. Stato Produzione (Dicembre 2025)  
*(invariata, era la tua sezione “12” ma ora diventa 13)*

---

# 🏁 FINE README (versione corretta e allineata)
