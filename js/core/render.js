// Renderizado a HTML (texto escapado) desde la fuente canónica.
// Lo usan el build (prerender de index/menu) y la vista previa del editor local.
import { formatARS } from './money.js';
import { buildWhatsAppUrl, CONTACT_MESSAGES } from './whatsapp.js';

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
const activeCategories = (catalog) => catalog.categorias.filter((c) => c.estado === 'activa' && (visibleProducts(catalog, c.id).length || c.mensajeVacio));

function priceText(v) {
  return v.precioEstado === 'confirmado' && Number.isSafeInteger(v.precio) ? formatARS(v.precio) : 'Precio a confirmar';
}

function productState(p) {
  const vis = p.variantes.filter((v) => v.estado !== 'oculto');
  if (p.estado === 'agotado' || vis.every((v) => v.estado === 'agotado')) return 'agotado';
  if (vis.every((v) => v.precioEstado !== 'confirmado' || v.estado === 'agotado')) return 'pendiente';
  return 'disponible';
}

/** Imagen del producto (decorativa: el nombre está al lado). Foto subida > ilustración > genérica. */
function illustration(p, base, eager) {
  const lazy = eager ? '' : ' loading="lazy"';
  if (p.foto) {
    return `<div class="product__illus product__illus--foto"><img src="${base}${esc(p.foto)}" width="160" height="128" alt="" decoding="async"${lazy}></div>`;
  }
  const name = p.ilustracion || (p.categoria === 'bebidas' ? 'bebida' : '');
  if (!name) return '<div class="product__illus product__illus--vacia" aria-hidden="true"></div>';
  return `<div class="product__illus"><img src="${base}assets/ilustraciones/${esc(name)}.svg" width="160" height="128" alt="" decoding="async"${lazy}></div>`;
}

/**
 * Ficha de producto compacta para la carta.
 * Productos simples: un botón “Agregar” (la cantidad se ajusta en el pedido).
 * Con variantes: se elige la opción (con su precio visible) y después “Agregar”.
 */
export function renderProductCard(p, { base = '', eager = false } = {}) {
  const vis = p.variantes.filter((v) => v.estado !== 'oculto');
  const state = productState(p);
  const def = vis.find((v) => v.estado === 'disponible' && v.precioEstado === 'confirmado') || vis[0];
  const nameId = `n-${p.id}`;
  let options;
  if (vis.length > 1) {
    options = `<fieldset class="choice"><legend class="visually-hidden">Opciones de ${esc(p.nombre.toLowerCase())}</legend><div class="choice__opts">`
      + vis.map((v) => {
        const disabled = v.estado === 'agotado' || v.precioEstado !== 'confirmado';
        return `<label class="choice__opt"><input type="radio" name="variant" value="${esc(v.id)}"${v === def ? ' checked' : ''}${disabled ? ' disabled' : ''}>`
          + `<span class="choice__label">${esc(v.presentacion)}${v.unidades > 1 ? ` <span class="choice__units">(${v.unidades} u.)</span>` : ''}</span>`
          + `<span class="choice__meta">${esc(v.estado === 'agotado' ? 'Agotado' : priceText(v))}</span></label>`;
      }).join('')
      + `</div></fieldset>`;
  } else {
    const pres = def.presentacion !== 'Unidad' ? `<p class="product__presentation">${esc(def.presentacion)}${def.unidades > 1 ? ` · ${def.unidades} unidades` : ''}</p>` : '';
    options = pres + `<input type="hidden" name="variant" value="${esc(def.id)}">`;
  }

  const status = state === 'agotado' ? '<p class="tag tag--muted">Agotado</p>'
    : state === 'pendiente' ? '<p class="tag tag--muted">Precio a confirmar</p>' : '';

  const buy = state === 'disponible'
    ? `<div class="product__buy js-only">`
      + `<button type="submit" class="btn btn--primary product__add">${icon('plus')}<span>Agregar</span><span class="visually-hidden"> ${esc(p.nombre.toLowerCase())}</span></button>`
      + `<p class="product__incart" data-in-cart hidden></p>`
      + `</div>`
    : '';

  return `<article class="product" id="p-${esc(p.id)}" data-product="${esc(p.id)}" data-state="${state}" aria-labelledby="${nameId}">`
    + `<div class="product__top">`
    + illustration(p, base, eager)
    + `<div class="product__info">`
    + `<h3 class="product__name" id="${nameId}">${esc(p.nombre)}</h3>`
    + (p.descripcion ? `<p class="product__desc">${esc(p.descripcion)}</p>` : '')
    + status
    + `<p class="product__price"><span class="visually-hidden">Precio: </span><span data-price>${esc(priceText(def))}</span></p>`
    + `</div></div>`
    + `<form class="product__form" data-product-form novalidate>`
    + options
    + buy
    + `</form></article>`;
}

