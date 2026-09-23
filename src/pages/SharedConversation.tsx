import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import logo from '@/assets/logo.png';
import { api } from '@/services/api';
import { useLanguage } from '@/contexts/LanguageContext';
import ChatMessage from '@/components/deiza/ChatMessage';

interface SharedMsg {
  role: string;
  content: string;
  artifact?: { name: string; type: string; content?: string; url?: string };
  meta?: { sources?: any[]; images?: any[] } | null;
  attachments?: any[];
}

const SharedConversationPage = () => {
  const { token } = useParams<{ token: string }>();
  const { t } = useLanguage();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    api.fetchShared(token)
      .then(d => { setData(d); setLoading(false); })
      .catch(err => { setError(err.message); setLoading(false); });
  }, [token]);

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <motion.div className="flex flex-col items-center gap-4" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
          <img src={logo} alt="Deiza" className="w-16 h-16 blend-multiply animate-pulse" />
          <p className="font-body text-muted-foreground text-sm">{t('common.loading')}</p>
        </motion.div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center space-y-4">
          <img src={logo} alt="Deiza" className="w-16 h-16 blend-multiply mx-auto opacity-50" />
          <h1 className="font-display text-2xl text-foreground">{t('sh.notfound.title')}</h1>
          <p className="font-body text-muted-foreground text-sm">{t('sh.notfound.sub')}</p>
          <a href="/" className="inline-block mt-4 px-6 py-2.5 bg-primary text-primary-foreground rounded-full font-body text-sm hover:opacity-90 transition-opacity">
            {t('sh.cta')}
          </a>
        </div>
      </div>
    );
  }

  const messages: SharedMsg[] = data.payload?.messages || [];

  return (
    <div className="h-[100dvh] bg-background flex flex-col overflow-hidden">
      {/* Header */}
      <header className="shrink-0 flex items-center justify-between px-4 sm:px-8 h-[calc(56px+env(safe-area-inset-top,0px))] pt-[env(safe-area-inset-top,0px)] border-b border-border/30 bg-card/80 backdrop-blur-sm">
        <div className="flex items-center gap-3 min-w-0">
          <a href="/" className="flex items-center gap-2 hover:opacity-70 transition-opacity shrink-0">
            <img src={logo} alt="" className="w-8 h-8 blend-multiply" />
            <span className="font-display text-xl text-foreground">Deiza</span>
          </a>
          <span className="text-border/60 hidden sm:inline">|</span>
          <span className="font-body text-sm text-muted-foreground truncate hidden sm:block">{data.title}</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="font-body text-xs text-muted-foreground/60 hidden sm:block">
            {data.view_count} {t('sh.views')}
          </span>
          <a href="/workspace" className="px-4 py-1.5 bg-primary/10 hover:bg-primary/20 text-primary rounded-full font-body text-xs transition-colors shrink-0">
            {t('sh.cta')} →
          </a>
        </div>
      </header>

      {/* Read-only conversation */}
      <main className="flex-1 overflow-y-auto min-h-0 -webkit-overflow-scrolling-touch">
        <div className="mx-auto max-w-2xl px-4 sm:px-8 py-5">
          <p className="font-display text-lg sm:text-xl font-semibold text-foreground mb-6 mt-2">{data.title}</p>
          <div className="space-y-6">
            {messages.map((msg, i) => (
              <ChatMessage
                key={i}
                role={msg.role === 'user' ? 'user' : 'ai'}
                content={msg.content}
                artifact={msg.artifact}
                attachedFiles={msg.attachments}
                images={msg.meta?.images?.filter((im: any) => im && im.url)}
                sources={msg.meta?.sources?.filter((s: any) => s && s.url)}
              />
            ))}
          </div>
          <div className="mt-10 pb-6 text-center">
            <p className="font-body text-[11px] text-muted-foreground/50">
              {t('sh.footer')} · deiza.org
            </p>
          </div>
        </div>
      </main>
    </div>
  );
};

export default SharedConversationPage;