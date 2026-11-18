// Núcleo del build, sin dependencias de Node: lo usan scripts/build.mjs y el panel admin.html.
// A partir de los datos (catálogo + negocio) y del HTML actual de las páginas, produce
// exactamente los mismos archivos que `npm run build`.
import { validateCatalog, validateBusiness } from './schema.js';
import {
  renderMenu, renderCategoryNav, renderHomeCategories, renderBusinessInfo,
  renderFooterContact, renderJsonLd, hasPendingInfo, esc,
} from './render.js';
import { SPRITE } from './icons.js';
import { header, footer, cartDialog, ORDER_BAR, LIVE_REGION } from './layout.js';

export const PAGES = ['index.html', 'menu.html'];
export const DATA_FILES = { catalog: 'data/catalogo.json', business: 'data/negocio.json' };

/** Formato canónico de los JSON de data/ (el mismo que exporta el editor). */
export const toJson = (data) => JSON.stringify(data, null, 2) + '\n';

/** Hash corto y estable (FNV-1a 32 bits) para versionar js/data/datos.js. */
export function shortHash(text) {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

function formatDate(iso) {
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

export function buildOutputs({ catalog, business }) {
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

  const datos = '// Generado por el build (scripts/build.mjs o el panel admin.html) desde data/catalogo.json y data/negocio.json.\n'
    + '// No editar a mano.\n'
    + `export const CATALOGO = ${JSON.stringify(catalog, null, 2)};\n\n`
    + `export const NEGOCIO = ${JSON.stringify(business, null, 2)};\n`;
  const version = shortHash(datos);

  const blocks = {
    // Versión de los datos: el navegador pide js/data/datos.js?v=HASH y nunca mezcla precios viejos con HTML nuevo.
    version: `<meta name="ebs-datos" content="${version}">\n  <link rel="modulepreload" href="js/data/datos.js?v=${version}">`,
    sprite: SPRITE,
    'pedido-nota': waPending
      ? '<p class="note note--dark"><svg class="icon" aria-hidden="true" focusable="false"><use href="#i-info"></use></svg>El número de WhatsApp todavía no está confirmado. Ya podés armar tu pedido y ver el resumen; el envío por WhatsApp se habilita cuando publiquemos el número.</p>'
      : '',
    'live-region': LIVE_REGION,
    'barra-pedido': ORDER_BAR,
    jsonld: renderJsonLd(catalog, business, { image: shareImage }),
    'home-categorias': renderHomeCategories(catalog),
    'menu-nav': renderCategoryNav(catalog),
    'menu-carta': renderMenu(catalog),
    'menu-fecha': `<p class="menu-intro__meta">Precios en pesos argentinos. Vigentes desde el ${esc(formatDate(catalog.actualizado))}.</p>`,
    'local-info': renderBusinessInfo(business) + pendingNote,
    'footer-contacto': contact,
  };

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

  return { blocksFor, version, files: { 'js/data/datos.js': datos, 'sitemap.xml': sitemap } };
}

export function applyBlocks(html, blocks, file) {
  const used = new Set();
  const out = html.replace(/(<!-- build:([a-z-]+) -->)([\s\S]*?)(<!-- \/build:\2 -->)/g, (_m, open, name, _old, close) => {
    if (!(name in blocks)) throw new Error(`${file}: bloque desconocido "${name}"`);
    used.add(name);
    return `${open}${blocks[name]}${close}`;
  });
  if (!used.size) throw new Error(`${file}: no tiene bloques build`);
  return { html: out, used };
}

/**
 * Todos los archivos del sitio que dependen de los datos.
 * pages: { 'index.html': htmlActual, 'menu.html': htmlActual }
 * Devuelve { files: { ruta: contenido }, version }.
 */
export function buildSiteFiles({ catalog, business, pages }) {
  const out = buildOutputs({ catalog, business });
  const files = {
    [DATA_FILES.catalog]: toJson(catalog),
    [DATA_FILES.business]: toJson(business),
    ...out.files,
  };
  for (const page of PAGES) {
    if (typeof pages[page] !== 'string') throw new Error(`Falta el HTML de ${page}`);
    files[page] = applyBlocks(pages[page], out.blocksFor(page.replace('.html', '')), page).html;
  }
  return { files, version: out.version };
}
