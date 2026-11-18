import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  emptyCart, addItem, setQty, removeItem, computeTotals, reconcile, purchasability,
  normalizeQty, countPacks, availableModes, MAX_QTY,
} from '../../js/core/cart.js';
import { formatARS } from '../../js/core/money.js';
import { catalog, business, businessConfirmedFixture, liveCatalog, liveBusiness } from './fixtures.js';

const add = (cart, cat, p, v, q = 1) => {
  const r = addItem(cart, cat, p, v, q);
  assert.equal(r.error, null, `no debería fallar: ${p}/${v}`);
  return r.cart;
};

describe('formato de importes', () => {
  test('usa el formato del manual', () => {
    assert.equal(formatARS(14000), '$14.000');
    assert.equal(formatARS(7000), '$7.000');
    assert.equal(formatARS(0), '$0');
  });
  test('rechaza importes no enteros', () => {
    assert.throws(() => formatARS(10.5));
    assert.throws(() => formatARS(NaN));
  });
});

describe('casos de cálculo del encargo (sin envío)', () => {
  const cat = catalog();
  const biz = business();

  test('1 media docena de carne = $7.000', () => {
    const c = add(emptyCart(), cat, 'empanadas-carne', 'empanadas-carne-6');
    const t = computeTotals(c, cat, biz);
    assert.equal(t.subtotal, 7000);
  });

  test('2 medias docenas de carne = $14.000, 2 packs, 12 unidades', () => {
    const c = add(emptyCart(), cat, 'empanadas-carne', 'empanadas-carne-6', 2);
    const t = computeTotals(c, cat, biz);
    assert.equal(t.subtotal, 14000);
    assert.equal(t.packs, 2);
    assert.equal(t.lines[0].units, 12);
  });

  test('1 docena de pollo = $14.000', () => {
    const c = add(emptyCart(), cat, 'empanadas-pollo', 'empanadas-pollo-12');
    assert.equal(computeTotals(c, cat, biz).subtotal, 14000);
  });

  test('1 docena de carne + 1 milanesa de pollo + 1 papas = $30.000', () => {
    let c = add(emptyCart(), cat, 'empanadas-carne', 'empanadas-carne-12');
    c = add(c, cat, 'milanesa-pollo', 'milanesa-pollo');
    c = add(c, cat, 'papas-fritas', 'papas-mediana-caja');
    assert.equal(computeTotals(c, cat, biz).subtotal, 30000);
  });

  test('media docena de carne + media docena de pollo = $14.000 en variantes separadas', () => {
    let c = add(emptyCart(), cat, 'empanadas-carne', 'empanadas-carne-6');
    c = add(c, cat, 'empanadas-pollo', 'empanadas-pollo-6');
    const t = computeTotals(c, cat, biz);
    assert.equal(t.subtotal, 14000);
    assert.equal(t.lines.length, 2);
  });

  test('6 y 12 unidades del mismo sabor no se fusionan; misma variante sí suma', () => {
    let c = add(emptyCart(), cat, 'empanadas-carne', 'empanadas-carne-6');
    c = add(c, cat, 'empanadas-carne', 'empanadas-carne-12');
    c = add(c, cat, 'empanadas-carne', 'empanadas-carne-6');
    assert.equal(c.lines.length, 2);
    assert.equal(c.lines.find((l) => l.variantId === 'empanadas-carne-6').qty, 2);
  });
});

describe('modalidades, envío y total', () => {
  const cat = catalog();
  const pedido30 = () => {
    let c = add(emptyCart(), cat, 'empanadas-carne', 'empanadas-carne-12');
    c = add(c, cat, 'milanesa-pollo', 'milanesa-pollo');
    return add(c, cat, 'papas-fritas', 'papas-mediana-caja');
  };

  test('con los datos reales (pendientes) no hay modalidades elegibles ni total final', () => {
    const biz = business();
    assert.deepEqual(availableModes(biz), []);
    const t = computeTotals(pedido30(), cat, biz, { mode: 'retiro', zoneId: null });
    assert.equal(t.mode, null, 'no acepta una modalidad no confirmada');
    assert.equal(t.subtotal, 30000);
    assert.equal(t.total, null);
  });

  test('retiro confirmado: subtotal = total y no exige zona', () => {
    const biz = businessConfirmedFixture();
    const t = computeTotals(pedido30(), cat, biz, { mode: 'retiro', zoneId: null });
    assert.equal(t.shipping.status, 'no-aplica');
    assert.equal(t.total, 30000);
  });

  test('envío con tarifa de prueba $1.500: $30.000 -> $31.500', () => {
    const t = computeTotals(pedido30(), cat, businessConfirmedFixture(), { mode: 'envio', zoneId: 'zona-test' });
    assert.equal(t.shipping.amount, 1500);
    assert.equal(t.total, 31500);
  });

  test('envío desconocido: subtotal $30.000, envío pendiente y sin total inventado', () => {
    const t = computeTotals(pedido30(), cat, businessConfirmedFixture(), { mode: 'envio', zoneId: 'zona-pendiente' });
    assert.equal(t.subtotal, 30000);
    assert.equal(t.shipping.status, 'pendiente');
    assert.equal(t.shipping.amount, null);
    assert.equal(t.total, null);
  });

  test('envío gratuito confirmado = 0 y sí hay total', () => {
    const t = computeTotals(pedido30(), cat, businessConfirmedFixture(), { mode: 'envio', zoneId: 'zona-gratis' });
    assert.equal(t.shipping.status, 'confirmado');
    assert.equal(t.shipping.amount, 0);
    assert.equal(t.total, 30000);
  });

  test('envío sin zona elegida: sin total', () => {
    const t = computeTotals(pedido30(), cat, businessConfirmedFixture(), { mode: 'envio', zoneId: null });
    assert.equal(t.shipping.status, 'sin-elegir');
    assert.equal(t.total, null);
  });
});

