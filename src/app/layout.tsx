import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
const mono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-mono" });

export const metadata: Metadata = {
  title: "ALADEEN v2 | Multi-Confluence Trading Bot",
  description: "AI trading bot with SMC + Trend + Volume analysis on Binance Testnet",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${mono.variable}`}>
      <body style={{ background: '#030712', color: '#f1f5f9', margin: 0, padding: 0 }}>
        {children}
      </body>
    </html>
  );
}
