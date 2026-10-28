import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "CBS Operations Hub",
  description: "Operations Hub for Chelmsford Building Services",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en-GB" className="h-full antialiased">
      <body className="min-h-full">{children}</body>
    </html>
  );
}