/** Carta completa: una sección por categoría activa, en orden. */
export function renderMenu(catalog, { base = '' } = {}) {
  return activeCategories(catalog).map((c, ci) => {
    const items = visibleProducts(catalog, c.id);
    return `<section class="menu-cat" id="${esc(c.id)}" aria-labelledby="h-${esc(c.id)}">`
      + `<header class="menu-cat__head"><h2 class="menu-cat__title" id="h-${esc(c.id)}">${esc(c.nombre)}</h2>`
      + (c.descripcion ? `<p class="menu-cat__desc">${esc(c.descripcion)}</p>` : '')
      + `</header>`
      + (items.length
        ? `<div class="menu-grid">${items.map((p) => renderProductCard(p, { base, eager: ci === 0 })).join('')}</div>`
        : `<div class="menu-empty"><img src="${base}assets/ilustraciones/${c.id === 'bebidas' ? 'bebida' : 'hamburguesa'}.svg" width="160" height="128" alt="" loading="lazy" decoding="async"><p class="menu-empty__text">${esc(c.mensajeVacio)}</p></div>`)
      + `</section>`;
  }).join('\n');
}

/** Enlaces de categorías (navegación por anclas, no pestañas). */
export function renderCategoryNav(catalog) {
  return `<ul class="catnav__list" role="list" data-catnav-list>` + activeCategories(catalog)
    .map((c) => `<li><a class="catnav__link" href="#${esc(c.id)}">${esc(c.nombre)}</a></li>`).join('') + `</ul>`;
}

const PENDING = '<span class="pending">A confirmar</span>';

function waDisplay(numero) {
  // 5493757626892 -> +54 9 3757 626892
  return '+' + numero.replace(/^(\d{2})(\d)(\d{4})(\d+)$/, '$1 $2 $3 $4');
}

const ext = (label) => `<span class="visually-hidden"> (${label})</span>`;

/** Botón de WhatsApp con el logo oficial y un mensaje ya escrito. */
export function waButton(biz, text, label, cls = '') {
  const url = buildWhatsAppUrl(biz, text);
  if (!url) return PENDING;
  return `<a class="btn-wa${cls ? ' ' + cls : ''}" href="${esc(url)}" target="_blank" rel="noopener noreferrer">`
    + `<svg class="icon icon--logo" aria-hidden="true" focusable="false"><use href="#i-logo-whatsapp"></use></svg>`
    + `<span>${esc(label)}</span>${ext('se abre WhatsApp')}</a>`;
}

/** Barrios con su costo de envío. */
export function renderZones(biz) {
  const env = biz.modalidades.envio;
  if (env.estado !== 'confirmado' || !env.zonas.length) return '';
  const fee = (z) => (z.tarifaEstado === 'confirmada' ? (z.tarifa === 0 ? 'Sin cargo' : formatARS(z.tarifa)) : 'A cotizar');
  return `<section class="zones" aria-labelledby="zones-title">`
    + `<div class="zones__head"><h3 class="zones__title" id="zones-title">Envío a domicilio</h3><p class="zones__sub">Costo según tu barrio. También podés retirar en el local.</p></div>`
    + `<ul class="zones__list" role="list">`
    + env.zonas.map((z) => `<li class="zones__item"><span class="zones__name">${esc(z.nombre)}</span><span class="zones__fee">${esc(fee(z))}</span></li>`).join('')
    + `</ul></section>`;
}

