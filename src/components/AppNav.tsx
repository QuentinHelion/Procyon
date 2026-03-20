"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { SettingsMenu } from "@/components/SettingsMenu";

const links = [
  { href: "/", label: "Tableau" },
  { href: "/planning", label: "Rétro-planning" },
  { href: "/rapports", label: "Rapports" },
] as const;

export function AppNav() {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-30 border-b border-[var(--border)] bg-[var(--surface)]/95 backdrop-blur-sm">
      <div className="mx-auto flex max-w-[1400px] items-center justify-between gap-4 px-4 py-3 sm:px-6">
        <div className="flex min-w-0 flex-1 items-center gap-6">
          <Link
            href="/"
            className="shrink-0 text-lg font-semibold tracking-tight text-[var(--text)] hover:text-[var(--accent)]"
          >
            Procyon
          </Link>
          <nav className="flex flex-wrap items-center gap-1 sm:gap-2" aria-label="Navigation principale">
            {links.map(({ href, label }) => {
              const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
              return (
                <Link
                  key={href}
                  href={href}
                  className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${
                    active
                      ? "bg-[var(--column)] text-[var(--text)]"
                      : "text-[var(--muted)] hover:bg-[var(--column)] hover:text-[var(--text)]"
                  }`}
                >
                  {label}
                </Link>
              );
            })}
          </nav>
        </div>
        <SettingsMenu />
      </div>
    </header>
  );
}
