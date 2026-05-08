-- ============================================================
-- v2.0 — GET /uscite (Scadenzario)
-- Query JOIN "CG aggregatore": cg_uscite rimane indice di workflow,
-- ma per le righe FATTURA la "verita'" dei campi di pianificazione
-- e' in fe_fatture.
-- ============================================================
--
-- Decisioni consolidate in docs/v2.0-decisioni.md:
--   A1: tre campi data distinti su fe_fatture
--       (data_scadenza, data_prevista_pagamento, data_effettiva_pagamento)
--   A3: cg_uscite di fatture rateizzate -> stato='RATEIZZATA' (a regime).
--       In backfill Fase A il solo fe_fatture.rateizzata_in_spesa_fissa_id
--       e' stato popolato; le cg_uscite restano nei loro stati originali.
--       La query deve quindi nascondere in OR:
--         - fatture con rateizzata_in_spesa_fissa_id IS NOT NULL
--         - uscite con stato='RATEIZZATA'
--   B1: CASE-in-SELECT, niente UNION ALL (query unica, piu' leggibile).
--       Fallback a UNION solo se benchmark mostra >1.5x rispetto a v1.7.1.
--   B2: indici idx_fatture_rateizzata / idx_fatture_data_prevista /
--       idx_fatture_data_effettiva gia' creati (mig 055/056).
--
-- ============================================================
-- 1) QUERY VECCHIA v1.7.1 (baseline per confronto)
-- ============================================================
SELECT
    u.*,
    f.modalita_pagamento            AS mp_xml,
    f.condizioni_pagamento          AS cp_xml,
    s.modalita_pagamento_default    AS mp_fornitore,
    s.giorni_pagamento              AS giorni_fornitore,
    sf.tipo                         AS sf_tipo,
    sf.frequenza                    AS sf_frequenza,
    sf.titolo                       AS sf_titolo,
    pb.titolo                       AS batch_titolo,
    pb.stato                        AS batch_stato,
    pb.created_at                   AS batch_created_at
FROM cg_uscite u
LEFT JOIN fe_fatture         f  ON u.fattura_id           = f.id
LEFT JOIN suppliers          s  ON u.fornitore_piva       = s.partita_iva
LEFT JOIN cg_spese_fisse     sf ON u.spesa_fissa_id       = sf.id
LEFT JOIN cg_pagamenti_batch pb ON u.pagamento_batch_id   = pb.id
-- WHERE filtri (stato, fornitore, range data) costruiti lato Python
ORDER BY u.data_scadenza ASC NULLS LAST;

