'use client';
// Lector de fichas: de una foto o captura de las pantallas de resumen de
// FireRed saca el Pokemon y lo mete en el equipo.
//
// Lo que se lee bien es el texto normal del juego: las estadisticas, la
// habilidad y los cuatro ataques. El nombre y el nivel de la cabecera van con
// la tipografia grande del juego, con sombra y sobre color, y ahi el lector
// falla casi siempre; por eso el nivel se deduce de las estadisticas (solo
// unos pocos niveles cuadran con ellas) y la especie, de los ataques. Todo
// sale como borrador: se revisa antes de guardar y despues se puede corregir
// en la ficha normal.
import {useState} from 'react';
import {Camera,Images,ScanLine,X} from 'lucide-react';
import {STATS,genes,type Battle,type TeamMon} from './team';
import type {T} from './i18n';
import type {Dex} from './lists';

// Tesseract se sirve desde la propia app (no desde un CDN) para que la PWA
// pueda escanear sin internet. Los tres archivos los deja `npm run build`.
const WORKER='/vendor/tesseract/worker.min.js';
const CORE='/vendor/tesseract/tesseract-core-simd-lstm.wasm.js';
const LANG='/vendor/tesseract';

export type Draft={
 species:number[];level:number|null;levels:number[];nature:string|null;natures:string[];
 ability:string|null;abilityText:string|null;stats:number[]|null;odd:number[]|null;moves:string[];
};

 // Anchos con los que el lector acierta. Una foto del movil viene enorme y se
// achica; una captura del juego ya viene en su punto y se deja igual, porque
// reescalar por un factor raro deforma la letra de pixeles. Solo si es
// diminuta se agranda, y por un numero entero.
const WIDTH=576,SMALL=400,BIG=900;
const prepare=async(file:File|Blob,hard:boolean)=>{
 const bitmap=await createImageBitmap(file);
 const scale=bitmap.width>BIG?WIDTH/bitmap.width:bitmap.width<SMALL?Math.ceil(SMALL/bitmap.width):1;
 const canvas=document.createElement('canvas');
 canvas.width=Math.max(1,Math.round(bitmap.width*scale));canvas.height=Math.max(1,Math.round(bitmap.height*scale));
 const ctx=canvas.getContext('2d');if(!ctx)return canvas;
 // Al agrandar, sin suavizado: la letra del juego son pixeles, no curvas.
 ctx.imageSmoothingEnabled=scale<1;ctx.imageSmoothingQuality='high';
 ctx.drawImage(bitmap,0,0,canvas.width,canvas.height);
 bitmap.close?.();
 const image=ctx.getImageData(0,0,canvas.width,canvas.height),px=image.data;
 const histogram=Array.from({length:256},()=>0);
 for(let i=0;i<px.length;i+=4){
  const v=(px[i]*.299+px[i+1]*.587+px[i+2]*.114)|0;px[i]=v;histogram[v]++;
 }
 const total=px.length/4,edge=total*.02;
 let low=0,high=255,sum=0;
 for(let v=0;v<256;v++){sum+=histogram[v];if(sum>edge){low=v;break}}
 sum=0;
 for(let v=255;v>=0;v--){sum+=histogram[v];if(sum>edge){high=v;break}}
 const span=Math.max(1,high-low);
 for(let i=0;i<px.length;i+=4){
  const v=Math.max(0,Math.min(255,((px[i]-low)*255/span)|0));
  // La segunda pasada va en blanco y negro: recupera cifras que el gris deja
  // a medias (el marcador de PS sobre su barra de color, por ejemplo).
  px[i]=px[i+1]=px[i+2]=hard?(v>150?255:0):v;px[i+3]=255;
 }
 ctx.putImageData(image,0,0);
 return canvas;
};

