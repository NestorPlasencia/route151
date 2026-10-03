import type {Pt} from './games';
// Agrupa por distancia en pantalla, no por casillas del juego: al acercar vuelven
// a aparecer los pines y las puertas originales, con sus acciones originales.
export function clusterPoints<T extends {at:Pt}>(entries:T[],project:(at:Pt)=>{x:number;y:number},size:number):{at:Pt;entries:T[]}[]{
 if(size<=0)return entries.map(entry=>({at:entry.at,entries:[entry]}));
 const buckets=new Map<string,T[]>();
 for(const entry of entries){const p=project(entry.at),key=`${Math.floor(p.x/size)},${Math.floor(p.y/size)}`;const row=buckets.get(key);if(row)row.push(entry);else buckets.set(key,[entry]);}
 return [...buckets.values()].map(row=>({at:[row.reduce((sum,e)=>sum+e.at[0],0)/row.length,row.reduce((sum,e)=>sum+e.at[1],0)/row.length] as Pt,entries:row}));
}
