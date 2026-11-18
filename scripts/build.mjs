// Build de El Buen Sabor (línea de comandos).
// Valida data/*.json, regenera js/data/datos.js, los bloques <!-- build:NOMBRE --> de index.html y sitemap.xml.
// La lógica vive en js/core/build-core.js y es la misma que usa el panel admin.html al publicar.
// Uso: npm run build   |   npm run check (falla si algo generado quedó desactualizado; no escribe).
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildOutputs as buildCore, buildSiteFiles, applyBlocks, PAGES, DATA_FILES } from '../js/core/build-core.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CHECK = process.argv.includes('--check');

const readJson = async (rel) => JSON.parse(await readFile(path.join(ROOT, rel), 'utf8'));

/** Igual que el núcleo, pero lee data/*.json si no se pasan datos. */
export async function buildOutputs({ catalog, business } = {}) {
  catalog ??= await readJson(DATA_FILES.catalog);
  business ??= await readJson(DATA_FILES.business);
  return buildCore({ catalog, business });
}
export { applyBlocks };

async function main() {
  let result;
  try {
    const pages = {};
    for (const p of PAGES) pages[p] = await readFile(path.join(ROOT, p), 'utf8');
    result = buildSiteFiles({ catalog: await readJson(DATA_FILES.catalog), business: await readJson(DATA_FILES.business), pages });
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }
  const stale = [];
  for (const [rel, content] of Object.entries(result.files)) {
    const file = path.join(ROOT, rel);
    let current = null;
    try { current = await readFile(file, 'utf8'); } catch { /* nuevo */ }
    // Los JSON de data/ se aceptan con cualquier formato válido; el resto debe coincidir exactamente.
    if (rel.startsWith('data/')) continue;
    if (current !== content) {
      stale.push(rel);
      if (!CHECK) { await mkdir(path.dirname(file), { recursive: true }); await writeFile(file, content); }
    }
  }
  if (CHECK) {
    if (stale.length) {
      console.error('Desactualizado respecto de data/*.json: ' + stale.join(', ') + '\nEjecutá `npm run build`.');
      process.exit(1);
    }
    console.log('OK: páginas y datos generados están sincronizados con data/*.json.');
    return;
  }
  console.log(stale.length ? 'Actualizado: ' + stale.join(', ') : 'Sin cambios.');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
