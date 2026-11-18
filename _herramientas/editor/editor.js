// Editor local de borradores. No publica nada: exporta los JSON canónicos para reemplazarlos en data/.
// Todo dato editable se muestra con textContent / value; la vista previa usa el render escapado del build.
import { validateCatalog, validateBusiness, CATALOG_SCHEMA, BUSINESS_SCHEMA } from '../../js/core/schema.js';
import { renderMenu, renderBusinessInfo } from '../../js/core/render.js';
import { SPRITE } from '../../js/core/icons.js';
import { formatARS } from '../../js/core/money.js';
import { getStorage, detectLegacy } from '../../js/core/storage.js';

const DRAFT_KEY = 'ebs:editor:borrador:v1';
const storage = getStorage();
const $ = (s, r = document) => r.querySelector(s);

let draft = null;       // { catalogo, negocio }
let published = null;   // copia de los archivos del proyecto
let pendingImport = null;
let dirty = false;

const clone = (x) => JSON.parse(JSON.stringify(x));

function status(msg) { $('[data-status]').textContent = msg; }
function setDirty(v) {
  dirty = v;
  const b = $('[data-dirty-badge]');
  b.dataset.dirty = String(v);
  b.textContent = v ? 'Cambios sin guardar' : 'Sin cambios';
}

function el(tag, props = {}, ...kids) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class') n.className = v;
    else if (k === 'text') n.textContent = v;
    else if (k.startsWith('data-') || k.startsWith('aria-') || k === 'for') n.setAttribute(k, v === true ? '' : v);
    else n[k] = v;
  }
  for (const c of kids) if (c) n.append(c);
  return n;
}

let uid = 0;
function field(label, input) {
  const id = `f-${++uid}`;
  input.id = id;
  input.classList.add('field__input');
  return el('div', { class: 'field' }, el('label', { class: 'field__label', for: id, text: label }), input);
}
function textInput(path, value, max = 200) { return el('input', { value: value ?? '', maxLength: max, 'data-path': path, 'data-type': 'text' }); }
function intInput(path, value, { nullable = false, min = 0 } = {}) {
  return el('input', { type: 'number', inputMode: 'numeric', min, step: 1, value: value ?? '', 'data-path': path, 'data-type': nullable ? 'nullint' : 'int' });
}
function select(path, value, options) {
  const s = el('select', { 'data-path': path, 'data-type': 'text' });
  for (const [v, label] of options) s.append(el('option', { value: v, text: label, selected: v === value }));
  return s;
}
const STATE_OPTS = [['confirmado', 'Confirmado'], ['pendiente', 'Pendiente']];

/* ---------- Ruta de datos ---------- */
function setPath(obj, path, value) {
  const parts = path.split('.');
  let cur = obj;
  for (let i = 0; i < parts.length - 1; i++) cur = cur[parts[i]];
  cur[parts.at(-1)] = value;
}
function readValue(input) {
  const raw = input.value.trim();
  switch (input.dataset.type) {
    case 'int': return raw === '' ? NaN : Number(raw);
    case 'nullint': return raw === '' ? null : Number(raw);
    case 'list': return raw ? raw.split(',').map((x) => x.trim()).filter(Boolean) : [];
    default: return input.value;
  }
}

