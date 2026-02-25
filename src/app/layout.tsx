import type { Metadata } from "next";
import "./globals.css";
import Navbar from "@/components/Navbar";

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
      </body>
    </html>
  );
}
