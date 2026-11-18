// Panel de precios de El Buen Sabor.
// Lee los datos del repositorio, permite editar precios, disponibilidad y tarifas de envío,
// y publica un commit con los mismos archivos que generaría `npm run build`.
import { createGitHub, GitHubError } from './github.js';
import { parsePriceInput, listChanges, commitMessage, todayISO } from './cambios.js';
import { buildSiteFiles, PAGES, DATA_FILES } from '../core/build-core.js';
import { validateCatalog, validateBusiness, MAX_PORTADA } from '../core/schema.js';

const TOKEN_KEY = 'ebs:admin:token';
const $ = (s, r = document) => r.querySelector(s);
const clone = (x) => JSON.parse(JSON.stringify(x));

let gh = null;
let login = '';
let base = null;   // { sha, catalog, business, pages }
let draft = null;  // { catalog, business }
const invalid = new Set(); // campos con error

/* ---------- Utilidades de interfaz ---------- */
function status(msg) { $('[data-status]').textContent = msg; }
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

function readToken() {
  try { return sessionStorage.getItem(TOKEN_KEY) || localStorage.getItem(TOKEN_KEY) || ''; } catch { return ''; }
}
function saveToken(token, remember) {
  try {
    sessionStorage.setItem(TOKEN_KEY, token);
    if (remember) localStorage.setItem(TOKEN_KEY, token); else localStorage.removeItem(TOKEN_KEY);
  } catch { /* sin almacenamiento: queda solo en memoria */ }
}
function clearToken() {
  try { sessionStorage.removeItem(TOKEN_KEY); localStorage.removeItem(TOKEN_KEY); } catch { /* nada */ }
}

function show(view) {
  $('[data-login-view]').hidden = view !== 'login';
  $('[data-edit-view]').hidden = view !== 'edit';
  $('[data-user]').hidden = view !== 'edit';
}

/* ---------- Ingreso ---------- */
async function connect(token, { remember = false, silent = false } = {}) {
  const errorEl = $('[data-token-error]');
  errorEl.hidden = true;
  status(silent ? 'Cargando…' : 'Verificando el acceso…');
  try {
    gh = createGitHub(token);
    const res = await gh.check();
    if (!res.canWrite) throw new GitHubError('Este token puede leer pero no modificar el repositorio. Necesita “Contents: Read and write”.', 403, 'permiso');
    login = res.login;
    saveToken(token, remember);
    await loadFromRepo();
    $('[data-user-name]').textContent = login ? `@${login}` : 'Conectado';
    show('edit');
    status('Datos cargados desde el repositorio. Editá y tocá “Revisar y publicar”.');
    $('#contenido').focus();
  } catch (err) {
    gh = null;
    if (err.kind === 'auth' || err.kind === 'permiso') clearToken();
    show('login');
    errorEl.textContent = err.message;
    errorEl.hidden = false;
    $('#token').setAttribute('aria-invalid', 'true');
    status('');
    if (!silent) $('#token').focus();
  }
}

async function loadFromRepo() {
  const sha = await gh.headSha();
  const [catalogText, businessText, ...pageTexts] = await Promise.all([
    gh.readText(DATA_FILES.catalog, sha),
    gh.readText(DATA_FILES.business, sha),
    ...PAGES.map((p) => gh.readText(p, sha)),
  ]);
  base = {
    sha,
    catalog: JSON.parse(catalogText),
    business: JSON.parse(businessText),
    pages: Object.fromEntries(PAGES.map((p, i) => [p, pageTexts[i]])),
  };
  draft = { catalog: clone(base.catalog), business: clone(base.business) };
  invalid.clear();
  render();
}

/* ---------- Formulario ---------- */
let uid = 0;
function labelWith(text, context) {
  return [document.createTextNode(text), context ? el('span', { class: 'visually-hidden', text: ` de ${context}` }) : null];
}