/* ---------- Formularios ---------- */
function renderCatalogForm() {
  const box = $('[data-catalog-form]');
  box.replaceChildren();
  const cat = draft.catalogo;
  cat.productos.forEach((p, i) => {
    const base = `catalogo.productos.${i}`;
    const wrap = el('div', { class: 'ed-product' }, el('h3', { class: 'ed-h3', text: p.nombre || p.id }));
    wrap.append(el('div', { class: 'ed-grid' },
      field('Nombre', textInput(`${base}.nombre`, p.nombre, 80)),
      field('Descripción (opcional)', textInput(`${base}.descripcion`, p.descripcion, 200)),
      field('Estado del producto', select(`${base}.estado`, p.estado, [['disponible', 'Disponible'], ['agotado', 'Agotado'], ['oculto', 'Oculto']])),
    ));
    const table = el('table', { class: 'ed-variants' });
    table.append(el('caption', { class: 'visually-hidden', text: `Variantes de ${p.nombre}` }));
    table.append(el('thead', {}, el('tr', {}, ...['Presentación', 'Unidades', 'Precio (ARS)', 'Precio', 'Estado'].map((h) => el('th', { scope: 'col', text: h })))));
    const tb = el('tbody');
    p.variantes.forEach((v, j) => {
      const vb = `${base}.variantes.${j}`;
      const price = intInput(`${vb}.precio`, v.precio, { nullable: true });
      price.setAttribute('aria-label', `Precio de ${p.nombre}, ${v.presentacion}`);
      price.disabled = v.precioEstado === 'pendiente';
      price.classList.add('field__input');
      const cells = [
        Object.assign(textInput(`${vb}.presentacion`, v.presentacion, 60), { ariaLabel: `Presentación ${j + 1} de ${p.nombre}` }),
        Object.assign(intInput(`${vb}.unidades`, v.unidades, { min: 1 }), { ariaLabel: `Unidades de ${v.presentacion}` }),
        price,
        Object.assign(select(`${vb}.precioEstado`, v.precioEstado, STATE_OPTS), { ariaLabel: `Estado del precio de ${v.presentacion}` }),
        Object.assign(select(`${vb}.estado`, v.estado, [['disponible', 'Disponible'], ['agotado', 'Agotado'], ['oculto', 'Oculto']]), { ariaLabel: `Disponibilidad de ${v.presentacion}` }),
      ];
      tb.append(el('tr', {}, ...cells.map((c) => { c.classList.add('field__input'); return el('td', {}, c); })));
    });
    table.append(tb);
    wrap.append(el('div', { class: 'ed-table-wrap' }, table));
    box.append(wrap);
  });
}

function renderBusinessForm() {
  const box = $('[data-business-form]');
  box.replaceChildren();
  const b = draft.negocio;
  const nb = 'negocio';
  box.append(el('h3', { class: 'ed-h3', text: 'WhatsApp' }), el('div', { class: 'ed-grid' },
    field('Estado', select(`${nb}.whatsapp.estado`, b.whatsapp.estado, STATE_OPTS)),
    field('Número (solo dígitos, con 54 y 9; ej. 549…)', Object.assign(textInput(`${nb}.whatsapp.numero`, b.whatsapp.numero, 15), { inputMode: 'numeric' })),
  ));
  box.append(el('h3', { class: 'ed-h3', text: 'Dirección' }), el('div', { class: 'ed-grid' },
    field('Estado', select(`${nb}.direccion.estado`, b.direccion.estado, STATE_OPTS)),
    field('Calle y número', textInput(`${nb}.direccion.texto`, b.direccion.texto, 160)),
    field('Localidad', textInput(`${nb}.direccion.localidad`, b.direccion.localidad, 120)),
    field('Enlace al mapa (https)', textInput(`${nb}.direccion.mapaUrl`, b.direccion.mapaUrl, 500)),
  ));

  box.append(el('h3', { class: 'ed-h3', text: 'Horarios' }), el('div', { class: 'ed-grid' }, field('Estado', select(`${nb}.horarios.estado`, b.horarios.estado, STATE_OPTS))));
  b.horarios.lista.forEach((r, i) => {
    box.append(el('div', { class: 'ed-row' },
      field('Días', textInput(`${nb}.horarios.lista.${i}.dias`, r.dias, 60)),
      field('Horario', textInput(`${nb}.horarios.lista.${i}.horario`, r.horario, 60)),
      el('button', { type: 'button', class: 'btn btn--ghost', text: 'Quitar', 'data-remove': `horarios.${i}` })));
  });
  box.append(el('div', { class: 'ed-actions' }, el('button', { type: 'button', class: 'btn btn--ghost', text: 'Agregar horario', 'data-add': 'horarios' })));

  box.append(el('h3', { class: 'ed-h3', text: 'Retiro y envío' }), el('div', { class: 'ed-grid' },
    field('Retiro en el local', select(`${nb}.modalidades.retiro.estado`, b.modalidades.retiro.estado, STATE_OPTS)),
    field('Envío', select(`${nb}.modalidades.envio.estado`, b.modalidades.envio.estado, STATE_OPTS)),
  ));
  b.modalidades.envio.zonas.forEach((z, i) => {
    const zb = `${nb}.modalidades.envio.zonas.${i}`;
    const fee = intInput(`${zb}.tarifa`, z.tarifa, { nullable: true });
    fee.disabled = z.tarifaEstado === 'pendiente';
    box.append(el('div', { class: 'ed-row' },
      field('Zona', textInput(`${zb}.nombre`, z.nombre, 60)),
      field('Tarifa (0 = sin cargo)', fee),
      field('Tarifa', select(`${zb}.tarifaEstado`, z.tarifaEstado, [['confirmada', 'Confirmada'], ['pendiente', 'A cotizar']])),
      el('button', { type: 'button', class: 'btn btn--ghost', text: 'Quitar', 'data-remove': `zonas.${i}` })));
  });
  box.append(el('div', { class: 'ed-actions' }, el('button', { type: 'button', class: 'btn btn--ghost', text: 'Agregar zona', 'data-add': 'zonas' })));

  const pay = textInput(`${nb}.mediosDePago.lista`, b.mediosDePago.lista.join(', '), 300);
  pay.dataset.type = 'list';
  box.append(el('h3', { class: 'ed-h3', text: 'Medios de pago' }), el('div', { class: 'ed-grid' },
    field('Estado', select(`${nb}.mediosDePago.estado`, b.mediosDePago.estado, STATE_OPTS)),
    field('Lista (separada por comas)', pay),
  ));
}

