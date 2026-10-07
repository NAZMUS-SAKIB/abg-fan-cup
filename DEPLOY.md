# ABG Fan Cup — Free deploy (Demo phase)

PC বন্ধ থাকলেও সাইট চালু থাকবে। এখন Demo voter; পরে Google Client ID দিয়ে আসল ভোট চালু করা যাবে।

## 1) Neon (Database) — ২ মিনিট
1. https://console.neon.tech → Sign up (GitHub দিয়ে সহজ)
2. Create project
3. Connection string → **Pooled** কপি করুন (`DATABASE_URL`)

## 2) GitHub (Code)
1. https://github.com/new → repo name: `abg-fan-cup` (Public)
2. এই PC থেকে push:

```powershell
cd E:\WorkArea\abg-fan-cup
git remote add origin https://github.com/YOUR_USERNAME/abg-fan-cup.git
git push -u origin main
```

(GitHub login চাইলে browser login করুন)

## 3) Render (API)
1. https://dashboard.render.com → New → Blueprint / Web Service
2. Connect GitHub repo `abg-fan-cup`
3. Root: `backend` (বা Blueprint `render.yaml` use করুন)
4. Env vars:
   - `DATABASE_URL` = Neon pooled URL
   - `CORS_ORIGIN` = পরে Pages URL (আপাতত `*` বা `http://localhost:4200`)
   - `ALLOW_DEV_AUTH` = `true` (ইতিমধ্যে render.yaml-এ আছে)
   - `GOOGLE_CLIENT_ID` = `REPLACE_WITH_GOOGLE_CLIENT_ID.apps.googleusercontent.com`
   - `JWT_SECRET` = auto / random
5. Deploy → open `https://YOUR-API.onrender.com/health`

## 4) Cloudflare Pages (Frontend)
1. আগে `frontend/src/environments/environment.prod.ts` এ সেট করুন:
   - `apiUrl: 'https://YOUR-API.onrender.com'`
2. Commit + push
3. https://dash.cloudflare.com → Workers & Pages → Create → Connect GitHub → `frontend/`
   - Build: `npm run build`
   - Output: `dist/frontend/browser`
   - Node: `22`
4. Pages URL পেলে Render-এ `CORS_ORIGIN` = সেই URL (কমা ছাড়া একটা URL)

## 5) UptimeRobot (Render যাতে না ঘুমায়)
1. https://uptimerobot.com → monitor HTTP(s)
2. URL: `https://YOUR-API.onrender.com/health` every 5 min

## 6) পরে Google (ফেজ ২)
Client ID বানিয়ে:
- Render `GOOGLE_CLIENT_ID` + `ALLOW_DEV_AUTH=false`
- `environment.prod.ts` এ `googleClientId`
- Redeploy frontend

Admin: `/admin` → `admin` / `nsp2026`