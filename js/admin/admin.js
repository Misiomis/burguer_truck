// Panel de precios de El Buen Sabor.
// Lee los datos del repositorio, permite editar precios, disponibilidad y tarifas de envío,
// y publica un commit con los mismos archivos que generaría `npm run build`.
import { createGitHub, GitHubError } from './github.js';
import { parsePriceInput, listChanges, commitMessage, todayISO } from './cambios.js';
import { buildSiteFiles, PAGES, DATA_FILES } from '../core/build-core.js';
import { validateCatalog, validateBusiness } from '../core/schema.js';

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

function render() {
  const box = $('[data-products]');
  box.replaceChildren();
  for (const cat of draft.catalog.categorias) {
    const products = draft.catalog.productos.filter((p) => p.categoria === cat.id);
    if (!products.length) continue;
    const section = el('section', { class: 'ad-panel', 'aria-labelledby': `cat-${cat.id}` }, el('h2', { class: 'ad-h2', id: `cat-${cat.id}`, text: cat.nombre }));
    for (const p of products) {
      const card = el('div', { class: 'ad-product' }, el('h3', { class: 'ad-h3', text: p.nombre }));
      for (const v of p.variantes) {
        const name = p.variantes.length > 1 ? `${p.nombre}, ${v.presentacion.toLowerCase()}` : p.nombre;
        const row = el('div', { class: 'ad-variant' },
          p.variantes.length > 1 || v.presentacion !== 'Unidad' ? el('p', { class: 'ad-variant__name', text: v.presentacion + (v.unidades > 1 ? ` (${v.unidades} u.)` : '') }) : null,
          priceField({
            label: 'Precio',
            context: name,
            value: v.precio,
            key: `p:${v.id}`,
            onValue: (val) => { v.precio = val; v.precioEstado = val === null ? 'pendiente' : 'confirmado'; },
          }),
          stateField('Estado', name, v.estado, (val) => { v.estado = val; }));
        card.append(row);
      }
      section.append(card);
    }
    box.append(section);
  }
  const zones = $('[data-zones]');
  zones.replaceChildren();
  const grid = el('div', { class: 'ad-zones' });
  for (const z of draft.business.modalidades.envio.zonas) {
    const f = priceField({
      label: z.nombre, context: '', value: z.tarifa, key: `z:${z.id}`,
      onValue: (val) => { z.tarifa = val; z.tarifaEstado = val === null ? 'pendiente' : 'confirmada'; },
    });
    grid.append(f);
  }
  zones.append(grid);
  updateBar();
}

function changes() {
  return base ? listChanges({ catalog: base.catalog, business: base.business }, draft) : [];
}

function updateBar() {
  const n = changes().length;
  const bad = invalid.size;
  $('[data-change-count]').textContent = bad ? `Revisá ${bad === 1 ? 'un importe' : `${bad} importes`} con error`
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
    await gh.commitFiles({ files, message: commitMessage(list, login), parentSha: head });
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
