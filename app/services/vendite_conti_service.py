"""
Vendite dai conti di cassa (iPratico Cloud) — servizio platform in sola lettura.

I conti chiusi stanno nel DB del modulo cassa (`cassa_conti.sqlite3`, K.15).
Questo servizio è il ponte per chi li vuole leggere senza toccare le tabelle
della cassa: la Cucina («Piatti che vanno») e le Statistiche (riepiloghi
mensili al posto dell'import .xls, da novembre 2026).

Regole sulle righe (verificate sui dati di settembre 2026 contro l'export .xls):
- `no_name` NON è un piatto: è la riga col totale del conto già scontato, sommarla
  conterebbe il conto due volte;
- `servizio = 1` sono coperto e «servizio, pane e stuzzico»;
- categoria «Servizio» (pane, grissini, stuzzico) non è un piatto da classifica;
- le portate della degustazione sono righe a 0 €: per la cucina contano (si cucinano),
  per gli incassi no;
- le righe senza categoria (vino a prezzo libero, menu, torte) nell'export iPratico
  stanno sotto «BATTUTA SINGOLA».
"""
from __future__ import annotations

from datetime import date, timedelta
from typing import Any, Dict, List, Optional

from app.models.cassa_conti_db import get_cassa_conti_conn

# Tipi di piatto per la cucina, nell'ordine del menu (categorie della cassa iPratico).
TIPI_CIBO = [
    ("Degustazioni", "Degustazione"),
    ("Pranzo", "Pranzo"),
    ("Antipasti", "Antipasti"),
    ("Primi", "Primi"),
    ("Secondi", "Secondi"),
    ("Contorni", "Contorni"),
    ("Dolci", "Dolci"),
    ("Speciali", "Fuori carta"),
]
CATEGORIE_NON_PIATTO = ("Servizio",)
NOME_SENZA_PIATTO = "no_name"
CATEGORIA_SENZA = "BATTUTA SINGOLA"  # come la chiama l'export .xls di iPratico


def _d(x) -> date:
    return x if isinstance(x, date) else date.fromisoformat(str(x)[:10])


def _filtro_turno(turno: Optional[str]) -> str:
    return " AND k.turno = ?" if turno in ("pranzo", "cena") else ""


def _porzioni(conn, dal: date, al: date, turno: Optional[str]) -> Dict[tuple, Dict[str, Any]]:
    """Piatti di cucina nel periodo: (categoria, nome) → porzioni, conti, servizi."""
    args: List[Any] = [dal.isoformat(), al.isoformat()]
    if turno in ("pranzo", "cena"):
        args.append(turno)
    segnaposti = ", ".join("?" for _ in CATEGORIE_NON_PIATTO)
    rows = conn.execute(f"""
        SELECT r.categoria, TRIM(r.nome) AS nome,
               SUM(r.quantita) AS porzioni,
               COUNT(DISTINCT r.conto_id) AS conti,
               COUNT(DISTINCT k.data_rif || k.turno) AS servizi
        FROM cassa_conti_righe r
        JOIN cassa_conti k ON k.id = r.conto_id
        WHERE k.data_rif BETWEEN ? AND ? {_filtro_turno(turno)}
          AND r.famiglia = 'food' AND r.servizio = 0
          AND COALESCE(r.categoria, '') NOT IN ({segnaposti})
          AND r.nome IS NOT NULL AND LOWER(TRIM(r.nome)) <> ?
          AND r.quantita > 0
        GROUP BY r.categoria, TRIM(r.nome)
    """, args + list(CATEGORIE_NON_PIATTO) + [NOME_SENZA_PIATTO]).fetchall()
    return {(r["categoria"], r["nome"]): dict(r) for r in rows}


def _servizio(conn, dal: date, al: date, turno: Optional[str]) -> Dict[str, Any]:
    args: List[Any] = [dal.isoformat(), al.isoformat()]
    if turno in ("pranzo", "cena"):
        args.append(turno)
    r = conn.execute(f"""
        SELECT COUNT(*) AS conti, COALESCE(SUM(coperti), 0) AS coperti,
               COUNT(DISTINCT data_rif || COALESCE(turno, '')) AS servizi
        FROM cassa_conti k
        WHERE data_rif BETWEEN ? AND ? {_filtro_turno(turno)}
    """, args).fetchone()
    return dict(r)


