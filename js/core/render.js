// Renderizado a HTML (texto escapado) desde la fuente canónica.
// Lo usan el build (prerender de index/menu) y la vista previa del editor local.
import { formatARS } from './money.js';

export function esc(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const FOOD = { widths: [480, 768, 1024], w: 1536, h: 1024 };

export function picture(name, { base = '', alt = '', sizes, widths = FOOD.widths, width = FOOD.w, height = FOOD.h, loading = 'lazy', priority = false, cls = '' } = {}) {
  const set = (ext) => widths.map((w) => `${base}assets/img/${name}-${w}.${ext} ${w}w`).join(', ');
  const fallback = `${base}assets/img/${name}-${widths[Math.min(1, widths.length - 1)]}.webp`;
  return `<picture${cls ? ` class="${cls}"` : ''}>`
    + `<source type="image/avif" srcset="${set('avif')}" sizes="${esc(sizes)}">`
    + `<source type="image/webp" srcset="${set('webp')}" sizes="${esc(sizes)}">`
    + `<img src="${fallback}" alt="${esc(alt)}" width="${width}" height="${height}" decoding="async"`
    + (priority ? ' fetchpriority="high"' : ` loading="${loading}"`)
    + '></picture>';
}

export const icon = (id, label) => label
  ? `<svg class="icon" role="img" aria-label="${esc(label)}"><use href="#i-${id}"></use></svg>`
  : `<svg class="icon" aria-hidden="true" focusable="false"><use href="#i-${id}"></use></svg>`;

const visibleProducts = (catalog, catId) => catalog.productos.filter((p) => p.categoria === catId && p.estado !== 'oculto' && p.variantes.some((v) => v.estado !== 'oculto'));
const activeCategories = (catalog) => catalog.categorias.filter((c) => c.estado === 'activa' && visibleProducts(catalog, c.id).length);

function priceText(v) {
  return v.precioEstado === 'confirmado' && Number.isSafeInteger(v.precio) ? formatARS(v.precio) : 'Precio a confirmar';
}

function variantMeta(v) {
  const parts = [];
  if (v.unidades > 1) parts.push(`${v.unidades} unidades`);
  parts.push(priceText(v));
  if (v.estado === 'agotado') parts.push('Agotado');
  return parts.join(' · ');
}

function productState(p) {
  const vis = p.variantes.filter((v) => v.estado !== 'oculto');
  if (p.estado === 'agotado' || vis.every((v) => v.estado === 'agotado')) return 'agotado';
  if (vis.every((v) => v.precioEstado !== 'confirmado' || v.estado === 'agotado')) return 'pendiente';
  return 'disponible';
}

/** Ficha de producto de la carta. */
export function renderProductCard(p, { base = '', eager = false } = {}) {
  const vis = p.variantes.filter((v) => v.estado !== 'oculto');
  const state = productState(p);
  const def = vis.find((v) => v.estado === 'disponible' && v.precioEstado === 'confirmado') || vis[0];
  const nameId = `n-${p.id}`;
  let options;
  if (vis.length > 1) {
    options = `<fieldset class="choice"><legend class="choice__legend">Presentación</legend><div class="choice__opts">`
      + vis.map((v) => {
        const disabled = v.estado === 'agotado' || v.precioEstado !== 'confirmado';
        return `<label class="choice__opt"><input type="radio" name="variant" value="${esc(v.id)}"${v === def ? ' checked' : ''}${disabled ? ' disabled' : ''}>`
          + `<span class="choice__label">${esc(v.presentacion)}</span><span class="choice__meta">${esc(variantMeta(v))}</span></label>`;
      }).join('')
      + `</div></fieldset>`;
  } else {
    options = `<p class="product__presentation">${esc(def.presentacion)}${def.unidades > 1 ? ` · ${def.unidades} unidades` : ''}</p>`
      + `<input type="hidden" name="variant" value="${esc(def.id)}">`;
  }

  const status = state === 'agotado' ? '<p class="tag tag--muted">Agotado</p>'
    : state === 'pendiente' ? '<p class="tag tag--muted">Precio a confirmar</p>' : '';

  const buy = state === 'disponible'
    ? `<div class="product__buy js-only">`
      + `<div class="qty" role="group" aria-label="Cantidad de ${esc(p.nombre.toLowerCase())}">`
      + `<button type="button" class="qty__btn" data-qty="-1" aria-label="Restar uno">${icon('minus')}</button>`
      + `<input class="qty__input" type="number" name="qty" inputmode="numeric" min="1" max="20" value="1" aria-label="Cantidad">`
      + `<button type="button" class="qty__btn" data-qty="1" aria-label="Sumar uno">${icon('plus')}</button>`
      + `</div>`
      + `<button type="submit" class="btn btn--primary product__add">Agregar al pedido</button>`
      + `</div>`
      + `<p class="product__line" data-line aria-hidden="true"></p>`
    : '';

  return `<article class="product${p.imagen ? '' : ' product--sin-foto'}" id="p-${esc(p.id)}" data-product="${esc(p.id)}" data-state="${state}" aria-labelledby="${nameId}">`
    + (p.imagen ? picture(p.imagen, { base, alt: p.alt, sizes: '(min-width: 1100px) 360px, (min-width: 700px) 45vw, 100vw', cls: 'product__media', loading: eager ? 'eager' : 'lazy' }) : '')
    + `<div class="product__body">`
    + `<h3 class="product__name" id="${nameId}">${esc(p.nombre)}</h3>`
    + (p.descripcion ? `<p class="product__desc">${esc(p.descripcion)}</p>` : '')
    + status
    + `<form class="product__form" data-product-form novalidate>`
    + options
    + `<p class="product__price"><span class="visually-hidden">Precio: </span><span data-price>${esc(priceText(def))}</span></p>`
    + buy
    + `</form></div></article>`;
}

/** Carta completa (menu.html). */
export function renderMenu(catalog, { base = '' } = {}) {
  return activeCategories(catalog).map((c, ci) => {
    const items = visibleProducts(catalog, c.id);
    const first = ci === 0;
    return `<section class="menu-cat" id="${esc(c.id)}" aria-labelledby="h-${esc(c.id)}">`
      + `<header class="menu-cat__head"><h2 class="menu-cat__title" id="h-${esc(c.id)}">${esc(c.nombre)}</h2>`
      + (c.descripcion ? `<p class="menu-cat__desc">${esc(c.descripcion)}</p>` : '')
      + `</header><div class="menu-grid">`
      + items.map((p, i) => renderProductCard(p, { base, eager: first && i < 2 })).join('')
      + `</div></section>`;
  }).join('\n');
}

export function renderCategoryNav(catalog) {
  return `<ul class="catnav__list" role="list">` + activeCategories(catalog)
    .map((c) => `<li><a class="catnav__link" href="#${esc(c.id)}">${esc(c.nombre)}</a></li>`).join('') + `</ul>`;
}

/**
 * Resumen de precios para la portada.
 * Por presentación cuando todos los productos comparten las mismas opciones (empanadas, papas);
 * si no, una fila por producto con su precio (o "desde" si tiene varias opciones).
 */
export function categoryPriceSummary(catalog, catId) {
  const products = visibleProducts(catalog, catId);
  const sellable = (p) => p.variantes.filter((v) => v.estado === 'disponible' && v.precioEstado === 'confirmado');
  const sets = products.map((p) => sellable(p).map((v) => v.presentacion).sort().join('|'));
  const byPresentation = products.some((p) => sellable(p).length > 1) && sets.every((s) => s === sets[0]);
  if (!byPresentation) {
    return products.filter((p) => sellable(p).length).map((p) => {
      const list = sellable(p).map((v) => v.precio).sort((a, b) => a - b);
      return { presentacion: p.nombre, unidades: 1, precio: list[0], desde: list.length > 1 };
    });
  }
  const byPres = new Map();
  for (const p of products) {
    for (const v of p.variantes) {
      if (v.estado !== 'disponible' || v.precioEstado !== 'confirmado') continue;
      const key = v.presentacion;
      if (!byPres.has(key)) byPres.set(key, { units: v.unidades, prices: new Set() });
      byPres.get(key).prices.add(v.precio);
    }
  }
  return [...byPres.entries()].map(([pres, { units, prices }]) => {
    const list = [...prices].sort((a, b) => a - b);
    return { presentacion: pres, unidades: units, precio: list[0], desde: list.length > 1 };
  });
}

/** Fichas de la portada (index.html): una por categoría activa. */
export function renderHomeCategories(catalog, { base = '' } = {}) {
  return activeCategories(catalog).map((c, i) => {
    const first = visibleProducts(catalog, c.id).find((p) => p.imagen);
    const rows = categoryPriceSummary(catalog, c.id);
    const prices = rows.length
      ? `<dl class="cat-card__prices">` + rows.map((r) => `<div><dt>${esc(r.presentacion)}${r.unidades > 1 ? ` <span class="muted">(${r.unidades} u.)</span>` : ''}</dt><dd>${r.desde ? 'desde ' : ''}${esc(formatARS(r.precio))}</dd></div>`).join('') + `</dl>`
      : `<p class="muted">Precio a confirmar</p>`;
    return `<article class="cat-card${first ? '' : ' cat-card--sin-foto'}">`
      + (!first ? '' : picture(first.imagen, { base, alt: first.alt, sizes: '(min-width: 1100px) 360px, (min-width: 700px) 30vw, 100vw', cls: 'cat-card__media', loading: i === 0 ? 'eager' : 'lazy' }))
      + `<div class="cat-card__body"><h3 class="cat-card__title">${esc(c.nombre)}</h3>`
      + (c.descripcion ? `<p class="cat-card__desc">${esc(c.descripcion)}</p>` : '')
      + prices
      + `<a class="btn btn--ghost cat-card__cta" href="${base}menu.html#${esc(c.id)}">Elegir opciones<span class="visually-hidden"> de ${esc(c.nombre.toLowerCase())}</span>${icon('arrow')}</a>`
      + `</div></article>`;
  }).join('\n');
}

const PENDING = '<span class="pending">A confirmar</span>';

function waDisplay(numero) {
  // 5493757000000 -> +54 9 3757 00-0000 aproximado; se muestra con espacios simples.
  return '+' + numero.replace(/^(\d{2})(\d)(\d{4})(\d+)$/, '$1 $2 $3 $4');
}

/** Datos del local (sección #location). */
export function renderBusinessInfo(biz) {
  const rows = [];
  const dir = biz.direccion;
  rows.push(['pin', 'Dirección', dir.estado === 'confirmado'
    ? `${esc(dir.texto)}${dir.localidad ? `<br>${esc(dir.localidad)}` : ''}${dir.mapaUrl ? `<br><a href="${esc(dir.mapaUrl)}" target="_blank" rel="noopener noreferrer">Abrir en el mapa<span class="visually-hidden"> (se abre en otra pestaña)</span></a>` : ''}`
    : PENDING]);
  const h = biz.horarios;
  rows.push(['clock', 'Horarios', h.estado === 'confirmado'
    ? `<ul class="plain" role="list">${h.lista.map((r) => `<li>${esc(r.dias)}: <strong>${esc(r.horario)}</strong></li>`).join('')}</ul>`
    : PENDING]);
  const wa = biz.whatsapp;
  rows.push(['whatsapp', 'WhatsApp', wa.estado === 'confirmado'
    ? `<a href="https://wa.me/${esc(wa.numero)}" target="_blank" rel="noopener noreferrer">${esc(waDisplay(wa.numero))}<span class="visually-hidden"> (se abre WhatsApp)</span></a>`
    : PENDING]);
  const m = biz.modalidades;
  const modes = [];
  if (m.retiro.estado === 'confirmado') modes.push('Retiro en el local');
  if (m.envio.estado === 'confirmado') modes.push('Envío a zonas habilitadas');
  rows.push(['bag', 'Retiro y envío', modes.length ? esc(modes.join(' · ')) : PENDING]);
  const pay = biz.mediosDePago;
  rows.push(['card', 'Medios de pago', pay.estado === 'confirmado' && pay.lista.length ? esc(pay.lista.join(' · '))
    : wa.estado === 'confirmado' ? 'Consultalos por WhatsApp' : PENDING]);
  return `<dl class="info-list">` + rows.map(([ic, k, v]) => `<div class="info-list__row">${icon(ic)}<dt>${k}</dt><dd>${v}</dd></div>`).join('') + `</dl>`;
}

export function hasPendingInfo(biz) {
  return [biz.direccion, biz.horarios, biz.whatsapp].some((x) => x.estado !== 'confirmado')
    || biz.modalidades.retiro.estado !== 'confirmado' && biz.modalidades.envio.estado !== 'confirmado';
}

/** Bloque de contacto del pie. */
export function renderFooterContact(biz) {
  const items = [];
  if (biz.direccion.estado === 'confirmado') items.push(`<li>${esc(biz.direccion.texto)}</li>`);
  if (biz.horarios.estado === 'confirmado') items.push(...biz.horarios.lista.map((r) => `<li>${esc(r.dias)}: ${esc(r.horario)}</li>`));
  if (biz.whatsapp.estado === 'confirmado') items.push(`<li><a href="https://wa.me/${esc(biz.whatsapp.numero)}" target="_blank" rel="noopener noreferrer">WhatsApp ${esc(waDisplay(biz.whatsapp.numero))}</a></li>`);
  for (const r of biz.redes) items.push(`<li><a href="${esc(r.url)}" target="_blank" rel="noopener noreferrer">${esc(r.nombre)}</a></li>`);
  if (!items.length) items.push('<li>Dirección, horarios y contacto del nuevo local: a confirmar.</li>');
  return `<ul class="plain footer__list" role="list">${items.join('')}</ul>`;
}

/** Datos estructurados: solo campos confirmados y presentes en la página. */
export function renderJsonLd(catalog, biz, { image } = {}) {
  const site = biz.sitio.url;
  const data = {
    '@context': 'https://schema.org',
    '@type': 'Restaurant',
    name: biz.nombre,
    alternateName: biz.nombreHistorico,
    url: site,
    slogan: biz.lema,
    currenciesAccepted: 'ARS',
    hasMenu: {
      '@type': 'Menu',
      name: 'Menú inicial',
      url: site + 'menu.html',
      inLanguage: 'es-AR',
      hasMenuSection: activeCategories(catalog).map((c) => ({
        '@type': 'MenuSection',
        name: c.nombre,
        hasMenuItem: visibleProducts(catalog, c.id).map((p) => ({
          '@type': 'MenuItem',
          name: p.nombre,
          offers: p.variantes
            .filter((v) => v.estado === 'disponible' && v.precioEstado === 'confirmado')
            .map((v) => ({ '@type': 'Offer', name: v.presentacion, price: String(v.precio), priceCurrency: 'ARS' })),
        })),
      })),
    },
  };
  if (image) data.image = image;
  if (biz.whatsapp.estado === 'confirmado') data.telephone = '+' + biz.whatsapp.numero;
  if (biz.direccion.estado === 'confirmado') data.address = { '@type': 'PostalAddress', streetAddress: biz.direccion.texto, addressLocality: biz.direccion.localidad || undefined, addressCountry: 'AR' };
  if (biz.redes.length) data.sameAs = biz.redes.map((r) => r.url);
  // JSON dentro de <script>: se escapa "<" para que ningún texto pueda cerrar la etiqueta.
  return `<script type="application/ld+json">${JSON.stringify(data).replace(/</g, '\\u003c')}</script>`;
}
