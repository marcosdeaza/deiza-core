import { useEffect, useState } from 'react';
import { desktopBridge, type DesktopUpdateState } from '@/lib/desktop';
import { useLanguage } from '@/contexts/LanguageContext';

/**
 * Inside the desktop app: the same update button the Code sidebar shows, next to the profile in the
 * workspace sidebar (available → downloading → restart). Renders nothing on the web.
 */
const DesktopUpdateRow = () => {
  const { t } = useLanguage();
  const update = desktopBridge()?.update;
  const [u, setU] = useState<DesktopUpdateState | null>(null);

  useEffect(() => {
    if (!update) return;
    let alive = true;
    update.state().then(s => { if (alive) setU(s); }).catch(() => {});
    const off = update.onChange(s => setU(s));
    return () => { alive = false; off?.(); };
  }, [update]);

  if (!update || !u || !u.state || u.state === 'idle') return null;

  const busy = u.state === 'downloading' || u.state === 'installing';
  const label =
    u.state === 'available' ? t('dku.available', { v: u.version || '' })
    : u.state === 'downloading' ? t('dku.downloading', { p: u.pct || 0 })
    : u.state === 'ready' ? (u.method === 'open' ? t('dku.open') : t('dku.ready'))
    : u.state === 'installing' ? t('dku.installing')
    : t('dku.error');
  const onClick = () => {
    if (u.state === 'available') update.start();
    else if (u.state === 'ready') update.restart();
    else if (u.state === 'error') update.openPage();
  };
  const tone = u.state === 'error'
    ? 'border-destructive/40 text-destructive'
    : 'border-[hsl(205_88%_64%/0.45)] bg-[hsl(205_88%_64%/0.09)] hover:bg-[hsl(205_88%_64%/0.16)] text-foreground';

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      title={u.state === 'error' ? u.error : u.notes}
      className={`mb-2 w-full flex items-center gap-2.5 h-9 px-3 rounded-xl border font-body text-[12.5px] text-left transition-colors focus-ring disabled:cursor-default ${tone}`}
    >
      {u.state === 'downloading' ? (
        <span className="deiza-upd-ring" style={{ ['--p' as string]: String(u.pct || 0) }} aria-hidden="true" />
      ) : u.state === 'installing' ? (
        <span className="w-3 h-3 rounded-full border-[1.6px] border-[hsl(205_88%_64%/0.25)] border-t-[hsl(205_88%_64%)] animate-spin shrink-0" aria-hidden="true" />
      ) : (
        <span className={`deiza-upd-light ${u.state === 'error' ? 'is-error' : ''}`} aria-hidden="true" />
      )}
      <span className="flex-1 min-w-0 truncate">{label}</span>
    </button>
  );
};

export default DesktopUpdateRow;
