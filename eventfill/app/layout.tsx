import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

// Deliberately using the system font stack rather than next/font/google:
// no network fetch at build time, nothing to break, and it renders instantly.

export const metadata: Metadata = {
  title: "EventFill — fill your calendar before the show",
  description:
    "Turn a conference's public exhibitor directory into a scored, ready-to-send outreach list six weeks before the doors open.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col font-sans">
        <header className="border-b border-line">
          <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
            <Link href="/" className="font-semibold tracking-tight">
              Event<span className="text-accent">Fill</span>
            </Link>
            <nav className="flex items-center gap-5 text-sm text-muted">
              <Link href="/icp" className="hover:text-ink">
                Your customer
              </Link>
              <Link href="/harvest" className="hover:text-ink">
                Find an event
              </Link>
            </nav>
          </div>
        </header>

        <main className="flex-1">{children}</main>

        <footer className="border-t border-line">
          <div className="mx-auto max-w-5xl px-6 py-5 text-xs text-muted">
            Reads public exhibitor, speaker and sponsor directories only. Every row keeps its
            source URL and the date it was read.
          </div>
        </footer>
      </body>
    </html>
  );
}