const slug = (s) => s.normalize('NFD').replace(/[^\w\s-]/g, '').trim().toLowerCase().replace(/[\s_]+/g, '-').replace(/-+/g, '-') || 'zona';

/* ---------- Validación y vista previa ---------- */
function errorsOf(d) {
  return [...validateCatalog(d.catalogo).map((e) => 'Carta: ' + e), ...validateBusiness(d.negocio).map((e) => 'Local: ' + e)];
}

let previewTimer;
function refresh() {
  const errs = errorsOf(draft);
  const box = $('[data-errors]');
  box.replaceChildren(errs.length
    ? el('ul', { class: 'ed-errors' }, ...errs.map((e) => el('li', { text: e })))
    : el('p', { class: 'ed-ok', text: 'Sin errores: el borrador se puede exportar.' }));
  for (const btn of document.querySelectorAll('[data-act^="export-"]')) btn.disabled = errs.length > 0;
  clearTimeout(previewTimer);
  previewTimer = setTimeout(() => {
    const prev = $('[data-preview]');
    if (errs.length) { prev.replaceChildren(el('p', { class: 'muted', text: 'Corregí los errores para ver la vista previa.' })); return; }
    // HTML generado por el mismo render del build: todos los textos ya están escapados.
    prev.innerHTML = SPRITE + renderMenu(draft.catalogo, { base: '../../' }) + '<h3 class="ed-h3">Datos del local</h3>' + renderBusinessInfo(draft.negocio);
  }, 200);
}

/* ---------- Edición ---------- */
function onInput(e) {
  const input = e.target.closest('[data-path]');
  if (!input) return;
  let value = readValue(input);
  if (input.dataset.type === 'nullable' || input.dataset.path.endsWith('.numero') || input.dataset.path.endsWith('.mapaUrl') || input.dataset.path.endsWith('.texto') || input.dataset.path.endsWith('.localidad')) {
    value = input.value.trim() === '' ? null : input.value.trim();
  }
  if (input.dataset.path.endsWith('.descripcion') && input.value.trim() === '') value = undefined;
  setPath(draft, input.dataset.path, value);
  // Coherencia de estados: "pendiente" nunca se guarda como 0.
  const p = input.dataset.path;
  if (p.endsWith('.precioEstado') || p.endsWith('.tarifaEstado') || p.endsWith('whatsapp.estado')) {
    const parent = p.slice(0, p.lastIndexOf('.'));
    const key = p.endsWith('.precioEstado') ? 'precio' : p.endsWith('.tarifaEstado') ? 'tarifa' : 'numero';
    if (value === 'pendiente') setPath(draft, `${parent}.${key}`, null);
    if (key !== 'numero') {
      renderCatalogForm();
      renderBusinessForm();
      document.querySelector(`[data-path="${CSS.escape(p)}"]`)?.focus();
    }
  }
  if (p.includes('.zonas.') && p.endsWith('.nombre')) {
    const idx = Number(p.split('.')[4]);
    draft.negocio.modalidades.envio.zonas[idx].id = slug(value || '');
  }
  setDirty(true);
  refresh();
}

