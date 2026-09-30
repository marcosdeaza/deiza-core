import { useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';
import { solid5LaunchActive } from '@/lib/launch';
import RoseMark from './RoseMark';

export const SOLID5_ANNOUNCEMENT_ID = 'solid5-2026-09';

export function solid5Seen(userId?: number | string | null): boolean {
  if (!solid5LaunchActive()) return true; // launch window over — never show it again
  try { return localStorage.getItem(`deiza:announce:${SOLID5_ANNOUNCEMENT_ID}:${userId ?? 'anon'}`) === '1'; } catch { return true; }
}
export function markSolid5Seen(userId?: number | string | null) {
  try { localStorage.setItem(`deiza:announce:${SOLID5_ANNOUNCEMENT_ID}:${userId ?? 'anon'}`, '1'); } catch { /* noop */ }
}

interface Solid5ModalProps {
  open: boolean;
  onClose: () => void;
  onTry: () => void;
  onReadMore: () => void;
}

const EASE = [0.16, 1, 0.3, 1] as const;

/**
 * One-time launch note for Solid 5. The artwork is the carved rose; the title is revealed
 * from the bottom up, like something being cut out of the stone.
 */
const Solid5Modal = ({ open, onClose, onTry, onReadMore }: Solid5ModalProps) => {
  const { t } = useLanguage();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = prev; };
  }, [open, onClose]);

  const stats: [string, string][] = (['where', 'web', 'vision', 'think'] as const).map(k => [t(`s5.stat.${k}.v`), t(`s5.stat.${k}`)]);
  const bullets = [1, 2, 3, 4].map(i => t(`s5.bullet.${i}`));

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center p-0 sm:p-6"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          transition={{ duration: 0.3 }}
          role="dialog" aria-modal="true" aria-labelledby="solid5-title"
        >
          <div className="absolute inset-0 bg-black/65 backdrop-blur-sm" onClick={onClose} aria-hidden="true" />
          <motion.div
            className="relative w-full sm:max-w-2xl max-h-[94dvh] overflow-y-auto rounded-t-[28px] sm:rounded-[28px] bg-card border border-border/40 deiza-shadow-lg"
            initial={{ y: 48, opacity: 0, scale: 0.97 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: 30, opacity: 0, scale: 0.98 }}
            transition={{ type: 'spring', stiffness: 260, damping: 30, mass: 1 }}
          >
            <button
              onClick={onClose}
              className="absolute top-3 right-3 z-10 w-9 h-9 rounded-full bg-black/40 hover:bg-black/60 text-white flex items-center justify-center transition-colors focus-ring"
              aria-label={t('artifact.close')}
            >
              <X className="w-4 h-4" />
            </button>

            <div className="relative aspect-[2/1] overflow-hidden rounded-t-[28px] bg-[#1c1f1e]">
              <motion.img
                src="/art/solid5.webp"
                alt=""
                className="w-full h-full object-cover object-[center_40%]"
                initial={{ scale: 1.1, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ duration: 2.2, ease: EASE }}
              />
              <div className="absolute inset-x-0 bottom-0 h-28 bg-gradient-to-t from-card to-transparent" aria-hidden="true" />
            </div>

            <div className="px-6 sm:px-10 pb-8 -mt-8 relative">
              <div className="flex items-center gap-2.5">
                <RoseMark size={22} mode="draw" />
                <p className="font-body text-[10px] font-semibold uppercase tracking-[0.24em] text-primary/80">
                  {t('s5.kicker')}
                </p>
              </div>

              <motion.h2
                id="solid5-title"
                className="font-display text-[56px] sm:text-[76px] leading-[0.9] tracking-tight text-foreground mt-3"
                initial={{ clipPath: 'inset(100% 0 0 0)', y: 14 }}
                animate={{ clipPath: 'inset(0% 0 0 0)', y: 0 }}
                transition={{ delay: 0.35, duration: 1.1, ease: EASE }}
              >
                {t('s5.title')}
              </motion.h2>
              <motion.div
                className="h-px mt-4 origin-left bg-gradient-to-r from-[#b8925a] via-[#b8925a]/50 to-transparent"
                initial={{ scaleX: 0 }}
                animate={{ scaleX: 1 }}
                transition={{ delay: 0.9, duration: 1.2, ease: EASE }}
                aria-hidden="true"
              />
              <motion.p
                className="font-display italic text-[19px] sm:text-[22px] text-foreground/75 mt-3"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 1.1, duration: 0.8 }}
              >
                {t('s5.lede')}
              </motion.p>
              <p className="font-body text-[15px] text-muted-foreground leading-relaxed mt-3">
                {t('s5.desc')}
              </p>

              <dl className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-6">
                {stats.map(([v, l], i) => (
                  <motion.div
                    key={l}
                    className="rounded-2xl border border-border/30 bg-background/40 px-3 py-3"
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.5 + i * 0.07, duration: 0.35 }}
                  >
                    <dt className="font-display text-lg sm:text-xl text-foreground leading-none">{v}</dt>
                    <dd className="font-body text-[10.5px] text-muted-foreground/70 mt-1.5 leading-snug">{l}</dd>
                  </motion.div>
                ))}
              </dl>

              <ul className="mt-6 space-y-2.5">
                {bullets.map((b, i) => (
                  <motion.li
                    key={b}
                    className="flex gap-2.5 font-body text-[13.5px] text-foreground/80 leading-relaxed"
                    initial={{ opacity: 0, x: -6 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.75 + i * 0.06, duration: 0.3 }}
                  >
                    <span className="mt-[9px] w-1 h-1 rounded-full bg-primary shrink-0" aria-hidden="true" />
                    <span>{b}</span>
                  </motion.li>
                ))}
              </ul>

              <div className="flex flex-col sm:flex-row gap-2 mt-7">
                <button
                  onClick={onTry}
                  className="flex-1 px-5 py-3 rounded-full bg-primary text-primary-foreground font-body text-sm font-medium hover:brightness-110 transition focus-ring"
                >
                  {t('s5.try')}
                </button>
                <button
                  onClick={onReadMore}
                  className="flex-1 px-5 py-3 rounded-full bg-muted/60 hover:bg-muted text-foreground font-body text-sm font-medium transition focus-ring"
                >
                  {t('s5.read')}
                </button>
              </div>
              <p className="font-body text-[11px] text-muted-foreground/45 mt-4">
                {t('s5.footnote')}
              </p>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default Solid5Modal;
