import type { Metadata } from "next";
import "./globals.css";
import { AppShell } from "@/components/AppShell";
import type { ReactNode } from "react";

interface RootLayoutProps {
  children: ReactNode;
}

export const metadata: Metadata = {
  title: "AI Trading Desk",
  description:
    "Autonomous AI trading desk: AI research, quantitative signals, risk control, Alpaca execution",
};

export default function RootLayout({ children }: RootLayoutProps) {
  return (
    <html
      lang="en"
      className="dark h-full antialiased"
      suppressHydrationWarning
    >
      <body className="min-h-screen bg-[#080b13] flex">
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
