// Persistencia del pedido: versionada, tolerante a errores y sin datos personales.
// Solo se guardan líneas (producto, variante, cantidad, precio visto) y la modalidad/zona.
// Nombre, dirección, referencia y observaciones NO se guardan.

export const CART_KEY = 'ebs:pedido:v1';
export const CART_SCHEMA = 'ebs.pedido';
export const CART_VERSION = 1;

// Claves de la web anterior (Burguer Truck). No se reutilizan ni se borran desde el sitio público:
// el editor local permite exportarlas antes de descartarlas.
export const LEGACY_KEYS = ['bt_products_v1', 'bt_hoods_v1'];

/** Devuelve un almacenamiento usable o null (modo privado, bloqueado, etc.). */
export function getStorage(win = globalThis) {
  try {
    const s = win.localStorage;
    const probe = '__ebs_probe__';
    s.setItem(probe, '1');
    s.removeItem(probe);
    return s;
  } catch {
    return null;
  }
}

/** Lee el pedido guardado. Nunca lanza: datos corruptos -> { data: null, problem }. */
export function loadCart(storage) {
  if (!storage) return { data: null, problem: 'sin-almacenamiento' };
  let raw;
  try {
    raw = storage.getItem(CART_KEY);
  } catch {
    return { data: null, problem: 'lectura' };
  }
  if (raw === null) return { data: null, problem: null };
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || parsed.schema !== CART_SCHEMA || parsed.version !== CART_VERSION || !Array.isArray(parsed.lines)) {
      return { data: null, problem: 'formato' };
    }
    return { data: parsed, problem: null };
  } catch {
    return { data: null, problem: 'corrupto' };
  }
}

export function serializeCart(cart, catalog, fulfillment) {
  const prices = new Map();
  for (const p of catalog.productos) for (const v of p.variantes) prices.set(v.id, v.precio);
  return {
    schema: CART_SCHEMA,
    version: CART_VERSION,
    catalogVersion: catalog.actualizado,
    savedAt: new Date().toISOString(),
    lines: cart.lines.map((l) => ({ productId: l.productId, variantId: l.variantId, qty: l.qty, seenPrice: prices.get(l.variantId) ?? null })),
    mode: fulfillment && typeof fulfillment.mode === 'string' ? fulfillment.mode : null,
    zoneId: fulfillment && typeof fulfillment.zoneId === 'string' ? fulfillment.zoneId : null,
  };
}

/** Guarda. Devuelve true si pudo. */
export function saveCart(storage, cart, catalog, fulfillment) {
  if (!storage) return false;
  try {
    if (!cart.lines.length) storage.removeItem(CART_KEY);
    else storage.setItem(CART_KEY, JSON.stringify(serializeCart(cart, catalog, fulfillment)));
    return true;
  } catch {
    return false;
  }
}

export function clearSavedCart(storage) {
  if (!storage) return;
  try { storage.removeItem(CART_KEY); } catch { /* sin acción */ }
}

/** Indica si hay datos de la web anterior en este navegador (solo lectura). */
export function detectLegacy(storage) {
  if (!storage) return [];
  const found = [];
  for (const key of LEGACY_KEYS) {
    try {
      const value = storage.getItem(key);
      if (value !== null) found.push({ key, value });
    } catch { /* ignorar */ }
  }
  return found;
}
