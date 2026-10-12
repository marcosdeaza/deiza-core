import type { ModelKey, Effort } from '@/components/deiza/ModelSelector';

export interface WorkSendOptions {
  model?: ModelKey;
  effort?: Effort;
  requestId?: string;
  mode?: 'work';
}

/** The browser panel can select the next turn, never arbitrary request preferences. */
export function workSendOptions(value: unknown): WorkSendOptions {
  const v = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  return {
    ...(['liquid', 'liquid51', 'solid'].includes(String(v.model)) ? { model: v.model as ModelKey } : {}),
    ...(['low', 'medium', 'high', 'max'].includes(String(v.effort)) ? { effort: v.effort as Effort } : {}),
    ...(typeof v.requestId === 'string' && v.requestId.length <= 120 ? { requestId: v.requestId } : {}),
    mode: 'work',
  };
}
