// Panel de precios (admin.html) contra una API de GitHub SIMULADA.
// No se contacta a GitHub: toda petición a api.github.com la responde este archivo con los archivos locales.
import { test, before, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { chromium } from 'playwright-core';
import { createServer } from '../../scripts/serve.mjs';
import { buildSiteFiles, PAGES } from '../../js/core/build-core.js';
import { liveCatalog, liveBusiness } from '../unit/fixtures.js';

const require = createRequire(import.meta.url);
const AXE = readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8');
const read = (p) => readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n');

let server; let browser; let BASE;
before(async () => {
  server = createServer();
  await new Promise((r) => server.listen(0, r));
  BASE = `http://localhost:${server.address().port}/burguer_truck/`;
  browser = await chromium.launch({ channel: process.env.PW_CHANNEL || 'chrome' });
});
after(async () => { await browser?.close(); server?.close(); });

/** GitHub simulado. tokens: 'bueno' (escritura), 'lectura' (sin push); cualquier otro -> 401. */
async function openAdmin({ conflict = false, init } = {}) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'es-AR' });
  const calls = [];
  const posted = { tree: null, commit: null, patch: null };
  await context.route('https://api.github.com/**', async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const auth = req.headers().authorization || '';
    calls.push({ method: req.method(), url: req.url(), auth });
    const send = (status, body) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
    const token = auth.replace('Bearer ', '');
    if (!['bueno', 'lectura'].includes(token)) return send(401, { message: 'Bad credentials' });
    const p = url.pathname.replace('/repos/Misiomis/burguer_truck', '');
    if (url.pathname === '/user') return send(200, { login: 'duenio' });
    if (p === '') return send(200, { permissions: { push: token === 'bueno', pull: true } });
    if (p === '/git/ref/heads/main') return send(200, { object: { sha: 'base1' } });
    if (p.startsWith('/contents/')) {
      return route.fulfill({ status: 200, contentType: 'text/plain; charset=utf-8', body: read(decodeURIComponent(p.slice('/contents/'.length))) });
    }
    if (p === '/git/commits/base1') return send(200, { sha: 'base1', tree: { sha: 'tree1' } });
    if (p === '/git/trees' && req.method() === 'POST') { posted.tree = JSON.parse(req.postData()); return send(201, { sha: 'tree2' }); }
    if (p === '/git/commits' && req.method() === 'POST') { posted.commit = JSON.parse(req.postData()); return send(201, { sha: 'commit2' }); }
    if (p === '/git/refs/heads/main' && req.method() === 'PATCH') {
      posted.patch = JSON.parse(req.postData());
      return conflict ? send(422, { message: 'Update is not a fast forward' }) : send(200, { object: { sha: 'commit2' } });
    }
    return send(404, { message: 'no simulado: ' + p });
  });
  if (init) await context.addInitScript(init);
  const page = await context.newPage();
  const problems = [];
  page.on('pageerror', (e) => problems.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('401')) problems.push(m.text()); });
  await page.goto(BASE + 'admin.html', { waitUntil: 'networkidle' });
  return { page, context, calls, posted, problems };
}

async function login(page, token = 'bueno', remember = false) {
  await page.locator('#token').fill(token);
  if (remember) await page.locator('input[name="remember"]').check();
  await page.locator('[data-login-form] button[type="submit"]').click();
}

const priceInput = (page, product) => page.getByRole('textbox', { name: `Precio de ${product}`, exact: true });

