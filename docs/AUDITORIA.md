# Auditoría del rediseño · El Buen Sabor (antes Burguer Truck)

Fecha: 17/11/2026. Base: manual de marca edición 01 y su kit. Revisión local; **no se publicó nada**.

## 1. Problemas de la web anterior y estado

| Hallazgo (revalidado en el checkout) | Estado |
| --- | --- |
| Identidad centrada en “hamburguesas sobre ruedas”, naranja/amarillo | Corregido: El Buen Sabor, “Antes Burguer Truck”, paleta y tipografías del manual. |
| Horarios contradictorios entre inicio y menú | Corregido: una sola fuente (`data/negocio.json`). Hoy “a confirmar”. |
| Carrito solo en memoria | Corregido: persistencia versionada `ebs:pedido:v1`, reconciliada con la carta. |
| “Consultá precio” parseado como $0 | Corregido: precio `null` + estado; no se puede agregar y nunca suma $0. |
| Envío `null` tratado como 0 | Corregido: envío pendiente ≠ envío gratis; no se inventa total. |
| “Total” que era subtotal | Corregido: Subtotal, Envío y Total separados. |
| CTA de inicio/menú abrían WhatsApp sin el carrito | Corregido: todos los accesos abren el mismo pedido. |
| Barrio obligatorio aunque se ofrecía retiro | Corregido: retiro/envío modelados; retiro no pide barrio. |
| Selección de barrio duplicada | Corregido: una sola, dentro del pedido. |
| Cabecera tapando el carrito en móvil | Corregido: `<dialog>` modal en la capa superior; probado de 320 a 1440 px. |
| Imágenes PNG de 6–9 MB (58,49 MB en `img/`) | Corregido: AVIF/WebP responsive, 1,9 MB todas las variantes; transferencia inicial 233–306 KB. |
| Coverflow 3D y advertencias de Swiper | Eliminado Swiper. |
| Redes con `href="#"` | Retiradas hasta tener cuentas confirmadas. |
| Afirmaciones sin respaldo (“+5.000 vendidas”, “sin conservantes”, “brioche”, “smash”, “más pedido”) | Retiradas. |
| Admin en `localStorage` + contraseña verificada en el cliente y referenciada en un comentario | Retirado de la web. Editor local de borradores fuera del sitio público. Ver nota de seguridad. |
| Foco del diálogo, controles chicos, contrastes de botones | Corregido: diálogo con foco gestionado, controles ≥ 44 px, contrastes medidos. |
| Loader con espera artificial; contenido `.reveal` dependiente de JS | Eliminados. Todo visible sin JS. |
| Foto “del carrito” (`img/carrito.png`) | No se usa: tiene marca de agua de Gemini, el cartel dice “Burger Truck” y muestra el teléfono anterior. No es una foto documental. |

## 2. Datos confirmados por el propietario (17/11/2026) y pendientes

Confirmado después de la primera entrega: solo cambió el nombre; **contacto, ubicación, mapa, retiro y zonas de envío siguen iguales** a la etapa anterior. Horario: martes a domingo de 19:30 a 23:45, lunes cerrado. Carta nueva con precios del propietario (reemplaza los importes del manual): hamburguesas simple $4.500, completa $6.500, doble paty o KingKong $8.500; lomito con papas $15.500 y sin papas $12.500; sándwich de milanesa de carne o pollo $10.000; papas porción individual $3.500 y en caja $6.000; empanadas de carne o pollo, media docena $6.500 y docena $12.000. Combos y bebidas ya no figuran.

Pendientes que no bloquean el pedido:

1. **Tarifa de envío al Barrio 80 Viviendas**: ya figuraba sin precio; se muestra “envío a confirmar” y el total queda a confirmar.
2. **Medios de pago**: la web dice “Consultalos por WhatsApp”.
3. **Fotos de hamburguesas**: el kit no trae imágenes y no se usan las de `img/`; las fichas van sin foto. La foto del lomito es la ilustrativa del kit.
4. **Ingredientes**: no se publican descripciones de ingredientes (no confirmados). Las imágenes de milanesa y lomito son ilustrativas.
5. **Fotos reales** del local o del carrito, **redes sociales** y un **favicon** adaptado a tamaños chicos.
6. Docenas mixtas de empanadas: no se ofrecen hasta confirmarlo.

