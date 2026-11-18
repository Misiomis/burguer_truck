// Validación de catálogo y datos del negocio.
// La usan el build (Node), el sitio y el editor local. Devuelve una lista de errores legibles.
import { isValidPrice } from './money.js';

export const CATALOG_SCHEMA = 'ebs.catalogo';
export const CATALOG_VERSION = 1;
export const BUSINESS_SCHEMA = 'ebs.negocio';
export const BUSINESS_VERSION = 1;

const ID_RE = /^[a-z0-9]+(?:[-_][a-z0-9]+)*$/;
export const MAX_PORTADA = 6;
export const FOTO_RE = /^assets\/fotos\/[a-z0-9-]+\.(webp|jpg|png)$/;
const PRODUCT_STATES = ['disponible', 'agotado', 'oculto'];
const VARIANT_STATES = ['disponible', 'agotado', 'oculto'];
const PRICE_STATES = ['confirmado', 'pendiente'];
const CATEGORY_STATES = ['activa', 'oculta'];
const DATA_STATES = ['confirmado', 'pendiente'];

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const isText = (v, max) => typeof v === 'string' && v.trim().length > 0 && v.length <= max;
const optText = (v, max) => v === null || v === undefined || (typeof v === 'string' && v.length <= max);

export function isSafeHttpUrl(value) {
  if (typeof value !== 'string' || value.length > 500) return false;
  try {
    const u = new URL(value);
    return u.protocol === 'https:' || u.protocol === 'http:';
  } catch {
    return false;
  }
}

/** Número de WhatsApp en formato internacional, solo dígitos (ej. 549...). */
export function isValidWhatsAppNumber(value) {
  return typeof value === 'string' && /^\d{10,15}$/.test(value);
}

