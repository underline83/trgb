# Produzioni e codice lotto — TRGB Gestionale

> **Tipo:** 📄 pagina wiki · **Stato:** attuale — nato il 2026-11-26 (cucinaProduzioni 1.0, sistema 6.13, mig 248), **da provare in osteria** · **Ultima verifica:** 2026-11-26
> **Vedi anche:** [modulo_cucina.md](modulo_cucina.md), [modulo_scorte_cucina.md](modulo_scorte_cucina.md) (i lotti delle scorte sono un'altra cosa: arrivi e scadenze di ciò che è in frigo), [architettura_mattoni.md](architettura_mattoni.md) (M.G permessi, `pdfEtichetta`)

**Classificazione:** `[core]`. Qualsiasi cucina che produce e confeziona ha bisogno di un lotto. Nessun valore dell'osteria nel codice: la chiave segreta sta fra i dati del locale.
**Modulo:** `cucina`. Manifesto in `core/moduli/cucina/module.json`. Pagina `/cucina/produzioni`, sotto «Gestione Cucina».
**Schermate approvate:** artifact «TRGB · Cucina › Produzioni e codice lotto (proposta)» (26/11/2026, Q #426).

---

## 1. Decisioni di Marco (2026-11-26)

1. **Cosa dice il codice:** data di produzione (anno, mese, giorno), persona che ha prodotto, numero produzione a 2 cifre. Per il pubblico non deve voler dire niente.
2. **Com'è fatto:** 6 caratteri, lettere e cifre.
3. **Dove vive:** modulo Cucina, in una pagina nuova «Produzioni» (non dentro le Scorte).
4. **Il giro:** elenco di oggi → nuova produzione → registrata, si stampa → leggi un codice.
5. **Chi:** «admin, chef, sous chef e commis leggono e scrivono».

Impostate da Claude e non contestate (si cambiano se Marco dice diversamente): il numero produzione è il progressivo del giorno su tutta la cucina; le persone sono gli utenti di TRGB e il loro numero lo assegna TRGB; le due etichette restano entrambe e si sceglie alla stampa; sull'etichetta la scadenza è scritta «Scad. gg/mm/aaaa».

## 2. Il codice

| | |
|---|---|
| Lunghezza | 6 caratteri: 5 di contenuto + 1 di controllo |
| Caratteri | `23456789ABCDEFGHJKLMNPQRSTUVWXYZ` (senza `0`, `1`, `I`, `O`) |
| Contenuto | giorno (dal 01/01/2026) · persona 1-90 · produzione 0-99 |
| Vale fino al | 16/03/2036 |
| Chiave | `locali/<locale>/data/lotto_chiave.json`, creata da sola al primo codice; `LOTTO_CHIAVE` nell'ambiente, se c'è, vince |

Come funziona (`app/services/cucina_lotto_codice.py`): data, persona e numero diventano un numero solo; quel numero viene rimescolato con la chiave (rete di Feistel a 8 giri su HMAC-SHA256, rigirata finché rientra nei 25 bit); il risultato si scrive in 5 caratteri; il sesto è un controllo calcolato con la stessa chiave. Due produzioni vicine escono senza niente in comune, e un codice battuto male viene rifiutato 31 volte su 32.

**I numeri del formato non sono soglie.** Anno di partenza, 90 persone, 100 produzioni e alfabeto stanno nel codice del servizio e NON in una tabella: cambiarli cambia il significato delle etichette già stampate. Se un giorno non bastano si fa un formato nuovo a 7 caratteri accanto a questo.

**La chiave non si cambia e non si cancella.** È un `.json` apposta: `scripts/backup_db.sh` copia i `*.json` dei dati del locale. Se il file c'è ma non si legge, il servizio si ferma invece di crearne uno nuovo. Se la chiave andasse persa, i codici già registrati si rileggono comunque dal registro (`leggi_codice` guarda prima lì).

## 3. Il registro

DB `foodcost.db`, schema in `app/models/cucina_produzioni_db.py` (mig 248 + init al boot).

- **`cucina_produzioni_persone`** — `numero` (1-90) ↔ `username`. Assegnato la prima volta, mai riusato, mai cambiato.
- **`cucina_produzioni`** — una riga per produzione: `codice` (unico), `data`, `numero` (unico nel giorno), `persona_numero`, `nome`, `recipe_id` (se scelto dalle ricette), `data_scadenza`, `etichette`, `note`, chi e quando, `annullata_at/da`.

Regole (`app/services/cucina_produzioni_service.py`):

- La data non può essere nel futuro; la scadenza non può venire prima della data.
- **Data, persona e numero non si correggono**: sono dentro al codice. Si correggono nome, scadenza, numero di etichette, nota.
- **Annullare non cancella**: la riga resta, col suo codice e il suo numero (l'etichetta potrebbe essere già su un barattolo).
- Oltre 99 produzioni in un giorno, o oltre 90 persone, il servizio rifiuta con un messaggio chiaro.

## 4. Etichetta

`frontend/src/utils/etichettaLotto.js` sopra il mattone `utils/pdfEtichetta.js`: rotolo Brother 29×90 (lo stesso delle gift card), senza QR.

- **Completa:** nome (su una riga, rimpicciolito fino a 9 pt; se non basta su due), `Scad. gg/mm/aaaa` solo se c'è, `L CODICE`.
- **Solo il codice:** `LOTTO` e il codice in grande, per i prodotti che hanno già la loro etichetta.

Data di produzione, persona e numero non compaiono mai.

## 5. Permessi

Matrice Moduli: `ricette/produzioni` («Produzioni e lotti»), di default superadmin, admin, chef, sous_chef, commis; si cambia da Impostazioni › Moduli. Il router usa `richiede_sotto_modulo("ricette", "produzioni")` su tutti gli endpoint, lettura del codice compresa.

## 6. Capability

| Codice | Cosa fa | Riferimento | Audience | Stato docs |
|---|---|---|---|---|
| C-PL-001 | Elenco delle produzioni degli ultimi giorni, per giorno, col codice | `cucina_produzioni_router.py:elenco`, `CucinaProduzioni.jsx` `Elenco` | admin, brigata | ✅ |
| C-PL-002 | Registrare una produzione: cosa (dalle ricette o scritto), chi, data, scadenza, etichette; TRGB assegna numero e codice | `cucina_produzioni_router.py:registra`, `cucina_produzioni_service.registra`, `Nuova` | idem | ✅ |
| C-PL-003 | Suggerimenti mentre si scrive: già prodotto, poi ricette attive | `cucina_produzioni_service.suggerimenti` | idem | ✅ |
| C-PL-004 | Stampare l'etichetta 90×29 in due varianti, con le copie | `utils/etichettaLotto.js`, `Scheda` | idem | ✅ |
| C-PL-005 | Correggere nome, scadenza, etichette; annullare una produzione | `cucina_produzioni_router.py:correggi`, `annulla` | idem | ✅ |
| C-PL-006 | Leggere un codice: cosa, quando, chi, numero; rifiuto se scritto male; «valido ma non a registro» | `cucina_produzioni_router.py:leggi`, `cucina_produzioni_service.leggi_codice`, `Leggi` | idem | ✅ |

## 7. Prove

- `tests/test_lotto_codice.py` (8): andata e ritorno su 20.000 codici, estremi, nessun doppione in un giorno intero (9.000), codici vicini che non si somigliano, errori di battitura, chiave diversa.
- `tests/test_cucina_produzioni.py` (15): numeri del giorno, numero persona mai riusato, rifiuti, 99 al giorno, annullo, correzioni, lettura (a registro, senza chiave, non a registro, non valido), suggerimenti, chiave che nasce da sola.
- Etichetta: PDF vero generato con Node dalle due varianti e guardato (nome corto, senza scadenza, nome lungo su due righe).
- **Non provato:** gli endpoint dal vero (FastAPI non c'è nella VM di lavoro), la pagina nel browser, la stampa sulla Brother.

## 8. Aperto

- Collegare la produzione alle Scorte (un carico con lo stesso lotto) e alle ricette (resa, costo): non chiesto, da decidere.
- Leggere il codice con la fotocamera (servirebbe un QR o un codice a barre sull'etichetta): non chiesto.
- Pagina pubblica per il cliente: no, per scelta. Il codice non deve dire niente a chi non è in TRGB.
