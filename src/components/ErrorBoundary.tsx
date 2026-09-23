import { Component, ReactNode } from 'react';

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

const COPY: Record<string, { title: string; body: string; cta: string }> = {
  es: { title: 'Algo ha salido mal', body: 'Un error inesperado ha interrumpido Deiza. Vuelve a cargar para continuar; tu conversación está guardada.', cta: 'Volver a cargar' },
  en: { title: 'Something went wrong', body: 'An unexpected error interrupted Deiza. Reload to continue; your conversation is saved.', cta: 'Reload' },
};

/**
 * Last line of defence: a calm, branded screen instead of a white page. The stack
 * trace is never shown to the user (it is logged to the console for debugging).
 */
class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('ErrorBoundary caught:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;
      let lang = 'es';
      try { lang = (localStorage.getItem('deiza-language') || navigator.language || 'es').slice(0, 2); } catch { /* noop */ }
      const c = COPY[lang] || COPY.en;
      return (
        <div className="min-h-[100dvh] flex items-center justify-center bg-background p-6" style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}>
          <div className="text-center max-w-sm space-y-5">
            <div className="w-14 h-14 mx-auto rounded-2xl bg-destructive/10 flex items-center justify-center">
              <span className="text-2xl text-destructive font-display">!</span>
            </div>
            <h1 className="font-display text-2xl text-foreground tracking-tight">{c.title}</h1>
            <p className="font-body text-sm text-muted-foreground leading-relaxed">{c.body}</p>
            <button
              onClick={() => window.location.reload()}
              className="font-body text-sm font-medium bg-primary text-primary-foreground px-8 py-3 rounded-full hover:bg-primary/90 transition-colors focus-ring"
            >
              {c.cta}
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
