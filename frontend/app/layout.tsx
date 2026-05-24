import type { Metadata } from "next";
import "./globals.css";
import { AppShell } from "@/components/AppShell";

export const metadata: Metadata = {
  title: "insiderbuying — Insider intelligence, instantly",
  description:
    "Track insider buys and sells in real-time. SEC Form 4 analysis reveals where smart money is accumulating.",
};

const themeScript = `
  (function(){
    try {
      var saved = localStorage.getItem('ib-theme');
      document.documentElement.setAttribute('data-theme', saved || 'light');
    } catch(e) {
      document.documentElement.setAttribute('data-theme', 'light');
    }
  })();
`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="antialiased">
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
