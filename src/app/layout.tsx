import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { AppShell } from "@/components/AppShell";
import type { ReactNode } from "react";

interface RootLayoutProps {
  children: ReactNode;
}

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "AI Trading Desk",
  description:
    "Autonomous AI trading desk: AI research, quantitative signals, risk control, Alpaca execution",
};

export default function RootLayout({ children }: RootLayoutProps) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} dark h-full antialiased`}
      suppressHydrationWarning
    >
      <script
        dangerouslySetInnerHTML={{
          __html:
            "try { var t = localStorage.getItem('razorstack-theme'); if (t === 'light') document.documentElement.classList.replace('dark', 'light'); } catch (_) {}",
        }}
      />
      <body className="min-h-screen bg-[#080b13] flex">
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
