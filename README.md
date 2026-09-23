# Nudge — deployment guide

This folder is a ready-to-upload website:

```
index.html              the app (design + logic, single file)
functions/api/draft.js  a Cloudflare Pages Function — your private AI backend
README.md               this file
```

## How it works

- Open in the Claude app, the page uses Claude's built-in drafting and needs
  nothing from you.
- Open on your own domain, the page calls `/api/draft` on your own site.
  That function holds your Anthropic API key **on the server**, calls the
  Claude API, and returns the drafted text. The key never reaches a visitor's
  browser. If the function isn't set up yet, the page still works — it falls
  back to the built-in templates.

## 1. Get an Anthropic API key

1. Go to https://console.anthropic.com and create an account.
2. Go to **API Keys** and create a new key. Copy it — you won't see it again.
3. Add a small amount of billing credit. Each drafted message costs a
   fraction of a cent, but Anthropic requires a card on file.

Keep this key secret. Anyone with it can spend your credit.

## 2. Deploy to Cloudflare Pages (free)

1. Create a free account at https://dash.cloudflare.com/sign-up.
2. In the dashboard, go to **Workers & Pages → Create → Pages → Upload assets**.
3. Drag this whole folder in (or a zip of it) and give the project a name,
   e.g. `nudge`. Cloudflare deploys it and gives you a URL like
   `https://nudge.pages.dev`.

**Important:** the dashboard's drag-and-drop upload does **not** deploy the
`functions/` folder — only Wrangler (the command-line tool) does. Two ways
to finish the setup:

### Option A — Wrangler (recommended, ~5 minutes)
```
npm install -g wrangler
wrangler login
cd nudge-site        # this folder
wrangler pages deploy . --project-name=nudge
```
This uploads `index.html` **and** `functions/api/draft.js` together.
Re-run the same command any time you change a file.

### Option B — Connect a GitHub repo instead
Push this folder to a new GitHub repo, then in Cloudflare choose
**Workers & Pages → Create → Pages → Connect to Git**. Cloudflare will
redeploy automatically, functions included, every time you push.

## 3. Add your API key as a secret

In the Cloudflare dashboard: your Pages project → **Settings → Environment
variables → Add secret**.

| Name | Value |
|---|---|
| `ANTHROPIC_API_KEY` | the key from step 1 |

Or with Wrangler:
```
wrangler pages secret put ANTHROPIC_API_KEY --project-name=nudge
```
Paste the key when prompted. Re-deploy isn't needed — secrets apply
immediately to new requests.

## 4. (Recommended) Lock the function to your domain

By default the function only accepts requests from the same site, which is
fine. If you later add a custom domain **and** keep the `.pages.dev` one
around, list every address that should be allowed:

Environment variable `ALLOWED_ORIGINS` = `https://nudge.pages.dev,https://yourdomain.com`

## 5. (Optional) Add a daily usage cap per visitor

Without this, a single visitor could send unlimited drafting requests.
To cap each visitor to (say) 40 per day:

1. Cloudflare dashboard → **Workers & Pages → KV → Create namespace**,
   name it `NUDGE_RATE`.
2. Your Pages project → **Settings → Functions → KV namespace bindings**
   → variable name `RATE`, namespace `NUDGE_RATE`.
3. Optionally add environment variable `DAILY_LIMIT` = `40` (or any number).

## 6. Add your own domain (optional, ~$10–15/year)

Pages project → **Custom domains → Set up a domain**. If you bought the
domain through Cloudflare, this is one click. Otherwise you'll point your
domain's DNS at Cloudflare first.

## Costs to expect

- Cloudflare Pages hosting: free.
- Anthropic API: pay-as-you-go, a small fraction of a cent per drafted
  message. Set a spend limit in the Anthropic console if you want a hard cap.

## Updating the site later

Edit `index.html` (or ask Claude to), then repeat the Wrangler deploy
command (or push to GitHub if you used Option B).
