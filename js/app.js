// El Buen Sabor · interacción del sitio.
// La carta y los precios ya están en el HTML (prerender). Este módulo agrega el pedido.
// Los datos salen de js/data/datos.js (generado desde data/*.json), nunca del texto de la página.
import {
  emptyCart, addItem, setQty, removeItem, computeTotals, availableModes,
  findVariant, countPacks, reconcile, MAX_QTY,
} from './core/cart.js';
import { formatARS } from './core/money.js';
import { buildOrderMessage, buildWhatsAppUrl, validateCheckout } from './core/whatsapp.js';
import { getStorage, loadCart, saveCart, clearSavedCart, CART_KEY } from './core/storage.js';

// Datos versionados: la página indica qué versión de js/data/datos.js le corresponde (la escribe el build).
const DATA_VERSION = document.querySelector('meta[name="ebs-datos"]')?.content || '';
const { CATALOGO, NEGOCIO } = await import(`./data/datos.js${DATA_VERSION ? `?v=${encodeURIComponent(DATA_VERSION)}` : ''}`);

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

/** Aísla cada componente: un error en uno no apaga los demás. */
function safely(name, fn) {
  try { fn(); } catch (err) { console.error(`[El Buen Sabor] ${name}:`, err); }
}

function svgIcon(id) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', 'icon');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
  use.setAttribute('href', `#i-${id}`);
  svg.append(use);
  return svg;
}

function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === 'class') node.className = v;
    else if (k === 'text') node.textContent = v;
    else if (k.startsWith('aria-') || k.startsWith('data-')) node.setAttribute(k, v);
    else node[k] = v;
  }
  for (const c of children) if (c) node.append(c);
  return node;
}

/* ---------------- Estado ---------------- */
const storage = getStorage();
const modes = availableModes(NEGOCIO);
const state = {
  cart: emptyCart(),
  fulfillment: { mode: modes.length === 1 ? modes[0] : null, zoneId: null },
  customer: { name: '', reference: '', notes: '' }, // solo en memoria
  notices: [],
  persistOk: Boolean(storage),
  showErrors: false,
  lastCleared: null,
};

/* ---------------- Anuncios accesibles ---------------- */
let announceTimer;
function announce(message) {
  const live = $('[data-announcer]');
  if (!live) return;
  live.textContent = '';
  clearTimeout(announceTimer);
  announceTimer = setTimeout(() => { live.textContent = message; }, 60);
}

/* ---------------- Persistencia ---------------- */
function restore() {
  const { data, problem } = loadCart(storage);
  if (problem === 'corrupto' || problem === 'formato') {
    state.notices.push({ type: 'info', text: 'No pudimos recuperar un pedido anterior guardado en este navegador. Empezá uno nuevo.' });
    clearSavedCart(storage);
  }
  if (!data) return;
  const { cart, notices } = reconcile(data, CATALOGO);
  state.cart = cart;
  state.notices.push(...notices);
  if (modes.includes(data.mode)) state.fulfillment.mode = data.mode;
  if (data.zoneId && NEGOCIO.modalidades.envio.zonas.some((z) => z.id === data.zoneId)) state.fulfillment.zoneId = data.zoneId;
  // Solo se reescribe si la reconciliación cambió algo (evita escrituras en cadena entre pestañas).
  if (notices.length || cart.lines.length !== data.lines.length) persist();
}

function persist() {
  if (!storage) return;
  state.persistOk = saveCart(storage, state.cart, CATALOGO, state.fulfillment);
}

/* ---------------- Totales y mensaje ---------------- */
function totals() {
  return computeTotals(state.cart, CATALOGO, NEGOCIO, state.fulfillment);
}

function message(t = totals()) {
  return buildOrderMessage(t, state.customer, NEGOCIO);
}

function packsLabel(n) {
  return n === 1 ? '1 producto' : `${n} productos`;
}

