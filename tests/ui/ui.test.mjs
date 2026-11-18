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
  for (let i = 0; i < qty; i++) await card.locator('.product__add').click();
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
    for (const p of ['', 'admin.html', 'no-existe.html']) {
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
    for (const p of ['', 'admin.html']) {
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
    for (const u of ['sitemap.xml', 'menu.html', 'assets/img/compartir-1200x630.jpg']) urls.add(BASE + u);
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
    // menu.html es la página de compatibilidad: su canónica es el inicio.
    const raw = await (await page.request.get(BASE + 'menu.html')).text();
    assert.ok(raw.includes('rel="canonical" href="https://misiomis.github.io/burguer_truck/"'), 'canónica de menu.html');
    await context.close();
  });

  test('anclas conocidas existen y no quedan tapadas por la cabecera', async () => {
    for (const id of ['featured', 'carta', 'about', 'location', 'order', 'hamburguesas', 'sandwiches', 'papas', 'empanadas']) {
      const { page, context } = await open(`index.html#${id}`, { width: 390, height: 844 });
      await page.waitForTimeout(500);
      const r = await page.evaluate((i) => {
        const el = document.getElementById(i);
        const inCarta = Boolean(el.closest('.carta')) && i !== 'carta';
        const bar = (inCarta ? document.querySelector('.catnav') : document.querySelector('.site-header')).getBoundingClientRect().bottom;
        return { top: el.getBoundingClientRect().top, bar, inCarta };
      }, id);
      assert.ok(r.top >= r.bar - 1, `#${id} queda tapado (top ${r.top}, barra ${r.bar})`);
      assert.ok(r.top < 400, `#${id} llega cerca del borde superior (top ${r.top})`);
      await context.close();
    }
  });
});

