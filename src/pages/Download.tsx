import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { 
  Terminal, 
  ExternalLink, 
  Check, 
  Copy, 
  Sparkles, 
  Cpu, 
  Zap, 
  ShieldAlert, 
  ArrowLeft, 
  Bot, 
  Server, 
  Layers, 
  Smartphone 
} from 'lucide-react';
import { toast } from 'sonner';
import logo from '@/assets/logo.png';
import AmbientRose from '@/components/deiza/AmbientRose';

const AppleIcon = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="M12 20.94c1.5 0 2.02-1.05 3.77-1.05s1.9 1.05 3.48 1.05c1.7 0 3.15-2.6 4.25-4.83C21.8 15.5 21.8 10.2 18.7 8.8c-1.1-.6-2.4-.9-3.7-.9-1.4 0-2.7.6-3.6 1.6-.9-1-2.2-1.6-3.6-1.6-1.3 0-2.6.3-3.7.9C.9 10.2.9 15.5 5 15.14c1.1 2.23 2.55 4.83 4.25 4.83 1.58 0 1.71-1.05 3.48-1.05" transform="translate(0 -1)" />
  </svg>
);

const LinuxIcon = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="M9 3.5c-.7.5-1 1.2-1 2.2 0 1.6 1 2.8 2.6 3.6 1.6.8 3.1 1.7 3.1 3.4 0 2.6-2.5 3.8-4.3 3.8-2.5 0-5-1.8-5-5 0-2.4 1.3-4.4 3.5-6l1.1-2zM15 3.5c.7.5 1 1.2 1 2.2 0 1.6-1 2.8-2.6 3.6-1.6.8-3.1 1.7-3.1 3.4 0 2.6 2.5 3.8 4.3 3.8 2.5 0 5-1.8 5-5 0-2.4-1.3-4.4-3.5-6l-1.1-2z" transform="translate(0 2)" />
  </svg>
);

const WindowsIcon = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="M10 3L3 4.2v7.5h7V3zM10 13.3H3v7.5L10 21v-7.7zM21 3l-9 1.3V13h9V3zM12 13.3V21l9-1.3v-6.4h-9z" />
  </svg>
);

type PlatformTab = 'macos' | 'linux' | 'windows' | 'agent';