/* ---------------- Contador y barra inferior ---------------- */
function renderSummary() {
  const t = totals();
  const n = t.packs;
  for (const c of $$('[data-cart-count]')) {
    c.textContent = String(n);
    c.toggleAttribute('data-empty', n === 0);
  }
  for (const l of $$('[data-cart-count-label]')) l.textContent = n ? `, ${packsLabel(n)}` : ', vacío';
  const bar = $('[data-order-bar]');
  if (bar) {
    bar.hidden = n === 0;
    document.body.classList.toggle('has-order-bar', n > 0);
    const sum = $('[data-cart-bar-summary]');
    if (sum) sum.textContent = `${packsLabel(n)} · ${formatARS(t.subtotal)}`;
  }
  // Cuánto de cada producto ya está en el pedido (todas sus opciones).
  const byProduct = new Map();
  for (const l of state.cart.lines) byProduct.set(l.productId, (byProduct.get(l.productId) || 0) + l.qty);
  for (const card of $$('[data-product]')) {
    const out = $('[data-in-cart]', card);
    if (!out) continue;
    const q = byProduct.get(card.dataset.product) || 0;
    out.hidden = q === 0;
    out.textContent = q ? `En tu pedido: ${q}` : '';
  }
}

/* ---------------- Fichas de producto ---------------- */
function initProductCards() {
  for (const form of $$('[data-product-form]')) {
    safely('ficha', () => wireProduct(form));
  }
}

function wireProduct(form) {
  const card = form.closest('[data-product]');
  const productId = card.dataset.product;
  const priceEl = $('[data-price]', card);
  const addBtn = $('.product__add', form);
  if (!addBtn) return;
  const label = $('span', addBtn);

  const selectedVariantId = () => {
    const checked = $('input[name="variant"]:checked', form) || $('input[name="variant"][type="hidden"]', form);
    return checked ? checked.value : null;
  };

  // El precio grande siempre es el de la opción elegida.
  function update() {
    const found = findVariant(CATALOGO, productId, selectedVariantId());
    if (!found) return;
    const { variant } = found;
    const ok = variant.precioEstado === 'confirmado' && variant.estado === 'disponible';
    priceEl.textContent = ok ? formatARS(variant.precio) : 'Precio a confirmar';
    addBtn.disabled = !ok;
  }

  form.addEventListener('change', update);
  let resetTimer;
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const variantId = selectedVariantId();
    const res = addItem(state.cart, CATALOGO, productId, variantId, 1);
    if (res.error && !res.added) {
      const why = res.error === 'maximo' ? `Llegaste al máximo de ${MAX_QTY} por opción.`
        : res.error === 'agotado' ? 'Esta opción está agotada.'
        : 'No se pudo agregar esta opción.';
      announce(why);
      const out = $('[data-in-cart]', card);
      out.hidden = false;
      out.textContent = why;
      return;
    }
    state.cart = res.cart;
    state.lastCleared = null;
    persist();
    renderAll();
    const { product, variant } = findVariant(CATALOGO, productId, variantId);
    const opt = product.variantes.length > 1 ? `, ${variant.presentacion.toLowerCase()}` : '';
    announce(`Agregaste ${product.nombre}${opt}. Tu pedido tiene ${packsLabel(countPacks(state.cart))}.`);
    label.textContent = 'Agregado';
    addBtn.classList.add('is-done');
    clearTimeout(resetTimer);
    resetTimer = setTimeout(() => { label.textContent = 'Agregar'; addBtn.classList.remove('is-done'); }, 1200);
  });
  update();
}

/* ---------------- Diálogo del pedido ---------------- */
const dialog = () => $('[data-cart]');
let lastTrigger = null;

function openCart(trigger) {
  const d = dialog();
  if (!d || d.open) return;
  lastTrigger = trigger || null;
  renderCart();
  if (typeof d.showModal === 'function') d.showModal();
  else d.setAttribute('open', '');
  document.body.classList.add('is-locked');
  const title = $('#cart-title');
  if (title) title.focus();
}

function closeCart() {
  const d = dialog();
  if (!d || !d.open) return;
  if (typeof d.close === 'function') d.close();
  else { d.removeAttribute('open'); onClosed(); }
}