def piatti_venduti(dal, al, turno: Optional[str] = None) -> Dict[str, Any]:
    """
    Classifica dei piatti per la cucina: porzioni per tipo nel periodo, con il
    confronto sul periodo precedente della stessa lunghezza (es. 7 giorni contro
    i 7 prima). Solo quantità: niente euro, è una pagina per oste e cuoco.
    """
    dal, al = _d(dal), _d(al)
    if al < dal:
        dal, al = al, dal
    giorni = (al - dal).days + 1
    p_al = dal - timedelta(days=1)
    p_dal = p_al - timedelta(days=giorni - 1)

    conn = get_cassa_conti_conn()
    try:
        ora = _porzioni(conn, dal, al, turno)
        prima = _porzioni(conn, p_dal, p_al, turno)
        serv = _servizio(conn, dal, al, turno)
        serv_prima = _servizio(conn, p_dal, p_al, turno)
        ultimo = conn.execute("SELECT MAX(data_rif) FROM cassa_conti").fetchone()[0]
    finally:
        conn.close()

    # Variazione «giusta»: a parità di servizi (se il periodo prima ha avuto più
    # aperture, il confronto si fa sulle porzioni per servizio).
    s_ora = serv["servizi"] or 0
    s_prima = serv_prima["servizi"] or 0

    def variazione(n_ora: float, n_prima: float) -> Optional[float]:
        if not s_ora or not s_prima or not n_prima:
            return None
        return round(((n_ora / s_ora) / (n_prima / s_prima) - 1) * 100)

    etichette = dict(TIPI_CIBO)
    gruppi: Dict[str, Dict[str, Any]] = {}
    piatti_tutti: List[Dict[str, Any]] = []
    for (cat, nome), v in ora.items():
        k = cat if cat in etichette else "altro"
        n_prima = (prima.get((cat, nome)) or {}).get("porzioni") or 0
        p = {
            "nome": nome,
            "categoria": cat,
            "tipo": k,
            "porzioni": round(v["porzioni"], 1),
            "porzioni_prima": round(n_prima, 1),
            "per_servizio": round(v["porzioni"] / s_ora, 1) if s_ora else None,
            "servizi": v["servizi"],
            "variazione": variazione(v["porzioni"], n_prima),
            "nuovo": n_prima == 0,
        }
        g = gruppi.setdefault(k, {"k": k, "label": etichette.get(k, "Altro"), "porzioni": 0, "piatti": []})
        g["porzioni"] += v["porzioni"]
        g["piatti"].append(p)
        piatti_tutti.append(p)

    ordine = [k for k, _ in TIPI_CIBO] + ["altro"]
    tipi = []
    for k in ordine:
        g = gruppi.get(k)
        if not g:
            continue
        g["piatti"].sort(key=lambda x: (-x["porzioni"], x["nome"]))
        tot = g["porzioni"] or 1
        for p in g["piatti"]:
            p["quota"] = round(p["porzioni"] / tot * 100)
        g["porzioni"] = round(g["porzioni"], 1)
        tipi.append(g)

    # Spariti: c'erano nel periodo prima (almeno 3 porzioni), ora zero
    spariti = sorted(
        [{"nome": nome, "categoria": cat, "porzioni_prima": round(v["porzioni"], 1)}
         for (cat, nome), v in prima.items()
         if (cat, nome) not in ora and v["porzioni"] >= 3 and cat not in CATEGORIE_NON_PIATTO],
        key=lambda x: -x["porzioni_prima"])[:12]

    # Movimenti: solo piatti con un numero che conta (almeno 5 porzioni in uno dei due periodi)
    mossi = [p for p in piatti_tutti if p["variazione"] is not None and max(p["porzioni"], p["porzioni_prima"]) >= 5]
    in_crescita = sorted([p for p in mossi if p["variazione"] >= 20], key=lambda x: -x["variazione"])[:8]
    in_calo = sorted([p for p in mossi if p["variazione"] <= -20], key=lambda x: x["variazione"])[:8]

    porzioni = round(sum(p["porzioni"] for p in piatti_tutti), 1)
    return {
        "dal": dal.isoformat(), "al": al.isoformat(), "turno": turno or "tutti",
        "prima_dal": p_dal.isoformat(), "prima_al": p_al.isoformat(),
        "dati_fino_al": ultimo,
        "servizi": s_ora, "servizi_prima": s_prima,
        "coperti": serv["coperti"], "conti": serv["conti"],
        "porzioni": porzioni,
        "porzioni_per_coperto": round(porzioni / serv["coperti"], 2) if serv["coperti"] else None,
        "tipi": tipi,
        "in_crescita": in_crescita,
        "in_calo": in_calo,
        "spariti": spariti,
    }