describe('precio desconocido y productos no comprables', () => {
  test('una variante con precio pendiente no se puede agregar ni suma $0', () => {
    const cat = catalog();
    const v = cat.productos[0].variantes[0];
    v.precio = null; v.precioEstado = 'pendiente';
    const r = addItem(emptyCart(), cat, 'empanadas-carne', v.id);
    assert.equal(r.error, 'precio-pendiente');
    assert.equal(r.cart.lines.length, 0);
    // Aun si una línea vieja apunta a ella, no produce una línea de $0.
    const t = computeTotals({ lines: [{ productId: 'empanadas-carne', variantId: v.id, qty: 2 }] }, cat, business());
    assert.equal(t.lines[0].lineTotal, null);
    assert.equal(t.lines[0].status, 'precio-pendiente');
    assert.equal(t.subtotal, 0);
    assert.equal(t.subtotalComplete, false);
  });

  test('agotado y oculto no se pueden pedir', () => {
    const cat = catalog();
    cat.productos[2].estado = 'agotado';
    cat.productos[3].variantes[0].estado = 'oculto';
    assert.equal(purchasability(cat, 'milanesa-carne', 'milanesa-carne').reason, 'agotado');
    assert.equal(purchasability(cat, 'milanesa-pollo', 'milanesa-pollo').reason, 'oculto');
  });

  test('productos futuros, históricos, bebidas y combos viejos no existen como comprables', () => {
    const cat = catalog();
    for (const id of ['lomitos', 'pizzas', 'hamburguesas', 'simple', 'coca', 'combo-completa', 'kingkong']) {
      const r = addItem(emptyCart(), cat, id, id);
      assert.equal(r.error, 'inexistente', id);
    }
  });
});

describe('cantidades', () => {
  const cat = catalog();
  test('normaliza y rechaza valores inválidos', () => {
    assert.equal(normalizeQty(3), 3);
    assert.equal(normalizeQty('4'), 4);
    assert.equal(normalizeQty(-2), 0);
    assert.equal(normalizeQty(999), MAX_QTY);
    for (const bad of [NaN, 1.5, '2a', '', null, undefined, Infinity, '1e3']) assert.equal(normalizeQty(bad), null, String(bad));
  });

  test('agregar, incrementar, decrementar, quitar y vaciar', () => {
    let c = add(emptyCart(), cat, 'papas-fritas', 'papas-mediana-caja');
    c = setQty(c, 'papas-fritas', 'papas-mediana-caja', 3);
    assert.equal(countPacks(c), 3);
    c = setQty(c, 'papas-fritas', 'papas-mediana-caja', 2);
    assert.equal(countPacks(c), 2);
    c = setQty(c, 'papas-fritas', 'papas-mediana-caja', 'x');
    assert.equal(countPacks(c), 2, 'valor inválido no cambia');
    c = setQty(c, 'papas-fritas', 'papas-mediana-caja', 0);
    assert.equal(c.lines.length, 0, 'cero elimina la línea');
    c = add(c, cat, 'papas-fritas', 'papas-mediana-caja');
    c = removeItem(c, 'papas-fritas', 'papas-mediana-caja');
    assert.deepEqual(c, emptyCart());
  });

  test('tope por línea y cantidades no válidas al agregar', () => {
    let c = add(emptyCart(), cat, 'papas-fritas', 'papas-mediana-caja', 19);
    const r = addItem(c, cat, 'papas-fritas', 'papas-mediana-caja', 5);
    assert.equal(r.added, 1);
    assert.equal(r.error, 'maximo');
    assert.equal(r.cart.lines[0].qty, MAX_QTY);
    assert.equal(addItem(emptyCart(), cat, 'papas-fritas', 'papas-mediana-caja', 0).error, 'cantidad');
    assert.equal(addItem(emptyCart(), cat, 'papas-fritas', 'papas-mediana-caja', -1).error, 'cantidad');
  });

  test('las operaciones no mutan el carrito original', () => {
    const c = add(emptyCart(), cat, 'papas-fritas', 'papas-mediana-caja');
    const snapshot = JSON.stringify(c);
    addItem(c, cat, 'papas-fritas', 'papas-mediana-caja', 2);
    setQty(c, 'papas-fritas', 'papas-mediana-caja', 5);
    removeItem(c, 'papas-fritas', 'papas-mediana-caja');
    assert.equal(JSON.stringify(c), snapshot);
  });
});

