import type { Metadata } from "next";
import { Inter } from "next/font/google";
import Script from "next/script";
import { AppNav } from "@/components/AppNav";
import { ThemeProvider } from "@/components/ThemeProvider";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

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
    <html lang="fr" suppressHydrationWarning>
      <body className={`${inter.className} min-h-screen antialiased`}>
        <Script id="procyon-theme-init" strategy="beforeInteractive">
          {themeInit}
        </Script>
        <ThemeProvider>
          <AppNav />
          <main>{children}</main>
        </ThemeProvider>
      </body>
    </html>
  );
}
