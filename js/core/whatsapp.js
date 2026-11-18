// Mensaje de pedido para WhatsApp: una única función pura.
import { formatARS } from './money.js';
import { isValidWhatsAppNumber } from './schema.js';

export const LIMITS = { name: 60, address: 140, reference: 140, notes: 300 };
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

const MODE_LABEL = { retiro: 'Retiro en el local', envio: 'Envío' };

/**
 * totals: resultado de computeTotals(). customer: { name, address, reference, notes }.
 * Devuelve texto plano listo para codificar.
 */
export function buildOrderMessage(totals, customer = {}, business = {}) {
  const brand = business.nombre || 'El Buen Sabor';
  const out = [];
  out.push(`Hola, ${brand}. Quiero hacer este pedido:`);
  out.push('');
  for (const l of totals.lines) {
    if (l.status !== 'ok') continue;
    const units = l.unitsPerPack > 1 ? ` (${l.units} unidades)` : '';
    out.push(`- ${l.qty} x ${l.name}, ${l.presentation.toLowerCase()}${units}`);
    out.push(`  ${formatARS(l.unitPrice)} c/u = ${formatARS(l.lineTotal)}`);
  }
  out.push('');
  out.push(`Subtotal: ${formatARS(totals.subtotal)}`);

  const s = totals.shipping;
  if (totals.mode === 'retiro') {
    out.push(`Modalidad: ${MODE_LABEL.retiro}`);
  } else if (totals.mode === 'envio') {
    const zone = s.zone ? ` a ${s.zone.nombre}` : '';
    out.push(`Modalidad: ${MODE_LABEL.envio}${zone}`);
    if (s.status === 'confirmado') out.push(`Envío: ${s.amount === 0 ? 'sin cargo' : formatARS(s.amount)}`);
    else out.push('Envío: a confirmar');
  } else {
    out.push('Modalidad: a coordinar');
  }

  if (totals.total !== null) out.push(`Total: ${formatARS(totals.total)}`);
  else out.push('Total: a confirmar');

  const name = cleanText(customer.name, LIMITS.name);
  const address = totals.mode === 'envio' ? cleanText(customer.address, LIMITS.address) : '';
  const reference = totals.mode === 'envio' ? cleanText(customer.reference, LIMITS.reference) : '';
  const notes = cleanText(customer.notes, LIMITS.notes);
  if (name || address || reference || notes) out.push('');
  if (name) out.push(`Nombre: ${name}`);
  if (address) out.push(`Dirección: ${address}`);
  if (reference) out.push(`Referencia: ${reference}`);
  if (notes) out.push(`Observaciones: ${notes}`);
  out.push('');
  out.push('Quedo a la espera de la confirmación de disponibilidad y entrega. ¡Gracias!');

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

/** Validación del pedido antes de continuar. Devuelve errores por campo. */
export function validateCheckout(totals, customer, modes) {
  const errors = {};
  if (!totals.lines.length) errors.cart = 'Tu pedido está vacío.';
  if (modes.length && !totals.mode) errors.mode = 'Elegí retiro o envío.';
  if (totals.mode === 'envio') {
    if (!totals.shipping.zone) errors.zone = 'Elegí tu zona de envío.';
    if (!cleanText(customer.address, LIMITS.address)) errors.address = 'Escribí la dirección de entrega.';
  }
  return errors;
}
