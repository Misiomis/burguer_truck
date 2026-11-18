// Lógica pura del panel: interpretar precios escritos a mano y listar cambios.
import { formatARS } from '../core/money.js';

/**
 * Acepta "7000", "7.000", "$ 7.000". Vacío = precio a confirmar (null).
 * Rechaza decimales, negativos y texto. Devuelve { ok, value } o { ok: false, error }.
 */
export function parsePriceInput(raw) {
  const text = String(raw ?? '').trim();
  if (text === '') return { ok: true, value: null };
  const clean = text.replace(/^\$\s*/, '').replace(/\s/g, '');
  if (!/^\d{1,3}(\.\d{3})+$|^\d+$/.test(clean)) {
    return { ok: false, error: 'Escribí solo números, sin centavos (ej.: 7000 o 7.000).' };
  }
  const value = Number(clean.replace(/\./g, ''));
  if (!Number.isSafeInteger(value) || value > 100_000_000) return { ok: false, error: 'El importe es demasiado alto.' };
  return { ok: true, value };
}

export const priceLabel = (v) => (v === null || v === undefined ? 'a confirmar' : v === 0 ? '$0' : formatARS(v));
const STATE_LABEL = { disponible: 'disponible', agotado: 'agotado', oculto: 'oculto' };

/** Lista legible de diferencias entre dos versiones (precios, estados y tarifas). */
export function listChanges(before, after) {
  const out = [];
  const prev = new Map();
  for (const p of before.catalog.productos) for (const v of p.variantes) prev.set(v.id, v);
  for (const p of after.catalog.productos) {
    for (const v of p.variantes) {
      const o = prev.get(v.id);
      if (!o) continue;
      const name = p.variantes.length > 1 ? `${p.nombre} (${v.presentacion.toLowerCase()})` : p.nombre;
      if (o.precio !== v.precio) out.push({ text: `${name}: ${priceLabel(o.precio)} → ${priceLabel(v.precio)}` });
      if (o.estado !== v.estado) out.push({ text: `${name}: ${STATE_LABEL[o.estado]} → ${STATE_LABEL[v.estado]}` });
    }
  }
  const prevZones = new Map(before.business.modalidades.envio.zonas.map((z) => [z.id, z]));
  for (const z of after.business.modalidades.envio.zonas) {
    const o = prevZones.get(z.id);
    if (o && o.tarifa !== z.tarifa) {
      const fee = (t) => (t === null ? 'a confirmar' : t === 0 ? 'sin cargo' : formatARS(t));
      out.push({ text: `Envío a ${z.nombre}: ${fee(o.tarifa)} → ${fee(z.tarifa)}` });
    }
  }
  return out;
}

/** Mensaje de commit claro para el historial del repositorio. */
export function commitMessage(changes, login) {
  const title = `Precios actualizados desde el panel (${changes.length} ${changes.length === 1 ? 'cambio' : 'cambios'})`;
  const by = login ? `\n\nPublicado por ${login} desde admin.html.` : '\n\nPublicado desde admin.html.';
  return `${title}\n\n${changes.map((c) => `- ${c.text}`).join('\n')}${by}`;
}

export function todayISO(now = new Date()) {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
