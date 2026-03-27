import React, { createContext, useContext, useState, useEffect } from 'react';
import { loadLanguage, setLanguage as setLang, getLanguage, Lang } from '../utils/i18n';

interface LanguageContextType {
  language: Lang;
  setLanguage: (lang: Lang) => void;
}

const LanguageContext = createContext<LanguageContextType>({
  language: 'en',
  setLanguage: () => {},
});

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [language, setLanguageState] = useState<Lang>('en');

  useEffect(() => {
    loadLanguage().then(setLanguageState);
  }, []);

  const setLanguage = (lang: Lang) => {
    setLang(lang);
    setLanguageState(lang);
  };

  return (
    <LanguageContext.Provider value={{ language, setLanguage }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  return useContext(LanguageContext);
}
