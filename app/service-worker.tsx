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

// Actualizar a mano (la app instalada no tiene "tirar para recargar"): busca la
// version nueva del service worker, borra la copia guardada de la pagina y de los
// datos (se sirven de la copia y se refrescan despues, asi que recargar sin mas
// ensenaria la anterior) y recarga. Los sprites se quedan: pesan y no cambian.
// El progreso no se toca: vive en localStorage.
export async function refreshApp(){
 try{
  const reg=await navigator.serviceWorker?.getRegistration();await reg?.update();
  const keys=await caches.keys();
  await Promise.all(keys.filter(k=>k.startsWith('route151-data-')||k.startsWith('route151-shell-')).map(k=>caches.delete(k)));
 }catch(e){console.error('No se pudo limpiar la cache',e)}
 location.reload();
}
