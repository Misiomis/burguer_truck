import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parsePriceInput, listChanges, commitMessage, todayISO } from '../../js/admin/cambios.js';
import { buildSiteFiles, shortHash, PAGES } from '../../js/core/build-core.js';
import { createGitHub } from '../../js/admin/github.js';
import { liveCatalog, liveBusiness } from './fixtures.js';

const read = (p) => readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8');

describe('panel: precios escritos a mano', () => {
  test('acepta formatos habituales', () => {
    for (const [raw, value] of [['7000', 7000], ['7.000', 7000], ['$ 7.000', 7000], ['$7000', 7000], [' 15.500 ', 15500], ['0', 0], ['1.000.000', 1000000]]) {
      assert.deepEqual(parsePriceInput(raw), { ok: true, value }, raw);
    }
  });
  test('vacío es “a confirmar” (null), nunca 0', () => {
    assert.deepEqual(parsePriceInput(''), { ok: true, value: null });
    assert.deepEqual(parsePriceInput('   '), { ok: true, value: null });
  });
  test('rechaza decimales, negativos, texto y separadores mal puestos', () => {
    for (const raw of ['7,50', '7000.5', '-100', 'abc', '7.00', '70.00.0', '1e3', '$', '7 000x']) {
      assert.equal(parsePriceInput(raw).ok, false, raw);
    }
  });
});

describe('panel: cambios y commit', () => {
  test('lista precios, estados y tarifas modificados', () => {
    const before = { catalog: liveCatalog(), business: liveBusiness() };
    const after = { catalog: liveCatalog(), business: liveBusiness() };
    after.catalog.productos[0].variantes[0].precio = 5000;
    after.catalog.productos[3].variantes[1].estado = 'agotado';
    after.catalog.productos[3].variantes[0].precio = null;
    after.business.modalidades.envio.zonas[0].tarifa = 0;
    const list = listChanges(before, after).map((c) => c.text);
    assert.ok(list.includes('Hamburguesa simple: $4.500 → $5.000'), list.join('\n'));
    assert.ok(list.includes('Lomito (sin papas): disponible → agotado'));
    assert.ok(list.includes('Lomito (con papas): $15.500 → a confirmar'));
    assert.ok(list.includes('Envío a Zona Centro: $1.000 → sin cargo'));
    assert.equal(listChanges(before, before).length, 0);
    const msg = commitMessage(listChanges(before, after), 'dueño');
    assert.match(msg, /^Carta actualizada desde el panel \(4 cambios\)/);
    assert.match(msg, /Publicado por dueño/);
  });
  test('fecha local en formato ISO', () => {
    assert.equal(todayISO(new Date(2026, 10, 7)), '2026-11-07');
  });
});

describe('build compartido (CLI y panel)', () => {
  test('el panel genera exactamente los mismos archivos que hay en el repositorio', () => {
    const pages = Object.fromEntries(PAGES.map((p) => [p, read(p)]));
    const { files } = buildSiteFiles({ catalog: liveCatalog(), business: liveBusiness(), pages });
    for (const [path, content] of Object.entries(files)) {
      assert.equal(content, read(path).replace(/\r\n/g, '\n'), path);
    }
  });
  test('un cambio de precio cambia la versión de datos y aparece en las páginas', () => {
    const pages = Object.fromEntries(PAGES.map((p) => [p, read(p)]));
    const cat = liveCatalog();
    cat.productos[0].variantes[0].precio = 4900;
    const a = buildSiteFiles({ catalog: liveCatalog(), business: liveBusiness(), pages });
    const b = buildSiteFiles({ catalog: cat, business: liveBusiness(), pages });
    assert.notEqual(a.version, b.version);
    assert.ok(b.files['index.html'].includes('$4.900'));
    assert.ok(b.files['index.html'].includes(`content="${b.version}"`));
    assert.ok(b.files['js/data/datos.js'].includes('"precio": 4900'));
  });
  test('hash estable', () => {
    assert.equal(shortHash('abc'), shortHash('abc'));
    assert.notEqual(shortHash('abc'), shortHash('abd'));
    assert.match(shortHash(''), /^[0-9a-f]{8}$/);
  });
});

