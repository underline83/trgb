# Revisione Home — widget (2026-11-04)

> **Stato 2026-11-04:** Marco ha scelto la proposta **B** (card unica «Il turno»), fatta in home 4.0 — vedi `docs/changelog.md`. Aggiornamento automatico: 3 minuti fissi (decisione D). Restano aperte C ed E.
>
> Analisi iniziale: le decisioni in fondo sono di Marco.
> Riferimenti: `frontend/src/pages/Home.jsx` v9.5, `DashboardSala.jsx` v5.3, `HomeCucina.jsx`,
> `app/routers/dashboard_router.py`, roadmap **U.3** e `docs/controllo_design.md` §4.

## Verdetto
La pagina 1 è cresciuta per aggiunte (Lavagna, To-do, Preventivi) dentro la colonna 2, e oggi ha
**tre problemi veri**: dice le stesse cose due volte, non si aggiorna da sola, e all'ora di cena
apre sul pranzo. Prima di aggiungere widget configurabili per ruolo (U.3) conviene sistemare questi.

## Com'è oggi (admin / capo sala / sommelier / viewer)
| Colonna | Widget | Dati |
|---|---|---|
| 1 (1,3 fr) | 📅 Prenotazioni oggi (tab Pranzo/Cena) · 💵 Incasso ieri · 📈 Coperti mese | `/dashboard/home` |
| 2 (1 fr) | Selezioni del giorno · ⏳ Preventivi in attesa · La Lavagna · Le mie cose da fare | `/dashboard/home`, `/preventivi/in-attesa`, `/dashboard/lavagna`, todo |
| 3 (0,7 fr) | Azioni rapide (config per ruolo in Impostazioni) · «Tutti i moduli →» | `/settings/home-actions/` |

Sala → `DashboardSala` (stesso schema, + Calici disponibili). Cucina → `HomeCucina` (Miei turni, Lavagna, To-do).

## Problemi trovati

### Alti
1. **Tab turno fisso su «Pranzo».** `useState("pranzo")` in `Home.jsx:110` e `DashboardSala.jsx`: alle 19 si apre la lista del pranzo, anche se in alto c'è già la pillola «🌙 Cena» (`getTurno()`, soglia 15:00). Va inizializzato dal turno corrente.
2. **Doppioni fra widget.** La Lavagna ha già la frase del turno (prenotazioni, picco), la riga delle selezioni e gli eventi; accanto ci sono la card Prenotazioni e la card Selezioni con gli stessi dati. In colonna 2 si leggono le selezioni due volte, una sopra l'altra.
3. **Nessun aggiornamento automatico.** `useHomeWidgets`, `useLavagna` e `PreventiviInAttesaCard` caricano una volta sola: un iPad lasciato sulla Home durante il servizio non vede prenotazioni nuove, arrivi (pallino di stato) o note in Lavagna finché qualcuno non ricarica.

### Medi
4. **Colonna 2 sovraffollata, colonna 3 vuota.** Quattro widget ad altezza variabile in colonna 2; in colonna 3 sei-otto pulsanti e uno spazio vuoto (`lg:flex-1`). Su iPad orizzontale la pagina 1 scorre per arrivare alla Lavagna e al To-do.
5. **Ordine su telefono.** In colonna unica le Azioni rapide finiscono in fondo, dopo Lavagna e To-do: il tasto più usato è l'ultimo.
6. **Lavoro doppio sul server a ogni apertura.** `/dashboard/home` e `/dashboard/lavagna` calcolano entrambi le 4 selezioni e gli alert; `/home` inoltre lancia ad ogni apertura alert engine, sincronizzazione linea e scheduler task (sincroni, prima di rispondere). `/home` manda anche campi che la Home non usa (`alerts`, `fatture_pending`, macellaio/salumi/formaggi/pescato ripetuti fuori da `selezioni`). Da misurare il tempo reale prima di decidere.
7. **Codice copiato fra Home e DashboardSala.** Card Prenotazioni, mini-stat e griglia a 3 colonne sono duplicati: ogni ritocco va fatto due volte (il bug del punto 1 c'è in entrambe).

### Bassi (pulizia)
8. `MacellaioCard`, `SalumiCard`, `FormaggiCard` non sono più importate da nessuna parte (sostituite da `SelezioniCard`).
9. `PreventiviInAttesaCard` usa `window.prompt/confirm/alert` e `bg-neutral-100` (fuori styleguide; un `prompt` sull'iPad è scomodo).
10. `home_actions_router.py:41` ha un `_require_admin` scritto a mano invece di M.G (`solo_admin()`).
11. Incasso ieri e Coperti mese li vedono anche sommelier e viewer (il backend li svuota solo per la cucina). Da confermare se va bene.

## Proposta di layout (stessi widget, niente di nuovo)
| Colonna | Cosa | Perché |
|---|---|---|
| 1 — **Servizio** | Prenotazioni del turno corrente (tab automatico) + Incasso/Coperti | È la cosa che si guarda di più |
| 2 — **Briefing** | La Lavagna (in alto) + ⏳ Preventivi in attesa | La Lavagna è il briefing; le selezioni ci sono già dentro |
| 3 — **Le mie cose** | Azioni rapide (compatte) + Le mie cose da fare | Riempie la colonna vuota, scarica la 2 |

- La card **Selezioni** esce dalla Home admin (resta in Lavagna, come riga) oppure diventa compatta (una riga con 4 chip) — vedi decisione B.
- **Telefono**: Prenotazioni → Azioni rapide (griglia 2×) → Lavagna → Preventivi → To-do → Incasso/Coperti.
- **Aggiornamento**: ricarica ogni 2-3 minuti e quando l'iPad torna in primo piano (il valore sta in Impostazioni, non nel codice).
- **Un componente solo** per Prenotazioni e mini-stat, usato da Home e DashboardSala.

Dopo questo, U.3 (widget scelti per ruolo da Impostazioni, come le azioni rapide) diventa facile: i widget sono già blocchi separati.

## Decisioni per Marco (una alla volta)
- **A.** Il layout proposto (Servizio / Briefing / Le mie cose) va bene?
- **B.** Card Selezioni sulla Home admin: tolta (resta in Lavagna) o compatta su una riga?
- **C.** Incasso e Coperti: visibili a sommelier e viewer, o solo admin e capo sala?
- **D.** Ogni quanto si aggiorna da sola la Home (proposta: 3 minuti)?
- **E.** Pulizia dei punti 6, 8, 9, 10 nello stesso giro o a parte?

Classificazione del lavoro quando si farà: `[core]` (Home, widget, dashboard_router), nessuna migrazione se l'intervallo di aggiornamento va in una impostazione esistente.