function priceField({ label, context, value, onValue, key, placeholder = 'a confirmar' }) {
  const id = `f-${++uid}`;
  const err = el('p', { class: 'field__error', id: `${id}-e`, hidden: true });
  const input = el('input', {
    class: 'field__input ad-price__input', id, type: 'text', inputMode: 'numeric', autocomplete: 'off',
    value: value === null ? '' : String(value), placeholder, 'aria-describedby': `${id}-e`,
  });
  input.addEventListener('input', () => {
    const r = parsePriceInput(input.value);
    if (r.ok) { onValue(r.value); invalid.delete(key); err.hidden = true; input.removeAttribute('aria-invalid'); }
    else { invalid.add(key); err.textContent = r.error; err.hidden = false; input.setAttribute('aria-invalid', 'true'); }
    updateBar();
  });
  input.addEventListener('blur', () => {
    const r = parsePriceInput(input.value);
    if (r.ok && r.value !== null) input.value = String(r.value);
  });
  return el('div', { class: 'field ad-price' },
    el('label', { class: 'field__label', for: id }, ...labelWith(label, context)),
    el('div', { class: 'ad-price__wrap' }, el('span', { class: 'ad-price__prefix', 'aria-hidden': 'true', text: '$' }), input),
    err);
}

function stateField(label, context, value, onValue) {
  const id = `f-${++uid}`;
  const select = el('select', { class: 'field__input', id });
  for (const [v, t] of [['disponible', 'Disponible'], ['agotado', 'Agotado'], ['oculto', 'Oculto (no se muestra)']]) {
    select.append(el('option', { value: v, text: t, selected: v === value }));
  }
  select.addEventListener('change', () => { onValue(select.value); updateBar(); });
  return el('div', { class: 'field' }, el('label', { class: 'field__label', for: id }, ...labelWith(label, context)), select);
}

// Categorías cuyos productos se pueden crear, renombrar, fotografiar y quitar desde el panel.
const EDITABLE = new Set(['bebidas']);
const pendingPhotos = new Map(); // ruta -> { base64, url } (fotos nuevas aún sin publicar)

function textField(label, context, value, onValue, { maxLength = 80, key } = {}) {
  const id = `f-${++uid}`;
  const err = el('p', { class: 'field__error', id: `${id}-e`, hidden: true });
  const input = el('input', { class: 'field__input', id, type: 'text', value: value || '', maxLength, autocomplete: 'off', 'aria-describedby': `${id}-e` });
  input.addEventListener('input', () => {
    const v = input.value.trim();
    if (key && !v) { invalid.add(key); err.textContent = 'Escribí un nombre.'; err.hidden = false; input.setAttribute('aria-invalid', 'true'); }
    else { if (key) invalid.delete(key); err.hidden = true; input.removeAttribute('aria-invalid'); }
    onValue(v);
    updateBar();
  });
  return el('div', { class: 'field' }, el('label', { class: 'field__label', for: id }, ...labelWith(label, context)), input, err);
}

const slugify = (s) => s.normalize('NFD').replace(/[^\w\s-]/g, '').trim().toLowerCase().replace(/[\s_]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '') || 'item';

/** Achica la foto en el navegador (máx. 480 px) y la devuelve en WebP (o JPEG si el navegador no codifica WebP). */
async function shrinkPhoto(file, max = 480, quality = 0.82) {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  let blob = await new Promise((r) => canvas.toBlob(r, 'image/webp', quality));
  if (!blob || blob.type !== 'image/webp') blob = await new Promise((r) => canvas.toBlob(r, 'image/jpeg', 0.85));
  const ext = blob.type === 'image/webp' ? 'webp' : 'jpg';
  const buf = new Uint8Array(await blob.arrayBuffer());
  let bin = '';
  for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  return { base64: btoa(bin), ext, url: URL.createObjectURL(blob) };
}

