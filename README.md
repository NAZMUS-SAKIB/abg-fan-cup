# ABG University Cup 2026 — Fan Cup Voting

**Goal: FREE and ALWAYS LIVE even when your PC is OFF.**

| Piece | Free host | Stays up when PC is off? |
|-------|-----------|--------------------------|
| Page (Angular) | Cloudflare Pages | YES (always) |
| API (NestJS) | Render free Web Service | YES (with keep-alive ping) |
| Database | Neon free PostgreSQL | YES (wakes on request) |

Your PC is only for coding. Production does not depend on your PC.

Project path: `E:\WorkArea\abg-fan-cup`

---

## Free always-live architecture

```
Users → Cloudflare Pages (Angular)
              ↓
         Render API (NestJS)
              ↓
         Neon PostgreSQL
```

### Important free-tier note
- Cloudflare Pages = always on.
- Neon = free DB; may sleep, wakes automatically on API call.
- Render free may sleep after ~15 min idle. Fix: free UptimeRobot HTTP ping to `/health` every 5 minutes.

Cloud builds use **Node 22** (not Node 16). Use Node 22 for this stack (local + cloud).

---

## 1) Database — Neon (free)

1. Sign up: https://neon.tech
2. Create project → copy **pooled** `DATABASE_URL`
3. Keep it for Render env vars

---

## 2) API — Render (free)

1. Push this repo to GitHub
2. Render → New → Web Service → connect repo → root `backend`
3. Settings:
   - Runtime: Node
   - Build: `npm install && npx prisma generate && npm run build`
   - Start: `npx prisma migrate deploy && npx prisma db seed && npm run start:prod`
4. Environment variables:
   - `DATABASE_URL` = Neon pooled URL
   - `JWT_SECRET` = long random string
   - `GOOGLE_CLIENT_ID` = your Google OAuth client ID
   - `CORS_ORIGIN` = your Cloudflare Pages URL (set after step 3, then update)
   - `PORT` = `10000` (Render sets this; app already reads `PORT`)
5. After deploy, open `https://YOUR-API.onrender.com/health` → `{ ok: true }`

Keep-alive (recommended):
- UptimeRobot free monitor → URL `https://YOUR-API.onrender.com/health` every 5 min

---

## 3) Frontend — Cloudflare Pages (free)

1. Set production API URL in `frontend/src/environments/environment.prod.ts`:
   - `apiUrl: 'https://YOUR-API.onrender.com'`
   - `googleClientId: 'YOUR_GOOGLE_CLIENT_ID...'`
2. Cloudflare Pages → Create → connect GitHub → root `frontend`
3. Build command: `npm run build`
4. Output directory: `dist/frontend/browser`
5. Node version: `22`
6. After deploy, copy Pages URL into Render `CORS_ORIGIN` and Google OAuth authorized origins

Google OAuth authorized JavaScript origins:
- `http://localhost:4200`
- `https://YOUR-SITE.pages.dev`

---

## Admin

- URL: `https://YOUR-SITE.pages.dev/admin`
- User: `admin`
- Pass: `nsp2026`

---

## Local development (optional)

```bash
cd E:\WorkArea\abg-fan-cup
docker compose up -d
cd backend
npx prisma migrate deploy
npm run prisma:seed
npm run start:dev
cd ../frontend
npm start
```

Use Node **22** locally (nvm use 22).

---

## Checklist: PC off but site live

- [ ] Neon DB created
- [ ] Render API deployed + `/health` OK
- [ ] UptimeRobot ping on `/health`
- [ ] Cloudflare Pages deployed
- [ ] Google Client ID on API + frontend
- [ ] CORS_ORIGIN = Pages URL
- [ ] Admin login + Excel works