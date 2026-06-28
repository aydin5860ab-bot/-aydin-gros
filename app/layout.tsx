import React from 'react';

export const metadata = {
  title: 'Aydın Gros',
  description: 'Aydın Gros Sanal Market ve Yönetim Platformu',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="tr">
      <body>{children}</body>
    </html>
  );
}