export function validateCatalog(data) {
  const errors = [];
  const err = (msg) => errors.push(msg);
  if (!isObj(data)) return ['El catálogo debe ser un objeto JSON.'];
  if (data.schema !== CATALOG_SCHEMA) err(`"schema" debe ser "${CATALOG_SCHEMA}".`);
  if (data.version !== CATALOG_VERSION) err(`"version" debe ser ${CATALOG_VERSION}.`);
  if (data.moneda !== 'ARS') err('"moneda" debe ser "ARS".');
  if (!Array.isArray(data.categorias) || !data.categorias.length) err('Faltan categorías.');
  if (!Array.isArray(data.productos)) err('Faltan productos.');
  if (errors.length) return errors;

  const catIds = new Set();
  data.categorias.forEach((c, i) => {
    const where = `Categoría ${i + 1}`;
    if (!isObj(c)) return err(`${where}: formato inválido.`);
    if (!ID_RE.test(c.id || '')) err(`${where}: id inválido.`);
    if (catIds.has(c.id)) err(`${where}: id repetido "${c.id}".`);
    catIds.add(c.id);
    if (!isText(c.nombre, 60)) err(`${where}: nombre obligatorio (máx. 60).`);
    if (!optText(c.descripcion, 160)) err(`${where}: descripción demasiado larga.`);
    if (!CATEGORY_STATES.includes(c.estado)) err(`${where}: estado inválido.`);
    if (!optText(c.mensajeVacio, 120)) err(`${where}: mensaje para categoría vacía demasiado largo.`);
  });

  const productIds = new Set();
  const variantIds = new Set();
  data.productos.forEach((p, i) => {
    const where = `Producto ${i + 1}${p && p.nombre ? ` (${p.nombre})` : ''}`;
    if (!isObj(p)) return err(`${where}: formato inválido.`);
    if (!ID_RE.test(p.id || '')) err(`${where}: id inválido.`);
    if (productIds.has(p.id)) err(`${where}: id repetido "${p.id}".`);
    productIds.add(p.id);
    if (!catIds.has(p.categoria)) err(`${where}: categoría inexistente "${p.categoria}".`);
    if (!isText(p.nombre, 80)) err(`${where}: nombre obligatorio (máx. 80).`);
    if (!optText(p.descripcion, 200)) err(`${where}: descripción demasiado larga (máx. 200).`);
    // Foto opcional subida desde el panel (assets/fotos/...). Tiene prioridad sobre la ilustración.
    if (p.foto !== undefined && p.foto !== null && !FOTO_RE.test(p.foto)) err(`${where}: foto inválida.`);
    // Ilustración opcional (assets/ilustraciones/<id>.svg).
    if (p.ilustracion !== undefined && p.ilustracion !== null && !ID_RE.test(p.ilustracion)) err(`${where}: ilustración inválida.`);
    // Imagen opcional: si hay imagen, el texto alternativo es obligatorio.
    if (p.imagen !== undefined && p.imagen !== null) {
      if (!ID_RE.test(p.imagen)) err(`${where}: imagen inválida.`);
      if (!isText(p.alt, 200)) err(`${where}: texto alternativo obligatorio (máx. 200).`);
    }
    if (!PRODUCT_STATES.includes(p.estado)) err(`${where}: estado inválido.`);
    if (!Array.isArray(p.variantes) || !p.variantes.length) return err(`${where}: necesita al menos una variante.`);
    p.variantes.forEach((v, j) => {
      const vw = `${where}, variante ${j + 1}`;
      if (!isObj(v)) return err(`${vw}: formato inválido.`);
      if (!ID_RE.test(v.id || '')) err(`${vw}: id inválido.`);
      if (variantIds.has(v.id)) err(`${vw}: id repetido "${v.id}".`);
      variantIds.add(v.id);
      if (!isText(v.presentacion, 60)) err(`${vw}: presentación obligatoria (máx. 60).`);
      if (!Number.isInteger(v.unidades) || v.unidades < 1 || v.unidades > 100) err(`${vw}: unidades debe ser un entero entre 1 y 100.`);
      if (!PRICE_STATES.includes(v.precioEstado)) err(`${vw}: precioEstado inválido.`);
      if (v.precioEstado === 'confirmado' && !isValidPrice(v.precio)) err(`${vw}: precio confirmado debe ser un entero en pesos.`);
      if (v.precioEstado === 'pendiente' && v.precio !== null) err(`${vw}: un precio pendiente debe ser null (no 0).`);
      if (!VARIANT_STATES.includes(v.estado)) err(`${vw}: estado inválido.`);
    });
  });

  for (const key of ['proximas', 'historicos']) {
    if (data[key] === undefined) continue;
    if (!Array.isArray(data[key])) { err(`"${key}" debe ser una lista.`); continue; }
    data[key].forEach((x, i) => {
      if (!isObj(x) || !ID_RE.test(x.id || '') || !isText(x.nombre, 60)) err(`${key} ${i + 1}: formato inválido.`);
      if (x && 'variantes' in x) err(`${key} ${i + 1}: no puede tener variantes comprables.`);
    });
  }
  return errors;
}

