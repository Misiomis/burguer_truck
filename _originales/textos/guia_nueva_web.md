# Guía para la nueva web de El Buen Sabor

Base de trabajo: sitio anterior https://misiomis.github.io/burguer_truck/ y menú aportado por el negocio el 17/11/2026. Este paquete no modifica ni publica el sitio.

## Identidad y continuidad

Cambiar la marca visible a **El Buen Sabor**. Durante la transición, usar “Antes Burguer Truck” en un lugar secundario y visible. Conservar el relato del carrito como origen de la marca.

Actualizar logo, encabezado, pie, título del navegador, descripción, nombre usado en el carrito, mensaje de WhatsApp y vista previa al compartir. Para favicon, preparar una adaptación sencilla; el sello completo pierde lectura a ese tamaño.

Mantener accesible el enlace anterior que conocen los clientes. Si luego se cambia de dirección, planificar y comprobar la transición y los enlaces existentes.

## Orden de la página

1. Portada: “Crecimos. Y el sabor sigue.” + “El Buen Sabor · Antes Burguer Truck” + botón “Ver menú”.
2. Menú inicial: empanadas, sándwiches de milanesa y papas. Nombre, presentación y precio como texto real.
3. Historia: del carrito al nuevo local.
4. El espacio: fotografías reales, ubicación y horarios cuando se confirmen.
5. Pedido y contacto: retiro o envío, WhatsApp y medios de pago confirmados.

## Catálogo inicial

Importar o transcribir `menu_inicial.csv`, con precios numéricos en ARS. Mostrar separador de miles con punto: $14.000, $7.000, $10.000, $6.000.

Empanadas: separar carne/pollo y media docena/docena. Aclarar 6 o 12 unidades. No ofrecer docena mixta hasta confirmar que se prepara. La foto de empanadas es genérica; no permite ver el relleno.

Papas: “Porción mediana, en caja”, $6.000. Reemplazar la presentación anterior en cono y su importe.

Lomitos y pizzas van en la carpeta de próxima etapa. No incorporar al carrito ni darles precios hasta definirlos. Las hamburguesas siguen en la identidad histórica y en el sello; su disponibilidad actual y sus precios no fueron confirmados.

## Diseño

Rojo #E60012, negro #141414, blanco #FFFFFF y crema #F4EEE6. Miel #E2A646 como detalle opcional. No es necesario usar todos los colores en cada sección.

Oswald para títulos y precios, Poppins para cuerpo, navegación y botones. Elegir pesos concretos y pocas variantes. Fuentes oficiales:
- https://fonts.google.com/specimen/Oswald
- https://fonts.google.com/specimen/Poppins

Usar fondos claros para leer el menú, negro para portada y rojo para acciones. Jerarquía evidente, espaciado consistente, comida protagonista y poco adorno. Mantener suficiente contraste y foco visible al navegar con teclado. No colocar textos pequeños sobre zonas detalladas de una foto.

## Imágenes

Los PNG son los originales. Los WebP conservan las dimensiones y reducen el peso para la web. Elegir el tamaño de descarga según el espacio visible y generar variantes responsive al implementar.

La portada tiene espacio vacío a la izquierda. En celular, usar un bloque de texto separado o un recorte que mantenga los platos visibles. Incluir dimensiones para evitar saltos de contenido y carga diferida en las imágenes fuera de la primera pantalla.

**Todas las imágenes de comida del paquete fueron generadas con IA. Son ilustrativas, no fotografías del local ni evidencia de sus porciones.** Antes de publicarlas comercialmente, validar que pan, rellenos, toppings, cocción, tamaño y envase coincidan con lo que se entrega. Si se usan solo como ambientación, identificarlas como ilustrativas. Priorizar fotos reales en el catálogo definitivo.

Ver `inventario_imagenes.csv` para dimensiones, peso, texto alternativo base y comprobaciones por imagen. No escribir “foto real de nuestro producto” en el texto alternativo.

## Pedido y datos

Conservar carrito y pedido por WhatsApp si sigue siendo el flujo elegido. Comprobar selección de variantes, cantidades, subtotales, total y mensaje final. No enviar pedidos de prueba a clientes ni activar categorías futuras.

La web anterior contiene horarios diferentes en portada y menú, enlaces sociales que apuntan a “#” y datos operativos de la etapa del carrito. Definir una sola fuente para los horarios y confirmar dirección, mapa, contacto, zonas, costo de envío y medios de pago. Conservar únicamente afirmaciones comerciales verificadas.

## Revisión antes de publicar

- Probar navegación, menú y carrito en celular y computadora.
- Verificar que el logo no se corte y que se lea el nombre en el avatar.
- Comprobar textos, importes, variantes, unidades y ausencia de precios antiguos.
- Revisar teclado, contraste, enlaces, imágenes y resumen del pedido.
- Verificar el número de destino del mensaje de WhatsApp.
- Comprobar que pizzas y lomitos no aparezcan como disponibles sin confirmación.
- Revisar nombre, descripción y vista previa al compartir.

La guía es una propuesta de implementación; no confirma apertura, horarios ni disponibilidad diaria.
