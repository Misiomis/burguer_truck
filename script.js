/**
 * ============================================================
 *  BURGUER TRUCK — script.js
 *  Funcionalidades:
 *   1. Loader de entrada
 *   2. Navbar: sticky scroll + menú mobile
 *   3. Smooth scrolling para enlaces ancla
 *   4. Reveal animations con IntersectionObserver
 *   5. Parallax sutil en el hero
 *   6. Sticky filter bar en menu.html
 *   7. Filtrado de menú por categoría
 *   8. WhatsApp con barrio dinámico (selector de envio)
 *   9. Carrusel Swiper
 *  10. Aplicar overrides del admin (localStorage)
 * ============================================================
 */

(function () {
  'use strict';

  /* ──────────────────────────────────────────
     0. APLICAR CAMBIOS DEL ADMIN
     Lee bt_products_v1 del localStorage y
     actualiza nombre, precio y descripción
     en todos los artículos con data-pid.
  ────────────────────────────────────────── */
  (function applyProductOverrides() {
    try {
      const raw = localStorage.getItem('bt_products_v1');
      if (!raw) return;
      const products = JSON.parse(raw);
      products.forEach(function(p) {
        document.querySelectorAll('[data-pid="' + p.pid + '"]').forEach(function(el) {
          var nameEl  = el.querySelector('.burger-card__name, .menu-card__name');
          var descEl  = el.querySelector('.burger-card__desc, .menu-card__desc');
          var priceEl = el.querySelector('.burger-card__price, .menu-card__price');
          if (nameEl  && p.name)  nameEl.textContent  = p.name;
          if (descEl  && p.desc)  descEl.textContent  = p.desc;
          if (priceEl && p.price) priceEl.textContent = p.price;
        });
      });
    } catch (e) { /* silenciar errores de parsing */ }
  })();

  /* ──────────────────────────────────────────
     1. LOADER
     Oculta la pantalla de carga cuando el DOM
     y los recursos estén listos.
  ────────────────────────────────────────── */
  function initLoader() {
    const loader = document.getElementById('loader');
    if (!loader) return;

    // Mínimo 800 ms para dar tiempo a que se vea la animación
    const minDuration = 800;
    const start = Date.now();

    function hideLoader() {
      const elapsed = Date.now() - start;
      const delay   = Math.max(0, minDuration - elapsed);
      setTimeout(() => {
        loader.classList.add('hidden');
        document.body.classList.remove('no-scroll');
      }, delay);
    }

    document.body.classList.add('no-scroll');

    if (document.readyState === 'complete') {
      hideLoader();
    } else {
      window.addEventListener('load', hideLoader, { once: true });
    }
  }

  /* ──────────────────────────────────────────
     2. NAVBAR
     - Agrega clase .scrolled al hacer scroll
     - Toggle del menú mobile con animación
     - Cierra el menú al hacer clic en un link
  ────────────────────────────────────────── */
  function initNavbar() {
    const navbar     = document.getElementById('navbar');
    const toggle     = document.getElementById('menuToggle');
    const links      = document.getElementById('navLinks');
    if (!navbar) return;

    /* Clase scrolled */
    function onScroll() {
      if (window.scrollY > 60) {
        navbar.classList.add('scrolled');
      } else {
        navbar.classList.remove('scrolled');
      }
    }

    // Aplicar estado inicial sin esperar primer scroll
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });

    /* Mobile toggle */
    if (toggle && links) {
      toggle.addEventListener('click', () => {
        const isOpen = links.classList.toggle('open');
        toggle.classList.toggle('open', isOpen);
        toggle.setAttribute('aria-expanded', isOpen);
        document.body.classList.toggle('no-scroll', isOpen);
      });

      // Cerrar al tocar un enlace
      links.querySelectorAll('a').forEach(link => {
        link.addEventListener('click', () => {
          links.classList.remove('open');
          toggle.classList.remove('open');
          toggle.setAttribute('aria-expanded', 'false');
          document.body.classList.remove('no-scroll');
        });
      });

      // Cerrar al presionar Escape
      document.addEventListener('keydown', e => {
        if (e.key === 'Escape' && links.classList.contains('open')) {
          links.classList.remove('open');
          toggle.classList.remove('open');
          toggle.setAttribute('aria-expanded', 'false');
          document.body.classList.remove('no-scroll');
        }
      });
    }
  }

  /* ──────────────────────────────────────────
     3. SMOOTH SCROLLING
     Para links del tipo href="#seccion"
     (Chrome moderno lo hace solo con CSS, pero
     lo añadimos para máxima compatibilidad).
  ────────────────────────────────────────── */
  function initSmoothScroll() {
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
      anchor.addEventListener('click', function (e) {
        const targetId  = this.getAttribute('href');
        if (targetId === '#') return;
        const target = document.querySelector(targetId);
        if (!target) return;

        e.preventDefault();
        const navbarH = document.getElementById('navbar')?.offsetHeight || 72;
        const top = target.getBoundingClientRect().top + window.scrollY - navbarH;

        window.scrollTo({ top, behavior: 'smooth' });
      });
    });
  }

  /* ──────────────────────────────────────────
     4. REVEAL ANIMATIONS (IntersectionObserver)
     Añade .visible a cada elemento .reveal
     cuando entra en el viewport.
  ────────────────────────────────────────── */
  function initReveal() {
    // Si el usuario prefiere movimiento reducido, mostrar todo de inmediato
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      document.querySelectorAll('.reveal').forEach(el => el.classList.add('visible'));
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            entry.target.classList.add('visible');
            observer.unobserve(entry.target); // animar una sola vez
          }
        });
      },
      {
        threshold: 0.12,      // visible cuando el 12% entra en pantalla
        rootMargin: '0px 0px -40px 0px'
      }
    );

    document.querySelectorAll('.reveal').forEach(el => observer.observe(el));
  }

  /* ──────────────────────────────────────────
     5. PARALLAX HERO
     Mueve la imagen de fondo del hero a una
     velocidad menor que el scroll para crear
     profundidad.
  ────────────────────────────────────────── */
  function initParallax() {
    const heroBg = document.getElementById('heroBg');
    if (!heroBg) return;

    // Desactivar en mobile para mejorar rendimiento
    const isMobile = window.matchMedia('(max-width: 768px)').matches;
    if (isMobile) return;

    let ticking = false;

    function updateParallax() {
      const scrollY = window.scrollY;
      // Factor 0.35 → se mueve 35% de la velocidad de scroll
      heroBg.style.transform = `translateY(${scrollY * 0.35}px)`;
      ticking = false;
    }

    window.addEventListener('scroll', () => {
      if (!ticking) {
        requestAnimationFrame(updateParallax);
        ticking = true;
      }
    }, { passive: true });
  }

  /* ──────────────────────────────────────────
     6. STICKY FILTER BAR (sólo menu.html)
     Añade clase .is-sticky al pasar la barra
     de filtros por la parte superior del viewport
     (debajo del navbar).
  ────────────────────────────────────────── */
  function initStickyFilter() {
    const filterBar = document.getElementById('menuFilter');
    if (!filterBar) return;

    const navbarH = document.getElementById('navbar')?.offsetHeight || 72;

    const observer = new IntersectionObserver(
      ([entry]) => {
        filterBar.classList.toggle('is-sticky', !entry.isIntersecting);
      },
      {
        rootMargin: `-${navbarH}px 0px 0px 0px`,
        threshold: 0
      }
    );

    // Observamos un sentinel justo antes del filter bar
    const sentinel = document.createElement('div');
    sentinel.style.cssText = 'height:1px;pointer-events:none;';
    filterBar.parentElement.insertBefore(sentinel, filterBar);
    observer.observe(sentinel);
  }

  /* ──────────────────────────────────────────
     7. MENU FILTERING
     Filtra las tarjetas y oculta/muestra
     categorías completas según el botón activo.
  ────────────────────────────────────────── */
  function initMenuFilter() {
    const filterBtns = document.querySelectorAll('.filter-btn');
    if (!filterBtns.length) return;

    const allCards      = document.querySelectorAll('.menu-card[data-category]');
    const allCategories = document.querySelectorAll('.menu-category');

    filterBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        const filter = btn.dataset.filter;

        /* Actualizar estado de botones */
        filterBtns.forEach(b => {
          b.classList.toggle('active', b === btn);
          b.setAttribute('aria-selected', b === btn ? 'true' : 'false');
        });

        if (filter === 'all') {
          /* Mostrar todo */
          allCards.forEach(card => card.classList.remove('hidden'));
          allCategories.forEach(cat => cat.classList.remove('category-hidden'));
        } else {
          /* Mostrar sólo la categoría seleccionada */
          allCards.forEach(card => {
            card.classList.toggle('hidden', card.dataset.category !== filter);
          });

          allCategories.forEach(cat => {
            const catId = cat.id; // cat-burger, cat-combo, cat-drink
            const show  = catId === `cat-${filter}`;
            cat.classList.toggle('category-hidden', !show);
          });
        }

        /* Hacer scroll suave hasta el inicio del menú */
        const menuMain = document.getElementById('menu-main');
        if (menuMain) {
          const navbarH = document.getElementById('navbar')?.offsetHeight || 72;
          const filterH = document.getElementById('menuFilter')?.offsetHeight || 56;
          const top = menuMain.getBoundingClientRect().top + window.scrollY - navbarH - filterH;
          window.scrollTo({ top, behavior: 'smooth' });
        }
      });
    });
  }

  /* ──────────────────────────────────────────
     8. WHATSAPP CON BARRIO DINÁMICO
     Escucha el selector de barrio y actualiza
     el href de todos los botones WhatsApp del
     sitio con el mensaje correspondiente.
  ────────────────────────────────────────── */
  function initWhatsApp() {
    // Número en formato internacional (sin + ni espacios)
    // Reemplazá XXXXXXXXXX por tu número real
    const WA_NUMBER = '5493757626892';

    const select       = document.getElementById('neighborhoodSelect');
    const feedback     = document.getElementById('deliveryFeedback');
    const hint         = document.getElementById('deliveryHint');
    const deliveryBtn  = document.getElementById('waDeliveryBtn');
    const orderBtn     = document.getElementById('waOrderBtn');

    /* Construye la URL de WhatsApp con el mensaje dinámico */
    function buildWaUrl(neighborhood) {
      if (!neighborhood) {
        return `https://wa.me/${WA_NUMBER}`;
      }
      const msg = `Hola! Quiero hacer un pedido desde el ${neighborhood}.`;
      return `https://wa.me/${WA_NUMBER}?text=${encodeURIComponent(msg)}`;
    }

    /* Actualiza todos los botones WhatsApp de la página */
    function updateButtons(neighborhood) {
      const url = buildWaUrl(neighborhood);

      if (deliveryBtn) deliveryBtn.href = url;
      if (orderBtn)    orderBtn.href    = url;
    }

    /* Actualiza el mensaje visual debajo del selector */
    function updateFeedback(neighborhood) {
      if (!feedback || !hint) return;

      if (neighborhood) {
        feedback.textContent = `✅ Envío a: ${neighborhood}`;
        if (hint) hint.textContent = 'Hacé clic en el botón para pedir.';
      } else {
        feedback.textContent = '';
        if (hint) hint.textContent = 'Elegí un barrio para continuar.';
      }
    }

    /* Listener principal del selector */
    if (select) {
      select.addEventListener('change', () => {
        const neighborhood = select.value;
        updateButtons(neighborhood);
        updateFeedback(neighborhood);
      });

      // Sincronizar estado inicial (por si el navegador recuerda el valor)
      if (select.value) {
        updateButtons(select.value);
        updateFeedback(select.value);
      }
    }
  }

  /* ──────────────────────────────────────────
     INIT – arrancar todo cuando el DOM esté listo
  ────────────────────────────────────────── */
  /* ──────────────────────────────────────────
     9. CARRUSEL 3D con perspectiva
     La card central aparece grande y al fondo.
     Las adyacentes se achican y rotan en Y.
  ────────────────────────────────────────── */
  function initCarousels() {
    const coverflowOpts = {
      rotate: 30,
      stretch: 0,
      depth: 120,
      modifier: 1,
      slideShadows: false,
    };

    /* ── Carrusel principal (index.html) ── */
    const burgerEl = document.querySelector('.burger-swiper');
    if (burgerEl) {
      new Swiper(burgerEl, {
        effect: 'coverflow',
        grabCursor: true,
        centeredSlides: true,
        slidesPerView: 'auto',
        loop: true,
        coverflowEffect: coverflowOpts,
        pagination: { el: burgerEl.querySelector('.swiper-pagination'), clickable: true },
        navigation: {
          nextEl: burgerEl.querySelector('.swiper-button-next'),
          prevEl: burgerEl.querySelector('.swiper-button-prev'),
        },
      });
    }

    /* ── Carruseles de menú (menu.html) ── */
    document.querySelectorAll('.menu-swiper').forEach(el => {
      new Swiper(el, {
        effect: 'coverflow',
        grabCursor: true,
        centeredSlides: true,
        slidesPerView: 'auto',
        loop: true,
        coverflowEffect: coverflowOpts,
        pagination: { el: el.querySelector('.swiper-pagination'), clickable: true },
        navigation: {
          nextEl: el.querySelector('.swiper-button-next'),
          prevEl: el.querySelector('.swiper-button-prev'),
        },
      });
    });
  }

  /* ──────────────────────────────────────────
     INIT
  ────────────────────────────────────────── */

  /* ── Dropdown personalizado de barrios ── */
  function initNeighborhoodDropdown() {
    const container = document.getElementById('nbhood');
    const trigger   = document.getElementById('nbhoodTrigger');
    const list      = document.getElementById('nbhoodList');
    const labelEl   = document.getElementById('nbhoodLabel');
    const select    = document.getElementById('neighborhoodSelect');
    if (!container || !trigger || !list) return;

    /* Abrir / cerrar */
    trigger.addEventListener('click', () => {
      const open = container.classList.toggle('nbhood--open');
      trigger.setAttribute('aria-expanded', open ? 'true' : 'false');
    });

    /* Cerrar al hacer clic fuera */
    document.addEventListener('click', e => {
      if (!container.contains(e.target)) {
        container.classList.remove('nbhood--open');
        trigger.setAttribute('aria-expanded', 'false');
      }
    });

    /* Cerrar con Escape */
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape') {
        container.classList.remove('nbhood--open');
        trigger.setAttribute('aria-expanded', 'false');
        trigger.focus();
      }
    });

    /* Seleccionar barrio */
    list.addEventListener('click', e => {
      const item = e.target.closest('.nbhood__item');
      if (!item) return;
      const value = item.dataset.value;

      labelEl.textContent = value;

      list.querySelectorAll('.nbhood__item').forEach(i => i.classList.remove('nbhood__item--selected'));
      item.classList.add('nbhood__item--selected');

      /* Sincronizar select oculto para que initWhatsApp() lo detecte */
      if (select) {
        select.value = value;
        select.dispatchEvent(new Event('change'));
      }

      container.classList.remove('nbhood--open');
      trigger.setAttribute('aria-expanded', 'false');
    });
  }

  function init() {
    initLoader();
    initNavbar();
    initSmoothScroll();
    initReveal();
    initParallax();
    initStickyFilter();
    initMenuFilter();
    initWhatsApp();
    initNeighborhoodDropdown();
    initCarousels();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
