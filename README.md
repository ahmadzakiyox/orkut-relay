# OrderKuota Mutasi Relay API

API relay untuk cek mutasi OrderKuota (QRIS).  
Untuk di-deploy ke **Heroku** supaya bot di Pterodactyl bisa cek mutasi tanpa kena IP block.

## Cara Kerja

```
Bot di Pterodactyl → Heroku API (IP bersih) → OrderKuota
```

Bot mengirim username + token per request, jadi satu relay bisa dipakai banyak user/bot.

---

## 🚀 Deploy ke Heroku

### 1. Push ke GitHub

Buat repo baru di GitHub, lalu push folder ini:

```bash
cd orkut-relay
git init
git add .
git commit -m "initial commit"
git remote add origin https://github.com/USERNAME/orkut-relay.git
git push -u origin main
```

### 2. Deploy di Heroku

1. Buka [heroku.com](https://heroku.com) → Login → **New** → **Create New App**
2. App name: `orkut-relay` (atau nama lain)
3. Tab **Deploy** → Connect GitHub → Pilih repo `orkut-relay`
4. Klik **Deploy Branch**

### 3. Set Config Vars

Buka tab **Settings** → **Config Vars** → **Reveal Config Vars**:

| Key | Value |
|-----|-------|
| `SECRET_KEY` | Key rahasia bebas, misal: `botku-rahasia-2024` |

### 4. Selesai!

URL app kamu: `https://orkut-relay.herokuapp.com`

---

## 📝 Setup di Bot (config.json)

Tambahkan ke `config.json` di server Pterodactyl:

```json
{
  "ORKUT_RELAY_URL": "https://orkut-relay.herokuapp.com",
  "ORKUT_RELAY_KEY": "botku-rahasia-2024"
}
```

Restart bot → Mutasi bisa dicek! ✅

---

## 🔗 API Endpoints

### Cek Mutasi
```
GET /api/mutasi?key=SECRET&username=08xxxx&token=userId:authToken
```

Response:
```json
{
  "status": true,
  "count": 5,
  "data": [
    {
      "date": "2024-01-01 12:00",
      "amount": "10000",
      "type": "CR",
      "brand_name": "...",
      "issuer_reff": "...",
      "buyer_reff": "..."
    }
  ]
}
```

### Health Check
```
GET /api/health
```

---

## 📁 File Structure

```
orkut-relay/
├── index.js         ← Express server (main)
├── package.json
├── Procfile          ← Heroku auto-detect
└── README.md
```

## ⚠️ Penting

- `SECRET_KEY` wajib diset! Tanpa key, siapapun bisa akses API kamu.
- Token dikirim per-request dari bot, tidak disimpan di Heroku.
- Heroku free tier akan sleep setelah 30 menit idle. Gunakan [UptimeRobot](https://uptimerobot.com) untuk keep-alive.
