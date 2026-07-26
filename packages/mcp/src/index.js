#!/usr/bin/env node
// AskHuman MCP server — gives any MCP client an `ask_human` tool.
// Config: ASKHUMAN_API_KEY (required), ASKHUMAN_BASE_URL (default https://askhuman.thrain.ai)

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

const BASE_URL = (process.env.ASKHUMAN_BASE_URL || 'https://askhuman.thrain.ai').replace(/\/$/, '');
const API_KEY = process.env.ASKHUMAN_API_KEY;

if (!API_KEY) {
  console.error('askhuman-mcp: ASKHUMAN_API_KEY environment variable is required');
  process.exit(1);
}

async function api(path, init = {}) {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: {
      authorization: `Bearer ${API_KEY}`,
      'content-type': 'application/json',
      ...(init.headers || {}),
    },
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`AskHuman API ${res.status}: ${text.slice(0, 500)}`);
  return JSON.parse(text);
}

function asResult(obj) {
  return { content: [{ type: 'text', text: JSON.stringify(obj, null, 2) }] };
}

const server = new McpServer({ name: 'askhuman', version: '0.1.0' });

server.registerTool(
  'ask_human',
  {
    title: 'Ask a human',
    description:
      'Escalate a decision to a real human and wait for their judgment. Use when an action is consequential ' +
      '(money, production, customers, irreversible steps) or when human taste/approval is required. ' +
      'Blocks until a human answers, the max wait elapses, or the ask expires. ' +
      'Returns the ask including status and, when answered, the human\'s answer and rationale.',
    inputSchema: {
      question: z.string().max(4000).describe('The single, concrete question a human should answer'),
      context: z
        .string()
        .max(16000)
        .optional()
        .describe('Everything the human needs to decide: what happened, stakes, links, amounts'),
      type: z
        .enum(['approve', 'choose', 'rate', 'freeform'])
        .optional()
        .describe('approve = yes/no sign-off, choose = pick from options, rate = 1-5, freeform = text answer (default)'),
      options: z
        .array(z.string())
        .min(2)
        .max(20)
        .optional()
        .describe('Required when type=choose: the options the human picks from'),
      sla_seconds: z
        .number()
        .int()
        .min(30)
        .max(604800)
        .optional()
        .describe('How long the ask stays answerable before it expires (default 3600)'),
      max_wait_seconds: z
        .number()
        .int()
        .min(5)
        .max(3600)
        .optional()
        .describe('How long THIS call blocks waiting for the answer (default 600). If it returns still-pending, resume later with ask_human_status.'),
    },
  },
  async (args) => {
    const ask = await api('/v1/asks', {
      method: 'POST',
      body: JSON.stringify({
        question: args.question,
        context: args.context,
        type: args.type,
        options: args.options,
        sla_seconds: args.sla_seconds,
      }),
    });

    const maxWaitMs = (args.max_wait_seconds ?? 600) * 1000;
    const start = Date.now();
    let current = ask;
    while (current.status === 'pending' && Date.now() - start < maxWaitMs) {
      const remaining = Math.ceil((maxWaitMs - (Date.now() - start)) / 1000);
      const timeout = Math.min(50, Math.max(1, remaining));
      current = await api(`/v1/asks/${ask.id}/wait?timeout=${timeout}`);
    }

    if (current.status === 'pending') {
      current.note =
        'Still awaiting a human. The ask remains open until its SLA expires — check again later with ask_human_status, or proceed according to your fallback policy.';
      current.answer_url = ask.answer_url;
    }
    return asResult(current);
  }
);

server.registerTool(
  'ask_human_status',
  {
    title: 'Check an ask',
    description: 'Fetch the current status/answer of a previously created ask by id (non-blocking).',
    inputSchema: {
      ask_id: z.string().describe('The ask id returned by ask_human (e.g. ask_ab12...)'),
    },
  },
  async (args) => asResult(await api(`/v1/asks/${encodeURIComponent(args.ask_id)}`))
);

await server.connect(new StdioServerTransport());
