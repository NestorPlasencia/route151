import { readFile } from 'node:fs/promises';
import ts from 'typescript';

// Prueba modulos de logica sin DOM ni dependencias nuevas. Los imports de tipos
// desaparecen; estos modulos no deben depender de componentes en ejecucion.
export async function loadTypeScript(url) {
  const source = await readFile(url, 'utf8');
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
    },
  });
  return import(
    `data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`
  );
}