export function validateBusiness(data) {
  const errors = [];
  const err = (msg) => errors.push(msg);
  if (!isObj(data)) return ['Los datos del negocio deben ser un objeto JSON.'];
  if (data.schema !== BUSINESS_SCHEMA) err(`"schema" debe ser "${BUSINESS_SCHEMA}".`);
  if (data.version !== BUSINESS_VERSION) err(`"version" debe ser ${BUSINESS_VERSION}.`);
  if (!isText(data.nombre, 60)) err('Falta el nombre.');
  if (!isObj(data.sitio) || !isSafeHttpUrl(data.sitio.url)) err('sitio.url debe ser una URL https.');

  const wa = data.whatsapp;
  if (!isObj(wa) || !DATA_STATES.includes(wa.estado)) err('whatsapp.estado inválido.');
  else if (wa.estado === 'confirmado' && !isValidWhatsAppNumber(wa.numero)) err('whatsapp.numero debe tener solo dígitos con código de país (10 a 15).');
  else if (wa.estado === 'pendiente' && wa.numero !== null) err('Un WhatsApp pendiente debe tener numero null.');

  const dir = data.direccion;
  if (!isObj(dir) || !DATA_STATES.includes(dir.estado)) err('direccion.estado inválido.');
  else {
    if (dir.estado === 'confirmado' && !isText(dir.texto, 160)) err('Una dirección confirmada necesita texto.');
    if (!optText(dir.localidad, 120)) err('direccion.localidad demasiado larga.');
    if (dir.mapaUrl !== null && dir.mapaUrl !== undefined && !isSafeHttpUrl(dir.mapaUrl)) err('direccion.mapaUrl debe ser https.');
  }

  const h = data.horarios;
  if (!isObj(h) || !DATA_STATES.includes(h.estado) || !Array.isArray(h.lista)) err('horarios inválidos.');
  else {
    if (h.estado === 'confirmado' && !h.lista.length) err('Horarios confirmados sin filas.');
    h.lista.forEach((r, i) => {
      if (!isObj(r) || !isText(r.dias, 60) || !isText(r.horario, 60)) err(`Horario ${i + 1}: indicá días y horario.`);
    });
  }

  const m = data.modalidades;
  if (!isObj(m) || !isObj(m.retiro) || !isObj(m.envio)) err('modalidades inválidas.');
  else {
    if (!DATA_STATES.includes(m.retiro.estado)) err('modalidades.retiro.estado inválido.');
    if (!DATA_STATES.includes(m.envio.estado)) err('modalidades.envio.estado inválido.');
    if (!Array.isArray(m.envio.zonas)) err('modalidades.envio.zonas debe ser una lista.');
    else {
      const ids = new Set();
      m.envio.zonas.forEach((z, i) => {
        const w = `Zona ${i + 1}`;
        if (!isObj(z)) return err(`${w}: formato inválido.`);
        if (!ID_RE.test(z.id || '') || ids.has(z.id)) err(`${w}: id inválido o repetido.`);
        ids.add(z.id);
        if (!isText(z.nombre, 60)) err(`${w}: nombre obligatorio.`);
        if (!['confirmada', 'pendiente'].includes(z.tarifaEstado)) err(`${w}: tarifaEstado inválido.`);
        if (z.tarifaEstado === 'confirmada' && !isValidPrice(z.tarifa)) err(`${w}: tarifa confirmada debe ser un entero (0 = sin cargo).`);
        if (z.tarifaEstado === 'pendiente' && z.tarifa !== null) err(`${w}: tarifa pendiente debe ser null (no 0).`);
      });
      if (m.envio.estado === 'confirmado' && !m.envio.zonas.length) err('Envío confirmado sin zonas.');
    }
  }

  const pay = data.mediosDePago;
  if (!isObj(pay) || !DATA_STATES.includes(pay.estado) || !Array.isArray(pay.lista)) err('mediosDePago inválidos.');
  else pay.lista.forEach((x, i) => { if (!isText(x, 40)) err(`Medio de pago ${i + 1} inválido.`); });

  if (!Array.isArray(data.redes)) err('redes debe ser una lista.');
  else data.redes.forEach((r, i) => {
    if (!isObj(r) || !isText(r.nombre, 30) || !isSafeHttpUrl(r.url) || !r.url.startsWith('https://')) err(`Red ${i + 1}: nombre y URL https obligatorios.`);
  });

  // Fotos reales de fondo de la portada (opcional; subidas desde el panel).
  if (data.portada !== undefined) {
    if (!isObj(data.portada) || !Array.isArray(data.portada.fotos)) err('portada.fotos debe ser una lista.');
    else {
      if (data.portada.fotos.length > MAX_PORTADA) err(`La portada admite hasta ${MAX_PORTADA} fotos.`);
      data.portada.fotos.forEach((p, i) => { if (!FOTO_RE.test(p || '')) err(`Foto de portada ${i + 1} inválida.`); });
    }
  }
  return errors;
}
