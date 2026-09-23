import { lazy, Suspense, useEffect } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Route, Routes, Navigate, useNavigate, useLocation } from 'react-router-dom';
import { Toaster as Sonner } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import { AuthProvider, useAuth } from '@/contexts/AuthContext';
import { LanguageProvider } from '@/contexts/LanguageContext';
import ErrorBoundary from '@/components/ErrorBoundary';
import CookieNotice from '@/components/deiza/CookieNotice';
import { lazyRetry } from '@/lib/lazyRetry';
import { isNative, installExternalLinkHandler, onAppUrlOpen, installBackButton } from '@/lib/native';
import { isDesktopApp } from '@/lib/desktop';
import RoseMark from '@/components/deiza/RoseMark';
import { motion } from 'framer-motion';

const Search = lazy(() => lazyRetry(() => import('./pages/Search')));
const Landing = lazy(() => lazyRetry(() => import('./pages/Landing')));
const Workspace = lazy(() => lazyRetry(() => import('./pages/Workspace')));
const Login = lazy(() => lazyRetry(() => import('./pages/Login')));
const Download = lazy(() => lazyRetry(() => import('./pages/Download')));
const AppPage = lazy(() => lazyRetry(() => import('./pages/AppPage')));
const Plans = lazy(() => lazyRetry(() => import('./pages/Plans')));
const Redeem = lazy(() => lazyRetry(() => import('./pages/Redeem')));
const NotFound = lazy(() => lazyRetry(() => import('./pages/NotFound')));
const News = lazy(() => lazyRetry(() => import('./pages/News')));
const Docs = lazy(() => lazyRetry(() => import('./pages/Docs')));
const SharedArtifactPage = lazy(() => lazyRetry(() => import('./pages/SharedArtifact')));
const SharedConversationPage = lazy(() => lazyRetry(() => import('./pages/SharedConversation')));
const SettingsPage = lazy(() => lazyRetry(() => import('./pages/Settings')));
const CodePage = lazy(() => lazyRetry(() => import('./pages/Code')));
const LegalPage = lazy(() => lazyRetry(() => import('./pages/Legal')));
const CliAuth = lazy(() => lazyRetry(() => import('./pages/CliAuth')));
const DesktopPage = lazy(() => lazyRetry(() => import('./pages/Desktop')));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 30_000,
    },
  },
});

/**
 * Page loader — used for lazy route code-splitting and initial app load.
 * The Deiza rose draws itself in and out (SVG, RoseMark) while the route loads.
 */
const PageLoader = () => (
  <div className="fixed inset-0 bg-background flex flex-col items-center justify-center z-[999] gap-8">
    <div
      className="absolute"
      style={{
        width: 280, height: 280,
        background: 'radial-gradient(ellipse at center, hsl(var(--primary) / 0.08) 0%, transparent 70%)',
        borderRadius: '50%',
      }}
      aria-hidden="true"
    />
    <RoseMark size={132} mode="bloom" className="relative z-10" />
    <motion.p
      className="font-display text-2xl text-foreground/25 tracking-[0.3em] uppercase relative z-10"
      animate={{ opacity: [0.2, 0.5, 0.2] }}
      transition={{ duration: 2.4, ease: 'easeInOut', repeat: Infinity }}
      aria-hidden="true"
    >
      Deiza
    </motion.p>
  </div>
);

/**
 * Native root: the app has no marketing landing. Signed in → workspace, otherwise login.
 * (The web keeps the landing page at "/".)
 */
const NativeRoot = () => {
  const { isAuthenticated, loading } = useAuth();
  if (loading) return <PageLoader />;
  return <Navigate to={isAuthenticated ? '/workspace' : '/login'} replace />;
};

