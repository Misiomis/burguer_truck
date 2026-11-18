// El Buen Sabor · interacción del sitio.
// La carta y los precios ya están en el HTML (prerender). Este módulo agrega el pedido.
// Los datos salen de js/data/datos.js (generado desde data/*.json), nunca del texto de la página.
import {
  emptyCart, addItem, setQty, removeItem, computeTotals, availableModes,
  findVariant, normalizeQty, countPacks, reconcile, MAX_QTY,
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
  customer: { name: '', address: '', reference: '', notes: '' }, // solo en memoria
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
  const qtyInput = $('.qty__input', form);
  const priceEl = $('[data-price]', form);
  const lineEl = $('[data-line]', form);
  const addBtn = $('.product__add', form);
  if (!qtyInput || !addBtn) return;

  const selectedVariantId = () => {
    const checked = $('input[name="variant"]:checked', form) || $('input[name="variant"][type="hidden"]', form);
    return checked ? checked.value : null;
  };
  const currentQty = () => normalizeQty(qtyInput.value) || 1;

  function update() {
    const found = findVariant(CATALOGO, productId, selectedVariantId());
    const q = currentQty();
    qtyInput.value = String(q);
    $$('[data-qty]', form).forEach((b) => {
      const step = Number(b.dataset.qty);
      b.disabled = (step < 0 && q <= 1) || (step > 0 && q >= MAX_QTY);
    });
    if (!found) return;
    const { variant } = found;
    const ok = variant.precioEstado === 'confirmado' && variant.estado === 'disponible';
    priceEl.textContent = ok ? formatARS(variant.precio) : 'Precio a confirmar';
    addBtn.disabled = !ok;
    const parts = [];
    if (ok && q > 1) parts.push(`${q} × ${formatARS(variant.precio)} = ${formatARS(variant.precio * q)}`);
    if (variant.unidades > 1) parts.push(`${variant.unidades * q} unidades`);
    lineEl.textContent = parts.join(' · ');
  }

  form.addEventListener('change', update);
  qtyInput.addEventListener('input', () => {
    if (qtyInput.value === '') return;
    const n = normalizeQty(qtyInput.value);
    if (n === null) qtyInput.value = '1';
  });
  qtyInput.addEventListener('blur', update);
  form.addEventListener('click', (e) => {
    const b = e.target.closest('[data-qty]');
    if (!b) return;
    qtyInput.value = String(Math.min(Math.max(currentQty() + Number(b.dataset.qty), 1), MAX_QTY));
    update();
  });
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const variantId = selectedVariantId();
    const qty = currentQty();
    const res = addItem(state.cart, CATALOGO, productId, variantId, qty);
    if (res.error && !res.added) {
      const why = res.error === 'maximo' ? `Llegaste al máximo de ${MAX_QTY} por producto.`
        : res.error === 'agotado' ? 'Esta opción está agotada.'
        : 'No se pudo agregar esta opción.';
      announce(why);
      lineEl.textContent = why;
      return;
    }
    state.cart = res.cart;
    state.lastCleared = null;
    persist();
    renderAll();
    const { product, variant } = findVariant(CATALOGO, productId, variantId);
    const total = countPacks(state.cart);
    const extra = res.error === 'maximo' ? ` Se agregaron ${res.added}: es el máximo por producto.` : '';
    announce(`Agregaste ${res.added} × ${product.nombre}, ${variant.presentacion.toLowerCase()}. Tu pedido tiene ${packsLabel(total)}.${extra}`);
    const label = addBtn.textContent;
    addBtn.textContent = 'Agregado';
    addBtn.prepend(svgIcon('check'));
    addBtn.classList.add('is-done');
    setTimeout(() => { addBtn.textContent = label; addBtn.classList.remove('is-done'); }, 1400);
    qtyInput.value = '1';
    update();
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
      const first = $('[aria-invalid="true"]', d) || $('input[name="mode"]', d);
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

function renderCheckout(d, t, keepForm) {
  const box = $('[data-mode-options]', d);
  if (!keepForm) {
    box.replaceChildren();
    if (!modes.length) {
      box.append(el('p', { class: 'muted', text: 'Retiro y envío se coordinan con el negocio por WhatsApp. Todavía no están confirmados en esta web.' }));
    } else {
      const wrap = el('div', { class: 'mode-opts' });
      for (const m of modes) {
        const input = el('input', { type: 'radio', name: 'mode', value: m, checked: state.fulfillment.mode === m });
        input.setAttribute('aria-describedby', 'err-mode');
        const z = NEGOCIO.modalidades.envio.zonas;
        const meta = m === 'retiro' ? 'Sin costo de envío' : `${z.length} zona${z.length === 1 ? '' : 's'} habilitada${z.length === 1 ? '' : 's'}`;
        wrap.append(el('label', { class: 'choice__opt' }, input,
          el('span', { class: 'choice__label', text: m === 'retiro' ? 'Retiro en el local' : 'Envío' }),
          el('span', { class: 'choice__meta', text: meta })));
      }
      box.append(wrap);
    }
    const select = $('#c-zone', d);
    select.replaceChildren(el('option', { value: '', text: 'Elegí tu zona' }));
    for (const z of NEGOCIO.modalidades.envio.zonas) {
      const fee = z.tarifaEstado === 'confirmada' ? (z.tarifa === 0 ? 'sin cargo' : formatARS(z.tarifa)) : 'envío a confirmar';
      select.append(el('option', { value: z.id, text: `${z.nombre} · ${fee}`, selected: state.fulfillment.zoneId === z.id }));
    }
    for (const [k, v] of Object.entries(state.customer)) {
      const input = $(`[name="${k}"]`, d);
      if (input && input.value !== v) input.value = v;
    }
  }
  $('[data-delivery-fields]', d).hidden = t.mode !== 'envio';

  const errors = state.showErrors ? validateCheckout(t, state.customer, modes) : {};
  for (const key of ['mode', 'zone', 'address']) {
    const msg = $(`[data-error="${key}"]`, d);
    msg.hidden = !errors[key];
    msg.textContent = errors[key] || '';
    const field = key === 'mode' ? null : $(`[name="${key}"]`, d);
    if (field) field.setAttribute('aria-invalid', errors[key] ? 'true' : 'false');
  }
  for (const r of $$('input[name="mode"]', d)) r.setAttribute('aria-invalid', errors.mode ? 'true' : 'false');
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

function initCategoryHighlight() {
  const links = $$('.catnav__link');
  if (!links.length || !('IntersectionObserver' in window)) return;
  const byId = new Map(links.map((a) => [a.hash.slice(1), a]));
  const io = new IntersectionObserver((entries) => {
    for (const en of entries) {
      if (!en.isIntersecting) continue;
      links.forEach((a) => a.removeAttribute('aria-current'));
      byId.get(en.target.id)?.setAttribute('aria-current', 'true');
    }
  }, { rootMargin: '-40% 0px -55% 0px' });
  for (const id of byId.keys()) { const s = document.getElementById(id); if (s) io.observe(s); }
}

/* ---------------- Inicio ---------------- */
function init() {
  safely('restaurar', restore);
  safely('navegación', initNav);
  safely('categorías', initCategoryHighlight);
  safely('fichas', initProductCards);
  safely('diálogo', initDialog);
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
