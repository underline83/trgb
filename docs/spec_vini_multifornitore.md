# Spec — Vini multi-fornitore (VMF)

> Modulo: `vini` · classificazione `[core]` · decisioni di Marco del 2026-11-02 (Q #297, #298, #299).
> Caso che l'ha fatta nascere: Scavino, comprato a volte diretto dalla cantina (11,125 €) e a volte tramite 0,75 (listino 13,00 €).

## 1. Le decisioni

| # | Decisione | Fonte |
|---|---|---|
| D1 | Si parte dai **vini**. La carta bevande ha pochi casi: si valuta dopo se estendere. | Marco 02/11 |
| D2 | Il costo che vale per il prezzo in carta è **l'ultimo prezzo pagato**, da qualunque fornitore. Il **preferito** serve solo per gli ordini. | Marco 02/11 (prima «C», poi «B») |
| D3 | L'ultimo pagato arriva dal **carico** e dalla **fattura**. Al carico: se c'è un ordine aperto del modulo Ordini lo propone (e lo chiude); altrimenti tendina coi fornitori del vino, in cima l'ultimo usato, più «➕ aggiungi». | Marco 02/11 |
| D4 | Fattura contro carico: entro **±2%** vince la fattura e corregge da sola; oltre, finisce in «da verificare» e decide Marco. Il 2% è un'impostazione (`vmf_soglia_fattura_pct`), non una costante. | Marco 02/11 |
| D5 | Un prezzo da **listino** aggiorna solo il riferimento di quel fornitore, non il costo in carta. | proposta accettata 02/11 |
| D6 | Dati di oggi: il distributore attuale di ogni vino diventa il suo primo fornitore e il preferito; il costo di oggi diventa un «pagato» di quel fornitore con fonte `storico`. | proposta accettata 02/11 |
| D7 | **Chi emette la fattura decide il fornitore.** 0,75 fa due mestieri: da agente il vino arriva con la fattura della cantina → acquisto **Diretto**; da distributore «arriva dal loro magazzino» con la fattura di 0,75 → fornitore 0,75. Lo stesso per Marenzi e gli altri. Il preferito per gli ordini resta chi si chiama per ordinare. | Marco 02/11 |
| D8 | Le fatture si leggono **dal 2026** (`vmf_fatture_dal` = 2026-01-01). | Marco 03/11 |
| D9 | I «pagato» sono **netti** (= fattura). `EURO_LISTINO` resta il listino a cui la scheda applica `SCONTO`: quando cambia il costo vi va netto ÷ (1 − SCONTO%). I prezzi pagati scritti prima (storico, ordini, carichi, a mano) sono stati portati al netto dalla mig 226. | tecnica 03/11, da confermare con Marco (sconti di scheda non aggiornati) |

## 2. Modello dati (mig 225, `vini_magazzino.sqlite3`)

- **Preferito** = `vini_madre.fornitore_id`, come oggi. Non cambia niente per Ordini, carta, filtri e la denormalizzazione `DISTRIBUTORE` sulle bottiglie (cambiarlo passa da `sync_bottiglie_from_madre`).
- **`vini_madre_fornitori`** — i fornitori da cui un vino si può comprare: `madre_id`, `fornitore_id`, `note`, `created_at`, UNIQUE(madre_id, fornitore_id). Il preferito c'è sempre anche qui.
- **`vini_prezzi_fornitore`** — un prezzo di un'annata presso un fornitore:
  `bottiglia_id`, `fornitore_id`, `tipo` (`pagato` | `listino`), `prezzo`, `data` (AAAA-MM-GG, la data vera del fatto), `fonte` (`storico` | `carico` | `ordine` | `fattura` | `listino` | `manuale`), `movimento_id`, `ordine_id`, `fe_riga_id`, `stato` (`ok` | `da_verificare` | `scartato`), `note`, `utente`, `created_at`.
- **`EURO_LISTINO`** resta il «costo in uso» letto da carta, ordini, statistiche. Lo tiene allineato il service: quando cambia l'ultimo `pagato` valido, `EURO_LISTINO` = quel prezzo (passa da `update_vino`, quindi finisce in `vini_prezzi_storico`). Il prezzo in carta si ricalcola col markup **salvo `FORZA_PREZZO = 1`**.

«Ultimo pagato» = riga `tipo='pagato'`, `stato='ok'`, con `data` più recente (a parità, `id` più alto).

## 3. Fasi

| Fase | Cosa | Stato |
|---|---|---|
| VMF.1 | Schema + migrazione dati (mig 225) + service `vini_fornitori_service.py` + endpoint `/vini/multifornitore/*` + sezione **Fornitori** nella scheda vino (elenco, ⭐ preferito, ➕ aggiungi, prezzo manuale pagato/listino, storico per fornitore) | in sviluppo 02/11 |
| VMF.2 | **Carico**: dalla scheda vino il carico propone l'ordine aperto (lo riceve con `/vini/ordini/{id}/ricevi`) oppure la tendina fornitori; `ricevi` registra il pagato col `prezzo_unit` della riga ordine | in sviluppo 02/11 |
| VMF.3 | **Fatture** (mig 226, pagina Vini › Fatture): righe BEVANDE › VINO dal 2026 via `fatture_righe_service` (platform, sola lettura); emittenti classificati una volta (distributore / cantina → Diretto / non vini); suggerimenti per produttore+nome+annata+formato, «Abbina i sicuri» in blocco, abbinamenti ricordati per P.IVA+descrizione; prezzo netto a bottiglia anche da cartoni («0,75X6», CT senza numero → 6 presunte, da verificare); confronto col pagato registrato (carico/ordine/storico, finestra −120/+45 gg): entro soglia sostituisce (anche il fornitore), oltre «da verificare» con «Vale la fattura / Vale il registrato» | fatto 03/11 (da pushare) |
| VMF.4 | **Listini** (mig 228, pagina Vini › Listini): carichi il PDF scegliendo il fornitore; TRGB legge le righe (prezzo = ultimo numero con la virgola della riga; produttore dalla colonna a sinistra del pallino nei listini 0,75, dalla riga sotto l'articolo nei gestionali tipo Marenzi), propone il vino (produttore obbligatorio, parole del nome, annata, formato; ogni vino una riga sola; a parità il prezzo più vicino al costo), spunta da sola le righe sicure (punteggio ≥ `vmf_listino_soglia_sicuri`, stessa annata, scarto dal costo entro `vmf_listino_scarto_max_pct`); le confermate diventano prezzi `listino` del fornitore con la data del listino e fanno da memoria per il listino dopo. PDF archiviato negli upload (`vini_listini/`). Solo PDF per ora | fatto 04/11 (da pushare) |
| VMF.5 | Valutare l'estensione alla carta bevande (D1) | da decidere |

## 4. Endpoint VMF.1–2 (`/vini/multifornitore`, ruoli: lettura modulo vini, scrittura `is_vini_manager`)

- `GET  /vini/multifornitore/madre/{madre_id}/` — fornitori del vino, preferito, per ogni annata ultimo pagato e ultimo listino per fornitore.
- `POST /vini/multifornitore/madre/{madre_id}/fornitori/` — aggiunge un fornitore (`fornitore_id`, oppure `nome` per crearne uno nuovo in anagrafica).
- `DELETE /vini/multifornitore/madre/{madre_id}/fornitori/{fornitore_id}` — toglie un fornitore (non il preferito, non se ha prezzi `pagato`).
- `POST /vini/multifornitore/madre/{madre_id}/preferito/` — cambia il preferito (aggiorna `vini_madre.fornitore_id` + sync bottiglie).
- `POST /vini/multifornitore/prezzi/` — registra un prezzo a mano (`tipo` pagato/listino).
- `GET  /vini/multifornitore/bottiglia/{bottiglia_id}/carico/` — proposta per il carico: ordini aperti con questo vino + fornitori ordinati (ultimo usato in cima).
- Movimento `CARICO` (`POST /vini/magazzino/{id}/movimenti`) accetta `fornitore_id`: con prezzo registra un `pagato` fonte `carico`.

## 4-bis. Endpoint VMF.3 (`/vini/multifornitore/fatture/*`, solo manager vini)

- `GET /fatture/` stato della pagina · `POST /fatture/aggiorna` legge le fatture nuove e applica la memoria
- `POST /fatture/emittenti/` {piva, tipo, fornitore_id} · `POST /fatture/righe/{id}/abbina` {bottiglia_id} · `POST /fatture/righe/{id}/ignora`
- `POST /fatture/prezzi/{id}/risolvi` {vale: fattura|carico} · `POST /fatture/conferma-sicuri` · `GET /fatture/cerca-vini/?q=`

Prova su copia DB (03/11): 397 righe vino 2026; con 7 distributori e 9 cantine classificati, «Abbina i sicuri» ne abbina 137 (98 ok, 39 da verificare); dei 95 confronti col registrato, 64 entro il 2%. Fuori soglia ricorrenti: 0,75 fattura −3% rispetto al listino, Balan −15%, sconti di scheda che la fattura non riporta (Marenzi 9%, Magri 10%).

## 4-ter. Endpoint VMF.4 (`/vini/multifornitore/listini/*`, solo manager vini)

- `GET /listini/` elenco · `POST /listini/` multipart {fornitore_id, data?, file} legge e propone · `GET /listini/{id}/` righe con proposta, listino di prima, Δ, «sicura» · `GET /listini/{id}/pdf`
- `POST /listini/righe/{id}/abbina` {bottiglia_id} · `POST /listini/righe/{id}/scarta` · `POST /listini/{id}/conferma` {righe:[id]} · `DELETE /listini/{id}` (solo se nessun prezzo confermato)

Prova su copia DB (04/11): listino 0,75 10/2026 → 878 righe lette, 156 con un vino proposto, 69 su vini con bottiglie in cantina (33 spuntate); 17 dei 19 vini aggiornati a mano il 01/11 riconosciuti (mancano Sforzato, scritto «Sorzato», e Bakkanali Rosso 2024). Marenzi 11/2026 → 2285 righe (acque e birre comprese), 52 proposte, 16 su vini in cantina. Ricaricando lo stesso listino la memoria riconosce 56 righe su 60 confermate.

## 5. Casi limite

- Vino senza madre o madre senza fornitore (65 al 02/11): nessun fornitore finché non arriva un carico o una fattura.
- «Stima» non è un fornitore vero: resta com'è, si vede come tale.
- Carico senza prezzo: il movimento si registra, il pagato no (il costo non cambia).
- Un pagato con `data` più vecchia dell'ultimo non cambia il costo (es. una fattura vecchia inserita dopo).
- Cancellare un movimento di carico non cancella il prezzo: va scartato (stato `scartato`) dalla scheda.
