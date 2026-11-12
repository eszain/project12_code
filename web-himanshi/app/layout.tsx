import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "CADS | Collision Avoidance Detection System",
  description: "A decision-support interface for space conjunction operations.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
