/**
 * Cookie / storage consent record. Deiza only uses technical cookies today, so the
 * notice is informational; the categories exist so that any future non-essential
 * technology is gated behind `hasConsent('analytics')` from day one.
 */
export const CONSENT_KEY = 'deiza:consent';
export const CONSENT_VERSION = 1;
const MAX_AGE_MS = 365 * 24 * 60 * 60 * 1000; // 12 months, as the AEPD guide recommends

export interface ConsentRecord {
  v: number;
  ts: number;
  essential: true;
  analytics: boolean;
}

export function readConsent(): ConsentRecord | null {
  try {
    const raw = localStorage.getItem(CONSENT_KEY);
    if (!raw) return null;
    const c = JSON.parse(raw) as ConsentRecord;
    if (!c || c.v !== CONSENT_VERSION || Date.now() - c.ts > MAX_AGE_MS) return null;
    return c;
  } catch {
    return null;
  }
}

export function saveConsent(analytics: boolean): ConsentRecord {
  const c: ConsentRecord = { v: CONSENT_VERSION, ts: Date.now(), essential: true, analytics };
  try { localStorage.setItem(CONSENT_KEY, JSON.stringify(c)); } catch { /* private mode */ }
  try { window.dispatchEvent(new CustomEvent('deiza:consent', { detail: c })); } catch { /* no-op */ }
  return c;
}

export function clearConsent() {
  try { localStorage.removeItem(CONSENT_KEY); } catch { /* no-op */ }
}

export function hasConsent(category: 'essential' | 'analytics'): boolean {
  if (category === 'essential') return true;
  return !!readConsent()?.analytics;
}
