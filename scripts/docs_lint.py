#!/usr/bin/env python3
"""
docs_lint.py — lint del wiki di progetto (docs/).

Regole verificate (vedi docs/convenzioni_wiki.md):
  1. Link markdown relativi rotti (file di destinazione inesistente)
  2. Pagine attive di docs/ non elencate in docs/index.md
  3. (info) Pagine wiki senza header di stato ("Ultima verifica")

Solo stdlib, nessuna dipendenza. Exit code sempre 0 se usato con --warn-only
(default quando chiamato da push.sh): il lint segnala, non blocca.

Uso:
  python3 scripts/docs_lint.py             # exit 1 se ci sono errori (link rotti / fuori index)
  python3 scripts/docs_lint.py --warn-only # sempre exit 0 (per push.sh)
  python3 scripts/docs_lint.py --quiet     # stampa solo se ci sono problemi
"""
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))  # repo root
DOCS = os.path.join(ROOT, "docs")

# Cartelle il cui contenuto non deve stare in index.md riga per riga
# (in index compaiono come cartella) e i cui file non vengono lintati.
SKIP_DIRS = {"archive", "mockups", "operativo"}
# Le cartelle audit sono storiche: i file interni non vanno in index,
# ma i loro link (se una pagina attiva li cita) devono esistere.
AUDIT_PREFIX = "audit-"

# File di docs/ che non sono pagine markdown del wiki
NON_WIKI_EXT = {".docx", ".pdf", ".sql", ".html", ".json"}

# Log append-only: niente header di stato richiesto
LOG_PAGES = {"sessione.md", "changelog.md", "problemi.md"}

LINK_RE = re.compile(r"\[[^\]]*\]\(([^)\s]+)\)")
CODE_FENCE_RE = re.compile(r"```.*?```", re.DOTALL)


def md_files_active():
    """Pagine markdown attive nella root di docs/ (no sottocartelle skip)."""
    out = []
    for name in sorted(os.listdir(DOCS)):
        p = os.path.join(DOCS, name)
        if os.path.isfile(p) and name.endswith(".md"):
            out.append(name)
    return out


def all_lintable_files():
    """Tutti i file .md da lintare per link: root docs + CLAUDE.md."""
    files = [os.path.join(DOCS, n) for n in md_files_active()]
    claude_md = os.path.join(ROOT, "CLAUDE.md")
    if os.path.isfile(claude_md):
        files.append(claude_md)
    return files


def strip_code(text):
    """Rimuove i blocchi di codice (i link d'esempio nei template non contano)."""
    return CODE_FENCE_RE.sub("", text)


def check_links(files):
    errors = []
    for path in files:
        base = os.path.dirname(path)
        try:
            text = strip_code(open(path, encoding="utf-8").read())
        except OSError as e:
            errors.append(f"{os.path.relpath(path, ROOT)}: illeggibile ({e})")
            continue
        for m in LINK_RE.finditer(text):
            target = m.group(1)
            if target.startswith(("http://", "https://", "mailto:", "#")):
                continue
            target_path = target.split("#", 1)[0]
            if not target_path:
                continue
            resolved = os.path.normpath(os.path.join(base, target_path))
            if not os.path.exists(resolved):
                errors.append(
                    f"{os.path.relpath(path, ROOT)}: link rotto → {target}"
                )
    return errors


def check_index_coverage():
    """Ogni pagina attiva di docs/ deve comparire in index.md."""
    index_path = os.path.join(DOCS, "index.md")
    if not os.path.isfile(index_path):
        return ["docs/index.md non esiste"]
    index_text = open(index_path, encoding="utf-8").read()
    errors = []
    for name in md_files_active():
        if name == "index.md":
            continue
        if name not in index_text:
            errors.append(f"docs/{name}: non elencata in docs/index.md")
    return errors


def check_headers():
    """Info: pagine wiki senza header di stato (adozione opt-in, non errore)."""
    missing = []
    for name in md_files_active():
        if name in LOG_PAGES or name == "index.md":
            continue
        head = open(os.path.join(DOCS, name), encoding="utf-8").read(600)
        if "Ultima verifica" not in head:
            missing.append(name)
    return missing


def main():
    warn_only = "--warn-only" in sys.argv
    quiet = "--quiet" in sys.argv

    errors = check_links(all_lintable_files()) + check_index_coverage()
    no_header = check_headers()

    if errors:
        print(f"docs_lint: ❌ {len(errors)} problemi")
        for e in errors:
            print(f"  - {e}")
    elif not quiet:
        print("docs_lint: ✅ nessun link rotto, index completo")

    if no_header and not quiet:
        print(
            f"docs_lint: ℹ️  {len(no_header)} pagine senza header di stato "
            f"(opt-in, si convertono al primo tocco): {', '.join(no_header)}"
        )

    if errors and not warn_only:
        sys.exit(1)
    sys.exit(0)


if __name__ == "__main__":
    main()
