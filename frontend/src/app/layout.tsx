import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "SEOBoard — Auditoría On-Page",
  description: "Suite SEO interna minimalista: auditoría técnica on-page con IA.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
