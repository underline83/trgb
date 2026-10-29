# Spec — Linea cucina: dal menu alla checklist, dalla checklist agli ordini — TRGB Gestionale

> **Tipo:** 📄 pagina wiki · **Stato:** L1 online (mig 202) e travaso fatto per antipasti, primi, secondi e contorni (2026-10-20/22); **L2 sviluppata il 2026-10-22 (mig 207, da pushare)**; dolci e pranzo rinviati da Marco · **Ultima verifica:** 2026-10-22
> **Vedi anche:** [modulo_cucina.md](modulo_cucina.md) · [modulo_scorte_cucina.md](modulo_scorte_cucina.md) · [modulo_ricette_foodcost.md](modulo_ricette_foodcost.md) · [modulo_menu_carta.md](modulo_menu_carta.md) · [modulo_pranzo.md](modulo_pranzo.md) · [modulo_acquisti.md](modulo_acquisti.md)

**Creato:** 2026-10-20
**Classificazione:** `[core]` — vale per qualunque ristorante con menu, ricette e frigoriferi mappati
**Modulo:** `cucina` (decisione Marco 2026-10-20). Legge menu, ricette e acquisti tramite servizi platform di sola lettura; non li modifica.

---

## 1. Perché

Oggi le checklist di linea (8 template «Linea Antipasti/Primi/Secondi/Contorni · Pranzo/Sera», ottobre 2026) sono scritte a mano: se cambia un piatto, qualcuno deve ricordarsi di cambiare la checklist; se una scorta è sotto il minimo, la checklist lo registra ma non succede niente.

Il sistema va **capovolto** (Marco, 2026-10-20):

> Si parte dal menu in corso (carta e pranzo). Ogni piatto ha una ricetta; la ricetta è composta da **preparazioni** (altre ricette) e **componenti** (ingredienti, legati ai fornitori). Tutte le parti della ricetta costruiscono la checklist, ognuna con controllo su linea, scorta, scorta gelo e quantità di riordino. Dalla checklist partono gli avvisi per gli ordini e i task da fare.

## 2. La catena

```
Menu in corso (carta in_carta + pranzo del giorno)
  └─ Piatto = ricetta (kind=dish)
       └─ Elementi = righe della ricetta, esplose ricorsivamente
            ├─ Preparazione (sub_recipe_id)  → si PRODUCE  → task con la ricetta
            └─ Componente   (ingredient_id)  → si ORDINA   → lista spesa col fornitore
                 └─ Articolo in Frigoriferi e scorte (cucina_articoli)
                      └─ giacenze per ripiano (frigo / congelatore), lotti, scadenze
```

Un **elemento** è unico anche se lo usano più piatti (il fondo bruno è uno). La checklist lo mostra **una volta per partita e servizio**.

## 3. Cosa esiste già (si riusa, non si riscrive)

| Pezzo | Dove | Note |
|---|---|---|
| Carta in corso | `menu_editions` (stato in_carta) + `menu_dish_publications.recipe_id` | |
| Pranzo del giorno | `pranzo_menu` + `pranzo_menu_righe.recipe_id` | |
| Albero ricetta | `recipes` + `recipe_items` (`ingredient_id` **o** `sub_recipe_id`) | 25 basi Autunno 2026 create il 2026-10-19 come bozze (id 193-219) |
| Componente → fornitore | `ingredients` + `ingredient_supplier_map` (default, conversioni) + `ingredient_prices` | |
| Frigo, gelo, giacenze | `cucina_ubicazioni` (FRIGO / FREEZER / DISPENSA), `cucina_ripiani`, `cucina_articoli`, `cucina_giacenze`, `cucina_lotti`, `cucina_movimenti` | regime SEMAFORO / CONTA / MOVIMENTI per articolo |
| Lavori e avvisi | `task_singolo`, `lista_spesa_items`, M.A notifiche, M.F alert engine | |
| Checklist | `checklist_template/item/instance/execution`, voci padre (mig 182), voce→ricetta (mig 201) | |

## 4. Cosa manca (modello dati)

### 4.1 Su `cucina_articoli` (esiste) — 4 colonne nuove, ADD COLUMN idempotenti
| Campo | Tipo | Perché |
|---|---|---|
| `recipe_id` | INTEGER NULL | la preparazione che questo articolo **è** (es. articolo «Crema Hokkaido» = ricetta 193). Oggi c'è solo `ingredient_id` |
| `scorta_min_frigo` | REAL NULL | minimo sui ripiani di ubicazioni FRIGO |
| `scorta_min_gelo` | REAL NULL | minimo sui ripiani di ubicazioni FREEZER (NULL = non si tiene a gelo) |
| `qta_riordino` | REAL NULL | quanto produrre / ordinare quando si scende sotto il minimo |

