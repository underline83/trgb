# Modulo: vini
"""
Migrazione dati dal vecchio modello al nuovo schema anagrafiche
(refactor V.6+V.7+V.8 Fase 5).

Algoritmo:
  1. Estrae produttori distinct da vini_magazzino.PRODUTTORE → popola vini_produttori
  2. Estrae fornitori distinct da DISTRIBUTORE (con RAPPRESENTANTE inline) → vini_fornitori
  3. Clustering (PRODUTTORE_norm, DESCRIZIONE_norm) → 1 riga vini_madre per cluster
     - eredita dati anagrafici dalla bottiglia più recente del cluster
     - linka denominazione via best-effort match sui nomi
  4. UPDATE vini_bottiglie.madre_id per ogni bottiglia
  5. Parser VITIGNI TEXT → 5 slot vitigno con percentuale opzionale
  6. Sync campi anagrafici ridondanti dal madre alle bottiglie

L'algoritmo è IDEMPOTENTE in modalità safe: se le tabelle hanno già righe,
le aggiorna invece di duplicare. Con `force_reset=True` cancella tutto e
ripopola da zero.

Endpoint admin: POST /vini/anagrafiche/migrate-from-legacy?dry_run=true|false
"""

from __future__ import annotations
import re
import sqlite3
from collections import Counter, defaultdict
from typing import Any, Dict, List, Optional, Tuple

from app.models.vini_anagrafiche_db import TABELLE
from app.models.vini_magazzino_db import get_magazzino_connection


# ============================================================
# Helpers di normalizzazione
# ============================================================

_SPACES_RE = re.compile(r"\s+")


def _normalize(text: Optional[str]) -> str:
    """UPPER + TRIM + collassa spazi multipli. Vuoto → ''."""
    if not text:
        return ""
    return _SPACES_RE.sub(" ", str(text).strip().upper())


def _pick_canonical_name(forms_with_counts: Dict[str, int]) -> str:
    """
    Dato un dict {forma_originale: count}, sceglie la forma canonica:
      - frequenza più alta (count desc)
      - preferenza per NON-tutto-uppercase (CAMPERCHI vs Camperchi → Camperchi)
      - tiebreak: lunghezza maggiore (più descrittiva)
      - tiebreak finale: alfabetico
    """
    if not forms_with_counts:
        return ""
    sorted_forms = sorted(
        forms_with_counts.items(),
        key=lambda x: (-x[1], x[0].isupper(), -len(x[0]), x[0]),
    )
    return sorted_forms[0][0].strip()


# ============================================================
# Parser vitigni
# ============================================================

_VITIGNI_SPLIT_RE = re.compile(r"[,;/]|\s+e\s+|\s+E\s+|\s+&\s+", re.IGNORECASE)
_VITIGNO_PCT_RE = re.compile(r"(\d+(?:[.,]\d+)?)\s*%")


def parse_vitigni_text(text: Optional[str]) -> List[Tuple[str, Optional[float]]]:
    """
    Parsa stringa VITIGNI tipo "Nebbiolo 80%, Barbera 20%" → [(Nebbiolo, 80), (Barbera, 20)].
    Ritorna lista di (nome_vitigno_trim, percentuale_o_None).
    Niente match contro anagrafica qui: solo split. Match si fa dopo.
    """
    if not text or not text.strip():
        return []
    out: List[Tuple[str, Optional[float]]] = []
    pieces = _VITIGNI_SPLIT_RE.split(text)
    for p in pieces:
        p = p.strip()
        if not p:
            continue
        # Estrai % se presente
        m = _VITIGNO_PCT_RE.search(p)
        pct: Optional[float] = None
        if m:
            pct_str = m.group(1).replace(",", ".")
            try:
                pct = float(pct_str)
            except ValueError:
                pct = None
            # Rimuovi la parte numerica dal nome
            p = _VITIGNO_PCT_RE.sub("", p).strip()
            # Eventuali parentesi residue
            p = p.strip("().,:;-").strip()
        if p:
            out.append((p, pct))
    return out


