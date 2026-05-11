# ad-generator

Hindi & English ad creatives for Indian D2C brands.

```
status:  Week 1 of 4 · UI scaffolding + worker skeleton
target:  https://vs041.github.io/ad-generator
```

---

## What's built (Week 1)

- **Landing page** (`index.html`) — hero, how-it-works, why-this-not-Canva, CTA
- **App shell** (`app/index.html`) — 5-step generator UI: template → language → upload → copy → generate
  - Template selection · 5 categories
  - Language toggle · English / हिंदी
  - Drag-and-drop upload with preview, magic-byte validation, 5 MB cap
  - Optional headline + CTA inputs
  - Generate button (currently a stub — pipeline arrives Week 2)
- **Cloudflare Worker** (`worker/src/index.js`) — API skeleton with `/api/health`, `/api/templates`, `/api/generate` (stub)
- **D1 schema** (`schema.sql`) — `generations`, `events`, `daily_spend` tables
- **Security baseline:** CORS locked, magic-byte server-side check, prompt token blocklist, no API keys in frontend

## What's NOT built yet

- ❌ Actual AI generation (fal.ai bg removal, Flux Schnell scene gen, Claude copy) → **Week 2**
- ❌ Indic font rendering, transliteration, few-shot Hindi copy library → **Week 3**
- ❌ Canvas composite engine and PNG download → **Week 2 / 3**

---

## Repo layout

```
ad-generator/
├── index.html              landing page (root for github pages)
├── app/
│   └── index.html          generator UI shell
├── assets/
│   ├── css/main.css        shared design system
│   └── js/app.js           app state + upload + UI wiring
├── worker/
│   ├── src/index.js        cloudflare worker · API proxy
│   ├── wrangler.toml       worker config
│   └── package.json        wrangler deps
├── schema.sql              D1 schema
└── README.md               this file
```

---

## Setup steps for Week 1

### 1 · GitHub Pages (frontend)

```bash
# create the repo (one-time)
gh repo create ad-generator --public

# push these files
git init
git add .
git commit -m "week 1 scaffolding"
git branch -M main
git remote add origin https://github.com/vs041/ad-generator.git
git push -u origin main

# enable Pages
# go to: https://github.com/vs041/ad-generator/settings/pages
# source: deploy from branch · main · / (root)
# the site goes live at: https://vs041.github.io/ad-generator
```

### 2 · Cloudflare account + Bot Fight Mode (security baseline)

1. Sign up: <https://dash.cloudflare.com/sign-up>
2. Add a site (any domain you own — even just for the dashboard, doesn't have to be the project domain)
3. Once added → **Security → Bot Fight Mode → toggle ON**
4. This is one of the two zero-code safeguards we agreed on.

### 3 · Cloudflare Worker (backend, optional for week 1 testing)

You don't need to deploy the Worker to see the UI — the frontend works on its own.
But to test API endpoints:

```bash
cd worker
npm install
npx wrangler login

# create the D1 database
npx wrangler d1 create ad-generator-db
# copy the database_id from the output, paste into wrangler.toml

# apply schema
cd ..
npx wrangler d1 execute ad-generator-db --file=schema.sql
# add --remote flag once you're ready to apply to production D1

# deploy worker
cd worker
npx wrangler deploy
# you'll get a URL like:  https://ad-generator.<your-subdomain>.workers.dev
# update CONFIG.WORKER_URL in assets/js/app.js with this URL
```

### 4 · fal.ai (image generation, needed Week 2)

Not needed for Week 1, but set up the spending cap now:

1. Sign up: <https://fal.ai/dashboard>
2. **Billing → Spending limit → set to ₹2,000–3,000/month**
3. This is the second of our two zero-code safeguards. fal.ai stops serving requests if hit.
4. Generate an API key. Don't deploy it yet — we'll use it in Week 2 via:
   ```bash
   wrangler secret put FAL_API_KEY
   ```

### 5 · Anthropic API key (for headline copy, Week 2)

You already have one from the RAP Generator. Reuse it:
```bash
wrangler secret put ANTHROPIC_API_KEY
```

---

## Local development

For the frontend, any static server works:

```bash
# python
python3 -m http.server 8000

# or, with Node (if you have it)
npx serve .

# then open: http://localhost:8000
```

The Worker localhost (during `wrangler dev`) is whitelisted in `ALLOWED_ORIGINS`.

---

## Security notes

- **No API keys in frontend.** Everything sensitive lives in Cloudflare Worker secrets via `wrangler secret put`.
- **CORS locked** to `vs041.github.io` + localhost. Adjust `ALLOWED_ORIGINS` in `worker/src/index.js` once you have a custom domain.
- **Magic-byte validation** runs both client- and server-side. Spoofed `.jpg`s with non-image content are rejected.
- **Prompt sanitization** blocks obvious injection attempts and a small NSFW/public-figure blocklist. For Week 2, this should be augmented with a Claude moderation pass.
- **Cost protection:** fal.ai dashboard cap (mandatory, you confirmed) + Cloudflare Bot Fight Mode (mandatory, you confirmed).
- **D1 logging:** every generation attempt is logged with anonymous fingerprint (sha256 of IP + UA, no raw IP stored).

---

## Week 2 preview

- bg-removal pipeline (fal.ai `imageutils/rembg`)
- scene generation (fal.ai Flux Schnell, prompts seeded per template)
- Claude API for headline copy (with your 15 few-shot Hindi/English pairs in the system prompt)
- HTML Canvas composite (browser-side, free)
- PNG download

You'll need to provide the **15 few-shot copy pairs** before Week 2 starts. Format:
```
"Buy 1 Get 1"      → "एक लो, एक फ्री"
"Limited stock"    → "स्टॉक सीमित"
"Free shipping"    → "फ्री डिलीवरी"
... 12 more
```

---

made in भारत · 2026
