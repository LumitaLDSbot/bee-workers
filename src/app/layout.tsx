import type { Metadata, Viewport } from 'next';
import { Space_Grotesk } from 'next/font/google';
import './globals.css';
import { PWAProvider } from '@/components/PWAProvider';
import { Analytics } from '@/components/seo/Analytics';

const spaceGrotesk = Space_Grotesk({
  subsets: ['latin'],
  variable: '--font-space-grotesk',
});

export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3004'
  ),
  manifest: '/manifest.webmanifest',
  title: {
    default: 'Bee Workers | Turnos en hostelería en Porto',
    template: '%s | Bee Workers',
  },
  description:
    'Bee Workers conecta trabajadores autónomos con empleadores de hostelería y restauración en Porto para turnos puntuales y temporales.',
  applicationName: 'Bee Workers',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'Bee Workers',
  },
  formatDetection: {
    telephone: false,
  },
  openGraph: {
    type: 'website',
    locale: 'es_ES',
    siteName: 'Bee Workers',
    title: 'Bee Workers | Turnos en hostelería en Porto',
    description:
      'Marketplace de turnos puntuales para trabajadores autónomos y empleadores de hostelería en Porto.',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Bee Workers',
    description:
      'Turnos puntuales en hostelería y restauración en Porto para trabajadores autónomos.',
  },
  robots: {
    index: true,
    follow: true,
  },
};

export const viewport: Viewport = {
  themeColor: '#FFB800',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es" className={spaceGrotesk.variable}>
      <body className="min-h-screen bg-[#FFFAF0] font-sans text-[#1A1A1A] antialiased dark:bg-neutral-950 dark:text-neutral-100">
        <PWAProvider>{children}</PWAProvider>
        <Analytics />
      </body>
    </html>
  );
}