# ============================================================
# Match denominazione best-effort
# ============================================================

def _build_denominazioni_index(cur) -> Dict[str, List[int]]:
    """
    Indice denominazioni per match veloce.
    Chiave: (nazione_norm, nome_norm) → lista di denominazione_id
    """
    idx: Dict[str, List[int]] = defaultdict(list)
    rows = cur.execute(
        f"SELECT id, nome, nazione FROM {TABELLE['denominazioni']}"
    ).fetchall()
    for did, nome, nazione in rows:
        key = (_normalize(nazione), _normalize(nome))
        idx[key].append(did)
    return idx


def match_denominazione(
    denominazione_text: Optional[str],
    nazione_text: Optional[str],
    index: Dict[str, List[int]],
) -> Tuple[Optional[int], str]:
    """
    Trova la denominazione_id per la stringa DENOMINAZIONE TEXT + NAZIONE bottiglia.
    Ritorna (id, motivo_o_None). Motivo è 'exact', 'no_match', 'ambiguous'.

    Strategia:
      1. Match esatto su (nazione, nome) → exact
      2. Estrai "tipo" dalla stringa se presente (es. "Chianti Classico DOCG"):
         splitting su ultima parola DOC/DOCG/IGT → match su parte nome.
      3. Se ancora non trovato → no_match.
    """
    if not denominazione_text:
        return None, "no_match"

    deno_norm = _normalize(denominazione_text)
    naz_norm = _normalize(nazione_text)

    # 1. Match diretto
    matches = index.get((naz_norm, deno_norm), [])
    if len(matches) == 1:
        return matches[0], "exact"
    if len(matches) > 1:
        return matches[0], "ambiguous"  # prendo il primo, segnalo nel report

    # 2. Rimuovi suffisso tipo (DOC, DOCG, IGT, AOC, etc.) e riprova
    deno_stripped = re.sub(
        r"\s+(DOCG|DOC|IGT|IGP|DOP|AOC|AOP|VDT|DAC|DO|QbA)\s*$",
        "",
        deno_norm,
        flags=re.IGNORECASE,
    ).strip()
    if deno_stripped != deno_norm:
        matches2 = index.get((naz_norm, deno_stripped), [])
        if len(matches2) == 1:
            return matches2[0], "exact"
        if len(matches2) > 1:
            return matches2[0], "ambiguous"

    return None, "no_match"


# ============================================================
# Pipeline principale
# ============================================================

