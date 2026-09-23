import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Check, Code2, Copy, Download, MessageSquare, Terminal } from 'lucide-react';
import { toast } from 'sonner';
import AmbientRose from '@/components/deiza/AmbientRose';
import RoseMark from '@/components/deiza/RoseMark';
import { useLanguage } from '@/contexts/LanguageContext';
import {
  DESKTOP_INSTALL, FALLBACK_RELEASE, desktopBridge, desktopFileUrl, detectDesktopOS, detectMacArch, fetchDesktopRelease,
  type DesktopOS, type DesktopRelease,
} from '@/lib/desktop';

type Tab = 'mac' | 'windows';

const fmtSize = (bytes?: number) => (bytes ? `${Math.round(bytes / 1048576)} MB` : '');

/** Deiza for desktop: download page (macOS + Windows). */
export default function Desktop() {
  const navigate = useNavigate();
  const { t } = useLanguage();
  const [release, setRelease] = useState<DesktopRelease>(FALLBACK_RELEASE);
  const [os, setOs] = useState<DesktopOS>('other');
  const [arch, setArch] = useState<'arm64' | 'x64' | 'unknown'>('unknown');
  const [tab, setTab] = useState<Tab>('mac');
  const [copied, setCopied] = useState<string | null>(null);
  const bridge = desktopBridge();

  useEffect(() => {
    const detected = detectDesktopOS();
    setOs(detected);
    if (detected === 'windows') setTab('windows');
    if (detected === 'mac') detectMacArch().then(setArch);
    fetchDesktopRelease().then(setRelease);
    document.title = `${t('dk.meta.title')} · Deiza`;
  }, [t]);

  const macKey = arch === 'x64' ? 'mac-x64' : 'mac-arm64';
  const primary = os === 'windows'
    ? { href: desktopFileUrl(release, 'win-x64'), label: t('dk.cta.win'), size: release.sizes?.['win-x64'] }
    : { href: desktopFileUrl(release, macKey), label: t('dk.cta.mac'), size: release.sizes?.[macKey] };

  const copy = (text: string, id: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(id);
      toast.success(t('dk.copied'));
      setTimeout(() => setCopied(null), 1800);
    }).catch(() => { /* clipboard blocked */ });
  };

  const fade = (delay = 0) => ({ initial: { opacity: 0, y: 14 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.55, delay, ease: [0.16, 1, 0.3, 1] as const } });

  const Command = ({ id, cmd }: { id: string; cmd: string }) => (
    <div className="flex items-center gap-3 rounded-2xl bg-muted/60 border border-border/40 pl-4 pr-2 py-2">
      <Terminal className="w-4 h-4 text-muted-foreground shrink-0" aria-hidden="true" />
      <code className="flex-1 min-w-0 overflow-x-auto whitespace-nowrap font-mono text-[12.5px] text-foreground/90">{cmd}</code>
      <button
        onClick={() => copy(cmd, id)}
        className="shrink-0 inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-card border border-border/40 font-body text-xs font-medium hover:bg-muted transition-colors focus-ring"
      >
        {copied === id ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
        {copied === id ? t('dk.copied.short') : t('dk.copy')}
      </button>
    </div>
  );

  const FirstOpen = ({ os }: { os: 'mac' | 'win' }) => (
    <div className="mt-4 rounded-2xl border border-border/40 bg-muted/30 px-5 py-4">
      <p className="font-display text-lg">{t('dk.steps.title')}</p>
      <ol className="mt-3 space-y-2.5">
        {[1, 2, 3].map(i => (
          <li key={i} className="flex gap-3 font-body text-sm text-foreground/85 leading-relaxed">
            <span className="w-6 h-6 rounded-full border border-border/60 flex items-center justify-center shrink-0 font-body text-xs text-muted-foreground">{i}</span>
            <span>{t(`dk.steps.${os}.${i}`)}</span>
          </li>
        ))}
      </ol>
      <p className="font-body text-xs text-muted-foreground leading-relaxed mt-3">{t('dk.steps.why')}</p>
    </div>
  );

  const DownloadRow = ({ href, title, sub, size, recommended }: { href: string; title: string; sub: string; size?: number; recommended?: boolean }) => (
    <a
      href={href}
      className={`group flex items-center gap-4 rounded-2xl px-4 py-3.5 border transition-colors focus-ring ${recommended ? 'border-primary/40 bg-primary/[0.06] hover:bg-primary/10' : 'border-border/40 bg-card/60 hover:bg-muted/50'}`}
    >
      <span className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${recommended ? 'bg-primary text-primary-foreground' : 'bg-muted text-foreground/80'}`}>
        <Download className="w-4 h-4" aria-hidden="true" />
      </span>
      <span className="flex-1 min-w-0">
        <span className="block font-body text-sm font-medium text-foreground">{title}</span>
        <span className="block font-body text-xs text-muted-foreground mt-0.5">{sub}{size ? ` · ${fmtSize(size)}` : ''}</span>
      </span>
      {recommended && <span className="hidden sm:inline font-body text-[10px] font-semibold uppercase tracking-[0.16em] text-primary">{t('dk.recommended')}</span>}
    </a>
  );

  return (
    <div className="min-h-screen bg-background text-foreground relative overflow-x-hidden selection:bg-primary/20">
      <AmbientRose />

      <header className="fixed top-0 inset-x-0 z-40 bg-background/80 backdrop-blur-xl border-b border-border/30">
        <div className="max-w-6xl mx-auto h-16 px-4 sm:px-6 flex items-center justify-between">
          <button onClick={() => navigate('/')} className="flex items-center gap-2 font-body text-sm text-muted-foreground hover:text-foreground transition-colors rounded-lg px-2 py-1 focus-ring">
            <ArrowLeft className="w-4 h-4" /> Deiza
          </button>
          <span className="flex items-center gap-2">
            <RoseMark size={26} mode="still" />
            <span className="font-display text-lg tracking-tight">{t('dk.meta.title')}</span>
          </span>
          <button onClick={() => navigate('/download')} className="hidden sm:inline-flex items-center gap-1.5 font-body text-xs text-muted-foreground hover:text-foreground px-3 py-1.5 rounded-full border border-border/50 hover:bg-muted/40 transition-colors focus-ring">
            <Terminal className="w-3.5 h-3.5" /> {t('dk.cli.short')}
          </button>
        </div>
      </header>

      <main className="relative z-10 max-w-6xl mx-auto px-5 sm:px-8 pt-28 sm:pt-32 pb-24">
        {/* hero */}
        <section className="grid lg:grid-cols-[1fr_1.15fr] gap-10 lg:gap-14 items-center">
          <div>
            <motion.div {...fade(0)} className="flex items-center gap-3">
              <RoseMark size={40} mode="draw" />
              <span className="font-body text-[12px] font-medium tracking-[0.06em] text-primary/90">{t('dk.kicker')}</span>
            </motion.div>
            <motion.h1 {...fade(0.06)} className="font-display text-[44px] sm:text-6xl leading-[1.02] tracking-tight mt-5">
              {t('dk.title.a')} <em className="text-primary not-italic sm:italic">{t('dk.title.b')}</em>
            </motion.h1>
            <motion.p {...fade(0.12)} className="font-body text-base sm:text-lg text-muted-foreground leading-relaxed mt-5 max-w-xl">
              {t('dk.lead')}
            </motion.p>

            <motion.div {...fade(0.18)} className="mt-8">
              {bridge ? (
                <div className="inline-flex items-center gap-2 rounded-2xl border border-border/50 bg-card/70 px-4 py-3 font-body text-sm">
                  <Check className="w-4 h-4 text-primary" /> {t('dk.inapp', { v: bridge.version || release.version })}
                </div>
              ) : os === 'mobile' ? (
                <p className="font-body text-sm text-muted-foreground max-w-md rounded-2xl border border-border/50 bg-card/70 px-4 py-3">{t('dk.mobile')}</p>
              ) : (
                <div className="flex flex-wrap items-center gap-3">
                  <a href={primary.href} className="inline-flex items-center gap-2.5 rounded-2xl bg-primary text-primary-foreground px-6 py-3.5 font-body text-sm font-semibold deiza-shadow hover:brightness-110 transition focus-ring">
                    <Download className="w-4 h-4" /> {primary.label}
                  </a>
                  <a href="#instalar" className="inline-flex items-center gap-2 rounded-2xl px-5 py-3.5 font-body text-sm font-medium border border-border/50 bg-card/60 hover:bg-muted/50 transition-colors focus-ring">
                    {t('dk.cta.other')}
                  </a>
                </div>
              )}
              <p className="font-body text-xs text-muted-foreground/70 mt-4">
                {t('dk.meta', { v: release.version })}
              </p>
            </motion.div>
          </div>

          <motion.figure
            initial={{ opacity: 0, scale: 0.97, y: 16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ duration: 0.9, delay: 0.1, ease: [0.16, 1, 0.3, 1] }}
            className="relative"
          >
            <img
              src="/art/desktop.webp"
              srcSet="/art/desktop.webp 1376w, /art/desktop@2x.webp 2752w"
              sizes="(min-width: 1024px) 600px, 100vw"
              alt={t('dk.art.alt')}
              className="w-full rounded-[28px] border border-border/30 deiza-shadow-lg"
              loading="eager"
            />
          </motion.figure>
        </section>

        {/* modes */}
        <section className="mt-24 sm:mt-28">
          <p className="font-body text-[10.5px] font-semibold uppercase tracking-[0.22em] text-muted-foreground/70">{t('dk.modes.kicker')}</p>
          <h2 className="font-display text-3xl sm:text-4xl tracking-tight mt-3 max-w-2xl">{t('dk.modes.title')}</h2>
          <div className="grid md:grid-cols-2 gap-4 mt-8">
            {([
              { key: 'chat', Icon: MessageSquare },
              { key: 'code', Icon: Code2 },
            ] as const).map(({ key, Icon }) => (
              <div key={key} className="rounded-3xl border border-border/40 bg-card/70 backdrop-blur-sm p-6 sm:p-7">
                <div className="flex items-center gap-3">
                  <span className="w-10 h-10 rounded-2xl bg-primary/10 text-primary flex items-center justify-center"><Icon className="w-[18px] h-[18px]" /></span>
                  <h3 className="font-display text-2xl">{t(`dk.${key}.title`)}</h3>
                </div>
                <p className="font-body text-sm text-muted-foreground leading-relaxed mt-4">{t(`dk.${key}.desc`)}</p>
                <ul className="mt-5 space-y-2.5">
                  {[1, 2, 3].map(i => (
                    <li key={i} className="flex gap-2.5 font-body text-[13.5px] text-foreground/85 leading-relaxed">
                      <span className="mt-[9px] w-1 h-1 rounded-full bg-primary shrink-0" aria-hidden="true" />
                      <span>{t(`dk.${key}.b${i}`)}</span>
                    </li>
                  ))}
                </ul>
                {key === 'code' && <p className="font-body text-xs text-muted-foreground/70 mt-5">{t('dk.code.note')}</p>}
              </div>
            ))}
          </div>
        </section>

        {/* install */}
        <section id="instalar" className="mt-20 scroll-mt-24">
          <div className="rounded-3xl border border-border/40 bg-card/80 backdrop-blur-xl p-6 sm:p-8">
            <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
              <div>
                <h2 className="font-display text-3xl tracking-tight">{t('dk.install.title')}</h2>
                <p className="font-body text-sm text-muted-foreground mt-1.5">{t('dk.install.sub')}</p>
              </div>
              <div className="inline-flex p-1 rounded-2xl bg-muted/50 border border-border/40 self-start" role="tablist">
                {(['mac', 'windows'] as Tab[]).map(k => (
                  <button
                    key={k}
                    role="tab"
                    aria-selected={tab === k}
                    onClick={() => setTab(k)}
                    className={`px-4 py-2 rounded-xl font-body text-xs font-semibold transition-colors focus-ring ${tab === k ? 'bg-card text-foreground deiza-shadow' : 'text-muted-foreground hover:text-foreground'}`}
                  >
                    {k === 'mac' ? 'macOS' : 'Windows'}
                  </button>
                ))}
              </div>
            </div>

            {tab === 'mac' ? (
              <div className="mt-6 space-y-3">
                <p className="font-body text-sm text-foreground/90">{t('dk.install.fast')}</p>
                <Command id="mac" cmd={DESKTOP_INSTALL.mac} />
                <p className="font-body text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground/70 pt-4">{t('dk.install.or')}</p>
                <DownloadRow href={desktopFileUrl(release, 'mac-arm64')} title={t('dk.install.mac.arm')} sub=".dmg" size={release.sizes?.['mac-arm64']} recommended={arch !== 'x64'} />
                <DownloadRow href={desktopFileUrl(release, 'mac-x64')} title={t('dk.install.mac.intel')} sub=".dmg" size={release.sizes?.['mac-x64']} recommended={arch === 'x64'} />
                <FirstOpen os="mac" />
              </div>
            ) : (
              <div className="mt-6 space-y-3">
                <p className="font-body text-sm text-foreground/90">{t('dk.install.fast.win')}</p>
                <Command id="win" cmd={DESKTOP_INSTALL.windows} />
                <p className="font-body text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground/70 pt-4">{t('dk.install.or')}</p>
                <DownloadRow href={desktopFileUrl(release, 'win-x64')} title={t('dk.install.win')} sub=".exe" size={release.sizes?.['win-x64']} recommended />
                <FirstOpen os="win" />
              </div>
            )}
          </div>
        </section>

        {/* faq */}
        <section className="mt-20 grid lg:grid-cols-[0.8fr_1.2fr] gap-8">
          <h2 className="font-display text-3xl tracking-tight">{t('dk.faq.title')}</h2>
          <dl className="divide-y divide-border/30 border-y border-border/30">
            {[1, 2, 3, 4].map(i => (
              <div key={i} className="py-5">
                <dt className="font-display text-lg">{t(`dk.faq.q${i}`)}</dt>
                <dd className="font-body text-sm text-muted-foreground leading-relaxed mt-2">{t(`dk.faq.a${i}`)}</dd>
              </div>
            ))}
          </dl>
        </section>

        <p className="mt-16 text-center font-body text-sm text-muted-foreground">
          {t('dk.cli.pre')}{' '}
          <button onClick={() => navigate('/download')} className="text-primary underline underline-offset-4 decoration-primary/40 hover:decoration-primary focus-ring rounded">
            {t('dk.cli.link')}
          </button>
        </p>
      </main>
    </div>
  );
}
