import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { Plus, FolderOpen, ChevronDown, Settings, LogOut, SquarePen, Sparkles, X } from 'lucide-react';
import type { Chat, Project } from '@/services/api';
import { useLanguage } from '@/contexts/LanguageContext';
import ConversationList from './ConversationList';
import logo from '@/assets/logo.png';
import { isNative, haptic } from '@/lib/native';
import { isDesktopApp } from '@/lib/desktop';
import { desktopLaunchActive } from '@/lib/launch';
import RoseMark from './RoseMark';
import DesktopUpdateRow from './DesktopUpdateRow';

export interface SidebarUsage {
  tokens_used: number;
  token_limit: number;
  tokens_remaining: number;
  exhausted: boolean;
}

interface SidebarContentProps {
  isMobile: boolean;
  user: { name?: string; email?: string; picture?: string; avatar_url?: string } | null;
  userPlan: string;
  planUsage: SidebarUsage | null;
  resetLabel: string | null;
  // conversations
  chats: Chat[];
  currentChatId?: number;
  processingChatIds: Set<number>;
  isChatUnread: (chat: Chat) => boolean;
  editingChatId: number | null;
  editingTitle: string;
  setEditingTitle: (v: string) => void;
  onSelectChat: (chatId: number) => void;
  onStartEdit: (e: React.MouseEvent, chat: Chat) => void;
  onSaveEdit: (chatId: number) => void;
  onCancelEdit: () => void;
  onTogglePin: (e: React.MouseEvent, chatId: number) => void;
  onDeleteChat: (e: React.MouseEvent, chatId: number) => void;
  longPressHandlers?: (chat: Chat) => Record<string, unknown>;
  onNewChat: () => void;
  // projects
  projects: Project[];
  creatingProject: boolean;
  newProjectName: string;
  setNewProjectName: (v: string) => void;
  onSubmitProject: () => void;
  onStartCreateProject: () => void;
  onCancelCreateProject: () => void;
  onOpenProject: (id: number) => void;
  // account
  onLogout: () => void;
  /** '⌘' | 'Ctrl+' | '' (touch) */
  modKey?: string;
}

const PLAN_LABEL: Record<string, string> = { free: 'Free', friend: 'Friend', signet: 'Signet' };

/**
 * Everything inside the sidebar (mobile drawer and desktop column share it):
 * brand + new chat, collapsible projects, grouped conversations, account footer.
 */
