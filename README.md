# El Buen Sabor · sitio web (antes Burguer Truck)

Sitio estático publicado en GitHub Pages: <https://misiomis.github.io/burguer_truck/>.
La ruta y los enlaces conocidos se mantienen (`/burguer_truck/`, `menu.html`, `#about`, `#location`, `#order`, `#featured`).

Base visual y de contenido: **Manual de marca El Buen Sabor, edición 01 (17/11/2026)** y su kit de recursos.

## Empezar

Requisitos: Node.js 20 o superior. Las dependencias son solo herramientas de desarrollo (imágenes y pruebas); el sitio publicado no usa ninguna librería externa.

```bash
npm install
npm run dev        # http://localhost:4173/burguer_truck/
```

El servidor local reproduce la subruta de GitHub Pages y comprime con gzip como lo hace Pages. No necesita credenciales.

| Comando | Qué hace |
| --- | --- |
| `npm run dev` | Sirve el sitio en `http://localhost:4173/burguer_truck/`. |
| `npm run build` | Valida `data/*.json`, regenera `js/data/datos.js`, los bloques prerenderizados de `index.html` y `menu.html`, y `sitemap.xml`. |
| `npm run check` | Falla si algo generado quedó desactualizado respecto de `data/*.json` (no escribe). |
| `npm test` | Pruebas unitarias (cálculo, variantes, reconciliación, mensaje, persistencia, esquema, build). |
| `npm run test:ui` | Pruebas de interfaz con Chrome instalado + axe-core. No envía mensajes: bloquea WhatsApp. |
| `npm run images` | Regenera las imágenes web desde `_originales/`. |
| `npm run capturas` | Genera capturas en `docs/capturas/despues/`. |

## Estructura

```
index.html, menu.html     Páginas públicas (con bloques <!-- build:... --> generados)
admin.html                Aviso público: el editor ya no vive en la web
404.html                  Página de error de GitHub Pages
css/styles.css            Tokens de marca y estilos de todo el sitio
js/app.js                 Interacción: fichas, pedido, diálogo, navegación
js/core/*.js              Lógica pura compartida (carrito, dinero, WhatsApp, almacenamiento, esquema, render)
js/data/datos.js          GENERADO desde data/*.json (no editar a mano)
data/catalogo.json        FUENTE ÚNICA de la carta (productos, variantes, precios, estados)
data/negocio.json         FUENTE ÚNICA de operación (WhatsApp, dirección, horarios, retiro/envío, zonas, pagos)
assets/img/               Imágenes web generadas (AVIF + WebP) y manifest.json con pesos
assets/fonts/             Oswald y Poppins en WOFF2 (OFL-1.1, licencias incluidas)
_originales/              PNG originales del kit de marca y textos (no se publican)
_herramientas/editor/     Editor local de borradores (no se publica)
scripts/                  build, servidor local, imágenes, capturas
tests/                    Pruebas unitarias y de interfaz
docs/                     Auditoría, capturas antes/después
```

## Cómo se actualiza la carta y los datos del local

Todo lo comercial sale de **dos archivos**: `data/catalogo.json` y `data/negocio.json`. Inicio, menú, carrito, mensaje de WhatsApp, datos estructurados y metadatos se generan desde ahí.

### Opción A: editor local (recomendado)

1. `npm run dev` y abrir <http://localhost:4173/burguer_truck/_herramientas/editor/>.
2. Editar precios, estados, contacto, horarios, modalidades y zonas. La validación avisa errores al instante.
3. **“Guardar borrador en este navegador”** solo guarda en tu navegador. **No cambia la web publicada ni la de nadie más.**
4. **“Exportar catalogo.json / negocio.json”** descarga los archivos listos. Reemplazá los de `data/`.
5. `npm run build` y revisá en `npm run dev`.
6. `npm test && npm run test:ui`, y después subí los cambios con Git (commit + push). Recién ahí cambia para todos.

### Opción B: editar los JSON a mano

Mismo flujo desde el paso 4. Reglas que el build valida:

- Precios en **pesos enteros**, sin puntos ni signo: `7000`, no `"$7.000"`.
- Precio desconocido: `"precio": null` con `"precioEstado": "pendiente"`. **Nunca 0 para “no sé”**: 0 significa gratis.
- Estados de producto/variante: `disponible`, `agotado`, `oculto`.
- `id` estables en minúscula con guiones. No los cambies: el pedido guardado de los clientes los usa.
- Datos del local: `"estado": "confirmado"` solo con información verificada. Lo pendiente no se publica y desactiva lo que dependa de eso.

### Ejemplos

Cambiar un precio (`data/catalogo.json`):

