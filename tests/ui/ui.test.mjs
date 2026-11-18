// Pruebas de interfaz: Chrome instalado (playwright-core) + axe-core.
// No envían mensajes: toda petición a wa.me / api.whatsapp.com se bloquea y solo se inspeccionan enlaces.
import { test, before, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { chromium } from 'playwright-core';
import { createServer } from '../../scripts/serve.mjs';
import { businessConfirmedFixture, business, catalog, liveCatalog, liveBusiness } from '../unit/fixtures.js';
import { formatARS } from '../../js/core/money.js';

const require = createRequire(import.meta.url);
const AXE = readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8');
const SHOTS = process.env.CAPTURAS || '';
if (SHOTS) mkdirSync(SHOTS, { recursive: true });

let server; let browser; let BASE;
const WIDTHS = [320, 360, 390, 430, 768, 1024, 1440];

before(async () => {
  server = createServer();
  await new Promise((r) => server.listen(0, r));
  BASE = `http://localhost:${server.address().port}/burguer_truck/`;
  browser = await chromium.launch({ channel: process.env.PW_CHANNEL || 'chrome' });
});
after(async () => { await browser?.close(); server?.close(); });

/** Página con registro de errores de consola, 4xx/5xx propios y bloqueo de WhatsApp. */
async function open(path = '', { width = 1440, height = 900, js = true, init, fixture = false, blockImages = false } = {}) {
  const context = await browser.newContext({ viewport: { width, height }, javaScriptEnabled: js, locale: 'es-AR' });
  const problems = [];
  const waRequests = [];
  await context.route(/https:\/\/(wa\.me|api\.whatsapp\.com|web\.whatsapp\.com)\//, (route) => { waRequests.push(route.request().url()); route.abort(); });
  if (fixture) {
    // fixture: true -> negocio confirmado ficticio; 'pendiente' -> todo pendiente. Carta: la de data/ (la misma del HTML).
    const biz = fixture === 'pendiente' ? business() : businessConfirmedFixture();
    const mod = `export const CATALOGO = ${JSON.stringify(liveCatalog())};\nexport const NEGOCIO = ${JSON.stringify(biz)};\n`;
    // Coincide con js/data/datos.js con o sin ?v=versión.
    await context.route((url) => url.pathname.endsWith('/js/data/datos.js'), (route) => route.fulfill({ status: 200, contentType: 'text/javascript', body: mod }));
  }
  if (blockImages) await context.route(/\.(avif|webp|png|jpg)$/, (route) => route.abort());
  if (init) await context.addInitScript(init);
  const page = await context.newPage();
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') problems.push(`${m.type()}: ${m.text()}`); });
  page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
  page.on('response', (r) => { if (r.url().startsWith(BASE) && r.status() >= 400) problems.push(`${r.status()} ${r.url()}`); });
  await page.goto(BASE + path, { waitUntil: 'networkidle' });
  return { page, context, problems, waRequests };
}

const count = (page) => page.locator('.order-btn [data-cart-count]').textContent();

async function addFromMenu(page, productId, { variant, qty = 1 } = {}) {
  const card = page.locator(`[data-product="${productId}"]`);
  if (variant) await card.locator(`input[value="${variant}"]`).check();
  for (let i = 1; i < qty; i++) await card.locator('[data-qty="1"]').click();
  await card.locator('.product__add').click();
}

async function openCart(page) {
  await page.locator('.order-btn').click();
  await page.locator('dialog[open]').waitFor();
  await page.waitForFunction(() => document.getAnimations().every((a) => a.playState !== 'running'));
}

async function axe(page, label) {
  await page.addScriptTag({ content: AXE });
  const res = await page.evaluate(async () => window.axe.run(document, { runOnly: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'] }));
  const serious = res.violations.filter((v) => ['serious', 'critical', 'moderate'].includes(v.impact));
  assert.deepEqual(serious.map((v) => `${v.id}: ${v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join(' | ')}`), [], `axe en ${label}`);
  return res;
}

async function noHorizontalScroll(page, label) {
  const { sw, cw } = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
  assert.ok(sw <= cw, `${label}: scroll horizontal (${sw} > ${cw})`);
}

describe('carga, enlaces y recursos', () => {
  test('inicio y menú cargan sin errores de consola ni 404 propios, con un h1', async () => {
    for (const p of ['', 'menu.html', 'admin.html', 'no-existe.html']) {
      const { page, context, problems } = await open(p);
      const filtered = problems.filter((x) => !(p === 'no-existe.html' && x.includes('404') && x.includes('no-existe')));
      // El 404 propio es esperado solo para la página inexistente.
      assert.deepEqual(filtered.filter((x) => !x.includes('Failed to load resource: the server responded with a status of 404')), [], p || 'inicio');
      assert.equal(await page.locator('h1').count(), 1, `h1 en ${p || 'inicio'}`);
      await context.close();
    }
  });

  test('todos los enlaces y recursos locales responden 200 bajo /burguer_truck/', async () => {
    const { page, context } = await open('');
    const urls = new Set();
    for (const p of ['', 'menu.html', 'admin.html']) {
      await page.goto(BASE + p, { waitUntil: 'networkidle' });
      const found = await page.evaluate(() => [
        ...[...document.querySelectorAll('a[href]')].map((a) => a.href),
        ...[...document.querySelectorAll('img[src], source[srcset], link[href], script[src]')].flatMap((n) => {
          if (n.srcset) return n.srcset.split(',').map((s) => new URL(s.trim().split(' ')[0], location.href).href);
          return [n.src || n.href];
        }),
      ]);
      found.filter((u) => u.startsWith(BASE)).forEach((u) => urls.add(u.split('#')[0]));
    }
    for (const u of ['sitemap.xml', 'assets/img/compartir-1200x630.jpg']) urls.add(BASE + u);
    for (const u of urls) {
      const r = await page.request.get(u);
      assert.equal(r.status(), 200, u);
    }
    assert.ok(urls.size > 30, 'se revisaron los recursos');
    await context.close();
  });

  test('metadatos: título, canonical, OG y JSON-LD sin datos pendientes', async () => {
    const { page, context } = await open('');
    assert.equal(await page.title(), 'El Buen Sabor | Menú y pedidos');
    assert.equal(await page.locator('link[rel=canonical]').getAttribute('href'), 'https://misiomis.github.io/burguer_truck/');
    assert.equal(await page.getAttribute('html', 'lang'), 'es-AR');
    const ld = JSON.parse(await page.locator('script[type="application/ld+json"]').textContent());
    assert.equal(ld.name, 'El Buen Sabor');
    assert.equal(ld.address.streetAddress, 'Calle Costa Rica');
    await page.goto(BASE + 'menu.html');
    assert.equal(await page.title(), 'Menú | El Buen Sabor');
    assert.equal(await page.locator('link[rel=canonical]').getAttribute('href'), 'https://misiomis.github.io/burguer_truck/menu.html');
    await context.close();
  });

  test('anclas conocidas existen y no quedan tapadas por la cabecera', async () => {
    for (const id of ['featured', 'about', 'location', 'order']) {
      const { page, context } = await open(`index.html#${id}`, { width: 390, height: 844 });
      await page.waitForTimeout(400);
      const { top, header } = await page.evaluate((i) => ({
        top: document.getElementById(i).getBoundingClientRect().top,
        header: document.querySelector('.site-header').getBoundingClientRect().bottom,
      }), id);
      assert.ok(top >= header - 1, `#${id} queda debajo de la cabecera (top ${top}, header ${header})`);
      await context.close();
    }
    const { page, context } = await open('menu.html#papas', { width: 390, height: 844 });
    await page.waitForTimeout(400);
    const r = await page.evaluate(() => ({ top: document.getElementById('h-papas').getBoundingClientRect().top, nav: document.querySelector('.catnav').getBoundingClientRect().bottom }));
    assert.ok(r.top >= r.nav - 1, 'categoría visible bajo la barra de categorías');
    await context.close();
  });
});

describe('carta y pedido', () => {
  test('la carta muestra exactamente la oferta confirmada y nada comprable fuera de ella', async () => {
    const { page, context } = await open('menu.html');
    const ids = await page.locator('[data-product]').evaluateAll((n) => n.map((x) => x.dataset.product));
    assert.deepEqual(ids, liveCatalog().productos.map((p) => p.id));
    const text = await page.locator('main').textContent();
    for (const bad of ['Coca', 'Brahma', 'Quilmes', 'Combo', 'Pizza', 'Consultá precio', 'cono']) assert.ok(!text.includes(bad), bad);
    for (const p of liveCatalog().productos) for (const v of p.variantes) assert.ok(text.includes(formatARS(v.precio)), `${p.nombre} ${v.presentacion}`);
    await context.close();
  });

  test('agregar, sumar, restar, quitar, vaciar y deshacer', async () => {
    const { page, context, problems } = await open('menu.html');
    await addFromMenu(page, 'empanadas-carne', { variant: 'empanadas-carne-12', qty: 2 });
    assert.equal(await count(page), '2');
    assert.match(await page.locator('[data-announcer]').textContent({ timeout: 2000 }) || '', /Agregaste 2 × Empanadas de carne, docena|^$/);
    await openCart(page);
    const line = page.locator('[data-variant="empanadas-carne-12"]');
    assert.equal(await line.locator('.line__total').textContent(), '$24.000');
    assert.match(await line.locator('.line__meta').textContent(), /24 unidades/);
    await line.locator('[data-action="inc"]').click();
    assert.equal(await line.locator('.line__total').textContent(), '$36.000');
    await line.locator('[data-action="dec"]').click();
    await line.locator('[data-action="dec"]').click();
    assert.equal(await line.locator('.qty__value').textContent(), '1');
    assert.ok(await line.locator('[data-action="dec"]').isDisabled(), 'no baja de 1');
    await page.locator('[data-clear-cart]').click();
    assert.ok(await page.locator('[data-cart-empty]').isVisible());
    assert.equal(await count(page), '0');
    await page.locator('[data-undo-clear]').click();
    assert.equal(await count(page), '1');
    await page.locator('[data-variant="empanadas-carne-12"] [data-action="remove"]').click();
    assert.ok(await page.locator('[data-cart-empty]').isVisible());
    assert.deepEqual(problems, []);
    await context.close();
  });

  test('variantes 6/12 y carne/pollo quedan separadas (2 medias docenas = $13.000 con la carta vigente)', async () => {
    const { page, context } = await open('menu.html');
    await addFromMenu(page, 'empanadas-carne', { variant: 'empanadas-carne-6' });
    await addFromMenu(page, 'empanadas-pollo', { variant: 'empanadas-pollo-6' });
    await openCart(page);
    assert.equal(await page.locator('.line').count(), 2);
    assert.equal(await page.locator('[data-subtotal]').textContent(), '$13.000');
    await context.close();
  });

  test('cantidades inválidas en la ficha se corrigen (sin NaN, negativos ni cero)', async () => {
    const { page, context } = await open('menu.html');
    const card = page.locator('[data-product="papas-fritas"]');
    const input = card.locator('.qty__input');
    for (const [typed, expected] of [['-3', '1'], ['0', '1'], ['999', '20'], ['abc', '1']]) {
      await input.fill('');
      await input.pressSequentially(typed);
      await input.blur();
      assert.equal(await input.inputValue(), expected, `escribir ${typed}`);
    }
    await input.fill('20');
    await input.blur();
    await card.locator('.product__add').click();
    assert.equal(await count(page), '20');
    await card.locator('.product__add').click();
    assert.equal(await count(page), '20', 'tope de 20 por producto');
    assert.match(await card.locator('[data-line]').textContent(), /máximo/);
    await context.close();
  });

  test('persistencia entre inicio y menú y tras recargar', async () => {
    const { page, context } = await open('menu.html');
    await addFromMenu(page, 'milanesa-pollo');
    await addFromMenu(page, 'papas-fritas', { variant: 'papas-mediana-caja' });
    await page.goto(BASE, { waitUntil: 'networkidle' });
    assert.equal(await count(page), '2');
    await page.reload({ waitUntil: 'networkidle' });
    assert.equal(await count(page), '2');
    await openCart(page);
    assert.equal(await page.locator('[data-subtotal]').textContent(), '$16.000');
    await context.close();
  });

  test('restaurar un pedido viejo: precio cambiado, producto inexistente y basura', async () => {
    const stored = { schema: 'ebs.pedido', version: 1, lines: [
      { productId: 'empanadas-carne', variantId: 'empanadas-carne-6', qty: 2, seenPrice: 6000 },
      { productId: 'simple', variantId: 'simple', qty: 1, seenPrice: 3000 },
      { productId: 'papas-fritas', variantId: 'papas-mediana-caja', qty: 'x' },
    ] };
    const { page, context, problems } = await open('menu.html', { init: `localStorage.setItem('ebs:pedido:v1', ${JSON.stringify(JSON.stringify(stored))})` });
    assert.equal(await count(page), '2');
    await openCart(page);
    const notices = await page.locator('.cart__notice').allTextContents();
    assert.ok(notices.some((n) => /cambió de precio/.test(n)), 'avisa cambio de precio');
    assert.ok(notices.some((n) => /ya no está en la carta/.test(n)), 'avisa producto retirado');
    assert.equal(await page.locator('[data-subtotal]').textContent(), '$13.000', 'recalcula con el precio actual');
    assert.deepEqual(problems, []);
    await context.close();
  });

  test('JSON corrupto y almacenamiento bloqueado no rompen el pedido', async () => {
    const a = await open('menu.html', { init: `localStorage.setItem('ebs:pedido:v1', '{roto')` });
    await addFromMenu(a.page, 'papas-fritas');
    assert.equal(await count(a.page), '1');
    await openCart(a.page);
    assert.match((await a.page.locator('.cart__notice').allTextContents()).join(' '), /No pudimos recuperar/);
    await a.context.close();

    const blocked = `Object.defineProperty(window, 'localStorage', { get() { throw new DOMException('bloqueado', 'SecurityError'); } });`;
    const b = await open('menu.html', { init: blocked });
    await addFromMenu(b.page, 'papas-fritas');
    assert.equal(await count(b.page), '1');
    await openCart(b.page);
    assert.match((await b.page.locator('.cart__notice').allTextContents()).join(' '), /no permite guardar/);
    assert.deepEqual(b.problems, []);
    await b.context.close();
  });

  test('otras claves del origen no se tocan', async () => {
    const { page, context } = await open('menu.html', { init: `localStorage.setItem('otro-proyecto', '1'); localStorage.setItem('bt_products_v1', '[]');` });
    await addFromMenu(page, 'papas-fritas', { variant: 'papas-mediana-caja' });
    await openCart(page);
    await page.locator('[data-variant="papas-mediana-caja"] [data-action="remove"]').click();
    const keys = await page.evaluate(() => Object.keys(localStorage).sort());
    assert.deepEqual(keys, ['bt_products_v1', 'otro-proyecto']);
    await context.close();
  });
});

describe('WhatsApp', () => {
  test('pedido real: arma el enlace al número publicado con el mensaje (sin abrirlo)', async () => {
    const { page, context, waRequests } = await open('menu.html');
    await addFromMenu(page, 'hamburguesa-completa');
    await openCart(page);
    await page.locator('input[name="mode"][value="retiro"]').check();
    const href = await page.locator('[data-whatsapp]').getAttribute('href');
    assert.ok(href.startsWith(`https://wa.me/${liveBusiness().whatsapp.numero}?text=`), href.slice(0, 40));
    const text = decodeURIComponent(href.split('?text=')[1]);
    assert.match(text, /1 x Hamburguesa completa/);
    assert.ok(text.includes("Total: $6.500"), "total en el mensaje");
    assert.equal(await page.locator('#c-zone option').count(), liveBusiness().modalidades.envio.zonas.length + 1);
    assert.deepEqual(waRequests, []);
    await context.close();
  });

  test('con el número pendiente no hay enlace a ningún número y se puede copiar el resumen', async () => {
    const { page, context, waRequests } = await open('menu.html', { fixture: 'pendiente' });
    assert.equal(await page.locator('dialog a[href*="wa.me"]').count(), 0);
    await addFromMenu(page, 'papas-fritas');
    await openCart(page);
    assert.ok(await page.locator('[data-whatsapp]').isHidden());
    assert.ok(await page.locator('[data-whatsapp-pending]').isDisabled());
    assert.match(await page.locator('[data-cart-hint]').textContent(), /todavía no está confirmado/);
    assert.equal(await page.locator('[data-total]').textContent(), 'A confirmar');
    await page.locator('.preview summary').click();
    const preview = await page.locator('[data-message-preview]').textContent();
    assert.match(preview, /Modalidad: a coordinar/);
    assert.equal(await page.locator('dialog a[href*="wa.me"]').count(), 0);
    assert.deepEqual(waRequests, []);
    await context.close();
  });

  test('con datos de prueba confirmados: validación, retiro, envío $1.500 y envío a cotizar', async () => {
    const { page, context, waRequests } = await open('menu.html', { fixture: true });
    await addFromMenu(page, 'empanadas-carne', { variant: 'empanadas-carne-12' });
    await addFromMenu(page, 'milanesa-pollo');
    await addFromMenu(page, 'papas-fritas', { variant: 'papas-mediana-caja' });
    await openCart(page);
    assert.equal(await page.locator('[data-subtotal]').textContent(), '$28.000');

    // Sin modalidad: no se abre nada y se marca el error junto al campo.
    const popups = [];
    context.on('page', (p) => popups.push(p));
    await page.locator('[data-whatsapp]').click();
    assert.ok(await page.locator('#err-mode').isVisible());
    assert.equal(popups.length, 0);

    await page.locator('input[name="mode"][value="retiro"]').check();
    assert.equal(await page.locator('[data-total]').textContent(), '$28.000');
    assert.ok(await page.locator('[data-delivery-fields]').isHidden(), 'retiro no pide barrio');
    let href = await page.locator('[data-whatsapp]').getAttribute('href');
    assert.ok(href.startsWith('https://wa.me/5490000000000?text='));
    let text = decodeURIComponent(href.split('?text=')[1]);
    assert.equal(text, await page.locator('[data-message-preview]').textContent(), 'el enlace lleva exactamente el texto mostrado');
    assert.ok(text.includes("Total: $28.000"), "total en el mensaje");

    await page.locator('input[name="mode"][value="envio"]').check();
    await page.locator('#c-zone').selectOption('zona-test');
    await page.locator('[data-whatsapp]').click();
    assert.ok(await page.locator('#err-address').isVisible(), 'pide dirección');
    assert.equal(await page.locator('#c-address').getAttribute('aria-invalid'), 'true');
    await page.locator('#c-address').fill('Av. Siempre Viva 123 & Ñandú + 2º');
    await page.locator('#c-notes').fill('Sin sal. <b>gracias</b>');
    assert.equal(await page.locator('[data-shipping]').textContent(), '$1.500');
    assert.equal(await page.locator('[data-total]').textContent(), '$29.500');
    href = await page.locator('[data-whatsapp]').getAttribute('href');
    text = decodeURIComponent(href.split('?text=')[1]);
    assert.match(text, /Dirección: Av\. Siempre Viva 123 & Ñandú \+ 2º/);
    assert.match(text, /Observaciones: Sin sal\. bgracias\/b/);
    assert.doesNotMatch(text, /undefined|null|NaN/);

    await page.locator('#c-zone').selectOption('zona-pendiente');
    assert.equal(await page.locator('[data-shipping]').textContent(), 'A confirmar');
    assert.equal(await page.locator('[data-total]').textContent(), 'A confirmar');
    text = decodeURIComponent((await page.locator('[data-whatsapp]').getAttribute('href')).split('?text=')[1]);
    assert.match(text, /Envío: a confirmar[\s\S]*Total: a confirmar/);

    // Datos personales: no se guardan.
    const saved = await page.evaluate(() => localStorage.getItem('ebs:pedido:v1'));
    assert.doesNotMatch(saved, /Siempre Viva|Sin sal/);
    assert.deepEqual(waRequests, [], 'no se envió ninguna petición a WhatsApp');
    await context.close();
  });

  test('todos los accesos al pedido abren el mismo resumen (inicio y menú)', async () => {
    const { page, context } = await open('menu.html');
    await addFromMenu(page, 'papas-fritas');
    const openers = ['.order-btn', '#menu-order [data-open-cart]'];
    for (const sel of openers) {
      await page.locator(sel).click();
      assert.equal(await page.locator('.line').count(), 1, sel);
      await page.keyboard.press('Escape');
    }
    await page.goto(BASE, { waitUntil: 'networkidle' });
    await page.locator('#order [data-open-cart]').click();
    assert.equal(await page.locator('.line').count(), 1, 'desde Cómo pedir en inicio');
    await context.close();
  });
});

describe('accesibilidad y teclado', () => {
  test('diálogo: foco inicial, foco contenido, Escape, retorno del foco y scroll reversible', async () => {
    const { page, context } = await open('menu.html');
    await addFromMenu(page, 'papas-fritas');
    await page.locator('.order-btn').focus();
    await page.keyboard.press('Enter');
    await page.locator('dialog[open]').waitFor();
    assert.equal(await page.evaluate(() => document.activeElement.id), 'cart-title');
    assert.ok(await page.evaluate(() => document.body.classList.contains('is-locked')));
    for (let i = 0; i < 25; i++) {
      await page.keyboard.press('Tab');
      const inside = await page.evaluate(() => !document.activeElement || document.activeElement === document.body || Boolean(document.activeElement.closest('dialog')));
      assert.ok(inside, `Tab ${i + 1} salió del diálogo`);
    }
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => !document.querySelector('dialog[open]') && !document.body.classList.contains('is-locked'));
    assert.equal(await page.locator('dialog[open]').count(), 0);
    assert.ok(await page.evaluate(() => document.activeElement.classList.contains('order-btn')), 'foco vuelve al botón');
    assert.ok(!(await page.evaluate(() => document.body.classList.contains('is-locked'))));
    await context.close();
  });

  test('axe sin violaciones relevantes en inicio, menú, pedido abierto, admin y 404', async () => {
    for (const [path, width] of [['', 1440], ['', 390], ['menu.html', 1440], ['menu.html', 390], ['admin.html', 1024], ['no-existe', 1024]]) {
      const { page, context } = await open(path, { width, height: 900 });
      await axe(page, `${path || 'inicio'} @${width}`);
      await context.close();
    }
    const { page, context } = await open('menu.html', { fixture: true, width: 390 });
    await addFromMenu(page, 'empanadas-pollo');
    await openCart(page);
    await page.locator('input[name="mode"][value="envio"]').check();
    await page.locator('[data-whatsapp]').click();
    await axe(page, 'pedido abierto con errores');
    await context.close();
  });

  test('menú móvil: estado, Escape y cierre al elegir', async () => {
    const { page, context } = await open('', { width: 390, height: 844 });
    const toggle = page.locator('.site-nav__toggle');
    assert.equal(await toggle.getAttribute('aria-expanded'), 'false');
    assert.ok(await page.locator('#nav-list').isHidden());
    await toggle.click();
    assert.equal(await toggle.getAttribute('aria-expanded'), 'true');
    assert.ok(await page.locator('#nav-list').isVisible());
    await page.keyboard.press('Escape');
    assert.equal(await toggle.getAttribute('aria-expanded'), 'false');
    assert.ok(await page.evaluate(() => document.activeElement.classList.contains('site-nav__toggle')));
    await toggle.click();
    await page.locator('#nav-list a', { hasText: 'Contacto' }).click();
    assert.equal(await toggle.getAttribute('aria-expanded'), 'false');
    await context.close();
  });

  test('logo: sello completo >= 240 px con aire >= 10 % y perfil simplificado >= 96 px', async () => {
    for (const width of WIDTHS) {
      const { page, context } = await open('', { width, height: 900 });
      const r = await page.evaluate(() => {
        const img = document.querySelector('.story__seal img');
        const pic = img.closest('picture');
        const pad = parseFloat(getComputedStyle(pic).paddingLeft);
        return { seal: img.getBoundingClientRect().width, pad, simple: document.querySelector('.footer__logo').getBoundingClientRect().width };
      });
      assert.ok(r.seal >= 240, `sello ${r.seal}px @${width}`);
      assert.ok(r.pad >= r.seal * 0.1 - 0.5, `aire ${r.pad}px para sello ${r.seal}px @${width}`);
      assert.ok(r.simple >= 96, `perfil ${r.simple}px @${width}`);
      await context.close();
    }
  });

  test('controles táctiles importantes miden al menos 44 px', async () => {
    const { page, context } = await open('menu.html', { width: 390, height: 844 });
    await addFromMenu(page, 'papas-fritas');
    await openCart(page);
    const small = await page.evaluate(() => [...document.querySelectorAll('.qty__btn, .icon-btn, .order-btn, .product__add, .order-bar__btn, .catnav__link, [data-close-cart], .site-nav__toggle, .btn')]
      .filter((n) => n.offsetParent !== null)
      .map((n) => ({ c: n.className, r: n.getBoundingClientRect() }))
      .filter(({ r }) => r.width < 44 || r.height < 44)
      .map(({ c, r }) => `${c} ${Math.round(r.width)}x${Math.round(r.height)}`));
    assert.deepEqual(small, []);
    await context.close();
  });
});

describe('responsive, fallos y degradación', () => {
  test(`sin scroll horizontal y sin controles tapados en ${WIDTHS.join(', ')} px`, async () => {
    for (const width of WIDTHS) {
      const { page, context } = await open('menu.html', { width, height: width < 700 ? 800 : 900 });
      await noHorizontalScroll(page, `menú ${width}`);
      await addFromMenu(page, 'empanadas-carne');
      await openCart(page);
      await noHorizontalScroll(page, `pedido ${width}`);
      const covered = await page.evaluate(() => {
        const out = [];
        for (const sel of ['[data-close-cart]', '#cart-title', '[data-copy]', '[data-subtotal]']) {
          const n = document.querySelector(sel);
          const r = n.getBoundingClientRect();
          if (r.top < 0 || r.bottom > innerHeight || r.left < 0 || r.right > innerWidth) { out.push(`${sel} fuera de la pantalla`); continue; }
          const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
          if (!n.contains(hit) && hit !== n) out.push(`${sel} tapado por ${hit?.className}`);
        }
        return out;
      });
      assert.deepEqual(covered, [], `pedido @${width}`);
      await page.keyboard.press('Escape');
      await page.goto(BASE, { waitUntil: 'networkidle' });
      await noHorizontalScroll(page, `inicio ${width}`);
      if (width < 840) {
        // La barra inferior no tapa el final del contenido.
        await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
        await page.waitForTimeout(150);
        const ok = await page.evaluate(() => {
          const bar = document.querySelector('[data-order-bar]').getBoundingClientRect();
          const last = document.querySelector('.footer__bottom p').getBoundingClientRect();
          return last.bottom <= bar.top + 1;
        });
        assert.ok(ok, `barra inferior tapa el pie @${width}`);
      }
      await context.close();
    }
  });

  test('sin JavaScript: carta, precios y contacto legibles; sin botones inútiles', async () => {
    const { page, context } = await open('menu.html', { js: false, width: 390 });
    const text = await page.locator('main').textContent();
    for (const p of ['$6.500', '$12.000', '$4.500', '$15.500', '$3.500', 'Empanadas de carne', 'Papas fritas']) assert.ok(text.includes(p), p);
    assert.ok(await page.locator('.nojs-note').isVisible());
    assert.equal(await page.locator('.product__add:visible').count(), 0);
    await page.goto(BASE, { waitUntil: 'networkidle' });
    assert.ok(await page.locator('#location').isVisible());
    assert.ok(await page.locator('.hero__title').isVisible(), 'el contenido no depende de JS para mostrarse');
    await context.close();
  });

  test('imágenes rotas: la carta sigue usable y sin desbordes', async () => {
    const { page, context } = await open('menu.html', { blockImages: true, width: 390 });
    await noHorizontalScroll(page, 'sin imágenes');
    await addFromMenu(page, 'papas-fritas');
    assert.equal(await count(page), '1');
    await context.close();
  });
});

describe('editor local', () => {
  test('carga datos, valida precios, aísla el borrador y no toca la web pública', async () => {
    const { page, context, problems } = await open('_herramientas/editor/');
    await page.locator('.ed-ok').waitFor();
    const price = page.locator('[data-path="catalogo.productos.0.variantes.0.precio"]');
    await price.fill('');
    assert.match(await page.locator('[data-errors]').textContent(), /precio confirmado debe ser un entero/);
    assert.ok(await page.locator('[data-act="export-catalogo"]').isDisabled(), 'no exporta con errores');
    await price.fill('7500');
    await page.locator('.ed-ok').waitFor();
    await page.locator('[data-act="save"]').click();
    // La web pública sigue mostrando el precio canónico.
    await page.goto(BASE + 'menu.html', { waitUntil: 'networkidle' });
    assert.equal(await page.locator('[data-product="hamburguesa-simple"] [data-price]').textContent(), '$4.500');
    await page.goto(BASE + '_herramientas/editor/', { waitUntil: 'networkidle' });
    assert.equal(await price.inputValue(), '7500', 'el borrador se recupera');

    // Importación inválida: se rechaza sin cambiar el borrador.
    await page.locator('[data-import]').setInputFiles({ name: 'malo.json', mimeType: 'application/json', buffer: Buffer.from('{"schema":"ebs.catalogo","version":1,"moneda":"ARS","categorias":[],"productos":[]}') });
    await page.waitForFunction(() => document.querySelector('[data-status]').textContent.includes('rechazada'));
    assert.equal(await price.inputValue(), '7500');
    // Importación válida: muestra diferencias y requiere confirmar.
    const good = catalog();
    good.productos[4].variantes[0].precio = 6500;
    await page.locator('[data-import]').setInputFiles({ name: 'catalogo.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(good)) });
    await page.locator('[data-import-review]:not([hidden])').waitFor();
    assert.match(await page.locator('[data-import-summary]').textContent(), /Papas fritas · Porción mediana, en caja: \$6\.000 → \$6\.500/);
    await page.locator('[data-act="import-apply"]').click();
    assert.equal(await page.locator('[data-path="catalogo.productos.4.variantes.0.precio"]').inputValue(), '6500');

    // Exportación coherente con el esquema.
    const [download] = await Promise.all([page.waitForEvent('download'), page.locator('[data-act="export-catalogo"]').click()]);
    const exported = JSON.parse(readFileSync(await download.path(), 'utf8'));
    assert.equal(exported.schema, 'ebs.catalogo');
    assert.equal(exported.productos[4].variantes[0].precio, 6500);
    assert.deepEqual(problems, []);
    await context.close();
  });
});

describe('capturas', { skip: !SHOTS }, () => {
  test('inicio, carta y pedido en escritorio y móvil', async () => {
    for (const [w, h, tag] of [[1440, 900, 'escritorio'], [390, 844, 'movil']]) {
      const { page, context } = await open('', { width: w, height: h, fixture: false });
      await page.evaluate(async () => { for (let y = 0; y < document.body.scrollHeight; y += 400) { window.scrollTo(0, y); await new Promise((r) => setTimeout(r, 60)); } window.scrollTo(0, 0); });
      await page.waitForTimeout(300);
      await page.screenshot({ path: `${SHOTS}/inicio-${tag}.jpg`, type: 'jpeg', quality: 70, fullPage: true });
      await page.goto(BASE + 'menu.html', { waitUntil: 'networkidle' });
      await page.evaluate(async () => { for (let y = 0; y < document.body.scrollHeight; y += 400) { window.scrollTo(0, y); await new Promise((r) => setTimeout(r, 60)); } window.scrollTo(0, 0); });
      await page.screenshot({ path: `${SHOTS}/menu-${tag}.jpg`, type: 'jpeg', quality: 70, fullPage: true });
      await addFromMenu(page, 'empanadas-carne', { variant: 'empanadas-carne-12' });
      await addFromMenu(page, 'milanesa-pollo');
      await addFromMenu(page, 'papas-fritas');
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.screenshot({ path: `${SHOTS}/menu-con-pedido-${tag}.jpg`, type: 'jpeg', quality: 70 });
      await openCart(page);
      await page.screenshot({ path: `${SHOTS}/pedido-${tag}.jpg`, type: 'jpeg', quality: 70 });
      await page.locator('.cart__body').evaluate((n) => n.scrollTo(0, n.scrollHeight));
      await page.locator('.preview summary').click();
      await page.screenshot({ path: `${SHOTS}/pedido-resumen-${tag}.jpg`, type: 'jpeg', quality: 70 });
      await context.close();
    }
  });
});
