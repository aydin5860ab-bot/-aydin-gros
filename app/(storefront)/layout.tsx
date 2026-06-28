import React from 'react';
import './globals.css';

export const metadata = {
  title: 'Aydın Gros Sanal Market | Tokat Online Alışveriş',
  description: 'Aydın Gros Tokat\'ın yerel süpermarket zinciri. Online alışveriş, WhatsApp eve teslimat, taze manav, temel gıda ve daha fazlası.',
};

export default function StorefrontLayout({
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