## 3. Pendientes o límites técnicos

- **Jekyll/GitHub Pages no se pudo ejecutar localmente** (no hay Ruby). La exclusión de `_herramientas/`, `_originales/` y lo listado en `_config.yml` se basa en el comportamiento documentado de Jekyll 3; verificarlo en el primer despliegue.
- **Lectores de pantalla y dispositivos físicos no probados.** Se probó con Chrome de escritorio en tamaños emulados, teclado y axe-core. Falta una pasada con VoiceOver/TalkBack y un teléfono real (teclado virtual sobre el pedido, `safe-area`).
- **Firefox y Safari no probados.** Se usan `<dialog>`, `:has()`, AVIF y `dvh`, con soporte actual en ambos; hay respaldos (WebP, `100dvh` con `height` fijo).
- **Sin datos de campo.** No hay CrUX ni RUM: LCP/INP/CLS de usuarios reales son desconocidos. TBT de laboratorio no es INP.
- **Seguridad**: la contraseña del panel anterior sigue en el historial público de Git. Si se usa en otro lado, cambiarla.
- `.git.broken-backup/` es el `.git` vacío que había en la carpeta antes de clonar; está ignorado por Git y se puede borrar.

## 4. Resultados de pruebas (17/11/2026, Windows 11, Chrome estable, Node 26)

- `npm run check`: páginas y datos sincronizados con `data/*.json`.
- `npm test`: **45/45** (los casos de cálculo usan la carta del manual como dato fijo; otra prueba verifica que cada precio vivo de `data/` aparezca en la carta) (casos de cálculo del encargo, variantes, envío conocido/pendiente/gratis, precio desconocido, reconciliación, persistencia, JSON corrupto, almacenamiento bloqueado, codificación de acentos/ñ/&/+, esquema, escape de HTML en el build).
- `npm run test:ui`: **25/25** (incluye el pedido real: arma el enlace a +54 9 3757 626892 con el mensaje, sin abrirlo):
  - sin errores de consola ni 404 propios; todos los enlaces y recursos responden bajo `/burguer_truck/`;
  - anclas `#featured #about #location #order` y categorías visibles bajo la cabecera;
  - flujo agregar/sumar/restar/quitar/vaciar/deshacer; variantes separadas; tope de cantidad;
  - persistencia inicio ↔ menú y recarga; restauración de pedido viejo; JSON corrupto; `localStorage` bloqueado; no toca otras claves del origen;
  - WhatsApp pendiente: ningún enlace a número; con datos de prueba interceptados: validación, retiro $30.000, envío $31.500 (tarifa ficticia $1.500 solo en tests), envío a cotizar; el enlace lleva exactamente el texto mostrado; **0 peticiones a WhatsApp**;
  - diálogo: foco inicial, Tab contenido, Escape, retorno del foco, bloqueo de scroll reversible;
  - axe-core (WCAG 2.0/2.1/2.2 A-AA + buenas prácticas) sin violaciones en inicio, menú, pedido abierto con errores, admin y 404, a 390 y 1440 px;
  - menú móvil, objetivos táctiles ≥ 44 px; sello ≥ 240 px con aire ≥ 10 % y perfil simplificado ≥ 96 px en los 7 anchos;
  - sin scroll horizontal ni controles tapados a **320, 360, 390, 430, 768, 1024 y 1440 px**; la barra inferior no tapa el pie;
  - sin JavaScript (carta y precios legibles); imágenes bloqueadas;
  - editor: validación, borrador aislado de la web, importación inválida rechazada, importación válida con diferencias, exportación.
- **Lighthouse 12.6.0**, móvil emulado, red simulada, caché fría, servidor local con gzip, 3 corridas por página:

| Página | Rendimiento | Accesibilidad | Buenas prácticas | SEO | LCP | CLS | TBT | Transferencia |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Inicio | 98 | 100 | 100 | 100 | 2,3 s | 0–0,003 | 0 ms | 306 KB |
| Menú | 98–99 | 100 | 100 | 100 | 2,2 s | 0,029–0,064 | 0 ms | 233 KB |

