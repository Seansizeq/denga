import React, { createContext, useContext, useEffect, useMemo, useState, useCallback } from 'react';
import { LANGUAGES, translations, LOCALE_MAP } from './translations';
import type { Language } from './translations';
import type { DisplayCurrency } from '../utils/formatters';

const STORAGE_KEY = 'denga_lang';
const CURRENCY_STORAGE_KEY = 'denga_currency';
const DEFAULT_LANG: Language = 'uk';
const DEFAULT_CURRENCY: DisplayCurrency = 'UAH';

type Dict = typeof translations['uk'];

type TFunction = <K1 extends keyof Dict, K2 extends keyof Dict[K1]>(
  section: K1,
  key: K2
) => Dict[K1][K2];

interface LanguageContextValue {
  language: Language;
  setLanguage: (lang: Language) => void;
  displayCurrency: DisplayCurrency;
  setDisplayCurrency: (currency: DisplayCurrency) => void;
  t: TFunction;
  locale: string;
}

const LanguageContext = createContext<LanguageContextValue | undefined>(undefined);

const isSupported = (v: unknown): v is Language =>
  typeof v === 'string' && (LANGUAGES as readonly string[]).includes(v);

const isSupportedCurrency = (v: unknown): v is DisplayCurrency =>
  v === 'UAH' || v === 'PLN' || v === 'USD';

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
  const [displayCurrency, setDisplayCurrencyState] = useState<DisplayCurrency>(() => {
    try {
      const stored = localStorage.getItem(CURRENCY_STORAGE_KEY);
      if (isSupportedCurrency(stored)) return stored;
    } catch {
      /* ignore */
    }
    return DEFAULT_CURRENCY;
  });

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, language);
    } catch {
      /* ignore */
    }
    document.documentElement.lang = language;
  }, [language]);

  useEffect(() => {
    try {
      localStorage.setItem(CURRENCY_STORAGE_KEY, displayCurrency);
    } catch {
      /* ignore */
    }
  }, [displayCurrency]);

  const setLanguage = useCallback((lang: Language) => {
    setLanguageState(lang);
  }, []);

  const setDisplayCurrency = useCallback((currency: DisplayCurrency) => {
    setDisplayCurrencyState(currency);
  }, []);

  const t = useCallback<TFunction>(
    (section, key) => translations[language][section][key],
    [language]
  );

  const value = useMemo<LanguageContextValue>(
    () => ({ language, setLanguage, displayCurrency, setDisplayCurrency, t, locale: LOCALE_MAP[language] }),
    [language, setLanguage, displayCurrency, setDisplayCurrency, t]
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
