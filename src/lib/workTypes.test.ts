import { describe, expect, it } from 'vitest';
import { workFromMeta } from './workTypes';

const pending = { type: 'step', id: '1', tool: 'browser_click', label: 'Clic', status: 'run' };

describe('saved Work progress', () => {
  it('does not claim an interrupted click succeeded after refresh', () => {
    const state = workFromMeta([pending, { type: 'state', status: 'interrupted', reason: 'connection' }]);
    expect(state.status).toBe('interrupted');
    expect(state.items[0]).toMatchObject({ status: 'err', error: 'connection' });
  });
  it('keeps live pending clicks running while polling a generation', () => {
    const state = workFromMeta([{ type: 'state', status: 'running' }, pending], false);
    expect(state.status).toBe('running');
    expect(state.items[0]).toMatchObject({ status: 'run' });
  });
  it('restores cancellation and its checkpoint without losing completed actions', () => {
    const state = workFromMeta([{ ...pending, status: 'ok' },
      { type: 'checkpoint', round: 63, steps: 80, elapsed_seconds: 1500, max_seconds: 7200, plan: [{ text: 'Leer Classroom', done: false }], page: { url: 'https://classroom.google.com/' } },
      { type: 'state', status: 'cancelled', reason: 'cancelled' }]);
    expect(state.status).toBe('cancelled');
    expect(state.items[0]).toMatchObject({ status: 'ok' });
    expect(state.checkpoint.elapsed_seconds).toBe(1500);
    expect(state.page.url).toBe('https://classroom.google.com/');
    expect(state.plan[0].done).toBe(false);
  });
});
