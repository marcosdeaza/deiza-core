import { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Pin, PinOff, Pencil, Trash2, Check, X, Loader2, FolderOpen, Search } from 'lucide-react';
import type { Chat } from '@/services/api';
import { useLanguage } from '@/contexts/LanguageContext';

interface ConversationListProps {
  chats: Chat[];
  currentChatId?: number;
  isMobile: boolean;
  processingChatIds: Set<number>;
  isChatUnread: (chat: Chat) => boolean;
  editingChatId: number | null;
  editingTitle: string;
  setEditingTitle: (v: string) => void;
  onSelect: (chatId: number) => void;
  onStartEdit: (e: React.MouseEvent, chat: Chat) => void;
  onSaveEdit: (chatId: number) => void;
  onCancelEdit: () => void;
  onTogglePin: (e: React.MouseEvent, chatId: number) => void;
  onDelete: (e: React.MouseEvent, chatId: number) => void;
  /** Mobile: long-press handlers (rename/delete sheet) */
  longPressHandlers?: (chat: Chat) => Record<string, unknown>;
}

type Bucket = 'pinned' | 'today' | 'yesterday' | 'week' | 'month' | 'older';


function bucketFor(chat: Chat, now: Date): Bucket {
  if (chat.pinned) return 'pinned';
  const d = new Date(chat.updated_at || chat.created_at);
  if (Number.isNaN(d.getTime())) return 'older';
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const t = d.getTime();
  if (t >= startOfToday) return 'today';
  if (t >= startOfToday - 86400000) return 'yesterday';
  if (t >= startOfToday - 6 * 86400000) return 'week';
  if (t >= startOfToday - 30 * 86400000) return 'month';
  return 'older';
}

const ORDER: Bucket[] = ['pinned', 'today', 'yesterday', 'week', 'month', 'older'];

/**
 * Sidebar conversation list — grouped by recency, quiet
 * typography, actions revealed on hover (desktop) or long-press (mobile).
 */
