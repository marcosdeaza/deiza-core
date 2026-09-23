import { useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';
import { desktopLaunchActive } from '@/lib/launch';
import { isDesktopApp } from '@/lib/desktop';
import { isNative } from '@/lib/native';
import RoseMark from './RoseMark';

export const ANNOUNCEMENT_ID = 'desktop-2026-09';

export function announcementSeen(userId?: number | string | null): boolean {
  if (!desktopLaunchActive()) return true; // launch window over — never show it again
  if (isDesktopApp() || isNative()) return true; // already in an app
  try { return localStorage.getItem(`deiza:announce:${ANNOUNCEMENT_ID}:${userId ?? 'anon'}`) === '1'; } catch { return true; }
}
export function markAnnouncementSeen(userId?: number | string | null) {
  try { localStorage.setItem(`deiza:announce:${ANNOUNCEMENT_ID}:${userId ?? 'anon'}`, '1'); } catch { /* noop */ }
}

interface AnnouncementModalProps {
  open: boolean;
  onClose: () => void;
  onTry: () => void;
  onReadMore: () => void;
}

/**
 * One-time launch note (Deiza for desktop) — artisan artwork, real facts, no noise.
 * Shown the first time an account opens the workspace after the release; never inside the apps.
 */
const AnnouncementModal = ({ open, onClose, onTry, onReadMore }: AnnouncementModalProps) => {
  const { t } = useLanguage();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = prev; };
  }, [open, onClose]);

  const stats: [string, string][] = [
    ['2', t('dkan.stat.modes')],
    ['macOS', t('dkan.stat.mac')],
    ['Windows', t('dkan.stat.win')],
    ['1', t('dkan.stat.login')],
  ];
  const bullets = [1, 2, 3, 4].map(i => t(`dkan.bullet.${i}`));

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center p-0 sm:p-6"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          transition={{ duration: 0.25 }}
          role="dialog" aria-modal="true" aria-labelledby="announce-title"
        >
          <div className="absolute inset-0 bg-black/55 backdrop-blur-sm" onClick={onClose} aria-hidden="true" />
          <motion.div
            className="relative w-full sm:max-w-xl max-h-[92dvh] overflow-y-auto rounded-t-[28px] sm:rounded-[28px] bg-card border border-border/40 deiza-shadow-lg"
            initial={{ y: 40, opacity: 0, scale: 0.98 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: 30, opacity: 0, scale: 0.98 }}
            transition={{ type: 'spring', stiffness: 300, damping: 30, mass: 0.9 }}
          >
            <button
              onClick={onClose}
              className="absolute top-3 right-3 z-10 w-9 h-9 rounded-full bg-black/40 hover:bg-black/60 text-white flex items-center justify-center transition-colors focus-ring"
              aria-label={t('artifact.close')}
            >
              <X className="w-4 h-4" />
            </button>

            <div className="relative aspect-[16/9] overflow-hidden rounded-t-[28px]">
              <motion.img
                src="/art/desktop.webp"
                alt=""
                className="w-full h-full object-cover"
                initial={{ scale: 1.06 }}
                animate={{ scale: 1 }}
                transition={{ duration: 1.6, ease: [0.16, 1, 0.3, 1] }}
              />
              <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-card to-transparent" aria-hidden="true" />
            </div>

            <div className="px-6 sm:px-8 pb-7 -mt-6 relative">
              <div className="flex items-center gap-2.5">
                <RoseMark size={22} mode="draw" />
                <p className="font-body text-[10px] font-semibold uppercase tracking-[0.2em] text-primary/80">
                  {t('dkan.kicker')}
                </p>
              </div>
              <h2 id="announce-title" className="font-display text-[34px] sm:text-[40px] leading-none tracking-tight text-foreground mt-2">
                {t('dkan.title')}
              </h2>
              <p className="font-body text-[15px] text-muted-foreground leading-relaxed mt-3">
                {t('dkan.desc')}
              </p>

              <dl className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-5">
                {stats.map(([v, l], i) => (
                  <motion.div
                    key={l}
                    className="rounded-2xl border border-border/30 bg-background/40 px-3 py-3"
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.15 + i * 0.06, duration: 0.3 }}
                  >
                    <dt className="font-display text-lg sm:text-xl text-foreground leading-none">{v}</dt>
                    <dd className="font-body text-[10.5px] text-muted-foreground/70 mt-1.5 leading-snug">{l}</dd>
                  </motion.div>
                ))}
              </dl>

              <ul className="mt-5 space-y-2">
                {bullets.map((b, i) => (
                  <motion.li
                    key={b}
                    className="flex gap-2.5 font-body text-[13.5px] text-foreground/80 leading-relaxed"
                    initial={{ opacity: 0, x: -6 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.35 + i * 0.05, duration: 0.3 }}
                  >
                    <span className="mt-[9px] w-1 h-1 rounded-full bg-primary shrink-0" aria-hidden="true" />
                    <span>{b}</span>
                  </motion.li>
                ))}
              </ul>

              <div className="flex flex-col sm:flex-row gap-2 mt-6">
                <button
                  onClick={onTry}
                  className="flex-1 px-5 py-3 rounded-full bg-primary text-primary-foreground font-body text-sm font-medium hover:brightness-110 transition focus-ring"
                >
                  {t('dkan.try')}
                </button>
                <button
                  onClick={onReadMore}
                  className="flex-1 px-5 py-3 rounded-full bg-muted/60 hover:bg-muted text-foreground font-body text-sm font-medium transition focus-ring"
                >
                  {t('dkan.read')}
                </button>
              </div>
              <p className="font-body text-[11px] text-muted-foreground/45 mt-4">
                {t('dkan.footnote')}
              </p>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default AnnouncementModal;
