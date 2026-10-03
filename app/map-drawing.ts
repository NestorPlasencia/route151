import type {LayerGroup} from 'leaflet';
import type {Area,Pt,Warp,World} from './games';
import type {Marker} from './shared';
import {colorOf} from './shared';
import type {T} from './i18n';
import type {TripItem} from './trip';
type Drawing={L:typeof import('leaflet');g:LayerGroup;world:World;area:Area;areaById:Map<string,Area>;items:TripItem[];nextGoal:Marker|null|undefined;stacks:{at:Pt;items:Marker[]}[];done:number[];skipSet:Set<number>;pending:(m:Marker)=>boolean;isRegion:(id:string)=>boolean|undefined;finished:(from:string,to:string)=>boolean;doorLocked:(area:string,at:Pt)=>boolean;placeAt:(area:string,at:Pt)=>string|undefined;arrival:{area:string;at:Pt;label:string}|null;tr:T;onPick:(items:Marker[])=>void;onDoor:(warp:Warp,toRegion:boolean)=>void};
const ll=(p:Pt):[number,number]=>[-p[1],p[0]];
const MOVE_KEY:Record<string,'moveSurf'|'moveCut'|'moveStrength'|'moveSmash'|'moveWaterfall'|'moveFlute'|'moveSwitch'|'movePlate'>={surf:'moveSurf',cut:'moveCut',strength:'moveStrength',smash:'moveSmash',waterfall:'moveWaterfall',flute:'moveFlute',switch:'moveSwitch',plate:'movePlate'};
const FLAG_SVG='<svg viewBox="0 0 24 24" width="18" height="18" fill="#ffd936" stroke="#172034" stroke-width="2" stroke-linejoin="round"><path d="M4 22V3"/><path d="M4 4h13l-2.5 4L17 12H4"/></svg>';
const LOCK_SVG='<svg viewBox="0 0 24 24" width="9" height="9" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="11" x="3" y="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>';
export function drawMap({L,g,world,area,areaById,items,nextGoal,stacks,done,skipSet,pending,isRegion,finished,doorLocked,placeAt,arrival,tr,onPick,onDoor}:Drawing){
 const {t,place}=tr;
 g.clearLayers();
  // El camino de "Como llegar" en esta area: linea azul con borde blanco, y un
  // punto donde empieza. Al cruzar a otra zona por el borde, la linea sigue.
  // La linea solo une casillas vecinas (un salto son dos): si el camino entra en
  // un edificio y sale por otra puerta, la linea se corta en vez de cruzarlo.
  const pieces=(pts:[number,number][])=>pts.reduce<[number,number][][]>((out,p,i)=>{
   const q=pts[i-1];if(!q||Math.hypot(p[0]-q[0],p[1]-q[1])>40)out.push([p]);else out[out.length-1].push(p);return out},[]);
  items.forEach((it,i)=>{
   if(it.area!==area.id)return;
   const prev=items[i-1];
   for(const seg of pieces(prev&&prev.area===it.area&&it.enter==='edge'?[prev.pts[prev.pts.length-1],...it.pts]:it.pts)){
    const pts=seg.map(ll);
    L.polyline(pts,{color:'#fff',weight:10,opacity:.95,interactive:false,lineCap:'round',lineJoin:'round'}).addTo(g);
    L.polyline(pts,{color:'#2d6df6',weight:5,opacity:1,interactive:false,lineCap:'round',lineJoin:'round'}).addTo(g);
    // Flechas sobre la linea cada tres casillas: hacia donde se camina.
    let run=24;
    for(let j=1;j<seg.length;j++){
     const [ax,ay]=seg[j-1],[bx,by]=seg[j],len=Math.hypot(bx-ax,by-ay);
     for(;run<=len;run+=48){const f=run/len,deg=Math.atan2(by-ay,bx-ax)*180/Math.PI;
      L.marker(ll([ax+(bx-ax)*f,ay+(by-ay)*f]),{icon:L.divIcon({className:'pin-wrap',html:`<span class="route-arrow" style="transform:rotate(${deg}deg)"></span>`,iconSize:[12,12],iconAnchor:[6,6]}),interactive:false,zIndexOffset:-100}).addTo(g)}
     run-=len;
    }
   }
  });
  // El siguiente objetivo, con una bandera sobre su pin.
  if(nextGoal?.area===area.id&&nextGoal.at)L.marker(ll(nextGoal.at),{icon:L.divIcon({className:'pin-wrap',html:`<span class="goal-flag">${FLAG_SVG}</span>`,iconSize:[28,28],iconAnchor:[4,30]}),interactive:false,zIndexOffset:900}).addTo(g);
  // Donde el camino quita un obstaculo: su MO encima (tijeras, roca, puno).
  const ACT:Record<string,string>={cut:'✂',strength:'✊',smash:'⛏',flute:'🎵',switch:'🔘',plate:'🪨'};
  for(const it of items)if(it.area===area.id)for(const a of it.acts)
   L.marker(ll(a.at),{icon:L.divIcon({className:'pin-wrap',html:`<span class="route-act" title="${t(MOVE_KEY[a.how]??'moveCut')}">${ACT[a.how]??''}</span>`,iconSize:[24,24],iconAnchor:[12,12]}),interactive:false,zIndexOffset:400}).addTo(g);
  if(items[0]?.area===area.id)L.circleMarker(ll(items[0].pts[0]),{radius:8,color:'#fff',weight:3,fillColor:'#2d6df6',fillOpacity:1,interactive:false}).addTo(g);
  for(const {at,items} of stacks){
   // Verde si todo esta hecho; gris con candado si lo que falta aun no se puede hacer.
   // Saltado cuenta como terminado, con una raya en vez del check.
   const completed=items.every(m=>done.includes(m.uid)||skipSet.has(m.uid)),skip=completed&&items.some(m=>skipSet.has(m.uid)),locked=!completed&&!items.some(pending);
   // Varias categorias en el mismo punto: el pin se reparte en sectores de color.
   const colors=[...new Set(items.map(m=>colorOf(m.category)))];
   const fill=colors.length>1?`conic-gradient(${colors.map((c,i)=>`${c} ${i*100/colors.length}% ${(i+1)*100/colors.length}%`).join(',')})`:colors[0];
   // Un pin sobre una puerta (los pasos de historia en una salida) se corre a un
   // costado, arriba a la derecha: asi se ven y se tocan los dos.
   const onDoor=world.warps.some(w=>w.area===area.id&&Math.abs(w.at[0]-at[0])<12&&Math.abs(w.at[1]-at[1])<12);
   const icon=L.divIcon({className:`pin-wrap ${onDoor?'pin-aside':''}`,html:`<span class="pin ${skip?'pin-skip':completed?'pin-done':locked?'pin-locked':''}" style="--pin:${fill}">${skip?'–':completed?'✓':locked?LOCK_SVG:''}</span>${items.length>1?`<b class="pin-count">${items.length}</b>`:''}`,iconSize:[20,20],iconAnchor:onDoor?[-6,26]:[10,10]});
   L.marker(ll(at),{icon,zIndexOffset:onDoor?600:0}).on('click',()=>onPick(items)).addTo(g);
  }
  // Puertas: hacia un interior (o a otro piso) se entra; hacia una region se sale.
  const door=(cls:string,text='')=>L.divIcon({className:'pin-wrap',html:`<span class="door ${cls}">${text}</span>`,iconSize:[26,26],iconAnchor:[13,13]});
  // Dentro de un ascensor, una puerta por piso con su nombre (B4F, 5F...).
  const lift=/ELEVATOR/.test(area.id);
  // La puerta por la que el camino sale de aqui (en un ascensor, el piso al que
  // ir): la mas cercana al ultimo punto del tramo, hacia el area siguiente.
  const exits=new Set<object>();
  items.forEach((it,i)=>{
   const nx=items[i+1];if(it.area!==area.id||!nx||nx.area===area.id||nx.enter!=='door')return;
   const end=it.pts[it.pts.length-1],cands=world.warps.filter(w=>w.area===area.id&&w.to===nx.area);
   const best=cands.reduce<typeof cands[number]|null>((b,w)=>!b||Math.hypot(w.at[0]-end[0],w.at[1]-end[1])<Math.hypot(b.at[0]-end[0],b.at[1]-end[1])?w:b,null);
   if(best)exits.add(best);
  });
  for(const w of world.warps)if(w.area===area.id){
   const toRegion=isRegion(w.to),dest=areaById.get(w.to);
   const shut=!lift&&doorLocked(w.area,w.at);
   L.marker(ll(w.at),{icon:door(`${shut?'locked':toRegion?'exit':finished(w.area,w.to)?'done':''} ${lift?'lift':''} ${exits.has(w)?'next':''}`,lift?place(dest?.label??'').split(' ').pop():''),title:`${toRegion?t('exitTo',{place:place(placeAt(w.to,w.toAt)??dest?.label??'')}):`${place(dest?.label??t('interior'))}${finished(w.area,w.to)?` · ${t('nothingLeft')}`:''}`}${shut?` · ${t('unavailable')}`:''}`,zIndexOffset:500})
    .on('click',()=>onDoor(w,!!toRegion)).addTo(g);
  }
  if(arrival&&arrival.area===area.id)L.marker(ll(arrival.at),{icon:L.divIcon({className:'arrive',html:'<span></span><i></i>',iconSize:[0,0]}),title:arrival.label,interactive:false,zIndexOffset:1000}).addTo(g);
}
