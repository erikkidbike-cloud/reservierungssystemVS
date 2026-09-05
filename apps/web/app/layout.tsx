import type { Metadata } from 'next';
import { Mulish } from 'next/font/google';
import './globals.css';

const mulish = Mulish({ subsets: ['latin'], display: 'swap', variable: '--font-sans' });

export const metadata: Metadata = {
  title: 'KidBike Verkehrsschulen — Reservierung',
  description: 'Buchungssystem der KidBike Verkehrsschulen',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="de" className={mulish.variable}>
      <body>{children}</body>
    </html>
  );
}
