# Skill `/guardiano` — Guida rapida per Marco

## Cos'è
Skill Claude che fa da agente "guardiano" del progetto TRGB. Complementa il modulo guardiano L1 di `push.sh`: L1 fa i check meccanici (debounce, probe HTTP, accessi nginx), questa skill fa i check semantici (legge git diff, controlla coerenza con roadmap/problemi/controllo_design, suggerisce commit message, aggiorna docs post-push).

## Come si invoca

In una qualsiasi chat Cowork con Claude, scrivi uno di questi:

| Comando | Cosa fa |
|---|---|
| `/guardiano` | Mini-dashboard rapido (file modificati, bug aperti, voci pending) |
| `/guardiano status` | Idem (alias) |
| `/guardiano check` | Pre-audit informativo: legge git diff, fa controlli semantici, suggerisce cosa pushare. Non modifica nulla. |
| `/guardiano push "messaggio"` | Pre-audit + lancia push.sh + post-audit (probe HTTP, verifica restart) + suggerimento update docs (sessione, changelog, roadmap, problemi) |

Se Claude non triggera la skill automaticamente alla prima parola, scrivi qualcosa tipo: *"esegui la skill guardiano"* oppure *"leggi `/Users/underline83/trgb/skills/guardiano/SKILL.md` e segui le istruzioni come guardiano check"*. Una volta caricata la prima volta nella sessione, dovrebbe poi ribaltare in automatico al solo `/guardiano`.

## Esempi pratici

### Caso 1 — "voglio capire dove sono"
```
Marco: /guardiano status
Claude: [mini-dashboard con voci aperte e priorità]
```

### Caso 2 — "ho fatto modifiche, voglio capire se posso pushare"
```
Marco: /guardiano check
Claude: [legge git diff, fa controlli, suggerisce commit msg + cosa aggiornare nei docs]
Marco: ok pusha
Claude: /guardiano push "<msg suggerito>"
```

### Caso 3 — "pusha questa modifica, mi fido"
```
Marco: /guardiano push "Vini v3.25: fix ricarico"
Claude: [pre-audit veloce, conferma con te, lancia push.sh, fa post-audit, propone update docs]
```

## Cosa NON fa

- Non lancia push.sh senza la tua conferma esplicita.
- Non modifica codice durante l'audit (lettura sola).
- Non scrive commit/push diretti (sempre via push.sh).
- Non sovrascrive sezioni di docs in modo distruttivo (solo INSERT mirate).

## Stato condiviso

Ogni audit/push aggiorna `/Users/underline83/trgb/.guardiano_state.json` (gitignored). Conserva l'ultimo timestamp, commit, warning, status HTTP post-push. Sia la skill che (in futuro) push.sh possono leggerlo per non ripetere lavoro.

## File della skill
- `skills/guardiano/SKILL.md` — istruzioni complete per Claude (lette automaticamente quando la skill triggera)
- `skills/guardiano/USAGE.md` — questo file (per Marco)
