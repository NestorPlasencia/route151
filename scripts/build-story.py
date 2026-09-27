"""Pasos de historia de cada juego como marcadores de la checklist.

Son las acciones que no son objetos ni combates y que un jugador nuevo necesita
saber: entregar el paquete a Oak, dar una bebida a los guardias, calmar al
fantasma de la Torre. Se escriben a mano (sacados de los walkthroughs de
Serebii para Yellow y de The Cave of Dragonflies para FRLG, y comprobados en
los decomp), cada uno en la casilla de su NPC o de su evento. Aqui se colocan en
el mapa de la app con nav.json (area, zona) y areas.json (el piso), y se
escribe public/<juego>/data/story.json. Tienen uid como cualquier marcador:
son checks de verdad, que se guardan con el progreso.

Uso:  python scripts/build-story.py   (despues de los scripts reach-*)
"""
import json, os, sys

sys.path.insert(0, os.path.dirname(__file__))
from common.world import uid_of

# (id, mapa, x, y, nombre en/es, detalle en/es). Los 'cross-' son tramos de
# camino (cruzar un bosque, una cueva), en la casilla por la que se sale.
STEPS = {
    'yellow': [
        ('leave-house', 'PALLET_TOWN', 5, 5, ('Leave your house', 'Sal de tu casa'),
         ('You start in your room upstairs: go down the stairs and out the door.', 'Empiezas en tu cuarto, arriba: baja las escaleras y sal por la puerta.')),
        ('oak-stops', 'PALLET_TOWN', 10, 1, ('Head for the tall grass', 'Ve hacia la hierba alta'),
         ('Professor Oak stops you, catches a Pikachu and takes you to his lab.', 'El Prof. Oak te detiene, atrapa un Pikachu y te lleva a su laboratorio.')),
        ('deliver-parcel', 'OAKS_LAB', 5, 2, ("Deliver Oak's Parcel", 'Entrega el Paquete de Oak'),
         ('Bring the parcel from the Viridian Mart back to Oak: he gives you the Pokédex.', 'Lleva el paquete de la tienda de Verde al Prof. Oak: te da la Pokédex.')),
        ('old-man', 'VIRIDIAN_CITY', 17, 5, ('Watch the old man catch a Pokémon', 'Mira al anciano atrapar un Pokémon'),
         ('Once you have the Pokédex he lets you through to Route 2 and shows you how to throw a Poké Ball.', 'Con la Pokédex te deja pasar a la Ruta 2 y te enseña a lanzar una Poké Ball.')),
        ('buy-drink', 'CELADON_MART_ROOF', 10, 1, ('Buy a drink on the Celadon roof', 'Compra una bebida en la azotea de Azulona'),
         ('Fresh Water, Soda Pop or Lemonade from the vending machines: the Saffron guards are thirsty.', 'Agua Fresca, Refresco o Limonada de las máquinas: los guardias de Azafrán tienen sed.')),
        ('give-drink', 'ROUTE_5_GATE', 1, 3, ('Give a drink to a Saffron guard', 'Da una bebida a un guardia de Azafrán'),
         ('In any of the gatehouses around Saffron: the guard lets you into the city.', 'En cualquiera de las casetas alrededor de Azafrán: el guardia te deja entrar a la ciudad.')),
        ('rocket-poster', 'GAME_CORNER', 9, 4, ('Open the hideout behind the Game Corner poster', 'Abre la guarida tras el póster del Casino'),
         ('Beat the Rocket in front of the poster and press the switch behind it.', 'Vence al Rocket delante del póster y pulsa el interruptor que hay detrás.')),
        ('marowak', 'POKEMON_TOWER_6F', 10, 16, ('Calm the ghost of Marowak', 'Calma al fantasma de Marowak'),
         ('With the Silph Scope you can see it and battle it; then the way up opens.', 'Con el Visor Silph puedes verlo y combatirlo; después se abre el paso hacia arriba.')),
        ('rescue-fuji', 'POKEMON_TOWER_7F', 10, 3, ('Rescue Mr. Fuji', 'Rescata al Sr. Fuji'),
         ('At the top of the tower, after Jessie and James. He thanks you with the Poké Flute at his house.', 'En lo alto de la torre, tras Jessie y James. En su casa te da la Poké Flauta.')),
        ('cross-forest', 'VIRIDIAN_FOREST', 2, 0, ('Cross Viridian Forest', 'Cruza el Bosque Verde'),
         ('Head out the north end towards Route 2 and Pewter City; its trainers use Bug Pokémon.', 'Sal por el norte hacia la Ruta 2 y Ciudad Plateada; sus entrenadores usan Pokémon Bicho.')),
        ('cross-moon', 'ROUTE_4', 24, 5, ('Cross Mt. Moon', 'Cruza el Monte Moon'),
         ('At the far end you choose a fossil; you come out on Route 4, on the way to Cerulean City.', 'Al fondo eliges un fósil; sales a la Ruta 4, camino de Ciudad Celeste.')),
        ('flash', 'ROUTE_2_GATE', 1, 4, ("Get HM05 (Flash) from Oak's aide", 'Consigue la MO05 (Destello) del ayudante de Oak'),
         ("In the Route 2 gatehouse, by Diglett's Cave: he gives it once you have registered 10 Pokémon. Flash lights up Rock Tunnel.", 'En la caseta de la Ruta 2, junto a la Cueva Diglett: te la da si tienes 10 Pokémon registrados. Destello ilumina el Túnel Roca.')),
        ('cross-tunnel', 'ROUTE_10', 8, 53, ('Cross Rock Tunnel', 'Cruza el Túnel Roca'),
         ('It is pitch dark: Flash (HM05) lights the way. You come out to the south, next to Lavender Town.', 'Está a oscuras: Destello (MO05) ilumina el camino. Sales por el sur, junto a Pueblo Lavanda.')),
        ('cross-underground', 'ROUTE_7', 5, 13, ('Take the Underground Path to Celadon', 'Ve a Azulona por el Camino Subterráneo'),
         ('Saffron is closed: from Route 8, go down the tunnel and come out on Route 7, next to Celadon City.', 'Azafrán está cerrada: desde la Ruta 8 baja al túnel y sal en la Ruta 7, junto a Ciudad Azulona.')),
        ('cross-cycling', 'ROUTE_18', 40, 8, ('Ride down Cycling Road to Fuchsia', 'Baja por la Calle Bici hasta Fucsia'),
         ('From Route 16, with the Bicycle and Snorlax awake: downhill to Route 18 and Fuchsia City.', 'Desde la Ruta 16, con la Bici y Snorlax despierto: cuesta abajo hasta la Ruta 18 y Ciudad Fucsia.')),
        ('cross-victory', 'ROUTE_23', 14, 31, ('Cross Victory Road', 'Cruza la Calle Victoria'),
         ('Strength moves the boulders onto the switches; at the exit the Indigo Plateau is just north.', 'Fuerza mueve las rocas sobre los interruptores; a la salida, la Meseta Añil está justo al norte.')),
    ],
    'frlg': [
        ('leave-house', 'MAP_PALLET_TOWN', 6, 7, ('Leave your house', 'Sal de tu casa'),
         ('You start in your room upstairs: go down the stairs and out the door.', 'Empiezas en tu cuarto, arriba: baja las escaleras y sal por la puerta.')),
        ('oak-stops', 'MAP_PALLET_TOWN', 12, 1, ('Head for the tall grass', 'Ve hacia la hierba alta'),
         ('Professor Oak stops you and takes you to his lab to choose your first Pokémon.', 'El Prof. Oak te detiene y te lleva a su laboratorio a elegir tu primer Pokémon.')),
        ('deliver-parcel', 'MAP_PALLET_TOWN_PROFESSOR_OAKS_LAB', 6, 3, ("Deliver Oak's Parcel", 'Entrega el Paquete de Oak'),
         ('Bring the parcel from the Viridian Mart back to Oak: he gives you the Pokédex and five Poké Balls.', 'Lleva el paquete de la tienda de Verde al Prof. Oak: te da la Pokédex y cinco Poké Balls.')),
        ('old-man', 'MAP_VIRIDIAN_CITY', 21, 8, ('Watch the old man catch a Pokémon', 'Mira al anciano atrapar un Pokémon'),
         ('Once you have the Pokédex he has had his coffee: he shows you how to catch and lets you through.', 'Con la Pokédex ya se ha tomado su café: te enseña a atrapar y te deja pasar.')),
        ('rocket-poster', 'MAP_CELADON_CITY_GAME_CORNER', 11, 2, ('Open the hideout behind the Game Corner poster', 'Abre la guarida tras el póster del Casino'),
         ('Beat the Rocket in front of the poster and press the switch behind it.', 'Vence al Rocket delante del póster y pulsa el interruptor que hay detrás.')),
        ('marowak', 'MAP_POKEMON_TOWER_6F', 11, 15, ('Calm the ghost of Marowak', 'Calma al fantasma de Marowak'),
         ('With the Silph Scope you can see it and battle it; then the way up opens.', 'Con el Visor Silph puedes verlo y combatirlo; después se abre el paso hacia arriba.')),
        ('rescue-fuji', 'MAP_POKEMON_TOWER_7F', 11, 4, ('Rescue Mr. Fuji', 'Rescata al Sr. Fuji'),
         ('At the top of the tower, after three Rockets. He thanks you with the Poké Flute at his house.', 'En lo alto de la torre, tras tres Rockets. En su casa te da la Poké Flauta.')),
        ('bill-sevii', 'MAP_CINNABAR_ISLAND_POKEMON_CENTER_1F', 11, 5, ('Sail with Bill to One Island', 'Viaja con Bill a Isla Prima'),
         ('After beating Blaine, Bill waits in this Pokémon Center: say yes and the ferry takes you both to the Sevii Islands.', 'Tras vencer a Blaine, Bill te espera en este Centro Pokémon: dile que sí y el barco os lleva a las Islas Sete.')),
        ('national-dex', 'MAP_PALLET_TOWN_PROFESSOR_OAKS_LAB', 6, 3, ('Get the National Pokédex', 'Recibe la Pokédex Nacional'),
         ('After becoming Champion, with 60 Pokémon seen, Professor Oak upgrades your Pokédex.', 'Tras ser Campeón, con 60 Pokémon vistos, el Prof. Oak mejora tu Pokédex.')),
        ('sapphire-celio', 'MAP_ONE_ISLAND_POKEMON_CENTER_1F', 15, 6, ('Give the Sapphire to Celio', 'Entrega el Zafiro a Celio'),
         ('Bring back the Sapphire from the Rocket Warehouse: Celio finishes his network.', 'Trae el Zafiro del Almacén Rocket: Celio termina su red.')),
        ('cross-forest', 'MAP_VIRIDIAN_FOREST', 5, 9, ('Cross Viridian Forest', 'Cruza el Bosque Verde'),
         ('Head out the north end towards Route 2 and Pewter City; its trainers use Bug Pokémon.', 'Sal por el norte hacia la Ruta 2 y Ciudad Plateada; sus entrenadores usan Pokémon Bicho.')),
        ('cross-moon', 'MAP_ROUTE4', 32, 5, ('Cross Mt. Moon', 'Cruza el Monte Moon'),
         ('At the far end you choose a fossil; you come out on Route 4, on the way to Cerulean City.', 'Al fondo eliges un fósil; sales a la Ruta 4, camino de Ciudad Celeste.')),
        ('cross-tunnel', 'MAP_ROUTE10', 8, 57, ('Cross Rock Tunnel', 'Cruza el Túnel Roca'),
         ('It is pitch dark: Flash (HM05) lights the way. You come out to the south, next to Lavender Town.', 'Está a oscuras: Destello (MO05) ilumina el camino. Sales por el sur, junto a Pueblo Lavanda.')),
        ('cross-underground', 'MAP_ROUTE7', 7, 14, ('Take the Underground Path to Celadon', 'Ve a Azulona por el Camino Subterráneo'),
         ('Saffron is closed: from Route 8, go down the tunnel and come out on Route 7, next to Celadon City.', 'Azafrán está cerrada: desde la Ruta 8 baja al túnel y sal en la Ruta 7, junto a Ciudad Azulona.')),
        ('cross-cycling', 'MAP_ROUTE18', 48, 9, ('Ride down Cycling Road to Fuchsia', 'Baja por la Calle Bici hasta Fucsia'),
         ('From Route 16, with the Bicycle and Snorlax awake: downhill to Route 18 and Fuchsia City.', 'Desde la Ruta 16, con la Bici y Snorlax despierto: cuesta abajo hasta la Ruta 18 y Ciudad Fucsia.')),
        ('cross-victory', 'MAP_ROUTE23', 18, 28, ('Cross Victory Road', 'Cruza la Calle Victoria'),
         ('Strength moves the boulders onto the switches; at the exit the Indigo Plateau is just north.', 'Fuerza mueve las rocas sobre los interruptores; a la salida, la Meseta Añil está justo al norte.')),
    ],
}