function onClick(e) {
  const act = e.target.closest('[data-act]')?.dataset.act;
  const add = e.target.closest('[data-add]')?.dataset.add;
  const rem = e.target.closest('[data-remove]')?.dataset.remove;
  if (add === 'horarios') draft.negocio.horarios.lista.push({ dias: '', horario: '' });
  if (add === 'zonas') draft.negocio.modalidades.envio.zonas.push({ id: `zona-${draft.negocio.modalidades.envio.zonas.length + 1}`, nombre: '', tarifa: null, tarifaEstado: 'pendiente' });
  if (rem) {
    const [kind, i] = rem.split('.');
    (kind === 'horarios' ? draft.negocio.horarios.lista : draft.negocio.modalidades.envio.zonas).splice(Number(i), 1);
  }
  if (add || rem) { renderBusinessForm(); setDirty(true); refresh(); return; }
  if (!act) return;
  if (act === 'save') {
    if (!storage) return status('Este navegador no permite guardar el borrador. Exportá los archivos para no perder cambios.');
    try {
      storage.setItem(DRAFT_KEY, JSON.stringify({ guardado: new Date().toISOString(), ...draft }));
      setDirty(false);
      status('Borrador guardado en este navegador. La web publicada no cambió.');
    } catch { status('No se pudo guardar el borrador (almacenamiento lleno o bloqueado).'); }
  }
  if (act === 'discard' || act === 'load-published') {
    if (dirty && !confirm('Hay cambios sin guardar. ¿Reemplazar el borrador por los datos del proyecto?')) return;
    if (act === 'discard') { try { storage?.removeItem(DRAFT_KEY); } catch { /* sin acción */ } }
    draft = clone(published);
    renderAllForms();
    setDirty(false);
    status(act === 'discard' ? 'Borrador descartado. Se cargaron los datos del proyecto.' : 'Se cargaron los datos del proyecto.');
  }
  if (act === 'export-catalogo') download('catalogo.json', draft.catalogo);
  if (act === 'export-negocio') download('negocio.json', draft.negocio);
  if (act === 'import-apply' && pendingImport) {
    Object.assign(draft, clone(pendingImport));
    pendingImport = null;
    $('[data-import-review]').hidden = true;
    renderAllForms();
    setDirty(true);
    status('Importación aplicada al borrador. Revisá la vista previa antes de exportar.');
  }
  if (act === 'import-cancel') {
    pendingImport = null;
    $('[data-import-review]').hidden = true;
    status('Importación cancelada. El borrador no cambió.');
  }
}

