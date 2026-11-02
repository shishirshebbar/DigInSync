import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "DigInSync — Infrastructure Coordination",
  description:
    "AI-assisted infrastructure coordination platform for Bengaluru. One plan. Multiple infrastructure works. One coordinated execution.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="bg-gray-50 text-gray-900 antialiased">{children}</body>
    </html>
  );
}
