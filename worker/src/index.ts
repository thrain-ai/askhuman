import { Hono } from 'hono';
import {
  randHex,
  sha256hex,
  sleep,
  publicAsk,
  lazyExpire,
  logEvent,
  type AskRow,
} from './util';
import {
  landingPage,
  waitlistThanksPage,
  answerPage,
  resolvedPage,
  errorPage,
  inboxPage,
} from './html';

type Bindings = {
  DB: D1Database;
  ADMIN_SECRET: string;
};

type AccountRow = { id: string; name: string; plan: string; inbox_key: string };

type Variables = { account: AccountRow };

const ASK_TYPES = ['approve', 'choose', 'rate', 'freeform'] as const;
const MIN_SLA = 30;
const MAX_SLA = 7 * 24 * 3600;

const app = new Hono<{ Bindings: Bindings; Variables: Variables }>();

// ---------- public pages ----------

app.get('/', (c) => c.html(landingPage()));
app.get('/healthz', (c) => c.json({ ok: true, service: 'askhuman', ts: new Date().toISOString() }));

app.post('/waitlist', async (c) => {
  const ct = c.req.header('content-type') ?? '';
  let email = '';
  let note = '';
  if (ct.includes('application/json')) {
    const body = await c.req.json<{ email?: string; note?: string }>().catch(() => ({}) as never);
    email = (body.email ?? '').trim();
    note = (body.note ?? '').trim();
  } else {
    const form = await c.req.parseBody();
    email = String(form['email'] ?? '').trim();
    note = String(form['note'] ?? '').trim();
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
    return c.json({ ok: false, error: 'valid email required' }, 400);
  }
  await c.env.DB.prepare(
    `INSERT INTO waitlist (id, email, note) VALUES (?, ?, ?)
     ON CONFLICT(email) DO UPDATE SET note = excluded.note`
  )
    .bind('wl_' + randHex(8), email, note.slice(0, 500) || null)
    .run();
  if (ct.includes('application/json')) return c.json({ ok: true });
  return c.html(waitlistThanksPage());
});

// ---------- human answer pages ----------

async function getAskByToken(db: D1Database, token: string): Promise<AskRow | null> {
  if (!/^[0-9a-f]{32}$/.test(token)) return null;
  const row = await db
    .prepare(`SELECT * FROM asks WHERE answer_token = ?`)
    .bind(token)
    .first<AskRow>();
  return row ?? null;
}

app.get('/a/:token', async (c) => {
  const ask = await getAskByToken(c.env.DB, c.req.param('token'));
  if (!ask) return c.html(errorPage('That answer link doesn’t exist.'), 404);
  await lazyExpire(c.env.DB, ask);
  if (ask.status !== 'pending') return c.html(resolvedPage(ask, false));
  return c.html(answerPage(ask));
});

app.post('/a/:token', async (c) => {
  const ask = await getAskByToken(c.env.DB, c.req.param('token'));
  if (!ask) return c.html(errorPage('That answer link doesn’t exist.'), 404);
  await lazyExpire(c.env.DB, ask);
  if (ask.status !== 'pending') return c.html(resolvedPage(ask, false));

  const form = await c.req.parseBody();
  const rationale = String(form['rationale'] ?? '').trim().slice(0, 2000);
  const answeredBy = String(form['answered_by'] ?? '').trim().slice(0, 120);

  const answer: Record<string, unknown> = {};
  if (ask.type === 'approve') {
    const decision = String(form['decision'] ?? '');
    if (decision !== 'approve' && decision !== 'reject') {
      return c.html(errorPage('Pick Approve or Reject.'), 400);
    }
    answer.decision = decision;
  } else if (ask.type === 'choose') {
    const options: string[] = ask.options_json ? JSON.parse(ask.options_json) : [];
    const choice = String(form['choice'] ?? '');
    if (!options.includes(choice)) return c.html(errorPage('Pick one of the listed options.'), 400);
    answer.choice = choice;
  } else if (ask.type === 'rate') {
    const rating = Number(form['rating']);
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
      return c.html(errorPage('Rating must be 1–5.'), 400);
    }
    answer.rating = rating;
  } else {
    const text = String(form['text'] ?? '').trim().slice(0, 8000);
    if (!text) return c.html(errorPage('Write an answer first.'), 400);
    answer.text = text;
  }
  if (rationale) answer.rationale = rationale;

  const nowIso = new Date().toISOString();
  const result = await c.env.DB.prepare(
    `UPDATE asks SET status='answered', answer_json=?, answered_by=?, answered_at=?
     WHERE answer_token=? AND status='pending'`
  )
    .bind(JSON.stringify(answer), answeredBy || null, nowIso, ask.answer_token)
    .run();

  if (!result.meta.changes) {
    // Someone else answered (or it expired) between our read and write.
    const fresh = await getAskByToken(c.env.DB, ask.answer_token);
    return c.html(resolvedPage(fresh ?? ask, false));
  }

  ask.status = 'answered';
  ask.answer_json = JSON.stringify(answer);
  ask.answered_by = answeredBy || null;
  ask.answered_at = nowIso;
  c.executionCtx.waitUntil(logEvent(c.env.DB, ask.id, 'answered', answeredBy || undefined));
  return c.html(resolvedPage(ask, true));
});

