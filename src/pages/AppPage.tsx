import { useEffect, useRef } from 'react';
import { motion, useInView } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { Smartphone, Zap, RefreshCw, Download as DownloadIcon, Share, Plus, Check, ArrowLeft, Monitor } from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';
import { usePWA } from '@/hooks/usePWA';
import logo from '@/assets/logo.png';
import AmbientRose from '@/components/deiza/AmbientRose';

const PhoneRoseIllustration = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 320 480" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
    <rect x="60" y="40" width="200" height="400" rx="32" stroke="hsl(354 50% 37%)" strokeWidth="2" fill="none" />
    <rect x="70" y="80" width="180" height="320" rx="4" stroke="hsl(354 50% 37% / 0.3)" strokeWidth="0.5" fill="none" />
    <rect x="120" y="50" width="80" height="6" rx="3" fill="hsl(354 50% 37% / 0.3)" />
    <rect x="120" y="420" width="80" height="4" rx="2" fill="hsl(354 50% 37% / 0.3)" />
    <g transform="translate(160, 240)">
      <ellipse cx="0" cy="-40" rx="35" ry="50" transform="rotate(0)" stroke="hsl(354 50% 37% / 0.5)" strokeWidth="1.5" fill="none" />
      <ellipse cx="0" cy="-40" rx="35" ry="50" transform="rotate(72)" stroke="hsl(354 50% 37% / 0.4)" strokeWidth="1.5" fill="none" />
      <ellipse cx="0" cy="-40" rx="35" ry="50" transform="rotate(144)" stroke="hsl(354 50% 37% / 0.5)" strokeWidth="1.5" fill="none" />
      <ellipse cx="0" cy="-40" rx="35" ry="50" transform="rotate(216)" stroke="hsl(354 50% 37% / 0.4)" strokeWidth="1.5" fill="none" />
      <ellipse cx="0" cy="-40" rx="35" ry="50" transform="rotate(288)" stroke="hsl(354 50% 37% / 0.5)" strokeWidth="1.5" fill="none" />
      <path d="M0,0 C10,-15 20,-10 15,5 C10,20 -5,20 -10,10 C-15,0 -10,-20 5,-25 C20,-30 35,-15 30,5 C25,25 5,35 -15,25 C-35,15 -35,-15 -15,-30" stroke="hsl(354 50% 37%)" strokeWidth="1.8" fill="none" strokeLinecap="round" />
      <circle cx="0" cy="0" r="3" fill="hsl(354 50% 37% / 0.6)" />
    </g>
  </svg>
);

const QRCode = ({ className }: { className?: string }) => (
  <div className={className}>
    <div className="w-40 h-40 bg-white rounded-2xl deiza-border p-3 mx-auto deiza-shadow">
      <svg viewBox="0 0 100 100" className="w-full h-full">
        <rect x="5" y="5" width="25" height="25" rx="2" fill="hsl(354 50% 37%)" />
        <rect x="10" y="10" width="15" height="15" rx="1" fill="white" />
        <rect x="13" y="13" width="9" height="9" rx="1" fill="hsl(354 50% 37%)" />
        <rect x="70" y="5" width="25" height="25" rx="2" fill="hsl(354 50% 37%)" />
        <rect x="75" y="10" width="15" height="15" rx="1" fill="white" />
        <rect x="78" y="13" width="9" height="9" rx="1" fill="hsl(354 50% 37%)" />
        <rect x="5" y="70" width="25" height="25" rx="2" fill="hsl(354 50% 37%)" />
        <rect x="10" y="75" width="15" height="15" rx="1" fill="white" />
        <rect x="13" y="78" width="9" height="9" rx="1" fill="hsl(354 50% 37%)" />
      </svg>
    </div>
    <p className="font-body text-xs text-muted-foreground mt-3 text-center">deiza.org/app</p>
  </div>
);

const IOSStep = ({ step, icon: Icon, text, delay }: { step: number; icon: any; text: string; delay: number }) => (
  <motion.div
    className="flex items-center gap-4 bg-card rounded-2xl px-5 py-4 deiza-border deiza-shadow"
    initial={{ opacity: 0, x: -20 }}
    animate={{ opacity: 1, x: 0 }}
    transition={{ delay, duration: 0.4 }}
  >
    <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
      <span className="font-display text-lg text-primary">{step}</span>
    </div>
    <div className="flex items-center gap-3 flex-1">
      <Icon className="w-5 h-5 text-primary/70 shrink-0" />
      <p className="font-body text-sm text-foreground">{text}</p>
    </div>
  </motion.div>
);

