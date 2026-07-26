# @thrain/askhuman-mcp

Gives any MCP-capable agent an **`ask_human`** tool: escalate a decision to a real
person (approve / choose / rate / freeform), block until they answer, and get the
judgment back with a rationale and audit trail. Built for unattended agents that
touch money, inventory, production, or customers.

Backed by the free [AskHuman](https://askhuman.thrain.ai) API.

## Setup

1. Get an API key at https://askhuman.thrain.ai (early access — request via the form).
2. Add the server:

```bash
claude mcp add askhuman -e ASKHUMAN_API_KEY=ah_live_... -- npx -y @thrain/askhuman-mcp
```

Works with any MCP client (Claude Code, Claude Desktop, Cursor, custom agents).

## Tools

- **`ask_human`** — create an ask and wait for a human's answer.
  `question` (required), `context`, `type` (`approve`|`choose`|`rate`|`freeform`),
  `options` (for `choose`), `sla_seconds` (how long the ask stays answerable),
  `max_wait_seconds` (how long this call blocks; returns still-pending gracefully).
- **`ask_human_status`** — non-blocking check of a previous ask by id.

Humans answer via tokenized links (any phone, no app) delivered to Slack, Discord,
any webhook, or a web inbox. Every ask, answer, who-answered, and why is logged.

## Env

- `ASKHUMAN_API_KEY` (required)
- `ASKHUMAN_BASE_URL` (default `https://askhuman.thrain.ai`)

MIT © thrain.ai