const key=(text:string)=>text.toUpperCase().replace(/[^A-Z0-9]/g,'');
// Distancia de edicion: el lector confunde letras (Pidgey -> Pidgae), asi que
// los nombres se buscan por parecido y no por igualdad.
const distance=(a:string,b:string)=>{
 const row=Array.from({length:b.length+1},(_,i)=>i);
 for(let i=1;i<=a.length;i++){
  let prev=row[0];row[0]=i;
  for(let j=1;j<=b.length;j++){
   const old=row[j];
   row[j]=Math.min(row[j]+1,row[j-1]+1,prev+(a[i-1]===b[j-1]?0:1));
   prev=old;
  }
 }
 return row[b.length];
};
const similar=(a:string,b:string)=>a&&b?1-distance(a,b)/Math.max(a.length,b.length):0;
const closest=<V,>(text:string,options:[string,V][],min:number)=>{
 const want=key(text);if(!want)return null;
 let best:{value:V;score:number}|null=null;
 for(const [name,value] of options){
  const score=similar(want,key(name));
  if(!best||score>best.score)best={value,score};
 }
 return best&&best.score>=min?best.value:null;
};
// Una linea puede traer basura delante ("[FIRE] Ember", "ABILITY Tangled
// Feet"): se prueba la linea entera y tambien sin las primeras palabras.
const fromLine=<V,>(line:string,options:[string,V][],min:number)=>{
 const words=line.split(/\s+/).filter(Boolean);
 for(let skip=0;skip<Math.min(words.length,3);skip++){
  const found=closest(words.slice(skip).join(' '),options,min);
  if(found!==null)return found;
 }
 return null;
};

const clean=(text:string)=>text.split('\n').map(line=>line.trim()).filter(Boolean);

// El lector confunde cifras con signos parecidos ('2?' por 27, 'O' por 0).
// Dentro de algo que ya parece un numero se deshace ese cambio.
const digits=(token:string)=>token
 .replace(/[?]/g,'7').replace(/[OoDQ]/g,'0').replace(/[lI|]/g,'1')
 .replace(/[Ss]/g,'5').replace(/[Zz]/g,'2').replace(/[Bb]/g,'8').replace(/\D/g,'');
// De una linea interesa su ultimo numero: las etiquetas van delante y el valor
// al final ("SP.DEF 24"). Los de experiencia son de cuatro o mas cifras.
const lineNumber=(line:string)=>{
 const tokens=line.split(/\s+/).filter(token=>/\d/.test(token)&&token.length<=4);
 for(let i=tokens.length-1;i>=0;i--){
  const fixed=digits(tokens[i]);
  if(fixed&&fixed.length<=3&&+fixed>0)return +fixed;
 }
 return null;
};

// PS sale como "56/56" y debajo van, una por linea, Ataque, Defensa, At. Esp.,
// Def. Esp. y Velocidad. Las etiquetas rara vez se leen enteras, pero el orden
// y los numeros si. Debajo empieza la experiencia y ahi se corta.
const readStats=(text:string)=>{
 const lines=clean(text);
 const start=lines.findIndex(line=>/\d{1,3}\s*[/|]\s*\d{1,3}/.test(line));
 if(start<0)return null;
 const hp=/(\d{1,3})\s*[/|]\s*(\d{1,3})/.exec(lines[start]);
 const rest:number[]=[];
 for(const line of lines.slice(start+1)){
  if(/EXP|POINT|NEXT/i.test(line))break;
  const value=lineNumber(line);
  if(value!==null)rest.push(value);
  if(rest.length===5)break;
 }
 return hp&&rest.length===5?[+hp[2],...rest]:null;
};

const readMoves=(text:string,moves:[string,string][])=>{
 const found:string[]=[];
 for(const line of clean(text)){
  const bare=line.replace(/PP\s*\d{1,3}\s*[/|]\s*\d{1,3}/gi,'').trim();
  const move=fromLine(bare,moves,.62);
  if(move&&!found.includes(move))found.push(move);
  if(found.length===4)break;
 }
 return found;
};

// Niveles y naturalezas con los que cuadran las seis cifras. Es la misma
// cuenta que la ficha ya usa para los IVs, aplicada al reves.
export const fitLevels=(battle:Battle,n:number,stats:number[])=>{
 const base=battle.species[n]?.base;if(!base)return [];
 const out:{level:number;natures:string[]}[]=[];
 for(let level=1;level<=100;level++){
  // Los PS no dependen de la naturaleza, asi que sirven de criba: si el nivel
  // no los admite ni con IV 0 ni con IV 31, no se prueban las 25 naturalezas.
  const low=Math.floor(2*base[0]*level/100)+level+10;
  const high=Math.floor((2*base[0]+31)*level/100)+level+10;
  if(stats[0]<low||stats[0]>high)continue;
  const natures=Object.entries(battle.natures).filter(([,mods])=>
   stats.every((value,i)=>{const fit=genes(base[i],level,value,STATS[i],mods);return !!fit&&fit.min<=31})).map(([name])=>name);
  if(natures.length)out.push({level,natures});
 }
 return out;
};

