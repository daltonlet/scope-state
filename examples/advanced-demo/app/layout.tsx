
import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Scope State Advanced Demo',
  description: 'Interactive showcase of all Scope State features and selective rendering',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>{children}</body>
    </html>
  );
} 