describe('carta y pedido', () => {
  test('la carta muestra exactamente la oferta confirmada y nada comprable fuera de ella', async () => {
    const { page, context } = await open('');
    const ids = await page.locator('[data-product]').evaluateAll((n) => n.map((x) => x.dataset.product));
    assert.deepEqual(ids, liveCatalog().productos.map((p) => p.id));
    const text = await page.locator('main').textContent();
    for (const bad of ['Coca', 'Brahma', 'Quilmes', 'Combo', 'Pizza', 'Consultá precio', 'cono']) assert.ok(!text.includes(bad), bad);
    for (const p of liveCatalog().productos) for (const v of p.variantes) assert.ok(text.includes(formatARS(v.precio)), `${p.nombre} ${v.presentacion}`);
    await context.close();
  });

  test('agregar, sumar, restar, quitar, vaciar y deshacer', async () => {
    const { page, context, problems } = await open('');
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
    const { page, context } = await open('');
    await addFromMenu(page, 'empanadas-carne', { variant: 'empanadas-carne-6' });
    await addFromMenu(page, 'empanadas-pollo', { variant: 'empanadas-pollo-6' });
    await openCart(page);
    assert.equal(await page.locator('.line').count(), 2);
    assert.equal(await page.locator('[data-subtotal]').textContent(), '$13.000');
    await context.close();
  });

  test('tope de 20 por opción y aviso al llegar al máximo', async () => {
    const { page, context } = await open('');
    const card = page.locator('[data-product="papas-fritas"]');
    for (let i = 0; i < 21; i++) await card.locator('.product__add').click();
    assert.equal(await count(page), '20');
    assert.match(await card.locator('[data-in-cart]').textContent(), /máximo/);
    await context.close();
  });

  test('persistencia: recarga, menu.html, categorías y Atrás/Adelante', async () => {
    const { page, context } = await open('');
    await addFromMenu(page, 'milanesa-pollo');
    await addFromMenu(page, 'papas-fritas', { variant: 'papas-mediana-caja' });
    await page.locator('.catnav__link', { hasText: 'Empanadas' }).click();
    await page.locator('.catnav__link', { hasText: 'Hamburguesas' }).click();
    await page.goBack();
    assert.ok(page.url().endsWith('#empanadas'), page.url());
    await page.goForward();
    assert.ok(page.url().endsWith('#hamburguesas'), page.url());
    assert.equal(await count(page), '2');
    await page.goto(BASE + 'menu.html', { waitUntil: 'networkidle' });
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
    const { page, context, problems } = await open('', { init: `localStorage.setItem('ebs:pedido:v1', ${JSON.stringify(JSON.stringify(stored))})` });
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
    const a = await open('', { init: `localStorage.setItem('ebs:pedido:v1', '{roto')` });
    await addFromMenu(a.page, 'papas-fritas');
    assert.equal(await count(a.page), '1');
    await openCart(a.page);
    assert.match((await a.page.locator('.cart__notice').allTextContents()).join(' '), /No pudimos recuperar/);
    await a.context.close();

    const blocked = `Object.defineProperty(window, 'localStorage', { get() { throw new DOMException('bloqueado', 'SecurityError'); } });`;
    const b = await open('', { init: blocked });
    await addFromMenu(b.page, 'papas-fritas');
    assert.equal(await count(b.page), '1');
    await openCart(b.page);
    assert.match((await b.page.locator('.cart__notice').allTextContents()).join(' '), /no permite guardar/);
    assert.deepEqual(b.problems, []);
    await b.context.close();
  });

  test('otras claves del origen no se tocan', async () => {
    const { page, context } = await open('', { init: `localStorage.setItem('otro-proyecto', '1'); localStorage.setItem('bt_products_v1', '[]');` });
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
    const { page, context, waRequests } = await open('');
    await addFromMenu(page, 'hamburguesa-completa');
    await openCart(page);
    await page.locator('input[name="mode"][value="retiro"]').check();
    await page.locator('#c-name').fill('Ana Gómez');
    const href = await page.locator('[data-whatsapp]').getAttribute('href');
    assert.ok(href.startsWith(`https://wa.me/${liveBusiness().whatsapp.numero}?text=`), href.slice(0, 40));
    const text = decodeURIComponent(href.split('?text=')[1]);
    assert.ok(text.includes('• 1 × Hamburguesa completa'), text);
    assert.ok(text.includes('👤 *Cliente:* Ana Gómez'), text);
    assert.ok(text.includes('*TOTAL: $6.500*'), text);
    assert.equal(await page.locator('.zone-opt').count(), liveBusiness().modalidades.envio.zonas.length);
    assert.equal(await page.locator('dialog select').count(), 0, 'sin desplegables del sistema');
    assert.deepEqual(waRequests, []);
    await context.close();
  });

  test('con el número pendiente no hay enlace a ningún número y se puede copiar el resumen', async () => {
    const { page, context, waRequests } = await open('', { fixture: 'pendiente' });
    assert.equal(await page.locator('dialog a[href*="wa.me"]').count(), 0);
    await addFromMenu(page, 'papas-fritas');
    await openCart(page);
    assert.ok(await page.locator('[data-whatsapp]').isHidden());
    assert.ok(await page.locator('[data-whatsapp-pending]').isDisabled());
    assert.match(await page.locator('[data-cart-hint]').textContent(), /todavía no está confirmado/);
    assert.equal(await page.locator('[data-total]').textContent(), 'A confirmar');
    await page.locator('.preview summary').click();
    const preview = await page.locator('[data-message-preview]').textContent();
    assert.ok(preview.includes('🛵 *Entrega:* a coordinar'));
    assert.equal(await page.locator('dialog a[href*="wa.me"]').count(), 0);
    assert.deepEqual(waRequests, []);
    await context.close();
  });

  test('validación: nombre y apellido, entrega, barrio y referencia; envío $1.500 y a cotizar', async () => {
    const { page, context, waRequests } = await open('', { fixture: true });
    await addFromMenu(page, 'empanadas-carne', { variant: 'empanadas-carne-12' });
    await addFromMenu(page, 'milanesa-pollo');
    await addFromMenu(page, 'papas-fritas', { variant: 'papas-mediana-caja' });
    await openCart(page);
    assert.equal(await page.locator('[data-subtotal]').textContent(), '$28.000');

    // Sin datos: no se abre nada y se marcan los errores junto a cada campo; el foco va al primero.
    const popups = [];
    context.on('page', (p) => popups.push(p));
    await page.locator('[data-whatsapp]').click();
    assert.ok(await page.locator('#err-name').isVisible(), 'pide nombre');
    assert.ok(await page.locator('#err-mode').isVisible(), 'pide entrega');
    assert.equal(await page.evaluate(() => document.activeElement.id), 'c-name');
    assert.equal(popups.length, 0);
    await page.locator('#c-name').fill('Ana');
    await page.locator('[data-whatsapp]').click();
    assert.ok(await page.locator('#err-name').isVisible(), 'un solo nombre no alcanza');
    await page.locator('#c-name').fill('Ana Gómez');

    await page.locator('input[name="mode"][value="retiro"]').check();
    assert.equal(await page.locator('[data-total]').textContent(), '$28.000');
    assert.ok(await page.locator('[data-delivery-fields]').isHidden(), 'retiro no pide barrio');
    let href = await page.locator('[data-whatsapp]').getAttribute('href');
    assert.ok(href.startsWith('https://wa.me/5490000000000?text='));
    let text = decodeURIComponent(href.split('?text=')[1]);
    assert.equal(text, await page.locator('[data-message-preview]').textContent(), 'el enlace lleva exactamente el texto mostrado');
    assert.ok(text.includes('*TOTAL: $28.000*'));

    await page.locator('input[name="mode"][value="envio"]').check();
    await page.locator('[data-whatsapp]').click();
    assert.ok(await page.locator('#err-zone').isVisible(), 'pide barrio');
    assert.ok(await page.locator('#err-reference').isVisible(), 'pide referencia');
    assert.equal(await page.locator('#c-address').count(), 0, 'ya no hay campo de dirección');
    await page.locator('.zone-opt', { hasText: 'Zona de prueba' }).click();
    await page.locator('#c-reference').fill('Portón verde & Ñandú + 2º');
    await page.locator('#c-notes').fill('Sin sal. <b>gracias</b>');
    assert.equal(await page.locator('[data-shipping]').textContent(), '$1.500');
    assert.equal(await page.locator('[data-total]').textContent(), '$29.500');
    href = await page.locator('[data-whatsapp]').getAttribute('href');
    text = decodeURIComponent(href.split('?text=')[1]);
    assert.ok(text.includes('📍 *Referencia:* Portón verde & Ñandú + 2º'), text);
    assert.ok(text.includes('📝 *Observaciones:* Sin sal. bgracias/b'), text);
    assert.doesNotMatch(text, /undefined|null|NaN/);

    await page.locator('.zone-opt', { hasText: 'Zona a cotizar' }).click();
    assert.equal(await page.locator('[data-shipping]').textContent(), 'A confirmar');
    assert.equal(await page.locator('[data-total]').textContent(), 'A confirmar');
    text = decodeURIComponent((await page.locator('[data-whatsapp]').getAttribute('href')).split('?text=')[1]);
    assert.ok(text.includes('Envío: a confirmar') && text.includes('*TOTAL: a confirmar*'));

    // Datos personales: no se guardan.
    const saved = await page.evaluate(() => localStorage.getItem('ebs:pedido:v1'));
    assert.doesNotMatch(saved, /Gómez|Portón|Sin sal/);
    assert.deepEqual(waRequests, [], 'no se envió ninguna petición a WhatsApp');
    await context.close();
  });

  test('todos los accesos al pedido abren el mismo resumen (inicio y menú)', async () => {
    const { page, context } = await open('');
    await addFromMenu(page, 'papas-fritas');
    const openers = ['.order-btn', '#order [data-open-cart]'];
    for (const sel of openers) {
      await page.locator(sel).click();
      assert.equal(await page.locator('.line').count(), 1, sel);
      await page.keyboard.press('Escape');
    }
    await page.locator('[data-order-bar] [data-open-cart]').evaluate((b) => b.click());
    assert.equal(await page.locator('.line').count(), 1, 'desde la barra inferior');
    await context.close();
  });
});