function photoField(p) {
  const id = `f-${++uid}`;
  const preview = p.foto
    ? el('img', { class: 'ad-photo__img', src: pendingPhotos.get(p.foto)?.url || `${p.foto}`, alt: `Foto actual de ${p.nombre || 'la bebida'}` })
    : el('img', { class: 'ad-photo__img', src: 'assets/ilustraciones/bebida.svg', alt: '' });
  const input = el('input', { type: 'file', id, accept: 'image/*', class: 'visually-hidden' });
  const err = el('p', { class: 'field__error', hidden: true });
  input.addEventListener('change', async () => {
    const file = input.files[0];
    if (!file) return;
    if (!file.type.startsWith('image/') || file.size > 15_000_000) { err.textContent = 'Elegí una imagen (JPG, PNG o WebP) de hasta 15 MB.'; err.hidden = false; return; }
    try {
      const out = await shrinkPhoto(file);
      const path = `assets/fotos/${p.id}-${Date.now().toString(36)}.${out.ext}`;
      pendingPhotos.set(path, out);
      p.foto = path;
      render();
      status('Foto lista. Se sube al publicar.');
    } catch {
      err.textContent = 'No se pudo leer la imagen. Probá con otra.';
      err.hidden = false;
    }
  });
  const actions = el('div', { class: 'ad-photo__actions' },
    el('label', { class: 'btn btn--ghost ad-btn-sm ad-file', for: id, text: p.foto ? 'Cambiar foto' : 'Subir foto' }),
    p.foto ? el('button', { type: 'button', class: 'link-btn', text: 'Quitar foto', onclick: () => { delete p.foto; render(); } }) : null);
  return el('div', { class: 'ad-photo' }, preview, el('div', {}, input, actions, err));
}

function addDrink() {
  const id = `bebida-${Date.now().toString(36)}`;
  draft.catalog.productos.push({
    id, categoria: 'bebidas', nombre: '', estado: 'disponible',
    variantes: [{ id, presentacion: 'Unidad', unidades: 1, precio: null, precioEstado: 'pendiente', estado: 'disponible' }],
  });
  invalid.add(`n:${id}`);
  render();
  document.querySelector(`[data-product-card="${id}"] input`)?.focus();
}

function removeProduct(p) {
  if (!confirm(`¿Quitar “${p.nombre || 'esta bebida'}” de la carta?`)) return;
  draft.catalog.productos = draft.catalog.productos.filter((x) => x !== p);
  invalid.delete(`n:${p.id}`);
  for (const v of p.variantes) invalid.delete(`p:${v.id}`);
  render();
}

function renderProduct(p, editable) {
  const card = el('div', { class: 'ad-product', 'data-product-card': p.id });
  if (editable) {
    card.append(el('div', { class: 'ad-product__head' },
      el('h3', { class: 'ad-h3', text: p.nombre || 'Nueva bebida' }),
      el('button', { type: 'button', class: 'link-btn', text: 'Quitar', 'aria-label': `Quitar ${p.nombre || 'nueva bebida'}`, onclick: () => removeProduct(p) })));
    card.append(textField('Nombre', '', p.nombre, (v) => { p.nombre = v; }, { key: `n:${p.id}` }));
    card.append(photoField(p));
  } else {
    card.append(el('h3', { class: 'ad-h3', text: p.nombre }));
  }
  for (const v of p.variantes) {
    const name = p.variantes.length > 1 ? `${p.nombre}, ${v.presentacion.toLowerCase()}` : (p.nombre || 'nueva bebida');
    const row = el('div', { class: 'ad-variant' },
      editable
        ? textField('Presentación', name, v.presentacion === 'Unidad' ? '' : v.presentacion, (val) => { v.presentacion = val || 'Unidad'; }, { maxLength: 60 })
        : (p.variantes.length > 1 || v.presentacion !== 'Unidad' ? el('p', { class: 'ad-variant__name', text: v.presentacion + (v.unidades > 1 ? ` (${v.unidades} u.)` : '') }) : null),
      priceField({
        label: 'Precio', context: name, value: v.precio, key: `p:${v.id}`,
        onValue: (val) => { v.precio = val; v.precioEstado = val === null ? 'pendiente' : 'confirmado'; },
      }),
      stateField('Estado', name, v.estado, (val) => { v.estado = val; }));
    card.append(row);
  }
  return card;
}

