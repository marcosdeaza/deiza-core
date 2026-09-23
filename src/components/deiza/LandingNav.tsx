import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import logo from '@/assets/logo.png';
import { Menu, X } from 'lucide-react';

const LandingNav = () => {
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();
  const { t } = useLanguage();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const handleSignIn = () => {
    navigate(isAuthenticated ? '/workspace' : '/login');
  };

  return (
    <motion.nav
      className="fixed top-0 left-0 right-0 z-50 bg-background/80 backdrop-blur-md"
      initial={{ y: -20, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.5, ease: 'easeOut' }}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 h-14 sm:h-20 flex items-center justify-between">
        <a href="/" className="flex items-center gap-2 sm:gap-3 focus-ring rounded-lg" aria-label="Deiza home">
          <img src={logo} alt="" className="w-8 h-8 sm:w-14 sm:h-14 blend-multiply" aria-hidden="true" draggable={false} />
          <span className="font-display text-xl sm:text-3xl lg:text-4xl tracking-tight text-foreground">Deiza</span>
        </a>

        {/* Desktop nav — hidden on mobile */}
        <div className="hidden sm:flex items-center gap-4">
          <button onClick={() => navigate('/desktop')} className="font-body text-sm text-muted-foreground hover:text-foreground transition-colors focus-ring rounded px-2 py-1">
            {t('nav.desktop')}
          </button>
          <button onClick={() => navigate('/noticias')} className="font-body text-sm text-muted-foreground hover:text-foreground transition-colors focus-ring rounded px-2 py-1">
            {t('nav.news')}
          </button>
          <button onClick={() => navigate('/docs')} className="font-body text-sm text-muted-foreground hover:text-foreground transition-colors focus-ring rounded px-2 py-1">
            {t('nav.docs')}
          </button>
                    <button
            onClick={handleSignIn}
            className="font-body text-sm font-medium bg-primary text-primary-foreground px-6 py-2.5 rounded-full deiza-shadow hover:bg-primary/90 transition-all focus-ring"
          >
            {t('header.signin')}
          </button>
        </div>

        {/* Mobile hamburger — visible only on mobile */}
        <button
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          className="sm:hidden p-2 rounded-full hover:bg-muted transition-colors focus-ring"
          aria-label={mobileMenuOpen ? 'Close menu' : 'Open menu'}
          aria-expanded={mobileMenuOpen}
        >
          {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </button>
      </div>

      {/* Mobile dropdown menu */}
      <AnimatePresence>
        {mobileMenuOpen && (
          <motion.div
            className="sm:hidden px-4 pb-4 pt-2 bg-background/95 backdrop-blur-md border-t border-border/20"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
          >
            <div className="flex flex-col gap-3">
              <div className="flex items-center gap-4">
                <button onClick={() => { navigate('/desktop'); setMobileMenuOpen(false); }} className="font-body text-sm text-muted-foreground hover:text-foreground focus-ring rounded">{t('nav.desktop')}</button>
                <button onClick={() => { navigate('/noticias'); setMobileMenuOpen(false); }} className="font-body text-sm text-muted-foreground hover:text-foreground focus-ring rounded">{t('nav.news')}</button>
                <button onClick={() => { navigate('/docs'); setMobileMenuOpen(false); }} className="font-body text-sm text-muted-foreground hover:text-foreground focus-ring rounded">{t('nav.docs')}</button>
              </div>
              <div className="flex items-center justify-between">
                                <button
                  onClick={() => { handleSignIn(); setMobileMenuOpen(false); }}
                  className="font-body text-sm font-medium bg-primary text-primary-foreground px-5 py-2.5 rounded-full focus-ring"
                >
                  {t('header.signin')}
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.nav>
  );
};

export default LandingNav;