describe('accesibilidad y teclado', () => {
  test('diálogo: foco inicial, foco contenido, Escape, retorno del foco y scroll reversible', async () => {
    const { page, context } = await open('');
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
    for (const [path, width] of [['', 1440], ['', 390], ['', 320], ['admin.html', 1024], ['no-existe', 1024]]) {
      const { page, context } = await open(path, { width, height: 900 });
      await axe(page, `${path || 'inicio'} @${width}`);
      await context.close();
    }
    const { page, context } = await open('', { fixture: true, width: 390 });
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
    const { page, context } = await open('', { width: 390, height: 844 });
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
      const { page, context } = await open('', { width, height: width < 700 ? 800 : 900 });
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
    const { page, context } = await open('', { js: false, width: 390 });
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
    const { page, context } = await open('', { blockImages: true, width: 390 });
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
    await page.goto(BASE, { waitUntil: 'networkidle' });
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

describe('carta en el inicio y categorías', () => {
  test('menu.html lleva a la sección equivalente, sin bucles ni entrada extra en el historial', async () => {
    const cases = [['menu.html', '#carta'], ['menu.html#papas', '#papas'], ['menu.html#menu-order', '#order'], ['menu.html#menu-main', '#carta'], ['menu.html#cat-burger', '#hamburguesas'], ['menu.html#no-existe', '#carta']];
    for (const [from, hash] of cases) {
      const { page, context, problems } = await open('');
      await page.goto(BASE + from, { waitUntil: 'networkidle' });
      await page.waitForTimeout(400);
      const url = new URL(page.url());
      assert.equal(url.pathname, '/burguer_truck/', from);
      assert.equal(url.hash, hash, from);
      if (hash !== '#carta' || from === 'menu.html') {
        const id = hash.slice(1);
        const top = await page.evaluate((i) => document.getElementById(i).getBoundingClientRect().top, id);
        assert.ok(top < 500, `${from}: la sección queda a la vista (top ${top})`);
      }
      // Atrás vuelve al inicio, no a menu.html (que redirigiría de nuevo).
      await page.goBack();
      assert.ok(!page.url().includes('menu.html'), `Atrás desde ${from}: ${page.url()}`);
      assert.deepEqual(problems, [], from);
      await context.close();
    }
  });

  test('menu.html sin JavaScript ofrece un enlace de respaldo', async () => {
    const { page, context } = await open('menu.html', { js: false });
    // El meta refresh puede haber navegado ya; en cualquier caso existe un camino a la carta.
    const url = page.url();
    if (url.includes('menu.html')) assert.equal(await page.locator('a[href="./#carta"]').count(), 1);
    else assert.ok(url.endsWith('/burguer_truck/#carta'), url);
    await context.close();
  });

  test('las categorías salen del catálogo y quedan marcadas al tocar y al desplazarse', async () => {
    const { page, context } = await open('', { width: 390, height: 844 });
    const names = await page.locator('.catnav__link').allTextContents();
    assert.deepEqual(names, liveCatalog().categorias.filter((c) => c.estado === 'activa').map((c) => c.nombre));
    for (const name of names) {
      await page.locator('.catnav__link', { hasText: name }).click();
      await page.waitForTimeout(900);
      const r = await page.evaluate((n) => {
        const link = [...document.querySelectorAll('.catnav__link')].find((a) => a.textContent === n);
        const sec = document.getElementById(link.hash.slice(1));
        const nav = document.querySelector('.catnav').getBoundingClientRect();
        const sc = document.querySelector('[data-catnav-scroller]').getBoundingClientRect();
        const lr = link.getBoundingClientRect();
        const first = (sec.querySelector('.product') || sec.querySelector('.menu-empty')).getBoundingClientRect();
        return {
          current: link.getAttribute('aria-current'),
          titleTop: sec.querySelector('h2').getBoundingClientRect().top,
          navBottom: nav.bottom,
          firstProductVisible: first.top < innerHeight,
          linkVisible: lr.left >= sc.left - 1 && lr.right <= sc.right + 1,
          others: [...document.querySelectorAll('.catnav__link[aria-current]')].length,
        };
      }, name);
      assert.equal(r.current, 'location', `${name} activa`);
      assert.equal(r.others, 1, 'una sola activa');
      assert.ok(r.titleTop >= r.navBottom - 1, `${name}: título tapado (${r.titleTop} < ${r.navBottom})`);
      assert.ok(r.titleTop - r.navBottom < 80, `${name}: título lejos de la barra`);
      assert.ok(r.firstProductVisible, `${name}: primer producto visible`);
      assert.ok(r.linkVisible, `${name}: el enlace activo queda visible en la fila`);
    }
    // Al desplazarse a mano, la categoría activa acompaña.
    await page.evaluate(() => document.getElementById('h-sandwiches').scrollIntoView({ block: 'start', behavior: 'instant' }));
    await page.mouse.wheel(0, 10);
    await page.waitForTimeout(400);
    assert.equal(await page.locator('.catnav__link[aria-current]').textContent(), 'Sándwiches');
    await context.close();
  });

  test('a 320 px la fila avisa que hay más categorías y las flechas funcionan', async () => {
    const { page, context } = await open('#carta', { width: 320, height: 640 });
    await page.waitForTimeout(300);
    const next = page.locator('[data-catnav-next]');
    assert.ok(await next.isVisible(), 'flecha “Ver más categorías” visible');
    assert.equal(await page.locator('[data-catnav]').getAttribute('data-more-right'), '');
    await next.click();
    await page.waitForTimeout(500);
    assert.ok(await page.locator('[data-catnav-prev]').isVisible(), 'aparece la flecha para volver');
    await noHorizontalScroll(page, 'catnav 320');
    await context.close();
  });

  test('a 390 × 844 la carta aparece en la primera pantalla', async () => {
    const { page, context } = await open('', { width: 390, height: 844 });
    const top = await page.evaluate(() => document.querySelector('.catnav').getBoundingClientRect().top);
    assert.ok(top < 700, `la barra de categorías empieza en ${top}px`);
    await page.locator('.hero .btn--primary').click();
    await page.waitForTimeout(800);
    assert.ok(page.url().endsWith('#carta'));
    const navTop = await page.evaluate(() => document.querySelector('.catnav').getBoundingClientRect().top);
    const header = await page.evaluate(() => document.querySelector('.site-header').getBoundingClientRect().bottom);
    assert.ok(Math.abs(navTop - header) <= 2, '“Ver menú” deja la barra de categorías pegada a la cabecera');
    await context.close();
  });

  test('cada familia tiene su ilustración cargada y tarjetas compactas', async () => {
    const { page, context, problems } = await open('', { width: 390, height: 844 });
    await page.evaluate(async () => { for (let y = 0; y < document.body.scrollHeight; y += 300) { window.scrollTo(0, y); await new Promise((r) => setTimeout(r, 40)); } });
    await page.waitForTimeout(300);
    const r = await page.evaluate(() => [...document.querySelectorAll('.product')].map((p) => {
      const img = p.querySelector('.product__illus img');
      return { id: p.dataset.product, ok: Boolean(img && img.complete && img.naturalWidth > 0), h: Math.round(p.getBoundingClientRect().height) };
    }));
    for (const x of r) {
      assert.ok(x.ok, `${x.id}: ilustración cargada`);
      assert.ok(x.h <= 300, `${x.id}: tarjeta compacta (${x.h}px)`);
    }
    assert.deepEqual(problems, []);
    await context.close();
  });

  test('el contador de cada tarjeta refleja el pedido', async () => {
    const { page, context } = await open('');
    await addFromMenu(page, 'hamburguesa-simple', { qty: 2 });
    await addFromMenu(page, 'empanadas-pollo', { variant: 'empanadas-pollo-6' });
    await addFromMenu(page, 'empanadas-pollo', { variant: 'empanadas-pollo-12' });
    assert.equal(await page.locator('[data-product="hamburguesa-simple"] [data-in-cart]').textContent(), 'En tu pedido: 2');
    assert.equal(await page.locator('[data-product="empanadas-pollo"] [data-in-cart]').textContent(), 'En tu pedido: 2');
    assert.ok(await page.locator('[data-product="lomito"] [data-in-cart]').isHidden());
    await context.close();
  });
});

describe('identidad, contacto y barrios', () => {
  test('logo arriba y sin textos retirados (Antes Burguer Truck, imagen ilustrativa, pesos argentinos)', async () => {
    for (const width of [320, 390, 1440]) {
      const { page, context } = await open('', { width, height: 800 });
      const logo = page.locator('.site-header .brand__logo');
      assert.ok(await logo.isVisible(), `logo visible @${width}`);
      const box = await logo.boundingBox();
      assert.ok(box.y < 20 && box.width >= 40, `logo arriba y legible @${width}`);
      assert.equal(await logo.evaluate((i) => i.complete && i.naturalWidth > 0), true);
      const text = await page.evaluate(() => document.documentElement.innerText + ' ' + document.head.innerHTML);
      for (const bad of ['Antes Burguer Truck', 'antes Burguer Truck', 'ilustrativa', 'Precios en pesos argentinos']) assert.ok(!text.includes(bad), `${bad} @${width}`);
      await noHorizontalScroll(page, `cabecera ${width}`);
      await context.close();
    }
  });

  test('bebidas: sección visible con “Próximamente tendremos bebidas.” y enlace en la barra', async () => {
    const { page, context } = await open('#bebidas', { width: 390, height: 844 });
    assert.equal(await page.locator('#bebidas .menu-empty__text').textContent(), 'Próximamente tendremos bebidas.');
    assert.equal(await page.locator('.catnav__link', { hasText: 'Bebidas' }).count(), 1);
    assert.equal(await page.locator('#bebidas .product__add').count(), 0, 'nada para comprar todavía');
    await context.close();
  });

  test('contacto: logos de WhatsApp y Google Maps con enlaces y mensajes armados', async () => {
    const { page, context } = await open('#location', { width: 390, height: 844 });
    const maps = page.locator('#location .btn-maps');
    assert.equal(await maps.getAttribute('href'), liveBusiness().direccion.mapaUrl);
    assert.equal(await maps.locator('use').getAttribute('href'), '#i-logo-maps');
    const was = page.locator('#location .btn-wa');
    assert.equal(await was.count(), 2);
    const texts = await was.evaluateAll((as) => as.map((a) => decodeURIComponent(a.href.split('?text=')[1])));
    assert.deepEqual(texts, ['Hola, El Buen Sabor. Quiero hacer una consulta.', 'Hola, ¿cuáles son los medios de pago?']);
    for (const h of await was.evaluateAll((as) => as.map((a) => a.href))) assert.ok(h.startsWith(`https://wa.me/${liveBusiness().whatsapp.numero}?text=`));
    assert.equal(await page.locator('.site-footer .btn-wa').count(), 1);
    // Barrios con su costo, sin desplegable del sistema.
    const zones = await page.locator('.zones__item').allTextContents();
    assert.equal(zones.length, liveBusiness().modalidades.envio.zonas.length);
    assert.ok(zones.some((z) => z.includes('Barrio 80 Viviendas') && z.includes('$1.500')));
    assert.ok(zones.some((z) => z.includes('Villa Nueva') && z.includes('$3.000')));
    await context.close();
  });

  test('celular: al escribir la referencia se oculta el pie y el campo queda a la vista', async () => {
    const context = await browser.newContext({ viewport: { width: 390, height: 664 }, isMobile: true, hasTouch: true, locale: 'es-AR' });
    await context.route(/wa\.me/, (r) => r.abort());
    const page = await context.newPage();
    await page.goto(BASE, { waitUntil: 'networkidle' });
    await page.locator('[data-product="hamburguesa-simple"] .product__add').tap();
    await page.locator('.order-btn').tap();
    await page.locator('dialog[open]').waitFor();
    await page.locator('.choice__opt', { hasText: 'Envío a domicilio' }).tap();
    await page.locator('.zone-opt', { hasText: 'Zona Centro' }).tap();
    await page.locator('#c-reference').tap();
    await page.waitForTimeout(500);
    assert.ok(await page.locator('.cart__foot').isHidden(), 'el pie se oculta mientras se escribe');
    const r = await page.evaluate(() => {
      const f = document.getElementById('c-reference').getBoundingClientRect();
      const head = document.querySelector('.cart__head').getBoundingClientRect();
      return { top: f.top, bottom: f.bottom, head: head.bottom, vh: window.visualViewport.height };
    });
    assert.ok(r.top >= r.head && r.bottom <= r.vh, `campo visible (${r.top}-${r.bottom}, alto ${r.vh})`);
    await page.locator('#c-reference').fill('Frente a la plaza');
    await page.locator('.cart__title').tap();
    await page.waitForTimeout(200);
    assert.ok(await page.locator('.cart__foot').isVisible(), 'el pie vuelve al terminar de escribir');
    await context.close();
  });
});

describe('capturas', { skip: !SHOTS }, () => {
  test('inicio con carta y pedido en escritorio y móvil', async () => {
    for (const [w, h, tag] of [[1440, 900, 'escritorio'], [390, 844, 'movil']]) {
      const { page, context } = await open('', { width: w, height: h });
      await page.screenshot({ path: `${SHOTS}/inicio-${tag}.jpg`, type: 'jpeg', quality: 72 });
      await page.evaluate(async () => { for (let y = 0; y < document.body.scrollHeight; y += 400) { window.scrollTo(0, y); await new Promise((r) => setTimeout(r, 60)); } window.scrollTo(0, 0); });
      await page.waitForTimeout(300);
      await page.screenshot({ path: `${SHOTS}/inicio-completo-${tag}.jpg`, type: 'jpeg', quality: 65, fullPage: true });
      await page.locator('.catnav__link', { hasText: 'Sándwiches' }).click();
      await page.waitForTimeout(900);
      await page.screenshot({ path: `${SHOTS}/carta-sandwiches-${tag}.jpg`, type: 'jpeg', quality: 72 });
      await addFromMenu(page, 'lomito', { variant: 'lomito-con-papas' });
      await addFromMenu(page, 'milanesa-pollo');
      await page.locator('.catnav__link', { hasText: 'Empanadas' }).click();
      await page.waitForTimeout(900);
      await addFromMenu(page, 'empanadas-carne', { variant: 'empanadas-carne-12' });
      await page.screenshot({ path: `${SHOTS}/carta-con-pedido-${tag}.jpg`, type: 'jpeg', quality: 72 });
      await openCart(page);
      await page.screenshot({ path: `${SHOTS}/pedido-${tag}.jpg`, type: 'jpeg', quality: 72 });
      await context.close();
    }
  });
});
