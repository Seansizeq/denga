import React, { createContext, useContext, useEffect, useMemo, useState, useCallback } from 'react';
import { LANGUAGES, translations, LOCALE_MAP } from './translations';
import type { Language } from './translations';

const STORAGE_KEY = 'denga_lang';
const DEFAULT_LANG: Language = 'uk';

type Dict = typeof translations['uk'];

type TFunction = <K1 extends keyof Dict, K2 extends keyof Dict[K1]>(
  section: K1,
  key: K2
) => Dict[K1][K2];

interface LanguageContextValue {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: TFunction;
  locale: string;
}

const LanguageContext = createContext<LanguageContextValue | undefined>(undefined);

const isSupported = (v: unknown): v is Language =>
  typeof v === 'string' && (LANGUAGES as readonly string[]).includes(v);

const detectInitialLanguage = (): Language => {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (isSupported(stored)) return stored;
  } catch {
    /* ignore */
  }

  const tgLang = (window as any)?.Telegram?.WebApp?.initDataUnsafe?.user?.language_code;
  if (typeof tgLang === 'string') {
    const short = tgLang.slice(0, 2).toLowerCase();
    if (isSupported(short)) return short;
  }

  const navLang = typeof navigator !== 'undefined' ? navigator.language : '';
  const navShort = navLang.slice(0, 2).toLowerCase();
  if (isSupported(navShort)) return navShort;

  return DEFAULT_LANG;
};

export const LanguageProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [language, setLanguageState] = useState<Language>(() => detectInitialLanguage());

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, language);
    } catch {
      /* ignore */
    }
    document.documentElement.lang = language;
  }, [language]);

  const setLanguage = useCallback((lang: Language) => {
    setLanguageState(lang);
  }, []);

  const t = useCallback<TFunction>(
    (section, key) => translations[language][section][key],
    [language]
  );

  const value = useMemo<LanguageContextValue>(
    () => ({ language, setLanguage, t, locale: LOCALE_MAP[language] }),
    [language, setLanguage, t]
  );

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
};

export const useTranslation = (): LanguageContextValue => {
  const ctx = useContext(LanguageContext);
  if (!ctx) {
    throw new Error('useTranslation must be used within LanguageProvider');
  }
  return ctx;
};
