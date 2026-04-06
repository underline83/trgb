# ============================================================
# Servizio Mailchimp — TRGB Gestionale
# Sync contatti CRM → Mailchimp con tags e merge fields
# ============================================================
# @version: v1.0
# -*- coding: utf-8 -*-

"""
Mailchimp Integration Service

Flusso:
1. Legge API key e server prefix da environment (.env)
2. Sync incrementale: manda a Mailchimp solo chi ha email + newsletter=true
3. Merge fields custom: telefono, compleanno, citta, rank, segmento, allergie
4. Tags: mappa i tag CRM + segmenti marketing come tags Mailchimp

Prerequisiti (da configurare sul VPS in .env):
  MAILCHIMP_API_KEY=xxxxx-usXX
  MAILCHIMP_LIST_ID=xxxxxxxx     (ID dell'audience)

Il server prefix viene estratto automaticamente dalla API key (parte dopo il "-").
"""

from __future__ import annotations

import hashlib
import json
import logging
import os
from datetime import date, datetime, timedelta
from typing import Any, Dict, List, Optional, Tuple
from urllib.request import Request, urlopen
from urllib.error import HTTPError

logger = logging.getLogger("trgb.mailchimp")


def _get_config() -> Tuple[str, str, str]:
    """Restituisce (api_key, server_prefix, list_id) o solleva errore."""
    api_key = os.environ.get("MAILCHIMP_API_KEY", "").strip()
    list_id = os.environ.get("MAILCHIMP_LIST_ID", "").strip()
    if not api_key:
        raise ValueError("MAILCHIMP_API_KEY non configurata nel .env")
    if not list_id:
        raise ValueError("MAILCHIMP_LIST_ID non configurato nel .env")
    if "-" not in api_key:
        raise ValueError("MAILCHIMP_API_KEY non valida (deve contenere -usXX)")
    server = api_key.split("-")[-1]
    return api_key, server, list_id


def _api_call(method: str, path: str, data: Optional[dict] = None) -> dict:
    """Chiamata HTTP all'API Mailchimp v3."""
    api_key, server, _ = _get_config()
    url = f"https://{server}.api.mailchimp.com/3.0{path}"

    body = json.dumps(data).encode("utf-8") if data else None
    req = Request(url, data=body, method=method)
    req.add_header("Authorization", f"Bearer {api_key}")
    req.add_header("Content-Type", "application/json")

    try:
        with urlopen(req, timeout=30) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except HTTPError as e:
        error_body = e.read().decode("utf-8") if e.fp else ""
        logger.error(f"Mailchimp API error {e.code}: {error_body}")
        raise ValueError(f"Mailchimp API errore {e.code}: {error_body[:300]}")


def _subscriber_hash(email: str) -> str:
    """MD5 hash dell'email (minuscola) — usato da Mailchimp come ID membro."""
    return hashlib.md5(email.lower().strip().encode("utf-8")).hexdigest()


def check_connection() -> dict:
    """Verifica la connessione e ritorna info account."""
    try:
        api_key, server, list_id = _get_config()
        # Verifica account
        account = _api_call("GET", "/")
        # Verifica audience
        audience = _api_call("GET", f"/lists/{list_id}")
        return {
            "connected": True,
            "account_name": account.get("account_name", ""),
            "email": account.get("email", ""),
            "audience_name": audience.get("name", ""),
            "audience_id": list_id,
            "member_count": audience.get("stats", {}).get("member_count", 0),
        }
    except Exception as e:
        return {"connected": False, "error": str(e)}