function onClosed() {
  document.body.classList.remove('is-locked');
  const target = lastTrigger && document.contains(lastTrigger) && lastTrigger.offsetParent !== null
    ? lastTrigger
    : $('.order-btn');
  if (target) target.focus();
  lastTrigger = null;
}

function initDialog() {
  const d = dialog();
  if (!d) return;
  document.addEventListener('click', (e) => {
    const opener = e.target.closest('[data-open-cart]');
    if (opener) { e.preventDefault(); openCart(opener); }
  });
  d.addEventListener('close', onClosed);
  d.addEventListener('click', (e) => {
    if (e.target === d) closeCart(); // clic en el fondo
    if (e.target.closest('[data-close-cart]')) closeCart();
    if (e.target.closest('[data-go-menu]')) closeCart();
  });

  const lines = $('[data-cart-lines]', d);
  lines.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-action]');
    if (!btn) return;
    const li = btn.closest('[data-variant]');
    const { product: productId, variant: variantId } = li.dataset;
    const current = state.cart.lines.find((l) => l.productId === productId && l.variantId === variantId);
    if (!current) return;
    const name = li.dataset.label;
    if (btn.dataset.action === 'remove') {
      state.cart = removeItem(state.cart, productId, variantId);
      announce(`Quitaste ${name}.`);
    } else {
      const next = current.qty + (btn.dataset.action === 'inc' ? 1 : -1);
      if (next < 1 || next > MAX_QTY) return;
      state.cart = setQty(state.cart, productId, variantId, next);
      announce(`${name}: cantidad ${next}.`);
    }
    persist();
    renderAll();
    // Mantener el foco en un lugar estable.
    const again = $(`[data-variant="${CSS.escape(variantId)}"] [data-action="${btn.dataset.action}"]`, d);
    if (again && !again.disabled) again.focus();
    else if (again) $(`[data-variant="${CSS.escape(variantId)}"] [data-action="remove"]`, d)?.focus();
    else $('#cart-title').focus();
  });

  $('[data-clear-cart]', d).addEventListener('click', () => {
    state.lastCleared = state.cart;
    state.cart = emptyCart();
    persist();
    renderAll();
    announce('Vaciaste el pedido. Podés deshacerlo.');
    $('[data-undo-clear]', d)?.focus();
  });

  $('[data-cart-notices]', d).addEventListener('click', (e) => {
    if (e.target.closest('[data-undo-clear]') && state.lastCleared) {
      state.cart = state.lastCleared;
      state.lastCleared = null;
      persist();
      renderAll();
      announce('Recuperaste tu pedido.');
      $('#cart-title').focus();
    }
    const dismiss = e.target.closest('[data-dismiss]');
    if (dismiss) {
      state.notices.splice(Number(dismiss.dataset.dismiss), 1);
      renderCart();
      $('#cart-title').focus();
    }
  });

  const form = $('[data-checkout]', d);
  form.addEventListener('input', (e) => {
    const t = e.target;
    if (t.name in state.customer) state.customer[t.name] = t.value;
    if (t.name === 'zone') state.fulfillment.zoneId = t.value || null;
    if (t.name === 'mode') state.fulfillment.mode = t.value;
    if (t.name === 'zone' || t.name === 'mode') persist();
    renderCart({ keepForm: true });
  });
  form.addEventListener('submit', (e) => e.preventDefault());

  $('[data-whatsapp]', d).addEventListener('click', (e) => {
    const t = totals();
    const errors = validateCheckout(t, state.customer, modes);
    if (Object.keys(errors).length) {
      e.preventDefault();
      state.showErrors = true;
      renderCart({ keepForm: true });
      const first = $('[aria-invalid="true"]', d);
      if (first) first.focus();
      announce('Revisá los datos marcados antes de continuar.');
      return;
    }
    // El enlace ya tiene el mensaje actualizado; se abre en otra pestaña.
    announce('Abrimos WhatsApp con tu pedido. El Buen Sabor te confirma disponibilidad, entrega y total.');
  });

  $('[data-copy]', d).addEventListener('click', async (e) => {
    const text = message();
    const btn = e.currentTarget;
    let ok = false;
    try {
      await navigator.clipboard.writeText(text);
      ok = true;
    } catch { /* sin permiso: se muestra el texto para copiar a mano */ }
    if (!ok) {
      const det = $('.preview', d);
      if (det) det.open = true;
      const pre = $('[data-message-preview]', d);
      const range = document.createRange();
      range.selectNodeContents(pre);
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
    }
    announce(ok ? 'Copiamos el resumen del pedido.' : 'Seleccionamos el resumen: copialo con el menú del navegador.');
    const label = btn.lastChild.textContent;
    btn.lastChild.textContent = ok ? 'Resumen copiado' : 'Resumen seleccionado';
    setTimeout(() => { btn.lastChild.textContent = label; }, 1800);
  });
}

