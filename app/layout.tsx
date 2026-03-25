import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Coqui Voice Cloning Test",
  description: "Minimal local test app for Coqui voice cloning.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
