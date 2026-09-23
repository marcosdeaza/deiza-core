import { useState, useEffect, useLayoutEffect, useRef, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { motion, AnimatePresence, useMotionValue, useTransform, animate as motionAnimate } from 'framer-motion';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels';
import NameSetupDialog from '@/components/deiza/NameSetupDialog';

import { api, Chat, Project, authHeaders, apiErrorMessage } from '@/services/api';
import { isNative, shareText, haptic as nativeHaptic } from '@/lib/native';
import ProjectPanel from '@/components/deiza/ProjectPanel';
import logo from '@/assets/logo.png';

const MOBILE_SIDEBAR_W = 292; // px — sidebar width on mobile

// Extract an artifact spec from a stored message's content (```artifact ... ```).
// Used when reloading old messages where msg.artifact wasn't persisted.
function _extractArtifactFromContent(content: string): { name: string; type: string; content: string } | null {
  return extractArtifact(content || '');
}
import ChatMessage from '@/components/deiza/ChatMessage';
import { extractArtifact, findArtifactBlock, parseArtifactSpec } from '@/lib/artifactBlock';
import ChatInput from '@/components/deiza/ChatInput';
import ArtifactPanel from '@/components/deiza/ArtifactPanel';
import AmbientRose from '@/components/deiza/AmbientRose';
import DeizaLoader from '@/components/deiza/DeizaLoader';
import { toast } from 'sonner';
import { LogOut, Plus, Trash2, MessageSquare, PanelLeftOpen, PanelLeftClose, Pencil, Check, X, Moon, Sun, Sparkles, Loader2, Settings, FolderOpen, Folder, Pin, PinOff, Share2, Palette, Search, Code2, ArrowDown, BookOpen, MonitorDown } from 'lucide-react';
import ActionSheet from '@/components/deiza/ActionSheet';
import ConfirmDialog from '@/components/deiza/ConfirmDialog';
import SidebarContent from '@/components/deiza/SidebarContent';
import AnnouncementModal, { announcementSeen, markAnnouncementSeen } from '@/components/deiza/AnnouncementModal';
import { desktopBridge, isDesktopApp } from '@/lib/desktop';
import { type ModelKey } from '@/components/deiza/ModelSelector';
import { useKeyboardAvoid } from '@/hooks/useKeyboardAvoid';
import { useHaptics } from '@/hooks/useHaptics';
import { syncMemoryFromServer, extractAndStoreMemory } from '@/lib/memory';

const API_URL = import.meta.env.VITE_API_URL ?? '';

interface Message {
  id: number;
  role: 'user' | 'assistant';
  content: string;
  artifact?: { name: string; type: string; content?: string };
  attachedFiles?: Array<{ name: string; mime_type?: string; is_image?: boolean; raw_bytes?: string; url?: string }>;
  images?: Array<{ url: string; alt: string; source?: string; caption?: string }>;
  sources?: Array<{ title: string; url: string; domain: string }>;
  /** Inline error card (kept in the thread so the user's message never vanishes) */
  error?: boolean;
  retryOf?: string;
  /** The user pressed Stop: partial answer kept */
  stopped?: boolean;
  /** Loaded from the server (chat switch / refresh): shown at once, no entry animation */
  fromHistory?: boolean;
}

const DEMO_MAX_MESSAGES = 5;

/* ── Rotating sample prompts shown as the empty-state subtitle (fades between phrases) ── */
const SAMPLE_PROMPTS: Record<string, string[]> = {
  es: [
    'Busca noticias sobre la bolsa de valores hoy',
    'Resume en un PDF las noticias de hoy',
    'Genera una imagen de un bosque al amanecer',
    'Créame una landing page para mi negocio',
    'Explícame la teoría de la relatividad sin tecnicismos',
    'Hazme un plan de entrenamiento de 5 días',
    'Edita esta foto y cámbiame el fondo',
    'Escribe un correo formal para pedir vacaciones',
    'Dame 10 ideas de nombres para una marca de café',
    'Resuelve esta integral paso a paso',
    'Tradúceme este texto al inglés y al francés',
    'Crea una tabla comparativa de los iPhone actuales',
    'Hazme un test de 10 preguntas sobre historia',
    'Diseña el logo de una startup de tecnología',
    'Resume este PDF que te voy a subir',
    'Escríbeme un guion para un vídeo de YouTube',
    'Convierte mis apuntes en un esquema bonito',
    'Dame una receta sana con lo que tengo en la nevera',
    'Programa una calculadora en HTML y CSS',
    'Explica cómo funciona blockchain con un ejemplo',
    'Hazme un horario de estudio para los exámenes',
    'Genera un póster minimalista para un concierto',
    'Corrige y mejora la redacción de mi texto',
    'Busca los mejores destinos baratos para viajar',
    'Crea un CV profesional en PDF con mis datos',
    'Dame argumentos a favor y en contra del teletrabajo',
    'Hazme un cuento corto para dormir a un niño',
    'Analiza este código y dime cómo optimizarlo',
  ],
  en: [
    'Search for today’s stock market news',
    'Summarize today’s headlines into a PDF',
    'Generate an image of a forest at sunrise',
    'Build me a landing page for my business',
    'Explain relativity without the jargon',
    'Make me a 5-day workout plan',
    'Edit this photo and change the background',
    'Write a formal email to request time off',
    'Give me 10 brand name ideas for a coffee shop',
    'Solve this integral step by step',
    'Translate this text to Spanish and French',
    'Create a comparison table of current iPhones',
    'Make a 10-question history quiz',
    'Design a logo for a tech startup',
    'Summarize this PDF I’m about to upload',
    'Write a script for a YouTube video',
    'Turn my notes into a clean outline',
    'Give me a healthy recipe with what’s in my fridge',
    'Code a calculator in HTML and CSS',
    'Explain how blockchain works with an example',
    'Make me a study schedule for exams',
    'Generate a minimalist poster for a concert',
    'Proofread and improve my writing',
    'Find the best cheap travel destinations',
    'Create a professional CV as a PDF from my details',
    'Give me arguments for and against remote work',
    'Write a short bedtime story for a kid',
    'Review this code and tell me how to optimize it',
  ],
};

/** Greeting: depends on the hour and rotates between a few phrasings (all languages). */
function pickGreeting(t: (k: string, p?: Record<string, string | number>) => string, name: string, seed: number): string {
  const h = new Date().getHours();
  const slot = h < 6 ? 'night' : h < 13 ? 'morning' : h < 20 ? 'afternoon' : 'evening';
  const idx = 1 + (Math.floor(seed * 3) % 3);
  return t(`ws.greet.${slot}.${idx}`, { name });
}

const SamplePromptCarousel = ({ lang, onPick }: { lang: string; onPick?: (phrase: string) => void }) => {
  const { t } = useLanguage();
  const deck = useRef<string[]>([]);
  const pos = useRef(0);
  const [phrase, setPhrase] = useState('');
  useEffect(() => {
    const pool = SAMPLE_PROMPTS[lang] || [1, 2, 3, 4, 5, 6, 7, 8].map(i => t(`ws.sample.${i}`));
    const shuffle = () => {
      const a = [...pool];
      for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
      deck.current = a; pos.current = 0;
    };
    shuffle();
    setPhrase(deck.current[0]);
    const interval = setInterval(() => {
      pos.current += 1;
      if (pos.current >= deck.current.length) shuffle();
      setPhrase(deck.current[pos.current]);
    }, 5200);
    return () => clearInterval(interval);
    // `t` changes identity once the lazy dictionary lands, so the pool re-shuffles in the right language.
  }, [lang, t]);
  return (
    <button
      type="button"
      onClick={() => { if (phrase) { nativeHaptic('light'); onPick?.(phrase); } }}
      className="group relative max-w-full px-3 py-1.5 rounded-full font-body text-[13px] sm:text-sm text-muted-foreground/70 hover:text-foreground hover:bg-muted/40 transition-colors focus-ring overflow-hidden"
      aria-label={phrase}
    >
      <span className="text-muted-foreground/45 group-hover:text-primary/70 transition-colors">{t('ws.try')} </span>
      <span className="inline-grid align-top">
        <AnimatePresence mode="popLayout" initial={false}>
          {phrase && <motion.span
            key={phrase}
            className="italic [grid-area:1/1] whitespace-normal"
            initial={{ opacity: 0, y: 10, filter: 'blur(4px)' }}
            animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
            exit={{ opacity: 0, y: -10, filter: 'blur(4px)' }}
            transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
          >
            “{phrase}”
          </motion.span>}
        </AnimatePresence>
      </span>
    </button>
  );
};

const Workspace = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { user, logout, isAuthenticated, loading: authLoading } = useAuth();
  // Must be initialized before any effect dependencies race it (TDZ guard)
  const isDemoMode = !isAuthenticated;
  const { t, language } = useLanguage();
  const { keyboardHeight } = useKeyboardAvoid();
  const { trigger: haptic } = useHaptics();
  const [messages, setMessages] = useState<Message[]>([]);
  const [demoCount, setDemoCount] = useState(() => Number(localStorage.getItem('deiza_demo_msg_count') || 0));
  const [currentChatId, setCurrentChatId] = useState<number | undefined>(() => {
    try {
      const p = new URLSearchParams(window.location.search).get('chat');
      if (p) { const id = parseInt(p, 10); if (!Number.isNaN(id) && id > 0) return id; }
      const saved = localStorage.getItem('deiza:activeChatId');
      if (saved) { const id = parseInt(saved, 10); if (!Number.isNaN(id) && id > 0) return id; }
    } catch {}
    return undefined;
  });
  const [artifactOpen, setArtifactOpen] = useState(false);
  const [activeArtifact, setActiveArtifact] = useState<{ name: string; type: string; content?: string } | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [model, setModelState] = useState<ModelKey>('liquid');
  const setModel = (newModel: ModelKey) => {
    setModelState(newModel);
    if (currentChatId) {
      localStorage.setItem(`deiza_model_${currentChatId}`, newModel);
    }
  };
  const [userPlan, setUserPlan] = useState<string>('free');
  const [planUsage, setPlanUsage] = useState<{ tokens_used: number; token_limit: number; tokens_remaining: number; next_reset: string; reset_in_seconds?: number; exhausted: boolean } | null>(null);
  // Monotonic deadline for the usage countdown — immune to wrong device clocks
  const resetDeadlineRef = useRef(0);
  const [sidebarOpen, setSidebarOpen] = useState(() => window.innerWidth >= 1024);
  // Mobile sidebar — motion value drives real-time position + backdrop opacity
  const mobileSidebarX = useMotionValue(-MOBILE_SIDEBAR_W);
  const mobileSidebarOpacity = useTransform(mobileSidebarX, [-MOBILE_SIDEBAR_W, 0], [0, 1]);
  const mobileSidebarPointerEvents = useTransform(mobileSidebarX, (v: number) => v <= -MOBILE_SIDEBAR_W + 2 ? 'none' : 'auto');
  const sidebarOpenRef = useRef(false); // stale-closure-safe ref
  const [chats, setChats] = useState<Chat[]>([]);
  // ── Projects ──
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectPanelId, setProjectPanelId] = useState<number | null>(null);
  const [activeProjectId, setActiveProjectId] = useState<number | null>(null);
  const [creatingProject, setCreatingProject] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  // Track which chats the user has SEEN (chatId -> messageCount at last view)
  // so we can show a small "new" dot when an answer arrives in a chat the user isn't on.
  const [seenChats, setSeenChats] = useState<Record<number, number>>(() => {
    try { return JSON.parse(localStorage.getItem('deiza:chatSeen') || '{}'); } catch { return {}; }
  });
  const markChatSeen = useCallback((chatId: number, count: number) => {
    setSeenChats(prev => {
      if (prev[chatId] === count) return prev;
      const next = { ...prev, [chatId]: count };
      try { localStorage.setItem('deiza:chatSeen', JSON.stringify(next)); } catch { /* noop */ }
      return next;
    });
  }, []);
  // Ref so async callbacks see the latest currentChatId without closure staleness
  const currentChatIdRef = useRef<number | null>(currentChatId ?? null);
  // Chats currently being processed by the AI — shown as spinner in the sidebar
  const [processingChatIds, setProcessingChatIds] = useState<Set<number>>(new Set());
  const markProcessing = useCallback((chatId: number, on: boolean) => {
    setProcessingChatIds(prev => {
      const next = new Set(prev);
      if (on) next.add(chatId); else next.delete(chatId);
      return next;
    });
  }, []);
  // ── Background generations ──
  // Tasks keep running server-side even if this device closed the chat / laptop
  // slept: the sidebar + message area resume watching live, and stop cancels it.
  const remoteGensRef = useRef<Record<string, { status: string; content: string; thinking: string; ts: number }>>({});
  const [remoteGenDetail, setRemoteGenDetail] = useState<{ status: string; content: string; thinking: string; ts: number } | null>(null);
  const remoteGenDetailRef = useRef<{ status: string; content: string; thinking: string; ts: number } | null>(null);
  const [editingChatId, setEditingChatId] = useState<number | null>(null);
  const [editingTitle, setEditingTitle] = useState('');
  // Mobile long-press action sheet for a chat (rename / delete)
  const [sheetChat, setSheetChat] = useState<Chat | null>(null);
  // In-app delete confirmation (replaces window.confirm)
  const [confirmDeleteChatId, setConfirmDeleteChatId] = useState<number | null>(null);
  const chatLpTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const chatLpStart = useRef<{ x: number; y: number } | null>(null);
  /** Per-row long-press handlers (mobile sidebar). One timer is enough — only one touch at a time. */
  const chatLongPressHandlers = (chat: Chat) => ({
    onTouchStart: (e: React.TouchEvent) => {
      const t = e.touches[0];
      chatLpStart.current = { x: t.clientX, y: t.clientY };
      chatLpTimer.current = setTimeout(() => {
        chatLpTimer.current = null;
        try { navigator.vibrate?.(10); } catch { /* noop */ }
        haptic('medium');
        setSheetChat(chat);
      }, 420);
    },
    onTouchMove: (e: React.TouchEvent) => {
      if (!chatLpStart.current || !chatLpTimer.current) return;
      const t = e.touches[0];
      if (Math.abs(t.clientX - chatLpStart.current.x) > 10 || Math.abs(t.clientY - chatLpStart.current.y) > 10) {
        clearTimeout(chatLpTimer.current);
        chatLpTimer.current = null;
      }
    },
    onTouchEnd: () => {
      if (chatLpTimer.current) { clearTimeout(chatLpTimer.current); chatLpTimer.current = null; }
    },
  });
  const [showNameDialog, setShowNameDialog] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const streamingMsgIdRef = useRef<number | null>(null);
  const handleNewChatRef = useRef<(() => void) | null>(null);
  const handleStopRef = useRef<(() => void) | null>(null);
  // Guards for the background-generation poller (see effect below)
  const lastLocalDoneRef = useRef(0);
  const showedRemoteRef = useRef(false);
  const [streamingThinkingSteps, setStreamingThinkingSteps] = useState<string[]>([]);
  const abortControllerRef = useRef<AbortController | null>(null);
  const cancelStreamRef = useRef<(() => void) | null>(null);
  const lastUserMessageRef = useRef<string>('');
  const [restoredInput, setRestoredInput] = useState<string>('');
  // Dark mode only — the app is dark by design, no light theme
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < 1024);
  // Sticky-bottom scrolling: follow the stream only while the reader is at the
  // bottom; never yank the view after a response finishes.
  const userScrolledUpRef = useRef(false);
  const isNearBottomRef = useRef(true);
  const scrollIntentRef = useRef<'send' | 'load' | null>(null);
  const [showScrollDown, setShowScrollDown] = useState(false);
  const isStreamingRef = useRef(false);
  const streamingRawContentRef = useRef('');
  const autoArtifactOpenedRef = useRef(false);
  // Throttle streaming renders — only update DOM at most every 50ms
  const streamingThrottleRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingStreamUpdateRef = useRef<{ content: string; id: number } | null>(null);
  // Stores artifact detected during streaming so onDone can fall back to it
  const streamingArtifactRef = useRef<{ name: string; type: string; content?: string } | null>(null);
  // Artifact history for back/forward navigation
  const [artifactHistory, setArtifactHistory] = useState<Array<{ name: string; type: string; content?: string }>>([]);
  const [artifactHistoryIndex, setArtifactHistoryIndex] = useState(-1);

  // Force dark mode (the only theme)
  useEffect(() => {
    document.documentElement.classList.add('dark');
    localStorage.setItem('deiza-dark-mode', 'true');
  }, []);

  // Deiza for desktop: inside the app the Code button switches the app to Code mode and the
  // download button is hidden (also in the iOS app).
  const inDesktopApp = isDesktopApp();
  const showDesktopDownload = !inDesktopApp && !isNative();
  const openCode = useCallback(() => {
    if (userPlan === 'free') {
      toast.info(
        t('ws.err.code_plan') || 'Deiza Code está reservado para cuentas con planes de pago.',
        {
          action: { label: t('ws.plan.viewplans') || 'Ver planes', onClick: () => navigate('/plans') },
          duration: 7000,
        }
      );
      return;
    }
    const bridge = desktopBridge();
    if (bridge) bridge.openCode();
    else navigate('/code');
  }, [userPlan, navigate, t]);

  // One-time launch note (Deiza for desktop) for accounts opening the workspace after the release
  const [announceOpen, setAnnounceOpen] = useState(false);
  useEffect(() => {
    if (!isAuthenticated || !user?.id) return;
    if (announcementSeen(user.id)) return;
    const id = setTimeout(() => setAnnounceOpen(true), 900);
    return () => clearTimeout(id);
  }, [isAuthenticated, user?.id]);
  const closeAnnouncement = useCallback(() => { markAnnouncementSeen(user?.id); setAnnounceOpen(false); }, [user?.id]);

  // Floating announcement toast for Deiza Code
  const [codeBannerOpen, setCodeBannerOpen] = useState(false);
  useEffect(() => {
    try {
      if (localStorage.getItem('deiza:announce:deiza-code-banner') === '1') return;
      const timer = setTimeout(() => setCodeBannerOpen(true), 1500);
      return () => clearTimeout(timer);
    } catch {}
  }, []);
  const closeCodeBanner = useCallback(() => {
    try { localStorage.setItem('deiza:announce:deiza-code-banner', '1'); } catch {}
    setCodeBannerOpen(false);
  }, []);

  // Deep link ?model=liquid (from the news page CTA)
  useEffect(() => {
    const m = searchParams.get('model');
    if (m && ['gas', 'liquid', 'solid', 'liquid45'].includes(m)) {
      setModelState(m as ModelKey);
      const next = new URLSearchParams(searchParams);
      next.delete('model');
      setSearchParams(next, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Mobile detection
  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < 1024);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // Keyboard shortcuts: Ctrl/Cmd+K = new chat, Ctrl/Cmd+B = toggle sidebar
  useEffect(() => {
    if (!isAuthenticated) return;
    const onKey = (e: KeyboardEvent) => {
      // Esc stops the current generation (desktop power-user path)
      if (e.key === 'Escape' && isStreamingRef.current) {
        e.preventDefault();
        handleStopRef.current?.();
        return;
      }
      const mod = e.ctrlKey || e.metaKey;
      if (!mod) return;
      if (e.key === 'k' || e.key === 'K') {
        e.preventDefault();
        handleNewChatRef.current?.();
      } else if (e.key === 'b' || e.key === 'B') {
        e.preventDefault();
        setSidebarOpen(v => !v);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isAuthenticated]);

  // Sync sidebarOpenRef so touch handlers don't capture stale closure
  useEffect(() => { sidebarOpenRef.current = sidebarOpen; }, [sidebarOpen]);

  // Animate mobileSidebarX when sidebarOpen state changes (spring snap)
  useEffect(() => {
    if (!isMobile) return;
    motionAnimate(mobileSidebarX, sidebarOpen ? 0 : -MOBILE_SIDEBAR_W, {
      type: 'spring', stiffness: 360, damping: 36, mass: 0.75,
    });
  }, [sidebarOpen, isMobile]);

  // Mobile real-time drag gesture — finger follows sidebar
  useEffect(() => {
    if (!isMobile) return;
    let startX = 0, startY = 0, dragging = false, fromEdge = false;

    const onTouchStart = (e: TouchEvent) => {
      startX = e.touches[0].clientX;
      startY = e.touches[0].clientY;
      dragging = false;
      fromEdge = startX < 48;
    };

    const onTouchMove = (e: TouchEvent) => {
      const dx = e.touches[0].clientX - startX;
      const dy = Math.abs(e.touches[0].clientY - startY);
      if (!dragging) {
        if (Math.abs(dx) < 6) return;
        if (dy > Math.abs(dx) * 1.3) return; // mostly vertical — ignore
        dragging = true;
      }
      const isOpen = sidebarOpenRef.current;
      if (isOpen && dx < 0) {
        mobileSidebarX.set(Math.max(-MOBILE_SIDEBAR_W, Math.min(0, dx)));
      } else if (!isOpen && dx > 0 && fromEdge) {
        mobileSidebarX.set(Math.max(-MOBILE_SIDEBAR_W, Math.min(0, -MOBILE_SIDEBAR_W + dx)));
      }
    };

    const onTouchEnd = (e: TouchEvent) => {
      const dx = e.changedTouches[0].clientX - startX;
      const isOpen = sidebarOpenRef.current;
      const snap = () => motionAnimate(mobileSidebarX, isOpen ? 0 : -MOBILE_SIDEBAR_W, {
        type: 'spring', stiffness: 420, damping: 40, mass: 0.75,
      });
      if (!dragging) { snap(); return; }
      const threshold = MOBILE_SIDEBAR_W * 0.3;
      if (isOpen && dx < -threshold) setSidebarOpen(false);
      else if (!isOpen && dx > threshold && fromEdge) setSidebarOpen(true);
      else snap();
    };

    document.addEventListener('touchstart', onTouchStart, { passive: true });
    document.addEventListener('touchmove', onTouchMove, { passive: true });
    document.addEventListener('touchend', onTouchEnd, { passive: true });
    return () => {
      document.removeEventListener('touchstart', onTouchStart);
      document.removeEventListener('touchmove', onTouchMove);
      document.removeEventListener('touchend', onTouchEnd);
    };
  }, [isMobile]);


  const scrollToBottom = useCallback((behavior: ScrollBehavior = 'smooth') => {
    const el = messagesContainerRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior });
    isNearBottomRef.current = true;
    userScrolledUpRef.current = false;
    setShowScrollDown(false);
  }, []);

  // Track where the reader is (always, not only while streaming)
  const handleMessagesScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    const distFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    const near = distFromBottom < 96;
    isNearBottomRef.current = near;
    userScrolledUpRef.current = !near;
    const show = distFromBottom > 260;
    setShowScrollDown(prev => (prev === show ? prev : show));
  }, []);


  // Push body up when iOS keyboard appears so chat input stays visible
  useEffect(() => {
    document.documentElement.style.setProperty('--keyboard-height', keyboardHeight > 0 ? keyboardHeight + 'px' : '0px');
  }, [keyboardHeight]);

  // Scroll policy: jump on chat load, glide on send, follow the stream while at
  // the bottom — and leave the reader alone otherwise.
  // A loaded chat is placed at the bottom BEFORE the first paint (no frame at the previous
  // chat's scroll position), and stays pinned there while its images and cards finish
  // loading, unless the reader scrolls away.
  const pinUntilRef = useRef(0);
  useLayoutEffect(() => {
    if (scrollIntentRef.current !== 'load') return;
    scrollIntentRef.current = null;
    const el = messagesContainerRef.current;
    if (el) el.scrollTop = el.scrollHeight;
    isNearBottomRef.current = true;
    userScrolledUpRef.current = false;
    setShowScrollDown(false);
    pinUntilRef.current = Date.now() + 2500;
  }, [messages]);

  useEffect(() => {
    const el = messagesContainerRef.current;
    const content = el?.firstElementChild;
    if (!el || !content || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => {
      if (Date.now() < pinUntilRef.current && !userScrolledUpRef.current) el.scrollTop = el.scrollHeight;
    });
    ro.observe(content);
    return () => ro.disconnect();
  }, [currentChatId, artifactOpen]);

  useEffect(() => {
    const intent = scrollIntentRef.current;
    if (intent === 'send') {
      scrollIntentRef.current = null;
      requestAnimationFrame(() => scrollToBottom('smooth'));
      return;
    }
    if (isStreamingRef.current && isNearBottomRef.current) scrollToBottom('auto');
  }, [messages, scrollToBottom]);

  // Streaming thinking steps / remote generation also grow the thread
  useEffect(() => {
    if (isNearBottomRef.current && (isStreamingRef.current || remoteGenDetail)) scrollToBottom('auto');
  }, [streamingThinkingSteps, remoteGenDetail, scrollToBottom]);

  // Load plan & usage for authenticated users
  const loadPlanData = useCallback(async () => {
    if (!isAuthenticated) return;
    try {
      const res = await fetch(`${API_URL}/api/plan`, { credentials: 'include', headers: authHeaders() });
      if (res.ok) {
        const data = await res.json();
        setUserPlan(data.plan || 'free');
        const usage = data.usage;
        if (usage && typeof usage.reset_in_seconds === 'number' && usage.reset_in_seconds > 0 && usage.tokens_used > 0) {
          resetDeadlineRef.current = performance.now() + usage.reset_in_seconds * 1000;
        } else {
          resetDeadlineRef.current = 0;
        }
        setPlanUsage(usage || null);
      }
    } catch { /* silent */ }
  }, [isAuthenticated]);

  useEffect(() => { loadPlanData(); }, [loadPlanData]);

  // Live usage countdown + periodic refresh so %/time never look stuck.
  const [usageTick, setUsageTick] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => {
      setUsageTick(Date.now());
      if (document.visibilityState === 'visible') loadPlanData();
    }, 60000);
    const onFocus = () => { if (document.visibilityState === 'visible') loadPlanData(); };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onFocus);
    return () => {
      clearInterval(id);
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onFocus);
    };
  }, [loadPlanData]);

  useEffect(() => {
    if (isAuthenticated) void syncMemoryFromServer();
  }, [isAuthenticated]);

  // Load chat history for authenticated users
  const loadChats = useCallback(async () => {
    if (!isAuthenticated) return;
    try {
      const response = await api.getChatHistory();
      setChats(response.chats);
    } catch { /* silent */ }
  }, [isAuthenticated]);

  useEffect(() => { loadChats(); }, [loadChats]);

  // Reload the messages of the currently-open chat from the server
  const refreshCurrentMessages = useCallback(async () => {
    const cid = currentChatIdRef.current;
    if (!cid) return;
    try {
      const response = await api.getChatMessages(cid);
      const mapped = response.messages.map((msg: any) => {
        const persisted = (msg.artifact && typeof msg.artifact === 'object' && msg.artifact.name) ? msg.artifact : null;
        const extracted = persisted ? null : _extractArtifactFromContent(msg.content || '');
        return {
          id: msg.id, role: msg.role, content: msg.content,
          artifact: persisted || extracted || undefined,
          attachedFiles: Array.isArray(msg.attachments) && msg.attachments.length > 0 ? msg.attachments : undefined,
          sources: msg.meta?.sources?.length ? msg.meta.sources : undefined,
          images: msg.meta?.images?.length ? msg.meta.images : undefined,
          fromHistory: true,
        };
      });
      scrollIntentRef.current = 'load';
      setMessages(mapped);
      setCurrentChatId(cid);
    } catch (e: any) {
      const errMsg = String(e?.message || '');
      if (errMsg.includes('not found') || errMsg.includes('404')) {
        try { localStorage.removeItem('deiza:activeChatId'); } catch {}
        currentChatIdRef.current = null;
        setCurrentChatId(undefined);
      }
    }
  }, []);

  // stream-recovery v1
  // The SSE connection dropped (proxy, sleep, flaky network) but the server keeps generating
  // and persists the answer: hand the chat to the background poller (live progress) or, if it
  // already finished, reload the thread. The user never has to refresh to see the result.
  const recoverFromServer = useCallback(async (cid: number) => {
    let detail: any = null;
    try { detail = await api.getGeneration(cid); } catch { detail = null; }
    if (detail && detail.status === 'generating') {
      remoteGenDetailRef.current = detail;
      setRemoteGenDetail(detail);
      showedRemoteRef.current = true;
      return;
    }
    remoteGenDetailRef.current = null;
    setRemoteGenDetail(null);
    showedRemoteRef.current = false;
    await refreshCurrentMessages();
    await loadChats();
  }, [refreshCurrentMessages, loadChats]);

  // Poll server-side background generations: if a chat is generating on the
  // server (chat closed on this device, laptop asleep, or another device), show
  // the live "cargando" + partial content here and let STOP cancel it.
  useEffect(() => {
    if (!isAuthenticated || isDemoMode) return;
    let alive = true;
    const tick = async () => {
      try {
        const gens = await api.getGenerations();
        if (!alive) return;
        remoteGensRef.current = gens;
        let cid = currentChatIdRef.current;
        // If no chat is currently selected, but there is an active generation for this user,
        // auto-attach to that chat!
        if (!cid && Object.keys(gens).length > 0 && showedRemoteRef.current) {
          const genCids = Object.keys(gens).map(k => parseInt(k, 10)).filter(k => !Number.isNaN(k));
          if (genCids.length > 0) {
            cid = genCids[0];
            currentChatIdRef.current = cid;
            setCurrentChatId(cid);
            setSearchParams({ chat: String(cid) }, { replace: true });
            try { localStorage.setItem('deiza:activeChatId', String(cid)); } catch {}
            void refreshCurrentMessages();
          }
        }
        const gen = cid ? gens[String(cid)] : undefined;
        if (cid && gen && !isStreamingRef.current) {
          const detail = await api.getGeneration(cid);
          if (!alive) return;
          if (detail && detail.status === 'generating') {
            // Never take over a generation this device just completed (persist race)
            if (Date.now() - lastLocalDoneRef.current > 8000) {
              remoteGenDetailRef.current = detail;
              setRemoteGenDetail(detail);
              showedRemoteRef.current = true;
              markProcessing(cid, true);
            }
          } else {
            // Finished / cancelled — the final message is in the DB now. Reload thread
            remoteGenDetailRef.current = null;
            setRemoteGenDetail(null);
            if (showedRemoteRef.current && currentChatIdRef.current) {
              showedRemoteRef.current = false;
              void refreshCurrentMessages();
              void loadChats();
              if (currentChatIdRef.current) markProcessing(currentChatIdRef.current, false);
            }
          }
        } else if (remoteGenDetailRef.current) {
          remoteGenDetailRef.current = null;
          setRemoteGenDetail(null);
          if (showedRemoteRef.current && currentChatIdRef.current) {
            showedRemoteRef.current = false;
            void refreshCurrentMessages();
            void loadChats();
            if (currentChatIdRef.current) markProcessing(currentChatIdRef.current, false);
          }
        }
      } catch { /* silent */ }
    };
    // Poll every 1.5 s while something is generating, otherwise every 8 s
    let timer: ReturnType<typeof setTimeout> | null = null;
    let busyHint = false;
    const loop = async () => {
      if (!alive) return;
      if (document.visibilityState === 'visible') {
        await tick();
        busyHint = isStreamingRef.current || !!remoteGenDetailRef.current || (Object.keys(remoteGensRef.current).length > 0);
      }
      if (!alive) return;
      timer = setTimeout(loop, busyHint ? 1500 : 8000);
    };
    const onVisible = () => { if (document.visibilityState === 'visible') { if (timer) clearTimeout(timer); void loop(); } };
    document.addEventListener('visibilitychange', onVisible);
    void loop();
    return () => { alive = false; if (timer) clearTimeout(timer); document.removeEventListener('visibilitychange', onVisible); };
  }, [isAuthenticated, isDemoMode, refreshCurrentMessages, loadChats]);

  // Immediate check for background generation on mount/refresh
  useEffect(() => {
    if (!isAuthenticated || isDemoMode) return;
    const cid = currentChatIdRef.current || (typeof window !== 'undefined' ? parseInt(new URLSearchParams(window.location.search).get('chat') || localStorage.getItem('deiza:activeChatId') || '', 10) : undefined);
    if (cid && !Number.isNaN(cid) && cid > 0) {
      api.getGeneration(cid).then(detail => {
        if (detail && detail.status === 'generating') {
          remoteGenDetailRef.current = detail;
          setRemoteGenDetail(detail);
          showedRemoteRef.current = true;
          markProcessing(cid, true);
        }
      }).catch(() => {});
    }
  }, [isAuthenticated, isDemoMode]);

  // After chats load on mount, auto-select the chat from URL (?chat=ID) so F5 preserves state
  const [initialChatLoaded, setInitialChatLoaded] = useState(false);
  // While a ?chat= restore is in flight, keep the empty-state hero hidden so the
  // greeting doesn't flash (and then have to animate away) before messages land.
  const [restoringChat, setRestoringChat] = useState<boolean>(() => {
    try {
      return !!(new URLSearchParams(window.location.search).get('chat') || localStorage.getItem('deiza:activeChatId'));
    } catch { return false; }
  });
  useEffect(() => {
    if (!restoringChat) return;
    if (!authLoading && !isAuthenticated) { setRestoringChat(false); return; }
    const guard = setTimeout(() => setRestoringChat(false), 6000);
    return () => clearTimeout(guard);
  }, [restoringChat, authLoading, isAuthenticated]);
  useEffect(() => {
    if (initialChatLoaded || chats.length === 0) return;
    const urlChatId = searchParams.get('chat') || localStorage.getItem('deiza:activeChatId');
    let restoring = false;
    if (urlChatId) {
      const id = parseInt(urlChatId, 10);
      if (!Number.isNaN(id) && chats.some(c => c.id === id) && (currentChatId !== id || messages.length === 0)) {
        restoring = true;
        Promise.resolve(handleChatSelect(id)).finally(() => setRestoringChat(false));
      }
    }
    if (!restoring) setRestoringChat(false);
    setInitialChatLoaded(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chats]);

  // First time we see a chat, mark its current count as "seen" so older chats don't all glow red
  useEffect(() => {
    let needsUpdate = false;
    const next = { ...seenChats };
    chats.forEach(c => {
      if (!(c.id in next)) { next[c.id] = c.message_count; needsUpdate = true; }
    });
    if (needsUpdate) {
      setSeenChats(next);
      try { localStorage.setItem('deiza:chatSeen', JSON.stringify(next)); } catch { /* noop */ }
    }
  }, [chats, seenChats]);

  // Helper used by sidebar rendering
  const isChatUnread = (chat: Chat) =>
    currentChatId !== chat.id && chat.message_count > (seenChats[chat.id] ?? 0);

  // Keep ref in sync with state (so async onDone callbacks see the latest chat the user is on)
  useEffect(() => {
    currentChatIdRef.current = currentChatId ?? null;
    if (currentChatId) {
      try { localStorage.setItem('deiza:activeChatId', String(currentChatId)); } catch {}
    }
  }, [currentChatId]);

  // Show name setup dialog for new users whose name was auto-generated from email
  useEffect(() => {
    if (!user) return;
    const emailPrefix = user.email.split('@')[0];
    const isAutoName =
      user.name === emailPrefix ||
      user.name === emailPrefix.charAt(0).toUpperCase() + emailPrefix.slice(1);
    const key = `deiza_name_set_${user.id}`;
    if (isAutoName && !localStorage.getItem(key)) {
      // Small delay so workspace finishes rendering first
      const timer = setTimeout(() => setShowNameDialog(true), 800);
      return () => clearTimeout(timer);
    }
  }, [user]);

  // Auto-name chat with AI-generated title
  const autoNameChat = useCallback(async (chatId: number, firstUserMessage: string) => {
    try {
      // Call backend to generate title
      const titleRes = await fetch(`${import.meta.env.VITE_API_URL ?? ''}/api/chat/${chatId}/title`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ language, message: firstUserMessage }),
      });
      if (titleRes.ok) {
        const { title } = await titleRes.json();
        setChats(prev => prev.map(c => c.id === chatId ? { ...c, title } : c));
      }
    } catch { /* silent */ }
  }, [language]);

  /** Extract a code block from raw streaming content (skips artifact blocks) */
  const extractStreamingCode = (raw: string): { lang: string; code: string; textBefore: string; textAfter: string } | null => {
    if (raw.includes('```artifact')) return null;
    const idx = raw.indexOf('```');
    if (idx < 0) return null;
    const afterTicks = raw.substring(idx + 3);
    const nlIdx = afterTicks.indexOf('\n');
    if (nlIdx < 0) return null;
    const lang = afterTicks.substring(0, nlIdx).trim();
    if (!lang || !/^[a-zA-Z]+$/.test(lang)) return null;
    const lower = lang.toLowerCase();
    if (['question', 'mermaid', 'chart', 'thought', 'options', 'text', 'markdown', 'md'].includes(lower)) return null;
    const codeStart = afterTicks.substring(nlIdx + 1);
    const closeIdx = codeStart.indexOf('```');
    const code = closeIdx >= 0 ? codeStart.substring(0, closeIdx) : codeStart;
    if (code.length < 60) return null;
    const textBefore = raw.substring(0, idx).trim();
    const textAfter = closeIdx >= 0 ? codeStart.substring(closeIdx + 3).trim() : '';
    return { lang, code, textBefore, textAfter };
  };

  /** Process a streaming chunk: detect code blocks → auto-open artifact panel.
   *  Throttled to max 1 DOM update per 50ms to prevent OOM from rapid re-renders. */
  const handleStreamChunk = useCallback((chunk: string, id: number) => {
    if (streamingRawContentRef.current === '' && chunk) nativeHaptic('selection');
    streamingRawContentRef.current += chunk;
    const raw = streamingRawContentRef.current;

    // Store the latest pending update
    pendingStreamUpdateRef.current = { content: raw, id };

    // If a throttle timer is already scheduled, let it pick up the latest value
    if (streamingThrottleRef.current) return;

    streamingThrottleRef.current = setTimeout(() => {
      streamingThrottleRef.current = null;
      const pending = pendingStreamUpdateRef.current;
      if (!pending) return;
      pendingStreamUpdateRef.current = null;

      const { content: latestRaw, id: latestId } = pending;
      const extracted = extractStreamingCode(latestRaw);
      if (extracted) {
        const { lang, code, textBefore } = extracted;
        const extMap: Record<string, string> = {
          python: 'py', javascript: 'js', typescript: 'ts', tsx: 'tsx', jsx: 'jsx',
          html: 'html', css: 'css', json: 'json', sql: 'sql', bash: 'sh',
          rust: 'rs', go: 'go', java: 'java', cpp: 'cpp', ruby: 'rb', php: 'php',
          csharp: 'cs', swift: 'swift', kotlin: 'kt',
        };
        const ext = extMap[lang] || lang;
        // Track artifact for onDone fallback — do NOT open panel yet (code is still partial)
        streamingArtifactRef.current = { name: `code.${ext}`, type: lang, content: code };
        // Show text before the code block while streaming
        setMessages(prev => prev.map(m =>
          m.id === latestId ? { ...m, content: textBefore || latestRaw } : m
        ));
      } else {
        // Hide any in-progress code block — truncate at first ``` so partial HTML never shows
const artifactMarker = latestRaw.indexOf('```artifact');
        if (artifactMarker >= 0) {
          // Artifact streaming in: the shared finder locates the real closing fence (the content
          // carries its own ```chart / ```mermaid / code fences) and parses the JSON tolerantly.
          const block = findArtifactBlock(latestRaw, artifactMarker);
          const parsedArt = block ? parseArtifactSpec(block.spec).art : null;
          const artName = parsedArt?.name || 'documento.pdf';
          const artType = parsedArt?.type || (artName.split('.').pop() || 'pdf');
          const artContent = parsedArt?.content || '';

          streamingArtifactRef.current = { name: artName, type: artType, content: artContent };
          const textBefore = latestRaw.substring(0, artifactMarker).trim();
          setMessages(prev => prev.map(m =>
            m.id === latestId ? { ...m, content: textBefore, artifact: streamingArtifactRef.current || undefined } : m
          ));
        } else {
          const codeStart = latestRaw.indexOf('```');
          const displayRaw = codeStart >= 0 ? latestRaw.substring(0, codeStart).trim() : latestRaw;
          setMessages(prev => prev.map(m =>
            m.id === latestId ? { ...m, content: displayRaw } : m
          ));
        }
      }
    }, model === 'gas' || model === 'fast' ? 450 : 50);
  }, [model]);

  const demoMessageCount = isDemoMode ? messages.filter(m => m.role === 'user').length : 0;

  /** Answer picked from an inline question card: goes out as a normal user message */
  const handleSendRef = useRef<((content: string, files?: any[]) => void) | null>(null);
  const handleQuickReply = useCallback((text: string) => {
    haptic('light');
    handleSendRef.current?.(text);
  }, [haptic]);

  const handleSend = (content: string, files: any[] = []) => {
    if (!content.trim()) return;
    if (isStreamingRef.current) return; // Prevent double-send while streaming
    isStreamingRef.current = true; // Lock immediately — before any async work
    setStreamingThinkingSteps([]);
    remoteGenDetailRef.current = null;
    setRemoteGenDetail(null);
    if (isDemoMode && demoMessageCount >= DEMO_MAX_MESSAGES) {
      isStreamingRef.current = false;
      toast.error(
        t('ws.demo.limit', { count: DEMO_MAX_MESSAGES }),
        {
          action: { label: t('auth.signup'), onClick: () => navigate('/login') },
          duration: 9000,
        }
      );
      return;
    }

    const userMessage: Message = {
      id: Date.now(),
      role: 'user',
      content,
      attachedFiles: files.length > 0 ? files.map(f => ({
        name: f.name,
        mime_type: f.mime_type,
        is_image: f.is_image,
        raw_bytes: f.raw_bytes,
      })) : undefined,
    };
    const streamingId = Date.now() + 1;
    streamingMsgIdRef.current = streamingId;
    const abortController = new AbortController();
    abortControllerRef.current = abortController;
    lastUserMessageRef.current = content;
    setRestoredInput('');
    streamingRawContentRef.current = '';
    autoArtifactOpenedRef.current = false;
    streamingArtifactRef.current = null;
    if ((model === 'gas' || model === 'fast') && files.some(f => f.is_image || (f.mime_type || '').startsWith('image/'))) {
      toast.info(t('ws.img.upgrade'));
    }
    // Glide to the new message when the user sends
    scrollIntentRef.current = 'send';
    userScrolledUpRef.current = false;
    isNearBottomRef.current = true;
    setMessages(prev => [...prev, userMessage]);
    setIsLoading(true);

    if (isDemoMode) {
      // Pro bloqueado en demo
      if (model === 'pro') {
        setMessages(prev => [...prev, {
          id: streamingId, role: 'assistant',
          content: t('ws.demo.pro'),
        }]);
        setIsLoading(false);
        streamingMsgIdRef.current = null;
        return;
      }

      // Streaming demo
      const demoHistory = messages.map(m => ({ role: m.role, content: m.content }));
      // Add empty streaming message
      setMessages(prev => [...prev, { id: streamingId, role: 'assistant', content: '' }]);

      cancelStreamRef.current = api.streamDemoMessage(
        content, demoHistory, language,
        (chunk) => { handleStreamChunk(chunk, streamingId); },
        (artifact) => {
          // Flush any pending throttled content update
          if (streamingThrottleRef.current) {
            clearTimeout(streamingThrottleRef.current);
            streamingThrottleRef.current = null;
          }
          const rawContent = streamingRawContentRef.current;
          // Strip code blocks from final content so DB stores clean text (no raw HTML dump)
          const extracted = extractStreamingCode(rawContent);
          const finalContent = extracted
            ? extracted.textBefore + (extracted.textAfter ? '\n\n' + extracted.textAfter : '')
            : rawContent;
          // Fall back to streaming-detected artifact if backend sends none
          const finalArtifact = artifact || streamingArtifactRef.current || undefined;
          setMessages(prev => prev.map(m =>
            m.id === streamingId ? { ...m, content: finalContent || m.content, artifact: finalArtifact } : m
          ));
          // Auto-open artifact panel when artifact arrives (images render inline instead;
          // file-download artifacts like .pptx just show their download card)
          if (finalArtifact && finalArtifact.type !== 'image' && finalArtifact.type !== 'question' && !finalArtifact.name?.endsWith('.question') && finalArtifact.content) {
            setActiveArtifact(finalArtifact);
            setArtifactOpen(true);
            setArtifactHistory(prev => [...prev, finalArtifact]);
            setArtifactHistoryIndex(prev => prev + 1);
          }
          isStreamingRef.current = false;
          nativeHaptic('light');
          setIsLoading(false);
          streamingMsgIdRef.current = null;
          if (demoMessageCount + 1 >= DEMO_MAX_MESSAGES) {
            toast.info(
              t('ws.demo.limit.used', { count: DEMO_MAX_MESSAGES }),
              {
                action: { label: t('auth.signup'), onClick: () => navigate('/login') },
                duration: 9000,
              }
            );
          }
        },
        (err) => {
          nativeHaptic('error');
          toast.error(apiErrorMessage({ code: err, message: '' }, t, t('error.send')));
          setMessages(prev => prev.filter(m => m.id !== streamingId && m.id !== userMessage.id));
          isStreamingRef.current = false;
          setIsLoading(false);
          streamingMsgIdRef.current = null;
        },
        undefined,
        (images) => {
          setMessages(prev => prev.map(m =>
            m.id === streamingId ? { ...m, images } : m
          ));
        },
        (sources) => {
          setMessages(prev => prev.map(m =>
            m.id === streamingId ? { ...m, sources } : m
          ));
        },
        model
      );
      return;
    }

    // Authenticated streaming — check plan limits first (Vainilla is unlimited fallback)
    if (planUsage?.exhausted && model !== 'vainilla') {
      nativeHaptic('warning');
      toast.error(
        t('ws.err.limit'),
        {
          action: { label: t('ws.plan.viewplans'), onClick: () => navigate('/plans') },
          duration: 8000,
        }
      );
      isStreamingRef.current = false;
      setMessages(prev => prev.filter(m => m.id !== userMessage.id));
      setIsLoading(false);
      return;
    }

    setMessages(prev => [...prev, { id: streamingId, role: 'assistant', content: '' }]);

    // Mark this chat as actively processing (sidebar spinner)
    if (currentChatId) markProcessing(currentChatId, true);
    cancelStreamRef.current = api.streamMessage(
      content, currentChatId, model, language,
      (chunk) => { handleStreamChunk(chunk, streamingId); },
      (newChatId, artifact, msgId) => {
        // Cancel any pending throttled update and flush final content immediately.
        // Without this, short responses (<50ms total) have their content lost because
        // the throttle fires AFTER onDone changes the message ID, so m.id no longer matches.
        if (streamingThrottleRef.current) {
          clearTimeout(streamingThrottleRef.current);
          streamingThrottleRef.current = null;
        }
        const rawContent = streamingRawContentRef.current;
        // Strip code blocks from final content so DB stores clean text (no raw HTML dump)
        const extracted = extractStreamingCode(rawContent);
        const finalContent = extracted
          ? extracted.textBefore + (extracted.textAfter ? '\n\n' + extracted.textAfter : '')
          : rawContent;
        // Fall back to streaming-detected artifact if backend sends none
        const finalArtifact = artifact || streamingArtifactRef.current || undefined;
        setMessages(prev => prev.map(m =>
          m.id === streamingId
            ? { ...m, id: msgId || streamingId, content: finalContent || m.content, artifact: finalArtifact }
            : m
        ));
        // Auto-open artifact panel when artifact arrives (images render inline + lightbox instead;
        // file-download artifacts like .pptx just show their download card)
        if (finalArtifact && finalArtifact.type !== 'image' && finalArtifact.type !== 'question' && !finalArtifact.name?.endsWith('.question') && finalArtifact.content) {
          setActiveArtifact(finalArtifact);
          setArtifactOpen(true);
          setArtifactHistory(prev => [...prev, finalArtifact]);
          setArtifactHistoryIndex(prev => prev + 1);
        }
        const finalChatId = currentChatId || newChatId;
        if (!currentChatId) {
          setCurrentChatId(newChatId);
          // Persist new chat in URL too
          setSearchParams({ chat: String(newChatId) });
          // Auto-name the chat if it's the first message
          if (messages.length === 0) {
            autoNameChat(newChatId, content);
          }
        }
        // Bump this chat to the top locally so the sidebar updates instantly
        if (finalChatId) {
          setChats(prev => {
            const idx = prev.findIndex(c => c.id === finalChatId);
            if (idx < 0) return prev;
            const updated = { ...prev[idx], message_count: prev[idx].message_count + 2 };
            return [updated, ...prev.slice(0, idx), ...prev.slice(idx + 1)];
          });
          // Only mark as seen if the user is still on this chat (else the red dot should appear)
          if (currentChatIdRef.current === finalChatId) {
            markChatSeen(finalChatId, ((chats.find(c => c.id === finalChatId)?.message_count) ?? 0) + 2);
          }
          // Clear processing spinner
          markProcessing(finalChatId, false);
        }
        // Refresh from server to get accurate counts + ordering
        loadChats();
        if (activeProjectId) loadProjects();
        lastLocalDoneRef.current = Date.now();
        isStreamingRef.current = false;
        setIsLoading(false);
        streamingMsgIdRef.current = null;
        nativeHaptic('light');
      },
      (err) => {
        const errChatId = currentChatIdRef.current;
        if (errChatId && (err === 'stream_timeout' || err === 'stream_interrupted')) {
          // Connection lost mid-answer: the server is still working (or already saved the
          // message). Show live progress / the final message instead of an error.
          if (streamingThrottleRef.current) {
            clearTimeout(streamingThrottleRef.current);
            streamingThrottleRef.current = null;
          }
          setMessages(prev => prev.filter(m => m.id !== streamingId));
          isStreamingRef.current = false;
          setIsLoading(false);
          streamingMsgIdRef.current = null;
          lastLocalDoneRef.current = 0; // let the poller attach right away
          void recoverFromServer(errChatId);
          return;
        }
        nativeHaptic('error');
        // Clear processing spinner on error for the chat we were targeting
        if (errChatId) markProcessing(errChatId, false);
        // Handle plan / usage errors from backend
        // The backend now sends "KEY|MODEL|SECONDS" so we can be precise
        const p = (err || '').split('|');
        const errKey = p[0] || '';
        const secondPart = p[1] ? Number(p[1]) : NaN;
        const thirdPart = p[2] ? Number(p[2]) : NaN;
        const secsLeft = !isNaN(thirdPart) ? thirdPart : !isNaN(secondPart) ? secondPart : undefined;
        const modelRaw = !isNaN(thirdPart) ? p[1] : (!isNaN(secondPart) ? undefined : p[1]);
        const fmtLeft = (s?: number) => {
          if (!s || s <= 0) return '';
          const m = Math.ceil(s / 60);
          if (m < 60) return `${m} min`;
          return `${Math.floor(m / 60)}h ${(m % 60) < 10 ? '0' : ''}${m % 60}m`;
        };
        const tierLabel = model === 'ultra' || model === 'solid' ? 'Ultra' : (model === 'pro' || model === 'liquid' ? 'Pro' : 'Fast');
        let errMsg: string | null = null;
        if (errKey === 'model_sublimit') {
          const subTier = modelRaw === 'ultra' ? 'Ultra' : modelRaw === 'pro' ? 'Pro' : tierLabel;
          errMsg = t('ws.err.sublimit', { model: `DZ-${subTier}`, plan: userPlan, time: fmtLeft(secsLeft) });
        } else if (errKey === 'usage_limit' || err?.includes('429')) {
          errMsg = t('ws.err.usage', { plan: userPlan, time: fmtLeft(secsLeft) });
        }
        if (errMsg) {
          setMessages(prev => [...prev.filter(m => m.id !== streamingId && m.id !== userMessage.id), {
            id: Date.now(),
            role: 'assistant',
            content: errMsg,
          }]);
          loadPlanData();
        } else if (err?.includes('plan_required') || err?.includes('403')) {
          setMessages(prev => [...prev.filter(m => m.id !== streamingId && m.id !== userMessage.id), {
            id: Date.now(),
            role: 'assistant',
            content: t('ws.err.plan', { model: `DZ-${tierLabel}`, plan: userPlan }),
          }]);
        } else {
          const userFriendly = err && /^[a-z_]+$/.test(err)
            ? apiErrorMessage({ code: err, message: '' }, t, t('ws.err.unavailable'))
            : (err && !/upstream|DZ-8 error/.test(err)) ? err : t('ws.err.unavailable');
          // Keep the user's message in the thread and offer a one-tap retry
          setMessages(prev => [
            ...prev.filter(m => m.id !== streamingId),
            { id: Date.now(), role: 'assistant', content: userFriendly, error: true, retryOf: content },
          ]);
        }
        lastLocalDoneRef.current = Date.now();
        isStreamingRef.current = false;
        setIsLoading(false);
        streamingMsgIdRef.current = null;
      },
      files,
      (step: string) => setStreamingThinkingSteps(prev => [...prev, step]),
      (rawImages) => {
        // Map backend {title} field to {alt} expected by WebImageGrid
        const images = (rawImages as any[]).map((img: any) => ({
          url: img.url || '',
          alt: img.alt || img.title || '',
          source: img.source || '',
          caption: img.caption,
        }));
        setMessages(prev => prev.map(m =>
          m.id === streamingId ? { ...m, images } : m
        ));
      },
      undefined,  // mode
      undefined,  // agentType
      (sources) => {
        setMessages(prev => prev.map(m =>
          m.id === streamingId ? { ...m, sources } : m
        ));
      },
      currentChatId ? undefined : activeProjectId,  // link new chats to the active project
      (newId) => {
        // A brand-new chat: bind it to the URL right away so an F5 mid-answer restores this
        // thread (and the background-generation poller can attach) instead of an empty screen.
        currentChatIdRef.current = newId;
        setCurrentChatId(newId);
        setSearchParams({ chat: String(newId) }, { replace: true });
        try { localStorage.setItem('deiza:activeChatId', String(newId)); } catch {}
        markProcessing(newId, true);
        void loadChats();
      },
    );
    // Refresh usage after message
    setTimeout(() => loadPlanData(), 3000);
    // Update persistent memory from this conversation (best-effort, async)
    if (currentChatId) {
      const memoryMessages = [
        ...messages,
        { role: 'user' as const, content: content },
        { role: 'assistant' as const, content: '' },
      ];
      void extractAndStoreMemory(memoryMessages, currentChatId, language);
    }
  };

  handleSendRef.current = handleSend;

  const handleStop = useCallback(() => {
    // Also abort a server-side generation for this chat (covers the case where
    // we're watching a background task started elsewhere / on this device)
    if (currentChatIdRef.current) {
      api.cancelGeneration(currentChatIdRef.current);
      remoteGenDetailRef.current = null;
      setRemoteGenDetail(null);
    }
    // Cancel the stream
    if (cancelStreamRef.current) {
      cancelStreamRef.current();
      cancelStreamRef.current = null;
    }
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    // Clear any pending throttled render
    if (streamingThrottleRef.current) {
      clearTimeout(streamingThrottleRef.current);
      streamingThrottleRef.current = null;
    }
    pendingStreamUpdateRef.current = null;
    // Keep the user's message and whatever Deiza had written (the server saves the
    // same partial answer): nothing vanishes when you press Stop.
    const partial = streamingRawContentRef.current;
    const sid = streamingMsgIdRef.current;
    setMessages(prev => {
      const next = [...prev];
      const last = next[next.length - 1];
      if (last && last.role === 'assistant' && (last.id === sid || !last.content)) {
        const codeStart = partial.indexOf('```');
        const shown = (codeStart >= 0 ? partial.substring(0, codeStart) : partial).trim();
        if (shown) next[next.length - 1] = { ...last, content: shown, artifact: streamingArtifactRef.current || last.artifact, stopped: true };
        else next.pop();
      }
      return next;
    });
    lastUserMessageRef.current = '';
    isStreamingRef.current = false;
    setIsLoading(false);
    streamingMsgIdRef.current = null;
    nativeHaptic('rigid');
    if (currentChatIdRef.current) { markProcessing(currentChatIdRef.current, false); setTimeout(() => { void loadChats(); }, 1500); }
  }, [loadChats, markProcessing]);
  handleStopRef.current = handleStop;

  // Read-only conversation sharing (frozen snapshots)
  const handleShareChat = async () => {
    if (!currentChatId) return;
    haptic('light');
    try {
      const res = await api.createShare({ chat_id: currentChatId });
      if (res?.url) {
        if (isNative()) { await shareText(res.url, res.url, chats.find(c => c.id === currentChatId)?.title); }
        else { await navigator.clipboard.writeText(res.url); toast.success(t('ws.share.copied')); }
      }
    } catch (e) { nativeHaptic('error'); toast.error(apiErrorMessage(e, t, t('ws.share.error'))); }
  };

  const handleShareMessage = async (msgId: number) => {
    haptic('light');
    try {
      const res = await api.createShare({ message_id: msgId });
      if (res?.url) {
        if (isNative()) { await shareText(res.url, res.url); }
        else { await navigator.clipboard.writeText(res.url); toast.success(t('ws.share.copied')); }
      }
    } catch (e) { nativeHaptic('error'); toast.error(apiErrorMessage(e, t, t('ws.share.error'))); }
  };

  const handleArtifactClick = (artifact: { name: string; type: string; content?: string }) => {
    haptic('light');
    setActiveArtifact(artifact);
    setArtifactOpen(true);
    setArtifactHistory(prev => {
      const alreadyIn = prev.some(a => a.name === artifact.name && a.content === artifact.content);
      if (alreadyIn) {
        const idx = prev.findIndex(a => a.name === artifact.name && a.content === artifact.content);
        setArtifactHistoryIndex(idx);
        return prev;
      }
      const next = [...prev, artifact];
      setArtifactHistoryIndex(next.length - 1);
      return next;
    });
  };

  // Artifact history navigation
  const handleArtifactPrev = () => {
    const idx = artifactHistoryIndex - 1;
    if (idx >= 0 && artifactHistory[idx]) {
      setArtifactHistoryIndex(idx);
      setActiveArtifact(artifactHistory[idx]);
    }
  };

  const handleArtifactNext = () => {
    const idx = artifactHistoryIndex + 1;
    if (idx < artifactHistory.length && artifactHistory[idx]) {
      setArtifactHistoryIndex(idx);
      setActiveArtifact(artifactHistory[idx]);
    }
  };

  const handleLogout = async () => {
    try { await logout(); navigate(isNative() ? '/login' : '/'); }
    catch { toast.error(t('workspace.logout')); }
  };

  const handleNewChat = () => {
    haptic('light');
    try { localStorage.removeItem('deiza:activeChatId'); } catch {}
    currentChatIdRef.current = null;
    remoteGenDetailRef.current = null;
    setRemoteGenDetail(null);
    showedRemoteRef.current = false;
    setModel('liquid');
    setMessages([]);
    setCurrentChatId(undefined);
    setActiveProjectId(null);
    setSearchParams({});
    setArtifactOpen(false);
    setActiveArtifact(null);
    setArtifactHistory([]);
    setArtifactHistoryIndex(-1);
    if (isMobile) setSidebarOpen(false);
  };
  handleNewChatRef.current = handleNewChat;

  // ── Projects ──
  const loadProjects = useCallback(async () => {
    if (!isAuthenticated) return;
    try {
      const res = await api.getProjects();
      setProjects(res.projects);
    } catch { /* silent */ }
  }, [isAuthenticated]);

  useEffect(() => { loadProjects(); }, [loadProjects]);

  /** Start a fresh chat linked to a project */
  const startProjectChat = (pid: number) => {
    setModel('liquid');
    setMessages([]);
    setCurrentChatId(undefined);
    setActiveProjectId(pid);
    setArtifactOpen(false);
    setActiveArtifact(null);
    setArtifactHistory([]);
    setArtifactHistoryIndex(-1);
    if (isMobile) setSidebarOpen(false);
  };

  const handleCreateProject = async () => {
    const nm = newProjectName.trim();
    if (!nm) { setCreatingProject(false); return; }
    try {
      const res = await api.createProject(nm);
      setProjects(prev => [res.project, ...prev]);
      setNewProjectName('');
      setCreatingProject(false);
      setProjectPanelId(res.project.id);
    } catch (e: any) {
      setCreatingProject(false);
      setNewProjectName('');
      if ((e?.message || '').includes('project_limit') || (e?.message || '').includes('403')) {
        toast.error(
          t('ws.err.projectlimit'),
          { action: { label: t('ws.plan.viewplans'), onClick: () => navigate('/plans') }, duration: 7000 }
        );
      } else {
        toast.error(t('ws.err.createproject'));
      }
    }
  };

  // Header logo click: demo → landing, logged → new chat
  const handleLogoClick = () => {
    if (isDemoMode) navigate('/');
    else handleNewChat();
  };

  const handleChatSelect = async (chatId: number) => {
    if (chatId === currentChatId && messages.length > 0) { if (isMobile) setSidebarOpen(false); return; }
    haptic('selection');
    if (isMobile) setSidebarOpen(false);
    // Persist chat in URL and localStorage so F5 / refresh stays on this chat
    currentChatIdRef.current = chatId;
    setCurrentChatId(chatId);
    setSearchParams({ chat: String(chatId) });
    try { localStorage.setItem('deiza:activeChatId', String(chatId)); } catch {}
    try {
      const response = await api.getChatMessages(chatId);
      // Another chat was picked while this one was loading
      if (currentChatIdRef.current !== chatId) return;
      setCurrentChatId(chatId);
      // Restore the model that was last used in this chat
      const savedModel = localStorage.getItem(`deiza_model_${chatId}`) as ModelKey | null;
      if (savedModel && ['gas', 'liquid', 'solid', 'vainilla'].includes(savedModel)) {
        setModelState(savedModel);
      }
      setActiveProjectId(chats.find(c => c.id === chatId)?.project_id ?? null);
      const mapped = response.messages.map((msg: any) => {
        const persisted = (msg.artifact && typeof msg.artifact === 'object' && msg.artifact.name)
          ? msg.artifact : null;
        const extracted = persisted ? null : _extractArtifactFromContent(msg.content || '');
        return {
          id: msg.id, role: msg.role, content: msg.content,
          artifact: persisted || extracted || undefined,
          // Restore attached photos that the user originally sent
          attachedFiles: Array.isArray(msg.attachments) && msg.attachments.length > 0
            ? msg.attachments : undefined,
          // Restore web search sources + images so they survive reload
          sources: msg.meta?.sources?.length ? msg.meta.sources : undefined,
          images: msg.meta?.images?.length ? msg.meta.images : undefined,
          fromHistory: true,
        };
      });
      scrollIntentRef.current = 'load';
      setMessages(mapped);
      // Mark this chat as seen (clears the red dot)
      const chatRow = chats.find(c => c.id === chatId);
      if (chatRow) markChatSeen(chatId, chatRow.message_count);
      // Restore last artifact in the same render as the messages, so the layout settles once
      // Restore last artifact from this chat so the panel reopens and cards show
      // Check by name (not content) so it works even if content is large/lazy
      const msgsWithArtifact = mapped.filter(m => m.artifact?.name && !['image', 'pptx', 'video'].includes(m.artifact?.type || ''));
      if (msgsWithArtifact.length > 0) {
        const lastArt = msgsWithArtifact[msgsWithArtifact.length - 1].artifact!;
        setActiveArtifact(lastArt);
        // Build history from all unique artifacts in this chat
        const allArts = msgsWithArtifact.map(m => m.artifact!);
        setArtifactHistory(allArts);
        setArtifactHistoryIndex(allArts.length - 1);
        setArtifactOpen(true);
      } else {
        setArtifactOpen(false);
        setActiveArtifact(null);
        setArtifactHistory([]);
        setArtifactHistoryIndex(-1);
      }
      // Check if this chat is currently generating on server
      try {
        const detail = await api.getGeneration(chatId);
        if (currentChatIdRef.current === chatId && detail && detail.status === 'generating') {
          remoteGenDetailRef.current = detail;
          setRemoteGenDetail(detail);
          showedRemoteRef.current = true;
          markProcessing(chatId, true);
        }
      } catch {}
    } catch (e: any) {
      const errMsg = String(e?.message || '');
      if (errMsg.includes('not found') || errMsg.includes('404')) {
        try { localStorage.removeItem('deiza:activeChatId'); } catch {}
        currentChatIdRef.current = null;
        setCurrentChatId(undefined);
        setSearchParams(prev => {
          const next = new URLSearchParams(prev);
          next.delete('chat');
          return next;
        }, { replace: true });
        setMessages([]);
      } else {
        toast.error(apiErrorMessage(e, t, t('error.load')));
      }
    }
  };

  /** Delete without confirm — used by the mobile action sheet (the sheet IS the confirmation) */
  const performDeleteChat = async (chatId: number) => {
    const chat = chats.find(c => c.id === chatId);
    const chatTitle = chat?.title || t('ws.err.thisconversation');
    try {
      await api.deleteChat(chatId);
      nativeHaptic('success');
      setChats(prev => prev.filter(c => c.id !== chatId));
      if (currentChatId === chatId) handleNewChat();
      toast.success(t('ws.deleted', { title: chatTitle }));
    } catch (e) {
      nativeHaptic('error');
      toast.error(apiErrorMessage(e, t, t('ws.err.deletechat')));
    }
  };

  // Opens the in-app confirm dialog; actual deletion runs in performDeleteChat
  const handleDeleteChat = (e: React.MouseEvent, chatId: number) => {
    e.stopPropagation();
    haptic('warning');
    setConfirmDeleteChatId(chatId);
  };

  const startEditTitle = (e: React.MouseEvent, chat: Chat) => {
    e.stopPropagation();
    setEditingChatId(chat.id);
    setEditingTitle(chat.title);
  };

  const saveEditTitle = async (chatId: number) => {
    if (!editingTitle.trim()) { setEditingChatId(null); return; }
    try {
      await api.renameChat(chatId, editingTitle.trim());
      setChats(prev => prev.map(c => c.id === chatId ? { ...c, title: editingTitle.trim() } : c));
    } catch { toast.error(t('ws.err.rename')); }
    setEditingChatId(null);
  };

  const performTogglePin = async (chatId: number) => {
    const chat = chats.find(c => c.id === chatId);
    const next = !chat?.pinned;
    haptic('light');
    try {
      await api.pinChat(chatId, next);
      setChats(prev => prev.map(c => c.id === chatId ? { ...c, pinned: next } : c));
    } catch {
      toast.error(t('ws.err.pin'));
    }
  };

  const toggleChatPin = (e: React.MouseEvent, chatId: number) => {
    e.stopPropagation();
    performTogglePin(chatId);
  };

  // Sidebar usage countdown label (monotonic deadline, refreshed by usageTick)
  const sidebarResetLabel = (() => {
    void usageTick;
    if (resetDeadlineRef.current <= 0) return null;
    const diff = resetDeadlineRef.current - performance.now();
    if (diff <= 0) return null;
    const mins = Math.max(0, Math.ceil(diff / 60000));
    if (mins <= 0) return null;
    return mins < 60 ? `${mins}m` : `${Math.floor(mins / 60)}h ${mins % 60}m`;
  })();

  // One greeting variant per visit (avoids re-rolling on every render)
  const [greetingSeed] = useState(() => Math.random());

  // Hooks must stay above the authLoading early-return below.
  const isEmptyThread = messages.length === 0 && !restoringChat && !remoteGenDetail;
  // Enable the composer's layout animation only around the hero → dock hand-off,
  // so sidebar/keyboard shifts later on don't make the composer spring around.
  const [dockAnim, setDockAnim] = useState(true);
  useEffect(() => {
    if (isEmptyThread) { setDockAnim(true); return; }
    const id = setTimeout(() => setDockAnim(false), 900);
    return () => clearTimeout(id);
  }, [isEmptyThread]);

  if (authLoading) return <DeizaLoader fullScreen language={language} />;

  const handleNameDialogClose = () => {
    if (user) localStorage.setItem(`deiza_name_set_${user.id}`, '1');
    setShowNameDialog(false);
  };

  const isEmpty = messages.length === 0 && !restoringChat && !remoteGenDetail;
  const firstName = isAuthenticated && user?.name ? user.name.split(' ')[0] : '';
  const isTouchDevice = typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches;
  const modKey = /mac/i.test(navigator.platform || '') ? '⌘' : 'Ctrl+';
  const greeting = firstName ? pickGreeting(t, firstName, greetingSeed) : t('workspace.empty.title');
  const native = isNative();

  /**
   * The conversation column (thread + composer). Shared by the full-width view
   * and the split view next to an artifact.
   *
   * Empty state: greeting + composer float around the vertical centre; the
   * bottom spacer collapses on the first message and the composer glides down
   * to its dock (framer `layout` animation).
   */
  const sidePanel = artifactOpen && !isMobile;
  const renderThread = (inPanel: boolean) => {
    // Thread text keeps 16 px side margins on phones; the composer card sits 12 px from the edges.
    const padX = inPanel ? 'px-4 sm:px-7' : 'px-4 sm:px-6 lg:px-10';
    const composerPadX = inPanel ? 'px-3 sm:px-7' : 'px-3 sm:px-6 lg:px-10';
    const maxW = inPanel ? 'max-w-2xl' : 'max-w-3xl';
    const composerBusy = isLoading || !!remoteGenDetail;
    return (
      <>
        {/* Thread */}
        <div
          ref={messagesContainerRef}
          onScroll={handleMessagesScroll}
          className={`flex-1 overflow-y-auto overflow-x-hidden overscroll-contain ${isEmpty ? 'min-h-0' : 'pt-5 pb-4'}`}
        >
          <div className={`w-full ${maxW} mx-auto ${padX} min-h-full min-w-0 flex flex-col ${isEmpty ? 'justify-end' : ''}`}>
            <AnimatePresence initial={false}>
              {isEmpty && (
                <motion.div
                  key="hero"
                  className="flex flex-col items-center text-center px-2 pb-5 sm:pb-7"
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -22, transition: { duration: 0.22, ease: 'easeIn' } }}
                  transition={{ duration: 0.55, ease: [0.16, 1, 0.3, 1] }}
                >
                  <h2 className={`font-display tracking-tight text-foreground leading-tight w-full break-words text-[28px] sm:text-[38px]`}>
                    {greeting}
                  </h2>
                </motion.div>
              )}
            </AnimatePresence>

            {messages.map((msg, msgIdx) => {
              const isStreamingMsg = isLoading && msg.id === streamingMsgIdRef.current;
              if (msg.error) {
                return (
                  <motion.div
                    key={msg.id}
                    className="mb-7 sm:mb-10 flex items-start gap-3 rounded-2xl border border-destructive/25 bg-destructive/[0.06] px-4 py-3"
                    initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                  >
                    <span className="mt-[7px] w-1.5 h-1.5 rounded-full bg-destructive shrink-0" aria-hidden="true" />
                    <div className="flex-1 min-w-0">
                      <p className="font-body text-[14px] text-foreground/85 leading-relaxed">{msg.content}</p>
                      {msg.retryOf && (
                        <button
                          onClick={() => {
                            const again = msg.retryOf!;
                            setMessages(prev => {
                              const idx = prev.findIndex(m => m.id === msg.id);
                              const before = prev.slice(0, idx);
                              const lastUser = [...before].reverse().find(m => m.role === 'user' && m.content === again);
                              return before.filter(m => m !== lastUser);
                            });
                            setTimeout(() => handleSend(again), 0);
                          }}
                          className="mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-card border border-border/40 hover:border-primary/40 font-body text-[12.5px] text-foreground/85 transition-colors focus-ring"
                        >
                          {t('ws.retry')}
                        </button>
                      )}
                    </div>
                  </motion.div>
                );
              }
              if (isStreamingMsg && msg.content === '' && !msg.artifact) {
                return (
                  <div key={msg.id}>
                    <DeizaLoader language={language} model={model} thinkingSteps={streamingThinkingSteps} />
                  </div>
                );
              }
              return (
                <ChatMessage
                  key={msg.id}
                  messageId={msg.id}
                  role={msg.role === 'assistant' ? 'ai' : msg.role}
                  content={msg.content}
                  artifact={msg.artifact}
                  isStreaming={isStreamingMsg}
                  attachedFiles={msg.attachedFiles}
                  images={msg.images}
                  onArtifactClick={msg.artifact ? () => handleArtifactClick(msg.artifact!) : undefined}
                  sources={msg.sources}
                  onShare={msg.role === 'assistant' && !isDemoMode ? () => handleShareMessage(msg.id) : undefined}
                  canListen={!isDemoMode}
                  canReply={msgIdx === messages.length - 1 && !isLoading}
                  onQuickReply={handleQuickReply}
                  stopped={msg.stopped}
                  animateIn={!msg.fromHistory}
                />
              );
            })}

            {remoteGenDetail && !isLoading ? (
              <div className="my-2">
                {remoteGenDetail.content ? (
                  <>
                    {remoteGenDetail.thinking && (
                      <div className="flex items-center gap-2 px-1 pb-2 text-xs font-body text-foreground/60">
                        <Loader2 className="w-3.5 h-3.5 animate-spin text-primary" />
                        {remoteGenDetail.thinking}
                        <span className="text-border/40">·</span>
                        <span className="text-muted-foreground/50">{t('ws.remote.working')}</span>
                      </div>
                    )}
                    <ChatMessage role="ai" content={remoteGenDetail.content} isStreaming />
                  </>
                ) : (
                  <DeizaLoader language={language} model={model} thinkingSteps={remoteGenDetail.thinking ? [remoteGenDetail.thinking] : []} />
                )}
              </div>
            ) : null}
            <div ref={messagesEndRef} aria-hidden="true" className="h-px" />
          </div>
        </div>

        {/* Demo mode bar — slim, aligned with input width, non-intrusive */}
        {isDemoMode && (
          <div className={`shrink-0 ${composerPadX} pt-1.5 pb-0`}>
            <div className={`w-full ${maxW} mx-auto flex items-center gap-2 px-1`}>
              <span className="relative flex h-1.5 w-1.5 shrink-0" aria-hidden="true">
                <motion.span
                  className="absolute inline-flex h-full w-full rounded-full bg-primary/40"
                  animate={{ scale: [1, 2.2, 1], opacity: [0.5, 0, 0.5] }}
                  transition={{ duration: 2.2, repeat: Infinity, ease: 'easeOut' }}
                />
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-primary/70" />
              </span>
              <span className="flex-1 font-body text-[10px] text-muted-foreground/60 min-w-0 truncate">
                {t('ws.demo.nosaved')}
              </span>
              <button
                onClick={() => navigate('/login')}
                className="shrink-0 font-body text-[10px] text-primary hover:text-primary/70 font-medium transition-colors focus-ring rounded"
                aria-label={t('ws.createtaccount.free')}
              >
                {t('ws.createtaccount')}
              </button>
            </div>
          </div>
        )}

        {/* Composer — glides from the centre to the dock on the first message */}
        <motion.div
          layout={dockAnim ? 'position' : false}
          transition={{ type: 'spring', stiffness: 250, damping: 32, mass: 0.9 }}
          className={`relative z-10 shrink-0 ${composerPadX} pt-1.5 ${isEmpty ? 'pb-2' : 'pb-safe'}`}
        >
          {/* Soft fade so messages dissolve under the composer instead of clipping */}
          {!isEmpty && (
            <div className="pointer-events-none absolute inset-x-0 -top-8 h-8 bg-gradient-to-t from-background/90 to-transparent" aria-hidden="true" />
          )}
          <AnimatePresence>
            {showScrollDown && !isEmpty && (
              <div className="absolute inset-x-0 bottom-full mb-3 flex justify-center pointer-events-none z-20">
                <motion.button
                  type="button"
                  onClick={() => { haptic('light'); scrollToBottom('smooth'); }}
                  className="pointer-events-auto w-9 h-9 rounded-full bg-card/95 backdrop-blur-md border border-border/50 deiza-shadow-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:border-primary/40 transition-colors focus-ring"
                  initial={{ opacity: 0, y: 10, scale: 0.85 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 10, scale: 0.85 }}
                  transition={{ type: 'spring', stiffness: 420, damping: 30 }}
                  aria-label={t('ws.scrolldown')}
                  title={t('ws.scrolldown')}
                >
                  <ArrowDown className="w-4 h-4" />
                </motion.button>
              </div>
            )}
          </AnimatePresence>
          <ChatInput
            onSend={handleSend}
            onStop={handleStop}
            model={model}
            onModelChange={setModel}
            disabled={showNameDialog}
            busy={composerBusy}
            restoredValue={restoredInput}
            isDemo={isDemoMode}
            userPlan={userPlan}
            onUpgradeClick={() => navigate('/plans')}
            variant={isEmpty ? 'hero' : 'dock'}
          />
        </motion.div>

        {/* Empty state: rotating suggestion + spacer that keeps the composer near the centre */}
        {isEmpty && (
          <div className={`min-h-0 shrink flex flex-col items-center pt-3 pb-safe overflow-hidden flex-[1.15_1_0%]`}>
            <SamplePromptCarousel lang={language} onPick={(p) => setRestoredInput(p)} />
            {isAuthenticated && !isTouchDevice && (
              <div className="hidden md:flex items-center gap-5 mt-7 font-body text-[11px] text-muted-foreground/40 select-none">
                {[
                  [`${modKey}K`, t('ws.kbd.new')],
                  [`${modKey}B`, t('ws.kbd.sidebar')],
                  ['/', t('ws.kbd.focus')],
                  ['Esc', t('ws.kbd.stop')],
                ].map(([k, label]) => (
                  <span key={k} className="flex items-center gap-1.5">
                    <kbd className="px-1.5 py-0.5 rounded-md border border-border/40 bg-muted/30 text-[10px] font-medium text-muted-foreground/60 tracking-wide">{k}</kbd>
                    <span>{label}</span>
                  </span>
                ))}
              </div>
            )}
          </div>
        )}
      </>
    );
  };

  return (
    <div className="h-[100dvh] w-full flex bg-background relative overflow-hidden">
      <AmbientRose />
      <NameSetupDialog open={showNameDialog} onClose={handleNameDialogClose} />
      <AnnouncementModal
        open={announceOpen && !showNameDialog}
        onClose={closeAnnouncement}
        onTry={() => { closeAnnouncement(); navigate('/desktop'); }}
        onReadMore={() => { closeAnnouncement(); navigate('/noticias?post=deiza-escritorio'); }}
      />

      {/* Floating Announcement Toast for Deiza Code */}
      <AnimatePresence>
        {codeBannerOpen && !announceOpen && !showNameDialog && !inDesktopApp && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 15, scale: 0.95 }}
            transition={{ duration: 0.3, ease: 'easeOut' }}
            className="fixed bottom-5 right-5 z-50 max-w-sm w-[calc(100vw-2.5rem)] sm:w-96 rounded-2xl border border-[#8C2F39]/40 bg-[#121114]/90 backdrop-blur-xl p-4 shadow-2xl shadow-black/60 text-foreground"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-[#8C2F39]/20 border border-[#8C2F39]/40 flex items-center justify-center text-[#E17080]">
                  <Code2 className="w-4 h-4" />
                </div>
                <div>
                  <span className="text-[10px] font-mono font-semibold uppercase tracking-wider text-[#E17080] bg-[#8C2F39]/20 px-2 py-0.5 rounded-full">
                    Nuevo Lanzamiento
                  </span>
                  <h4 className="font-display font-medium text-sm text-foreground mt-0.5">
                    Deiza Code (CLI)
                  </h4>
                </div>
              </div>
              <button
                onClick={closeCodeBanner}
                className="text-muted-foreground/60 hover:text-foreground transition-colors p-1 rounded-lg hover:bg-white/5"
                aria-label="Cerrar"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="font-body text-xs text-muted-foreground mt-2.5 leading-relaxed">
              Agente autónomo para terminal impulsado en exclusiva por <strong className="text-foreground">Deiza Omniscient (Liquid 5)</strong> en la infraestructura dedicada de Deiza.
            </p>

            <div className="mt-3.5 flex items-center gap-2">
              <button
                onClick={() => { closeCodeBanner(); navigate('/download'); }}
                className="flex-1 px-3 py-1.5 rounded-xl bg-[#8C2F39] hover:bg-[#A33844] text-white font-body text-xs font-medium transition text-center shadow-sm"
              >
                Instalar / Comandos
              </button>
              <button
                onClick={() => { closeCodeBanner(); navigate('/noticias?post=deiza-code-cli'); }}
                className="px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-muted-foreground hover:text-foreground font-body text-xs transition"
              >
                Detalles
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Project detail panel */}
      <ProjectPanel
        projectId={projectPanelId}
        open={projectPanelId !== null}
        onClose={() => setProjectPanelId(null)}
        onNewChat={startProjectChat}
        onOpenChat={(cid) => handleChatSelect(cid)}
        onDeleted={() => { loadProjects(); loadChats(); setActiveProjectId(null); }}
        language={language}
      />

      {/* In-app delete confirmation (replaces native window.confirm) */}
      <ConfirmDialog
        open={confirmDeleteChatId !== null}
        title={t('ws.confirm.delete.title')}
        message={(() => {
          const chatTitle = chats.find(c => c.id === confirmDeleteChatId)?.title;
          return t('ws.confirm.delete.message', { title: chatTitle || t('ws.err.thisconversation') });
        })()}
        confirmLabel={t('ws.delete')}
        cancelLabel={t('ws.cancel')}
        destructive
        onCancel={() => setConfirmDeleteChatId(null)}
        onConfirm={() => { if (confirmDeleteChatId !== null) performDeleteChat(confirmDeleteChatId); setConfirmDeleteChatId(null); }}
      />

      {/* Mobile: long-press a conversation → action sheet (rename / delete) */}
      <ActionSheet
        open={!!sheetChat}
        onClose={() => setSheetChat(null)}
        title={sheetChat?.title}
        cancelLabel={t('ws.cancel')}
        actions={sheetChat ? [
          {
            label: sheetChat.pinned ? t('ws.unpin') : t('ws.pin'),
            icon: sheetChat.pinned ? PinOff : Pin,
            onClick: () => performTogglePin(sheetChat.id),
          },
          {
            label: t('ws.rename'),
            icon: Pencil,
            onClick: () => {
              setEditingChatId(sheetChat.id);
              setEditingTitle(sheetChat.title);
            },
          },
          {
            label: t('ws.deleteconversation'),
            icon: Trash2,
            destructive: true,
            onClick: () => setConfirmDeleteChatId(sheetChat.id),
          },
        ] : []}
      />

      {/* ── Mobile sidebar — always in DOM, position driven by motion value ── */}
      {isAuthenticated && isMobile && (
        <>
          {/* Backdrop: opacity + pointer-events driven by sidebar x position */}
          <motion.div
            className="fixed inset-0 z-40 bg-black/40"
            style={{ opacity: mobileSidebarOpacity, pointerEvents: mobileSidebarPointerEvents as any }}
            onClick={() => { haptic('light'); setSidebarOpen(false); }}
            aria-hidden="true"
          />
          {/* Sidebar panel */}
          <motion.aside
            className="fixed inset-y-0 left-0 z-50 flex flex-col shrink-0 bg-card/97 backdrop-blur-xl deiza-border border-t-0 border-b-0 border-l-0 overflow-hidden shadow-2xl"
            style={{ x: mobileSidebarX, width: MOBILE_SIDEBAR_W }}
            aria-label="Conversation history"
          >
          <SidebarContent
            isMobile={isMobile}
            user={user}
            userPlan={userPlan}
            planUsage={planUsage}
            resetLabel={sidebarResetLabel}
            chats={chats}
            currentChatId={currentChatId}
            processingChatIds={processingChatIds}
            isChatUnread={isChatUnread}
            editingChatId={editingChatId}
            editingTitle={editingTitle}
            setEditingTitle={setEditingTitle}
            onSelectChat={handleChatSelect}
            onStartEdit={startEditTitle}
            onSaveEdit={saveEditTitle}
            onCancelEdit={() => setEditingChatId(null)}
            onTogglePin={toggleChatPin}
            onDeleteChat={handleDeleteChat}
            longPressHandlers={chatLongPressHandlers}
            onNewChat={handleNewChat}
            projects={projects}
            creatingProject={creatingProject}
            newProjectName={newProjectName}
            setNewProjectName={setNewProjectName}
            onSubmitProject={handleCreateProject}
            onStartCreateProject={() => { setCreatingProject(true); setNewProjectName(''); }}
            onCancelCreateProject={() => { setCreatingProject(false); setNewProjectName(''); }}
            onOpenProject={(id) => setProjectPanelId(id)}
            onLogout={handleLogout}
  modKey={isTouchDevice ? '' : modKey}
          />
          </motion.aside>
        </>
      )}

      {/* ── Desktop sidebar (collapsible, authenticated only) ── */}
      <AnimatePresence initial={false}>
        {isAuthenticated && sidebarOpen && !isMobile && (
          <motion.aside
            key="sidebar-desktop"
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: 276, opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            transition={{ duration: 0.22, ease: 'easeInOut' }}
            className="relative z-20 flex flex-col shrink-0 bg-card/80 backdrop-blur-sm deiza-border border-t-0 border-b-0 border-l-0 overflow-hidden"
            aria-label="Conversation history"
          >
            <SidebarContent
              isMobile={isMobile}
              user={user}
              userPlan={userPlan}
              planUsage={planUsage}
              resetLabel={sidebarResetLabel}
              chats={chats}
              currentChatId={currentChatId}
              processingChatIds={processingChatIds}
              isChatUnread={isChatUnread}
              editingChatId={editingChatId}
              editingTitle={editingTitle}
              setEditingTitle={setEditingTitle}
              onSelectChat={handleChatSelect}
              onStartEdit={startEditTitle}
              onSaveEdit={saveEditTitle}
              onCancelEdit={() => setEditingChatId(null)}
              onTogglePin={toggleChatPin}
              onDeleteChat={handleDeleteChat}
              longPressHandlers={chatLongPressHandlers}
              onNewChat={handleNewChat}
              projects={projects}
              creatingProject={creatingProject}
              newProjectName={newProjectName}
              setNewProjectName={setNewProjectName}
              onSubmitProject={handleCreateProject}
              onStartCreateProject={() => { setCreatingProject(true); setNewProjectName(''); }}
              onCancelCreateProject={() => { setCreatingProject(false); setNewProjectName(''); }}
              onOpenProject={(id) => setProjectPanelId(id)}
              onLogout={handleLogout}
  modKey={isTouchDevice ? '' : modKey}
            />
          </motion.aside>
        )}
      </AnimatePresence>

      {/* ── Main column ── */}
      <div className="flex-1 flex flex-col min-w-0 relative overflow-x-hidden">

        {/* Messages + Input — resizable panels on desktop, overlay on mobile */}
        <div className="flex-1 flex overflow-x-hidden min-h-0">
          {/* One stable tree: the chat panel is never remounted when the artifact panel
              opens or closes (that remount reloaded every image and iframe in the thread). */}
          <PanelGroup direction="horizontal" className="flex-1">
            <Panel id="chat" order={1} defaultSize={sidePanel ? 52 : 100} minSize={30}>
              <div className="flex flex-col h-full min-h-0 min-w-0 relative overflow-x-hidden">
              <header className="relative shrink-0 flex items-center justify-between px-3 sm:px-6 h-[calc(56px+env(safe-area-inset-top,0px))] pt-[env(safe-area-inset-top,0px)] border-b border-border/25 bg-background/70 backdrop-blur-md">
                <div className="flex items-center gap-1.5 sm:gap-2 min-w-0">
                  {isAuthenticated && (
                    <button onClick={() => { haptic('light'); setSidebarOpen(v => !v); }} className="p-2 hover:bg-muted rounded-full transition-colors focus-ring shrink-0" aria-label={sidebarOpen ? t('ws.close.sidebar') : t('ws.open.sidebar')}>
                      {sidebarOpen ? <PanelLeftClose className="w-4 h-4 text-muted-foreground" /> : <PanelLeftOpen className="w-4 h-4 text-muted-foreground" />}
                    </button>
                  )}
                  <button onClick={handleLogoClick} className="flex items-center gap-2 hover:opacity-70 transition-opacity focus-ring rounded-lg shrink-0" aria-label={isDemoMode ? t('ws.home') : t('ws.newchat')}>
                    <img src={logo} alt="" className="w-10 h-10 sm:w-12 sm:h-12 blend-multiply" aria-hidden="true" />
                    <span className="font-display text-[22px] sm:text-[26px] tracking-tight text-foreground">Deiza</span>
                  </button>
                  {/* Active project chip */}
                  {activeProjectId && !sidePanel && (() => {
                    const p = projects.find(x => x.id === activeProjectId);
                    return p ? (
                      <button
                        onClick={() => setProjectPanelId(p.id)}
                        className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-primary/10 hover:bg-primary/20 transition-colors focus-ring max-w-[130px] sm:max-w-[200px]"
                        title={p.name}
                      >
                        <FolderOpen className="w-3 h-3 text-primary shrink-0" />
                        <span className="font-body text-[11px] text-primary truncate">{p.name}</span>
                      </button>
                    ) : null;
                  })()}
                </div>
                <div className="flex items-center gap-0.5 sm:gap-1 shrink-0">
                  {isAuthenticated && userPlan !== 'signet' && !native && !sidePanel && (
                    <motion.button
                      onClick={() => navigate('/plans')}
                      className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-full bg-muted/50 hover:bg-muted transition-colors focus-ring"
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ delay: 0.6 }}
                      aria-label={t('ws.plan.viewplans')}
                    >
                      <Sparkles className="w-3 h-3 text-violet-400" />
                      <span className="font-body text-[11px] text-muted-foreground hidden sm:inline">
                        {userPlan === 'free' ? t('ws.upgrade') : t('ws.gosignet')}
                      </span>
                    </motion.button>
                  )}
                  {isAuthenticated && planUsage && planUsage.token_limit > 0 && !sidePanel && (() => {
                    const pct = planUsage.tokens_used / planUsage.token_limit;
                    if (pct < 0.7) return null;
                    return (
                      <motion.button
                        onClick={() => navigate('/plans')}
                        className="flex items-center gap-1 px-2 py-1.5 rounded-full bg-amber-500/10 hover:bg-amber-500/20 transition-colors focus-ring"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        aria-label={t('ws.usage.nearlimit')}
                      >
                        <span className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0" />
                        <span className="font-body text-[11px] text-amber-400 hidden sm:inline">
                          {Math.round(pct * 100)}%
                        </span>
                      </motion.button>
                    );
                  })()}
                  {!isDemoMode && isAuthenticated && currentChatId && messages.length > 0 && (
                    <button onClick={handleShareChat} className="p-2 hover:bg-muted rounded-full transition-colors focus-ring" aria-label={t('ws.share.chat')} title={t('ws.share.chat')}>
                      <Share2 className="w-4 h-4 text-muted-foreground" />
                    </button>
                  )}
                  {isAuthenticated && !isDemoMode && (
                    <button onClick={() => navigate('/search')} className="p-2 hover:bg-muted rounded-full transition-colors focus-ring" aria-label="Deiza Search" title="Deiza Search">
                      <Search className="w-4 h-4 text-muted-foreground" />
                    </button>
                  )}
                  {isAuthenticated && !isDemoMode && showDesktopDownload && (
                    <button onClick={() => navigate('/desktop')} className="p-2 hover:bg-muted rounded-full transition-colors focus-ring" aria-label={t('ws.desktop')} title={t('ws.desktop')}>
                      <MonitorDown className="w-4 h-4 text-muted-foreground" />
                    </button>
                  )}
                  {isAuthenticated && !isDemoMode && (
                    <button onClick={openCode} className="p-2 hover:bg-muted rounded-full transition-colors focus-ring" aria-label="Deiza Code" title="Deiza Code">
                      <Code2 className="w-4 h-4 text-muted-foreground" />
                    </button>
                  )}
                  {isAuthenticated && !isDemoMode && !sidePanel && (
                    <button onClick={() => navigate('/docs')} className="hidden sm:inline-flex p-2 hover:bg-muted rounded-full transition-colors focus-ring" aria-label={t('ws.docs')} title={t('ws.docs')}>
                      <BookOpen className="w-4 h-4 text-muted-foreground" />
                    </button>
                  )}
                </div>
              </header>

              {renderThread(sidePanel)}

              {/* Mobile artifact overlay — bottom sheet */}
              {isMobile && (
                <ArtifactPanel
                  open={artifactOpen}
                  onClose={() => setArtifactOpen(false)}
                  artifact={activeArtifact}
                  historyIndex={artifactHistoryIndex}
                  historyTotal={artifactHistory.length}
                  onPrev={handleArtifactPrev}
                  onNext={handleArtifactNext}
                />
              )}
              </div>
            </Panel>

            {sidePanel && (
              <>
                <PanelResizeHandle id="artifact-handle" className="w-1.5 group flex items-center justify-center bg-transparent hover:bg-border/40 transition-colors cursor-col-resize relative">
                  <div className="w-0.5 h-12 rounded-full bg-border/40 group-hover:bg-border group-active:bg-primary/40 transition-colors" />
                </PanelResizeHandle>
                <Panel id="artifact" order={2} defaultSize={48} minSize={25}>
                  <ArtifactPanel
                    open={artifactOpen}
                    onClose={() => setArtifactOpen(false)}
                    artifact={activeArtifact}
                    inline
                    historyIndex={artifactHistoryIndex}
                    historyTotal={artifactHistory.length}
                    onPrev={handleArtifactPrev}
                    onNext={handleArtifactNext}
                  />
                </Panel>
              </>
            )}
          </PanelGroup>
        </div>
      </div>
    </div>
  );
};

export default Workspace;
