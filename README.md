# Redact

A free, client-only PWA that helps people remove their address, phone, and email
from data broker databases. **No server, no accounts, no tracking** — everything
runs in the visitor's browser and their info is saved only on their own device
(`localStorage`).

## Files
| File | What it is |
|------|------------|
| `index.html` | The page shell |
| `styles.css` | Redaction-themed styling |
| `app.js` | All logic: local storage, catalog rendering, mailto builder, progress |
| `brokers.json` | **The catalog you maintain** — add/edit brokers here |
| `manifest.webmanifest` + `sw.js` + `icons/` | PWA install + offline support |

## Deploy free on GitHub Pages
1. Create a repo (e.g. `redact`) and add these files at the root.
2. Repo **Settings → Pages → Source: main branch / root**.
3. Your app is live at `https://<username>.github.io/redact/`.

Cloudflare Pages or Netlify work the same way (point them at the repo, no build step).

## Maintaining the catalog
Open `brokers.json` and edit the `brokers` array. Each entry:
- `method: "form"` → opens the broker's opt-out `url` in a new tab
- `method: "email"` → opens a pre-filled deletion email (`email` field required)
- `method: "drop"` → links to California's official DROP platform

Opt-out URLs change often and brokers re-add people over time. Revisit the list
every few months and bump the `CACHE` version in `sw.js` when you change files so
returning users get the update.

## Not included (on purpose)
Automated form submission / CAPTCHA solving / scheduled re-checks all need a
server and run into broker terms of service. Keeping it client-only is what makes
it free to run and impossible to leak — the right trade for a giveaway tool.