`scorta_minima` esistente resta per compatibilità (= minimo totale). Le soglie stanno nel DB, mai nel codice. In una fase successiva il minimo potrà essere espresso in **giorni di copertura** dal consumo (venduto cassa × grammature ricetta) — campo `giorni_copertura` già esistente.

### 4.2 Nuova `cucina_linea_elementi` — la linea, per articolo **e** partita
| Campo | Tipo | Note |
|---|---|---|
| `id` | PK | |
| `articolo_id` | FK cucina_articoli | |
| `partita` | TEXT | antipasti / primi / secondi / contorni / dolci / generale |
| `linea_qta` | TEXT | come si dice in cucina: «GN 1/9 + 1 pentolino», «6 monoporzioni», «1 biberon» |
| `linea_note` | TEXT NULL | «arrivati a metà, scongelarne un altro» |
| `ordine`, `attivo` | | |

Serve per partita perché lo stesso articolo può stare in due linee con dotazioni diverse (fondo bruno: GN 1/9 in antipasti, GN 1/9 + pentolino nei secondi).

**Elementi che non sono articoli** (pentole in bollore, padelle pronte, salvia sul pass, pescato del giorno): restano voci libere per partita in `cucina_linea_voci_extra` (testo + partita), sempre presenti.

## 5. La checklist generata

Ogni giorno, per ogni partita e servizio (Pranzo entro 12:30, Sera entro 23:59 — orari in config, non hardcoded):

1. legge i piatti in corso (carta + pranzo del giorno);
2. esplode le ricette fino agli elementi;
3. per ogni elemento con `cucina_linea_elementi` della partita crea la voce, **sotto il piatto come voce padre**; gli elementi usati da più piatti finiscono una volta sola, nel primo piatto o in «Generale»;
4. aggiunge le voci extra della partita.

Le 8 Linee scritte a mano si **disattivano** quando la generata è pronta; i parametri che Marco ha dettato (linea, scorte, gelo) si travasano negli articoli e in `cucina_linea_elementi` — non si riscrivono.

**Come è fatto (L2, 2026-10-22).** Generatore in `app/services/linea_checklist.py`; il Task Manager resta il motore (istanze, scadenze, Oggi).
- **Dove**: nelle checklist di oggi (decisione Marco 2026-10-22), non in una schermata a parte. Una checklist per partita e servizio, `generato_da = 'linea:<partita>:<turno>'`, nome «Linea Primi · Sera». Nascono spente; `POST /cucina/scorte/linea/attiva` le accende e spegne le vecchie a mano con lo stesso nome (le istanze di oggi non ancora toccate delle vecchie diventano SALTATE col motivo).
- **Esplosione**: piatto → righe della ricetta; una preparazione che ha un suo articolo si ferma lì, una che non ce l'ha si esplode; il piatto stesso conta se è un articolo (lasagnetta). Sezione carta → partita da config `linea_sezioni`.
- **Raggruppamento**: la voce di linea sta sotto **ogni** piatto che usa l'articolo (gremolada sotto ossobuco e rognone, come chiesto da Marco; la spunta è condivisa). Le righe marcate **«Generale»** (`cucina_linea_elementi.generale`) stanno nel gruppo Generale, sempre, insieme alle voci extra. Una riga che nessun piatto in carta usa e non è Generale **non entra** (piatto uscito dalla carta).
- **Voci**: `LINEA` (semaforo) per piatto; `SCORTA_FRIGO` / `SCORTA_GELO` / `SCORTA_DISPENSA` (mig 220, riso e pasta secca) una volta per partita, se l'articolo ha il minimo. Scorte controllate **a ogni servizio**, pranzo e sera (decisione Marco 2026-10-22).
- **Stabilità**: ogni voce ha `linea_ref`; al giro dopo si aggiorna sul posto, le spunte restano; una voce sparita prende `disattivo_at` (resta nello storico).
- **Quando gira**: dopo ogni modifica di linea o articolo, all'apertura della Home (throttle 60 s), `POST /cucina/scorte/linea/genera`. Anteprima: `GET /cucina/scorte/linea/generata`.
- **Scorta**: proposta da `GET /cucina/scorte/linea/scorte`; tap = confermo (se il dato è fresco), ✎ = conta ripiano per ripiano; la conferma scrive una RETTIFICA per ripiano (`POST /cucina/scorte/linea/scorte/conferma`) e poi spunta la voce col totale. Primo controllo di un articolo mai messo in frigo: si sceglie il ripiano, che diventa il ripiano di casa (decisione Marco 2026-10-22).
- **Regime**: gli articoli in linea con un minimo frigo/gelo sono passati da SEMAFORO a **CONTA** (23 articoli, 2026-10-22, decisione Marco): servono numeri per proporre e confrontare col minimo.