describe('reconciliación de un pedido guardado', () => {
  test('recalcula con el precio actual y avisa del cambio', () => {
    const cat = catalog();
    const stored = { lines: [{ productId: 'empanadas-carne', variantId: 'empanadas-carne-6', qty: 1, seenPrice: 6500 }] };
    const { cart, notices } = reconcile(stored, cat);
    assert.equal(cart.lines.length, 1);
    assert.equal(notices[0].type, 'price');
    assert.equal(notices[0].to, 7000);
    assert.equal(computeTotals(cart, cat, business()).subtotal, 7000);
  });

  test('quita productos inexistentes o agotados y lo explica', () => {
    const cat = catalog();
    cat.productos[2].estado = 'agotado';
    const stored = { lines: [
      { productId: 'simple', variantId: 'simple', qty: 2, seenPrice: 3000 },
      { productId: 'milanesa-carne', variantId: 'milanesa-carne', qty: 1, seenPrice: 10000 },
      { productId: 'papas-fritas', variantId: 'papas-mediana-caja', qty: 1, seenPrice: 6000 },
    ] };
    const { cart, notices } = reconcile(stored, cat);
    assert.deepEqual(cart.lines.map((l) => l.variantId), ['papas-mediana-caja']);
    assert.equal(notices.filter((n) => n.type === 'removed').length, 2);
    assert.ok(notices.some((n) => /agotado/.test(n.text)));
  });

  test('tolera basura: cantidades inválidas, tipos erróneos y duplicados', () => {
    const cat = catalog();
    const stored = { lines: [null, 5, { productId: 1 }, { productId: 'papas-fritas', variantId: 'papas-mediana-caja', qty: 'muchas' },
      { productId: 'papas-fritas', variantId: 'papas-mediana-caja', qty: 2 },
      { productId: 'papas-fritas', variantId: 'papas-mediana-caja', qty: 3 }] };
    const { cart } = reconcile(stored, cat);
    assert.deepEqual(cart.lines, [{ productId: 'papas-fritas', variantId: 'papas-mediana-caja', qty: 2 }]);
    assert.deepEqual(reconcile(undefined, cat).cart, emptyCart());
  });
});

describe('casos de cálculo con la carta vigente (data/catalogo.json)', () => {
  const cat = liveCatalog();
  const biz = liveBusiness();
  const add = (cart, p, v, q = 1) => {
    const r = addItem(cart, cat, p, v, q);
    assert.equal(r.error, null, `${p}/${v}`);
    return r.cart;
  };

  test('2 medias docenas de carne: $13.000, 12 unidades', () => {
    const t = computeTotals(add(emptyCart(), 'empanadas-carne', 'empanadas-carne-6', 2), cat, biz);
    assert.equal(t.subtotal, 13000);
    assert.equal(t.lines[0].units, 12);
  });

  test('1 docena de carne: $12.000, 12 unidades (no es el doble de la media)', () => {
    const t = computeTotals(add(emptyCart(), 'empanadas-carne', 'empanadas-carne-12'), cat, biz);
    assert.equal(t.subtotal, 12000);
    assert.equal(t.lines[0].units, 12);
  });

  test('1 hamburguesa simple + 1 milanesa de pollo + 1 papas en caja: $20.500 antes del envío', () => {
    let c = add(emptyCart(), 'hamburguesa-simple', 'hamburguesa-simple');
    c = add(c, 'milanesa-pollo', 'milanesa-pollo');
    c = add(c, 'papas-fritas', 'papas-mediana-caja');
    const t = computeTotals(c, cat, biz, { mode: 'retiro', zoneId: null });
    assert.equal(t.subtotal, 20500);
    assert.equal(t.total, 20500, 'retiro: total = subtotal');
    const envio = computeTotals(c, cat, biz, { mode: 'envio', zoneId: 'zona-centro' });
    assert.equal(envio.total, 21500, 'envío a Zona Centro ($1.000)');
  });

  test('una media docena de cada sabor: $13.000 en dos líneas', () => {
    let c = add(emptyCart(), 'empanadas-carne', 'empanadas-carne-6');
    c = add(c, 'empanadas-pollo', 'empanadas-pollo-6');
    const t = computeTotals(c, cat, biz);
    assert.equal(t.subtotal, 13000);
    assert.equal(t.lines.length, 2);
  });

  test('un precio guardado viejo se reconcilia con el vigente', () => {
    const { cart, notices } = reconcile({ lines: [{ productId: 'empanadas-carne', variantId: 'empanadas-carne-6', qty: 2, seenPrice: 7000 }] }, cat);
    assert.equal(computeTotals(cart, cat, biz).subtotal, 13000);
    assert.equal(notices[0].type, 'price');
  });

  test('las 15 zonas de envío y Barrio 80 Viviendas a cotizar se mantienen', () => {
    assert.equal(biz.modalidades.envio.zonas.length, 15);
    const z80 = biz.modalidades.envio.zonas.find((z) => z.id === 'barrio-80-viviendas');
    assert.equal(z80.tarifa, null);
  });
});