/** App-shell glue: in-app browser for external links, deep links, Android back. */
const NativeShell = () => {
  const navigate = useNavigate();
  const location = useLocation();
  useEffect(() => installExternalLinkHandler(), []);
  useEffect(() => installBackButton(), []);
  useEffect(() => onAppUrlOpen((path) => { if (path.startsWith('/')) navigate(path); }), [navigate]);
  // Scroll to top on route change for document-style pages (chat keeps its own scroll)
  useEffect(() => { if (!location.pathname.startsWith('/workspace')) window.scrollTo(0, 0); }, [location.pathname]);
  return null;
};

const native = isNative();

const App = () => (
  <ErrorBoundary>
    <QueryClientProvider client={queryClient}>
      <LanguageProvider>
        <AuthProvider>
          <TooltipProvider>
            <Sonner
              position="top-center"
              offset={native ? 'calc(env(safe-area-inset-top, 0px) + 12px)' : undefined}
              toastOptions={{
                className: 'font-body',
                style: {
                  background: 'hsl(var(--card))',
                  border: '0.5px solid hsl(var(--border) / 0.3)',
                  color: 'hsl(var(--foreground))',
                },
              }}
            />
            <BrowserRouter>
              <NativeShell />
              {/* PageLoader ≠ DeizaLoader — no AI thinking animation for page loads */}
              <Suspense fallback={<PageLoader />}>
                <Routes>
                  <Route path="/" element={native ? <NativeRoot /> : <Landing />} />
                  <Route path="/search" element={<Search />} />
                  <Route path="/workspace" element={<Workspace />} />
                  <Route path="/login" element={<Login />} />
                  <Route path="/app" element={native ? <Navigate to="/workspace" replace /> : <AppPage />} />
                  <Route path="/download" element={<Download />} />
                  <Route path="/downloads" element={<Download />} />
                  <Route path="/descargar" element={<Download />} />
                  <Route path="/deiza-code" element={<Download />} />
                  <Route path="/plans" element={<Plans />} />
                  <Route path="/redeem/:code" element={<Redeem />} />
                  <Route path="/s/:slug" element={<SharedArtifactPage />} />
                  <Route path="/c/:token" element={<SharedConversationPage />} />
                  <Route path="/settings" element={<SettingsPage />} />
                  <Route path="/design" element={<Navigate to="/workspace" replace />} />
                  <Route path="/code" element={<Download />} />
                  <Route path="/cli/auth" element={<CliAuth />} />
                  <Route path="/desktop" element={<DesktopPage />} />
                  <Route path="/escritorio" element={<DesktopPage />} />
                  <Route path="/download/desktop" element={<DesktopPage />} />
                  <Route path="/noticias" element={<News />} />
                  <Route path="/news" element={<News />} />
                  <Route path="/docs" element={<Docs />} />
                  <Route path="/legal" element={<Navigate to="/legal/aviso-legal" replace />} />
                  <Route path="/legal/:doc" element={<LegalPage />} />
                  <Route path="/privacidad" element={<Navigate to="/legal/privacidad" replace />} />
                  <Route path="/privacy" element={<Navigate to="/legal/privacidad" replace />} />
                  <Route path="/terminos" element={<Navigate to="/legal/terminos" replace />} />
                  <Route path="/terms" element={<Navigate to="/legal/terminos" replace />} />
                  <Route path="/cookies" element={<Navigate to="/legal/cookies" replace />} />
                  <Route path="/reembolsos" element={<Navigate to="/legal/reembolsos" replace />} />
                  <Route path="/refunds" element={<Navigate to="/legal/reembolsos" replace />} />
                  <Route path="/aviso-legal" element={<Navigate to="/legal/aviso-legal" replace />} />
                  <Route path="/documentacion" element={<Docs />} />
                  <Route path="*" element={<NotFound />} />
                </Routes>
                {!native && !isDesktopApp() && <CookieNotice />}
              </Suspense>
            </BrowserRouter>
          </TooltipProvider>
        </AuthProvider>
      </LanguageProvider>
    </QueryClientProvider>
  </ErrorBoundary>
);

export default App;
