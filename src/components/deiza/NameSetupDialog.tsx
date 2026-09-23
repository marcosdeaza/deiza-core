import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { useLanguage } from '@/contexts/LanguageContext';
import { Moon, Sun } from 'lucide-react';
import logo from '@/assets/logo.png';

interface NameSetupDialogProps {
  open: boolean;
  onClose: () => void;
  onThemeChange?: (dark: boolean) => void;
}

const NameSetupDialog = ({ open, onClose, onThemeChange }: NameSetupDialogProps) => {
  const { t } = useLanguage();
  const { updateName } = useAuth();
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    setLoading(true);
    try {
      await updateName(trimmed);
      // Dark mode only — force it on
      document.documentElement.classList.add('dark');
      localStorage.setItem('deiza-dark-mode', 'true');
      onThemeChange?.(true);
      toast.success('¡Bienvenida a Deiza!');
      onClose();
    } catch {
      toast.error('No se pudo guardar. Inténtalo de nuevo.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop — non-dismissable, dialog is mandatory */}
          <motion.div
            className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[60]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            aria-hidden="true"
          />

          {/* Dialog */}
          <motion.div
            className="fixed inset-0 z-[61] flex items-center justify-center px-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <motion.div
              className="w-full max-w-sm bg-card rounded-3xl p-8 deiza-border deiza-panel-shadow"
              initial={{ scale: 0.94, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.94, y: 12 }}
              transition={{ type: 'spring', damping: 28, stiffness: 280 }}
              role="dialog"
              aria-modal="true"
              aria-labelledby="name-dialog-title"
            >
              {/* Logo */}
              <div className="text-center mb-7">
                <motion.img
                  src={logo}
                  alt=""
                  className="w-16 h-16 blend-multiply mx-auto mb-5"
                  aria-hidden="true"
                  animate={{ scale: [1, 1.04, 1], opacity: [0.8, 1, 0.8] }}
                  transition={{ duration: 2.5, repeat: Infinity, ease: 'easeInOut' }}
                />
                <h2 id="name-dialog-title" className="font-display text-2xl text-foreground tracking-tight mb-2">
                  {t('ns.title')}
                </h2>
                <p className="font-body text-sm text-muted-foreground leading-relaxed">
                  {t('ns.subtitle')}
                </p>
              </div>

              {/* Form */}
              <form onSubmit={handleSubmit} className="space-y-4">
                <input
                  type="text"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder={t('ns.name')}
                  autoFocus
                  maxLength={60}
                  className="w-full px-4 py-3.5 font-body text-sm bg-muted/30 deiza-border rounded-2xl outline-none focus:ring-2 focus:ring-primary/30 transition-all placeholder:text-muted-foreground/40 text-foreground"
                />

                <motion.button
                  type="submit"
                  disabled={!name.trim() || loading}
                  className="w-full py-3.5 bg-primary text-primary-foreground font-body text-sm font-medium rounded-2xl hover:bg-primary/90 transition-all disabled:opacity-50 focus-ring deiza-shadow"
                  whileHover={{ scale: 1.01 }}
                  whileTap={{ scale: 0.98 }}
                >
                  {loading ? t('ns.saving') : t('ns.continue')}
                </motion.button>
              </form>
            </motion.div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};

export default NameSetupDialog;
