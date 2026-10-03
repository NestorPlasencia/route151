// Reglas de progreso independientes de React: mapa, listas y pruebas usan lo mismo.
import type {Choice,Gate,Marker} from './shared';
export const TOOLS:Record<string,string>={'Old Rod':'Old Rod','Good Rod':'Good Rod','Super Rod':'Super Rod',Surf:'HM03','Rock Smash':'HM06'};
// Lo que ya tienes: los nombres de los marcadores marcados en tu checklist (la
// Cana Vieja, la MO03, "Leader Brock"...). De ahi salen herramientas y bloqueos.
export const haveNames=(markers:Marker[],done:number[])=>new Set(markers.filter(m=>done.includes(m.uid)).map(m=>m.name));
// La herramienta que te falta para atrapar este Pokemon, o null si alguna de sus
// formas de encontrarlo ya te sirve (hierba y pesca: con la hierba basta).
export const missingTool=(m:Marker,owned:Set<string>)=>{
 const methods=m.category==='Pokémon'?m.encounter?.methods??[]:[];
 if(!methods.length||methods.some(method=>!TOOLS[method]||owned.has(TOOLS[method])))return null;
 // La primera que se consigue de las que sirven: si vale la Cana Buena, no pide la Super.
 const order=Object.values(TOOLS);
 return methods.map(method=>TOOLS[method]).sort((x,y)=>order.indexOf(x)-order.indexOf(y))[0];
};

export const choicesTaken=(choices:Choice[],isDone:(id:string)=>boolean)=>{
 const out=new Map<string,string>();
 for(const c of choices){const pick=c.options.find(o=>o.some(isDone));if(!pick)continue;
  const chosen=pick.find(isDone)!;for(const o of c.options)if(o!==pick)for(const id of o)if(!isDone(id))out.set(id,chosen)}
 return out;
};
export const unmetGate=(m:Marker&{map?:string;zone?:string},gates:Gate[],have:Set<string>)=>gates.find(g=>
 (g.zones?.includes(m.zone??'')||g.maps?.includes(m.map??'')||g.markers?.includes(m.id))&&!g.needs.includes(m.name)&&g.needs.some(n=>!have.has(n)))??null;

const KIND:Record<string,number>={Story:-1,Battle:1,'Pokémon':2,'In-Game Gift Pokémon':2,'In-Game Trade':2};
export const checkOrder=<T extends Marker>(list:T[],blocked:(m:T)=>boolean)=>
 list.map((m,i)=>({m,i,k:(blocked(m)?10:0)+(KIND[m.category]??0)})).sort((a,b)=>a.k-b.k||a.i-b.i).map(x=>x.m);

export const nextGoalOf=(markers:Marker[],goals:string[],settled:(m:Marker)=>boolean)=>{
 const byId=new Map(markers.map(m=>[m.id,m]));return goals.map(id=>byId.get(id)).find(m=>!!m&&!settled(m))??null;
};