// ---------- inbox ----------

app.get('/inbox/:key', async (c) => {
  const key = c.req.param('key');
  if (!/^[0-9a-f]{16,64}$/.test(key)) return c.html(errorPage('Bad inbox link.'), 404);
  const account = await c.env.DB.prepare(`SELECT * FROM accounts WHERE inbox_key = ?`)
    .bind(key)
    .first<AccountRow & { name: string }>();
  if (!account) return c.html(errorPage('Bad inbox link.'), 404);
  const { results } = await c.env.DB.prepare(
    `SELECT * FROM asks WHERE account_id=? AND status='pending' ORDER BY created_at DESC LIMIT 100`
  )
    .bind(account.id)
    .all<AskRow>();
  const pending: AskRow[] = [];
  for (const a of results) {
    await lazyExpire(c.env.DB, a);
    if (a.status === 'pending') pending.push(a);
  }
  return c.html(inboxPage(account.name, pending, new URL(c.req.url).origin));
});

// ---------- admin ----------

app.post('/admin/accounts', async (c) => {
  if (!c.env.ADMIN_SECRET || c.req.header('x-admin-secret') !== c.env.ADMIN_SECRET) {
    return c.json({ error: 'unauthorized' }, 401);
  }
  const body = await c.req.json<{ name?: string; email?: string }>().catch(() => ({}) as never);
  const name = (body.name ?? '').trim();
  if (!name) return c.json({ error: 'name required' }, 400);

  const accountId = 'acct_' + randHex(8);
  const inboxKey = randHex(16);
  const apiKey = 'ah_live_' + randHex(24);
  const keyHash = await sha256hex(apiKey);

  await c.env.DB.batch([
    c.env.DB.prepare(`INSERT INTO accounts (id, name, email, inbox_key) VALUES (?, ?, ?, ?)`).bind(
      accountId,
      name,
      body.email ?? null,
      inboxKey
    ),
    c.env.DB.prepare(`INSERT INTO api_keys (id, account_id, key_hash, label) VALUES (?, ?, ?, ?)`).bind(
      'key_' + randHex(8),
      accountId,
      keyHash,
      'default'
    ),
  ]);

  const origin = new URL(c.req.url).origin;
  return c.json({
    account_id: accountId,
    name,
    api_key: apiKey, // shown once — only the hash is stored
    inbox_url: `${origin}/inbox/${inboxKey}`,
  });
});

app.get('/admin/waitlist', async (c) => {
  if (!c.env.ADMIN_SECRET || c.req.header('x-admin-secret') !== c.env.ADMIN_SECRET) {
    return c.json({ error: 'unauthorized' }, 401);
  }
  const { results } = await c.env.DB.prepare(
    `SELECT email, note, created_at FROM waitlist ORDER BY created_at DESC LIMIT 500`
  ).all();
  return c.json({ waitlist: results });
});

// ---------- v1 API (agent-facing) ----------