function download(name, data) {
  const errs = errorsOf(draft);
  if (errs.length) return status('Corregí los errores antes de exportar.');
  const today = new Date().toISOString().slice(0, 10);
  const out = { ...clone(data), actualizado: today };
  const blob = new Blob([JSON.stringify(out, null, 2) + '\n'], { type: 'application/json' });
  const a = el('a', { href: URL.createObjectURL(blob), download: name });
  document.body.append(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  status(`Exportado ${name}. Para publicarlo, reemplazá data/${name}, ejecutá npm run build y subí los cambios.`);
}

/* ---------- Importación ---------- */
function diffCatalog(a, b) {
  const out = [];
  const index = (c) => new Map(c.productos.flatMap((p) => p.variantes.map((v) => [v.id, { p, v }])));
  const A = index(a); const B = index(b);
  for (const [id, { p, v }] of B) {
    const old = A.get(id);
    if (!old) out.push(`Nueva variante: ${p.nombre} · ${v.presentacion}`);
    else if (old.v.precio !== v.precio) out.push(`Precio ${p.nombre} · ${v.presentacion}: ${old.v.precio === null ? 'pendiente' : formatARS(old.v.precio)} → ${v.precio === null ? 'pendiente' : formatARS(v.precio)}`);
    else if (old.v.estado !== v.estado) out.push(`Estado ${p.nombre} · ${v.presentacion}: ${old.v.estado} → ${v.estado}`);
  }
  for (const [id, { p, v }] of A) if (!B.has(id)) out.push(`Se elimina: ${p.nombre} · ${v.presentacion}`);
  return out;
}

async function onImport(e) {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;
  if (file.size > 200_000) return status('El archivo es demasiado grande para ser un catálogo.');
  let data;
  try { data = JSON.parse(await file.text()); } catch { return status('El archivo no es un JSON válido. No se cambió nada.'); }
  const next = clone(draft);
  if (data && data.schema === CATALOG_SCHEMA) next.catalogo = data;
  else if (data && data.schema === BUSINESS_SCHEMA) next.negocio = data;
  else if (data && data.catalogo && data.negocio) { next.catalogo = data.catalogo; next.negocio = data.negocio; }
  else return status('No se reconoce el formato (se espera catalogo.json o negocio.json de El Buen Sabor). No se cambió nada.');
  const errs = errorsOf(next);
  const summary = $('[data-import-summary]');
  summary.replaceChildren();
  if (errs.length) {
    summary.append(el('p', { text: 'El archivo tiene errores y no se puede aplicar:' }), el('ul', { class: 'ed-errors' }, ...errs.map((x) => el('li', { text: x }))));
    $('[data-import-review]').hidden = false;
    $('[data-act="import-apply"]').disabled = true;
    pendingImport = null;
    return status('Importación rechazada: revisá los errores.');
  }
  const changes = next.catalogo !== draft.catalogo ? diffCatalog(draft.catalogo, next.catalogo) : [];
  if (next.negocio !== draft.negocio) changes.push('Se reemplazan los datos del local, contacto y entrega.');
  summary.append(el('p', { text: `Archivo: ${file.name}. Cambios respecto del borrador:` }),
    changes.length ? el('ul', { class: 'ed-diff' }, ...changes.map((x) => el('li', { text: x }))) : el('p', { text: 'Sin diferencias.' }));
  pendingImport = { catalogo: next.catalogo, negocio: next.negocio };
  $('[data-act="import-apply"]').disabled = false;
  $('[data-import-review]').hidden = false;
  $('#ed-import-title').scrollIntoView({ block: 'start' });
  status('Revisá los cambios y confirmá con “Aplicar al borrador”.');
}

/* ---------- Antecedentes ---------- */
function renderLegacy() {
  const box = $('[data-legacy]');
  box.replaceChildren();
  const found = detectLegacy(storage);
  if (!found.length) { box.append(el('p', { class: 'muted', text: 'No hay datos del editor anterior en este navegador.' })); return; }
  box.append(el('p', { text: 'El editor anterior guardaba cambios solo en este navegador. No se usan en la web nueva ni se convierten a la carta actual. Exportá una copia antes de borrarlos.' }));
  for (const { key, value } of found) {
    const wrap = el('div', { class: 'ed-legacy' }, el('h3', { class: 'ed-h3', text: key }), el('pre', { text: value.slice(0, 4000) }));
    wrap.append(el('div', { class: 'ed-actions' },
      el('button', { type: 'button', class: 'btn btn--ghost', text: 'Exportar copia', 'data-legacy-export': key }),
      el('button', { type: 'button', class: 'btn btn--ghost', text: 'Borrar esta clave', 'data-legacy-delete': key })));
    box.append(wrap);
  }
}
document.addEventListener('click', (e) => {
  const exp = e.target.closest('[data-legacy-export]')?.dataset.legacyExport;
  const del = e.target.closest('[data-legacy-delete]')?.dataset.legacyDelete;
  if (exp) {
    const blob = new Blob([storage.getItem(exp) ?? ''], { type: 'application/json' });
    const a = el('a', { href: URL.createObjectURL(blob), download: `antecedente-${exp}.json` });
    document.body.append(a); a.click(); a.remove();
  }
  if (del && confirm(`¿Borrar "${del}" de este navegador? Exportá una copia antes si la necesitás.`)) {
    storage.removeItem(del);
    renderLegacy();
    status(`Se borró ${del} de este navegador.`);
  }
});

function renderAllForms() { renderCatalogForm(); renderBusinessForm(); refresh(); }

async function start() {
  try {
    const [c, n] = await Promise.all(['../../data/catalogo.json', '../../data/negocio.json'].map((u) => fetch(u, { cache: 'no-store' }).then((r) => { if (!r.ok) throw new Error(u); return r.json(); })));
    published = { catalogo: c, negocio: n };
  } catch {
    status('No se pudieron leer los datos del proyecto. Abrí el editor con npm run dev.');
    return;
  }
  let saved = null;
  try { saved = storage && JSON.parse(storage.getItem(DRAFT_KEY) || 'null'); } catch { saved = null; }
  draft = saved && saved.catalogo && saved.negocio ? { catalogo: saved.catalogo, negocio: saved.negocio } : clone(published);
  if (saved) status(`Se recuperó un borrador guardado el ${new Date(saved.guardado).toLocaleString('es-AR')}.`);
  document.addEventListener('input', onInput);
  document.addEventListener('click', onClick);
  $('[data-import]').addEventListener('change', onImport);
  window.addEventListener('beforeunload', (e) => { if (dirty) { e.preventDefault(); e.returnValue = ''; } });
  renderAllForms();
  renderLegacy();
}

start();