// Especies que pueden llevar esos ataques y a las que les cuadran esas cifras.
// Con cuatro ataques suele quedar la linea evolutiva, y las estadisticas
// deciden cual de ellas es.
const speciesFrom=(battle:Battle,moves:string[],stats:number[]|null)=>{
 let found=Object.keys(battle.species).map(Number);
 if(moves.length){
  found=found.filter(n=>{
   const species=battle.species[n];
   const pool=new Set([...species.learn.map(([,move])=>move),...species.tms]);
   return moves.every(move=>pool.has(move));
  });
 }
 // Con las cifras delante se descartan las especies a las que no les cuadran
 // a ningun nivel: la criba de PS hace que salga barato aunque sean todas.
 if(stats)found=found.filter(n=>fitLevels(battle,n,stats).length>0);
 return found;
};

type Tables={moves:[string,string][];abilities:[string,string][];natures:[string,string][];species:[string,number][]};
type Read={stats:number[]|null;moves:string[];ability:string|null;named:number|null;nature:string|null};

// De cada lectura se saca todo lo que se pueda. No se decide antes que
// pantalla es: el lector falla con los titulos, y en cambio lo que encuentra
// (cuatro ataques, seis cifras, un nombre) ya dice de que ficha viene.
const readOne=(text:string,tables:Tables):Read=>{
 const read:Read={stats:readStats(text),moves:readMoves(text,tables.moves),ability:null,named:null,nature:null};
 for(const line of clean(text)){
  read.ability=read.ability??fromLine(line,tables.abilities,.78);
  read.named=read.named??fromLine(line,tables.species,.8);
  for(const word of line.split(/\s+/))read.nature=read.nature??closest(word,tables.natures,.82);
 }
 return read;
};

export async function scanCards(files:File[],onStep:(done:number,total:number)=>void){
 const {createWorker}=await import('tesseract.js');
 const worker=await createWorker('eng',1,{workerPath:WORKER,corePath:CORE,langPath:LANG,gzip:true});
 const texts:string[]=[];
 try{
  for(const [i,file] of files.entries()){
   onStep(i,files.length);
   const {data}=await worker.recognize(await prepare(file,false));
   texts.push(data.text);
   // Si de esa imagen no sale ni una cifra ni un ataque, se reintenta en
   // blanco y negro antes de darla por perdida.
   if(!readStats(data.text)&&!/PP\s*\d/i.test(data.text)){
    const retry=await worker.recognize(await prepare(file,true));
    texts.push(retry.data.text);
   }
  }
 }finally{await worker.terminate()}
 onStep(files.length,files.length);
 return texts;
}

export function readDraft(battle:Battle,dex:Dex,texts:string[]):Draft{
 const tables:Tables={
  moves:Object.entries(battle.moves).map(([key,move])=>[move.name,key]),
  abilities:Object.entries(battle.abilities).map(([key,name])=>[name,key]),
  natures:Object.keys(battle.natures).map(name=>[name,name]),
  species:dex.species.filter(s=>battle.species[s.n]).map(s=>[s.name,s.n]),
 };
 const reads=texts.map(text=>readOne(text,tables));
 const moves=reads.map(read=>read.moves).reduce((best,list)=>list.length>best.length?list:best,[] as string[]);
 const named=reads.find(read=>read.named!==null)?.named??null;
 const ability=reads.find(read=>read.ability)?.ability??null;
 const guesses=named!==null?[named]:speciesFrom(battle,moves,null);
 // Que lectura de cifras es la buena lo dice la aritmetica: las de la pantalla
 // de ataques ("PP 35/35") no cuadran con ningun nivel de la especie.
 const options=reads.map(read=>read.stats).filter((stats):stats is number[]=>!!stats);
 const usable=guesses.length
  ?options.find(stats=>guesses.some(n=>fitLevels(battle,n,stats).length>0))??null
  :options[0]??null;
 const draft:Draft={
  species:named!==null?[named]:speciesFrom(battle,moves,usable),
  level:null,levels:[],nature:reads.find(read=>read.nature)?.nature??null,natures:[],
  ability,abilityText:ability?battle.abilities[ability]??null:null,stats:usable,moves,
  // Cifras que se leyeron pero no cuadran con ninguna especie posible: se
  // ensenan igual, porque callarlas parece que la ficha no se leyo.
  odd:usable?null:options[0]??null,
 };
 const only=draft.species.length===1?draft.species[0]:null;
 if(only!==null&&draft.stats){
  const fits=fitLevels(battle,only,draft.stats);
  draft.levels=fits.map(fit=>fit.level);
  // Si la naturaleza se leyo, manda ella y el nivel se elige entre los que la
  // admiten; si no, se ofrece el nivel del medio de los posibles.
  const read=draft.nature;
  const withNature=read?fits.filter(fit=>fit.natures.includes(read)):fits;
  const list=withNature.length?withNature:fits;
  const chosen=list[Math.floor(list.length/2)];
  draft.level=chosen?.level??null;
  draft.natures=chosen?.natures??[];
  if(!draft.nature&&draft.natures.length===1)draft.nature=draft.natures[0];
 }
 return draft;
}

