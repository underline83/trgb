# Prompt per l'agente del sito tregobbi.it — sezione «Pranzo»

Aggiungi al sito tregobbi.it (`sites/tregobbi.it`, build con `build.py`, pubblicazione con `./pubblica.sh`) una sezione **«Pranzo»** con il menu pranzo della settimana. Il menu va letto **dal browser del cliente** quando apre la pagina, NON al momento del build. Il menu cambia ogni settimana e il sito non deve essere ricostruito per questo.

## Contesto

- Il QR ufficiale (qrco.de/Tregobbi) punta a `https://www.tregobbi.it/menu/`. Quella pagina la genera `build.py` (`scrivi_menu`) e apre la sezione Carta nella lingua del telefono (it en fr de es uk, altrimenti it).
- Prima il QR portava anche a `/privata/pranzo.pdf`. È superato: non va linkato.
- Il pranzo si compone in TRGB, il gestionale. TRGB ora espone il menu in un endpoint pubblico. Quella parte è già fatta: non toccare TRGB.

## L'endpoint

`GET https://trgb.tregobbi.it/pranzo/public/settimana/` (lo slash finale è obbligatorio)

- Non serve login. Ha CORS `*` e cache di 5 minuti. Usa una `fetch` semplice, **senza** `credentials: "include"` e senza header custom, così il browser non fa la preflight.
- Risponde sempre 200. Esempio:

```json
{
  "oggi": "2026-10-24",
  "settimana_inizio": "2026-10-19",
  "disponibile": true,
  "titolo": "PRANZO",
  "sottotitolo": "la cucina del mercato",
  "titolo_business": "Menù Business",
  "prezzi": [{"portate": 1, "prezzo": 15.0}, {"portate": 2, "prezzo": 25.0}, {"portate": 3, "prezzo": 35.0}],
  "note_servizio": ["acqua, coperto e servizio inclusi", "da lunedì a venerdì"],
  "categorie": [
    {"categoria": "antipasto", "piatti": [{"nome": "…"}]},
    {"categoria": "primo",     "piatti": [{"nome": "…"}, {"nome": "…"}]},
    {"categoria": "secondo",   "piatti": [{"nome": "…"}]}
  ],
  "aggiornato_il": "2026-10-24 14:49:40"
}
```

- Le chiavi possibili di `categoria` sono `antipasto`, `primo`, `secondo`, `contorno`, `dolce` e `altro`. Arrivano già nell'ordine giusto e le categorie vuote non arrivano.
- Senza un menu salvato per la settimana arriva `disponibile: false` con `categorie: []`. Su un guasto di TRGB arriva in più `errore: true`.

## Cosa fare

1. **Dove.** Nella pagina `/menu/`, accanto alla Carta, una sezione o linguetta «Pranzo» raggiungibile con l'ancora `#pranzo`. Se ha senso, mettila anche nella sezione Carta delle pagine di lingua. Lo stile è quello della carta già presente sul sito: niente grafica nuova inventata.
2. **Lingue.** Le etichette fisse vanno tradotte nelle 6 lingue del sito con il meccanismo che il build usa già:
   - categorie al plurale (it: Antipasti, Primi, Secondi, Contorni, Dolci; `altro` = «Dal mercato»);
   - righe dei prezzi (it: «Una portata a scelta», «Due portate a scelta», «Tre portate a scelta»), con il prezzo in euro;
   - titolo e sottotitolo della sezione.
   I **nomi dei piatti non si traducono mai**: si mostrano come arrivano. Vale la regola del sito sui piatti tradizionali.
   `titolo`, `sottotitolo`, `titolo_business` e `note_servizio` arrivano in italiano da TRGB. In italiano mostrali così come sono. Nelle altre lingue usa le traduzioni del sito dei testi standard. Segnala a Marco se in TRGB quei testi cambiano rispetto allo standard.
3. **Prezzi.** Mostra il riquadro Menù Business con i 3 prezzi e le note di servizio. ⚠️ Marco deve ancora confermare se vuole i prezzi sul sito (la carta sul sito è senza prezzi per sua scelta). Chiediglielo prima di pubblicare.
4. **Quando non c'è.** Se `disponibile` è false, se c'è `errore`, se la fetch fallisce o se non risponde entro circa 4 secondi, la sezione **sparisce del tutto**: niente messaggi d'errore e niente linguetta vuota. Il resto della pagina non deve aspettare il pranzo.
5. **Giorni.** Non scrivere nel codice i giorni di servizio. Il menu vale per la settimana e le note di servizio dicono già «da lunedì a venerdì».
6. **Niente** PDF del pranzo, niente link a `/privata/pranzo.pdf` e niente chiamate a TRGB durante il build per il pranzo.
7. Se il sito ha il tracciamento clic (`data-obiettivo`), la sezione non ne ha bisogno.

## Verifica

- In locale apri la pagina e controlla che la fetch all'endpoint vero risponda e che i piatti compaiano. Prova anche il caso «sparisce» con un URL sbagliato.
- Controlla almeno it, en e de su larghezza telefono.
- La pubblicazione la lancia Marco con `./pubblica.sh`. Dopo il caricamento la cache di Aruba può servire la pagina vecchia per ore: verifica scaricando il file dal server.
- Aggiorna il ricordo Q #247 («Menu pranzo sul sito e nel QR») quando la sezione è online.
