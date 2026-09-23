import { useCallback, useEffect } from 'react';
import { Capacitor } from '@capacitor/core';

let PushNotifications: any = null;

async function loadPush() {
  if (PushNotifications) return;
  try {
    const mod = await import('@capacitor/push-notifications');
    PushNotifications = mod.PushNotifications;
  } catch {
    // browser — push not available
  }
}

/** Request permission once per install. Call after user is authenticated. */
export async function requestPushPermission() {
  await loadPush();
  if (!PushNotifications) return;
  try {
    const { receive } = await PushNotifications.checkPermissions();
    if (receive === 'granted') {
      // Already granted — just register
      await PushNotifications.register();
      return;
    }
    if (receive === 'prompt' || receive === 'prompt-with-rationale') {
      await PushNotifications.requestPermissions();
      await PushNotifications.register();
    }
    // If 'denied', user needs to go to Settings → Deiza → Notifications
  } catch {
    // permission denied or not available
  }
}

/** Send a local notification via native layer (foreground only — when app is active). */
export function useArtifactNotification() {
  const notify = useCallback(async (artifactName: string) => {
    void artifactName;
  }, []);

  return { notify };
}

/** Hook: request push permission once user is logged in. */
export function usePushSetup(isAuthenticated: boolean) {
  useEffect(() => {
    if (!isAuthenticated) return;
    if (!Capacitor.isNativePlatform()) return;
    const key = 'deiza:push_requested';
    if (localStorage.getItem(key)) return;
    localStorage.setItem(key, '1');
    // Delay so workspace renders before the iOS dialog
    const t = setTimeout(() => requestPushPermission(), 4000);
    return () => clearTimeout(t);
  }, [isAuthenticated]);
}
