import { useEffect, useState } from 'react';
import { Volume2, Square, Loader2 } from 'lucide-react';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import { useLanguage } from '@/contexts/LanguageContext';
import { ttsPlayer, ttsKey, type TtsStatus } from '@/lib/tts';

interface ReadAloudButtonProps {
  messageId: string | number;
  content: string;
  className?: string;
}

/** "Escuchar" action for assistant messages — voice from the backend speech service. */
const ReadAloudButton = ({ messageId, content, className = '' }: ReadAloudButtonProps) => {
  const { t, language } = useLanguage();
  const key = ttsKey(messageId, content);
  const [status, setStatus] = useState<TtsStatus>(() => ttsPlayer.statusFor(key));

  useEffect(() => ttsPlayer.subscribe(key, setStatus), [key]);

  useEffect(() => {
    ttsPlayer.onError = (msg) => {
      if (msg.includes('tts_budget_exhausted')) toast.error(t('cm.listen.limit'));
      else toast.error(t('cm.listen.error'));
    };
  }, [t]);

  const label = status === 'idle' ? t('cm.listen') : status === 'loading' ? t('cm.listen.loading') : t('cm.listen.stop');

  return (
    <motion.button
      type="button"
      onClick={() => ttsPlayer.toggle(key, content, language)}
      whileTap={{ scale: 0.94 }}
      className={`flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-[11px] font-body transition-colors focus-ring hover:bg-muted/40 ${
        status === 'idle' ? 'text-muted-foreground/60 hover:text-primary' : 'text-primary bg-primary/10'
      } ${className}`}
      aria-label={label}
      title={status === 'idle' ? `${label} · Dhisper` : label}
    >
      {status === 'loading' ? (
        <Loader2 className="w-3.5 h-3.5 animate-spin" />
      ) : status === 'playing' ? (
        <span className="relative flex items-center justify-center w-3.5 h-3.5">
          <Square className="w-2.5 h-2.5" fill="currentColor" />
          <motion.span
            className="absolute inset-0 rounded-full border border-primary/50"
            animate={{ scale: [1, 1.7], opacity: [0.7, 0] }}
            transition={{ duration: 1.2, repeat: Infinity, ease: 'easeOut' }}
          />
        </span>
      ) : (
        <Volume2 className="w-3.5 h-3.5" />
      )}
      {label}
    </motion.button>
  );
};

export default ReadAloudButton;
