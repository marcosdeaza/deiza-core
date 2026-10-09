/**
 * When usage resets: the 5-hour window and the weekly period (a fixed 7-day cycle per account,
 * see `get_weekly_period` in the backend). Countdowns are compact ("45m", "3h 12m", "2d 5h").
 */

export function countdownLabel(seconds: number | null | undefined): string | null {
  if (seconds == null || !(seconds > 0)) return null;
  const mins = Math.max(1, Math.ceil(seconds / 60));
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ${mins % 60}m`;
  return `${Math.floor(hours / 24)}d ${hours % 24}h`;
}

/** Seconds from now until an API timestamp (UTC, with or without the trailing Z). */
export function secondsUntil(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const ms = new Date(iso.endsWith('Z') ? iso : `${iso}Z`).getTime() - Date.now();
  return Number.isFinite(ms) ? Math.max(0, Math.round(ms / 1000)) : null;
}

/** The reset moment in the user's language and time zone: "lun 19:00" (short) or "lunes, 6 de octubre, 19:00" (long). */
export function resetDateLabel(iso: string | null | undefined, locale: string, long = false): string | null {
  if (!iso) return null;
  const d = new Date(iso.endsWith('Z') ? iso : `${iso}Z`);
  if (Number.isNaN(d.getTime())) return null;
  try {
    return new Intl.DateTimeFormat(locale, long
      ? { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' }
      : { weekday: 'short', hour: '2-digit', minute: '2-digit' }).format(d);
  } catch {
    return d.toLocaleString();
  }
}