def build(game):
    base = f'public/{game}/data'
    nav = json.load(open(f'{base}/nav.json', encoding='utf-8'))['maps']
    areas = {a['id']: a for a in json.load(open(f'{base}/areas.json', encoding='utf-8'))['areas']}
    out = []
    for sid, mid, x, y, name, detail in STEPS[game]:
        m = nav[mid]
        assert 0 <= x < m['w'] and 0 <= y < m['h'], (game, sid)
        interior = areas.get(m['area'], {}).get('kind') == 'interior'
        floor = areas[m['area']]['label'] if interior else None
        out.append({'id': f'{mid}:story:{sid}', 'uid': uid_of(f'{game}:story:{sid}'), 'category': 'Story',
                    'name': name[0], 'es': {'name': name[1], 'detail': detail[1]}, 'detail': detail[0],
                    'map': mid, 'zone': m['zone'], 'floor': floor, 'location': floor or m['zone'],
                    'area': m['area'], 'at': [(m['x'] + x) * 16 + 8, (m['y'] + y) * 16 + 8], 'icon': None})
    with open(f'{base}/story.json', 'w', encoding='utf-8', newline='\n') as f:
        json.dump({'_source': 'Story steps written by hand from the Serebii (Yellow) and The Cave of Dragonflies (FRLG) walkthroughs; see scripts/build-story.py.',
                   'steps': out}, f, ensure_ascii=False, indent=1)
        f.write('\n')
    print(f'{base}/story.json: {len(out)} pasos')


if __name__ == '__main__':
    for g in STEPS:
        build(g)
