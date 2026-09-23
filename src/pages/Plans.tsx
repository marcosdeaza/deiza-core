import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { Check, Minus, ArrowLeft, Zap, Brain, Sparkles, PartyPopper, X, Gift, Copy, CheckCheck, ExternalLink, Gauge, Clock, AlertTriangle } from 'lucide-react';
import AmbientRose from '@/components/deiza/AmbientRose';
import RoseMark from '@/components/deiza/RoseMark';
import GiftCodeModal from '@/components/deiza/GiftCodeModal';
import CheckoutConsent, { type CheckoutIntent } from '@/components/deiza/CheckoutConsent';
import { authHeaders } from '@/services/api';
import { toast } from 'sonner';
import { isNative, haptic } from '@/lib/native';

const API_URL = import.meta.env.VITE_API_URL ?? '';

async function startCheckout(planKey: string): Promise<void> {
  const res = await fetch(`${API_URL}/api/stripe/checkout`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ plan_key: planKey }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
    throw new Error(err.error || `Checkout failed (${res.status})`);
  }
  const data = await res.json();
  if (data.url) {
    window.location.href = data.url;
  } else {
    throw new Error(data.error || 'No checkout URL returned');
  }
}

async function startGiftCheckout(planKey: string): Promise<void> {
  const res = await fetch(`${API_URL}/api/gifts/checkout`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ plan_key: planKey }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
    throw new Error(err.error || `Gift checkout failed`);
  }
  const data = await res.json();
  if (data.url) window.location.href = data.url;
  else throw new Error(data.error || 'No checkout URL');
}

interface UsageData {
  tokens_used: number;
  token_limit: number;
  tokens_remaining: number;
  next_reset: string;
  exhausted: boolean;
}

interface PlanData {
  plan: string;
  usage: UsageData;
  days_remaining: number | null;
  expires_at: string | null;
}

/** Copy lives in i18n under pl.<key>.tagline / desc / f1..f5 / badge */
const plans = [
  { key: 'free', name: 'Free', priceEur: 0, priceLabel: '0€', tone: 'text-muted-foreground', badge: false },
  { key: 'friend', name: 'Friend', priceEur: 4.45, priceLabel: '4,45€', tone: 'text-primary', badge: true },
  { key: 'signet', name: 'Signet', priceEur: 7.75, priceLabel: '7,75€', tone: 'text-amber-400', badge: true },
];

