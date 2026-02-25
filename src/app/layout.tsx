import type { Metadata } from "next";
import "./globals.css";
import Navbar from "@/components/Navbar";
import { Analytics } from "@vercel/analytics/next";

export const metadata: Metadata = {
  title: "Fantasy Basketball Schedule Analyzer",
  description: "Analyze NBA team schedules to optimize your fantasy basketball lineup",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body suppressHydrationWarning className="flex flex-col min-h-screen">
        <Navbar />
        {children}
        <Analytics />
      </body>
    </html>
  );
}
