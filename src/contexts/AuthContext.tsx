import { createContext, useContext, useState, useEffect, ReactNode, useCallback, useRef } from 'react';
import { api, User } from '@/services/api';
import { onAppResume, isNative } from '@/lib/native';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (credential: string) => Promise<void>;
  loginWithApple: (identityToken: string, fullName?: { givenName?: string | null; familyName?: string | null }) => Promise<void>;
  logout: () => Promise<void>;
  isAuthenticated: boolean;
  refreshAuth: () => Promise<void>;
  updateName: (name: string) => Promise<void>;
  updateProfile: (data: { name?: string; avatarFile?: File; avatarBase64?: string }) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
};

interface AuthProviderProps {
  children: ReactNode;
}

/** Fetch with a hard timeout — never hangs longer than `ms` */
function fetchWithTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout')), ms);
    promise.then(
      (v) => { clearTimeout(timer); resolve(v); },
      (e) => { clearTimeout(timer); reject(e); },
    );
  });
}

const CACHE_KEY = 'deiza:user_cache';

function readCachedUser(): User | null {
  try {
    const tok = localStorage.getItem('deiza:auth_token');
    if (!tok) return null;
    const raw = localStorage.getItem(CACHE_KEY);
    return raw ? (JSON.parse(raw) as User) : null;
  } catch { return null; }
}

export const AuthProvider = ({ children }: AuthProviderProps) => {
  // Inside the app (and on PWA), paint the last known user instantly and confirm in
  // the background: no spinner on every cold start, exactly like a native app.
  const cached = useRef<User | null>(readCachedUser());
  const [user, setUser] = useState<User | null>(cached.current);
  const [loading, setLoading] = useState(!cached.current);

  const remember = useCallback((u: User | null) => {
    setUser(u);
    try {
      if (u) localStorage.setItem(CACHE_KEY, JSON.stringify(u));
      else localStorage.removeItem(CACHE_KEY);
    } catch { /* noop */ }
  }, []);

  useEffect(() => {
    // Absolute safety timeout so the app never sits on a spinner
    const absoluteTimeout = setTimeout(() => setLoading(false), isNative() ? 4000 : 2500);

    fetchWithTimeout(api.checkAuthStatus(), isNative() ? 3500 : 2000)
      .then((response) => {
        if (response.authenticated && response.user) remember(response.user);
        else if (!response.authenticated && cached.current) {
          // The server says the session is gone (token expired / revoked): drop the cache
          remember(null);
          try { localStorage.removeItem('deiza:auth_token'); } catch { /* noop */ }
        }
      })
      .catch((err) => {
        // Offline / backend unreachable: keep the cached user so the UI still opens
        console.warn('Auth check failed or timeout:', err);
      })
      .finally(() => {
        setLoading(false);
        clearTimeout(absoluteTimeout);
      });

    return () => { clearTimeout(absoluteTimeout); };
  }, [remember]);

  const login = async (credential: string) => {
    try {
      const response = await api.loginWithGoogle(credential);
      if (response.success && response.user) remember(response.user);
    } catch (error) {
      console.error('Login failed:', error);
      throw error;
    }
  };

  const loginWithApple = async (identityToken: string, fullName?: { givenName?: string | null; familyName?: string | null }) => {
    const response = await api.loginWithApple(identityToken, fullName);
    if (response.success && response.user) remember(response.user);
  };

  const logout = async () => {
    try {
      await api.logout();
    } catch (error) {
      console.error('Logout failed:', error);
    } finally {
      remember(null);
      try { localStorage.removeItem('deiza:auth_token'); } catch { /* noop */ }
    }
  };

  const refreshAuth = useCallback(async () => {
    try {
      const response = await fetchWithTimeout(api.checkAuthStatus(), 3000);
      if (response.authenticated && response.user) remember(response.user);
    } catch {
      // Silent — backend unreachable
    }
  }, [remember]);

  // Refresh when the tab/app comes back to the foreground (plan changes, other devices)
  useEffect(() => onAppResume(() => { void refreshAuth(); }), [refreshAuth]);

  const updateName = async (name: string) => {
    await api.updateProfile(name);
    setUser(prev => {
      const next = prev ? { ...prev, name } : null;
      try { if (next) localStorage.setItem(CACHE_KEY, JSON.stringify(next)); } catch { /* noop */ }
      return next;
    });
  };

  const updateProfile = async (data: { name?: string; avatarFile?: File; avatarBase64?: string }) => {
    const result = await api.updateProfileFull(data);
    setUser(prev => {
      if (!prev) return prev;
      const next = {
        ...prev,
        ...(result.name ? { name: result.name } : {}),
        ...(result.avatar_url ? { avatar_url: result.avatar_url } : {}),
      };
      try { localStorage.setItem(CACHE_KEY, JSON.stringify(next)); } catch { /* noop */ }
      return next;
    });
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        login,
        loginWithApple,
        logout,
        isAuthenticated: !!user,
        refreshAuth,
        updateName,
        updateProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};
