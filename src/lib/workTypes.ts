/**
 * Deiza Work: shared types and the reducer that turns the stream's `work` events (and the trace
 * persisted in message meta) into the state the trace and the computer panel render.
 */

export interface WorkStep {
  kind: 'step';
  id: string;
  tool: string;
  label: string;
  detail?: string;
  status: 'run' | 'ok' | 'err';
  error?: string;
}

export interface WorkNote {
  kind: 'note';
  id: string;
  text: string;
}

export type WorkItem = WorkStep | WorkNote;

export interface WorkFile {
  url: string;
  name?: string;
  w?: number;
  h?: number;
}

export interface WorkState {
  items: WorkItem[];
  plan?: Array<{ text: string; done?: boolean }>;
  files: WorkFile[];
  page?: { url: string; title?: string };
  startedAt?: number;
  endedAt?: number;
  status?: 'running' | 'completed' | 'interrupted' | 'cancelled';
  reason?: string;
  checkpoint?: { round: number; max_rounds: number; elapsed_seconds: number; max_seconds: number; steps?: number };
}

export interface WorkShot {
  img: string;
  url: string;
  title?: string;
  /** browser fit v1: where the agent last clicked or dragged, in page pixels */
  pointer?: { x: number; y: number };
}

export const emptyWork = (): WorkState => ({ items: [], files: [], startedAt: Date.now() });

/** Applies one live event. Screenshots are not kept here (the panel holds the latest one). */
export function applyWorkEvent(prev: WorkState | undefined, ev: any): WorkState {
  const s: WorkState = prev ? { ...prev, items: [...prev.items], files: [...prev.files] } : emptyWork();
  if (!ev || typeof ev !== 'object') return s;
  switch (ev.type) {
    case 'state':
      if (['running', 'completed', 'interrupted', 'cancelled'].includes(ev.status)) {
        s.status = ev.status;
        s.reason = ev.reason ? String(ev.reason) : undefined;
        if (ev.status !== 'running') {
          s.endedAt = Date.now();
          s.items = s.items.map(x => x.kind === 'step' && x.status === 'run'
            ? { ...x, status: 'err', error: s.reason || 'interrupted' } : x);
        }
      }
      break;
    case 'checkpoint':
      s.checkpoint = { round: Number(ev.round) || 0, max_rounds: Number(ev.max_rounds) || 0,
        elapsed_seconds: Number(ev.elapsed_seconds) || 0, max_seconds: Number(ev.max_seconds) || 0, steps: Number(ev.steps) || 0 };
      if (ev.page?.url) s.page = { url: String(ev.page.url), title: ev.page.title };
      if (Array.isArray(ev.plan)) s.plan = ev.plan;
      break;
    case 'step': {
      const step: WorkStep = {
        kind: 'step', id: String(ev.id), tool: String(ev.tool || ''), label: String(ev.label || ''),
        detail: ev.detail ? String(ev.detail) : undefined, status: ev.status === 'err' ? 'err' : ev.status === 'ok' ? 'ok' : 'run',
        error: ev.error ? String(ev.error) : undefined,
      };
      const i = s.items.findIndex(x => x.kind === 'step' && x.id === step.id);
      if (i >= 0) s.items[i] = step; else s.items.push(step);
      break;
    }
    case 'note':
      if (ev.text) s.items.push({ kind: 'note', id: `n${s.items.length}`, text: String(ev.text) });
      break;
    case 'plan':
      if (Array.isArray(ev.items)) s.plan = ev.items.map((x: any) => ({ text: String(x.text || ''), done: !!x.done }));
      break;
    case 'file':
      if (ev.url && !s.files.some(f => f.url === ev.url)) s.files.push({ url: ev.url, name: ev.name, w: ev.w, h: ev.h });
      break;
    case 'shot':
    case 'page':
      if (ev.url) s.page = { url: String(ev.url), title: ev.title ? String(ev.title) : undefined };
      break;
    default:
      break;
  }
  return s;
}

/** Rebuilds the trace saved in message meta (`meta.work`, a list of events without screenshots). */
export function workFromMeta(list: any, history = true): WorkState | undefined {
  if (!Array.isArray(list) || list.length === 0) return undefined;
  let s: WorkState = { items: [], files: [] };
  for (const ev of list) s = applyWorkEvent(s, ev);
  if (!history) return s;
  // A saved pending action has no verified result. Never give it a success checkmark.
  if (s.status === 'running' || (!s.status && s.items.some(x => x.kind === 'step' && x.status === 'run'))) s.status = 'interrupted';
  s.items = s.items.map(x => (x.kind === 'step' && x.status === 'run' ? { ...x, status: 'err', error: s.reason || 'interrupted' } : x));
  return s;
}
