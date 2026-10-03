Mediciones de rendimiento
========================

La carga de datos, el progreso, la navegacion y la creacion/dibujo de Leaflet
estan separados de la pagina principal. El equipo (incluido el escaner) y el
ranking se importan al abrir sus vistas. Leaflet se importa al abrir el mapa;
una vez abierto se mantiene montado para conservar su camara.

Abrir `/benchmark` en el dispositivo a evaluar y pulsar **Medir**. Usa los
datos reales y las mismas funciones que la app, con tres ejecuciones por juego.
La tabla muestra la mediana en ms, sin contar las descargas. Necesita conexion
para cargar la pagina y los datos por primera vez. No envia las medidas.
Las marcas `route151:*` de la app tambien aparecen en Performance de DevTools.

Comprobacion del 3 de octubre de 2026: navegador integrado, PC Windows,
viewport 390 x 844. Estos tiempos NO representan un movil fisico ni una CPU
ralentizada; para tomar la decision de usar un worker hay que repetir el banco
en el telefono objetivo.

| Juego | Preparar | Arbol completo | Alcance inicial | Alcance con MO | Ruta |
| --- | ---: | ---: | ---: | ---: | ---: |
| Yellow | 11.2 | 75.9 | 26.1 | 53.4 | 44.4 |
| FireRed | 49.8 | 101.5 | 46.1 | 90.8 | 63.7 |
| LeafGreen | 46.7 | 95.9 | 40.7 | 95.6 | 70.9 |

El arbol completo es el mayor coste medido. Se conservan las caches por
habilidades y bloqueos; no se ha cambiado el algoritmo ni introducido un
worker. Comparar tambien el coste de transferir la rejilla al worker antes de
hacer ese cambio.

Para medir el JavaScript referenciado por el HTML inicial de produccion:
`npm run build` y `node scripts/measure-bundle.mjs`. El gzip es una estimacion
reproducible, no bytes de red observados. Antes de separar las vistas: 768762
bytes (242733 gzip). Tras separar las vistas: 745286 (239241 gzip), ademas de
posponer la descarga de Leaflet hasta abrir el mapa.