app.use('/v1/*', async (c, next) => {
  const m = (c.req.header('authorization') ?? '').match(/^Bearer\s+(\S+)$/);
  if (!m) return c.json({ error: 'missing bearer token' }, 401);
  const keyHash = await sha256hex(m[1]);
  const account = await c.env.DB.prepare(
    `SELECT a.id, a.name, a.plan, a.inbox_key FROM api_keys k JOIN accounts a ON a.id = k.account_id WHERE k.key_hash = ?`
  )
    .bind(keyHash)
    .first<AccountRow>();
  if (!account) return c.json({ error: 'invalid api key' }, 401);
  c.set('account', account);
  c.executionCtx.waitUntil(
    c.env.DB.prepare(`UPDATE api_keys SET last_used_at = ? WHERE key_hash = ?`)
      .bind(new Date().toISOString(), keyHash)
      .run()
  );
  await next();
});

type TargetRow = { id: string; kind: string; url: string; label: string | null; active: number };

async function deliverAsk(db: D1Database, ask: AskRow, targets: TargetRow[], answerUrl: string) {
  for (const t of targets) {
    let payload: unknown;
    if (t.kind === 'slack') {
      payload = {
        text: `:raising_hand: *Human judgment needed* (${ask.type})\n${ask.question}\n<${answerUrl}|Answer this ask> · expires ${ask.expires_at} UTC`,
      };
    } else if (t.kind === 'discord') {
      payload = {
        content: `🙋 **Human judgment needed** (${ask.type})\n${ask.question}\nAnswer: ${answerUrl}\nExpires ${ask.expires_at} UTC`,
      };
    } else {
      payload = { event: 'ask.created', ask: publicAsk(ask), answer_url: answerUrl };
    }
    try {
      const res = await fetch(t.url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });
      await logEvent(db, ask.id, 'delivered', `${t.kind}:${res.status}`);
    } catch (err) {
      await logEvent(db, ask.id, 'delivery_failed', `${t.kind}:${String(err).slice(0, 200)}`);
    }
  }
}

app.post('/v1/asks', async (c) => {
  const account = c.get('account');
  const body = await c.req
    .json<{
      question?: string;
      context?: string;
      type?: string;
      options?: unknown;
      sla_seconds?: number;
    }>()
    .catch(() => null);
  if (!body) return c.json({ error: 'invalid JSON body' }, 400);

  const question = (body.question ?? '').trim();
  if (!question || question.length > 4000) {
    return c.json({ error: 'question is required (max 4000 chars)' }, 400);
  }
  const type = (body.type ?? 'freeform') as AskRow['type'];
  if (!ASK_TYPES.includes(type)) {
    return c.json({ error: `type must be one of ${ASK_TYPES.join(', ')}` }, 400);
  }
  let options: string[] | null = null;
  if (type === 'choose') {
    if (
      !Array.isArray(body.options) ||
      body.options.length < 2 ||
      body.options.length > 20 ||
      !body.options.every((o) => typeof o === 'string' && o.length > 0 && o.length <= 500)
    ) {
      return c.json({ error: 'choose asks need options: 2–20 non-empty strings' }, 400);
    }
    options = body.options as string[];
  }
  const sla = Math.min(Math.max(Math.trunc(body.sla_seconds ?? 3600), MIN_SLA), MAX_SLA);
  const context = (body.context ?? '').trim().slice(0, 16000) || null;

  const ask: AskRow = {
    id: 'ask_' + randHex(12),
    account_id: account.id,
    question,
    context,
    type,
    options_json: options ? JSON.stringify(options) : null,
    sla_seconds: sla,
    status: 'pending',
    answer_json: null,
    answered_by: null,
    answer_token: randHex(16),
    created_at: new Date().toISOString(),
    answered_at: null,
    expires_at: new Date(Date.now() + sla * 1000).toISOString(),
  };

  await c.env.DB.prepare(
    `INSERT INTO asks (id, account_id, question, context, type, options_json, sla_seconds, status, answer_token, created_at, expires_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?)`
  )
    .bind(
      ask.id,
      ask.account_id,
      ask.question,
      ask.context,
      ask.type,
      ask.options_json,
      ask.sla_seconds,
      ask.answer_token,
      ask.created_at,
      ask.expires_at
    )
    .run();

  const origin = new URL(c.req.url).origin;
  const answerUrl = `${origin}/a/${ask.answer_token}`;
  const { results: targets } = await c.env.DB.prepare(
    `SELECT * FROM targets WHERE account_id = ? AND active = 1`
  )
    .bind(account.id)
    .all<TargetRow>();

  c.executionCtx.waitUntil(logEvent(c.env.DB, ask.id, 'created'));
  c.executionCtx.waitUntil(deliverAsk(c.env.DB, ask, targets, answerUrl));

  return c.json(
    {
      ...publicAsk(ask),
      answer_url: answerUrl,
      inbox_url: `${origin}/inbox/${account.inbox_key}`,
      wait_url: `${origin}/v1/asks/${ask.id}/wait`,
    },
    201
  );
});

