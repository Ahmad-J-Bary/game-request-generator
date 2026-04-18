// src/i18n.ts

import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import enTranslation from "./locales/en/translation.json";
import arTranslation from "./locales/ar/translation.json";

i18n.use(initReactI18next).init({
  debug: false,
  resources: {
    en: {
      translation: enTranslation,
    },
    ar: {
      translation: arTranslation,
    },
  },
  lng: "en",
  fallbackLng: "en",
  interpolation: {
    escapeValue: false,
  },
  // Silence i18next console noise (e.g. Locize promotional message)
  react: {
    useSuspense: false,
  },
  saveMissing: false,
  missingKeyHandler: () => {},
  parseMissingKeyHandler: (key) => key,
});

if (typeof console !== "undefined") {
  const originalWarn = console.warn.bind(console);
  const originalInfo = console.info.bind(console);

  console.warn = (...args: unknown[]) => {
    const message = args.map((a) => String(a)).join(" ");
    if (message.includes("i18next is made possible by our own product, Locize"))
      return;
    originalWarn(...args);
  };

  console.info = (...args: unknown[]) => {
    const message = args.map((a) => String(a)).join(" ");
    if (message.includes("i18next is made possible by our own product, Locize"))
      return;
    originalInfo(...args);
  };
}

export default i18n;