def piatto_per_giorno(nome: str, dal, al, turno: Optional[str] = None) -> List[Dict[str, Any]]:
    """Porzioni di un piatto giorno per giorno (per il dettaglio nella pagina Cucina)."""
    dal, al = _d(dal), _d(al)
    args: List[Any] = [nome.strip(), dal.isoformat(), al.isoformat()]
    if turno in ("pranzo", "cena"):
        args.append(turno)
    conn = get_cassa_conti_conn()
    try:
        rows = conn.execute(f"""
            SELECT k.data_rif AS giorno, k.turno, SUM(r.quantita) AS porzioni
            FROM cassa_conti_righe r JOIN cassa_conti k ON k.id = r.conto_id
            WHERE TRIM(r.nome) = ? AND k.data_rif BETWEEN ? AND ? {_filtro_turno(turno)}
              AND r.servizio = 0
            GROUP BY k.data_rif, k.turno ORDER BY k.data_rif, k.turno
        """, args).fetchall()
        return [dict(r) for r in rows]
    finally:
        conn.close()


def riepilogo_mese(anno: int, mese: int) -> Dict[str, Any]:
    """
    Vendite di un mese come l'export .xls di iPratico (categorie e prodotti con
    quantità e totale), per le Statistiche. Il totale delle righe è riportato al
    totale vero del conto (sconti e arrotondamenti spalmati sulle righe in
    proporzione), così torna con l'incassato. Qui contano solo le righe pagate.
    """
    dal = date(anno, mese, 1)
    al = (date(anno + (mese == 12), mese % 12 + 1, 1) - timedelta(days=1))
    conn = get_cassa_conti_conn()
    try:
        conti = {r["id"]: r["totale"] or 0 for r in conn.execute(
            "SELECT id, totale FROM cassa_conti WHERE data_rif BETWEEN ? AND ?",
            (dal.isoformat(), al.isoformat()))}
        if not conti:
            return {"anno": anno, "mese": mese, "conti": 0, "categorie": [], "prodotti": [], "totale": 0}
        righe = conn.execute(f"""
            SELECT r.conto_id, r.categoria, TRIM(r.nome) AS nome, r.quantita, r.totale
            FROM cassa_conti_righe r JOIN cassa_conti k ON k.id = r.conto_id
            WHERE k.data_rif BETWEEN ? AND ?
              AND r.nome IS NOT NULL AND LOWER(TRIM(r.nome)) <> ?
        """, (dal.isoformat(), al.isoformat(), NOME_SENZA_PIATTO)).fetchall()
        ultimo = conn.execute(
            "SELECT MAX(data_rif) FROM cassa_conti WHERE data_rif BETWEEN ? AND ?",
            (dal.isoformat(), al.isoformat())).fetchone()[0]
    finally:
        conn.close()

    somma_righe: Dict[int, float] = {}
    for r in righe:
        somma_righe[r["conto_id"]] = somma_righe.get(r["conto_id"], 0) + (r["totale"] or 0)

    prodotti: Dict[tuple, Dict[str, Any]] = {}
    for r in righe:
        lordo = r["totale"] or 0
        s = somma_righe.get(r["conto_id"]) or 0
        netto = lordo * (conti[r["conto_id"]] / s) if s else 0
        cat = r["categoria"] or CATEGORIA_SENZA
        v = prodotti.setdefault((cat, r["nome"]), {"categoria": cat, "prodotto": r["nome"], "quantita": 0.0, "totale": 0.0})
        v["quantita"] += r["quantita"] or 0
        v["totale"] += netto

    categorie: Dict[str, Dict[str, Any]] = {}
    for p in prodotti.values():
        c = categorie.setdefault(p["categoria"], {"categoria": p["categoria"], "quantita": 0.0, "totale": 0.0})
        c["quantita"] += p["quantita"]
        c["totale"] += p["totale"]

    return {
        "anno": anno, "mese": mese, "conti": len(conti), "dati_fino_al": ultimo,
        "totale": round(sum(conti.values()), 2),
        "categorie": sorted(categorie.values(), key=lambda x: -x["totale"]),
        "prodotti": sorted(prodotti.values(), key=lambda x: -x["totale"]),
    }


