import type { Metadata } from "next";
import "./globals.css";
import "leaflet/dist/leaflet.css";
import AppNav from "@/components/AppNav";
import ActivityProvider from "@/components/ActivityProvider";

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
      <body className="bg-gray-50 text-gray-900 antialiased"><ActivityProvider><a href="#main-content" className="skip-link">Skip to content</a><AppNav />{children}</ActivityProvider></body>
    </html>
  );
}