### 5.1 Tre controlli per elemento

| Livello | Come si controlla | Regole |
|---|---|---|
| **Linea** | **semaforo** (Marco 2026-10-23, davanti al frigo): 🟢 a posto → voce OK · 🟡 vado a prendere e controllare → la voce resta **aperta**, ci si torna e la si chiude in verde (sistemando anche la scorta) · 🔴 non ho la merce per completare → voce FAIL (in L3: produzione/ordine). Lo stato lo deriva il server dal colore. **Numero** (mig 208): con il verde è la dotazione piena (`linea_qta_num` → `checklist_item.max_valore`); con giallo e rosso il cuoco dice quante ce ne sono e si vede quante ne mancano. Dotazione senza numero (GN, pentolino) → solo il colore. **Dotazione composta** («1 sifone pronto + 1 busta scongelata») = una voce per pezzo, ognuna col suo numero (Marco 2026-10-23); gemelle per la spunta condivisa solo a parità di voce (stesso titolo) | manuale |
| **Scorta frigo** | il gestionale **legge e propone** la giacenza dai ripiani FRIGO; il cuoco **conferma** o **corregge** | mai compilata da sola: senza conferma la voce resta aperta |
| **Scorta gelo** | come frigo, sui ripiani FREEZER (solo se `scorta_min_gelo` è valorizzato) | idem |

- **Correzione = movimento in Scorte** (RETTIFICA, con utente e ora, annullabile): checklist e frigoriferi dicono sempre lo stesso numero. Se l'articolo sta su più ripiani, la voce mostra un numero per ripiano e si corregge quello giusto.
- Articoli a regime **SEMAFORO** (senza quantità): si propone e si conferma lo stato OK / ESAURIMENTO / FINITO invece del numero.
- **Dato vecchio** (oltre `giorni_dato_fresco`): niente proposta, la voce chiede di contare.
- **Lotti**: se ci sono buste in scadenza la voce lo dice («2 buste scadono domani: usare prima quelle»).
- **Spunta condivisa** (mig 201) resta: stesso elemento, stesso giorno e servizio, una sola conferma (decisione Marco 2026-10-20). Olio al rosmarino, fondo bruno e funghi trifolati sono condivisi tra partite.

## 6. Dagli esiti al lavoro

Solo su esiti **confermati**:

| Esito | Preparazione | Componente |
|---|---|---|
| Linea 🟡 | task «rifornire linea da scorta» (normale) | idem |
| Linea 🔴 | task urgente «rifornire subito» | idem |
| Scorta frigo < min | task «produrre X» con link ricetta e `qta_riordino` | riga lista spesa con fornitore di default e `qta_riordino` |
| Scorta gelo < min | task «produrre e abbattere X» | riga lista spesa |

- I task vanno alla partita (reparto cucina, livello), con scadenza; si chiudono da soli quando la giacenza torna sopra il minimo.
- **Gli ordini non partono da soli**: la lista spesa si raggruppa per fornitore e la confermano Marco, lo chef o il sous chef (ruoli admin/chef/sous_chef via M.G).
- Niente doppioni: se c'è già un task/riga aperta per lo stesso articolo, si aggiorna quella.
- Notifica (M.A) a chef/sous chef per gli urgenti.

**Come è fatto (L3, 2026-10-23, decisioni Marco).** `app/services/linea_esiti.py` `valuta()`: gira dopo ogni spunta di linea/scorta, conferma di scorta, movimento di magazzino e dalla Home (throttle 60 s).
- **Rosso** («manca la merce») o **scorta confermata oggi sotto il minimo**: preparazione (`articolo.recipe_id`) → task «Produrre: X · quantità» (`origine='LINEA'`, `ref_modulo='cucina_articoli'`, `ref_id`=articolo; rosso = ALTA + campanello a chef e sous chef, sotto il minimo = MEDIA; link ricetta nella descrizione). Componente → riga in Lista spesa con `da_confermare = 1` (fornitore, Marco 2026-10-23: il **preferito** dell'ingrediente se segnato — «sovrascrive» —, poi quello scritto sull'articolo, poi l'**ultimo** da cui si è comprato; il preferito si segna con ☆ nella pagina prezzi dell'ingrediente, `POST /foodcost/matching/preferito`; quantità: `qta_riordino`, altrimenti «almeno» quanto manca al minimo); si spunta come presa solo dopo la conferma (`POST /lista-spesa/items/{id}/conferma`, admin/chef/sous chef) o si scarta («Non serve»).
- **Giallo**: niente, salvo checklist SCADUTA ancora gialla → task «Rifornire la linea: X».
- **Idempotenza**: un task di linea aperto e una proposta aperta per articolo (aggiornati, priorità che sale e non scende); ogni esito agisce una volta (un task chiuso a mano non rinasce dallo stesso esito); un task aperto di ieri torna a oggi.
- **Chiusura da sola**, solo su fatto positivo: giacenza che copre tutti i minimi, o (articolo senza minimi) linea verde dopo il task. Le proposte non confermate spariscono alla stessa condizione; quelle confermate restano (sono ordini).

