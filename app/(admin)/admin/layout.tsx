import React from 'react';
import './admin.css';

export const metadata = {
  title: 'Aydın Gros – Yönetim Paneli',
  description: 'Aydın Gros Yönetim Paneli',
};

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      {children}
    </>
  );
}
