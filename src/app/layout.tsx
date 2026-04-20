import type { Metadata } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import Script from "next/script";
import { AppSidebar } from "@/components/AppSidebar";
import { LocaleProvider } from "@/components/LocaleProvider";
import { ThemeProvider } from "@/components/ThemeProvider";
import "./globals.css";

const plusJakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-plus-jakarta",
  display: "swap",
});

const themeInit = `(function(){try{var tk="procyon-theme";var tm=localStorage.getItem(tk);var d=false;if(tm==="dark")d=true;else if(tm==="light")d=false;else d=window.matchMedia("(prefers-color-scheme: dark)").matches;if(d)document.documentElement.classList.add("dark");else document.documentElement.classList.remove("dark");var lk="procyon-locale";var lm=localStorage.getItem(lk);var lg="en";if(lm==="fr")lg="fr";else if(lm==="en")lg="en";else lg=((navigator.language||"en").toLowerCase().indexOf("fr")===0)?"fr":"en";document.documentElement.setAttribute("lang",lg);}catch(e){}})();`;

export const metadata: Metadata = {
  title: "Procyon - Vulnerability Monitoring",
  description: "Modern dashboard for vulnerability tracking and scanner imports",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={plusJakarta.variable} suppressHydrationWarning>
      <body className={`${plusJakarta.className} min-h-dvh overflow-hidden antialiased`}>
        <Script id="procyon-theme-init" strategy="beforeInteractive">
          {themeInit}
        </Script>
        <ThemeProvider>
          <LocaleProvider>
            <div className="flex h-dvh items-stretch">
              <AppSidebar />
              <main className="min-w-0 flex-1 overflow-x-hidden overflow-y-auto">{children}</main>
            </div>
          </LocaleProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
