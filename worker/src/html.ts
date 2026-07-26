import { escapeHtml, type AskRow } from './util';

const RUST = '#C14E24';

function shell(title: string, body: string, opts?: { wide?: boolean }): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<style>
  :root { --rust: ${RUST}; --bg: #101014; --panel: #1a1a20; --line: #2a2a33; --ink: #e8e6e1; --dim: #9a968e; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { background: var(--bg); color: var(--ink); font: 16px/1.6 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; min-height: 100vh; }
  a { color: var(--rust); }
  .wrap { max-width: ${opts?.wide ? '960px' : '640px'}; margin: 0 auto; padding: 2.5rem 1.25rem 4rem; }
  .card { background: var(--panel); border: 1px solid var(--line); border-radius: 12px; padding: 1.75rem; margin-top: 1.25rem; }
  .brand { display: flex; align-items: center; gap: .6rem; font-weight: 700; letter-spacing: .02em; }
  .brand .t { display: inline-block; width: 1.4rem; height: 1.4rem; background: var(--rust); border-radius: 4px; position: relative; }
  .brand .t::after { content: "T"; position: absolute; inset: 0; display: grid; place-items: center; color: #fff; font-size: .9rem; font-weight: 800; }
  h1 { font-size: 2rem; line-height: 1.2; margin: 1.5rem 0 .75rem; }
  h2 { font-size: 1.15rem; margin: 2rem 0 .5rem; }
  p.dim, .dim { color: var(--dim); }
  pre { background: #0b0b0e; border: 1px solid var(--line); border-radius: 8px; padding: 1rem; overflow-x: auto; font-size: .85rem; line-height: 1.5; margin: .75rem 0; }
  code { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
  .btn { display: inline-block; background: var(--rust); color: #fff; border: 0; border-radius: 8px; padding: .7rem 1.4rem; font-size: 1rem; font-weight: 600; cursor: pointer; text-decoration: none; }
  .btn.secondary { background: transparent; border: 1px solid var(--line); color: var(--ink); }
  .btn:hover { filter: brightness(1.1); }
  input[type=text], input[type=email], textarea, select { width: 100%; background: #0b0b0e; border: 1px solid var(--line); border-radius: 8px; color: var(--ink); padding: .65rem .8rem; font-size: 1rem; font-family: inherit; }
  textarea { min-height: 90px; resize: vertical; }
  label { display: block; font-size: .85rem; color: var(--dim); margin: 1rem 0 .35rem; }
  .choice { display: flex; align-items: flex-start; gap: .6rem; padding: .6rem .8rem; border: 1px solid var(--line); border-radius: 8px; margin: .4rem 0; cursor: pointer; }
  .choice:hover { border-color: var(--rust); }
  .row { display: flex; gap: .75rem; flex-wrap: wrap; margin-top: 1.25rem; }
  .pill { display: inline-block; font-size: .75rem; padding: .15rem .6rem; border-radius: 99px; border: 1px solid var(--line); color: var(--dim); }
  .pill.pending { color: #e6b450; border-color: #e6b450; }
  .pill.answered { color: #7fd18a; border-color: #7fd18a; }
  .pill.expired, .pill.cancelled { color: var(--dim); }
  .qbox { white-space: pre-wrap; overflow-wrap: anywhere; }
  footer { margin-top: 3rem; font-size: .85rem; color: var(--dim); }
  .steps { display: grid; gap: 1rem; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); margin-top: 1rem; }
  .step { background: var(--panel); border: 1px solid var(--line); border-radius: 12px; padding: 1.25rem; }
  .step b { color: var(--rust); }
</style>
</head>
<body><div class="wrap">${body}</div></body>
</html>`;
}

const brand = `<div class="brand"><span class="t"></span> AskHuman <span class="dim" style="font-weight:400">&nbsp;by thrain.ai</span></div>`;

export function landingPage(): string {
  return shell(
    'AskHuman — human judgment as an API',
    `${brand}
<h1>Human judgment, <span style="color:var(--rust)">as an API.</span></h1>
<p class="dim">AI agents are fast, confident, and occasionally wrong. AskHuman gives your agents a way to stop and ask a person — approval, choice, taste, sign-off — and get an answer they can act on. With an audit trail.</p>

<div class="steps">
  <div class="step"><b>1 · Agent asks</b><br>Your agent calls the <code>ask_human</code> tool (MCP) or one HTTP endpoint when it hits a decision it shouldn't make alone.</div>
  <div class="step"><b>2 · Your people get pinged</b><br>The question lands in Slack, Discord, or any webhook, with a one-tap answer link. No new app to install.</div>
  <div class="step"><b>3 · The answer flows back</b><br>The blocked agent gets the decision and continues. Every ask, answer, and who-answered is logged.</div>
</div>

<h2>What it looks like</h2>
<pre><code>POST /v1/asks
{
  "question": "Refund order #4821 for $214?",
  "type": "approve",
  "sla_seconds": 900
}

→ { "id": "ask_7f3a…", "status": "pending" }
→ (human taps Approve in Slack)
→ { "status": "answered", "answer": { "decision": "approve" } }</code></pre>
<p class="dim">Or drop the MCP server into Claude Code / any MCP client and your agents get an <code>ask_human</code> tool for free.</p>

<h2>Who it's for</h2>
<p class="dim">Teams running agents that touch production, money, or customers — and anyone who wants "a human signed off on every consequential action" to be a queryable fact, not a hope.</p>

<h2>Early access</h2>
<p class="dim">We're onboarding founding teams by hand. Flat founding price, locked in.</p>
<div class="card">
  <form method="POST" action="/waitlist">
    <label for="email">Work email</label>
    <input type="email" id="email" name="email" required placeholder="you@company.com">
    <label for="note">What are your agents doing? (optional)</label>
    <input type="text" id="note" name="note" placeholder="e.g. support refunds, deploy approvals">
    <div class="row"><button class="btn" type="submit">Request access</button></div>
  </form>
</div>

<footer>© ${new Date().getFullYear()} thrain.ai — AskHuman is in early access. <a href="https://thrain.ai">thrain.ai</a></footer>`,
    { wide: true }
  );
}

export function waitlistThanksPage(): string {
  return shell(
    'You’re on the list — AskHuman',
    `${brand}
<div class="card">
<h1 style="margin-top:0">You're on the list.</h1>
<p class="dim">We onboard founding teams by hand, so a real human (fitting, right?) will email you shortly.</p>
<div class="row"><a class="btn secondary" href="/">Back</a></div>
</div>`
  );
}

export function answerPage(ask: AskRow): string {
  const options: string[] = ask.options_json ? JSON.parse(ask.options_json) : [];
  let controls = '';
  if (ask.type === 'approve') {
    controls = `
<div class="row">
  <button class="btn" type="submit" name="decision" value="approve">✓ Approve</button>
  <button class="btn secondary" type="submit" name="decision" value="reject">✗ Reject</button>
</div>`;
  } else if (ask.type === 'choose') {
    controls =
      options
        .map(
          (o, i) =>
            `<label class="choice"><input type="radio" name="choice" value="${escapeHtml(o)}" ${i === 0 ? 'required' : ''}> <span>${escapeHtml(o)}</span></label>`
        )
        .join('') + `<div class="row"><button class="btn" type="submit">Submit choice</button></div>`;
  } else if (ask.type === 'rate') {
    controls = `
<div class="row">
${[1, 2, 3, 4, 5].map((n) => `<button class="btn secondary" type="submit" name="rating" value="${n}">${n}</button>`).join('')}
</div>
<p class="dim" style="margin-top:.5rem;font-size:.85rem">1 = poor · 5 = excellent</p>`;
  } else {
    controls = `
<label for="text">Your answer</label>
<textarea id="text" name="text" required></textarea>
<div class="row"><button class="btn" type="submit">Send answer</button></div>`;
  }

  return shell(
    'Answer this ask — AskHuman',
    `${brand}
<div class="card">
<span class="pill pending">awaiting your judgment</span>
<h1 style="font-size:1.35rem">${escapeHtml(ask.question)}</h1>
${ask.context ? `<p class="dim qbox" style="margin-bottom:1rem">${escapeHtml(ask.context)}</p>` : ''}
<form method="POST">
${controls}
<label for="rationale">Why? (optional, goes back to the agent)</label>
<input type="text" id="rationale" name="rationale" placeholder="one line of reasoning">
<label for="answered_by">Your name (optional, for the audit log)</label>
<input type="text" id="answered_by" name="answered_by" placeholder="e.g. Dana">
</form>
<p class="dim" style="margin-top:1.25rem;font-size:.8rem">Expires ${escapeHtml(ask.expires_at)} UTC · ask ${escapeHtml(ask.id)}</p>
</div>`
  );
}

export function resolvedPage(ask: AskRow, justAnswered: boolean): string {
  const answer = ask.answer_json ? JSON.parse(ask.answer_json) : null;
  const summary = answer
    ? escapeHtml(answer.decision ?? answer.choice ?? (answer.rating != null ? `rated ${answer.rating}/5` : null) ?? answer.text ?? '')
    : '';
  return shell(
    'Ask resolved — AskHuman',
    `${brand}
<div class="card">
<span class="pill ${ask.status}">${ask.status}</span>
<h1 style="font-size:1.35rem">${justAnswered ? 'Answer sent. The agent has it.' : 'This ask is already resolved.'}</h1>
<p class="dim qbox">${escapeHtml(ask.question)}</p>
${summary ? `<p style="margin-top:.75rem"><b>Answer:</b> ${summary}${ask.answered_by ? ` <span class="dim">— ${escapeHtml(ask.answered_by)}</span>` : ''}</p>` : ''}
${ask.status === 'expired' ? `<p class="dim" style="margin-top:.75rem">It expired before anyone answered — the agent was told to proceed without a human (or to stop, depending on how it was configured).</p>` : ''}
</div>`
  );
}

export function errorPage(message: string): string {
  return shell(
    'Not found — AskHuman',
    `${brand}
<div class="card"><h1 style="font-size:1.35rem">${escapeHtml(message)}</h1>
<p class="dim">Check the link, or ask the person (or agent) who sent it to re-send.</p></div>`
  );
}

export function inboxPage(accountName: string, asks: AskRow[], origin: string): string {
  const items = asks.length
    ? asks
        .map(
          (a) => `
<div class="card">
<span class="pill pending">pending</span> <span class="pill">${a.type}</span>
<p class="qbox" style="margin:.6rem 0"><b>${escapeHtml(a.question)}</b></p>
<p class="dim" style="font-size:.8rem">created ${escapeHtml(a.created_at)} UTC · expires ${escapeHtml(a.expires_at)} UTC</p>
<div class="row"><a class="btn" href="${origin}/a/${a.answer_token}">Answer</a></div>
</div>`
        )
        .join('')
    : `<div class="card"><p class="dim">Nothing pending. Your agents are behaving — or not asking.</p></div>`;
  return shell(
    `Inbox — ${accountName} — AskHuman`,
    `${brand}
<h1 style="font-size:1.5rem">Pending asks · ${escapeHtml(accountName)}</h1>
<p class="dim">Refresh for new items. Answer links can also be delivered to Slack/Discord/webhooks.</p>
${items}`,
    { wide: true }
  );
}
