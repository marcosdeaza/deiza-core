import heroImg from '@/assets/illustration-hero.png';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import GoogleLoginButton from '@/components/GoogleLoginButton';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';

const LandingHero = () => {
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();
  const { t } = useLanguage();
  const [showLoginDialog, setShowLoginDialog] = useState(false);

  const handleSignIn = () => {
    if (isAuthenticated) {
      navigate('/workspace');
    } else {
      navigate('/login');
    }
  };

  return (
    <>
      <section className="min-h-screen flex items-center justify-center px-4 sm:px-6 pt-14 sm:pt-20">
        <div className="max-w-6xl mx-auto w-full flex flex-col lg:flex-row items-center gap-8 sm:gap-12 lg:gap-20">
          <motion.div
            className="flex-1 space-y-6 sm:space-y-8 text-center lg:text-left"
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, ease: 'easeOut' }}
          >
            <h1 className="font-display text-3xl sm:text-5xl md:text-6xl lg:text-7xl leading-[1.1] tracking-tight text-foreground">
              {t('landing.hero.title')}
            </h1>
            <p className="font-body text-base sm:text-lg text-muted-foreground max-w-md mx-auto lg:mx-0 leading-relaxed">
              {t('landing.hero.subtitle')}
            </p>
            <div className="flex flex-col sm:flex-row items-center gap-4 pt-2 justify-center lg:justify-start">
              <motion.button
                onClick={handleSignIn}
                className="font-body text-base font-medium bg-primary text-primary-foreground px-10 py-4 rounded-full deiza-shadow hover:bg-primary/90 transition-all focus-ring w-full sm:w-auto"
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
              >
                {t('landing.hero.signin')}
              </motion.button>
              <motion.button
                onClick={() => navigate('/search')}
                className="font-body text-sm font-medium text-muted-foreground hover:text-foreground px-6 py-3 rounded-full transition-colors focus-ring"
                whileHover={{ scale: 1.02 }}
              >
                {t('landing.hero.demo')} &rarr;
              </motion.button>
            </div>
          </motion.div>
          <motion.div
            className="flex-1 flex justify-center"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.8, delay: 0.2, ease: 'easeOut' }}
          >
            <img
              src={heroImg}
              alt="Deiza creative studio illustration"
              className="w-full max-w-sm sm:max-w-lg lg:max-w-xl blend-multiply animate-subtle-float"
              loading="eager"
              draggable={false}
            />
          </motion.div>
        </div>
      </section>

      <Dialog open={showLoginDialog} onOpenChange={setShowLoginDialog}>
        <DialogContent className="sm:max-w-md bg-card deiza-border deiza-shadow-lg">
          <DialogHeader>
            <DialogTitle className="font-display text-2xl tracking-tight">{t('auth.welcome')}</DialogTitle>
            <DialogDescription className="font-body text-muted-foreground">
              {t('auth.welcome.desc')}
            </DialogDescription>
          </DialogHeader>
          <div className="py-6">
            <GoogleLoginButton onSuccess={() => setShowLoginDialog(false)} />
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default LandingHero;
