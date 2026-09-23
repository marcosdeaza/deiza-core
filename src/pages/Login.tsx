import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '@/contexts/AuthContext';
import { api, apiErrorMessage } from '@/services/api';
import logo from '@/assets/logo.png';
import AmbientRose from '@/components/deiza/AmbientRose';
import { toast } from 'sonner';
import { useLanguage } from '@/contexts/LanguageContext';
import { Mail, ArrowRight, Loader2, RotateCcw, ArrowLeft } from 'lucide-react';
import { isNative, isIOS, haptic } from '@/lib/native';

type Step = 'email' | 'otp' | 'verifying';

const RESEND_COOLDOWN = 60; // seconds
/** Sign in with Apple needs the capability in Xcode + a Services ID; flag it on when configured. */
const APPLE_SIGNIN = import.meta.env.VITE_APPLE_SIGNIN === '1';

const AppleMark = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden="true">
    <path d="M16.365 1.43c0 1.14-.417 2.08-1.25 2.86-.997.94-2.2 1.48-3.5 1.38-.07-1.1.4-2.13 1.24-2.94.9-.9 2.14-1.48 3.42-1.56.06.09.09.17.09.26zM20.7 17.24c-.5 1.16-1.1 2.24-1.8 3.24-.98 1.4-1.9 2.38-2.76 2.94-.99.67-2.05 1.02-3.19 1.05-.82 0-1.8-.23-2.95-.7-1.16-.47-2.22-.7-3.2-.7-1.02 0-2.11.23-3.28.7-1.17.47-2.11.72-2.83.74-1.1.05-2.19-.32-3.26-1.1C-.4 22.2-2 18.9-2 15.3c0-2.62.55-4.88 1.66-6.78C.8 6.6 2.7 5.34 5.12 5.3c1 0 2.24.3 3.73.9 1.5.6 2.46.9 2.88.9.31 0 1.36-.35 3.15-1.05 1.7-.65 3.13-.92 4.3-.82 3.18.26 5.56 1.51 7.15 3.77-2.84 1.72-4.25 4.14-4.22 7.24.03 2.42.9 4.43 2.62 6.03z" transform="translate(2 0) scale(.85)" />
  </svg>
);

