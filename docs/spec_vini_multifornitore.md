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
| VMF.3 | **Fatture**: abbinamento righe `fe_righe` dei fornitori vino → bottiglia (auto + conferma dei dubbi, come gli ingredienti), confronto col carico con soglia D4, lista «da verificare» | da fare |
| VMF.4 | Listini: import di un listino PDF come prezzi `listino` del fornitore (oggi a mano/via Claude) | da fare |
| VMF.5 | Valutare l'estensione alla carta bevande (D1) | da decidere |

## 4. Endpoint VMF.1–2 (`/vini/multifornitore`, ruoli: lettura modulo vini, scrittura `is_vini_manager`)

- `GET  /vini/multifornitore/madre/{madre_id}/` — fornitori del vino, preferito, per ogni annata ultimo pagato e ultimo listino per fornitore.
- `POST /vini/multifornitore/madre/{madre_id}/fornitori/` — aggiunge un fornitore (`fornitore_id`, oppure `nome` per crearne uno nuovo in anagrafica).
- `DELETE /vini/multifornitore/madre/{madre_id}/fornitori/{fornitore_id}` — toglie un fornitore (non il preferito, non se ha prezzi `pagato`).
- `POST /vini/multifornitore/madre/{madre_id}/preferito/` — cambia il preferito (aggiorna `vini_madre.fornitore_id` + sync bottiglie).
- `POST /vini/multifornitore/prezzi/` — registra un prezzo a mano (`tipo` pagato/listino).
- `GET  /vini/multifornitore/bottiglia/{bottiglia_id}/carico/` — proposta per il carico: ordini aperti con questo vino + fornitori ordinati (ultimo usato in cima).
- Movimento `CARICO` (`POST /vini/magazzino/{id}/movimenti`) accetta `fornitore_id`: con prezzo registra un `pagato` fonte `carico`.

## 5. Casi limite

- Vino senza madre o madre senza fornitore (65 al 02/11): nessun fornitore finché non arriva un carico o una fattura.
- «Stima» non è un fornitore vero: resta com'è, si vede come tale.
- Carico senza prezzo: il movimento si registra, il pagato no (il costo non cambia).
- Un pagato con `data` più vecchia dell'ultimo non cambia il costo (es. una fattura vecchia inserita dopo).
- Cancellare un movimento di carico non cancella il prezzo: va scartato (stato `scartato`) dalla scheda.
