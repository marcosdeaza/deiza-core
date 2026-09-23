import { createContext, useContext, useState, useEffect, useCallback, useMemo, useRef, ReactNode } from 'react';
import es from '@/i18n/es.json';
import en from '@/i18n/en.json';

export type Language = 'es' | 'en' | 'zh' | 'hi' | 'ar' | 'pt' | 'ru' | 'ja' | 'de' | 'fr' | 'ko' | 'it';

export interface LanguageInfo {
  code: Language;
  nativeName: string;
  /** English name, for the model and for screen readers */
  name: string;
  flag: string;
  /** BCP-47 locale for Intl / dates / TTS */
  locale: string;
  rtl?: boolean;
}

export const LANGUAGES: LanguageInfo[] = [
  { code: 'es', nativeName: 'Español', name: 'Spanish', flag: '🇪🇸', locale: 'es-ES' },
  { code: 'en', nativeName: 'English', name: 'English', flag: '🇬🇧', locale: 'en-US' },
  { code: 'zh', nativeName: '中文', name: 'Chinese', flag: '🇨🇳', locale: 'zh-CN' },
  { code: 'hi', nativeName: 'हिन्दी', name: 'Hindi', flag: '🇮🇳', locale: 'hi-IN' },
  { code: 'ar', nativeName: 'العربية', name: 'Arabic', flag: '🇸🇦', locale: 'ar-SA', rtl: true },
  { code: 'pt', nativeName: 'Português', name: 'Portuguese', flag: '🇵🇹', locale: 'pt-PT' },
  { code: 'ru', nativeName: 'Русский', name: 'Russian', flag: '🇷🇺', locale: 'ru-RU' },
  { code: 'ja', nativeName: '日本語', name: 'Japanese', flag: '🇯🇵', locale: 'ja-JP' },
  { code: 'de', nativeName: 'Deutsch', name: 'German', flag: '🇩🇪', locale: 'de-DE' },
  { code: 'fr', nativeName: 'Français', name: 'French', flag: '🇫🇷', locale: 'fr-FR' },
  { code: 'ko', nativeName: '한국어', name: 'Korean', flag: '🇰🇷', locale: 'ko-KR' },
  { code: 'it', nativeName: 'Italiano', name: 'Italian', flag: '🇮🇹', locale: 'it-IT' },
];

export const LANGUAGE_CODES = LANGUAGES.map(l => l.code) as Language[];
export const isLanguage = (v: unknown): v is Language => typeof v === 'string' && (LANGUAGE_CODES as string[]).includes(v);
export const languageInfo = (code: Language): LanguageInfo => LANGUAGES.find(l => l.code === code) || LANGUAGES[1];

type Dict = Record<string, string>;

/** Spanish and English ship in the main bundle; the other ten load on demand. */
const STATIC: Partial<Record<Language, Dict>> = { es: es as Dict, en: en as Dict };
const LOADERS: Record<Language, () => Promise<{ default: Dict }>> = {
  es: () => Promise.resolve({ default: es as Dict }),
  en: () => Promise.resolve({ default: en as Dict }),
  zh: () => import('@/i18n/zh.json'),
  hi: () => import('@/i18n/hi.json'),
  ar: () => import('@/i18n/ar.json'),
  pt: () => import('@/i18n/pt.json'),
  ru: () => import('@/i18n/ru.json'),
  ja: () => import('@/i18n/ja.json'),
  de: () => import('@/i18n/de.json'),
  fr: () => import('@/i18n/fr.json'),
  ko: () => import('@/i18n/ko.json'),
  it: () => import('@/i18n/it.json'),
};
const cache: Partial<Record<Language, Dict>> = { ...STATIC };

const STORAGE_KEY = 'deiza-language';

/** Best supported language for this device: saved choice, then the browser's list. */
export function detectLanguage(): Language {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (isLanguage(saved)) return saved;
  } catch { /* storage unavailable */ }
  const prefs = (typeof navigator !== 'undefined' && navigator.languages?.length ? navigator.languages : [navigator?.language || 'es']);
  for (const tag of prefs) {
    const code = String(tag || '').toLowerCase().split(/[-_]/)[0];
    if (isLanguage(code)) return code;
  }
  return 'es';
}

interface LanguageContextType {
  language: Language;
  /** Info for the active language (locale, direction, native name) */
  info: LanguageInfo;
  /** True while a lazily loaded dictionary is still arriving */
  loading: boolean;
  setLanguage: (lang: Language) => void;
  t: (key: string, params?: Record<string, string | number>) => string;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

export const useLanguage = () => {
  const context = useContext(LanguageContext);
  if (!context) throw new Error('useLanguage must be used within LanguageProvider');
  return context;
};

function applyDocumentLanguage(lang: Language) {
  const info = languageInfo(lang);
  document.documentElement.lang = lang;
  document.documentElement.dir = info.rtl ? 'rtl' : 'ltr';
}

export const LanguageProvider = ({ children }: { children: ReactNode }) => {
  const [language, setLanguageState] = useState<Language>(() => detectLanguage());
  const [, force] = useState(0);
  const [loading, setLoading] = useState(() => !cache[language]);
  const pending = useRef<Language | null>(null);

  // Load the dictionary for the active language (no-op for es/en)
  useEffect(() => {
    if (cache[language]) { setLoading(false); return; }
    pending.current = language;
    setLoading(true);
    LOADERS[language]()
      .then(mod => { cache[language] = mod.default; })
      .catch(() => { cache[language] = {}; })
      .finally(() => {
        if (pending.current === language) { setLoading(false); force(n => n + 1); }
      });
  }, [language]);

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, language); } catch { /* private mode */ }
    applyDocumentLanguage(language);
  }, [language]);

  const setLanguage = useCallback((lang: Language) => {
    if (!isLanguage(lang)) return;
    setLanguageState(lang);
  }, []);

  const t = useCallback((key: string, params?: Record<string, string | number>): string => {
    const dict = cache[language];
    let value = (dict && dict[key]) ?? (en as Dict)[key] ?? (es as Dict)[key] ?? key;
    if (params) {
      for (const [k, v] of Object.entries(params)) value = value.split(`{${k}}`).join(String(v));
    }
    return value;
    // `loading` is intentionally a dependency: once the dictionary lands every consumer re-renders
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [language, loading]);

  const info = useMemo(() => languageInfo(language), [language]);
  const value = useMemo(() => ({ language, info, loading, setLanguage, t }), [language, info, loading, setLanguage, t]);

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
};
