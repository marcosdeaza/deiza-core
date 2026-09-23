import { useParams, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import AmbientRose from '@/components/deiza/AmbientRose';
import logo from '@/assets/logo.png';
import { Gift, CheckCircle2, XCircle } from 'lucide-react';
import { useState, useEffect } from 'react';
import { authHeaders } from '@/services/api';
import { haptic } from '@/lib/native';

const API_URL = import.meta.env.VITE_API_URL ?? '';

// Floating particle component
const Petal = ({ delay, x, color }: { delay: number; x: number; color: string }) => (
  <motion.div
    className="absolute bottom-0 rounded-full opacity-0 pointer-events-none"
    style={{
      left: `${x}%`,
      width: 8,
      height: 12,
      background: color,
      borderRadius: '50% 50% 50% 50% / 60% 60% 40% 40%',
    }}
    animate={{
      y: [0, -600],
      opacity: [0, 0.8, 0],
      rotate: [0, 180, 360],
      x: [0, (Math.random() - 0.5) * 100],
    }}
    transition={{ duration: 2.5 + Math.random(), delay, ease: 'easeOut' }}
  />
);

const CelebrationParticles = () => {
  const colors = ['#8C2F39', '#c9a96e', '#e8d5b7', '#f0e6d3', '#a67c52'];
  const petals = Array.from({ length: 40 }, (_, i) => ({
    id: i,
    delay: Math.random() * 1.5,
    x: Math.random() * 100,
    color: colors[Math.floor(Math.random() * colors.length)],
  }));
  return (
    <div className="fixed inset-0 pointer-events-none overflow-hidden z-50">
      {petals.map((p) => (
        <Petal key={p.id} delay={p.delay} x={p.x} color={p.color} />
      ))}
    </div>
  );
};

const Redeem = () => {
  const { code } = useParams<{ code: string }>();
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();
  const { t } = useLanguage();
  const [state, setState] = useState<'loading' | 'valid' | 'redeemed' | 'error' | 'success'>('loading');
  const [planKey, setPlanKey] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [claiming, setClaiming] = useState(false);
  const [celebrating, setCelebrating] = useState(false);

  // Always light mode on this page
  useEffect(() => {
    document.documentElement.classList.remove('dark');
    return () => {
      const saved = localStorage.getItem('deiza-dark-mode') !== 'false';
      if (saved) document.documentElement.classList.add('dark');
    };
  }, []);

  useEffect(() => {
    if (!code) {
      setState('error');
      setErrorMsg(t('rd.invalid'));
      return;
    }
    fetch(`${API_URL}/api/gifts/check/${code.toUpperCase()}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.valid) {
          setPlanKey(d.plan);
          setState('valid');
        } else {
          const used = /canjeado|redeemed/i.test(d.error || '');
          setState(used ? 'redeemed' : 'error');
          setErrorMsg(used ? t('rd.used') : t('rd.invalid'));
        }
      })
      .catch(() => {
        setState('error');
        setErrorMsg(t('api.err.network'));
      });
  }, [code, t]);

  const handleClaim = async () => {
    haptic('light');
    if (!isAuthenticated) {
      navigate(`/login?redirect=/redeem/${code}`);
      return;
    }
    setClaiming(true);
    try {
      const r = await fetch(`${API_URL}/api/gifts/redeem`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ code: code?.toUpperCase() }),
      });
      const d = await r.json();
      if (d.success) {
        haptic('success');
        setCelebrating(true);
        setState('success');
      } else {
        haptic('error');
        setErrorMsg(/canjeado|redeemed/i.test(d.error || '') ? t('rd.used') : t('rd.claim.error'));
      }
    } catch {
      haptic('error');
      setErrorMsg(t('api.err.network'));
    } finally {
      setClaiming(false);
    }
  };

  const planNames: Record<string, { label: string; color: string }> = {
    friend: { label: 'Friend', color: 'from-primary/10 to-primary/5' },
    signet: { label: 'Signet', color: 'from-violet-500/10 to-violet-500/5' },
  };
  const planInfo = planNames[planKey] || { label: planKey, color: 'from-muted/60 to-muted/20' };

  return (
    <div className="min-h-[100dvh] bg-background relative overflow-hidden flex flex-col items-center justify-center px-4" style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}>
      <AmbientRose />
      {celebrating && <CelebrationParticles />}

      {/* Logo */}
      <motion.div
        className="absolute left-1/2 -translate-x-1/2 flex items-center gap-2"
        style={{ top: 'calc(env(safe-area-inset-top, 0px) + 24px)' }}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
      >
        <img src={logo} alt="Deiza" className="w-8 h-8 blend-multiply" />
        <span className="font-display text-xl tracking-tight text-foreground">Deiza</span>
      </motion.div>

      <AnimatePresence mode="wait">
        {state === 'loading' && (
          <motion.div
            key="loading"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex flex-col items-center gap-4"
          >
            <motion.div
              className="w-16 h-16 rounded-full border-2 border-primary/30 border-t-primary"
              animate={{ rotate: 360 }}
              transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
            />
            <p className="font-body text-muted-foreground text-sm">{t('rd.checking')}</p>
          </motion.div>
        )}

        {state === 'valid' && (
          <motion.div
            key="valid"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="max-w-md w-full text-center space-y-6"
          >
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: 'spring', delay: 0.2 }}
              className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center mx-auto"
            >
              <Gift className="w-10 h-10 text-primary" />
            </motion.div>
            <div>
              <p className="font-body text-xs text-muted-foreground/60 tracking-widest uppercase mb-2">
                {t('rd.kicker')}
              </p>
              <h1 className="font-display text-4xl tracking-tight text-foreground mb-2">
                {t('rd.plan', { plan: planInfo.label })}
              </h1>
              <p className="font-body text-muted-foreground text-sm">
                {t('rd.desc', { plan: planInfo.label })}
              </p>
            </div>
            <div
              className={`rounded-2xl bg-gradient-to-b ${planInfo.color} border border-border/30 p-5`}
            >
              <p className="font-mono text-xl font-bold tracking-widest text-foreground">
                {code?.toUpperCase()}
              </p>
              <p className="font-body text-xs text-muted-foreground/60 mt-1">
                {t('rd.code.note')}
              </p>
            </div>
            {!isAuthenticated && (
              <p className="font-body text-xs text-muted-foreground/70">
                {t('rd.login.note')}
              </p>
            )}
            <motion.button
              onClick={handleClaim}
              disabled={claiming}
              className="w-full bg-foreground text-background font-body font-semibold rounded-full py-3.5 px-6 hover:bg-foreground/90 transition-colors disabled:opacity-60"
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
            >
              {claiming
                ? t('rd.claiming')
                : isAuthenticated
                ? t('rd.claim')
                : t('rd.login.claim')}
            </motion.button>
            {errorMsg && (
              <p className="font-body text-xs text-red-500">{errorMsg}</p>
            )}
          </motion.div>
        )}

        {state === 'success' && (
          <motion.div
            key="success"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="max-w-md w-full text-center space-y-6"
          >
            <motion.div
              initial={{ scale: 0, rotate: -180 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={{ type: 'spring', stiffness: 200, damping: 10 }}
              className="w-24 h-24 rounded-full bg-green-500/10 flex items-center justify-center mx-auto"
            >
              <CheckCircle2 className="w-12 h-12 text-green-600" />
            </motion.div>
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
            >
              <h1 className="font-display text-4xl tracking-tight text-foreground mb-3">
                {t('rd.success.title')}
              </h1>
              <p className="font-body text-muted-foreground">
                {t('rd.success.desc', { plan: planInfo.label })}
              </p>
            </motion.div>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.6 }}>
              <motion.button
                onClick={() => navigate('/workspace')}
                className="w-full bg-foreground text-background font-body font-semibold rounded-full py-3.5 px-6 hover:bg-foreground/90 transition-colors"
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
              >
                {t('sh.cta')} →
              </motion.button>
            </motion.div>
          </motion.div>
        )}

        {(state === 'redeemed' || state === 'error') && (
          <motion.div
            key="error"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="max-w-md w-full text-center space-y-6"
          >
            <div className="w-20 h-20 rounded-full bg-muted/50 flex items-center justify-center mx-auto">
              <XCircle className="w-10 h-10 text-muted-foreground" />
            </div>
            <div>
              <h1 className="font-display text-3xl tracking-tight text-foreground mb-2">
                {state === 'redeemed' ? t('rd.used.title') : t('rd.invalid.title')}
              </h1>
              <p className="font-body text-muted-foreground text-sm">{errorMsg}</p>
            </div>
            <button
              onClick={() => navigate('/plans')}
              className="font-body text-sm text-primary hover:underline focus-ring rounded"
            >
              {t('ws.plan.viewplans')} →
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default Redeem;
