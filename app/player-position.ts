// Dónde está el jugador en los mapas de la app, a partir del mapa y la casilla que
// guarda la RAM (SaveBlock1). La tabla sale de pret con las mismas reglas que las
// áreas (scripts/frlg/build-map-positions.py), así que cae sobre sus marcadores.
import type {Pt} from './games';

export type MapPositions={version:1;tile:number;maps:Record<string,{id:string;area:string;at:Pt}>};
export type GameLocation={group:number;map:number;x:number;y:number};
export type PlayerSpot={area:string;map:string;at:Pt};
export const PLAYER_EVENT='route151-player';

export function playerSpot(table:MapPositions,location:GameLocation):PlayerSpot|null{
 const entry=table.maps[`${location.group}.${location.map}`];
 // Fuera del mapa (transiciones, cámara de escenas): mejor no mover el marcador.
 if(!entry||location.x<0||location.y<0||location.x>255||location.y>255)return null;
 const half=table.tile/2;
 return {area:entry.area,map:entry.id,at:[entry.at[0]+location.x*table.tile+half,entry.at[1]+location.y*table.tile+half]};
}
