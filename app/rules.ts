// Reglas de cada generacion, como datos. La app pregunta por capacidades
// ("¿hay naturalezas?", "¿los genes son DVs?") y nunca por un juego concreto:
// asi una funcion nueva se escribe una vez y vale para todos, y un juego nuevo
// solo declara aqui lo que tiene.

export type Gen=1|3;

export type Rules={
 gen:Gen;
 // Especial unica (Gen 1: ataca y defiende con la misma cifra, que se guarda en
 // las dos casillas especiales) o separada en ataque y defensa.
 special:'single'|'split';
 // Genes: como se llaman y hasta cuanto llegan tal como se ven (DV 0-15,
 // IV 0-31). En las cuentas los DVs entran dobles (0-30): `scale`.
 genes:{name:'DV'|'IV';max:number;scale:number};
 natures:boolean;
 abilities:boolean;
 // El juez de IVs (hexagono) y el lector de fichas con la camara.
 judge:boolean;
 scan:boolean;
 // Lo que se gana al derrotar a un Pokemon: EVs por especie (Gen 3) o Stat
 // Exp. igual a todas sus bases (Gen 1).
 effort:'ev'|'statexp';
 // Descripciones de los ataques (Gen 1 no las tiene).
 moveText:boolean;
 // Valor para entrenar: pesos de la especie y del ejemplar (PS, Ataque,
 // Defensa, At. Esp., Def. Esp., Velocidad), escala y tope de los genes en
 // las cuentas. Ver trainingValue en team.tsx.
 training:{weights:number[];specimen:number[];floor:number;top:number;max:number};
};

export const RULES:Record<Gen,Rules>={
 1:{gen:1,special:'single',genes:{name:'DV',max:15,scale:2},natures:false,abilities:false,judge:false,scan:false,effort:'statexp',moveText:false,
  training:{weights:[.15,.3,.15,.3,.1,.3],specimen:[.1,.5,.1,.5,.05,.25],floor:125,top:300,max:30}},
 3:{gen:3,special:'split',genes:{name:'IV',max:31,scale:1},natures:true,abilities:true,judge:true,scan:true,effort:'ev',moveText:true,
  training:{weights:[.15,.3,.15,.3,.15,.25],specimen:[.1,.5,.1,.5,.1,.2],floor:120,top:280,max:31}},
};

export const rulesFor=(gen:Gen|undefined)=>RULES[gen??3];
