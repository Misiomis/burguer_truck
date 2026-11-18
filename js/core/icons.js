// Íconos de trazo, 24x24, dibujados para este sitio. El build los inserta una vez por página.
const S = 'fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"';

const ICONS = {
  bag: `<path ${S} d="M5 8h14l-1 12H6L5 8z"/><path ${S} d="M9 8V6a3 3 0 0 1 6 0v2"/>`,
  close: `<path ${S} d="M6 6l12 12M18 6L6 18"/>`,
  plus: `<path ${S} d="M12 5v14M5 12h14"/>`,
  minus: `<path ${S} d="M5 12h14"/>`,
  trash: `<path ${S} d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>`,
  arrow: `<path ${S} d="M5 12h14M13 6l6 6-6 6"/>`,
  menu: `<path ${S} d="M4 7h16M4 12h16M4 17h16"/>`,
  copy: `<rect ${S} x="9" y="9" width="11" height="11" rx="2"/><path ${S} d="M5 15V5a1 1 0 0 1 1-1h10"/>`,
  check: `<path ${S} d="M5 12l5 5L20 7"/>`,
  info: `<circle ${S} cx="12" cy="12" r="9"/><path ${S} d="M12 11v5M12 8h.01"/>`,
  pin: `<path ${S} d="M12 21s7-6.2 7-12a7 7 0 0 0-14 0c0 5.8 7 12 7 12z"/><circle ${S} cx="12" cy="9" r="2.5"/>`,
  clock: `<circle ${S} cx="12" cy="12" r="9"/><path ${S} d="M12 7v5l3 2"/>`,
  card: `<rect ${S} x="3" y="6" width="18" height="13" rx="2"/><path ${S} d="M3 10h18M7 15h3"/>`,
  // Símbolo de WhatsApp simplificado (contorno de globo con auricular), en el mismo estilo de trazo.
  whatsapp: `<path ${S} d="M4 20l1.3-4A8 8 0 1 1 8 18.7L4 20z"/><path ${S} d="M9 9.5c0 3 2.5 5.5 5.5 5.5l1-1.5-2-1-1 1a4 4 0 0 1-2-2l1-1-1-2L9 9.5z"/>`,
};

export const SPRITE = `<svg xmlns="http://www.w3.org/2000/svg" class="sprite" aria-hidden="true" focusable="false">`
  + Object.entries(ICONS).map(([id, body]) => `<symbol id="i-${id}" viewBox="0 0 24 24">${body}</symbol>`).join('')
  + `</svg>`;

export const ICON_IDS = Object.keys(ICONS);
