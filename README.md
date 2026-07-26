# AskHuman

**Human judgment, as an API.** AI agents call `ask_human` when they hit a decision they
shouldn't make alone; the question is delivered to real humans (Slack, Discord, webhook,
or a web inbox); the answer flows back to the blocked agent with a full audit trail.

Live: https://askhuman.thrain.ai · A [thrain.ai](https://thrain.ai) product. **Private repo.**

## Phase roadmap

- **Phase 0 (this repo, live):** escalation-as-a-service — customers' *own* humans answer.
  SaaS, no marketplace. Validates the interface.
- **Phase 1:** concierge marketplace — route to *our* human pool (hand-recruited).
- **Phase 2:** open supply — worker app, calibration traps, reputation, consensus votes.
- **Phase 3:** agent fleets — SLA capacity contracts + compliance audit trails.

## Architecture

```
agent ──MCP `ask_human` / POST /v1/asks──▶ Cloudflare Worker (Hono) ── D1
                                              │
                        Slack / Discord / webhook / web inbox
                                              │
                              human taps tokenized answer link
                                              │
agent ◀── long-poll GET /v1/asks/:id/wait ────┘
```

- `worker/` — the whole service: API, answer pages, inbox, landing page. Cloudflare
  Worker + D1, deployed at askhuman.thrain.ai.
- `packages/mcp/` — stdio MCP server exposing `ask_human` + `ask_human_status`.
  Private (not published to npm yet — licence/scope pending, same as Blackout).
- `docs/API.md` — the HTTP API contract.

## Develop & deploy (this box)

```bash
source <(grep '^export CLOUDFLARE_' ~/.bashrc)
export npm_config_cache=/mnt/ext4dev/npm-cache
cd worker
npm install
npm run deploy               # wrangler deploy
npm run db:schema:remote     # apply schema.sql to prod D1
```

Secrets: `ADMIN_SECRET` (wrangler secret; also exported as `ASKHUMAN_ADMIN_SECRET` in
`~/.bashrc` on the box). Provision accounts:

```bash
curl -s -X POST https://askhuman.thrain.ai/admin/accounts \
  -H "x-admin-secret: $ASKHUMAN_ADMIN_SECRET" \
  -H "content-type: application/json" \
  -d '{"name":"Acme","email":"ops@acme.com"}'
# → returns api_key (once!) and inbox_url
```

## Use the MCP server (any MCP client)

```bash
export ASKHUMAN_API_KEY=ah_live_...
claude mcp add askhuman -e ASKHUMAN_API_KEY=$ASKHUMAN_API_KEY \
  -- node /mnt/ext4dev/repos/askhuman/packages/mcp/src/index.js
```

The agent gets an `ask_human(question, type, options?, sla_seconds?, max_wait_seconds?)`
tool that blocks until a human answers (or returns still-pending with resume instructions).
