let lastReload = 0;

export function lazyRetry<T>(
  load: () => Promise<{ default: T }>,
  retryMs = 10000
): Promise<{ default: T }> {
  return load().catch((err: any) => {
    const msg = String(err?.message || err || '');
    const isChunkError =
      msg.includes('dynamically imported module') ||
      msg.includes('Failed to fetch') ||
      msg.includes('Loading chunk') ||
      msg.includes('Unable to preload CSS') ||
      msg.includes('Importing a module script failed');
    if (!isChunkError) throw err;
    const now = Date.now();
    if (now - lastReload < retryMs) throw err;
    lastReload = now;
    if (typeof window !== 'undefined') {
      try {
        window.sessionStorage.removeItem('deiza_stale_build_notified');
        if ('caches' in window) {
          caches.keys().then(keys => keys.forEach(k => { caches.delete(k); }));
        }
        if ('serviceWorker' in navigator) {
          navigator.serviceWorker.getRegistrations().then(regs => {
            regs.forEach(r => { r.unregister(); });
          });
        }
      } catch { /* ignore */ }
      window.location.reload();
    }
    return load();
  });
}