import { useNavigate, useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useLanguage } from '@/contexts/LanguageContext';
import RoseMark from '@/components/deiza/RoseMark';

const EASE = [0.16, 1, 0.3, 1] as const;

const NotFound = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { t } = useLanguage();
  const attempted = location.pathname;
  // The rose stands in for the 0; sized to the numerals' cap height
  const roseSize = typeof window !== 'undefined' && window.matchMedia('(min-width: 640px)').matches ? 164 : 114;

  return (
    <div className="min-h-dvh bg-background flex flex-col items-center justify-center px-6 relative overflow-hidden">

      <motion.div
        className="relative z-10 flex flex-col items-center text-center max-w-md"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.5 }}
      >
        {/* 4 · rose · 4 */}
        <motion.div
          className="flex items-center justify-center font-display leading-none text-foreground select-none text-[9rem] sm:text-[13rem] tracking-tight"
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, ease: EASE }}
          aria-label="404"
          role="img"
        >
          <span aria-hidden="true">4</span>
          <span aria-hidden="true" className="mx-[0.04em] translate-y-[0.13em]">
            <RoseMark size={roseSize} mode="draw" breathe />
          </span>
          <span aria-hidden="true">4</span>
        </motion.div>

        <motion.div
          className="mt-6 sm:mt-8 w-full"
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.25, ease: 'easeOut' }}
        >
          <div className="mx-auto mb-6 h-px w-16 bg-border/60" aria-hidden="true" />

          <h1 className="font-display text-[1.7rem] sm:text-[2.1rem] text-foreground tracking-tight leading-tight">
            {t('notfound.title')}
          </h1>

          <p className="font-body text-[15px] text-muted-foreground leading-relaxed max-w-[300px] mx-auto mt-3">
            {t('notfound.desc')}
          </p>

          {attempted && attempted.length > 1 && (
            <p className="mt-4 font-mono text-[11px] text-muted-foreground/60 truncate max-w-[280px] mx-auto">
              {attempted}
            </p>
          )}

          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-7">
            <motion.button
              onClick={() => navigate('/')}
              className="w-full sm:w-auto px-8 py-3 bg-primary text-primary-foreground font-body text-sm font-medium rounded-full hover:brightness-110 transition focus-ring shadow-[0_10px_30px_-12px_hsl(var(--primary)/0.7)]"
              whileTap={{ scale: 0.97 }}
            >
              {t('notfound.cta')}
            </motion.button>

            <motion.button
              onClick={() => navigate(-1)}
              className="w-full sm:w-auto px-8 py-3 font-body text-sm text-muted-foreground hover:text-foreground border border-border/40 hover:border-border/70 rounded-full transition focus-ring"
              whileTap={{ scale: 0.97 }}
            >
              {t('common.back')}
            </motion.button>
          </div>
        </motion.div>
      </motion.div>

      <p
        className="absolute bottom-[calc(1.5rem+env(safe-area-inset-bottom,0px))] font-body text-[10px] text-muted-foreground/40 tracking-[0.2em] uppercase select-none"
        aria-hidden="true"
      >
        Deiza · {new Date().getFullYear()}
      </p>
    </div>
  );
};

export default NotFound;
