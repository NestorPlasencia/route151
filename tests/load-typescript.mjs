import { readFile } from 'node:fs/promises';
import ts from 'typescript';

const compiled = new Map();
function moduleUrl(url) {
  if (compiled.has(url.href)) return compiled.get(url.href);
  const promise = (async () => {
    const source = await readFile(url, 'utf8');
    let output = url.pathname.endsWith('.json')
      ? `export default ${JSON.stringify(JSON.parse(source))};`
      : ts.transpileModule(source, {
          compilerOptions: {
            target: ts.ScriptTarget.ES2022,
            module: ts.ModuleKind.ESNext,
          },
        }).outputText;
    for (const match of output.matchAll(/\bfrom\s+(['"])(\.[^'"]+)\1/g)) {
      const specifier = match[2];
      const dependency = new URL(
        /\.(ts|json)$/.test(specifier) ? specifier : `${specifier}.ts`,
        url,
      );
      output = output.replace(
        match[0],
        `from '${await moduleUrl(dependency)}'`,
      );
    }
    return `data:text/javascript;base64,${Buffer.from(output).toString('base64')}`;
  })();
  compiled.set(url.href, promise);
  return promise;
}

// Ejecuta la logica TypeScript y su catalogo JSON con el runner de Node, sin
// instalar otro framework ni sustituir las funciones que queremos comprobar.
export async function loadTypeScript(url) {
  return import(await moduleUrl(url));
}
