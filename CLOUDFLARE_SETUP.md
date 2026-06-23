# ☁️ SRT Snap — Cloudflare Pages Deployment Guide

This guide walks you through deploying SRT Snap to **Cloudflare Pages** with a server-side authentication backend using **Cloudflare KV**.

## Architecture Overview

```
User's Browser
     │
     ├──► Cloudflare Pages (static files: index.html, src/*.js, src/*.css)
     │         │
     │         └──► Pages Functions (serverless API: /api/*)
     │                    │
     │                    └──► Cloudflare KV (user data, sessions, licenses)
     │
     └──► PayPal (payment link, no integration needed)
```

## Prerequisites

1. **Cloudflare Account** — [Sign up free](https://dash.cloudflare.com/sign-up)
2. **GitHub Account** — Your repo is already on GitHub
3. **Node.js** — For Wrangler CLI (if not already installed)

---

## Step 1: Install Wrangler CLI

Open a terminal and run:

```powershell
npm install -g wrangler
```

Verify installation:

```powershell
wrangler --version
```

---

## Step 2: Log in to Cloudflare

```powershell
wrangler login
```

This opens a browser window. Click **Allow** to grant Wrangler access to your Cloudflare account.

---

## Step 3: Create a KV Namespace

KV stores user accounts, sessions, and license keys. Create it with:

```powershell
wrangler kv:namespace create "SRT_SNAP_DATA"
```

**This returns a KV ID.** Copy it — you'll need it in the next step.

Example output:
```
🌀 Creating namespace with title "srt-snap-SRT_SNAP_DATA"
✨ Success!
Add the following to your wrangler.toml:

[[kv_namespaces]]
binding = "SRT_SNAP_DATA"
id = "abc123def456"
```

---

## Step 4: Configure wrangler.toml

Open `wrangler.toml` and replace `YOUR_KV_NAMESPACE_ID_HERE` with the ID from Step 3:

```toml
[[kv_namespaces]]
binding = "SRT_SNAP_DATA"
id = "abc123def456"   # <-- PUT YOUR KV ID HERE
```

---

## Step 5: Seed the Admin Config in KV

Before deploying, you need to create the admin account in KV. Run the seed script:

```powershell
wrangler kv:key put --binding=SRT_SNAP_DATA "admin" '{"username":"admin","passwordHash":"e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855","email":"SpoiledAvocado.discord@gmail.com","isPro":true}'
```

> **Note:** The `passwordHash` above is a placeholder. To generate the correct hash for your admin password, run this in your browser console:
> ```javascript
> function simpleHash(str) { let hash = 0; for (let i = 0; i < str.length; i++) { const char = str.charCodeAt(i); hash = ((hash << 5) - hash) + char; hash |= 0; } return Math.abs(hash).toString(16).padStart(8, '0'); }
> console.log(simpleHash('admin:YOUR_PASSWORD:ADMIN_SALT_2024'));
> ```
> Then use that output in the `passwordHash` field above.

**Alternatively, use the Cloudflare Dashboard:**
1. Go to [Cloudflare Dashboard](https://dash.cloudflare.com/)
2. Navigate to **Workers & Pages** → **KV**
3. Select your `srt-snap-SRT_SNAP_DATA` namespace
4. Click **Add Entry**
5. Key: `admin`
6. Value: `{"username":"admin","passwordHash":"e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855","email":"SpoiledAvocado.discord@gmail.com","isPro":true}`
7. Click **Save**

---

## Step 6: (Optional) Set Your Cloudflare API URL

The auth system now **auto-detects** the current origin when running on http/https, so you generally don't need to set this.

If you need to override (e.g., for local dev with `wrangler pages dev`), open `src/secret-config.js`:

```javascript
window.CLOUDFLARE_API_URL = 'http://localhost:8788'; // Local dev only
```

Leave it empty (`''`) for auto-detect on Cloudflare Pages.

---

## Step 7: Deploy to Cloudflare Pages

### Option A: Using the "Flare" Extension (VS Code)

1. Press `Ctrl+Shift+P` to open the command palette
2. Type **"Flare: Deploy to Cloudflare Pages"** and select it
3. Follow the prompts to authenticate and deploy

### Option B: Using Wrangler CLI

```powershell
wrangler pages publish . --project-name=srt-snap
```

For the first deployment, you'll be prompted to create the project. Say **yes**.

### Option C: GitHub Integration

1. Go to [Cloudflare Dashboard](https://dash.cloudflare.com/)
2. Navigate to **Workers & Pages** → **Pages**
3. Click **Connect to Git**
4. Select your `srt-snap` repository
5. Configure:
   - **Project name:** `srt-snap`
   - **Production branch:** `main`
   - **Build command:** (leave blank — this is a static site)
   - **Build output directory:** `.`
6. Click **Save and Deploy**

---

## Step 8: Bind KV to Your Pages Project

After deploying, you must connect the KV namespace:

### Option A: Via Wrangler (if deployed via CLI)

```powershell
wrangler pages deployment list --project-name=srt-snap
```

Then:

```powershell
wrangler pages kv binding add --project-name=srt-snap "SRT_SNAP_DATA" --namespace-id=YOUR_KV_ID
```

### Option B: Via Cloudflare Dashboard

1. Go to **Workers & Pages** → **srt-snap**
2. Click **Settings** → **Functions** → **KV namespace bindings**
3. Click **Add binding**
   - **Variable name:** `SRT_SNAP_DATA`
   - **KV namespace:** Select the one you created
4. Click **Save**

Then **redeploy** the project.

---

## Step 9: Verify It Works

1. Visit your Cloudflare Pages URL (e.g., `https://srt-snap-xxxxx.pages.dev`)
2. Click **Login**
3. Enter the admin credentials (from `secret-config.js`)
4. You should see the admin badge and Pro toggle
5. Try registering a new user account
6. Try logging in/out

---

## Local Development

For local testing with the API:

```powershell
wrangler pages dev .
```

This starts a local server at `http://localhost:8788` that runs the Pages Functions.

In `secret-config.js`, set:

```javascript
window.CLOUDFLARE_API_URL = 'http://localhost:8788';
```

---

## Troubleshooting

### "Admin not configured" on login
You haven't seeded the KV namespace. Run the seed command from **Step 5**.

### "KV namespace not found"
You haven't bound the KV namespace to your Pages project. See **Step 8**.

### CORS errors in browser
The `_middleware.js` handles CORS. If you see errors, ensure the API URL is correct.

### Auth falls back to localStorage
The system auto-detects Cloudflare Pages by checking if the protocol is `http:` or `https:`.
If you're testing locally via `file://` protocol, localStorage is used automatically.
For local testing with `wrangler pages dev`, set `CLOUDFLARE_API_URL` in `secret-config.js`.

---

## File Structure

```
d:\Dev\file repair app\
├── functions\                  # Cloudflare Pages Functions (serverless API)
│   ├── _middleware.js          # CORS headers
│   └── api\
│       ├── register.js         # POST /api/register
│       ├── login.js            # POST /api/login
│       ├── verify-key.js       # POST /api/verify-key
│       ├── verify-session.js   # POST /api/verify-session
│       └── admin\
│           ├── login.js        # POST /api/admin/login
│           ├── users.js        # GET /api/admin/users
│           └── add-license.js  # POST /api/admin/add-license
├── src\
│   ├── auth.js                 # Updated: Cloudflare API + localStorage fallback (auto-detect origin)
│   ├── secret-config.js        # Optional CLOUDFLARE_API_URL override (leave empty for auto-detect)
│   └── ...
├── wrangler.toml               # Cloudflare Pages config
├── CLOUDFLARE_SETUP.md         # This guide
└── index.html
```

---

## Security Notes

- **Admin password** is stored in `secret-config.js` (gitignored) and hashed in KV
- **User passwords** are hashed client-side before sending to the API
- **Session tokens** are random UUIDs stored in KV with 24-hour TTL
- **License keys** use the same algorithm as before — they're generated from the user's email
- The API runs on **Cloudflare's edge network** — low latency, no server maintenance
