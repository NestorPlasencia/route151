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
Además de medallas, MO y objetos clave, el catálogo relaciona 886 entradas con
flags o variables persistentes: las 461 entradas de combate, incluidos líderes
y escenas del rival, 168 objetos del suelo, 183 objetos ocultos, 44 regalos de objetos,
11 regalos de Pokémon, 12 intercambios y siete pasos de historia adicionales.
La vista previa incluye una lista de los entrenadores, objetos y eventos detectados.
Cada regla conserva referencias a los scripts o constantes que justifican la asociación en
`save-catalog.json`; se genera desde los mapas del mismo commit de pret.

El inicial se determina mediante `VAR_STARTER_MON` y la marca de haberlo recibido.
Los fósiles de Mt. Moon necesitan la marca específica de la elección; que ambos
objetos hayan desaparecido no basta. El regalo del Dojo requiere la marca de
recepción y una sola bola retirada. Si las dos alternativas tienen señales
contradictorias, no se completa ninguna automáticamente. Un rival se reconoce
por las variantes de su encuentro concreto, no por cualquier combate con él.

Los regalos y los intercambios usan sus marcas propias. Los objetos del suelo
con flags de ocultación utilizadas por otras escenas se excluyen de la detección
genérica. Tener un objeto en la mochila no prueba de qué lugar vino; sus nombres
sí sirven para calcular rutas disponibles. Las flags de objetos ocultos renovables
reflejan el estado actual y pueden volver a cero cuando reaparecen.
El Paquete de Oak se reconoce por la escena de la tienda o por la entrega de la
Pokédex, incluso si ya se devolvió y no aparece en la mochila.

Las marcas de entrenador expresan que el juego considera resuelto el combate.
Al vencer a un líder, el juego también marca entrenadores de su gimnasio, aunque
no se hayan combatido directamente. No son un historial de victorias ni cuentan
revancha. Algunas escenas del rival inicial pueden terminar también al perder.
Capturas por ubicación, legendarios y pasos de recorrer rutas siguen siendo
manuales cuando no hay una prueba específica; no se deducen de la Pokédex completa.
Los guardados importados con versiones anteriores siguen siendo compatibles;
para aplicar las reglas nuevas, vuelve a importar el SAV con la app actualizada.

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
en vivo a la RAM ni vigilancia automática de archivos de un emulador externo.

Jugar dentro de Route 151
------------------------

El botón de mando «Jugar y registrar» abre EmulatorJS 4.2.3 con el core mGBA,
junto a la checklist. Elige una ROM `.gba` original de FireRed o LeafGreen en
inglés o español, correspondiente al juego seleccionado, y opcionalmente un
SAV de 128 KiB. No se incluyen ROMs, BIOS ni partidas comerciales. La cabecera
se comprueba antes de arrancar; no garantiza que una ROM con modificaciones
sea compatible. Sin SAV elegido se usa el guardado del navegador para esa ROM,
si existe. Su identidad usa SHA-256 de la ROM, no solo el nombre del archivo.

Pulsa «Cargar emulador» y después «Iniciar juego». Al usar **Guardar dentro de
Pokémon**, el adaptador comprueba el SAV cada tres segundos. Solo importa bytes
distintos y válidos, actualiza la lista y la Pokédex sin recargar la página, y
opcionalmente el equipo. Los miembros anteriores se conservan como suplentes.
Un equipo incompatible se conserva en el registro, sin reemplazar el equipo
actual. «Sincronizar ahora» permite reintentar una escritura fallida y
«Descargar SAV» exporta la partida del juego. Los estados rápidos no sustituyen
el guardado normal. Guarda dentro de Pokémon antes de cerrar el emulador.

Cada sesión conserva una única copia del progreso anterior para «Deshacer la
última importación» en Créditos. Las marcas manuales se conservan y cargar un
estado anterior no elimina marcas ya registradas. Detener una sesión cancela
sus lecturas pendientes; una pestaña distinta no puede mandar snapshots.
La ROM y el SAV no se envían a un servidor. El iframe carga únicamente archivos
locales y tiene una política de contenido que bloquea conexiones externas.