async function getOwnAsk(c: { env: { DB: D1Database } }, accountId: string, id: string) {
  const row = await c.env.DB.prepare(`SELECT * FROM asks WHERE id = ? AND account_id = ?`)
    .bind(id, accountId)
    .first<AskRow>();
  return row ?? null;
}

app.get('/v1/asks/:id', async (c) => {
  const ask = await getOwnAsk(c, c.get('account').id, c.req.param('id'));
  if (!ask) return c.json({ error: 'not found' }, 404);
  await lazyExpire(c.env.DB, ask);
  return c.json(publicAsk(ask));
});

// Long poll: hold the request up to ?timeout= seconds (max 55) waiting for a resolution.
app.get('/v1/asks/:id/wait', async (c) => {
  const timeoutSec = Math.min(Math.max(Number(c.req.query('timeout') ?? 50) || 50, 1), 55);
  const deadline = Date.now() + timeoutSec * 1000;
  const accountId = c.get('account').id;
  const id = c.req.param('id');

  let ask = await getOwnAsk(c, accountId, id);
  if (!ask) return c.json({ error: 'not found' }, 404);

  for (;;) {
    await lazyExpire(c.env.DB, ask);
    if (ask.status !== 'pending' || Date.now() >= deadline) {
      return c.json(publicAsk(ask));
    }
    await sleep(2500);
    ask = (await getOwnAsk(c, accountId, id)) ?? ask;
  }
});

app.post('/v1/asks/:id/cancel', async (c) => {
  const accountId = c.get('account').id;
  const id = c.req.param('id');
  await c.env.DB.prepare(
    `UPDATE asks SET status='cancelled' WHERE id=? AND account_id=? AND status='pending'`
  )
    .bind(id, accountId)
    .run();
  const ask = await getOwnAsk(c, accountId, id);
  if (!ask) return c.json({ error: 'not found' }, 404);
  return c.json(publicAsk(ask));
});

// ---------- targets (escalation destinations) ----------

app.get('/v1/targets', async (c) => {
  const { results } = await c.env.DB.prepare(
    `SELECT id, kind, url, label, active, created_at FROM targets WHERE account_id = ? ORDER BY created_at`
  )
    .bind(c.get('account').id)
    .all();
  return c.json({ targets: results });
});

app.post('/v1/targets', async (c) => {
  const body = await c.req
    .json<{ kind?: string; url?: string; label?: string }>()
    .catch(() => null);
  if (!body) return c.json({ error: 'invalid JSON body' }, 400);
  const kind = body.kind ?? '';
  if (!['slack', 'discord', 'webhook'].includes(kind)) {
    return c.json({ error: 'kind must be slack, discord, or webhook' }, 400);
  }
  let url: URL;
  try {
    url = new URL(body.url ?? '');
  } catch {
    return c.json({ error: 'valid url required' }, 400);
  }
  if (url.protocol !== 'https:') return c.json({ error: 'url must be https' }, 400);

  const id = 'tgt_' + randHex(8);
  await c.env.DB.prepare(
    `INSERT INTO targets (id, account_id, kind, url, label) VALUES (?, ?, ?, ?, ?)`
  )
    .bind(id, c.get('account').id, kind, url.toString(), (body.label ?? '').slice(0, 120) || null)
    .run();
  return c.json({ id, kind, url: url.toString(), label: body.label ?? null }, 201);
});

app.delete('/v1/targets/:id', async (c) => {
  const result = await c.env.DB.prepare(`DELETE FROM targets WHERE id = ? AND account_id = ?`)
    .bind(c.req.param('id'), c.get('account').id)
    .run();
  if (!result.meta.changes) return c.json({ error: 'not found' }, 404);
  return c.json({ ok: true });
});

app.notFound((c) => {
  if (c.req.path.startsWith('/v1/') || c.req.path.startsWith('/admin/')) {
    return c.json({ error: 'not found' }, 404);
  }
  return c.html(errorPage('Page not found.'), 404);
});

export default app;
