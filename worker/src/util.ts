export function randHex(bytes: number): string {
  const buf = new Uint8Array(bytes);
  crypto.getRandomValues(buf);
  return [...buf].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function sha256hex(s: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function escapeHtml(s: string): string {
  return s
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export interface AskRow {
  id: string;
  account_id: string;
  question: string;
  context: string | null;
  type: 'approve' | 'choose' | 'rate' | 'freeform';
  options_json: string | null;
  sla_seconds: number;
  status: 'pending' | 'answered' | 'expired' | 'cancelled';
  answer_json: string | null;
  answered_by: string | null;
  answer_token: string;
  created_at: string;
  answered_at: string | null;
  expires_at: string;
}

// The shape returned to API callers — never leaks answer_token or account_id.
export function publicAsk(ask: AskRow) {
  return {
    id: ask.id,
    question: ask.question,
    context: ask.context,
    type: ask.type,
    options: ask.options_json ? (JSON.parse(ask.options_json) as string[]) : null,
    sla_seconds: ask.sla_seconds,
    status: ask.status,
    answer: ask.answer_json ? JSON.parse(ask.answer_json) : null,
    answered_by: ask.answered_by,
    created_at: ask.created_at,
    answered_at: ask.answered_at,
    expires_at: ask.expires_at,
  };
}

// Expiry is enforced lazily on read; no cron needed at this scale.
export async function lazyExpire(db: D1Database, ask: AskRow): Promise<AskRow> {
  if (ask.status === 'pending' && Date.parse(ask.expires_at) < Date.now()) {
    await db
      .prepare(`UPDATE asks SET status='expired' WHERE id=? AND status='pending'`)
      .bind(ask.id)
      .run();
    ask.status = 'expired';
  }
  return ask;
}

export async function logEvent(db: D1Database, askId: string, kind: string, detail?: string) {
  await db
    .prepare(`INSERT INTO events (id, ask_id, kind, detail) VALUES (?, ?, ?, ?)`)
    .bind('evt_' + randHex(8), askId, kind, detail ?? null)
    .run();
}