/** Datos del local (sección #location). */
export function renderBusinessInfo(biz) {
  const rows = [];
  const dir = biz.direccion;
  const mapsLogo = '<svg class="icon icon--logo" aria-hidden="true" focusable="false"><use href="#i-logo-maps"></use></svg>';
  rows.push([mapsLogo, 'Dirección', dir.estado === 'confirmado'
    ? `<span>${esc(dir.texto)}${dir.localidad ? `<br>${esc(dir.localidad)}` : ''}</span>`
      + (dir.mapaUrl ? `<a class="btn-maps" href="${esc(dir.mapaUrl)}" target="_blank" rel="noopener noreferrer">${mapsLogo}<span>Cómo llegar</span>${ext('se abre Google Maps')}</a>` : '')
    : PENDING]);
  const h = biz.horarios;
  rows.push([icon('clock'), 'Horarios', h.estado === 'confirmado'
    ? `<ul class="plain" role="list">${h.lista.map((r) => `<li>${esc(r.dias)}: <strong>${esc(r.horario)}</strong></li>`).join('')}</ul>`
    : PENDING]);
  const wa = biz.whatsapp;
  const waLogo = '<svg class="icon icon--logo icon--wa" aria-hidden="true" focusable="false"><use href="#i-logo-whatsapp"></use></svg>';
  rows.push([waLogo, 'WhatsApp', wa.estado === 'confirmado'
    ? `<span>${esc(waDisplay(wa.numero))}</span>${waButton(biz, CONTACT_MESSAGES.consulta, 'Escribinos')}`
    : PENDING]);
  const m = biz.modalidades;
  const modes = [];
  if (m.retiro.estado === 'confirmado') modes.push('Retiro en el local');
  if (m.envio.estado === 'confirmado') modes.push('Envío a domicilio');
  rows.push([icon('bag'), 'Retiro y envío', modes.length ? esc(modes.join(' · ')) : PENDING]);
  const pay = biz.mediosDePago;
  rows.push([icon('card'), 'Medios de pago', pay.estado === 'confirmado' && pay.lista.length ? esc(pay.lista.join(' · '))
    : wa.estado === 'confirmado' ? `<span>Te los contamos por WhatsApp.</span>${waButton(biz, CONTACT_MESSAGES.pagos, 'Consultar')}` : PENDING]);
  return `<dl class="info-list">` + rows.map(([ic, k, v]) => `<div class="info-list__row">${ic}<dt>${k}</dt><dd>${v}</dd></div>`).join('') + `</dl>`
    + renderZones(biz);
}

export function hasPendingInfo(biz) {
  return [biz.direccion, biz.horarios, biz.whatsapp].some((x) => x.estado !== 'confirmado')
    || biz.modalidades.retiro.estado !== 'confirmado' && biz.modalidades.envio.estado !== 'confirmado';
}

/** Bloque de contacto del pie. */
export function renderFooterContact(biz) {
  const items = [];
  if (biz.direccion.estado === 'confirmado') items.push(`<li>${esc(biz.direccion.texto)}${biz.direccion.localidad ? `, ${esc(biz.direccion.localidad)}` : ''}</li>`);
  if (biz.horarios.estado === 'confirmado') items.push(...biz.horarios.lista.map((r) => `<li>${esc(r.dias)}: ${esc(r.horario)}</li>`));
  for (const r of biz.redes) items.push(`<li><a href="${esc(r.url)}" target="_blank" rel="noopener noreferrer">${esc(r.nombre)}</a></li>`);
  if (!items.length) items.push('<li>Dirección, horarios y contacto: a confirmar.</li>');
  const wa = biz.whatsapp.estado === 'confirmado' ? `<p class="footer__wa">${waButton(biz, CONTACT_MESSAGES.consulta, 'Escribinos por WhatsApp')}</p>` : '';
  return `<ul class="plain footer__list" role="list">${items.join('')}</ul>${wa}`;
}

/** Datos estructurados: solo campos confirmados y presentes en la página. */
export function renderJsonLd(catalog, biz, { image } = {}) {
  const site = biz.sitio.url;
  const data = {
    '@context': 'https://schema.org',
    '@type': 'Restaurant',
    name: biz.nombre,
    url: site,
    slogan: biz.lema,
    currenciesAccepted: 'ARS',
    hasMenu: {
      '@type': 'Menu',
      name: 'Menú',
      url: site + '#carta',
      inLanguage: 'es-AR',
      hasMenuSection: activeCategories(catalog).filter((c) => visibleProducts(catalog, c.id).length).map((c) => ({
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
