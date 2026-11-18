// Build de El Buen Sabor.
// 1. Valida data/catalogo.json y data/negocio.json.
// 2. Genera js/data/datos.js (módulo que usa el navegador).
// 3. Prerenderiza en index.html y menu.html los bloques marcados con <!-- build:NOMBRE --> ... <!-- /build:NOMBRE -->.
// 4. Genera sitemap.xml.
// Uso: npm run build   |   npm run check (falla si algo generado quedó desactualizado; no escribe).
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateCatalog, validateBusiness } from '../js/core/schema.js';
import {
  renderMenu, renderCategoryNav, renderHomeCategories, renderBusinessInfo,
  renderFooterContact, renderJsonLd, hasPendingInfo, esc,
} from '../js/core/render.js';
import { SPRITE } from '../js/core/icons.js';
import { header, footer, cartDialog, ORDER_BAR, LIVE_REGION } from './layout.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CHECK = process.argv.includes('--check');

const readJson = async (rel) => JSON.parse(await readFile(path.join(ROOT, rel), 'utf8'));

export async function buildOutputs({ catalog, business } = {}) {
  catalog ??= await readJson('data/catalogo.json');
  business ??= await readJson('data/negocio.json');
  const errors = [...validateCatalog(catalog).map((e) => 'catalogo: ' + e), ...validateBusiness(business).map((e) => 'negocio: ' + e)];
  if (errors.length) {
    const err = new Error('Datos inválidos:\n - ' + errors.join('\n - '));
    err.validation = errors;
    throw err;
  }

  const shareImage = business.sitio.url + 'assets/img/compartir-1200x630.jpg';
  const pendingNote = hasPendingInfo(business)
    ? '<p class="note"><svg class="icon" aria-hidden="true" focusable="false"><use href="#i-info"></use></svg>Los datos marcados “A confirmar” se publican apenas estén confirmados.</p>'
    : '';

  const waPending = business.whatsapp.estado !== 'confirmado';
  const contact = renderFooterContact(business);
  const blocks = {
    sprite: SPRITE,
    'pedido-nota': waPending
      ? '<p class="note note--dark"><svg class="icon" aria-hidden="true" focusable="false"><use href="#i-info"></use></svg>El número de WhatsApp del nuevo local todavía no está confirmado. Ya podés armar tu pedido y ver el resumen; el envío por WhatsApp se habilita cuando publiquemos el número.</p>'
      : '',
    'live-region': LIVE_REGION,
    'barra-pedido': ORDER_BAR,
    jsonld: renderJsonLd(catalog, business, { image: shareImage }),
    'home-categorias': renderHomeCategories(catalog),
    'menu-nav': renderCategoryNav(catalog),
    'menu-carta': renderMenu(catalog),
    'menu-fecha': `<p class="menu-intro__meta">Precios en pesos argentinos. Vigentes desde el ${esc(formatDate(catalog.actualizado))}.</p>`,
    'local-info': renderBusinessInfo(business) + pendingNote,
    'footer-contacto': renderFooterContact(business),
  };

  const datos = '// Generado por scripts/build.mjs desde data/catalogo.json y data/negocio.json.\n'
    + '// No editar a mano: cambiá los JSON y ejecutá `npm run build`.\n'
    + `export const CATALOGO = ${JSON.stringify(catalog, null, 2)};\n\n`
    + `export const NEGOCIO = ${JSON.stringify(business, null, 2)};\n`;

  const urls = ['', 'menu.html'];
  const sitemap = '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
    + urls.map((u) => `  <url><loc>${business.sitio.url}${u}</loc><lastmod>${catalog.actualizado}</lastmod></url>`).join('\n')
    + '\n</urlset>\n';

  const blocksFor = (page) => ({
    ...blocks,
    cabecera: header(page, business),
    pie: footer(page, contact),
    'dialogo-pedido': cartDialog(page),
  });

  return { blocksFor, files: { 'js/data/datos.js': datos, 'sitemap.xml': sitemap } };
}

function formatDate(iso) {
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

export function applyBlocks(html, blocks, file) {
  const used = new Set();
  const out = html.replace(/(<!-- build:([a-z-]+) -->)([\s\S]*?)(<!-- \/build:\2 -->)/g, (_m, open, name, _old, close) => {
    if (!(name in blocks)) throw new Error(`${file}: bloque desconocido "${name}"`);
    used.add(name);
    return `${open}${blocks[name]}${close}`;
  });
  return { html: out, used };
}

async function main() {
  let outputs;
  try {
    outputs = await buildOutputs();
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }
  const stale = [];
  const writes = [];
  for (const page of ['index.html', 'menu.html']) {
    const file = path.join(ROOT, page);
    const html = await readFile(file, 'utf8');
    const { html: next, used } = applyBlocks(html, outputs.blocksFor(page.replace('.html', '')), page);
    if (!used.size) throw new Error(`${page}: no tiene bloques build`);
    if (next !== html) { stale.push(page); writes.push([file, next]); }
  }
  for (const [rel, content] of Object.entries(outputs.files)) {
    const file = path.join(ROOT, rel);
    let current = null;
    try { current = await readFile(file, 'utf8'); } catch { /* nuevo */ }
    if (current !== content) { stale.push(rel); writes.push([file, content]); }
  }
  if (CHECK) {
    if (stale.length) {
      console.error('Desactualizado respecto de data/*.json: ' + stale.join(', ') + '\nEjecutá `npm run build`.');
      process.exit(1);
    }
    console.log('OK: páginas y datos generados están sincronizados con data/*.json.');
    return;
  }
  for (const [file, content] of writes) { await mkdir(path.dirname(file), { recursive: true }); await writeFile(file, content); }
  console.log(writes.length ? 'Actualizado: ' + stale.join(', ') : 'Sin cambios.');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
