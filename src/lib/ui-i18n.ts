/** Petits utilitaires partagés pour l’UI bilingue (évite d’importer le provider côté logique pure). */

export type UILocale = "en" | "fr";

export function uiT(locale: UILocale, en: string, fr: string): string {
  return locale === "fr" ? fr : en;
}

export function dateLocaleTag(locale: UILocale): string {
  return locale === "fr" ? "fr-FR" : "en-US";
}
