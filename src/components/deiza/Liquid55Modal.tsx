import { useEffect, useRef } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { X } from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';
import { liquid55Live, liquid55LaunchActive, useLiquid55Live } from '@/lib/launch';
import RoseMark from './RoseMark';

export const liquid55AnnouncementId = () => liquid55Live() ? 'liquid55-launch-2026-10' : 'liquid55-upcoming-2026-10';
export function liquid55Seen(userId?: number | string | null): boolean {
  if (!liquid55LaunchActive()) return true;
  try { return localStorage.getItem(`deiza:announce:${liquid55AnnouncementId()}:${userId ?? 'anon'}`) === '1'; } catch { return true; }
}
export function markLiquid55Seen(userId?: number | string | null) {
  try { localStorage.setItem(`deiza:announce:${liquid55AnnouncementId()}:${userId ?? 'anon'}`, '1'); } catch { /* noop */ }
}

interface Props { open: boolean; onClose: () => void; onTry: () => void; onReadMore: () => void }

const Liquid55Modal = ({ open, onClose, onTry, onReadMore }: Props) => {
  const { t } = useLanguage();
  const live = useLiquid55Live();
  const reduced = useReducedMotion();
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const previousFocus = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    panel.current?.querySelector<HTMLButtonElement>('button')?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key !== 'Tab') return;
      const buttons = panel.current?.querySelectorAll<HTMLButtonElement>('button');
      if (!buttons?.length) return;
      const first = buttons[0], last = buttons[buttons.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    window.addEventListener('keydown', onKey);
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = previousOverflow; previousFocus?.focus(); };
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center p-0 sm:p-6"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: reduced ? 0 : 0.15 }}
          role="dialog" aria-modal="true" aria-labelledby="liquid55-title">
          <div className="absolute inset-0 bg-black/65" onClick={onClose} aria-hidden="true" />
          <motion.div ref={panel} className="relative w-full sm:max-w-2xl max-h-[94dvh] overflow-y-auto rounded-t-[28px] sm:rounded-[28px] bg-card border border-border/40 deiza-shadow-lg"
            initial={{ y: reduced ? 0 : 20 }} animate={{ y: 0 }} exit={{ y: reduced ? 0 : 12 }} transition={{ duration: reduced ? 0 : 0.18 }}>
            <button onClick={onClose} aria-label={t('artifact.close')} className="absolute top-3 right-3 z-10 w-9 h-9 rounded-full bg-black/50 hover:bg-black/70 text-white flex items-center justify-center focus-ring">
              <X className="w-4 h-4" />
            </button>
            <div className="aspect-[16/7] overflow-hidden rounded-t-[28px]">
              <img src="/art/liquid55.webp" alt="" className="w-full h-full object-cover" />
            </div>
            <div className="px-6 sm:px-10 py-7 sm:py-8">
              <div className="flex items-center gap-2.5"><RoseMark size={22} mode="draw" /><p className="font-body text-[10px] font-semibold uppercase tracking-[0.18em] text-primary">{t(live ? 'l55.available' : 'l55.upcoming')}</p></div>
              <h2 id="liquid55-title" className="font-display text-[48px] sm:text-[68px] leading-none tracking-tight text-foreground mt-3">Liquid 5.5</h2>
              <p className="font-display italic text-[20px] sm:text-[23px] text-foreground/80 mt-3">{t('l55.lede')}</p>
              <p className="font-body text-[14px] text-muted-foreground leading-relaxed mt-3">{t(live ? 'l55.desc.live' : 'l55.desc')}</p>
              <p className="font-body text-[12px] text-muted-foreground leading-relaxed mt-4">{t('l55.legacy')}</p>
              <div className="flex flex-col sm:flex-row gap-2 mt-6">
                <button onClick={live ? onTry : onReadMore} className="flex-1 px-5 py-3 rounded-full bg-primary text-primary-foreground font-body text-sm font-medium hover:brightness-110 focus-ring">{t(live ? 'l55.try' : 'l55.read')}</button>
                {live && <button onClick={onReadMore} className="flex-1 px-5 py-3 rounded-full bg-muted/60 hover:bg-muted text-foreground font-body text-sm font-medium focus-ring">{t('l55.read')}</button>}
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
export default Liquid55Modal;
