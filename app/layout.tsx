import './globals.css';
import type { ReactNode } from 'react';

export const metadata = {
  title: 'Video Generator',
  description: 'Generate simple animated videos in your browser',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
