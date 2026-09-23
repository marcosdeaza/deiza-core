import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Link, useLocation } from 'react-router-dom';
import { useLanguage } from '@/contexts/LanguageContext';
import { readConsent, saveConsent } from '@/lib/consent';
import logo from '@/assets/logo.png';

/**
 * Cookie notice. Deiza only sets technical cookies, so the AEPD does not require a
 * consent banner; this is a discreet, one-time information card (LSSI art. 22.2) that
 * also records a choice for any future non-essential technology. Accept and reject
 * sit at the same level, as the AEPD guide demands — no dark patterns.
 * Re-open it any time with `window.dispatchEvent(new Event('deiza:open-cookies'))`.
 */
const CookieNotice = () => {
  const { t } = useLanguage();
  const { pathname } = useLocation();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (readConsent()) return;
    const t = setTimeout(() => setOpen(true), 1200);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    const reopen = () => setOpen(true);
    window.addEventListener('deiza:open-cookies', reopen);
    return () => window.removeEventListener('deiza:open-cookies', reopen);
  }, []);

  // Never cover the legal pages themselves or the shared-link viewers
  if (pathname.startsWith('/legal') || pathname.startsWith('/c/') || pathname.startsWith('/s/')) return null;

  const choose = (analytics: boolean) => { saveConsent(analytics); setOpen(false); };

  return (
    <AnimatePresence>
      {open && (
        <motion.aside
          role="dialog" aria-live="polite" aria-label={t('ck.aria')}
          className="fixed z-[90] left-3 right-3 sm:left-5 sm:right-auto sm:w-[360px] rounded-2xl bg-card/95 backdrop-blur-xl deiza-border deiza-shadow-lg p-4 sm:p-5"
          style={{ bottom: 'calc(env(safe-area-inset-bottom, 0px) + 14px)' }}
          initial={{ opacity: 0, y: 18, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 12, scale: 0.98 }}
          transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
        >
          <div className="flex items-start gap-3">
            <img src={logo} alt="" className="w-7 h-7 blend-multiply mt-0.5 shrink-0" aria-hidden="true" draggable={false} />
            <div className="min-w-0">
              <p className="font-display text-[17px] tracking-tight text-foreground leading-tight">
                {t('ck.title')}
              </p>
              <p className="font-body text-[13px] text-muted-foreground leading-relaxed mt-1.5">
                {t('ck.body')}
                {' '}
                <Link to="/legal/cookies" className="text-primary underline underline-offset-[3px] decoration-primary/40 hover:decoration-primary">
                  {t('ck.details')}
                </Link>
              </p>
            </div>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2">
            <button onClick={() => choose(false)}
              className="font-body text-[13px] font-medium py-2.5 rounded-full border border-border/50 text-foreground hover:bg-muted/60 transition-colors focus-ring">
              {t('ck.essential')}
            </button>
            <button onClick={() => choose(true)}
              className="font-body text-[13px] font-medium py-2.5 rounded-full bg-foreground text-background hover:opacity-90 transition-opacity focus-ring">
              {t('ck.ok')}
            </button>
          </div>
        </motion.aside>
      )}
    </AnimatePresence>
  );
};

export default CookieNotice;
