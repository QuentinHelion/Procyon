"use client";

import { useEffect, useRef, useState } from "react";
import type { LocaleMode } from "./LocaleProvider";
import { useLocale } from "./LocaleProvider";
import type { ThemeMode } from "./ThemeProvider";
import { useTheme } from "./ThemeProvider";

export function SettingsMenu() {
  const { mode, setMode, resolved } = useTheme();
  const { locale, mode: localeMode, setMode: setLocaleMode } = useLocale();
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    const onPointer = (e: MouseEvent) => {
      const t = e.target as Node;
      if (panelRef.current?.contains(t) || btnRef.current?.contains(t)) return;
      setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onPointer);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onPointer);
    };
  }, [open]);

  const themeOptions: { value: ThemeMode; label: string }[] = [
    { value: "light", label: locale === "fr" ? "Clair" : "Light" },
    { value: "dark", label: locale === "fr" ? "Sombre" : "Dark" },
    { value: "system", label: locale === "fr" ? "Auto" : "Auto" },
  ];
  const localeOptions: { value: LocaleMode; label: string }[] = [
    { value: "auto", label: locale === "fr" ? "Auto (navigateur)" : "Auto (browser)" },
    { value: "en", label: "English" },
    { value: "fr", label: "Français" },
  ];

  return (
    <div className="relative w-full">
      <button
        ref={btnRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-center gap-3 rounded-lg px-2 py-2.5 text-[var(--sidebar-muted)] transition-colors hover:bg-[var(--sidebar-hover)] hover:text-[var(--sidebar-text)] lg:justify-start lg:px-3"
        aria-expanded={open}
        aria-haspopup="dialog"
      >
        <svg
          className="h-5 w-5 shrink-0"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.75}
          viewBox="0 0 24 24"
          aria-hidden
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 0 1 0 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 0 1 0-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281Z"
          />
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
        </svg>
        <span className="hidden text-sm font-semibold lg:inline">{locale === "fr" ? "Paramètres" : "Settings"}</span>
      </button>

      {open ? (
        <div
          ref={panelRef}
          className="fixed bottom-4 left-[4.25rem] z-[100] w-[min(calc(100vw-2rem),18rem)] rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] p-4 shadow-xl lg:absolute lg:bottom-full lg:left-0 lg:mb-2 lg:ml-0 lg:w-72"
          style={{ boxShadow: "var(--shadow-card), 0 12px 40px rgba(15,23,42,0.12)" }}
          role="dialog"
          aria-label={locale === "fr" ? "Paramètres" : "Settings"}
        >
          <h2 className="text-sm font-semibold text-[var(--text)]">{locale === "fr" ? "Paramètres" : "Settings"}</h2>

          <div className="mt-4">
            <p className="text-xs font-medium text-[var(--muted)]">{locale === "fr" ? "Thème" : "Theme"}</p>
            <p className="mt-0.5 text-[10px] text-[var(--muted)]">
              {locale === "fr" ? "Rendu :" : "Render:"} {resolved === "dark" ? (locale === "fr" ? "sombre" : "dark") : locale === "fr" ? "clair" : "light"}
              {mode === "system" ? (locale === "fr" ? " · suit le système" : " · follows system") : ""}
            </p>
            <div className="mt-2 grid grid-cols-3 gap-1 rounded-lg bg-[var(--column)] p-1">
              {themeOptions.map((o) => (
                <button
                  key={o.value}
                  type="button"
                  onClick={() => setMode(o.value)}
                  className={`rounded-md px-2 py-2 text-center text-xs font-semibold transition ${
                    mode === o.value
                      ? "bg-[var(--surface)] text-[var(--accent)] shadow-sm ring-1 ring-[var(--border)]"
                      : "text-[var(--muted)] hover:text-[var(--text)]"
                  }`}
                >
                  {o.label}
                </button>
              ))}
            </div>
          </div>

          <div className="mt-5 border-t border-[var(--border)] pt-4">
            <p className="text-xs font-medium text-[var(--muted)]">{locale === "fr" ? "Langue" : "Language"}</p>
            <div className="mt-2 grid grid-cols-1 gap-1 rounded-lg bg-[var(--column)] p-1">
              {localeOptions.map((o) => (
                <button
                  key={o.value}
                  type="button"
                  onClick={() => setLocaleMode(o.value)}
                  className={`rounded-md px-2 py-2 text-left text-xs font-semibold transition ${
                    localeMode === o.value
                      ? "bg-[var(--surface)] text-[var(--accent)] shadow-sm ring-1 ring-[var(--border)]"
                      : "text-[var(--muted)] hover:text-[var(--text)]"
                  }`}
                >
                  {o.label}
                </button>
              ))}
            </div>
          </div>

        </div>
      ) : null}
    </div>
  );
}