# ============================================================
# STATISTICHE › SERVIZIO (IP.1 parte 2, 2026-11-02)
# ============================================================
GIORNI_SETTIMANA = ["domenica", "lunedì", "martedì", "mercoledì", "giovedì", "venerdì", "sabato"]
FASCE_TAVOLO = [(1, 1, "1"), (2, 2, "2"), (3, 4, "3-4"), (5, 7, "5-7"), (8, 999, "8+")]


def _numeri(conn, dal: date, al: date) -> Dict[str, Any]:
    """Totali del periodo. La spesa a coperto usa solo i conti con coperti (eventi e
    fatture senza coperti contano nell'incasso ma non falsano il «a coperto»)."""
    r = conn.execute("""
        SELECT COUNT(*) AS conti,
               COALESCE(SUM(totale), 0) AS incasso,
               COALESCE(SUM(coperti), 0) AS coperti,
               COALESCE(SUM(CASE WHEN coperti > 0 THEN totale END), 0) AS incasso_con_coperti,
               SUM(CASE WHEN COALESCE(coperti, 0) = 0 THEN 1 ELSE 0 END) AS senza_coperti,
               COALESCE(SUM(CASE WHEN COALESCE(coperti, 0) = 0 THEN totale END), 0) AS incasso_senza_coperti,
               AVG(CASE WHEN durata_min BETWEEN 5 AND 480 THEN durata_min END) AS durata,
               COUNT(DISTINCT data_rif || COALESCE(turno, '')) AS servizi,
               COUNT(DISTINCT data_rif) AS giorni
        FROM cassa_conti WHERE data_rif BETWEEN ? AND ?
    """, (dal.isoformat(), al.isoformat())).fetchone()
    d = dict(r)
    d["incasso"] = round(d["incasso"], 2)
    d["a_coperto"] = round(d["incasso_con_coperti"] / d["coperti"], 2) if d["coperti"] else None
    d["coperti_a_servizio"] = round(d["coperti"] / d["servizi"], 1) if d["servizi"] else None
    d["durata"] = round(d["durata"]) if d["durata"] else None
    d["incasso_senza_coperti"] = round(d["incasso_senza_coperti"], 2)
    del d["incasso_con_coperti"]
    return d


