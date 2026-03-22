import type { Metadata } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import Script from "next/script";
import { AppSidebar } from "@/components/AppSidebar";
import { ThemeProvider } from "@/components/ThemeProvider";
import "./globals.css";

const plusJakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-plus-jakarta",
  display: "swap",
});

const themeInit = `(function(){try{var k="procyon-theme";var m=localStorage.getItem(k);var d=false;if(m==="dark")d=true;else if(m==="light")d=false;else d=window.matchMedia("(prefers-color-scheme: dark)").matches;if(d)document.documentElement.classList.add("dark");else document.documentElement.classList.remove("dark");}catch(e){}})();`;

export const metadata: Metadata = {
  title: "Procyon — Suivi des vulnérabilités",
  description: "Tableau de bord léger pour le suivi des vulnérabilités et imports de scans",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fr" className={plusJakarta.variable} suppressHydrationWarning>
      <body className={`${plusJakarta.className} min-h-dvh antialiased`}>
        <Script id="procyon-theme-init" strategy="beforeInteractive">
          {themeInit}
        </Script>
        <ThemeProvider>
          <div className="flex min-h-dvh items-stretch">
            <AppSidebar />
            <main className="min-h-dvh min-w-0 flex-1 overflow-x-hidden">{children}</main>
          </div>
        </ThemeProvider>
      </body>
    </html>
  );
}
