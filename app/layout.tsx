import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Smoothies Explorer",
  description: "Recettes de smoothies avec recherche, filtres et notes."
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fr">
      <body>{children}</body>
    </html>
  );
}
