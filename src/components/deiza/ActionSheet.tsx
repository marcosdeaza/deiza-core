import { motion, AnimatePresence } from 'framer-motion';
import { LucideIcon } from 'lucide-react';

export interface ActionSheetAction {
  label: string;
  icon?: LucideIcon;
  destructive?: boolean;
  onClick: () => void;
}

interface ActionSheetProps {
  open: boolean;
  onClose: () => void;
  /** Small title shown at the top (e.g. chat title) */
  title?: string;
  actions: ActionSheetAction[];
  cancelLabel?: string;
}

/**
 * iOS-style bottom action sheet for mobile long-press menus.
 * Slides up from the bottom with a dimmed backdrop; respects safe areas.
 */
const ActionSheet = ({ open, onClose, title, actions, cancelLabel = 'Cancelar' }: ActionSheetProps) => (
  <AnimatePresence>
    {open && (
      <>
        <motion.div
          className="fixed inset-0 z-[90] bg-black/40 backdrop-blur-[2px]"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          onClick={onClose}
          aria-hidden="true"
        />
        <motion.div
          role="menu"
          className="fixed inset-x-0 bottom-0 z-[100] px-3"
          style={{ paddingBottom: 'max(12px, env(safe-area-inset-bottom, 12px))' }}
          initial={{ y: '110%' }} animate={{ y: 0 }} exit={{ y: '110%' }}
          transition={{ type: 'spring', damping: 32, stiffness: 380 }}
        >
          <div className="bg-card rounded-3xl overflow-hidden deiza-shadow-lg deiza-border mb-2">
            {title && (
              <p className="px-5 pt-4 pb-2 font-body text-[11px] text-muted-foreground/70 text-center truncate border-b border-border/15">
                {title}
              </p>
            )}
            {actions.map((a, i) => (
              <button
                key={i}
                role="menuitem"
                onClick={() => { onClose(); a.onClick(); }}
                className={`w-full flex items-center justify-center gap-2.5 px-5 py-4 font-body text-[15px] active:bg-muted/60 transition-colors ${
                  i > 0 || title ? 'border-t border-border/15' : ''
                } ${a.destructive ? 'text-destructive' : 'text-foreground'}`}
              >
                {a.icon && <a.icon className="w-4 h-4 opacity-80" aria-hidden="true" />}
                {a.label}
              </button>
            ))}
          </div>
          <button
            onClick={onClose}
            className="w-full bg-card rounded-3xl px-5 py-4 font-body text-[15px] font-semibold text-foreground active:bg-muted/60 transition-colors deiza-shadow-lg deiza-border"
          >
            {cancelLabel}
          </button>
        </motion.div>
      </>
    )}
  </AnimatePresence>
);

export default ActionSheet;
