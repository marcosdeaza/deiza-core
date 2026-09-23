import { useState, useEffect, useRef } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useAuth } from '@/contexts/AuthContext';
import AmbientRose from '@/components/deiza/AmbientRose';
import { Terminal, Check, Copy, Shield, Sparkles, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

/**
 * Deiza Code CLI authorization page.
 *
 * The CLI opens /cli/auth?port=<loopback port>&state=<nonce>. Authorizing mints an API key
 * and hands it to the local listener at http://127.0.0.1:<port>/callback. The browser is NOT
 * navigated to that address (the listener closes right after receiving the key, which used to
 * leave the user on a "connection refused" page): the key is pinged from here and this page
 * shows the result, keeping the key visible for manual paste (SSH, remote desktops...).
 */
export default function CliAuth() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user, isAuthenticated, loading: authLoading } = useAuth();

  const port = (searchParams.get('port') || '').replace(/[^0-9]/g, '');
  const state = searchParams.get('state') || '';
  const hasListener = !!port && !!state;

  const [authorizing, setAuthorizing] = useState(false);
  const [authorizedKey, setAuthorizedKey] = useState<string | null>(null);
  const [delivered, setDelivered] = useState<'pending' | 'ok' | 'manual'>('pending');
  const [copied, setCopied] = useState(false);
  const [activePlan, setActivePlan] = useState<string | null>(null);
  const [loadingPlan, setLoadingPlan] = useState(true);
  const pingedRef = useRef(false);
  const callbackRef = useRef<string | null>(null);

  useEffect(() => {
    fetch('/api/plan', { credentials: 'include' })
      .then(res => res.json())
      .then(data => { if (data && data.plan) setActivePlan(data.plan); })
      .catch(() => {})
      .finally(() => setLoadingPlan(false));
  }, []);

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      const fullUrl = window.location.pathname + window.location.search;
      navigate(`/login?redirect=${encodeURIComponent(fullUrl)}`, { replace: true });
    }
  }, [authLoading, isAuthenticated, navigate]);

  const effectivePlan = activePlan || (user as any)?.plan || 'free';
  const isPaid = effectivePlan !== 'free';

  // Hand the key to the CLI's loopback listener. A no-cors fetch cannot read the answer, so
  // success is inferred from the request resolving (the listener answered) versus failing
  // (nothing is listening on that port: SSH session, timeout, or the CLI was closed).
  const deliverToCli = async (key: string, email: string, plan: string) => {
    if (!hasListener || pingedRef.current) return;
    pingedRef.current = true;
    const callbackUrl = `http://127.0.0.1:${port}/callback?key=${encodeURIComponent(key)}&email=${encodeURIComponent(email)}&plan=${encodeURIComponent(plan)}&state=${encodeURIComponent(state)}`;
    callbackRef.current = callbackUrl;
    const attempt = () => new Promise<boolean>((resolve) => {
      const timer = setTimeout(() => resolve(false), 4000);
      fetch(callbackUrl, { mode: 'no-cors', cache: 'no-store' })
        .then(() => { clearTimeout(timer); resolve(true); })
        .catch(() => { clearTimeout(timer); resolve(false); });
    });
    let ok = await attempt();
    if (!ok) {
      await new Promise(r => setTimeout(r, 800));
      ok = await attempt();
    }
    setDelivered(ok ? 'ok' : 'manual');
  };

  const handleAuthorize = async () => {
    setAuthorizing(true);
    try {
      const res = await fetch('/api/cli/authorize', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.error || 'Error de autorización');
      }
      setAuthorizedKey(data.key);
      toast.success('Terminal autorizada');
      if (hasListener) {
        void deliverToCli(data.key, data.email || '', data.plan || effectivePlan);
      } else {
        setDelivered('manual');
      }
    } catch (err: any) {
      toast.error(err.message || 'No se pudo autorizar');
    } finally {
      setAuthorizing(false);
    }
  };

  const copyKey = () => {
    if (!authorizedKey) return;
    navigator.clipboard.writeText(authorizedKey).catch(() => {});
    setCopied(true);
    toast.success('Clave copiada al portapapeles');
    setTimeout(() => setCopied(false), 2000);
  };

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background text-foreground">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background text-foreground px-4 relative overflow-hidden">
      <AmbientRose />

      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="w-full max-w-md bg-card/85 backdrop-blur-xl deiza-border deiza-shadow rounded-3xl p-6 sm:p-8 relative z-10 text-center"
      >
        <div className="flex flex-col items-center gap-2 mb-4">
          <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center border border-primary/20 shadow-inner">
            <Terminal className="w-7 h-7 text-primary" />
          </div>
          <div className="font-mono text-[11px] text-primary font-semibold tracking-wider uppercase bg-primary/10 px-3 py-1 rounded-full border border-primary/20">
            Deiza Code CLI
          </div>
        </div>

        <h1 className="font-display text-2xl tracking-tight text-foreground font-semibold mb-2">
          Conectar terminal
        </h1>
        <p className="font-body text-sm text-muted-foreground mb-6 leading-relaxed">
          <strong>Deiza Code</strong> pide permiso para usar tu cuenta y tu cuota de uso desde la terminal.
        </p>

        {user && (
          <div className="bg-muted/40 rounded-2xl p-4 mb-4 text-left border border-border/40 space-y-3">
            <div className="flex items-center gap-3">
              {user.picture ? (
                <img src={user.picture} alt="" className="w-10 h-10 rounded-full" />
              ) : (
                <div className="w-10 h-10 rounded-full bg-primary/15 flex items-center justify-center text-primary font-semibold">
                  {(user.name || user.email || 'U').charAt(0).toUpperCase()}
                </div>
              )}
              <div className="min-w-0 flex-1">
                <p className="font-body text-sm font-medium text-foreground truncate">{user.name || user.email}</p>
                <p className="font-body text-xs text-muted-foreground truncate">{user.email}</p>
              </div>
              <span className={`font-mono text-[11px] font-semibold uppercase tracking-wider px-2.5 py-1 rounded-full border ${
                isPaid
                  ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20'
                  : 'text-amber-400 bg-amber-500/10 border-amber-500/20'
              }`}>
                {isPaid ? effectivePlan.toUpperCase() : 'FREE'}
              </span>
            </div>
            <div className="pt-2 border-t border-border/30 flex items-center justify-between text-[11px] font-mono text-muted-foreground">
              <span>Motor asignado:</span>
              <span className="text-primary font-medium">Deiza Code · Liquid 5 · Solid · Gas · Vainilla</span>
            </div>
          </div>
        )}

        {user && !isPaid && !loadingPlan && (
          <div className="p-3.5 mb-6 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 text-left space-y-1.5">
            <p className="font-body text-xs font-semibold flex items-center gap-1.5 text-emerald-400">
              <Sparkles className="w-3.5 h-3.5 text-emerald-400 shrink-0" /> Acceso General Habilitado
            </p>
            <p className="font-body text-xs text-muted-foreground leading-relaxed">
              Tu cuenta tiene acceso a Deiza Code con Liquid 5, Gas 4.5 y Vainilla ilimitado.
            </p>
          </div>
        )}

        {authorizedKey ? (
          <div className="space-y-4 text-left">
            {delivered === 'ok' && (
              <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400">
                <p className="font-body text-xs font-semibold flex items-center gap-1.5 mb-1">
                  <Check className="w-4 h-4" /> Terminal conectada
                </p>
                <p className="font-body text-[12px] text-muted-foreground">
                  Deiza Code ya ha recibido la clave. Puedes cerrar esta pestaña y volver a la consola.
                </p>
              </div>
            )}
            {delivered === 'pending' && (
              <div className="p-4 rounded-2xl bg-muted/40 border border-border/40 text-muted-foreground">
                <p className="font-body text-xs font-semibold flex items-center gap-1.5">
                  <Loader2 className="w-4 h-4 animate-spin" /> Enviando la clave a tu terminal...
                </p>
              </div>
            )}
            {delivered === 'manual' && (
              <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400">
                <p className="font-body text-xs font-semibold flex items-center gap-1.5 mb-1">
                  <Check className="w-4 h-4" /> Autorización creada
                </p>
                <p className="font-body text-[12px] text-muted-foreground">
                  {hasListener
                    ? 'No se pudo contactar con la terminal desde esta pestaña. Prueba a abrir la conexión directa o copia la clave y pégala en la consola.'
                    : 'Copia la clave y pégala en la consola cuando Deiza Code te la pida.'}
                </p>
                {hasListener && callbackRef.current && (
                  <button
                    onClick={() => { window.location.href = callbackRef.current as string; }}
                    className="mt-3 w-full py-2.5 px-3 rounded-xl bg-primary text-primary-foreground font-body text-xs font-semibold hover:brightness-110 transition-all flex items-center justify-center gap-1.5 focus-ring"
                  >
                    <Terminal className="w-3.5 h-3.5" />
                    Abrir conexión directa con la terminal
                  </button>
                )}
              </div>
            )}

            <div className="flex items-center gap-2 bg-muted/60 rounded-xl p-2 border border-border">
              <input
                type="text"
                readOnly
                value={authorizedKey}
                onFocus={(e) => e.currentTarget.select()}
                className="bg-transparent font-mono text-xs flex-1 outline-none text-foreground px-2"
              />
              <button
                onClick={copyKey}
                className="px-3 py-1.5 rounded-lg bg-primary text-primary-foreground font-body text-xs font-medium flex items-center gap-1 hover:brightness-110 transition-all focus-ring"
              >
                {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                {copied ? 'Copiada' : 'Copiar'}
              </button>
            </div>

            <p className="text-center font-body text-[11px] text-muted-foreground pt-1">
              Esta clave da acceso a tu cuenta desde la terminal. Puedes revocarla en cualquier momento desde Ajustes.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            <button
              onClick={handleAuthorize}
              disabled={authorizing}
              className="w-full py-3.5 px-4 rounded-2xl bg-primary text-primary-foreground font-body text-sm font-semibold hover:brightness-110 active:scale-[0.99] transition-all flex items-center justify-center gap-2 deiza-shadow disabled:opacity-50 focus-ring"
            >
              {authorizing ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Autorizando terminal...
                </>
              ) : (
                <>
                  <Terminal className="w-4 h-4" />
                  Autorizar Deiza Code
                </>
              )}
            </button>

            <button
              onClick={() => navigate('/workspace')}
              className="w-full py-2.5 px-4 rounded-xl text-muted-foreground hover:text-foreground font-body text-xs transition-colors"
            >
              Cancelar y volver a Deiza
            </button>
          </div>
        )}

        <div className="mt-6 pt-4 border-t border-border/20 flex items-center justify-center gap-2 text-muted-foreground/60 text-[11px] font-body">
          <Shield className="w-3.5 h-3.5" /> Conexión cifrada con Deiza
        </div>
      </motion.div>
    </div>
  );
}