function renderNotices(d) {
  const box = $('[data-cart-notices]', d);
  box.replaceChildren();
  state.notices.forEach((n, i) => {
    const btn = el('button', { type: 'button', class: 'link-btn', text: 'Entendido', 'data-dismiss': String(i) });
    box.append(el('div', { class: 'cart__notice', role: 'note' }, svgIcon('info'), el('p', { text: n.text }), btn));
  });
  if (state.lastCleared) {
    const undo = el('button', { type: 'button', class: 'link-btn', text: 'Deshacer', 'data-undo-clear': '' });
    box.append(el('div', { class: 'cart__notice', role: 'note' }, svgIcon('info'), el('p', { text: 'Vaciaste el pedido.' }), undo));
  }
  if (!state.persistOk) {
    box.append(el('div', { class: 'cart__notice', role: 'note' }, svgIcon('info'),
      el('p', { text: 'Este navegador no permite guardar el pedido. Si recargás o cambiás de página, se pierde.' })));
  }
}

function renderLines(d, t) {
  const list = $('[data-cart-lines]', d);
  list.replaceChildren();
  for (const l of t.lines) {
    const label = `${l.name}, ${l.presentation.toLowerCase()}`;
    const meta = [l.presentation];
    if (l.unitPrice !== null) meta.push(`${l.qty} × ${formatARS(l.unitPrice)}`);
    if (l.unitsPerPack > 1) meta.push(`${l.units} unidades`);
    const qty = el('div', { class: 'qty qty--sm', role: 'group', 'aria-label': `Cantidad de ${label}` },
      el('button', { type: 'button', class: 'qty__btn', 'data-action': 'dec', 'aria-label': `Restar uno de ${label}`, disabled: l.qty <= 1 }, svgIcon('minus')),
      el('span', { class: 'qty__value', text: String(l.qty), 'aria-label': `Cantidad: ${l.qty}` }),
      el('button', { type: 'button', class: 'qty__btn', 'data-action': 'inc', 'aria-label': `Sumar uno de ${label}`, disabled: l.qty >= MAX_QTY }, svgIcon('plus')));
    const remove = el('button', { type: 'button', class: 'link-btn', 'data-action': 'remove', 'aria-label': `Quitar ${label}` }, svgIcon('trash'), document.createTextNode('Quitar'));
    const li = el('li', { class: 'line', 'data-product': l.productId, 'data-variant': l.variantId, 'data-label': label },
      el('p', { class: 'line__name', text: l.name }),
      el('p', { class: 'line__total', text: l.lineTotal !== null ? formatARS(l.lineTotal) : 'A confirmar' }),
      el('p', { class: 'line__meta', text: meta.join(' · ') }),
      el('div', { class: 'line__controls' }, qty, remove));
    list.append(li);
  }
}

function zoneFee(z) {
  return z.tarifaEstado === 'confirmada' ? (z.tarifa === 0 ? 'Sin cargo' : formatARS(z.tarifa)) : 'A cotizar';
}

