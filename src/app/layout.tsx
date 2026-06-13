import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "KV Capital | Residential Comp Analysis",
  description: "AI-powered sales comparison valuation for residential properties in Calgary",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
