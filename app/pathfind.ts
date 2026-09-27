// Como llegar: el camino mas corto por la rejilla de los mapas (nav.json, que
// escriben los scripts reach-*), con las mismas reglas que scripts/common/reach.py.
// Sin la MO, el arbol es un muro y el agua tambien; las zonas que la historia aun
// no abre (Snorlax, los guardias) no se pisan.

export type NavMap={zone:string;area:string;x:number;y:number;w:number;h:number;k:string;e?:string;
 ob?:[number,number,string][];wp?:[number,number,string,number][];dr?:[number,number][];cn?:[string,number,string][]};
export type Nav={moves:Record<string,string[]>;starts:[string,number,number][];ferry:[string,number,number][];maps:Record<string,NavMap>};
// Como se llega a cada casilla: andando, surfeando, saltando un saliente, por una
// puerta, cruzando el borde del mapa, en barco, o quitando un obstaculo.
export type How='walk'|'surf'|'land'|'jump'|'door'|'edge'|'ferry'|'cut'|'strength'|'smash'|'waterfall'|'flute';
export type Step={map:string;x:number;y:number;how:How;side?:string};

const FLOOR=1,WATER=2,WATERFALL=3;
const LEDGE:Record<number,[number,number]>={4:[0,-1],5:[0,1],6:[1,0],7:[-1,0]};
const STEPS:[number,number][]=[[0,-1],[0,1],[-1,0],[1,0]];
const SIDES=['up','down','left','right'];

type Grid={id:string;i:number;m:NavMap;kind:Uint8Array;elev:Uint8Array|null;ob:Map<number,string>;warps:Map<number,[string,number][]>;cn:Map<string,[number,string][]>};
export type World={grids:Map<string,Grid>;list:Grid[];nav:Nav};

const bytes=(s:string)=>Uint8Array.from(atob(s),c=>c.charCodeAt(0));

export function prepare(nav:Nav):World{
 const list:Grid[]=[],grids=new Map<string,Grid>();
 for(const [id,m] of Object.entries(nav.maps)){
  const warps=new Map<number,[string,number][]>(),cn=new Map<string,[number,string][]>();
  for(const [x,y,dest,k] of m.wp??[]){const at=y*m.w+x;warps.set(at,[...(warps.get(at)??[]),[dest,k]])}
  for(const [side,off,dest] of m.cn??[])cn.set(side,[...(cn.get(side)??[]),[off,dest]]);
  const g:Grid={id,i:list.length,m,kind:bytes(m.k),elev:m.e?bytes(m.e):null,ob:new Map((m.ob??[]).map(([x,y,mv])=>[y*m.w+x,mv])),warps,cn};
  list.push(g);grids.set(id,g);
 }
 return {grids,list,nav};
}

// Las MO que ya puedes usar: las que tienen todo lo que piden marcado (la MO y su medalla).
export const movesYouHave=(nav:Nav,have:Set<string>)=>new Set(Object.entries(nav.moves).filter(([,needs])=>needs.every(n=>have.has(n))).map(([mv])=>mv));

const elevOk=(cur:number,to:number)=>cur===0||cur===15||to===0||to===15||cur===to;
// Estado: mapa, casilla, altura y si vas surfeando, en un solo numero.
const key=(gi:number,x:number,y:number,e:number,s:boolean)=>((gi*256+y)*256+x)*32+e*2+(s?1:0);
const unkey=(k:number)=>{const s=k%2,e=Math.floor(k/2)%16,x=Math.floor(k/32)%256,y=Math.floor(k/8192)%256,gi=Math.floor(k/2097152);return {gi,x,y,e,s:s===1}};

type Search={parent:Map<number,number>;how:Map<number,Step['how']>;side:Map<number,string>;order:number[]};

