import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'XAA Requesting App',
  description:
    'Cross-App Access (XAA / ID-JAG) Requesting Application — Next.js reference for the xaa.dev playground.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-background font-sans antialiased">
        {children}
      </body>
    </html>
  );
}
