"""
Migrazione 057: backfill fe_fatture.rateizzata_in_spesa_fissa_id (DRY-RUN)

Parte della release CG v2.0a2.

Analizza le rateizzazioni esistenti in cg_spese_fisse (tipo='RATEIZZAZIONE')
e cerca per ciascuna le fatture originali in fe_fatture che corrispondono
per fornitore + importo + numero. Genera un CSV in
app/data/backfill_057_dryrun.csv che Marco deve rivedere manualmente
prima di applicare gli UPDATE.

QUESTA MIGRAZIONE NON ESEGUE ALCUN UPDATE SUL DB.

L'apply effettivo va fatto lanciando lo script
`scripts/apply_backfill_057.py` dopo aver rivisto e approvato il CSV.

STRATEGIA DI MATCHING
=====================

1. Parse del titolo "Rateizzazione <NOME_FORNITORE> — <REFERENZA>":
   - NOME_FORNITORE: ragione sociale come appare nel wizard
   - REFERENZA: numero fattura singola (es "463/V", "3978"), oppure
     pattern "N fatture" per multi-fattura

2. Ricerca candidate in fe_fatture con fornitore_nome LIKE matching
   fuzzy sulle prime 2 parole del nome maiuscolo, escluse le fatture
   gia' flaggate (rateizzata_in_spesa_fissa_id IS NOT NULL) e quelle
   successive alla data_inizio del piano.

3. Categorie di match generate nel CSV:

   - NUM+IMPORTO  (score 1.0): numero fattura combacia con la
                                referenza E importo combacia con
                                importo_originale ±0.02
   - IMPORTO      (score 0.95): 1 sola candidata con importo esatto
   - MULTI_COPPIA (score 0.85): titolo contiene "N fatture" e una coppia
                                di candidate somma esattamente a
                                importo_originale
   - NUM_ONLY     (score 0.70): numero fattura combacia ma importo no
   - IMPORTO_AMBIG(score 0.50): piu' candidate con importo esatto
   - MULTI_LISTA  (score 0.20): multi-fattura non risolvibile → elenco
                                di tutte le candidate, Marco seleziona
   - AMBIGUO      (score 0.00): singola fattura con candidate multiple
                                ma nessuna matcha → lista candidate
   - PARSE_FALLITO(score 0.00): titolo non ha il pattern standard,
                                riga vuota da compilare manualmente

WORKFLOW UTENTE
===============

1. Il backend esegue la mig 057 al restart → genera il CSV
2. Marco scarica il CSV:
      scp trgb:/home/marco/trgb/trgb/app/data/backfill_057_dryrun.csv .
3. Marco apre il CSV in Excel, ordina per sf_id e match_score
4. Per ogni riga, marca 'Y' in colonna 'approvato' se il match e' corretto
5. Marco salva come backfill_057_approved.csv (CSV UTF-8)
6. Marco uploada:
      scp backfill_057_approved.csv trgb:/home/marco/trgb/trgb/app/data/
7. Marco lancia lo script apply sul VPS:
      ssh trgb "cd /home/marco/trgb/trgb && ../venv-trgb/bin/python scripts/apply_backfill_057.py"
8. Lo script fa backup automatico e applica gli UPDATE in transazione

NOTA: se il CSV e' gia' presente sul disco (es. gia' generato in una
esecuzione precedente di questa migrazione) viene sovrascritto. Se la
migrazione e' gia' in schema_migrations non viene rieseguita: per
rigenerare il CSV si puo' cancellare il file e riavviare il backend
dopo aver fatto ALTER sulla tabella schema_migrations (operazione manuale,
sconsigliata: meglio creare una mig 057bis).
"""

import csv
import re
from pathlib import Path


def parse_titolo(titolo):
    """Estrae (nome_fornitore, referenza) da 'Rateizzazione <NOME> — <REF>'.

    Gestisce anche il caso del titolo troncato con "—" finale (referenza
    vuota), che si verifica quando il wizard UI tronca la ref per
    questioni di lunghezza.
    """
    if not titolo:
        return None, None
    # Pattern completo: "Rateizzazione X — Y"
    m = re.match(r'^Rateizzazione\s+(.+?)\s+[—-]\s+(.+)$', titolo)
    if m:
        return m.group(1).strip(), m.group(2).strip()
    # Pattern troncato: "Rateizzazione X —" (referenza mancante)
    m2 = re.match(r'^Rateizzazione\s+(.+?)\s+[—-]\s*$', titolo)
    if m2:
        return m2.group(1).strip(), ''
    return None, None


