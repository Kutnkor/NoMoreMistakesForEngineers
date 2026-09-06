import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = {
  title: 'CIRCUIT FORGE — Embedded Studio & AI Laboratory',
  description:
    'Create wiring plans and Wokwi projects for Arduino, ESP32, and Pico. Explore finite-bandwidth op-amp models, trained fault diagnosis, and equal-budget design experiments.',
  icons: { icon: '/favicon.svg' },
};
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang={'en'}>
      <body>{children}</body>
    </html>
  );
}