describe('cliente de GitHub', () => {
  const fakeFetch = (handler) => async (url, opts) => handler(url, opts);
  const json = (status, body) => ({ status, ok: status < 400, json: async () => body, text: async () => JSON.stringify(body) });

  test('token inválido, sin permiso y conflicto se distinguen', async () => {
    const gh401 = createGitHub('x', { fetchImpl: fakeFetch(() => json(401, {})) });
    await assert.rejects(gh401.check(), (e) => e.kind === 'auth');
    const ghRead = createGitHub('x', { fetchImpl: fakeFetch((u) => json(200, u.endsWith('/user') ? { login: 'a' } : { permissions: { push: false } })) });
    assert.deepEqual(await ghRead.check(), { login: 'a', canWrite: false });
    const gh422 = createGitHub('x', { fetchImpl: fakeFetch((u, o) => (o.method === 'PATCH' ? json(422, {}) : json(200, { sha: 's', tree: { sha: 't' } }))) });
    await assert.rejects(gh422.commitFiles({ files: { a: 'b' }, message: 'm', parentSha: 'p' }), (e) => e.kind === 'conflicto');
  });

  test('envía el token solo en la cabecera Authorization y nunca fuerza la rama', async () => {
    const calls = [];
    const gh = createGitHub('secreto', { fetchImpl: fakeFetch((u, o) => { calls.push({ u, o }); return json(200, { sha: 'c1', tree: { sha: 't1' }, object: { sha: 'h' } }); }) });
    await gh.commitFiles({ files: { 'data/catalogo.json': '{}\n' }, message: 'm', parentSha: 'p' });
    for (const c of calls) {
      assert.ok(!c.u.includes('secreto'));
      assert.equal(c.o.headers.Authorization, 'Bearer secreto');
    }
    const patch = calls.find((c) => c.o.method === 'PATCH');
    assert.equal(JSON.parse(patch.o.body).force, false);
    const tree = calls.find((c) => c.u.endsWith('/git/trees'));
    assert.deepEqual(JSON.parse(tree.o.body).tree[0], { path: 'data/catalogo.json', mode: '100644', type: 'blob', content: '{}\n' });
  });
});

describe('bebidas y barrios desde el panel', () => {
  test('categoría vacía muestra el mensaje y una bebida con foto usa su foto', async () => {
    const { renderMenu } = await import('../../js/core/render.js');
    const cat = liveCatalog();
    assert.ok(renderMenu(cat).includes('Próximamente tendremos bebidas.'));
    cat.productos.push({ id: 'bebida-x', categoria: 'bebidas', nombre: 'Agua', foto: 'assets/fotos/bebida-x-1.webp', estado: 'disponible',
      variantes: [{ id: 'bebida-x', presentacion: '500 ml', unidades: 1, precio: 1500, precioEstado: 'confirmado', estado: 'disponible' }] });
    const html = renderMenu(cat);
    assert.ok(!html.includes('Próximamente tendremos bebidas.'));
    assert.ok(html.includes('src="assets/fotos/bebida-x-1.webp"'));
    assert.ok(html.includes('$1.500'));
  });

  test('cambios: productos y barrios nuevos o quitados', () => {
    const before = { catalog: liveCatalog(), business: liveBusiness() };
    const after = { catalog: liveCatalog(), business: liveBusiness() };
    after.catalog.productos.push({ id: 'bebida-y', categoria: 'bebidas', nombre: 'Sprite', estado: 'disponible',
      variantes: [{ id: 'bebida-y', presentacion: 'Lata', unidades: 1, precio: 2000, precioEstado: 'confirmado', estado: 'disponible' }] });
    after.business.modalidades.envio.zonas.push({ id: 'nuevo', nombre: 'Nuevo', tarifa: 0, tarifaEstado: 'confirmada' });
    after.business.modalidades.envio.zonas.splice(0, 1);
    const list = listChanges(before, after).map((c) => c.text);
    assert.ok(list.includes('Nuevo producto: Sprite (Lata) · $2.000'), list.join(' | '));
    assert.ok(list.includes('Nuevo barrio con envío: Nuevo · sin cargo'));
    assert.ok(list.includes('Se quita el barrio Zona Centro'));
  });
});