def find_candidates(cur, nome_fornitore, data_limite):
    """Cerca fatture candidate per fornitore, escludendo quelle posteriori
    a data_limite (data_inizio del piano di rateizzazione) e quelle gia'
    flaggate come rateizzate.

    Il matching usa le prime 2 parole del nome maiuscolo come chiave di
    ricerca fuzzy (sufficiente per evitare falsi positivi tra fornitori
    con nomi simili ma distinti, es "RISTO TEAM SRL" vs "RISTOTEAM SRL").
    """
    parts = nome_fornitore.split()
    if not parts:
        return []
    key = ' '.join(parts[:2]).upper()
    # Escape singoli apici per il LIKE
    key_safe = key.replace("'", "''")
    sql = f"""
        SELECT id, numero_fattura, data_fattura, totale_fattura, fornitore_nome
        FROM fe_fatture
        WHERE UPPER(fornitore_nome) LIKE '%{key_safe}%'
          AND (rateizzata_in_spesa_fissa_id IS NULL)
          AND (? IS NULL OR data_fattura <= ?)
        ORDER BY data_fattura DESC
    """
    return cur.execute(sql, (data_limite, data_limite)).fetchall()


def match_single(candidates, target_importo, ref):
    """Trova il miglior match per una rateizzazione di fattura singola.

    Priorita':
    1) numero fattura esatto + importo esatto → score 1.0
    2) importo esatto con una sola candidata → score 0.95
    3) numero fattura esatto ma importo no → score 0.70
    4) importo esatto ma ambiguo (>1 candidata) → score 0.50
    5) nessun match → score 0.0
    """
    # Match su numero fattura
    if ref:
        ref_clean = ref.strip()
        for c in candidates:
            num = c[1] or ''
            if ref_clean and ref_clean in num:
                if target_importo and abs((c[3] or 0) - target_importo) < 0.02:
                    return c, 1.0, 'NUM+IMPORTO'
                return c, 0.70, 'NUM_ONLY'
    # Match su importo esatto
    if target_importo:
        exact = [c for c in candidates if abs((c[3] or 0) - target_importo) < 0.02]
        if len(exact) == 1:
            return exact[0], 0.95, 'IMPORTO'
        if len(exact) > 1:
            return None, 0.50, 'IMPORTO_AMBIG'
    return None, 0.0, 'NO_MATCH'


def match_multi_pair(candidates, target_importo):
    """Cerca una coppia di candidate che sommano a target_importo ±0.02.

    Usa loop annidato O(N^2), accettabile per N≤60 candidate (caso Metro).
    Per multi-fatture con piu' di 2 righe, lasciamo al CSV e a Marco.
    """
    if not target_importo:
        return []
    n = len(candidates)
    for i in range(n):
        for j in range(i + 1, n):
            s = (candidates[i][3] or 0) + (candidates[j][3] or 0)
            if abs(s - target_importo) < 0.02:
                return [candidates[i], candidates[j]]
    return []


