import "@fontsource-variable/inter";
import "@fontsource-variable/space-grotesk";
import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "Flowlet",
  description:
    "A mini webhook automation service. Create a flow, send an event to its webhook URL, and watch the steps run.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <header className="topbar">
          <div className="shell topbar-inner">
            <Link href="/" className="wordmark">
              Flowlet
            </Link>
            <nav>
              <Link href="/flows">Flows</Link>
            </nav>
          </div>
        </header>
        <main className="shell">{children}</main>
      </body>
    </html>
  );
}
