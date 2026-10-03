// Las marcas se consultan en DevTools > Performance, sin telemetria externa.
// El banco /benchmark usa exactamente estas mismas funciones y datos.
export function measure<T>(name:string,run:()=>T):T{
 const start=performance.now();
 try{return run()}finally{performance.measure(`route151:${name}`,{start,end:performance.now()});}
}