function renderCheckout(d, t, keepForm) {
  const box = $('[data-mode-options]', d);
  const zones = NEGOCIO.modalidades.envio.zonas;
  if (!keepForm) {
    box.replaceChildren();
    if (!modes.length) {
      box.append(el('p', { class: 'muted', text: 'Retiro y envío se coordinan con el negocio por WhatsApp.' }));
    } else {
      const wrap = el('div', { class: 'mode-opts' });
      const fees = zones.filter((z) => z.tarifaEstado === 'confirmada').map((z) => z.tarifa);
      const from = fees.length ? `Según tu barrio, desde ${formatARS(Math.min(...fees))}` : 'Según tu barrio';
      for (const m of modes) {
        const input = el('input', { type: 'radio', name: 'mode', value: m, checked: state.fulfillment.mode === m });
        input.setAttribute('aria-describedby', 'err-mode');
        wrap.append(el('label', { class: 'choice__opt' }, input,
          el('span', { class: 'choice__label', text: m === 'retiro' ? 'Retiro en el local' : 'Envío a domicilio' }),
          el('span', { class: 'choice__meta', text: m === 'retiro' ? 'Sin costo de envío' : from })));
      }
      box.append(wrap);
    }
    // Barrios: tarjetas propias (no el desplegable del sistema).
    const list = $('[data-zone-options]', d);
    list.replaceChildren(...zones.map((z) => {
      const input = el('input', { type: 'radio', name: 'zone', value: z.id, checked: state.fulfillment.zoneId === z.id, class: 'zone-opt__input' });
      return el('label', { class: 'zone-opt' }, input,
        el('span', { class: 'zone-opt__name', text: z.nombre }),
        el('span', { class: 'zone-opt__fee', text: zoneFee(z) }));
    }));
    for (const [k, v] of Object.entries(state.customer)) {
      const input = $(`[name="${k}"]`, d);
      if (input && input.value !== v) input.value = v;
    }
  }
  $('[data-delivery-fields]', d).hidden = t.mode !== 'envio';

  const errors = state.showErrors ? validateCheckout(t, state.customer, modes) : {};
  for (const key of ['name', 'mode', 'zone', 'reference']) {
    const msg = $(`[data-error="${key}"]`, d);
    msg.hidden = !errors[key];
    msg.textContent = errors[key] || '';
    for (const field of $$(`[name="${key}"]`, d)) field.setAttribute('aria-invalid', errors[key] ? 'true' : 'false');
  }
}

function renderTotals(d, t) {
  $('[data-subtotal]', d).textContent = formatARS(t.subtotal);
  const s = t.shipping;
  let ship;
  let hint = '';
  if (s.status === 'no-aplica') ship = 'Sin envío (retiro)';
  else if (s.status === 'confirmado') ship = s.amount === 0 ? 'Sin cargo' : formatARS(s.amount);
  else if (s.status === 'pendiente') { ship = 'A confirmar'; hint = 'El costo de envío a tu zona se confirma por WhatsApp.'; }
  else if (modes.length) { ship = 'Elegí la entrega'; hint = 'Elegí retiro o envío para ver el total.'; }
  else { ship = 'A coordinar'; hint = 'Entrega y total final se confirman con el negocio.'; }
  $('[data-shipping]', d).textContent = ship;
  $('[data-total]', d).textContent = t.total !== null ? formatARS(t.total) : 'A confirmar';

  const msg = message(t);
  $('[data-message-preview]', d).textContent = msg;
  const url = buildWhatsAppUrl(NEGOCIO, msg);
  const link = $('[data-whatsapp]', d);
  const pending = $('[data-whatsapp-pending]', d);
  link.hidden = !url;
  pending.hidden = Boolean(url);
  if (url) link.href = url;
  else link.removeAttribute('href');
  if (!url) hint = (hint ? hint + ' ' : '') + 'WhatsApp todavía no está confirmado: podés copiar el resumen.';
  $('[data-cart-hint]', d).textContent = hint;
}

function renderCart({ keepForm = false } = {}) {
  const d = dialog();
  if (!d) return;
  const t = totals();
  const has = t.lines.length > 0;
  renderNotices(d);
  $('[data-cart-empty]', d).hidden = has;
  $('[data-cart-filled]', d).hidden = !has;
  $('[data-cart-foot]', d).hidden = !has;
  if (!has) return;
  if (!keepForm) renderLines(d, t);
  renderCheckout(d, t, keepForm);
  renderTotals(d, t);
}