const Plans = () => {
  const { user, isAuthenticated } = useAuth();
  const { language, t } = useLanguage();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [currentPlanKey, setCurrentPlanKey] = useState<string>('free');
  const [daysRemaining, setDaysRemaining] = useState<number | null>(null);
  const [planUsage, setPlanUsage] = useState<UsageData | null>(null);
  const [checkoutLoading, setCheckoutLoading] = useState<string | null>(null);
  const [giftCheckoutLoading, setGiftCheckoutLoading] = useState<string | null>(null);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [giftModal, setGiftModal] = useState<{ code: string; plan: string; redeemUrl: string } | null>(null);

  useEffect(() => {
    if (searchParams.get('success') === 'true') {
      setShowSuccessModal(true);
    }
  }, [searchParams]);

  useEffect(() => {
    if (!isAuthenticated) {
      setCurrentPlanKey('free');
      return;
    }
    fetch(`${API_URL}/api/plan`, { credentials: 'include', headers: authHeaders() })
      .then((res) => (res.ok ? res.json() : null))
      .then((data: PlanData | null) => {
        if (data?.plan) {
          setCurrentPlanKey(data.plan.toLowerCase());
          setDaysRemaining(data.days_remaining ?? null);
        }
        setPlanUsage(data?.usage ?? null);
      })
      .catch(() => {});
  }, [isAuthenticated]);

  const [usageTick, setUsageTick] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setUsageTick(Date.now()), 30000);
    return () => clearInterval(id);
  }, []);

  // Paid plans go through the withdrawal-waiver sheet first (see CheckoutConsent)
  const [consentIntent, setConsentIntent] = useState<CheckoutIntent | null>(null);
  const planMeta = (planKey: string) => {
    const pl = plans.find(x => x.key === planKey);
    return { planName: pl ? pl.name : planKey, priceLabel: pl?.priceLabel || '' };
  };
  const native = isNative();

  const handleCheckout = (planKey: string) => {
    haptic('light');
    if (!isAuthenticated) {
      navigate('/login');
      return;
    }
    setConsentIntent({ planKey, ...planMeta(planKey) });
  };

  const handleGiftCheckout = (planKey: string) => {
    haptic('light');
    if (!isAuthenticated) {
      navigate('/login');
      return;
    }
    setConsentIntent({ planKey, gift: true, ...planMeta(planKey) });
  };

  const runCheckout = async (intent: CheckoutIntent) => {
    if (intent.gift) {
      setGiftCheckoutLoading(intent.planKey);
      try {
        await startGiftCheckout(intent.planKey);
      } catch (e: any) {
        haptic('error');
        toast.error(e?.message || t('api.err.generic'));
        setGiftCheckoutLoading(null);
      }
    } else {
      setCheckoutLoading(intent.planKey);
      try {
        await startCheckout(intent.planKey);
      } catch (e: any) {
        haptic('error');
        toast.error(e?.message || t('api.err.generic'));
        setCheckoutLoading(null);
      }
    }
    setConsentIntent(null);
  };

  const es = language === 'es';
  const pct = planUsage && planUsage.token_limit > 0 ? Math.min(100, Math.round((planUsage.tokens_used / planUsage.token_limit) * 100)) : 0;
  const minsLeft = (() => {
    if (!planUsage || planUsage.tokens_used <= 0) return null;
    if (typeof planUsage.reset_in_seconds === 'number' && planUsage.reset_in_seconds > 0) {
      return Math.max(0, Math.ceil(planUsage.reset_in_seconds / 60));
    }
    if (planUsage.next_reset) {
      const nr = planUsage.next_reset.endsWith('Z') ? planUsage.next_reset : (planUsage.next_reset + 'Z');
      const diff = new Date(nr).getTime() - Date.now();
      return diff > 0 ? Math.ceil(diff / 60000) : null;
    }
    return null;
  })();
  const resetLabel = minsLeft != null ? (minsLeft < 60 ? `${minsLeft}m` : `${Math.floor(minsLeft / 60)}h ${minsLeft % 60}m`) : null;
  const blocked = !!planUsage?.exhausted;
  const fmt = new Intl.NumberFormat(es ? 'es-ES' : 'en-US');

  return (
    <div className="min-h-dvh bg-background text-foreground relative">
      <AmbientRose />

      <header className="sticky top-0 z-30 flex items-center gap-3 px-4 h-[calc(56px+env(safe-area-inset-top,0px))] pt-[env(safe-area-inset-top,0px)] bg-background/85 backdrop-blur-xl border-b border-border/20">
        <button onClick={() => navigate(isAuthenticated ? '/workspace' : '/')} className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-muted/70 transition-colors focus-ring" aria-label={t('pl.back')}>
          <ArrowLeft className="w-5 h-5 text-foreground/70" />
        </button>
        <button onClick={() => navigate('/')} className="flex items-center gap-2 focus-ring rounded-lg">
          <RoseMark size={24} mode="still" />
          <span className="font-display text-lg tracking-tight text-foreground">Deiza</span>
        </button>
        <span className="ml-1 font-body text-[11px] uppercase tracking-[0.16em] text-muted-foreground/50">{t('st.plans.short')}</span>
      </header>

      <main className="relative z-10 mx-auto w-full max-w-5xl px-4 sm:px-6 pb-20">
        <AnimatePresence>
          {showSuccessModal && (
            <motion.div
              initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
              className="mt-6 rounded-2xl border border-primary/30 bg-primary/10 px-5 py-4 flex items-center gap-4"
            >
              <PartyPopper className="w-6 h-6 text-primary shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="font-display text-lg tracking-tight text-foreground">{t('pl.welcome')}</p>
                <p className="font-body text-sm text-muted-foreground">{t('pl.welcome.desc')}</p>
              </div>
              <button onClick={() => setShowSuccessModal(false)} className="font-body text-xs font-semibold bg-primary text-primary-foreground rounded-full px-4 py-2 hover:brightness-110 transition focus-ring shrink-0">
                {t('pl.start')}
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Title */}
        <motion.div className="mt-10 sm:mt-14 max-w-2xl" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}>
          <p className="font-body text-[11px] font-semibold uppercase tracking-[0.18em] text-primary/80 mb-3">{t('st.plans.short')}</p>
          <h1 className="font-display text-[34px] sm:text-5xl leading-[1.05] tracking-tight text-foreground">{t('pl.title')}</h1>
          <p className="font-body text-[15px] sm:text-base text-muted-foreground mt-4 leading-relaxed">{t('pl.subtitle')}</p>
          <ul className="mt-5 flex flex-wrap gap-x-5 gap-y-2">
            {[1, 2, 3].map(n => (
              <li key={n} className="flex items-center gap-2 font-body text-[12.5px] text-foreground/70">
                <span className="h-1 w-1 rounded-full bg-primary" aria-hidden="true" />
                {t(`pl.trust.${n}`)}
              </li>
            ))}
          </ul>
        </motion.div>

        {/* Current usage */}
        {isAuthenticated && planUsage && (
          <motion.section
            className="mt-8 rounded-[22px] border border-border/30 bg-card/60 px-5 py-4 sm:px-6 sm:py-5"
            initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45, delay: 0.1 }}
            aria-label={t('pl.usage.title')}
          >
            <div className="flex items-end justify-between gap-4 flex-wrap">
              <div className="min-w-0">
                <p className="font-body text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground/55">{t('pl.usage.title')}</p>
                <p className="font-display text-2xl tracking-tight text-foreground mt-1 capitalize">
                  {currentPlanKey}
                  {daysRemaining !== null && currentPlanKey !== 'free' && (
                    <span className="font-body text-[12px] text-muted-foreground/70 ml-2 normal-case">{t('pl.daysleft', { n: daysRemaining })}</span>
                  )}
                </p>
              </div>
              <div className="text-right">
                <p className={`font-display text-3xl tracking-tight tabular-nums ${blocked ? 'text-red-400' : 'text-foreground'}`}>{pct}<span className="text-lg text-muted-foreground/60">%</span></p>
                <p className="font-body text-[11px] text-muted-foreground/60">{fmt.format(planUsage.tokens_remaining)} {t('pl.usage.tokensleft')}{resetLabel ? ` · ${t('pl.usage.resetsin').toLowerCase()} ${resetLabel}` : ''}</p>
              </div>
            </div>
            <div className="mt-3 h-1.5 w-full rounded-full bg-muted/60 overflow-hidden">
              <motion.div
                className={`h-full rounded-full ${blocked ? 'bg-red-400' : pct >= 80 ? 'bg-amber-400' : 'bg-primary'}`}
                initial={{ width: 0 }} animate={{ width: `${pct}%` }} transition={{ type: 'spring', stiffness: 90, damping: 20, delay: 0.2 }}
              />
            </div>
            {blocked && <p className="mt-3 font-body text-[12px] text-red-300/90">{t('pl.usage.blocked')}</p>}
          </motion.section>
        )}

        {/* Plans */}
        <div className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-5">
          {plans.map((plan, i) => {
            const isCurrentPlan = currentPlanKey === plan.key;
            const name = plan.name;
            const tagline = t(`pl.${plan.key}.tagline`);
            const desc = t(`pl.${plan.key}.desc`);
            const features = [1, 2, 3, 4, 5].map(i => t(`pl.${plan.key}.f${i}`));
            const badge = plan.badge ? t(`pl.${plan.key}.badge`) : null;
            const renewSoon = isCurrentPlan && plan.priceEur > 0 && daysRemaining !== null && daysRemaining <= 7;
            const highlight = plan.key === 'friend';
            return (
              <motion.article
                key={plan.key}
                className={`relative flex flex-col rounded-[26px] border overflow-hidden ${
                  highlight
                    ? 'bg-card shadow-[0_24px_60px_-28px_hsl(var(--primary)/0.45)] md:-mt-3 md:mb-3'
                    : 'bg-card/70'
                } ${
                  isCurrentPlan ? 'border-primary/50 ring-1 ring-primary/30' : highlight ? 'border-primary/35' : 'border-border/30'
                }`}
                initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45, delay: 0.12 + i * 0.07, ease: [0.16, 1, 0.3, 1] }}
              >
                {highlight && (
                  <div className="absolute inset-x-0 top-0 h-40 pointer-events-none bg-gradient-to-b from-primary/[0.09] to-transparent" aria-hidden="true" />
                )}
                <div className="relative flex items-center justify-between gap-3 px-6 pt-6 min-h-[44px]">
                  <h2 className="font-display text-[26px] leading-none tracking-tight text-foreground">{name}</h2>
                  {(badge || isCurrentPlan || renewSoon) && (
                    <span className={`font-body text-[10px] font-semibold uppercase tracking-[0.12em] rounded-full px-2.5 py-1 whitespace-nowrap shrink-0 ${
                      renewSoon ? 'bg-amber-400 text-amber-950'
                        : isCurrentPlan ? 'bg-primary/15 text-primary'
                        : highlight ? 'bg-primary text-primary-foreground'
                        : 'bg-muted/70 text-foreground/70'
                    }`}>
                      {renewSoon ? t('pl.renewsoon') : isCurrentPlan ? t('pl.yours') : badge}
                    </span>
                  )}
                </div>
                <div className="relative flex flex-col flex-1 px-6 pb-6 pt-2">
                  <span className={`font-body text-[10.5px] font-semibold uppercase tracking-[0.14em] ${plan.tone}`}>{tagline}</span>

                  <p className="mt-5 flex items-baseline gap-1.5 whitespace-nowrap">
                    <span className="font-display text-[52px] leading-none tracking-[-0.03em] text-foreground tabular-nums">
                      {plan.priceEur === 0 ? '0€' : plan.priceLabel}
                    </span>
                    <span className="font-body text-[13px] text-muted-foreground/75">
                      / {t('pl.mo')}
                    </span>
                  </p>

                  <p className="font-body text-[13.5px] text-muted-foreground leading-relaxed mt-4">{desc}</p>

                  <div className="my-5 h-px bg-border/30" aria-hidden="true" />

                  <ul className="space-y-2.5 flex-1">
                    {features.map((f, fi) => (
                      <li key={fi} className="flex items-start gap-3">
                        <span className={`mt-[1px] flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full ${highlight ? 'bg-primary text-primary-foreground' : 'bg-primary/12 text-primary'}`}>
                          <Check className="w-3 h-3" strokeWidth={3} />
                        </span>
                        <span className="font-body text-[13.5px] text-foreground/85 leading-snug">{f}</span>
                      </li>
                    ))}
                  </ul>

                  <div className="mt-6 space-y-2">
                    {isCurrentPlan ? (
                      <>
                        <div className="w-full text-center font-body text-[13px] font-medium text-primary bg-primary/10 rounded-full py-2.5">{t('pl.current')}</div>
                        {renewSoon && (
                          <button onClick={() => handleCheckout(plan.key)} disabled={!!checkoutLoading} className="w-full text-center font-body text-[12px] text-amber-400 hover:text-amber-300 transition-colors py-1 disabled:opacity-60 focus-ring rounded">
                            {t('pl.renew', { days: daysRemaining ?? 0 })}
                          </button>
                        )}
                      </>
                    ) : plan.priceEur === 0 ? (
                      <div className="w-full text-center font-body text-[13px] text-muted-foreground/60 py-2.5">{t('pl.alwaysfree')}</div>
                    ) : native ? (
                      <div className="w-full text-center font-body text-[12px] text-muted-foreground/60 py-2.5 leading-snug">{t('pl.native.note')}</div>
                    ) : (
                      <motion.button
                        onClick={() => handleCheckout(plan.key)}
                        disabled={!!checkoutLoading}
                        className={`w-full text-center font-body text-[13.5px] font-semibold rounded-full py-2.5 transition focus-ring disabled:opacity-60 ${
                          highlight ? 'bg-primary text-primary-foreground hover:brightness-110 shadow-[0_10px_30px_-12px_hsl(var(--primary)/0.7)]' : 'bg-foreground text-background hover:bg-foreground/90'
                        }`}
                        whileTap={!checkoutLoading ? { scale: 0.98 } : {}}
                      >
                        {checkoutLoading === plan.key ? t('pl.redirecting') : isAuthenticated ? t('pl.choose', { name }) : t('pl.signin')}
                      </motion.button>
                    )}
                    {plan.priceEur > 0 && isAuthenticated && !native && (
                      <button
                        onClick={() => handleGiftCheckout(plan.key)}
                        disabled={!!giftCheckoutLoading}
                        className="w-full flex items-center justify-center gap-2 font-body text-[12px] text-muted-foreground hover:text-foreground py-1.5 transition-colors focus-ring rounded disabled:opacity-60"
                      >
                        <Gift className="w-3.5 h-3.5" />
                        {giftCheckoutLoading === plan.key ? t('pl.redirecting') : t('pl.gift')}
                      </button>
                    )}
                  </div>
                </div>
              </motion.article>
            );
          })}
        </div>

        {/* Compare */}
        <motion.section
          className="mt-14"
          initial={{ opacity: 0, y: 12 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: '-60px' }} transition={{ duration: 0.45 }}
        >
          <p className="font-body text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground/55 mb-3">{t('pl.compare')}</p>
          <div className="overflow-x-auto rounded-[22px] border border-border/30 bg-card/50" style={{ contain: 'inline-size' }}>
            <table className="w-full min-w-[520px] font-body text-[13px] border-collapse">
              <thead>
                <tr className="text-left">
                  <th className="px-5 py-4 w-[40%]"><span className="sr-only">{t('pl.compare')}</span></th>
                  {plans.map(p => (
                    <th key={p.key} className={`px-3 py-4 align-bottom ${p.key === 'friend' ? 'bg-primary/[0.06]' : ''}`}>
                      <span className={`block font-display text-[17px] tracking-tight ${currentPlanKey === p.key ? 'text-primary' : 'text-foreground'}`}>{p.name}</span>
                      <span className="block font-body text-[11.5px] font-normal text-muted-foreground/70 mt-0.5 tabular-nums">{p.priceLabel} / {t('pl.mo')}</span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {([
                  [t('pl.cmp.models'), 'Gas 4.5 · Liquid 5', '+ Solid 4.6', '+ Solid 4.6'],
                  [t('pl.cmp.tokens'), '20k', '100k', '300k'],
                  [t('pl.cmp.solid'), '—', '—', '✓'],
                  [t('pl.cmp.images'), '~3', '~16', '~50'],
                  [t('pl.cmp.editing'), '—', '✓', '✓'],
                  [t('pl.cmp.api'), '—', '✓', '✓'],
                  [t('pl.cmp.projects'), '1 · 5', '5 · 20', '25 · 50'],
                  [t('pl.cmp.search'), '✓', '✓', '✓'],
                  [t('pl.cmp.early'), '—', '—', '✓'],
                ] as string[][]).map(([label, ...cells]) => (
                  <tr key={label} className="border-t border-border/20 hover:bg-muted/25 transition-colors">
                    <td className="px-5 py-3 text-foreground/75">{label}</td>
                    {cells.map((c, ci) => (
                      <td key={ci} className={`px-3 py-3 tabular-nums ${ci === 1 ? 'bg-primary/[0.06]' : ''} ${c === '—' || c === '✓' ? '' : 'text-foreground/90'}`}>
                        {c === '✓' ? (
                          <Check className="w-4 h-4 text-primary" strokeWidth={2.5} aria-label="✓" />
                        ) : c === '—' ? (
                          <Minus className="w-4 h-4 text-muted-foreground/30" aria-label="—" />
                        ) : c}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </motion.section>

        {/* FAQ */}
        <motion.section
          className="mt-12 grid grid-cols-1 sm:grid-cols-3 gap-4"
          initial={{ opacity: 0, y: 12 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: '-60px' }} transition={{ duration: 0.45 }}
        >
          {([1, 2, 3].map(i => [t(`pl.faq.q${i}`), t(`pl.faq.a${i}`)])).map(([q, a]) => (
            <div key={q} className="rounded-[20px] border border-border/25 bg-card/40 px-5 py-4">
              <p className="font-display text-[17px] tracking-tight text-foreground">{q}</p>
              <p className="font-body text-[13px] text-muted-foreground leading-relaxed mt-2">{a}</p>
            </div>
          ))}
        </motion.section>
      </main>

      <CheckoutConsent intent={consentIntent} onClose={() => setConsentIntent(null)} onConfirmed={runCheckout} />

      {giftModal && (
        <GiftCodeModal
          code={giftModal.code}
          plan={giftModal.plan}
          redeemUrl={giftModal.redeemUrl}
          onClose={() => setGiftModal(null)}
          language={language}
        />
      )}
    </div>
  );
};

export default Plans;