-- ============================================================
-- 2) QUERY NUOVA v2.0 (CASE-in-SELECT)
-- ============================================================
-- Campi nuovi nel payload:
--   data_scadenza_effettiva   -> la data "da mostrare" a schermo
--   data_scadenza_originale_xml -> la scadenza XML intoccabile (alias di f.data_scadenza)
--   data_prevista_pagamento   -> override utente (pianificazione finanziaria)
--   data_effettiva_pagamento  -> data pagamento reale (popolata da "segna pagata" / riconciliazione)
--   iban_beneficiario_eff     -> IBAN fallback chain
--   modalita_pagamento_eff    -> MP fallback chain
--   rateizzata_in_spesa_fissa_id -> per badge frontend
--
-- Retrocompatibilita':
--   u.data_scadenza, u.modalita_pagamento (se presente), u.fornitore_nome, u.totale,
--   u.stato, u.importo_pagato, u.metodo_pagamento, u.banca_movimento_id, u.fattura_id,
--   u.spesa_fissa_id, u.periodo_riferimento, u.pagamento_batch_id, u.in_pagamento_at,
--   u.numero_fattura, u.data_fattura
--   -> tutti restano identici al v1.7.1 (cg_uscite e' ancora la fonte per questi).
--
-- La "data_scadenza" del payload viene RIMAPPATA a data_scadenza_effettiva
-- in fase di arricchimento Python, per non rompere il frontend che legge row["data_scadenza"].

SELECT
    -- tutti i campi nativi di cg_uscite (retrocompatibilita')
    u.id,
    u.fattura_id,
    u.fornitore_nome,
    u.fornitore_piva,
    u.numero_fattura,
    u.data_fattura,
    u.totale,
    u.data_scadenza                 AS data_scadenza_cg,        -- rinominato: resta come fallback
    u.importo_pagato,
    u.data_pagamento,
    u.stato                         AS stato_cg,                 -- rinominato: stato da rimappare se RATEIZZATA
    u.banca_movimento_id,
    u.note,
    u.created_at,
    u.updated_at,
    u.metodo_pagamento,
    u.tipo_uscita,
    u.spesa_fissa_id,
    u.periodo_riferimento,
    u.data_scadenza_originale,
    u.pagamento_batch_id,
    u.in_pagamento_at,

    -- campi JOIN tradizionali
    f.modalita_pagamento            AS mp_xml,
    f.condizioni_pagamento          AS cp_xml,
    s.modalita_pagamento_default    AS mp_fornitore,
    s.giorni_pagamento              AS giorni_fornitore,
    sf.tipo                         AS sf_tipo,
    sf.frequenza                    AS sf_frequenza,
    sf.titolo                       AS sf_titolo,
    pb.titolo                       AS batch_titolo,
    pb.stato                        AS batch_stato,
    pb.created_at                   AS batch_created_at,

    -- NUOVI campi v2.0 (fe_fatture come fonte di verita' per pianificazione)
    f.rateizzata_in_spesa_fissa_id,
    f.data_scadenza                 AS data_scadenza_xml,
    f.data_prevista_pagamento,
    f.data_effettiva_pagamento,
    f.iban_beneficiario             AS iban_fattura,
    f.modalita_pagamento_override,
    s.iban                          AS iban_fornitore,
    sf.iban                         AS iban_spesa_fissa,

    -- Campi derivati (CASE-in-SELECT)
    -- "data_scadenza_effettiva" = la data che il frontend deve mostrare in colonna Scadenza
    --  priorita' 1: data_effettiva_pagamento (se pagata, vince sempre)
    --  priorita' 2: data_prevista_pagamento  (override utente di pianificazione)
    --  priorita' 3: u.data_scadenza          (valore storico di cg_uscite: puo' avere modifiche pre-v2.0)
    --  priorita' 4: f.data_scadenza          (XML analitico, ultima spiaggia)
    COALESCE(
        f.data_effettiva_pagamento,
        f.data_prevista_pagamento,
        u.data_scadenza,
        f.data_scadenza
    )                                AS data_scadenza_effettiva,

    -- "modalita_pagamento_effettiva" con fallback chain completa
    COALESCE(
        f.modalita_pagamento_override,
        f.modalita_pagamento,
        s.modalita_pagamento_default
    )                                AS modalita_pagamento_effettiva,

    -- "iban_beneficiario_effettivo": FATTURA -> fattura > fornitore; SPESA_FISSA -> iban sf > fornitore
    COALESCE(
        f.iban_beneficiario,
        sf.iban,
        s.iban
    )                                AS iban_beneficiario_effettivo,

    -- Flag derivato: e' rateizzata? (OR tra flag fe_fatture e stato cg_uscite)
    CASE
        WHEN f.rateizzata_in_spesa_fissa_id IS NOT NULL THEN 1
        WHEN u.stato = 'RATEIZZATA' THEN 1
        ELSE 0
    END                              AS is_rateizzata,

    -- Stato "normalizzato": quando la fattura e' rateizzata (anche se cg_uscite
    -- e' in DA_PAGARE perche' backfill non l'ha toccata), vogliamo che il frontend
    -- la veda come RATEIZZATA per badge/colore.
    CASE
        WHEN f.rateizzata_in_spesa_fissa_id IS NOT NULL THEN 'RATEIZZATA'
        WHEN u.stato = 'RATEIZZATA' THEN 'RATEIZZATA'
        WHEN f.data_effettiva_pagamento IS NOT NULL AND u.stato NOT IN ('PAGATA','PAGATA_MANUALE','PARZIALE')
             THEN 'PAGATA'  -- fe_fatture ha data effettiva ma cg_uscite non e' ancora allineata
        ELSE u.stato
    END                              AS stato

FROM cg_uscite u
LEFT JOIN fe_fatture         f  ON u.fattura_id         = f.id
LEFT JOIN suppliers          s  ON u.fornitore_piva     = s.partita_iva
LEFT JOIN cg_spese_fisse     sf ON u.spesa_fissa_id     = sf.id
LEFT JOIN cg_pagamenti_batch pb ON u.pagamento_batch_id = pb.id
WHERE 1=1
  -- NASCONDI rateizzate di default (riattivabili con toggle includi_rateizzate)
  AND (
        :includi_rateizzate = 1
     OR (f.rateizzata_in_spesa_fissa_id IS NULL AND u.stato <> 'RATEIZZATA')
  )
  -- filtri dinamici (stato, fornitore, range data) aggiunti lato Python
ORDER BY data_scadenza_effettiva ASC NULLS LAST;

-- ============================================================
-- 3) Note sul filtro WHERE dinamico (lato Python)
-- ============================================================
-- I filtri `da`, `a` (range scadenza) devono ora puntare a
--   data_scadenza_effettiva
-- NON piu' a u.data_scadenza. Questo significa che l'indice
--   idx_cg_uscite_scadenza
-- NON viene usato per il range. Con 2045 righe e' un full scan
-- che in SQLite costa ~1ms, accettabile.
--
-- Il filtro `stato`:
--   - Se stato = 'RATEIZZATA' -> serve (f.rateizzata_in_spesa_fissa_id IS NOT NULL
--                                        OR u.stato = 'RATEIZZATA')
--                                       + forzare :includi_rateizzate = 1
--   - Se stato = 'PAGATA'     -> serve (u.stato IN ('PAGATA','PAGATA_MANUALE')
--                                        OR f.data_effettiva_pagamento IS NOT NULL)
--   - Altrimenti              -> u.stato = :stato come prima
--
-- Il filtro `fornitore` resta su u.fornitore_nome LIKE (fonte cg_uscite).
--
-- ============================================================
-- 4) Benchmark (eseguito 2026-04-10 su DB locale sandbox, 30 run)
-- ============================================================
--   Dimensioni: 2045 cg_uscite, 1525 fe_fatture, 16 cg_spese_fisse,
--   258 cg_piano_rate, 3 suppliers. 43 fatture backfillate.
--
--   Q_OLD (v1.7.1)                         median=10.28ms  p95=14.75ms
--   Q_NEW sort-in-SQL (default)            median=13.58ms  p95=14.40ms  ratio=1.32x
--   Q_NEW sort-in-SQL (inclusive)          median=13.90ms  p95=14.50ms  ratio=1.35x
--   Q_NEW sort-in-python (default)         median=14.37ms  p95=15.12ms  ratio=1.40x
--   Q_NEW sort-in-python (inclusive)       median=14.75ms  p95=15.51ms  ratio=1.43x
--
--   Conclusione: ORDER BY resta nel SQL. Ratio 1.32x — leggermente sopra
--   il target 1.2x ma ampiamente sotto il fallback 1.5x, differenza
--   assoluta ~3ms su 2045 righe (invisibile all'utente, siamo a 14ms vs
--   target assoluto di 200ms).
--
--   NIENTE mig 058 indici aggiuntivi: un indice su espressione
--   COALESCE() non e' possibile perche' spazia due tabelle (u + f).
--   Gli indici attuali (idx_cg_uscite_fattura, idx_fatture_rateizzata
--   parziale, idx_fatture_data_prevista parziale) sono sufficienti.
--
-- ============================================================
-- 5) Verifiche funzionali su DB sandbox (post backfill 057)
-- ============================================================
--   Scenario 1 — default:                  n=2002 rateizzate visibili=0   OK
--   Scenario 2 — includi_rateizzate=1:     n=2045 rateizzate visibili=43  OK
--   Scenario 3 — filtro stato=DA_PAGARE:   n=1008, 0 rateizzate           OK
--   Scenario 4 — range giugno 2025:        n=5, nessuna fuori range       OK
--   Scenario 5 — fornitore LIKE '%metro%': default=36, inclusive=68
--                delta=32 = esattamente le 32 Metro rateizzate            OK
--   Scenario 6 — delta totali DA_PAGARE+SCADUTA Q_OLD vs Q_NEW default:
--                56129.09 euro = somma (totale-importo_pagato) delle
--                43 fatture rateizzate. Prova che la query nasconde
--                esattamente il giusto e niente di piu'.                  OK
--
-- ============================================================
-- 6) Retrocompatibilita' del payload
-- ============================================================
-- Il router Python DOPO la query fa un rename/alias:
--   row["data_scadenza"] = row["data_scadenza_effettiva"]
--   row["stato"]         = row["stato"]   (gia' normalizzato dalla CASE)
-- cosi' il frontend non vede il cambiamento e continua a leggere
-- row.data_scadenza e row.stato come prima.
--
-- I campi nuovi (rateizzata_in_spesa_fissa_id, data_prevista_pagamento,
-- data_effettiva_pagamento, iban_beneficiario_effettivo, modalita_pagamento_effettiva,
-- is_rateizzata, data_scadenza_xml) sono ADDITIVI: il frontend puo'
-- ignorarli finche' non implementa badge e sezione dettaglio.
