# AskHuman HTTP API (v1)

Base URL: `https://askhuman.thrain.ai`
Auth: `Authorization: Bearer ah_live_...` on every `/v1/*` route.
All bodies are JSON.

## Asks

### POST /v1/asks — create an ask
```json
{
  "question": "Refund order #4821 for $214?",   // required, ≤4000 chars
  "context": "Customer is angry, 2nd refund…",  // optional, ≤16000 chars
  "type": "approve",                            // approve | choose | rate | freeform (default)
  "options": ["Option A", "Option B"],          // required iff type=choose (2–20 strings)
  "sla_seconds": 900                            // 30 – 604800, default 3600
}
```
Returns **201** with the ask object plus:
- `answer_url` — tokenized page a human uses to answer (safe to forward anywhere)
- `inbox_url` — the account's pending-asks inbox
- `wait_url` — long-poll endpoint

On create, the ask is fanned out to all active **targets** (Slack/Discord/webhook).

### GET /v1/asks/:id — fetch current state
Ask object: `{ id, question, context, type, options, sla_seconds, status, answer, answered_by, created_at, answered_at, expires_at }`
where `status ∈ pending | answered | expired | cancelled` and `answer` is e.g.
`{ "decision": "approve", "rationale": "within policy" }` /
`{ "choice": "Option B" }` / `{ "rating": 4 }` / `{ "text": "…" }`.

### GET /v1/asks/:id/wait?timeout=50 — long poll
Holds the request up to `timeout` seconds (1–55, default 50) and returns the ask as
soon as it resolves, or its current state at timeout. Loop this for longer waits.

### POST /v1/asks/:id/cancel
Cancels a pending ask (answered/expired asks are unaffected). Returns the ask.

## Targets (where questions get delivered)

### GET /v1/targets
### POST /v1/targets
```json
{ "kind": "slack", "url": "https://hooks.slack.com/services/…", "label": "ops channel" }
```
`kind ∈ slack | discord | webhook` (https URLs only).
- `slack` / `discord`: posted as a chat message with the answer link.
- `webhook`: `POST { "event": "ask.created", "ask": {…}, "answer_url": "…" }`.

### DELETE /v1/targets/:id

## Human-facing pages (no auth — capability URLs)

- `GET /a/:token` — answer page for one ask (approve/choose/rate/freeform UI).
- `GET /inbox/:inbox_key` — account's pending asks with answer links.

## Admin (X-Admin-Secret header)

- `POST /admin/accounts {name, email?}` → `{account_id, api_key, inbox_url}` (key shown once).
- `GET /admin/waitlist` → signups from the landing page.

## Other

- `GET /healthz` — liveness.
- `POST /waitlist {email, note?}` — landing-page signups (also accepts form posts).
