import { motion, AnimatePresence } from 'framer-motion';
import { useEffect } from 'react';
import { AlertTriangle } from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * In-app confirmation modal — replaces native window.confirm() for a branded,
 * consistent look across web and the iOS app (where window.confirm is ugly/blocking).
 */
const ConfirmDialog = ({
  open, title, message, confirmLabel, cancelLabel,
  destructive = false, onConfirm, onCancel,
}: ConfirmDialogProps) => {
  const { t } = useLanguage();
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
      if (e.key === 'Enter') onConfirm();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onCancel, onConfirm]);

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            className="fixed inset-0 z-[110] bg-black/45 backdrop-blur-sm"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={onCancel} aria-hidden="true"
          />
          <div className="fixed inset-0 z-[111] flex items-center justify-center p-4 pointer-events-none">
            <motion.div
              role="alertdialog" aria-label={title}
              className="pointer-events-auto w-full max-w-sm bg-card rounded-3xl deiza-shadow-lg deiza-border overflow-hidden"
              initial={{ opacity: 0, scale: 0.95, y: 12 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 8 }}
              transition={{ type: 'spring', damping: 28, stiffness: 340 }}
            >
              <div className="p-6 text-center">
                <div className={`w-12 h-12 mx-auto rounded-2xl flex items-center justify-center mb-4 ${
                  destructive ? 'bg-destructive/10' : 'bg-primary/10'
                }`}>
                  <AlertTriangle className={`w-5 h-5 ${destructive ? 'text-destructive' : 'text-primary'}`} />
                </div>
                <h3 className="font-display text-lg text-foreground mb-1.5">{title}</h3>
                {message && (
                  <p className="font-body text-sm text-muted-foreground leading-relaxed">{message}</p>
                )}
              </div>
              <div className="flex border-t border-border/15">
                <button
                  onClick={onCancel}
                  className="flex-1 py-3.5 font-body text-sm text-muted-foreground hover:bg-muted/50 transition-colors focus-ring"
                >
                  {cancelLabel}
                </button>
                <button
                  onClick={onConfirm}
                  autoFocus
                  className={`flex-1 py-3.5 font-body text-sm font-semibold border-l border-border/15 transition-colors focus-ring ${
                    destructive
                      ? 'text-destructive hover:bg-destructive/10'
                      : 'text-primary hover:bg-primary/10'
                  }`}
                >
                  {confirmLabel}
                </button>
              </div>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  );
};

export default ConfirmDialog;