def ensure_merge_fields(list_id: str) -> dict:
    """
    Crea i merge fields custom se non esistono gia.
    Ritorna mappa nome → tag.
    """
    _, _, list_id = _get_config()

    # Leggi merge fields esistenti
    existing = _api_call("GET", f"/lists/{list_id}/merge-fields?count=50")
    existing_tags = {f["name"]: f["tag"] for f in existing.get("merge_fields", [])}

    needed = [
        ("Telefono", "PHONE", "phone"),
        ("Compleanno", "BIRTHDAY", "birthday"),
        ("Citta", "CITTA", "text"),
        ("Rank", "RANK", "text"),
        ("Segmento", "SEGMENTO", "text"),
        ("Allergie", "ALLERGIE", "text"),
        ("Pref Cibo", "PREFCIBO", "text"),
    ]

    created = []
    for name, tag, field_type in needed:
        if name not in existing_tags:
            try:
                _api_call("POST", f"/lists/{list_id}/merge-fields", {
                    "name": name,
                    "tag": tag,
                    "type": field_type,
                    "public": False,
                })
                created.append(name)
            except Exception as ex:
                logger.warning(f"Errore creazione merge field {name}: {ex}")

    return {"existing": list(existing_tags.keys()), "created": created}


def sync_contacts(clients: List[dict]) -> dict:
    """
    Sincronizza una lista di clienti con Mailchimp.
    Ogni client e' un dict con: email, nome, cognome, telefono, data_nascita,
    citta, rank, segmento, allergie, pref_cibo, tags (list of str).

    Usa batch PUT (upsert) — crea se non esiste, aggiorna se esiste.
    """
    _, server, list_id = _get_config()

    # Prima assicuriamoci che i merge fields esistano
    ensure_merge_fields(list_id)

    stats = {"synced": 0, "errors": 0, "skipped": 0, "error_details": []}

    for client in clients:
        email = (client.get("email") or "").strip()
        if not email:
            stats["skipped"] += 1
            continue

        sub_hash = _subscriber_hash(email)

        # Costruisci merge fields
        merge_fields = {}
        if client.get("telefono"):
            merge_fields["PHONE"] = client["telefono"]
        if client.get("data_nascita"):
            # Mailchimp birthday format: MM/DD
            dn = client["data_nascita"]
            try:
                if "/" in dn:
                    parts = dn.split("/")
                    if len(parts) >= 2:
                        merge_fields["BIRTHDAY"] = f"{parts[1]}/{parts[0]}"  # DD/MM → MM/DD
                elif "-" in dn:
                    parts = dn.split("-")
                    if len(parts) >= 3:
                        merge_fields["BIRTHDAY"] = f"{parts[1]}/{parts[2]}"
            except Exception:
                pass
        if client.get("citta"):
            merge_fields["CITTA"] = client["citta"]
        if client.get("rank"):
            merge_fields["RANK"] = client["rank"]
        if client.get("segmento"):
            merge_fields["SEGMENTO"] = client["segmento"]
        if client.get("allergie"):
            merge_fields["ALLERGIE"] = client["allergie"][:255]
        if client.get("pref_cibo"):
            merge_fields["PREFCIBO"] = client["pref_cibo"][:255]

        # Costruisci tags (tag CRM + segmento marketing)
        tags = []
        if client.get("tags_list"):
            tags.extend(client["tags_list"])
        if client.get("segmento"):
            tags.append(f"segmento:{client['segmento']}")
        if client.get("vip"):
            tags.append("VIP")
        if client.get("rank"):
            tags.append(f"rank:{client['rank']}")

        # Upsert membro
        member_data = {
            "email_address": email,
            "status_if_new": "subscribed",
            "merge_fields": merge_fields,
        }
        if client.get("nome"):
            member_data.setdefault("merge_fields", {})["FNAME"] = client["nome"]
        if client.get("cognome"):
            member_data.setdefault("merge_fields", {})["LNAME"] = client["cognome"]

        try:
            _api_call("PUT", f"/lists/{list_id}/members/{sub_hash}", member_data)

            # Aggiorna tags (via endpoint separato)
            if tags:
                tag_data = {"tags": [{"name": t, "status": "active"} for t in tags]}
                try:
                    _api_call("POST", f"/lists/{list_id}/members/{sub_hash}/tags", tag_data)
                except Exception:
                    pass  # tags non critici

            stats["synced"] += 1
        except Exception as ex:
            stats["errors"] += 1
            stats["error_details"].append({
                "email": email,
                "error": str(ex)[:200],
            })
            if stats["errors"] >= 20:
                stats["error_details"].append({"email": "...", "error": "Troppi errori, sync interrotto"})
                break

    return stats
