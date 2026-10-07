Importar partidas de FireRed y LeafGreen
======================================

En Créditos → Importar partida (.sav), selecciona un guardado de **128 KiB**
exportado mediante Guardar en el juego. Se lee en el navegador y no se envía
a un servidor. No requiere una ROM. Los estados rápidos de un emulador tienen
otro formato. El juego elegido en la aplicación determina dónde se aplica:
un SAV no identifica de forma fiable FireRed frente a LeafGreen.

**Cada partida tiene su propia lista.** Lo que viene del juego real (este
importador o el emulador) nunca se mezcla con la lista marcada a mano: va a una
lista aparte por entrenador, identificada por su ID (`profileIdFor`, p. ej.
`p0c9a77f2`). Sus claves repiten las del juego con otro prefijo:
`ruta151-firered~p0c9a77f2`, `…-dex`, `…-team`, `…-sav`, `…-skip`. La lista manual
(`ruta151-firered`) no cambia. Arriba, un selector alterna entre «Mi lista» y
«🎮 nombre del entrenador»; la elección se guarda en `ruta151-profile-firered`.
Al importar o empezar a registrar una partida, la web muestra su lista; si
después se elige «Mi lista» mientras se juega, el emulador sigue escribiendo en
la partida sin cambiar la vista. Reiniciar desde Créditos borra solo la lista
visible, y «Deshacer» restaura solo la lista que se importó. Las copias de
seguridad incluyen todas las partidas y validan sus claves con las mismas reglas.

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
codificación japonesa quedan fuera de esta primera versión. La lectura en vivo
solo funciona con el emulador integrado; no se vigilan archivos de un emulador externo.

Jugar dentro de Route 151
------------------------

El botón de mando «Jugar y registrar» abre EmulatorJS 4.2.3 con el core mGBA,
junto a la checklist. Elige una ROM `.gba` original de FireRed o LeafGreen,
correspondiente al juego seleccionado, y opcionalmente un
SAV de 128 KiB. No se incluyen ROMs, BIOS ni partidas comerciales. La cabecera
se comprueba antes de arrancar; no garantiza que una ROM con modificaciones
sea compatible. Sin SAV elegido se usa el guardado del navegador para esa ROM,
si existe. Su identidad usa SHA-256 de la ROM, no solo el nombre del archivo.

La ROM elegida se recuerda en este navegador (IndexedDB, nunca sale del
dispositivo): la siguiente vez basta con «Seguir jugando». «Usar otro archivo»
permite elegir otra. Las ROMs FRLG de otros idiomas (francés, alemán, italiano,
japonés) se pueden jugar, pero sin registro automático: sus textos y su RAM no
están comprobados.

En el teléfono el juego ocupa la pantalla con los controles táctiles de
EmulatorJS. «Mi lista» pliega el juego sin cerrarlo y muestra la lista, la
Pokédex y el equipo; «Volver al juego» lo recupera. El iframe puede mantener
la pantalla encendida (`screen-wake-lock`); si el navegador lo rechaza, se
sigue jugando sin aviso de error.

Pulsa «Empezar» y después «Iniciar juego». Mientras juegas, el adaptador
lee **la RAM de la partida cada segundo**, sin esperar a que guardes: al recoger
un objeto, vencer a un entrenador, capturar un Pokémon o recibir una medalla se
marca en la lista en un segundo, y aparece «¡Nuevo!» con lo conseguido.

La RAM se obtiene de un estado de mGBA (`GBASerializedState`, 0x61000 bytes):
EmulatorJS lo devuelve dentro de un contenedor `RASTATE`, y el adaptador lo
localiza por el título y el código de la ROM en 0x10. Copia la IWRAM (0x19000) y la
EWRAM (0x21000) a la página; leer el estado tarda menos de un milisegundo.
`app/live-ram.ts` sigue `gSaveBlock1Ptr`, `gSaveBlock2Ptr` y `gPokemonStoragePtr`
(0x03005008, iguales en FireRed y LeafGreen rev0 y rev1 según los símbolos de pret)
y usa el equipo vivo de `gPlayerParty` (0x02024284), porque SaveBlock1 solo lo
copia al guardar. Con esos bloques llama al mismo lector y a las mismas reglas del
SAV. Si las direcciones no encajan (otra edición), busca punteros consecutivos a
bloques válidos y un equipo cuyo primer Pokémon pertenezca al entrenador.
Antes de tener equipo (intro o pantalla de título) no se registra nada. Un
fotograma con datos incompletos se ignora y se reintenta en el siguiente.

Solo se escribe cuando cambia el avance (marcas, Pokédex, medallas, objetos
clave, equipo o cajas), no el reloj ni la posición. Si no se puede leer la RAM, se
avisa y se sigue usando el SAV: el adaptador lo comprueba cada tres segundos.
El progreso en vivo que no se guarda en Pokémon se pierde en el juego, pero la
marca de la lista se conserva. Los miembros anteriores del equipo se conservan
como suplentes; un equipo incompatible se conserva en el registro, sin
reemplazar el equipo actual. «Sincronizar ahora» lee la RAM y el SAV al momento,
y «Descargar SAV» exporta la partida del juego y muestra un enlace para repetir
la descarga si el navegador la bloquea. Los estados rápidos no sustituyen el
guardado normal. Guarda dentro de Pokémon antes de cerrar el emulador.

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
seis miembros del equipo. Con la misma ROM se comprobó la
lectura en vivo: punteros reubicados por el juego, equipo de seis y un objeto
oculto activado en la RAM marcado en la lista en 1,2 s sin guardar. Falta
comprobar la ejecución de una ROM española real.

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
