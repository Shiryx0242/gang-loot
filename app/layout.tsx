import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import './globals.css';
import { GangProvider } from '@/lib/gang-context';

export const metadata: Metadata = {
  title: 'VIPER Loot Splitter',
  description: 'แบ่งของ/แบ่งเงินแก็ง พร้อมประวัติและ Dashboard',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#eaf3fd',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="th">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Fredoka:wght@400;500;600;700&family=Mali:wght@400;500;600;700&display=swap"
        />
      </head>
      <body>
        <GangProvider>{children}</GangProvider>
      </body>
    </html>
  );
}