```json
{ "id": "empanadas-carne-12", "presentacion": "Docena", "unidades": 12, "precio": 15000, "precioEstado": "confirmado", "estado": "disponible" }
```

Confirmar WhatsApp, retiro y una zona de envío (`data/negocio.json`):

```json
"whatsapp": { "estado": "confirmado", "numero": "549XXXXXXXXXX" },
"modalidades": {
  "retiro": { "estado": "confirmado" },
  "envio": { "estado": "confirmado", "zonas": [
    { "id": "centro", "nombre": "Centro", "tarifa": 1500, "tarifaEstado": "confirmada" },
    { "id": "barrio-x", "nombre": "Barrio X", "tarifa": null, "tarifaEstado": "pendiente" }
  ] }
}
```

Horarios (una sola fuente para toda la web):

```json
"horarios": { "estado": "confirmado", "lista": [ { "dias": "Martes a domingo", "horario": "19:30 a 23:45" } ] }
```

## Esquema de datos

**Producto**: `id`, `categoria`, `nombre`, `descripcion` (opcional, verificable), `imagen` (nombre base en `assets/img`), `alt`, `estado`, `variantes[]`.
**Variante**: `id`, `presentacion`, `unidades` por pack, `precio` (entero ARS o `null`), `precioEstado`, `estado`.
**Categoría**: `id`, `nombre`, `descripcion`, `estado` (`activa` / `oculta`).
`proximas` (hoy: pizzas) e `historicos` no tienen variantes: no se pueden comprar. `imagen` y `alt` son opcionales (las hamburguesas no tienen foto). Solo se mostrarían si se agrega una decisión explícita de comunicación (`"comunicar": true`), hoy no implementada en la interfaz.

**Línea de pedido** (guardada en el navegador del cliente, clave `ebs:pedido:v1`): `productId`, `variantId`, `qty` (1 a 20 packs), `seenPrice` (solo para avisar si el precio cambió; nunca se usa para cobrar). Además la modalidad y la zona elegidas. **No se guardan** nombre, dirección, referencia ni observaciones.

Al volver, el pedido se reconcilia con el catálogo actual: si un precio cambió, se recalcula y se avisa; si un producto ya no existe o está agotado, se quita y se explica.

## Pedido por WhatsApp

- Un único armado del mensaje (`js/core/whatsapp.js`), con `encodeURIComponent`, textos limpiados y largo acotado.
- El destinatario sale solo de `negocio.json`. **Si el número está pendiente, no hay enlace a ningún número**: el cliente puede armar el pedido y copiar el resumen.
- Retiro y envío solo aparecen si están confirmados. Retiro no pide barrio. Envío pide zona y dirección.
- “Total” solo se muestra cuando todo es conocido. Si falta la tarifa, se ve el subtotal y “envío a confirmar”.
- Abrir WhatsApp no confirma el pedido; el negocio confirma disponibilidad, entrega y total.

## Publicación (cuando el propietario lo decida)

Esta etapa no publica nada. Para publicar más adelante:

1. Confirmar los pendientes de `docs/AUDITORIA.md` que afectan pedidos (como mínimo, el número de WhatsApp).
2. `npm run build && npm run check && npm test && npm run test:ui`.
3. Commit y push a `main`. GitHub Pages publica desde la rama.

Notas de GitHub Pages:

- `_config.yml` evita publicar `README.md`, `docs/`, `tests/`, `scripts/`, `data/` y archivos de npm. `_herramientas/` y `_originales/` quedan fuera por empezar con `_`. **No agregues un archivo `.nojekyll`**: eso publicaría esas carpetas (el editor no contiene secretos, pero no tiene por qué estar en la web).
- Un `robots.txt` dentro de `/burguer_truck/` **no** controla el sitio: los robots solo leen el de la raíz del dominio. Por eso `admin.html` y `404.html` usan `<meta name="robots" content="noindex">`. `noindex` no protege información: no publiques nada privado.
- `sitemap.xml` lista solo las rutas públicas (inicio y menú).

## Administración remota (no incluida)

El editor anterior guardaba en `localStorage` (cambios visibles solo para quien los hacía) y validaba la contraseña en el navegador: eso no es autenticación. Se retiró. Si en el futuro se quiere editar desde el celular y publicar para todos, hace falta un backend real (por ejemplo, un CMS con autenticación de servidor que haga commits al repositorio o una base de datos con API). No se agregó ninguno en esta etapa. Nunca pongas tokens de GitHub ni contraseñas en archivos JavaScript del sitio.

> La contraseña del panel anterior quedó referenciada en el historial público de Git. Si se reutiliza en otro servicio, conviene cambiarla.
