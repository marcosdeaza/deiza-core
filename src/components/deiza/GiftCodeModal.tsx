import { motion, AnimatePresence } from 'framer-motion';
import { Gift, Copy, CheckCheck, ExternalLink, X } from 'lucide-react';
import { useState } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';

interface GiftCodeModalProps {
  code: string;
  plan: string;
  redeemUrl: string;
  onClose: () => void;
  language: string;
}

const Petal = ({ delay, x, color }: { delay: number; x: number; color: string }) => (
  <motion.div
    className="absolute bottom-0 rounded-full opacity-0 pointer-events-none"
    style={{ left: `${x}%`, width: 7, height: 11, background: color, borderRadius: '50% 50% 50% 50% / 60% 60% 40% 40%' }}
    animate={{ y: [0, -700], opacity: [0, 0.9, 0], rotate: [0, 180, 360] }}
    transition={{ duration: 2.8, delay, ease: 'easeOut' }}
  />
);

const Confetti = () => {
  const colors = ['#8C2F39', '#c9a96e', '#e8d5b7', '#a67c52', '#d4a853'];
  const items = Array.from({ length: 50 }, (_, i) => ({
    id: i,
    delay: Math.random() * 1.2,
    x: Math.random() * 100,
    color: colors[i % colors.length],
  }));
  return (
    <div className="fixed inset-0 pointer-events-none overflow-hidden z-50">
      {items.map(p => <Petal key={p.id} delay={p.delay} x={p.x} color={p.color} />)}
    </div>
  );
};

const planNames: Record<string, string> = { friend: 'Friend', signet: 'Signet' };

const GiftCodeModal = ({ code, plan, redeemUrl, onClose, language }: GiftCodeModalProps) => {
  const [copiedCode, setCopiedCode] = useState(false);
  const [copiedUrl, setCopiedUrl] = useState(false);
  const planName = planNames[plan] || plan;
  const { t } = useLanguage();
  void language;

  const copyCode = async () => {
    await navigator.clipboard.writeText(code);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  const copyUrl = async () => {
    await navigator.clipboard.writeText(redeemUrl);
    setCopiedUrl(true);
    setTimeout(() => setCopiedUrl(false), 2000);
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <Confetti />
        <motion.div
          className="absolute inset-0 bg-black/40 backdrop-blur-sm"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          onClick={onClose}
        />
        <motion.div
          className="relative z-10 w-full max-w-md bg-background rounded-3xl border border-border/60 shadow-2xl overflow-hidden"
          initial={{ opacity: 0, scale: 0.85, y: 30 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.9 }}
          transition={{ type: 'spring', stiffness: 280, damping: 22 }}
        >
          <div className="bg-gradient-to-br from-primary/15 to-primary/5 px-6 pt-6 pb-5 text-center relative">
            <button
              onClick={onClose}
              className="absolute top-4 right-4 p-1.5 rounded-full hover:bg-muted/60 transition-colors"
            >
              <X className="w-4 h-4 text-muted-foreground" />
            </button>
            <motion.div
              initial={{ scale: 0, rotate: -30 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={{ type: 'spring', delay: 0.15 }}
              className="w-16 h-16 rounded-full bg-primary/20 flex items-center justify-center mx-auto mb-4"
            >
              <Gift className="w-8 h-8 text-primary" />
            </motion.div>
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
              <p className="font-body text-xs text-muted-foreground/60 tracking-widest uppercase mb-1">
                {t('gc.ready')}
              </p>
              <h2 className="font-display text-2xl tracking-tight text-foreground">
                {t('gc.title', { plan: planName })}
              </h2>
              <p className="font-body text-sm text-muted-foreground mt-1">
                {t('gc.share')}
              </p>
            </motion.div>
          </div>

          <div className="px-6 py-5 space-y-4">
            <motion.div
              initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}
              className="bg-muted/50 rounded-2xl border border-border/40 p-4"
            >
              <p className="font-body text-xs text-muted-foreground/60 tracking-widest uppercase mb-2">
                {t('gc.code')}
              </p>
              <div className="flex items-center justify-between gap-3">
                <span className="font-mono text-xl font-bold tracking-widest text-foreground">{code}</span>
                <motion.button
                  onClick={copyCode}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-background border border-border/60 hover:border-primary/40 transition-all text-xs font-body font-medium shrink-0"
                  whileTap={{ scale: 0.94 }}
                >
                  {copiedCode
                    ? <><CheckCheck className="w-3.5 h-3.5 text-green-600" />{t('gc.copied')}</>
                    : <><Copy className="w-3.5 h-3.5" />{t('gc.copy')}</>}
                </motion.button>
              </div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }}
              className="bg-muted/30 rounded-2xl border border-border/30 p-4"
            >
              <p className="font-body text-xs text-muted-foreground/60 tracking-widest uppercase mb-2">
                {t('gc.link')}
              </p>
              <div className="flex items-center justify-between gap-3">
                <span className="font-body text-xs text-muted-foreground truncate">{redeemUrl}</span>
                <div className="flex gap-1.5 shrink-0">
                  <motion.button
                    onClick={copyUrl}
                    className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-background border border-border/60 hover:border-primary/40 transition-all text-xs font-body font-medium"
                    whileTap={{ scale: 0.94 }}
                  >
                    {copiedUrl
                      ? <CheckCheck className="w-3.5 h-3.5 text-green-600" />
                      : <Copy className="w-3.5 h-3.5" />}
                  </motion.button>
                  <motion.a
                    href={redeemUrl} target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-background border border-border/60 hover:border-primary/40 transition-all"
                    whileTap={{ scale: 0.94 }}
                  >
                    <ExternalLink className="w-3.5 h-3.5 text-muted-foreground" />
                  </motion.a>
                </div>
              </div>
            </motion.div>

            <motion.p
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.5 }}
              className="font-body text-xs text-muted-foreground/60 text-center"
            >
              {t('gc.note')}
            </motion.p>

            <motion.button
              onClick={onClose}
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.55 }}
              className="w-full bg-foreground text-background font-body font-semibold rounded-full py-3 hover:bg-foreground/90 transition-colors"
              whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
            >
              {t('gc.done')}
            </motion.button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};

export default GiftCodeModal;