const SidebarContent = (p: SidebarContentProps) => {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const native = isNative();
  const [projectsOpen, setProjectsOpen] = useState(() => {
    try { return localStorage.getItem('deiza:sb:projects') !== '0'; } catch { return true; }
  });
  const toggleProjects = () => setProjectsOpen(v => {
    try { localStorage.setItem('deiza:sb:projects', v ? '0' : '1'); } catch { /* noop */ }
    return !v;
  });

  // Launch card for Deiza for desktop (web only, dismissible)
  const [desktopCard, setDesktopCard] = useState(() => {
    if (native || isDesktopApp() || !desktopLaunchActive()) return false;
    try { return localStorage.getItem('deiza:sb:desktop-card') !== '0'; } catch { return true; }
  });
  const hideDesktopCard = () => {
    setDesktopCard(false);
    try { localStorage.setItem('deiza:sb:desktop-card', '0'); } catch { /* noop */ }
  };

  const pct = p.planUsage && p.planUsage.token_limit > 0
    ? Math.min(100, Math.round((p.planUsage.tokens_used / p.planUsage.token_limit) * 100))
    : 0;
  const barTone = p.planUsage?.exhausted ? 'bg-red-400' : pct >= 80 ? 'bg-amber-400' : 'bg-primary';

  return (
    <div className="flex flex-col h-full w-full min-h-0">
      {/* Brand + primary action */}
      <div className={`shrink-0 px-3 ${p.isMobile ? 'pt-[max(14px,env(safe-area-inset-top))]' : 'pt-3'} pb-1`}>
        <div className="flex items-center justify-between px-1 h-9">
          <button onClick={p.onNewChat} className="flex items-center gap-2 focus-ring rounded-lg" aria-label={t('ws.newchat')}>
            <img src={logo} alt="" className="w-7 h-7 blend-multiply" aria-hidden="true" />
            <span className="font-display text-[19px] tracking-tight text-foreground">Deiza</span>
          </button>
        </div>
        <button
          onClick={p.onNewChat}
          className="mt-2 w-full flex items-center gap-2.5 px-3 py-2 rounded-xl bg-primary/[0.09] hover:bg-primary/[0.14] text-foreground transition-colors focus-ring"
        >
          <SquarePen className="w-4 h-4 text-primary" aria-hidden="true" />
          <span className="font-body text-[13px] font-medium">{t('ws.newchat')}</span>
          {!p.isMobile && p.modKey && <kbd className="ml-auto font-body text-[10px] text-muted-foreground/50">{p.modKey}K</kbd>}
        </button>
      </div>

      {/* Projects — compact, collapsible */}
      <div className="shrink-0 px-3 pt-3">
        <button
          onClick={toggleProjects}
          className="w-full flex items-center justify-between px-3 py-1 rounded-lg hover:bg-muted/30 transition-colors focus-ring"
          aria-expanded={projectsOpen}
        >
          <span className="font-body text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground/50">
            {t('ws.projects')}{p.projects.length > 0 && <span className="ml-1.5 text-muted-foreground/35">{p.projects.length}</span>}
          </span>
          <span className="flex items-center gap-1">
            <span
              role="button"
              tabIndex={0}
              onClick={e => { e.stopPropagation(); p.onStartCreateProject(); setProjectsOpen(true); }}
              onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); p.onStartCreateProject(); setProjectsOpen(true); } }}
              className="p-1 rounded-md text-muted-foreground/50 hover:text-primary hover:bg-primary/10 transition-colors"
              aria-label={t('ws.newproject')}
            >
              <Plus className="w-3.5 h-3.5" />
            </span>
            <motion.span animate={{ rotate: projectsOpen ? 0 : -90 }} transition={{ duration: 0.2 }} className="text-muted-foreground/40">
              <ChevronDown className="w-3.5 h-3.5" />
            </motion.span>
          </span>
        </button>
        <AnimatePresence initial={false}>
          {projectsOpen && (
            <motion.div
              key="projects"
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
              className="overflow-hidden"
            >
              <div className="pt-1 space-y-0.5 max-h-40 overflow-y-auto">
                {p.creatingProject && (
                  <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-muted/40">
                    <FolderOpen className="w-3.5 h-3.5 text-primary shrink-0" />
                    <input
                      autoFocus
                      value={p.newProjectName}
                      onChange={e => p.setNewProjectName(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') p.onSubmitProject(); if (e.key === 'Escape') p.onCancelCreateProject(); }}
                      onBlur={p.onSubmitProject}
                      placeholder={t('ws.projectname')}
                      className="flex-1 min-w-0 text-[16px] lg:text-[13px] font-body bg-transparent outline-none text-foreground placeholder:text-muted-foreground/45"
                    />
                  </div>
                )}
                {p.projects.map(pr => (
                  <button
                    key={pr.id}
                    onClick={() => p.onOpenProject(pr.id)}
                    className="w-full flex items-center gap-2.5 px-3 py-[7px] rounded-lg text-left hover:bg-muted/40 transition-colors focus-ring"
                  >
                    <FolderOpen className="w-3.5 h-3.5 text-primary/70 shrink-0" aria-hidden="true" />
                    <span className="flex-1 min-w-0 truncate font-body text-[13px] text-foreground/80">{pr.name}</span>
                    <span className="font-body text-[10px] text-muted-foreground/40 shrink-0">{pr.chat_count}</span>
                  </button>
                ))}
                {p.projects.length === 0 && !p.creatingProject && (
                  <button
                    onClick={p.onStartCreateProject}
                    className="w-full px-3 py-2 rounded-lg text-left font-body text-[12px] text-muted-foreground/50 hover:text-foreground hover:bg-muted/30 transition-colors focus-ring"
                  >
                    {t('ws.firstproject')}
                  </button>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Conversations */}
      <div className="shrink-0 px-6 pt-4 pb-1">
        <span className="font-body text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground/50">{t('ws.conversations')}</span>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto">
        <ConversationList
          chats={p.chats}
          currentChatId={p.currentChatId}
          isMobile={p.isMobile}
          processingChatIds={p.processingChatIds}
          isChatUnread={p.isChatUnread}
          editingChatId={p.editingChatId}
          editingTitle={p.editingTitle}
          setEditingTitle={p.setEditingTitle}
          onSelect={p.onSelectChat}
          onStartEdit={p.onStartEdit}
          onSaveEdit={p.onSaveEdit}
          onCancelEdit={p.onCancelEdit}
          onTogglePin={p.onTogglePin}
          onDelete={p.onDeleteChat}
          longPressHandlers={p.longPressHandlers}
        />
      </div>

      {/* Deiza for desktop */}
      <AnimatePresence>
        {desktopCard && !p.isMobile && (
          <motion.div
            className="shrink-0 mx-3 mb-2 rounded-2xl border border-border/30 bg-muted/25 p-3 relative"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 6 }}
            transition={{ duration: 0.25 }}
          >
            <button onClick={hideDesktopCard} className="absolute top-2 right-2 p-1 rounded-md text-muted-foreground/50 hover:text-foreground hover:bg-muted/60 transition-colors focus-ring" aria-label={t('sb.desktop.hide')} title={t('sb.desktop.hide')}>
              <X className="w-3.5 h-3.5" />
            </button>
            <div className="flex items-center gap-2 pr-6">
              <RoseMark size={18} mode="draw" />
              <span className="font-display text-[14px] text-foreground leading-tight">{t('sb.desktop.title')}</span>
            </div>
            <p className="font-body text-[11.5px] text-muted-foreground leading-snug mt-1.5">{t('sb.desktop.desc')}</p>
            <button
              onClick={() => { haptic('light'); navigate('/desktop'); }}
              className="mt-2.5 w-full px-3 py-1.5 rounded-xl bg-primary/90 hover:bg-primary text-primary-foreground font-body text-xs font-medium transition-colors focus-ring"
            >
              {t('sb.desktop.cta')}
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Account footer */}
      <div className={`shrink-0 px-3 pt-2 border-t border-border/20 ${p.isMobile ? 'pb-[max(12px,env(safe-area-inset-bottom))]' : 'pb-3'}`}>
        <DesktopUpdateRow />
        {p.planUsage && (
          <button
            onClick={() => { haptic('light'); navigate('/plans'); }}
            className="w-full px-2 py-2 rounded-xl hover:bg-muted/30 transition-colors focus-ring text-left"
            title={p.resetLabel && pct > 0 ? `${t('ws.usage.untilreset')} ${p.resetLabel}` : undefined}
          >
            <div className="flex items-center justify-between mb-1.5">
              <span className="flex items-center gap-1.5 font-body text-[11px] font-medium text-foreground/80">
                <Sparkles className="w-3 h-3 text-primary" aria-hidden="true" />
                {PLAN_LABEL[p.userPlan] || p.userPlan}
                {p.userPlan === 'free' && !native && <span className="text-primary/80 ml-1">· {t('ws.upgrade.short')}</span>}
              </span>
              <span className="font-body text-[10.5px] tabular-nums text-muted-foreground/60">
                {pct}%{p.resetLabel && pct > 0 ? ` · ${p.resetLabel}` : ''}
              </span>
            </div>
            <div className="w-full h-[3px] rounded-full bg-muted/60 overflow-hidden">
              <motion.div
                className={`h-full rounded-full ${barTone}`}
                initial={false}
                animate={{ width: `${pct}%` }}
                transition={{ type: 'spring', stiffness: 120, damping: 20 }}
              />
            </div>
          </button>
        )}
        <div className="flex items-center gap-2.5 px-1 pt-2">
          {(p.user?.avatar_url || p.user?.picture) ? (
            <img src={p.user.avatar_url || p.user.picture} alt="" className="w-7 h-7 rounded-full shrink-0 object-cover" referrerPolicy="no-referrer" />
          ) : (
            <div className="w-7 h-7 rounded-full bg-primary/12 flex items-center justify-center shrink-0">
              <span className="font-body text-[11px] font-semibold text-primary">{(p.user?.name || p.user?.email || 'U').charAt(0).toUpperCase()}</span>
            </div>
          )}
          <span className="flex-1 min-w-0 truncate font-body text-[12.5px] text-foreground/80">{p.user?.name || p.user?.email}</span>
          <button onClick={() => { haptic('light'); navigate('/settings'); }} className="p-1.5 rounded-md text-muted-foreground/60 hover:text-foreground hover:bg-muted/50 transition-colors focus-ring" aria-label={t('st.title')} title={t('st.title')}>
            <Settings className="w-4 h-4" />
          </button>
          <button onClick={p.onLogout} className="p-1.5 rounded-md text-muted-foreground/60 hover:text-foreground hover:bg-muted/50 transition-colors focus-ring" aria-label={t('st.logout')} title={t('st.logout')}>
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};

export default SidebarContent;