/** Fotos de portada: subir (se achican a 1600 px), ordenar y quitar. */
function renderCover() {
  const box = $('[data-cover]');
  if (!box) return;
  if (!draft.business.portada) draft.business.portada = { fotos: [] };
  const fotos = draft.business.portada.fotos;
  box.replaceChildren();
  const list = el('ol', { class: 'ad-cover' });
  fotos.forEach((path, i) => {
    const move = (d) => { const j = i + d; [fotos[i], fotos[j]] = [fotos[j], fotos[i]]; renderCover(); updateBar(); };
    list.append(el('li', { class: 'ad-cover__item' },
      el('img', { class: 'ad-cover__img', src: pendingPhotos.get(path)?.url || path, alt: `Foto de portada ${i + 1}` }),
      el('div', { class: 'ad-cover__actions' },
        el('button', { type: 'button', class: 'link-btn', text: 'Subir', disabled: i === 0, 'aria-label': `Mover la foto ${i + 1} antes`, onclick: () => move(-1) }),
        el('button', { type: 'button', class: 'link-btn', text: 'Bajar', disabled: i === fotos.length - 1, 'aria-label': `Mover la foto ${i + 1} después`, onclick: () => move(1) }),
        el('button', { type: 'button', class: 'link-btn', text: 'Quitar', 'aria-label': `Quitar la foto ${i + 1}`, onclick: () => { fotos.splice(i, 1); renderCover(); updateBar(); } }))));
  });
  if (fotos.length) box.append(list);
  else box.append(el('p', { class: 'muted', text: 'Todavía no hay fotos reales: la portada usa la imagen actual.' }));
  if (fotos.length < MAX_PORTADA) {
    const id = `f-${++uid}`;
    const input = el('input', { type: 'file', id, accept: 'image/*', class: 'visually-hidden', multiple: true });
    const err = el('p', { class: 'field__error', hidden: true });
    input.addEventListener('change', async () => {
      const files = [...input.files].slice(0, MAX_PORTADA - fotos.length);
      for (const file of files) {
        if (!file.type.startsWith('image/') || file.size > 25_000_000) { err.textContent = 'Elegí imágenes JPG, PNG o WebP de hasta 25 MB.'; err.hidden = false; continue; }
        try {
          const out = await shrinkPhoto(file, 1600, 0.8);
          const path = `assets/fotos/portada-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}.${out.ext}`;
          pendingPhotos.set(path, out);
          fotos.push(path);
        } catch { err.textContent = 'No se pudo leer una de las imágenes.'; err.hidden = false; }
      }
      renderCover();
      updateBar();
      status('Fotos listas. Se suben al publicar.');
    });
    box.append(el('div', { class: 'ad-photo__actions' }, input,
      el('label', { class: 'btn btn--ghost ad-file', for: id, text: fotos.length ? 'Agregar fotos' : 'Subir fotos' }),
      el('span', { class: 'muted', text: `Hasta ${MAX_PORTADA}. Mejor horizontales.` })), err);
  }
}

