'use client';
// Banco manual: abrir /benchmark desde el dispositivo que se quiere medir.
import {useState} from 'react';
import Link from 'next/link';
import {GAMES} from '../games';
import {loadJson} from '../load-json';
import {prepare,openTree,reachTiles,findRoute,type Nav} from '../pathfind';
type Row={game:string;task:string;ms:number};
export default function Benchmark(){
 const [rows,setRows]=useState<Row[]>([]),[busy,setBusy]=useState(false),[error,setError]=useState(false);
 const run=async()=>{
  setBusy(true);setError(false);setRows([]);
  try{
   for(const game of GAMES){
    const nav=await loadJson<Nav>(`${game.data}/nav.json`),all=new Set(Object.keys(nav.moves));
    const samples=new Map<string,number[]>();
    for(let i=0;i<3;i++){
     const timed=<T,>(task:string,fn:()=>T)=>{const start=performance.now(),value=fn();samples.set(task,[...samples.get(task)??[],performance.now()-start]);return value};
     const world=timed('prepare',()=>prepare(nav));
     timed('openTree',()=>openTree(world));
     timed('reachTiles (inicio)',()=>reachTiles(world,new Set(),()=>false));
     timed('reachTiles (todas las MO)',()=>reachTiles(world,all,()=>false));
     const start=world.grids.get(nav.starts[0][0])!,target=world.list.find(g=>g.id!==start.id&&g.m.zone==='Viridian City')??world.list[0];
     const tile=target.kind.findIndex(k=>(k&7)===1);
     timed('findRoute',()=>findRoute(world,start.m.zone,{map:target.id,x:tile%target.m.w,y:Math.floor(tile/target.m.w),far:false},all,()=>false));
     await new Promise<void>(resolve=>requestAnimationFrame(()=>resolve()));
    }
    const next=[...samples].map(([task,values])=>({game:game.short,task,ms:values.sort((a,b)=>a-b)[1]}));
    setRows(old=>[...old,...next]);
   }
  }catch{setError(true)}finally{setBusy(false)}
 };
 return <main className="benchmark"><h1>Medir los cálculos de rutas</h1><p>Abre esta página en el móvil y pulsa Medir. Muestra la mediana de tres ejecuciones con los datos reales de cada juego, sin incluir la descarga. El ancho de pantalla por sí solo no simula la potencia de un móvil.</p><button disabled={busy} onClick={()=>void run()}>{busy?'Midiendo…':'Medir'}</button>{error&&<p role="alert">No se pudieron cargar los datos. Reintenta con conexión.</p>}<table><thead><tr><th>Juego</th><th>Cálculo</th><th>ms</th></tr></thead><tbody>{rows.map(row=><tr key={`${row.game}-${row.task}`}><td>{row.game}</td><td>{row.task}</td><td>{row.ms.toFixed(1)}</td></tr>)}</tbody></table><Link href="/">Volver a la app</Link></main>;
}