// Recorrido en anchura desde varias casillas a la vez. `stop` corta al llegar.
function explore(w:World,starts:number[],can:Set<string>,closed:(map:string)=>boolean,stop?:(k:number)=>boolean):Search&{end:number|null}{
 const parent=new Map<number,number>(),how=new Map<number,Step['how']>(),side=new Map<number,string>(),order:number[]=[];
 const queue:number[]=[];let head=0;
 const push=(k:number,from:number,h:How,sd?:string)=>{if(parent.has(k))return;parent.set(k,from);how.set(k,h);if(sd)side.set(k,sd);queue.push(k)};
 const arrive=(g:Grid,x:number,y:number,from:number,h:How)=>{
  if(x<0||y<0||x>=g.m.w||y>=g.m.h||closed(g.id))return;
  const t=g.kind[y*g.m.w+x]&7;push(key(g.i,x,y,g.elev?g.elev[y*g.m.w+x]:0,t===WATER||t===WATERFALL),from,h);
 };
 for(const k of starts)push(k,-1,'walk');
 const ferry=w.nav.ferry.map(([m,x,y])=>({g:w.grids.get(m),x,y})).filter(f=>f.g);
 // A donde se llega al moverse a (nx, ny): [x, y, altura, surfeando, como] o null.
 const enter=(g:Grid,nx:number,ny:number,dx:number,dy:number,e:number,surf:boolean):[number,number,number,boolean,How]|null=>{
  const at=ny*g.m.w+nx,t=g.kind[at]&7,ob=g.ob.get(at);
  if(ob&&!can.has(ob))return null;
  const ne=g.elev?g.elev[at]:0;
  if(t===WATER||t===WATERFALL){
   if(!can.has('surf')||(t===WATERFALL&&!can.has('waterfall')))return null;
   return [nx,ny,ne,true,t===WATERFALL?'waterfall':'surf'];
  }
  if(LEDGE[t]){
   if(LEDGE[t][0]!==dx||LEDGE[t][1]!==dy)return null;
   const lx=nx+dx,ly=ny+dy;
   if(lx<0||ly<0||lx>=g.m.w||ly>=g.m.h||(g.kind[ly*g.m.w+lx]&7)!==FLOOR)return null;
   return [lx,ly,g.elev?g.elev[ly*g.m.w+lx]:0,false,'jump'];
  }
  if(t!==FLOOR)return null;
  if(!surf&&!elevOk(e,ne))return null;
  return [nx,ny,ne===15?e:ne,false,(ob as How|undefined)??(surf?'land':'walk')];
 };
 while(head<queue.length){
  const k=queue[head++];order.push(k);
  if(stop?.(k))return {parent,how,side,order,end:k};
  const {gi,x,y,e,s}=unkey(k),g=w.list[gi],at=y*g.m.w+x;
  // Sobre una puerta: se cruza a la casilla donde aparece en el otro mapa.
  for(const [dest,n] of g.warps.get(at)??[]){const d=w.grids.get(dest),dr=d?.m.dr?.[n];if(d&&dr)arrive(d,dr[0],dr[1],k,'door')}
  for(const f of ferry)if(f.g===g&&f.x===x&&f.y===y)for(const o of ferry)if(o!==f)arrive(o.g!,o.x,o.y,k,'ferry');
  const blocked=g.kind[at]>>3;
  STEPS.forEach(([dx,dy],i)=>{
   if(blocked&(1<<i))return;
   const nx=x+dx,ny=y+dy;
   if(nx<0||ny<0||nx>=g.m.w||ny>=g.m.h){
    // Borde del mapa: al vecino que toca por ese lado.
    for(const [off,dest] of g.cn.get(SIDES[i])??[]){
     const b=w.grids.get(dest);if(!b||closed(b.id))continue;
     const tx=i<2?nx-off:i===2?b.m.w-1:0,ty=i<2?(i===0?b.m.h-1:0):ny-off;
     if(tx<0||ty<0||tx>=b.m.w||ty>=b.m.h)continue;
     const to=enter(b,tx,ty,dx,dy,e,s);if(to)push(key(b.i,to[0],to[1],to[2],to[3]),k,'edge',SIDES[i]);
    }
    return;
   }
   // Una puerta se cruza aunque su casilla sea muro (las de las casas).
   const nat=ny*g.m.w+nx;
   if(g.warps.has(nat)&&(g.kind[nat]&7)!==WATER&&(g.kind[nat]&7)!==WATERFALL){push(key(g.i,nx,ny,e,false),k,'walk');return}
   const to=enter(g,nx,ny,dx,dy,e,s);if(to)push(key(g.i,to[0],to[1],to[2],to[3]),k,to[4]);
  });
 }
 return {parent,how,side,order,end:null};
}

// Se llega a un marcador pisando su casilla o una de al lado; a la gente se le
// habla tambien a dos casillas en linea, por encima de un mostrador.
const near=(x:number,y:number,tx:number,ty:number,far:boolean)=>{const dx=Math.abs(x-tx),dy=Math.abs(y-ty);return dx+dy<=1||(far&&((dx===2&&dy===0)||(dx===0&&dy===2)))};

export type Target={map:string;x:number;y:number;far:boolean};
export type Found={path:Step[];partial:boolean};

