// Piezas compartidas de layout (cabecera, pie, diálogo del pedido, barra inferior).
// Se insertan por build en cada página para no duplicar marcado a mano.
import { icon, esc } from './render.js';

// La carta vive en el inicio: la navegación son anclas de la misma página.
const NAV = [
  { href: '#carta', label: 'Menú' },
  { href: '#about', label: 'Nuestra historia' },
  { href: '#location', label: 'Contacto' },
];

export function header(page, biz) {
  const links = NAV.map((l) => `<li><a class="site-nav__link" href="${l.href}">${l.label}</a></li>`).join('');
  return `<header class="site-header" id="navbar">
  <div class="container site-header__inner">
    <a class="brand" href="./"${page === 'index' ? ' aria-current="page"' : ''}><span class="brand__name">${esc(biz.nombre)}</span><span class="brand__before">Antes ${esc(biz.nombreHistorico)}</span></a>
    <nav class="site-nav" aria-label="Principal">
      <button type="button" class="site-nav__toggle js-only" aria-expanded="false" aria-controls="nav-list">${icon('menu')}<span class="visually-hidden">Abrir navegación</span></button>
      <ul class="site-nav__list" id="nav-list" role="list">${links}</ul>
    </nav>
    <button type="button" class="order-btn js-only" data-open-cart aria-haspopup="dialog">${icon('bag')}<span class="order-btn__label">Ver pedido</span><span class="order-btn__count" data-cart-count aria-hidden="true">0</span><span class="visually-hidden" data-cart-count-label>, vacío</span></button>
  </div>
</header>`;
}

export function footer(page, contactHtml) {
  const p = page === 'index' ? '' : './';
  return `<footer class="site-footer">
  <div class="container footer__grid">
    <div class="footer__brand">
      <picture><source type="image/avif" srcset="assets/img/logo-simplificado-192.avif"><img class="footer__logo" src="assets/img/logo-simplificado-192.webp" width="96" height="96" alt="" loading="lazy" decoding="async"></picture>
      <div>
        <p class="footer__name">El Buen Sabor</p>
        <p class="footer__before">Antes Burguer Truck</p>
        <p class="footer__lema">Siempre hay algo rico.</p>
      </div>
    </div>
    <nav aria-labelledby="f-nav"><h2 class="footer__title" id="f-nav">Secciones</h2>
      <ul class="plain footer__list" role="list">
        <li><a href="${p}#carta">Menú</a></li>
        <li><a href="${p}#about">Nuestra historia</a></li>
        <li><a href="${p}#location">Contacto</a></li>
        <li><a href="${p}#order">Cómo pedir</a></li>
      </ul>
    </nav>
    <div><h2 class="footer__title">Contacto</h2>${contactHtml}</div>
  </div>
  <div class="container footer__bottom"><p>© 2026 El Buen Sabor. Imágenes de comida ilustrativas.</p></div>
</footer>`;
}

export const ORDER_BAR = `<div class="order-bar js-only" data-order-bar hidden>
  <button type="button" class="order-bar__btn" data-open-cart aria-haspopup="dialog"><span>Ver pedido</span><span class="order-bar__sum" data-cart-bar-summary></span></button>
</div>`;

export const LIVE_REGION = `<div class="visually-hidden" role="status" aria-live="polite" aria-atomic="true" data-announcer></div>`;

export function cartDialog(page) {
  const menuHref = '#carta';
  return `<dialog class="cart" id="pedido" aria-labelledby="cart-title" data-cart>
  <div class="cart__panel">
    <header class="cart__head">
      <h2 class="cart__title" id="cart-title" tabindex="-1">Tu pedido</h2>
      <button type="button" class="icon-btn" data-close-cart aria-label="Cerrar pedido">${icon('close')}</button>
    </header>
    <div class="cart__body">
      <div class="cart__notices" data-cart-notices></div>
      <div class="cart__empty" data-cart-empty>
        <p class="cart__empty-title">Tu pedido está vacío.</p>
        <p>Elegí algo del menú para empezar.</p>
        <a class="btn btn--primary" href="${menuHref}" data-go-menu>Ver menú</a>
      </div>
      <div data-cart-filled hidden>
        <ul class="cart__lines plain" role="list" data-cart-lines></ul>
        <button type="button" class="link-btn" data-clear-cart>${icon('trash')}Vaciar pedido</button>
        <form class="checkout" data-checkout novalidate>
          <fieldset class="checkout__group">
            <legend class="checkout__legend">Entrega</legend>
            <div data-mode-options></div>
            <p class="field__error" id="err-mode" data-error="mode" hidden></p>
          </fieldset>
          <div class="checkout__delivery" data-delivery-fields hidden>
            <div class="field">
              <label class="field__label" for="c-zone">Zona de envío</label>
              <select class="field__input" id="c-zone" name="zone" aria-describedby="err-zone"></select>
              <p class="field__error" id="err-zone" data-error="zone" hidden></p>
            </div>
            <div class="field">
              <label class="field__label" for="c-address">Dirección de entrega</label>
              <input class="field__input" id="c-address" name="address" autocomplete="street-address" maxlength="140" aria-describedby="err-address">
              <p class="field__error" id="err-address" data-error="address" hidden></p>
            </div>
            <div class="field">
              <label class="field__label" for="c-reference">Referencia <span class="field__opt">(opcional)</span></label>
              <input class="field__input" id="c-reference" name="reference" maxlength="140">
            </div>
          </div>
          <div class="field">
            <label class="field__label" for="c-name">Nombre <span class="field__opt">(opcional)</span></label>
            <input class="field__input" id="c-name" name="name" autocomplete="given-name" maxlength="60">
          </div>
          <div class="field">
            <label class="field__label" for="c-notes">Observaciones <span class="field__opt">(opcional)</span></label>
            <textarea class="field__input" id="c-notes" name="notes" rows="2" maxlength="300"></textarea>
          </div>
          <p class="checkout__privacy">Tu nombre, dirección y observaciones no se guardan en esta web: solo van en el mensaje.</p>
          <details class="preview">
            <summary>Ver el mensaje que vas a enviar</summary>
            <pre class="preview__text" data-message-preview></pre>
          </details>
        </form>
      </div>
    </div>
    <footer class="cart__foot" data-cart-foot hidden>
      <dl class="totals">
        <div class="totals__row"><dt>Subtotal</dt><dd data-subtotal></dd></div>
        <div class="totals__row"><dt>Envío</dt><dd data-shipping></dd></div>
        <div class="totals__row totals__row--total"><dt>Total</dt><dd data-total></dd></div>
      </dl>
      <p class="cart__hint" data-cart-hint></p>
      <a class="btn btn--primary btn--block" data-whatsapp href="#" target="_blank" rel="noopener noreferrer" hidden>${icon('whatsapp')}Continuar por WhatsApp</a>
      <button type="button" class="btn btn--primary btn--block" data-whatsapp-pending disabled hidden>${icon('whatsapp')}WhatsApp a confirmar</button>
      <button type="button" class="btn btn--ghost btn--block" data-copy>${icon('copy')}Copiar resumen</button>
    </footer>
  </div>
</dialog>`;
}
