import { useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, useInView } from 'framer-motion';
import { useLanguage } from '@/contexts/LanguageContext';
import { Link } from 'react-router-dom';
import { LEGAL_DOCS } from '@/data/legal';
import logo from '@/assets/logo.png';
import doorImg from '@/assets/illustration-door.png';

const LandingFooter = () => {
  const navigate = useNavigate();
  const { t, language } = useLanguage();
  const lang = language === 'es' ? 'es' : 'en';
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: '-80px' });

  return (
    <footer className="py-20 sm:py-32 px-4 sm:px-6" ref={ref}>
      <motion.div
        className="max-w-3xl mx-auto text-center space-y-8 sm:space-y-10"
        initial={{ opacity: 0, y: 30 }}
        animate={isInView ? { opacity: 1, y: 0 } : {}}
        transition={{ duration: 0.6, ease: 'easeOut' }}
      >
        <img
          src={doorImg}
          alt=""
          className="w-36 sm:w-48 mx-auto blend-multiply animate-subtle-float"
          loading="lazy"
          aria-hidden="true"
          draggable={false}
        />
        <h2 className="font-display text-3xl sm:text-4xl md:text-5xl tracking-tight text-foreground">
          {t('landing.footer.tagline')}
        </h2>
        <motion.button
          onClick={() => navigate('/workspace')}
          className="font-body text-sm font-medium bg-primary text-primary-foreground px-10 py-4 rounded-full deiza-shadow hover:bg-primary/90 transition-all focus-ring"
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
        >
          {t('landing.footer.cta')}
        </motion.button>
        <div className="pt-12 sm:pt-16 flex items-center justify-center gap-3 opacity-40">
          <img src={logo} alt="" className="w-5 h-5 blend-multiply" aria-hidden="true" draggable={false} />
          <span className="font-body text-xs text-muted-foreground">
            {t('landing.footer.copyright')}
          </span>
        </div>
        <nav aria-label="Legal" className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1.5 pt-2">
          {LEGAL_DOCS.map(d => (
            <Link key={d.slug} to={`/legal/${d.slug}`} className="font-body text-[11.5px] text-muted-foreground/60 hover:text-foreground transition-colors focus-ring rounded">
              {d.title[lang]}
            </Link>
          ))}
          <button onClick={() => window.dispatchEvent(new Event('deiza:open-cookies'))} className="font-body text-[11.5px] text-muted-foreground/60 hover:text-foreground transition-colors focus-ring rounded">
            {t('ck.prefs')}
          </button>
        </nav>
      </motion.div>
    </footer>
  );
};

export default LandingFooter;
