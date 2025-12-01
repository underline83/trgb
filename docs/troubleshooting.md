# 🛠️ TRGB Gestionale — Troubleshooting

Raccolta problemi comuni e soluzioni.

---

# 1. Backend non risponde

### Test rapido:
```
curl https://trgb.tregobbi.it
```

### Verifica servizio:
```
journalctl -u trgb-backend -f
```

---

# 2. Frontend non carica

### Test:
```
curl https://app.tregobbi.it
```

### Log:
```
journalctl -u trgb-frontend -f
```

---

# 3. Porta occupata (8000 o 5173)

```
sudo lsof -ti:8000 | xargs sudo kill -9
sudo lsof -ti:5173 | xargs sudo kill -9
```

---

# 4. Nginx errore

```
sudo nginx -t
sudo systemctl reload nginx
```

---

# 5. HTTPS non attivo

Rinnova:
```
sudo certbot renew
```

---

# Fine TROUBLESHOOTING.md