Son mediciones de laboratorio en esta máquina, no garantía de campo.

## 5. Contrastes medidos

| Combinación | Relación | Uso |
| --- | --- | --- |
| Blanco sobre rojo #E60012 | 4,80:1 | Botones principales |
| Blanco sobre rojo hover #C4000F | 6,26:1 | Hover |
| Rojo #E60012 sobre crema | 4,17:1 | **No** se usa para texto |
| Rojo texto #C4000F sobre crema / blanco | 5,43 / 6,26:1 | Etiquetas pequeñas |
| Miel sobre carbón | 8,58:1 | Detalles en fondos oscuros |
| Miel sobre blanco | 2,15:1 | **No** se usa para texto |
| Texto secundario #5F5850 sobre crema | 6,08:1 | Notas |
| Bordes de controles #8A847C sobre blanco | 3,70:1 | Campos y opciones |

## 6. Imágenes

| Recurso | Original | Web (lo que descarga un móvil típico) |
| --- | --- | --- |
| Portada | PNG 1672×941, 2,2 MB | AVIF 1024 px, 27 KB |
| Empanadas / milanesas / papas | PNG 1536×1024, 2,3–2,4 MB c/u | AVIF 768 px, 13–24 KB |
| Sello principal | PNG RGBA 1254 px, 1,8 MB | AVIF 560 px, 66 KB (se muestra a 240–282 px) |
| Perfil simplificado | PNG 1254 px, 1,7 MB | AVIF 192 px, 14 KB (pie, 96 px) |

Detalle completo en `assets/img/manifest.json`. Originales en `_originales/` (no se publican). Pizza y lomito solo como originales: no se usan.

## 7. Decisiones de arquitectura

- Se mantiene **sitio estático** (HTML + CSS + módulos JS), sin framework ni dependencias en producción.
- **Fuente única**: `data/*.json` → build → `js/data/datos.js` + HTML prerenderizado (legible sin JS y para buscadores). `npm run check` detecta desincronización.
- **Fichas por sabor** (carne / pollo) con selector de presentación solo cuando hay variantes; precio visible sin abrir nada.
- **Pedido** en `<dialog>` modal: panel lateral en escritorio, pantalla completa en móvil, con cabecera y totales fijos.
- **Editor** local, fuera del sitio público, con borrador, validación, importación con diferencias y exportación de los JSON canónicos. Sin “publicar”: publicar es commit + push.
- **Panel de precios** en `admin.html` (`noindex`): edita precios, disponibilidad y tarifas de envío y publica con un commit vía API de GitHub, usando el mismo `js/core/build-core.js` que `npm run build`. Acceso con token fine-grained de GitHub (solo `Contents: Read and write` sobre este repo), verificado por GitHub; sin credenciales en el código. Los datos se cargan con versión (`datos.js?v=HASH`) para que nadie mezcle precios viejos con HTML nuevo.

## 8. Comparación con el manual

| Punto del manual | Cumplimiento |
| --- | --- |
| Nombre en textos “El Buen Sabor”, histórico “Burguer Truck” | Sí |
| “Crecimos. Y el sabor sigue.” / “Antes Burguer Truck” / “Siempre hay algo rico.” | Sí (portada, menú, pie) |
| Relato corto de historia | Sí, sin anunciar apertura |
| Logo fiel, legible y con aire | Sello de 240 px (móvil) a 282 px (escritorio) con margen ≥ 10 %; simplificado a 96 px; cabecera con nombre en texto |
| Paleta y tipografías | Sí; Oswald títulos/precios, Poppins texto |
| Fotografía ilustrativa rotulada | Sí, cerca de la carta |
| Carta | Carta del propietario (17/11/2026), que reemplaza los importes del manual por instrucción explícita |
| Pizzas sin compra | Sí, no se muestran. Lomito ya está a la venta por decisión del propietario |
| Pedido con producto, variante, cantidad y total antes de enviar | Sí, con vista del mensaje |
| Voz con voseo, sin claims no confirmados | Sí |
