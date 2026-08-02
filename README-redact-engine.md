# Redact engine

The backend behind the app's **Scan & clean**. A small FastAPI service that
uses a headless browser to look up a person on data-broker sites and submit
removals. Designed to sit on an Oracle Cloud **Always Free** ARM instance, but
it runs anywhere Python and Chromium do.

If you never deploy this, the app still works — it drops into "guided mode"
and people remove themselves from the catalog by hand. The engine is what turns
on the one-tap scan.

---

## Run it locally

```bash
cd server
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
python -m playwright install --with-deps chromium

# start with the offline demo broker so you can test without live sites
REDACT_DEMO=1 uvicorn main:app --reload --port 8000
```

Then, in `../assets/js/config.js`, set:

```js
window.REDACT_API_BASE = "http://localhost:8000";
```

Serve the site (`python3 -m http.server` from the repo root), open it, fill in
a name + city, and press **Scan**. You'll see a "Demo Records" broker come back
**EXPOSED**, and **Clean** will flip it to **REDACTED**. That confirms the whole
pipe — app → engine → job polling → UI — before you touch real brokers.

## Deploy on Oracle Cloud (Always Free)

1. Create an **Ampere (ARM) Ubuntu** instance on the Always Free tier. As of
   mid-2026 the free allowance is 2 OCPU / 12 GB RAM — plenty here.
2. Clone the repo and run the setup script:

   ```bash
   cd redact/server
   bash deploy/setup-oracle.sh
   ```

   It installs Python, the dependencies, Chromium, and a `redact-api` systemd
   service listening on `127.0.0.1:8000`.
3. Put HTTPS in front of it. GitHub Pages serves the app over HTTPS, so the
   browser will refuse a plain-HTTP engine. Caddy is the least-fuss option
   (automatic certificates):

   ```bash
   sudo apt-get install -y caddy
   sudo cp deploy/Caddyfile /etc/caddy/Caddyfile
   sudo nano /etc/caddy/Caddyfile     # set your domain + email
   sudo systemctl restart caddy
   ```

   You'll need a domain or subdomain (e.g. `api.redact.yourdomain.com`) with an
   A record pointing at the instance's public IP.
4. Lock down and connect:
   - In `/etc/systemd/system/redact-api.service`, set
     `REDACT_ALLOW_ORIGIN` to your Pages origin (e.g.
     `https://davidfliesen.github.io`) and `sudo systemctl restart redact-api`.
   - In `assets/js/config.js`, set `REDACT_API_BASE` to your engine's HTTPS URL,
     commit, and push.

## Configuration (environment variables)

| Variable | Default | What it does |
|---|---|---|
| `REDACT_ALLOW_ORIGIN` | `*` | Comma-separated origins allowed to call the API. **Set this to your site in production.** |
| `REDACT_CONCURRENCY` | `4` | How many brokers to hit at once. Keep modest on the free tier. |
| `REDACT_DEMO` | unset | `1` adds the offline demo broker. Use only for smoke tests. |

## How it's organized

```
server/
├── main.py              FastAPI app: /health /scan /clean /jobs/{id}
├── models.py            request/response shapes
├── jobs.py              in-memory job store (auto-purged, nothing on disk)
├── requirements.txt
├── engine/
│   ├── browser.py       shared Chromium + httpx session per job
│   ├── base.py          BrokerAdapter contract
│   ├── registry.py      the list of automatable brokers
│   └── adapters/        one file per broker
│       ├── truepeoplesearch.py
│       ├── fastpeoplesearch.py
│       ├── spokeo.py
│       └── demo.py      offline test broker
└── deploy/
    ├── setup-oracle.sh
    ├── redact-api.service
    └── Caddyfile
```

## Adding a broker

Drop a file in `engine/adapters/` that subclasses `BrokerAdapter`, implement
`scan` (and optionally `submit`), and add an instance to `ADAPTERS` in
`engine/registry.py`. Two patterns to copy:

- **`truepeoplesearch.py`** — a light `httpx` GET against the results page, with
  a name+city check. Fast and cheap; good for sites that return HTML.
- **`spokeo.py`** — a real browser page for JavaScript-heavy or gated sites.

`scan` returns `exposed | clear | error`. `submit` returns
`submitted | needs_you | error` — return **`needs_you`** (with the opt-out URL
and a short message) whenever the last step is an email/phone confirmation or a
CAPTCHA. The app surfaces that as **NEEDS YOU** and links the person straight to
it.

## Honest limits

- **Bot detection is real.** Brokers try to block automation. Scans will
  sometimes get challenged; adapters are written to fail soft (return `error`
  with the URL) rather than guess. Expect to re-verify selectors periodically —
  broker pages drift.
- **CAPTCHAs are not defeated.** By design. Those steps go back to the person.
- **This is best-effort removal**, the same reality the paid services live with;
  they just staff people to sit through the manual steps.
