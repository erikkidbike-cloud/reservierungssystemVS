import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'KidBike Verkehrsschulen — Reservierung',
  description: 'Buchungssystem der KidBike Verkehrsschulen',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="de">
      <body>{children}</body>
    </html>
  );
}