function render() {
  renderCover();
  const box = $('[data-products]');
  box.replaceChildren();
  for (const cat of draft.catalog.categorias) {
    const editable = EDITABLE.has(cat.id);
    const products = draft.catalog.productos.filter((p) => p.categoria === cat.id);
    if (!products.length && !editable) continue;
    const section = el('section', { class: 'ad-panel', 'aria-labelledby': `cat-${cat.id}` }, el('h2', { class: 'ad-h2', id: `cat-${cat.id}`, text: cat.nombre }));
    if (editable && !products.length) section.append(el('p', { class: 'muted', text: `Sin productos: la web muestra “${cat.mensajeVacio || 'Próximamente'}”.` }));
    for (const p of products) section.append(renderProduct(p, editable));
    if (editable) section.append(el('div', { class: 'ad-actions' }, el('button', { type: 'button', class: 'btn btn--ghost', text: 'Agregar bebida', onclick: addDrink })));
    box.append(section);
  }

  const zones = $('[data-zones]');
  zones.replaceChildren();
  const grid = el('div', { class: 'ad-zones' });
  const list = draft.business.modalidades.envio.zonas;
  for (const z of list) {
    const f = priceField({
      label: z.nombre, context: '', value: z.tarifa, key: `z:${z.id}`,
      onValue: (val) => { z.tarifa = val; z.tarifaEstado = val === null ? 'pendiente' : 'confirmada'; },
    });
    f.append(el('button', { type: 'button', class: 'link-btn', text: 'Quitar barrio', 'aria-label': `Quitar ${z.nombre}`, onclick: () => {
      if (!confirm(`¿Quitar ${z.nombre} de los barrios con envío?`)) return;
      draft.business.modalidades.envio.zonas = list.filter((x) => x !== z);
      invalid.delete(`z:${z.id}`);
      render();
    } }));
    grid.append(f);
  }
  zones.append(grid);
  // Alta de barrio.
  const nameId = `f-${++uid}`;
  const priceId = `f-${++uid}`;
  const errNew = el('p', { class: 'field__error', hidden: true });
  const nameIn = el('input', { class: 'field__input', id: nameId, type: 'text', maxLength: 60, autocomplete: 'off' });
  const priceIn = el('input', { class: 'field__input ad-price__input', id: priceId, type: 'text', inputMode: 'numeric', autocomplete: 'off', placeholder: 'a cotizar' });
  const addBtn = el('button', { type: 'button', class: 'btn btn--ghost', text: 'Agregar barrio', onclick: () => {
    const nombre = nameIn.value.trim();
    const r = parsePriceInput(priceIn.value);
    if (!nombre) { errNew.textContent = 'Escribí el nombre del barrio.'; errNew.hidden = false; nameIn.focus(); return; }
    if (!r.ok) { errNew.textContent = r.error; errNew.hidden = false; priceIn.focus(); return; }
    let id = slugify(nombre);
    while (list.some((z) => z.id === id)) id += '-2';
    list.push({ id, nombre, tarifa: r.value, tarifaEstado: r.value === null ? 'pendiente' : 'confirmada' });
    render();
    status(`Se agregó ${nombre}. Publicá para que aparezca en la web.`);
  } });
  zones.append(el('div', { class: 'ad-newzone' },
    el('h3', { class: 'ad-h3', text: 'Agregar barrio' }),
    el('div', { class: 'ad-newzone__row' },
      el('div', { class: 'field' }, el('label', { class: 'field__label', for: nameId, text: 'Nombre del barrio' }), nameIn),
      el('div', { class: 'field ad-price' }, el('label', { class: 'field__label', for: priceId, text: 'Costo de envío' }),
        el('div', { class: 'ad-price__wrap' }, el('span', { class: 'ad-price__prefix', 'aria-hidden': 'true', text: '$' }), priceIn)),
      addBtn),
    errNew));
  updateBar();
}

/** Archivos de fotos para el commit: nuevas (base64) y las que dejaron de usarse (se borran). */
function photoFiles(catalog) {
  const cover = (draft.business.portada && draft.business.portada.fotos) || [];
  const used = new Set([...catalog.productos.map((p) => p.foto).filter(Boolean), ...cover]);
  const files = {};
  for (const [path, data] of pendingPhotos) if (used.has(path)) files[path] = { base64: data.base64 };
  for (const p of base.catalog.productos) if (p.foto && !used.has(p.foto)) files[p.foto] = null;
  for (const path of (base.business.portada && base.business.portada.fotos) || []) if (!used.has(path)) files[path] = null;
  return files;
}

function changes() {
  return base ? listChanges({ catalog: base.catalog, business: base.business }, draft) : [];
}

function updateBar() {
  const n = changes().length;
  const bad = invalid.size;
  $('[data-change-count]').textContent = bad ? `Revisá ${bad === 1 ? 'un dato' : `${bad} datos`} con error`
    : n ? `${n} ${n === 1 ? 'cambio sin publicar' : 'cambios sin publicar'}` : 'Sin cambios';
  $('[data-review]').disabled = !n || bad > 0;
  $('[data-discard]').disabled = !n && !bad;
}

/* ---------- Publicación ---------- */
function openReview() {
  const list = changes();
  const errs = [...validateCatalog(draft.catalog), ...validateBusiness(draft.business)];
  const ul = $('[data-change-list]');
  ul.replaceChildren(...list.map((c) => el('li', { text: c.text })));
  if (errs.length) ul.append(...errs.map((e) => el('li', { class: 'field__error', text: e })));
  $('[data-publish]').disabled = errs.length > 0;
  const d = $('[data-review-dialog]');
  d.showModal();
  $('#review-title').focus();
}

