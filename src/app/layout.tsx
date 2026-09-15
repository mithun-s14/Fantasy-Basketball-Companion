import type { Metadata } from "next";
import { Barlow_Condensed } from "next/font/google";
import "@fontsource/apfel-grotezk/400.css";
import "@fontsource/apfel-grotezk/700.css";
import "./globals.css";
import { Analytics } from "@vercel/analytics/next";

const barlow = Barlow_Condensed({
  subsets: ["latin"],
  weight: ["600", "700", "800"],
  variable: "--font-barlow",
});

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
    <html lang="en" className={`dark ${barlow.variable}`}>
      <body suppressHydrationWarning className="font-sans flex flex-col min-h-screen">
        {children}
        <Analytics />
      </body>
    </html>
  );
}