// Camino desde la zona `from` hasta el objetivo. Se sale de la casilla de esa
// zona, alcanzable desde el inicio del juego, mas cercana a `anchor` (el centro
// del pueblo o la ruta): asi no se empieza en una orilla a la que solo se llega
// surfeando. Sin ancla (cuevas, edificios), de cualquier casilla de la zona.
// Si al objetivo no se llega por la rejilla (puertas que abre un script, como
// el gimnasio de Canela), se lleva hasta su mapa: `partial`. null si ni eso.
export function findRoute(w:World,from:string,target:Target,can:Set<string>,closed:(map:string)=>boolean,anchor?:{map:string;x:number;y:number}):Found|null{
 const goal=w.grids.get(target.map);if(!goal)return null;
 // Nunca se cierra la zona de salida ni el mapa del objetivo.
 const open=(map:string)=>map!==target.map&&w.grids.get(map)?.m.zone!==from&&closed(map);
 const home=w.nav.starts.flatMap(([m,x,y])=>{const g=w.grids.get(m);return g?[key(g.i,x,y,g.elev?g.elev[y*g.m.w+x]:0,false)]:[]});
 const sourcesFor=(c:Set<string>)=>{
  let sources=explore(w,home,c,open).order.filter(k=>w.list[unkey(k).gi].m.zone===from);
  const ag=anchor&&w.grids.get(anchor.map);
  if(ag&&anchor){
   const dist=(k:number)=>{const s=unkey(k);return s.gi===ag.i?Math.abs(s.x-anchor.x)+Math.abs(s.y-anchor.y):Infinity};
   const best=sources.reduce<number|null>((b,k)=>b===null||dist(k)<dist(b)?k:b,null);
   if(best!==null&&dist(best)<Infinity){const b=unkey(best);sources=sources.filter(k=>{const a=unkey(k);return a.gi===b.gi&&a.x===b.x&&a.y===b.y})}
  }
  // La zona no se alcanza desde el inicio (dices que estas donde aun no se
  // llega): se sale de sus puertas.
  if(!sources.length)sources=w.list.filter(g=>g.m.zone===from).flatMap(g=>(g.m.dr??[]).map(([x,y])=>key(g.i,x,y,g.elev?g.elev[y*g.m.w+x]:0,false)));
  return sources;
 };
 const search=(c:Set<string>,stop:(k:number)=>boolean)=>{const src=sourcesFor(c);if(!src.length)return null;const f=explore(w,src,c,open,stop);return f.end===null?null:f};
 const atTarget=(k:number)=>{const {gi,x,y}=unkey(k);return gi===goal.i&&near(x,y,target.x,target.y,target.far)};
 // Andando si se puede: el camino mas corto a veces cruza agua que no hace falta.
 const dry=new Set([...can].filter(m=>m!=='surf'&&m!=='waterfall'));
 let partial=false;
 let found=(dry.size<can.size?search(dry,atTarget):null)??search(can,atTarget);
 if(!found){
  // Con todas las MO si se llega: te falta alguna, no hay camino todavia.
  if(search(new Set(Object.keys(w.nav.moves)),atTarget))return null;
  partial=true;found=search(can,k=>unkey(k).gi===goal.i);
 }
 if(!found||found.end===null)return null;
 const path:Step[]=[];
 for(let k=found.end;k!==-1;k=found.parent.get(k)!){const {gi,x,y}=unkey(k);path.push({map:w.list[gi].id,x,y,how:found.how.get(k)!,side:found.side.get(k)})}
 return {path:path.reverse(),partial};
}

// Donde se dibuja una casilla en la app: su area y el centro en pixeles.
export const pointOf=(w:World,s:{map:string;x:number;y:number}):{area:string;at:[number,number]}|null=>{
 const g=w.grids.get(s.map);return g?{area:g.m.area,at:[(g.m.x+s.x)*16+8,(g.m.y+s.y)*16+8]}:null;
};

// El camino en tramos para leerlo: uno por mapa, con como se entra en el y lo
// que hay que usar dentro (Surf, Corte...).
// acts: donde se quita un obstaculo (un arbol, una roca), para marcarlo en el camino.
export type Leg={map:string;zone:string;area:string;enter:How;side?:string;uses:How[];pts:[number,number][];acts:{how:How;at:[number,number]}[]};
export function legsOf(w:World,path:Step[]):Leg[]{
 const legs:Leg[]=[];
 for(const s of path){
  const g=w.grids.get(s.map)!,p=pointOf(w,s)!.at;
  let leg=legs[legs.length-1];
  if(!leg||leg.map!==s.map){leg={map:s.map,zone:g.m.zone,area:g.m.area,enter:legs.length?s.how:'walk',side:s.side,uses:[],pts:[],acts:[]};legs.push(leg)}
  else if(['surf','cut','strength','smash','waterfall','flute','jump'].includes(s.how)&&!leg.uses.includes(s.how))leg.uses.push(s.how);
  if(['cut','strength','smash','flute'].includes(s.how))leg.acts.push({how:s.how,at:p});
  leg.pts.push(p);
 }
 return legs;
}