export default function Download() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<PlatformTab>('macos');
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(id);
    toast.success('¡Copiado al portapapeles!');
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const agentPrompt = `Instala Deiza Code en mi sistema de forma automática ejecutando el script oficial según mi sistema operativo: si es macOS o Linux ejecuta en bash 'curl -fsSL https://deiza.org/install.sh | bash', o si es Windows ejecuta en PowerShell 'irm https://deiza.org/install.ps1 | iex'. Una vez instalado, ejecuta 'deiza --version' para verificar y abre la autenticación con 'deiza --login'.`;

  return (
    <div className="min-h-screen bg-background text-foreground relative overflow-hidden selection:bg-primary/20">
      <AmbientRose />

      <div className="relative z-10">
        {/* Navigation Bar */}
        <header className="fixed top-0 left-0 right-0 z-50 bg-background/80 backdrop-blur-xl border-b border-border/40">
          <div className="max-w-6xl mx-auto flex items-center justify-between px-4 sm:px-6 h-16">
            <button
              onClick={() => navigate('/')}
              className="flex items-center gap-2 font-body text-sm text-muted-foreground hover:text-foreground transition-colors rounded-lg px-2 py-1"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Deiza</span>
            </button>

            <div className="flex items-center gap-2">
              <img src={logo} alt="Deiza" className="w-7 h-7 blend-multiply" />
              <span className="font-display font-semibold text-lg tracking-tight text-foreground">
                Deiza <span className="text-primary font-mono text-base">Code</span>
              </span>
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={() => navigate('/app')}
                className="hidden sm:flex items-center gap-1.5 font-body text-xs text-muted-foreground hover:text-foreground transition-colors px-3 py-1.5 rounded-full border border-border/50 hover:bg-muted/40"
              >
                <Smartphone className="w-3.5 h-3.5" /> App Móvil
              </button>
              <a
                href="https://github.com/marcosdeaza/deiza-code"
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-1.5 font-body text-xs font-medium text-primary-foreground bg-primary px-3.5 py-1.5 rounded-full hover:brightness-110 transition-all deiza-shadow"
              >
                GitHub <ExternalLink className="w-3 h-3" />
              </a>
            </div>
          </div>
        </header>

        {/* Hero Section */}
        <section className="pt-32 pb-16 px-4 sm:px-6 max-w-5xl mx-auto text-center space-y-6">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-primary/10 border border-primary/20 text-primary font-mono text-xs font-semibold uppercase tracking-wider"
          >
            <Sparkles className="w-3.5 h-3.5" /> Beta · Modelo Exclusivo Deiza Omniscient
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="font-display text-4xl sm:text-6xl md:text-7xl font-bold tracking-tight text-foreground"
          >
            Deiza <span className="text-primary">Code</span>
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.2 }}
            className="font-body text-base sm:text-xl text-muted-foreground max-w-2xl mx-auto leading-relaxed"
          >
            El agente de programación autónomo para tu terminal. Impulsado por el modelo{' '}
            <strong className="text-foreground font-semibold">Deiza Omniscient (Liquid 5)</strong> en la infraestructura dedicada de Deiza para máxima velocidad, diffs quirúrgicos y ejecución segura.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.3 }}
            className="flex flex-wrap items-center justify-center gap-3 pt-2"
          >
            <a
              href="https://github.com/marcosdeaza/deiza-code"
              target="_blank"
              rel="noreferrer"
              className="font-body text-sm font-semibold bg-card text-foreground px-6 py-3 rounded-2xl deiza-border deiza-shadow hover:bg-muted/60 transition-all flex items-center gap-2"
            >
              <ExternalLink className="w-4 h-4 text-primary" />
              Ver código fuente en GitHub
            </a>
            <button
              onClick={() => navigate('/plans')}
              className="font-body text-sm font-semibold bg-primary text-primary-foreground px-6 py-3 rounded-2xl deiza-shadow hover:brightness-110 transition-all flex items-center gap-2"
            >
              <Sparkles className="w-4 h-4" />
              Planes de pago (Friend / Signet)
            </button>
          </motion.div>
        </section>

        {/* Desktop app cross-link */}
        <section className="px-4 sm:px-6 max-w-4xl mx-auto pb-2">
          <button
            onClick={() => navigate('/desktop')}
            className="w-full flex items-center gap-4 text-left rounded-3xl p-4 sm:p-5 bg-card/80 deiza-border deiza-shadow hover:bg-muted/50 transition-colors focus-ring"
          >
            <img src="/art/desktop.webp" alt="" className="hidden sm:block w-40 rounded-2xl" loading="lazy" />
            <span className="flex-1 min-w-0">
              <span className="block font-mono text-[10px] font-semibold uppercase tracking-wider text-primary">Nuevo · macOS y Windows</span>
              <span className="block font-display text-xl text-foreground mt-1">¿Prefieres una app? Deiza para escritorio</span>
              <span className="block font-body text-sm text-muted-foreground mt-1">Deiza Code con interfaz propia, junto al chat del workspace. Sin terminal.</span>
            </span>
            <span className="hidden sm:inline-flex shrink-0 px-4 py-2 rounded-2xl bg-primary text-primary-foreground font-body text-xs font-semibold">Descargar</span>
          </button>
        </section>

        {/* 4-Way Installation Selector */}
        <section className="py-8 px-4 sm:px-6 max-w-4xl mx-auto">
          <div className="bg-card/90 backdrop-blur-xl deiza-border deiza-shadow rounded-3xl p-6 sm:p-8">
            <div className="text-center mb-6">
              <h2 className="font-display text-2xl sm:text-3xl font-semibold text-foreground mb-1">
                Instalación en tu Entorno
              </h2>
              <p className="font-body text-sm text-muted-foreground">
                Selecciona tu sistema operativo o copia el prompt para que tu agente de IA lo instale automáticamente.
              </p>
            </div>

            {/* Platform Tabs */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-6 p-1 bg-muted/40 rounded-2xl border border-border/40">
              <button
                onClick={() => setActiveTab('macos')}
                className={`flex items-center justify-center gap-2 py-3 px-3 rounded-xl font-body text-xs font-semibold transition-all ${
                  activeTab === 'macos'
                    ? 'bg-card text-primary deiza-shadow border border-primary/20'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <AppleIcon className="w-4 h-4" /> macOS
              </button>

              <button
                onClick={() => setActiveTab('linux')}
                className={`flex items-center justify-center gap-2 py-3 px-3 rounded-xl font-body text-xs font-semibold transition-all ${
                  activeTab === 'linux'
                    ? 'bg-card text-primary deiza-shadow border border-primary/20'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <LinuxIcon className="w-4 h-4" /> Linux
              </button>

              <button
                onClick={() => setActiveTab('windows')}
                className={`flex items-center justify-center gap-2 py-3 px-3 rounded-xl font-body text-xs font-semibold transition-all ${
                  activeTab === 'windows'
                    ? 'bg-card text-primary deiza-shadow border border-primary/20'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <WindowsIcon className="w-4 h-4" /> Windows
              </button>

              <button
                onClick={() => setActiveTab('agent')}
                className={`flex items-center justify-center gap-2 py-3 px-3 rounded-xl font-body text-xs font-semibold transition-all ${
                  activeTab === 'agent'
                    ? 'bg-primary text-primary-foreground deiza-shadow'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <Bot className="w-4 h-4" /> Neural / AI
              </button>
            </div>

            {/* Tab Contents */}
            <div className="space-y-4">
              {activeTab === 'macos' && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between text-xs text-muted-foreground font-body">
                    <span>En Terminal (Apple Silicon M1/M2/M3/M4 o Intel):</span>
                    <span className="font-mono text-primary">curl · bash</span>
                  </div>
                  <div className="flex items-center justify-between bg-muted/70 rounded-2xl p-4 border border-border">
                    <code className="font-mono text-xs sm:text-sm text-foreground overflow-x-auto whitespace-pre">
                      curl -fsSL https://deiza.org/install.sh | bash
                    </code>
                    <button
                      onClick={() => copyToClipboard('curl -fsSL https://deiza.org/install.sh | bash', 'curl-mac')}
                      className="ml-3 px-3.5 py-2 rounded-xl bg-primary text-primary-foreground font-body text-xs font-semibold flex items-center gap-1.5 hover:brightness-110 transition-all focus-ring shrink-0"
                    >
                      {copiedKey === 'curl-mac' ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                      {copiedKey === 'curl-mac' ? 'Copiado' : 'Copiar'}
                    </button>
                  </div>
                  <p className="font-body text-xs text-muted-foreground">
                    Instala el comando universal <code className="text-foreground font-mono bg-muted/60 px-1 py-0.5 rounded">deiza</code> y <code className="text-foreground font-mono bg-muted/60 px-1 py-0.5 rounded">deiza-code</code>.
                  </p>
                </div>
              )}

              {activeTab === 'linux' && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between text-xs text-muted-foreground font-body">
                    <span>En Terminal (Ubuntu, Debian, Fedora, Arch, WSL):</span>
                    <span className="font-mono text-primary">curl · bash</span>
                  </div>
                  <div className="flex items-center justify-between bg-muted/70 rounded-2xl p-4 border border-border">
                    <code className="font-mono text-xs sm:text-sm text-foreground overflow-x-auto whitespace-pre">
                      curl -fsSL https://deiza.org/install.sh | bash
                    </code>
                    <button
                      onClick={() => copyToClipboard('curl -fsSL https://deiza.org/install.sh | bash', 'curl-linux')}
                      className="ml-3 px-3.5 py-2 rounded-xl bg-primary text-primary-foreground font-body text-xs font-semibold flex items-center gap-1.5 hover:brightness-110 transition-all focus-ring shrink-0"
                    >
                      {copiedKey === 'curl-linux' ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                      {copiedKey === 'curl-linux' ? 'Copiado' : 'Copiar'}
                    </button>
                  </div>
                  <p className="font-body text-xs text-muted-foreground">
                    Crea el enlace simbólico en <code className="text-foreground font-mono bg-muted/60 px-1 py-0.5 rounded">/usr/local/bin/deiza</code> para ejecución global.
                  </p>
                </div>
              )}

              {activeTab === 'windows' && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between text-xs text-muted-foreground font-body">
                    <span>En PowerShell o CMD de Windows:</span>
                    <span className="font-mono text-primary">irm · iex</span>
                  </div>
                  <div className="flex items-center justify-between bg-muted/70 rounded-2xl p-4 border border-border">
                    <code className="font-mono text-xs sm:text-sm text-foreground overflow-x-auto whitespace-pre">
                      irm https://deiza.org/install.ps1 | iex
                    </code>
                    <button
                      onClick={() => copyToClipboard('irm https://deiza.org/install.ps1 | iex', 'ps-win')}
                      className="ml-3 px-3.5 py-2 rounded-xl bg-primary text-primary-foreground font-body text-xs font-semibold flex items-center gap-1.5 hover:brightness-110 transition-all focus-ring shrink-0"
                    >
                      {copiedKey === 'ps-win' ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                      {copiedKey === 'ps-win' ? 'Copiado' : 'Copiar'}
                    </button>
                  </div>
                  <p className="font-body text-xs text-muted-foreground">
                    Configura el entorno en <code className="text-foreground font-mono bg-muted/60 px-1 py-0.5 rounded">%LOCALAPPDATA%\deiza-code</code> y agrega el alias a tu PATH.
                  </p>
                </div>
              )}

              {activeTab === 'agent' && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between text-xs text-muted-foreground font-body">
                    <span>Prompt para tu agente de IA:</span>
                    <span className="font-mono text-primary">Instalación Desatendida</span>
                  </div>
                  <div className="bg-muted/70 rounded-2xl p-4 border border-border space-y-3">
                    <p className="font-body text-xs sm:text-sm text-foreground leading-relaxed italic bg-background/60 p-3 rounded-xl border border-border/40">
                      "{agentPrompt}"
                    </p>
                    <div className="flex justify-end">
                      <button
                        onClick={() => copyToClipboard(agentPrompt, 'agent-prompt')}
                        className="px-4 py-2.5 rounded-xl bg-primary text-primary-foreground font-body text-xs font-semibold flex items-center gap-1.5 hover:brightness-110 transition-all focus-ring"
                      >
                        {copiedKey === 'agent-prompt' ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                        {copiedKey === 'agent-prompt' ? '¡Prompt Copiado!' : 'Copiar Prompt para el Agente'}
                      </button>
                    </div>
                  </div>
                  <p className="font-body text-xs text-muted-foreground leading-relaxed">
                    Pega este texto en tu agente; este detectará si estás en macOS, Linux o Windows, ejecutará el comando correspondiente y verificará la instalación por ti.
                  </p>
                </div>
              )}
            </div>
          </div>
        </section>

        {/* Model Spotlight: Deiza Omniscient */}
        <section className="py-12 px-4 sm:px-6 max-w-4xl mx-auto">
          <div className="rounded-3xl p-6 sm:p-8 bg-gradient-to-br from-card via-card/80 to-primary/5 deiza-border deiza-shadow space-y-6">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-border/40 pb-6">
              <div className="space-y-1">
                <span className="font-mono text-xs font-semibold text-primary uppercase tracking-wider bg-primary/10 px-2.5 py-1 rounded-full border border-primary/20">
                  Motor Dedicado Exclusivo
                </span>
                <h3 className="font-display text-2xl sm:text-3xl font-bold text-foreground">
                  Deiza Omniscient <span className="text-muted-foreground font-mono text-sm font-normal">(v5)</span>
                </h3>
              </div>
              <div className="flex items-center gap-2 bg-emerald-500/10 text-emerald-400 font-mono text-xs font-semibold px-3 py-1.5 rounded-full border border-emerald-500/20">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                Cluster Deiza Activo
              </div>
            </div>

            <p className="font-body text-sm sm:text-base text-muted-foreground leading-relaxed">
              A diferencia de los modelos de chat de propósito general, <strong>Deiza Omniscient</strong> está basado en la arquitectura <strong>Deiza Liquid 5</strong> y se aloja en un endpoint exclusivo sobre la <strong>infraestructura dedicada de Deiza</strong>. Diseñado específicamente para razonamiento autónomo profundo, diffs precisos y ejecución local de tareas de programación de alta intensidad.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2">
              <div className="bg-background/60 rounded-2xl p-4 border border-border/40 space-y-1.5">
                <div className="flex items-center gap-2 text-primary font-body text-xs font-semibold">
                  <Server className="w-4 h-4" /> Clusters dedicados Deiza
                </div>
                <p className="font-body text-xs text-muted-foreground">
                  Servidores dedicados de cómputo GPU de alta velocidad sin colas de espera.
                </p>
              </div>

              <div className="bg-background/60 rounded-2xl p-4 border border-border/40 space-y-1.5">
                <div className="flex items-center gap-2 text-primary font-body text-xs font-semibold">
                  <Cpu className="w-4 h-4" /> Motor Liquid 5
                </div>
                <p className="font-body text-xs text-muted-foreground">
                  Optimizado para diffs quirúrgicos en línea, inspección de árboles de archivos y tests.
                </p>
              </div>

              <div className="bg-background/60 rounded-2xl p-4 border border-border/40 space-y-1.5">
                <div className="flex items-center gap-2 text-primary font-body text-xs font-semibold">
                  <ShieldAlert className="w-4 h-4" /> Exclusivo Planes de Pago
                </div>
                <p className="font-body text-xs text-muted-foreground">
                  Disponible para cuentas con plan Friend o Signet con consumo de cuota de 5 horas.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Paid Plan Requirement Notice */}
        <section className="pb-24 px-4 sm:px-6 max-w-4xl mx-auto">
          <div className="bg-primary/8 rounded-3xl p-6 sm:p-8 border border-primary/20 flex flex-col sm:flex-row items-center justify-between gap-6 text-center sm:text-left">
            <div className="space-y-2">
              <h4 className="font-display text-xl font-bold text-foreground">
                ¿Aún no tienes un plan de pago?
              </h4>
              <p className="font-body text-sm text-muted-foreground max-w-xl leading-relaxed">
                Para garantizar la disponibilidad y el rendimiento extremo de los clusters de Deiza Code, el acceso está reservado a las suscripciones activas.
              </p>
            </div>
            <button
              onClick={() => navigate('/plans')}
              className="px-6 py-3 rounded-2xl bg-primary text-primary-foreground font-body text-sm font-semibold hover:brightness-110 transition-all shrink-0 deiza-shadow"
            >
              Ver Planes y Suscribirme
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}
