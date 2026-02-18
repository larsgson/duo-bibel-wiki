import eng from "./eng.json";
import fra from "./fra.json";
import deu from "./deu.json";
import spa from "./spa.json";
import por from "./por.json";
import rus from "./rus.json";
import hin from "./hin.json";
import arb from "./arb.json";
import ron from "./ron.json";

const translations: Record<string, Record<string, string>> = {
  eng,
  fra,
  frd: fra,
  deu,
  spa,
  por,
  rus,
  hin,
  arb,
  ron,
};

/**
 * Returns a translation function for the given API language code (3-letter).
 * Falls back to English for missing keys or unsupported locales.
 */
export function useTranslations(langCode: string) {
  const dict = translations[langCode] || eng;

  return function t(key: string): string {
    return dict[key] || eng[key] || key;
  };
}