const Login = () => {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const { isAuthenticated, refreshAuth, loginWithApple } = useAuth();
  const native = isNative();

  // Honor ?redirect= (e.g. /login?redirect=/redeem/CODE) — internal paths only
  const redirectParam = new URLSearchParams(window.location.search).get('redirect');
  const postLoginPath = redirectParam && redirectParam.startsWith('/') && !redirectParam.startsWith('//')
    ? redirectParam
    : '/workspace';

  const [step, setStep] = useState<Step>('email');
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState(['', '', '', '', '', '']);
  const [loading, setLoading] = useState(false);
  const [appleBusy, setAppleBusy] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);
  const cooldownRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // Always-current ref to handleVerify — avoids stale closure inside memoized fillOtp
  const handleVerifyRef = useRef<((code: string) => Promise<void>) | null>(null);

  useEffect(() => {
    if (isAuthenticated) navigate(postLoginPath, { replace: true });
  }, [isAuthenticated, navigate, postLoginPath]);

  // Cooldown countdown
  useEffect(() => {
    if (resendCooldown <= 0) return;
    cooldownRef.current = setInterval(() => {
      setResendCooldown(prev => {
        if (prev <= 1) {
          if (cooldownRef.current) clearInterval(cooldownRef.current);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => { if (cooldownRef.current) clearInterval(cooldownRef.current); };
  }, [resendCooldown]);

  // Fill all OTP boxes at once (paste, iOS code autofill)
  const fillOtp = useCallback((code: string) => {
    const digits = code.slice(0, 6).split('');
    const filled = [...digits, ...Array(6 - digits.length).fill('')];
    setOtp(filled);
    if (digits.length > 0) haptic('selection');
    setTimeout(() => inputRefs.current[Math.min(digits.length - 1, 5)]?.focus(), 50);
    if (digits.length === 6) {
      setTimeout(() => handleVerifyRef.current?.(code), 200);
    }
  }, []);

  const sendOtp = useCallback(async (emailAddr: string) => {
    setLoading(true);
    try {
      const res = await api.requestMagicLink(emailAddr.trim().toLowerCase()) as any;
      if (res.bypass) {
        await refreshAuth();
        haptic('success');
        toast.success(t('lg.welcome'));
        navigate(postLoginPath, { replace: true });
        return;
      }
      haptic('light');
      setStep('otp');
      setResendCooldown(RESEND_COOLDOWN);
      if (res.dev_otp) {
        toast.info(`Dev OTP: ${res.dev_otp}`, { duration: 8000 });
        setTimeout(() => fillOtp(String(res.dev_otp)), 300);
      }
    } catch (err: any) {
      haptic('error');
      toast.error(apiErrorMessage(err, t));
    } finally {
      setLoading(false);
    }
  }, [fillOtp, navigate, refreshAuth, postLoginPath, t]);

  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || loading) return;
    await sendOtp(email);
  };

  const handleResend = async () => {
    if (resendCooldown > 0 || loading) return;
    setOtp(['', '', '', '', '', '']);
    await sendOtp(email);
    toast.success(t('lg.resent'));
  };

  const handleOtpPaste = (e: React.ClipboardEvent) => {
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (pasted.length > 0) {
      e.preventDefault();
      fillOtp(pasted);
    }
  };

  const handleVerify = async (code: string) => {
    if (loading) return;
    setLoading(true);
    setStep('verifying');
    try {
      await api.verifyMagicLink(code, email.trim().toLowerCase());
      await refreshAuth();
      haptic('success');
      toast.success(t('lg.welcome'));
      navigate(postLoginPath, { replace: true });
    } catch (err: any) {
      haptic('error');
      toast.error(apiErrorMessage(err, t, t('lg.otp.wrong')));
      setStep('otp');
      setOtp(['', '', '', '', '', '']);
      setTimeout(() => inputRefs.current[0]?.focus(), 100);
    } finally {
      setLoading(false);
    }
  };
  handleVerifyRef.current = handleVerify;

  const handleApple = async () => {
    if (appleBusy) return;
    setAppleBusy(true);
    haptic('light');
    try {
      const { SignInWithApple } = await import('@capacitor-community/apple-sign-in');
      const res = await SignInWithApple.authorize({
        clientId: 'org.deiza.app', redirectURI: 'https://deiza.org/login', scopes: 'email name',
      });
      const token = res.response?.identityToken;
      if (!token) throw new Error('apple_cancelled');
      await loginWithApple(token, { givenName: res.response?.givenName, familyName: res.response?.familyName });
      haptic('success');
      navigate(postLoginPath, { replace: true });
    } catch (err: any) {
      const m = String(err?.message || err || '');
      if (!/cancel|1001/i.test(m)) { haptic('error'); toast.error(apiErrorMessage(err, t)); }
    } finally {
      setAppleBusy(false);
    }
  };

  const otpValue = otp.join('');

  return (
    <div className="min-h-[100dvh] bg-background flex flex-col relative overflow-hidden">
      <AmbientRose />

      <header className="relative z-10 flex items-center justify-between px-5 sm:px-6 py-4" style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 10px)' } as React.CSSProperties}>
        <button onClick={() => { haptic('light'); navigate(native ? '/workspace' : '/'); }} className="flex items-center gap-3 hover:opacity-70 transition-opacity focus-ring rounded-lg">
          <img src={logo} alt="" className="w-10 h-10 sm:w-12 sm:h-12 blend-multiply" aria-hidden="true" />
          <span className="font-display text-2xl sm:text-3xl tracking-tight text-foreground">Deiza</span>
        </button>
        {native && (
          <button onClick={() => { haptic('light'); navigate('/workspace'); }} className="font-body text-[13px] text-muted-foreground hover:text-foreground px-3 py-2 rounded-full focus-ring">
            {t('lg.demo')}
          </button>
        )}
      </header>

      {/* m-auto on the inner block = true vertical+horizontal centering that still
          scrolls correctly on small screens */}
      <div className="flex-1 overflow-y-auto px-4 relative z-10 flex flex-col" style={{ paddingBottom: 'max(24px, env(safe-area-inset-bottom, 24px))' } as React.CSSProperties}>
      <div className="m-auto w-full py-8">
        <motion.div className="w-full max-w-md mx-auto" initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
          <AnimatePresence mode="wait">

            {/* Step 1: Email */}
            {step === 'email' && (
              <motion.div key="email" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                <div className="text-center mb-10">
                  <h1 className="font-display text-3xl sm:text-4xl tracking-tight text-foreground mb-3">{t('lg.title')}</h1>
                  <p className="font-body text-muted-foreground text-sm sm:text-base">
                    {t('lg.subtitle')}
                  </p>
                </div>
                <form onSubmit={handleEmailSubmit} className="space-y-4">
                  <div className="relative">
                    <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <input
                      type="email" value={email} onChange={e => setEmail(e.target.value)}
                      placeholder={t('lg.email.ph')} required
                      autoComplete="email" inputMode="email" autoCapitalize="none" autoCorrect="off" spellCheck={false}
                      className="w-full pl-11 pr-4 py-4 font-body text-sm bg-card deiza-border rounded-2xl outline-none focus:ring-2 focus:ring-primary/30 transition-all placeholder:text-muted-foreground/50"
                    />
                  </div>
                  <motion.button type="submit" disabled={loading || !email.trim()} whileTap={{ scale: 0.98 }}
                    className="w-full flex items-center justify-center gap-3 bg-primary text-primary-foreground py-4 rounded-2xl font-body text-sm font-medium hover:bg-primary/90 transition-all disabled:opacity-50 focus-ring deiza-shadow">
                    {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <>{t('lg.continue')} <ArrowRight className="w-4 h-4 rtl-flip" /></>}
                  </motion.button>
                </form>

                {native && isIOS() && APPLE_SIGNIN && (
                  <>
                    <div className="flex items-center gap-3 my-6">
                      <span className="flex-1 h-px bg-border/40" />
                      <span className="font-body text-[11px] uppercase tracking-[0.16em] text-muted-foreground/50">{t('lg.or')}</span>
                      <span className="flex-1 h-px bg-border/40" />
                    </div>
                    <motion.button type="button" onClick={handleApple} disabled={appleBusy} whileTap={{ scale: 0.98 }}
                      className="w-full flex items-center justify-center gap-2.5 bg-foreground text-background py-4 rounded-2xl font-body text-sm font-medium hover:opacity-90 transition-all disabled:opacity-60 focus-ring">
                      {appleBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <AppleMark className="w-4 h-4" />}
                      {t('lg.apple')}
                    </motion.button>
                  </>
                )}

                <p className="text-center font-body text-xs text-muted-foreground/60 mt-6">
                  {t('lg.firsttime')}
                </p>
                <p className="text-center font-body text-[11.5px] text-muted-foreground/55 mt-3 leading-relaxed">
                  {t('lg.terms.prefix')}{' '}
                  <Link to="/legal/terminos" className="underline underline-offset-[3px] decoration-muted-foreground/30 hover:text-foreground">{t('lg.terms.terms')}</Link>
                  {' '}{t('lg.terms.and')}{' '}
                  <Link to="/legal/privacidad" className="underline underline-offset-[3px] decoration-muted-foreground/30 hover:text-foreground">{t('lg.terms.privacy')}</Link>.
                </p>
              </motion.div>
            )}

            {/* Step 2: OTP */}
            {step === 'otp' && (
              <motion.div key="otp" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                <div className="text-center mb-8">
                  <h2 className="font-display text-2xl sm:text-3xl tracking-tight text-foreground mb-2">{t('lg.otp.title')}</h2>
                  <p className="font-body text-muted-foreground text-sm">
                    {t('lg.otp.sent')} <strong className="text-foreground/85">{email}</strong>
                  </p>
                </div>

                {/* OTP — single hidden input for iOS SMS/mail autofill, visual boxes on top */}
                <div className="relative flex gap-3 justify-center mb-6" dir="ltr">
                  <input
                    ref={el => { inputRefs.current[0] = el; }}
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    pattern="[0-9]*"
                    maxLength={6}
                    value={otpValue}
                    autoFocus
                    onChange={e => {
                      const val = e.target.value.replace(/\D/g, '').slice(0, 6);
                      fillOtp(val);
                    }}
                    onPaste={handleOtpPaste}
                    className="absolute inset-0 opacity-0 w-full h-full cursor-text z-10"
                    aria-label={t('lg.otp.aria')}
                  />
                  {otp.map((digit, i) => (
                    <div
                      key={i}
                      className={`w-12 h-14 flex items-center justify-center font-display text-xl bg-card deiza-border rounded-xl transition-all pointer-events-none ${
                        otpValue.length === i ? 'ring-2 ring-primary/40' : ''
                      }`}
                    >
                      {digit}
                    </div>
                  ))}
                </div>

                <motion.button
                  onClick={() => handleVerify(otpValue)}
                  disabled={otpValue.length < 6 || loading}
                  whileTap={{ scale: 0.98 }}
                  className="w-full flex items-center justify-center gap-3 bg-primary text-primary-foreground py-4 rounded-2xl font-body text-sm font-medium hover:bg-primary/90 transition-all disabled:opacity-50 focus-ring deiza-shadow"
                >
                  {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : t('lg.otp.verify')}
                </motion.button>

                {/* Resend + change email row */}
                <div className="flex items-center justify-between mt-4 px-1">
                  <button onClick={() => { haptic('light'); setStep('email'); setOtp(['','','','','','']); setResendCooldown(0); }}
                    className="flex items-center gap-1.5 font-body text-sm text-muted-foreground hover:text-primary transition-colors focus-ring">
                    <ArrowLeft className="w-3.5 h-3.5 rtl-flip" />
                    {t('lg.otp.change')}
                  </button>

                  <button
                    onClick={handleResend}
                    disabled={resendCooldown > 0 || loading}
                    className="flex items-center gap-1.5 font-body text-sm text-muted-foreground hover:text-primary transition-colors focus-ring disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    {resendCooldown > 0 ? t('lg.otp.resend.in', { s: resendCooldown }) : t('lg.otp.resend')}
                  </button>
                </div>
              </motion.div>
            )}

            {/* Step 3: Verifying */}
            {step === 'verifying' && (
              <motion.div key="verifying" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="text-center">
                <motion.img
                  src={logo}
                  alt=""
                  className="w-20 h-20 blend-multiply mx-auto mb-6"
                  aria-hidden="true"
                  animate={{ scale: [1, 1.06, 1], opacity: [0.7, 1, 0.7] }}
                  transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
                />
                <p className="font-body text-muted-foreground text-sm">{t('lg.verifying')}</p>
              </motion.div>
            )}

          </AnimatePresence>
        </motion.div>
      </div>
      </div>
    </div>
  );
};

export default Login;
