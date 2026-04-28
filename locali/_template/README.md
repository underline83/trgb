# `locali/_template/` — Scaffold per creare un locale nuovo

Quando arriva un cliente nuovo (es. "Osteria da Mario"), si crea il suo locale copiando questa cartella:

```bash
cp -r locali/_template locali/da_mario
cd locali/da_mario
mv locale.json.template locale.json
# editare locale.json con id, nome, dominio del nuovo cliente
```

## Stato sessione 60 (R1) — 2026-04-28

Scaffold **minimo**. Contiene solo:
- `locale.json.template` — schema base con placeholder
- `README.md` — questo file

Sarà completato in R7 con tutti gli altri template:
- `branding.json.template` (palette neutra di partenza)
- `strings.json.template` (vuoto, override delle stringhe italiane)
- `manifest.template.json.template`
- `moduli_attivi.json.template` (default: tutti i moduli attivi)
- `deploy/env.production.template` (placeholder per VPS_HOST, DOMAIN, ecc.)
- `assets/.gitkeep` (logo, favicon da fornire)
- `seeds/.gitkeep` (cartella per migrazioni dati specifiche del cliente)

## Workflow consigliato per onboarding cliente nuovo (post R7)

1. `cp -r locali/_template locali/<nuovo_cliente>`
2. Personalizzare `locale.json` (id, nome, dominio)
3. Personalizzare `branding.json` (palette, logo del cliente)
4. Configurare `deploy/env.production` (VPS, dominio)
5. Decidere quali moduli attivare in `moduli_attivi.json` (vendita modulare, R8)
6. `./push.sh -l <nuovo_cliente> "init: locale <nuovo_cliente>"`
7. Provisioning DNS, SSL, primo login admin
