import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Analytics } from "@vercel/analytics/next";

const inter = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-inter",
});

// Applies the stored theme before first paint so there is no flash of the wrong
// palette. Keeps the `dark` class in sync because the shadcn ui/ components
// style themselves with Tailwind `dark:` variants, which key off that class.
const THEME_SCRIPT = `try{var t=localStorage.getItem('fbc-theme');if(t!=='light'&&t!=='dark'){t=matchMedia('(prefers-color-scheme: light)').matches?'light':'dark'}var r=document.documentElement;r.setAttribute('data-theme',t);r.classList.toggle('dark',t==='dark')}catch(e){}`;

export const metadata: Metadata = {
  title: "Fantasy Basketball Companion",
  description: "",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" data-theme="dark" className={`dark ${inter.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body suppressHydrationWarning className="font-sans flex flex-col min-h-screen">
        {children}
        <Analytics />
      </body>
    </html>
  );
}
