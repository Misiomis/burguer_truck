// Lógica pura del pedido. Sin DOM ni almacenamiento: fácil de probar.
// Una línea se identifica por su variante (productId + variantId): carne/pollo y 6/12 nunca se mezclan.

export const MAX_QTY = 20; // packs por línea
export const MAX_LINES = 30;

/** Índice rápido variantId -> { product, variant }. */
export function indexCatalog(catalog) {
  const map = new Map();
  for (const product of catalog.productos) {
    for (const variant of product.variantes) map.set(variant.id, { product, variant });
  }
  return map;
}

export function findVariant(catalog, productId, variantId) {
  const product = catalog.productos.find((p) => p.id === productId);
  if (!product) return null;
  const variant = product.variantes.find((v) => v.id === variantId);
  return variant ? { product, variant } : null;
}

function categoryActive(catalog, product) {
  const cat = catalog.categorias.find((c) => c.id === product.categoria);
  return Boolean(cat && cat.estado === 'activa');
}

/** ¿Se puede pedir? Requiere producto, categoría y variante disponibles y precio confirmado. */
export function purchasability(catalog, productId, variantId) {
  const found = findVariant(catalog, productId, variantId);
  if (!found) return { ok: false, reason: 'inexistente' };
  const { product, variant } = found;
  if (!categoryActive(catalog, product) || product.estado === 'oculto' || variant.estado === 'oculto') return { ok: false, reason: 'oculto' };
  if (product.estado === 'agotado' || variant.estado === 'agotado') return { ok: false, reason: 'agotado' };
  if (variant.precioEstado !== 'confirmado' || !Number.isSafeInteger(variant.precio)) return { ok: false, reason: 'precio-pendiente' };
  return { ok: true, product, variant };
}

export function normalizeQty(value) {
  const n = typeof value === 'string' && /^\s*\d+\s*$/.test(value) ? Number(value) : value;
  if (!Number.isInteger(n)) return null;
  return Math.min(Math.max(n, 0), MAX_QTY);
}

export function emptyCart() {
  return { lines: [] };
}

const sameLine = (l, productId, variantId) => l.productId === productId && l.variantId === variantId;

/** Agrega `qty` packs. Devuelve { cart, added, error }. No muta el original. */
export function addItem(cart, catalog, productId, variantId, qty = 1) {
  const check = purchasability(catalog, productId, variantId);
  if (!check.ok) return { cart, added: 0, error: check.reason };
  const n = normalizeQty(qty);
  if (!n) return { cart, added: 0, error: 'cantidad' };
  const lines = cart.lines.map((l) => ({ ...l }));
  const line = lines.find((l) => sameLine(l, productId, variantId));
  if (line) {
    const next = Math.min(line.qty + n, MAX_QTY);
    const added = next - line.qty;
    line.qty = next;
    return { cart: { lines }, added, error: added < n ? 'maximo' : null };
  }
  if (lines.length >= MAX_LINES) return { cart, added: 0, error: 'lineas' };
  lines.push({ productId, variantId, qty: n });
  return { cart: { lines }, added: n, error: null };
}

/** Fija la cantidad. 0 elimina la línea; valores inválidos no cambian nada. */
export function setQty(cart, productId, variantId, qty) {
  const n = normalizeQty(qty);
  if (n === null) return cart;
  if (n === 0) return removeItem(cart, productId, variantId);
  return { lines: cart.lines.map((l) => (sameLine(l, productId, variantId) ? { ...l, qty: n } : { ...l })) };
}

export function removeItem(cart, productId, variantId) {
  return { lines: cart.lines.filter((l) => !sameLine(l, productId, variantId)).map((l) => ({ ...l })) };
}

export function countPacks(cart) {
  return cart.lines.reduce((acc, l) => acc + l.qty, 0);
}

/**
 * Calcula líneas, subtotal, envío y total.
 * fulfillment: { mode: 'retiro' | 'envio' | null, zoneId: string | null }
 * Envío: 'no-aplica' (retiro), 'sin-elegir', 'pendiente' (tarifa desconocida), 'confirmado' (monto entero, 0 = sin cargo).
 * total es null cuando falta un dato: nunca se inventa un total final.
 */
