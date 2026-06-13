import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Comp Analysis Tool",
  description: "Residential home valuation via sales comparison approach",
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
