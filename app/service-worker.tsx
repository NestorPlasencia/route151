'use client';
import { useEffect } from 'react';

// Registra /sw.js solo en produccion: en dev la cache taparia los cambios.
export function ServiceWorker() {
  useEffect(() => {
    if (
      process.env.NODE_ENV !== 'production' ||
      !('serviceWorker' in navigator)
    )
      return;
    navigator.serviceWorker
      .register('/sw.js')
      .catch((e) => console.error('No se pudo registrar el service worker', e));
  }, []);
  return null;
}