const ConversationList = ({
  chats, currentChatId, isMobile, processingChatIds, isChatUnread,
  editingChatId, editingTitle, setEditingTitle,
  onSelect, onStartEdit, onSaveEdit, onCancelEdit, onTogglePin, onDelete, longPressHandlers,
}: ConversationListProps) => {
  const { t } = useLanguage();
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return chats;
    return chats.filter(c => (c.title || '').toLowerCase().includes(q));
  }, [chats, query]);

  const groups = useMemo(() => {
    const now = new Date();
    const map = new Map<Bucket, Chat[]>();
    for (const c of filtered) {
      const b = bucketFor(c, now);
      if (!map.has(b)) map.set(b, []);
      map.get(b)!.push(c);
    }
    return ORDER.filter(b => map.has(b)).map(b => ({ bucket: b, items: map.get(b)! }));
  }, [filtered]);

  if (chats.length === 0) {
    return (
      <p className="text-xs text-muted-foreground/55 font-body px-3 py-6 text-center leading-relaxed">
        {t('ws.noconversations')}
      </p>
    );
  }

  return (
    <div className="px-2 pb-4">
      {/* Quick filter — appears once there is something worth searching */}
      {chats.length > 6 && (
        <label className="relative block mx-1 mb-2">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground/50 pointer-events-none" aria-hidden="true" />
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder={t('cl.search')}
            className="w-full pl-8 pr-7 py-1.5 rounded-lg bg-muted/40 hover:bg-muted/60 focus:bg-muted/60 border border-transparent focus:border-border/50 outline-none font-body text-[16px] lg:text-[13px] text-foreground placeholder:text-muted-foreground/45 transition-colors"
            aria-label={t('cl.search')}
          />
          {query && (
            <button onClick={() => setQuery('')} className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 rounded text-muted-foreground/60 hover:text-foreground focus-ring" aria-label={t('st.clear')}>
              <X className="w-3 h-3" />
            </button>
          )}
        </label>
      )}
      {filtered.length === 0 && (
        <p className="text-xs text-muted-foreground/55 font-body px-3 py-4 text-center">{t('cl.noresults')}</p>
      )}
      {groups.map(({ bucket, items }, gi) => (
        <motion.section
          key={bucket}
          className={gi === 0 ? '' : 'mt-3'}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25, delay: Math.min(gi * 0.04, 0.2) }}
        >
          <h3 className="px-3 pb-1 font-body text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground/45 select-none">
            {t(`cl.bucket.${bucket}`)}
          </h3>
          <AnimatePresence initial={false}>
            {items.map(chat => {
              const active = currentChatId === chat.id;
              const editing = editingChatId === chat.id;
              const busy = processingChatIds.has(chat.id);
              const unread = !active && isChatUnread(chat);
              return (
                <motion.div
                  key={chat.id}
                  layout="position"
                  initial={{ opacity: 0, x: -6 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -6, transition: { duration: 0.15 } }}
                  transition={{ type: 'spring', stiffness: 500, damping: 40, mass: 0.6 }}
                  onClick={() => !editing && onSelect(chat.id)}
                  className={`press group relative w-full flex items-center gap-2 pl-3 pr-2 py-[7px] rounded-lg cursor-pointer select-none transition-colors ${
                    active ? 'bg-muted/70 text-foreground' : 'text-foreground/70 hover:bg-muted/40 hover:text-foreground'
                  }`}
                  {...(isMobile && longPressHandlers ? longPressHandlers(chat) : {})}
                >
                  {/* Active indicator — a thin ink mark instead of a tinted block */}
                  {active && (
                    <motion.span
                      layoutId="conv-active-mark"
                      className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-4 rounded-full bg-primary"
                      transition={{ type: 'spring', stiffness: 500, damping: 40 }}
                      aria-hidden="true"
                    />
                  )}

                  {busy ? (
                    <Loader2 className="w-3.5 h-3.5 shrink-0 text-primary animate-spin" aria-label={t('cl.generating')} />
                  ) : chat.project_id ? (
                    <FolderOpen className="w-3.5 h-3.5 shrink-0 text-primary/60" aria-hidden="true" />
                  ) : null}

                  {editing ? (
                    <input
                      autoFocus
                      value={editingTitle}
                      onChange={e => setEditingTitle(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter') onSaveEdit(chat.id);
                        if (e.key === 'Escape') onCancelEdit();
                      }}
                      onClick={e => e.stopPropagation()}
                      className="flex-1 min-w-0 text-[13px] font-body bg-transparent outline-none border-b border-primary/40 text-foreground"
                    />
                  ) : (
                    <span className={`flex-1 min-w-0 truncate font-body text-[13px] leading-5 ${active ? 'font-medium' : ''}`}>
                      {chat.title}
                    </span>
                  )}

                  {unread && !editing && (
                    <span className="w-1.5 h-1.5 rounded-full bg-primary shrink-0" title={t('cl.new')} />
                  )}

                  {editing ? (
                    <span className="flex items-center gap-0.5 shrink-0">
                      <button onClick={e => { e.stopPropagation(); onSaveEdit(chat.id); }} className="p-1 rounded-md hover:bg-muted text-primary focus-ring" aria-label={t('st.save')}>
                        <Check className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={e => { e.stopPropagation(); onCancelEdit(); }} className="p-1 rounded-md hover:bg-muted text-muted-foreground focus-ring" aria-label={t('ws.cancel')}>
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </span>
                  ) : !isMobile ? (
                    <span className="flex items-center gap-0.5 shrink-0 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
                      <button onClick={e => onStartEdit(e, chat)} className="p-1 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground focus-ring" aria-label={t('ws.rename')} title={t('ws.rename')}>
                        <Pencil className="w-3 h-3" />
                      </button>
                      <button onClick={e => onTogglePin(e, chat.id)} className="p-1 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground focus-ring" aria-label={chat.pinned ? t('ws.unpin') : t('ws.pin')} title={chat.pinned ? t('ws.unpin') : t('ws.pin')}>
                        {chat.pinned ? <PinOff className="w-3 h-3" /> : <Pin className="w-3 h-3" />}
                      </button>
                      <button onClick={e => onDelete(e, chat.id)} className="p-1 rounded-md hover:bg-destructive/10 text-muted-foreground hover:text-destructive focus-ring" aria-label={t('ws.delete')} title={t('ws.delete')}>
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </span>
                  ) : chat.pinned ? (
                    <Pin className="w-3 h-3 shrink-0 text-muted-foreground/40" aria-hidden="true" />
                  ) : null}
                </motion.div>
              );
            })}
          </AnimatePresence>
        </motion.section>
      ))}
    </div>
  );
};

export default ConversationList;
