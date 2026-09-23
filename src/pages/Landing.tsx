import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLanguage } from "@/contexts/LanguageContext";
import { useAuth } from "@/contexts/AuthContext";
import LandingNav from "@/components/deiza/LandingNav";
import LandingHero from "@/components/deiza/LandingHero";
import LandingSection from "@/components/deiza/LandingSection";
import LandingFooter from "@/components/deiza/LandingFooter";
import AmbientRose from "@/components/deiza/AmbientRose";

import { Smartphone, Palette, Sparkles } from 'lucide-react';
import { motion, useInView } from 'framer-motion';
import { usePWA } from '@/hooks/usePWA';
import synthesisImg from "@/assets/illustration-synthesis.png";
import artifactImg from "@/assets/illustration-artifact.png";
import memoryImg from "@/assets/illustration-memory.png";
import ethicsImg from "@/assets/illustration-ethics.png";

const Landing = () => {
  const { t } = useLanguage();
  const { isAuthenticated, loading } = useAuth();
  const navigate = useNavigate();
  const { isStandalone } = usePWA();
  const isMobileUA = /iPhone|iPad|Android/i.test(navigator.userAgent);
  const appCtaRef = useRef(null);
  const appCtaInView = useInView(appCtaRef, { once: true, margin: '-80px' });

  // Landing page NEVER shows dark mode
  useEffect(() => {
    const wasDark = document.documentElement.classList.contains('dark');
    document.documentElement.classList.remove('dark');
    return () => {
      if (wasDark || localStorage.getItem('deiza-dark-mode') === 'true') {
        document.documentElement.classList.add('dark');
      }
    };
  }, []);

  // Standalone PWA → skip landing, go to login
  useEffect(() => {
    if (isStandalone) {
      navigate('/login', { replace: true });
    }
  }, [isStandalone, navigate]);

  useEffect(() => {
    if (!loading && isAuthenticated) {
      navigate('/workspace', { replace: true });
    }
  }, [isAuthenticated, loading, navigate]);

  return (
    <div
      className="min-h-screen bg-background relative overflow-x-hidden w-full"
      style={{ userSelect: 'none', WebkitUserSelect: 'none' }}
      onDragStart={e => e.preventDefault()}
    >
      <AmbientRose />
      <div className="relative z-10">
        <LandingNav />
        <LandingHero />

        <LandingSection
          title={t('landing.section1.title')}
          description={t('landing.section1.desc')}
          image={synthesisImg}
          imageAlt="Synthesis from chaos"
        />

        <LandingSection
          title={t('landing.section2.title')}
          description={t('landing.section2.desc')}
          image={artifactImg}
          imageAlt="Artifact Studio"
          reverse
        />

        <LandingSection
          title={t('landing.section3.title')}
          description={t('landing.section3.desc')}
          image={memoryImg}
          imageAlt="Infinite memory"
        />

        <LandingSection
          title={t('landing.section4.title')}
          description={t('landing.section4.desc')}
          image={ethicsImg}
          imageAlt="Ethical AI balance"
          reverse
        />

        {/* Deiza Design — creative editor */}
        <section className="py-16 sm:py-28 px-4 sm:px-6 overflow-x-hidden">
          <div className="max-w-6xl mx-auto w-full">
            <motion.div
              className="rounded-3xl bg-card/60 p-8 sm:p-12 text-center space-y-5 relative overflow-hidden"
              style={{ border: '0.5px solid hsl(var(--primary) / 0.2)' }}
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-80px' }}
              transition={{ duration: 0.55, ease: 'easeOut' }}
            >
              <div
                className="absolute -top-24 left-1/2 -translate-x-1/2 w-72 h-72 rounded-full"
                style={{ background: 'radial-gradient(ellipse at center, hsl(var(--primary) / 0.12) 0%, transparent 70%)' }}
                aria-hidden="true"
              />
              <div className="relative flex justify-center">
                <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center">
                  <Palette className="w-7 h-7 text-primary" />
                </div>
              </div>
              <h2 className="relative font-display text-3xl sm:text-4xl md:text-5xl leading-[1.15] tracking-tight text-foreground">
                {t('design.section.title')}
              </h2>
              <p className="relative font-body text-base sm:text-lg text-muted-foreground max-w-xl mx-auto leading-relaxed">
                {t('design.section.desc')}
              </p>
              <div className="relative flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
                <motion.button
                  onClick={() => navigate('/workspace')}
                  className="font-body text-base font-medium bg-primary text-primary-foreground px-9 py-3.5 rounded-full deiza-shadow hover:bg-primary/90 transition-all focus-ring w-full sm:w-auto"
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                >
                  <span className="flex items-center gap-2 justify-center">
                    <Sparkles className="w-4 h-4" />
                    {t('design.section.cta')}
                  </span>
                </motion.button>
                <span className="font-body text-xs text-muted-foreground/60">
                  {t('design.section.cta.note')}
                </span>
              </div>
            </motion.div>
          </div>
        </section>

        {/* Mobile app install CTA */}
        {isMobileUA && (
          <section className="py-20 sm:py-28 px-4 sm:px-6" ref={appCtaRef}>
            <motion.div
              className="max-w-lg mx-auto text-center space-y-6"
              initial={{ opacity: 0, y: 30 }}
              animate={appCtaInView ? { opacity: 1, y: 0 } : {}}
              transition={{ duration: 0.6, ease: 'easeOut' }}
            >
              <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto">
                <Smartphone className="w-8 h-8 text-primary" />
              </div>
              <h2 className="font-display text-3xl sm:text-4xl leading-[1.15] tracking-tight text-foreground">
                {t('app.landing.cta')}
              </h2>
              <p className="font-body text-base text-muted-foreground max-w-sm mx-auto leading-relaxed">
                {t('app.landing.desc')}
              </p>
              <motion.button
                onClick={() => navigate('/app')}
                className="font-body text-base font-medium bg-primary text-primary-foreground px-10 py-4 rounded-full deiza-shadow hover:bg-primary/90 transition-all focus-ring"
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
              >
                <span className="flex items-center gap-2 justify-center">
                  <Smartphone className="w-5 h-5" />
                  {t('app.landing.cta')}
                </span>
              </motion.button>
            </motion.div>
          </section>
        )}

        <LandingFooter />
      </div>
    </div>
  );
};

export default Landing;