function renderAll() {
  renderSummary();
  renderCart();
}

/**
 * Teclado del celular: el panel del pedido se ajusta al área visible (visualViewport)
 * y, mientras se escribe, se oculta el pie con totales para que no tape el campo.
 */
function initKeyboardFit() {
  const d = dialog();
  if (!d) return;
  const vv = window.visualViewport;
  const touch = matchMedia('(pointer: coarse)');
  const isText = (n) => Boolean(n && n.matches && n.matches('input:not([type]), input[type="text"], textarea'));

  // Solo sobre el panel y solo mientras está abierto: no recalcula estilos del resto de la página.
  let last = '';
  function sync() {
    if (!d.open) return;
    const next = `${Math.round(vv.height)}|${Math.round(vv.offsetTop)}`;
    if (next === last) return;
    last = next;
    d.style.setProperty('--vv-h', `${Math.round(vv.height)}px`);
    d.style.setProperty('--vv-top', `${Math.round(vv.offsetTop)}px`);
  }
  if (vv) {
    vv.addEventListener('resize', sync, { passive: true });
    vv.addEventListener('scroll', sync, { passive: true });
    new MutationObserver(() => { last = ''; sync(); }).observe(d, { attributes: true, attributeFilter: ['open'] });
  }

  d.addEventListener('focusin', (e) => {
    if (!touch.matches || !isText(e.target)) return;
    d.classList.add('is-typing');
    // Esperar a que aparezca el teclado y dejar el campo en el centro del área visible.
    setTimeout(() => e.target.scrollIntoView({ block: 'center' }), 300);
  });
  d.addEventListener('focusout', () => {
    setTimeout(() => { if (!isText(document.activeElement)) d.classList.remove('is-typing'); }, 0);
  });
  d.addEventListener('close', () => d.classList.remove('is-typing'));
}

/** Portada: si hay varias fotos reales, rotan suavemente (no con “reducir movimiento” ni con la pestaña oculta). */
function initHeroSlides() {
  const box = $('[data-hero-slides]');
  if (!box) return;
  const slides = $$('.hero__slide', box);
  if (slides.length < 2 || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  let i = 0;
  setInterval(() => {
    if (document.hidden) return;
    slides[i].classList.remove('is-active');
    i = (i + 1) % slides.length;
    slides[i].loading = 'eager';
    slides[i].classList.add('is-active');
  }, 6000);
}

/* ---------------- Navegación ---------------- */
function initNav() {
  const toggle = $('.site-nav__toggle');
  const list = $('#nav-list');
  if (!toggle || !list) return;
  const set = (open, focusToggle = false) => {
    list.classList.toggle('is-open', open);
    toggle.setAttribute('aria-expanded', String(open));
    $('.visually-hidden', toggle).textContent = open ? 'Cerrar navegación' : 'Abrir navegación';
    if (focusToggle) toggle.focus();
  };
  toggle.addEventListener('click', () => set(toggle.getAttribute('aria-expanded') !== 'true'));
  list.addEventListener('click', (e) => { if (e.target.closest('a')) set(false); });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && list.classList.contains('is-open')) set(false, true);
  });
  document.addEventListener('click', (e) => {
    if (list.classList.contains('is-open') && !e.target.closest('.site-nav')) set(false);
  });
  matchMedia('(min-width: 52.5625rem)').addEventListener('change', (e) => { if (e.matches) set(false); });
}

/**
 * Barra de categorías: navegación por anclas (no pestañas).
 * - Marca la categoría visible con aria-current="location" al tocar o al desplazarse.
 * - Mantiene la categoría activa dentro de la fila visible.
 * - Si la fila desborda, muestra degradés y flechas accesibles.
 */
