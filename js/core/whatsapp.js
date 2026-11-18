// Mensaje de pedido para WhatsApp: una única función pura.
import { formatARS } from './money.js';
import { isValidWhatsAppNumber } from './schema.js';

export const LIMITS = { name: 60, reference: 160, notes: 300 };
export const MAX_MESSAGE = 1800;

// Controles C0/C1, espacios de ancho cero, marcas de dirección y separadores de línea/párrafo.
const isInvisible = (cp) => cp <= 0x1f || (cp >= 0x7f && cp <= 0x9f) || (cp >= 0x200b && cp <= 0x200f) || cp === 0x2028 || cp === 0x2029;

/** Limpia texto libre: sin controles, sin HTML, espacios colapsados y largo acotado. */
export function cleanText(value, max) {
  if (typeof value !== 'string') return '';
  return value
    .replace(/./gsu, (ch) => (isInvisible(ch.codePointAt(0)) ? ' ' : ch))
    .replace(/[<>]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

const MODE_LABEL = { retiro: 'Retiro en el local', envio: 'Envío a domicilio' };

/** "Empanadas de carne · Docena (12 u.)", "Hamburguesa simple" (si la presentación es solo "Unidad"). */
function lineName(l) {
  const pres = l.presentation && l.presentation !== 'Unidad'
    ? ` · ${l.presentation}${l.unitsPerPack > 1 ? ` (${l.unitsPerPack} u.)` : ''}`
    : '';
  return `${l.name}${pres}`;
}

/**
 * Mensaje de pedido, ordenado para leerse rápido en WhatsApp (negritas con *texto*).
 * totals: resultado de computeTotals(). customer: { name, reference, notes }.
 */
export function buildOrderMessage(totals, customer = {}, business = {}) {
  const brand = (business.nombre || 'El Buen Sabor').toUpperCase();
  const name = cleanText(customer.name, LIMITS.name);
  const reference = totals.mode === 'envio' ? cleanText(customer.reference, LIMITS.reference) : '';
  const notes = cleanText(customer.notes, LIMITS.notes);
  const s = totals.shipping;
  const out = [];

  out.push(`*🧾 NUEVO PEDIDO · ${brand}*`);
  out.push('');
  if (name) out.push(`👤 *Cliente:* ${name}`);
  if (totals.mode === 'retiro') out.push(`🏠 *Entrega:* ${MODE_LABEL.retiro}`);
  else if (totals.mode === 'envio') out.push(`🛵 *Entrega:* ${MODE_LABEL.envio}${s.zone ? ` · ${s.zone.nombre}` : ''}`);
  else out.push('🛵 *Entrega:* a coordinar');
  if (reference) out.push(`📍 *Referencia:* ${reference}`);

  out.push('');
  out.push('*DETALLE*');
  for (const l of totals.lines) {
    if (l.status !== 'ok') continue;
    out.push(`• ${l.qty} × ${lineName(l)}`);
    out.push(l.qty > 1 ? `   ${formatARS(l.unitPrice)} c/u → *${formatARS(l.lineTotal)}*` : `   *${formatARS(l.lineTotal)}*`);
  }

  out.push('');
  out.push(`Subtotal: ${formatARS(totals.subtotal)}`);
  if (totals.mode === 'envio') {
    out.push(`Envío: ${s.status === 'confirmado' ? (s.amount === 0 ? 'sin cargo' : formatARS(s.amount)) : 'a confirmar'}`);
  }
  out.push(totals.total !== null ? `*TOTAL: ${formatARS(totals.total)}*` : '*TOTAL: a confirmar*');

  if (notes) {
    out.push('');
    out.push(`📝 *Observaciones:* ${notes}`);
  }
  out.push('');
  out.push('¡Gracias! Espero la confirmación del pedido.');

  const text = out.join('\n');
  return text.length > MAX_MESSAGE ? text.slice(0, MAX_MESSAGE - 1) + '…' : text;
}

/** URL de WhatsApp o null si el número no está confirmado: nunca se arma un enlace a un número supuesto. */
export function buildWhatsAppUrl(business, message) {
  const wa = business && business.whatsapp;
  if (!wa || wa.estado !== 'confirmado' || !isValidWhatsAppNumber(wa.numero)) return null;
  const base = `https://wa.me/${wa.numero}`;
  return message ? `${base}?text=${encodeURIComponent(message)}` : base;
}

/** Mensajes listos para los botones de consulta. */
export const CONTACT_MESSAGES = {
  consulta: 'Hola, El Buen Sabor. Quiero hacer una consulta.',
  pagos: 'Hola, ¿cuáles son los medios de pago?',
};

/** “Nombre y apellido”: al menos dos palabras con dos letras o más. */
export function isFullName(value) {
  const words = cleanText(value, LIMITS.name).split(' ').filter((w) => /\p{L}{2,}/u.test(w));
  return words.length >= 2;
}

/** Validación del pedido antes de continuar. Devuelve errores por campo. */
export function validateCheckout(totals, customer, modes) {
  const errors = {};
  if (!totals.lines.length) errors.cart = 'Tu pedido está vacío.';
  if (!isFullName(customer.name || '')) errors.name = 'Escribí tu nombre y apellido.';
  if (modes.length && !totals.mode) errors.mode = 'Elegí retiro o envío.';
  if (totals.mode === 'envio') {
    if (!totals.shipping.zone) errors.zone = 'Elegí tu barrio.';
    if (!cleanText(customer.reference, LIMITS.reference)) errors.reference = 'Contanos cómo encontrarte: calle, número o una referencia.';
  }
  return errors;
}
