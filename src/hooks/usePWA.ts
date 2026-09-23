import { useState, useEffect, useCallback, useRef } from 'react';

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

/** Returns true when running inside a Capacitor native shell (iOS/Android) */
function detectNative(): boolean {
  try {
    return !!(
      (window as any).Capacitor?.isNativePlatform?.() ||
      (window as any).Capacitor?.platform === 'ios' ||
      (window as any).Capacitor?.platform === 'android'
    );
  } catch {
    return false;
  }
}

export function usePWA() {
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(false);
  const promptRef = useRef<BeforeInstallPromptEvent | null>(null);

  // Native Capacitor app (iOS .ipa / Android .apk)
  const isNativeApp = detectNative();

  // PWA installed to home screen (Android / desktop Chrome)
  const isPWAStandalone =
    typeof window !== 'undefined' &&
    (window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as any).standalone === true);

  // Treat both native Capacitor AND installed PWA as "app mode" (skip landing)
  const isStandalone = isNativeApp || isPWAStandalone;

  const isIOS =
    typeof navigator !== 'undefined' &&
    /iPad|iPhone|iPod/.test(navigator.userAgent) &&
    !(window as any).MSStream;

  const isAndroid =
    typeof navigator !== 'undefined' &&
    /Android/i.test(navigator.userAgent);

  const isInstallable = !!installPrompt;

  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault();
      const event = e as BeforeInstallPromptEvent;
      promptRef.current = event;
      setInstallPrompt(event);
    };

    const installedHandler = () => {
      setIsInstalled(true);
      setInstallPrompt(null);
      promptRef.current = null;
    };

    window.addEventListener('beforeinstallprompt', handler);
    window.addEventListener('appinstalled', installedHandler);

    return () => {
      window.removeEventListener('beforeinstallprompt', handler);
      window.removeEventListener('appinstalled', installedHandler);
    };
  }, []);

  const promptInstall = useCallback(async () => {
    const prompt = promptRef.current;
    if (!prompt) return false;
    await prompt.prompt();
    const { outcome } = await prompt.userChoice;
    if (outcome === 'accepted') {
      setIsInstalled(true);
      setInstallPrompt(null);
      promptRef.current = null;
    }
    return outcome === 'accepted';
  }, []);

  return {
    isStandalone,
    isNativeApp,
    isIOS,
    isAndroid,
    isInstallable,
    isInstalled,
    promptInstall,
  };
}