function initCatnav() {
  const nav = $('[data-catnav]');
  const scroller = $('[data-catnav-scroller]');
  if (!nav || !scroller) return;
  const links = $$('.catnav__link', nav);
  const sections = links.map((a) => document.getElementById(a.hash.slice(1))).filter(Boolean);
  const prev = $('[data-catnav-prev]', nav);
  const next = $('[data-catnav-next]', nav);
  const reduce = matchMedia('(prefers-reduced-motion: reduce)');
  const behavior = () => (reduce.matches ? 'auto' : 'smooth');
  let lockUntil = 0;
  let current = null;

  function keepVisible(link) {
    const s = scroller.getBoundingClientRect();
    const r = link.getBoundingClientRect();
    const pad = 48; // espacio para las flechas y el degradé
    if (r.left < s.left + pad || r.right > s.right - pad) {
      scroller.scrollTo({ left: scroller.scrollLeft + (r.left - s.left) - pad, behavior: behavior() });
    }
  }

  function setActive(link) {
    if (link === current) return;
    current = link;
    for (const a of links) {
      if (a === link) a.setAttribute('aria-current', 'location');
      else a.removeAttribute('aria-current');
    }
    if (link) keepVisible(link);
  }

  function spy() {
    if (Date.now() < lockUntil) return;
    const offset = nav.getBoundingClientRect().bottom + 24;
    let active = null;
    for (let i = 0; i < sections.length; i++) {
      if (sections[i].getBoundingClientRect().top <= offset) active = links[i];
    }
    // Al final de la carta, si la última categoría es corta, igual queda marcada.
    const last = sections[sections.length - 1];
    if (last && last.getBoundingClientRect().bottom < offset) active = null;
    setActive(active);
  }

  function updateArrows() {
    const max = scroller.scrollWidth - scroller.clientWidth;
    const hasPrev = scroller.scrollLeft > 4;
    const hasNext = scroller.scrollLeft < max - 4;
    prev.hidden = !hasPrev;
    next.hidden = !hasNext;
    nav.toggleAttribute('data-more-left', hasPrev);
    nav.toggleAttribute('data-more-right', hasNext);
  }

  let ticking = false;
  window.addEventListener('scroll', () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => { ticking = false; spy(); });
  }, { passive: true });
  scroller.addEventListener('scroll', updateArrows, { passive: true });
  window.addEventListener('resize', updateArrows);
  prev.addEventListener('click', () => scroller.scrollBy({ left: -scroller.clientWidth * 0.7, behavior: behavior() }));
  next.addEventListener('click', () => scroller.scrollBy({ left: scroller.clientWidth * 0.7, behavior: behavior() }));

  nav.addEventListener('click', (e) => {
    const link = e.target.closest('.catnav__link');
    if (!link) return;
    // Marcar enseguida; el desplazamiento suave no debe “saltar” a la categoría anterior.
    setActive(link);
    lockUntil = Date.now() + 900;
  });
  window.addEventListener('scrollend', () => { lockUntil = 0; spy(); });

  updateArrows();
  spy();
}

/** Si la URL trae un ancla que ya no existe (enlaces viejos), se lleva a la carta. */
function fixUnknownHash() {
  const id = decodeURIComponent(location.hash.slice(1));
  if (!id || id === 'pedido' || document.getElementById(id)) return;
  history.replaceState(null, '', '#carta');
  document.getElementById('carta')?.scrollIntoView();
}

/* ---------------- Inicio ---------------- */
function init() {
  safely('restaurar', restore);
  safely('navegación', initNav);
  safely('ancla', fixUnknownHash);
  safely('categorías', initCatnav);
  safely('fichas', initProductCards);
  safely('diálogo', initDialog);
  safely('teclado', initKeyboardFit);
  safely('portada', initHeroSlides);
  safely('resumen', renderAll);
  if (state.notices.length) {
    safely('avisos', () => announce('Revisamos tu pedido guardado: hay cambios. Abrí el pedido para verlos.'));
  }
  if (location.hash === '#pedido') safely('abrir pedido', () => openCart(null));
  // Sincroniza el pedido entre pestañas del mismo sitio.
  window.addEventListener('storage', (e) => {
    if (e.key !== CART_KEY) return;
    safely('sincronizar', () => {
      state.cart = emptyCart();
      state.notices = [];
      restore();
      renderAll();
    });
  });
}

init();