// Barrido de lo que se alcanza: las casillas que pisas desde el inicio del juego
// con tus MO y sin entrar en lo que la historia aun no abre. Asi un bloqueo se
// propaga solo: con la Ruta 3 cerrada, el Monte Moon y lo que hay detras tambien.
export const tileId=(gi:number,x:number,y:number)=>(gi*256+y)*256+x;
const homeKeys=(w:World)=>w.nav.starts.flatMap(([m,x,y])=>{const g=w.grids.get(m);return g?[key(g.i,x,y,g.elev?g.elev[y*g.m.w+x]:0,false)]:[]});
export function reachTiles(w:World,can:Set<string>,closed:(map:string)=>boolean){
 const tiles=new Set<number>();
 for(const k of explore(w,homeKeys(w),can,closed).order){const u=unkey(k);tiles.add(tileId(u.gi,u.x,u.y))}
 return tiles;
}
// Casilla de un marcador desde su punto en la app (area y pixeles).
export function targetAt(w:World,area:string,at:[number,number],far:boolean):Target|null{
 for(const g of w.list)if(g.m.area===area&&at[0]>=g.m.x*16&&at[1]>=g.m.y*16&&at[0]<(g.m.x+g.m.w)*16&&at[1]<(g.m.y+g.m.h)*16)
  return {map:g.id,x:Math.floor(at[0]/16)-g.m.x,y:Math.floor(at[1]/16)-g.m.y,far};
 return null;
}
export function reached(w:World,tiles:Set<number>,t:Target){
 const g=w.grids.get(t.map);if(!g)return true;
 for(const [dx,dy] of [[0,0],...STEPS])if(tiles.has(tileId(g.i,t.x+dx,t.y+dy)))return true;
 if(t.far)for(const [dx,dy] of STEPS)if(tiles.has(tileId(g.i,t.x+2*dx,t.y+2*dy)))return true;
 return false;
}
// Arbol de caminos con todo abierto (todas las MO, ninguna zona cerrada): de
// cada casilla, por donde se llega. Sirve para decir que falta en el camino a
// algo que no alcanzas: el primer paso cerrado o que pide una MO que no tienes.
export type Tree={parent:Map<number,number>;how:Map<number,How>;best:Map<number,number>};
// `can`: con esas MO (por defecto, todas). Primero se busca el obstaculo con
// las MO que ya tienes: con todas, el camino mas corto podia cruzar agua y
// culpar a Surf de lo que en realidad cierra la historia.
export function openTree(w:World,can:Set<string>=new Set(Object.keys(w.nav.moves))):Tree{
 const s=explore(w,homeKeys(w),can,()=>false);
 const best=new Map<number,number>();
 for(const k of s.order){const u=unkey(k),id=tileId(u.gi,u.x,u.y);if(!best.has(id))best.set(id,k)}
 return {parent:s.parent,how:s.how,best};
}
export type Blocker={map:string}|{move:string}|null;
export function blockerOf(w:World,tree:Tree,t:Target,can:Set<string>,closed:(map:string)=>boolean):Blocker{
 const g=w.grids.get(t.map);if(!g)return null;
 const around:[number,number][]=[[0,0],...STEPS,...(t.far?STEPS.map(([dx,dy])=>[2*dx,2*dy] as [number,number]):[])];
 // La casilla o una de al lado; si no (un pin sobre un muro de la cueva), la
 // primera casilla alcanzada de su mapa.
 let end=around.map(([dx,dy])=>tree.best.get(tileId(g.i,t.x+dx,t.y+dy))).find(k=>k!==undefined);
 if(end===undefined)for(const [id,k] of tree.best)if(Math.floor(id/65536)===g.i){end=k;break}
 // Un piso al que solo lleva un script (el ascensor de la guarida): lo que pide
 // llegar a su zona.
 if(end===undefined)for(const [id,k] of tree.best)if(w.list[Math.floor(id/65536)].m.zone===g.m.zone){end=k;break}
 if(end===undefined)return null;
 const path:number[]=[];for(let k=end;k!==-1;k=tree.parent.get(k)!)path.push(k);
 for(const k of path.reverse()){
  const h=tree.how.get(k)!,m=w.list[unkey(k).gi].id;
  if(closed(m))return {map:m};
  const move=h==='land'?null:h==='jump'?null:h==='walk'||h==='door'||h==='edge'||h==='ferry'?null:h;
  if(move&&!can.has(move))return {move};
 }
 return null;
}
