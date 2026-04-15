"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

export type Locale = "en" | "fr";
export type LocaleMode = "auto" | Locale;

type LocaleContextValue = {
  locale: Locale;
  mode: LocaleMode;
  setMode: (mode: LocaleMode) => void;
};

const LocaleContext = createContext<LocaleContextValue | null>(null);
const STORAGE_KEY = "procyon-locale";

function detectBrowserLocale(): Locale {
  if (typeof navigator === "undefined") return "en";
  return navigator.language.toLowerCase().startsWith("fr") ? "fr" : "en";
}

function resolveLocale(mode: LocaleMode): Locale {
  if (mode === "auto") return detectBrowserLocale();
  return mode;
}

export function LocaleProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<LocaleMode>("auto");
  const [locale, setLocale] = useState<Locale>("en");

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored === "auto" || stored === "en" || stored === "fr") {
        setModeState(stored);
        setLocale(resolveLocale(stored));
        return;
      }
    } catch {
      // ignore
    }
    setLocale(resolveLocale("auto"));
  }, []);

  useEffect(() => {
    const next = resolveLocale(mode);
    setLocale(next);
    document.documentElement.setAttribute("lang", next);
    if (mode !== "auto") return;
    const onChange = () => setLocale(resolveLocale("auto"));
    window.addEventListener("languagechange", onChange);
    return () => window.removeEventListener("languagechange", onChange);
  }, [mode]);

  const setMode = useCallback((next: LocaleMode) => {
    setModeState(next);
    const resolved = resolveLocale(next);
    setLocale(resolved);
    document.documentElement.setAttribute("lang", resolved);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // ignore
    }
  }, []);

  const value = useMemo(() => ({ locale, mode, setMode }), [locale, mode, setMode]);
  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useLocale(): LocaleContextValue {
  const ctx = useContext(LocaleContext);
  if (!ctx) throw new Error("useLocale must be used within LocaleProvider");
  return ctx;
}

