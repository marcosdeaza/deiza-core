import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Link } from 'react-router-dom';
import { X, Loader2, ShieldCheck } from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';
import { authHeaders } from '@/services/api';
import { WITHDRAWAL_WAIVER_VERSION } from '@/data/legal';

const API_URL = import.meta.env.VITE_API_URL ?? '';

export type CheckoutIntent = { planKey: string; planName: string; priceLabel: string; gift?: boolean };

/**
 * Pre-checkout sheet: the express request to start the digital service immediately and
 * the acknowledgement of losing the 14-day withdrawal right (art. 103.m TRLGDCU /
 * art. 16 Dir. 2011/83/EU). The backend records it and refuses checkout without it.
 */
const CheckoutConsent = ({ intent, onClose, onConfirmed }:
  { intent: CheckoutIntent | null; onClose: () => void; onConfirmed: (intent: CheckoutIntent) => Promise<void> | void }) => {
  const { language, t } = useLanguage();
  const [ticked, setTicked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const confirm = async () => {
    if (!intent || !ticked) return;
    setBusy(true); setError(null);
    try {
      const res = await fetch(`${API_URL}/api/legal/consent`, {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ kind: 'withdrawal_waiver', version: WITHDRAWAL_WAIVER_VERSION, plan: intent.planKey, gift: !!intent.gift, language }),
      });
      if (!res.ok) throw new Error('consent');
      await onConfirmed(intent);
    } catch {
      setError(t('cc.err'));
      setBusy(false);
    }
  };

  return (
    <AnimatePresence>
      {intent && (
        <motion.div className="fixed inset-0 z-[95] flex items-end sm:items-center justify-center p-0 sm:p-6 bg-black/50 backdrop-blur-sm"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => !busy && onClose()}>
          <motion.div role="dialog" aria-modal="true" aria-labelledby="cc-title"
            className="w-full sm:max-w-md bg-card deiza-border deiza-shadow-lg rounded-t-3xl sm:rounded-3xl p-6 sm:p-7"
            style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 24px)' }}
            initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 30, opacity: 0 }} transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
            onClick={e => e.stopPropagation()}>
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="font-body text-[11px] font-semibold uppercase tracking-[0.18em] text-primary/80 mb-1.5">{t('cc.kicker')}</p>
                <h2 id="cc-title" className="font-display text-2xl tracking-tight text-foreground leading-tight">
                  {intent.gift ? t('gc.title') : intent.planName} · {intent.priceLabel}
                </h2>
              </div>
              <button onClick={onClose} disabled={busy} className="w-9 h-9 rounded-full hover:bg-muted flex items-center justify-center focus-ring shrink-0" aria-label={t('artifact.close')}>
                <X className="w-4 h-4 text-muted-foreground" />
              </button>
            </div>

            <ul className="mt-5 space-y-2.5 font-body text-[14px] text-foreground/85 leading-relaxed">
              <li className="flex gap-3"><span className="mt-[9px] w-1.5 h-1.5 rounded-full bg-primary/70 shrink-0" />
                {t('cc.p1')}</li>
              <li className="flex gap-3"><span className="mt-[9px] w-1.5 h-1.5 rounded-full bg-primary/70 shrink-0" />
                {t('cc.p2')}</li>
              <li className="flex gap-3"><span className="mt-[9px] w-1.5 h-1.5 rounded-full bg-primary/70 shrink-0" />
                {t('cc.p3')}</li>
            </ul>

            <label className={`mt-5 flex items-start gap-3 p-3.5 rounded-2xl border transition-colors cursor-pointer ${ticked ? 'border-primary/50 bg-primary/5' : 'border-border/40 hover:bg-muted/40'}`}>
              <input type="checkbox" checked={ticked} onChange={e => setTicked(e.target.checked)} className="mt-1 w-4 h-4 accent-[hsl(var(--primary))] shrink-0" />
              <span className="font-body text-[13.5px] text-foreground leading-relaxed">
                {t('cc.waiver')}{' '}
                <Link to="/legal/reembolsos" target="_blank" className="text-primary underline underline-offset-[3px] decoration-primary/40">{t('cc.refunds')}</Link>
                {' '}{t('cc.and')}{' '}
                <Link to="/legal/terminos" target="_blank" className="text-primary underline underline-offset-[3px] decoration-primary/40">{t('cc.terms')}</Link>.
              </span>
            </label>

            {error && <p className="mt-3 font-body text-[13px] text-destructive">{error}</p>}

            <button onClick={confirm} disabled={!ticked || busy}
              className="mt-5 w-full flex items-center justify-center gap-2 py-3.5 rounded-full bg-primary text-primary-foreground font-body text-[14px] font-semibold hover:brightness-110 transition disabled:opacity-45 disabled:cursor-not-allowed focus-ring">
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
              {busy ? t('cc.opening') : t('cc.continue')}
            </button>
            <p className="mt-3 text-center font-body text-[11.5px] text-muted-foreground/60">
              {t('cc.stripe')}
            </p>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default CheckoutConsent;
