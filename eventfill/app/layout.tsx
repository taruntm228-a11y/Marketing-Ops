import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";
import { Mark } from "./art";

export const metadata: Metadata = {
  title: "Lanyard — fill your calendar before the show",
  description:
    "Turn a conference's public exhibitor directory into a scored shortlist and ready-to-send outreach, six weeks before the doors open.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased">
      <head>
        {/* Loaded at runtime rather than build time so the build never depends
            on reaching Google. */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,700;12..96,800&family=Instrument+Sans:wght@400;500;600&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="min-h-full flex flex-col">
        <header className="border-b-2 border-sand">
          <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
            <Link href="/" className="flex shrink-0 items-center gap-2.5">
              <Mark className="h-7 w-auto sm:h-8" />
              <span className="display text-[20px] sm:text-[22px]">Lanyard</span>
            </Link>
            <nav className="flex items-center gap-4 text-[14px] font-medium sm:gap-6 sm:text-[15px]">
              <Link href="/icp" className="text-ink-soft hover:text-teal">
                Your customer
              </Link>
              <Link href="/harvest" className="text-ink-soft hover:text-teal">
                Find an event
              </Link>
            </nav>
          </div>
        </header>

        <main className="flex-1">{children}</main>

        <footer className="mt-24 border-t-2 border-sand">
          <div className="mx-auto max-w-6xl px-6 py-7 text-[13.5px] text-ink-soft">
            Reads public exhibitor, speaker and sponsor directories only. Every row keeps the
            page it came from and the date it was read.
          </div>
        </footer>
      </body>
    </html>
  );
}