export function computeTotals(cart, catalog, business, fulfillment = { mode: null, zoneId: null }) {
  const lines = cart.lines.map((l) => {
    const check = purchasability(catalog, l.productId, l.variantId);
    const found = findVariant(catalog, l.productId, l.variantId);
    const base = {
      productId: l.productId,
      variantId: l.variantId,
      qty: l.qty,
      name: found ? found.product.nombre : l.productId,
      presentation: found ? found.variant.presentacion : '',
      unitsPerPack: found ? found.variant.unidades : null,
      units: found ? found.variant.unidades * l.qty : null,
    };
    if (!check.ok) return { ...base, status: check.reason, unitPrice: null, lineTotal: null };
    return { ...base, status: 'ok', unitPrice: check.variant.precio, lineTotal: check.variant.precio * l.qty };
  });

  const okLines = lines.filter((l) => l.status === 'ok');
  const subtotal = okLines.reduce((acc, l) => acc + l.lineTotal, 0);
  const subtotalComplete = okLines.length === lines.length && lines.length > 0;

  const modes = availableModes(business);
  let shipping;
  const mode = fulfillment && modes.includes(fulfillment.mode) ? fulfillment.mode : null;
  if (mode === 'retiro') shipping = { status: 'no-aplica', amount: 0 };
  else if (mode === 'envio') {
    const zone = business.modalidades.envio.zonas.find((z) => z.id === fulfillment.zoneId);
    if (!zone) shipping = { status: 'sin-elegir', amount: null };
    else if (zone.tarifaEstado === 'confirmada' && Number.isSafeInteger(zone.tarifa)) shipping = { status: 'confirmado', amount: zone.tarifa, zone };
    else shipping = { status: 'pendiente', amount: null, zone };
  } else shipping = { status: 'sin-elegir', amount: null };

  const total = subtotalComplete && (shipping.status === 'no-aplica' || shipping.status === 'confirmado')
    ? subtotal + shipping.amount
    : null;

  return { lines, subtotal, subtotalComplete, mode, shipping, total, packs: countPacks(cart) };
}

/** Modalidades que el cliente puede elegir: solo las confirmadas. */
export function availableModes(business) {
  const m = business && business.modalidades;
  if (!m) return [];
  const out = [];
  if (m.retiro && m.retiro.estado === 'confirmado') out.push('retiro');
  if (m.envio && m.envio.estado === 'confirmado' && Array.isArray(m.envio.zonas) && m.envio.zonas.length) out.push('envio');
  return out;
}

/**
 * Compara un carrito guardado con el catálogo actual.
 * Nunca confía en el precio guardado: solo lo usa para avisar que cambió.
 * Devuelve { cart, notices } con avisos legibles para el cliente.
 */
export function reconcile(stored, catalog) {
  const notices = [];
  const lines = [];
  const raw = stored && Array.isArray(stored.lines) ? stored.lines : [];
  for (const item of raw.slice(0, MAX_LINES)) {
    if (!item || typeof item.productId !== 'string' || typeof item.variantId !== 'string') continue;
    const found = findVariant(catalog, item.productId, item.variantId);
    const label = found ? `${found.product.nombre} (${found.variant.presentacion.toLowerCase()})` : 'Un producto anterior';
    const qty = normalizeQty(item.qty);
    if (!qty) continue;
    const check = purchasability(catalog, item.productId, item.variantId);
    if (!check.ok) {
      const why = check.reason === 'agotado' ? 'está agotado'
        : check.reason === 'precio-pendiente' ? 'tiene el precio en revisión'
        : 'ya no está en la carta';
      notices.push({ type: 'removed', text: `${label} ${why}; lo quitamos de tu pedido.` });
      continue;
    }
    if (lines.some((l) => sameLine(l, item.productId, item.variantId))) continue;
    if (Number.isSafeInteger(item.seenPrice) && item.seenPrice !== check.variant.precio) {
      notices.push({ type: 'price', text: `${label} cambió de precio. Recalculamos tu pedido con el valor actual.` , from: item.seenPrice, to: check.variant.precio });
    }
    lines.push({ productId: item.productId, variantId: item.variantId, qty });
  }
  return { cart: { lines }, notices };
}
