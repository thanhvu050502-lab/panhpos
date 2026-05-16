import React, { createContext, useContext, useState, useCallback } from 'react';
import { UI_TRANSLATIONS } from '../lib/i18n';

type Lang = 'vi' | 'en';

interface LangContextValue {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: (viText: string) => string;
}

const LangContext = createContext<LangContextValue>({
  lang: 'vi',
  setLang: () => {},
  t: (v) => v,
});

export const LangProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [lang, setLangState] = useState<Lang>(() => {
    try { return (localStorage.getItem('np_language') as Lang) || 'vi'; } catch { return 'vi'; }
  });

  const setLang = useCallback((l: Lang) => {
    try { localStorage.setItem('np_language', l); } catch { /* storage disabled */ }
    setLangState(l);
  }, []);

  const t = useCallback((viText: string): string => {
    if (lang === 'vi') return viText;
    return UI_TRANSLATIONS[viText] ?? viText;
  }, [lang]);

  return <LangContext.Provider value={{ lang, setLang, t }}>{children}</LangContext.Provider>;
};

export const useLang = () => useContext(LangContext);