async function publish() {
  const btn = $('[data-publish]');
  btn.disabled = true;
  btn.textContent = 'Publicando…';
  const list = changes();
  try {
    // Si alguien publicó otra cosa mientras tanto, se usa el HTML más reciente; si cambiaron los datos, se frena.
    const head = await gh.headSha();
    let pages = base.pages;
    if (head !== base.sha) {
      const [c, b] = await Promise.all([gh.readText(DATA_FILES.catalog, head), gh.readText(DATA_FILES.business, head)]);
      if (JSON.stringify(JSON.parse(c)) !== JSON.stringify(base.catalog) || JSON.stringify(JSON.parse(b)) !== JSON.stringify(base.business)) {
        throw new GitHubError('Otra persona cambió los precios mientras editabas.', 409, 'conflicto');
      }
      pages = Object.fromEntries(await Promise.all(PAGES.map(async (p) => [p, await gh.readText(p, head)])));
    }
    const catalog = { ...clone(draft.catalog), actualizado: todayISO() };
    const { files, version } = buildSiteFiles({ catalog, business: draft.business, pages });
    await gh.commitFiles({ files: { ...files, ...photoFiles(catalog) }, message: commitMessage(list, login), parentSha: head });
    pendingPhotos.clear();
    $('[data-review-dialog]').close();
    status(`Publicado: ${list.length} ${list.length === 1 ? 'cambio' : 'cambios'}. La web se actualiza en 1 o 2 minutos.`);
    await loadFromRepo();
    waitForLive(version);
  } catch (err) {
    $('[data-review-dialog]').close();
    if (err.kind === 'conflicto') {
      status('No se publicó: los datos cambiaron en el repositorio mientras editabas. Recargá la página y volvé a cargar tus cambios.');
    } else if (err.kind === 'auth' || err.kind === 'permiso') {
      clearToken();
      status(`No se publicó: ${err.message} Ingresá de nuevo.`);
      show('login');
    } else {
      status(`No se publicó: ${err.message || 'error inesperado.'} Tus cambios siguen en pantalla; probá de nuevo.`);
    }
  } finally {
    btn.disabled = false;
    btn.textContent = 'Publicar cambios';
  }
}

/** Avisa cuando GitHub Pages ya sirve la versión nueva (solo informativo). */
async function waitForLive(version) {
  const url = new URL('./', location.href);
  for (let i = 0; i < 30; i++) {
    await new Promise((r) => setTimeout(r, 10_000));
    try {
      const html = await (await fetch(`${url}?v=${Date.now()}`, { cache: 'no-store' })).text();
      if (html.includes(`name="ebs-datos" content="${version}"`)) {
        status('Listo: la web ya muestra los cambios. Si en tu celular ves precios viejos, recargá la página.');
        return;
      }
    } catch { /* se reintenta */ }
  }
  status('GitHub sigue publicando. Si en unos minutos no ves los cambios, revisá la pestaña “Actions” del repositorio.');
}

/* ---------- Inicio ---------- */
function init() {
  $('[data-login-form]').addEventListener('submit', (e) => {
    e.preventDefault();
    const form = e.currentTarget;
    const token = form.token.value.trim();
    if (!token) {
      const errorEl = $('[data-token-error]');
      errorEl.textContent = 'Pegá el token de GitHub.';
      errorEl.hidden = false;
      $('#token').setAttribute('aria-invalid', 'true');
      $('#token').focus();
      return;
    }
    connect(token, { remember: form.remember.checked });
    form.token.value = '';
  });
  $('[data-logout]').addEventListener('click', () => {
    if (changes().length && !confirm('Tenés cambios sin publicar. ¿Salir igual?')) return;
    clearToken();
    gh = null; base = null; draft = null;
    show('login');
    status('Saliste del panel. El token se borró de este navegador.');
  });
  $('[data-discard]').addEventListener('click', () => {
    draft = { catalog: clone(base.catalog), business: clone(base.business) };
    invalid.clear();
    render();
    status('Se deshicieron los cambios sin publicar.');
  });
  $('[data-review]').addEventListener('click', openReview);
  $('[data-review-cancel]').addEventListener('click', () => $('[data-review-dialog]').close());
  $('[data-publish]').addEventListener('click', publish);
  $('[data-edit-form]').addEventListener('submit', (e) => e.preventDefault());
  window.addEventListener('beforeunload', (e) => { if (base && changes().length) { e.preventDefault(); e.returnValue = ''; } });

  const saved = readToken();
  let remembered = false;
  try { remembered = Boolean(localStorage.getItem(TOKEN_KEY)); } catch { /* nada */ }
  if (saved) connect(saved, { silent: true, remember: remembered });
  else show('login');
}

init();
