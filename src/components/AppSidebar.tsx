"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useLocale } from "@/components/LocaleProvider";
import { SettingsMenu } from "@/components/SettingsMenu";

function IconBoard(props: { className?: string }) {
  return (
    <svg className={props.className} fill="none" stroke="currentColor" strokeWidth={1.75} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 4.5v15m6-15v15M4.5 9h15m-15 6h15M3.75 3.75h16.5v16.5H3.75V3.75Z" />
    </svg>
  );
}

function IconPlanning(props: { className?: string }) {
  return (
    <svg className={props.className} fill="none" stroke="currentColor" strokeWidth={1.75} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25m-18 0A2.25 2.25 0 0 0 5.25 21h13.5a2.25 2.25 0 0 0 2.25-2.25m-18 0v-7.5A2.25 2.25 0 0 1 5.25 9h13.5a2.25 2.25 0 0 1 2.25 2.25v7.5" />
    </svg>
  );
}

function IconReports(props: { className?: string }) {
  return (
    <svg className={props.className} fill="none" stroke="currentColor" strokeWidth={1.75} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
    </svg>
  );
}

export function AppSidebar() {
  const { locale } = useLocale();
  const pathname = usePathname();
  const t = (en: string, fr: string) => (locale === "fr" ? fr : en);
  const links = [
    {
      href: "/",
      label: t("Overview", "Vue principale"),
      description: t("Monitoring widgets", "Widgets monitoring"),
      icon: IconBoard,
    },
    {
      href: "/kanban",
      label: "Kanban",
      description: t("Operational board", "Pilotage opérationnel"),
      icon: IconBoard,
    },
    {
      href: "/planning",
      label: t("Planning", "Planning"),
      description: t("Calendar & deadlines", "Calendrier & échéances"),
      icon: IconPlanning,
    },
    {
      href: "/rapports",
      label: t("Reports", "Rapports"),
      description: t("Archived files", "Fichiers archivés"),
      icon: IconReports,
    },
  ] as const;

  return (
    <aside
      className="relative z-40 flex w-[4.25rem] shrink-0 flex-col self-stretch border-r border-[var(--sidebar-border)] bg-[var(--sidebar-bg)] lg:w-60"
      aria-label={t("Navigation", "Navigation")}
    >
      <div className="flex h-16 items-center justify-center border-b border-[var(--sidebar-border)] px-3 lg:justify-start lg:px-5">
        <Link href="/" className="flex items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-[var(--sidebar-accent-dim)] text-[var(--sidebar-accent)]">
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
              <path d="M12 2L4 6v6c0 5.25 3.66 10.17 8 11 4.34-.83 8-5.75 8-11V6l-8-4zm0 2.18l6 3v5.82c0 4.25-2.92 8.3-6 9.09-3.08-.79-6-4.84-6-9.09V7.18l6-3zM11 7h2v6h-2V7zm0 8h2v2h-2v-2z" />
            </svg>
          </span>
          <div className="hidden min-w-0 lg:block">
            <p className="truncate text-sm font-bold tracking-tight text-[var(--sidebar-text)]">Procyon</p>
            <p className="truncate text-[11px] font-medium text-[var(--sidebar-muted)]">
              {t("Posture & vulnerabilities", "Posture & vulnérabilités")}
            </p>
          </div>
        </Link>
      </div>

      <nav className="flex flex-1 flex-col gap-1 p-2 lg:p-3" aria-label={t("Sections", "Sections")}>
        {links.map(({ href, label, description, icon: Icon }) => {
          const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              title={label}
              className={`group flex items-center gap-3 rounded-lg px-2 py-2.5 transition-colors lg:px-3 ${
                active
                  ? "bg-[var(--sidebar-active)] text-[var(--sidebar-text)] shadow-sm ring-1 ring-[var(--sidebar-accent)]/25"
                  : "text-[var(--sidebar-muted)] hover:bg-[var(--sidebar-hover)] hover:text-[var(--sidebar-text)]"
              }`}
            >
              <Icon
                className={`h-5 w-5 shrink-0 ${
                  active ? "text-[var(--sidebar-accent)]" : "text-[var(--sidebar-muted)] group-hover:text-[var(--sidebar-text)]"
                }`}
              />
              <div className="hidden min-w-0 flex-1 lg:block">
                <p className="truncate text-sm font-semibold">{label}</p>
                <p className="truncate text-[11px] opacity-80">{description}</p>
              </div>
            </Link>
          );
        })}
      </nav>

      <div className="relative border-t border-[var(--sidebar-border)] p-2 lg:p-3">
        <SettingsMenu />
      </div>
    </aside>
  );
}
