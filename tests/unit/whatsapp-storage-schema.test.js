import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { emptyCart, addItem, computeTotals } from '../../js/core/cart.js';
import { buildOrderMessage, buildWhatsAppUrl, cleanText, validateCheckout, MAX_MESSAGE, CONTACT_MESSAGES, isFullName } from '../../js/core/whatsapp.js';
import { loadCart, saveCart, serializeCart, detectLegacy, CART_KEY, LEGACY_KEYS } from '../../js/core/storage.js';
import { validateCatalog, validateBusiness } from '../../js/core/schema.js';
import { buildOutputs, applyBlocks } from '../../scripts/build.mjs';
import { catalog, business, liveCatalog, liveBusiness, businessConfirmedFixture, MemoryStorage, BlockedStorage } from './fixtures.js';
import { formatARS } from '../../js/core/money.js';

const cart30 = (cat) => {
  let c = emptyCart();
  c = addItem(c, cat, 'empanadas-carne', 'empanadas-carne-12').cart;
  c = addItem(c, cat, 'milanesa-pollo', 'milanesa-pollo').cart;
  return addItem(c, cat, 'papas-fritas', 'papas-mediana-caja').cart;
};

describe('mensaje de WhatsApp', () => {
  test('mensaje ordenado: cliente, entrega, referencia, detalle, totales y observaciones', () => {
    const cat = catalog();
    const biz = businessConfirmedFixture();
    let c = cart30(cat);
    c = addItem(c, cat, 'empanadas-pollo', 'empanadas-pollo-6', 2).cart;
    const t = computeTotals(c, cat, biz, { mode: 'envio', zoneId: 'zona-test' });
    const msg = buildOrderMessage(t, { name: 'Ana Gómez', reference: 'Portón verde', notes: 'Sin sal' }, biz);
    const lines = msg.split('\n');
    assert.equal(lines[0], '*🧾 NUEVO PEDIDO · EL BUEN SABOR*');
    for (const expected of [
      '👤 *Cliente:* Ana Gómez',
      '🛵 *Entrega:* Envío a domicilio · Zona de prueba',
      '📍 *Referencia:* Portón verde',
      '*DETALLE*',
      '• 1 × Empanadas de carne · Docena (12 u.)',
      '   *$14.000*',
      '• 2 × Empanadas de pollo · Media docena (6 u.)',
      '   $7.000 c/u → *$14.000*',
      'Subtotal: $44.000',
      'Envío: $1.500',
      '*TOTAL: $45.500*',
      '📝 *Observaciones:* Sin sal',
    ]) assert.ok(lines.includes(expected), `falta: ${expected}\n${msg}`);
    // Orden: cliente antes del detalle; total después del subtotal.
    assert.ok(lines.indexOf('👤 *Cliente:* Ana Gómez') < lines.indexOf('*DETALLE*'));
    assert.ok(lines.indexOf('Subtotal: $44.000') < lines.indexOf('*TOTAL: $45.500*'));
    assert.doesNotMatch(msg, /undefined|null|NaN|<|>/);
  });

  test('envío pendiente y modalidad a coordinar no inventan total', () => {
    const cat = catalog();
    const pend = computeTotals(cart30(cat), cat, businessConfirmedFixture(), { mode: 'envio', zoneId: 'zona-pendiente' });
    const m1 = buildOrderMessage(pend, {}, business());
    assert.ok(m1.includes('Envío: a confirmar'));
    assert.ok(m1.includes('*TOTAL: a confirmar*'));
    const real = computeTotals(cart30(cat), cat, business(), { mode: null, zoneId: null });
    const m2 = buildOrderMessage(real, {}, business());
    assert.ok(m2.includes('🛵 *Entrega:* a coordinar'));
    assert.ok(m2.includes('*TOTAL: a confirmar*'));
  });

  test('retiro: sin línea de envío ni referencia aunque se haya escrito', () => {
    const cat = catalog();
    const t = computeTotals(cart30(cat), cat, businessConfirmedFixture(), { mode: 'retiro', zoneId: null });
    const msg = buildOrderMessage(t, { name: 'Ana Gómez', reference: 'Calle 1' }, business());
    assert.ok(msg.includes('🏠 *Entrega:* Retiro en el local'));
    assert.ok(msg.includes('*TOTAL: $30.000*'));
    assert.ok(!msg.includes('Referencia') && !msg.includes('Envío:'));
  });

  test('enlaces de consulta con mensaje armado', () => {
    const biz = businessConfirmedFixture();
    const url = buildWhatsAppUrl(biz, CONTACT_MESSAGES.pagos);
    assert.equal(decodeURIComponent(url.split('?text=')[1]), 'Hola, ¿cuáles son los medios de pago?');
  });

  test('limpia HTML, controles y largos excesivos', () => {
    assert.equal(cleanText('  <b>Hola</b>\n\tmundo\u0000 ', 100), 'bHola/b mundo');
    assert.equal(cleanText(undefined, 10), '');
    assert.equal(cleanText('x'.repeat(500), 60).length, 60);
  });

  test('acentos, ñ, &, + y saltos se codifican y se recuperan intactos', () => {
    const cat = catalog();
    const biz = businessConfirmedFixture();
    const t = computeTotals(cart30(cat), cat, biz, { mode: 'retiro', zoneId: null });
    const notes = 'Ñandú & café + 50% "comillas" #hash ?q=1';
    const msg = buildOrderMessage(t, { notes }, biz);
    const url = buildWhatsAppUrl(biz, msg);
    assert.ok(url.startsWith('https://wa.me/5490000000000?text='));
    const decoded = decodeURIComponent(new URL(url).search.slice('?text='.length));
    assert.equal(decoded, msg);
    assert.ok(decoded.includes(notes));
    // El parámetro text no puede llevar espacios, &, # ni + sin codificar (cortarían o alterarían el mensaje).
    assert.doesNotMatch(url.split('?text=')[1], /[\s&#+]/);
  });

  test('el mensaje respeta un largo máximo', () => {
    const cat = catalog();
    const t = computeTotals(cart30(cat), cat, business());
    const msg = buildOrderMessage(t, { notes: 'a'.repeat(5000), name: 'b'.repeat(500), reference: 'c'.repeat(500) }, business());
    assert.ok(msg.length <= MAX_MESSAGE);
  });

  test('sin número confirmado no hay enlace (nunca un número supuesto)', () => {
    assert.equal(buildWhatsAppUrl(business(), 'hola'), null);
    const b = businessConfirmedFixture();
    b.whatsapp.numero = '+54 9 11';
    assert.equal(buildWhatsAppUrl(b, 'hola'), null);
  });

  test('validación del checkout por modalidad', () => {
    const cat = catalog();
    const biz = businessConfirmedFixture();
    const modes = ['retiro', 'envio'];
    const ok = { name: 'Ana Gómez' };
    const none = computeTotals(cart30(cat), cat, biz, { mode: null });
    assert.ok(validateCheckout(none, ok, modes).mode);
    const retiro = computeTotals(cart30(cat), cat, biz, { mode: 'retiro' });
    assert.deepEqual(validateCheckout(retiro, ok, modes), {}, 'retiro no exige barrio ni referencia');
    const envio = computeTotals(cart30(cat), cat, biz, { mode: 'envio', zoneId: null });
    const e = validateCheckout(envio, { ...ok, reference: '  ' }, modes);
    assert.ok(e.zone && e.reference);
    assert.deepEqual(validateCheckout(computeTotals(cart30(cat), cat, business()), ok, []), {}, 'sin modalidades confirmadas no se exige elegir');
  });

  test('nombre y apellido obligatorios', () => {
    const cat = catalog();
    const t = computeTotals(cart30(cat), cat, businessConfirmedFixture(), { mode: 'retiro' });
    for (const bad of ['', 'Ana', '  Ana  ', 'A B', '12 34']) assert.ok(validateCheckout(t, { name: bad }, ['retiro']).name, bad);
    for (const good of ['Ana Gómez', 'María de los Ángeles', 'José  Pérez']) assert.equal(validateCheckout(t, { name: good }, ['retiro']).name, undefined, good);
    assert.equal(isFullName('Ñandú Ñúñez'), true);
  });
});

describe('persistencia', () => {
  test('guarda solo líneas, precio visto y modalidad (sin datos personales)', () => {
    const cat = catalog();
    const s = new MemoryStorage();
    assert.equal(saveCart(s, cart30(cat), cat, { mode: 'envio', zoneId: 'z' }), true);
    const raw = s.getItem(CART_KEY);
    assert.doesNotMatch(raw, /address|name|notes|reference/);
    const { data, problem } = loadCart(s);
    assert.equal(problem, null);
    assert.equal(data.lines.length, 3);
    assert.equal(data.lines[0].seenPrice, 14000);
  });

  test('JSON corrupto, esquema ajeno y almacenamiento bloqueado no rompen', () => {
    assert.equal(loadCart(new MemoryStorage({ [CART_KEY]: '{no es json' })).problem, 'corrupto');
    assert.equal(loadCart(new MemoryStorage({ [CART_KEY]: '{"schema":"otro","version":1,"lines":[]}' })).problem, 'formato');
    assert.equal(loadCart(new MemoryStorage({ [CART_KEY]: '{"schema":"ebs.pedido","version":0,"lines":[]}' })).problem, 'formato');
    assert.equal(loadCart(new BlockedStorage()).problem, 'lectura');
    assert.equal(saveCart(new BlockedStorage(), emptyCart(), catalog(), {}), false);
    assert.equal(loadCart(null).problem, 'sin-almacenamiento');
  });

  test('vaciar elimina solo la clave propia', () => {
    const cat = catalog();
    const s = new MemoryStorage({ otraApp: 'x', bt_products_v1: '[]' });
    saveCart(s, cart30(cat), cat, {});
    saveCart(s, emptyCart(), cat, {});
    assert.equal(s.getItem(CART_KEY), null);
    assert.equal(s.getItem('otraApp'), 'x');
    assert.equal(s.getItem('bt_products_v1'), '[]');
  });

  test('detecta datos de la web anterior sin reutilizarlos', () => {
    const s = new MemoryStorage({ bt_products_v1: '[{"pid":"simple","price":"$3.000"}]', bt_hoods_v1: '[]' });
    const found = detectLegacy(s);
    assert.deepEqual(found.map((f) => f.key), LEGACY_KEYS);
    assert.equal(loadCart(s).data, null, 'no se interpretan como pedido');
  });

  test('serializa la versión de catálogo', () => {
    const cat = catalog();
    assert.equal(serializeCart(emptyCart(), cat, {}).catalogVersion, cat.actualizado);
  });
});

describe('validación de datos canónicos', () => {
  test('los JSON del proyecto y los de prueba son válidos', () => {
    assert.deepEqual(validateCatalog(liveCatalog()), []);
    assert.deepEqual(validateBusiness(liveBusiness()), []);
    assert.deepEqual(validateCatalog(catalog()), []);
    assert.deepEqual(validateBusiness(business()), []);
    assert.deepEqual(validateBusiness(businessConfirmedFixture()), []);
  });

  test('detecta errores típicos de edición', () => {
    const cat = catalog();
    cat.productos[0].variantes[0].precio = '7000';
    cat.productos[1].variantes[0].precio = 0;
    cat.productos[1].variantes[0].precioEstado = 'pendiente';
    cat.productos[2].variantes[0].id = 'empanadas-carne-6';
    cat.productos[3].categoria = 'bebidas';
    const errs = validateCatalog(cat).join('\n');
    assert.match(errs, /precio confirmado debe ser un entero/);
    assert.match(errs, /pendiente debe ser null/);
    assert.match(errs, /id repetido/);
    assert.match(errs, /categoría inexistente/);
  });

  test('rechaza URLs peligrosas y números mal formados', () => {
    const b = business();
    b.direccion.mapaUrl = 'javascript:alert(1)';
    b.redes = [{ nombre: 'X', url: 'http://inseguro.example' }];
    b.whatsapp = { estado: 'confirmado', numero: '12' };
    const errs = validateBusiness(b).join('\n');
    assert.match(errs, /mapaUrl/);
    assert.match(errs, /Red 1/);
    assert.match(errs, /whatsapp.numero/);
  });
});

describe('build y prerender', () => {
  test('el HTML generado escapa los textos editables', async () => {
    const cat = catalog();
    cat.productos[0].nombre = '<img src=x onerror=alert(1)>';
    cat.productos[0].descripcion = '"><script>alert(1)</script>';
    const { blocksFor } = await buildOutputs({ catalog: cat, business: business() });
    const b = blocksFor('menu');
    assert.doesNotMatch(b['menu-carta'], /<img src=x|<script>alert/);
    assert.match(b['menu-carta'], /&lt;img src=x/);
    assert.doesNotMatch(b.jsonld.slice(35, -9), /<\/?script/i);
  });

  test('datos inválidos detienen el build', async () => {
    const cat = catalog();
    cat.productos[0].variantes[0].precio = -5;
    await assert.rejects(() => buildOutputs({ catalog: cat, business: business() }), /Datos inválidos/);
  });

  test('el prerender muestra cada precio vigente de data/ y ninguno de la carta vieja', async () => {
    const { blocksFor } = await buildOutputs();
    const carta = blocksFor('menu')['menu-carta'];
    for (const p of liveCatalog().productos) {
      assert.ok(carta.includes(p.nombre), p.nombre);
      for (const v of p.variantes) assert.ok(carta.includes(formatARS(v.precio)), `${p.nombre} ${v.presentacion}`);
    }
    for (const old of ['$3.000', '$5.000', '$8.000', '$13.000', '$15.000', '$2.000', 'Consultá precio', 'Coca', 'Combo', 'Brahma', 'cono']) assert.ok(!carta.includes(old), old);
  });

  test('JSON-LD: solo datos confirmados, nunca reseñas ni puntajes', async () => {
    const strip = (html) => JSON.parse(html.replace(/^<script[^>]*>|<\/script>$/g, ''));
    const pending = await buildOutputs({ catalog: catalog(), business: business() });
    const ldP = strip(pending.blocksFor('index').jsonld);
    for (const k of ['address', 'telephone', 'aggregateRating', 'review']) assert.equal(ldP[k], undefined, k);
    const ld = strip((await buildOutputs()).blocksFor('index').jsonld);
    assert.equal(ld.name, 'El Buen Sabor');
    assert.equal(ld.alternateName, undefined, 'sin el nombre anterior');
    assert.equal(ld.telephone, '+' + liveBusiness().whatsapp.numero);
    assert.equal(ld.address.streetAddress, liveBusiness().direccion.texto);
    for (const k of ['aggregateRating', 'review']) assert.equal(ld[k], undefined, k);
  });

  test('applyBlocks rechaza bloques desconocidos', () => {
    assert.throws(() => applyBlocks('<!-- build:nada --><!-- /build:nada -->', {}, 'x.html'), /desconocido/);
  });
});
