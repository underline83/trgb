# Ripristino del Mac di sviluppo (TRGB + VPS + Claude)

> Scritto il 2026-10-29, il giorno prima di perdere il MacBook M5. Vale per qualsiasi Mac nuovo.
> Principio: **il VPS è la fonte di verità** (codice, DB, servizi). Il Mac è solo la postazione da cui si lancia `push.sh`.

## 0. Audit del 2026-10-29 — cosa c'era SOLO sul Mac

| Cosa | Stato | Rischio |
|---|---|---|
| Repo `~/trgb` | pulito, 0 commit avanti su `origin` (VPS) e `github` | nessuno |
| DB in `locali/tregobbi/data/` | copie scaricate da `push.sh` dal VPS | nessuno (si riscaricano) |
| `locali/tregobbi/deploy/env.production` | tracciato in git | nessuno |
| `frontend/.env.*` | tracciati in git | nessuno |
| Skill `/guardiano` | in `skills/guardiano/` (git) + skill di account | nessuno |
| `claude/` (scratch, 70 MB, gitignored) | solo sul Mac: estratti_carta, f24_da_caricare, export iPratico, test | **copiarla in OneDrive** |
| `.claude/settings.local.json`, `.claude/parcheggio/` | gitignored | basso — copiare se si vuole |
| `~/.ssh` (chiave + alias `trgb`) | solo sul Mac | **ALTO: senza chiave non si entra nel VPS** |
| `~/q`, `~/brain` | da oggi pushano anche su GitHub (`underline83/q`, `underline83/brain`) | verificare `git status` pulito |
| `~/eureka`, `~/img-portfolio`, `~/UnderlinePhotoSystem`, `~/lightroom-catalogo`, `~/tregobbi-backup-20261020-1936` | fuori da TRGB, non verificati | coperti solo da Backblaze |

## 1. OGGI, prima di consegnare il Mac

```bash
# 1. Chiave SSH: vedere cosa c'è
cat ~/.ssh/config ; ls ~/.ssh
# → copiare config + chiave privata (id_ed25519 o id_rsa) nel password manager o su chiavetta cifrata.
#   Meglio ancora, se il Mac nuovo c'è già: generare la chiave lì e autorizzarla da QUI (§2.2).

# 2. Repo personali pushati
cd ~/q && git status -s && git log origin/main..HEAD --oneline
cd ~/brain && git status -s && git log origin/main..HEAD --oneline

# 3. Scratch TRGB in OneDrive
cp -R ~/trgb/claude ~/Library/CloudStorage/OneDrive-Personale/01_osteria_tre_gobbi/_trgb_claude_scratch_20261029

# 4. Backblaze: ultimo backup completato = oggi (pannello Backblaze → "Last backup")
```

Firma digitale Aruba (`~/.ArubaSign`): sul Mac nuovo si reinstalla ArubaSign, il certificato sta sul dispositivo/token.

## 2. Mac nuovo

**Usare lo stesso utente `underline83`**: memorie, docs e istruzioni di Claude citano `/Users/underline83/trgb`.

### 2.1 Strumenti
```bash
xcode-select --install                     # git
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
brew install python@3.12 node sqlite
```
Poi: Claude desktop, VS Code, OneDrive (lasciar finire il sync di `01_osteria_tre_gobbi`).

### 2.2 SSH verso il VPS
`~/.ssh/config`:
```
Host trgb
  HostName 80.211.131.156
  User marco
  IdentityFile ~/.ssh/id_ed25519

Host github.com
  User git
  IdentityFile ~/.ssh/id_ed25519
```
- **Con la vecchia chiave salvata**: rimetterla in `~/.ssh/`, `chmod 600 ~/.ssh/id_ed25519`.
- **Con chiave nuova**: `ssh-keygen -t ed25519 -C "underline83@mac-nuovo"`, poi la pubblica (`~/.ssh/id_ed25519.pub`) va aggiunta in `/home/marco/.ssh/authorized_keys` sul VPS — da un Mac che entra ancora, oppure dalla console web del provider del VPS — e su github.com → Settings → SSH keys.
- Prova: `ssh trgb 'hostname; systemctl is-active trgb-backend trgb-frontend'` → `trgb-server`, `active active`.
- Dopo la consegna del vecchio Mac: togliere la sua chiave da `authorized_keys` e da GitHub.

### 2.3 Repo TRGB
```bash
git clone trgb:trgb/trgb.git ~/trgb        # origin = bare repo sul VPS (/home/marco/trgb/trgb.git)
cd ~/trgb
git remote add github git@github.com:underline83/trgb.git
python3.12 -m venv venv && venv/bin/pip install -r requirements.txt   # solo per test locali
cd frontend && npm install && cd ..                                     # solo per test locali
```
Il primo `./push.sh "..."` scarica i DB in `locali/tregobbi/data/`. Non serve nessun build del frontend.

### 2.4 Q e brain
```bash
git clone trgb:<path-bare-q> ~/q          # oppure git@github.com:underline83/q.git
git clone trgb:<path-bare-brain> ~/brain  # oppure git@github.com:underline83/brain.git
```
Rimettere i due `pushurl` su origin (VPS + GitHub) come da `~/q/STATO.md` e `~/brain/STATO.md`.

### 2.5 Claude (Cowork)
Restano nell'account e ricompaiono da soli: progetto «TRGB – Gestionale per la ristorazione» e la sua memoria, Q, connettori TRGB/Q/brain/Gmail/Drive/Calendar, skill di account (guardiano, sb, archivio-personale, catalogo-foto).
Da rifare sul Mac nuovo:
1. Login nell'app desktop con marco@carminati.org.
2. Nuovo task nel progetto TRGB → scegliere il computer nuovo → collegare le cartelle `~/trgb` e `OneDrive-Personale/01_osteria_tre_gobbi`.
3. Estensione Claude in Chrome (se usata).
4. Rimettere `~/trgb/.claude/settings.local.json` se salvato.

Prova finale in chat: «leggi docs/sessione.md e dimmi lo stato» + `ssh trgb` ok + un push vero alla prima modifica.