## 7. Fasi

| Fase | Contenuto | Migrazioni |
|---|---|---|
| **L1** | ✅ colonne su `cucina_articoli`, `cucina_linea_elementi`, voci extra, endpoint `/cucina/scorte/linea/…`, scheda «Linea» nella ricetta (mig 202, 2026-10-20) · ⏸ scheda Linea nell'articolo (Cucina iPhone) · ✅ **travaso** dei parametri di antipasti, primi, secondi e contorni (articoli collegati a ricetta/ingrediente, minimi frigo/gelo/dispensa, righe di linea e voci extra; dati via API, 2026-10-22) · ⏸ dolci: prima le considerazioni di Marco, poi composizione e linea | sì |
| **L2** | 🔨 sviluppata 2026-10-22 (mig 207, da pushare): generatore dalla carta in corso; semaforo linea; proposta/conferma/correzione scorte con scrittura in Scorte · ⏸ pranzo del giorno e dolci (rinviati da Marco) | sì (mig 207) |
| **L3** | 🔨 sviluppata 2026-10-23 (mig 209, da pushare): `services/linea_esiti.py` — esiti → task e lista spesa da confermare, avvisi, chiusura da sola | sì (mig 209) |
| **L4** | minimi in giorni di copertura dal consumo (vendite × grammature) | sì |

Prerequisito di dati (lavoro una tantum, si fa da UI o lo fa Claude via API): ogni elemento dei piatti in corso deve avere il suo articolo in Scorte con ripiano di casa; le ricette dei piatti devono avere le righe (preparazioni e componenti). **Le grammature per porzione non servono per L1-L3**: si completano in seconda fase (food cost e L4).

## 8. Decisioni

| Data | Decisione |
|---|---|
| 2026-10-20 | Il sistema parte dal menu e dalle ricette; la checklist è una conseguenza |
| 2026-10-20 | Tutto nel modulo **cucina** |
| 2026-10-20 | Linea a **semaforo** (da provare) |
| 2026-10-20 | Scorta frigo/gelo **proposta e confermata**, mai compilata da sola; la correzione aggiorna anche frigorifero/congelatore |
| 2026-10-20 | Spunta condivisa tra voci dello stesso elemento: resta |
| 2026-10-20 | Grammature per porzione: seconda fase (non bloccano checklist ed esiti) |
| 2026-10-20 | La lista spesa la confermano Marco, lo chef o il sous chef |
| 2026-10-20 | I dolci entrano nello stesso giro (partita «dolci») |
| 2026-10-22 | Dolci e piatti del pranzo rinviati: prima completare il resto e vederlo operativo |
| 2026-10-22 | Checklist generate dentro le checklist di oggi (stesso motore, stesse schermate) |
| 2026-10-22 | Scorte frigo/gelo controllate a ogni servizio (pranzo e sera) |
| 2026-10-22 | Articoli con un minimo frigo/gelo a regime CONTA |
| 2026-10-22 | Articolo senza ripiano: al primo controllo il cuoco conta e sceglie il ripiano |
| 2026-10-23 | Semaforo: verde a posto, giallo «vado a prendere, ci torno» (voce aperta), rosso «manca la merce» |
| 2026-10-23 | Il numero in linea: verde conferma la dotazione, giallo e rosso chiedono quante ce ne sono |
| 2026-10-23 | Prova: accesa solo la linea antipasti «dal menu» (Pranzo e Sera), insieme alle vecchie a mano |

## 9. Domande aperte

- Composizione da completare perché tutto entri (anteprima 2026-10-22): nei antipasti Uova (battuta), Giardiniera (salame), salumi del tagliere (porchetta, crudo/culaccio, coppa, coppa di testa/speck) non sono nelle ricette dei piatti → oggi non compaiono.
- Dopo l'accensione: L3 (esiti → task e lista spesa).