def upgrade(conn):
    cur = conn.cursor()

    # Path CSV di output: app/data/backfill_057_dryrun.csv
    # Calcolato in modo robusto rispetto a dove viene lanciato il backend
    base_dir = Path(__file__).resolve().parent.parent / 'data'
    base_dir.mkdir(parents=True, exist_ok=True)
    csv_path = base_dir / 'backfill_057_dryrun.csv'

    rateiz = cur.execute("""
        SELECT id, titolo, importo_originale, importo, data_inizio, created_at
        FROM cg_spese_fisse
        WHERE tipo = 'RATEIZZAZIONE' AND attiva = 1
        ORDER BY id
    """).fetchall()

    print(f"  Analizzo {len(rateiz)} rateizzazioni...")

    rows_out = []
    stats = {
        'match_sicuri': 0,      # score >= 0.85
        'match_coppia': 0,      # MULTI_COPPIA
        'ambigui': 0,           # score 0.20-0.70, Marco sceglie
        'manuali': 0,           # PARSE_FALLITO o MULTI_LISTA
    }

    for rt in rateiz:
        sf_id, titolo, imp_orig, imp_rata, data_inizio, created_at = rt

        nome, ref = parse_titolo(titolo)

        # Caso parse fallito: riga vuota, Marco compila a mano
        if not nome:
            rows_out.append({
                'sf_id': sf_id,
                'sf_titolo': titolo or '',
                'sf_importo_originale': imp_orig,
                'sf_data_inizio': data_inizio or '',
                'fattura_id': '',
                'fattura_numero': '',
                'fattura_data': '',
                'fattura_totale': '',
                'fornitore_nome': '',
                'match_type': 'PARSE_FALLITO',
                'match_score': 0.0,
                'approvato': '',
            })
            stats['manuali'] += 1
            continue

        cands = find_candidates(cur, nome, data_inizio)

        # Caso multi-fattura indicato nel titolo
        is_multi = bool(re.search(r'\d+\s*fattur', ref or '', re.I))

        if is_multi:
            # Tenta greedy su coppie
            pair = match_multi_pair(cands, imp_orig)
            if pair:
                for c in pair:
                    rows_out.append({
                        'sf_id': sf_id,
                        'sf_titolo': titolo,
                        'sf_importo_originale': imp_orig,
                        'sf_data_inizio': data_inizio or '',
                        'fattura_id': c[0],
                        'fattura_numero': c[1] or '',
                        'fattura_data': c[2] or '',
                        'fattura_totale': c[3],
                        'fornitore_nome': c[4] or '',
                        'match_type': 'MULTI_COPPIA',
                        'match_score': 0.85,
                        'approvato': '',
                    })
                stats['match_coppia'] += 1
            else:
                # Elenca tutte le candidate (limite 60 per non esplodere)
                for c in cands[:60]:
                    rows_out.append({
                        'sf_id': sf_id,
                        'sf_titolo': titolo,
                        'sf_importo_originale': imp_orig,
                        'sf_data_inizio': data_inizio or '',
                        'fattura_id': c[0],
                        'fattura_numero': c[1] or '',
                        'fattura_data': c[2] or '',
                        'fattura_totale': c[3],
                        'fornitore_nome': c[4] or '',
                        'match_type': 'MULTI_LISTA',
                        'match_score': 0.20,
                        'approvato': '',
                    })
                stats['manuali'] += 1
            continue

        # Caso singola fattura
        match, score, mtype = match_single(cands, imp_orig, ref)
        if match and score >= 0.70:
            rows_out.append({
                'sf_id': sf_id,
                'sf_titolo': titolo,
                'sf_importo_originale': imp_orig,
                'sf_data_inizio': data_inizio or '',
                'fattura_id': match[0],
                'fattura_numero': match[1] or '',
                'fattura_data': match[2] or '',
                'fattura_totale': match[3],
                'fornitore_nome': match[4] or '',
                'match_type': mtype,
                'match_score': score,
                'approvato': '',
            })
            if score >= 0.85:
                stats['match_sicuri'] += 1
            else:
                stats['ambigui'] += 1
        else:
            # Ambiguo o nessun match: elenca prime 20 candidate
            if not cands:
                # Nessuna candidata: riga vuota con nota
                rows_out.append({
                    'sf_id': sf_id,
                    'sf_titolo': titolo,
                    'sf_importo_originale': imp_orig,
                    'sf_data_inizio': data_inizio or '',
                    'fattura_id': '',
                    'fattura_numero': '',
                    'fattura_data': '',
                    'fattura_totale': '',
                    'fornitore_nome': f'NESSUNA FATTURA TROVATA per "{nome}"',
                    'match_type': 'NO_CANDIDATE',
                    'match_score': 0.0,
                    'approvato': '',
                })
                stats['manuali'] += 1
            else:
                for c in cands[:20]:
                    rows_out.append({
                        'sf_id': sf_id,
                        'sf_titolo': titolo,
                        'sf_importo_originale': imp_orig,
                        'sf_data_inizio': data_inizio or '',
                        'fattura_id': c[0],
                        'fattura_numero': c[1] or '',
                        'fattura_data': c[2] or '',
                        'fattura_totale': c[3],
                        'fornitore_nome': c[4] or '',
                        'match_type': mtype if mtype != 'NO_MATCH' else 'AMBIGUO',
                        'match_score': score,
                        'approvato': '',
                    })
                stats['ambigui'] += 1

    # Scrivi CSV UTF-8 con BOM per compatibilita' Excel
    cols = [
        'sf_id', 'sf_titolo', 'sf_importo_originale', 'sf_data_inizio',
        'fattura_id', 'fattura_numero', 'fattura_data', 'fattura_totale',
        'fornitore_nome', 'match_type', 'match_score', 'approvato',
    ]

    with open(csv_path, 'w', newline='', encoding='utf-8-sig') as f:
        w = csv.DictWriter(f, fieldnames=cols)
        w.writeheader()
        w.writerows(rows_out)

    print(f"  + CSV generato: {csv_path}")
    print(f"  - match_sicuri  (score >=0.85): {stats['match_sicuri']}")
    print(f"  - match_coppia  (multi con coppia): {stats['match_coppia']}")
    print(f"  - ambigui       (score 0.50-0.70): {stats['ambigui']}")
    print(f"  - manuali       (parse/no_cand/multi_lista): {stats['manuali']}")
    print(f"  - righe CSV totali: {len(rows_out)}")
    print("  mig 057 dry-run completata (nessun UPDATE eseguito)")