export function ScanPanel({battle,dex,tr,onAdd}:{battle:Battle;dex:Dex;tr:T;onAdd:(mon:Omit<TeamMon,'id'>)=>void}){
 const {t,move:moveName,ability:abilityName,nature:natureName}=tr;
 const [busy,setBusy]=useState<string|null>(null);
 const [error,setError]=useState<string|null>(null);
 const [draft,setDraft]=useState<Draft|null>(null);
 const [species,setSpecies]=useState<number|null>(null);
 const [picked,setPicked]=useState<number|null>(null);
 // La camara del movil da una foto por vez, asi que las fichas se van
 // sumando: cada lectura se guarda y el borrador se rehace con todas.
 const [pages,setPages]=useState<string[]>([]);
 const names=new Map(dex.species.map(s=>[s.n,s.name]));

 const clear=()=>{setPages([]);setDraft(null);setSpecies(null);setPicked(null);setError(null)};

 const run=async(files:File[])=>{
  if(!files.length)return;
  setError(null);
  setBusy(t('scanReading',{done:1,total:files.length}));
  try{
   const fresh=await scanCards(files,(done,total)=>setBusy(t('scanReading',{done:Math.min(done+1,total),total})));
   const all=[...pages,...fresh];
   const read=readDraft(battle,dex,all);
   setPages(all);setDraft(read);
   // La especie elegida a mano se respeta si sigue entre las posibles.
   setSpecies(old=>old!==null&&(!read.species.length||read.species.includes(old))?old
    :read.species.length===1?read.species[0]:null);
   setPicked(null);
   if(!read.stats&&!read.moves.length&&read.species.length!==1)setError(t('scanNothing'));
  }catch(e){
   console.error('No se pudo leer la ficha',e);
   setError(t('scanFailed'));
  }finally{setBusy(null)}
 };

 // Con la especie ya elegida, las cifras dicen a que niveles pudo salir y con
 // que naturalezas. Se recalcula aqui porque la especie se puede cambiar a
 // mano despues de leer.
 const fits=draft?.stats&&species!==null?fitLevels(battle,species,draft.stats):[];
 const levels=fits.map(fit=>fit.level);
 const level=picked!==null&&(!levels.length||levels.includes(picked))?picked
  :levels[Math.floor(levels.length/2)]??null;
 const natures=fits.find(fit=>fit.level===level)?.natures??[];
 const nature=draft?.nature&&(!natures.length||natures.includes(draft.nature))?draft.nature
  :natures.length===1?natures[0]:null;
 const chosen=species!==null?battle.species[species]:null;
 // Que ficha falta por pasar, para poder pedirla sin adivinar.
 const missing=([
  [!draft?.stats,'scanCardSkills'],[!draft?.moves.length,'scanCardMoves'],
  [draft!==null&&draft.species.length!==1&&!draft.stats,'scanCardInfo'],
 ] as const).flatMap(([need,card])=>need?[card]:[]);

 const add=()=>{
  if(!draft||species===null||!chosen)return;
  const useLevel=level??5;
  const learned=chosen.learn.filter(([lvl])=>lvl<=useLevel).map(([,move])=>move);
  const moves=(draft.moves.length?draft.moves:learned.slice(-4)).slice(0,4);
  onAdd({n:species,level:useLevel,nature:nature??natures[0]??'Hardy',ability:draft.ability??chosen.abilities[0]??'',
   moves:[...moves,null,null,null,null].slice(0,4),stats:draft.stats??undefined});
  clear();
 };

 return <details className="team-scan">
  <summary><ScanLine/>{t('scan')}</summary>
  <p className="team-note">{t('scanHelp')}</p>
  <div className="scan-picks">
   {/* `capture` abre la camara; sin el, el movil deja escoger de la galeria. */}
   <label className="scan-pick">
    <Camera/><span>{busy??t('scanPhoto')}</span>
    <input type="file" accept="image/*" multiple capture="environment" disabled={!!busy}
     onChange={e=>{const files=[...(e.target.files??[])];e.target.value='';void run(files)}}/>
   </label>
   <label className="scan-pick">
    <Images/><span>{t('scanPick')}</span>
    <input type="file" accept="image/*" multiple disabled={!!busy}
     onChange={e=>{const files=[...(e.target.files??[])];e.target.value='';void run(files)}}/>
   </label>
  </div>
  {error&&<p className="team-note scan-error">{error}</p>}
  {draft&&<div className="scan-draft">
   <dl>
    <div><dt>{t('pokemon')}</dt><dd>
     {draft.species.length===1
      ?<b>{names.get(draft.species[0])??draft.species[0]}</b>
      :<select value={species??''} onChange={e=>{setSpecies(+e.target.value||null);setPicked(null)}}>
        <option value="">{t('scanPickSpecies')}</option>
        {(draft.species.length?draft.species:dex.species.filter(s=>battle.species[s.n]).map(s=>s.n))
         .map(n=><option key={n} value={n}>{names.get(n)??n}</option>)}
       </select>}
    </dd></div>
    <div><dt>{t('level')}</dt><dd>
     {levels.length>1
      ?<select value={level??''} onChange={e=>setPicked(+e.target.value||null)}>{levels.map(n=><option key={n} value={n}>{n}</option>)}</select>
      :levels.length===1?<b>{levels[0]}</b>
      :<input type="number" min={1} max={100} value={picked??''} placeholder="—"
        onChange={e=>setPicked(e.target.value?Math.max(1,Math.min(100,+e.target.value)):null)}/>}
     <small>{levels.length>1?t('scanLevelGuess',{n:levels.length}):levels.length?t('scanLevelOnly'):t('scanLevelType')}</small>
    </dd></div>
    <div><dt>{t('nature')}</dt><dd>
     <b>{nature?natureName(nature):'—'}</b>
     {!nature&&natures.length>1&&<small>{t('scanNatureGuess',{n:natures.length})}</small>}
    </dd></div>
    <div><dt>{t('ability')}</dt><dd><b>{draft.abilityText?abilityName(draft.abilityText):'—'}</b></dd></div>
    <div><dt>{t('scanStats')}</dt><dd>
     <b className={draft.stats?'':'odd'}>{(draft.stats??draft.odd)?.join(' · ')??'—'}</b>
     {!draft.stats&&draft.odd&&<small className="scan-warn">{t('scanStatsOdd')}</small>}
    </dd></div>
    <div><dt>{t('scanMoves')}</dt><dd><b>{draft.moves.length?draft.moves.map(m=>moveName(battle.moves[m].name)).join(' · '):'—'}</b></dd></div>
   </dl>
   {missing.length>0&&<p className="team-note scan-more">{t('scanMore',{cards:missing.map(card=>t(card)).join(', ')})}</p>}
   {chosen&&draft.ability&&!chosen.abilities.includes(draft.ability)&&<p className="team-note scan-warn">{t('scanOtherGame')}</p>}
   {species===null&&<p className="team-note scan-more">{t('scanChoose')}</p>}
   <div className="scan-actions">
    <button className="scan-add" disabled={species===null} onClick={add}>{t('scanAdd')}</button>
    <button className="team-reset" onClick={clear}><X/>{t('scanDiscard')}</button>
    <small className="scan-count">{t('scanCards',{n:pages.length})}</small>
   </div>
   <p className="team-note">{t('scanNote')}</p>
  </div>}
 </details>;
}