def servizio_riepilogo(dal, al) -> Dict[str, Any]:
    """
    Come lavora la sala nel periodo: giorni e turni, orari di arrivo, sale,
    dimensione dei tavoli, durata, mese per mese; numeri a confronto col periodo
    prima della stessa lunghezza.
    """
    dal, al = _d(dal), _d(al)
    if al < dal:
        dal, al = al, dal
    giorni = (al - dal).days + 1
    p_al = dal - timedelta(days=1)
    p_dal = p_al - timedelta(days=giorni - 1)
    a, b = dal.isoformat(), al.isoformat()

    conn = get_cassa_conti_conn()
    try:
        ora = _numeri(conn, dal, al)
        prima = _numeri(conn, p_dal, p_al)

        # Giorno della settimana × turno: medie per servizio
        settimana = []
        for r in conn.execute("""
            SELECT CAST(strftime('%w', data_rif) AS INTEGER) AS dow, turno,
                   COUNT(DISTINCT data_rif) AS servizi,
                   COALESCE(SUM(coperti), 0) AS coperti,
                   COALESCE(SUM(totale), 0) AS incasso,
                   COALESCE(SUM(CASE WHEN coperti > 0 THEN totale END), 0) AS incasso_cop
            FROM cassa_conti
            WHERE data_rif BETWEEN ? AND ? AND turno IN ('pranzo', 'cena')
            GROUP BY dow, turno
        """, (a, b)):
            n = r["servizi"] or 1
            settimana.append({
                "dow": r["dow"], "giorno": GIORNI_SETTIMANA[r["dow"]], "turno": r["turno"],
                "servizi": r["servizi"],
                "coperti_medi": round(r["coperti"] / n, 1),
                "incasso_medio": round(r["incasso"] / n),
                "a_coperto": round(r["incasso_cop"] / r["coperti"], 1) if r["coperti"] else None,
            })

        # Arrivi: apertura del conto per mezz'ora
        arrivi = []
        for r in conn.execute("""
            SELECT turno,
                   substr(aperto_at, 12, 2) || ':' || CASE WHEN CAST(substr(aperto_at, 15, 2) AS INTEGER) < 30 THEN '00' ELSE '30' END AS ora,
                   COUNT(*) AS conti, COALESCE(SUM(coperti), 0) AS coperti
            FROM cassa_conti
            WHERE data_rif BETWEEN ? AND ? AND turno IN ('pranzo', 'cena') AND aperto_at IS NOT NULL
            GROUP BY turno, ora ORDER BY turno, ora
        """, (a, b)):
            arrivi.append(dict(r))

        sale = [{**dict(r), "a_coperto": round(r["incasso_cop"] / r["coperti"], 1) if r["coperti"] else None}
                for r in conn.execute("""
            SELECT COALESCE(sala, '—') AS sala, COUNT(*) AS conti, COALESCE(SUM(coperti), 0) AS coperti,
                   ROUND(COALESCE(SUM(totale), 0)) AS incasso,
                   COALESCE(SUM(CASE WHEN coperti > 0 THEN totale END), 0) AS incasso_cop
            FROM cassa_conti WHERE data_rif BETWEEN ? AND ? AND COALESCE(coperti, 0) > 0
            GROUP BY 1 ORDER BY coperti DESC
        """, (a, b))]
        for s in sale:
            s.pop("incasso_cop", None)

        tavoli = []
        for lo, hi, label in FASCE_TAVOLO:
            r = conn.execute("""
                SELECT COUNT(*) AS conti, COALESCE(SUM(coperti), 0) AS coperti, COALESCE(SUM(totale), 0) AS incasso,
                       AVG(CASE WHEN durata_min BETWEEN 5 AND 480 THEN durata_min END) AS durata
                FROM cassa_conti WHERE data_rif BETWEEN ? AND ? AND coperti BETWEEN ? AND ?
            """, (a, b, lo, hi)).fetchone()
            if r["conti"]:
                tavoli.append({"persone": label, "conti": r["conti"], "coperti": r["coperti"],
                               "a_coperto": round(r["incasso"] / r["coperti"], 1) if r["coperti"] else None,
                               "durata": round(r["durata"]) if r["durata"] else None})

        mesi = [{**dict(r), "a_coperto": round(r["incasso_cop"] / r["coperti"], 1) if r["coperti"] else None}
                for r in conn.execute("""
            SELECT substr(data_rif, 1, 7) AS mese, COUNT(*) AS conti, COALESCE(SUM(coperti), 0) AS coperti,
                   ROUND(COALESCE(SUM(totale), 0)) AS incasso,
                   COALESCE(SUM(CASE WHEN coperti > 0 THEN totale END), 0) AS incasso_cop
            FROM cassa_conti WHERE data_rif BETWEEN ? AND ? GROUP BY 1 ORDER BY 1
        """, (a, b))]
        for m in mesi:
            m.pop("incasso_cop", None)

        durata_turno = {r["turno"]: round(r["d"]) for r in conn.execute("""
            SELECT turno, AVG(durata_min) AS d FROM cassa_conti
            WHERE data_rif BETWEEN ? AND ? AND turno IN ('pranzo','cena') AND durata_min BETWEEN 5 AND 480
            GROUP BY turno""", (a, b)) if r["d"]}
        ultimo = conn.execute("SELECT MAX(data_rif) FROM cassa_conti").fetchone()[0]
    finally:
        conn.close()

    return {
        "dal": a, "al": b, "prima_dal": p_dal.isoformat(), "prima_al": p_al.isoformat(),
        "dati_fino_al": ultimo,
        "numeri": ora, "numeri_prima": prima,
        "settimana": settimana, "arrivi": arrivi, "sale": sale, "tavoli": tavoli,
        "mesi": mesi, "durata_turno": durata_turno,
    }


def aperture_per_prenotazione(dal, al) -> Dict[int, str]:
    """Ora di apertura del conto per ogni prenotazione abbinata (per misurare quanto
    passa fra l'ora prenotata e la prima comanda)."""
    dal, al = _d(dal), _d(al)
    conn = get_cassa_conti_conn()
    try:
        return {r["prenotazione_id"]: r["aperto_at"] for r in conn.execute("""
            SELECT prenotazione_id, MIN(aperto_at) AS aperto_at FROM cassa_conti
            WHERE data_rif BETWEEN ? AND ? AND prenotazione_id IS NOT NULL AND aperto_at IS NOT NULL
              AND abbinamento IN ('auto', 'manuale')
            GROUP BY prenotazione_id""", (dal.isoformat(), al.isoformat()))}
    finally:
        conn.close()