def migrate_from_legacy(
    dry_run: bool = True,
    force_reset: bool = False,
) -> Dict[str, Any]:
    """
    Esegue la migrazione completa.

    Args:
        dry_run: se True, non scrive nulla, solo report.
        force_reset: se True (e dry_run False), cancella `_v2` prima di ripopolare.
                     SOLO per testing — sicuro perché non tocca le tabelle live.
    """
    report: Dict[str, Any] = {
        "dry_run": dry_run,
        "force_reset": force_reset,
        "step_1_produttori": {},
        "step_2_fornitori": {},
        "step_3_denominazioni": {},
        "step_4_madre": {},
        "step_5_link_bottiglie": {},
        "step_6_vitigni": {},
        "warnings": [],
    }

    conn = get_magazzino_connection()
    cur = conn.cursor()

    # Optional reset (solo se non dry_run)
    if force_reset and not dry_run:
        report["warnings"].append("force_reset=true: tabelle anagrafiche svuotate")
        cur.execute(f"UPDATE {TABELLE['bottiglie']} SET madre_id = NULL")
        # Azzera anche i 5 slot vitigno
        for slot in range(1, 6):
            cur.execute(f"UPDATE {TABELLE['bottiglie']} SET vitigno_{slot}_id = NULL, vitigno_{slot}_pct = NULL")
        cur.execute(f"DELETE FROM {TABELLE['madre']}")
        cur.execute(f"DELETE FROM {TABELLE['produttori']}")
        cur.execute(f"DELETE FROM {TABELLE['fornitori']}")
        conn.commit()

    # ─────────── STEP 1: PRODUTTORI ───────────
    # Estrae produttori dalla legacy bottle table (vini_bottiglie ha già la copia)
    produttori_raw = cur.execute(
        f"""
        SELECT PRODUTTORE, NAZIONE, REGIONE, COUNT(*) AS n
        FROM {TABELLE['bottiglie']}
        WHERE PRODUTTORE IS NOT NULL AND TRIM(PRODUTTORE) != ''
        GROUP BY PRODUTTORE, NAZIONE, REGIONE
        ORDER BY n DESC
        """
    ).fetchall()

    # Aggrega per produttore normalizzato
    produttori_groups: Dict[str, Dict[str, Any]] = {}
    for prod, naz, reg, n in produttori_raw:
        key = _normalize(prod)
        if not key:
            continue
        if key not in produttori_groups:
            produttori_groups[key] = {
                "forms": Counter(),
                "nazioni": Counter(),
                "regioni": Counter(),
                "tot_bottiglie": 0,
            }
        produttori_groups[key]["forms"][prod] += n
        if naz:
            produttori_groups[key]["nazioni"][naz] += n
        if reg:
            produttori_groups[key]["regioni"][reg] += n
        produttori_groups[key]["tot_bottiglie"] += n

    # Mappa produttore_norm → produttore_id (per riferimento successivo)
    produttori_map: Dict[str, int] = {}
    inseriti_p = 0
    aggiornati_p = 0

    # Pre-carica produttori già esistenti per match (idempotenza soft)
    existing_p = cur.execute(
        f"SELECT id, nome FROM {TABELLE['produttori']}"
    ).fetchall()
    existing_p_map = {_normalize(nome): pid for pid, nome in existing_p}

    for key, info in produttori_groups.items():
        nome_canon = _pick_canonical_name(info["forms"])
        nazione = info["nazioni"].most_common(1)[0][0] if info["nazioni"] else "Italia"
        regione = info["regioni"].most_common(1)[0][0] if info["regioni"] else None

        if key in existing_p_map:
            # Già esistente: mantieni id, opzionalmente aggiorna
            produttori_map[key] = existing_p_map[key]
            aggiornati_p += 1
        else:
            # Nuovo
            if dry_run:
                # Simula id incrementale partendo dal max esistente
                next_id = max(existing_p_map.values(), default=0) + len(produttori_map) - aggiornati_p + 1
                produttori_map[key] = next_id
            else:
                cur.execute(
                    f"""INSERT INTO {TABELLE['produttori']} (nome, nazione, regione)
                        VALUES (?, ?, ?)""",
                    (nome_canon, nazione, regione),
                )
                produttori_map[key] = cur.lastrowid
            inseriti_p += 1

    report["step_1_produttori"] = {
        "totale_distinct_in_legacy": len(produttori_groups),
        "inseriti": inseriti_p,
        "aggiornati_esistenti": aggiornati_p,
        "esempi": [
            {
                "nome_canonico": _pick_canonical_name(info["forms"]),
                "varianti": dict(info["forms"]),
                "tot_bottiglie": info["tot_bottiglie"],
            }
            for info in list(produttori_groups.values())[:5]
        ],
        "produttori_multi_variante": [
            {
                "nome_canonico": _pick_canonical_name(info["forms"]),
                "varianti": dict(info["forms"]),
            }
            for info in produttori_groups.values()
            if len(info["forms"]) > 1
        ][:20],
    }

    # ─────────── STEP 2: FORNITORI ───────────
    fornitori_raw = cur.execute(
        f"""
        SELECT DISTRIBUTORE, RAPPRESENTANTE, COUNT(*) AS n
        FROM {TABELLE['bottiglie']}
        WHERE DISTRIBUTORE IS NOT NULL AND TRIM(DISTRIBUTORE) != ''
        GROUP BY DISTRIBUTORE, RAPPRESENTANTE
        ORDER BY n DESC
        """
    ).fetchall()

    fornitori_groups: Dict[str, Dict[str, Any]] = {}
    for distr, rappr, n in fornitori_raw:
        key = _normalize(distr)
        if not key:
            continue
        if key not in fornitori_groups:
            fornitori_groups[key] = {
                "forms": Counter(),
                "rappresentanti": Counter(),
                "tot_bottiglie": 0,
            }
        fornitori_groups[key]["forms"][distr] += n
        if rappr and rappr.strip():
            fornitori_groups[key]["rappresentanti"][rappr.strip()] += n
        fornitori_groups[key]["tot_bottiglie"] += n

    fornitori_map: Dict[str, int] = {}
    inseriti_f = 0
    aggiornati_f = 0

    existing_f = cur.execute(
        f"SELECT id, nome FROM {TABELLE['fornitori']}"
    ).fetchall()
    existing_f_map = {_normalize(nome): fid for fid, nome in existing_f}

    for key, info in fornitori_groups.items():
        nome_canon = _pick_canonical_name(info["forms"])
        rappr_canon = (
            info["rappresentanti"].most_common(1)[0][0]
            if info["rappresentanti"] else None
        )

        if key in existing_f_map:
            fornitori_map[key] = existing_f_map[key]
            aggiornati_f += 1
        else:
            if dry_run:
                next_id = max(existing_f_map.values(), default=0) + len(fornitori_map) - aggiornati_f + 1
                fornitori_map[key] = next_id
            else:
                cur.execute(
                    f"""INSERT INTO {TABELLE['fornitori']} (nome, rappresentante_nome)
                        VALUES (?, ?)""",
                    (nome_canon, rappr_canon),
                )
                fornitori_map[key] = cur.lastrowid
            inseriti_f += 1

    report["step_2_fornitori"] = {
        "totale_distinct_in_legacy": len(fornitori_groups),
        "inseriti": inseriti_f,
        "aggiornati_esistenti": aggiornati_f,
        "esempi": [
            {
                "nome_canonico": _pick_canonical_name(info["forms"]),
                "rappresentante": (
                    info["rappresentanti"].most_common(1)[0][0]
                    if info["rappresentanti"] else None
                ),
                "tot_bottiglie": info["tot_bottiglie"],
            }
            for info in list(fornitori_groups.values())[:5]
        ],
    }

    # ─────────── STEP 3: DENOMINAZIONI INDEX (per match in step 4) ───────────
    deno_index = _build_denominazioni_index(cur)
    report["step_3_denominazioni"] = {
        "totale_disponibili": sum(len(v) for v in deno_index.values()),
        "voci_unique": len(deno_index),
    }

    # ─────────── STEP 4: VINI MADRE — CLUSTERING ───────────
    # Cluster per (PRODUTTORE_norm, DESCRIZIONE_norm)
    bottiglie_rows = cur.execute(
        f"""
        SELECT id, PRODUTTORE, DESCRIZIONE, TIPOLOGIA, NAZIONE, REGIONE,
               DENOMINAZIONE, DISTRIBUTORE, ABBINAMENTI, GRADO_ALCOLICO,
               ANNATA, CREATED_AT
        FROM {TABELLE['bottiglie']}
        WHERE PRODUTTORE IS NOT NULL AND TRIM(PRODUTTORE) != ''
          AND DESCRIZIONE IS NOT NULL AND TRIM(DESCRIZIONE) != ''
        """
    ).fetchall()

    cluster_map: Dict[Tuple[str, str], Dict[str, Any]] = {}
    for row in bottiglie_rows:
        (bid, prod, desc, tipo, naz, reg, deno, distr, abb, gradi, annata, ts) = row
        key = (_normalize(prod), _normalize(desc))
        if key not in cluster_map:
            cluster_map[key] = {
                "produttore_norm": key[0],
                "descrizione_norm": key[1],
                "descrizioni_forms": Counter(),
                "tipologie": Counter(),
                "nazioni": Counter(),
                "regioni": Counter(),
                "denominazioni": Counter(),
                "distributori": Counter(),
                "abbinamenti": Counter(),
                "gradi": [],
                "bottiglie_ids": [],
                "n_annate": 0,
                "annate": set(),
            }
        c = cluster_map[key]
        c["descrizioni_forms"][desc] += 1
        if tipo:
            c["tipologie"][tipo] += 1
        if naz:
            c["nazioni"][naz] += 1
        if reg:
            c["regioni"][reg] += 1
        if deno and deno.strip():
            c["denominazioni"][deno.strip()] += 1
        if distr and distr.strip():
            c["distributori"][distr.strip()] += 1
        if abb and abb.strip():
            c["abbinamenti"][abb.strip()] += 1
        if gradi is not None:
            c["gradi"].append(float(gradi))
        c["bottiglie_ids"].append(bid)
        if annata:
            c["annate"].add(annata)
            c["n_annate"] = len(c["annate"])

    # Carica madre esistenti per idempotenza
    existing_madre = cur.execute(
        f"SELECT id, produttore_id, descrizione FROM {TABELLE['madre']}"
    ).fetchall()
    existing_madre_map: Dict[Tuple[int, str], int] = {
        (prod_id, _normalize(desc)): mid
        for mid, prod_id, desc in existing_madre
    }

    madre_map: Dict[Tuple[str, str], int] = {}
    inseriti_m = 0
    aggiornati_m = 0
    deno_match_counts = Counter()  # exact / no_match / ambiguous
    madre_inseriti_examples = []

    for key, c in cluster_map.items():
        prod_id = produttori_map.get(c["produttore_norm"])
        if not prod_id:
            report["warnings"].append(
                f"Cluster '{c['descrizione_norm']}' senza produttore valido: salto"
            )
            continue

        # Descrizione canonica
        desc_canon = _pick_canonical_name(c["descrizioni_forms"])
        tipologia = c["tipologie"].most_common(1)[0][0] if c["tipologie"] else "ROSSI"
        nazione = c["nazioni"].most_common(1)[0][0] if c["nazioni"] else None
        regione = c["regioni"].most_common(1)[0][0] if c["regioni"] else None
        abbinamenti = c["abbinamenti"].most_common(1)[0][0] if c["abbinamenti"] else None
        grado_tipico = round(sum(c["gradi"]) / len(c["gradi"]), 1) if c["gradi"] else None

        # Match denominazione
        deno_text = c["denominazioni"].most_common(1)[0][0] if c["denominazioni"] else None
        deno_id, deno_reason = match_denominazione(deno_text, nazione, deno_index)
        deno_match_counts[deno_reason] += 1

        # Match fornitore
        distr_text = c["distributori"].most_common(1)[0][0] if c["distributori"] else None
        forn_id = fornitori_map.get(_normalize(distr_text)) if distr_text else None

        # Idempotency: madre già esiste?
        existing_key = (prod_id, _normalize(desc_canon))
        if existing_key in existing_madre_map:
            madre_id = existing_madre_map[existing_key]
            madre_map[key] = madre_id
            aggiornati_m += 1
            continue

        if dry_run:
            simulated_id = max(
                [v for v in existing_madre_map.values()] +
                list(madre_map.values()) + [0]
            ) + 1
            madre_map[key] = simulated_id
        else:
            cur.execute(
                f"""INSERT INTO {TABELLE['madre']}
                    (produttore_id, fornitore_id, denominazione_id, descrizione,
                     tipologia, nazione, regione, grado_alcolico_tipico, abbinamenti)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                (prod_id, forn_id, deno_id, desc_canon, tipologia, nazione,
                 regione, grado_tipico, abbinamenti),
            )
            madre_map[key] = cur.lastrowid
        inseriti_m += 1
        if len(madre_inseriti_examples) < 10:
            madre_inseriti_examples.append({
                "descrizione": desc_canon,
                "produttore_norm": c["produttore_norm"],
                "tipologia": tipologia,
                "nazione": nazione,
                "regione": regione,
                "denominazione_match": deno_reason,
                "n_annate": c["n_annate"],
                "n_bottiglie": len(c["bottiglie_ids"]),
            })

    report["step_4_madre"] = {
        "totale_cluster": len(cluster_map),
        "inseriti": inseriti_m,
        "aggiornati_esistenti": aggiornati_m,
        "denominazione_match": dict(deno_match_counts),
        "esempi_inseriti": madre_inseriti_examples,
    }

    # ─────────── STEP 5: LINK BOTTIGLIE → MADRE ───────────
    n_linkate = 0
    n_orfane = 0
    for key, c in cluster_map.items():
        madre_id = madre_map.get(key)
        if not madre_id:
            n_orfane += len(c["bottiglie_ids"])
            continue
        if not dry_run:
            cur.executemany(
                f"UPDATE {TABELLE['bottiglie']} SET madre_id = ? WHERE id = ?",
                [(madre_id, bid) for bid in c["bottiglie_ids"]],
            )
        n_linkate += len(c["bottiglie_ids"])

    # Bottiglie senza produttore: orfane
    n_no_prod = cur.execute(
        f"SELECT COUNT(*) FROM {TABELLE['bottiglie']} "
        f"WHERE PRODUTTORE IS NULL OR TRIM(PRODUTTORE) = ''"
    ).fetchone()[0]
    n_orfane += n_no_prod

    report["step_5_link_bottiglie"] = {
        "linkate": n_linkate,
        "orfane_no_produttore": n_no_prod,
        "orfane_totali": n_orfane,
    }

    # ─────────── STEP 6: PARSER VITIGNI → 5 SLOT ───────────
    # Carica anagrafica vitigni per match
    vitigni_rows = cur.execute(
        f"SELECT id, nome FROM {TABELLE['vitigni']}"
    ).fetchall()
    vitigni_by_norm = {_normalize(nome): vid for vid, nome in vitigni_rows}

    bottiglie_con_vitigni = cur.execute(
        f"""SELECT id, VITIGNI FROM {TABELLE['bottiglie']}
            WHERE VITIGNI IS NOT NULL AND TRIM(VITIGNI) != ''"""
    ).fetchall()

    n_vitigni_match = 0
    n_vitigni_no_match = 0
    n_overflow = 0
    vitigni_non_riconosciuti = Counter()
    bottiglie_processate = 0
    bottiglie_con_qualche_match = 0

    for bid, vitigni_text in bottiglie_con_vitigni:
        bottiglie_processate += 1
        parsed = parse_vitigni_text(vitigni_text)
        slot_assignments: List[Tuple[int, Optional[float]]] = []
        for nome, pct in parsed:
            nome_norm = _normalize(nome)
            vit_id = vitigni_by_norm.get(nome_norm)
            if vit_id:
                slot_assignments.append((vit_id, pct))
                n_vitigni_match += 1
            else:
                n_vitigni_no_match += 1
                vitigni_non_riconosciuti[nome] += 1

        if slot_assignments:
            bottiglie_con_qualche_match += 1

        # Overflow > 5
        if len(slot_assignments) > 5:
            n_overflow += (len(slot_assignments) - 5)
            slot_assignments = slot_assignments[:5]

        if not dry_run and slot_assignments:
            updates: List[str] = []
            params: List[Any] = []
            for slot_idx, (vid, pct) in enumerate(slot_assignments, start=1):
                updates.append(f"vitigno_{slot_idx}_id = ?")
                updates.append(f"vitigno_{slot_idx}_pct = ?")
                params.extend([vid, pct])
            params.append(bid)
            cur.execute(
                f"UPDATE {TABELLE['bottiglie']} SET {', '.join(updates)} WHERE id = ?",
                params,
            )

    report["step_6_vitigni"] = {
        "bottiglie_con_vitigni_text": bottiglie_processate,
        "bottiglie_con_qualche_match": bottiglie_con_qualche_match,
        "totale_vitigni_match": n_vitigni_match,
        "totale_vitigni_no_match": n_vitigni_no_match,
        "overflow_oltre_5_slot": n_overflow,
        "top_non_riconosciuti": dict(vitigni_non_riconosciuti.most_common(20)),
    }

    if not dry_run:
        conn.commit()
    conn.close()

    return report
