import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import './globals.css';
import { GangProvider } from '@/lib/gang-context';

export const metadata: Metadata = {
  title: 'Gang Loot Splitter',
  description: 'แบ่งของ/แบ่งเงินแก็ง พร้อมประวัติและ Dashboard',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#090e2b',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="th">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Noto+Sans+Thai:wght@400;500;700&display=swap"
        />
      </head>
      <body>
        <GangProvider>{children}</GangProvider>
      </body>
    </html>
  );
}
