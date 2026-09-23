const _API = import.meta.env.VITE_API_URL ?? '';
const FACTS_KEY = 'deiza-mem-facts';
const DONE_KEY = 'deiza-mem-done';
const ENABLED_KEY = 'deiza-mem-enabled';

function _authHeader(): Record<string, string> {
  const tok = localStorage.getItem('deiza:auth_token');
  return tok ? { 'X-Auth-Token': tok } : {};
}

async function _persistServer(enabled: boolean, facts: string[]) {
  try {
    await fetch(`${_API}/api/memory`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', ..._authHeader() },
      body: JSON.stringify({ enabled, items: facts }),
      signal: AbortSignal.timeout(15000),
    });
  } catch {}
}

/** Read cached facts (fast, keeps UI render synchronous). */
export function getMemoryFacts(): string[] {
  try { return JSON.parse(localStorage.getItem(FACTS_KEY) || '[]'); } catch { return []; }
}

/** Persist facts locally (cache) and to the server (source of truth). */
export function setMemoryFacts(facts: string[]) {
  const trimmed = facts.slice(0, 20);
  localStorage.setItem(FACTS_KEY, JSON.stringify(trimmed));
  const enabled = !(localStorage.getItem(ENABLED_KEY) === 'false');
  _persistServer(enabled, trimmed);
}

/** Clears memory locally and on the server. */
export function clearMemoryFacts() {
  localStorage.removeItem(FACTS_KEY);
  localStorage.removeItem(DONE_KEY);
  setMemoryFacts([]);
}

/** Pull the latest memory from the server into the local cache. */
export async function syncMemoryFromServer(): Promise<{ enabled: boolean; items: string[] }> {
  try {
    const resp = await fetch(`${_API}/api/memory`, {
      method: 'GET',
      credentials: 'include',
      headers: { ..._authHeader() },
      signal: AbortSignal.timeout(15000),
    });
    if (!resp.ok) return { enabled: isMemoryEnabled(), items: getMemoryFacts() };
    const data = await resp.json();
    const items: string[] = Array.isArray(data.items)
      ? data.items.map((it: unknown) => (typeof it === 'string' ? it : (it as any).text ?? '')).filter(Boolean)
      : [];
    localStorage.setItem(FACTS_KEY, JSON.stringify(items.slice(0, 20)));
    localStorage.setItem(ENABLED_KEY, data.enabled ? 'true' : 'false');
    return { enabled: !!data.enabled, items };
  } catch {
    return { enabled: isMemoryEnabled(), items: getMemoryFacts() };
  }
}

/** Whether memory is on (defaults to true). */
export function isMemoryEnabled(): boolean {
  const v = localStorage.getItem(ENABLED_KEY);
  return v ? v === 'true' : true;
}

/** Toggle memory on/off locally + server. */
export function setMemoryEnabled(enabled: boolean) {
  const v = enabled ? 'true' : 'false';
  localStorage.setItem(ENABLED_KEY, v);
  setMemoryFacts(getMemoryFacts());
}

export function buildMemoryContext(language: string): string {
  if (!isMemoryEnabled()) return '';
  const facts = getMemoryFacts();
  if (!facts.length) return '';
  const list = facts.map(f => `• ${f}`).join('\n');
  return language === 'es'
    ? `[Lo que Deiza recuerda de ti]:\n${list}\n\nTenlo en cuenta de forma natural, sin mencionarlo explícitamente salvo que sea relevante.`
    : `[What Deiza remembers about you]:\n${list}\n\nKeep this in mind naturally, without explicitly mentioning it unless relevant.`;
}

function _isProcessed(chatId: number): boolean {
  try {
    const done: number[] = JSON.parse(localStorage.getItem(DONE_KEY) || '[]');
    return done.includes(chatId);
  } catch { return false; }
}

function _markProcessed(chatId: number) {
  try {
    const done: number[] = JSON.parse(localStorage.getItem(DONE_KEY) || '[]');
    done.push(chatId);
    localStorage.setItem(DONE_KEY, JSON.stringify(done.slice(-200)));
  } catch {}
}

/**
 * Silently derive up to 6 cross-chat memory facts from an existing chat and merge
 * them into the user's memory. The extraction runs entirely server-side against the
 * chat's own persisted messages — no extra Chat is ever created, so nothing shows up
 * in the sidebar (unlike the old approach, which piggybacked on /api/chat/stream and
 * relied on deleting the resulting chat afterward — a delete that could fail or lag,
 * leaving a visible "Extrae hasta 6 datos..." entry behind).
 */
export async function extractAndStoreMemory(
  messages: Array<{ role: string; content: string }>,
  chatId: number,
  language: string,
): Promise<void> {
  if (_isProcessed(chatId)) return;
  if (!isMemoryEnabled()) return;
  const userMsgs = messages.filter(m => m.role === 'user');
  if (userMsgs.length < 3) return;

  _markProcessed(chatId);

  try {
    const resp = await fetch(`${_API}/api/memory/extract`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', ..._authHeader() },
      body: JSON.stringify({ chat_id: chatId, language }),
      signal: AbortSignal.timeout(30000),
    });
    if (!resp.ok) return;
    const data = await resp.json();
    if (Array.isArray(data.items)) {
      const items: string[] = data.items
        .map((it: unknown) => (typeof it === 'string' ? it : (it as any).text ?? ''))
        .filter(Boolean);
      localStorage.setItem(FACTS_KEY, JSON.stringify(items.slice(0, 20)));
    }
  } catch {}
}
