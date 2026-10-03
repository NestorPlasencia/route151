'use client';
// Aprender a jugar: la tabla de tipos del juego y un glosario de los terminos
// de la app (IV, EV, naturaleza...), cada uno explicado segun su generacion.
// Una "?" junto a un termino abre su explicacion donde se usa.
import {useState} from 'react';
import {createPortal} from 'react-dom';
import {CircleHelp,X} from 'lucide-react';
import {Modal} from './modal';
import type {T} from './i18n';
import type {Battle} from './team';
import type {Gen} from './rules';

type Entry={id:string;gens:Gen[];title:[string,string];text:[string,string]};
// Frases cortas y un ejemplo, para quien no sabe nada de stats.
export const GLOSSARY:Entry[]=[
 {id:'stats',gens:[1,3],title:['Stats','Stats (estadísticas)'],text:[
  'The numbers that decide a fight: HP, Attack, Defense, Speed and, for special moves, Special. They grow with level.',
  'Los números que deciden un combate: PS, Ataque, Defensa, Velocidad y, para los ataques especiales, Especial. Suben con el nivel.']},
 {id:'base',gens:[1,3],title:['Base stats','Stats base'],text:[
  'What the species brings: every Onix has huge Defense and every Abra huge Special. They never change.',
  'Lo que trae la especie: todo Onix tiene mucha Defensa y todo Abra mucho Especial. No cambian nunca.']},
 {id:'iv',gens:[3],title:['IVs','IV (valores individuales)'],text:[
  'Each Pokémon\'s "DNA", from 0 to 31 per stat: two Pikachu at the same level can have different stats because of them. They are fixed when you catch it.',
  'El "ADN" de cada Pokémon, de 0 a 31 en cada stat: por eso dos Pikachu del mismo nivel tienen stats distintas. Se fijan al atraparlo y no cambian.']},
 {id:'dv',gens:[1],title:['DVs','DV (valores determinantes)'],text:[
  'Each Pokémon\'s "DNA", from 0 to 15 per stat: two Pikachu at the same level can have different stats because of them. The HP one comes from the other four.',
  'El "ADN" de cada Pokémon, de 0 a 15 en cada stat: por eso dos Pikachu del mismo nivel tienen stats distintas. El de PS sale de los otros cuatro.']},
 {id:'ev',gens:[3],title:['EVs','EV (puntos de esfuerzo)'],text:[
  'Points your Pokémon earns for each Pokémon it defeats: a Geodude gives +1 Defense. Every 4 EVs are 1 more stat point at level 100; up to 510 in total and 255 per stat.',
  'Puntos que gana tu Pokémon por cada Pokémon que derrota: un Geodude da +1 Defensa. Cada 4 EV son 1 punto más de stat al nivel 100; hasta 510 en total y 255 por stat.']},
 {id:'statexp',gens:[1],title:['Stat Exp.','Stat Exp. (experiencia de stat)'],text:[
  'For each Pokémon you defeat, yours earns its base stats as points in every stat at once. There is no total cap, so training on strong Pokémon pays off.',
  'Por cada Pokémon que derrotas, el tuyo gana sus stats base como puntos en todos sus stats a la vez. No hay tope total: entrenar con Pokémon fuertes compensa.']},
 {id:'nature',gens:[3],title:['Nature','Naturaleza'],text:[
  'Raises one stat by 10% and lowers another by 10% (Adamant: +Attack, −Sp. Atk). Some change nothing. Pick one that helps the moves it uses.',
  'Sube un 10 % un stat y baja otro un 10 % (Firme: +Ataque, −At. Esp.). Algunas no cambian nada. Conviene una que ayude a los ataques que usa.']},
 {id:'ability',gens:[3],title:['Ability','Habilidad'],text:[
  'A passive effect in battle: Overgrow powers up Grass moves when HP is low; Levitate dodges Ground moves.',
  'Un efecto pasivo en combate: Espesura potencia los ataques Planta con pocos PS; Levitación esquiva los de Tierra.']},
 {id:'stab',gens:[1,3],title:['Same-type bonus (STAB)','Bonus de mismo tipo (STAB)'],text:[
  'A move of the same type as the Pokémon hits 50% harder: Charmander\'s Ember is stronger than the same Ember from a Pidgey.',
  'Un ataque del mismo tipo que el Pokémon pega un 50 % más: el Ascuas de Charmander pega más que el mismo Ascuas en un Pidgey.']},
 {id:'effective',gens:[1,3],title:['Type effectiveness','Efectividad de tipos'],text:[
  'Super effective ×2 (×4 if both types are weak), not very effective ×½, no effect ×0. See the type chart.',
  'Súper eficaz ×2 (×4 si sus dos tipos son débiles), poco eficaz ×½, no afecta ×0. Mira la tabla de tipos.']},
 {id:'split',gens:[1,3],title:['Physical or special','Físico o especial'],text:[
  'In these games the move\'s type decides it: Fire, Water, Grass, Electric, Ice, Psychic and Dragon (and Dark in Gen 3) are special; the rest, physical.',
  'En estos juegos lo decide el tipo del ataque: Fuego, Agua, Planta, Eléctrico, Hielo, Psíquico y Dragón (y Siniestro en Gen 3) son especiales; el resto, físicos.']},
 {id:'judge',gens:[1,3],title:['Judge','Juez'],text:[
  'A summary of how good your Pokémon\'s "DNA" is, worked out from the stats you type in.',
  'Un resumen de lo bueno que es el "ADN" de tu Pokémon, calculado con las stats que escribes.']},
 {id:'training',gens:[1,3],title:['Worth training','Valor para entrenar'],text:[
  'How much it pays to invest in this Pokémon: its species (once evolved), its DNA and its nature, compared with the best of its kind.',
  'Cuánto compensa invertir en este Pokémon: su especie (ya evolucionada), su ADN y su naturaleza, frente al mejor de su especie.']},
];