export default function AppPage() {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const { isIOS, isInstallable, isInstalled, isStandalone, promptInstall } = usePWA();

  useEffect(() => {
    const wasDark = document.documentElement.classList.contains('dark');
    document.documentElement.classList.remove('dark');
    return () => {
      if (wasDark || localStorage.getItem('deiza-dark-mode') === 'true') {
        document.documentElement.classList.add('dark');
      }
    };
  }, []);

  useEffect(() => {
    if (isStandalone) {
      navigate('/login', { replace: true });
    }
  }, [isStandalone, navigate]);

  const isMobileUA = /iPhone|iPad|Android/i.test(navigator.userAgent);

  return (
    <div className="min-h-screen bg-background relative" style={{ userSelect: 'none', WebkitUserSelect: 'none' }}>
      <AmbientRose />
      <div className="relative z-10">
        <header className="fixed top-0 left-0 right-0 z-50 bg-background/80 backdrop-blur-md">
          <div className="max-w-6xl mx-auto flex items-center justify-between px-4 sm:px-6 h-16">
            <button
              onClick={() => navigate('/')}
              className="flex items-center gap-2 font-body text-sm text-muted-foreground hover:text-foreground transition-colors focus-ring rounded-lg px-2 py-1"
            >
              <ArrowLeft className="w-4 h-4" />
              <span className="hidden sm:inline">Deiza</span>
            </button>
            <img src={logo} alt="" className="w-8 h-8 blend-multiply" draggable={false} />
            <button
              onClick={() => navigate('/download')}
              className="font-body text-xs text-primary font-medium hover:underline"
            >
              Deiza Code →
            </button>
          </div>
        </header>

        <section className="min-h-[85vh] flex items-center justify-center px-4 sm:px-6 pt-20">
          <div className="max-w-5xl mx-auto flex flex-col lg:flex-row items-center gap-10 lg:gap-16">
            <motion.div
              className="flex-1 space-y-6 text-center lg:text-left"
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, ease: 'easeOut' }}
            >
              <h1 className="font-display text-4xl sm:text-5xl md:text-6xl leading-[1.1] tracking-tight text-foreground">
                {t('app.hero.title')}
              </h1>
              <p className="font-body text-base sm:text-lg text-muted-foreground max-w-md mx-auto lg:mx-0 leading-relaxed">
                {t('app.hero.subtitle')}
              </p>

              <div className="pt-2">
                {isInstalled ? (
                  <div className="inline-flex items-center gap-2 bg-green-500/10 text-green-700 px-6 py-3 rounded-full font-body text-sm font-medium">
                    <Check className="w-5 h-5" />
                    {t('app.install.installed')}
                  </div>
                ) : isInstallable ? (
                  <button
                    onClick={promptInstall}
                    className="font-body text-base font-medium bg-primary text-primary-foreground px-10 py-4 rounded-full deiza-shadow hover:bg-primary/90 transition-all focus-ring inline-flex items-center gap-2"
                  >
                    <DownloadIcon className="w-5 h-5" />
                    {t('app.install.button')}
                  </button>
                ) : isIOS ? (
                  <button
                    onClick={() => document.getElementById('ios-steps')?.scrollIntoView({ behavior: 'smooth' })}
                    className="font-body text-base font-medium bg-primary text-primary-foreground px-10 py-4 rounded-full deiza-shadow hover:bg-primary/90 transition-all focus-ring inline-flex items-center gap-2"
                  >
                    <Smartphone className="w-5 h-5" />
                    {t('app.install.button')}
                  </button>
                ) : null}
              </div>
            </motion.div>

            <motion.div
              className="flex-1 flex justify-center"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.8, delay: 0.2, ease: 'easeOut' }}
            >
              <PhoneRoseIllustration className="w-full max-w-[240px] sm:max-w-[280px] lg:max-w-[320px]" />
            </motion.div>
          </div>
        </section>

        {isIOS && (
          <section id="ios-steps" className="py-16 sm:py-24 px-4 sm:px-6">
            <div className="max-w-md mx-auto space-y-4">
              <h2 className="font-display text-2xl sm:text-3xl text-foreground text-center mb-8">
                {t('app.ios.title')}
              </h2>
              <IOSStep step={1} icon={Share} text={t('app.ios.step1')} delay={0.1} />
              <IOSStep step={2} icon={Plus} text={t('app.ios.step2')} delay={0.2} />
              <IOSStep step={3} icon={Check} text={t('app.ios.step3')} delay={0.3} />
            </div>
          </section>
        )}

        {!isMobileUA && (
          <section className="py-16 sm:py-24 px-4 sm:px-6">
            <div className="max-w-lg mx-auto text-center space-y-6">
              <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto">
                <Monitor className="w-7 h-7 text-primary" />
              </div>
              <h2 className="font-display text-2xl sm:text-3xl text-foreground">
                {t('app.desktop.title')}
              </h2>
              <p className="font-body text-base text-muted-foreground leading-relaxed max-w-sm mx-auto">
                {t('app.desktop.desc')}
              </p>
              <QRCode className="pt-4" />
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