describe('panel de precios', () => {
  test('token inválido o sin permiso de escritura: no entra y no se guarda', async () => {
    const { page, context } = await openAdmin();
    await login(page, 'cualquiera');
    await page.locator('[data-token-error]:not([hidden])').waitFor();
    assert.match(await page.locator('[data-token-error]').textContent(), /no es válido/);
    await login(page, 'lectura');
    await page.waitForFunction(() => /no modificar/.test(document.querySelector('[data-token-error]').textContent));
    assert.ok(await page.locator('[data-edit-view]').isHidden());
    const stored = await page.evaluate(() => [sessionStorage.getItem('ebs:admin:token'), localStorage.getItem('ebs:admin:token')]);
    assert.deepEqual(stored, [null, null]);
    await context.close();
  });

  test('editar, validar, revisar y publicar: commit con los mismos archivos que el build', async () => {
    const { page, context, calls, posted, problems } = await openAdmin();
    await login(page);
    await page.locator('[data-edit-view]:not([hidden])').waitFor();
    assert.equal(await page.evaluate(() => sessionStorage.getItem('ebs:admin:token')), 'bueno');
    assert.equal(await page.evaluate(() => localStorage.getItem('ebs:admin:token')), null, 'sin “recordar” no queda en el dispositivo');

    const simple = priceInput(page, 'Hamburguesa simple');
    assert.equal(await simple.inputValue(), '4500');
    await simple.fill('5,5');
    assert.ok(await page.locator('[data-review]').isDisabled(), 'no se publica con errores');
    assert.equal(await simple.getAttribute('aria-invalid'), 'true');
    await simple.fill('5.000');
    await page.getByRole('combobox', { name: 'Estado de Lomito, sin papas', exact: true }).selectOption('agotado');
    await page.getByRole('textbox', { name: 'Barrio 80 Viviendas', exact: true }).fill('2000');
    assert.match(await page.locator('[data-change-count]').textContent(), /3 cambios/);

    await page.locator('[data-review]').click();
    const items = await page.locator('[data-change-list] li').allTextContents();
    assert.deepEqual(items.sort(), ['Envío a Barrio 80 Viviendas: a confirmar → $2.000', 'Hamburguesa simple: $4.500 → $5.000', 'Lomito (sin papas): disponible → agotado'].sort());
    await page.locator('[data-publish]').click();
    await page.waitForFunction(() => /Publicado: 3 cambios/.test(document.querySelector('[data-status]').textContent));

    // El commit contiene exactamente lo que generaría `npm run build` con esos datos.
    const files = Object.fromEntries(posted.tree.tree.map((e) => [e.path, e.content]));
    const catalog = JSON.parse(files['data/catalogo.json']);
    const business = JSON.parse(files['data/negocio.json']);
    assert.equal(catalog.productos.find((p) => p.id === 'hamburguesa-simple').variantes[0].precio, 5000);
    const expected = buildSiteFiles({ catalog, business, pages: Object.fromEntries(PAGES.map((p) => [p, read(p)])) });
    assert.deepEqual(Object.keys(files).sort(), Object.keys(expected.files).sort());
    for (const [path, content] of Object.entries(expected.files)) assert.equal(files[path], content, path);
    assert.ok(files['menu.html'].includes('$5.000'));
    assert.equal(posted.tree.base_tree, 'tree1');
    assert.deepEqual(posted.commit.parents, ['base1']);
    assert.match(posted.commit.message, /Precios actualizados desde el panel \(3 cambios\)/);
    assert.equal(posted.patch.force, false);
    assert.ok(calls.every((c) => !c.url.includes('bueno')), 'el token nunca va en la URL');
    assert.deepEqual(problems, []);
    await context.close();
  });

  test('conflicto: si la rama cambió, no se pisa nada y se avisa', async () => {
    const { page, context } = await openAdmin({ conflict: true });
    await login(page);
    await page.locator('[data-edit-view]:not([hidden])').waitFor();
    await priceInput(page, 'Hamburguesa completa').fill('7000');
    await page.locator('[data-review]').click();
    await page.locator('[data-publish]').click();
    await page.waitForFunction(() => /No se publicó/.test(document.querySelector('[data-status]').textContent));
    assert.equal(await priceInput(page, 'Hamburguesa completa').inputValue(), '7000', 'los cambios siguen en pantalla');
    await context.close();
  });

  test('recordar en este dispositivo y salir borran o conservan el token según corresponde', async () => {
    const { page, context } = await openAdmin();
    await login(page, 'bueno', true);
    await page.locator('[data-edit-view]:not([hidden])').waitFor();
    assert.equal(await page.evaluate(() => localStorage.getItem('ebs:admin:token')), 'bueno');
    await page.reload({ waitUntil: 'networkidle' });
    await page.locator('[data-edit-view]:not([hidden])').waitFor();
    await page.locator('[data-logout]').click();
    assert.deepEqual(await page.evaluate(() => [sessionStorage.getItem('ebs:admin:token'), localStorage.getItem('ebs:admin:token')]), [null, null]);
    assert.ok(await page.locator('[data-login-view]').isVisible());
    await context.close();
  });

  test('accesibilidad del panel (ingreso, edición y revisión)', async () => {
    const { page, context } = await openAdmin();
    const run = async (label) => {
      await page.addScriptTag({ content: AXE });
      const res = await page.evaluate(() => window.axe.run(document, { runOnly: ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa', 'best-practice'] }));
      const v = res.violations.filter((x) => ['serious', 'critical', 'moderate'].includes(x.impact));
      assert.deepEqual(v.map((x) => `${x.id}: ${x.nodes.slice(0, 3).map((n) => n.target.join(' ')).join(' | ')}`), [], label);
    };
    await run('ingreso');
    await login(page);
    await page.locator('[data-edit-view]:not([hidden])').waitFor();
    await run('edición');
    await priceInput(page, 'Hamburguesa simple').fill('4600');
    await page.locator('[data-review]').click();
    await run('revisión');
    const { sw, cw } = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
    assert.ok(sw <= cw, 'sin scroll horizontal a 390 px');
    await context.close();
  });
});
