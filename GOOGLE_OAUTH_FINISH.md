# Google OAuth — finish these 2 clicks

## 1) Publish app (everyone can sign in)
1. Open: https://console.cloud.google.com/auth/audience
2. Project: ABG Fan Cup
3. Publishing status → **Publish app** / Move to Production → Confirm

## 2) Render environment (API)
Dashboard → abg-fan-cup → Environment → set:

GOOGLE_CLIENT_ID=472169245757-8csiji4e0tcpf2oq6m2mmen71kqdpdao.apps.googleusercontent.com
ALLOW_DEV_AUTH=false

Save → Manual Deploy if needed.

## 3) JavaScript origins (must match your live URL)
Clients → your Web client → Authorized JavaScript origins
(no trailing slash), e.g.:
https://abg-university-cup.YOUR-SUBDOMAIN.workers.dev
http://127.0.0.1:4200
http://localhost:4200