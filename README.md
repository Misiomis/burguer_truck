# El Buen Sabor · sitio web (antes Burguer Truck)

Sitio estático publicado en GitHub Pages: <https://misiomis.github.io/burguer_truck/>.
La carta completa está en el inicio (`/burguer_truck/#carta`). Los enlaces conocidos siguen funcionando: `menu.html` (y `menu.html#papas`, `#menu-main`, `#menu-order`) lleva a la sección equivalente del inicio; `#about`, `#location`, `#order` y `#featured` siguen existiendo.

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
| `npm run build` | Valida `data/*.json`, regenera `js/data/datos.js`, los bloques prerenderizados de `index.html` y `sitemap.xml`. |
| `npm run check` | Falla si algo generado quedó desactualizado respecto de `data/*.json` (no escribe). |
| `npm test` | Pruebas unitarias (cálculo, variantes, reconciliación, mensaje, persistencia, esquema, build). |
| `npm run test:ui` | Pruebas de interfaz con Chrome instalado + axe-core. No envía mensajes: bloquea WhatsApp. |
| `npm run images` | Regenera las imágenes web desde `_originales/`. |
| `npm run capturas` | Genera capturas en `docs/capturas/despues/`. |

## Estructura

```
index.html                Inicio con la carta completa (bloques <!-- build:... --> generados)
menu.html                 Compatibilidad: redirige a index.html#carta (o a la categoría del enlace)
assets/ilustraciones/     Ilustraciones SVG propias de cada familia de productos
admin.html                Panel de precios: edita y publica en GitHub (requiere token)
404.html                  Página de error de GitHub Pages
css/styles.css            Tokens de marca y estilos de todo el sitio
js/app.js                 Interacción: fichas, pedido, diálogo, navegación
js/core/*.js              Lógica pura compartida (carrito, dinero, WhatsApp, almacenamiento, esquema, render, build-core)
js/admin/*.js             Panel de precios (cliente de la API de GitHub, cambios, interfaz)
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

### Cambiar precios desde el panel (celular o computadora)

1. Abrí <https://misiomis.github.io/burguer_truck/admin.html>.
2. Pegá el **token de GitHub** (ver abajo). Marcá “Recordar en este dispositivo” solo en un equipo propio.
3. Cambiá precios (`7000` o `7.000`; vacío = “a confirmar”), marcá productos como **Agotado** u **Oculto** y ajustá las tarifas de envío por barrio.
   - **Bebidas:** “Agregar bebida” → nombre, presentación (ej.: “Lata 354 ml”), precio y foto. La foto se achica en el navegador (máx. 480 px, WebP) y se sube al publicar a `assets/fotos/`. También se puede cambiar o quitar la foto, o quitar la bebida. Sin bebidas, la web muestra “Próximamente tendremos bebidas.”
   - **Barrios:** cambiar el costo, “Quitar barrio” o “Agregar barrio” (nombre y costo; vacío = a cotizar).
4. **Revisar y publicar** muestra la lista de cambios. Al confirmar, el panel hace un commit en `main` con los mismos archivos que generaría `npm run build`. GitHub Pages actualiza la web para todos en 1 o 2 minutos y el panel avisa cuando ya se ve.
5. Si otra persona publicó cambios mientras editabas, el panel no pisa nada: recargá y volvé a aplicar.

**Token (una sola vez):** con la cuenta dueña de `Misiomis/burguer_truck`, entrá a GitHub › Settings › Developer settings › *Fine-grained tokens* › **Generate new token**. Repository access: *Only select repositories* › `burguer_truck`. Permissions: **Contents: Read and write** (nada más). Elegí un vencimiento. El token no se guarda en el código: queda solo en el navegador donde lo pegás. Si se pierde o alguien lo ve, borralo en GitHub y creá otro.

Después de publicar desde el panel, quien trabaje con una copia local tiene que hacer `git pull` antes de seguir.

### Editor local (horarios, contacto, zonas y todo lo demás)

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

## Categorías, precios e ilustraciones

- **Precios, disponibilidad, bebidas (con foto) y barrios con envío:** desde el panel `admin.html` (ver arriba) o en `data/catalogo.json` / `data/negocio.json`.
- **Mensaje “próximamente” de una categoría vacía:** campo `mensajeVacio` de la categoría.
- **Categorías:** `categorias` en `data/catalogo.json` (orden = orden de la barra y de la carta; `estado: "oculta"` la saca). Los enlaces de la barra se generan solos.
- **Ilustración de un producto:** campo `ilustracion` del producto = nombre del archivo en `assets/ilustraciones/` sin `.svg` (hoy: `hamburguesa`, `hamburguesa-doble`, `lomito`, `milanesa`, `papas`, `empanadas`). Para una nueva, agregá un SVG de 160 × 128 con el mismo estilo (luz arriba a la izquierda, sombra elíptica abajo) y referenciála. Son ilustraciones de referencia: no prometen ingredientes ni tamaños.
- **Foto de portada:** `_originales/menu_inicial/portada_menu_inicial.png` → `npm run images`. Es ilustrativa y está rotulada así.

Después de editar a mano: `npm run build`, revisar con `npm run dev`, `npm test && npm run test:ui`, y commit + push.

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

## Seguridad del panel

El panel anterior guardaba en `localStorage` (los cambios solo se veían en el navegador de quien editaba) y validaba una contraseña en el propio navegador: eso no protegía nada. El panel actual no tiene contraseñas en el código: **GitHub** verifica el token en cada operación y solo publica si tiene permiso de escritura sobre el repositorio. El token viaja únicamente en la cabecera `Authorization` hacia `api.github.com`. Nunca pongas tokens en archivos del sitio ni los compartas por chat.

> La contraseña del panel anterior quedó referenciada en el historial público de Git. Si se reutiliza en otro servicio, conviene cambiarla.