`npm run emulator:assets` descarga solo los recursos oficiales enumerados en
`scripts/emulator-assets.json` y verifica su SHA-256. `npm run build` también
los prepara; se incluyen en la descarga sin conexión de FRLG. Las licencias
originales se conservan: EmulatorJS incluye GPL-3.0 y el paquete del core incluye
su `license.txt`, accesible desde el menú del emulador.

La sincronización se prueba con sectores sintéticos, guardados públicos y el
adaptador de EmulatorJS. En navegador se comprobó el arranque de FireRed (USA)
con una ROM aportada por el usuario: el SAV de RoC registra 655 entradas y sus
seis miembros del equipo. La integración no consulta memoria de una partida
sin guardar. Falta comprobar la ejecución de una ROM española real.

Referencias: [EmulatorJS 4.2.3](https://github.com/EmulatorJS/EmulatorJS/tree/v4.2.3)
y [API de archivos de guardado](https://github.com/EmulatorJS/EmulatorJS/blob/v4.2.3/data/src/GameManager.js).

Guardados públicos de prueba
---------------------------

Fuente: [RoC's PC / Save Data](https://github.com/ReignOfComputer/RoCs-PC/tree/master/06%20-%20Gen%20III%20-%20FRLG%20Collection/Save%20Data).
Son archivos de una colección amplia; sirven para comprobar formatos y datos,
no para representar una partida recién empezada.

`npm run sav:samples` descarga únicamente los SAV y comprueba estos SHA-256:

| Archivo | SHA-256 | Datos comprobados |
| --- | --- | --- |
| Pokemon Fire Red.sav | 44ce64a4fefa9d9b2661a09d34055bf77249fcd9524f04be8f317688e999cd8b | RoC, 34:34, equipo 6, cajas 414, medallas 8, obtenidas 386, checklist 655 |
| Pokemon Leaf Green.sav | d6a0aac28fea111d96e4a7d0a3c1d8c82bbcddb8e6a622784df92aca0aa9a753 | RoC, 8:27, equipo 6, cajas 414, medallas 8, obtenidas 386, checklist 285 |

Se guardan en `outputs/sav`, ignorado por Git y excluido del sitio. Para incluirlos
en las pruebas locales de Node, establece `ROUTE151_SAV_SAMPLES=outputs/sav`.
CI usa fixtures sintéticos y no necesita descargar partidas de terceros.

Los dos archivos tienen una Pokédex completa, pero no los mismos eventos de
progreso. En FireRed se detectan 413 combates, 134 objetos del suelo, 44 ocultos,
36 regalos de objetos, seis regalos de Pokémon, nueve intercambios y 13 pasos
de historia. En LeafGreen son 186, seis, 44, 23, cuatro, nueve y 13, respectivamente.
Camper Liam se reconoce en ambos; Eevee está recibido solo en FireRed. Esta
diferencia evita completar toda la checklist por tener una colección completa.

Referencias de formato y regeneración
------------------------------------

El catálogo procede del mismo commit de pret que los mapas:
`c75f352304d529f6ba92d4f74b9cf8b5c3810788`.
Ejecuta `python scripts/frlg/sync-decomp.py` y `npm run sav:catalog` para regenerarlo.

- [Distribución y validación del guardado](https://github.com/pret/pokefirered/blob/c75f352304d529f6ba92d4f74b9cf8b5c3810788/src/save.c)
- [SaveBlock1 y SaveBlock2](https://github.com/pret/pokefirered/blob/c75f352304d529f6ba92d4f74b9cf8b5c3810788/include/global.h)
- [Datos y cifrado de Pokémon](https://github.com/pret/pokefirered/blob/c75f352304d529f6ba92d4f74b9cf8b5c3810788/src/pokemon.c)
- [Flags de eventos](https://github.com/pret/pokefirered/blob/c75f352304d529f6ba92d4f74b9cf8b5c3810788/include/constants/flags.h)
- [Identificadores de entrenadores](https://github.com/pret/pokefirered/blob/c75f352304d529f6ba92d4f74b9cf8b5c3810788/include/constants/opponents.h)
- [Variables de progreso](https://github.com/pret/pokefirered/blob/c75f352304d529f6ba92d4f74b9cf8b5c3810788/include/constants/vars.h)
- [Lectura y escritura de marcas de combate](https://github.com/pret/pokefirered/blob/c75f352304d529f6ba92d4f74b9cf8b5c3810788/src/battle_setup.c)
