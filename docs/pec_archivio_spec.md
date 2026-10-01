# Archivio PEC automatico in TRGB — specifica (da sviluppare)

> Stato: **proposta**, da sviluppare e testare dopo il rodaggio della regola Mail sul Mac.
> Classificazione: `[mixed]` — motore IMAP generico `[core]` (modulo platform), configurazione casella/percorsi `[locale:tregobbi]`.
> Modulo: platform (M.D email / M.H import) + notifiche (M.A).

## Obiettivo
Scaricare dal server PEC Aruba (IMAP) ogni nuova PEC di tregobbi@pec.it, archiviarla sul VPS con lo stesso schema
della regola Mail (`PEC/<anno>/<AAAA-MM-GG_HHMM>_<mittente>_<oggetto>/messaggio.eml + postacert.eml + daticert.xml + allegati/`)
e segnalarla in TRGB, così l'archivio non dipende dal Mac acceso.

## Funzionamento
1. Job schedulato ogni 60 min (cron/systemd timer sul VPS).
2. IMAP SSL `imaps.pec.aruba.it:993`, casella INBOX (+ Posta inviata per le PEC in uscita), solo UID nuovi (tabella `pec_messaggi` con UID/Message-ID per idempotenza).
3. Salvataggio del sorgente completo (valore legale) + estrazione di postacert.eml e degli allegati interni.
4. Classificazione: `ricevuta` (ACCETTAZIONE/CONSEGNA) vs `pec`; per le `pec` → notifica in bacheca TRGB "Nuova PEC da <mittente>: <oggetto>".
5. Pagina "PEC" in TRGB: elenco con filtri (da leggere / in gestione / chiusa), link agli allegati, campo note, pulsante "crea scadenza" (precompila una spesa fissa UNA_TANTUM in Controllo Gestione).
6. Sincronizzazione opzionale della cartella verso OneDrive (o accesso via share) per mantenere un'unica copia consultabile anche dal Mac.

## Sicurezza
- Password PEC solo in `.env` sul VPS (mai nel repo), utente IMAP in sola lettura dove possibile; nessuna cancellazione dal server Aruba.
- Log senza contenuti dei messaggi.

## Passi di rilascio
1. Script standalone su VPS in dry-run (solo log) per 1 settimana, confronto con l'archivio Mail.
2. Attivazione salvataggio + indice.
3. UI TRGB + notifiche.
4. Dismissione della regola Mail.
