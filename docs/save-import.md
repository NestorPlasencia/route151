Importar partidas de FireRed y LeafGreen
======================================

En Créditos → Importar partida (.sav), selecciona un guardado de **128 KiB**
exportado mediante Guardar en el juego. Se lee en el navegador y no se envía
a un servidor. No requiere una ROM. Los estados rápidos de un emulador tienen
otro formato. El juego elegido en la aplicación determina dónde se aplica:
un SAV no identifica de forma fiable FireRed frente a LeafGreen.

La vista previa enseña entrenador, tiempo, equipo, cajas, Pokédex, medallas,
objetos clave, MO y el número de entradas verificadas. Puedes conservar las
marcas anteriores o reemplazar el progreso de ese juego. Actualizar el equipo
conserva los Pokémon anteriores como suplentes; importar las cajas es opcional.
Los huevos y las especies/ataques que faltan en el catálogo de combate actual
se conservan en el registro del SAV, pero no se añaden al equipo. La vista previa
los contabiliza. Un equipo parcialmente incompatible se importa únicamente si
se desactiva la actualización del equipo.

Las especies obtenidas se registran en la Pokédex desde una fuente independiente:
no se completan todas sus localizaciones, regalos o elecciones de la checklist.
Los hitos comprobados se limitan a medallas, seis MO, cañas, bicicleta, ticket,
té, Poké Flauta, Campeón y siete pasos de historia respaldados por flags. Los
objetos clave del inventario también sirven para calcular rutas disponibles,
sin inventar el lugar donde se recogieron. Entrenadores generales, objetos
sueltos y el resto de la historia siguen requiriendo marcas manuales.

El importador verifica los 14 sectores de cada copia, sus identificadores,
firmas, checksums y contadores; reconoce la rotación de sectores y el desborde
del contador. Si una copia está incompleta, puede usar la otra completa y avisa.
Descifra y comprueba cada Pokémon, incluyendo los 24 órdenes de sus subbloques.
Lee estadísticas reales del equipo y calcula las de las cajas con experiencia,
IV, EV y naturaleza de tercera generación. Los IV importados se usan directamente
en el juez; cambiar el nivel o la naturaleza recalcula sus estadísticas.

Antes de escribir se guarda una copia del estado anterior. El mismo diario
transaccional que protege las copias de seguridad restaura el progreso si una
escritura falla. «Deshacer la última importación» restaura solo el juego afectado
(incluidas sus modificaciones posteriores) y conserva los demás juegos. El
registro importado, con su huella SHA-256 y los datos del PC, viaja en el backup
normal de Route 151. No modifica el archivo SAV original.

Compatibilidad comprobada: los dos guardados ingleses de RoC's PC y fixtures
sintéticos con nombres españoles. Falta comprobar una partida real española.
Yellow, modificaciones del formato por ROM hacks y registros de Pokémon con
codificación japonesa quedan fuera de esta primera versión. No hay conexión
en vivo al emulador ni vigilancia automática de archivos todavía.

Guardados públicos de prueba
---------------------------

Fuente: [RoC's PC / Save Data](https://github.com/ReignOfComputer/RoCs-PC/tree/master/06%20-%20Gen%20III%20-%20FRLG%20Collection/Save%20Data).
Son archivos de una colección amplia; sirven para comprobar formatos y datos,
no para representar una partida recién empezada.

`npm run sav:samples` descarga únicamente los SAV y comprueba estos SHA-256:

| Archivo | SHA-256 | Datos comprobados |
| --- | --- | --- |
| Pokemon Fire Red.sav | 44ce64a4fefa9d9b2661a09d34055bf77249fcd9524f04be8f317688e999cd8b | RoC, 34:34, equipo 6, cajas 414, medallas 8, obtenidas 386 |
| Pokemon Leaf Green.sav | d6a0aac28fea111d96e4a7d0a3c1d8c82bbcddb8e6a622784df92aca0aa9a753 | RoC, 8:27, equipo 6, cajas 414, medallas 8, obtenidas 386 |

Se guardan en `outputs/sav`, ignorado por Git y excluido del sitio. Para incluirlos
en las pruebas locales de Node, establece `ROUTE151_SAV_SAMPLES=outputs/sav`.
CI usa fixtures sintéticos y no necesita descargar partidas de terceros.

Referencias de formato y regeneración
------------------------------------

El catálogo procede del mismo commit de pret que los mapas:
`c75f352304d529f6ba92d4f74b9cf8b5c3810788`.
Ejecuta `python scripts/frlg/sync-decomp.py` y `npm run sav:catalog` para regenerarlo.

- [Distribución y validación del guardado](https://github.com/pret/pokefirered/blob/c75f352304d529f6ba92d4f74b9cf8b5c3810788/src/save.c)
- [SaveBlock1 y SaveBlock2](https://github.com/pret/pokefirered/blob/c75f352304d529f6ba92d4f74b9cf8b5c3810788/include/global.h)
- [Datos y cifrado de Pokémon](https://github.com/pret/pokefirered/blob/c75f352304d529f6ba92d4f74b9cf8b5c3810788/src/pokemon.c)
- [Flags de eventos](https://github.com/pret/pokefirered/blob/c75f352304d529f6ba92d4f74b9cf8b5c3810788/include/constants/flags.h)