const pick=(pair:[string,string],tr:T)=>pair[tr.lang==='es'?1:0];
export const entryOf=(id:string,gen:Gen)=>GLOSSARY.find(e=>e.id===id&&e.gens.includes(gen))??null;

// "?" junto a un termino: su explicacion sale abajo, como una hoja que se
// cierra al tocar fuera. Asi no se sale de la pantalla en un movil.
export function Help({term,gen,tr}:{term:string;gen:Gen;tr:T}){
 const [open,setOpen]=useState(false);
 const e=entryOf(term,gen);
 if(!e)return null;
 return <>
  <button type="button" className="help" aria-label={tr.t('helpWhat',{term:pick(e.title,tr)})} onClick={ev=>{ev.preventDefault();ev.stopPropagation();setOpen(true)}}><CircleHelp/></button>
  {/* Fuera del <label> donde va la "?": dentro, tocar la hoja activaria el campo. */}
  {open&&createPortal(<Modal className="help-sheet" label={pick(e.title,tr)} onClose={()=>setOpen(false)}><button data-dialog-focus className="close" onClick={()=>setOpen(false)} aria-label={tr.t('close')}><X/></button><b>{pick(e.title,tr)}</b><p>{pick(e.text,tr)}</p></Modal>,document.body)}
 </>;
}

// Tipos del juego (la tabla del decomp de FRLG trae un 'endtable' de relleno).
const typesOf=(chart:Battle['chart'])=>Object.keys(chart).filter(k=>k!=='endtable');
const mult=(chart:Battle['chart'],a:string,d:string)=>chart[a]?.[d]??1;
const label=(m:number)=>m===0?'0':m===.5?'½':m===2?'2':'';

export function LearnView({battle,gen,switcher,tr}:{battle:Battle|null;gen:Gen;switcher:React.ReactNode;tr:T}){
 const {t,type}=tr;
 const [pickT,setPickT]=useState<string|null>(null);
 if(!battle)return <div className="listview loading-list">{t('loadingDex')}</div>;
 const types=typesOf(battle.chart),chart=battle.chart;
 const sel=pickT&&types.includes(pickT)?pickT:types.includes('fire')?'fire':types[0];
 const by=(test:(m:number)=>boolean,attacking:boolean)=>types.filter(o=>test(attacking?mult(chart,sel,o):mult(chart,o,sel))).map(type);
 const line=(key:Parameters<typeof t>[0],list:string[])=>list.length>0&&<p><b>{t(key)}</b> {list.join(', ')}</p>;
 return <div className="listview learn">
  <div className="list-head"><div className="list-title"><h2>{t('learnTitle')}</h2></div>{switcher}</div>
  <div className="list-body">
   <section className="learn-card">
    <h3>{t('typeChart')}</h3>
    <p className="learn-note">{t(gen===1?'typeNoteGen1':'typeNoteGen3')}</p>
    <div className="type-chips">{types.map(x=><button key={x} className={`type-chip t-${x} ${x===sel?'on':''}`} aria-pressed={x===sel} onClick={()=>setPickT(x)}>{type(x)}</button>)}</div>
    <div className="type-summary">
     <h4 className={`t-${sel}`}>{type(sel)}</h4>
     <div className="type-cols">
      <div><small>{t('typeAttacking')}</small>{line('typeStrong',by(m=>m>1,true))}{line('typeWeakHit',by(m=>m>0&&m<1,true))}{line('typeNoEffect',by(m=>m===0,true))}</div>
      <div><small>{t('typeDefending')}</small>{line('typeWeakTo',by(m=>m>1,false))}{line('typeResists',by(m=>m>0&&m<1,false))}{line('typeImmune',by(m=>m===0,false))}</div>
     </div>
    </div>
    {/* La tabla entera: filas atacan, columnas defienden. Se desliza de lado. */}
    <div className="type-table-wrap"><table className="type-table">
     <thead><tr><th>{t('typeAtkDef')}</th>{types.map(d=><th key={d} className={`t-${d} ${d===sel?'on':''}`} title={type(d)}>{type(d).slice(0,3)}</th>)}</tr></thead>
     <tbody>{types.map(a=><tr key={a} className={a===sel?'on':''}><th className={`t-${a}`} onClick={()=>setPickT(a)}>{type(a)}</th>
      {types.map(d=>{const m=mult(chart,a,d);return <td key={d} className={m>1?'x2':m===0?'x0':m<1?'xh':''}>{label(m)}</td>})}</tr>)}</tbody>
    </table></div>
   </section>
   <section className="learn-card">
    <h3>{t('glossary')}</h3>
    <dl className="glossary">{GLOSSARY.filter(e=>e.gens.includes(gen)).map(e=><div key={e.id} id={`term-${e.id}`}><dt>{pick(e.title,tr)}</dt><dd>{pick(e.text,tr)}</dd></div>)}</dl>
   </section>
  </div>
 </div>;
}
